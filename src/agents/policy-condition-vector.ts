import { stableVerificationHash } from "../replay/hash";
import type { TearScenarioV1 } from "../tearbench/contracts";
import { DIFFICULTY_IDS, RUN_MODE_IDS, WEAPON_IDS } from "../tearbench/registries";
import type { TearAgentObservation } from "./contracts";

export const TEAR_POLICY_CONDITION_IDS_V1 = Object.freeze([
  ...RUN_MODE_IDS.map((value) => `mode:${value}`), ...DIFFICULTY_IDS.map((value) => `difficulty:${value}`), ...WEAPON_IDS.map((value) => `weapon:${value}`),
] as const);
export const TEAR_POLICY_CONDITION_SCHEMA_HASH_V1 = stableVerificationHash(TEAR_POLICY_CONDITION_IDS_V1);
export const TEAR_POLICY_CONDITION_WIDTH_V1 = TEAR_POLICY_CONDITION_IDS_V1.length;

function project(mode: string, difficulty: string, weapon: string): readonly number[] {
  const active = new Set([`mode:${mode}`, `difficulty:${difficulty}`, `weapon:${weapon}`]);
  return Object.freeze(TEAR_POLICY_CONDITION_IDS_V1.map((id) => Number(active.has(id))));
}
export function projectScenarioPolicyCondition(scenario: TearScenarioV1): readonly number[] {
  return project(scenario.start.mode, scenario.start.difficulty, scenario.start.weapon);
}
export function projectStructuredPolicyCondition(observation: TearAgentObservation): readonly number[] {
  return project(observation.state.run.mode, observation.state.run.difficulty, observation.state.run.weapon);
}
