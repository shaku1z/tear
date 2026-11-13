import { readGhostBossMemory } from "./boss-memory-origin";
import { verifyBossMemory } from "./boss-memory";
import { GhostCapsuleReader } from "./capsule-reader";
import { canonicalStringify, stableVerificationHash } from "../replay/hash";
import { GHOST_CHUNK_CODECS } from "./capsule-codec";
import { validateGhostCapsuleEntries } from "./capsule-reader";
import {
  ghostRootIntegrity,
  parseGhostCapsuleManifest,
  ghostArchiveSha256,
  ghostImportGuard,
} from "./capsule-import-plan";
import type { GhostLocalVault, TearGhostManifest } from "./capsule-vault";
export { ghostArchiveSha256 } from "./capsule-import-plan";
import { ghostCapsuleProtectionKey, parseGhostCapsuleProtection } from "./capsule-protection";
import type { GhostVaultGuard } from "./capsule-vault-backend";

export const NORMAL_GHOST_ARCHIVE_LIMITS = Object.freeze({
  maxEncodedBytes: 64 * 1024 * 1024,
  maxChunks: 20_000,
  maxCompressedChunkBytes: 8 * 1024 * 1024,
  maxDecodedChunkBytes: 16 * 1024 * 1024,
  maxDecodedTotalBytes: 128 * 1024 * 1024,
  maxExpansionRatio: 100,
  maxEntriesPerChunk: 65_536,
  maxEntriesTotal: 1_000_000,
  maxLogicalReferencedChunkBytes: 256 * 1024 * 1024,
});
export type NormalGhostArchiveLimits = { readonly [Key in keyof typeof NORMAL_GHOST_ARCHIVE_LIMITS]: number };
export interface GhostArchiveBinding {
  readonly protocol: "ghost-normal-archive-v1";
  readonly sha256: string;
  readonly byteLength: number;
  readonly manifestDigest: string;
  readonly capsuleId: string;
  readonly schemaVersion: number;
  readonly rootIntegrity: string;
  readonly limitsDigest: string;
}
declare const archiveBrand: unique symbol;
export interface PreparedGhostCapsuleArchive {
  readonly [archiveBrand]: true;
  readonly binding: GhostArchiveBinding;
  readonly manifest: TearGhostManifest;
  readonly limits: NormalGhostArchiveLimits;
}
interface ArchiveData {
  readonly manifest: TearGhostManifest;
  readonly chunks: Readonly<Record<string, string>>;
  readonly limits: NormalGhostArchiveLimits;
  readonly binding: GhostArchiveBinding;
  readonly totalEntries: number;
}
const archives = new WeakMap<PreparedGhostCapsuleArchive, ArchiveData>();
export function ghostArchiveData(archive: PreparedGhostCapsuleArchive): ArchiveData {
  const data = archives.get(archive);
  if (data === undefined) throw new TypeError("Ghost archive preparation is invalid");
  return data;
}
export function normalGhostArchiveLimits(input: Partial<NormalGhostArchiveLimits> = {}): NormalGhostArchiveLimits {
  if (Object.keys(input).some((key) => !Object.hasOwn(NORMAL_GHOST_ARCHIVE_LIMITS, key)))
    throw new TypeError("unknown Ghost archive limit");
  const limits = { ...NORMAL_GHOST_ARCHIVE_LIMITS, ...input };
  for (const key of Object.keys(limits) as (keyof NormalGhostArchiveLimits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > NORMAL_GHOST_ARCHIVE_LIMITS[key])
      throw new RangeError("normal Ghost archive limits may only be lowered");
  }
  return Object.freeze(limits);
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Ghost archive must contain data objects");
  return value as Record<string, unknown>;
}
function validateManifestPolicy(manifest: TearGhostManifest, limits: NormalGhostArchiveLimits): void {
  if (manifest.status !== "complete") throw new TypeError("normal Ghost archive requires a complete manifest");
  if (manifest.chunks.length > limits.maxChunks) throw new RangeError("Ghost archive chunk count exceeds limit");
  if (ghostRootIntegrity(manifest.chunks) !== manifest.rootIntegrity)
    throw new TypeError("Ghost archive root mismatch");
  const ids = new Set<string>(),
    sequences = new Set<number>();
  let declared = 0;
  for (const entry of manifest.chunks) {
    if (
      !entry.id ||
      ["__proto__", "constructor", "prototype"].includes(entry.id) ||
      ids.has(entry.id) ||
      sequences.has(entry.sequence)
    )
      throw new TypeError("Ghost archive duplicate or reserved chunk index");
    ids.add(entry.id);
    sequences.add(entry.sequence);
    if (
      ![entry.sequence, entry.fromTick, entry.toTick].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      entry.fromTick > entry.toTick
    )
      throw new TypeError("Ghost archive chunk tick domain is invalid");
    if (
      ![entry.compressedBytes, entry.uncompressedBytes].every((value) => Number.isSafeInteger(value) && value > 0) ||
      entry.compressedBytes > limits.maxCompressedChunkBytes ||
      entry.uncompressedBytes > limits.maxDecodedChunkBytes ||
      entry.uncompressedBytes / entry.compressedBytes > limits.maxExpansionRatio
    )
      throw new RangeError("Ghost archive chunk exceeds measured size policy");
    declared += entry.uncompressedBytes;
    if (!Number.isSafeInteger(declared) || declared > limits.maxDecodedTotalBytes)
      throw new RangeError("Ghost archive exceeds total decoded byte limit");
  }
}
/** Counts UTF-8 without allocating an additional whole-string byte buffer. */
function utf8Length(text: string, limit: number): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    if (bytes > limit) throw new RangeError("Ghost archive exceeds encoded output budget");
  }
  return bytes;
}
export async function prepareGhostCapsuleArchive(
  input: Uint8Array,
  policy: Partial<NormalGhostArchiveLimits> = {},
  remainingEntries?: number,
): Promise<PreparedGhostCapsuleArchive> {
  const limits = normalGhostArchiveLimits(policy);
  if (
    remainingEntries !== undefined &&
    (!Number.isSafeInteger(remainingEntries) || remainingEntries < 0 || remainingEntries > limits.maxEntriesTotal)
  )
    throw new RangeError("invalid aggregate entry budget");
  if (input.byteLength > limits.maxEncodedBytes) throw new RangeError("Ghost archive exceeds encoded byte limit");
  const bytes = Uint8Array.from(input),
    sha256 = await ghostArchiveSha256(bytes);
  const root = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown);
  if (Object.keys(root).length !== 2 || !Object.hasOwn(root, "manifest") || !Object.hasOwn(root, "chunks"))
    throw new TypeError("Ghost archive envelope is unsupported");
  const manifest = parseGhostCapsuleManifest(root.manifest),
    chunks = object(root.chunks);
  validateManifestPolicy(manifest, limits);
  if (Object.keys(chunks).length !== manifest.chunks.length) throw new RangeError("Ghost archive chunk count differs");
  let totalEntries = 0;
  const encoded: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const entry of manifest.chunks) {
    const text = chunks[entry.id];
    if (typeof text !== "string" || !Object.hasOwn(chunks, entry.id) || stableVerificationHash(text) !== entry.checksum)
      throw new TypeError("Ghost archive chunk is missing or checksum mismatched");
    const decoded = await GHOST_CHUNK_CODECS.decodeMeasured(
      entry.encoding,
      text,
      limits.maxCompressedChunkBytes,
      entry.uncompressedBytes,
    );
    if (decoded.compressedBytes !== entry.compressedBytes || decoded.decodedBytes !== entry.uncompressedBytes)
      throw new TypeError("Ghost archive measured byte counts differ");
    validateGhostCapsuleEntries(decoded.value, entry.kind, entry.fromTick, entry.toTick, limits.maxEntriesPerChunk);
    totalEntries += decoded.value.length;
    if (
      !Number.isSafeInteger(totalEntries) ||
      totalEntries > Math.min(limits.maxEntriesTotal, remainingEntries ?? limits.maxEntriesTotal)
    )
      throw new RangeError("Ghost archive exceeds total entry limit");
    encoded[entry.id] = text;
  }
  if (readGhostBossMemory(manifest.provenance)) {
    const capsule = await new GhostCapsuleReader({
      getManifest: () => Promise.resolve(manifest),
      readChunk: async (index) =>
        (
          await GHOST_CHUNK_CODECS.decodeMeasured(
            index.encoding,
            encoded[index.id] ?? "",
            limits.maxCompressedChunkBytes,
            index.uncompressedBytes,
          )
        ).value,
    }).read(manifest.id);
    const verification = verifyBossMemory(capsule);
    if (verification.status !== "verified")
      throw new TypeError(`Boss Memory import refuses: ${verification.mappingIssues.join("; ")}`);
  }
  const binding: GhostArchiveBinding = Object.freeze({
    protocol: "ghost-normal-archive-v1",
    sha256,
    byteLength: bytes.byteLength,
    manifestDigest: await ghostArchiveSha256(new TextEncoder().encode(canonicalStringify(manifest))),
    capsuleId: manifest.id,
    schemaVersion: manifest.schemaVersion,
    rootIntegrity: manifest.rootIntegrity,
    limitsDigest: await ghostArchiveSha256(new TextEncoder().encode(canonicalStringify(limits))),
  });
  const archive = Object.freeze({ binding, manifest, limits }) as PreparedGhostCapsuleArchive;
  archives.set(archive, Object.freeze({ binding, manifest, limits, chunks: Object.freeze(encoded), totalEntries }));
  return archive;
}

