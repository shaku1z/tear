import { canonicalStringify, stableVerificationHash } from "../domain/hash";
import type { ghostPortableArchiveData } from "./capsule-paired-archive";
import { ghostCapsuleProtectionKey, parseGhostCapsuleProtection } from "./capsule-protection";
import type { readGhostColdRestoreCompletion } from "./cold-restore-job";
import type { GhostVaultBackend, GhostVaultGuard, GhostVaultWrite, GhostVaultStore } from "./capsule-vault-backend";
import { parseGhostCapsuleManifest as parseContractManifest, type TearGhostManifest } from "./capsule-contract";
import type { TearGhostChunkIndexEntry } from "./capsule-vault-backend";

/** Canonical algorithms shared by forensic Vault and strict normal archives. */
export function ghostRootIntegrity(chunks: readonly TearGhostChunkIndexEntry[]): string {
  return stableVerificationHash(
    chunks.map((chunk) => ({
      id: chunk.id,
      checksum: chunk.checksum,
      kind: chunk.kind,
      sequence: chunk.sequence,
      fromTick: chunk.fromTick,
      toTick: chunk.toTick,
    })),
  );
}
export function parseGhostCapsuleManifest(value: unknown): TearGhostManifest {
  const manifest = parseContractManifest(value);
  if (manifest.schemaVersion === 2 && ghostRootIntegrity(manifest.chunks) !== manifest.rootIntegrity)
    throw new TypeError("capsule manifest integrity mismatch");
  return manifest;
}
export async function ghostArchiveSha256(bytes: Uint8Array): Promise<string> {
  const runtime: { crypto?: { subtle?: SubtleCrypto } } = globalThis,
    subtle = runtime.crypto?.subtle;
  if (subtle === undefined) throw new DOMException("Ghost archive SHA256 is unavailable", "NotSupportedError");
  return Array.from(new Uint8Array(await subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function ghostImportGuard(store: GhostVaultStore, key: string, expected: string | undefined): GhostVaultGuard {
  return Object.freeze({ store, key, ...(expected === undefined ? {} : { expected }) });
}

export interface GhostImportBaseline {
  readonly kind: "imported" | "existing-exact";
  readonly slots: readonly Readonly<{ store: GhostVaultStore; key: string; sha256: string | null }>[];
}
declare const planBrand: unique symbol;
export interface GhostCapsuleImportPlan {
  readonly [planBrand]: true;
}
interface PlanData {
  readonly backend: GhostVaultBackend;
  readonly owner: object;
  readonly archive: ReturnType<typeof ghostPortableArchiveData>;
  readonly baseline: GhostImportBaseline;
  readonly guards: readonly GhostVaultGuard[];
  readonly writes: readonly GhostVaultWrite[];
}
const plans = new WeakMap<GhostCapsuleImportPlan, PlanData>();
function read(plan: GhostCapsuleImportPlan): PlanData {
  const data = plans.get(plan);
  if (data === undefined) throw new TypeError("invalid Ghost import plan");
  return data;
}
export function ghostCapsuleImportBaseline(plan: GhostCapsuleImportPlan): GhostImportBaseline {
  return read(plan).baseline;
}
export function ghostCapsuleImportGuards(plan: GhostCapsuleImportPlan): readonly GhostVaultGuard[] {
  return read(plan).guards;
}

export async function prepareGhostCapsuleImport(
  backend: GhostVaultBackend,
  owner: object,
  data: ReturnType<typeof ghostPortableArchiveData>,
  expected?: GhostImportBaseline,
): Promise<GhostCapsuleImportPlan> {
  const guards: GhostVaultGuard[] = [],
    writes: GhostVaultWrite[] = [];
  let allExisting = true;
  for (const member of data.members) {
    const manifest = member.manifest,
      raw = await backend.get("manifests", manifest.id);
    const indexKey = `manifest:${manifest.id}`,
      protectionKey = ghostCapsuleProtectionKey(manifest.id);
    const index = await backend.get("indexes", indexKey),
      protection = await backend.get("analysis", protectionKey);
    const indexValue = JSON.stringify({
      status: manifest.status,
      createdAt: manifest.createdAt,
      chunks: manifest.chunks.length,
    });
    if (raw === undefined && index !== undefined)
      throw new TypeError("orphan Ghost manifest index conflicts with import");
    if (
      raw !== undefined &&
      (canonicalStringify(parseGhostCapsuleManifest(JSON.parse(raw) as unknown)) !== canonicalStringify(manifest) ||
        index === undefined ||
        canonicalStringify(JSON.parse(index) as unknown) !== canonicalStringify(JSON.parse(indexValue) as unknown))
    )
      throw new TypeError("existing Ghost custody differs from complete archive");
    if (
      protection !== undefined &&
      parseGhostCapsuleProtection(protection, manifest.id).rootIntegrity !== manifest.rootIntegrity
    )
      throw new TypeError("Ghost import protection root differs");
    guards.push(
      ghostImportGuard("manifests", manifest.id, raw),
      ghostImportGuard("indexes", indexKey, index),
      ghostImportGuard("analysis", protectionKey, protection),
    );
    if (raw === undefined) allExisting = false;
    for (const entry of manifest.chunks) {
      const stored = await backend.get("chunks", entry.id),
        text = member.chunks[entry.id];
      if (typeof text !== "string") throw new TypeError("prepared Ghost archive chunk is absent");
      guards.push(ghostImportGuard("chunks", entry.id, stored));
      if ((raw !== undefined && stored === undefined) || (stored !== undefined && stored !== text))
        throw new TypeError("stored Ghost chunk is missing or differs from archive");
      if (stored === undefined) writes.push({ store: "chunks", key: entry.id, value: text });
    }
    if (raw === undefined)
      writes.push(
        { store: "manifests", key: manifest.id, value: JSON.stringify(manifest) },
        { store: "indexes", key: indexKey, value: indexValue },
      );
  }
  const unique = <T extends GhostVaultGuard | GhostVaultWrite>(rows: readonly T[]): T[] => {
    const result = new Map<string, T>();
    for (const row of rows) {
      const key = `${row.store}:${row.key}`,
        old = result.get(key);
      if (old !== undefined && canonicalStringify(old) !== canonicalStringify(row))
        throw new TypeError("shared Ghost import slots differ");
      result.set(key, row);
    }
    return [...result.values()];
  };
  const unionGuards = unique(guards),
    unionWrites = unique(writes);
  const slots = await Promise.all(
    unionGuards.map(async (guard) =>
      Object.freeze({
        store: guard.store,
        key: guard.key,
        sha256:
          guard.expected === undefined ? null : await ghostArchiveSha256(new TextEncoder().encode(guard.expected)),
      }),
    ),
  );
  const baseline: GhostImportBaseline = Object.freeze({
    kind: allExisting ? "existing-exact" : "imported",
    slots: Object.freeze(slots),
  });
  if (expected !== undefined && canonicalStringify(expected) !== canonicalStringify(baseline))
    throw new TypeError("cold restore destination changed from its initial baseline");
  // A guard-only fence makes the baseline one coherent observation, not a set
  // of individually observed slots that never existed together.
  await backend.commitIfMatches(unionGuards, []);
  const plan = Object.freeze({}) as GhostCapsuleImportPlan;
  plans.set(
    plan,
    Object.freeze({
      backend,
      owner,
      archive: data,
      baseline,
      guards: Object.freeze(unionGuards.map((guard) => Object.freeze(guard))),
      writes: Object.freeze(unionWrites.map((write) => Object.freeze(write))),
    }),
  );
  return plan;
}

async function admitQuota(data: PlanData): Promise<void> {
  if (data.baseline.kind === "existing-exact") return;
  const sizes = new Map<string, number>();
  for (const id of await data.backend.keys("manifests")) {
    const raw = await data.backend.get("manifests", id);
    if (raw === undefined) throw new TypeError("Ghost quota catalog changed");
    const manifest = parseGhostCapsuleManifest(JSON.parse(raw) as unknown);
    if (manifest.id !== id) throw new TypeError("Ghost quota catalog identity differs");
    for (const chunk of manifest.chunks) {
      if (
        !Number.isSafeInteger(chunk.compressedBytes) ||
        chunk.compressedBytes < 1 ||
        (sizes.has(chunk.id) && sizes.get(chunk.id) !== chunk.compressedBytes)
      )
        throw new TypeError("Ghost quota catalog sizes are inconsistent");
      sizes.set(chunk.id, chunk.compressedBytes);
    }
  }
  for (const member of data.archive.members)
    for (const chunk of member.manifest.chunks) {
      if (sizes.has(chunk.id) && sizes.get(chunk.id) !== chunk.compressedBytes)
        throw new TypeError("shared Ghost chunk size differs");
      sizes.set(chunk.id, chunk.compressedBytes);
    }
  let total = 0;
  for (const size of sizes.values()) {
    total += size;
    if (!Number.isSafeInteger(total) || total > data.archive.limits.maxLogicalReferencedChunkBytes)
      throw new RangeError("Ghost import exceeds logical quota without eviction");
  }
}
export type GhostImportCommit = (
  build: () => Promise<Readonly<{ guards: readonly GhostVaultGuard[]; writes: readonly GhostVaultWrite[] }>>,
) => Promise<boolean>;
export async function commitGhostCapsuleImport(
  backend: GhostVaultBackend,
  owner: object,
  plan: GhostCapsuleImportPlan,
  owned: ReturnType<typeof readGhostColdRestoreCompletion>,
  commit: GhostImportCommit,
): Promise<"imported" | "existing-exact"> {
  const data = read(plan);
  const jobKey = `ghost-cold-restore:job:v1:${owned.job.id}`,
    resultKey = `ghost-cold-restore:result:v1:${owned.job.id}`;
  if (
    owned.guards.length !== 2 ||
    owned.writes.length !== 2 ||
    owned.guards[0]?.store !== "analysis" ||
    owned.guards[0].key !== jobKey ||
    owned.guards[1]?.store !== "analysis" ||
    owned.guards[1].key !== resultKey ||
    owned.guards[1].expected !== undefined ||
    owned.writes[0]?.store !== "analysis" ||
    owned.writes[0].key !== jobKey ||
    owned.writes[1]?.store !== "analysis" ||
    owned.writes[1].key !== resultKey
  )
    throw new TypeError("owned Ghost completion keys differ");
  if (
    data.backend !== backend ||
    data.owner !== owner ||
    canonicalStringify(owned.job.binding) !== canonicalStringify(data.archive.binding) ||
    canonicalStringify(owned.job.baseline) !== canonicalStringify(data.baseline)
  )
    throw new TypeError("owned completion does not match Ghost import plan");
  const guards = Object.freeze([...data.guards, ...owned.guards]),
    writes = Object.freeze([...data.writes, ...owned.writes]);
  if (
    new Set(guards.map((entry) => `${entry.store}:${entry.key}`)).size !== guards.length ||
    new Set(writes.map((entry) => `${entry.store}:${entry.key}`)).size !== writes.length
  )
    throw new TypeError("Ghost import ownership slots overlap");
  await commit(async () => {
    await admitQuota(data);
    return { guards, writes };
  });
  return data.baseline.kind;
}

/** Same forensic collision/guard semantics, factored out of the line-bounded Vault. */
export async function prepareForensicGhostImport(
  backend: GhostVaultBackend,
  manifest: TearGhostManifest,
  chunks: Readonly<Record<string, unknown>>,
  manifestWrites: readonly GhostVaultWrite[],
): Promise<Readonly<{ guards: readonly GhostVaultGuard[]; writes: readonly GhostVaultWrite[] }>> {
  if ((await backend.get("manifests", manifest.id)) !== undefined)
    throw new RangeError(`capsule already exists: ${manifest.id}`);
  const protectionKey = ghostCapsuleProtectionKey(manifest.id),
    protectionRaw = await backend.get("analysis", protectionKey);
  if (
    protectionRaw !== undefined &&
    parseGhostCapsuleProtection(protectionRaw, manifest.id).rootIntegrity !== manifest.rootIntegrity
  )
    throw new RangeError("capsule import conflicts with retained source protection");
  const guards: GhostVaultGuard[] = [
      { store: "manifests", key: manifest.id },
      ghostImportGuard("analysis", protectionKey, protectionRaw),
    ],
    writes: GhostVaultWrite[] = [];
  for (const entry of manifest.chunks) {
    const encoded = chunks[entry.id];
    if (typeof encoded !== "string") throw new TypeError(`capsule chunk is missing: ${entry.id}`);
    const existing = await backend.get("chunks", entry.id);
    guards.push(ghostImportGuard("chunks", entry.id, existing));
    if (existing !== undefined && existing !== encoded)
      throw new RangeError(`capsule chunk id conflicts with stored evidence: ${entry.id}`);
    if (existing === undefined) writes.push({ store: "chunks", key: entry.id, value: encoded });
  }
  return { guards, writes: [...writes, ...manifestWrites] };
}
