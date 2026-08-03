import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCandidateCurationStore } from "./academy-candidate-curation";
import type { TearAcademyCandidateQualityStore } from "./academy-candidate-quality";
import type { TearAcademyCandidateSplitStore } from "./academy-candidate-splits";
import type { TearAcademyReviewedSampleStore } from "./academy-reviewed-sample";

/** Immutable C31 product read model; renderers receive this rather than Vault stores. */
export interface TearAcademyInspectionSnapshotV1 {
  readonly format: "tear-academy-inspection";
  readonly schemaVersion: 1;
  readonly observedAt: string;
  readonly custody: Readonly<{ held: number; revoked: number; expired: number; deleted: number; rejectedBytes: number }>;
  readonly quality: Readonly<{ reviewRequired: number; duplicates: number; rejectedBytes: number }>;
  readonly curation: Readonly<{ approved: number; corrections: number; rejected: number; rejectedBytes: number }>;
  readonly splits: Readonly<Record<string, number>>;
  readonly reviewedSamples: number;
}

export interface TearAcademyInspectionStores {
  readonly custody: TearAcademyCandidateCustodyStore;
  readonly quality: TearAcademyCandidateQualityStore;
  readonly curation: TearAcademyCandidateCurationStore;
  readonly splits: TearAcademyCandidateSplitStore;
  readonly samples: TearAcademyReviewedSampleStore;
}

export async function inspectAcademy(stores: TearAcademyInspectionStores, observedAt: string): Promise<TearAcademyInspectionSnapshotV1> {
  if (!Number.isFinite(Date.parse(observedAt))) throw new TypeError("Academy inspection requires a timestamp");
  const [custody, quality, curation, splits] = await Promise.all([
    stores.custody.inventory(), stores.quality.inventory(), stores.curation.inventory(), stores.splits.inventory(),
  ]);
  const samples = await Promise.all(splits.map((entry) => stores.samples.get(entry.candidateHash)));
  const count = <T>(values: readonly T[], predicate: (value: T) => boolean): number => values.filter(predicate).length;
  return Object.freeze({ format: "tear-academy-inspection", schemaVersion: 1, observedAt,
    custody: Object.freeze({ held: count(custody.records, (entry) => entry.status === "held"), revoked: count(custody.records, (entry) => entry.status === "revoked"), expired: count(custody.records, (entry) => entry.status === "expired"), deleted: count(custody.records, (entry) => entry.status === "deleted"), rejectedBytes: custody.rejectedKeys.length }),
    quality: Object.freeze({ reviewRequired: count(quality.assessments, (entry) => entry.disposition === "review-required"), duplicates: count(quality.assessments, (entry) => entry.disposition === "duplicate"), rejectedBytes: quality.rejectedKeys.length }),
    curation: Object.freeze({ approved: count(curation.decisions, (entry) => entry.disposition === "curation-approved"), corrections: count(curation.decisions, (entry) => entry.disposition === "needs-correction"), rejected: count(curation.decisions, (entry) => entry.disposition === "rejected"), rejectedBytes: curation.rejectedKeys.length }),
    splits: Object.freeze(Object.fromEntries(["training", "validation", "calibration", "test", "hidden-release-exam"].map((split) => [split, count(splits, (entry) => entry.split === split)]))),
    reviewedSamples: samples.filter((entry) => entry !== undefined).length,
  });
}
