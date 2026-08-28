import { describe, expect, it } from "vitest";

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
import { STAGES } from "../../src/gameplay/stages";
import { MODE_CATALOG } from "../../src/gameplay/run/mode-catalog";
import { ENEMY_KIND_IDS } from "../../src/gameplay/run/content-director";
import { BOSS_DEFINITIONS } from "../../src/gameplay/run/boss-definitions";
import { DIFFICULTY_CATALOG } from "../../src/gameplay/run/difficulty-catalog";
import { FINAL_FIVE_WEAPON_TUNING } from "../../src/gameplay/weapon-tuning";
import { VARIANTS } from "../../src/gameplay/variants";
import { AFFIXES, PRESETS } from "../../src/gameplay/affixes";

const tuningByWeapon = FINAL_FIVE_WEAPON_TUNING;
const firstWeapon = WEAPONS.at(0);
if (firstWeapon === undefined) throw new Error("Final Five source is empty");
const achievementSource = ACHIEVEMENT_CATALOG;
const enemyFamilySource = ENEMY_KIND_IDS.map((id) => ({ id, variants: VARIANTS[id] ?? [] }));

function reference(sourceSha = "a".repeat(40), weapons: readonly WeaponDefinition[] = WEAPONS,
  upgrades: readonly UpgradeDefinition[] = UPGRADES, achievements = achievementSource,
  stages = STAGES, modes = MODE_CATALOG, enemyFamilies = enemyFamilySource,
  enemyAffixes = AFFIXES, enemyPresets = PRESETS, bossDefinitions = BOSS_DEFINITIONS,
  difficulties = DIFFICULTY_CATALOG,
  tuningOverride: Readonly<Record<string, Readonly<Record<string, unknown>>>> = tuningByWeapon): GameReferenceV1 {
  return buildGameReferenceV1({
    repository: "shaku1z/tear",
    sourceSha,
    terminologyVersion: "g4-terminology-v1",
    weapons,
    upgrades,
    achievements,
    enemyFamilies,
    enemyAffixes,
    enemyPresets,
    bossDefinitions,
    stages,
    modes,
    difficulties,
    tuningByWeapon: tuningOverride,
  });
}

type MutableWeaponTuningFixture = Record<string, Record<string, number>>;

function mutableWeaponTuning(): MutableWeaponTuningFixture {
  return structuredClone(FINAL_FIVE_WEAPON_TUNING);
}

function tuningEntry(value: MutableWeaponTuningFixture, id: string): Record<string, number> {
  const entry = value[id];
  if (entry === undefined) throw new Error(`missing tuning fixture ${id}`);
  return entry;
}

