import { describe, expect, it, vi } from "vitest";
import { createProductionHeadlessEnvironment, type ProductionHeadlessTerminalArtifact, type TearScenarioV1 } from "../../src/tearbench";
import { createTearC34C32RuntimeModel, encodeTearC34C32SourceState, parseTearC34C32RuntimeModel, prepareTearReturnRuntimeSelector, selectTearC34C32RuntimeAction, tearC34C32SemanticActionHash } from "../../src/agents/c34-c32-runtime-compatibility";
import { createTearOfflineRlPlan, evaluateTearOfflineRlRewardTransition, extractTearOfflineRlTrajectories } from "../../src/agents/offline-rl-training";
import type { TearAcademyTrainingDatasetV1 } from "../../src/agents/academy-training-dataset";
import { encodeTearReturnSourceState, tearReturnAdapter, TEAR_RETURN_PLAYING_MASK } from "../../src/agents/c34-source-feature-state";
import { advanceTearOfflineRlV3Checkpoint, completeTearOfflineRlV3Checkpoint, createTearOfflineRlV3Checkpoint, createTearOfflineRlV3Plan } from "../../src/agents/offline-rl-v3-training";
import { stableVerificationHash } from "../../src/replay/hash";
import { createTearC32CanonicalSourceObservation, TearC34ReturnModelRuntime } from "../../src/agents/c34-v3-c32-policy-adapter";
import { createProductionCombatSimulation, createProductionReplayWorld, projectProductionReplayCanonicalState } from "../../src/tearbench";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";

const scenario: TearScenarioV1 = { format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "return-source-control", version: 1,
  description: "Native return source control, not governed training", stateClass: "recorded-canonical", executionClass: "engineering", seed: "r14-return-train-01",
  start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 300, assertions: ["runtime.finite-state"], tags: ["r14"] };

