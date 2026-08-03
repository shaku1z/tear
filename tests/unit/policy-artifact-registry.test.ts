import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  TearPolicyArtifactRegistry,
  createTearPolicyArtifact,
  type TearPolicyArtifactV1,
} from "../../src/agents";

const compatibility = Object.freeze({
  runtime: "tear-policy-runtime.v1",
  observationClass: "structured-state" as const,
  actionSchema: "tear-game-action-command-envelope.v1",
  modelFormats: Object.freeze(["table-policy-v1"]),
});

function artifact(id: string, parentArtifactId?: string): TearPolicyArtifactV1 {
  return createTearPolicyArtifact({
    id, createdAt: "2026-08-03T14:00:00.000Z", model: Object.freeze({ format: "table-policy-v1", payload: JSON.stringify({ states: {} }) }),
    encoder: Object.freeze({ id: "tear-structured-state", schemaVersion: 1, observationClass: "structured-state", normalizationHash: "0123456789abcdef" }),
    actionSchema: "tear-game-action-command-envelope.v1", recurrentState: Object.freeze({ kind: "none", schemaVersion: 1 }),
    trainingManifest: Object.freeze({ id: "academy-release", version: 1, rootHash: "fedcba9876543210" }),
    rewardVersion: "tear-reward.v1", build: Object.freeze({ version: "test", revision: "c32", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" }),
    metrics: Object.freeze({ validationLoss: 0.1, legalActionRate: 1 }), levelTarget: "class-a",
    lineage: Object.freeze({ trainingRunId: `${id}-run`, ...(parentArtifactId === undefined ? {} : { parentArtifactId }) }),
    signature: Object.freeze({ kind: "local-unsigned", keyId: "development" }), compatibility,
  });
}

describe("C32 durable policy artifact registry", () => {
  it("round-trips a compatible artifact and atomically switches then rolls back the active pointer", async () => {
    const backend = createMemoryGhostVaultBackend();
    const registry = new TearPolicyArtifactRegistry(backend, compatibility);
    const first = artifact("policy-a"), second = artifact("policy-b", first.id);
    await registry.register(first); await registry.register(second);
    expect(await registry.get(first.id)).toEqual(first);
    const firstActivation = await registry.activate(first.id, "2026-08-03T14:01:00.000Z");
    expect((await registry.active())?.artifactId).toBe(first.id);
    const secondActivation = await registry.activate(second.id, "2026-08-03T14:02:00.000Z");
    expect(secondActivation.previousArtifactId).toBe(first.id);
    expect((await registry.rollback("2026-08-03T14:03:00.000Z"))?.artifactId).toBe(first.id);
    expect((await registry.history()).map((entry) => entry.artifactId)).toEqual([first.id, second.id, first.id]);
    expect(firstActivation.artifactHash).toBe(first.artifactHash);
  });

  it("quarantines corrupt or incompatible bytes without exposing or activating them", async () => {
    const backend = createMemoryGhostVaultBackend();
    const registry = new TearPolicyArtifactRegistry(backend, compatibility);
    const valid = artifact("policy-safe");
    await registry.register(valid); await registry.activate(valid.id, "2026-08-03T14:01:00.000Z");
    await backend.put("analysis", "policy-artifact:v1:policy-corrupt", "{not-json");
    await backend.put("analysis", "policy-artifact:v1:policy-incompatible", JSON.stringify({ ...artifact("policy-incompatible"), compatibility: { ...compatibility, actionSchema: "other" } }));
    expect(await registry.get("policy-corrupt")).toBeUndefined();
    expect(await registry.get("policy-incompatible")).toBeUndefined();
    expect((await registry.active())?.artifactId).toBe(valid.id);
    expect(await backend.keys("quarantine")).toContain("policy-artifact:v1:policy-corrupt");
    expect(await backend.keys("quarantine")).toContain("policy-artifact:v1:policy-incompatible");
    await expect(registry.activate("policy-corrupt", "2026-08-03T14:02:00.000Z")).rejects.toThrow(/unavailable/u);
  });

  it("retains active rollback lineage and only evicts excess unactivated leaf artifacts with an integrity receipt", async () => {
    const backend = createMemoryGhostVaultBackend(), registry = new TearPolicyArtifactRegistry(backend, compatibility);
    const first = artifact("retained-a"), second = artifact("retained-b", first.id);
    const stagedParent = artifact("staged-parent"), stagedLeaf = artifact("staged-leaf", stagedParent.id);
    await registry.register(first); await registry.register(second); await registry.register(stagedParent); await registry.register(stagedLeaf);
    await registry.activate(first.id, "2026-08-03T14:01:00.000Z");
    await registry.activate(second.id, "2026-08-03T14:02:00.000Z");
    const receipt = await registry.retainUnactivated(0, "2026-08-03T14:03:00.000Z");

    expect(receipt).toMatchObject({ format: "tear-policy-retention-receipt", revision: 1, removedArtifactIds: [stagedLeaf.id] });
    expect(receipt.protectedArtifactIds).toEqual(expect.arrayContaining([first.id, second.id, stagedParent.id]));
    expect(await registry.get(first.id)).toEqual(first);
    expect(await registry.get(second.id)).toEqual(second);
    expect(await registry.get(stagedParent.id)).toEqual(stagedParent);
    expect(await registry.get(stagedLeaf.id)).toBeUndefined();
    expect(await registry.retentionHistory()).toEqual([receipt]);
  });
});
