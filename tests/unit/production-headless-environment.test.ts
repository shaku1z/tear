import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createGhostV3, type GhostReplayTrident } from "../../src/ghost/truth-kernel";
import { GhostProductionReplayWorld } from "../../src/ghost/replay-world";
import { stableVerificationHash } from "../../src/domain/hash";
import { captureProductionReplayCheckpoint } from "../../src/app/world/detached/replay-composition";
import type { GameAction } from "../../src/input/game-action";
import {
  createProductionHeadlessEnvironment,
  createProductionHeadlessEpisodePool,
  validateProductionHeadlessCheckpointRequest,
  type ProductionHeadlessCheckpoint,
  type ProductionHeadlessTerminalArtifact,
} from "../../src/playtest/headless/production-headless-environment";
import { createProductionGhostReplayComposition } from "../../src/app/world/detached/replay-composition";
import {
  BoundedArtifactSampler,
  createOneFrameBoundaryLaunchMatrix,
  TearHeadlessRunner,
  buildExitLaunchSnapshot,
  type TearScenarioV1,
} from "../../src/tearbench";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";

const scenario = Object.freeze({
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: "c30-production-headless",
  version: 1,
  description: "C30 same-composition headless episode",
  stateClass: "recorded-canonical",
  executionClass: "training",
  seed: "c30-production-headless-seed",
  start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
  maxTicks: 120,
  assertions: Object.freeze(["runtime.finite-state"] as const),
  tags: Object.freeze(["c30", "headless", "production-composition"] as const),
} as const) satisfies TearScenarioV1;

const trident: GhostReplayTrident = Object.freeze({
  command: Object.freeze({
    kind: "command",
    status: "verified",
    available: true,
    resumable: true,
    seekable: false,
    reason: "C30 test",
  }),
  state: Object.freeze({
    kind: "state",
    status: "absent",
    available: false,
    resumable: false,
    seekable: false,
    reason: "C30 test",
  }),
  visual: Object.freeze({
    kind: "visual",
    status: "absent",
    available: false,
    resumable: false,
    seekable: false,
    reason: "C30 test",
  }),
});

function actionsAt(tick: number) {
  if (tick === 1) return Object.freeze([{ type: "move" as const, x: 1_000, y: 0 }]);
  if (tick === 20) return Object.freeze([{ type: "jump" as const, phase: "pressed" as const }]);
  if (tick === 40) return Object.freeze([{ type: "dash" as const, x: 1_000, y: 0 }]);
  return Object.freeze([]);
}

function normalizeLegacyFixtureRevision(value: unknown): unknown {
  const clone = structuredClone(value) as { bootstrap?: { build?: { revision?: string } } };
  if (clone.bootstrap?.build?.revision === "working-tree") clone.bootstrap.build.revision = "unbound";
  return clone;
}

function expectLegacyTerminalFixture(fixture: unknown, terminal: ProductionHeadlessTerminalArtifact | undefined): void {
  if (terminal === undefined) throw new Error("missing actual terminal");
  const reference = normalizeLegacyFixtureRevision(fixture) as ProductionHeadlessTerminalArtifact;
  const actual = structuredClone(terminal);
  if (reference.bootstrap.applicationFramePolicy === undefined) {
    // These two retained fixtures predate declared frame-policy metadata. Assert
    // the current policy separately; this does not attribute frames to history.
    expect(actual.bootstrap.applicationFramePolicy).toEqual({
      version: 1,
      kind: "generated-step-intro",
      secondsPerStep: 1 / 120,
    });
    Reflect.deleteProperty(actual.bootstrap, "applicationFramePolicy");
  }
  expect(actual).toEqual(reference);
}

function bindCheckpoint(value: ProductionHeadlessCheckpoint): ProductionHeadlessCheckpoint {
  const delivery = { nextSequence: value.delivery.nextSequence, pendingEvents: value.delivery.pendingEvents };
  return { ...value, delivery: { ...delivery, hash: stableVerificationHash({ ...value, delivery }) } };
}

function expectContinuation(actual: ProductionHeadlessCheckpoint, source: ProductionHeadlessCheckpoint) {
  expect(actual.checkpoint).toEqual(source.checkpoint);
  expect(actual.bootstrap).toEqual(source.bootstrap);
  expect(actual.scenario).toEqual(source.scenario);
  expect(actual.input).toEqual(source.input);
  expect(actual.actions).toEqual(source.actions);
  expect(actual.delivery.nextSequence).toBe(source.delivery.nextSequence);
  expect(actual.delivery.pendingEvents).toEqual(source.delivery.pendingEvents);
  // The destination environment namespace is intentionally rebased; source-owned components stay exact.
  for (const key of Object.keys(source.snapshot.state).filter((key) => key !== "tear.hazard.v1")) {
    expect(actual.snapshot.state[key]).toEqual(source.snapshot.state[key]);
  }
  expect(actual.snapshot.hashes.semantic).toBe(source.snapshot.hashes.semantic);
  expect(actual.snapshot.hashes.environment).toBe(source.snapshot.hashes.environment);
}

