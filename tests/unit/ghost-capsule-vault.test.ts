import { describe, expect, it } from "vitest";

import {
  GHOST_VAULT_STORES,
  GhostDoctor,
  GhostLocalVault,
  GhostStreamingRecorder,
  capsuleDebugJson,
  createInlineGhostEncoderWorker,
  createMemoryGhostVaultBackend,
  type GhostEncodedChunk,
  type GhostEncoderWorkerPort,
  type GhostVaultStore,
} from "../../src/ghost";

describe("Ghost capsule recorder and local Vault", () => {
  it("streams a long run in bounded chunks without full-run serialization", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostStreamingRecorder({
      sessionId: "long-run",
      createdAt: "2026-07-23T00:00:00.000Z",
      chunkEntries: 64,
      maxPendingWrites: 2,
      vault,
    });
    await recorder.start();
    for (let tick = 0; tick < 20_000; tick += 1) {
      await recorder.append({
        kind: tick % 120 === 0 ? "keyframes" : "commands",
        tick,
        value: { action: "move", x: tick % 2 === 0 ? 1_000 : -1_000 },
      });
    }
    const manifest = await recorder.finalize("2026-07-23T01:00:00.000Z");
    expect(recorder.maxBufferedEntries).toBeLessThanOrEqual(64);
    expect(manifest.chunks.length).toBeGreaterThan(300);
    expect(manifest.rootIntegrity).toMatch(/^[a-f0-9]{16}$/u);
    expect(new Set(manifest.chunks.map((chunk) => chunk.checksum)).size).toBeGreaterThan(1);
    expect(capsuleDebugJson(manifest)).toContain("\"format\": \"tearghost-capsule\"");
  }, 30_000);

  it("recovers the last committed recording journal after a refresh", async () => {
    const stores = new Map<GhostVaultStore, Map<string, string>>();
    const backend = createMemoryGhostVaultBackend(stores);
    const beforeRefresh = new GhostLocalVault(backend);
    const recorder = new GhostStreamingRecorder({
      sessionId: "crashed-run",
      createdAt: "2026-07-23T00:00:00.000Z",
      chunkEntries: 2,
      maxPendingWrites: 1,
      vault: beforeRefresh,
    });
    await recorder.start();
    await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } });
    await recorder.append({ kind: "commands", tick: 2, value: { action: "move" } });

    const afterRefresh = new GhostLocalVault(createMemoryGhostVaultBackend(stores));
    const recovered = await afterRefresh.recoverIncompleteSessions();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ id: "crashed-run", status: "recovered", chunks: [{ sequence: 0 }] });
  });

  it("detects and quarantines corrupt chunks without preventing Vault startup", async () => {
    const backend = createMemoryGhostVaultBackend();
    const vault = new GhostLocalVault(backend);
    const recorder = new GhostStreamingRecorder({
      sessionId: "corrupt-run",
      createdAt: "2026-07-23T00:00:00.000Z",
      chunkEntries: 2,
      maxPendingWrites: 1,
      vault,
    });
    await recorder.start();
    await recorder.append({ kind: "events", tick: 1, value: { type: "run.started" } });
    await recorder.append({ kind: "events", tick: 2, value: { type: "wave.started" } });
    const manifest = await recorder.finalize("2026-07-23T00:01:00.000Z");
    const corruptId = manifest.chunks[0]?.id;
    if (corruptId === undefined) throw new Error("fixture chunk is missing");
    await backend.put("chunks", corruptId, "{\"corrupt\":true}");

    const doctor = new GhostDoctor(new GhostLocalVault(backend));
    const report = await doctor.scan("corrupt-run");
    expect(report).toMatchObject({ healthy: false, corruptChunkIds: [corruptId] });
    const repaired = await doctor.repairChild("corrupt-run", "corrupt-run-repaired");
    expect(repaired.repairedChildId).toBe("corrupt-run-repaired");
    expect(await backend.get("quarantine", corruptId)).toContain("corrupt");
    expect(await vault.getManifest("corrupt-run-repaired")).toMatchObject({
      status: "repaired", lineage: { parentId: "corrupt-run", relation: "repaired-from" },
    });
    expect(await doctor.rebuildIndex()).toBe(2);
  });

  it("stops oversized and decompression-bomb imports", async () => {
    const source = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostStreamingRecorder({
      sessionId: "import-source",
      createdAt: "2026-07-23T00:00:00.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
      vault: source,
    });
    await recorder.start();
    await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } });
    await recorder.finalize("2026-07-23T00:01:00.000Z");
    const exported = await source.exportCapsule("import-source");
    const destination = new GhostLocalVault(createMemoryGhostVaultBackend());
    await expect(destination.importCapsule(exported, {
      maxEncodedBytes: 10,
      maxChunks: 10,
      maxChunkBytes: 1_000,
      maxExpansionRatio: 10,
    })).rejects.toThrow(/encoded byte limit/u);

    const bomb: unknown = JSON.parse(exported);
    if (typeof bomb !== "object" || bomb === null || !("manifest" in bomb)
      || typeof bomb.manifest !== "object" || bomb.manifest === null || !("chunks" in bomb.manifest)
      || !Array.isArray(bomb.manifest.chunks) || typeof bomb.manifest.chunks[0] !== "object"
      || bomb.manifest.chunks[0] === null) {
      throw new Error("export fixture has an invalid shape");
    }
    const chunkCandidates: unknown[] = bomb.manifest.chunks;
    const firstChunk: unknown = chunkCandidates[0];
    if (typeof firstChunk !== "object" || firstChunk === null) throw new Error("export fixture chunk is invalid");
    if (!("compressedBytes" in firstChunk) || !("uncompressedBytes" in firstChunk)) {
      throw new Error("export fixture chunk lacks size fields");
    }
    firstChunk.compressedBytes = 1;
    firstChunk.uncompressedBytes = 10_000;
    await expect(destination.importCapsule(JSON.stringify(bomb), {
      maxEncodedBytes: 1_000_000,
      maxChunks: 10,
      maxChunkBytes: 1_000,
      maxExpansionRatio: 10,
    })).rejects.toThrow(/expansion/u);
  });

  it("declares fidelity downgrade under worker backpressure and exposes all Vault stores", async () => {
    let release: (() => void) | undefined;
    const delayedWorker: GhostEncoderWorkerPort = {
      async encode(payload, thumbnail): Promise<GhostEncodedChunk> {
        await new Promise<void>((resolve) => { release = resolve; });
        return createInlineGhostEncoderWorker().encode(payload, thumbnail);
      },
    };
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostStreamingRecorder({
      sessionId: "pressure-run",
      createdAt: "2026-07-23T00:00:00.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
      vault,
      worker: delayedWorker,
    });
    await recorder.start();
    const first = recorder.append({ kind: "commands", tick: 1, value: {} });
    await Promise.resolve();
    await recorder.append({ kind: "presentation", tick: 2, value: { x: 1 } });
    release?.();
    await first;
    const manifest = await recorder.finalize("2026-07-23T00:01:00.000Z");
    expect(manifest.fidelity).toMatchObject({ presentation: "dropped" });
    expect(manifest.fidelity.downgrades).toContain("presentation dropped under encoder backpressure");
    expect(GHOST_VAULT_STORES).toEqual([
      "manifests", "chunks", "assets", "indexes", "uploadJobs",
      "analysis", "lineage", "settings", "journals", "quarantine",
    ]);
  });
});
