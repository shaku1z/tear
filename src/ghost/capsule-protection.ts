import { requireRecord } from "../domain/records";
import { stableVerificationHash } from "../domain/hash";
import type { GhostVaultBackend, GhostVaultWrite, GhostVaultGuard } from "./capsule-vault-backend";
import { parseGhostCapsuleManifest } from "./capsule-contract";

/** Captures validated source bytes for the caller's final atomic transaction. */
export async function prepareGhostCapsuleSourceGuards(
  backend: GhostVaultBackend,
  id: string,
  rootIntegrity: string,
): Promise<readonly GhostVaultGuard[]> {
  const raw = await backend.get("manifests", id);
  if (raw === undefined) throw new RangeError("capsule source is unavailable");
  const manifest = parseGhostCapsuleManifest(JSON.parse(raw));
  if (manifest.id !== id || manifest.rootIntegrity !== rootIntegrity) throw new RangeError("capsule source changed");
  const guards: GhostVaultGuard[] = [{ store: "manifests", key: id, expected: raw }];
  for (const chunk of manifest.chunks) {
    const encoded = await backend.get("chunks", chunk.id);
    if (encoded === undefined || stableVerificationHash(encoded) !== chunk.checksum)
      throw new RangeError("capsule source chunk is unavailable or changed");
    guards.push({ store: "chunks", key: chunk.id, expected: encoded });
  }
  return Object.freeze(guards);
}

export type { GhostVaultGuard } from "./capsule-vault-backend";
export interface GhostCapsuleProtection {
  readonly format: "ghost-capsule-protection";
  readonly schemaVersion: 1;
  readonly capsuleId: string;
  readonly rootIntegrity: string;
  readonly owners: readonly string[];
}

/** One known key is the CAS fence, including when there are no owners yet. */
export function ghostCapsuleProtectionKey(id: string): string {
  if (id.trim().length === 0) throw new TypeError("capsule protection ID is required");
  return `ghost-capsule-protection:v1:${id}`;
}

export function parseGhostCapsuleProtection(raw: string, id: string): GhostCapsuleProtection {
  const value: unknown = JSON.parse(raw);
  const entry = requireRecord(value, "invalid capsule protection");
  const owners: readonly unknown[] = Array.isArray(entry.owners) ? (entry.owners as unknown[]) : [];
  if (
    Object.keys(entry).length !== 5 ||
    entry.format !== "ghost-capsule-protection" ||
    entry.schemaVersion !== 1 ||
    entry.capsuleId !== id ||
    typeof entry.rootIntegrity !== "string" ||
    !/^[a-f0-9]{16}$/u.test(entry.rootIntegrity) ||
    !Array.isArray(entry.owners) ||
    owners.length === 0 ||
    owners.some((owner) => typeof owner !== "string" || owner.trim().length === 0) ||
    new Set(owners).size !== owners.length
  )
    throw new TypeError("invalid capsule protection");
  return Object.freeze({
    format: "ghost-capsule-protection",
    schemaVersion: 1,
    capsuleId: id,
    rootIntegrity: entry.rootIntegrity,
    owners: Object.freeze([...(owners as readonly string[])]),
  });
}

/** Compose with the owner's own admission guards/writes; this does not grant custody. */
export async function prepareGhostCapsuleProtection(
  backend: GhostVaultBackend,
  id: string,
  rootIntegrity: string,
  owner: string,
): Promise<{
  readonly guards: readonly GhostVaultGuard[];
  readonly writes: readonly GhostVaultWrite[];
}> {
  if (owner.trim().length === 0) throw new TypeError("capsule protection owner is required");
  const manifestRaw = await backend.get("manifests", id);
  if (manifestRaw === undefined || parseGhostCapsuleManifest(JSON.parse(manifestRaw)).rootIntegrity !== rootIntegrity) {
    throw new RangeError("capsule protection requires the exact retained source");
  }
  const key = ghostCapsuleProtectionKey(id),
    raw = await backend.get("analysis", key);
  const previous = raw === undefined ? undefined : parseGhostCapsuleProtection(raw, id);
  if (previous !== undefined && previous.rootIntegrity !== rootIntegrity)
    throw new RangeError("capsule protection source changed");
  const owners = [...new Set([...(previous?.owners ?? []), owner])].sort();
  const value: GhostCapsuleProtection = {
    format: "ghost-capsule-protection",
    schemaVersion: 1,
    capsuleId: id,
    rootIntegrity,
    owners,
  };
  parseGhostCapsuleProtection(JSON.stringify(value), id);
  return Object.freeze({
    guards: Object.freeze([
      { store: "manifests" as const, key: id, expected: manifestRaw },
      { store: "analysis" as const, key, ...(raw === undefined ? {} : { expected: raw }) },
    ]),
    writes: Object.freeze(
      previous !== undefined && stableVerificationHash(previous.owners) === stableVerificationHash(owners)
        ? []
        : [{ store: "analysis" as const, key, value: JSON.stringify(value) }],
    ),
  });
}