describe("C30 production headless environment", () => {
  it("captures checkpoint target/content from the actual injected bootstrap identity", () => {
    vi.stubGlobal("__TEAR_BUILD_REVISION__", "d".repeat(40));
    vi.stubGlobal("__TEAR_BUILD_TARGET__", "source-worker");
    vi.stubGlobal("__TEAR_BUILD_SOURCE_FINGERPRINT__", "e".repeat(64));
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(scenario);
      environment.step([]);
      const checkpoint = environment.captureCheckpoint();
      expect(checkpoint.bootstrap.build).toMatchObject({ target: "source-worker", contentHash: "e".repeat(64) });
      expect(checkpoint.snapshot.provenance.build).toMatchObject({
        target: "source-worker",
        contentHash: "e".repeat(64),
      });
    } finally {
      environment.dispose();
      vi.unstubAllGlobals();
    }
  });
  it("cooperative recovery binds the original action prefix, retains held partial aim and executes only the suffix", async () => {
    const batches = [
      {
        tick: 1,
        actions: [
          { type: "move", x: 1000, y: 0 },
          { type: "aim", turn: 125000, magnitude: 250 },
          { type: "weapon", intent: "primary", phase: "pressed" },
        ],
      },
      { tick: 50, actions: [{ type: "move", x: 0, y: 0 }] },
    ];
    const source = createProductionHeadlessEnvironment(),
      target = createProductionHeadlessEnvironment();
    try {
      source.reset(scenario);
      const pending = source.captureCheckpoint();
      expect(pending.delivery.pendingEvents.length).toBeGreaterThan(0);
      target.restoreCheckpoint(validateProductionHeadlessCheckpointRequest(pending, scenario, batches));
      const first = batches[0];
      if (first === undefined) throw new Error("missing source batch");
      expect(target.step(first.actions as GameAction[])).toEqual(source.step(first.actions as GameAction[]));
      for (let tick = 2; tick <= 32; tick += 1) source.step([]);
      const checkpoint = source.captureCheckpoint();
      expect(checkpoint.input).toMatchObject({ primaryHeld: true, aimMagnitude: 250, moveX: 1 });
      validateProductionHeadlessCheckpointRequest(checkpoint, scenario, batches);
      const policy = {
        decide: (observations: readonly { tick: number }[]) => {
          const current = observations.at(-1);
          if (current === undefined) throw new Error("missing source observation");
          return [(batches.find((batch) => batch.tick === current.tick + 1)?.actions ?? []) as GameAction[]];
        },
      };
      const suffix = await new TearHeadlessRunner(target).runCooperatively(
        { id: "bound", scenario, maxTicks: scenario.maxTicks },
        policy,
        {
          initialize: () => ({ tick: 32, observation: target.restoreCheckpoint(checkpoint) }),
          yieldToHost: () => Promise.resolve(),
        },
      );
      let terminal;
      for (let tick = 33; tick <= scenario.maxTicks; tick += 1)
        terminal = source.step((batches.find((batch) => batch.tick === tick)?.actions ?? []) as GameAction[]);
      expect(suffix).toMatchObject({ startTick: 32, endTick: 120, executedTicks: 88 });
      if (terminal === undefined) throw new Error("missing source terminal");
      expect(suffix.episode.observations.at(-1)).toEqual(terminal.observation);
      expect(suffix.episode.events?.some((event) => event.type === "run.started")).toBe(false);
      for (const invalid of [
        { ...scenario, seed: "wrong" },
        { ...scenario, maxTicks: scenario.maxTicks + 1 },
      ])
        expect(() => validateProductionHeadlessCheckpointRequest(checkpoint, invalid, batches)).toThrow(/scenario/);
      const changed = structuredClone(batches),
        changedFirst = changed[0];
      if (changedFirst === undefined) throw new Error("missing changed source batch");
      changedFirst.actions.reverse();
      expect(() => validateProductionHeadlessCheckpointRequest(checkpoint, scenario, changed)).toThrow(/prefix/);
      expect(() => validateProductionHeadlessCheckpointRequest(checkpoint, scenario, [])).toThrow(/prefix/);
    } finally {
      source.dispose();
      target.dispose();
    }
  });
  it("completes natural boss intros using an explicit generated cadence preserved across checkpoint continuation", () => {
    const source = createProductionHeadlessEnvironment(),
      restored = createProductionHeadlessEnvironment();
    source.reset({ ...scenario, start: { ...scenario.start, mode: "bossonly" }, maxTicks: 600 });
    let checkpoint = source.captureCheckpoint();
    for (
      let tick = 0;
      tick < 120 &&
      !(checkpoint.snapshot.state["tear.world.v1"] as { runtime?: { bossIntro?: unknown } }).runtime?.bossIntro;
      tick++
    ) {
      source.step([]);
      checkpoint = source.captureCheckpoint();
    }
    expect(checkpoint.bootstrap.applicationFramePolicy).toEqual({
      version: 1,
      kind: "generated-step-intro",
      secondsPerStep: 1 / 120,
    });
    const runtime = () =>
      (source.captureCheckpoint().snapshot.state["tear.world.v1"] as { runtime: { bossIntro: unknown } }).runtime;
    expect(runtime().bossIntro).not.toBeNull();
    restored.restoreCheckpoint(checkpoint);
    for (let tick = 0; tick < 240; tick++) expect(restored.step([])).toEqual(source.step([]));
    expect(runtime().bossIntro).toBeNull();
    const bosses = source.captureCheckpoint().snapshot.state["tear.boss.v1"] as readonly {
      introT: number;
      aliveT: number;
    }[];
    expect(bosses.length).toBeGreaterThan(0);
    expect(bosses[0]?.introT).toBe(0);
    expect(bosses[0]?.aliveT).toBeGreaterThan(0);
    expect(source.captureCheckpoint().bootstrap.applicationFramePolicy).toEqual(
      checkpoint.bootstrap.applicationFramePolicy,
    );
    const legacyBootstrap = { ...checkpoint.bootstrap };
    delete legacyBootstrap.applicationFramePolicy;
    const legacy = bindCheckpoint({ ...checkpoint, bootstrap: legacyBootstrap });
    expect(() => restored.restoreCheckpoint(legacy)).toThrow(/unknown generated/);
    source.dispose();
    restored.dispose();
  });
  it("checkpoint admission refuses a gapped accepted trace and step rejects an invalid batch atomically", () => {
    const source = createProductionHeadlessEnvironment();
    source.reset(scenario);
    source.step([{ type: "move", x: 1000, y: 0 }]);
    source.step([{ type: "move", x: 0, y: 0 }]);
    const checkpoint = source.captureCheckpoint(),
      target = createProductionHeadlessEnvironment();
    target.reset(scenario);
    const gap = bindCheckpoint({
      ...checkpoint,
      actions: checkpoint.actions.map((entry, index) => ({ ...entry, id: index === 1 ? 3 : 1 })),
      checkpoint: { ...checkpoint.checkpoint, nextCommandId: 3 },
    });
    expect.soft(() => target.restoreCheckpoint(gap)).toThrow(/trace|sequence/);
    const before = source.captureCheckpoint();
    expect(() =>
      source.step([{ type: "move", x: -1000, y: 0 }, { type: "move", x: "invalid", y: 0 } as unknown as GameAction]),
    ).toThrow(/action/);
    expect.soft(source.captureCheckpoint()).toEqual(before);
    source.dispose();
    target.dispose();
  });

  it("checkpoint admission refuses a malformed pending actor identifier", () => {
    const source = createProductionHeadlessEnvironment();
    source.reset(scenario);
    const checkpoint = source.captureCheckpoint(),
      target = createProductionHeadlessEnvironment();
    target.reset(scenario);
    const pendingEvents = checkpoint.delivery.pendingEvents.map((event) => ({ ...event, actorId: 7 }));
    const invalid = bindCheckpoint({
      ...checkpoint,
      delivery: { ...checkpoint.delivery, pendingEvents },
    } as unknown as ProductionHeadlessCheckpoint);
    expect(() => target.restoreCheckpoint(invalid)).toThrow(/frontier/);
    source.dispose();
    target.dispose();
  });

  it("checkpoint admission refuses a changed natural scenario seed even with a rebound integrity hash", () => {
    const source = createProductionHeadlessEnvironment();
    source.reset(scenario);
    const checkpoint = source.captureCheckpoint(),
      target = createProductionHeadlessEnvironment();
    target.reset(scenario);
    const invalid = bindCheckpoint({
      ...checkpoint,
      scenario: { ...checkpoint.scenario, seed: "different-natural-origin" },
    });
    expect(() => target.restoreCheckpoint(invalid)).toThrow(/scenario|seed/);
    source.dispose();
    target.dispose();
  });

  it("requires schema-two explicit aim state before replacing a destination, while capturing full scale explicitly", () => {
    const source = createProductionHeadlessEnvironment();
    source.reset(scenario);
    const checkpoint = source.captureCheckpoint(),
      target = createProductionHeadlessEnvironment();
    target.reset({ ...scenario, seed: "preserved-v2-target" });
    expect(checkpoint.schemaVersion).toBe(2);
    expect(checkpoint.input.aimMagnitude).toBe(1000);
    const before = target.captureCheckpoint(),
      missing = structuredClone(checkpoint);
    Reflect.deleteProperty(missing.input, "aimMagnitude");
    const legacy = { ...checkpoint, schemaVersion: 1 } as unknown as ProductionHeadlessCheckpoint;
    for (const invalid of [
      missing,
      legacy,
      ...[-1, 1001, 0.5, "250", null].map(
        (aimMagnitude) =>
          ({ ...checkpoint, input: { ...checkpoint.input, aimMagnitude } }) as unknown as ProductionHeadlessCheckpoint,
      ),
    ]) {
      expect(() => target.restoreCheckpoint(invalid)).toThrow(/format|coordinate/);
      expect(target.captureCheckpoint()).toEqual(before);
    }
    source.dispose();
    target.dispose();
  });

  it.each([0, 250])("continues checkpoint held aim magnitude %s without a new aim command", (magnitude) => {
    const source = createProductionHeadlessEnvironment();
    source.reset(scenario);
    source.step([
      { type: "aim", turn: 125000, magnitude },
      { type: "weapon", intent: "primary", phase: "pressed" },
    ]);
    const saved = source.captureCheckpoint(),
      restored = createProductionHeadlessEnvironment();
    expect(saved.input.aimMagnitude).toBe(magnitude);
    restored.restoreCheckpoint(JSON.parse(JSON.stringify(saved)) as ProductionHeadlessCheckpoint);
    for (let tick = 2; tick < 30; tick += 1) expect(restored.step([])).toEqual(source.step([]));
    expectContinuation(restored.captureCheckpoint(), source.captureCheckpoint());
    source.dispose();
    restored.dispose();
  });
  it("uses an injected build identity for headless bootstrap and marks absent identity unbound", () => {
    const injected = {
      version: "0.1.0",
      revision: "c30-test-revision",
      target: "test-standalone",
      rulesetVersion: "tear-rules-test",
      contentHash: "source-content-test",
    };
    const bound = createProductionGhostReplayComposition({
      runSeed: scenarioRunSeed(scenario.seed),
      buildIdentity: injected,
    }).create(undefined);
    expect(bound.bootstrap.build).toMatchObject(injected);

    const unbound = createProductionGhostReplayComposition({ runSeed: scenarioRunSeed(scenario.seed) }).create(
      undefined,
    );
    expect(unbound.bootstrap.build.revision).toBe("unbound");
    expect(unbound.bootstrap.build.revision).not.toBe("working-tree");
  });

  it("projects structured agent observations from the same source-owned production world", () => {
    const environment = createProductionHeadlessEnvironment();
    environment.reset(scenario);
    const opening = environment.policyObservation();
    environment.step(actionsAt(1));
    const advanced = environment.policyObservation();
    environment.dispose();

    expect(opening).toMatchObject({
      kind: "observation",
      // The live game's own projection, with what the scripted player steers by (the walls, each enemy's attack).
      observationClass: "privileged-diagnostic",
      tick: 0,
      run: {
        mode: scenario.start.mode,
        difficulty: scenario.start.difficulty,
        weapon: scenario.start.weapon,
        stage: "grounds",
      },
    });
    expect(advanced.tick).toBe(1);
    expect(advanced.player.x).not.toBe(opening.player.x);
    expect(advanced.availableActions).toContain("weapon");
  });

  it("delivers ordered causal engine events from ordinary headless transitions", () => {
    const execute = () => {
      const environment = createProductionHeadlessEnvironment();
      environment.reset(scenario);
      const events = [] as NonNullable<ReturnType<typeof environment.step>["events"]>[number][];
      for (let tick = 0; tick < 120 && !events.some((event) => event.type === "enemy.spawned"); tick += 1) {
        events.push(...(environment.step([]).events ?? []));
      }
      environment.dispose();
      return events;
    };
    const events = execute();
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["run.started", "enemy.spawned"]));
    expect(events.every((event) => event.source === "engine")).toBe(true);
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect(execute()).toEqual(events);
  });

  it("checkpoint frontier retains undelivered tick-zero facts and later event sequences", () => {
    const original = createProductionHeadlessEnvironment();
    original.reset(scenario);
    const restored = createProductionHeadlessEnvironment();
    restored.restoreCheckpoint(
      JSON.parse(JSON.stringify(original.captureCheckpoint())) as ProductionHeadlessCheckpoint,
    );
    expect(restored.step([])).toEqual(original.step([]));
    for (let tick = 2; tick <= 20; tick += 1) {
      expect(restored.step([])).toEqual(original.step([]));
    }
    const second = createProductionHeadlessEnvironment();
    second.restoreCheckpoint(JSON.parse(JSON.stringify(original.captureCheckpoint())) as ProductionHeadlessCheckpoint);
    for (let tick = 21; tick <= 100; tick += 1) {
      expect(second.step([])).toEqual(original.step([]));
    }
    original.dispose();
    restored.dispose();
    second.dispose();
  });

  it("checkpoint frontier captures a naturally prepared Campaign opening", () => {
    const original = createProductionHeadlessEnvironment();
    original.reset({ ...scenario, start: { ...scenario.start, mode: "campaign" } });
    const checkpoint = original.captureCheckpoint();
    expect(checkpoint.snapshot.state["tear.world.v1"]).toMatchObject({
      runtime: {
        lifecycle: { phase: "wave-prepared", activationDeferred: true },
        chapterBinding: { flowState: "LORE_ENTER" },
      },
    });
    const restored = createProductionHeadlessEnvironment();
    restored.restoreCheckpoint(JSON.parse(JSON.stringify(checkpoint)) as ProductionHeadlessCheckpoint);
    expectContinuation(restored.captureCheckpoint(), checkpoint);
    expect(restored.captureCheckpoint()).toEqual(restored.captureCheckpoint());
    original.advanceApplicationFrame(1 / 120);
    restored.advanceApplicationFrame(1 / 120);
    expect(restored.step([])).toEqual(original.step([]));
    const atOne = original.captureCheckpoint();
    const next = createProductionHeadlessEnvironment({ captureSourceTracks: true });
    next.restoreCheckpoint(JSON.parse(JSON.stringify(atOne)) as ProductionHeadlessCheckpoint);
    expectContinuation(next.captureCheckpoint(), atOne);
    expect(next.sourceTracks()).toMatchObject({ origin: "checkpoint-suffix", nativeEvents: [] });
    next.advanceApplicationFrame(0.1, { key: false });
    original.advanceApplicationFrame(0.1, { key: false });
    expect(next.step([])).toEqual(original.step([]));
    next.dispose();
    original.dispose();
    restored.dispose();
  });

  it("retains held input and authored same-tick command order through repeated JSON checkpoints", () => {
    const source = createProductionHeadlessEnvironment();
    source.reset(scenario);
    source.step([
      { type: "move", x: -1000, y: 0 },
      { type: "move", x: 1000, y: 0 },
      { type: "weapon", intent: "primary", phase: "pressed" },
    ]);
    const saved = source.captureCheckpoint(),
      restored = createProductionHeadlessEnvironment();
    expect(saved.input).toMatchObject({ moveX: 1, primaryHeld: true });
    restored.restoreCheckpoint(JSON.parse(JSON.stringify(saved)) as ProductionHeadlessCheckpoint);
    expectContinuation(restored.captureCheckpoint(), saved);
    for (let tick = 2; tick <= 60; tick += 1)
      expect(restored.step(actionsAt(tick))).toEqual(source.step(actionsAt(tick)));
    expectContinuation(restored.captureCheckpoint(), source.captureCheckpoint());
    source.dispose();
    restored.dispose();
  });

  it("refuses missing, tampered or malformed frontier before replacing an active destination", () => {
    const source = createProductionHeadlessEnvironment();
    source.reset(scenario);
    const saved = source.captureCheckpoint();
    const target = createProductionHeadlessEnvironment();
    target.reset({ ...scenario, seed: "destination-active" });
    target.step(actionsAt(1));
    const before = target.captureCheckpoint();
    const missing = structuredClone(saved);
    Reflect.deleteProperty(missing, "delivery");
    const cases = [
      missing,
      { ...saved, delivery: { ...saved.delivery, nextSequence: saved.delivery.nextSequence + 1 } },
      bindCheckpoint({
        ...saved,
        delivery: {
          ...saved.delivery,
          pendingEvents: saved.delivery.pendingEvents.map((event) => ({ ...event, source: "derived" })),
        },
      }),
      bindCheckpoint({
        ...saved,
        delivery: {
          ...saved.delivery,
          pendingEvents: saved.delivery.pendingEvents.map((event) => ({ ...event, tick: 5 })),
        },
      }),
      bindCheckpoint({
        ...saved,
        delivery: { ...saved.delivery, pendingEvents: [...saved.delivery.pendingEvents].reverse() },
      }),
      { ...saved, bootstrap: { ...saved.bootstrap, build: { ...saved.bootstrap.build, revision: "changed" } } },
    ];
    for (const invalid of cases) {
      expect(() => target.restoreCheckpoint(invalid)).toThrow(/frontier|binding/);
      expect(target.captureCheckpoint()).toEqual(before);
    }
    source.dispose();
    target.dispose();
  });

  it("checkpoint frontier continues sequence after already delivered source facts", () => {
    const source = createProductionHeadlessEnvironment();
    source.reset(scenario);
    source.step([]);
    const restored = createProductionHeadlessEnvironment();
    restored.restoreCheckpoint(source.captureCheckpoint());
    const actual = [],
      expected = [];
    for (let tick = 2; tick <= 100; tick += 1) {
      actual.push(...(restored.step([]).events ?? []));
      expected.push(...(source.step([]).events ?? []));
    }
    expect(expected.length).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
    source.dispose();
    restored.dispose();
  });

  it("checkpoint frontier admits a source-owned pending draft without rerolling it", () => {
    // Boundary fixture: clear the source queue, then use the real wave-clear/reward owner.
    const source = createProductionGhostReplayComposition({
      runSeed: scenarioRunSeed(scenario.seed),
      mode: "endless",
    }).create(undefined);
    Object.assign(source.replay.world.state.run() ?? {}, { spawnQueue: [] });
    source.replay.world.state.setEnemies([]);
    source.waveReward.update(1);
    const captured = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "pending-draft",
    );
    const baseline = createProductionHeadlessEnvironment();
    baseline.reset(scenario);
    const checkpoint = {
      ...baseline.captureCheckpoint(),
      snapshot: captured.snapshot,
      input: { ...captured.input, aimMagnitude: captured.input.aimMagnitude ?? 1000 },
      checkpoint: { ...baseline.captureCheckpoint().checkpoint, semanticHash: captured.semanticHash },
    };
    const restored = createProductionHeadlessEnvironment();
    const bound = bindCheckpoint(checkpoint);
    restored.restoreCheckpoint(bound);
    expect(restored.captureCheckpoint().snapshot.state["tear.reward.v1"]).toEqual(
      captured.snapshot.state["tear.reward.v1"],
    );
    const before = restored.captureCheckpoint();
    const recordAt = (value: ProductionHeadlessCheckpoint, key: string) =>
      value.snapshot.state[key] as Record<string, unknown>;
    const mutations: readonly ((value: ProductionHeadlessCheckpoint) => void)[] = [
      (value) => {
        recordAt(value, "tear.ui.v1").screen = "playing";
      },
      (value) => {
        recordAt(value, "tear.ui.v1").screen = "menu";
      },
      (value) => {
        const runtime = recordAt(value, "tear.world.v1").runtime as Record<string, unknown>;
        runtime.lifecycle = { ...(runtime.lifecycle as Record<string, unknown>), phase: "wave-active", reward: null };
      },
      (value) => {
        const selection = recordAt(value, "tear.reward.v1").selection as { choices: { id: string }[] };
        const choice = selection.choices[0];
        if (choice !== undefined) choice.id = "unknown-production-upgrade";
      },
      (value) => {
        const selection = recordAt(value, "tear.reward.v1").selection as { choices: unknown[] };
        selection.choices = [];
      },
      (value) => {
        const config = recordAt(value, "tear.configuration.v1").values as { player: Record<string, unknown> };
        config.player.moveSpeed = "malformed";
      },
    ];
    for (const mutate of mutations) {
      const invalid = structuredClone(bound);
      mutate(invalid);
      expect(() => restored.restoreCheckpoint(bindCheckpoint(invalid))).toThrow();
      expect(restored.captureCheckpoint()).toEqual(before);
    }
    baseline.dispose();
    restored.dispose();
  });

  it("retains source-owned transition facts on ordinary completed headless episodes", () => {
    const runner = new TearHeadlessRunner(createProductionHeadlessEnvironment());
    const episode = runner.run(
      { id: "current-headless-event-custody", scenario, maxTicks: 120 },
      { decide: () => Object.freeze([Object.freeze([])]) },
    );
    runner.dispose();
    const events = episode.events;
    expect(events).toBeDefined();
    if (events === undefined) throw new Error("production headless episodes must retain their native causal facts");
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["run.started", "enemy.spawned"]));
    expect(events.every((event) => event.source === "engine")).toBe(true);
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect(Object.isFrozen(events)).toBe(true);
  });

  it("runs a DOM-free episode through the same production replay composition", () => {
    const environment = createProductionHeadlessEnvironment();
    let final = environment.reset(scenario);
    const recordedActions = [] as {
      readonly kind: "command";
      readonly id: number;
      readonly tick: number;
      readonly command: ReturnType<typeof actionsAt>[number];
    }[];
    for (let tick = 1; tick <= scenario.maxTicks; tick += 1) {
      const actions = actionsAt(tick);
      for (const action of actions)
        recordedActions.push(Object.freeze({ kind: "command", id: recordedActions.length + 1, tick, command: action }));
      final = environment.step(actions).observation;
    }
    environment.dispose();

    const ghost = createGhostV3({
      id: "c30-production-headless",
      rulesetVersion: "tear-rules-2026.07",
      sourceClassification: "native-v3",
      trident,
      actions: Object.freeze(recordedActions),
      snapshots: Object.freeze([]),
      events: Object.freeze([]),
    });
    const replay = new GhostProductionReplayWorld(
      ghost,
      createProductionGhostReplayComposition({ runSeed: scenarioRunSeed(scenario.seed), mode: scenario.start.mode }),
    );
    expect(replay.seek(scenario.maxTicks).semanticHash).toBe(stableVerificationHash(final));
  });

  it("constructs independent worlds and refuses surgical state masquerading as a natural episode", () => {
    const first = createProductionHeadlessEnvironment();
    const second = createProductionHeadlessEnvironment();
    const firstOrigin = first.reset(scenario);
    const secondOrigin = second.reset(scenario);
    expect(firstOrigin).toEqual(secondOrigin);
    expect(firstOrigin).not.toBe(secondOrigin);

    const firstMoved = first.step(actionsAt(1)).observation;
    const secondIdle = second.step([]).observation;
    expect(stableVerificationHash(firstMoved)).not.toBe(stableVerificationHash(secondIdle));
    const third = createProductionHeadlessEnvironment();
    third.reset(scenario);
    expect(third.step(actionsAt(1)).observation).toEqual(firstMoved);

    expect(() =>
      first.reset(Object.freeze({ ...scenario, start: Object.freeze({ ...scenario.start, wave: 2 }) })),
    ).toThrow(/natural opening/);
    first.dispose();
    second.dispose();
    third.dispose();
  });

  it("restores an interrupted natural episode through a fresh source composition", () => {
    const original = createProductionHeadlessEnvironment();
    let originAtCheckpoint = original.reset(scenario);
    for (let tick = 1; tick <= 60; tick += 1) originAtCheckpoint = original.step(actionsAt(tick)).observation;
    const checkpoint = original.captureCheckpoint();
    expect(checkpoint).toMatchObject({
      format: "tearbench-production-headless-checkpoint",
      schemaVersion: 2,
      checkpoint: { tick: 60, nextCommandId: 3, semanticHash: stableVerificationHash(originAtCheckpoint) },
      snapshot: { kind: "snapshot", stateClass: "recorded-canonical", tick: 60 },
      input: { tick: 60 },
    });

    let originalTerminal: ProductionHeadlessTerminalArtifact | undefined;
    for (let tick = 61; tick <= scenario.maxTicks; tick += 1) {
      const transition = original.step(actionsAt(tick));
      if (transition.artifact !== undefined)
        originalTerminal = transition.artifact as ProductionHeadlessTerminalArtifact;
    }

    const restored = createProductionHeadlessEnvironment();
    const restoredAtCheckpoint = restored.restoreCheckpoint(checkpoint);
    expect(restoredAtCheckpoint).toEqual(originAtCheckpoint);
    let restoredTerminal: ProductionHeadlessTerminalArtifact | undefined;
    for (let tick = 61; tick <= scenario.maxTicks; tick += 1) {
      const transition = restored.step(actionsAt(tick));
      if (transition.artifact !== undefined)
        restoredTerminal = transition.artifact as ProductionHeadlessTerminalArtifact;
    }
    expect(restoredTerminal).toEqual(originalTerminal);
    expect(restoredTerminal?.actions).toHaveLength(3);

    const surgical = Object.freeze({
      ...checkpoint,
      snapshot: Object.freeze({ ...checkpoint.snapshot, stateClass: "surgical-valid" as const }),
    });
    const foreign = Object.freeze({
      ...checkpoint,
      scenario: Object.freeze({
        ...checkpoint.scenario,
        start: Object.freeze({ ...checkpoint.scenario.start, weapon: "hammer" as const }),
      }),
    });
    const rejected = createProductionHeadlessEnvironment();
    expect(() => rejected.restoreCheckpoint(surgical)).toThrow(/recorded-canonical/);
    expect(() => rejected.restoreCheckpoint(foreign)).toThrow(/does not match/);
    original.dispose();
    restored.dispose();
    rejected.dispose();
  });

  it("restores only a lineage-bound State Setup recovery frontier through the shared production composition", () => {
    const original = createProductionHeadlessEnvironment();
    original.reset(scenario);
    for (let tick = 1; tick <= 60; tick += 1) original.step(actionsAt(tick));
    const source = original.captureCheckpoint();
    const launch = createOneFrameBoundaryLaunchMatrix()[0];
    if (launch === undefined) throw new Error("State Setup fixture launch missing");
    const builtSnapshot = buildExitLaunchSnapshot(source.snapshot, launch);
    const restored = createProductionHeadlessEnvironment();
    expect(restored.restoreStateSetupEvaluation({ source, builtSnapshot })).toMatchObject({
      tick: source.checkpoint.tick,
    });
    const lineage = builtSnapshot.lineage;
    if (lineage === undefined) throw new Error("State Setup fixture lineage missing");
    const builtWrongParent = Object.freeze({
      ...builtSnapshot,
      lineage: Object.freeze({ ...lineage, parentId: "foreign" }),
    });
    expect(() => restored.restoreStateSetupEvaluation({ source, builtSnapshot: builtWrongParent })).toThrow(
      /lineage-bound/u,
    );
    original.dispose();
    restored.dispose();
  });

  it("runs bounded independent production episodes with sampled terminal artifacts", async () => {
    const makeJob = (
      id: string,
      seed: string,
    ): Readonly<{ id: string; scenario: TearScenarioV1; maxTicks: number }> => {
      const jobScenario = Object.freeze({ ...scenario, id, seed, maxTicks: 24 });
      return Object.freeze({ id, scenario: jobScenario, maxTicks: 24 });
    };
    const jobs = Object.freeze([
      makeJob("c30-idle", "c30-shared-seed"),
      makeJob("c30-move", "c30-shared-seed"),
      makeJob("c30-repeat-move", "c30-shared-seed"),
      makeJob("c30-cancelled", "c30-cancelled-seed"),
      makeJob("c30-timed-out", "c30-timeout-seed"),
    ]);
    const samples = new BoundedArtifactSampler(2);
    const pool = createProductionHeadlessEpisodePool(2);
    const results = await pool.run(
      jobs,
      (job) => {
        let firstBatch = true;
        return Object.freeze({
          decide: () => {
            const firstAction =
              firstBatch && (job.id === "c30-move" || job.id === "c30-repeat-move")
                ? Object.freeze([{ type: "move" as const, x: 1_000, y: 0 }])
                : Object.freeze([]);
            firstBatch = false;
            return Object.freeze([firstAction, Object.freeze([]), Object.freeze([]), Object.freeze([])]);
          },
        });
      },
      {
        batchSize: 4,
        artifactSampler: samples,
        controlForJob: (job) => {
          if (job.id === "c30-cancelled") return Object.freeze({ isCancelled: () => true });
          if (job.id === "c30-timed-out") {
            let clock = 0;
            return Object.freeze({
              timeoutMilliseconds: 1,
              now: () => {
                clock += 1;
                return clock;
              },
            });
          }
          return undefined;
        },
      },
    );

    const [idle, moved, repeatedMoved, cancelled, timedOut] = results;
    expect(idle).toMatchObject({ id: "c30-idle", outcome: "truncated", ticks: 24 });
    expect(moved).toMatchObject({ id: "c30-move", outcome: "truncated", ticks: 24 });
    expect(repeatedMoved).toMatchObject({ id: "c30-repeat-move", outcome: "truncated", ticks: 24 });
    expect(moved?.semanticHash).not.toBe(idle?.semanticHash);
    expect(repeatedMoved?.semanticHash).toBe(moved?.semanticHash);
    expect(cancelled).toMatchObject({ id: "c30-cancelled", outcome: "cancelled", ticks: 0 });
    expect(timedOut).toMatchObject({ id: "c30-timed-out", outcome: "timed-out", ticks: 0 });
    expect(samples.samples()).toHaveLength(2);
    expect(
      samples
        .samples()
        .every(
          (sample) => (sample.artifact as { format?: string }).format === "tearbench-production-headless-terminal",
        ),
    ).toBe(true);
  });

  it("stress-runs fresh production worlds without sharing state, traces, or terminal artifacts", async () => {
    const episodeCount = 256;
    const jobs = Object.freeze(
      Array.from({ length: episodeCount }, (_, index) => {
        const id = `c30-stress-${String(index + 1).padStart(3, "0")}`;
        return Object.freeze({
          id,
          scenario: Object.freeze({
            ...scenario,
            id,
            seed: `c30-stress-seed-${String(index + 1)}`,
            maxTicks: 120,
          }) satisfies TearScenarioV1,
          maxTicks: 120,
        });
      }),
    );
    const samples = new BoundedArtifactSampler(32);
    const results = await createProductionHeadlessEpisodePool(8).run(
      jobs,
      (job) => {
        let tick = 0;
        const move = Number.parseInt(job.id.slice(-3), 10) % 2 === 0 ? -1_000 : 1_000;
        return Object.freeze({
          decide: () =>
            Object.freeze(
              Array.from({ length: 4 }, () => {
                tick += 1;
                if (tick === 1) return Object.freeze([{ type: "move" as const, x: move, y: 0 }]);
                if (tick === 20) return Object.freeze([{ type: "jump" as const, phase: "pressed" as const }]);
                if (tick === 40) return Object.freeze([{ type: "dash" as const, x: move, y: 0 }]);
                return Object.freeze([]);
              }),
            ),
        });
      },
      { batchSize: 4, artifactSampler: samples },
    );

    expect(results).toHaveLength(episodeCount);
    expect(results.every((result) => result.outcome === "truncated" && result.ticks === 120)).toBe(true);
    expect(new Set(results.map((result) => result.semanticHash))).toHaveLength(episodeCount);
    expect(new Set(results.map((result) => result.observations.at(-1))).size).toBe(episodeCount);
    expect(samples.samples()).toHaveLength(32);
    const terminals = samples.samples().map((sample) => sample.artifact as ProductionHeadlessTerminalArtifact);
    expect(new Set(terminals.map((artifact) => artifact.scenario)).size).toBe(32);
    expect(new Set(terminals.map((artifact) => artifact.actions)).size).toBe(32);
    expect(
      terminals.every(
        (artifact) => artifact.actions.length === 3 && artifact.terminal.truncated && !artifact.terminal.terminated,
      ),
    ).toBe(true);
    expect(terminals.map((artifact) => artifact.scenario.id)).toEqual(jobs.slice(0, 32).map((job) => job.id));
  }, 30_000);

  it("retains the exact natural scenario and accepted command trace in a terminal artifact", () => {
    const environment = createProductionHeadlessEnvironment();
    const artifactScenario = Object.freeze({
      ...scenario,
      id: "movement-jump",
      description: "C30 browser-rerunnable natural terminal",
      seed: "c30-browser-rerun",
      maxTicks: 120,
    }) satisfies TearScenarioV1;
    let terminal: ProductionHeadlessTerminalArtifact | undefined;
    environment.reset(artifactScenario);
    for (let tick = 1; tick <= artifactScenario.maxTicks; tick += 1) {
      const transition = environment.step(actionsAt(tick));
      if (transition.artifact !== undefined) terminal = transition.artifact as ProductionHeadlessTerminalArtifact;
    }
    environment.dispose();

    expect(terminal).toMatchObject({
      format: "tearbench-production-headless-terminal",
      schemaVersion: 1,
      scenario: { id: "movement-jump", seed: "c30-browser-rerun", maxTicks: 120 },
      terminal: { tick: 120, terminated: false, truncated: true },
    });
    expect(terminal?.actions).toEqual([
      { kind: "command", id: 1, tick: 1, command: { type: "move", x: 1_000, y: 0 } },
      { kind: "command", id: 2, tick: 20, command: { type: "jump", phase: "pressed" } },
      { kind: "command", id: 3, tick: 40, command: { type: "dash", x: 1_000, y: 0 } },
    ]);
    expect(terminal?.terminal.semanticHash).toMatch(/^[a-f0-9]{16}$/u);
    const fixture: unknown = JSON.parse(
      readFileSync(resolve("tests", "fixtures", "production-headless-terminal-movement-jump.json"), "utf8"),
    );
    expectLegacyTerminalFixture(fixture, terminal);
  });

  it("produces a real natural one-hit failure through the shared source lifecycle", () => {
    const environment = createProductionHeadlessEnvironment();
    const failureScenario = Object.freeze({
      ...scenario,
      id: "movement-jump",
      description: "C30 natural one-hit failure candidate",
      seed: "c30-onehit-natural-failure",
      start: Object.freeze({ mode: "endless", difficulty: "onehit", weapon: "sword" }),
      maxTicks: 720,
      tags: Object.freeze(["c30", "headless", "natural-failure"]),
    }) satisfies TearScenarioV1;
    let terminal: ProductionHeadlessTerminalArtifact | undefined;
    environment.reset(failureScenario);
    for (let tick = 1; tick <= failureScenario.maxTicks; tick += 1) {
      const transition = environment.step([]);
      if (transition.artifact !== undefined) {
        terminal = transition.artifact as ProductionHeadlessTerminalArtifact;
        break;
      }
    }
    environment.dispose();

    const fixture: unknown = JSON.parse(
      readFileSync(resolve("tests", "fixtures", "production-headless-terminal-onehit-failure.json"), "utf8"),
    );
    expectLegacyTerminalFixture(fixture, terminal);
    expect(terminal?.terminal).toEqual({
      tick: 403,
      semanticHash: "d0ddc2f82de25158",
      terminated: true,
      truncated: false,
    });
    expect(terminal?.actions).toEqual([]);
  });

  it("prioritizes natural termination when it lands exactly on the truncation horizon", () => {
    const environment = createProductionHeadlessEnvironment();
    const horizonScenario = Object.freeze({
      ...scenario,
      id: "movement-jump",
      description: "C30 natural one-hit horizon failure candidate",
      seed: "c30-onehit-natural-failure",
      maxTicks: 403,
      start: Object.freeze({ mode: "endless", difficulty: "onehit", weapon: "sword" }),
    }) satisfies TearScenarioV1;
    let terminal: ProductionHeadlessTerminalArtifact | undefined;
    environment.reset(horizonScenario);
    for (let tick = 1; tick <= horizonScenario.maxTicks; tick += 1) {
      const transition = environment.step([]);
      if (transition.artifact !== undefined) {
        terminal = transition.artifact as ProductionHeadlessTerminalArtifact;
        break;
      }
    }
    environment.dispose();

    expect(terminal?.terminal.tick).toBe(403);
    expect(terminal?.terminal.terminated).toBe(true);
    expect(terminal?.terminal.truncated).toBe(false);
    expect(terminal?.terminal.terminated && terminal.terminal.truncated).toBe(false);
  });
});
