import { describe, expect, it } from "vitest";

import { createLiveTearRuntimeEnvironment } from "../../src/tearbench/live-runtime-environment";
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

function contextFixture(options: Readonly<{ terminateOnFrame?: boolean }> = {}) {
  let tick = 0;
  let screen = "playing";
  const calls: string[] = [];
  const finaleOutwardCalls: FinaleOutwardCall[] = [];
  const audioDispatchReceipts: AudioDispatchReceipt[] = [];
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
    stage: () => ({ name: "ruins" }),
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
    startRun: () => undefined,
    stopFrameLoop: () => undefined,
    startFrameLoop: () => undefined,
    setSemanticInputAuthority: () => undefined,
    pushAction: () => undefined,
    routeAction: () => false,
    activateControl: () => false,
    skipCinematic: () => { calls.push("skip"); },
    resetSemanticInput: () => undefined,
    advanceFixedTick: () => 1,
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
    subscribeEngineEvent: () => () => undefined,
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
    expect("finaleOutwardProjection" in structured).toBe(false);
    expect("audioDispatchProjection" in structured).toBe(false);
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
