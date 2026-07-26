import type { RunDifficulty, RunMode } from "../gameplay/run/session";

export type TearModeCompletionKind =
  | "finite-natural-victory"
  | "endurance-milestone"
  | "coverage-target";

export interface TearModeCompletionContract {
  readonly id: "tutorial" | "adventure" | "endless" | "gauntlet" | "playground" | "boss-test" | "enemy-test";
  readonly mode: RunMode;
  readonly completionKind: TearModeCompletionKind;
  readonly applicableDifficulties: readonly RunDifficulty[] | "not-applicable";
  readonly journey: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly assertions: readonly string[];
  readonly milestoneWaves?: readonly number[];
  readonly status: "contract-defined-no-live-certification";
}

const ALL_DIFFICULTIES = Object.freeze([
  "easy", "normal", "hard", "extreme", "onehit",
] as const satisfies readonly RunDifficulty[]);

function contract(
  input: Omit<TearModeCompletionContract, "status">,
): TearModeCompletionContract {
  return Object.freeze({
    ...input,
    journey: Object.freeze([...input.journey]),
    requiredEvidence: Object.freeze([...input.requiredEvidence]),
    assertions: Object.freeze([...input.assertions]),
    ...(input.applicableDifficulties === "not-applicable"
      ? {}
      : { applicableDifficulties: Object.freeze([...input.applicableDifficulties]) }),
    ...(input.milestoneWaves === undefined ? {} : { milestoneWaves: Object.freeze([...input.milestoneWaves]) }),
    status: "contract-defined-no-live-certification",
  });
}

export const TEAR_MODE_COMPLETION_CONTRACTS: readonly TearModeCompletionContract[] = Object.freeze([
  contract({
    id: "tutorial",
    mode: "tutorial",
    completionKind: "finite-natural-victory",
    applicableDifficulties: "not-applicable",
    journey: ["main-menu", "play", "tutorial", "start", "every-lesson", "ready", "main-menu"],
    requiredEvidence: [
      "move-both-directions", "jump-twice", "dash-twice", "valid-cuts", "launch", "juggle",
      "slam", "power-slam", "updraft", "throw-hit", "recall", "deflect-or-perfect-parry",
    ],
    assertions: [
      "lessons-cannot-skip-rules", "demonstration-does-not-complete-player-rule",
      "dummy-cannot-softlock", "returns-to-menu", "completion-credit-applied-once",
    ],
  }),
  contract({
    id: "adventure",
    mode: "campaign",
    completionKind: "finite-natural-victory",
    applicableDifficulties: ALL_DIFFICULTIES,
    journey: [
      "main-menu", "adventure", "difficulty", "campaign-intro", "ordered-stages-and-waves",
      "bosses-and-evolutions", "final-boss", "ending", "summary", "main-menu",
    ],
    requiredEvidence: [
      "biomes-in-order", "every-standard-wave", "every-draft", "legal-build",
      "every-boss-intro-and-phase", "every-boss-defeated", "every-evolution",
      "final-ending", "victory-recorded", "replay-packaged", "progression-and-rewards-correct",
    ],
    assertions: ["natural-adventure-victory", "easy-and-normal-are-required-baselines"],
  }),
  contract({
    id: "endless",
    mode: "endless",
    completionKind: "endurance-milestone",
    applicableDifficulties: ALL_DIFFICULTIES,
    journey: ["main-menu", "endless", "difficulty", "successive-waves-and-drafts", "declared-milestone", "result", "main-menu"],
    requiredEvidence: [
      "wave-reached", "runtime-survived", "biome-cycles", "minibosses-defeated",
      "score-reached", "build-maturity", "maximum-concurrency", "accelerated-stability",
    ],
    assertions: [
      "biome-cycle-valid", "scaling-continues", "spawn-queue-does-not-deadlock",
      "drafts-remain-selectable", "score-and-rewards-remain-finite", "memory-and-object-counts-bounded",
    ],
    milestoneWaves: [10, 25, 50, 100],
  }),
  contract({
    id: "gauntlet",
    mode: "gauntlet",
    completionKind: "endurance-milestone",
    applicableDifficulties: ALL_DIFFICULTIES,
    journey: ["main-menu", "gauntlet", "difficulty", "standard-waves", "boss-intervals", "full-boss-roster-cycle", "main-menu"],
    requiredEvidence: [
      "standard-wave-progress", "configured-boss-interval", "boss-identity-cycle",
      "boss-scaling", "draft-and-evolution-valid", "boss-arena-restoration",
    ],
    assertions: ["one-full-boss-roster-cycle", "clean-consecutive-fights"],
  }),
  contract({
    id: "playground",
    mode: "playground",
    completionKind: "coverage-target",
    applicableDifficulties: ALL_DIFFICULTIES,
    journey: ["main-menu", "playground", "build-menu-and-ability-lab", "coverage-target", "main-menu"],
    requiredEvidence: [
      "every-enemy-kind", "target-dummy", "enemy-count", "hp-multiplier", "utility-modes",
      "training-and-every-biome", "live-difficulty-change", "every-ability", "every-valid-tier",
      "selected-modifiers-applied", "return-to-menu",
    ],
    assertions: ["developer-control-surface-is-player-valid", "coverage-target-declared"],
  }),
  contract({
    id: "boss-test",
    mode: "bossonly",
    completionKind: "finite-natural-victory",
    applicableDifficulties: ALL_DIFFICULTIES,
    journey: ["main-menu", "boss-test", "difficulty", "complete-boss-roster", "result", "main-menu"],
    requiredEvidence: [
      "boss-order", "clean-fight-initialization", "previous-hazards-and-adds-removed",
      "arena-swap-and-restore", "evolution-applied", "all-bosses-consecutive",
    ],
    assertions: ["no-state-leak-between-bosses", "natural-final-result"],
  }),
  contract({
    id: "enemy-test",
    mode: "sandbox",
    completionKind: "coverage-target",
    applicableDifficulties: ALL_DIFFICULTIES,
    journey: ["main-menu", "enemy-test", "difficulty", "declared-coverage-duration", "main-menu"],
    requiredEvidence: [
      "every-enemy-family", "required-variants-and-affixes", "every-attack-grammar",
      "every-enemy-can-damage", "every-enemy-can-be-defeated", "death-cleanup",
      "mixed-roster-does-not-deadlock",
    ],
    assertions: ["coverage-target-achieved", "no-critical-invariant-failure"],
  }),
]);

export function modeCompletionContract(mode: RunMode): TearModeCompletionContract {
  const result = TEAR_MODE_COMPLETION_CONTRACTS.find((entry) => entry.mode === mode);
  if (result === undefined) throw new TypeError(`missing mode completion contract: ${mode}`);
  return result;
}
