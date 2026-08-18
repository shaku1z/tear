import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import { parseTearFoundryJob, requireTearFoundryEvaluationProtocol } from "./foundry-job-state";
import type { TearFoundryJobScheduleV1 } from "./foundry-job-schedule";
import type { TearFoundryJobVault } from "./foundry-job-vault";
import { parseTearFoundryV3PromotionApproval } from "./foundry-job-v3-promotion-approval";
import { parseTearFoundryV3PromotionReceipt } from "./foundry-job-v3-promotion";
import { createTearFoundryExecutionBindingV4, parseTearFoundryExecutionBindingV4, type TearFoundryExecutionBindingV4 } from "./foundry-job-v4-offline-terminal";
import { parseTearFoundryV4V3MonitoringDeclaration } from "./foundry-job-v4-v3-monitoring-bridge";
import { parseTearPolicyActivation, parseTearPolicyArtifact } from "./policy-artifact-registry";

const HASH = /^[a-f0-9]{16}$/u, BINDING = "foundry-job-execution-binding:v4:", POINTER = "foundry-job-execution-binding-current:v4:", KEY = "foundry-job-v4-post-promotion-watch-authority:v1:";
const guard = (key: string, expected: string | undefined): Readonly<{ store: "analysis"; key: string; expected?: string }> => Object.freeze({ store: "analysis" as const, key, ...(expected === undefined ? {} : { expected }) });
const hash = (value: unknown): value is string => typeof value === "string" && HASH.test(value);
const time = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

export interface TearFoundryV4PostPromotionWatchAuthorityV1 {
  readonly format: "tear-foundry-v4-post-promotion-watch-authority"; readonly schemaVersion: 1;
  readonly source: Readonly<{ bindingHash: string; declarationHash: string; approvalHash: string; promotionReceiptHash: string }>;
  readonly active: Readonly<{ artifactId: string; artifactHash: string; activationHash: string; revision: number }>;
  readonly monitoring: Readonly<{ jobId: string; jobHash: string; protocolHash: string; stopConditionsHash: string }>;
  readonly custody: readonly Readonly<{ candidateHash: string; recordHash: string; rawHash: string }>[];
  readonly scope: "local-watch-agent-terminal-aggregate-only"; readonly regressionPolicy: "classify-only-no-rollback";
  readonly armedAt: string; readonly authorityHash: string;
}

function authority(draft: Omit<TearFoundryV4PostPromotionWatchAuthorityV1, "authorityHash">): TearFoundryV4PostPromotionWatchAuthorityV1 {
  if (![draft.source.bindingHash, draft.source.declarationHash, draft.source.approvalHash, draft.source.promotionReceiptHash, draft.active.artifactHash, draft.active.activationHash, draft.monitoring.jobHash, draft.monitoring.protocolHash, draft.monitoring.stopConditionsHash].every(hash) || !draft.active.artifactId || !draft.monitoring.jobId || !Number.isSafeInteger(draft.active.revision) || draft.active.revision < 1 || draft.custody.length < 1 || !draft.custody.every((entry) => entry.candidateHash.trim().length > 0 && hash(entry.recordHash) && hash(entry.rawHash)) || !time(draft.armedAt)) throw new TypeError("invalid Foundry V4 post-promotion Watch authority");
  const value = Object.freeze({ ...draft, source: Object.freeze({ ...draft.source }), active: Object.freeze({ ...draft.active }), monitoring: Object.freeze({ ...draft.monitoring }), custody: Object.freeze(draft.custody.map((entry) => Object.freeze({ ...entry }))) });
  return Object.freeze({ ...value, authorityHash: stableVerificationHash(value) });
}
export function parseTearFoundryV4PostPromotionWatchAuthority(value: unknown): TearFoundryV4PostPromotionWatchAuthorityV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid Foundry V4 post-promotion Watch authority");
  const raw = value as Record<string, unknown>; if (raw.format !== "tear-foundry-v4-post-promotion-watch-authority" || raw.schemaVersion !== 1 || raw.scope !== "local-watch-agent-terminal-aggregate-only" || raw.regressionPolicy !== "classify-only-no-rollback") throw new TypeError("invalid Foundry V4 post-promotion Watch authority");
  const typed = value as TearFoundryV4PostPromotionWatchAuthorityV1, { authorityHash, ...draft } = typed, parsed = authority(draft);
  if (!hash(authorityHash) || authorityHash !== parsed.authorityHash) throw new TypeError("Foundry V4 post-promotion Watch authority integrity mismatch");
  return parsed;
}

