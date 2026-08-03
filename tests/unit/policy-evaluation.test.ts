import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  TearPolicyArtifactRegistry,
  createTearPolicyArtifact,
  encodeTearPolicyObservation,
  evaluateActiveTearPolicy,
  type TearAgentObservation,
  type TearPolicyEvaluationSuiteV1,
} from "../../src/agents";

const compatibility = Object.freeze({ runtime: "tear-policy-runtime.v1" as const, observationClass: "structured-state" as const,
  actionSchema: "tear-game-action-command-envelope.v1" as const, modelFormats: Object.freeze(["table-policy-v1"]) });
const scenario = Object.freeze({
  format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c32-fixed-opening", version: 1,
  description: "Fixed structured opening for policy decision conformance", stateClass: "recorded-canonical", executionClass: "engineering",
  seed: "c32-fixed-seed", start: Object.freeze({ mode: "campaign", difficulty: "easy", weapon: "sword" }),
  maxTicks: 16, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c32", "evaluation"] as const),
});

function observation(tick: number): TearAgentObservation {
  return { state: { format: "tear-contract", kind: "observation", schemaVersion: 1, tick, observationClass: "structured-state",
    player: { x: 100, y: 700, vx: 0, vy: 0, hp: 80, maxHp: 100, facing: 1, grounded: true, dashCharges: 1 },
    blade: { handX: 100, handY: 690, tipX: 180, tipY: 690, vx: 0, vy: 0, tipSpeed: 0, state: "held" }, entities: [],
    run: { mode: "campaign", difficulty: "easy", weapon: "sword", stage: "The Grounds", wave: 1, score: 0, elapsedTicks: tick },
    availableActions: ["move", "jump", "dash", "aim", "weapon"], diagnostics: { waveComplete: false, livingWaveEnemies: 0, paused: false,
      ui: { focusableIds: [] }, progressTick: tick, softlockLimitTicks: 3600, lifecyclePhase: "active" },
  }, ui: { screen: "playing" } };
}

function suite(expectedHash: string): TearPolicyEvaluationSuiteV1 {
  const first = observation(8), second = observation(9);
  return Object.freeze({ format: "tear-policy-evaluation-suite", schemaVersion: 1, id: "c32-fixed-suite", cases: Object.freeze([
    Object.freeze({ id: "opening", scenario, observations: Object.freeze([first, second]), expected: Object.freeze([
      Object.freeze({ source: "artifact" as const, actionHash: expectedHash }), Object.freeze({ source: "artifact" as const, actionHash: expectedHash }),
    ]) }),
  ]) });
}

async function registry(): Promise<TearPolicyArtifactRegistry> {
  const value = new TearPolicyArtifactRegistry(createMemoryGhostVaultBackend(), compatibility);
  const payload = JSON.stringify({ format: "tear-table-policy-model", schemaVersion: 1,
    actionsByObservationHash: { "*": [{ type: "move", x: 1_000, y: 0 }] } });
  const artifact = createTearPolicyArtifact({ id: "evaluation-table", createdAt: "2026-08-03T17:00:00.000Z",
    model: { format: "table-policy-v1", payload }, encoder: { id: "tear-structured-state", schemaVersion: 1,
      observationClass: "structured-state", normalizationHash: "0123456789abcdef" }, actionSchema: "tear-game-action-command-envelope.v1",
    recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: "evaluation-manifest", version: 1, rootHash: "fedcba9876543210" },
    rewardVersion: "tear-reward.v1", build: { version: "test", revision: "c32", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" },
    metrics: { legalActionRate: 1 }, levelTarget: "class-a", lineage: { trainingRunId: "evaluation-run" },
    signature: { kind: "local-unsigned", keyId: "development" }, compatibility,
  });
  await value.register(artifact); await value.activate(artifact.id, "2026-08-03T17:01:00.000Z");
  return value;
}

describe("C32 policy evaluation", () => {
  it("reproduces a hash-bound active artifact decision-conformance report over a fixed scenario suite", async () => {
    const actionHash = stableVerificationHash([{ type: "move", x: 1_000, y: 0 }]), value = await registry();
    const first = await evaluateActiveTearPolicy(value, suite(actionHash));
    const second = await evaluateActiveTearPolicy(value, suite(actionHash));
    expect(first).toEqual(second);
    expect(first).toMatchObject({ format: "tear-policy-evaluation-report", passed: true,
      metrics: { decisions: 2, artifactDecisions: 2, fallbackDecisions: 0, matchedDecisions: 2 } });
    expect(first.results[0]?.decisions.map((decision) => decision.observationHash)).toEqual([
      encodeTearPolicyObservation(observation(8)), encodeTearPolicyObservation(observation(9)),
    ]);
  });

  it("returns a reproducible failed report when the frozen expected action does not match", async () => {
    const value = await registry();
    const report = await evaluateActiveTearPolicy(value, suite("0000000000000000"));
    expect(report.passed).toBe(false);
    expect(report.results[0]?.decisions[0]).toMatchObject({ source: "artifact", matched: false });
  });
});
