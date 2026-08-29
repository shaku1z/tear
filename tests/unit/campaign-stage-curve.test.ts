import { describe, expect, it } from "vitest";
import { CAMPAIGN_STAGE_IDS, STAGE_BOSS_HOME } from "../../src/gameplay/stages";
import { CAMPAIGN_STAGE_CURVES, PALE_PREVIEW_STAGE_CURVE, campaignStageCurve } from "../../src/gameplay/run/campaign-stage-curve";

describe("six-stage campaign curve authority", () => {
  it("covers exactly the six published stages and rejects Pale campaign lookup", () => {
    expect(Object.keys(CAMPAIGN_STAGE_CURVES)).toEqual(CAMPAIGN_STAGE_IDS);
    expect(CAMPAIGN_STAGE_IDS).toEqual(["grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"]);
    expect(() => campaignStageCurve("pale-traverse")).toThrow(/no active campaign curve/u);
  });

  it("keeps the Verdant composition and six-stage late-game pressure", () => {
    expect(campaignStageCurve("verdant-sanctum")).toMatchObject({ health: 1.82, damage: 1.34, countAdd: 5, concurrentAdd: 2, composition: { costs: { rootbinder: 3 } } });
    expect(campaignStageCurve("voidspire")).toMatchObject({ health: 2.36, damage: 1.56, countAdd: 8, concurrentAdd: 4, disposition: "authored-prototype" });
    expect(campaignStageCurve("tear")).toMatchObject({ health: 2.7, damage: 1.7, countAdd: 10, concurrentAdd: 4, disposition: "authored-prototype" });
    expect(STAGE_BOSS_HOME.voidspire).toBe("echo");
    expect(STAGE_BOSS_HOME.tear).toBe("source");
  });

  it("preserves Pale tuning as preview data without publishing it", () => {
    expect(PALE_PREVIEW_STAGE_CURVE).toMatchObject({ health: 2.08, damage: 1.44, countAdd: 6, concurrentAdd: 3, composition: { costs: { rimehound: 1 } } });
    expect(CAMPAIGN_STAGE_CURVES).not.toHaveProperty("pale-traverse");
  });
});
