import type { RunDifficulty } from "../gameplay/run/session";

export type TearDifficultyRiskPosture =
  | "exploratory"
  | "balanced"
  | "disciplined"
  | "high-discipline"
  | "no-contact";

export interface TearDifficultyExpectation {
  readonly difficulty: RunDifficulty;
  readonly ordinal: number;
  readonly riskPosture: TearDifficultyRiskPosture;
  readonly behaviorDirectives: readonly string[];
  readonly draftPriorities: readonly string[];
  readonly numericCompletionTarget: null;
  readonly targetStatus: "unmeasured-requires-consented-human-data";
}

function expectation(
  difficulty: RunDifficulty,
  ordinal: number,
  riskPosture: TearDifficultyRiskPosture,
  behaviorDirectives: readonly string[],
  draftPriorities: readonly string[],
): TearDifficultyExpectation {
  return Object.freeze({
    difficulty,
    ordinal,
    riskPosture,
    behaviorDirectives: Object.freeze([...behaviorDirectives]),
    draftPriorities: Object.freeze([...draftPriorities]),
    numericCompletionTarget: null,
    targetStatus: "unmeasured-requires-consented-human-data",
  });
}

export const TEAR_DIFFICULTY_EXPECTATIONS: readonly TearDifficultyExpectation[] = Object.freeze([
  expectation("easy", 0, "exploratory",
    ["explore broadly", "use lower defensive urgency", "validate novice-readable routes"],
    ["legibility", "mechanic-discovery", "general-synergy"]),
  expectation("normal", 1, "balanced",
    ["balance damage, defense, and recovery", "represent intended general play"],
    ["build-coherence", "sustain", "damage"]),
  expectation("hard", 2, "disciplined",
    ["rank threats strongly", "value sustain", "avoid unsupported greed"],
    ["sustain", "crowd-control", "boss-readiness"]),
  expectation("extreme", 3, "high-discipline",
    ["prioritize crowd control", "route efficiently", "use a low-greed risk budget"],
    ["survivability", "crowd-control", "recovery", "boss-damage"]),
  expectation("onehit", 4, "no-contact",
    ["maintain defensive spacing", "respect every telegraph", "parry selectively", "avoid contact"],
    ["no-contact-safety", "control", "mobility", "safe-boss-damage"]),
]);

export const TEAR_DIFFICULTY_FAIRNESS_METRICS = Object.freeze([
  "completion-rate",
  "median-wave-reached",
  "death-cause-distribution",
  "time-to-first-hit",
  "damage-avoided",
  "simultaneous-threats",
  "projectile-reaction-time",
  "boss-phase-success-rate",
  "successful-build-diversity",
  "input-intensity",
  "required-parry-rate",
  "required-dash-rate",
  "recovery-success",
  "unavoidable-damage-incidents",
  "telegraph-to-impact-window",
  "spawn-safety-distance",
  "onehit-contact-legitimacy",
] as const);

export const TEAR_DIFFICULTY_IDENTITY_FAILURES = Object.freeze([
  "easy-equivalent-to-normal",
  "hard-is-hp-inflation-only",
  "extreme-impossible-for-intended-builds",
  "onehit-hidden-or-unreadable-damage",
  "reward-multiplier-not-applied",
  "selected-difficulty-does-not-match-live-modifiers",
  "playground-difficulty-switch-does-not-renormalize",
] as const);

export function difficultyExpectation(difficulty: RunDifficulty): TearDifficultyExpectation {
  const result = TEAR_DIFFICULTY_EXPECTATIONS.find((entry) => entry.difficulty === difficulty);
  if (result === undefined) throw new TypeError(`missing difficulty expectation: ${difficulty}`);
  return result;
}
