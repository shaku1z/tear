import { describe, expect, it, vi } from "vitest";
import {
  GhostLocalVault,
  createMemoryGhostVaultBackend,
  ghostRootIntegrity,
  reviseGhostCapsuleManifest,
  type TearGhostManifest,
} from "../../src/ghost/capsule-vault";
import { GhostStreamingRecorder } from "../../src/ghost/streaming-recorder";
import { encodeGhostChunkPayload } from "../../src/ghost/capsule-codec";
import { stableVerificationHash } from "../../src/domain/hash";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  prepareGhostCapsuleArchive,
  prepareCompleteGhostCapsuleArchive,
  ghostArchiveData,
  NORMAL_GHOST_ARCHIVE_LIMITS,
} from "../../src/ghost/capsule-archive";

async function archiveFixture(payload?: unknown) {
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
  const recorder = new GhostStreamingRecorder({
    sessionId: "normal-archive",
    createdAt: "2026-10-19T00:00:00Z",
    chunkEntries: 16,
    maxPendingWrites: 1,
    vault,
  });
  await recorder.start();
  await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } });
  await recorder.finalize("2026-10-19T00:00:01Z");
  const root = JSON.parse(await vault.exportCapsule("normal-archive")) as {
    manifest: TearGhostManifest;
    chunks: Record<string, string>;
  };
  if (payload !== undefined) {
    const chunk = root.manifest.chunks[0];
    if (chunk === undefined) throw new Error("fixture missing chunk");
    const encoded = encodeGhostChunkPayload(payload);
    const chunks = root.manifest.chunks.map((entry) =>
      entry.id === chunk.id
        ? {
            ...entry,
            encoding: encoded.encoding,
            compressedBytes: encoded.compressedBytes,
            uncompressedBytes: encoded.uncompressedBytes,
            checksum: stableVerificationHash(encoded.encoded),
          }
        : entry,
    );
    root.manifest = reviseGhostCapsuleManifest(root.manifest, { chunks, rootIntegrity: ghostRootIntegrity(chunks) });
    root.chunks[chunk.id] = encoded.encoded;
  }
  return new TextEncoder().encode(JSON.stringify(root));
}

const normalArchive = prepareGhostCapsuleArchive;

