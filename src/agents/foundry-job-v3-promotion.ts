import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { parseTearC34V3C32PolicyCandidate, TearC34V3C32CandidateRegistry, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY } from "./c34-v3-c32-policy-adapter";
import { parseTearFoundryDecisionReceipt } from "./foundry-job-decision";
import { parseTearFoundryMonitoringEntryReceipt } from "./foundry-job-monitoring";
import { requireTearFoundryEvaluationProtocol } from "./foundry-job-state";
import { parseTearFoundryV3MonitoringBridge } from "./foundry-job-v3-monitoring-bridge";
import { parseTearFoundryV3PromotionApproval, type TearFoundryV3PromotionApprovalV1 } from "./foundry-job-v3-promotion-approval";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { parseTearPolicyActivation } from "./policy-artifact-registry";

const APPROVAL = "foundry-job-v3-promotion-approval:v1:";
const RECEIPT = "foundry-job-v3-promotion-receipt:v1:";
const ACTIVE = "policy-active:v1";
const HASH = /^[a-f0-9]{16}$/u;

export interface TearFoundryV3PromotionReceiptV1 {
  readonly format: "tear-foundry-v3-promotion-receipt";
  readonly schemaVersion: 1;
  readonly approvalHash: string;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly activationHash: string;
  readonly revision: number;
  readonly promotedAt: string;
  readonly receiptHash: string;
}
export interface TearFoundryV3PromotionContinuationV1 {
  readonly guards: (receipt: TearFoundryV3PromotionReceiptV1) => readonly Readonly<{ store: "analysis"; key: string; expected?: string }>[];
  readonly writes: (receipt: TearFoundryV3PromotionReceiptV1) => readonly Readonly<{ store: "analysis" | "indexes"; key: string; value: string }>[];
}

function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function timestamp(value: string): boolean { return value.trim().length > 0 && Number.isFinite(Date.parse(value)); }
function guard(key: string, expected: string | undefined): Readonly<{ store: "analysis"; key: string; expected?: string }> {
  return Object.freeze({ store: "analysis" as const, key, ...(expected === undefined ? {} : { expected }) });
}
function receipt(draft: Omit<TearFoundryV3PromotionReceiptV1, "receiptHash">): TearFoundryV3PromotionReceiptV1 {
  if (!hash(draft.approvalHash) || !hash(draft.artifactHash) || !hash(draft.activationHash) || !draft.artifactId || !timestamp(draft.promotedAt) || !Number.isSafeInteger(draft.revision) || draft.revision < 1) throw new TypeError("invalid Foundry V3 promotion receipt");
  return Object.freeze({ ...draft, receiptHash: stableVerificationHash(draft) });
}
export function parseTearFoundryV3PromotionReceipt(value: unknown): TearFoundryV3PromotionReceiptV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid Foundry V3 promotion receipt");
  const typed = value as TearFoundryV3PromotionReceiptV1, { receiptHash, ...draft } = typed, parsed = receipt(draft);
  if (!hash(receiptHash) || receiptHash !== parsed.receiptHash) throw new TypeError("Foundry V3 promotion receipt integrity mismatch");
  return parsed;
}

/**
 * The only C36 operation allowed to install a V3 active pointer.  It consumes
 * one already-frozen approval and commits candidate registration, activation,
 * approval consumption, and receipt as one Vault conditional transaction.
 */
