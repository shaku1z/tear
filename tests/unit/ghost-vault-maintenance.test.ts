import { describe, expect, it } from "vitest";
import {
  GHOST_VAULT_MAINTENANCE_KEY,
  GhostLocalVault,
  GhostStreamingRecorder,
  createMemoryGhostVaultBackend,
  maintainGhostVault,
} from "../../src/ghost";

describe("Ghost Vault maintenance", () => {
  it("enforces retention, rebuilds indexes, scans surviving records, and writes a durable receipt", async () => {
    const backend = createMemoryGhostVaultBackend();
    const vault = new GhostLocalVault(backend);
    const record = async (id: string) => {
      const recorder = new GhostStreamingRecorder({
        sessionId: id,
        createdAt: "2026-08-02T00:00:00.000Z",
        chunkEntries: 1,
        maxPendingWrites: 1,
        vault,
      });
      await recorder.start();
      await recorder.append({ kind: "events", tick: 1, value: { type: "run.started", id } });
      return recorder.finalize("2026-08-02T00:01:00.000Z");
    };

    const pinned = await record("pinned-capsule");
    const temporary = await record("temporary-capsule");
    await backend.remove("indexes", `manifest:${pinned.id}`);

    const report = await maintainGhostVault(vault, {
      maximumBytes: 0,
      retention: { [pinned.id]: "pinned", [temporary.id]: "temporary" },
      now: () => "2026-08-02T00:02:00.000Z",
    });

    expect(report).toMatchObject({
      checkedAt: "2026-08-02T00:02:00.000Z",
      evictedCapsuleIds: [temporary.id],
      integrity: [{ id: pinned.id, healthy: true }],
      rebuiltIndexes: 1,
    });
    expect(await vault.getManifest(temporary.id)).toBeUndefined();
    expect(await backend.get("indexes", `manifest:${pinned.id}`)).toContain("complete");
    expect(await backend.get("analysis", GHOST_VAULT_MAINTENANCE_KEY)).toContain("pinned-capsule");
  });
});
