import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusManifestV1, TearAcademyCorpusStore } from "./academy-corpus";
import { createTearFoundryExecutionBindingV3, type TearFoundryExecutionSuccessorDeclarationV3, type TearFoundryExecutionBindingV3 } from "./foundry-job-execution-binding";
import { parseTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import { createTearFoundryJobSchedule, parseTearFoundryJobSchedule, setTearFoundryJobScheduleEnabled, type TearFoundryJobScheduleV1 } from "./foundry-job-schedule";
import type { TearFoundryJobVault } from "./foundry-job-vault";

const HASH = /^[a-f0-9]{16}$/u;
const jobKey = (id: string): string => `foundry-job:v1:${id}`;
const scheduleKey = (id: string): string => `foundry-job-schedule:v1:${id}`;
const manifestKey = (id: string, trainerId: string, version: number): string => `academy-corpus-manifest:v1:trainer:${trainerId}:${id}:${String(version)}`;
const custodyKey = (candidateHash: string): string => `academy-candidate-custody:v1:${candidateHash}`;
const bindingKey = (hash: string): string => `foundry-job-execution-binding:v3:${hash}`;

export interface TearFoundryBootstrapRequestV1 {
  readonly job: TearFoundryJobV1;
  readonly manifest: Readonly<{ id: string; trainerId: string; version: number; manifestHash: string; rootHash: string }>;
  /** An immutable disabled cadence configuration; bootstrap alone enables its new revision. */
  readonly schedule: Omit<TearFoundryJobScheduleV1, "format" | "schemaVersion" | "revision" | "scheduleHash" | "enabledAt" | "jobId" | "jobHash" | "state">;
  readonly successorDeclaration: TearFoundryExecutionSuccessorDeclarationV3;
  readonly bootstrappedAt: string;
}
export interface TearFoundryBootstrapReceiptV1 {
  readonly format: "tear-foundry-bootstrap-receipt"; readonly schemaVersion: 1;
  readonly jobHash: string; readonly manifestHash: string; readonly manifestRootHash: string;
  readonly scheduleHash: string; readonly bindingHash: string; readonly bootstrappedAt: string; readonly receiptHash: string;
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function time(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function receipt(draft: Omit<TearFoundryBootstrapReceiptV1, "receiptHash">): TearFoundryBootstrapReceiptV1 {
  if (![draft.jobHash, draft.manifestHash, draft.manifestRootHash, draft.scheduleHash, draft.bindingHash].every(hash) || !time(draft.bootstrappedAt)) throw new TypeError("invalid Foundry bootstrap receipt");
  return Object.freeze({ ...draft, receiptHash: stableVerificationHash(draft) });
}
function exactManifest(manifest: TearAcademyCorpusManifestV1 | undefined, request: TearFoundryBootstrapRequestV1, job: TearFoundryJobV1): boolean {
  if (manifest?.id !== request.manifest.id || manifest.reader.kind !== "trainer" || manifest.reader.id !== request.manifest.trainerId || manifest.version !== request.manifest.version
    || manifest.manifestHash !== request.manifest.manifestHash || manifest.rootHash !== request.manifest.rootHash || manifest.entries.length < 1
    || manifest.entries.some((entry) => entry.split === "hidden-release-exam")) return false;
  const records = manifest.entries.map((entry) => entry.custodyRecordHash);
  return records.length === job.inputs.corpusRecordHashes.length && new Set(records).size === records.length && records.every((value) => job.inputs.corpusRecordHashes.includes(value));
}

/**
 * C36's narrow local admission boundary. It consumes an already-frozen V2
 * request and an already-published C31 trainer manifest, then creates the
 * durable job, enabled cadence revision, and V3 phase intent in one guarded
 * Vault transaction. It cannot curate, execute, train, evaluate, promote, or
 * contact another service.
 */
export class TearFoundryBootstrapExecutor {
  readonly #backend: GhostVaultBackend; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore, corpus: TearAcademyCorpusStore) {
    if (jobs.backend() !== custody.backend() || jobs.backend() !== corpus.backend()) throw new TypeError("Foundry bootstrap must share the C31 Vault boundary");
    this.#backend = jobs.backend(); this.#custody = custody; this.#corpus = corpus;
  }
  async bootstrap(input: TearFoundryBootstrapRequestV1): Promise<Readonly<{ job: TearFoundryJobV1; schedule: TearFoundryJobScheduleV1; binding: TearFoundryExecutionBindingV3; receipt: TearFoundryBootstrapReceiptV1 }>> {
    const job = parseTearFoundryJob(input.job);
    if (job.schemaVersion !== 2 || job.phase !== "created" || !text(input.manifest.id) || !text(input.manifest.trainerId) || !Number.isSafeInteger(input.manifest.version) || input.manifest.version < 1
      || ![input.manifest.manifestHash, input.manifest.rootHash].every(hash) || !time(input.bootstrappedAt)) throw new RangeError("Foundry bootstrap requires a frozen V2 created request and manifest identity");
    const disabled = createTearFoundryJobSchedule({ ...input.schedule, jobId: job.id, jobHash: job.jobHash, stopConditionsHash: job.inputs.stopConditionsHash, state: "disabled" });
    const enabled = setTearFoundryJobScheduleEnabled(disabled, true, input.bootstrappedAt);
    const binding = createTearFoundryExecutionBindingV3({ schedule: { id: enabled.id, revision: enabled.revision, scheduleHash: enabled.scheduleHash }, job: { id: job.id, jobHash: job.jobHash, phase: job.phase }, payload: { kind: "none" }, successorDeclaration: input.successorDeclaration });
    const manifest = await this.#corpus.getManifest(input.manifest.id, { kind: "trainer", id: input.manifest.trainerId }, input.manifest.version);
    if (!exactManifest(manifest, input, job)) throw new RangeError("Foundry bootstrap manifest is not the exact frozen C31 trainer manifest");
    const held = await this.#custody.held(input.bootstrappedAt), live = new Map(held.map((entry) => [entry.recordHash, entry])), custodyCandidates = job.inputs.corpusRecordHashes.map((recordHash) => live.get(recordHash));
    if (custodyCandidates.some((entry) => entry === undefined)) throw new RangeError("Foundry bootstrap C31 custody is no longer held");
    const custodyRecords = custodyCandidates.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
    const receiptKey = `foundry-job-bootstrap:v1:${stableVerificationHash({ jobHash: job.jobHash, manifestHash: input.manifest.manifestHash, scheduleHash: enabled.scheduleHash, bindingHash: binding.bindingHash })}`;
    const [currentJob, currentSchedule, priorReceipt, bindingRaw, manifestRaw, ...custodyRaw] = await Promise.all([
      this.#backend.get("analysis", jobKey(job.id)), this.#backend.get("analysis", scheduleKey(enabled.id)), this.#backend.get("analysis", receiptKey),
      this.#backend.get("analysis", bindingKey(binding.bindingHash)),
      this.#backend.get("analysis", manifestKey(input.manifest.id, input.manifest.trainerId, input.manifest.version)),
      ...custodyRecords.map((entry) => this.#backend.get("analysis", custodyKey(entry.candidateHash))),
    ]);
    if (manifestRaw === undefined || custodyRaw.some((value) => value === undefined)) throw new RangeError("Foundry bootstrap authority bytes are unavailable");
    if (priorReceipt !== undefined) {
      try {
        const old = JSON.parse(priorReceipt) as TearFoundryBootstrapReceiptV1, { receiptHash: recorded, ...draft } = old, prior = receipt(draft);
        if (recorded === prior.receiptHash && prior.scheduleHash === enabled.scheduleHash && prior.bindingHash === binding.bindingHash && prior.jobHash === job.jobHash) {
          const schedule = currentSchedule === undefined ? undefined : parseTearFoundryJobSchedule(JSON.parse(currentSchedule));
          if (schedule?.scheduleHash === enabled.scheduleHash) return Object.freeze({ job, schedule, binding, receipt: prior });
        }
      } catch { await this.#backend.put("quarantine", receiptKey, priorReceipt); }
      throw new RangeError("Foundry bootstrap receipt is corrupt or mismatched");
    }
    if (currentJob !== undefined && currentJob !== JSON.stringify(job)) throw new RangeError("Foundry bootstrap job ID already names another head");
    if (currentSchedule !== undefined && currentSchedule !== JSON.stringify(enabled)) throw new RangeError("Foundry bootstrap schedule ID already exists");
    if (bindingRaw !== undefined) throw new RangeError("Foundry bootstrap binding identity already exists");
    const result = receipt({ format: "tear-foundry-bootstrap-receipt", schemaVersion: 1, jobHash: job.jobHash, manifestHash: input.manifest.manifestHash, manifestRootHash: input.manifest.rootHash, scheduleHash: enabled.scheduleHash, bindingHash: binding.bindingHash, bootstrappedAt: input.bootstrappedAt });
    try { await this.#backend.commitIfMatches(Object.freeze([
      { store: "analysis", key: jobKey(job.id), ...(currentJob === undefined ? {} : { expected: currentJob }) },
      { store: "analysis", key: scheduleKey(enabled.id), ...(currentSchedule === undefined ? {} : { expected: currentSchedule }) },
      { store: "analysis", key: receiptKey }, { store: "analysis", key: bindingKey(binding.bindingHash) }, { store: "analysis", key: manifestKey(input.manifest.id, input.manifest.trainerId, input.manifest.version), expected: manifestRaw },
       ...custodyRecords.map((entry, index) => {
         const expected = custodyRaw[index];
         if (expected === undefined) throw new RangeError("Foundry bootstrap custody authority bytes disappeared");
         return Object.freeze({ store: "analysis" as const, key: custodyKey(entry.candidateHash), expected });
       }),
    ]), Object.freeze([
      ...(currentJob === undefined ? [{ store: "analysis" as const, key: jobKey(job.id), value: JSON.stringify(job) }, { store: "indexes" as const, key: `foundry-job:${job.id}:${job.jobHash}`, value: JSON.stringify(Object.freeze({ phase: job.phase, championArtifactHash: job.inputs.champion.artifactHash, evaluationPlanHash: job.inputs.evaluationPlanHash })) }] : []),
      { store: "analysis", key: scheduleKey(enabled.id), value: JSON.stringify(enabled) },
      { store: "analysis", key: bindingKey(binding.bindingHash), value: JSON.stringify(binding) },
      { store: "analysis", key: `foundry-job-execution-binding-current:v3:${enabled.id}:${String(enabled.revision)}:${enabled.scheduleHash}`, value: binding.bindingHash },
      { store: "indexes", key: `foundry-job-schedule:${enabled.id}:${enabled.scheduleHash}`, value: JSON.stringify(Object.freeze({ state: enabled.state, jobHash: job.jobHash })) },
      { store: "indexes", key: `foundry-job-execution-binding:v3:${enabled.id}:${String(enabled.revision)}:${binding.bindingHash}`, value: JSON.stringify(Object.freeze({ scheduleHash: enabled.scheduleHash, jobHash: job.jobHash, phase: job.phase })) },
      { store: "analysis", key: receiptKey, value: JSON.stringify(result) },
    ])); } catch { throw new RangeError("Foundry bootstrap lost its job, schedule, manifest, or custody authority"); }
    return Object.freeze({ job, schedule: enabled, binding, receipt: result });
  }
}
