import { describe, expect, it, vi } from "vitest";
import type { CanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  createProductionHeadlessEnvironment,
  type ProductionHeadlessTerminalArtifact,
  type TearScenarioV1,
} from "../../src/tearbench";
import {
  advanceFactorizedReturnContext,
  beginFactorizedReturnContext,
  parseFactorizedReturnContext,
  projectFactorizedReturnFeatures,
  restoreFactorizedReturnPrefix,
  type FactorizedReturnTransition,
} from "../../src/agents/c34-causal-action-features";
import {
  advanceFactorizedQModel,
  createFactorizedQModel,
  DEFAULT_FACTORIZED_Q_CONFIG,
  parseFactorizedQModel,
  prepareFactorizedQSelector,
  type FactorizedQSample,
} from "../../src/agents/c34-factorized-action-q";
import { encodeTearReturnSourceState } from "../../src/agents/c34-source-feature-state";
import { FactorizedReturnPolicyRuntime } from "../../src/agents/c34-factorized-policy-runtime";
import { materializeFactorizedOrigin, measureFactorizedReturnGoal } from "../../src/agents/c34-factorized-online";
import {
  createFactorizedOfflinePlan,
  createFactorizedOfflineCheckpoint,
  advanceFactorizedOfflineCheckpoint,
  completeFactorizedOfflineCheckpoint,
} from "../../src/agents/c34-factorized-training";
import { createTearOfflineRlPlan, extractTearOfflineRlTrajectories } from "../../src/agents/offline-rl-training";
import type { TearAcademyTrainingDatasetV1 } from "../../src/agents/academy-training-dataset";
import {
  createFactorizedOnlinePlan,
  createFactorizedOnlineCheckpoint,
  advanceFactorizedOnlineCheckpoint,
  evaluateFactorizedOnlineInSource,
} from "../../src/agents/c34-factorized-online";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  createFactorizedPolicyCandidate,
  FactorizedPolicyCandidateRegistry,
  FACTORIZED_POLICY_COMPATIBILITY,
} from "../../src/agents/c34-factorized-policy-runtime";
import { FACTORIZED_RETURN_ADAPTER } from "../../src/agents/c34-causal-action-features";
import { TearPolicyArtifactRegistry } from "../../src/agents/policy-artifact-registry";
import { TearC32CanonicalActivePolicyRuntime } from "../../src/agents/c32-canonical-active-policy-runtime";
import { TearPolicyDecisionJournal } from "../../src/agents/policy-decision-journal";
import * as ghost from "../../src/ghost";
import { createBrowserActivePolicyRuntime } from "../../src/agents/browser-active-policy-runtime";
import * as production from "../../src/tearbench/production-headless-environment";

const scenario: TearScenarioV1 = {
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: "factorized-native-unit",
  version: 1,
  description: "Bounded native implementation fixture, not governed training or quality evidence",
  stateClass: "recorded-canonical",
  executionClass: "engineering",
  seed: "r14-return-train-01",
  start: { mode: "endless", difficulty: "normal", weapon: "sword" },
  maxTicks: 180,
  assertions: ["runtime.finite-state"],
  tags: ["unit"],
};
const launch = { type: "weapon", intent: "throw", phase: "pressed" } as const;
const recall = { type: "weapon", intent: "recall", phase: "pressed" } as const;
const vocabulary = [launch, recall],
  mask = ["aim", "move", "weapon"] as const;
let retained: ReturnType<typeof capture> | undefined;
function capture() {
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
  try {
    const anchor = environment.reset(scenario);
    let from = anchor,
      context = beginFactorizedReturnContext(anchor);
    const rows: FactorizedReturnTransition[] = [],
      features = [projectFactorizedReturnFeatures(from, context)],
      contexts = [context];
    for (let tick = 1; tick <= scenario.maxTicks; tick++) {
      const actions = tick === 140 ? [launch] : tick === 150 ? [recall] : [];
      const result = environment.step(actions),
        to = result.observation;
      const events = environment.sourceTracks().nativeEvents.filter((event) => event.tick === tick);
      const row = { from, to, actions, events };
      context = advanceFactorizedReturnContext(context, row);
      rows.push(row);
      contexts.push(context);
      features.push(projectFactorizedReturnFeatures(to, context));
      from = to;
    }
    return { anchor, rows, features, contexts };
  } finally {
    environment.dispose();
  }
}
function defined<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("native fixture value missing");
  return value;
}
function source() {
  return (retained ??= capture());
}
function reseal<T extends object>(value: T, key: keyof T) {
  const { [key]: old, ...draft } = value;
  void old;
  return { ...draft, [key]: stableVerificationHash(draft) } as T;
}

