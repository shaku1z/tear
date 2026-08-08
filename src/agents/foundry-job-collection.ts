import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { parseTearFoundryJob, transitionTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import type { TearFoundryJobVault } from "./foundry-job-vault";

const HASH = /^[a-f0-9]{16}$/u;
const KEY = "foundry-job-collection:v1:";

export interface TearFoundryCollectionReceiptV1 {
  readonly format: "tear-foundry-collection-receipt";
  readonly schemaVersion: 1;
  readonly job: Readonly<{ id: string; sourceJobHash: string; resultJobHash: string }>;
  readonly collectedAt: string;
  readonly disposition: "authorized" | "no-authorized-corpus";
  readonly records: readonly Readonly<{ candidateHash: string; recordHash: string }> [];
  readonly receiptHash: string;
}
function time(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value)); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function freeze(draft: Omit<TearFoundryCollectionReceiptV1, "receiptHash">): TearFoundryCollectionReceiptV1 {
  if (!time(draft.collectedAt) || !["authorized", "no-authorized-corpus"].includes(draft.disposition)
    || !hash(draft.job.sourceJobHash) || !hash(draft.job.resultJobHash)
    || draft.records.some((record) => !hash(record.candidateHash) || !hash(record.recordHash))
    || new Set(draft.records.map((record) => record.recordHash)).size !== draft.records.length
    || (draft.disposition === "authorized" && draft.records.length < 1) || (draft.disposition === "no-authorized-corpus" && draft.records.length !== 0)) {
    throw new TypeError("invalid Foundry collection receipt");
  }
  const value = Object.freeze({ ...draft, job: Object.freeze({ ...draft.job }), records: Object.freeze(draft.records.map((record) => Object.freeze({ ...record })).sort((left, right) => left.recordHash.localeCompare(right.recordHash))) });
  return Object.freeze({ ...value, receiptHash: stableVerificationHash(value) });
}

/** C36's first real executor: it checks C31 held custody at action time, then records collection only. */
export class TearFoundryCollectionExecutor {
  readonly #jobs: TearFoundryJobVault;
  readonly #custody: TearAcademyCandidateCustodyStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore) {
    if (jobs.backend() !== custody.backend()) throw new TypeError("Foundry collection and C31 custody must share one Vault backend");
    this.#jobs = jobs; this.#custody = custody;
  }

  async collect(jobInput: TearFoundryJobV1, collectedAt: string): Promise<Readonly<{ job: TearFoundryJobV1; receipt: TearFoundryCollectionReceiptV1 }>> {
    const job = parseTearFoundryJob(jobInput);
    if (job.phase !== "created" || !time(collectedAt)) throw new RangeError("Foundry collection requires a created job and valid action time");
    const held = await this.#custody.held(collectedAt), byHash = new Map(held.map((record) => [record.recordHash, record]));
    const records = job.inputs.corpusRecordHashes.map((recordHash) => byHash.get(recordHash));
    const authorizedRecords = records.filter((record): record is NonNullable<typeof record> => record !== undefined);
    const authorized = authorizedRecords.length === records.length;
    const next = transitionTearFoundryJob(job, authorized ? "collecting" : "failed", collectedAt,
      authorized ? "exact authorized custody collected" : "no authorized corpus at action time");
    const receipt = freeze({ format: "tear-foundry-collection-receipt", schemaVersion: 1, job: { id: job.id, sourceJobHash: job.jobHash, resultJobHash: next.jobHash },
      collectedAt, disposition: authorized ? "authorized" : "no-authorized-corpus", records: authorized ? authorizedRecords.map((record) => ({ candidateHash: record.candidateHash, recordHash: record.recordHash })) : [] });
    await this.#jobs.persistSuccessor(job, next, Object.freeze([
      { store: "analysis", key: `${KEY}${receipt.receiptHash}`, value: JSON.stringify(receipt) },
      { store: "indexes", key: `foundry-job-collection:${job.id}:${receipt.receiptHash}`, value: JSON.stringify(Object.freeze({ disposition: receipt.disposition, resultJobHash: next.jobHash })) },
    ]));
    return Object.freeze({ job: next, receipt });
  }
}
