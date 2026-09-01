import { describe, expect, it } from "vitest";

import scenarioCatalog from "../../src/tearbench/canonical-scenarios.json";
import {
  BOSS_DEFINITIONS,
  BOSS_IDENTITY_IDS,
  WHITE_HART_DEFINITION,
} from "../../src/gameplay/run/boss-definitions";
import {
  AUTHORED_BOSS_ROSTER,
  BOSS_ROSTER,
  ENEMY_IDENTITY_IDS,
  ENEMY_KIND_IDS,
} from "../../src/gameplay/run/content-director";
import { AUTHORED_STAGES, CAMPAIGN_STAGE_IDS, STAGE_BOSS_HOME, STAGE_IDS } from "../../src/gameplay/stages";
import { BOSS_FACTORY_IDS } from "../../src/tearbench/registries";
import { TEAR_WORLD_ENTITY_FACTORY_IDS } from "../../src/gameplay/runtime/tear-world-entity-construction";

describe("Pale Revision 3 content authority", () => {
  it("reserves each Pale identity exactly once through existing source-owned catalogs", () => {
    expect(STAGE_IDS.filter((id) => id === "pale-traverse")).toHaveLength(1);
    expect(BOSS_IDENTITY_IDS.filter((id) => id === "white-hart")).toHaveLength(1);
    expect(ENEMY_IDENTITY_IDS.filter((id) => id === "rimehound")).toHaveLength(1);
    expect(STAGE_BOSS_HOME["pale-traverse"]).toBe("white-hart");
    expect(WHITE_HART_DEFINITION).toMatchObject({ id: "white-hart", name: "The White Hart" });
  });

  it("preserves completed Pale content as authored engineering content outside publication", () => {
    expect(CAMPAIGN_STAGE_IDS).not.toContain("pale-traverse");
    expect(AUTHORED_STAGES.some((stage) => stage.id === "pale-traverse")).toBe(true);
    expect(ENEMY_KIND_IDS).not.toContain("rimehound");
    expect(TEAR_WORLD_ENTITY_FACTORY_IDS).toContain("rimehound");
    expect(BOSS_DEFINITIONS.map((boss) => boss.id)).toContain("white-hart");
    expect(BOSS_ROSTER.map((boss) => boss.id)).not.toContain("white-hart");
    expect(AUTHORED_BOSS_ROSTER.map((boss) => boss.id)).toContain("white-hart");
    expect(BOSS_FACTORY_IDS).toContain("white-hart");
    expect(TEAR_WORLD_ENTITY_FACTORY_IDS).toContain("white-hart");
  });

  it("keeps approved Pale canonical routes explicitly unpublished", () => {
    const paleScenarios = scenarioCatalog.filter((scenario) =>
      scenario.tags.includes("unpublished-preview"),
    );
    expect(paleScenarios.map((scenario) => scenario.id)).toEqual(expect.arrayContaining([
      "pale-rimehound-aurora-interaction",
      "pale-white-hart-phase-1",
      "pale-white-hart-phase-2",
      "pale-white-hart-phase-3",
    ]));
    expect(paleScenarios.every((scenario) =>
      scenario.tags.includes("engineering-only")
      && scenario.evidence.certification === "non-certifying",
    )).toBe(true);
    expect(paleScenarios.filter((scenario) => scenario.tags.includes("tc9")).every((scenario) =>
      scenario.tags.includes("non-publishable"),
    )).toBe(true);
  });
});
