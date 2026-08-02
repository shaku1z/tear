import { describe, expect, it } from "vitest";
import { createGhostVaultLibraryController } from "../../src/app/ghost-vault-library-controller";
import type { TearGhostManifest } from "../../src/ghost/capsule-vault";

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
      listManifests: () => Promise.resolve([manifest("older", "2026-08-01T00:00:00.000Z"), manifest("newer", "2026-08-02T00:00:00.000Z")]),
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
        { id: "newer", status: "complete", recordingProfile: "coaching", chunkCount: 0 },
        { id: "older", status: "complete", recordingProfile: "coaching", chunkCount: 0 },
      ],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.capsules)).toBe(true);
  });

  it("contains failed catalog access without erasing the previous durable listing", async () => {
    let attempt = 0;
    const controller = createGhostVaultLibraryController({
      listManifests: () => {
        attempt += 1;
        if (attempt === 1) return Promise.resolve([manifest("kept", "2026-08-02T00:00:00.000Z")]);
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
});
