import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  TearPolicyArtifactRegistry, TearProductionPolicyEvaluationVault, createTearPolicyArtifact, evaluateActiveTearPolicyInProduction,
} from "../../src/agents";
import type { TearScenarioV1 } from "../../src/tearbench";

const compatibility = Object.freeze({ runtime: "tear-policy-runtime.v1" as const, observationClass: "structured-state" as const,
  actionSchema: "tear-game-action-command-envelope.v1" as const, modelFormats: Object.freeze(["table-policy-v1"]) });
const scenario = Object.freeze({ format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c32-production-policy", version: 1,
  description: "Source-owned C32 production policy evaluation", stateClass: "recorded-canonical", executionClass: "training",
  seed: "c32-production-policy-seed", start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
  maxTicks: 12, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c32", "production-evaluation"] as const),
}) satisfies TearScenarioV1;

async function registry(): Promise<TearPolicyArtifactRegistry> {
  const value = new TearPolicyArtifactRegistry(createMemoryGhostVaultBackend(), compatibility);
  const artifact = createTearPolicyArtifact({ id: "production-policy", createdAt: "2026-08-03T18:00:00.000Z",
    model: { format: "table-policy-v1", payload: JSON.stringify({ format: "tear-table-policy-model", schemaVersion: 1,
      actionsByObservationHash: { "*": [{ type: "move", x: 1_000, y: 0 }] } }) },
    encoder: { id: "tear-structured-state", schemaVersion: 1, observationClass: "structured-state", normalizationHash: "0123456789abcdef" },
    actionSchema: "tear-game-action-command-envelope.v1", recurrentState: { kind: "none", schemaVersion: 1 },
    trainingManifest: { id: "production-evaluation", version: 1, rootHash: "fedcba9876543210" }, rewardVersion: "tear-reward.v1",
    build: { version: "test", revision: "c32", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" },
    metrics: { legalActionRate: 1 }, levelTarget: "class-a", lineage: { trainingRunId: "production-evaluation-run" },
    signature: { kind: "local-unsigned", keyId: "development" }, compatibility,
  });
  await value.register(artifact); await value.activate(artifact.id, "2026-08-03T18:01:00.000Z"); return value;
}

describe("C32 production policy evaluation", () => {
  it("runs an active artifact twice through the C29/C30 source-owned world with identical terminal evidence", async () => {
    const value = await registry();
    const first = await evaluateActiveTearPolicyInProduction(value, scenario);
    const second = await evaluateActiveTearPolicyInProduction(value, scenario);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ format: "tear-production-policy-evaluation", artifactId: "production-policy",
      terminal: { tick: scenario.maxTicks, truncated: true, terminated: false } });
    expect(first.decisions).toHaveLength(scenario.maxTicks);
    expect(first.decisions.every((entry) => entry.receipt.source === "artifact")).toBe(true);
  });

  it("round-trips a bounded production report through Vault analysis storage and quarantines corrupt bytes", async () => {
    const report = await evaluateActiveTearPolicyInProduction(await registry(), scenario);
    const backend = createMemoryGhostVaultBackend(), vault = new TearProductionPolicyEvaluationVault(backend);
    await vault.persist(report);
    expect(await vault.persist(report)).toEqual(report);
    expect(await vault.get(report.reportHash)).toEqual(report);
    await backend.put("analysis", `policy-production-evaluation:v1:${report.reportHash}`, "not-json");
    expect(await vault.get(report.reportHash)).toBeUndefined();
    expect((await backend.keys("quarantine")).some((key) => key.endsWith(report.reportHash))).toBe(true);
  });
});
