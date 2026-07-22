import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { UPGRADES, applyUpgrade, newMods, tierUp, type UpgradeApplyContext } from "../../src/gameplay/upgrades";
import { WEAPONS, applyWeapon } from "../../src/gameplay/weapons";

function makeContext(): UpgradeApplyContext {
  return {
    player: {
      maxHp: 100,
      maxDashCharges: 2,
      dashCharges: 2,
      dashCd: 0,
      afterimageDuration: 0,
      afterimageSpeedMult: 1,
      hardTurnStacks: 0,
      guardT: 0,
      maxShield: 0,
      abilityRevives: 0,
      tempoStk: 0,
      tempoT: 0,
      iframe: 0,
      heal() { return; },
    },
    blade: {
      channelMods: {
        throwPower: 1,
        throwSpeed: 1,
        remoteRange: 1,
        secondaryPower: 1,
        returnSpeed: 1,
        controlDuration: 1,
      },
      throwSizeMult: 1,
      freeRecall: false,
    },
    mods: newMods(),
  };
}

function expectFiniteNumbers(value: unknown, path: string, seen = new Set<object>()): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), `${path} must stay finite`).toBe(true);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) expectFiniteNumbers(child, `${path}.${key}`, seen);
}

describe("weapon-by-ability conformance", () => {
  it("applies and fully evolves every ability for every weapon without invalid state", () => {
    const baseline = structuredClone(CONFIG);
    try {
      for (const weapon of WEAPONS) {
        for (const upgrade of UPGRADES) {
          Object.assign(CONFIG, structuredClone(baseline));
          applyWeapon(weapon.id);
          const context = makeContext();
          expect(() => { applyUpgrade(upgrade, context); }, `${weapon.id} + ${upgrade.id}`).not.toThrow();
          for (let tier = 0; tier < (upgrade.tiers?.length ?? 0); tier++) {
            expect(() => { tierUp(upgrade.id, context); }, `${weapon.id} + ${upgrade.id} tier ${String(tier + 2)}`).not.toThrow();
          }
          expect(context.mods.owned[upgrade.id], `${weapon.id} records ${upgrade.id}`).toBe(1);
          expectFiniteNumbers(context, `${weapon.id}.${upgrade.id}`);
          expectFiniteNumbers(CONFIG.player, `${weapon.id}.${upgrade.id}.config.player`);
          expectFiniteNumbers(CONFIG.blade, `${weapon.id}.${upgrade.id}.config.blade`);
        }
      }
    } finally {
      Object.assign(CONFIG, baseline);
    }
  });
});
