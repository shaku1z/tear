import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyTrainingDatasetLoader } from "./academy-training-dataset";
import { parseTearFoundryBootstrapReceipt } from "./foundry-job-bootstrap";
import { parseTearFoundryEvaluationReadinessReceipt } from "./foundry-job-offline-training-finalization";
import { parseTearFoundryOnlineTrainingLaunch, parseTearFoundryPairedEvaluationReadinessReceipt } from "./foundry-job-online-training-launch";
import {
  parseTearFoundrySourceEvaluationPlanReceipt,
  TearFoundrySourceEvaluationExecutionExecutor,
} from "./foundry-job-source-evaluation-execution";
import { parseTearFoundryJob, type TearFoundryJobV1 } from "./foundry-job-state";
import { rebindTearFoundryJobSchedule, type TearFoundryJobScheduleV1 } from "./foundry-job-schedule";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { createTearFoundryExecutionBindingV4, parseTearFoundryExecutionBindingV4, type TearFoundryExecutionBindingV4 } from "./foundry-job-v4-offline-terminal";
import { parseTearFoundryV4OnlineLaunchAuthority } from "./foundry-job-v4-online-launch-authority";
import { parseTearFoundryV4OnlineLaunchHandoffReceipt } from "./foundry-job-v4-online-launch-authority";
import { parseTearFoundryLaunchProfile } from "./foundry-launch-profile";
import { stableVerificationHash } from "../replay/hash";

const BINDING = "foundry-job-execution-binding:v4:";
const POINTER = "foundry-job-execution-binding-current:v4:";

const guard = (key: string, expected: string | undefined): Readonly<{ store: "analysis"; key: string; expected?: string }> =>
  Object.freeze({ store: "analysis" as const, key, ...(expected === undefined ? {} : { expected }) });

type SourceExecutionPayload = Extract<
  TearFoundryExecutionBindingV4["payload"],
  Readonly<{ kind: "source-evaluation-execution-ready" }>
>;

function sourceExecutionPayload(value: TearFoundryExecutionBindingV4["payload"]): SourceExecutionPayload {
  if (value.kind !== "source-evaluation-execution-ready") {
    throw new RangeError("Foundry V4 source evaluation is not declared");
  }
  return value;
}

/** Runs one exact retained plan, atomically retaining its factual result and decision-ready schedule head. */
export class TearFoundryV4SourceEvaluationExecutionScheduler {
  readonly #jobs: TearFoundryJobVault;
  readonly #custody: TearAcademyCandidateCustodyStore;
  readonly #corpus: TearAcademyCorpusStore;
  readonly #loader: TearAcademyTrainingDatasetLoader;

  constructor(
    jobs: TearFoundryJobVault,
    custody: TearAcademyCandidateCustodyStore,
    corpus: TearAcademyCorpusStore,
    loader: TearAcademyTrainingDatasetLoader,
  ) {
    if (jobs.backend() !== custody.backend() || jobs.backend() !== corpus.backend()) {
      throw new TypeError("Foundry V4 source evaluation must share the C31 Vault boundary");
    }
    this.#jobs = jobs;
    this.#custody = custody;
    this.#corpus = corpus;
    this.#loader = loader;
  }

