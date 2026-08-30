import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createGhostV3, GhostProductionReplayWorld, type GhostReplayTrident } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  createProductionGhostReplayComposition,
  createProductionHeadlessEnvironment,
  createProductionHeadlessEpisodePool,
  BoundedArtifactSampler,
  createOneFrameBoundaryLaunchMatrix,
  TearHeadlessRunner,
  type ProductionHeadlessTerminalArtifact,
  forgeExitLaunchSnapshot,
  type TearScenarioV1,
} from "../../src/tearbench";

const scenario = Object.freeze({
  format: "tear-contract", kind: "scenario", schemaVersion: 1,
  id: "c30-production-headless", version: 1,
  description: "C30 same-composition headless episode",
  stateClass: "recorded-canonical", executionClass: "training",
  seed: "c30-production-headless-seed",
  start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
  maxTicks: 120, assertions: Object.freeze(["runtime.finite-state"] as const),
  tags: Object.freeze(["c30", "headless", "production-composition"] as const),
} as const) satisfies TearScenarioV1;

const trident: GhostReplayTrident = Object.freeze({
  command: Object.freeze({ kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "C30 test" }),
  state: Object.freeze({ kind: "state", status: "absent", available: false, resumable: false, seekable: false, reason: "C30 test" }),
  visual: Object.freeze({ kind: "visual", status: "absent", available: false, resumable: false, seekable: false, reason: "C30 test" }),
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

describe("C30 production headless environment", () => {
  it("uses an injected build identity for headless bootstrap and marks absent identity unbound", () => {
    const injected = {
      version: "0.1.0", revision: "c30-test-revision", target: "test-standalone",
      rulesetVersion: "tear-rules-test", contentHash: "source-content-test",
    };
    const bound = createProductionGhostReplayComposition({ seed: scenario.seed, buildIdentity: injected }).create(undefined);
    expect(bound.bootstrap.build).toMatchObject(injected);

    const unbound = createProductionGhostReplayComposition({ seed: scenario.seed }).create(undefined);
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

    expect(opening).toMatchObject({ kind: "observation", observationClass: "structured-state", tick: 0,
      run: { mode: scenario.start.mode, difficulty: scenario.start.difficulty, weapon: scenario.start.weapon, stage: "grounds" } });
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
        events.push(...environment.step([]).events ?? []);
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

  it("retains source-owned transition facts on ordinary completed headless episodes", () => {
    const runner = new TearHeadlessRunner(createProductionHeadlessEnvironment());
    const episode = runner.run({ id: "current-headless-event-custody", scenario, maxTicks: 120 },
      { decide: () => Object.freeze([Object.freeze([])]) });
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
    const recordedActions = [] as { readonly kind: "command"; readonly id: number; readonly tick: number; readonly command: ReturnType<typeof actionsAt>[number] }[];
    for (let tick = 1; tick <= scenario.maxTicks; tick += 1) {
      const actions = actionsAt(tick);
      for (const action of actions) recordedActions.push(Object.freeze({ kind: "command", id: recordedActions.length + 1, tick, command: action }));
      final = environment.step(actions).observation;
    }
    environment.dispose();

    const ghost = createGhostV3({
      id: "c30-production-headless", rulesetVersion: "tear-rules-2026.07", sourceClassification: "native-v3",
      trident, actions: Object.freeze(recordedActions), snapshots: Object.freeze([]), events: Object.freeze([]),
    });
    const replay = new GhostProductionReplayWorld(ghost,
      createProductionGhostReplayComposition({ seed: scenario.seed, mode: scenario.start.mode }));
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

    expect(() => first.reset(Object.freeze({ ...scenario,
      start: Object.freeze({ ...scenario.start, wave: 2 }),
    }))).toThrow(/natural opening/);
    first.dispose(); second.dispose(); third.dispose();
  });

  it("restores an interrupted natural episode through a fresh source composition", () => {
    const original = createProductionHeadlessEnvironment();
    let originAtCheckpoint = original.reset(scenario);
    for (let tick = 1; tick <= 60; tick += 1) originAtCheckpoint = original.step(actionsAt(tick)).observation;
    const checkpoint = original.captureCheckpoint();
    expect(checkpoint).toMatchObject({
      format: "tearbench-production-headless-checkpoint", schemaVersion: 1,
      checkpoint: { tick: 60, nextCommandId: 3, semanticHash: stableVerificationHash(originAtCheckpoint) },
      snapshot: { kind: "snapshot", stateClass: "recorded-canonical", tick: 60 },
      input: { tick: 60 },
    });

    let originalTerminal: ProductionHeadlessTerminalArtifact | undefined;
    for (let tick = 61; tick <= scenario.maxTicks; tick += 1) {
      const transition = original.step(actionsAt(tick));
      if (transition.artifact !== undefined) originalTerminal = transition.artifact as ProductionHeadlessTerminalArtifact;
    }

    const restored = createProductionHeadlessEnvironment();
    const restoredAtCheckpoint = restored.restoreCheckpoint(checkpoint);
    expect(restoredAtCheckpoint).toEqual(originAtCheckpoint);
    let restoredTerminal: ProductionHeadlessTerminalArtifact | undefined;
    for (let tick = 61; tick <= scenario.maxTicks; tick += 1) {
      const transition = restored.step(actionsAt(tick));
      if (transition.artifact !== undefined) restoredTerminal = transition.artifact as ProductionHeadlessTerminalArtifact;
    }
    expect(restoredTerminal).toEqual(originalTerminal);
    expect(restoredTerminal?.actions).toHaveLength(3);

    const surgical = Object.freeze({ ...checkpoint,
      snapshot: Object.freeze({ ...checkpoint.snapshot, stateClass: "surgical-valid" as const }),
    });
    const foreign = Object.freeze({ ...checkpoint,
      scenario: Object.freeze({ ...checkpoint.scenario,
        start: Object.freeze({ ...checkpoint.scenario.start, weapon: "hammer" as const }),
      }),
    });
    const rejected = createProductionHeadlessEnvironment();
    expect(() => rejected.restoreCheckpoint(surgical)).toThrow(/recorded-canonical/);
    expect(() => rejected.restoreCheckpoint(foreign)).toThrow(/does not match/);
    original.dispose(); restored.dispose(); rejected.dispose();
  });

  it("restores only a lineage-bound State Forge recovery frontier through the shared production composition", () => {
    const original = createProductionHeadlessEnvironment();
    original.reset(scenario);
    for (let tick = 1; tick <= 60; tick += 1) original.step(actionsAt(tick));
    const source = original.captureCheckpoint();
    const launch = createOneFrameBoundaryLaunchMatrix()[0];
    if (launch === undefined) throw new Error("State Forge fixture launch missing");
    const forgedSnapshot = forgeExitLaunchSnapshot(source.snapshot, launch);
    const restored = createProductionHeadlessEnvironment();
    expect(restored.restoreStateForgeEvaluation({ source, forgedSnapshot })).toMatchObject({ tick: source.checkpoint.tick });
    const lineage = forgedSnapshot.lineage;
    if (lineage === undefined) throw new Error("State Forge fixture lineage missing");
    const forgedWrongParent = Object.freeze({ ...forgedSnapshot, lineage: Object.freeze({ ...lineage, parentId: "foreign" }) });
    expect(() => restored.restoreStateForgeEvaluation({ source, forgedSnapshot: forgedWrongParent })).toThrow(/lineage-bound/u);
    original.dispose(); restored.dispose();
  });

  it("runs bounded independent production episodes with sampled terminal artifacts", async () => {
    const makeJob = (id: string, seed: string): Readonly<{ id: string; scenario: TearScenarioV1; maxTicks: number }> => {
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
    const results = await pool.run(jobs, (job) => {
      let firstBatch = true;
      return Object.freeze({
        decide: () => {
          const firstAction = firstBatch && (job.id === "c30-move" || job.id === "c30-repeat-move")
            ? Object.freeze([{ type: "move" as const, x: 1_000, y: 0 }]) : Object.freeze([]);
          firstBatch = false;
          return Object.freeze([firstAction, Object.freeze([]), Object.freeze([]), Object.freeze([])]);
        },
      });
    }, {
      batchSize: 4,
      artifactSampler: samples,
      controlForJob: (job) => {
        if (job.id === "c30-cancelled") return Object.freeze({ isCancelled: () => true });
        if (job.id === "c30-timed-out") {
          let clock = 0;
          return Object.freeze({ timeoutMilliseconds: 1, now: () => { clock += 1; return clock; } });
        }
        return undefined;
      },
    });

    const [idle, moved, repeatedMoved, cancelled, timedOut] = results;
    expect(idle).toMatchObject({ id: "c30-idle", outcome: "truncated", ticks: 24 });
    expect(moved).toMatchObject({ id: "c30-move", outcome: "truncated", ticks: 24 });
    expect(repeatedMoved).toMatchObject({ id: "c30-repeat-move", outcome: "truncated", ticks: 24 });
    expect(moved?.semanticHash).not.toBe(idle?.semanticHash);
    expect(repeatedMoved?.semanticHash).toBe(moved?.semanticHash);
    expect(cancelled).toMatchObject({ id: "c30-cancelled", outcome: "cancelled", ticks: 0 });
    expect(timedOut).toMatchObject({ id: "c30-timed-out", outcome: "timed-out", ticks: 0 });
    expect(samples.samples()).toHaveLength(2);
    expect(samples.samples().every((sample) => (sample.artifact as { format?: string }).format
      === "tearbench-production-headless-terminal")).toBe(true);
  });

  it("stress-runs fresh production worlds without sharing state, traces, or terminal artifacts", async () => {
    const episodeCount = 256;
    const jobs = Object.freeze(Array.from({ length: episodeCount }, (_, index) => {
      const id = `c30-stress-${String(index + 1).padStart(3, "0")}`;
      return Object.freeze({
        id,
        scenario: Object.freeze({
          ...scenario, id, seed: `c30-stress-seed-${String(index + 1)}`, maxTicks: 120,
        }) satisfies TearScenarioV1,
        maxTicks: 120,
      });
    }));
    const samples = new BoundedArtifactSampler(32);
    const results = await createProductionHeadlessEpisodePool(8).run(jobs, (job) => {
      let tick = 0;
      const move = Number.parseInt(job.id.slice(-3), 10) % 2 === 0 ? -1_000 : 1_000;
      return Object.freeze({
        decide: () => Object.freeze(Array.from({ length: 4 }, () => {
          tick += 1;
          if (tick === 1) return Object.freeze([{ type: "move" as const, x: move, y: 0 }]);
          if (tick === 20) return Object.freeze([{ type: "jump" as const, phase: "pressed" as const }]);
          if (tick === 40) return Object.freeze([{ type: "dash" as const, x: move, y: 0 }]);
          return Object.freeze([]);
        })),
      });
    }, { batchSize: 4, artifactSampler: samples });

    expect(results).toHaveLength(episodeCount);
    expect(results.every((result) => result.outcome === "truncated" && result.ticks === 120)).toBe(true);
    expect(new Set(results.map((result) => result.semanticHash))).toHaveLength(episodeCount);
    expect(new Set(results.map((result) => result.observations.at(-1))).size).toBe(episodeCount);
    expect(samples.samples()).toHaveLength(32);
    const terminals = samples.samples().map((sample) => sample.artifact as ProductionHeadlessTerminalArtifact);
    expect(new Set(terminals.map((artifact) => artifact.scenario)).size).toBe(32);
    expect(new Set(terminals.map((artifact) => artifact.actions)).size).toBe(32);
    expect(terminals.every((artifact) => artifact.actions.length === 3
      && artifact.terminal.truncated && !artifact.terminal.terminated)).toBe(true);
    expect(terminals.map((artifact) => artifact.scenario.id)).toEqual(jobs.slice(0, 32).map((job) => job.id));
  }, 30_000);

  it("retains the exact natural scenario and accepted command trace in a terminal artifact", () => {
    const environment = createProductionHeadlessEnvironment();
    const artifactScenario = Object.freeze({
      ...scenario, id: "movement-jump", description: "C30 browser-rerunnable natural terminal",
      seed: "c30-browser-rerun", maxTicks: 120,
    }) satisfies TearScenarioV1;
    let terminal: ProductionHeadlessTerminalArtifact | undefined;
    environment.reset(artifactScenario);
    for (let tick = 1; tick <= artifactScenario.maxTicks; tick += 1) {
      const transition = environment.step(actionsAt(tick));
      if (transition.artifact !== undefined) terminal = transition.artifact as ProductionHeadlessTerminalArtifact;
    }
    environment.dispose();

    expect(terminal).toMatchObject({
      format: "tearbench-production-headless-terminal", schemaVersion: 1,
      scenario: { id: "movement-jump", seed: "c30-browser-rerun", maxTicks: 120 },
      terminal: { tick: 120, terminated: false, truncated: true },
    });
    expect(terminal?.actions).toEqual([
      { kind: "command", id: 1, tick: 1, command: { type: "move", x: 1_000, y: 0 } },
      { kind: "command", id: 2, tick: 20, command: { type: "jump", phase: "pressed" } },
      { kind: "command", id: 3, tick: 40, command: { type: "dash", x: 1_000, y: 0 } },
    ]);
    expect(terminal?.terminal.semanticHash).toMatch(/^[a-f0-9]{16}$/u);
    const fixture: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", "c30-production-headless-terminal-movement-jump.json"), "utf8"));
    expect(normalizeLegacyFixtureRevision(fixture)).toEqual(terminal);
  });

  it("produces a real natural one-hit failure through the shared source lifecycle", () => {
    const environment = createProductionHeadlessEnvironment();
    const failureScenario = Object.freeze({
      ...scenario, id: "movement-jump", description: "C30 natural one-hit failure candidate",
      seed: "c30-onehit-natural-failure",
      start: Object.freeze({ mode: "endless", difficulty: "onehit", weapon: "sword" }),
      maxTicks: 720, tags: Object.freeze(["c30", "headless", "natural-failure"]),
    }) satisfies TearScenarioV1;
    let terminal: ProductionHeadlessTerminalArtifact | undefined;
    environment.reset(failureScenario);
    for (let tick = 1; tick <= failureScenario.maxTicks; tick += 1) {
      const transition = environment.step([]);
      if (transition.artifact !== undefined) { terminal = transition.artifact as ProductionHeadlessTerminalArtifact; break; }
    }
    environment.dispose();

    const fixture: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", "c30-production-headless-terminal-onehit-failure.json"), "utf8"));
    expect(terminal).toEqual(normalizeLegacyFixtureRevision(fixture));
    expect(terminal?.terminal).toEqual({
      tick: 222, semanticHash: "f981b3bb62116114", terminated: true, truncated: false,
    });
    expect(terminal?.actions).toEqual([]);
  });
});
