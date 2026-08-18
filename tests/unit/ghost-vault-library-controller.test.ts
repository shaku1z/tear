import { describe, expect, it } from "vitest";
import { createGhostVaultLibraryController } from "../../src/app/ghost-vault-library-controller";
import type { TearGhostManifest } from "../../src/ghost/capsule-vault";
import { refuseGhostTheater } from "../../src/ghost/theater-open-result";

function manifest(id: string, createdAt: string): TearGhostManifest {
  return Object.freeze({
    format: "tearghost-capsule",
    schemaVersion: 1,
    id,
    status: "complete",
    createdAt,
    recordingProfile: "coaching",
    chunks: [],
    rootIntegrity: `root-${id}`,
    fidelity: { presentation: "full" as const, downgrades: [] },
  });
}

describe("Ghost Vault library controller", () => {
  it("publishes immutable, newest-first custody metadata after a real catalog refresh", async () => {
    const controller = createGhostVaultLibraryController({
      repair: () => Promise.resolve({ sourceId: "older", childId: "older:repaired:1", reused: false }),
      inspect: () => Promise.resolve({
        manifests: [manifest("older", "2026-08-01T00:00:00.000Z"), manifest("newer", "2026-08-02T00:00:00.000Z")],
        maintenance: { schemaVersion: 1, checkedAt: "2026-08-02T00:00:00.000Z", maximumBytes: 1, evictedCapsuleIds: [], integrity: [{ id: "older", healthy: true }, { id: "newer", healthy: true }], rebuiltIndexes: 2, libraries: { schemaVersion: 1, entries: [{ id: "graveyard:newer", library: "graveyard", ghostId: "newer", rootHash: "root-newer", createdAt: "2026-08-02T00:00:00.000Z", provenance: { source: "ghost-doctor" } }], rejectedEntryKeys: [] } },
      }),
    });

    expect(controller.snapshot()).toMatchObject({ status: "idle", capsules: [] });
    controller.refresh();
    expect(controller.snapshot().status).toBe("loading");
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = controller.snapshot();
    expect(snapshot).toMatchObject({
      status: "ready",
      capsules: [
        { id: "newer", status: "complete", recordingProfile: "coaching", chunkCount: 0, healthy: true, libraries: ["graveyard"] },
        { id: "older", status: "complete", recordingProfile: "coaching", chunkCount: 0, healthy: true },
      ],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.capsules)).toBe(true);
  });

  it("contains failed catalog access without erasing the previous durable listing", async () => {
    let attempt = 0;
    const controller = createGhostVaultLibraryController({
      repair: () => Promise.resolve({ sourceId: "kept", childId: "kept:repaired:1", reused: false }),
      inspect: () => {
        attempt += 1;
        if (attempt === 1) return Promise.resolve({
          manifests: [manifest("kept", "2026-08-02T00:00:00.000Z")],
          maintenance: { schemaVersion: 1, checkedAt: "2026-08-02T00:00:00.000Z", maximumBytes: 1, evictedCapsuleIds: [], integrity: [{ id: "kept", healthy: true }], rebuiltIndexes: 1, libraries: { schemaVersion: 1, entries: [], rejectedEntryKeys: [] } },
        });
        return Promise.reject(new Error("IndexedDB blocked"));
      },
    });

    controller.refresh();
    await Promise.resolve();
    await Promise.resolve();
    controller.refresh();
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.snapshot()).toMatchObject({
      status: "failed",
      capsules: [{ id: "kept" }],
      message: "Ghost Vault could not open: IndexedDB blocked",
    });
  });

  it("keeps custody intact while making a refused Theater source visibly ineligible", async () => {
    const catalog = {
      manifests: [manifest("hostile", "2026-08-02T00:00:00.000Z")],
      maintenance: { schemaVersion: 1 as const, checkedAt: "2026-08-02T00:00:00.000Z", maximumBytes: 1, evictedCapsuleIds: [],
        integrity: [{ id: "hostile", healthy: true }], rebuiltIndexes: 1, libraries: { schemaVersion: 1 as const, entries: [], rejectedEntryKeys: [] } },
    };
    const controller = createGhostVaultLibraryController({ inspect: () => Promise.resolve(catalog),
      repair: () => Promise.resolve({ sourceId: "hostile", childId: "unused", reused: true }) });
    controller.refresh();
    await Promise.resolve(); await Promise.resolve();
    const before = controller.snapshot().capsules[0];
    controller.setTheaterEligibility("hostile", refuseGhostTheater("codec-preflight", "root-hostile", 12));
    const after = controller.snapshot().capsules[0];
    expect(after).toMatchObject({ id: "hostile", healthy: true, theaterEligible: false,
      theaterRefusal: { kind: "refused", category: "codec-preflight", tick: 12, root: "root-hostile" } });
    expect(after).toMatchObject({ createdAt: before?.createdAt, chunkCount: before?.chunkCount, libraries: before?.libraries });
  });
});
