import {
  createIndexedDbGhostVaultBackend,
  GhostLocalVault,
  type TearGhostManifest,
} from "./capsule-vault";
import { GhostCapsuleReader, type GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope, type GhostCapsuleReplayMapping } from "./capsule-replay-envelope";
import { assessGhostReplayAdmission, type GhostReplayAdmission } from "./replay-admission";

/** Browser adapter for reopening durable Ghost Vault records outside a live recorder. */
async function openBrowserGhostVault(factory: IDBFactory): Promise<GhostLocalVault> {
  return new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory));
}

/** Lists durable manifests without retaining or trusting a live recorder instance. */
export async function listBrowserGhostCapsuleManifests(factory: IDBFactory | undefined): Promise<readonly TearGhostManifest[]> {
  if (factory === undefined) return Object.freeze([]);
  const vault = await openBrowserGhostVault(factory);
  const ids = await vault.backend().keys("manifests");
  const manifests = await Promise.all(ids.map((id) => vault.getManifest(id)));
  return Object.freeze(manifests.filter((manifest): manifest is TearGhostManifest => manifest !== undefined));
}

/** Reads a persisted capsule through the normal validated Vault reader. */
export async function readBrowserGhostCapsule(
  factory: IDBFactory | undefined,
  id: string,
): Promise<GhostReadCapsule | undefined> {
  if (factory === undefined) return undefined;
  return new GhostCapsuleReader(await openBrowserGhostVault(factory)).read(id);
}

/** Reopens a persisted capsule and maps only strict V3 truth tracks for tooling. */
export async function readBrowserGhostCapsuleReplay(
  factory: IDBFactory | undefined,
  id: string,
): Promise<GhostCapsuleReplayMapping | undefined> {
  const capsule = await readBrowserGhostCapsule(factory, id);
  return capsule === undefined ? undefined : mapGhostCapsuleToReplayEnvelope(capsule);
}

/** Reports replay admission without claiming that the live app is a replay runtime. */
export async function readBrowserGhostCapsuleReplayAdmission(
  factory: IDBFactory | undefined,
  id: string,
): Promise<GhostReplayAdmission | undefined> {
  const capsule = await readBrowserGhostCapsule(factory, id);
  return capsule === undefined ? undefined : assessGhostReplayAdmission(capsule);
}