/** Arms one immutable local aggregate-only Watch declaration from a disabled promoted V4 head. It cannot dispatch, enable, place, roll back, or expose it. */
export class TearFoundryV4PostPromotionWatchAuthorityExecutor {
  readonly #jobs: TearFoundryJobVault; readonly #custody: TearAcademyCandidateCustodyStore;
  constructor(jobs: TearFoundryJobVault, custody: TearAcademyCandidateCustodyStore) { if (jobs.backend() !== custody.backend()) throw new TypeError("Foundry V4 post-promotion Watch authority must share C31 custody"); this.#jobs = jobs; this.#custody = custody; }
  async arm(schedule: TearFoundryJobScheduleV1, source: TearFoundryExecutionBindingV4, armedAt: string): Promise<TearFoundryExecutionBindingV4> {
    if (source.payload.kind !== "v3-promotion-terminal" || source.job.phase !== "monitoring" || source.schedule.scheduleHash !== schedule.scheduleHash || schedule.state !== "disabled" || !time(armedAt)) throw new RangeError("Foundry V4 post-promotion Watch requires a disabled exact promotion terminal");
    const backend = this.#jobs.backend(), p = source.payload, scheduleKey = `foundry-job-schedule:v1:${schedule.id}`, jobKey = `foundry-job:v1:${source.job.id}`, sourceKey = `${BINDING}${source.bindingHash}`, pointerKey = `${POINTER}${schedule.id}:${String(schedule.revision)}:${schedule.scheduleHash}`, declarationKey = `foundry-job-v4-v3-monitoring-declaration:v1:${p.declarationHash}`, approvalKey = `foundry-job-v3-promotion-approval:v1:${p.approvalHash}`, promotionKey = `foundry-job-v3-promotion-receipt:v1:${p.approvalHash}`, activeKey = "policy-active:v1";
    const [scheduleRaw, jobRaw, sourceRaw, pointerRaw, declarationRaw, approvalRaw, promotionRaw, activeRaw] = await Promise.all([backend.get("analysis", scheduleKey), backend.get("analysis", jobKey), backend.get("analysis", sourceKey), backend.get("analysis", pointerKey), backend.get("analysis", declarationKey), backend.get("analysis", approvalKey), backend.get("analysis", promotionKey), backend.get("analysis", activeKey)]);
    if ([scheduleRaw, jobRaw, sourceRaw, declarationRaw, approvalRaw, promotionRaw, activeRaw].some((value) => value === undefined) || scheduleRaw !== JSON.stringify(schedule) || sourceRaw !== JSON.stringify(source)) throw new RangeError("Foundry V4 post-promotion Watch authority changed");
    if (pointerRaw !== source.bindingHash) { const nextRaw = typeof pointerRaw === "string" ? await backend.get("analysis", `${BINDING}${pointerRaw}`) : undefined; try { const next = nextRaw === undefined ? undefined : parseTearFoundryExecutionBindingV4(JSON.parse(nextRaw)); if (next?.payload.kind === "v3-post-promotion-watch-ready") { const storedRaw = await backend.get("analysis", `${KEY}${next.payload.authorityHash}`), stored = storedRaw === undefined ? undefined : parseTearFoundryV4PostPromotionWatchAuthority(JSON.parse(storedRaw)); if (stored?.source.bindingHash === source.bindingHash && stored.armedAt === armedAt) return next; } } catch { throw new RangeError("Foundry V4 post-promotion Watch retry evidence is invalid"); } throw new RangeError("Foundry V4 post-promotion Watch authority changed"); }
    let job; let declaration; let approval; let promotion; let active;
    try { job = parseTearFoundryJob(JSON.parse(jobRaw ?? "")); declaration = parseTearFoundryV4V3MonitoringDeclaration(JSON.parse(declarationRaw ?? "")); approval = parseTearFoundryV3PromotionApproval(JSON.parse(approvalRaw ?? "")); promotion = parseTearFoundryV3PromotionReceipt(JSON.parse(promotionRaw ?? "")); active = parseTearPolicyActivation(JSON.parse(activeRaw ?? "")); } catch { throw new RangeError("Foundry V4 post-promotion Watch retained provenance is invalid"); }
    const protocol = requireTearFoundryEvaluationProtocol(job);
    if (job.jobHash !== source.job.jobHash || job.phase !== "monitoring" || declaration.declarationHash !== p.declarationHash || approval.approvalHash !== p.approvalHash || approval.bridge.bridgeHash !== declaration.bridgeHash || approval.job.jobHash !== job.jobHash || approval.job.protocolHash !== protocol.protocolHash || approval.job.stopConditionsHash !== job.inputs.stopConditionsHash || promotion.receiptHash !== p.promotionReceiptHash || promotion.approvalHash !== p.approvalHash || promotion.artifactId !== active.artifactId || promotion.artifactHash !== active.artifactHash || promotion.activationHash !== active.activationHash || promotion.revision !== active.revision) throw new RangeError("Foundry V4 post-promotion Watch lineage changed");
    const artifactKey = `policy-artifact:v1:${active.artifactId}`, [artifactRaw, inventory, held] = await Promise.all([backend.get("analysis", artifactKey), this.#custody.inventory(), this.#custody.held(armedAt)]);
    if (artifactRaw === undefined || parseTearPolicyArtifact(JSON.parse(artifactRaw)).artifactHash !== active.artifactHash) throw new RangeError("Foundry V4 post-promotion Watch active artifact changed");
    const records = inventory.records.filter((entry) => job.inputs.corpusRecordHashes.includes(entry.recordHash)).sort((left, right) => left.candidateHash.localeCompare(right.candidateHash));
    if (records.length !== job.inputs.corpusRecordHashes.length || !job.inputs.corpusRecordHashes.every((recordHash) => held.some((entry) => entry.recordHash === recordHash))) throw new RangeError("Foundry V4 post-promotion Watch custody changed");
    const custody = await Promise.all(records.map(async (entry) => { const raw = await backend.get("analysis", `academy-candidate-custody:v1:${entry.candidateHash}`); if (raw === undefined) throw new RangeError("Foundry V4 post-promotion Watch raw custody disappeared"); return Object.freeze({ candidateHash: entry.candidateHash, recordHash: entry.recordHash, raw, rawHash: stableVerificationHash(raw) }); }));
    const stored = authority({ format: "tear-foundry-v4-post-promotion-watch-authority", schemaVersion: 1, source: { bindingHash: source.bindingHash, declarationHash: p.declarationHash, approvalHash: p.approvalHash, promotionReceiptHash: p.promotionReceiptHash }, active: { artifactId: active.artifactId, artifactHash: active.artifactHash, activationHash: active.activationHash, revision: active.revision }, monitoring: { jobId: job.id, jobHash: job.jobHash, protocolHash: protocol.protocolHash, stopConditionsHash: job.inputs.stopConditionsHash }, custody: custody.map(({ candidateHash, recordHash, rawHash }) => ({ candidateHash, recordHash, rawHash })), scope: "local-watch-agent-terminal-aggregate-only", regressionPolicy: "classify-only-no-rollback", armedAt });
    const authorityKey = `${KEY}${stored.authorityHash}`, next = createTearFoundryExecutionBindingV4({ schedule: source.schedule, job: source.job, payload: { kind: "v3-post-promotion-watch-ready", authorityHash: stored.authorityHash } });
    try { await backend.commitIfMatches(Object.freeze([guard(scheduleKey, scheduleRaw), guard(jobKey, jobRaw), guard(sourceKey, sourceRaw), guard(pointerKey, source.bindingHash), guard(declarationKey, declarationRaw), guard(approvalKey, approvalRaw), guard(promotionKey, promotionRaw), guard(activeKey, activeRaw), guard(artifactKey, artifactRaw), guard(authorityKey, undefined), guard(`${BINDING}${next.bindingHash}`, undefined), ...custody.map((entry) => guard(`academy-candidate-custody:v1:${entry.candidateHash}`, entry.raw))]), Object.freeze([{ store: "analysis", key: authorityKey, value: JSON.stringify(stored) }, { store: "analysis", key: `${BINDING}${next.bindingHash}`, value: JSON.stringify(next) }, { store: "analysis", key: pointerKey, value: next.bindingHash }, { store: "indexes", key: `foundry-job-v4-post-promotion-watch:${job.id}:${stored.authorityHash}`, value: JSON.stringify(Object.freeze({ activeArtifactHash: active.artifactHash, scope: stored.scope, regressionPolicy: stored.regressionPolicy, scheduleState: "disabled" })) }])); } catch { throw new RangeError("Foundry V4 post-promotion Watch lost its immutable authority or head"); }
    return next;
  }
}
