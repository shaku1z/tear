import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  TearActivePolicyRuntime, TearPolicyArtifactRegistry, createTearPolicyArtifact,
  encodeTearPolicyObservation, TEAR_POLICY_FEATURE_SCHEMA_HASH_V1, TEAR_POLICY_FEATURE_WIDTH_V1,
} from "../../src/agents";
import type { TearAgentObservation } from "../../src/agents";

const compatibility = Object.freeze({ runtime: "tear-policy-runtime.v1" as const, observationClass: "structured-state" as const,
  actionSchema: "tear-game-action-command-envelope.v1" as const, modelFormats: Object.freeze(["table-policy-v1"]) });
const linearCompatibility = Object.freeze({ ...compatibility, modelFormats: Object.freeze(["linear-policy-v1"]) });
const temporalCompatibility = Object.freeze({ ...compatibility, modelFormats: Object.freeze(["temporal-window-linear-policy-v1"]) });

function observation(): TearAgentObservation {
  return { state: { format: "tear-contract", kind: "observation", schemaVersion: 1, tick: 8, observationClass: "structured-state",
    player: { x: 100, y: 700, vx: 0, vy: 0, hp: 80, maxHp: 100, facing: 1, grounded: true, dashCharges: 1 },
    blade: { handX: 100, handY: 690, tipX: 180, tipY: 690, vx: 0, vy: 0, tipSpeed: 0, state: "held" },
    entities: [], run: { mode: "campaign", difficulty: "easy", weapon: "sword", stage: "The Grounds", wave: 1, score: 0, elapsedTicks: 8 },
    availableActions: ["move", "jump", "dash", "aim", "weapon"], diagnostics: { waveComplete: false, livingWaveEnemies: 0, paused: false, ui: { focusableIds: [] }, progressTick: 8, softlockLimitTicks: 3600, lifecyclePhase: "active" },
  }, ui: { screen: "playing" } };
}

function artifact(feature: string, actions: unknown): ReturnType<typeof createTearPolicyArtifact> {
  return createTearPolicyArtifact({ id: "table-v1", createdAt: "2026-08-03T15:00:00.000Z",
    model: { format: "table-policy-v1", payload: JSON.stringify({ format: "tear-table-policy-model", schemaVersion: 1, actionsByObservationHash: { [feature]: actions } }) },
    encoder: { id: "tear-structured-state", schemaVersion: 1, observationClass: "structured-state", normalizationHash: "0123456789abcdef" }, actionSchema: "tear-game-action-command-envelope.v1",
    recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: "academy-release", version: 1, rootHash: "fedcba9876543210" }, rewardVersion: "tear-reward.v1",
    build: { version: "test", revision: "c32", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" }, metrics: { legalActionRate: 1 }, levelTarget: "class-a",
    lineage: { trainingRunId: "table-run" }, signature: { kind: "local-unsigned", keyId: "development" }, compatibility,
  });
}

