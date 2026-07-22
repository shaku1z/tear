import { describe, expect, it } from "vitest";

import { UPGRADES, newMods, rollUpgrades } from "../../src/gameplay/upgrades";
import { VoidGen } from "../../src/gameplay/voidgen";
import { WEAPONS, getWeapon } from "../../src/gameplay/weapons";

describe("gameplay definition catalogues", () => {
  it("preserves every weapon and its distinct throw identity", () => {
    expect(WEAPONS.map((weapon) => weapon.id)).toEqual([
      "sword",
      "hammer",
      "spear",
      "chainblade",
      "ringblade",
    ]);
    expect(new Set(WEAPONS.map((weapon) => weapon.throwIdentity)).size).toBe(5);
    expect(getWeapon("missing").id).toBe("sword");

    for (const weapon of WEAPONS) {
      expect(weapon.tags).toHaveLength(3);
      expect(weapon.weaknesses.length).toBeGreaterThanOrEqual(3);
      expect(weapon.throwCollisionPad).toBeGreaterThan(0);
      expect(Object.keys(weapon.channels).sort()).toEqual([
        "controlDuration",
        "remoteRange",
        "returnSpeed",
        "secondaryPower",
        "throwPower",
        "throwSpeed",
      ]);
    }
  });

  it("preserves the upgrade catalogue, categories, and tiered abilities", () => {
    expect(UPGRADES).toHaveLength(60);
    expect(new Set(UPGRADES.map((upgrade) => upgrade.id)).size).toBe(60);
    expect(UPGRADES.filter((upgrade) => upgrade.unique)).toHaveLength(36);
    expect(UPGRADES.filter((upgrade) => upgrade.tiers)).toHaveLength(18);

    const categoryCounts = Object.fromEntries(
      ["mobility", "offense", "parry", "resilience", "throw", "utility"].map((category) => [
        category,
        UPGRADES.filter((upgrade) => upgrade.cat === category).length,
      ]),
    );
    expect(categoryCounts).toEqual({
      mobility: 12,
      offense: 13,
      parry: 11,
      resilience: 8,
      throw: 12,
      utility: 4,
    });
  });

  it("uses only the injected random source for deterministic drafts", () => {
    const makeRandom = () => {
      const values = [0.03, 0.81, 0.42, 0.67];
      let index = 0;
      return { next: () => values[index++ % values.length] ?? 0 };
    };
    const first = rollUpgrades(4, newMods(), { random: makeRandom(), forceSpecial: true });
    const second = rollUpgrades(4, newMods(), { random: makeRandom(), forceSpecial: true });

    expect(first.map((upgrade) => upgrade.id)).toEqual(second.map((upgrade) => upgrade.id));
    expect(first.some((upgrade) => upgrade.tiers)).toBe(true);
    expect(new Set(first.map((upgrade) => upgrade.id)).size).toBe(first.length);
  });
});

describe("deterministic void layouts", () => {
  it("reproduces identical chunks and keeps every generated route valid", () => {
    const first = VoidGen.generate("strict-layout", 8);
    const second = VoidGen.generate("strict-layout", 8);

    expect(second).toEqual(first);
    expect(VoidGen.inspect(first.chunks)).toMatchObject({ ok: true, errors: [] });
    expect(first.chunks).toHaveLength(8);
    expect(first.platforms.every((platform) => platform.id && platform.hazardSeed > 0)).toBe(true);
  });

  it("materializes translated clones without mutating canonical chunks", () => {
    const { chunks } = VoidGen.generate(481_516_234, 1);
    const canonical = chunks[0];
    expect(canonical).toBeDefined();
    if (!canonical) return;

    const before = structuredClone(canonical);
    const translated = VoidGen.materialize(canonical, 125, "forming");

    expect(canonical).toEqual(before);
    expect(translated.x).toBe(canonical.x + 125);
    expect(translated.platforms[0]?.x).toBe((canonical.platforms[0]?.x ?? 0) + 125);
    expect(translated.platforms.every((platform) => platform.materializationState === "forming")).toBe(true);
  });

  it("derives hazards only from platform seed and supplied simulation time", () => {
    const { platforms } = VoidGen.generate("hazard-clock", 12);
    const fire = platforms.find((platform) => platform.voidType === "fire");
    expect(fire).toBeDefined();
    if (!fire) return;

    const timeline = [0, 0.5, 1, 2, 3, 4].map((time) => VoidGen.hazardState(fire, time));
    expect([0, 0.5, 1, 2, 3, 4].map((time) => VoidGen.hazardState(fire, time))).toEqual(timeline);
  });
});
