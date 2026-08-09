import { stableVerificationHash } from "../replay/hash";
import type { TearHumanCalibrationDistributionV1 } from "./tearbot-human-calibration-distribution";
import type { TearBotV3CanonicalEvaluationReportV1 } from "./tearbot-v3-canonical-evaluation";

const HASH = /^[a-f0-9]{16}$/u;
export interface TearBotHumanLikenessThresholdsV1 {
  readonly format: "tearbot-human-likeness-thresholds"; readonly schemaVersion: 1;
  readonly maximumMeanTraceCommandCountDifference: number; readonly maximumActiveCommandRateDifference: number;
  readonly maximumMeanInterCommandTicksDifference: number; readonly maximumMeanMaximumInterCommandTicksDifference: number;
  readonly thresholdHash: string;
}
export interface TearBotHumanLikenessComparisonReportV1 {
  readonly format: "tearbot-human-likeness-comparison-report"; readonly schemaVersion: 1;
  readonly status: "insufficient-evidence" | "compared-not-certified";
  readonly reason: "invalid-calibration-distribution" | "insufficient-participants" | "invalid-frozen-thresholds" | "invalid-promoted-canonical-evaluation" | "no-canonical-decisions" | "omega-excluded" | null;
  readonly subject: "promoted-v3-canonical-non-omega";
  readonly calibrationDistributionHash: string | null; readonly evaluationReportHash: string | null; readonly thresholdHash: string | null;
  readonly comparison: Readonly<{ readonly human: TearHumanLikenessMetricsV1; readonly candidate: TearHumanLikenessMetricsV1; readonly absoluteDifference: TearHumanLikenessMetricsV1; readonly withinFrozenThresholds: boolean }> | null;
  readonly placement: "unassigned"; readonly certification: "not-certified"; readonly reportHash: string;
}
export interface TearHumanLikenessMetricsV1 { readonly meanTraceCommandCount: number; readonly meanActiveCommandRate: number; readonly meanInterCommandTicks: number; readonly meanMaximumInterCommandTicks: number; }

function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function metrics(value: unknown): value is TearHumanLikenessMetricsV1 { if (value === null || typeof value !== "object" || Array.isArray(value)) return false; const typed = value as TearHumanLikenessMetricsV1; return finite(typed.meanTraceCommandCount) && finite(typed.meanActiveCommandRate) && typed.meanActiveCommandRate <= 1 && finite(typed.meanInterCommandTicks) && finite(typed.meanMaximumInterCommandTicks); }
function average(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / values.length; }

function thresholdDraft(value: Omit<TearBotHumanLikenessThresholdsV1, "thresholdHash">): TearBotHumanLikenessThresholdsV1 {
  const draft = freeze(value); return freeze({ ...draft, thresholdHash: stableVerificationHash(draft) });
}
export function createTearBotHumanLikenessThresholds(input: Omit<TearBotHumanLikenessThresholdsV1, "format" | "schemaVersion" | "thresholdHash">): TearBotHumanLikenessThresholdsV1 { return thresholdDraft({ format: "tearbot-human-likeness-thresholds", schemaVersion: 1, ...input }); }
export function parseTearBotHumanLikenessThresholds(value: unknown): TearBotHumanLikenessThresholdsV1 {
  if (!record(value) || value.format !== "tearbot-human-likeness-thresholds" || value.schemaVersion !== 1 || !finite(value.maximumMeanTraceCommandCountDifference) || !finite(value.maximumActiveCommandRateDifference) || value.maximumActiveCommandRateDifference > 1 || !finite(value.maximumMeanInterCommandTicksDifference) || !finite(value.maximumMeanMaximumInterCommandTicksDifference) || !hash(value.thresholdHash)) throw new TypeError("invalid frozen human-likeness thresholds");
  const typed = value as unknown as TearBotHumanLikenessThresholdsV1, { thresholdHash, ...draft } = typed, parsed = thresholdDraft(draft); if (thresholdHash !== parsed.thresholdHash) throw new TypeError("human-likeness threshold integrity mismatch"); return parsed;
}

