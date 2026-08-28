import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_CATALOG, CANONICAL_ACHIEVEMENT_IDS } from "../../src/gameplay/progression/achievement-catalog";

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
});
