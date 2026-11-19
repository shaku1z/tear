import { describe, expect, it, vi } from "vitest";
import { createGhostVaultLibraryController } from "../../src/app/library/ghost-vault-library-controller";
import type { GhostVaultBackend, TearGhostManifest } from "../../src/ghost/capsule-vault";
import { refuseGhostTheater } from "../../src/ghost/theater-open-result";
import { createMemoryGhostVaultBackend, GhostLocalVault, GhostStreamingRecorder } from "../../src/ghost/capsule-vault";
import { createGhostColdRestoreBrowserPort } from "../../src/ghost/browser-cold-restore";
import type { GhostArchiveFile } from "../../src/app/library/browser-ghost-archive-files";
import { NORMAL_GHOST_ARCHIVE_LIMITS } from "../../src/ghost/capsule-archive";
import { createIndexedDbGhostVaultBackend } from "../../src/ghost/indexeddb-vault-backend";
import { inspectBrowserGhostVaultReadOnly, repairBrowserGhostCapsule } from "../../src/ghost/browser-capsule-vault";
vi.mock("../../src/ghost/indexeddb-vault-backend", () => ({ createIndexedDbGhostVaultBackend: vi.fn() }));

async function damagedRepairSource(backend = createMemoryGhostVaultBackend()) {
  const vault = new GhostLocalVault(backend),
    recorder = new GhostStreamingRecorder({
      sessionId: "selected-damaged-source",
      createdAt: "2026-10-19T00:00:00Z",
      vault,
      chunkEntries: 1,
      maxPendingWrites: 1,
    });
  await recorder.start();
  await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } });
  await recorder.finalize("2026-10-19T00:00:01Z");
  const manifest = await vault.getManifest("selected-damaged-source"),
    chunk = manifest?.chunks[0];
  if (manifest === undefined || chunk === undefined) throw new Error("repair fixture missing");
  await backend.put("chunks", chunk.id, "retained-corrupt-bytes");
  await backend.remove("indexes", `manifest:${manifest.id}`);
  vi.mocked(createIndexedDbGhostVaultBackend).mockResolvedValue(backend);
  return { vault, backend, manifest, chunk, factory: {} as IDBFactory };
}