/** Validates original encoded strings before normal download; no maintenance or repair. */
export async function prepareCompleteGhostCapsuleArchive(
  vault: GhostLocalVault,
  id: string,
  limits: Partial<NormalGhostArchiveLimits> = {},
): Promise<Readonly<{ bytes: Uint8Array; binding: GhostArchiveBinding }>> {
  const policy = normalGhostArchiveLimits(limits),
    backend = vault.backend(),
    raw = await backend.get("manifests", id);
  if (raw === undefined) throw new RangeError("Ghost archive source is absent");
  utf8Length(raw, policy.maxEncodedBytes);
  const manifest = parseGhostCapsuleManifest(JSON.parse(raw) as unknown),
    indexKey = `manifest:${id}`,
    protectionKey = ghostCapsuleProtectionKey(id);
  validateManifestPolicy(manifest, policy);
  let outputBytes = utf8Length(`{"manifest":${JSON.stringify(manifest)},"chunks":{}}`, policy.maxEncodedBytes);
  const index = await backend.get("indexes", indexKey),
    protection = await backend.get("analysis", protectionKey);
  if (
    manifest.id !== id ||
    index === undefined ||
    canonicalStringify(JSON.parse(index) as unknown) !==
      canonicalStringify({ status: manifest.status, createdAt: manifest.createdAt, chunks: manifest.chunks.length })
  )
    throw new TypeError("complete archive source index differs");
  if (protection !== undefined && parseGhostCapsuleProtection(protection, id).rootIntegrity !== manifest.rootIntegrity)
    throw new TypeError("complete archive source protection differs");
  const guards: GhostVaultGuard[] = [
    { store: "manifests", key: id, expected: raw },
    { store: "indexes", key: indexKey, expected: index },
    ghostImportGuard("analysis", protectionKey, protection),
  ];
  const chunks: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const entry of manifest.chunks) {
    // Backend get may allocate one already-corrupt stored string; bound every
    // additional retention/copy and the whole output before serialization.
    const text = await backend.get("chunks", entry.id);
    if (text === undefined) throw new TypeError("complete archive source chunk is absent");
    if (text.length > Math.ceil(policy.maxCompressedChunkBytes / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(text))
      throw new RangeError("complete archive chunk exceeds encoded policy");
    outputBytes +=
      utf8Length(JSON.stringify(entry.id), policy.maxEncodedBytes) + 1 + text.length + 2 + (guards.length > 3 ? 1 : 0);
    if (outputBytes > policy.maxEncodedBytes) throw new RangeError("complete archive exceeds encoded output budget");
    chunks[entry.id] = text;
    guards.push({ store: "chunks", key: entry.id, expected: text });
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ manifest, chunks })),
    archive = await prepareGhostCapsuleArchive(bytes, policy);
  await backend.commitIfMatches(guards, []);
  return Object.freeze({ bytes, binding: archive.binding });
}
