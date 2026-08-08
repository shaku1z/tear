import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusManifestV1, TearAcademyCorpusStore } from "./academy-corpus";
import { parseTearFoundryJob, transitionTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";

const HASH = /^[a-f0-9]{16}$/u;
const KEY = "foundry-job-curated-manifest:v1:";

export interface TearFoundryCuratedManifestRequestV1 { readonly id: string; readonly trainerId: string; readonly version: number; }
export interface TearFoundryCuratedManifestReceiptV1 {
  readonly format: "tear-foundry-curated-manifest-receipt";
  readonly schemaVersion: 1;
  readonly job: Readonly<{ id: string; sourceJobHash: string; resultJobHash: string }>;
  readonly admittedAt: string;
  readonly disposition: "authorized" | "no-eligible-curated-manifest";
  readonly manifest?: Readonly<{ id: string; trainerId: string; version: number; manifestHash: string; rootHash: string; entryHashes: readonly string[] }>;
  readonly receiptHash: string;
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function time(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function freeze(draft: Omit<TearFoundryCuratedManifestReceiptV1, "receiptHash">): TearFoundryCuratedManifestReceiptV1 {
  if (!time(draft.admittedAt) || !["authorized", "no-eligible-curated-manifest"].includes(draft.disposition) || !hash(draft.job.sourceJobHash) || !hash(draft.job.resultJobHash)) throw new TypeError("invalid Foundry curated-manifest receipt");
  const manifest = draft.manifest;
  if (draft.disposition === "authorized" && (manifest === undefined || !text(manifest.id) || !text(manifest.trainerId) || !Number.isSafeInteger(manifest.version) || manifest.version < 1 || !hash(manifest.manifestHash) || !hash(manifest.rootHash) || manifest.entryHashes.length < 1 || !manifest.entryHashes.every(hash) || new Set(manifest.entryHashes).size !== manifest.entryHashes.length)) throw new TypeError("invalid authorized Foundry curated-manifest receipt");
  if (draft.disposition !== "authorized" && manifest !== undefined) throw new TypeError("failed Foundry curated-manifest receipt cannot contain a manifest");
  const value = Object.freeze({ ...draft, job: Object.freeze({ ...draft.job }), ...(manifest === undefined ? {} : { manifest: Object.freeze({ ...manifest, entryHashes: Object.freeze([...manifest.entryHashes].sort()) }) }) });
  return Object.freeze({ ...value, receiptHash: stableVerificationHash(value) });
}
function exactManifest(manifest: TearAcademyCorpusManifestV1 | undefined, request: TearFoundryCuratedManifestRequestV1, recordHashes: readonly string[]): boolean {
  if (manifest?.id !== request.id || manifest.reader.kind !== "trainer" || manifest.reader.id !== request.trainerId || manifest.version !== request.version || manifest.entries.length < 1 || manifest.entries.some((entry) => entry.split === "hidden-release-exam")) return false;
  const entries = manifest.entries.map((entry) => entry.custodyRecordHash);
  return entries.length === recordHashes.length && new Set(entries).size === entries.length && entries.every((hashValue) => recordHashes.includes(hashValue));
}

/** Admits only immutable C31-reviewed trainer manifests; it never curates, publishes, loads a dataset, or trains. */
export class TearFoundryCuratedManifestExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore, corpus: TearAcademyCorpusStore) {
    if (jobs.backend() !== custody.backend() || jobs.backend() !== corpus.backend()) throw new TypeError("Foundry curated manifest must share the C31 Vault boundary");
    this.#jobs = jobs; this.#custody = custody; this.#corpus = corpus;
  }
  async admit(jobInput: TearFoundryJobV1, request: TearFoundryCuratedManifestRequestV1, admittedAt: string): Promise<Readonly<{ job: TearFoundryJobV1; receipt: TearFoundryCuratedManifestReceiptV1 }>> {
    const job = parseTearFoundryJob(jobInput);
    if (job.phase !== "collecting" || !text(request.id) || !text(request.trainerId) || !Number.isSafeInteger(request.version) || request.version < 1 || !time(admittedAt)) throw new RangeError("Foundry curated-manifest admission requires a collecting job and valid request");
    const [manifest, held] = await Promise.all([this.#corpus.getManifest(request.id, { kind: "trainer", id: request.trainerId }, request.version), this.#custody.held(admittedAt)]);
    const live = new Set(held.map((record) => record.recordHash));
    const authorized = exactManifest(manifest, request, job.inputs.corpusRecordHashes) && job.inputs.corpusRecordHashes.every((recordHash) => live.has(recordHash));
    const next = transitionTearFoundryJob(job, authorized ? "curating" : "failed", admittedAt, authorized ? "exact curated C31 manifest admitted" : "no eligible curated manifest at action time");
    const receipt = freeze({ format: "tear-foundry-curated-manifest-receipt", schemaVersion: 1, job: { id: job.id, sourceJobHash: job.jobHash, resultJobHash: next.jobHash }, admittedAt,
      disposition: authorized ? "authorized" : "no-eligible-curated-manifest", ...(authorized && manifest !== undefined ? { manifest: { id: manifest.id, trainerId: manifest.reader.id, version: manifest.version, manifestHash: manifest.manifestHash, rootHash: manifest.rootHash, entryHashes: manifest.entries.map((entry) => entry.entryHash) } } : {}) });
    await this.#jobs.persistSuccessor(job, next, Object.freeze([{ store: "analysis", key: `${KEY}${receipt.receiptHash}`, value: JSON.stringify(receipt) }, { store: "indexes", key: `foundry-job-curated-manifest:${job.id}:${receipt.receiptHash}`, value: JSON.stringify(Object.freeze({ disposition: receipt.disposition, resultJobHash: next.jobHash })) }]));
    return Object.freeze({ job: next, receipt });
  }
}
