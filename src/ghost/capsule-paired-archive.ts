import { isObject, isRecord } from "../domain/records";
import { parseGhostCapsuleManifest } from "./capsule-import-plan";
import { canonicalStringify } from "../domain/hash";
import {
  ghostArchiveData,
  ghostArchiveSha256,
  normalGhostArchiveLimits,
  prepareCompleteGhostCapsuleArchive,
  prepareGhostCapsuleArchive,
  type GhostArchiveBinding,
  type NormalGhostArchiveLimits,
  type PreparedGhostCapsuleArchive,
} from "./capsule-archive";
import { GhostCapsuleReader } from "./capsule-reader";
import { GHOST_CHUNK_CODECS } from "./capsule-codec";
import { admitGhostFinaleCompanion, readGhostFinaleCompanion } from "./finale-companion";
import { prepareGhostCapsuleSourceGuards } from "./capsule-protection";
import type { GhostLocalVault } from "./capsule-vault";
import type { GhostVaultGuard } from "./capsule-vault-backend";

export interface GhostPairedArchiveBinding extends Omit<GhostArchiveBinding, "protocol"> {
  readonly protocol: "ghost-linked-archive-v1";
  readonly members: readonly [GhostArchiveBinding, GhostArchiveBinding];
}
export type GhostPortableArchiveBinding = GhostArchiveBinding | GhostPairedArchiveBinding;
declare const pairedBrand: unique symbol;
export interface PreparedGhostPairedArchive {
  readonly [pairedBrand]: true;
  readonly binding: GhostPairedArchiveBinding;
  readonly limits: NormalGhostArchiveLimits;
  readonly members: readonly [PreparedGhostCapsuleArchive, PreparedGhostCapsuleArchive];
}
export type PreparedGhostPortableArchive = PreparedGhostCapsuleArchive | PreparedGhostPairedArchive;
const pairs = new WeakSet<PreparedGhostPairedArchive>();
export function ghostPortableArchiveData(archive: PreparedGhostPortableArchive) {
  if (archive.binding.protocol === "ghost-normal-archive-v1") {
    const data = ghostArchiveData(archive as PreparedGhostCapsuleArchive);
    return { binding: archive.binding, limits: archive.limits, members: [data] as readonly (typeof data)[] };
  }
  const pair = archive as PreparedGhostPairedArchive;
  if (!pairs.has(pair)) throw new TypeError("Ghost pair preparation is invalid");
  return { binding: pair.binding, limits: pair.limits, members: pair.members.map(ghostArchiveData) };
}
export async function readPreparedGhostCapsuleArchive(archive: PreparedGhostCapsuleArchive) {
  const data = ghostArchiveData(archive);
  return new GhostCapsuleReader({
    getManifest: (id) => Promise.resolve(id === data.manifest.id ? data.manifest : undefined),
    readChunk: async (entry) => {
      const text = data.chunks[entry.id];
      if (text === undefined) throw new TypeError("Missing prepared pair chunk");
      return (
        await GHOST_CHUNK_CODECS.decodeMeasured(
          entry.encoding,
          text,
          data.limits.maxCompressedChunkBytes,
          entry.uncompressedBytes,
        )
      ).value;
    },
  }).read(data.manifest.id);
}
/** The existing single archive remains unchanged; the new envelope contains its exact JSON strings. */
export async function prepareGhostPortableArchive(
  input: Uint8Array,
  policy: Partial<NormalGhostArchiveLimits> = {},
): Promise<PreparedGhostPortableArchive> {
  const limits = normalGhostArchiveLimits(policy);
  if (input.byteLength > limits.maxEncodedBytes) throw new RangeError("Ghost pair exceeds encoded byte limit");
  const bytes = Uint8Array.from(input),
    root: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!isRecord(root) || !("format" in root)) return prepareGhostCapsuleArchive(bytes, limits);
  const value = root;
  if (
    Object.keys(value).length !== 4 ||
    value.format !== "tearghost-linked-archive" ||
    value.version !== 1 ||
    typeof value.parent !== "string" ||
    typeof value.companion !== "string"
  )
    throw new TypeError("Unsupported paired Ghost envelope");
  // Reject aggregate declared work before either member's chunk decoder runs.
  const declared = [value.parent, value.companion].map((text) => {
    const inner: unknown = JSON.parse(text);
    if (!isObject(inner) || !("manifest" in inner)) throw new TypeError("Pair member envelope is invalid");
    return parseGhostCapsuleManifest(inner.manifest);
  });
  if (
    declared.reduce((n, m) => n + m.chunks.length, 0) > limits.maxChunks ||
    declared.reduce((n, m) => n + m.chunks.reduce((sum, c) => sum + c.uncompressedBytes, 0), 0) >
      limits.maxDecodedTotalBytes
  )
    throw new RangeError("Ghost pair exceeds aggregate limits");
  const parent = await prepareGhostCapsuleArchive(new TextEncoder().encode(value.parent), limits);
  const companion = await prepareGhostCapsuleArchive(
    new TextEncoder().encode(value.companion),
    limits,
    limits.maxEntriesTotal - ghostArchiveData(parent).totalEntries,
  );
  const members = [parent, companion] as const,
    data = members.map(ghostArchiveData);
  if (
    parent.manifest.id === companion.manifest.id ||
    data.reduce((n, d) => n + d.manifest.chunks.length, 0) > limits.maxChunks ||
    data.reduce((n, d) => n + d.totalEntries, 0) > limits.maxEntriesTotal ||
    data.reduce((n, d) => n + d.manifest.chunks.reduce((sum, c) => sum + c.uncompressedBytes, 0), 0) >
      limits.maxDecodedTotalBytes
  )
    throw new RangeError("Ghost pair exceeds aggregate limits");
  const shared = new Map<string, string>();
  for (const member of data)
    for (const [key, text] of Object.entries(member.chunks)) {
      if (shared.has(key) && shared.get(key) !== text) throw new TypeError("Shared pair chunk bytes differ");
      shared.set(key, text);
    }
  if (readGhostFinaleCompanion(parent.manifest.provenance) !== undefined)
    throw new TypeError("Pair parent cannot itself be a finale companion");
  admitGhostFinaleCompanion(
    await readPreparedGhostCapsuleArchive(companion),
    await readPreparedGhostCapsuleArchive(parent),
  );
  const binding: GhostPairedArchiveBinding = Object.freeze({
    ...parent.binding,
    protocol: "ghost-linked-archive-v1",
    sha256: await ghostArchiveSha256(bytes),
    byteLength: bytes.byteLength,
    manifestDigest: await ghostArchiveSha256(
      new TextEncoder().encode(canonicalStringify(members.map((m) => m.binding.manifestDigest))),
    ),
    members: Object.freeze([parent.binding, companion.binding] as const),
  });
  const pair = Object.freeze({ binding, limits, members: Object.freeze(members) }) as PreparedGhostPairedArchive;
  pairs.add(pair);
  return pair;
}
function unionGuards(guards: readonly GhostVaultGuard[]): readonly GhostVaultGuard[] {
  const union = new Map<string, GhostVaultGuard>();
  for (const guard of guards) {
    const key = `${guard.store}:${guard.key}`,
      old = union.get(key);
    if (old !== undefined && old.expected !== guard.expected) throw new TypeError("Pair source custody changed");
    union.set(key, guard);
  }
  return [...union.values()];
}
/** Explicit paired download; source holds are guarded, never exported as authority. */
export async function prepareCompleteGhostPairedArchive(
  vault: GhostLocalVault,
  id: string,
  policy: Partial<NormalGhostArchiveLimits> = {},
) {
  const limits = normalGhostArchiveLimits(policy),
    selected = await vault.getManifest(id);
  if (selected === undefined) throw new TypeError("Pair source unavailable");
  const declaration = readGhostFinaleCompanion(selected.provenance);
  const parentId = declaration?.parentId ?? id;
  const candidates =
    declaration === undefined
      ? (await Promise.all((await vault.backend().keys("manifests")).map((key) => vault.getManifest(key)))).filter(
          (m) => m?.status === "complete" && readGhostFinaleCompanion(m.provenance)?.parentId === id,
        )
      : [selected];
  if (candidates.length !== 1) throw new TypeError("Linked pair requires one unambiguous companion");
  const child = candidates[0];
  if (child === undefined) throw new TypeError("Pair companion unavailable");
  const parent = await vault.getManifest(parentId);
  if (parent === undefined) throw new TypeError("Pair parent unavailable");
  const guards = unionGuards([
    ...(await prepareGhostCapsuleSourceGuards(vault.backend(), parentId, parent.rootIntegrity)),
    ...(await prepareGhostCapsuleSourceGuards(vault.backend(), child.id, child.rootIntegrity)),
  ]);
  const first = await prepareCompleteGhostCapsuleArchive(vault, parentId, limits),
    second = await prepareCompleteGhostCapsuleArchive(vault, child.id, limits);
  // Inner strings are retained byte-for-byte; the outer escaping counts toward the same file cap.
  const envelope = {
    format: "tearghost-linked-archive",
    version: 1,
    parent: new TextDecoder().decode(first.bytes),
    companion: new TextDecoder().decode(second.bytes),
  };
  const encodedParent = JSON.stringify(envelope.parent),
    encodedCompanion = JSON.stringify(envelope.companion);
  const overhead = new TextEncoder().encode(JSON.stringify({ ...envelope, parent: "", companion: "" })).byteLength - 4;
  if (
    new TextEncoder().encode(encodedParent).byteLength +
      new TextEncoder().encode(encodedCompanion).byteLength +
      overhead >
    limits.maxEncodedBytes
  )
    throw new RangeError("Pair exceeds encoded output budget");
  const bytes = new TextEncoder().encode(JSON.stringify(envelope)),
    archive = await prepareGhostPortableArchive(bytes, limits);
  await vault.backend().commitIfMatches(guards, []);
  return Object.freeze({ bytes, binding: archive.binding });
}
