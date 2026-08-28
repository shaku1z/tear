import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  BOSS_DEFINITIONS,
  BOSS_IDENTITY_IDS,
  ROOTBOUND_PROVISIONAL_DEFINITION,
} from "../../src/gameplay/run/boss-definitions";
import { STAGE_BOSS_HOME } from "../../src/gameplay/stages";
import { planBossPlacement } from "../../src/gameplay/run/boss-placement";
import { createEnemyHarness } from "./enemy-test-harness";

describe("Rootbound production foundation", () => {
  it("locks identity, authored name, provisional phase marks, and Verdant home stage before factory promotion", () => {
    expect(BOSS_IDENTITY_IDS).toContain("rootbound");
    expect(ROOTBOUND_PROVISIONAL_DEFINITION).toEqual({
      id: "rootbound",
      name: "The Rootbound",
      phaseMarks: [0.65, 0.28],
    });
    expect(STAGE_BOSS_HOME["verdant-sanctum"]).toBe("rootbound");
    expect(BOSS_DEFINITIONS.find(({ id }) => id === "rootbound")).toBe(ROOTBOUND_PROVISIONAL_DEFINITION);
    expect(Object.isFrozen(ROOTBOUND_PROVISIONAL_DEFINITION)).toBe(true);
    expect(Object.isFrozen(ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks)).toBe(true);
  });

  it("constructs through the approved enemy family without placeholder attacks", () => {
    const harness = createEnemyHarness();
    const placement = planBossPlacement("rootbound", CONFIG.view.w, CONFIG);
    const boss = new harness.types.Rootbound(placement.x, placement.y);

    expect(placement.factoryId).toBe("rootbound");
    expect(boss).toMatchObject({
      kind: "rootbound",
      bossId: "rootbound",
      bossName: "The Rootbound",
      presentationId: "rootbound",
      isBoss: true,
      atk: "unavailable",
      availableAttacks: [],
      phaseMarks: [0.65, 0.28],
    });
  });
});
