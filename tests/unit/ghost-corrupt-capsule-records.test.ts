import { describe, expect, it } from "vitest";
import {
  GhostCorruptCapsuleRecords,
  corruptCapsuleRecordKey,
  createMemoryGhostVaultBackend,
  type TearGhostManifest,
} from "../../src/ghost";

function corruptedManifest(): TearGhostManifest {
  return Object.freeze({
    format: "tearghost-capsule",
    schemaVersion: 1,
    id: "damaged-capsule",
    status: "complete",
    createdAt: "2026-08-02T00:00:00.000Z",
    recordingProfile: "coaching",
    chunks: [],
    rootIntegrity: "damaged-root",
    fidelity: Object.freeze({ presentation: "full" as const, downgrades: [] }),
  });
}

const UNHEALTHY = { healthy: false, corruptChunkIds: ["damaged:chunk:0"], missingChunkIds: [] };
// The bytes a vault written before this module was renamed already holds for this capsule.
const STORED_KEY = "entry:graveyard:graveyard:damaged-capsule";
const STORED_VALUE = JSON.stringify({
  format: "tearghost-library-entry",
  schemaVersion: 1,
  entry: {
    id: "graveyard:damaged-capsule",
    library: "graveyard",
    ghostId: "damaged-capsule",
    rootHash: "damaged-root",
    createdAt: "2026-08-02T00:01:00.000Z",
    provenance: { source: "ghost-doctor", corruptChunks: "1", missingChunks: "0" },
  },
});

describe("the Vault's record of a corrupt capsule", () => {
  it("is written under the key and bytes existing vaults already hold", async () => {
    const backend = createMemoryGhostVaultBackend();
    const entry = await new GhostCorruptCapsuleRecords(backend).record(
      corruptedManifest(),
      UNHEALTHY,
      "2026-08-02T00:01:00.000Z",
    );
    expect(corruptCapsuleRecordKey("damaged-capsule")).toBe(STORED_KEY);
    expect(await backend.get("libraries", STORED_KEY)).toBe(STORED_VALUE);
    expect(entry).toMatchObject({ ghostId: "damaged-capsule", rootHash: "damaged-root" });
  });

  it("confirms a record that is already stored without rewriting it", async () => {
    const backend = createMemoryGhostVaultBackend();
    await backend.put("libraries", STORED_KEY, STORED_VALUE);
    const prepared = await new GhostCorruptCapsuleRecords(backend).prepare(
      corruptedManifest(),
      UNHEALTHY,
      "2026-09-09T00:00:00.000Z",
    );
    expect(prepared.write).toBeUndefined();
    expect(prepared.guard).toEqual({ store: "libraries", key: STORED_KEY, expected: STORED_VALUE });
    expect(prepared.entry.createdAt).toBe("2026-08-02T00:01:00.000Z");
  });

  it("refuses a healthy capsule", async () => {
    const records = new GhostCorruptCapsuleRecords(createMemoryGhostVaultBackend());
    await expect(
      records.prepare(corruptedManifest(), { healthy: true, corruptChunkIds: [], missingChunkIds: [] }, "now"),
    ).rejects.toThrow(/unhealthy/u);
  });

  it("refuses a stored record that is malformed, from a later schema or about another root, and leaves its bytes", async () => {
    const conflicting = STORED_VALUE.replace("damaged-root", "another-root");
    for (const stored of [
      "not-json",
      JSON.stringify({ format: "tearghost-library-entry", schemaVersion: 2, entry: {} }),
      conflicting,
    ]) {
      const backend = createMemoryGhostVaultBackend();
      await backend.put("libraries", STORED_KEY, stored);
      const records = new GhostCorruptCapsuleRecords(backend);
      await expect(records.record(corruptedManifest(), UNHEALTHY, "2026-08-02T00:01:00.000Z")).rejects.toThrow();
      expect(await backend.get("libraries", STORED_KEY)).toBe(stored);
    }
  });
});
