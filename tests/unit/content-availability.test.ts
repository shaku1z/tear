import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_STAGE_IDS,
  PUBLISHED_STAGE_IDS,
  PLAYGROUND_RUNTIME_STAGE_IDS,
  STAGE_BOSS_HOME,
  STAGE_CONTENT_AVAILABILITY,
  STAGE_DISPLAY_NAMES,
  STAGE_PUBLICATION_STATE,
  assertStageAuthorityProjection,
  bossIdsAvailableOn,
  stageAt,
  stageRuntimeIndexForSurface,
} from "../../src/gameplay/stages";
import {
  AUTHORED_BOSS_ROSTER,
  BOSS_ROSTER,
  ENEMY_IDENTITY_IDS,
  PUBLISHED_ENEMY_IDENTITY_IDS,
} from "../../src/gameplay/run/content-director";
import { PALE_VARIANT_IDS, variantIdsAvailableOn } from "../../src/gameplay/variants";

const OFFICIAL_STAGES = [
  "grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear",
] as const;
const OFFICIAL_BOSSES = ["warden", "colossus", "aldric", "rootbound", "echo", "source"] as const;

describe("published content availability", () => {
  it("owns the exact six-stage Adventure order and terminal wave range", () => {
    expect(CAMPAIGN_STAGE_IDS).toEqual(OFFICIAL_STAGES);
    expect(PUBLISHED_STAGE_IDS).toEqual(OFFICIAL_STAGES);
    expect(CAMPAIGN_STAGE_IDS.length * 10).toBe(60);
    expect(CAMPAIGN_STAGE_IDS[3]).toBe("verdant-sanctum");
    expect(CAMPAIGN_STAGE_IDS[4]).toBe("voidspire");
    expect(CAMPAIGN_STAGE_IDS[5]).toBe("tear");
  });

  it("keeps Pale declaratively Playground-only", () => {
    expect(STAGE_CONTENT_AVAILABILITY["pale-traverse"]).toEqual({
      adventure: false, endless: false, gauntlet: false, "boss-test": false,
      "enemy-test": false, tutorial: false, playground: true, published: false,
    });
    expect(PLAYGROUND_RUNTIME_STAGE_IDS).toEqual([...OFFICIAL_STAGES, "pale-traverse"]);
    const previewIndex = stageRuntimeIndexForSurface("pale-traverse", "playground");
    expect(previewIndex).toBe(6);
    expect(stageAt(previewIndex).id).toBe("pale-traverse");
    expect(stageRuntimeIndexForSurface("pale-traverse", "adventure")).toBe(-1);
  });

  it("derives ordinary and authored boss/enemy rosters from the policy boundary", () => {
    expect(bossIdsAvailableOn("published")).toEqual(OFFICIAL_BOSSES);
    expect(BOSS_ROSTER.map(({ id }) => id)).toEqual(OFFICIAL_BOSSES);
    expect(AUTHORED_BOSS_ROSTER.map(({ id }) => id)).toEqual([...OFFICIAL_BOSSES.slice(0, 4), "white-hart", ...OFFICIAL_BOSSES.slice(4)]);
    expect(PUBLISHED_ENEMY_IDENTITY_IDS).toEqual(ENEMY_IDENTITY_IDS.filter((id) => id !== "rimehound"));
    expect(variantIdsAvailableOn("published")).not.toEqual(expect.arrayContaining([...PALE_VARIANT_IDS]));
    expect(variantIdsAvailableOn("playground")).toEqual(expect.arrayContaining([...PALE_VARIANT_IDS]));
  });

  it("fails when a stage/display projection is mutated away from its production owner", () => {
    const projected = { ...STAGE_DISPLAY_NAMES, grounds: "Stale Grounds" };
    expect(() => { assertStageAuthorityProjection({
      displayNames: projected, bossHomes: STAGE_BOSS_HOME, publication: STAGE_PUBLICATION_STATE,
    }); }).toThrow(/stage display drift/u);
  });

  it("fails when boss home or publication projections are mutated", () => {
    const wrongHome = { ...STAGE_BOSS_HOME, "verdant-sanctum": "white-hart" };
    expect(() => { assertStageAuthorityProjection({
      displayNames: STAGE_DISPLAY_NAMES, bossHomes: wrongHome, publication: STAGE_PUBLICATION_STATE,
    }); }).toThrow(/boss home drift/u);

    const wrongPublication = { ...STAGE_PUBLICATION_STATE, "pale-traverse": "published" as const };
    expect(() => { assertStageAuthorityProjection({
      displayNames: STAGE_DISPLAY_NAMES, bossHomes: STAGE_BOSS_HOME, publication: wrongPublication,
    }); }).toThrow(/publication drift/u);
  });
});
