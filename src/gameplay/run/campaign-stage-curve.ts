import type { StageId } from "../stages";
import type { CompositionBudgetDefinition } from "./composition-budget";

export interface CampaignStageCurve {
  readonly health: number;
  readonly damage: number;
  readonly countAdd: number;
  readonly concurrentAdd: number;
  readonly disposition: "authored-prototype" | "legacy-position-placeholder";
  readonly composition?: CompositionBudgetDefinition;
}

const VERDANT_COMPOSITION = Object.freeze({
  localWaveBudgets: Object.freeze([0, 3, 4, 5, 5, 6, 7, 8, 9, 0]),
  costs: Object.freeze({ rootbinder: 3, anchor: 3, mender: 2, chimera: 2, armored: 1 }),
  maximumPerWave: Object.freeze({
    rootbinder: Object.freeze([0, 1, 1, 1, 1, 1, 2, 2, 2, 0]),
  }),
} as const satisfies CompositionBudgetDefinition);

/**
 * Provisional Pale-owned pressure budget. The total budget controls the stage's
 * route/pack/control families while the per-family caps prevent one seeded roll
 * from turning the Traverse into an unreadable wall of overlapping threats.
 * This preview curve is isolated from the published six-stage campaign.
 */
const PALE_COMPOSITION = Object.freeze({
  localWaveBudgets: Object.freeze([3, 4, 5, 6, 7, 8, 9, 10, 11, 0]),
  costs: Object.freeze({ rimehound: 1, charger: 1, wraith: 2, anchor: 3, chimera: 2, armored: 1 }),
  maximumPerWave: Object.freeze({
    rimehound: Object.freeze([2, 2, 3, 3, 4, 4, 4, 5, 5, 0]),
    charger: Object.freeze([1, 1, 2, 2, 2, 3, 3, 3, 4, 0]),
    wraith: Object.freeze([0, 0, 1, 1, 2, 2, 2, 3, 3, 0]),
    anchor: Object.freeze([0, 0, 0, 1, 1, 1, 1, 2, 2, 0]),
  }),
} as const satisfies CompositionBudgetDefinition);

/**
 * Published six-stage campaign pressure authority. Pale preview tuning is kept
 * separate so it cannot shift Echo or Source away from waves 50 and 60.
 */
export const CAMPAIGN_STAGE_CURVES = Object.freeze({
  grounds: Object.freeze({ health: 1, damage: 1, countAdd: 0, concurrentAdd: 0, disposition: "authored-prototype" }),
  undercroft: Object.freeze({ health: 1.28, damage: 1.12, countAdd: 2, concurrentAdd: 1, disposition: "authored-prototype" }),
  "crimson-fields": Object.freeze({ health: 1.56, damage: 1.24, countAdd: 4, concurrentAdd: 2, disposition: "authored-prototype" }),
  "verdant-sanctum": Object.freeze({ health: 1.82, damage: 1.34, countAdd: 5, concurrentAdd: 2, disposition: "authored-prototype", composition: VERDANT_COMPOSITION }),
  voidspire: Object.freeze({ health: 2.36, damage: 1.56, countAdd: 8, concurrentAdd: 4, disposition: "authored-prototype" }),
  tear: Object.freeze({ health: 2.7, damage: 1.7, countAdd: 10, concurrentAdd: 4, disposition: "authored-prototype" }),
} as const satisfies Readonly<Partial<Record<StageId, CampaignStageCurve>>>);

/** Pale remains executable engineering content, but is not a campaign curve. */
export const PALE_PREVIEW_STAGE_CURVE: CampaignStageCurve = Object.freeze({
  health: 2.08, damage: 1.44, countAdd: 6, concurrentAdd: 3,
  disposition: "authored-prototype", composition: PALE_COMPOSITION,
});

export function campaignStageCurve(stageId: StageId): CampaignStageCurve {
  const curve = (CAMPAIGN_STAGE_CURVES as Readonly<Partial<Record<StageId, CampaignStageCurve>>>)[stageId];
  if (curve === undefined) throw new Error(`stage ${stageId} has no active campaign curve`);
  return curve;
}
