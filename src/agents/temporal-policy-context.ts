import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import { projectCanonicalPolicyFeatures, TEAR_POLICY_FEATURE_WIDTH_V1 } from "./policy-feature-vector";

export interface TearTemporalPolicyContextV1 {
  readonly candidateHash: string;
  readonly tick: number;
  readonly featureFrames: readonly (readonly number[])[];
  readonly contextHash: string;
}

/** Builds causal, fixed-width context windows from immutable governed tracks. */
export function createTearTemporalPolicyContexts(dataset: TearAcademyTrainingDatasetV1, window: number): readonly TearTemporalPolicyContextV1[] {
  if (!Number.isSafeInteger(window) || window < 1 || window > 64) throw new TypeError("temporal policy window must be between 1 and 64");
  const contexts: TearTemporalPolicyContextV1[] = [];
  for (const sequence of dataset.sequences.filter((entry) => entry.split === "training").sort((a, b) => a.candidateHash.localeCompare(b.candidateHash))) {
    const frames = [...sequence.tracks.observations].sort((a, b) => a.tick - b.tick).map((state) => Object.freeze([...projectCanonicalPolicyFeatures(state)]));
    for (let index = 0; index < frames.length; index += 1) {
      const featureFrames = Object.freeze(frames.slice(Math.max(0, index - window + 1), index + 1));
      if (featureFrames.some((frame) => frame.length !== TEAR_POLICY_FEATURE_WIDTH_V1)) throw new Error("temporal policy feature width changed");
      const draft = { candidateHash: sequence.candidateHash, tick: sequence.tracks.observations[index]?.tick ?? 0, featureFrames };
      contexts.push(Object.freeze({ ...draft, contextHash: stableVerificationHash(draft) }));
    }
  }
  return Object.freeze(contexts);
}
