import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_CATALOG, CANONICAL_ACHIEVEMENT_IDS } from "../../src/gameplay/progression/achievement-catalog";
import { DIFFICULTY_IDS } from "../../src/gameplay/run/difficulty-catalog";
import { PROFILE_TRACKED_MODE_IDS } from "../../src/gameplay/run/mode-catalog";
import { PUBLISHED_STAGE_IDS } from "../../src/gameplay/stages";

describe("achievement catalog", () => {
  it("owns stable Rootbound clear and Regrowth mastery entries", () => {
    expect(ACHIEVEMENT_CATALOG.find((entry) => entry.id === "boss_rootbound")).toMatchObject({
      cat: "boss", name: "The Rootbound", desc: "Defeat The Rootbound.",
      rule: { kind: "stat-threshold", stat: "killRootbound", goal: 1 },
    });
    expect(ACHIEVEMENT_CATALOG.find((entry) => entry.id === "rootbound_regrowth")).toMatchObject({
      cat: "boss", name: "Regrowth Interrupted",
      desc: "Defeat The Rootbound after fully interrupting Regrowth.",
      rule: { kind: "stat-threshold", stat: "rootboundRegrowthFullInterrupt", goal: 1 },
    });
    expect(new Set(CANONICAL_ACHIEVEMENT_IDS).size).toBe(CANONICAL_ACHIEVEMENT_IDS.length);
  });

  it("does not invent the optional hidden no-damage achievement before approval", () => {
    expect(ACHIEVEMENT_CATALOG.some((entry) => entry.id.includes("graft") && entry.hidden)).toBe(false);
  });

  it("derives completion goals and copy from current source catalogs", () => {
    expect(ACHIEVEMENT_CATALOG.find((entry) => entry.id === "all_biomes")).toMatchObject({
      desc: `Fight in all ${String(PUBLISHED_STAGE_IDS.length)} biomes.`,
      rule: { kind: "stat-threshold", stat: "biomesSeen", goal: PUBLISHED_STAGE_IDS.length },
    });
    expect(ACHIEVEMENT_CATALOG.find((entry) => entry.id === "well_rounded")).toMatchObject({
      rule: { kind: "stat-threshold", stat: "modesPlayed", goal: PROFILE_TRACKED_MODE_IDS.length },
    });
    expect(ACHIEVEMENT_CATALOG.find((entry) => entry.id === "adv_all")).toMatchObject({
      desc: `Clear Adventure on all ${String(DIFFICULTY_IDS.length)} difficulties.`,
      rule: { kind: "stat-threshold", stat: "clearAdvAll", goal: DIFFICULTY_IDS.length },
    });
  });
});
