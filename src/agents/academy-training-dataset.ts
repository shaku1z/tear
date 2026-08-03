import { stableVerificationHash } from "../replay/hash";
import type { TearScenarioV1 } from "../tearbench/contracts";
import type { TearAcademyCandidateTrackBundleV1 } from "./academy-candidate-tracks";
import type { TearAcademyCorpusEntryV1, TearAcademyCorpusManifestV1, TearAcademyCorpusStore } from "./academy-corpus";
import type { TearAcademyReviewedSampleStore } from "./academy-reviewed-sample";

export interface TearAcademyTrainingDatasetRequestV1 {
  readonly manifestId: string;
  readonly trainerId: string;
  readonly version: number;
}

export interface TearAcademyTrainingSequenceV1 {
  readonly candidateHash: string;
  readonly split: Exclude<TearAcademyCorpusEntryV1["split"], "hidden-release-exam">;
  readonly lessonId: string;
  readonly segmentKind: TearAcademyCorpusEntryV1["segmentKind"];
  readonly tags: readonly string[];
  /** Source episode identity enables later fail-closed unseen-seed evaluation. */
  readonly sourceScenario?: TearScenarioV1;
  readonly tracks: TearAcademyCandidateTrackBundleV1;
  readonly sequenceHash: string;
}

export interface TearAcademyTrainingDatasetV1 {
  readonly format: "tear-academy-training-dataset";
  readonly schemaVersion: 1;
  readonly manifest: Readonly<{ id: string; version: number; manifestHash: string; rootHash: string }>;
  readonly sequences: readonly TearAcademyTrainingSequenceV1[];
  readonly observationCount: number;
  readonly actionCount: number;
  readonly datasetHash: string;
}

export interface TearAcademyTrainingDatasetLimits {
  readonly maxSequences: number;
  readonly maxObservations: number;
  readonly maxActions: number;
}

export const DEFAULT_TEAR_ACADEMY_TRAINING_DATASET_LIMITS: TearAcademyTrainingDatasetLimits = Object.freeze({
  maxSequences: 256,
  maxObservations: 1_000_000,
  maxActions: 1_000_000,
});

function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function validLimits(value: TearAcademyTrainingDatasetLimits): boolean {
  return Number.isSafeInteger(value.maxSequences) && value.maxSequences > 0
    && Number.isSafeInteger(value.maxObservations) && value.maxObservations > 0
    && Number.isSafeInteger(value.maxActions) && value.maxActions > 0;
}
function trackRoot(tracks: TearAcademyCandidateTrackBundleV1): string {
  return stableVerificationHash({ observations: tracks.observations, actions: tracks.actions, nativeEvents: tracks.nativeEvents,
    rewardComponents: tracks.rewardComponents, intents: tracks.intents });
}
function sequenceHash(entry: TearAcademyCorpusEntryV1, tracks: TearAcademyCandidateTrackBundleV1): string {
  return stableVerificationHash({ candidateHash: entry.candidateHash, entryHash: entry.entryHash, lessonId: entry.lessonId,
    segmentKind: entry.segmentKind, tags: entry.tags, trackRoot: tracks.bundleHash });
}
function freezeSequence(entry: TearAcademyCorpusEntryV1, tracks: TearAcademyCandidateTrackBundleV1): TearAcademyTrainingSequenceV1 {
  if (entry.split === "hidden-release-exam") throw new RangeError("Academy training datasets exclude hidden release exams");
  return Object.freeze({ candidateHash: entry.candidateHash, split: entry.split, lessonId: entry.lessonId, segmentKind: entry.segmentKind,
    tags: Object.freeze([...entry.tags]), ...(tracks.sourceScenario === undefined ? {} : { sourceScenario: Object.freeze(structuredClone(tracks.sourceScenario)) }),
    tracks: Object.freeze(structuredClone(tracks)), sequenceHash: sequenceHash(entry, tracks) });
}

/**
 * C33's immutable read boundary over C31's governed trainer manifests. It only
 * loads validated sequences; model construction, optimization, and artifact
 * production remain later C33 work.
 */
export class TearAcademyTrainingDatasetLoader {
  readonly #corpus: TearAcademyCorpusStore;
  readonly #samples: TearAcademyReviewedSampleStore;
  readonly #limits: TearAcademyTrainingDatasetLimits;

  constructor(corpus: TearAcademyCorpusStore, samples: TearAcademyReviewedSampleStore,
    limits: TearAcademyTrainingDatasetLimits = DEFAULT_TEAR_ACADEMY_TRAINING_DATASET_LIMITS) {
    if (!validLimits(limits)) throw new TypeError("invalid Academy training dataset limits");
    this.#corpus = corpus; this.#samples = samples; this.#limits = Object.freeze({ ...limits });
  }

  async load(request: TearAcademyTrainingDatasetRequestV1): Promise<TearAcademyTrainingDatasetV1> {
    if (!text(request.manifestId) || !text(request.trainerId) || !Number.isSafeInteger(request.version) || request.version < 1) {
      throw new TypeError("invalid Academy training dataset request");
    }
    const manifest = await this.#corpus.getManifest(request.manifestId, { kind: "trainer", id: request.trainerId }, request.version);
    if (manifest === undefined) throw new RangeError("immutable Academy trainer manifest is unavailable");
    return this.#loadManifest(manifest);
  }

  async #loadManifest(manifest: TearAcademyCorpusManifestV1): Promise<TearAcademyTrainingDatasetV1> {
    if (manifest.reader.kind !== "trainer" || manifest.entries.some((entry) => entry.split === "hidden-release-exam")) {
      throw new RangeError("Academy training datasets exclude hidden release exams");
    }
    if (manifest.entries.length > this.#limits.maxSequences) throw new RangeError("Academy training dataset exceeds sequence limit");
    const sequences: TearAcademyTrainingSequenceV1[] = [];
    let observationCount = 0, actionCount = 0;
    for (const entry of [...manifest.entries].sort((left, right) => left.candidateHash.localeCompare(right.candidateHash))) {
      const sample = await this.#samples.get(entry.candidateHash);
      if (sample === undefined) throw new RangeError("Academy training manifest entry reviewed sample is unavailable");
      const tracks = sample.tracks;
      if (sample.sampleHash !== entry.reviewedSampleHash || sample.custodyRecordHash !== entry.custodyRecordHash
        || sample.curationDecisionHash !== entry.curationDecisionHash || sample.splitAssignmentHash !== entry.splitAssignmentHash
        || sample.split !== entry.split || tracks === undefined || trackRoot(tracks) !== entry.tracks.rootHash) {
        throw new RangeError("Academy training manifest entry no longer matches its reviewed sample");
      }
      observationCount += tracks.observations.length;
      actionCount += tracks.actions.length;
      if (observationCount > this.#limits.maxObservations || actionCount > this.#limits.maxActions) {
        throw new RangeError("Academy training dataset exceeds track limit");
      }
      sequences.push(freezeSequence(entry, tracks));
    }
    const draft = { format: "tear-academy-training-dataset" as const, schemaVersion: 1 as const,
      manifest: Object.freeze({ id: manifest.id, version: manifest.version, manifestHash: manifest.manifestHash, rootHash: manifest.rootHash }),
      sequences: Object.freeze(sequences), observationCount, actionCount };
    return Object.freeze({ ...draft, datasetHash: stableVerificationHash(draft) });
  }
}
