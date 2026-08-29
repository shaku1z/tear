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
 * Engineering-only campaign pressure authority. Verdant and earlier stages use
 * the authored seven-stage prototype; later current stages retain their
 * six-stage position pressure until VS3-C15-S8 evaluates their relocated slots.
 */
export const CAMPAIGN_STAGE_CURVES = Object.freeze({
  grounds: Object.freeze({ health: 1, damage: 1, countAdd: 0, concurrentAdd: 0, disposition: "authored-prototype" }),
  undercroft: Object.freeze({ health: 1.28, damage: 1.12, countAdd: 2, concurrentAdd: 1, disposition: "authored-prototype" }),
  "crimson-fields": Object.freeze({ health: 1.56, damage: 1.24, countAdd: 4, concurrentAdd: 2, disposition: "authored-prototype" }),
  "verdant-sanctum": Object.freeze({ health: 1.82, damage: 1.34, countAdd: 5, concurrentAdd: 2, disposition: "authored-prototype", composition: VERDANT_COMPOSITION }),
  "pale-traverse": Object.freeze({ health: 2.08, damage: 1.44, countAdd: 6, concurrentAdd: 3, disposition: "authored-prototype" }),
  voidspire: Object.freeze({ health: 2.36, damage: 1.56, countAdd: 8, concurrentAdd: 4, disposition: "legacy-position-placeholder" }),
  tear: Object.freeze({ health: 2.7, damage: 1.7, countAdd: 10, concurrentAdd: 4, disposition: "legacy-position-placeholder" }),
} as const satisfies Readonly<Partial<Record<StageId, CampaignStageCurve>>>);

export function campaignStageCurve(stageId: StageId): CampaignStageCurve {
  const curve = (CAMPAIGN_STAGE_CURVES as Readonly<Partial<Record<StageId, CampaignStageCurve>>>)[stageId];
  if (curve === undefined) throw new Error(`stage ${stageId} has no active campaign curve`);
  return curve;
}

export const SEVEN_STAGE_CURVE_IDS = Object.freeze([
  "grounds", "undercroft", "crimson-fields", "verdant-sanctum", "pale-traverse", "voidspire", "tear",
] as const);
export type SevenStageCurveId = typeof SEVEN_STAGE_CURVE_IDS[number];

const prototypeCurve = (
  health: number,
  damage: number,
  countAdd: number,
  concurrentAdd: number,
): CampaignStageCurve => Object.freeze({ health, damage, countAdd, concurrentAdd, disposition: "authored-prototype" });

/** Seven-stage comparison seed. Pale's basic curve is live; C8 still owns composition and joint late-stage retuning. */
export const SEVEN_STAGE_CURVE_PROTOTYPE = Object.freeze({
  status: "engineering-prototype",
  activation: "pale-stage-active-balance-provisional",
  stages: Object.freeze({
    grounds: prototypeCurve(1, 1, 0, 0),
    undercroft: prototypeCurve(1.28, 1.12, 2, 1),
    "crimson-fields": prototypeCurve(1.56, 1.24, 4, 2),
    "verdant-sanctum": prototypeCurve(1.82, 1.34, 5, 2),
    "pale-traverse": prototypeCurve(2.08, 1.44, 6, 3),
    voidspire: prototypeCurve(2.38, 1.52, 7, 3),
    tear: prototypeCurve(2.72, 1.6, 8, 4),
  } as const satisfies Readonly<Record<SevenStageCurveId, CampaignStageCurve>>),
});

export interface CampaignCurveDelta {
  readonly health: number;
  readonly damage: number;
  readonly countAdd: number;
  readonly concurrentAdd: number;
}

/** Read-only engineering comparison; it does not activate the seven-stage prototype. */
export function sevenStageCurveDelta(stageId: StageId): CampaignCurveDelta {
  const live = campaignStageCurve(stageId);
  const projected = SEVEN_STAGE_CURVE_PROTOTYPE.stages[stageId];
  return Object.freeze({
    health: projected.health - live.health,
    damage: projected.damage - live.damage,
    countAdd: projected.countAdd - live.countAdd,
    concurrentAdd: projected.concurrentAdd - live.concurrentAdd,
  });
}
