import {
  GhostLocalVault,
  parseGhostCapsuleManifest,
  type GhostVaultGuard,
  type TearGhostManifest,
} from "./capsule-vault";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import { GhostCapsuleReader, type GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope, type GhostCapsuleReplayMapping } from "./capsule-replay-envelope";
import { assessGhostReplayAdmission, type GhostReplayAdmission } from "./replay-admission";
import { verifyGhostCapsuleProductionReplay, type GhostProductionReplayVerification } from "./production-replay-verification";
import { createGhostProductionReplaySession } from "./production-replay-session";
import type { GhostPracticeChild, GhostPracticeMode } from "./replay-world";
import { GhostDoctor, ghostDoctorManifestIndexWrite } from "./ghost-doctor";
import { maintainGhostVault, type GhostVaultMaintenanceOptions, type GhostVaultMaintenanceReport } from "./vault-maintenance";
import { GhostVaultKnowledgeLibraries } from "./durable-knowledge-libraries";

export interface BrowserGhostVaultCatalog {
  readonly manifests: readonly TearGhostManifest[];
  readonly repairMetadata?: readonly Readonly<{ id: string; complete: boolean }>[];
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

/** File operations inspect custody without quota eviction, index repair or maintenance receipts. */
export async function inspectBrowserGhostVaultReadOnly(factory: IDBFactory | undefined): Promise<BrowserGhostVaultCatalog> {
  if (factory === undefined) throw new Error("Ghost Vault is unavailable in this browser");
  const vault = await openBrowserGhostVault(factory), doctor = new GhostDoctor(vault);
  const manifests = await listBrowserGhostCapsuleManifests(factory);
  const libraries = new GhostVaultKnowledgeLibraries(vault.backend());
  const reports = await Promise.all(manifests.map((manifest) => doctor.scan(manifest.id)));
  const integrity = manifests.map((manifest, index) => Object.freeze({ id: manifest.id, healthy: reports[index]?.healthy === true }));
  const repairMetadata = await Promise.all(manifests.map(async (manifest, index) => {
    const report = reports[index];
    let complete = false;
    if (report !== undefined && !report.healthy) {
      try {
        const prepared = await libraries.prepareCorruptCapsuleRecord(manifest, report, manifest.createdAt);
        const write = ghostDoctorManifestIndexWrite(manifest);
        complete = prepared.write === undefined && await vault.backend().get(write.store, write.key) === write.value;
      } catch { /* Conflicting metadata remains visible for explicit repair, never rewritten on inspection. */ }
    }
    return Object.freeze({ id: manifest.id, complete });
  }));
  return Object.freeze({ manifests, repairMetadata: Object.freeze(repairMetadata), maintenance: Object.freeze({ schemaVersion: 1, checkedAt: new Date().toISOString(), maximumBytes: 0,
    evictedCapsuleIds: Object.freeze([]), integrity: Object.freeze(integrity), rebuiltIndexes: 0,
    libraries: await libraries.inventory() }) });
}

/** Repairs an unhealthy source into a new child while retaining the source evidence. */
export async function repairBrowserGhostCapsule(
  factory: IDBFactory | undefined,
  id: string,
): Promise<BrowserGhostVaultRepairResult> {
  if (factory === undefined) throw new Error("Ghost Vault is unavailable in this browser");
  const vault = await openBrowserGhostVault(factory);
  const doctor = new GhostDoctor(vault), backend = vault.backend();
  const sourceRaw = await backend.get("manifests", id);
  if (sourceRaw === undefined) throw new RangeError(`manifest does not exist: ${id}`);
  const source = parseGhostCapsuleManifest(JSON.parse(sourceRaw));
  if (source.id !== id) throw new TypeError("repair source identity conflicts with its storage key");
  const chunkGuards = async (manifest: TearGhostManifest): Promise<GhostVaultGuard[]> => Promise.all(manifest.chunks.map(async (chunk) => {
    const raw = await backend.get("chunks", chunk.id);
    return { store: "chunks" as const, key: chunk.id, ...(raw === undefined ? {} : { expected: raw }) };
  }));
  const sourceChunks = await chunkGuards(source);
  const report = await doctor.scan(id);
  const membership = await new GhostVaultKnowledgeLibraries(backend).prepareCorruptCapsuleRecord(source, report, new Date().toISOString());
  const indexWrite = ghostDoctorManifestIndexWrite(source), indexRaw = await backend.get(indexWrite.store, indexWrite.key);
  const manifests = await Promise.all((await backend.keys("manifests")).map((manifestId) => vault.getManifest(manifestId)));
  const children = manifests.filter((manifest): manifest is TearGhostManifest => manifest?.lineage?.parentId === id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  let selected: Readonly<{ id: string; raw: string; chunks: readonly GhostVaultGuard[] }> | undefined;
  for (const child of children) {
    const raw = await backend.get("manifests", child.id);
    if (raw === undefined) continue;
    const retained = parseGhostCapsuleManifest(JSON.parse(raw));
    if (retained.id !== child.id || retained.status !== "repaired" || retained.lineage?.parentId !== id) {
      throw new TypeError("repair child custody changed before metadata commit");
    }
    const chunks = await chunkGuards(retained);
    if ((await doctor.scan(child.id)).healthy) { selected = { id: child.id, raw, chunks }; break; }
  }
  const reused = selected !== undefined;
  if (selected === undefined) {
    let sequence = children.length + 1;
    let childId = `${id}:repaired:${String(sequence)}`;
    while (await vault.getManifest(childId) !== undefined) {
      sequence += 1;
      childId = `${id}:repaired:${String(sequence)}`;
    }
    await doctor.repairChild(id, childId);
    const raw = await backend.get("manifests", childId);
    if (raw === undefined) throw new RangeError("repair child disappeared before metadata commit");
    const child = parseGhostCapsuleManifest(JSON.parse(raw)), chunks = await chunkGuards(child);
    if (child.id !== childId || child.status !== "repaired" || child.lineage?.parentId !== id || !(await doctor.scan(childId)).healthy) {
      throw new TypeError("repair child custody changed before metadata commit");
    }
    selected = { id: childId, raw, chunks };
  }
  // This action never adopts source or metadata drift after validation. A child
  // already committed remains forensic evidence and can be reused on an explicit retry.
  await backend.commitIfMatches([
    { store: "manifests", key: id, expected: sourceRaw }, ...sourceChunks,
    { store: "manifests", key: selected.id, expected: selected.raw }, ...selected.chunks,
    { store: "indexes", key: indexWrite.key, ...(indexRaw === undefined ? {} : { expected: indexRaw }) }, membership.guard,
  ], [ ...(indexRaw === indexWrite.value ? [] : [indexWrite]), ...(membership.write === undefined ? [] : [membership.write]) ]);
  return Object.freeze({ sourceId: id, childId: selected.id, reused });
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

/** Test/build evidence reopens a fresh source-owned production composition for one seek. */
export async function seekBrowserGhostCapsuleProductionReplay(
  factory: IDBFactory | undefined,
  id: string,
  tick: number,
): Promise<ReturnType<ReturnType<typeof createGhostProductionReplaySession>["seek"]> | undefined> {
  const capsule = await readBrowserGhostCapsule(factory, id);
  return capsule === undefined ? undefined : createGhostProductionReplaySession(capsule).seek(tick);
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
