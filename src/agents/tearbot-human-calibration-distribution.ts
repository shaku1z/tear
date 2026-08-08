import { stableVerificationHash } from "../replay/hash";
import type { TearHumanCalibrationSourceReceiptV1 } from "./tearbot-human-calibration-source";

export interface TearHumanCalibrationDistributionV1 {
  readonly format: "tearbot-human-calibration-distribution"; readonly schemaVersion: 1;
  readonly participantCount: number; readonly samplesPerParticipant: number; readonly sourceReceiptHashes: readonly string[];
  readonly metrics: Readonly<{ readonly meanTraceCommandCount: number; readonly meanActiveCommandRate: number; readonly meanInterCommandTicks: number; readonly meanMaximumInterCommandTicks: number }>;
  readonly provenanceHash: string; readonly distributionHash: string;
}

function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function valid(receipt: TearHumanCalibrationSourceReceiptV1): boolean {
  const { receiptHash, ...draft } = receipt;
  const f = receipt.features;
  return /^[a-f0-9]{16}$/u.test(receiptHash) && stableVerificationHash(draft) === receiptHash && typeof receipt.participantId === "string" && receipt.participantId.length > 0
    && Number.isSafeInteger(f.commandCount) && f.commandCount >= 0 && Number.isSafeInteger(f.activeCommandCount) && f.activeCommandCount >= 0 && f.activeCommandCount <= f.commandCount
    && Number.isFinite(f.activeCommandRate) && f.activeCommandRate >= 0 && f.activeCommandRate <= 1 && Number.isFinite(f.meanInterCommandTicks) && f.meanInterCommandTicks >= 0 && Number.isFinite(f.maximumInterCommandTicks) && f.maximumInterCommandTicks >= 0;
}
const average = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Produces a reproducible participant-balanced trace/cadence distribution, never a ladder placement or policy certificate. */
export function createTearHumanCalibrationDistribution(receipts: readonly TearHumanCalibrationSourceReceiptV1[]): TearHumanCalibrationDistributionV1 {
  if (receipts.some((receipt) => !valid(receipt))) throw new TypeError("invalid admitted human calibration receipt");
  const groups = new Map<string, TearHumanCalibrationSourceReceiptV1[]>();
  for (const receipt of receipts) groups.set(receipt.participantId, [...(groups.get(receipt.participantId) ?? []), receipt]);
  if (groups.size < 30) throw new RangeError("human calibration requires at least 30 distinct participants");
  const samplesPerParticipant = Math.min(...[...groups.values()].map((group) => group.length));
  if (samplesPerParticipant < 1) throw new RangeError("human calibration requires at least one receipt per participant");
  const selected = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([, group]) => group.slice().sort((left, right) => left.receiptHash.localeCompare(right.receiptHash)).slice(0, samplesPerParticipant));
  const participantMeans = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => {
    const balanced = group.slice().sort((left, right) => left.receiptHash.localeCompare(right.receiptHash)).slice(0, samplesPerParticipant);
    return { commandCount: average(balanced.map((entry) => entry.features.commandCount)), activeRate: average(balanced.map((entry) => entry.features.activeCommandRate)), interval: average(balanced.map((entry) => entry.features.meanInterCommandTicks)), maximum: average(balanced.map((entry) => entry.features.maximumInterCommandTicks)) };
  });
  const sourceReceiptHashes = Object.freeze(selected.map((receipt) => receipt.receiptHash));
  const metrics = freeze({ meanTraceCommandCount: average(participantMeans.map((entry) => entry.commandCount)), meanActiveCommandRate: average(participantMeans.map((entry) => entry.activeRate)), meanInterCommandTicks: average(participantMeans.map((entry) => entry.interval)), meanMaximumInterCommandTicks: average(participantMeans.map((entry) => entry.maximum)) });
  const draft = freeze({ format: "tearbot-human-calibration-distribution" as const, schemaVersion: 1 as const, participantCount: groups.size, samplesPerParticipant, sourceReceiptHashes, metrics, provenanceHash: stableVerificationHash({ sourceReceiptHashes, participantCount: groups.size, samplesPerParticipant }) });
  return freeze({ ...draft, distributionHash: stableVerificationHash(draft) });
}
