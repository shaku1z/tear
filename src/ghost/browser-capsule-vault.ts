import {
  GhostLocalVault,
  type TearGhostManifest,
} from "./capsule-vault";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import { GhostCapsuleReader, type GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope, type GhostCapsuleReplayMapping } from "./capsule-replay-envelope";
import { assessGhostReplayAdmission, type GhostReplayAdmission } from "./replay-admission";
import { verifyGhostCapsuleProductionReplay, type GhostProductionReplayVerification } from "./production-replay-verification";
import { createGhostProductionReplaySession } from "./production-replay-session";
import type { GhostPracticeChild, GhostPracticeMode } from "./replay-world";
import { GhostDoctor } from "./ghost-doctor";
import { maintainGhostVault, type GhostVaultMaintenanceOptions, type GhostVaultMaintenanceReport } from "./vault-maintenance";

export interface BrowserGhostVaultCatalog {
  readonly manifests: readonly TearGhostManifest[];
  readonly maintenance: GhostVaultMaintenanceReport;
}

export interface BrowserGhostVaultRepairResult {
  readonly sourceId: string;
  readonly childId: string;
  readonly reused: boolean;
}

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

/** Opens the real browser Vault, maintains it, then returns its verified catalog. */
export async function inspectBrowserGhostVault(
  factory: IDBFactory | undefined,
  options: GhostVaultMaintenanceOptions = {},
): Promise<BrowserGhostVaultCatalog> {
  if (factory === undefined) throw new Error("Ghost Vault is unavailable in this browser");
  const vault = await openBrowserGhostVault(factory);
  const maintenance = await maintainGhostVault(vault, options);
  const ids = await vault.backend().keys("manifests");
  const values = await Promise.all(ids.map((id) => vault.getManifest(id)));
  return Object.freeze({
    manifests: Object.freeze(values.filter((manifest): manifest is TearGhostManifest => manifest !== undefined)),
    maintenance,
  });
}

/** Repairs an unhealthy source into a new child while retaining the source evidence. */
export async function repairBrowserGhostCapsule(
  factory: IDBFactory | undefined,
  id: string,
): Promise<BrowserGhostVaultRepairResult> {
  if (factory === undefined) throw new Error("Ghost Vault is unavailable in this browser");
  const vault = await openBrowserGhostVault(factory);
  const doctor = new GhostDoctor(vault);
  const manifests = await Promise.all((await vault.backend().keys("manifests")).map((manifestId) => vault.getManifest(manifestId)));
  const children = manifests.filter((manifest): manifest is TearGhostManifest => manifest?.lineage?.parentId === id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  for (const child of children) {
    if ((await doctor.scan(child.id)).healthy) return Object.freeze({ sourceId: id, childId: child.id, reused: true });
  }
  let sequence = children.length + 1;
  let childId = `${id}:repaired:${String(sequence)}`;
  while (await vault.getManifest(childId) !== undefined) {
    sequence += 1;
    childId = `${id}:repaired:${String(sequence)}`;
  }
  await doctor.repairChild(id, childId);
  return Object.freeze({ sourceId: id, childId, reused: false });
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

/** Reopens a V3 capsule and compares its captured authoritative receipts in the production replay composition. */
export async function verifyBrowserGhostCapsuleProductionReplay(
  factory: IDBFactory | undefined,
  id: string,
): Promise<GhostProductionReplayVerification | undefined> {
  const capsule = await readBrowserGhostCapsule(factory, id);
  return capsule === undefined ? undefined : verifyGhostCapsuleProductionReplay(capsule);
}

/** Creates a non-persistent practice child from a verified durable replay checkpoint. */
export async function forkBrowserGhostCapsulePractice(
  factory: IDBFactory | undefined,
  id: string,
  tick: number,
  mode: GhostPracticeMode,
): Promise<GhostPracticeChild | undefined> {
  const capsule = await readBrowserGhostCapsule(factory, id);
  return capsule === undefined ? undefined : createGhostProductionReplaySession(capsule).forkPractice(tick, mode);
}
