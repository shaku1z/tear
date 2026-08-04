import { stableVerificationHash } from "../replay/hash";
import type { TearScenarioV1 } from "../tearbench/contracts";
import { DIFFICULTY_IDS, RUN_MODE_IDS, WEAPON_IDS } from "../tearbench/registries";
import type { TearAgentObservation } from "./contracts";
import type { TearAgentProfileId } from "./contracts";

export const TEAR_POLICY_CONDITION_IDS_V1 = Object.freeze([
  ...RUN_MODE_IDS.map((value) => `mode:${value}`), ...DIFFICULTY_IDS.map((value) => `difficulty:${value}`), ...WEAPON_IDS.map((value) => `weapon:${value}`),
] as const);
export const TEAR_POLICY_CONDITION_SCHEMA_HASH_V1 = stableVerificationHash(TEAR_POLICY_CONDITION_IDS_V1);
export const TEAR_POLICY_CONDITION_WIDTH_V1 = TEAR_POLICY_CONDITION_IDS_V1.length;

const PERSONA_IDS = ["smoke", "competent", "style", "survival", "chaos", "menu", "transition-hunter"] as const satisfies readonly TearAgentProfileId[];
const STYLE_IDS = ["default", "expressive", "cautious", "aggressive", "unknown"] as const;
export const TEAR_POLICY_CONDITION_IDS_V2 = Object.freeze([
  ...TEAR_POLICY_CONDITION_IDS_V1, "lesson-hash:0", "lesson-hash:1", "lesson-hash:2", "lesson-hash:3",
  ...PERSONA_IDS.map((value) => `persona:${value}`), ...STYLE_IDS.map((value) => `style:${value}`),
] as const);
export const TEAR_POLICY_CONDITION_SCHEMA_HASH_V2 = stableVerificationHash(TEAR_POLICY_CONDITION_IDS_V2);
export const TEAR_POLICY_CONDITION_WIDTH_V2 = TEAR_POLICY_CONDITION_IDS_V2.length;

/** Explicit caller-owned context; corpus tags alone never become live settings. */
export interface TearPolicyConditioningV2 {
  readonly lessonId?: string;
  readonly personaId?: TearAgentProfileId;
  readonly styleId?: string;
}

function project(mode: string, difficulty: string, weapon: string): readonly number[] {
  const active = new Set([`mode:${mode}`, `difficulty:${difficulty}`, `weapon:${weapon}`]);
  return Object.freeze(TEAR_POLICY_CONDITION_IDS_V1.map((id) => Number(active.has(id))));
}

function validId(value: string | undefined): value is string { return value !== undefined && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value); }
function conditioning(value: TearPolicyConditioningV2 | undefined): TearPolicyConditioningV2 {
  if (value === undefined) return Object.freeze({});
  if ((value.lessonId !== undefined && !validId(value.lessonId)) || (value.personaId !== undefined && !PERSONA_IDS.includes(value.personaId))
    || (value.styleId !== undefined && !validId(value.styleId))) throw new TypeError("invalid policy conditioning context");
  return Object.freeze({ ...value });
}
function lessonFingerprint(lessonId: string | undefined): readonly number[] {
  if (lessonId === undefined) return Object.freeze([0, 0, 0, 0]);
  const hash = stableVerificationHash(lessonId);
  return Object.freeze([0, 2, 4, 6].map((offset) => Number.parseInt(hash.slice(offset, offset + 2), 16) / 255));
}
function projectV2(mode: string, difficulty: string, weapon: string, input?: TearPolicyConditioningV2): readonly number[] {
  const context = conditioning(input), active = new Set([`mode:${mode}`, `difficulty:${difficulty}`, `weapon:${weapon}`]);
  if (context.personaId !== undefined) active.add(`persona:${context.personaId}`);
  if (context.styleId !== undefined) active.add(`style:${STYLE_IDS.includes(context.styleId as typeof STYLE_IDS[number]) ? context.styleId : "unknown"}`);
  const fingerprint = lessonFingerprint(context.lessonId);
  return Object.freeze(TEAR_POLICY_CONDITION_IDS_V2.map((id, index) => id.startsWith("lesson-hash:") ? fingerprint[index - TEAR_POLICY_CONDITION_WIDTH_V1] ?? 0 : Number(active.has(id))));
}
export function projectScenarioPolicyCondition(scenario: TearScenarioV1): readonly number[] {
  return project(scenario.start.mode, scenario.start.difficulty, scenario.start.weapon);
}
export function projectStructuredPolicyCondition(observation: TearAgentObservation): readonly number[] {
  return project(observation.state.run.mode, observation.state.run.difficulty, observation.state.run.weapon);
}
export function projectScenarioPolicyConditionV2(scenario: TearScenarioV1, context?: TearPolicyConditioningV2): readonly number[] {
  return projectV2(scenario.start.mode, scenario.start.difficulty, scenario.start.weapon, context);
}
export function projectStructuredPolicyConditionV2(observation: TearAgentObservation, context?: TearPolicyConditioningV2): readonly number[] {
  return projectV2(observation.state.run.mode, observation.state.run.difficulty, observation.state.run.weapon, context);
}
export function createTearPolicyConditioningV2(value: TearPolicyConditioningV2 = {}): TearPolicyConditioningV2 { return conditioning(value); }
