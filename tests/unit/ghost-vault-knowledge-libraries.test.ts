import { describe, expect, it } from "vitest";
import {
  GhostVaultKnowledgeLibraries,
  createGhostV3,
  createMemoryGhostVaultBackend,
  type GhostReplayTrident,
  type TearGhostManifest,
} from "../../src/ghost";

const trident: GhostReplayTrident = {
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "test" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "test" },
  visual: { kind: "visual", status: "verified", available: true, resumable: false, seekable: true, reason: "test" },
};

function ghost(id: string) {
  return createGhostV3({
    id, rulesetVersion: "knowledge-library-test", sourceClassification: "native-v3", trident,
    actions: [{ kind: "command", id: 1, tick: 1, command: { type: "move", x: 1_000, y: 0 } }],
    snapshots: [], events: [],
  });
}

function corruptedManifest(): TearGhostManifest {
  return Object.freeze({
    format: "tearghost-capsule", schemaVersion: 1, id: "damaged-capsule", status: "complete",
    createdAt: "2026-08-02T00:00:00.000Z", recordingProfile: "coaching", chunks: [],
    rootIntegrity: "damaged-root", fidelity: Object.freeze({ presentation: "full" as const, downgrades: [] }),
  });
}

describe("durable Ghost knowledge libraries", () => {
  it("persists Canon, Graveyard, Frontier, and consent-governed Corpus across a Vault reopen", async () => {
    const backend = createMemoryGhostVaultBackend();
    const libraries = new GhostVaultKnowledgeLibraries(backend);
    const source = ghost("governed-source");

    await libraries.promoteToCanon(source, { approved: true, reviewer: "reviewer-1", at: "2026-08-02T00:00:00.000Z" });
    await libraries.triageToFrontier(source, 0.95, "2026-08-02T00:00:00.000Z");
    await libraries.ingestCorpus({ ghost: source, consent: "anonymous-improvement", split: "hidden-holdout",
      createdAt: "2026-08-02T00:00:00.000Z", producer: "academy" });
    await libraries.recordCorruptCapsule(corruptedManifest(), {
      healthy: false, corruptChunkIds: ["damaged:chunk:0"], missingChunkIds: [],
    }, "2026-08-02T00:01:00.000Z");

    const reopened = new GhostVaultKnowledgeLibraries(backend);
    expect((await reopened.inventory()).entries.map((entry) => entry.library)).toEqual(["canon", "corpus", "frontier", "graveyard"]);
    expect(await reopened.list("corpus")).toEqual([]);
    expect(await reopened.list("corpus", true)).toHaveLength(1);
    await expect(reopened.ingestCorpus({ ghost: source, consent: "public-training", split: "train",
      createdAt: "2026-08-02T00:02:00.000Z", producer: "academy" })).rejects.toThrow(/duplicate/u);
    await expect(reopened.promoteToCanon(source, { approved: true, reviewer: "reviewer-1", at: "2026-08-02T00:02:00.000Z" })).rejects.toThrow(/already exists/u);
  });

  it("rejects malformed and future records without trusting or overwriting their stored bytes", async () => {
    const backend = createMemoryGhostVaultBackend();
    const future = JSON.stringify({ format: "tearghost-library-entry", schemaVersion: 2, entry: {} });
    const malformed = "not-json";
    await backend.put("libraries", "entry:future", future);
    await backend.put("libraries", "entry:malformed", malformed);

    const inventory = await new GhostVaultKnowledgeLibraries(backend).inventory();
    expect(inventory.entries).toEqual([]);
    expect(inventory.rejectedEntryKeys).toEqual(["entry:future", "entry:malformed"]);
    expect(await backend.get("libraries", "entry:future")).toBe(future);
    expect(await backend.get("libraries", "entry:malformed")).toBe(malformed);
  });
});
