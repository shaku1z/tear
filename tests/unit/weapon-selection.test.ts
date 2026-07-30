import { describe, expect, it } from "vitest";

import { createRunSession } from "../../src/gameplay/run/session";
import { migrateWeaponSelection } from "../../src/gameplay/weapon-selection";

describe("weapon selection migration", () => {
  it("maps retired selections only at the selection boundary", () => {
    expect(migrateWeaponSelection("spear")).toBe("greatsword");
    expect(migrateWeaponSelection("ringblade")).toBe("riftlock");
    expect(migrateWeaponSelection("hammer")).toBe("hammer");
    expect(migrateWeaponSelection("corrupt-value")).toBe("sword");
  });

  it("stores a canonical selection in a newly started run", () => {
    const run = createRunSession({
      mode: "endless", difficulty: "normal", weaponId: "spear", runSeed: 7, voidSeed: 9,
      mods: {}, scaling: { coin: 1, score: 1, enemyHp: 1, enemyCount: 1 }, achievementSnapshot: [],
    });
    expect(run.weaponId).toBe("greatsword");
    expect(run.mods.weaponId).toBe("greatsword");
  });
});
