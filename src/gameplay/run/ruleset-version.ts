/**
 * Deterministic identity for the six-biome production campaign with Pale kept
 * as an explicitly unpublished Playground/engineering preview. v2: the Rootbound's
 * moves run on the shared boss attack layer. v3: its Phase II is rebuilt (Grafts planted one at a time,
 * fair healing) and a thrown blade cuts the stage objects a held blade cuts. v4: its Phase III is rebuilt
 * (Regrowth and Last Spring are moves on the shared layer; Regrowth keeps attacking and heals by the one table). v5: each
 * repeat of a repeating boss strike has a warning of its own, in which the hit is off. v6: the Gauntlet is a run
 * of trials, one per boss (see `gauntlet-trials.ts`). v7: a boss body hurts only inside a declared move (the
 * Rootbound's blocks instead), and a move the target could not walk out of is not chosen. v8: a Bloom Well
 * stands on the floor and lifts whoever stands in it (the player and light enemies). v9: a run's first wave,
 * and a wave that follows a story, opens with a grace in which enemies close in but cannot attack. v10: a
 * planted Rootbinder roots the allies near it (they cannot be flung or lifted until the root is cut) and no
 * longer leashes the player.
 */
export const CURRENT_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v10";

/** The identity while a Rootbinder leashed the player and shared knockback among its allies; historical replays only. */
export const SIX_BIOME_PALE_PREVIEW_V9_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v9";

/** The identity while an enemy could attack the moment it arrived in a run's first wave; historical replays only. */
export const SIX_BIOME_PALE_PREVIEW_V8_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v8";

/** The identity while a stage Bloom Well caught only what was already in the air; historical replays only. */
export const SIX_BIOME_PALE_PREVIEW_V7_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v7";

/** The identity while the Rootbound's idle body hurt on contact; historical replays only. */
export const SIX_BIOME_PALE_PREVIEW_V6_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v6";

/** The identity while the Gauntlet still cycled waves through the biomes; historical replays only. */
export const SIX_BIOME_PALE_PREVIEW_V5_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v5";

/** The identity while a repeating boss strike came again unwarned; historical replays only. */
export const SIX_BIOME_PALE_PREVIEW_V4_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v4";

/** The identity while the Rootbound's Phases I and II were rebuilt; historical replays only. */
export const SIX_BIOME_PALE_PREVIEW_V3_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v3";

/** The identity while only the Rootbound's Phase I was rebuilt; historical replays only. */
export const SIX_BIOME_PALE_PREVIEW_V2_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v2";

/** The six-biome identity before the Rootbound moved onto the boss attack layer; historical replays only. */
export const SIX_BIOME_PALE_PREVIEW_V1_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v1";

/** Frozen seven-stage engineering identity retained as historical provenance only. */
export const PALE_R3_ENGINEERING_RULESET_VERSION = "tear-rules-verdant-pale-r3-engineering-v1";

/** Prior six-stage engineering identity retained for historical replay parsing. */
export const VERDANT_R3_ENGINEERING_RULESET_VERSION = "tear-rules-verdant-r3-engineering-v1";

/** Last public/baseline identity retained for explicit replay admission tests. */
export const PRE_VERDANT_RULESET_VERSION = "tear-rules-2026.07";

/**
 * Every ruleset in order, oldest first, with what changed at that step in words a player reads.
 * Replays are admitted only under the exact ruleset they were recorded with, in every mode: a
 * step changes the simulation, so an older recording would play out differently. A recording
 * from an earlier ruleset is refused and the refusal names the first change it missed. A new
 * bump is one row here.
 */
export interface RulesetStep {
  readonly version: string;
  /** Completes "This replay was recorded before …". */
  readonly change: string;
}

export const RULESET_STEPS: readonly RulesetStep[] = Object.freeze(
  [
    { version: PRE_VERDANT_RULESET_VERSION, change: "the July 2026 rules" },
    { version: VERDANT_R3_ENGINEERING_RULESET_VERSION, change: "Verdant Sanctum was added" },
    { version: PALE_R3_ENGINEERING_RULESET_VERSION, change: "Pale Traverse was added for testing" },
    { version: SIX_BIOME_PALE_PREVIEW_V1_RULESET_VERSION, change: "the campaign settled on six stages" },
    { version: SIX_BIOME_PALE_PREVIEW_V2_RULESET_VERSION, change: "the Rootbound moved onto the shared boss moves" },
    { version: SIX_BIOME_PALE_PREVIEW_V3_RULESET_VERSION, change: "the Rootbound's second phase was rebuilt" },
    { version: SIX_BIOME_PALE_PREVIEW_V4_RULESET_VERSION, change: "the Rootbound's third phase was rebuilt" },
    { version: SIX_BIOME_PALE_PREVIEW_V5_RULESET_VERSION, change: "each repeat of a boss strike got its own warning" },
    { version: SIX_BIOME_PALE_PREVIEW_V6_RULESET_VERSION, change: "the Gauntlet became a run of trials" },
    { version: SIX_BIOME_PALE_PREVIEW_V7_RULESET_VERSION, change: "a boss's body stopped hurting outside its moves" },
    { version: SIX_BIOME_PALE_PREVIEW_V8_RULESET_VERSION, change: "Bloom Wells began lifting from the floor" },
    { version: SIX_BIOME_PALE_PREVIEW_V9_RULESET_VERSION, change: "a run's first wave began with a grace" },
    { version: CURRENT_RULESET_VERSION, change: "Rootbinders began rooting their allies" },
  ].map((step) => Object.freeze(step)),
);

/** The reason a recording from another ruleset is refused, when this build does not know that ruleset. */
export const UNKNOWN_RULESET_REFUSAL = "recorded with a version of the game this one cannot play back";

/**
 * Why a recording cannot be watched, or null when it was recorded under the current ruleset or
 * names none (older paths decide those). The reason names the first change after the recording.
 */
export function rulesetRefusal(recordedVersion: string | undefined): string | null {
  if (recordedVersion === undefined || recordedVersion === CURRENT_RULESET_VERSION) return null;
  const recorded = RULESET_STEPS.findIndex((step) => step.version === recordedVersion);
  const missed = recorded < 0 ? undefined : RULESET_STEPS[recorded + 1];
  return missed === undefined ? UNKNOWN_RULESET_REFUSAL : `recorded before ${missed.change}`;
}