function referenceWithTuning(tuningOverride: MutableWeaponTuningFixture): GameReferenceV1 {
  return reference(
    "a".repeat(40), WEAPONS, UPGRADES, achievementSource, STAGES, MODE_CATALOG,
    enemyFamilySource, AFFIXES, PRESETS, BOSS_DEFINITIONS, DIFFICULTY_CATALOG, tuningOverride,
  );
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
    expect(result.collections.stages.status).toBe("complete");
    expect(result.collections.stages.items.map((stage) => stage.id)).toEqual(["grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"]);
    expect(result.collections.modes.status).toBe("complete");
    expect(result.collections.modes.items.map((mode) => mode.id)).toEqual(["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"]);
    expect(result.collections.enemies.status).toBe("complete");
    expect(result.collections.enemies.items.families.map((family) => family.id)).toEqual([
      "charger", "ranged", "flyer", "bomber", "armored", "priest", "mender", "herald", "anchor", "wraith", "chimera",
    ]);
    expect(result.collections.enemies.items.families.find((family) => family.id === "armored")?.variants).toEqual([
      { id: "bark-sentinel", name: "Bark Sentinel", weight: 0.45, minWave: 5 },
    ]);
    expect(result.collections.enemies.items.affixes.map((affix) => affix.id)).toEqual(["tank", "swift", "rapid", "volley", "armed", "warded"]);
    expect(result.collections.enemies.items.presets).toEqual([
      { familyId: "ranged", affixIds: ["rapid", "volley"] },
      { familyId: "charger", affixIds: ["tank", "armed"] },
      { familyId: "armored", affixIds: ["warded", "tank"] },
    ]);
    expect(result.collections.bosses.status).toBe("complete");
    expect(result.collections.bosses.items).toEqual([
      { id: "warden", name: "The Warden", stageId: "grounds", phaseMarks: [0.65, 0.30] },
      { id: "colossus", name: "Iron Colossus", stageId: "undercroft", phaseMarks: [0.60, 0.25] },
      { id: "aldric", name: "Berserker King", stageId: "crimson-fields", phaseMarks: [0.65, 0.20] },
      { id: "rootbound", name: "The Rootbound", stageId: "verdant-sanctum", phaseMarks: [0.65, 0.28] },
      { id: "echo", name: "The Echo", stageId: "voidspire", phaseMarks: [0.60, 0.25] },
      { id: "source", name: "The Source", stageId: "tear", phaseMarks: [0.58, 0.28] },
    ]);
    expect(result.collections["public-tuning"].status).toBe("complete");
    expect(result.collections["public-tuning"].items.schemaVersion).toBe(1);
    expect(result.collections["public-tuning"].items.difficultyCatalog.map((difficulty) => difficulty.id)).toEqual([
      "easy", "normal", "hard", "extreme", "onehit",
    ]);
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

  it("projects only stable stage data and cross-reference IDs", () => {
    const result = reference();
    const stages = result.collections.stages.items;
    expect(stages).toHaveLength(6);
    expect(stages[0]).toMatchObject({
      id: "grounds", name: "The Grounds", musicId: "grounds", boss: "warden",
      theme: { background: "#ffffff", platform: "#111111", accent: "#e23b3b", dark: false },
    });
    expect(stages[0]?.pool[0]).toEqual({ kind: "charger", weight: 1, unlockWave: 1 });
    expect(stages[0]?.layout[0]).toEqual({ x: 230, y: 650, w: 280, h: 24, oneway: true });
    expect(stages[0]?.narrative.chapter.pages).toHaveLength(2);
    expect(stages[0]?.narrative.art).toEqual({ composition: "left", wash: "light" });
    expect(stages[3]).toMatchObject({
      id: "verdant-sanctum", name: "The Verdant Sanctum", musicId: "verdant-sanctum", boss: "rootbound",
      theme: { background: "#dff2d6", platform: "#234a36", accent: "#e4c95a", dark: false },
    });
    expect(stages[5]?.theme.dark).toBe(true);
    expect(Object.keys(stages[0] ?? {})).not.toContain("stagePlatforms");
    expect(Object.keys(stages[0] ?? {})).not.toContain("hazards");
    expect(Object.values(stages).every((stage) => stage.pool.every((entry) => entry.weight > 0 && entry.unlockWave > 0))).toBe(true);
  });

  it("projects the seven authored modes without runtime debug flags or planners", () => {
    const result = reference();
    const modes = result.collections.modes.items;
    expect(modes.map((mode) => mode.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(modes.map((mode) => mode.classification)).toEqual([
      "campaign", "endless", "gauntlet", "training", "training", "boss-only", "sandbox",
    ]);
    expect(modes.find((mode) => mode.id === "tutorial")).toMatchObject({ training: true, bossOnly: false, sandbox: false });
    expect(modes.find((mode) => mode.id === "bossonly")).toMatchObject({ training: false, bossOnly: true, sandbox: false });
    expect(modes.find((mode) => mode.id === "sandbox")).toMatchObject({ training: false, bossOnly: false, sandbox: true });
    expect(modes.every((mode) => !Object.prototype.hasOwnProperty.call(mode, "debug"))).toBe(true);
    expect(Object.keys(modes[0] ?? {})).not.toContain("planner");
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
    const reordered = encodeGameReferenceV1(reference("a".repeat(40), WEAPONS.slice().reverse(), UPGRADES.slice().reverse(), achievementSource.slice().reverse(), STAGES.slice().reverse(), MODE_CATALOG.slice().reverse()));
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
      enemyFamilies: enemyFamilySource,
      enemyAffixes: AFFIXES,
      enemyPresets: PRESETS,
      bossDefinitions: BOSS_DEFINITIONS,
      stages: STAGES,
      modes: MODE_CATALOG,
      difficulties: DIFFICULTY_CATALOG,
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

  it("requires canonical Final Five tuning keys and values during projection and import", () => {
    const missing = mutableWeaponTuning();
    delete tuningEntry(missing, "greatsword").cleaveDamageMult;
    expect(() => referenceWithTuning(missing)).toThrow(/tuning has unexpected or missing fields/u);

    const extra = mutableWeaponTuning();
    tuningEntry(extra, "greatsword").unexpected = 1;
    expect(() => referenceWithTuning(extra)).toThrow(/tuning has unexpected or missing fields/u);

    const wrong = mutableWeaponTuning();
    tuningEntry(wrong, "greatsword").cleaveDamageMult = 9;
    expect(() => referenceWithTuning(wrong)).toThrow(/does not match canonical greatsword tuning/u);

    const reordered = mutableWeaponTuning();
    reordered.greatsword = Object.fromEntries(Object.entries(tuningEntry(reordered, "greatsword")).reverse());
    expect(() => referenceWithTuning(reordered)).not.toThrow();

    const importedMissing = structuredClone(reference()) as unknown as { collections: { weapons: { items: { tuning: Record<string, unknown> }[] } } };
    const importedMissingWeapon = importedMissing.collections.weapons.items.at(2);
    if (importedMissingWeapon === undefined) throw new Error("missing imported tuning fixture");
    delete importedMissingWeapon.tuning.cleaveDamageMult;
    expect(() => { assertValidGameReferenceV1(importedMissing); }).toThrow(/tuning has unexpected or missing fields/u);

    const importedExtra = structuredClone(reference()) as unknown as { collections: { weapons: { items: { tuning: Record<string, unknown> }[] } } };
    const importedExtraWeapon = importedExtra.collections.weapons.items.at(2);
    if (importedExtraWeapon === undefined) throw new Error("missing imported tuning fixture");
    importedExtraWeapon.tuning.unexpected = 1;
    expect(() => { assertValidGameReferenceV1(importedExtra); }).toThrow(/tuning has unexpected or missing fields/u);

    const importedWrong = structuredClone(reference()) as unknown as { collections: { weapons: { items: { tuning: Record<string, unknown> }[] } } };
    const importedWrongWeapon = importedWrong.collections.weapons.items.at(2);
    if (importedWrongWeapon === undefined) throw new Error("missing imported tuning fixture");
    importedWrongWeapon.tuning.cleaveDamageMult = 9;
    expect(() => { assertValidGameReferenceV1(importedWrong); }).toThrow(/does not match canonical greatsword tuning/u);

    const importedReordered = structuredClone(reference()) as unknown as { collections: { weapons: { items: { tuning: Record<string, unknown> }[] } } };
    const importedReorderedWeapon = importedReordered.collections.weapons.items.at(2);
    if (importedReorderedWeapon === undefined) throw new Error("missing imported tuning fixture");
    importedReorderedWeapon.tuning = Object.fromEntries(Object.entries(importedReorderedWeapon.tuning).reverse());
    expect(() => { assertValidGameReferenceV1(importedReordered); }).not.toThrow();
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

    const stagePermutation = structuredClone(reference()) as unknown as { collections: { stages: { items: { id: string }[] } } };
    stagePermutation.collections.stages.items.reverse();
    expect(() => { assertValidGameReferenceV1(stagePermutation); }).toThrow(/canonical authored order/u);

    const modePermutation = structuredClone(reference()) as unknown as { collections: { modes: { items: { id: string }[] } } };
    modePermutation.collections.modes.items.reverse();
    expect(() => { assertValidGameReferenceV1(modePermutation); }).toThrow(/canonical authored order/u);
  });

  it("strictly validates stage references, geometry, and normalized narrative fields", () => {
    const wrongBoss = structuredClone(reference()) as unknown as { collections: { stages: { items: { boss: string }[] } } };
    const firstStage = wrongBoss.collections.stages.items.at(0);
    if (firstStage === undefined) throw new Error("missing stage fixture");
    firstStage.boss = "not-a-boss";
    expect(() => { assertValidGameReferenceV1(wrongBoss); }).toThrow(/canonical boss ID/u);

    const mismatchedBoss = structuredClone(reference()) as unknown as { collections: { stages: { items: { boss: string }[] } } };
    const mismatchedStage = mismatchedBoss.collections.stages.items.at(0);
    if (mismatchedStage === undefined) throw new Error("missing stage fixture");
    mismatchedStage.boss = "source";
    expect(() => { assertValidGameReferenceV1(mismatchedBoss); }).toThrow(/boss\/stage reference mismatch|(?:5|five)-way bijection/u);

    const wrongEnemy = structuredClone(reference()) as unknown as { collections: { stages: { items: { pool: { kind: string }[] }[] } } };
    const enemyStage = wrongEnemy.collections.stages.items.at(0);
    const enemyEntry = enemyStage?.pool[0];
    if (enemyEntry === undefined) throw new Error("missing stage pool fixture");
    enemyEntry.kind = "not-an-enemy";
    expect(() => { assertValidGameReferenceV1(wrongEnemy); }).toThrow(/canonical enemy kind/u);

    const duplicatePool = structuredClone(reference()) as unknown as { collections: { stages: { items: { pool: { kind: string }[] }[] } } };
    const duplicateStage = duplicatePool.collections.stages.items.at(0);
    const duplicateEntry = duplicateStage?.pool[0];
    if (duplicateStage === undefined || duplicateEntry === undefined) throw new Error("missing stage pool fixture");
    duplicateStage.pool.push({ ...duplicateEntry });
    expect(() => { assertValidGameReferenceV1(duplicatePool); }).toThrow(/duplicate enemy kinds/u);

    const nonPositive = structuredClone(reference()) as unknown as { collections: { stages: { items: { pool: { weight: number }[] }[] } } };
    const weightedStage = nonPositive.collections.stages.items.at(0);
    const weightedEntry = weightedStage?.pool[0];
    if (weightedEntry === undefined) throw new Error("missing stage pool fixture");
    weightedEntry.weight = 0;
    expect(() => { assertValidGameReferenceV1(nonPositive); }).toThrow(/must be positive/u);

    const badLayout = structuredClone(reference()) as unknown as { collections: { stages: { items: { layout: { w: number }[] }[] } } };
    const layoutStage = badLayout.collections.stages.items.at(0);
    const layoutEntry = layoutStage?.layout[0];
    if (layoutEntry === undefined) throw new Error("missing stage layout fixture");
    layoutEntry.w = 0;
    expect(() => { assertValidGameReferenceV1(badLayout); }).toThrow(/must be positive/u);

    const extraNarrative = structuredClone(reference()) as unknown as { collections: { stages: { items: { narrative: { art: Record<string, unknown> } }[] } } };
    const narrativeStage = extraNarrative.collections.stages.items.at(0);
    if (narrativeStage === undefined) throw new Error("missing narrative fixture");
    narrativeStage.narrative.art.extra = true;
    expect(() => { assertValidGameReferenceV1(extraNarrative); }).toThrow(/unexpected or missing fields/u);
  });

  it("strictly validates mode metadata and excludes runtime-only flags", () => {
    const extraDebug = structuredClone(reference()) as unknown as { collections: { modes: { items: Record<string, unknown>[] } } };
    const mode = extraDebug.collections.modes.items.at(0);
    if (mode === undefined) throw new Error("missing mode fixture");
    mode.debug = true;
    expect(() => { assertValidGameReferenceV1(extraDebug); }).toThrow(/unexpected or missing fields/u);

    const badClassification = structuredClone(reference()) as unknown as { collections: { modes: { items: { classification: string }[] } } };
    const classified = badClassification.collections.modes.items.at(0);
    if (classified === undefined) throw new Error("missing mode fixture");
    classified.classification = "debug";
    expect(() => { assertValidGameReferenceV1(badClassification); }).toThrow(/classification is not supported/u);

    const badOrder = structuredClone(reference()) as unknown as { collections: { modes: { items: { order: number }[] } } };
    const ordered = badOrder.collections.modes.items.at(0);
    if (ordered === undefined) throw new Error("missing mode fixture");
    ordered.order = 99;
    expect(() => { assertValidGameReferenceV1(badOrder); }).toThrow(/canonical authored order/u);
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

    const unknownStage = [...STAGES.slice(0, -1), { ...STAGES.at(-1), id: "future-stage" } as never];
    expect(() => reference("a".repeat(40), WEAPONS, UPGRADES, achievementSource, unknownStage)).toThrow(/exact canonical ID set/u);
    const duplicateStage = [...STAGES.slice(0, -1), STAGES.at(0)];
    expect(() => reference("a".repeat(40), WEAPONS, UPGRADES, achievementSource, duplicateStage as never)).toThrow(/duplicate IDs|exact canonical ID set/u);

    const unknownMode = [...MODE_CATALOG.slice(0, -1), { ...MODE_CATALOG.at(-1), id: "future-mode" } as never];
    expect(() => reference("a".repeat(40), WEAPONS, UPGRADES, achievementSource, STAGES, unknownMode)).toThrow(/exact canonical ID set/u);
    const duplicateMode = [...MODE_CATALOG.slice(0, -1), MODE_CATALOG.at(0)];
    expect(() => reference("a".repeat(40), WEAPONS, UPGRADES, achievementSource, STAGES, duplicateMode as never)).toThrow(/duplicate IDs|exact canonical ID set/u);
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