function validDistribution(value: unknown): value is TearHumanCalibrationDistributionV1 {
  if (!record(value) || value.format !== "tearbot-human-calibration-distribution" || value.schemaVersion !== 1 || typeof value.participantCount !== "number" || !Number.isSafeInteger(value.participantCount) || value.participantCount < 0 || typeof value.samplesPerParticipant !== "number" || !Number.isSafeInteger(value.samplesPerParticipant) || value.samplesPerParticipant < 1 || !Array.isArray(value.sourceReceiptHashes) || value.sourceReceiptHashes.length !== value.participantCount * value.samplesPerParticipant || !value.sourceReceiptHashes.every(hash) || !metrics(value.metrics) || !hash(value.provenanceHash) || !hash(value.distributionHash)) return false;
  const typed = value as unknown as TearHumanCalibrationDistributionV1, { distributionHash, ...draft } = typed; return stableVerificationHash(draft) === distributionHash;
}
function validEpisode(value: unknown, provenance: TearBotV3CanonicalEvaluationReportV1["provenance"]): boolean {
  if (!record(value) || typeof value.caseId !== "string" || !hash(value.scenarioHash) || typeof value.freshWorldOrdinal !== "number" || !Number.isSafeInteger(value.freshWorldOrdinal) || value.freshWorldOrdinal < 1 || !hash(value.eventHash) || !Array.isArray(value.decisions)) return false;
  return value.decisions.every((decision) => record(decision) && typeof decision.tick === "number" && Number.isSafeInteger(decision.tick) && decision.tick >= 0 && hash(decision.stateHash) && hash(decision.semanticActionHash) && typeof decision.actionCount === "number" && Number.isSafeInteger(decision.actionCount) && decision.actionCount >= 0 && decision.source === "artifact" && decision.artifactId === provenance.artifactId && decision.artifactHash === provenance.artifactHash && decision.activationHash === provenance.activationHash);
}
function validEvaluation(value: unknown): value is TearBotV3CanonicalEvaluationReportV1 {
  if (!record(value) || value.format !== "tearbot-v3-canonical-evaluation-report" || value.schemaVersion !== 1 || !hash(value.planHash) || !hash(value.reportHash) || value.placement !== "unassigned" || value.humanCalibration !== "not-compared" || !record(value.provenance) || typeof value.provenance.artifactId !== "string" || !hash(value.provenance.approvalHash) || !hash(value.provenance.promotionReceiptHash) || !hash(value.provenance.artifactHash) || !hash(value.provenance.activationHash) || !hash(value.provenance.candidatePayloadHash) || !Array.isArray(value.episodes) || value.episodes.length < 1) return false;
  const typed = value as unknown as TearBotV3CanonicalEvaluationReportV1, { reportHash, ...draft } = typed; return stableVerificationHash(draft) === reportHash && typed.episodes.every((episode) => validEpisode(episode, typed.provenance));
}
function candidateMetrics(report: TearBotV3CanonicalEvaluationReportV1): TearHumanLikenessMetricsV1 | undefined {
  const episodes = report.episodes.map((episode) => episode.decisions.slice().sort((left, right) => left.tick - right.tick));
  if (episodes.some((entries) => entries.length === 0)) return undefined;
  const commandCounts = episodes.map((entries) => entries.reduce((total, entry) => total + entry.actionCount, 0));
  const active = episodes.flatMap((entries) => entries.filter((entry) => entry.actionCount > 0));
  if (active.length === 0) return undefined;
  const all = episodes.flat();
  const intervals = episodes.flatMap((entries) => entries.filter((entry) => entry.actionCount > 0).slice(1).map((entry, index, activeEntries) => entry.tick - (activeEntries[index]?.tick ?? entry.tick)));
  return freeze({ meanTraceCommandCount: average(commandCounts), meanActiveCommandRate: active.length / all.length, meanInterCommandTicks: intervals.length === 0 ? 0 : average(intervals), meanMaximumInterCommandTicks: intervals.length === 0 ? 0 : Math.max(...intervals) });
}
function insufficient(reason: TearBotHumanLikenessComparisonReportV1["reason"], hashes: Partial<Pick<TearBotHumanLikenessComparisonReportV1, "calibrationDistributionHash" | "evaluationReportHash" | "thresholdHash">> = {}): TearBotHumanLikenessComparisonReportV1 {
  const draft = { format: "tearbot-human-likeness-comparison-report" as const, schemaVersion: 1 as const, status: "insufficient-evidence" as const, reason, subject: "promoted-v3-canonical-non-omega" as const, calibrationDistributionHash: hashes.calibrationDistributionHash ?? null, evaluationReportHash: hashes.evaluationReportHash ?? null, thresholdHash: hashes.thresholdHash ?? null, comparison: null, placement: "unassigned" as const, certification: "not-certified" as const }; return freeze({ ...draft, reportHash: stableVerificationHash(draft) });
}

