import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import { parseTearFoundryV3PromotionReceipt } from "./foundry-job-v3-promotion";
import { parseTearFoundryV3PromotionApproval } from "./foundry-job-v3-promotion-approval";
import { parseTearFoundryJob, requireTearFoundryEvaluationProtocol } from "./foundry-job-state";
import { parseTearPolicyActivation } from "./policy-artifact-registry";
import { parseTearPolicyDecisionJournal, type TearPolicyDecisionJournalV1 } from "./policy-decision-journal";

const HASH = /^[a-f0-9]{16}$/u;
const RECEIPT = "foundry-job-v3-promotion-receipt:v1:";
const APPROVAL = "foundry-job-v3-promotion-approval:v1:";
const RECORD = "foundry-job-v3-post-promotion-monitor:v1:";

export interface TearFoundryV3PostPromotionTerminalReceiptV1 {
  readonly format: "tear-foundry-v3-post-promotion-terminal"; readonly schemaVersion: 1;
  readonly journalId: string; readonly journalHash: string; readonly terminal: Readonly<{ status: "completed" | "failed" | "stopped"; tick: number; reasonHash?: string }>;
  readonly receiptHash: string;
}
export interface TearFoundryV3PostPromotionMonitorRecordV1 {
  readonly format: "tear-foundry-v3-post-promotion-monitor"; readonly schemaVersion: 1;
  readonly promotion: Readonly<{ approvalHash: string; promotionReceiptHash: string; artifactId: string; artifactHash: string; activationHash: string }>;
  /** The promotion's pre-existing V2 protocol is copied verbatim; this monitor cannot loosen it. */
  readonly policy: Readonly<{ protocolHash: string; stopConditionsHash: string; thresholds: Readonly<{ minimumRewardGain: number; requireCompletionRateNotLower: boolean; maxTicksPerCase: number; maxAbsoluteRewardPerCase: number }>; regressionPolicy: "classify-only-no-rollback" }>;
  readonly evidence: Readonly<{ terminalReceiptHash: string; journalHash: string; journalRootHash: string; decisionCount: number; artifactDecisionCount: number; sampleEntryHashes: readonly string[]; terminalStatus: "completed" | "failed" | "stopped"; terminalTick: number }>;
  readonly classification: "observation" | "threshold-breach"; readonly recordedAt: string; readonly recordHash: string;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function time(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function guard(key: string, expected: string | undefined): Readonly<{ store: "analysis"; key: string; expected?: string }> { return Object.freeze({ store: "analysis" as const, key, ...(expected === undefined ? {} : { expected }) }); }

function terminal(draft: Omit<TearFoundryV3PostPromotionTerminalReceiptV1, "receiptHash">): TearFoundryV3PostPromotionTerminalReceiptV1 {
  if (!text(draft.journalId) || !hash(draft.journalHash) || !Number.isSafeInteger(draft.terminal.tick) || draft.terminal.tick < 0 || !["completed", "failed", "stopped"].includes(draft.terminal.status) || (draft.terminal.reasonHash !== undefined && !hash(draft.terminal.reasonHash))) throw new TypeError("invalid post-promotion terminal receipt");
  const value = freeze({ ...draft, terminal: freeze(draft.terminal) }); return freeze({ ...value, receiptHash: stableVerificationHash(value) });
}
export function createTearFoundryV3PostPromotionTerminalReceipt(input: Omit<TearFoundryV3PostPromotionTerminalReceiptV1, "format" | "schemaVersion" | "receiptHash">): TearFoundryV3PostPromotionTerminalReceiptV1 { return terminal({ format: "tear-foundry-v3-post-promotion-terminal", schemaVersion: 1, ...input }); }
export function parseTearFoundryV3PostPromotionTerminalReceipt(value: unknown): TearFoundryV3PostPromotionTerminalReceiptV1 {
  if (!record(value) || value.format !== "tear-foundry-v3-post-promotion-terminal" || value.schemaVersion !== 1 || !hash(value.receiptHash)) throw new TypeError("invalid post-promotion terminal receipt");
  const typed = value as unknown as TearFoundryV3PostPromotionTerminalReceiptV1, { receiptHash, ...draft } = typed, parsed = terminal(draft); if (receiptHash !== parsed.receiptHash) throw new TypeError("post-promotion terminal receipt integrity mismatch"); return parsed;
}
function monitor(draft: Omit<TearFoundryV3PostPromotionMonitorRecordV1, "recordHash">): TearFoundryV3PostPromotionMonitorRecordV1 {
  if (!hash(draft.promotion.approvalHash) || !hash(draft.promotion.promotionReceiptHash) || !text(draft.promotion.artifactId) || !hash(draft.promotion.artifactHash) || !hash(draft.promotion.activationHash) || !hash(draft.policy.protocolHash) || !hash(draft.policy.stopConditionsHash) || !hash(draft.evidence.terminalReceiptHash) || !hash(draft.evidence.journalHash) || !hash(draft.evidence.journalRootHash) || !Number.isSafeInteger(draft.evidence.decisionCount) || draft.evidence.decisionCount < 1 || !Number.isSafeInteger(draft.evidence.artifactDecisionCount) || draft.evidence.artifactDecisionCount !== draft.evidence.decisionCount || !draft.evidence.sampleEntryHashes.every(hash) || !Number.isSafeInteger(draft.evidence.terminalTick) || draft.evidence.terminalTick < 0 || !["observation", "threshold-breach"].includes(draft.classification) || !time(draft.recordedAt)) throw new TypeError("invalid post-promotion monitor record");
  const value = freeze({ ...draft, promotion: freeze(draft.promotion), policy: freeze({ ...draft.policy, thresholds: freeze(draft.policy.thresholds) }), evidence: freeze({ ...draft.evidence, sampleEntryHashes: freeze([...draft.evidence.sampleEntryHashes]) }) }); return freeze({ ...value, recordHash: stableVerificationHash(value) });
}
export function parseTearFoundryV3PostPromotionMonitorRecord(value: unknown): TearFoundryV3PostPromotionMonitorRecordV1 {
  if (!record(value) || value.format !== "tear-foundry-v3-post-promotion-monitor" || value.schemaVersion !== 1 || !hash(value.recordHash)) throw new TypeError("invalid post-promotion monitor record");
  const typed = value as unknown as TearFoundryV3PostPromotionMonitorRecordV1, { recordHash, ...draft } = typed, parsed = monitor(draft); if (recordHash !== parsed.recordHash) throw new TypeError("post-promotion monitor record integrity mismatch"); return parsed;
}

async function exactPromotion(backend: GhostVaultBackend) {
  const activeRaw = await backend.get("analysis", "policy-active:v1"); if (activeRaw === undefined) throw new RangeError("post-promotion monitoring requires an active candidate");
  const active = parseTearPolicyActivation(JSON.parse(activeRaw));
  const keys = (await backend.keys("analysis")).filter((key) => key.startsWith(RECEIPT)); if (keys.length > 256) throw new RangeError("post-promotion monitoring refuses unbounded promotion lookup");
  const matches = [] as ReturnType<typeof parseTearFoundryV3PromotionReceipt>[];
  for (const key of keys) { const raw = await backend.get("analysis", key); if (raw === undefined) continue; try { const value = parseTearFoundryV3PromotionReceipt(JSON.parse(raw)); if (value.artifactId === active.artifactId && value.artifactHash === active.artifactHash && value.activationHash === active.activationHash) matches.push(value); } catch { await backend.put("quarantine", `${key}:post-promotion-monitor`, raw); } }
  if (matches.length !== 1 || matches[0] === undefined) throw new RangeError("post-promotion monitoring requires one exact active promotion receipt"); return { active, promotion: matches[0], activeRaw };
}
function journalEvidence(journal: TearPolicyDecisionJournalV1, promotion: Awaited<ReturnType<typeof exactPromotion>>["promotion"]) {
  if (!journal.id.startsWith("watch-policy:v1:") || journal.droppedEntries !== 0 || journal.entries.length < 1) throw new RangeError("post-promotion monitoring requires a complete Watch decision journal");
  if (!journal.entries.every((entry) => entry.receipt.source === "artifact" && entry.receipt.artifactId === promotion.artifactId && entry.receipt.artifactHash === promotion.artifactHash && entry.receipt.activationHash === promotion.activationHash)) throw new RangeError("post-promotion monitoring journal is not the exact active candidate");
  const first = journal.entries[0], last = journal.entries.at(-1); if (first === undefined || last === undefined) throw new RangeError("post-promotion monitoring requires journal evidence");
  return freeze({ journalHash: journal.journalHash, journalRootHash: journal.rootHash, decisionCount: journal.entries.length, artifactDecisionCount: journal.entries.length, sampleEntryHashes: journal.entries.length === 1 ? [first.entryHash] : [first.entryHash, last.entryHash] });
}

/** Durable aggregate-only observer for a C36-approved active V3 Watch run. It cannot activate, roll back, train, or change traffic. */
export class TearFoundryV3PostPromotionMonitor {
  readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async retain(terminalInput: TearFoundryV3PostPromotionTerminalReceiptV1, recordedAt: string): Promise<TearFoundryV3PostPromotionMonitorRecordV1> {
    const terminalReceipt = parseTearFoundryV3PostPromotionTerminalReceipt(terminalInput); if (!time(recordedAt)) throw new TypeError("post-promotion monitor time is invalid");
    const journalRaw = await this.#backend.get("analysis", `policy-decision-journal:v1:${terminalReceipt.journalId}`); if (journalRaw === undefined) throw new RangeError("post-promotion monitor journal is unavailable");
    let journal; try { journal = parseTearPolicyDecisionJournal(JSON.parse(journalRaw)); } catch { await this.#backend.put("quarantine", `policy-decision-journal-quarantine:v1:${terminalReceipt.journalId}:post-promotion-monitor`, journalRaw); throw new RangeError("post-promotion monitor journal is corrupt"); }
    if (journal.journalHash !== terminalReceipt.journalHash) throw new RangeError("post-promotion terminal journal changed");
    const exact = await exactPromotion(this.#backend), approvalRaw = await this.#backend.get("analysis", `${APPROVAL}${exact.promotion.approvalHash}`); if (approvalRaw === undefined) throw new RangeError("post-promotion approval is unavailable");
    let approval; try { approval = parseTearFoundryV3PromotionApproval(JSON.parse(approvalRaw)); } catch { await this.#backend.put("quarantine", `${APPROVAL}${exact.promotion.approvalHash}:post-promotion-monitor`, approvalRaw); throw new RangeError("post-promotion approval is corrupt"); }
    if (approval.approvalHash !== exact.promotion.approvalHash || approval.candidate.id !== exact.promotion.artifactId || approval.candidate.artifactHash !== exact.promotion.artifactHash) throw new RangeError("post-promotion approval provenance changed");
    const jobRaw = await this.#backend.get("analysis", `foundry-job:v1:${approval.job.id}`); if (jobRaw === undefined) throw new RangeError("post-promotion monitoring job is unavailable");
    const job = parseTearFoundryJob(JSON.parse(jobRaw)), protocol = requireTearFoundryEvaluationProtocol(job); if (job.jobHash !== approval.job.jobHash || protocol.protocolHash !== approval.job.protocolHash || job.inputs.stopConditionsHash !== approval.job.stopConditionsHash) throw new RangeError("post-promotion monitoring policy changed");
    const evidence = journalEvidence(journal, exact.promotion), draft = { format: "tear-foundry-v3-post-promotion-monitor" as const, schemaVersion: 1 as const, promotion: { approvalHash: exact.promotion.approvalHash, promotionReceiptHash: exact.promotion.receiptHash, artifactId: exact.promotion.artifactId, artifactHash: exact.promotion.artifactHash, activationHash: exact.promotion.activationHash }, policy: { protocolHash: protocol.protocolHash, stopConditionsHash: job.inputs.stopConditionsHash, thresholds: protocol.thresholds, regressionPolicy: "classify-only-no-rollback" as const }, evidence: { terminalReceiptHash: terminalReceipt.receiptHash, ...evidence, terminalStatus: terminalReceipt.terminal.status, terminalTick: terminalReceipt.terminal.tick }, classification: terminalReceipt.terminal.status === "completed" ? "observation" as const : "threshold-breach" as const, recordedAt }, output = monitor(draft), key = `${RECORD}${output.recordHash}`;
    const previous = await this.#backend.get("analysis", key); if (previous !== undefined) { try { return parseTearFoundryV3PostPromotionMonitorRecord(JSON.parse(previous)); } catch { await this.#backend.put("quarantine", `${key}:read`, previous); throw new RangeError("post-promotion monitor record is corrupt"); } }
    await this.#backend.commitIfMatches(Object.freeze([guard("policy-active:v1", exact.activeRaw), guard(`policy-decision-journal:v1:${terminalReceipt.journalId}`, journalRaw), guard(`${APPROVAL}${approval.approvalHash}`, approvalRaw), guard(`foundry-job:v1:${approval.job.id}`, jobRaw), guard(key, undefined)]), Object.freeze([{ store: "analysis", key, value: JSON.stringify(output) }, { store: "indexes", key: `foundry-job-v3-post-promotion-monitor:${exact.promotion.artifactHash}:${output.recordHash}`, value: JSON.stringify(Object.freeze({ classification: output.classification, active: true, aggregateOnly: true })) }]));
    return output;
  }
}