describe("explicit factorized V4 return protocol", () => {
  it("separates the real held-pose alias and transfers learned motor terms across the old joint threat miss", () => {
    const { rows, features } = source(),
      before = defined(rows[138]).from,
      after = defined(rows[139]).from;
    expect(encodeTearReturnSourceState(before, "return-features.v3").stateHash).toBe(
      encodeTearReturnSourceState(after, "return-features.v3").stateHash,
    );
    expect(defined(features[138]).motor).not.toEqual(defined(features[139]).motor);
    const changed = structuredClone(after),
      enemy = changed.enemies[0];
    expect(enemy).toBeDefined();
    Object.assign(defined(enemy), { x: defined(enemy).x + 64_000 });
    expect(encodeTearReturnSourceState(changed, "return-features.v3").stateHash).not.toBe(
      encodeTearReturnSourceState(after, "return-features.v3").stateHash,
    );
    const newContext = reseal(
      { ...defined(source().contexts[139]), frontier: stableVerificationHash(changed) },
      "contextHash",
    );
    const transferred = projectFactorizedReturnFeatures(changed, newContext);
    expect(transferred.motor).toEqual(defined(features[139]).motor);
    expect(transferred.threat).not.toEqual(defined(features[139]).threat);
    const rime = {
      atk: "idle",
      atkT: 0,
      atkCd: 0,
      packRole: "solo",
      packFlank: 0,
      packLockT: 0,
      packAttackAuthorized: false,
      pounceTargetX: 0,
      pounceAirborne: false,
      auroraDirection: 0,
      auroraResponseT: 0,
      auroraPounceExtended: false,
    };
    const a = {
      ...after,
      enemies: [
        { ...defined(enemy), id: 1, kind: "rimehound", rimehound: rime },
        { ...defined(enemy), id: 2, kind: "rimehound", rimehound: { ...rime, atk: "windup" } },
      ],
    };
    const b = { ...a, enemies: [...a.enemies].reverse() };
    const tied = [a, b].map((state) =>
      projectFactorizedReturnFeatures(
        state,
        reseal({ ...defined(source().contexts[139]), frontier: stableVerificationHash(state) }, "contextHash"),
      ),
    );
    expect(tied[0]).toEqual(tied[1]);
    // A small supervised value-head fixture tests motor discrimination, not governed TD quality.
    let model = createFactorizedQModel(
      "a".repeat(16),
      { ...DEFAULT_FACTORIZED_Q_CONFIG, gamma: 0, linearScale: 0 },
      [defined(features[138]), defined(features[139])],
      vocabulary,
    );
    const samples = [138, 139].flatMap((index) =>
      [[], [launch], [recall]].map((actions) => ({
        from: defined(features[index]),
        to: defined(features[index]),
        actions,
        available: mask,
        nextAvailable: mask,
        reward: Number(index === 138 ? actions.length === 0 : actions[0]?.intent === "throw"),
        terminal: true,
      })),
    );
    for (let epoch = 0; epoch < 80; epoch++) model = advanceFactorizedQModel(model, samples).model;
    const select = prepareFactorizedQSelector(model);
    expect(select(defined(features[138]), mask)?.actions).toEqual([]);
    expect(select(defined(features[139]), mask)?.actions).toEqual([launch]);
    expect(select(transferred, mask)).toMatchObject({ actions: [launch], support: { kind: "observed-motor" } });
    expect(select(defined(tied[0]), mask)).toEqual(select(defined(tied[1]), mask));
    const nearby = { ...transferred, motor: transferred.motor.map((v, i) => (i === 8 ? v + 0.000001 : v)) };
    expect(select(nearby, mask)?.support.kind).toBe("generalized");
    expect(select(transferred, ["draft-choice"])).toBeUndefined();
  });

  it("requires real ordered effects and an authenticated frontier instead of resetting recovery memory", () => {
    const { anchor, rows, contexts } = source(),
      prefix = rows.slice(0, 145),
      body = { anchor, transitions: prefix };
    expect(restoreFactorizedReturnPrefix(anchor, prefix, stableVerificationHash(body))).toEqual(contexts[145]);
    expect(contexts[145]).toMatchObject({ effect: "throw", effectAt: 140, request: "throw", requestAt: 140 });
    expect(() => beginFactorizedReturnContext(defined(rows[145]).from)).toThrow(/authenticated/);
    expect(() => restoreFactorizedReturnPrefix(anchor, prefix, "0".repeat(16))).toThrow(/authority/);
    expect(() => advanceFactorizedReturnContext(defined(contexts[144]), defined(rows[146]))).toThrow(/frontier/);
    expect(() =>
      advanceFactorizedReturnContext(defined(contexts[139]), {
        ...defined(rows[139]),
        events: [{ kind: "weapon", event: "catch", tick: 141, throwId: 1, weaponId: "sword", x: 0, y: 0 }],
      }),
    ).toThrow(/frontier/);
    expect(() =>
      parseFactorizedReturnContext(reseal({ ...defined(contexts[145]), effect: ["throw"] } as never, "contextHash")),
    ).toThrow();
    const noIds = structuredClone(defined(rows[139]).from);
    Object.assign(noIds, { tick: 1_000 });
    Object.assign(defined(noIds.run), { seed: 123, time: 555 });
    const fresh = beginFactorizedReturnContext(anchor),
      renamed = structuredClone(anchor);
    Object.assign(defined(renamed.run), { seed: 123 });
    expect(projectFactorizedReturnFeatures(anchor, fresh)).toEqual(
      projectFactorizedReturnFeatures(renamed, beginFactorizedReturnContext(renamed)),
    );
  });

  it("runs a bounded native candidate at fresh and actual145 origins with the unchanged accepted-recall goal", () => {
    const { anchor, rows, features } = source();
    // Diagnostic conformance fit only: all action heads receive declared label targets from this unit's real input trace.
    // It is deliberately separate from production reward/TD fitting, governed sources and quality verdicts.
    let model = createFactorizedQModel(
      "b".repeat(16),
      { ...DEFAULT_FACTORIZED_Q_CONFIG, gamma: 0, linearScale: 0 },
      features.slice(0, 170),
      vocabulary,
    );
    const samples: FactorizedQSample[] = rows.slice(0, 170).flatMap((row, index) =>
      [[], [launch], [recall]].map((actions) => ({
        from: defined(features[index]),
        to: defined(features[index + 1]),
        actions,
        available: mask,
        nextAvailable: mask,
        reward: stableVerificationHash(actions) === stableVerificationHash(row.actions) ? 1 : -1,
        terminal: true,
      })),
    );
    for (let epoch = 0; epoch < 80; epoch++) model = advanceFactorizedQModel(model, samples).model;
    for (const origin of [0, 145]) {
      const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
      try {
        const prefix = rows.slice(0, origin),
          entry = {
            scenario,
            ...(origin === 0
              ? {}
              : {
                  prefix: {
                    anchor,
                    transitions: prefix,
                    prefixHash: stableVerificationHash({ anchor, transitions: prefix }),
                  },
                }),
          };
        let { state } = materializeFactorizedOrigin(environment, entry),
          runtime = new FactorizedReturnPolicyRuntime(model, { now: () => 0 });
        const runId = `native-unit-${String(origin)}`;
        if (origin === 0) runtime.begin(state, runId);
        else
          runtime.restorePrefix(state, runId, anchor, prefix, stableVerificationHash({ anchor, transitions: prefix }));
        const prefixEvents = [...environment.sourceTracks().nativeEvents],
          actual: FactorizedReturnTransition[] = [];
        while (state.tick < 180) {
          const decision = runtime.decide(state, mask);
          expect(decision.source).toBe("artifact");
          expect(decision.selection?.support.kind).toBeDefined();
          const step = environment.step(decision.actions),
            to = step.observation,
            events = environment.sourceTracks().nativeEvents.filter((event) => event.tick === to.tick);
          const committed = { from: state, to, actions: decision.actions, events };
          actual.push(committed);
          runtime.observeCommitted(committed, runId);
          state = to;
          if (state.tick === origin + 3) {
            const saved = runtime.captureContext(),
              restored = new FactorizedReturnPolicyRuntime(model, { now: () => 0 });
            expect(restored.decide(state, mask)).toMatchObject({ source: "refused", reason: "missing-causal-context" });
            expect(() => {
              restored.restoreContext(state, saved, { expectedCheckpointHash: "0".repeat(16), runId });
            }).toThrow(/authority/);
            restored.restoreContext(state, saved, { expectedCheckpointHash: saved.checkpointHash, runId });
            expect(restored.decide(state, mask)).toEqual(runtime.decide(state, mask));
            runtime = restored;
          }
        }
        expect(measureFactorizedReturnGoal(actual, prefixEvents).success).toBe(true);
      } finally {
        environment.dispose();
      }
    }
    const mutable = structuredClone(model);
    Object.assign(mutable, { modelHash: "0".repeat(16) });
    expect(() => parseFactorizedQModel(mutable)).toThrow(/integrity/);
    const timeout = new FactorizedReturnPolicyRuntime(model, {
      now: (() => {
        let n = 0;
        return () => n++ * 100;
      })(),
    });
    timeout.begin(anchor, "native-unit-timeout");
    expect(timeout.decide(anchor, mask)).toMatchObject({
      source: "refused",
      reason: "decision-budget-exceeded",
      actions: [],
    });
  }, 30_000);

  it("keeps source TD fit, online resume, inactive candidate admission and explicit journal refusals coherent", async () => {
    const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
    try {
      const short = { ...scenario, id: "factorized-online-unit", maxTicks: 3 },
        initial = environment.reset(short),
        states: CanonicalGameplayState[] = [initial];
      let terminal: ProductionHeadlessTerminalArtifact | undefined;
      for (let tick = 0; tick < 3; tick++) {
        const step = environment.step([]);
        states.push(step.observation);
        terminal = step.artifact as ProductionHeadlessTerminalArtifact | undefined;
      }
      expect(terminal).toBeDefined();
      const tracks = environment.sourceTracks();
      const dataset = {
        format: "tear-academy-training-dataset",
        schemaVersion: 1,
        manifest: { id: "factorized-unit", version: 1, manifestHash: "a".repeat(16), rootHash: "b".repeat(16) },
        sequences: [
          {
            candidateHash: "c".repeat(16),
            split: "training",
            lessonId: "blade-control",
            segmentKind: "demonstration",
            tags: [],
            sourceScenario: short,
            tracks: { ...tracks, observations: states, actions: [], terminal: defined(terminal).terminal },
            sequenceHash: "d".repeat(16),
          },
        ],
        observationCount: 4,
        actionCount: 0,
        datasetHash: "e".repeat(16),
      } as unknown as TearAcademyTrainingDatasetV1;
      const reward = createTearOfflineRlPlan(dataset, {
        id: "factorized-unit",
        version: 2,
        seed: 7,
        reward: {
          schemaVersion: 2,
          components: [{ id: "catch", source: "weapon.catch", weight: 1, maximumSourceValue: 1, perTransitionCap: 1 }],
          totalMinimum: 0,
          totalMaximum: 1,
        },
        limits: { maxTransitions: 3, maxEventsPerTransition: 64, maxRewardViolations: 0 },
      });
      const receipt = extractTearOfflineRlTrajectories(dataset, reward),
        offline = createFactorizedOfflinePlan(receipt, {
          id: "unit",
          actionVocabulary: vocabulary,
          config: DEFAULT_FACTORIZED_Q_CONFIG,
          epochs: 1,
          maxMeanError: 100,
        });
      const trained = completeFactorizedOfflineCheckpoint(
        offline,
        advanceFactorizedOfflineCheckpoint(offline, receipt, createFactorizedOfflineCheckpoint(offline, receipt), 1),
      );
      const online = createFactorizedOnlinePlan(offline, trained, reward, {
        id: "unit",
        cases: [{ scenario: short }],
        maxUpdates: 3,
        maxTicksPerCase: 3,
      });
      const start = createFactorizedOnlineCheckpoint(online, trained),
        paused = advanceFactorizedOnlineCheckpoint(online, offline, trained, reward, start, { maxTicks: 1 });
      expect(paused).toMatchObject({ status: "running", ticks: 1, resume: { context: { tick: 1 } } });
      const resumed = advanceFactorizedOnlineCheckpoint(online, offline, trained, reward, paused),
        uninterrupted = advanceFactorizedOnlineCheckpoint(online, offline, trained, reward, start);
      expect(resumed).toEqual(uninterrupted);
      expect(resumed.status).toBe("complete");
      const foreign = createProductionHeadlessEnvironment({ captureSourceTracks: true });
      try {
        const from = foreign.reset({ ...short, id: "foreign-unit-case", seed: "foreign-unit-seed" }),
          to = foreign.step([]).observation;
        const contextB = advanceFactorizedReturnContext(beginFactorizedReturnContext(from), {
          from,
          to,
          actions: [],
          events: foreign.sourceTracks().nativeEvents.filter((event) => event.tick === to.tick),
        });
        const swapped = reseal(
          { ...paused, resume: { ...defined(paused.resume), world: foreign.captureCheckpoint(), context: contextB } },
          "checkpointHash",
        );
        const actualFactory = production.createProductionHeadlessEnvironment,
          restoredForeign = vi.fn();
        const create = vi.spyOn(production, "createProductionHeadlessEnvironment").mockImplementation((options) => {
          const owned = actualFactory(options);
          return {
            ...owned,
            restoreCheckpoint: (checkpoint) => {
              restoredForeign();
              return owned.restoreCheckpoint(checkpoint);
            },
          };
        });
        try {
          expect(() => advanceFactorizedOnlineCheckpoint(online, offline, trained, reward, swapped)).toThrow(
            /case|scenario|origin/,
          );
          expect(restoredForeign).not.toHaveBeenCalled();
        } finally {
          create.mockRestore();
        }
      } finally {
        foreign.dispose();
      }
      const first = defined(receipt.trajectories[0]),
        prefix = [{ from: first.from, to: first.to, actions: [], events: first.nativeEvents }];
      const cases = [
        { scenario: short },
        {
          scenario: short,
          prefix: {
            anchor: initial,
            transitions: prefix,
            prefixHash: stableVerificationHash({ anchor: initial, transitions: prefix }),
          },
        },
      ];
      const evaluation = evaluateFactorizedOnlineInSource(online, offline, trained, reward, resumed, cases, 0);
      expect(evaluation.traces.map((t) => t.originTick)).toEqual([0, 1, 0, 1]);
      expect(evaluation.traces.every((t) => !t.refused)).toBe(true);
      const candidate = createFactorizedPolicyCandidate(offline, trained, online, resumed, evaluation, {
        id: "factorized-unit",
        createdAt: "2026-10-20T00:00:00.000Z",
        encoder: {
          id: FACTORIZED_RETURN_ADAPTER.id,
          schemaVersion: 4,
          observationClass: "structured-state",
          normalizationHash: FACTORIZED_RETURN_ADAPTER.adapterHash,
        },
        actionSchema: "tear-game-action-command-envelope.v1",
        recurrentState: { kind: "none", schemaVersion: 1 },
        trainingManifest: { id: "unit-only", version: 1, rootHash: "2".repeat(16) },
        rewardVersion: reward.reward.rewardHash,
        build: {
          version: "unit",
          revision: "unit",
          target: "unit",
          rulesetVersion: "unit",
          contentHash: "unit",
          configHash: "unit",
        },
        metrics: { unit: 1 },
        levelTarget: "class-a",
        lineage: { trainingRunId: trained.trainingHash },
        signature: { kind: "local-unsigned", keyId: "unit-only" },
      });
      const backend = createMemoryGhostVaultBackend(),
        candidates = new FactorizedPolicyCandidateRegistry(backend),
        registry = new TearPolicyArtifactRegistry(backend, FACTORIZED_POLICY_COMPATIBILITY);
      await candidates.register(candidate);
      expect(await registry.active()).toBeUndefined();
      // Explicit unit authority, never automatic activation by fitting/registry.
      await registry.activate(candidate.id, "2026-10-20T00:01:00.000Z");
      const open = vi.spyOn(ghost, "createIndexedDbGhostVaultBackend").mockResolvedValue(backend);
      try {
        const composition = defined(await createBrowserActivePolicyRuntime({} as IDBFactory));
        expect(composition.runtime).toBeUndefined();
        expect(composition.postPromotionMonitor).toBeUndefined();
        expect(composition.canonicalRuntime?.requiresCausalContext).toBe(true);
        expect(composition.canonicalRuntime?.decide(initial, mask)).toMatchObject({
          source: "refused",
          factorizedVersion: 4,
        });
      } finally {
        open.mockRestore();
      }
      const active = new TearC32CanonicalActivePolicyRuntime(
        backend,
        () => {
          throw new Error("V4 must never fall back");
        },
        true,
        { now: () => 0 },
      );
      await active.reset();
      expect(active.decide(initial, mask)).toMatchObject({ source: "refused", factorizedVersion: 4 });
      active.beginCausalOrigin(initial, "unit-run");
      const accepted = active.decide(initial, mask);
      expect(accepted).toMatchObject({
        source: "artifact",
        actions: [],
        factorizedVersion: 4,
        factorizedSupport: { kind: "observed-motor" },
      });
      active.observeCommitted(
        { from: initial, to: defined(states[1]), actions: [], events: receipt.trajectories[0]?.nativeEvents ?? [] },
        "unit-run",
      );
      const context = defined(active.captureCausalContext()),
        restored = new TearC32CanonicalActivePolicyRuntime(backend, () => [], true, { now: () => 0 });
      await restored.reset();
      restored.restoreCausalContext(defined(states[1]), context, {
        expectedCheckpointHash: context.checkpointHash,
        runId: "unit-run",
      });
      expect(restored.decide(defined(states[1]), mask)).toEqual(active.decide(defined(states[1]), mask));
      let clock = 0;
      const slow = new TearC32CanonicalActivePolicyRuntime(
        backend,
        () => {
          throw new Error("no timeout fallback");
        },
        true,
        { now: () => clock++ * 100 },
      );
      await slow.reset();
      slow.beginCausalOrigin(initial, "unit-run");
      const refused = slow.decide(initial, mask);
      expect(refused).toMatchObject({
        source: "refused",
        reason: "decision-budget-exceeded",
        actions: [],
        factorizedVersion: 4,
      });
      const journal = new TearPolicyDecisionJournal(backend);
      journal.begin("factorized-unit");
      const toReceipt = (decision: typeof accepted) => {
        const { actions, stateHash, ...receipt } = decision;
        void actions;
        return { ...receipt, observationHash: stateHash };
      };
      const trace = {
        tick: 0,
        profile: "competent",
        objective: "recover",
        maneuver: "recall",
        confidence: 0,
        recovery: false,
        observationClass: "structured-state",
        critic: [],
      } as const;
      journal.append({ tick: 0, receipt: toReceipt(accepted), actions: accepted.actions, trace });
      journal.append({ tick: 0, receipt: toReceipt(refused), actions: [], trace });
      await journal.flush();
      const saved = defined(await journal.read("factorized-unit"));
      expect(saved.entries).toHaveLength(2);
      expect(saved.entries[1]?.receipt.decisionMilliseconds).toBeGreaterThan(8);
      expect(Object.isFrozen(saved.entries[0]?.receipt.factorizedSupport)).toBe(true);
      expect(() => {
        journal.append({
          tick: 0,
          receipt: {
            ...toReceipt(accepted),
            factorizedSupport: { kind: "generalized", motorResponse: -1, threatResponse: 1, headUpdates: 1 },
          },
          actions: [],
          trace,
        });
      }).toThrow(/support/);
      const wrong = structuredClone(paused);
      Object.assign(defined(wrong.resume).context, { tick: 0 });
      expect(() =>
        advanceFactorizedOnlineCheckpoint(online, offline, trained, reward, reseal(wrong, "checkpointHash")),
      ).toThrow(/context|frontier/);
      const badBasis = structuredClone(createFactorizedOfflineCheckpoint(offline, receipt));
      (badBasis.model.basis.motor.mean as number[])[0] = 999;
      Object.assign(badBasis, { model: reseal(badBasis.model, "modelHash") });
      expect(() => advanceFactorizedOfflineCheckpoint(offline, receipt, reseal(badBasis, "checkpointHash"), 1)).toThrow(
        /changed/,
      );
    } finally {
      environment.dispose();
    }
  });
});
