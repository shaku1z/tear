/**
 * Deterministic identity for the six-biome production campaign with Pale kept
 * as an explicitly unpublished Playground/engineering preview. v2: the Rootbound's
 * moves run on the shared boss attack layer. v3: its Phase II is rebuilt (Grafts planted one at a time,
 * fair healing) and a thrown blade cuts the stage objects a held blade cuts. v4: its Phase III is rebuilt
 * (Regrowth and Last Spring are moves on the shared layer; Regrowth keeps attacking and heals by the one table).
 * v5: the Gauntlet is a run of trials, one per boss (see `gauntlet-trials.ts`).
 */
export const CURRENT_RULESET_VERSION = "tear-rules-six-biome-verdant-r3-pale-preview-v5";

/** The identity while the Rootbound's Phase III was rebuilt and the Gauntlet still cycled waves; historical replays only. */
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
 * Every ruleset in order, oldest first, with the modes whose earlier recordings it retires
 * and the reason a player sees. A recording made under one ruleset stays watchable unless a
 * later step names its mode. A new bump is one row here: `refuses` is empty unless the step
 * changed a mode's rules so far that older recordings no longer show that mode.
 */
export interface RulesetStep {
  readonly version: string;
  readonly refuses: readonly string[];
  readonly reason: string;
}

export const RULESET_STEPS: readonly RulesetStep[] = Object.freeze(
  [
    { version: PRE_VERDANT_RULESET_VERSION, refuses: [], reason: "" },
    { version: VERDANT_R3_ENGINEERING_RULESET_VERSION, refuses: [], reason: "" },
    { version: PALE_R3_ENGINEERING_RULESET_VERSION, refuses: [], reason: "" },
    { version: SIX_BIOME_PALE_PREVIEW_V1_RULESET_VERSION, refuses: [], reason: "" },
    { version: SIX_BIOME_PALE_PREVIEW_V2_RULESET_VERSION, refuses: [], reason: "" },
    { version: SIX_BIOME_PALE_PREVIEW_V3_RULESET_VERSION, refuses: [], reason: "" },
    { version: SIX_BIOME_PALE_PREVIEW_V4_RULESET_VERSION, refuses: [], reason: "" },
    { version: CURRENT_RULESET_VERSION, refuses: ["gauntlet"], reason: "recorded under the old Gauntlet rules" },
  ].map((step) => Object.freeze({ ...step, refuses: Object.freeze(step.refuses) })),
);

/**
 * Why a recording can no longer be watched, or null when it can. A ruleset this build does
 * not know is treated as older than every step, so each step's refusals apply to it.
 */
export function rulesetRefusal(recordedVersion: string | undefined, mode: string | undefined): string | null {
  if (mode === undefined) return null;
  const recorded = RULESET_STEPS.findIndex((step) => step.version === recordedVersion);
  for (const step of RULESET_STEPS.slice(recorded + 1)) if (step.refuses.includes(mode)) return step.reason;
  return null;
}