describe("return subskill source barriers", () => {
  it("preserves indexed return decisions, hash ties and legal masks from detached immutable inputs", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      const initial = environment.reset(scenario), states = [initial, environment.step([]).observation, environment.step([]).observation];
      const action = { type: "weapon", intent: "throw", phase: "pressed" } as const;
      const recall = { type: "weapon", intent: "recall", phase: "pressed" } as const;
      const vocabulary = [action, recall];
      for (const variant of ["return-exact.v2", "return-features.v2"] as const) {
        const values = new Map<string, { stateHash: string; semanticActionHash: string; actionHash: string; value: number }>();
        for (const state of states) for (const mask of [["weapon"], ["move", "weapon"]] as const) {
          const stateHash = encodeTearC34C32SourceState(state, variant, mask).stateHash;
          const semanticActionHash = tearC34C32SemanticActionHash([]);
          values.set(`${stateHash}:${semanticActionHash}`, { stateHash, semanticActionHash, actionHash: semanticActionHash, value: 0 });
        }
        const model = createTearC34C32RuntimeModel([...values.values()], variant);
        const select = prepareTearReturnRuntimeSelector(model, vocabulary);
        // A supported empty zero still loses the existing hash tie to the missing throw zero.
        expect(select(initial, ["weapon"])).toMatchObject({ actions: [action], entryPresent: false, value: 0 });
        for (const state of states) for (const mask of [["weapon"], ["move", "weapon"], ["move"], ["draft-choice"]] as const) {
          expect(select(state, mask)).toEqual(selectTearC34C32RuntimeAction(model, state, vocabulary, mask));
        }
        const stateHash = encodeTearC34C32SourceState(initial, variant, ["weapon"]).stateHash;
        const negative = createTearC34C32RuntimeModel(vocabulary.map(command => ({ stateHash,
          semanticActionHash: tearC34C32SemanticActionHash([command]), actionHash: tearC34C32SemanticActionHash([command]), value: -1 })), variant);
        expect(prepareTearReturnRuntimeSelector(negative, vocabulary)(initial, ["weapon"]))
          .toEqual(selectTearC34C32RuntimeAction(negative, initial, vocabulary, ["weapon"]));
        const positive = createTearC34C32RuntimeModel([{ stateHash, semanticActionHash: tearC34C32SemanticActionHash([recall]),
          actionHash: tearC34C32SemanticActionHash([recall]), value: 2 }], variant);
        const mutable = structuredClone(positive), supplied = [{ ...recall }];
        const runtime = new TearC34ReturnModelRuntime(mutable, supplied, () => [], { now: () => 0 });
        const source = createTearC32CanonicalSourceObservation(initial, ["weapon"]);
        const expected = runtime.decide(source);
        const entry = mutable.entries[0], suppliedAction = supplied[0];
        if (entry === undefined || suppliedAction === undefined) throw new Error("missing detached model entry/action");
        Object.assign(entry, { value: -2 }); Object.assign(suppliedAction, { intent: "throw" });
        expect(runtime.decide(source)).toEqual(expected);
        expect(expected).toMatchObject({ source: "diagnostic-model", actions: [recall], support: { entryPresent: true, value: 2 } });
        expect(() => selectTearC34C32RuntimeAction(mutable, initial, supplied, ["weapon"])).toThrow(/integrity/);
        expect(() => prepareTearReturnRuntimeSelector(mutable, supplied)).toThrow(/integrity/);
        expect(() => runtime.decide({ ...source, stateHash: "0".repeat(16) })).toThrow(/source observation/);
      }
    } finally { environment.dispose(); }
  });

  it("distinguishes zero-valued support, missing/default and actual influence, and contains an overbudget decision", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      const state = environment.reset(scenario), variant = "return-features.v2", action = { type: "weapon", intent: "throw", phase: "pressed" } as const;
      const source = createTearC32CanonicalSourceObservation(state, TEAR_RETURN_PLAYING_MASK), fallback = vi.fn(() => [{ type: "move", x: -1000, y: 0 }] as const);
      const empty = createTearC34C32RuntimeModel([], variant), initial = selectTearC34C32RuntimeAction(empty, state, [action], TEAR_RETURN_PLAYING_MASK);
      if (initial?.stateKey === undefined) throw new Error("default decision missing");
      const zero = createTearC34C32RuntimeModel([{ stateHash: initial.stateKey, semanticActionHash: initial.semanticActionHash, actionHash: stableVerificationHash(initial.actions), value: 0 }], variant);
      expect(new TearC34ReturnModelRuntime(empty, [action], fallback, { now: () => 0 }).decide(source)).toMatchObject({ source: "model-default", support: { entryPresent: false, value: 0 } });
      expect(new TearC34ReturnModelRuntime(zero, [action], fallback, { now: () => 0 }).decide(source)).toMatchObject({ source: "diagnostic-model", actions: initial.actions, support: { entryPresent: true, value: 0 } });
      const alternate = initial.actions.length === 0 ? [action] : [];
      const influenced = createTearC34C32RuntimeModel([{ stateHash: initial.stateKey, semanticActionHash: stableVerificationHash(alternate), actionHash: stableVerificationHash(alternate), value: 1 }], variant);
      expect(new TearC34ReturnModelRuntime(influenced, [action], fallback, { now: () => 0 }).decide(source).actions).toEqual(alternate);
      let time = 0;
      expect(new TearC34ReturnModelRuntime(zero, [action], fallback, { now: () => { time += 9; return time; } }).decide(source))
        .toMatchObject({ source: "scripted-fallback", reason: "decision-budget-exceeded", decisionMilliseconds: 9, actions: [{ type: "move", x: -1000, y: 0 }] });
      expect(fallback).toHaveBeenCalledTimes(1);
      const mixed = { ...zero, sourceStateAdapter: { ...zero.sourceStateAdapter, id: tearReturnAdapter("return-exact.v2").id } };
      expect(() => parseTearC34C32RuntimeModel(mixed)).toThrow(/identity/);
    } finally { environment.dispose(); }
  });

  it("keeps complete nearest-threat feature ties independent of roster IDs/order and distinguishes geometry and masks", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      const state = environment.reset(scenario);
      if (state.player === null) throw new Error("missing source player");
      const enemy = { id: 1, kind: "rimehound", bossId: "", x: state.player.x + 64000, y: state.player.y, vx: 0, vy: 0, hp: 100000, dead: false,
        rimehound: { atk: "idle", atkT: 0, atkCd: 0, packRole: "", packFlank: 0, packLockT: 0, packAttackAuthorized: false,
          pounceTargetX: 0, pounceAirborne: false, auroraDirection: 0, auroraResponseT: 0, auroraPounceExtended: false } };
      // Constructed canonical tie: only the attack feature differs; no natural encounter claim.
      const a = { ...state, enemies: [enemy, { ...enemy, id: 2, rimehound: { ...enemy.rimehound, atk: "pounce" } }] };
      const b = { ...state, enemies: [{ ...a.enemies[1], id: 50 }, { ...a.enemies[0], id: 60 }] } as typeof state;
      expect(encodeTearReturnSourceState(a, "return-features.v2").stateHash).toBe(encodeTearReturnSourceState(b, "return-features.v2").stateHash);
      const farther = { ...state, enemies: [{ ...enemy, x: enemy.x + 96000 }] } as typeof state;
      expect(encodeTearReturnSourceState(a, "return-features.v2").stateHash).not.toBe(encodeTearReturnSourceState(farther, "return-features.v2").stateHash);
      expect(encodeTearReturnSourceState(a, "return-features.v2", ["move"]).stateHash).not.toBe(encodeTearReturnSourceState(a, "return-features.v2").stateHash);
    } finally { environment.dispose(); }
  });

  it("accepts actual production projectile facts for the new catch reward while retaining malformed-family refusal", () => {
    const events: TearGameplayEvent[] = [], bus = new TearGameplayEventBus(() => 1);
    bus.subscribe(event => { events.push(event); });
    const world = createProductionReplayWorld({ seed: "return-projectile-owner" });
    const core = createProductionCombatSimulation(world, { gameplayEvents: bus, snapshot: tick => ({ tick }) });
    world.world.state.setProjectiles([world.world.entities.createProjectile(100, 100, 1, 0)]);
    core.simulationRuntime.advanceOne([]);
    const fact = events.find(event => event.kind === "projectile" && event.event === "spawned");
    expect(fact).toBeDefined();
    if (fact === undefined) throw new Error("actual projectile producer missing");
    const dataset = { format: "tear-academy-training-dataset", schemaVersion: 1, observationCount: 0, actionCount: 0,
      manifest: { id: "return-validation", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) }, datasetHash: "e".repeat(16),
      sequences: [{ split: "training", candidateHash: "c".repeat(16), sequenceHash: "d".repeat(16), sourceScenario: scenario, lessonId: "return" }] } as unknown as TearAcademyTrainingDatasetV1;
    const plan = createTearOfflineRlPlan(dataset, { id: "catch-validation", version: 2, seed: 1,
      reward: { schemaVersion: 2, components: [{ id: "catch", source: "weapon.catch", weight: 1, maximumSourceValue: 1, perTransitionCap: 1 }], totalMinimum: 0, totalMaximum: 1 },
      limits: { maxTransitions: 300, maxEventsPerTransition: 64, maxRewardViolations: 0 } });
    const state = projectProductionReplayCanonicalState(world, core.authoritativeInput.snapshot().tick, core.authoritativeInput);
    expect(evaluateTearOfflineRlRewardTransition(plan, state, state, [fact]).total).toBe(0);
    expect(() => evaluateTearOfflineRlRewardTransition(plan, state, state, [{ ...fact, owner: ["enemy"] } as never])).toThrow(/native/);
  });
  it("preserves legacy exact keys and transfers only the explicit feature variant across identity/time/score", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      const state = environment.reset(scenario), other = structuredClone(state);
      if (state.run === null || other.run === null) throw new Error("missing production run");
      Object.assign(other.run, { seed: state.run.seed + 1, score: 99, time: 123 }); Object.assign(other, { tick: 42 });
      const action = { type: "weapon", intent: "throw", phase: "pressed" } as const;
      const model = createTearC34C32RuntimeModel([{ stateHash: encodeTearC34C32SourceState(state).stateHash,
        semanticActionHash: tearC34C32SemanticActionHash([action]), actionHash: "a".repeat(16), value: 1 }]);
      expect(selectTearC34C32RuntimeAction(model, other, [action], ["weapon"])?.source).toBe("fallback");
      const key = encodeTearReturnSourceState(state, "return-features.v2", ["weapon"]).stateHash;
      const feature = createTearC34C32RuntimeModel([{ stateHash: key, semanticActionHash: tearC34C32SemanticActionHash([action]), actionHash: "a".repeat(16), value: 1 }], "return-features.v2");
      expect(selectTearC34C32RuntimeAction(feature, other, [action], ["weapon"])).toMatchObject({ source: "q", entryPresent: true, value: 1, actions: [action] });
      expect(encodeTearReturnSourceState(state, "return-exact.v2").stateHash).not.toBe(encodeTearReturnSourceState(other, "return-exact.v2").stateHash);
    } finally { environment.dispose(); }
  });

  it("extracts actual native catch reward including the original empty catch transition", () => {
    const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
    try {
      const observations = [environment.reset(scenario)];
      let artifact: ProductionHeadlessTerminalArtifact | undefined;
      for (let tick = 1; tick <= 300; tick++) {
        const transition = environment.step(tick === 140 ? [{ type: "weapon", intent: "throw", phase: "pressed" }]
          : tick === 150 ? [{ type: "weapon", intent: "recall", phase: "pressed" }] : []);
        observations.push(transition.observation); artifact = transition.artifact as ProductionHeadlessTerminalArtifact | undefined;
      }
      if (artifact === undefined) throw new Error("missing actual terminal artifact");
      const tracks = environment.sourceTracks();
      expect(tracks.nativeEvents.some(event => event.kind === "weapon" && event.event === "catch" && event.tick === 159)).toBe(true);
      const dataset = { format: "tear-academy-training-dataset", schemaVersion: 1,
        manifest: { id: "source-owned-return", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) },
        sequences: [{ candidateHash: "c".repeat(16), split: "training", lessonId: "blade-return", segmentKind: "demonstration", tags: [], sourceScenario: scenario,
          tracks: { ...tracks, observations, actions: artifact.actions, terminal: artifact.terminal }, sequenceHash: "d".repeat(16) }], observationCount: 301, actionCount: 2, datasetHash: "e".repeat(16) } as unknown as TearAcademyTrainingDatasetV1;
      const reward = createTearOfflineRlPlan(dataset, { id: "actual-return", version: 2, seed: 7,
        reward: { schemaVersion: 2, components: [{ id: "catch", source: "weapon.catch", weight: 1, maximumSourceValue: 1, perTransitionCap: 1 }], totalMinimum: 0, totalMaximum: 1 },
        limits: { maxTransitions: 300, maxEventsPerTransition: 64, maxRewardViolations: 0 } });
      const receipt = extractTearOfflineRlTrajectories(dataset, reward);
      expect(receipt.trajectories.find(transition => transition.to.tick === 159)).toMatchObject({ actions: [], reward: { total: 1 } });
      expect(artifact.actions.map(action => action.tick)).toEqual([140, 150]);
      const vocabulary = [{ type: "weapon", intent: "throw", phase: "pressed" }, { type: "weapon", intent: "recall", phase: "pressed" }] as const;
      for (const variant of ["return-exact.v2", "return-features.v2"] as const) {
        const plan = createTearOfflineRlV3Plan(receipt, { id: `return-${variant}`, version: 2, variant, actionVocabulary: vocabulary,
          config: { epochs: 32, learningRate: 0.5, gamma: 0.99, maxStateActionEntries: 10000, maxAbsoluteQ: 100, maxMeanAbsoluteTdError: 100, maxConsecutiveDivergentEpochs: 2 } });
        const trained = completeTearOfflineRlV3Checkpoint(plan, receipt, advanceTearOfflineRlV3Checkpoint(plan, receipt, createTearOfflineRlV3Checkpoint(plan, receipt), 32));
        expect(trained.model?.entries.some(entry => entry.semanticActionHash === tearC34C32SemanticActionHash([]) && entry.value > 0)).toBe(true);
        expect(trained.model?.sourceStateAdapter).toEqual(tearReturnAdapter(variant));
        const beforeCatch = observations.find(state => state.tick === 158);
        if (beforeCatch === undefined || trained.model === undefined) throw new Error("missing native catch decision");
        expect(selectTearC34C32RuntimeAction(trained.model, beforeCatch, vocabulary, TEAR_RETURN_PLAYING_MASK)?.entryPresent).toBe(true);
      }
      expect(stableVerificationHash(artifact.actions)).toBe(stableVerificationHash(dataset.sequences[0]?.tracks.actions));
    } finally { environment.dispose(); }
  });
});