/** Hash-bound aggregate comparison only. It excludes Omega by accepting only the non-Omega promoted-V3 subject and can never certify, place, promote, or mutate policy state. */
export function compareTearBotHumanLikeness(input: { readonly distribution: unknown; readonly evaluation: unknown; readonly thresholds: unknown; readonly subject?: "promoted-v3-canonical-non-omega" | "level-omega" }): TearBotHumanLikenessComparisonReportV1 {
  if (input.subject === "level-omega") return insufficient("omega-excluded");
  if (!validDistribution(input.distribution)) return insufficient("invalid-calibration-distribution");
  const distribution = input.distribution;
  if (distribution.participantCount < 30) return insufficient("insufficient-participants", { calibrationDistributionHash: distribution.distributionHash });
  let thresholds: TearBotHumanLikenessThresholdsV1; try { thresholds = parseTearBotHumanLikenessThresholds(input.thresholds); } catch { return insufficient("invalid-frozen-thresholds", { calibrationDistributionHash: distribution.distributionHash }); }
  if (!validEvaluation(input.evaluation)) return insufficient("invalid-promoted-canonical-evaluation", { calibrationDistributionHash: distribution.distributionHash, thresholdHash: thresholds.thresholdHash });
  const evaluation = input.evaluation, candidate = candidateMetrics(evaluation);
  if (candidate === undefined) return insufficient("no-canonical-decisions", { calibrationDistributionHash: distribution.distributionHash, evaluationReportHash: evaluation.reportHash, thresholdHash: thresholds.thresholdHash });
  const human = freeze({ ...distribution.metrics }), absoluteDifference = freeze({ meanTraceCommandCount: Math.abs(candidate.meanTraceCommandCount - human.meanTraceCommandCount), meanActiveCommandRate: Math.abs(candidate.meanActiveCommandRate - human.meanActiveCommandRate), meanInterCommandTicks: Math.abs(candidate.meanInterCommandTicks - human.meanInterCommandTicks), meanMaximumInterCommandTicks: Math.abs(candidate.meanMaximumInterCommandTicks - human.meanMaximumInterCommandTicks) });
  const withinFrozenThresholds = absoluteDifference.meanTraceCommandCount <= thresholds.maximumMeanTraceCommandCountDifference && absoluteDifference.meanActiveCommandRate <= thresholds.maximumActiveCommandRateDifference && absoluteDifference.meanInterCommandTicks <= thresholds.maximumMeanInterCommandTicksDifference && absoluteDifference.meanMaximumInterCommandTicks <= thresholds.maximumMeanMaximumInterCommandTicksDifference;
  const draft = { format: "tearbot-human-likeness-comparison-report" as const, schemaVersion: 1 as const, status: "compared-not-certified" as const, reason: null, subject: "promoted-v3-canonical-non-omega" as const, calibrationDistributionHash: distribution.distributionHash, evaluationReportHash: evaluation.reportHash, thresholdHash: thresholds.thresholdHash, comparison: freeze({ human, candidate, absoluteDifference, withinFrozenThresholds }), placement: "unassigned" as const, certification: "not-certified" as const };
  return freeze({ ...draft, reportHash: stableVerificationHash(draft) });
}
