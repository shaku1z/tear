import { stableVerificationHash } from "../replay/hash";
import type { GameAction } from "../input/game-action";
import { projectScenarioPolicyConditionV2, type TearPolicyConditioningV2 } from "./policy-condition-vector";
import type { TearAgentProfileId } from "./contracts";
import type { TearAcademyTrainingDatasetV1 } from "./academy-training-dataset";
import { projectCanonicalPolicyFeatures, TEAR_POLICY_FEATURE_WIDTH_V1 } from "./policy-feature-vector";

export interface TearTemporalPolicyContextV1 {
  readonly candidateHash: string;
  readonly tick: number;
  readonly featureFrames: readonly (readonly number[])[];
  /** The next authoritative action batch for the final, causal frame. */
  readonly targetActions: readonly GameAction[];
  readonly condition: readonly number[];
  readonly conditioning: TearPolicyConditioningV2;
  readonly contextHash: string;
}

function conditioning(sequence: TearAcademyTrainingDatasetV1["sequences"][number]): TearPolicyConditioningV2 {
  const persona = sequence.tags.find((tag) => tag.startsWith("persona:"))?.slice("persona:".length);
  const style = sequence.tags.find((tag) => tag.startsWith("style:"))?.slice("style:".length);
  return Object.freeze({ lessonId: sequence.lessonId, ...(persona === undefined ? {} : { personaId: persona as TearAgentProfileId }),
    ...(style === undefined ? {} : { styleId: style }) });
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
      const tick = sequence.tracks.observations[index]?.tick ?? 0;
      const targetActions = Object.freeze(sequence.tracks.actions.filter((entry) => entry.tick === tick + 1)
        .map((entry) => Object.freeze(structuredClone(entry.command))));
      if (sequence.sourceScenario === undefined) throw new RangeError("temporal policy context requires source scenario identity");
      const sourceConditioning = conditioning(sequence), condition = projectScenarioPolicyConditionV2(sequence.sourceScenario, sourceConditioning);
      const draft = { candidateHash: sequence.candidateHash, tick, featureFrames, targetActions, condition, conditioning: sourceConditioning };
      contexts.push(Object.freeze({ ...draft, contextHash: stableVerificationHash(draft) }));
    }
  }
  return Object.freeze(contexts);
}
