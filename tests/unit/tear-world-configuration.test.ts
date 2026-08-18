import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { stagePlatforms } from "../../src/gameplay/stages";
import { applyUpgrade, newMods, UPGRADES, type UpgradeApplyContext } from "../../src/gameplay/upgrades";
import { applyWeapon } from "../../src/gameplay/weapons";
import { createTearWorldConfiguration } from "../../src/gameplay/runtime/tear-world-configuration";

function baseTuning() {
  return {
    world: structuredClone(CONFIG.world),
    player: structuredClone(CONFIG.player),
    modes: structuredClone(CONFIG.modes),
  };
}

describe("Tear world configuration", () => {
  it("deep-clones existing tuning so two worlds cannot mutate each other or the process base", () => {
    const base = baseTuning();
    const first = createTearWorldConfiguration(base);
    const second = createTearWorldConfiguration(base);
    const firstMode = first.value.modes.at(0);
    if (firstMode === undefined) throw new Error("fixture requires a campaign mode");

    first.value.world.gravity = 1234;
    first.value.player.moveSpeed = 999;
    firstMode.label = "Detached only";

    expect(first.value).not.toBe(base);
    expect(first.value).not.toBe(second.value);
    expect(first.value.world).not.toBe(second.value.world);
    expect(first.value.modes).not.toBe(second.value.modes);
    expect(second.value.world.gravity).toBe(CONFIG.world.gravity);
    expect(second.value.player.moveSpeed).toBe(CONFIG.player.moveSpeed);
    expect(second.value.modes.at(0)?.label).toBe(CONFIG.modes.at(0)?.label);
    expect(base.world.gravity).toBe(CONFIG.world.gravity);
    expect(base.player.moveSpeed).toBe(CONFIG.player.moveSpeed);
    expect(base.modes.at(0)?.label).toBe(CONFIG.modes.at(0)?.label);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("restores rollback snapshots and the initial base without replacing retained configuration references", () => {
    const configuration = createTearWorldConfiguration(baseTuning());
    const stableRoot = configuration.value;
    const stableWorld = stableRoot.world;
    const stablePlayer = stableRoot.player;
    const stableModes = stableRoot.modes;
    const checkpoint = configuration.snapshot();

    configuration.value.world.gravity = 900;
    configuration.value.player.moveSpeed = 100;
    configuration.value.modes.pop();
    configuration.restore(checkpoint);

    expect(configuration.value).toBe(stableRoot);
    expect(configuration.value.world).toBe(stableWorld);
    expect(configuration.value.player).toBe(stablePlayer);
    expect(configuration.value.modes).toBe(stableModes);
    expect(configuration.value).toEqual(checkpoint);

    checkpoint.world.gravity = 1;
    checkpoint.player.moveSpeed = 1;
    expect(configuration.value.world.gravity).toBe(CONFIG.world.gravity);
    expect(configuration.value.player.moveSpeed).toBe(CONFIG.player.moveSpeed);

    const beforeRejectedRestore = configuration.snapshot();
    const unclonable = { ...configuration.snapshot(), world: () => undefined } as never;
    expect(() => { configuration.restore(unclonable); }).toThrow();
    expect(configuration.value).toEqual(beforeRejectedRestore);

    const missingWorldBranch = { ...configuration.snapshot(), world: {} } as never;
    expect(() => { configuration.restore(missingWorldBranch); }).toThrow(/incompatible/u);
    expect(configuration.value).toEqual(beforeRejectedRestore);

    configuration.value.world.gravity = 1;
    configuration.value.player.moveSpeed = 1;
    configuration.resetToBase();
    expect(configuration.value.world.gravity).toBe(CONFIG.world.gravity);
    expect(configuration.value.player.moveSpeed).toBe(CONFIG.player.moveSpeed);
  });

  it("keeps real weapon, upgrade, difficulty, and stage tuning local across two worlds", () => {
    const first = createTearWorldConfiguration(structuredClone(CONFIG));
    const second = createTearWorldConfiguration(structuredClone(CONFIG));
    const keenEdge = UPGRADES.find((upgrade) => upgrade.id === "keen_edge");
    const firstDifficulty = first.value.difficulties[0];
    if (keenEdge === undefined) throw new Error("fixture requires Keen Edge");
    if (firstDifficulty === undefined) throw new Error("fixture requires a default difficulty");
    const upgradeContext = (config: typeof CONFIG): UpgradeApplyContext => ({
      config,
      // Keen Edge mutates only configuration. The real upgrade dispatcher is
      // still exercised here, without duplicating that rule in the test.
      player: {} as UpgradeApplyContext["player"], blade: {} as UpgradeApplyContext["blade"], mods: newMods(),
    });

    applyWeapon(first.value, "hammer");
    applyUpgrade(keenEdge, upgradeContext(first.value));
    firstDifficulty.mods.hp = 2;
    first.value.view.w = 2000;
    const firstPlatforms = stagePlatforms(0, first.value);

    applyWeapon(second.value, "riftlock");
    second.value.view.w = 1400;
    const secondPlatforms = stagePlatforms(0, second.value);

    expect(first.value.blade.damageScale).not.toBe(second.value.blade.damageScale);
    expect(first.value.difficulties[0]?.mods.hp).toBe(2);
    expect(second.value.difficulties[0]?.mods.hp).toBe(CONFIG.difficulties[0]?.mods.hp);
    expect(firstPlatforms[0]?.w).toBe(2000);
    expect(secondPlatforms[0]?.w).toBe(1400);

    first.resetToBase();
    expect(first.value.blade.damageScale).toBe(CONFIG.blade.damageScale);
    expect(first.value.view.w).toBe(CONFIG.view.w);
    expect(second.value.view.w).toBe(1400);
    expect(second.value.blade.length).not.toBe(CONFIG.blade.length);
  });
});
