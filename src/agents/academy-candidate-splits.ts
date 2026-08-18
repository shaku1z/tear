import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCandidateCurationStore } from "./academy-candidate-curation";
import type { TearAcademyCandidateQualityStore } from "./academy-candidate-quality";

const SPLIT_KEY = "academy-candidate-split:v1:";
const MANIFEST_KEY = "academy-pre-corpus-manifest:v1:";
export type TearAcademyDatasetSplitV1 = "training" | "validation" | "calibration" | "test" | "hidden-release-exam";
export interface TearAcademyManifestReader { readonly kind: "trainer" | "examiner"; readonly id: string; }
export interface TearAcademyCandidateSplitAssignmentV1 {
  readonly format: "tear-academy-candidate-split-assignment"; readonly schemaVersion: 1;
  readonly candidateHash: string; readonly custodyRecordHash: string; readonly assessmentHash: string; readonly curationDecisionHash: string;
  readonly split: TearAcademyDatasetSplitV1;
  readonly lineage: Readonly<{ player: string; session: string; seed: string }>;
  readonly assignedAt: string; readonly actor: string; readonly assignmentHash: string;
}
export interface TearAcademyCandidateSplitRequest { readonly candidateHash: string; readonly split: TearAcademyDatasetSplitV1; readonly assignedAt: string; readonly actor: string; }
export interface TearAcademyPreCorpusManifestV1 { readonly format: "tear-academy-pre-corpus-manifest"; readonly schemaVersion: 1; readonly id: string; readonly version: number; readonly createdAt: string; readonly previousManifestHash?: string; readonly entries: readonly TearAcademyCandidateSplitAssignmentV1[]; readonly rootHash: string; readonly manifestHash: string; }
export interface TearAcademyPreCorpusManifestPublishRequest { readonly id: string; readonly version: number; readonly createdAt: string; readonly reader: TearAcademyManifestReader; readonly previousManifestHash?: string; }
function ne(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function time(value: unknown): value is string { return ne(value) && Number.isFinite(Date.parse(value)); }
function key(hash: string): string { return `${SPLIT_KEY}${hash}`; }
function manifestKey(id: string, version: number): string { return `${MANIFEST_KEY}${id}:${String(version)}`; }
function hash(value: Omit<TearAcademyCandidateSplitAssignmentV1, "assignmentHash">): string { return stableVerificationHash(value); }
function freeze(value: Omit<TearAcademyCandidateSplitAssignmentV1, "assignmentHash">): TearAcademyCandidateSplitAssignmentV1 { return Object.freeze({ ...value, lineage: Object.freeze({ ...value.lineage }), assignmentHash: hash(value) }); }
function parse(value: string): TearAcademyCandidateSplitAssignmentV1 {
  const raw: unknown = JSON.parse(value); if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("invalid Academy split assignment");
  const entry = raw as Record<string, unknown>; const lineage = entry.lineage as Record<string, unknown> | undefined;
  if (entry.format !== "tear-academy-candidate-split-assignment" || entry.schemaVersion !== 1 || !/^[a-f0-9]{16}$/u.test(String(entry.candidateHash)) || !/^[a-f0-9]{16}$/u.test(String(entry.custodyRecordHash)) || !/^[a-f0-9]{16}$/u.test(String(entry.assessmentHash)) || !/^[a-f0-9]{16}$/u.test(String(entry.curationDecisionHash)) || !["training", "validation", "calibration", "test", "hidden-release-exam"].includes(String(entry.split)) || lineage === undefined || !ne(lineage.player) || !ne(lineage.session) || !ne(lineage.seed) || !time(entry.assignedAt) || !ne(entry.actor) || !ne(entry.assignmentHash)) throw new TypeError("invalid Academy split assignment");
  const typed = entry as unknown as Omit<TearAcademyCandidateSplitAssignmentV1, "assignmentHash"> & { assignmentHash: string }; const { assignmentHash, ...draft } = typed;
  if (assignmentHash !== hash(draft)) throw new TypeError("Academy split assignment integrity mismatch"); return freeze(draft);
}
function parseManifest(value: string): TearAcademyPreCorpusManifestV1 {
  const raw: unknown = JSON.parse(value);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("invalid Academy manifest");
  const entry = raw as Record<string, unknown>;
  if (entry.format !== "tear-academy-pre-corpus-manifest" || entry.schemaVersion !== 1 || !ne(entry.id)
    || !Number.isSafeInteger(entry.version) || Number(entry.version) < 1 || !time(entry.createdAt)
    || !Array.isArray(entry.entries) || !ne(entry.rootHash) || !ne(entry.manifestHash)) {
    throw new TypeError("Academy manifest integrity mismatch");
  }
  const typed = entry as unknown as TearAcademyPreCorpusManifestV1;
  const { manifestHash, ...draft } = typed;
  if (manifestHash !== stableVerificationHash(draft)) throw new TypeError("Academy manifest integrity mismatch");
  return Object.freeze({ ...typed, entries: Object.freeze(typed.entries.map((item) => Object.freeze({ ...item }))) });
}
/** Immutable C31 pre-corpus split ledger; it cannot construct a corpus sample. */
export class TearAcademyCandidateSplitStore {
  readonly #backend: GhostVaultBackend; readonly #custody: TearAcademyCandidateCustodyStore; readonly #quality: TearAcademyCandidateQualityStore; readonly #curation: TearAcademyCandidateCurationStore;
  constructor(backend: GhostVaultBackend, custody: TearAcademyCandidateCustodyStore, quality: TearAcademyCandidateQualityStore, curation: TearAcademyCandidateCurationStore) { if (backend !== custody.backend() || backend !== quality.backend() || backend !== curation.backend()) throw new TypeError("C31 split stores must share one Vault backend"); this.#backend = backend; this.#custody = custody; this.#quality = quality; this.#curation = curation; }
  async assign(input: TearAcademyCandidateSplitRequest): Promise<TearAcademyCandidateSplitAssignmentV1> {
    if (!/^[a-f0-9]{16}$/u.test(input.candidateHash) || !["training", "validation", "calibration", "test", "hidden-release-exam"].includes(input.split) || !time(input.assignedAt) || !ne(input.actor)) throw new TypeError("invalid C31 split request");
    const custody = await this.#custody.get(input.candidateHash); const quality = await this.#quality.get(input.candidateHash); const curation = await this.#curation.get(input.candidateHash);
    if (custody?.status !== "held" || !custody.privacyRetention.authorizedActorIds.includes(input.actor) || quality?.disposition !== "review-required" || curation?.disposition !== "curation-approved" || curation.custodyRecordHash !== custody.recordHash || curation.assessmentHash !== quality.assessmentHash || !(await this.#curation.active(input.assignedAt)).some((entry) => entry.candidateHash === input.candidateHash)) throw new RangeError("C31 split requires active approved curated custody");
    if (await this.#backend.get("analysis", key(input.candidateHash)) !== undefined) throw new TypeError("Academy split assignment already exists");
    const player = custody.privacyRetention.dataSubjectId ?? `anonymous:${input.candidateHash}`;
    const lineage = Object.freeze({ player, session: custody.candidateId, seed: quality.metadata.seed });
    const inventory = await this.inventory();
    if (inventory.some((entry) => entry.split !== input.split && (entry.lineage.player === lineage.player || entry.lineage.session === lineage.session || entry.lineage.seed === lineage.seed))) throw new RangeError("C31 split lineage cannot cross dataset partitions");
    const assignment = freeze({ format: "tear-academy-candidate-split-assignment", schemaVersion: 1, candidateHash: custody.candidateHash, custodyRecordHash: custody.recordHash, assessmentHash: quality.assessmentHash, curationDecisionHash: curation.decisionHash, split: input.split, lineage, assignedAt: input.assignedAt, actor: input.actor });
    await this.#backend.commit([Object.freeze({ store: "analysis", key: key(assignment.candidateHash), value: JSON.stringify(assignment) })]); return assignment;
  }
  async inventory(): Promise<readonly TearAcademyCandidateSplitAssignmentV1[]> { const rows: TearAcademyCandidateSplitAssignmentV1[] = []; for (const name of await this.#backend.keys("analysis")) { if (!name.startsWith(SPLIT_KEY)) continue; const value = await this.#backend.get("analysis", name); if (value === undefined) continue; rows.push(parse(value)); } return Object.freeze(rows.sort((a, b) => a.candidateHash.localeCompare(b.candidateHash))); }
  async get(candidateHash: string): Promise<TearAcademyCandidateSplitAssignmentV1 | undefined> { const value = await this.#backend.get("analysis", key(candidateHash)); return value === undefined ? undefined : parse(value); }
  async manifest(id: string, createdAt: string, reader: TearAcademyManifestReader, version = 1, previousManifestHash?: string): Promise<TearAcademyPreCorpusManifestV1> { if (!ne(id) || !time(createdAt) || !ne(reader.id) || !Number.isSafeInteger(version) || version < 1) throw new TypeError("invalid C31 manifest request"); const active = new Set((await this.#curation.active(createdAt)).map((entry) => entry.candidateHash)); const entries = Object.freeze((await this.inventory()).filter((entry) => active.has(entry.candidateHash) && (reader.kind === "examiner" || entry.split !== "hidden-release-exam"))); const draft = { format: "tear-academy-pre-corpus-manifest" as const, schemaVersion: 1 as const, id, version, createdAt, ...(previousManifestHash === undefined ? {} : { previousManifestHash }), entries, rootHash: stableVerificationHash(entries.map((entry) => entry.assignmentHash)) }; return Object.freeze({ ...draft, manifestHash: stableVerificationHash(draft) }); }
  async publishManifest(input: TearAcademyPreCorpusManifestPublishRequest): Promise<TearAcademyPreCorpusManifestV1> { const manifest = await this.manifest(input.id, input.createdAt, input.reader, input.version, input.previousManifestHash); const name = manifestKey(manifest.id, manifest.version); if (await this.#backend.get("analysis", name) !== undefined) throw new TypeError("Academy manifest version already exists"); if (manifest.version > 1 && (!ne(input.previousManifestHash) || (await this.getManifest(manifest.id, manifest.version - 1))?.manifestHash !== input.previousManifestHash)) throw new RangeError("C31 manifest revision requires its exact predecessor"); await this.#backend.commit([Object.freeze({ store: "analysis", key: name, value: JSON.stringify(manifest) })]); return manifest; }
  async getManifest(id: string, version: number): Promise<TearAcademyPreCorpusManifestV1 | undefined> {
    const value = await this.#backend.get("analysis", manifestKey(id, version));
    if (value === undefined) return undefined;
    const manifest = parseManifest(value);
    if (manifest.id !== id || manifest.version !== version) throw new TypeError("Academy manifest integrity mismatch");
    return manifest;
  }
  async manifestInventory(): Promise<readonly TearAcademyPreCorpusManifestV1[]> {
    const manifests: TearAcademyPreCorpusManifestV1[] = [];
    for (const name of await this.#backend.keys("analysis")) {
      if (!name.startsWith(MANIFEST_KEY)) continue;
      const value = await this.#backend.get("analysis", name);
      if (value !== undefined) manifests.push(parseManifest(value));
    }
    return Object.freeze(manifests.sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version));
  }
}