async function archiveBytes(id = "selected-capsule") {
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend()),
    recorder = new GhostStreamingRecorder({
      sessionId: id,
      createdAt: "2026-10-19T00:00:00Z",
      vault,
      chunkEntries: 1,
      maxPendingWrites: 1,
    });
  await recorder.start();
  await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } });
  await recorder.finalize("2026-10-19T00:00:01Z");
  return new TextEncoder().encode(await vault.exportCapsule(id));
}
function archiveController(backend = createMemoryGhostVaultBackend()) {
  const actual = createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)),
    cancel = vi.fn(actual.cancel),
    restore = { ...actual, cancel };
  let selected: ((file: GhostArchiveFile) => void) | undefined, cancelled: (() => void) | undefined;
  const cleanup = vi.fn(),
    download = vi.fn();
  const controller = createGhostVaultLibraryController({
    newIntent: () => crypto.randomUUID(),
    restore,
    files: {
      pick: (onSelected, onCancelled) => {
        selected = onSelected;
        cancelled = onCancelled;
        return cleanup;
      },
      download,
    },
    repair: () => Promise.reject(new Error("not requested")),
    inspect: () =>
      Promise.resolve({
        manifests: [],
        maintenance: {
          schemaVersion: 1,
          checkedAt: "2026-10-19",
          maximumBytes: 0,
          evictedCapsuleIds: [],
          integrity: [],
          rebuiltIndexes: 0,
        },
      }),
  });
  return {
    controller,
    restore,
    backend,
    cancel,
    cleanup,
    download,
    choose: (bytes: Uint8Array) => {
      selected?.({ size: bytes.byteLength, arrayBuffer: () => Promise.resolve(Uint8Array.from(bytes).buffer) });
    },
    chooseFile: (file: GhostArchiveFile) => {
      selected?.(file);
    },
    cancelPicker: () => {
      cancelled?.();
    },
  };
}

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
  it("explicit selected-source repair preserves bytes and records only its source index and Graveyard custody", async () => {
    const f = await damagedRepairSource(),
      parent = await f.backend.get("manifests", f.manifest.id);
    const result = await repairBrowserGhostCapsule(f.factory, f.manifest.id);
    expect(await f.backend.get("manifests", f.manifest.id)).toBe(parent);
    expect(await f.backend.get("chunks", f.chunk.id)).toBe("retained-corrupt-bytes");
    expect(await f.backend.get("indexes", `manifest:${f.manifest.id}`)).toEqual(expect.any(String));
    expect(
      JSON.parse((await f.backend.get("libraries", `entry:graveyard:graveyard:${f.manifest.id}`)) ?? "null"),
    ).toMatchObject({ entry: { library: "graveyard", ghostId: f.manifest.id, rootHash: f.manifest.rootIntegrity } });
    expect(await f.backend.get("lineage", `repair:${result.childId}`)).toContain(f.manifest.id);
    expect(await f.backend.get("quarantine", `repair:${result.childId}:${f.chunk.id}`)).toContain(
      "retained-corrupt-bytes",
    );
    expect(await f.backend.get("analysis", "vault-maintenance:v1")).toBeUndefined();
  });

  it("refuses selected metadata drift and keeps an already committed repair child retryable after reload", async () => {
    const base = createMemoryGhostVaultBackend();
    let armed = true;
    const backend: GhostVaultBackend = {
      ...base,
      async commitIfMatches(guards, writes) {
        if (armed && writes.some((write) => write.store === "libraries")) {
          armed = false;
          await base.put("indexes", "manifest:selected-damaged-source", "concurrent-index-evidence");
        }
        return base.commitIfMatches(guards, writes);
      },
    };
    const f = await damagedRepairSource(backend);
    await expect(repairBrowserGhostCapsule(f.factory, f.manifest.id)).rejects.toThrow();
    expect(await backend.get("indexes", `manifest:${f.manifest.id}`)).toBe("concurrent-index-evidence");
    expect(await backend.get("libraries", `entry:graveyard:graveyard:${f.manifest.id}`)).toBeUndefined();
    const childIds = (await backend.keys("manifests")).filter((id) => id !== f.manifest.id);
    expect(childIds).toHaveLength(1);
    const controller = createGhostVaultLibraryController({
      inspect: () => inspectBrowserGhostVaultReadOnly(f.factory),
      repair: (id) => repairBrowserGhostCapsule(f.factory, id),
    });
    controller.refresh();
    await vi.waitFor(() => {
      expect(controller.snapshot().status).toBe("ready");
    });
    expect(controller.snapshot().capsules.find((entry) => entry.id === f.manifest.id)).toMatchObject({
      repairable: true,
    });
    controller.repair(f.manifest.id);
    await vi.waitFor(() => {
      expect(controller.snapshot().message).toBe("A verified repair child is already available.");
    });
    expect(controller.snapshot().capsules.find((entry) => entry.id === f.manifest.id)).toMatchObject({
      repairable: false,
    });
    expect((await backend.keys("manifests")).filter((id) => id !== f.manifest.id)).toEqual(childIds);
    expect(await backend.get("chunks", f.chunk.id)).toBe("retained-corrupt-bytes");
  });
  it("previews only, requires exact reselection after reload, then explicitly restores and labels current custody", async () => {
    const f = archiveController(),
      bytes = await archiveBytes();
    f.controller.pickArchive();
    f.choose(bytes);
    await vi.waitFor(() => {
      expect(f.controller.snapshot().archive?.status).toBe("ready");
    });
    expect(await f.backend.keys("manifests")).toEqual([]);
    const ready = f.controller.snapshot().archive;
    expect(ready?.sha256).toHaveLength(64);
    expect(Object.isFrozen(ready)).toBe(true);
    expect(JSON.stringify(ready)).not.toContain("chunks");
    f.controller.dispose();
    expect(f.cancel).not.toHaveBeenCalled();
    const reload = archiveController(f.backend);
    reload.controller.refresh();
    await vi.waitFor(() => {
      expect(reload.controller.snapshot().archive?.status).toBe("reselect-required");
    });
    const history = reload.controller.snapshot().archive;
    if (!history?.jobId) throw new Error("missing job");
    reload.controller.restoreArchive(history.jobId, history.revision ?? 0);
    expect(await f.backend.keys("manifests")).toEqual([]);
    reload.controller.pickArchive(history.jobId);
    reload.choose(await archiveBytes("unrelated-capsule"));
    await vi.waitFor(() => {
      expect(reload.controller.snapshot().archive?.status).toBe("failed");
    });
    expect(reload.controller.snapshot().archive?.detail).toMatch(/differs/u);
    reload.controller.pickArchive(history.jobId);
    reload.choose(bytes);
    await vi.waitFor(() => {
      expect(reload.controller.snapshot().archive?.status).toBe("ready");
    });
    const selected = reload.controller.snapshot().archive;
    reload.controller.restoreArchive(history.jobId, selected?.revision ?? 0);
    await vi.waitFor(() => {
      expect(reload.controller.snapshot().archive?.status).toBe("complete");
    });
    expect(await f.backend.keys("manifests")).toEqual(["selected-capsule"]);
    expect(reload.controller.snapshot().archive?.canCancel).toBe(false);
  });
  it("treats retained completion as historical and refuses missing current custody after exact reselection", async () => {
    const f = archiveController(),
      bytes = await archiveBytes();
    const { job } = await f.restore.select("historical", bytes);
    await f.restore.restore(job, bytes);
    f.controller.refresh();
    await vi.waitFor(() => {
      expect(f.controller.snapshot().archive?.status).toBe("reselect-required");
    });
    expect(f.controller.snapshot().archive?.detail).toMatch(/Historical/u);
    const manifest = await new GhostLocalVault(f.backend).getManifest("selected-capsule");
    if (!manifest?.chunks[0]) throw new Error("missing chunk");
    await f.backend.remove("chunks", manifest.chunks[0].id);
    f.controller.pickArchive("historical");
    f.choose(bytes);
    await vi.waitFor(() => {
      expect(f.controller.snapshot().archive?.status).toBe("ready");
    });
    f.controller.restoreArchive("historical", f.controller.snapshot().archive?.revision ?? 0);
    await vi.waitFor(() => {
      expect(f.controller.snapshot().archive?.status).toBe("failed");
    });
    expect(f.controller.snapshot().archive?.detail).toMatch(/could not be confirmed/u);
  });
  it("preflights file size before allocation and discards late reads after transient cancellation or disposal", async () => {
    const f = archiveController(),
      arrayBuffer = vi.fn();
    f.controller.pickArchive();
    f.chooseFile({ size: NORMAL_GHOST_ARCHIVE_LIMITS.maxEncodedBytes + 1, arrayBuffer });
    await vi.waitFor(() => {
      expect(f.controller.snapshot().archive?.status).toBe("failed");
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    let resolve: ((value: ArrayBuffer) => void) | undefined;
    f.controller.pickArchive();
    f.chooseFile({
      size: 3,
      arrayBuffer: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    f.controller.cancelArchive();
    resolve?.(new ArrayBuffer(3));
    await Promise.resolve();
    expect(f.controller.snapshot().archive?.status).toBe("idle");
    expect(await f.restore.jobs()).toEqual([]);
    expect(f.cancel).not.toHaveBeenCalled();
    f.controller.pickArchive();
    f.controller.dispose();
    f.choose(await archiveBytes());
    await Promise.resolve();
    expect(await f.restore.jobs()).toEqual([]);
    expect(f.cleanup).toHaveBeenCalled();
  });
  it("keeps actions usable after transient BFCache clearing, and cancellation never becomes automatic restore", async () => {
    const f = archiveController(),
      bytes = await archiveBytes();
    f.controller.pickArchive();
    f.choose(bytes);
    await vi.waitFor(() => {
      expect(f.controller.snapshot().archive?.status).toBe("ready");
    });
    const ready = f.controller.snapshot().archive;
    if (!ready?.jobId) throw new Error("missing job");
    f.controller.cancelArchive();
    f.controller.refresh();
    expect(f.cancel).not.toHaveBeenCalled();
    f.controller.restoreArchive(ready.jobId, ready.revision ?? 0);
    expect(await f.backend.keys("manifests")).toEqual([]);
    f.controller.pickArchive(ready.jobId);
    f.cancelPicker();
    expect(f.controller.snapshot().archive?.status).toBe("reselect-required");
    f.controller.pickArchive(ready.jobId);
    f.choose(bytes);
    await vi.waitFor(() => {
      expect(f.controller.snapshot().archive?.status).toBe("ready");
    });
    f.controller.cancelArchive(ready.jobId, ready.revision);
    await vi.waitFor(() => {
      expect(f.controller.snapshot().archive?.status).toBe("cancelled");
    });
    expect(await f.backend.keys("manifests")).toEqual([]);
  });
  it("requests download only after complete original-byte validation and does not claim saved-file success", async () => {
    const f = archiveController(),
      bytes = await archiveBytes();
    await new GhostLocalVault(f.backend).importCapsule(new TextDecoder().decode(bytes));
    f.controller.downloadArchive("selected-capsule");
    await vi.waitFor(() => {
      expect(f.controller.snapshot().archive?.status).toBe("download-requested");
    });
    expect(f.download).toHaveBeenCalledOnce();
    expect(f.controller.snapshot().archive?.detail).toMatch(/save is not confirmed/u);
  });
  it("publishes immutable, newest-first custody metadata after a real catalog refresh", async () => {
    const controller = createGhostVaultLibraryController({
      repair: () => Promise.resolve({ sourceId: "older", childId: "older:repaired:1", reused: false }),
      inspect: () =>
        Promise.resolve({
          manifests: [manifest("older", "2026-08-01T00:00:00.000Z"), manifest("newer", "2026-08-02T00:00:00.000Z")],
          maintenance: {
            schemaVersion: 1,
            checkedAt: "2026-08-02T00:00:00.000Z",
            maximumBytes: 1,
            evictedCapsuleIds: [],
            integrity: [
              { id: "older", healthy: true },
              { id: "newer", healthy: true },
            ],
            rebuiltIndexes: 2,
          },
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
        {
          id: "newer",
          status: "complete",
          recordingProfile: "coaching",
          chunkCount: 0,
          healthy: true,
        },
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
        if (attempt === 1)
          return Promise.resolve({
            manifests: [manifest("kept", "2026-08-02T00:00:00.000Z")],
            maintenance: {
              schemaVersion: 1,
              checkedAt: "2026-08-02T00:00:00.000Z",
              maximumBytes: 1,
              evictedCapsuleIds: [],
              integrity: [{ id: "kept", healthy: true }],
              rebuiltIndexes: 1,
            },
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
      maintenance: {
        schemaVersion: 1 as const,
        checkedAt: "2026-08-02T00:00:00.000Z",
        maximumBytes: 1,
        evictedCapsuleIds: [],
        integrity: [{ id: "hostile", healthy: true }],
        rebuiltIndexes: 1,
      },
    };
    const controller = createGhostVaultLibraryController({
      inspect: () => Promise.resolve(catalog),
      repair: () => Promise.resolve({ sourceId: "hostile", childId: "unused", reused: true }),
    });
    controller.refresh();
    await Promise.resolve();
    await Promise.resolve();
    const before = controller.snapshot().capsules[0];
    controller.setTheaterEligibility("hostile", refuseGhostTheater("codec-preflight", "root-hostile", 12));
    const after = controller.snapshot().capsules[0];
    expect(after).toMatchObject({
      id: "hostile",
      healthy: true,
      theaterEligible: false,
      theaterRefusal: { kind: "refused", category: "codec-preflight", tick: 12, root: "root-hostile" },
    });
    expect(after).toMatchObject({
      createdAt: before?.createdAt,
      chunkCount: before?.chunkCount,
    });
  });
});
