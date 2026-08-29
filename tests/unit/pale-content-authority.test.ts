import { describe, expect, it } from "vitest";

import scenarioCatalog from "../../src/tearbench/canonical-scenarios.json";
import {
  BOSS_DEFINITIONS,
  BOSS_IDENTITY_IDS,
  WHITE_HART_PROVISIONAL_DEFINITION,
} from "../../src/gameplay/run/boss-definitions";
import {
  BOSS_ROSTER,
  ENEMY_IDENTITY_IDS,
  ENEMY_KIND_IDS,
} from "../../src/gameplay/run/content-director";
import { CAMPAIGN_STAGE_IDS, STAGES, STAGE_BOSS_HOME, STAGE_IDS } from "../../src/gameplay/stages";
import { BOSS_FACTORY_IDS } from "../../src/tearbench/registries";
import { TEAR_WORLD_ENTITY_FACTORY_IDS } from "../../src/gameplay/runtime/tear-world-entity-construction";

describe("Pale Revision 3 content authority", () => {
  it("reserves each Pale identity exactly once through existing source-owned catalogs", () => {
    expect(STAGE_IDS.filter((id) => id === "pale-traverse")).toHaveLength(1);
    expect(BOSS_IDENTITY_IDS.filter((id) => id === "white-hart")).toHaveLength(1);
    expect(ENEMY_IDENTITY_IDS.filter((id) => id === "rimehound")).toHaveLength(1);
    expect(STAGE_BOSS_HOME["pale-traverse"]).toBe("white-hart");
    expect(WHITE_HART_PROVISIONAL_DEFINITION).toMatchObject({ id: "white-hart", name: "The White Hart" });
  });

  it("promotes the completed stage, enemy, and White Hart foundation through existing catalogs", () => {
    expect(CAMPAIGN_STAGE_IDS).toContain("pale-traverse");
    expect(STAGES.some((stage) => stage.id === "pale-traverse")).toBe(true);
    expect(ENEMY_KIND_IDS).not.toContain("rimehound");
    expect(TEAR_WORLD_ENTITY_FACTORY_IDS).toContain("rimehound");
    expect(BOSS_DEFINITIONS.map((boss) => boss.id)).toContain("white-hart");
    expect(BOSS_ROSTER.map((boss) => boss.id)).toContain("white-hart");
    expect(BOSS_FACTORY_IDS).toContain("white-hart");
    expect(TEAR_WORLD_ENTITY_FACTORY_IDS).toContain("white-hart");
  });

  it("promotes only the approved White Hart foundation route and defers later natural/phase routes", () => {
    const serialized = JSON.stringify(scenarioCatalog);
    expect(serialized).toContain("pale-traverse");
    expect(serialized).toContain("white-hart");
    expect(serialized).not.toContain("rimehound");
  });
});