  async execute(
    schedule: TearFoundryJobScheduleV1,
    source: TearFoundryExecutionBindingV4,
    at: string,
  ): Promise<TearFoundryExecutionBindingV4> {
    const payload = sourceExecutionPayload(source.payload);
    const backend = this.#jobs.backend();
    const pointerKey = `${POINTER}${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`;
    if (!Number.isFinite(Date.parse(at)) || source.schedule.scheduleHash !== schedule.scheduleHash || source.job.phase !== "evaluating") {
      throw new RangeError("Foundry V4 source evaluation declaration changed");
    }

    const [scheduleRaw, jobRaw, sourceRaw, pointerRaw, authorityRaw, pairedRaw, planRaw] = await Promise.all([
      backend.get("analysis", `foundry-job-schedule:v1:${schedule.id}`),
      backend.get("analysis", `foundry-job:v1:${source.job.id}`),
      backend.get("analysis", `${BINDING}${source.bindingHash}`),
      backend.get("analysis", pointerKey),
      backend.get("analysis", `foundry-job-v4-online-launch-authority:v1:${payload.authorityHash}`),
      backend.get("analysis", `foundry-job-paired-evaluation-ready:v1:${payload.pairedReadinessHash}`),
      backend.get("analysis", `foundry-job-source-evaluation-plan:v1:${payload.planReceiptHash}`),
    ]);
    if (scheduleRaw === undefined || jobRaw === undefined || sourceRaw === undefined || authorityRaw === undefined || pairedRaw === undefined || planRaw === undefined
      || pointerRaw !== source.bindingHash || scheduleRaw !== JSON.stringify(schedule) || sourceRaw !== JSON.stringify(source)) {
      throw new RangeError("Foundry V4 source evaluation authority changed");
    }

    const job = parseTearFoundryJob(JSON.parse(jobRaw));
    const authority = parseTearFoundryV4OnlineLaunchAuthority(JSON.parse(authorityRaw));
    const readinessKey = `foundry-job-evaluation-ready:v1:${authority.readinessReceiptHash}`;
    const handoffKey = `foundry-job-v4-online-launch-handoff:v1:${payload.handoffReceiptHash}`;
    const launchKey = `foundry-job-online-training-launch:v1:${payload.launchHash}`;
    const declaredKey = `${BINDING}${authority.sourceBindingHash}`;
    const profileKey = `foundry-launch-profile:v1:${authority.profile.id}`;
    const [handoffRaw, launchRaw, declaredRaw, profileRaw, readinessRaw, inventory, held] = await Promise.all([
      backend.get("analysis", handoffKey),
      backend.get("analysis", launchKey),
      backend.get("analysis", declaredKey),
      backend.get("analysis", profileKey),
      backend.get("analysis", readinessKey),
      this.#custody.inventory(),
      this.#custody.held(at),
    ]);
    if (handoffRaw === undefined || launchRaw === undefined || declaredRaw === undefined || profileRaw === undefined || readinessRaw === undefined) {
      throw new RangeError("Foundry V4 source evaluation retained authority is unavailable");
    }
    const handoff = parseTearFoundryV4OnlineLaunchHandoffReceipt(JSON.parse(handoffRaw));
    const onlineLaunch = parseTearFoundryOnlineTrainingLaunch(JSON.parse(launchRaw));
    const declared = parseTearFoundryExecutionBindingV4(JSON.parse(declaredRaw));
    const profile = parseTearFoundryLaunchProfile(JSON.parse(profileRaw));
    const readiness = parseTearFoundryEvaluationReadinessReceipt(JSON.parse(readinessRaw));
    const paired = parseTearFoundryPairedEvaluationReadinessReceipt(JSON.parse(pairedRaw));
    const plan = parseTearFoundrySourceEvaluationPlanReceipt(JSON.parse(planRaw));
    if (job.jobHash !== source.job.jobHash || authority.authorityHash !== payload.authorityHash
      || handoff.receiptHash !== payload.handoffReceiptHash || handoff.authorityHash !== authority.authorityHash
      || handoff.sourceBindingHash !== authority.sourceBindingHash || declared.bindingHash !== authority.sourceBindingHash
      || declared.payload.kind !== "evaluation-ready" || declared.job.jobHash !== authority.job.jobHash
      || onlineLaunch.launchHash !== payload.launchHash || onlineLaunch.readinessReceiptHash !== authority.readinessReceiptHash
      || profile.profileHash !== authority.profile.profileHash || readiness.receiptHashValue !== authority.readinessReceiptHash
      || paired.receiptHash !== payload.pairedReadinessHash || plan.receiptHash !== payload.planReceiptHash
      || plan.job.jobHash !== job.jobHash || (await this.#jobs.get(job.id))?.jobHash !== job.jobHash) {
      throw new RangeError("Foundry V4 source evaluation lineage changed");
    }
    let bootstrapKey: string | undefined;
    let bootstrapRaw: string | undefined;
    for (const key of (await backend.keys("analysis")).filter((key) => key.startsWith("foundry-job-bootstrap:v1:"))) {
      const raw = await backend.get("analysis", key);
      try {
        if (raw !== undefined && parseTearFoundryBootstrapReceipt(JSON.parse(raw)).receiptHash === authority.bootstrapReceiptHash) {
          bootstrapKey = key;
          bootstrapRaw = raw;
          break;
        }
      } catch {
        // Invalid candidates cannot satisfy the retained authority.
      }
    }
    const records = inventory.records
      .filter((record) => job.inputs.corpusRecordHashes.includes(record.recordHash))
      .sort((left, right) => left.candidateHash.localeCompare(right.candidateHash));
    const custodyRaw = await Promise.all(records.map((record) => backend.get("analysis", `academy-candidate-custody:v1:${record.candidateHash}`)));
    if (bootstrapKey === undefined || bootstrapRaw === undefined || records.length !== job.inputs.corpusRecordHashes.length
      || custodyRaw.some((raw) => raw === undefined)
      || stableVerificationHash(records.map((record, index) => Object.freeze({ candidateHash: record.candidateHash, recordHash: record.recordHash, raw: custodyRaw[index] }))) !== authority.custodyHash
      || !job.inputs.corpusRecordHashes.every((recordHash) => held.some((record) => record.recordHash === recordHash))) {
      throw new RangeError("Foundry V4 source evaluation custody or bootstrap changed");
    }

    let reboundSchedule: TearFoundryJobScheduleV1 | undefined;
    const createNext = (result: Readonly<{ job: TearFoundryJobV1; receipt: Readonly<{ receiptHash: string }> }>): TearFoundryExecutionBindingV4 => {
      const rebound = rebindTearFoundryJobSchedule(schedule, job, result.job, at);
      reboundSchedule = rebound;
      return createTearFoundryExecutionBindingV4({
        schedule: { id: rebound.id, revision: rebound.revision, scheduleHash: rebound.scheduleHash },
        job: { id: result.job.id, jobHash: result.job.jobHash, phase: result.job.phase },
        payload: {
          kind: "source-evaluation-decision-ready",
          authorityHash: payload.authorityHash,
          handoffReceiptHash: payload.handoffReceiptHash,
          launchHash: payload.launchHash,
          pairedReadinessHash: payload.pairedReadinessHash,
          planReceiptHash: payload.planReceiptHash,
          evaluationReceiptHash: result.receipt.receiptHash,
        },
      });
    };
    let next: TearFoundryExecutionBindingV4 | undefined;
    const output = await new TearFoundrySourceEvaluationExecutionExecutor(this.#jobs, this.#custody, this.#corpus, this.#loader).execute(
      job,
      readiness,
      paired,
      plan,
        at,
      {
        guards: (result) => {
          next = createNext(result);
          return Object.freeze([
            guard(`foundry-job-schedule:v1:${schedule.id}`, scheduleRaw),
            guard(`foundry-job:v1:${job.id}`, jobRaw),
            guard(pointerKey, source.bindingHash),
            guard(`${BINDING}${source.bindingHash}`, sourceRaw),
            guard(`foundry-job-v4-online-launch-authority:v1:${payload.authorityHash}`, authorityRaw),
            guard(handoffKey, handoffRaw),
            guard(launchKey, launchRaw),
            guard(declaredKey, declaredRaw),
            guard(profileKey, profileRaw),
            guard(readinessKey, readinessRaw),
            guard(`foundry-job-paired-evaluation-ready:v1:${payload.pairedReadinessHash}`, pairedRaw),
            guard(`foundry-job-source-evaluation-plan:v1:${payload.planReceiptHash}`, planRaw),
            guard(bootstrapKey, bootstrapRaw),
            guard(`${BINDING}${next.bindingHash}`, undefined),
            guard(`${POINTER}${next.schedule.id}:${String(next.schedule.revision)}:${next.schedule.scheduleHash}`, undefined),
            ...records.map((record, index) => guard(`academy-candidate-custody:v1:${record.candidateHash}`, custodyRaw[index])),
          ]);
        },
        writes: (result) => {
          next ??= createNext(result);
          if (reboundSchedule === undefined) throw new Error("Foundry V4 source evaluation schedule continuation disappeared");
          return Object.freeze([
            { store: "analysis" as const, key: `foundry-job-schedule:v1:${schedule.id}`, value: JSON.stringify(reboundSchedule) },
            { store: "analysis" as const, key: `${BINDING}${next.bindingHash}`, value: JSON.stringify(next) },
            { store: "analysis" as const, key: `${POINTER}${next.schedule.id}:${String(next.schedule.revision)}:${next.schedule.scheduleHash}`, value: next.bindingHash },
            { store: "indexes" as const, key: `foundry-job-v4-source-evaluation-execution:${result.job.id}:${result.receipt.receiptHash}`, value: JSON.stringify({ planReceiptHash: payload.planReceiptHash, resultHash: result.result.resultHash, bindingHash: next.bindingHash }) },
          ]);
        },
      },
    );
    if (next?.payload.kind !== "source-evaluation-decision-ready" || next.payload.evaluationReceiptHash !== output.receipt.receiptHash) {
      throw new Error("Foundry V4 source evaluation continuation was not retained");
    }
    return next;
  }
}
