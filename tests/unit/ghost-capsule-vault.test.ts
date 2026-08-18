import { describe, expect, it } from "vitest";

import {
  GHOST_VAULT_STORES,
  GhostDoctor,
  GhostCapsuleReader,
  GhostLocalVault,
  GhostStreamingRecorder,
  capsuleDebugJson,
  createGhostCapsuleManifestV2,
  createInlineGhostEncoderWorker,
  createMemoryGhostVaultBackend,
  ghostRootIntegrity,
  migrateGhostCapsuleManifestV1,
  parseGhostCapsuleManifest,
  type GhostEncodedChunk,
  type GhostEncoderWorkerPort,
  type TearGhostChunkIndexEntry,
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
    expect(await backend.keys("journals")).toEqual([]);
    await recorder.append({ kind: "commands", tick: 3, value: { action: "late-buffered" } });
    await expect(recorder.append({ kind: "commands", tick: 4, value: { action: "late-write" } })).rejects.toThrow(/no longer active/u);
    expect(await afterRefresh.getManifest("crashed-run")).toMatchObject({ status: "recovered" });
    expect(await backend.keys("journals")).toEqual([]);
  });

  it("refuses a duplicate recording session before it can overwrite durable evidence", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const first = new GhostStreamingRecorder({
      sessionId: "unique-capture", createdAt: "2026-07-23T00:00:00.000Z", chunkEntries: 1, maxPendingWrites: 1, vault,
    });
    await first.start();
    await first.append({ kind: "commands", tick: 1, value: { action: "jump" } });
    const original = await vault.getManifest("unique-capture");
    const duplicate = new GhostStreamingRecorder({
      sessionId: "unique-capture", createdAt: "2099-01-01T00:00:00.000Z", chunkEntries: 1, maxPendingWrites: 1, vault,
    });
    await expect(duplicate.start()).rejects.toThrow(/already exists/u);
    expect(await vault.getManifest("unique-capture")).toEqual(original);
  });

  it("loads verified named tracks back from a completed capsule", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostStreamingRecorder({
      sessionId: "reader-run", createdAt: "2026-07-28T00:00:00.000Z", chunkEntries: 1, maxPendingWrites: 1, vault,
      provenance: { runId: "reader-run", seed: "reader-seed", rulesetVersion: "rules-a" },
    });
    await recorder.start();
    await recorder.append({ kind: "commands", tick: 3, value: { command: { type: "dash" } } });
    await recorder.append({ kind: "rng", tick: 4, value: { gameplay: "state" } });
    await recorder.append({ kind: "results", tick: 4, value: { outcome: "defeat" } });
    await recorder.finalize("2026-07-28T00:00:01.000Z");

    const capsule = await new GhostCapsuleReader(vault).read("reader-run");
    expect(capsule.manifest.status).toBe("complete");
    expect(capsule.manifest.recordingProfile).toBe("forensic-qa");
    expect(capsule.manifest.provenance).toEqual({
      runId: "reader-run", seed: "reader-seed", rulesetVersion: "rules-a",
    });
    expect(capsule.maxTick).toBe(4);
    expect(capsule.tracks.commands).toEqual([{ kind: "commands", tick: 3, value: { command: { type: "dash" } } }]);
    expect(capsule.tracks.rng).toEqual([{ kind: "rng", tick: 4, value: { gameplay: "state" } }]);
    expect(capsule.tracks.results).toEqual([{ kind: "results", tick: 4, value: { outcome: "defeat" } }]);
  });

  it("removes a complete capsule, its chunks, indexes, journal, and owned assets in one Vault commit", async () => {
    const backend = createMemoryGhostVaultBackend();
    const vault = new GhostLocalVault(backend);
    const recorder = new GhostStreamingRecorder({
      sessionId: "deletion-source", createdAt: "2026-08-02T00:00:00.000Z", chunkEntries: 1, maxPendingWrites: 1, vault,
    });
    await recorder.start();
    await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } });
    const manifest = await recorder.finalize("2026-08-02T00:00:01.000Z");
    await backend.put("assets", "deletion-source:thumbnail:0", "owned-thumbnail");
    await vault.removeCapsule("deletion-source");
    expect(await vault.getManifest("deletion-source")).toBeUndefined();
    expect(await backend.get("indexes", "manifest:deletion-source")).toBeUndefined();
    expect(await backend.get("journals", "deletion-source")).toBeUndefined();
    expect(await backend.get("assets", "deletion-source:thumbnail:0")).toBeUndefined();
    expect(await Promise.all(manifest.chunks.map((chunk) => backend.get("chunks", chunk.id)))).toEqual([undefined]);
  });

  it("quarantines an interrupted recording whose committed evidence no longer validates", async () => {
    const stores = new Map<GhostVaultStore, Map<string, string>>();
    const backend = createMemoryGhostVaultBackend(stores);
    const beforeRefresh = new GhostLocalVault(backend);
    const recorder = new GhostStreamingRecorder({
      sessionId: "interrupted-corrupt-run",
      createdAt: "2026-07-28T00:00:00.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
      vault: beforeRefresh,
    });
    await recorder.start();
    await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } });
    const manifest = await beforeRefresh.getManifest("interrupted-corrupt-run");
    const chunk = manifest?.chunks[0];
    if (chunk === undefined) throw new Error("interrupted fixture did not commit a chunk");
    await backend.put("chunks", chunk.id, "{\"tampered\":true}");

    const recovered = await new GhostLocalVault(backend).recoverIncompleteSessions();
    expect(recovered).toMatchObject([{ id: "interrupted-corrupt-run", status: "quarantined" }]);
    expect(await backend.get("quarantine", "recovery:interrupted-corrupt-run")).toContain("checksum mismatch");
    expect(await backend.keys("journals")).toEqual([]);
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

    const doctor = new GhostDoctor(new GhostLocalVault(backend), () => "2026-07-23T00:02:00.000Z");
    const report = await doctor.scan("corrupt-run");
    expect(report).toMatchObject({ healthy: false, corruptChunkIds: [corruptId] });
    const repaired = await doctor.repairChild("corrupt-run", "corrupt-run-repaired");
    expect(repaired.repairedChildId).toBe("corrupt-run-repaired");
    expect(await backend.get("chunks", corruptId)).toContain("corrupt");
    expect(await backend.get("quarantine", `repair:corrupt-run-repaired:${corruptId}`)).toContain("corrupt");
    expect(JSON.parse(await backend.get("lineage", "repair:corrupt-run-repaired") ?? "{}")).toMatchObject({
      parentId: "corrupt-run", childId: "corrupt-run-repaired", relation: "repair",
    });
    expect(await vault.getManifest("corrupt-run-repaired")).toMatchObject({
      status: "repaired", createdAt: "2026-07-23T00:02:00.000Z", lineage: { parentId: "corrupt-run", relation: "repaired-from" },
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
    // The v1 reader remains supported; its legacy index has no manifest-wide
    // declaration hash, so this verifies its pre-existing expansion guard.
    (bomb as { manifest: { schemaVersion: number } }).manifest.schemaVersion = 1;
    await expect(destination.importCapsule(JSON.stringify(bomb), {
      maxEncodedBytes: 1_000_000,
      maxChunks: 10,
      maxChunkBytes: 1_000,
      maxExpansionRatio: 10,
    })).rejects.toThrow(/expansion/u);
  });

  it("rejects hostile imports before they can overwrite original Vault evidence", async () => {
    const source = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostStreamingRecorder({
      sessionId: "protected-import-source", createdAt: "2026-07-23T00:00:00.000Z",
      chunkEntries: 1, maxPendingWrites: 1, vault: source,
    });
    await recorder.start();
    await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } });
    await recorder.finalize("2026-07-23T00:01:00.000Z");
    const exported = await source.exportCapsule("protected-import-source");
    const backend = createMemoryGhostVaultBackend();
    const destination = new GhostLocalVault(backend);
    const original = await destination.importCapsule(exported);
    const originalChunk = original.chunks[0];
    if (originalChunk === undefined) throw new Error("protected import fixture needs a chunk");
    const originalBytes = await backend.get("chunks", originalChunk.id);

    const duplicate: unknown = JSON.parse(exported);
    await expect(destination.importCapsule(JSON.stringify(duplicate))).rejects.toThrow(/already exists/u);

    const hostile = JSON.parse(exported) as {
      manifest: { id: string; chunks: { id: string; encoding: string; compressedBytes: number; uncompressedBytes: number; checksum: string }[]; rootIntegrity: string };
      chunks: Record<string, string>;
    };
    const hostileChunk = hostile.manifest.chunks[0];
    if (hostileChunk === undefined) throw new Error("hostile import fixture needs a chunk");
    const replacement = await createInlineGhostEncoderWorker().encode([
      { kind: "commands", tick: 1, value: { action: "hostile-overwrite" } },
    ], false);
    hostile.manifest.id = "hostile-collision";
    hostileChunk.id = originalChunk.id;
    hostileChunk.encoding = replacement.encoding;
    hostileChunk.compressedBytes = replacement.compressedBytes;
    hostileChunk.uncompressedBytes = replacement.uncompressedBytes;
    hostileChunk.checksum = replacement.checksum;
    hostile.manifest.rootIntegrity = ghostRootIntegrity(hostile.manifest.chunks as unknown as readonly TearGhostChunkIndexEntry[]);
    hostile.chunks = { [originalChunk.id]: replacement.encoded };
    await expect(destination.importCapsule(JSON.stringify(hostile))).rejects.toThrow(/manifest integrity mismatch/u);

    const executableShape = JSON.parse(exported) as { manifest: { id: string; provenance?: Record<string, unknown> } };
    executableShape.manifest.id = "hostile-provenance";
    executableShape.manifest.provenance = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    await expect(destination.importCapsule(JSON.stringify(executableShape))).rejects.toThrow(/reserved key/u);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(await destination.getManifest(original.id)).toEqual(original);
    expect(await backend.get("chunks", originalChunk.id)).toBe(originalBytes);
  });

  it("writes a schema-v2 contract that binds declarations to the durable chunk root", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostStreamingRecorder({
      sessionId: "contract-v2", createdAt: "2026-08-02T00:00:00.000Z",
      chunkEntries: 1, maxPendingWrites: 1, vault, recordingProfile: "coaching",
      provenance: { replayContext: { format: "tear-ghost-replay-context", schemaVersion: 1 } },
    });
    await recorder.start();
    await recorder.append({ kind: "commands", tick: 1, value: { kind: "command", id: 1, tick: 1, command: { type: "jump" } } });
    const manifest = await recorder.finalize("2026-08-02T00:00:01.000Z");

    expect(manifest).toMatchObject({
      schemaVersion: 2,
      contract: {
        format: "tearghost-capsule-contract", schemaVersion: 1,
        tracks: { commands: "canonical-action-envelope-v1", keyframes: "tear-snapshot-v1" },
        quality: { recordingProfile: "coaching", presentation: "full", downgrades: [] },
      },
      integrity: { format: "tearghost-capsule-integrity", schemaVersion: 1, rootIntegrity: manifest.rootIntegrity },
    });

    const tampered = JSON.parse(await vault.exportCapsule("contract-v2")) as {
      manifest: { provenance: Record<string, unknown> };
    };
    tampered.manifest.provenance = { replayContext: { tampered: true } };
    await expect(new GhostLocalVault(createMemoryGhostVaultBackend()).importCapsule(JSON.stringify(tampered)))
      .rejects.toThrow(/manifest integrity mismatch/u);
  });

  it("migrates v1 manifests purely, preserves supported V2 extensions, and rejects future versions without writes", async () => {
    const legacy = parseGhostCapsuleManifest({
      format: "tearghost-capsule", schemaVersion: 1, id: "legacy-contract", status: "complete",
      createdAt: "2026-07-01T00:00:00.000Z", recordingProfile: "legacy-unknown", chunks: [],
      rootIntegrity: ghostRootIntegrity([]), fidelity: { presentation: "reduced", downgrades: ["legacy capture"] },
    });
    if (legacy.schemaVersion !== 1) throw new Error("legacy fixture did not parse as V1");
    const migrated = migrateGhostCapsuleManifestV1(legacy);
    expect(migrated).toMatchObject({ schemaVersion: 2, id: "legacy-contract", integrity: { rootIntegrity: legacy.rootIntegrity } });
    expect(legacy.schemaVersion).toBe(1);

    const source = new GhostLocalVault(createMemoryGhostVaultBackend());
    const extensible = createGhostCapsuleManifestV2({
      id: "extension-contract", status: "complete", createdAt: "2026-08-02T00:00:00.000Z",
      completedAt: "2026-08-02T00:00:01.000Z", recordingProfile: "coaching", chunks: [],
      rootIntegrity: ghostRootIntegrity([]),
      fidelity: { presentation: "full", downgrades: [] },
      extensions: { "com.tear.example": { note: "preserve me" } },
    });
    await source.putManifest(extensible);
    const exported = await source.exportCapsule(extensible.id);
    const destination = new GhostLocalVault(createMemoryGhostVaultBackend());
    await destination.importCapsule(exported);
    const reopened = await destination.getManifest(extensible.id);
    if (reopened?.schemaVersion !== 2) throw new Error("extension fixture did not reopen as V2");
    expect(reopened.extensions).toEqual({ "com.tear.example": { note: "preserve me" } });

    const future = JSON.parse(exported) as { manifest: { schemaVersion: number } };
    future.manifest.schemaVersion = 3;
    const untouched = new GhostLocalVault(createMemoryGhostVaultBackend());
    await expect(untouched.importCapsule(JSON.stringify(future))).rejects.toThrow(/schema version/u);
    expect(await untouched.backend().keys("manifests")).toEqual([]);
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
      "analysis", "lineage", "settings", "journals", "quarantine", "libraries",
    ]);
  });
});
