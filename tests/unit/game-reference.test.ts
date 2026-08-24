import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { canonicalStringify } from "../../src/replay/hash";
import {
  assertCurrentSourceSha,
  assertValidGameReferenceV1,
  buildGameReferenceV1,
  encodeGameReferenceV1,
  type GameReferenceV1,
} from "../../src/game-reference/game-reference";
import { createAchievements } from "../../src/gameplay/progression/achievements";
import { ACHIEVEMENT_CATALOG } from "../../src/gameplay/progression/achievement-catalog";
import { UPGRADES, type UpgradeDefinition } from "../../src/gameplay/upgrades";
import { WEAPONS, type WeaponDefinition } from "../../src/gameplay/weapons";

const tuningByWeapon = Object.fromEntries(Object.entries(CONFIG.weapons).map(([id, tuning]) => [id, Object.fromEntries(Object.entries(tuning))]));
const firstWeapon = WEAPONS.at(0);
if (firstWeapon === undefined) throw new Error("Final Five source is empty");
const achievementSource = ACHIEVEMENT_CATALOG;

function reference(sourceSha = "a".repeat(40), weapons: readonly WeaponDefinition[] = WEAPONS,
  upgrades: readonly UpgradeDefinition[] = UPGRADES, achievements = achievementSource): GameReferenceV1 {
  return buildGameReferenceV1({
    repository: "shaku1z/tear",
    sourceSha,
    terminologyVersion: "g4-terminology-v1",
    weapons,
    upgrades,
    achievements,
    tuningByWeapon,
  });
}

