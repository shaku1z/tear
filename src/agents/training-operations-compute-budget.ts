import type { TearScenarioV1 } from "../tearbench/contracts";
import { validateProductionHeadlessScenario } from "../tearbench/production-headless-environment";
import {
  validateTrainingArchiveV3CandidateTrainingRequest,
  type TrainingArchiveV3CandidateTrainingRequest,
} from "./training-archive-v3-candidate-training";
import { requireTearFoundryEvaluationProtocol, type TearFoundryJobV1 } from "./foundry-job-state";

function units(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Training Operations compute bound overflow");
  return value;
}

/** Conservative attempted-work allowance, not CPU milliseconds. One unit is an
 * offline Q update or a source fixed tick. Early termination does not refund it.
 * Online maxTicks is PER SCENARIO; maxUpdates bounds the aggregate online pass.
 */
export function trainingOperationsTrainingComputeUnits(request: TrainingArchiveV3CandidateTrainingRequest): number {
  validateTrainingArchiveV3CandidateTrainingRequest(request);
  const ticks = request.online.scenarios.reduce(
    (total, scenario) => units(total + Math.min(scenario.maxTicks, request.online.config.maxTicks)),
    0,
  );
  const offlineUpdates = units(request.offline.config.epochs * request.reward.limits.maxTransitions);
  return units(offlineUpdates + Math.min(ticks, request.online.config.maxUpdates) + units(2 * ticks));
}

/** Both artifacts run each held-out case under the frozen per-case tick cap. */
export function trainingOperationsEvaluationComputeUnits(
  job: TearFoundryJobV1,
  cases: readonly TearScenarioV1[],
): number {
  const protocol = requireTearFoundryEvaluationProtocol(job);
  for (const scenario of cases) validateProductionHeadlessScenario(scenario);
  return units(
    2 *
      cases.reduce(
        (total, scenario) => units(total + Math.min(scenario.maxTicks, protocol.thresholds.maxTicksPerCase)),
        0,
      ),
  );
}
