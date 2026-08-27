import { describe, expect, it } from "vitest";

import {
  BOSS_DEFINITIONS,
  BOSS_IDENTITY_IDS,
  ROOTBOUND_PROVISIONAL_DEFINITION,
} from "../../src/gameplay/run/boss-definitions";
import { STAGE_BOSS_HOME } from "../../src/gameplay/stages";

describe("Rootbound production foundation", () => {
  it("locks identity, authored name, provisional phase marks, and Verdant home stage before factory promotion", () => {
    expect(BOSS_IDENTITY_IDS).toContain("rootbound");
    expect(ROOTBOUND_PROVISIONAL_DEFINITION).toEqual({
      id: "rootbound",
      name: "The Rootbound",
      phaseMarks: [0.65, 0.28],
    });
    expect(STAGE_BOSS_HOME["verdant-sanctum"]).toBe("rootbound");
    expect(BOSS_DEFINITIONS.map(({ id }): string => id)).not.toContain("rootbound");
    expect(Object.isFrozen(ROOTBOUND_PROVISIONAL_DEFINITION)).toBe(true);
    expect(Object.isFrozen(ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks)).toBe(true);
  });
});