describe("normal complete Ghost archive", () => {
  it.each([
    {},
    [{ kind: "events", tick: 1, value: {} }],
    [{ kind: "commands", tick: 2, value: {} }],
    [{ kind: "commands", tick: 1 }],
  ])("refuses checksum-correct unreadable entry payload %j", async (payload) => {
    await expect(normalArchive(await archiveFixture(payload))).rejects.toThrow();
  });
  it("accepts Reader-readable source-owned recorder data without requiring canonical replay command truth", async () => {
    const bytes = await archiveFixture(),
      expected = Uint8Array.from(bytes),
      archive = await normalArchive(bytes);
    bytes.fill(0);
    expect(archive.binding.sha256).toBe(createHash("sha256").update(expected).digest("hex"));
    expect(archive.binding.byteLength).toBe(expected.byteLength);
    expect(archive.manifest.status).toBe("complete");
    expect(() => ghostArchiveData({ ...archive })).toThrow(/preparation/);
  });
  it.each([
    "maxEncodedBytes",
    "maxChunks",
    "maxCompressedChunkBytes",
    "maxDecodedChunkBytes",
    "maxDecodedTotalBytes",
    "maxExpansionRatio",
    "maxEntriesPerChunk",
    "maxEntriesTotal",
    "maxLogicalReferencedChunkBytes",
  ] as const)("does not enlarge immutable %s policy", async (key) => {
    await expect(
      normalArchive(await archiveFixture(), { [key]: NORMAL_GHOST_ARCHIVE_LIMITS[key] + 1 }),
    ).rejects.toThrow(/lowered/);
  });
  it("enforces absolute byte and entry caps independently of ratios", async () => {
    const bytes = await archiveFixture([
      { kind: "commands", tick: 1, value: {} },
      { kind: "commands", tick: 1, value: {} },
    ]);
    for (const limits of [
      { maxEncodedBytes: 1 },
      { maxCompressedChunkBytes: 1 },
      { maxDecodedChunkBytes: 1 },
      { maxDecodedTotalBytes: 1 },
      { maxEntriesPerChunk: 1 },
      { maxEntriesTotal: 1 },
    ]) {
      await expect(normalArchive(bytes, limits)).rejects.toThrow();
    }
  });
  it("checks measured metadata and exact indexed key membership", async () => {
    const bytes = await archiveFixture(),
      root = JSON.parse(new TextDecoder().decode(bytes)) as {
        manifest: TearGhostManifest;
        chunks: Record<string, string>;
      };
    const chunks = root.manifest.chunks.map((entry) => ({ ...entry, uncompressedBytes: entry.uncompressedBytes + 1 }));
    root.manifest = reviseGhostCapsuleManifest(root.manifest, { chunks, rootIntegrity: ghostRootIntegrity(chunks) });
    await expect(normalArchive(new TextEncoder().encode(JSON.stringify(root)))).rejects.toThrow(/measured/);
    root.chunks.extra = "AAAA";
    await expect(normalArchive(new TextEncoder().encode(JSON.stringify(root)))).rejects.toThrow(/count/);
  });
  it("keeps supported schema-v1 data and schema-v2 extension declarations without rewriting encoded strings", async () => {
    const bytes = await archiveFixture(),
      root = JSON.parse(new TextDecoder().decode(bytes)) as {
        manifest: TearGhostManifest;
        chunks: Record<string, string>;
      };
    const legacy = JSON.parse(JSON.stringify(root.manifest)) as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete legacy.contract;
    delete legacy.integrity;
    const archive = await normalArchive(new TextEncoder().encode(JSON.stringify({ ...root, manifest: legacy })));
    expect(archive.manifest.schemaVersion).toBe(1);
    expect(ghostArchiveData(archive).chunks).toEqual(root.chunks);
    if (root.manifest.schemaVersion !== 2) throw new Error("source fixture schema differs");
    const manifest = reviseGhostCapsuleManifest(
      { ...root.manifest, extensions: { supportedUnknown: { data: [1, "retained"] } } },
      {},
    );
    const extended = await normalArchive(new TextEncoder().encode(JSON.stringify({ ...root, manifest })));
    expect(extended.manifest).toEqual(manifest);
    expect(ghostArchiveData(extended).chunks).toEqual(root.chunks);
  });
  it("complete download retains encoded strings and raw export remains available for incomplete forensic evidence", async () => {
    const bytes = await archiveFixture(),
      vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const manifest = await vault.importCapsule(new TextDecoder().decode(bytes));
    const downloaded = await prepareCompleteGhostCapsuleArchive(vault, manifest.id);
    const original = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    expect(JSON.parse(new TextDecoder().decode(downloaded.bytes))).toEqual(original);
    const first = manifest.chunks[0];
    if (first === undefined) throw new Error("missing chunk");
    await vault.backend().remove("chunks", first.id);
    await expect(vault.exportCapsule(manifest.id)).resolves.toBeTypeOf("string");
    await expect(prepareCompleteGhostCapsuleArchive(vault, manifest.id)).rejects.toThrow(/absent/);
  });
  it("refuses a source changed immediately before the download fence without rewriting it", async () => {
    const bytes = await archiveFixture(),
      base = createMemoryGhostVaultBackend(),
      vault = new GhostLocalVault(base);
    const manifest = await vault.importCapsule(new TextDecoder().decode(bytes));
    const first = manifest.chunks[0];
    if (first === undefined) throw new Error("missing chunk");
    const wrapped = new GhostLocalVault({
      ...base,
      async commitIfMatches(guards, writes) {
        await base.put("chunks", first.id, "changed");
        return base.commitIfMatches(guards, writes);
      },
    });
    await expect(prepareCompleteGhostCapsuleArchive(wrapped, manifest.id)).rejects.toThrow(/matches/);
    expect(await base.get("chunks", first.id)).toBe("changed");
  });
  it("rejects declared over-count before any chunk fetch and does not write", async () => {
    const bytes = await archiveFixture(),
      root = JSON.parse(new TextDecoder().decode(bytes)) as { manifest: TearGhostManifest },
      base = createMemoryGhostVaultBackend(),
      vault = new GhostLocalVault(base);
    await vault.importCapsule(new TextDecoder().decode(bytes));
    const first = root.manifest.chunks[0];
    if (first === undefined) throw new Error("missing chunk");
    const chunks = [first, { ...first, id: "second", sequence: 1 }],
      manifest = reviseGhostCapsuleManifest(root.manifest, { chunks, rootIntegrity: ghostRootIntegrity(chunks) });
    await base.put("manifests", manifest.id, JSON.stringify(manifest));
    let reads = 0,
      writes = 0;
    const observed = new GhostLocalVault({
      ...base,
      get(store, key) {
        if (store === "chunks") reads++;
        return base.get(store, key);
      },
      commitIfMatches(guards, rows) {
        writes += rows.length;
        return base.commitIfMatches(guards, rows);
      },
    });
    await expect(prepareCompleteGhostCapsuleArchive(observed, manifest.id, { maxChunks: 1 })).rejects.toThrow(/count/);
    expect(reads).toBe(0);
    expect(writes).toBe(0);
  });
  it.each(["oversized stored string", "cumulative JSON budget"])(
    "rejects %s before whole-archive encoding or writes",
    async (kind) => {
      const bytes = await archiveFixture(),
        base = createMemoryGhostVaultBackend(),
        vault = new GhostLocalVault(base),
        manifest = await vault.importCapsule(new TextDecoder().decode(bytes));
      const first = manifest.chunks[0];
      if (first === undefined) throw new Error("missing chunk");
      if (kind === "oversized stored string") await base.put("chunks", first.id, "A".repeat(60_000));
      let writes = 0;
      const observed = new GhostLocalVault({
        ...base,
        commitIfMatches(guards, rows) {
          writes += rows.length;
          return base.commitIfMatches(guards, rows);
        },
      });
      const encode = vi.spyOn(TextEncoder.prototype, "encode");
      try {
        await expect(
          prepareCompleteGhostCapsuleArchive(
            observed,
            manifest.id,
            kind === "oversized stored string"
              ? { maxCompressedChunkBytes: 100 }
              : { maxEncodedBytes: bytes.byteLength - 1 },
          ),
        ).rejects.toThrow(/encoded/);
        expect(encode).not.toHaveBeenCalled();
        expect(writes).toBe(0);
      } finally {
        encode.mockRestore();
      }
    },
  );
  it.runIf(process.env.TEAR_C39_ARCHIVE_FIXTURES !== undefined)(
    "validates explicitly supplied independent forensic archives (local input-readiness only)",
    async () => {
      const paths = process.env.TEAR_C39_ARCHIVE_FIXTURES?.split("|") ?? [];
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        const bytes = await readFile(path),
          archive = await normalArchive(bytes);
        expect(archive.binding.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      }
    },
  );
});