export class TearFoundryV3PromotionExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore) {
    if (jobs.backend() !== custody.backend()) throw new TypeError("Foundry V3 promotion must share C31 custody Vault");
    this.#jobs = jobs; this.#custody = custody;
  }

  async promote(approvalHash: string, promotedAt: string, continuation?: TearFoundryV3PromotionContinuationV1): Promise<TearFoundryV3PromotionReceiptV1> {
    if (!hash(approvalHash) || !timestamp(promotedAt)) throw new TypeError("Foundry V3 promotion input is invalid");
    const backend = this.#jobs.backend(), receiptKey = `${RECEIPT}${approvalHash}`, existing = await backend.get("analysis", receiptKey);
    if (existing !== undefined) {
      try { return parseTearFoundryV3PromotionReceipt(JSON.parse(existing)); }
      catch { await backend.put("quarantine", receiptKey, existing); throw new RangeError("Foundry V3 promotion receipt is corrupt"); }
    }
    const approvalKey = `${APPROVAL}${approvalHash}`, approvalRaw = await backend.get("analysis", approvalKey);
    if (approvalRaw === undefined) throw new RangeError("Foundry V3 promotion requires one retained approval");
    let approval: TearFoundryV3PromotionApprovalV1;
    try { approval = parseTearFoundryV3PromotionApproval(JSON.parse(approvalRaw)); }
    catch { await backend.put("quarantine", approvalKey, approvalRaw); throw new RangeError("Foundry V3 promotion approval is corrupt"); }
    const jobRaw = await backend.get("analysis", `foundry-job:v1:${approval.job.id}`), job = jobRaw === undefined ? undefined : await this.#jobs.get(approval.job.id);
    if (job?.jobHash !== approval.job.jobHash || job.phase !== "monitoring" || requireTearFoundryEvaluationProtocol(job).protocolHash !== approval.job.protocolHash || job.inputs.stopConditionsHash !== approval.job.stopConditionsHash) throw new RangeError("Foundry V3 promotion monitoring head changed");
    const bridgeRaw = await backend.get("analysis", `foundry-job-v3-monitoring-bridge:v1:${approval.bridge.bridgeHash}`), bridge = bridgeRaw === undefined ? undefined : parseTearFoundryV3MonitoringBridge(JSON.parse(bridgeRaw));
    if (bridge?.job.jobHash !== job.jobHash || bridge.job.protocolHash !== approval.job.protocolHash || bridge.v2Monitoring.decisionReceiptHash !== approval.bridge.decisionReceiptHash || bridge.v2Monitoring.monitoringReceiptHash !== approval.bridge.monitoringReceiptHash || bridge.v2Monitoring.evaluationResultHash !== approval.bridge.evaluationResultHash || bridge.v3.candidateArtifactId !== approval.candidate.id || bridge.v3.candidateArtifactHash !== approval.candidate.artifactHash) throw new RangeError("Foundry V3 promotion bridge changed");
    const [decisionRaw, monitoringRaw, candidateRaw, activeRaw, held] = await Promise.all([
      backend.get("analysis", `foundry-job-decision:v1:${approval.bridge.decisionReceiptHash}`),
      backend.get("analysis", `foundry-job-monitoring-entry:v1:${approval.bridge.monitoringReceiptHash}`),
      backend.get("analysis", `policy-artifact:v1:${approval.candidate.id}`), backend.get("analysis", ACTIVE), this.#custody.held(promotedAt),
    ]);
    const decision = decisionRaw === undefined ? undefined : parseTearFoundryDecisionReceipt(JSON.parse(decisionRaw)), monitoring = monitoringRaw === undefined ? undefined : parseTearFoundryMonitoringEntryReceipt(JSON.parse(monitoringRaw));
    if (decision?.disposition !== "monitoring-ready" || decision.job.resultJobHash !== job.jobHash || decision.receiptHash !== approval.bridge.decisionReceiptHash || decision.evaluationResultHash !== approval.bridge.evaluationResultHash || monitoring?.health !== "evidence-retained" || monitoring.jobHash !== job.jobHash || monitoring.receiptHash !== approval.bridge.monitoringReceiptHash || monitoring.decisionReceiptHash !== decision.receiptHash || monitoring.evaluationResultHash !== decision.evaluationResultHash || !job.inputs.corpusRecordHashes.every((value) => held.some((record) => record.recordHash === value))) throw new RangeError("Foundry V3 promotion custody or monitoring evidence changed");
    const candidate = await new TearC34V3C32CandidateRegistry(backend).get(approval.candidate.id);
    if (candidate?.artifactHash !== approval.candidate.artifactHash || candidateRaw !== JSON.stringify(candidate)) throw new RangeError("Foundry V3 promotion candidate changed");
    const payload = parseTearC34V3C32PolicyCandidate(candidate);
    if (payload.sourceStateAdapter.adapterHash !== approval.candidate.adapterHash || payload.lineage.actionVocabularyHash !== approval.candidate.actionVocabularyHash || payload.lineage.offlinePlanHash !== approval.candidate.offlinePlanHash || payload.lineage.offlineTrainingHash !== approval.candidate.offlineTrainingHash || payload.lineage.onlinePlanHash !== approval.candidate.onlinePlanHash || payload.lineage.onlineCheckpointHash !== approval.candidate.onlineCheckpointHash || payload.lineage.onlineEvaluationHash !== approval.candidate.evaluationHash) throw new RangeError("Foundry V3 promotion candidate lineage changed");
    if (candidate.compatibility.modelFormats[0] !== TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY.modelFormats[0]) throw new RangeError("Foundry V3 promotion candidate is incompatible");
    let previous; if (activeRaw !== undefined) { try { previous = parseTearPolicyActivation(JSON.parse(activeRaw)); } catch { throw new RangeError("Foundry V3 promotion active baseline is corrupt"); } }
    if (approval.rollbackBaseline === undefined ? previous !== undefined : previous?.activationHash !== approval.rollbackBaseline.activationHash || previous.artifactHash !== approval.rollbackBaseline.artifactHash || previous.artifactId !== approval.rollbackBaseline.artifactId || previous.revision !== approval.rollbackBaseline.revision) throw new RangeError("Foundry V3 promotion active baseline drifted");
    const revision = (previous?.revision ?? 0) + 1, activationDraft = { format: "tear-policy-activation" as const, schemaVersion: 1 as const, revision, artifactId: candidate.id, artifactHash: candidate.artifactHash, activatedAt: promotedAt, ...(previous === undefined ? {} : { previousArtifactId: previous.artifactId }) }, activation = Object.freeze({ ...activationDraft, activationHash: stableVerificationHash(activationDraft) }), output = receipt({ format: "tear-foundry-v3-promotion-receipt", schemaVersion: 1, approvalHash, artifactId: candidate.id, artifactHash: candidate.artifactHash, activationHash: activation.activationHash, revision, promotedAt });
    const custodyGuards = await Promise.all(held.filter((record) => job.inputs.corpusRecordHashes.includes(record.recordHash)).map(async (record) => {
      const key = `academy-candidate-custody:v1:${record.candidateHash}`, expected = await backend.get("analysis", key);
      return guard(key, expected);
    }));
    try {
      await backend.commitIfMatches(Object.freeze([
        guard(approvalKey, approvalRaw), guard(`foundry-job:v1:${job.id}`, jobRaw),
        guard(`foundry-job-v3-monitoring-bridge:v1:${approval.bridge.bridgeHash}`, bridgeRaw), guard(`foundry-job-decision:v1:${approval.bridge.decisionReceiptHash}`, decisionRaw), guard(`foundry-job-monitoring-entry:v1:${approval.bridge.monitoringReceiptHash}`, monitoringRaw), guard(`policy-artifact:v1:${candidate.id}`, candidateRaw), guard(ACTIVE, activeRaw), guard(receiptKey, undefined), ...custodyGuards,
        ...(continuation?.guards(output) ?? []),
      ]), Object.freeze([
        { store: "analysis", key: ACTIVE, value: JSON.stringify(activation) }, { store: "indexes", key: `policy-activation:v1:${String(revision).padStart(12, "0")}`, value: JSON.stringify(activation) },
        { store: "analysis", key: receiptKey, value: JSON.stringify(output) }, { store: "indexes", key: `foundry-job-v3-promotion:${approvalHash}`, value: JSON.stringify(Object.freeze({ artifactHash: candidate.artifactHash, activationHash: activation.activationHash, promoted: true })) },
        ...(continuation?.writes(output) ?? []),
      ]));
    } catch { throw new RangeError("Foundry V3 promotion lost approved current evidence"); }
    return output;
  }
  async get(approvalHash: string): Promise<TearFoundryV3PromotionReceiptV1 | undefined> {
    if (!hash(approvalHash)) throw new TypeError("Foundry V3 promotion approval hash is invalid");
    const key = `${RECEIPT}${approvalHash}`, raw = await this.#jobs.backend().get("analysis", key); if (raw === undefined) return undefined;
    try { return parseTearFoundryV3PromotionReceipt(JSON.parse(raw)); } catch { await this.#jobs.backend().put("quarantine", key, raw); return undefined; }
  }
}
