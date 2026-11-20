import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import type { Look } from "../../src/domain/cosmetic-types";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { DEFAULT_COSMETIC_LOOKS } from "../../src/presentation/cosmetic-defaults";
import {
  COSMETIC_DRAW_HOOKS,
  createCosmeticWardrobe,
  resolveCosmeticStyles,
  type CosmeticStyles,
} from "../../src/presentation/cosmetic-styles";
import { createParticleSystem, type ParticleSystem } from "../../src/presentation/particles";

const catalog = COSMETIC_CATALOG;
/** The registry test below checks this list against the registry, so it cannot drift. */
const drawnSlots: readonly (keyof typeof COSMETIC_DRAW_HOOKS)[] = ["blade", "trail", "spark"];
const slot = (id: string) => {
  const found = catalog.slots.find((entry) => entry.id === id);
  if (!found) throw new Error(`no slot ${id}`);
  return found;
};
const familyCalm = (id: string): Look => catalog.families.find((family) => family.id === slot(id).family)?.calm ?? {};
const styleOf = (styles: CosmeticStyles, id: keyof typeof COSMETIC_DRAW_HOOKS): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(styles[id]));

describe("cosmetic style resolver", () => {
  it("lists exactly the slots slots.json marks ready, each with the family its draw routine expects", () => {
    const ready = catalog.slots.filter((entry) => entry.hook === "ready").map((entry) => entry.id);
    expect(ready.sort()).toEqual([...drawnSlots].sort());
    expect(Object.keys(COSMETIC_DRAW_HOOKS).sort()).toEqual([...drawnSlots].sort());
    for (const id of drawnSlots) expect(slot(id).family).toBe(COSMETIC_DRAW_HOOKS[id].family);
  });

  it("resolves an empty loadout to each slot's default, worn by nobody", () => {
    const styles = resolveCosmeticStyles(catalog, {}, false);
    for (const id of drawnSlots) {
      const style = styleOf(styles, id);
      expect(style.worn).toBe(false);
      for (const key of COSMETIC_DRAW_HOOKS[id].draws) expect(style[key]).toEqual(slot(id).default[key]);
    }
    expect(resolveCosmeticStyles(catalog, {}, true)).toEqual(styles);
  });

  it("keeps the default blade and trail colours equal to the game's own", () => {
    expect(slot("blade").default.glow).toBe(CONFIG.colors.bladeGlow);
    expect(slot("trail").default.colors).toEqual([CONFIG.colors.bladeTrail]);
  });

  it("draws every ready-slot item's look parameters, and its calm version when calm", () => {
    for (const item of catalog.items.filter((entry) => drawnSlots.some((id) => id === entry.slot))) {
      const id = drawnSlots.find((entry) => entry === item.slot);
      if (!id) continue;
      const lively = styleOf(resolveCosmeticStyles(catalog, { [id]: item.id }, false), id);
      const calm = styleOf(resolveCosmeticStyles(catalog, { [id]: item.id }, true), id);
      expect(lively.worn, item.id).toBe(true);
      for (const key of COSMETIC_DRAW_HOOKS[id].draws) {
        const expected = { ...slot(id).default, ...item.look };
        expect(lively[key], `${item.id} ${key}`).toEqual(expected[key]);
        expect(calm[key], `${item.id} calm ${key}`).toEqual({ ...expected, ...familyCalm(id) }[key]);
      }
    }
  });

  it("never offers a ready-slot item that differs from the default only in parameters nothing draws", () => {
    const silent = catalog.items.filter((item) => {
      const id = drawnSlots.find((entry) => entry === item.slot);
      if (!id) return false;
      const look = { ...slot(id).default, ...item.look };
      return COSMETIC_DRAW_HOOKS[id].draws.every(
        (key) => JSON.stringify(look[key]) === JSON.stringify(slot(id).default[key]),
      );
    });
    expect(silent.map((item) => item.id)).toEqual([]);
  });

  it("ignores an item equipped in the wrong slot or unknown to the catalog", () => {
    const styles = resolveCosmeticStyles(catalog, { trail: "spark_orchid", spark: "no_such_item" }, false);
    expect(styles.trail.worn).toBe(false);
    expect(styles.spark.worn).toBe(false);
  });
});

describe("cosmetic wardrobe", () => {
  it("dresses only the wearer, follows the calm setting, and gives way to an authored beat", () => {
    let calm = false;
    const wardrobe = createCosmeticWardrobe(catalog, () => calm);
    const wearer = {},
      other = {};
    expect(wardrobe.worn()).toBe(wardrobe.defaults);
    wardrobe.wear(wearer, { spark: "spark_glacier" });
    expect(wardrobe.of(other)).toBe(wardrobe.defaults);
    expect(wardrobe.of(wearer).spark.countScale).toBe(1.2);
    calm = true;
    expect(wardrobe.of(wearer).spark.countScale).toBe(familyCalm("spark").countScale);
    wardrobe.authored(true);
    expect(wardrobe.of(wearer)).toBe(wardrobe.defaults);
    wardrobe.authored(false);
    expect(wardrobe.of(wearer).spark.worn).toBe(true);
  });
});

describe("blade-hit sparks", () => {
  const system = (looks: Parameters<typeof createParticleSystem>[0]["looks"]): ParticleSystem => {
    let seed = 7;
    return createParticleSystem({
      effects: { highBudget: 400, lowBudget: 200, cullMargin: 0 },
      lowGraphics: () => false,
      reducedMotion: () => false,
      random: () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      },
      looks,
    });
  };

  it("emits exactly the untagged burst while nothing is worn", () => {
    const tagged = system(DEFAULT_COSMETIC_LOOKS),
      plain = system(DEFAULT_COSMETIC_LOOKS);
    const receipt = tagged.burst(10, 20, 1, 0, 6, "#abcdef", "blade-hit");
    expect(receipt).toEqual(plain.burst(10, 20, 1, 0, 6, "#abcdef"));
    expect(tagged.list).toEqual(plain.list);
  });

  it("wears the spark's colours in turn and scales the count, for tagged bursts only", () => {
    const wardrobe = createCosmeticWardrobe(catalog, () => false);
    wardrobe.wear({}, { spark: "spark_glacier" });
    const effects = system(wardrobe);
    effects.burst(0, 0, 1, 0, 5, "#abcdef", "blade-hit");
    expect(effects.list.map((particle) => particle.col)).toEqual([
      "#0f9fb0",
      "#7a4ff0",
      "#0f9fb0",
      "#7a4ff0",
      "#0f9fb0",
      "#7a4ff0",
    ]);
    effects.reset();
    effects.burst(0, 0, 1, 0, 5, "#abcdef");
    expect(effects.list.map((particle) => particle.col)).toEqual(Array(5).fill("#abcdef"));
  });
});
