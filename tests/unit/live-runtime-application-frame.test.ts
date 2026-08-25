import { describe, expect, it } from "vitest";

import { createLiveTearRuntimeEnvironment } from "../../src/tearbench/live-runtime-environment";
import { runInvariantChecks } from "../../src/tearbench/invariants";
import { TearBenchRunner } from "../../src/tearbench/runner";
import type { TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import type { LiveTearRuntimeEnvironmentContext } from "../../src/tearbench/live-runtime-contracts";
import type { TearScenarioV1 } from "../../src/tearbench/contracts";
import type { FinaleOutwardCall } from "../../src/gameplay/campaign/finale-outward-call";
import type { AudioDispatchReceipt } from "../../src/audio/audio-dispatch-receipts";

const SCENARIO = Object.freeze({
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: "application-frame-unit",
  version: 1,
  description: "Class-A application-frame evidence",
  stateClass: "recorded-canonical",
  executionClass: "engineering",
  seed: "application-frame-unit",
  start: Object.freeze({ mode: "campaign", difficulty: "normal", weapon: "sword" }),
  maxTicks: 20,
  assertions: Object.freeze(["runtime.finite-state"] as const),
  tags: Object.freeze(["c27a", "cinematic"]),
}) satisfies TearScenarioV1;

function contextFixture(options: Readonly<{ terminateOnFrame?: boolean; nativeOpeningEvents?: boolean;
  nativePreviousRunAbandonment?: boolean }> = {}) {
  let tick = 0;
  let screen = "playing";
  const calls: string[] = [];
  const finaleOutwardCalls: FinaleOutwardCall[] = [];
  const audioDispatchReceipts: AudioDispatchReceipt[] = [];
  const gameplayListeners: ((event: TearGameplayEvent) => void)[] = [];
  const run = {
    mode: "campaign", diff: "normal", weaponId: "sword", stage: 0,
    wave: 1, score: 0, spawnQueue: [], runSeed: 1,
  };
  const player = {
    x: 400, y: 700, vx: 0, vy: 0, hp: 100, maxHp: 100,
    facing: 1, onGround: true, dashCharges: 1,
  };
  const blade = {
    x: 420, y: 700, tipX: 450, tipY: 700,
    vx: 0, vy: 0, tipSpeed: 0, state: "held",
  };
  const context = {
    width: 1600,
    height: 900,
    state: {
      run: () => run,
      player: () => player,
      blade: () => blade,
      enemies: () => [],
      projectiles: () => [],
    },
    platforms: () => [],
    actorId: () => "enemy:1",
    stage: () => ({ name: "The Grounds", index: 0 }),
    lifecycle: () => ({ phase: "wave-active" }),
    choiceIds: () => [],
    progression: () => ({ wallet: 0, lifetimeEarned: 0, levels: {}, shop: [] }),
    outcome: () => null,
    screen: () => screen,
    setScreen: (next: "playing" | "paused") => { screen = next; },
    terminateRun: () => { screen = "gameover"; },
    selectWeapon: () => undefined,
    selectBoss: () => undefined,
    setRunSeed: () => undefined,
    startRun: () => {
      if (options.nativeOpeningEvents !== true) return;
      if (options.nativePreviousRunAbandonment === true) {
        const previous: TearGameplayEvent = { kind: "run", tick: 60, transition: "abandoned", runId: "previous-run",
          mode: "campaign", difficulty: "normal", weaponId: "sword", wave: 1, score: 0, runTimeSeconds: 1 };
        for (const listener of gameplayListeners) listener(previous);
      }
      for (const event of [
        { kind: "run", tick: 0, transition: "started", runId: "native-run", mode: "campaign",
          difficulty: "normal", weaponId: "sword", wave: 1, score: 0, runTimeSeconds: 0 },
        { kind: "spawn", tick: 0, actorId: "enemy:1", actorKind: "charger", x: 30, y: 40 },
      ] as const) for (const listener of gameplayListeners) listener(event);
    },
    stopFrameLoop: () => undefined,
    startFrameLoop: () => undefined,
    setSemanticInputAuthority: () => undefined,
    pushAction: () => undefined,
    routeAction: () => false,
    activateControl: () => false,
    skipCinematic: () => { calls.push("skip"); },
    advanceStateForgeCinematicBeat: () => { calls.push("semantic-cinema"); return true; },
    resetSemanticInput: () => undefined,
    advanceFixedTick: () => { tick += 1; return 1; },
    advanceApplicationFrame: () => {
      calls.push("frame");
      tick += 2;
      if (options.terminateOnFrame === true) screen = "win";
    },
    advanceRenderFrame: () => 0,
    authoritative: () => ({ tick, stateHash: `hash-${String(tick)}`, state: { tick } }),
    random: () => ({}),
    render: () => { calls.push("render"); },
    screenshot: () => "data:image/png;base64,",
    subscribeEngineEvent: (listener: (event: TearGameplayEvent) => void) => {
      gameplayListeners.push(listener);
      return () => undefined;
    },
    drainConsumedActions: () => [],
    emitPhysicalInput: () => undefined,
    setTimeEffectsForTest: () => undefined,
    stateForge: {
      capture: () => ({ components: new Map(), references: new Map(), entityIds: new Set() }),
      validate: () => [],
      commit: () => undefined,
    },
    replayProgression: () => ({ applied: 0, finalBuild: { owned: {}, tier: {} } }),
    finaleIntents: () => [],
    finaleOutwardCalls: () => finaleOutwardCalls,
    audioDispatchReceipts: () => audioDispatchReceipts,
  } as unknown as LiveTearRuntimeEnvironmentContext;
  return { context, calls, finaleOutwardCalls, audioDispatchReceipts };
}

describe("Class-A live application-frame surface", () => {
  it("tracks actual progress and exposes independent lifecycle completion and real focus", () => {
    const fixture = contextFixture();
    let phase = "wave-active";
    const context = { ...fixture.context, lifecycle: () => ({ phase }),
      choiceIds: () => ["choice:first", "choice:second"], focusedControlId: () => "choice:second" };
    const environment = createLiveTearRuntimeEnvironment(context, "A");
    const start = environment.reset(SCENARIO);
    expect(start.diagnostics?.progressTick).toBe(0);
    expect(start.diagnostics?.ui).toEqual({ focusableIds: ["choice:first", "choice:second"], focusedId: "choice:second" });
    expect(start.diagnostics?.waveComplete).toBe(false);
    expect(environment.step([]).observation.diagnostics?.progressTick).toBe(0);
    const player = fixture.context.state.player();
    if (player === undefined) throw new Error("fixture player is unavailable");
    player.x += 5;
    expect(environment.step([]).observation.diagnostics?.progressTick).toBe(2);
    phase = "wave-cleared";
    expect(environment.observe().diagnostics?.waveComplete).toBe(true);
    const stalled = { ...environment.observe(), tick: 5000 };
    expect(runInvariantChecks(stalled, ["runtime.no-softlock"])[0]?.id).toBe("runtime.no-softlock");
  });

  it("delivers native run and spawn events exactly once through an ordinary TearBench session", () => {
    const environment = createLiveTearRuntimeEnvironment(contextFixture({ nativeOpeningEvents: true }).context, "A");
    const session = new TearBenchRunner(environment).createSession(SCENARIO);
    session.step();
    expect(session.result().events.map((event) => [event.type, event.source])).toEqual([
      ["run.started", "engine"], ["enemy.spawned", "engine"],
    ]);
    session.step();
    expect(session.result().events).toHaveLength(2);
  });

  it("excludes previous-run abandonment from a newly reset session while preserving its native opening facts", () => {
    const fixture = contextFixture({ nativeOpeningEvents: true, nativePreviousRunAbandonment: true });
    const environment = createLiveTearRuntimeEnvironment(fixture.context, "A");
    environment.reset(SCENARIO);
    expect(environment.step([]).events.map((event) => event.type)).toEqual(["run.started", "enemy.spawned"]);
    expect(environment.engineEventProjection().map((event) => event.type)).toEqual(["run.started", "enemy.spawned"]);
  });

  it("labels a bridge-created start as derived when the host emits no native fact", () => {
    const environment = createLiveTearRuntimeEnvironment(contextFixture().context, "A");
    environment.reset(SCENARIO);
    const events = environment.step([]).events;
    expect(events).toMatchObject([{ type: "run.started", source: "derived",
      payload: { provenance: "runtime-bridge-synthetic" } }]);
    expect(environment.step([]).events).toEqual([]);
  });

  it("requests the cinematic skip before the real frame and accounts for its authoritative tick delta", () => {
    const fixture = contextFixture();
    const environment = createLiveTearRuntimeEnvironment(fixture.context, "A");
    environment.reset(SCENARIO);
    fixture.calls.length = 0;

    expect(environment.advanceApplicationFrame(1 / 60, { skipCinematic: true })).toEqual({
      beforeTick: 0,
      afterTick: 2,
      fixedTickDelta: 2,
    });
    expect(fixture.calls).toEqual(["skip", "frame", "render"]);
    expect(environment.observe().tick).toBe(2);
    expect(environment.metrics().fixedTicks).toBe(2);
  });

  it("is absent from Class B and seals the environment when the application frame reaches a terminal screen", () => {
    const fixture = contextFixture({ terminateOnFrame: true });
    const privileged = createLiveTearRuntimeEnvironment(fixture.context, "A");
    privileged.reset(SCENARIO);
    expect(privileged.advanceApplicationFrame(1 / 60).fixedTickDelta).toBe(2);
    expect(() => privileged.advanceApplicationFrame(1 / 60)).toThrow(/requires a running Tear runtime/u);

    const structured = createLiveTearRuntimeEnvironment(contextFixture().context, "B");
    expect("advanceApplicationFrame" in structured).toBe(false);
    expect("advanceStateForgeCinematicBeat" in structured).toBe(false);
    expect("finaleOutwardProjection" in structured).toBe(false);
    expect("audioDispatchProjection" in structured).toBe(false);
  });

  it("advances one semantic cinematic beat without inventing a renderer clock or fixed tick", () => {
    const fixture = contextFixture();
    const environment = createLiveTearRuntimeEnvironment(fixture.context, "A");
    environment.reset(SCENARIO);
    fixture.calls.length = 0;

    expect(environment.advanceStateForgeCinematicBeat()).toEqual({ advanced: true, tick: 0 });
    expect(fixture.calls).toEqual(["semantic-cinema", "render"]);
    expect(environment.metrics().fixedTicks).toBe(0);
    expect(environment.observe().tick).toBe(0);
  });

  it("projects only successful outward calls recorded after the current reset", () => {
    const fixture = contextFixture();
    fixture.finaleOutwardCalls.push(Object.freeze({ type: "flash", amount: 0.1,
      receipt: Object.freeze({ requested: 0.1, before: 0, after: 0.1, aggregation: "maximum" }) }));
    const environment = createLiveTearRuntimeEnvironment(fixture.context, "A");
    environment.reset(SCENARIO);
    fixture.finaleOutwardCalls.push(Object.freeze({ type: "sound", cue: "final-cut", index: 2 }));

    const projection = environment.finaleOutwardProjection();
    expect(projection).toEqual([{ type: "sound", cue: "final-cut", index: 2 }]);
    expect(Object.isFrozen(projection)).toBe(true);
  });
});
