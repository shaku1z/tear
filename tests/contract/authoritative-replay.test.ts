import { describe, expect, it } from "vitest";
import { EnvelopeSequencer, type CommandEnvelope } from "../../src/app/messages";
import type { GameAction } from "../../src/input/game-action";
import { parseReplayEnvelope, type ReplayEnvelopeV2 } from "../../src/replay/envelope";
import { AuthoritativeInputState } from "../../src/gameplay/runtime/authoritative-input";
import { AuthoritativeStepController } from "../../src/gameplay/runtime/authoritative-step";
import { FixedStepScheduler } from "../../src/simulation/fixed-step";

interface KernelState { tick: number; x: number; y: number; primaryTicks: number }

const recordedActions = (): readonly CommandEnvelope<GameAction>[] => {
  const sequencer = new EnvelopeSequencer();
  return [
    sequencer.command(2, { type: "move", x: 1_000, y: 0 }),
    sequencer.command(15, { type: "weapon", intent: "primary", phase: "pressed" }),
    sequencer.command(30, { type: "dash", x: 1_000, y: -1_000 }),
    sequencer.command(45, { type: "weapon", intent: "primary", phase: "released" }),
    sequencer.command(60, { type: "move", x: 0, y: 0 }),
  ];
};

function replayAtRate(renderRate: number, actions: readonly CommandEnvelope<GameAction>[]) {
  const byTick = new Map<number, CommandEnvelope<GameAction>[]>();
  for (const action of actions) byTick.set(action.tick, [...(byTick.get(action.tick) ?? []), action]);
  const input = new AuthoritativeInputState();
  const state = { x: 0, y: 0, primaryTicks: 0 };
  const controller = new AuthoritativeStepController<KernelState>({
    applyActions: (tick, tickActions) => { input.beginTick(tick, tickActions); },
    step(seconds) {
      state.x += ((input.right() ? 1 : 0) - (input.left() ? 1 : 0)) * 420 * seconds;
      state.y += ((input.down() ? 1 : 0) - (input.up() ? 1 : 0)) * 420 * seconds;
      if (input.dashPressed()) { state.x += 80; state.y -= 80; }
      if (input.primaryHeld) state.primaryTicks += 1;
    },
    snapshot: (tick) => ({ tick, x: Math.round(state.x * 1_000), y: Math.round(state.y * 1_000), primaryTicks: state.primaryTicks }),
  });
  const scheduler = new FixedStepScheduler({ ticksPerSecond: 60 });
  for (let frame = 0; frame < renderRate * 2; frame += 1) {
    scheduler.advance(1_000 / renderRate, (seconds, tick) => { controller.execute(tick, seconds, byTick.get(tick) ?? []); });
  }
  const final = controller.lastResult;
  if (final === null) throw new Error("authoritative replay executed no simulation ticks");
  return final;
}

describe("authoritative semantic replay", () => {
  it("replays JSON-round-tripped actions to the same canonical state at 30/60/144 Hz", () => {
    const actions = recordedActions();
    const baseline = replayAtRate(60, actions);
    const envelope: ReplayEnvelopeV2 = {
      format: "tear-replay", schemaVersion: 2, rulesetVersion: "authoritative-contract",
      build: { version: "contract", revision: "contract", target: "test" },
      run: { runId: "authoritative-run", seed: "fixed-seed", ticksPerSecond: 60 },
      actions,
      final: { tick: baseline.tick, stateHash: baseline.stateHash },
      tearScore: { enabled: false, reason: "disabled" },
    };
    const parsed = parseReplayEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const rate of [30, 60, 144]) {
      const result = replayAtRate(rate, parsed.replay.actions);
      expect(result.state).toEqual(baseline.state);
      expect(result.stateHash).toBe(parsed.replay.final.stateHash);
    }
  });

  it("resets authoritative input cleanly for a new run", () => {
    const input = new AuthoritativeInputState();
    const sequencer = new EnvelopeSequencer();
    input.beginTick(80, [sequencer.command(80, { type: "move", x: 1_000, y: 0 })]);
    input.reset();
    const nextRun = new EnvelopeSequencer();
    expect(() => { input.beginTick(1, [nextRun.command(1, { type: "move", x: 0, y: 0 })]); }).not.toThrow();
    expect(input.snapshot().tick).toBe(1);
  });

  it("reconstructs recorded reticle distance and keeps angle-only replays at full reach", () => {
    const input = new AuthoritativeInputState();
    const sequencer = new EnvelopeSequencer();
    input.beginTick(1, [sequencer.command(1, { type: "aim", turn: 250_000, magnitude: 400 })]);
    const partial = input.aimVector();
    expect(partial.x).toBeCloseTo(0, 8); expect(partial.y).toBeCloseTo(0.4, 8);

    input.beginTick(2, [sequencer.command(2, { type: "aim", turn: 500_000 })]);
    const legacy = input.aimVector();
    expect(legacy.x).toBeCloseTo(-1, 8); expect(legacy.y).toBeCloseTo(0, 8);
  });
});
