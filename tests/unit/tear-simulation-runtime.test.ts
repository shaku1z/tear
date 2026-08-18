import { describe, expect, it } from "vitest";

import { EnvelopeSequencer, type CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import { TearSimulationRuntime } from "../../src/gameplay/runtime/tear-simulation-runtime";

interface KernelState {
  readonly tick: number;
  readonly x: number;
  readonly primaryTicks: number;
}

interface KernelRun {
  readonly runtime: TearSimulationRuntime<KernelState>;
  readonly events: number[];
}

function actionsByTick(): ReadonlyMap<number, readonly CommandEnvelope<GameAction>[]> {
  const sequencer = new EnvelopeSequencer();
  const actions = [
    sequencer.command(2, { type: "move", x: 1_000, y: 0 } as const),
    sequencer.command(15, { type: "weapon", intent: "primary", phase: "pressed" } as const),
    sequencer.command(30, { type: "dash", x: 1_000, y: 0 } as const),
    sequencer.command(45, { type: "weapon", intent: "primary", phase: "released" } as const),
    sequencer.command(50, { type: "move", x: 0, y: 0 } as const),
  ];
  const grouped = new Map<number, CommandEnvelope<GameAction>[]>();
  for (const action of actions) grouped.set(action.tick, [...(grouped.get(action.tick) ?? []), action]);
  return grouped;
}

function createKernel(): KernelRun {
  const events: number[] = [];
  let x = 0;
  let primaryTicks = 0;
  const runtime = new TearSimulationRuntime<KernelState>({
    ticksPerSecond: 60,
    actionPort: {
      apply(input, tick, actions): void { input.beginTick(tick, actions); },
    },
    step(seconds): void {
      const input = runtime.input;
      x += ((input.right() ? 1 : 0) - (input.left() ? 1 : 0)) * 420 * seconds;
      if (input.dashPressed()) x += 80;
      if (input.primaryHeld) primaryTicks += 1;
      if (runtime.scheduler.tick % 20 === 0) runtime.events.emit({ kind: "effect", effect: "kernel-beat", x, y: 0 });
    },
    snapshot: (tick) => Object.freeze({ tick, x: Math.round(x * 1_000), primaryTicks }),
  });
  runtime.events.subscribe((event) => { events.push(event.tick); });
  return { runtime, events };
}

function runAtRenderRate(renderRate: number): Readonly<{ state: KernelState; stateHash: string; events: readonly number[] }> {
  const run = createKernel();
  const grouped = actionsByTick();
  for (let frame = 0; frame < renderRate; frame += 1) {
    run.runtime.advance(1_000 / renderRate, (tick) => grouped.get(tick) ?? []);
  }
  const result = run.runtime.lastResult;
  if (result === null) throw new Error("simulation did not advance");
  return Object.freeze({ state: result.state, stateHash: result.stateHash, events: Object.freeze([...run.events]) });
}

describe("TearSimulationRuntime", () => {
  it("keeps live render cadences on the same canonical simulation, event ticks, and hash", () => {
    const baseline = runAtRenderRate(60);
    expect(baseline).toMatchObject({ state: { tick: 60 }, events: [20, 40, 60] });
    for (const renderRate of [30, 144]) {
      const candidate = runAtRenderRate(renderRate);
      expect(candidate.state).toEqual(baseline.state);
      expect(candidate.stateHash).toBe(baseline.stateHash);
      expect(candidate.events).toEqual(baseline.events);
    }
  });

  it("uses the same core for an exact headless/replay tick loop", () => {
    const grouped = actionsByTick();
    const headless = createKernel();
    for (let tick = 1; tick <= 60; tick += 1) headless.runtime.advanceOne(grouped.get(tick) ?? []);
    const result = headless.runtime.lastResult;
    if (result === null) throw new Error("headless simulation did not advance");

    const live = runAtRenderRate(60);
    expect(result.state).toEqual(live.state);
    expect(result.stateHash).toBe(live.stateHash);
    expect(headless.events).toEqual(live.events);
  });

  it("surrounds only executed live ticks without exposing a second step route", () => {
    const { runtime } = createKernel();
    const order: string[] = [];
    runtime.advance(runtime.scheduler.stepMilliseconds * 3, (tick) => {
      order.push(`actions:${String(tick)}`);
      return [];
    }, {
      shouldStep: (tick) => { order.push(`should:${String(tick)}`); return tick !== 2; },
      beforeStep: (tick) => { order.push(`before:${String(tick)}`); },
      afterStep: (tick) => { order.push(`after:${String(tick)}`); },
      cleanupStep: (tick) => { order.push(`cleanup:${String(tick)}`); },
    });

    expect(order).toEqual([
      "should:1", "before:1", "actions:1", "after:1", "cleanup:1",
      "should:2",
      "should:3", "before:3", "actions:3", "after:3", "cleanup:3",
    ]);
    expect(runtime.lastResult?.tick).toBe(3);
    expect(runtime.input.snapshot().tick).toBe(3);
  });

  it("uses that same action/lifecycle path for one exact tooling tick", () => {
    const { runtime } = createKernel();
    const order: string[] = [];
    const exact = runtime.advanceExact((tick) => {
      order.push(`actions:${String(tick)}`);
      return [];
    }, {
      beforeStep: (tick) => { order.push(`before:${String(tick)}`); },
      afterStep: (tick) => { order.push(`after:${String(tick)}`); },
      cleanupStep: (tick) => { order.push(`cleanup:${String(tick)}`); },
    });

    expect(exact).toMatchObject({ tick: 1, steps: 1, result: { tick: 1 } });
    expect(order).toEqual(["before:1", "actions:1", "after:1", "cleanup:1"]);
  });

  it("resets the clock, input, and verification controller as one simulation operation", () => {
    const run = createKernel();
    run.runtime.advanceOne([]);
    run.runtime.reset(10);
    const result = run.runtime.advanceOne([]);
    expect(result.tick).toBe(11);
    expect(run.runtime.input.snapshot().tick).toBe(11);
  });
});
