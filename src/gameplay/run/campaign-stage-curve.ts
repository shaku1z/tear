import type { StageId } from "../stages";

export interface CampaignStageCurve {
  readonly health: number;
  readonly damage: number;
  readonly countAdd: number;
  readonly concurrentAdd: number;
  readonly disposition: "authored-prototype" | "legacy-position-placeholder";
}

/**
 * Engineering-only campaign pressure authority. Verdant and earlier stages use
 * the authored seven-stage prototype; later current stages retain their
 * six-stage position pressure until VS3-C15-S8 evaluates their relocated slots.
 */
export const CAMPAIGN_STAGE_CURVES = Object.freeze({
  grounds: Object.freeze({ health: 1, damage: 1, countAdd: 0, concurrentAdd: 0, disposition: "authored-prototype" }),
  undercroft: Object.freeze({ health: 1.28, damage: 1.12, countAdd: 2, concurrentAdd: 1, disposition: "authored-prototype" }),
  "crimson-fields": Object.freeze({ health: 1.56, damage: 1.24, countAdd: 4, concurrentAdd: 2, disposition: "authored-prototype" }),
  "verdant-sanctum": Object.freeze({ health: 1.82, damage: 1.34, countAdd: 5, concurrentAdd: 2, disposition: "authored-prototype" }),
  voidspire: Object.freeze({ health: 2.36, damage: 1.56, countAdd: 8, concurrentAdd: 4, disposition: "legacy-position-placeholder" }),
  tear: Object.freeze({ health: 2.7, damage: 1.7, countAdd: 10, concurrentAdd: 4, disposition: "legacy-position-placeholder" }),
} as const satisfies Readonly<Record<StageId, CampaignStageCurve>>);

export function campaignStageCurve(stageId: StageId): CampaignStageCurve {
  return CAMPAIGN_STAGE_CURVES[stageId];
}