function assertJsonSafe(value: unknown, path = "$"): void {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") throw new Error(`${path} is not JSON-safe`);
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} is not finite`);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => { assertJsonSafe(entry, `${path}[${String(index)}]`); });
  } else if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => { assertJsonSafe(entry, `${path}.${key}`); });
  }
}

describe("game-reference.v1", () => {
  it("projects the canonical Final Five and fixed collection authority", () => {
    const result = reference();

    expect(result.format).toBe("game-reference.v1");
    expect(result.schemaVersion).toBe(2);
    expect(result.source).toEqual({ repository: "shaku1z/tear", sha: "a".repeat(40) });
    expect(result.roster.activeWeaponIds).toEqual(["sword", "hammer", "greatsword", "chainblade", "riftlock"]);
    expect(result.roster.retiredWeaponIds).toEqual(["spear", "ringblade"]);
    expect(result.collections.weapons.items.map((weapon) => weapon.id)).toEqual(result.roster.activeWeaponIds);
    expect(result.collections.weapons.items.every((weapon) => weapon.mechanics.length > 0)).toBe(true);
    expect(result.collections.weapons.items.find((weapon) => weapon.id === "riftlock")?.tuning.chambers).toBe(4);
    expect(Object.keys(result.collections)).toEqual([
      "weapons", "upgrades", "enemies", "bosses", "stages", "modes", "achievements", "public-tuning",
    ]);
    expect(result.collections.weapons.status).toBe("complete");
    expect(result.collections.upgrades.status).toBe("complete");
    expect(result.collections.upgrades.items).toHaveLength(60);
    expect(result.collections.achievements.status).toBe("complete");
    expect(result.collections.achievements.items).toHaveLength(98);
    expect(result.collections.enemies.status).toBe("deferred");
    expect(result.collections["public-tuning"].status).toBe("deferred");
  });

  it("projects authored progression metadata without runtime callbacks", () => {
    const result = reference();
    const upgrades = result.collections.upgrades.items;
    expect(new Set(upgrades.map((upgrade) => upgrade.id)).size).toBe(60);
    expect(upgrades.filter((upgrade) => upgrade.unique)).toHaveLength(36);
    expect(upgrades.filter((upgrade) => upgrade.rule.kind === "tiered")).toHaveLength(18);
    expect(upgrades.every((upgrade) => upgrade.tiers.every((tier) => tier.description.length > 0))).toBe(true);
    const achievements = result.collections.achievements.items;
    expect(new Set(achievements.map((achievement) => achievement.id)).size).toBe(98);
    expect(new Set(achievements.map((achievement) => achievement.category))).toEqual(new Set(["combat", "skill", "progress", "boss", "survival", "mastery"]));
    expect(new Set(achievements.map((achievement) => achievement.rarity))).toEqual(new Set(["common", "uncommon", "rare", "epic", "legendary"]));
    expect(achievements.some((achievement) => achievement.rule.kind === "manual")).toBe(true);
    expect(achievements.some((achievement) => achievement.rule.kind === "all-shop-items")).toBe(true);
    expect(achievements.some((achievement) => achievement.rule.kind === "category-complete")).toBe(true);
    expect(achievements.some((achievement) => achievement.rule.kind === "all-achievements")).toBe(true);
    expect(achievements.filter((achievement) => achievement.rule.kind === "stat-threshold").every((achievement) => achievement.rule.stat !== null && achievement.rule.goal !== null)).toBe(true);
  });

  it("keeps the runtime achievement factory joined to the static authored catalog", () => {
    const unlocked = new Set<string>();
    expect(Object.isFrozen(ACHIEVEMENT_CATALOG)).toBe(true);
    expect(Object.isFrozen(ACHIEVEMENT_CATALOG[0])).toBe(true);
    const runtime = createAchievements({
      meta: { level: () => 0 },
      profile: { unlocked: (id) => unlocked.has(id), stat: () => 0, unlock: () => false },
      audio: { rankup: () => undefined },
      shop: [],
      clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)),
    });
    expect(runtime._all.map((achievement) => ({
      id: achievement.id, cat: achievement.cat, rarity: achievement.rarity, name: achievement.name, desc: achievement.desc,
      hidden: achievement.hidden ?? false, manual: achievement.manual ?? false, master: achievement.master ?? false,
    }))).toEqual(ACHIEVEMENT_CATALOG.map((entry) => ({
      id: entry.id, cat: entry.cat, rarity: entry.rarity, name: entry.name, desc: entry.desc,
      hidden: entry.hidden, manual: entry.manual, master: entry.master,
    })));
    for (const entry of ACHIEVEMENT_CATALOG) {
      const achievement = runtime.byId(entry.id);
      if (achievement === undefined) throw new Error(`runtime achievement missing ${entry.id}`);
      if (entry.rule.kind === "stat-threshold") {
        expect(achievement.stat).toBe(entry.rule.stat);
        expect(achievement.goal).toBe(entry.rule.goal);
      } else if (entry.rule.kind === "manual") {
        expect(achievement.check).toBeUndefined();
        expect(achievement.current).toBeUndefined();
      } else if (entry.rule.kind === "all-shop-items") {
        expect(achievement.current).toBeTypeOf("function");
        expect(achievement.goal).toBeTypeOf("function");
      } else {
        expect(achievement.check).toBeTypeOf("function");
      }
    }
  });

  it("is deterministic even when the typed source definitions arrive in another order", () => {
    const first = encodeGameReferenceV1(reference());
    const reordered = encodeGameReferenceV1(reference("a".repeat(40), WEAPONS.slice().reverse(), UPGRADES.slice().reverse(), achievementSource.slice().reverse()));
    expect(reordered).toBe(first);
  });

  it("contains no callbacks, browser objects, undefined values, or non-finite numbers", () => {
    const result = reference();
    expect(() => { assertJsonSafe(result); }).not.toThrow();
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(() => encodeGameReferenceV1(result)).not.toThrow();
  });

  it("rejects duplicate, retired, and incomplete rosters before exporting", () => {
    const duplicate = [...WEAPONS.slice(0, -1), firstWeapon];
    expect(() => reference("a".repeat(40), duplicate)).toThrow(/exactly|duplicate/u);

    const retired = { ...firstWeapon, id: "spear" } as unknown as WeaponDefinition;
    expect(() => reference("a".repeat(40), [retired, ...WEAPONS.slice(1)])).toThrow(/retired/u);

    const incomplete = WEAPONS.slice(0, -1);
    expect(() => reference("a".repeat(40), incomplete)).toThrow(/exactly|missing/u);
  });

  it("rejects stale or abbreviated source generations", () => {
    const result = reference();
    expect(() => { assertCurrentSourceSha(result, "b".repeat(40)); }).toThrow(/stale game reference/u);
    expect(() => { assertCurrentSourceSha(result, "a".repeat(7)); }).toThrow(/full 40-character/u);
    expect(() => reference("a".repeat(7))).toThrow(/full 40-character/u);
  });

  it("binds the contract to the canonical game repository", () => {
    expect(() => buildGameReferenceV1({
      repository: "shaku1z/tear-wiki",
      sourceSha: "a".repeat(40),
      terminologyVersion: "g4-terminology-v1",
      weapons: WEAPONS,
      upgrades: UPGRADES,
      achievements: achievementSource,
      tuningByWeapon,
    })).toThrow(/repository must be shaku1z\/tear/u);
  });

  it("rejects a runtime callback accidentally entering the projected mechanics", () => {
    const unsafe = { ...firstWeapon, mechanics: [(() => undefined) as unknown as string] } as unknown as WeaponDefinition;
    expect(() => reference("a".repeat(40), [unsafe, ...WEAPONS.slice(1)])).toThrow(/non-empty string/u);
  });

  it("validates every imported weapon field instead of trusting IDs alone", () => {
    const malformed = structuredClone(reference()) as unknown as { collections: { weapons: { items: Record<string, unknown>[] } } };
    const weapon = malformed.collections.weapons.items.at(0);
    if (weapon === undefined) throw new Error("missing weapon fixture");
    weapon.ratings = {};
    expect(() => { assertValidGameReferenceV1(malformed); }).toThrow(/ratings/u);

    const malformedMechanics = structuredClone(reference()) as unknown as { collections: { weapons: { items: Record<string, unknown>[] } } };
    const mechanicsWeapon = malformedMechanics.collections.weapons.items.at(0);
    if (mechanicsWeapon === undefined) throw new Error("missing weapon fixture");
    mechanicsWeapon.mechanics = [];
    expect(() => { assertValidGameReferenceV1(malformedMechanics); }).toThrow(/mechanics/u);

    const malformedTuning = structuredClone(reference()) as unknown as { collections: { weapons: { items: Record<string, unknown>[] } } };
    const tuningWeapon = malformedTuning.collections.weapons.items.at(0);
    if (tuningWeapon === undefined) throw new Error("missing weapon fixture");
    tuningWeapon.tuning = {};
    expect(() => { assertValidGameReferenceV1(malformedTuning); }).toThrow(/tuning/u);

    const malformedUpgrade = structuredClone(reference()) as unknown as { collections: { upgrades: { items: Record<string, unknown>[] } } };
    const upgrade = malformedUpgrade.collections.upgrades.items.at(0);
    if (upgrade === undefined) throw new Error("missing upgrade fixture");
    upgrade.tiers = [{ description: "ok", extra: true }];
    expect(() => { assertValidGameReferenceV1(malformedUpgrade); }).toThrow(/unexpected or missing fields/u);

    const malformedAchievement = structuredClone(reference()) as unknown as { collections: { achievements: { items: Record<string, unknown>[] } } };
    const achievement = malformedAchievement.collections.achievements.items.at(0);
    if (achievement === undefined) throw new Error("missing achievement fixture");
    (achievement.rule as Record<string, unknown>).goal = "one";
    expect(() => { assertValidGameReferenceV1(malformedAchievement); }).toThrow(/finite number/u);
  });

  it("enforces explicit achievement rule payloads", () => {
    const missingStatGoal = structuredClone(reference()) as unknown as { collections: { achievements: { items: Record<string, unknown>[] } } };
    const statThreshold = missingStatGoal.collections.achievements.items.find((item) => (item.rule as Record<string, unknown>).kind === "stat-threshold");
    if (statThreshold === undefined) throw new Error("missing stat-threshold fixture");
    (statThreshold.rule as Record<string, unknown>).goal = null;
    expect(() => { assertValidGameReferenceV1(missingStatGoal); }).toThrow(/stat-threshold requires stat and goal/u);

    const manualPayload = structuredClone(reference()) as unknown as { collections: { achievements: { items: Record<string, unknown>[] } } };
    const manual = manualPayload.collections.achievements.items.find((item) => (item.rule as Record<string, unknown>).kind === "manual");
    if (manual === undefined) throw new Error("missing manual fixture");
    (manual.rule as Record<string, unknown>).stat = "unexpected";
    expect(() => { assertValidGameReferenceV1(manualPayload); }).toThrow(/manual requires null stat, goal, and category/u);
  });

  it("binds imported provenance and terminology to their supported values", () => {
    const wrongRepository = structuredClone(reference()) as unknown as { source: { repository: string } };
    wrongRepository.source.repository = "shaku1z/tear-wiki";
    expect(() => { assertValidGameReferenceV1(wrongRepository); }).toThrow(/source repository/u);

    const wrongTerminology = structuredClone(reference()) as unknown as { terminologyVersion: string };
    wrongTerminology.terminologyVersion = "unsupported-terminology-v9";
    expect(() => { assertValidGameReferenceV1(wrongTerminology); }).toThrow(/terminologyVersion/u);
  });

  it("requires canonical positional order for imported roster arrays", () => {
    const activePermutation = structuredClone(reference()) as unknown as { roster: { activeWeaponIds: string[] } };
    activePermutation.roster.activeWeaponIds.reverse();
    expect(() => { assertValidGameReferenceV1(activePermutation); }).toThrow(/canonical Final Five order/u);

    const weaponPermutation = structuredClone(reference()) as unknown as { collections: { weapons: { items: { id: string }[] } } };
    weaponPermutation.collections.weapons.items.reverse();
    expect(() => { assertValidGameReferenceV1(weaponPermutation); }).toThrow(/canonical Final Five order/u);

    const upgradePermutation = structuredClone(reference()) as unknown as { collections: { upgrades: { items: { id: string }[] } } };
    upgradePermutation.collections.upgrades.items.reverse();
    expect(() => { assertValidGameReferenceV1(upgradePermutation); }).toThrow(/canonical authored order/u);

    const achievementPermutation = structuredClone(reference()) as unknown as { collections: { achievements: { items: { id: string }[] } } };
    achievementPermutation.collections.achievements.items.reverse();
    expect(() => { assertValidGameReferenceV1(achievementPermutation); }).toThrow(/canonical authored order/u);
  });

  it("rejects the unsupported schema-1 foundation shape", () => {
    const schemaOne = structuredClone(reference()) as unknown as { schemaVersion: number };
    schemaOne.schemaVersion = 1;
    expect(() => { assertValidGameReferenceV1(schemaOne); }).toThrow(/unsupported game-reference\.v1 schema/u);
  });

  it("rejects extra rating and channel keys from imported artifacts", () => {
    const extraRating = structuredClone(reference()) as unknown as { collections: { weapons: { items: { ratings: Record<string, unknown> }[] } } };
    const rating = extraRating.collections.weapons.items.at(0);
    if (rating === undefined) throw new Error("missing weapon fixture");
    rating.ratings.extra = 1;
    expect(() => { assertValidGameReferenceV1(extraRating); }).toThrow(/ratings has unexpected/u);

    const extraChannel = structuredClone(reference()) as unknown as { collections: { weapons: { items: { channels: Record<string, unknown> }[] } } };
    const channel = extraChannel.collections.weapons.items.at(0);
    if (channel === undefined) throw new Error("missing weapon fixture");
    channel.channels.extra = 1;
    expect(() => { assertValidGameReferenceV1(extraChannel); }).toThrow(/channels has unexpected/u);
  });

  it("rejects duplicate progression IDs and an incomplete fixed-key authority", () => {
    const duplicateUpgrade = structuredClone(reference()) as unknown as { collections: { upgrades: { items: { id: string }[] } } };
    const firstUpgrade = duplicateUpgrade.collections.upgrades.items.at(0);
    const secondUpgrade = duplicateUpgrade.collections.upgrades.items.at(1);
    if (firstUpgrade === undefined || secondUpgrade === undefined) throw new Error("missing upgrade fixture");
    secondUpgrade.id = firstUpgrade.id;
    expect(() => { assertValidGameReferenceV1(duplicateUpgrade); }).toThrow(/duplicate IDs/u);

    const duplicateAchievement = structuredClone(reference()) as unknown as { collections: { achievements: { items: { id: string }[] } } };
    const firstAchievement = duplicateAchievement.collections.achievements.items.at(0);
    const secondAchievement = duplicateAchievement.collections.achievements.items.at(1);
    if (firstAchievement === undefined || secondAchievement === undefined) throw new Error("missing achievement fixture");
    secondAchievement.id = firstAchievement.id;
    expect(() => { assertValidGameReferenceV1(duplicateAchievement); }).toThrow(/duplicate IDs/u);

    const missingCollection = structuredClone(reference()) as unknown as { collections: Record<string, unknown> };
    delete missingCollection.collections.achievements;
    expect(() => { assertValidGameReferenceV1(missingCollection); }).toThrow(/unexpected or missing fields/u);
  });

  it("rejects extra, duplicate, or incomplete source catalogs before reduction", () => {
    expect(() => reference("a".repeat(40), WEAPONS, UPGRADES.slice(0, -1))).toThrow(/exactly 60/u);
    const lastUpgrade = UPGRADES.at(-1);
    if (lastUpgrade === undefined) throw new Error("missing upgrade source fixture");
    const firstUpgrade = UPGRADES.at(0);
    if (firstUpgrade === undefined) throw new Error("missing first upgrade source fixture");
    const unknownUpgrade = [...UPGRADES.slice(0, -1), { ...lastUpgrade, id: "future-upgrade" }];
    expect(() => reference("a".repeat(40), WEAPONS, unknownUpgrade)).toThrow(/exact canonical ID set/u);
    const duplicateUpgrade = [...UPGRADES.slice(0, -1), firstUpgrade];
    expect(() => reference("a".repeat(40), WEAPONS, duplicateUpgrade)).toThrow(/duplicate IDs/u);

    expect(() => reference("a".repeat(40), WEAPONS, UPGRADES, ACHIEVEMENT_CATALOG.slice(0, -1))).toThrow(/exactly 98/u);
    const lastAchievement = ACHIEVEMENT_CATALOG.at(-1);
    if (lastAchievement === undefined) throw new Error("missing achievement source fixture");
    const firstAchievement = ACHIEVEMENT_CATALOG.at(0);
    if (firstAchievement === undefined) throw new Error("missing first achievement source fixture");
    const unknownAchievement = [...ACHIEVEMENT_CATALOG.slice(0, -1), { ...lastAchievement, id: "future-achievement" }];
    expect(() => reference("a".repeat(40), WEAPONS, UPGRADES, unknownAchievement)).toThrow(/exact canonical ID set/u);
    const duplicateAchievement = [...ACHIEVEMENT_CATALOG.slice(0, -1), firstAchievement];
    expect(() => reference("a".repeat(40), WEAPONS, UPGRADES, duplicateAchievement)).toThrow(/duplicate IDs/u);
  });

  it("does not let canonical JSON silently drop unsafe values", () => {
    expect(() => canonicalStringify({ dropped: undefined })).toThrow(/undefined/u);
    expect(() => canonicalStringify({ callback: () => undefined })).toThrow(/canonical JSON/u);
  });

  it("fails closed when an imported artifact activates a retired ID", () => {
    const imported = structuredClone(reference()) as unknown as { roster: { activeWeaponIds: string[] } };
    imported.roster.activeWeaponIds[0] = "spear";
    expect(() => { assertValidGameReferenceV1(imported); }).toThrow(/retired|missing canonical/u);
  });
});