describe("C32 active policy runtime", () => {
  it("loads the active table artifact, encodes structured observations, and emits canonical legal actions with a decision receipt", async () => {
    const input = observation(), registry = new TearPolicyArtifactRegistry(createMemoryGhostVaultBackend(), compatibility);
    const feature = encodeTearPolicyObservation(input);
    const stored = artifact(feature, [{ type: "move", x: 1_000, y: 0 }]);
    await registry.register(stored); await registry.activate(stored.id, "2026-08-03T15:01:00.000Z");
    const runtime = new TearActivePolicyRuntime(registry, "competent");
    await runtime.reset();
    const decision = runtime.decide(input);
    expect(decision.actions).toEqual([{ type: "move", x: 1_000, y: 0 }]);
    expect(decision.receipt).toMatchObject({ source: "artifact", artifactId: stored.id, observationHash: feature });
  });

  it("fails closed to the scripted policy for malformed model output without exposing illegal actions", async () => {
    const input = observation(), registry = new TearPolicyArtifactRegistry(createMemoryGhostVaultBackend(), compatibility);
    const stored = artifact(encodeTearPolicyObservation(input), [{ type: "move", x: Number.NaN, y: 0 }]);
    await registry.register(stored); await registry.activate(stored.id, "2026-08-03T15:01:00.000Z");
    const runtime = new TearActivePolicyRuntime(registry, "competent");
    await runtime.reset();
    const decision = runtime.decide(input);
    expect(decision.receipt.source).toBe("scripted-fallback");
    expect(decision.receipt.reason).toMatch(/invalid-action/u);
    expect(decision.actions.every((action) => action.type !== "move" || Number.isFinite(action.x))).toBe(true);
  });

  it("contains table-runtime work with static bounds and an elapsed decision budget before falling back", async () => {
    const input = observation(), registry = new TearPolicyArtifactRegistry(createMemoryGhostVaultBackend(), compatibility);
    const stored = artifact("*", [{ type: "move", x: 1_000, y: 0 }]);
    await registry.register(stored); await registry.activate(stored.id, "2026-08-03T15:01:00.000Z");
    let clock = 0;
    const timed = new TearActivePolicyRuntime(registry, "competent", {
      limits: { maxDecisionMilliseconds: 0 }, now: () => { clock += 1; return clock; },
    });
    await timed.reset();
    expect(timed.decide(input).receipt).toMatchObject({ source: "scripted-fallback", reason: "decision-budget-exceeded" });

    const payloadBounded = new TearActivePolicyRuntime(registry, "competent", { limits: { maxPayloadBytes: 1 } });
    await payloadBounded.reset();
    expect(payloadBounded.decide(input).receipt).toMatchObject({ source: "scripted-fallback", reason: "invalid-model" });

    expect(() => new TearActivePolicyRuntime(registry, "competent", { limits: { maxTableEntries: 0 } }))
      .toThrow(/invalid policy runtime limits/u);
  });

  it("executes a bounded trained-linear policy against the same live structured feature contract", async () => {
    const input = observation(), registry = new TearPolicyArtifactRegistry(createMemoryGhostVaultBackend(), linearCompatibility);
    const template = artifact("*", []);
    const stored = createTearPolicyArtifact({ ...template, id: "linear-v1", compatibility: linearCompatibility,
      model: { format: "linear-policy-v1", payload: JSON.stringify({ format: "tear-linear-policy-model", schemaVersion: 1,
        featureSchemaHash: TEAR_POLICY_FEATURE_SCHEMA_HASH_V1, mean: Array(TEAR_POLICY_FEATURE_WIDTH_V1).fill(0),
        scale: Array(TEAR_POLICY_FEATURE_WIDTH_V1).fill(1), classes: [{ actions: [{ type: "move", x: 1_000, y: 0 }] }],
        weights: [Array(TEAR_POLICY_FEATURE_WIDTH_V1).fill(0)], biases: [0] }) },
    });
    await registry.register(stored); await registry.activate(stored.id, "2026-08-03T15:01:00.000Z");
    const runtime = new TearActivePolicyRuntime(registry, "competent");
    await runtime.reset();
    expect(runtime.decide(input).receipt).toMatchObject({ source: "artifact", artifactId: "linear-v1" });
    expect(runtime.decide(input).actions).toEqual([{ type: "move", x: 1_000, y: 0 }]);
  });

  it("executes a bounded causal temporal-window artifact without a second simulation host", async () => {
    const first = observation(), second: TearAgentObservation = Object.freeze({ ...observation(), state: Object.freeze({ ...observation().state, tick: first.state.tick + 1 }) });
    const registry = new TearPolicyArtifactRegistry(createMemoryGhostVaultBackend(), temporalCompatibility);
    const template = artifact("*", []);
    const width = TEAR_POLICY_FEATURE_WIDTH_V1;
    const temporalWeights = Array<number>(width * 2).fill(0); temporalWeights[0] = 1;
    const stored = createTearPolicyArtifact({ ...template, id: "temporal-v1", compatibility: temporalCompatibility,
      model: { format: "temporal-window-linear-policy-v1", payload: JSON.stringify({ format: "tear-temporal-window-linear-policy-model", schemaVersion: 1,
        featureSchemaHash: TEAR_POLICY_FEATURE_SCHEMA_HASH_V1, window: 2, mean: Array(width).fill(0), scale: Array(width).fill(1),
        classes: [{ actions: [{ type: "move", x: 1_000, y: 0 }] }, { actions: [{ type: "jump", phase: "pressed" }] }],
        weights: [Array<number>(width * 2).fill(0), temporalWeights], biases: [0, 0] }) },
    });
    await registry.register(stored); await registry.activate(stored.id, "2026-08-03T15:01:00.000Z");
    const runtime = new TearActivePolicyRuntime(registry, "competent"); await runtime.reset();
    expect(runtime.decide(first).actions).toEqual([{ type: "move", x: 1_000, y: 0 }]);
    expect(runtime.decide(second).actions).toEqual([{ type: "jump", phase: "pressed" }]);
    await runtime.reset();
    expect(runtime.decide(first).actions).toEqual([{ type: "move", x: 1_000, y: 0 }]);
  });
});
