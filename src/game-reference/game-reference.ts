import { canonicalStringify } from "../replay/hash";
import { FINAL_FIVE_WEAPON_SCHEMA_VERSION, isRetiredWeaponSelection, WEAPON_IDS, type WeaponId } from "../gameplay/weapon-selection";
import type { AchievementCategory, AchievementRarity } from "../gameplay/progression/achievements";
import { CANONICAL_ACHIEVEMENT_IDS, type AchievementCatalogEntry } from "../gameplay/progression/achievement-catalog";
import { CANONICAL_UPGRADE_IDS, type UpgradeCategory, type UpgradeDefinition } from "../gameplay/upgrades";
import type { WeaponChannels, WeaponDefinition, WeaponRatings } from "../gameplay/weapons";
import type { EnemyAffix, EnemyPreset } from "../gameplay/affixes";
import { MODE_IDS, type ModeDefinition } from "../gameplay/run/mode-catalog";
import { STAGE_IDS, type StageDefinition } from "../gameplay/stages";
import { CANONICAL_BOSS_IDS, EXPECTED_BOSS_COUNT, projectBossReference, validateProjectedBosses, type GameReferenceBossV1 } from "./boss-reference";
import type { BossDefinition } from "../gameplay/run/boss-definitions";
import { projectEnemyReference, validateProjectedEnemies, type EnemyReferenceFamilySource, type GameReferenceEnemiesV1 } from "./enemy-reference";
import { projectMode, projectStage, validateProjectedMode, validateProjectedStage, type GameReferenceModeV1, type GameReferenceStageV1 } from "./stage-mode-reference";
export type { BossReferenceProjectionInput } from "./boss-reference";
export type { BossDefinition, BossDefinitionId } from "../gameplay/run/boss-definitions";
export type { GameReferenceBossV1 } from "./boss-reference";
export type {
  EnemyReferenceFamilySource,
  GameReferenceEnemyAffixV1,
  GameReferenceEnemyFamilyV1,
  GameReferenceEnemyPresetV1,
  GameReferenceEnemyVariantV1,
  GameReferenceEnemiesV1,
} from "./enemy-reference";
export type {
  GameReferenceModeV1,
  GameReferenceStageLayoutV1,
  GameReferenceStageNarrativePageV1,
  GameReferenceStageNarrativeV1,
  GameReferenceStagePoolEntryV1,
  GameReferenceStageV1,
} from "./stage-mode-reference";

/** The game-owned, data-only handoff consumed by future external tooling. */
export const GAME_REFERENCE_FORMAT = "game-reference.v1" as const;
export const GAME_REFERENCE_SCHEMA_VERSION = 2 as const;
export const GAME_REFERENCE_REPOSITORY = "shaku1z/tear" as const;
export const GAME_REFERENCE_TERMINOLOGY_VERSION = "g4-terminology-v1" as const;

export const CANONICAL_FINAL_FIVE_WEAPON_IDS = Object.freeze([...WEAPON_IDS]);
export const RETIRED_WEAPON_IDS = Object.freeze(["spear", "ringblade"] as const);

const CHANNEL_KEYS = Object.freeze([
  "throwPower", "throwSpeed", "remoteRange", "secondaryPower", "returnSpeed", "controlDuration",
] as const satisfies readonly (keyof WeaponChannels)[]);
const RATING_KEYS = Object.freeze(["handling", "impact", "reach", "difficulty"] as const satisfies readonly (keyof WeaponRatings)[]);

export interface GameReferenceWeaponV1 {
  readonly id: WeaponId;
  readonly name: string;
  readonly model: string;
  readonly playstyle: string;
  readonly description: string;
  readonly blurb: string;
  readonly mechanics: readonly string[];
  readonly tags: readonly string[];
  readonly weaknesses: readonly string[];
  readonly throwIdentity: string;
  readonly ratings: Readonly<WeaponRatings>;
  readonly throwCollisionPad: number;
  readonly channels: Readonly<WeaponChannels>;
  /** Flat public numeric tuning only; runtime/config objects are not exported. */
  readonly tuning: Readonly<Record<string, number>>;
}

export type GameReferenceUpgradeRuleKind = "stackable" | "unique" | "tiered";

export interface GameReferenceUpgradeTierV1 {
  readonly description: string;
}

export interface GameReferenceUpgradeV1 {
  readonly id: string;
  readonly name: string;
  readonly category: UpgradeCategory;
  readonly description: string;
  readonly unique: boolean;
  readonly rare: boolean;
  readonly maxStacks: number | null;
  readonly rule: Readonly<{ kind: GameReferenceUpgradeRuleKind }>;
  readonly tiers: readonly GameReferenceUpgradeTierV1[];
}

export type GameReferenceAchievementRuleKind = "stat-threshold" | "manual" | "all-shop-items" | "category-complete" | "all-achievements";

export interface GameReferenceAchievementV1 {
  readonly id: string;
  readonly category: AchievementCategory;
  readonly rarity: AchievementRarity;
  readonly name: string;
  readonly description: string;
  readonly hidden: boolean;
  readonly manual: boolean;
  readonly master: boolean;
  readonly rule: Readonly<{
    kind: GameReferenceAchievementRuleKind;
    stat: string | null;
    goal: number | null;
    category: AchievementCategory | null;
  }>;
}

export interface GameReferenceCompleteCollectionV1<T> {
  readonly status: "complete";
  readonly items: readonly T[];
}

export interface GameReferenceCompleteValueCollectionV1<T> {
  readonly status: "complete";
  readonly items: T;
}

export interface DeferredGameReferenceCollectionV1 {
  readonly status: "deferred";
  readonly reason: string;
}

export interface GameReferenceV1 {
  readonly format: typeof GAME_REFERENCE_FORMAT;
  readonly schemaVersion: typeof GAME_REFERENCE_SCHEMA_VERSION;
  readonly source: Readonly<{ repository: string; sha: string }>;
  readonly terminologyVersion: string;
  readonly roster: Readonly<{
    id: "final-five";
    schemaVersion: typeof FINAL_FIVE_WEAPON_SCHEMA_VERSION;
    activeWeaponIds: readonly WeaponId[];
    retiredWeaponIds: readonly (typeof RETIRED_WEAPON_IDS[number])[];
  }>;
  readonly collections: Readonly<{
    weapons: GameReferenceCompleteCollectionV1<GameReferenceWeaponV1>;
    upgrades: GameReferenceCompleteCollectionV1<GameReferenceUpgradeV1>;
    enemies: GameReferenceCompleteValueCollectionV1<GameReferenceEnemiesV1>;
    bosses: GameReferenceCompleteCollectionV1<GameReferenceBossV1>;
    stages: GameReferenceCompleteCollectionV1<GameReferenceStageV1>;
    modes: GameReferenceCompleteCollectionV1<GameReferenceModeV1>;
    achievements: GameReferenceCompleteCollectionV1<GameReferenceAchievementV1>;
    "public-tuning": DeferredGameReferenceCollectionV1;
  }>;
}

export interface GameReferenceProjectionInput {
  readonly repository: string;
  readonly sourceSha: string;
  readonly terminologyVersion: string;
  readonly weapons: readonly WeaponDefinition[];
  readonly upgrades: readonly UpgradeDefinition[];
  readonly achievements: readonly AchievementCatalogEntry[];
  readonly enemyFamilies: readonly EnemyReferenceFamilySource[];
  readonly enemyAffixes: readonly EnemyAffix[];
  readonly enemyPresets: readonly EnemyPreset[];
  readonly bossDefinitions: readonly BossDefinition[];
  readonly stages: readonly StageDefinition[];
  readonly modes: readonly ModeDefinition[];
  readonly tuningByWeapon: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

const DEFERRED_COLLECTION_REASONS = Object.freeze({
  "public-tuning": "Only flat weapon tuning is safe to project in this contract slice.",
});
const EXPECTED_UPGRADE_COUNT = 60;
const EXPECTED_ACHIEVEMENT_COUNT = 98;
const EXPECTED_STAGE_COUNT = 5;
const UPGRADE_CATEGORIES = Object.freeze(["offense", "throw", "parry", "mobility", "resilience", "utility"] as const);
const ACHIEVEMENT_CATEGORIES = Object.freeze(["combat", "skill", "progress", "boss", "survival", "mastery"] as const);
const ACHIEVEMENT_RARITIES = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"] as const);
if (CANONICAL_UPGRADE_IDS.length !== EXPECTED_UPGRADE_COUNT) throw new Error("canonical upgrade catalog count changed without a reference-contract update");
if (CANONICAL_ACHIEVEMENT_IDS.length !== EXPECTED_ACHIEVEMENT_COUNT) throw new Error("canonical achievement catalog count changed without a reference-contract update");

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${path} must be a non-empty string`);
  return value;
}

function exactKeys(value: Record<string, unknown>, path: string, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new TypeError(`${path} has unexpected or missing fields`);
  }
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${path} must be a finite number`);
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function fullSha(value: unknown, path: string): string {
  const sha = text(value, path).toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new TypeError(`${path} must be a full 40-character Git SHA`);
  return sha;
}

function stringList(value: unknown, path: string, minimum = 1): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum) throw new TypeError(`${path} must contain at least ${String(minimum)} item(s)`);
  const result = value.map((entry, index) => text(entry, `${path}[${String(index)}]`));
  if (new Set(result).size !== result.length) throw new TypeError(`${path} must not contain duplicates`);
  return Object.freeze(result);
}

function ratings(value: WeaponRatings, path: string): Readonly<WeaponRatings> {
  const source = record(value, path);
  exactKeys(source, path, RATING_KEYS);
  const result = Object.fromEntries(RATING_KEYS.map((key) => [key, finite(source[key], `${path}.${key}`)])) as unknown as WeaponRatings;
  for (const key of RATING_KEYS) {
    if (!Number.isInteger(result[key]) || result[key] < 1 || result[key] > 5) throw new RangeError(`${path}.${key} must be an integer from 1 to 5`);
  }
  return Object.freeze(result);
}

function channels(value: WeaponChannels, path: string): Readonly<WeaponChannels> {
  const source = record(value, path);
  exactKeys(source, path, CHANNEL_KEYS);
  const result = Object.fromEntries(CHANNEL_KEYS.map((key) => [key, finite(source[key], `${path}.${key}`)])) as unknown as WeaponChannels;
  return Object.freeze(result);
}

function tuning(value: unknown, path: string): Readonly<Record<string, number>> {
  const source = record(value, path);
  const entries = Object.keys(source).sort().map((key) => [text(key, `${path} key`), finite(source[key], `${path}.${key}`)] as const);
  if (entries.length === 0) throw new TypeError(`${path} must contain at least one public numeric value`);
  return Object.freeze(Object.fromEntries(entries));
}

function projectUpgrade(source: UpgradeDefinition, path: string): GameReferenceUpgradeV1 {
  const id = text(source.id, `${path}.id`);
  const name = text(source.name, `${path}.name`);
  const category = text(source.cat, `${path}.category`) as UpgradeCategory;
  if (!UPGRADE_CATEGORIES.includes(category)) throw new TypeError(`${path}.category is not a supported upgrade category`);
  const description = text(source.desc, `${path}.description`);
  const unique = boolean(source.unique, `${path}.unique`);
  const rare = source.rare ?? false;
  if (typeof rare !== "boolean") throw new TypeError(`${path}.rare must be a boolean when present`);
  const maxStacks = source.maxStacks ?? null;
  if (maxStacks !== null && (!Number.isInteger(maxStacks) || maxStacks < 1)) throw new RangeError(`${path}.maxStacks must be a positive integer when present`);
  const tiers = Object.freeze((source.tiers ?? []).map((tier, index) => Object.freeze({
    description: text(tier.desc, `${path}.tiers[${String(index)}].description`),
  })));
  const kind: GameReferenceUpgradeRuleKind = tiers.length > 0 ? "tiered" : unique ? "unique" : "stackable";
  return Object.freeze({
    id, name, category, description, unique, rare, maxStacks,
    rule: Object.freeze({ kind }),
    tiers,
  });
}

function projectAchievement(source: AchievementCatalogEntry, path: string): GameReferenceAchievementV1 {
  const id = text(source.id, `${path}.id`);
  const category = text(source.cat, `${path}.category`) as AchievementCategory;
  if (!ACHIEVEMENT_CATEGORIES.includes(category)) throw new TypeError(`${path}.category is not a supported achievement category`);
  const rarity = text(source.rarity, `${path}.rarity`) as AchievementRarity;
  if (!ACHIEVEMENT_RARITIES.includes(rarity)) throw new TypeError(`${path}.rarity is not a supported achievement rarity`);
  const name = text(source.name, `${path}.name`);
  const description = text(source.desc, `${path}.description`);
  const hidden = source.hidden;
  const manualFlag = source.manual;
  const master = source.master;
  const stat = source.rule.kind === "stat-threshold" ? text(source.rule.stat, `${path}.rule.stat`) : null;
  const goal = source.rule.kind === "stat-threshold" ? finite(source.rule.goal, `${path}.rule.goal`) : null;
  const categoryRule = source.rule.kind === "category-complete" ? source.rule.category : null;
  const kind: GameReferenceAchievementRuleKind = source.rule.kind;
  return Object.freeze({
    id, category, rarity, name, description, hidden, manual: manualFlag, master,
    rule: Object.freeze({ kind, stat, goal, category: categoryRule }),
  });
}

function assertUniqueCount(ids: readonly string[], expected: number, path: string): void {
  if (ids.length !== expected) throw new TypeError(`${path} must contain exactly ${String(expected)} entries`);
  if (new Set(ids).size !== ids.length) throw new TypeError(`${path} must not contain duplicate IDs`);
}

function assertCanonicalSourceIds(ids: readonly string[], expected: readonly string[], path: string): void {
  // Input order may vary between typed module composition and tests; the exact
  // canonical set is checked before reduction, and `expected` defines output order.
  assertUniqueCount(ids, expected.length, path);
  const actualSet = [...new Set(ids)].sort();
  const expectedSet = [...expected].sort();
  if (actualSet.some((id, index) => id !== expectedSet[index])) throw new TypeError(`${path} must contain the exact canonical ID set`);
}

function assertCanonicalOrderedIds(ids: readonly string[], expected: readonly string[], path: string): void {
  if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index])) throw new TypeError(`${path} must use canonical authored order`);
}

function completeCollection<T>(value: unknown, path: string, validateItem: (item: unknown, itemPath: string) => T): GameReferenceCompleteCollectionV1<T> {
  const source = record(value, path);
  exactKeys(source, path, ["status", "items"]);
  if (source.status !== "complete" || !Array.isArray(source.items)) throw new TypeError(`${path} must be a complete collection`);
  const items = Object.freeze(source.items.map((item, index) => validateItem(item, `${path}.items[${String(index)}]`)));
  return Object.freeze({ status: "complete", items });
}

function deferredCollection(value: unknown, path: string): DeferredGameReferenceCollectionV1 {
  const source = record(value, path);
  exactKeys(source, path, ["status", "reason"]);
  if (source.status !== "deferred") throw new TypeError(`${path} must be deferred`);
  return Object.freeze({ status: "deferred", reason: text(source.reason, `${path}.reason`) });
}

function assertBossStageConsistency(
  stages: readonly GameReferenceStageV1[],
  bosses: readonly GameReferenceBossV1[],
): void {
  const stagesById = new Map(stages.map((stage) => [stage.id, stage] as const));
  const stageByBoss = new Map<string, string>();
  for (const stage of stages) {
    if (stageByBoss.has(stage.boss)) throw new TypeError("gameReference stage boss references must form a five-way bijection");
    stageByBoss.set(stage.boss, stage.id);
  }
  const bossByStage = new Map<string, string>();
  for (const boss of bosses) {
    if (bossByStage.has(boss.stageId)) throw new TypeError("gameReference boss stage references must form a five-way bijection");
    const stage = stagesById.get(boss.stageId);
    if (stage?.boss !== boss.id || stageByBoss.get(boss.id) !== boss.stageId) {
      throw new TypeError(`gameReference boss/stage reference mismatch for ${boss.id}`);
    }
    bossByStage.set(boss.stageId, boss.id);
  }
  if (
    stageByBoss.size !== EXPECTED_BOSS_COUNT
    || bossByStage.size !== EXPECTED_BOSS_COUNT
    || CANONICAL_BOSS_IDS.some((id) => !stageByBoss.has(id) || !bosses.some((boss) => boss.id === id))
  ) {
    throw new TypeError("gameReference boss/stage references must form a canonical five-way bijection");
  }
}

function assertExactRoster(ids: readonly string[], path: string): asserts ids is readonly WeaponId[] {
  if (ids.length !== CANONICAL_FINAL_FIVE_WEAPON_IDS.length) throw new TypeError(`${path} must contain exactly the Final Five roster`);
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new TypeError(`${path} must not contain duplicate weapon IDs`);
  for (const retired of RETIRED_WEAPON_IDS) {
    if (unique.has(retired)) throw new TypeError(`${path} contains retired weapon ID ${retired}`);
  }
  for (const id of CANONICAL_FINAL_FIVE_WEAPON_IDS) {
    if (!unique.has(id)) throw new TypeError(`${path} is missing canonical weapon ID ${id}`);
  }
}

function assertCanonicalRosterOrder(ids: readonly string[], path: string): asserts ids is readonly WeaponId[] {
  assertExactRoster(ids, path);
  if (ids.some((id, index) => id !== CANONICAL_FINAL_FIVE_WEAPON_IDS[index])) throw new TypeError(`${path} must use canonical Final Five order`);
}

function validateProjectedWeapon(value: unknown, path: string): GameReferenceWeaponV1 {
  const source = record(value, path);
  exactKeys(source, path, [
    "id", "name", "model", "playstyle", "description", "blurb", "mechanics", "tags", "weaknesses",
    "throwIdentity", "ratings", "throwCollisionPad", "channels", "tuning",
  ]);
  const id = text(source.id, `${path}.id`);
  if (isRetiredWeaponSelection(id)) throw new TypeError(`${path}.id ${id} is retired and cannot be active`);
  if (!CANONICAL_FINAL_FIVE_WEAPON_IDS.includes(id as WeaponId)) throw new TypeError(`${path}.id ${id} is not an active Final Five weapon`);
  return Object.freeze({
    id: id as WeaponId,
    name: text(source.name, `${path}.name`),
    model: text(source.model, `${path}.model`),
    playstyle: text(source.playstyle, `${path}.playstyle`),
    description: text(source.description, `${path}.description`),
    blurb: text(source.blurb, `${path}.blurb`),
    mechanics: stringList(source.mechanics, `${path}.mechanics`),
    tags: stringList(source.tags, `${path}.tags`),
    weaknesses: stringList(source.weaknesses, `${path}.weaknesses`),
    throwIdentity: text(source.throwIdentity, `${path}.throwIdentity`),
    ratings: ratings(source.ratings as WeaponRatings, `${path}.ratings`),
    throwCollisionPad: finite(source.throwCollisionPad, `${path}.throwCollisionPad`),
    channels: channels(source.channels as WeaponChannels, `${path}.channels`),
    tuning: tuning(source.tuning, `${path}.tuning`),
  });
}

function validateProjectedUpgrade(value: unknown, path: string): GameReferenceUpgradeV1 {
  const source = record(value, path);
  exactKeys(source, path, ["id", "name", "category", "description", "unique", "rare", "maxStacks", "rule", "tiers"]);
  const id = text(source.id, `${path}.id`);
  const category = text(source.category, `${path}.category`) as UpgradeCategory;
  if (!UPGRADE_CATEGORIES.includes(category)) throw new TypeError(`${path}.category is not a supported upgrade category`);
  const unique = boolean(source.unique, `${path}.unique`);
  const rare = boolean(source.rare, `${path}.rare`);
  const maxStacks = source.maxStacks === null ? null : finite(source.maxStacks, `${path}.maxStacks`);
  if (maxStacks !== null && (!Number.isInteger(maxStacks) || maxStacks < 1)) throw new RangeError(`${path}.maxStacks must be a positive integer or null`);
  const rule = record(source.rule, `${path}.rule`);
  exactKeys(rule, `${path}.rule`, ["kind"]);
  const kind = text(rule.kind, `${path}.rule.kind`) as GameReferenceUpgradeRuleKind;
  if (!["stackable", "unique", "tiered"].includes(kind)) throw new TypeError(`${path}.rule.kind is not a supported upgrade rule`);
  const tiersValue = source.tiers;
  if (!Array.isArray(tiersValue)) throw new TypeError(`${path}.tiers must be an array`);
  const tiers = Object.freeze(tiersValue.map((tier, index) => {
    const item = record(tier, `${path}.tiers[${String(index)}]`);
    exactKeys(item, `${path}.tiers[${String(index)}]`, ["description"]);
    return Object.freeze({ description: text(item.description, `${path}.tiers[${String(index)}].description`) });
  }));
  const expectedKind: GameReferenceUpgradeRuleKind = tiers.length > 0 ? "tiered" : unique ? "unique" : "stackable";
  if (kind !== expectedKind) throw new TypeError(`${path}.rule.kind does not match its authored metadata`);
  if (kind === "stackable" && maxStacks === null && unique) throw new TypeError(`${path}.stackable rule cannot be unique`);
  return Object.freeze({
    id,
    name: text(source.name, `${path}.name`),
    category,
    description: text(source.description, `${path}.description`),
    unique,
    rare,
    maxStacks,
    rule: Object.freeze({ kind }),
    tiers,
  });
}

function validateProjectedAchievement(value: unknown, path: string): GameReferenceAchievementV1 {
  const source = record(value, path);
  exactKeys(source, path, ["id", "category", "rarity", "name", "description", "hidden", "manual", "master", "rule"]);
  const rule = record(source.rule, `${path}.rule`);
  exactKeys(rule, `${path}.rule`, ["kind", "stat", "goal", "category"]);
  const kind = text(rule.kind, `${path}.rule.kind`) as GameReferenceAchievementRuleKind;
  if (!["stat-threshold", "manual", "all-shop-items", "category-complete", "all-achievements"].includes(kind)) throw new TypeError(`${path}.rule.kind is not a supported achievement rule`);
  const category = text(source.category, `${path}.category`) as AchievementCategory;
  if (!ACHIEVEMENT_CATEGORIES.includes(category)) throw new TypeError(`${path}.category is not a supported achievement category`);
  const rarity = text(source.rarity, `${path}.rarity`) as AchievementRarity;
  if (!ACHIEVEMENT_RARITIES.includes(rarity)) throw new TypeError(`${path}.rarity is not a supported achievement rarity`);
  const stat = rule.stat === null ? null : text(rule.stat, `${path}.rule.stat`);
  const goal = rule.goal === null ? null : finite(rule.goal, `${path}.rule.goal`);
  const ruleCategory = rule.category === null ? null : text(rule.category, `${path}.rule.category`) as AchievementCategory;
  if (ruleCategory !== null && !ACHIEVEMENT_CATEGORIES.includes(ruleCategory)) throw new TypeError(`${path}.rule.category is not a supported achievement category`);
  const manual = boolean(source.manual, `${path}.manual`);
  if (kind === "stat-threshold" && (stat === null || goal === null || ruleCategory !== null)) throw new TypeError(`${path}.stat-threshold requires stat and goal with null category`);
  if (kind === "category-complete" && (stat !== null || goal !== null || ruleCategory === null)) throw new TypeError(`${path}.category-complete requires category with null stat and goal`);
  if (kind !== "stat-threshold" && kind !== "category-complete" && (stat !== null || goal !== null || ruleCategory !== null)) throw new TypeError(`${path}.rule ${kind} requires null stat, goal, and category`);
  if (kind === "manual" && !manual) throw new TypeError(`${path}.manual rule must be marked manual`);
  if (kind !== "manual" && manual) throw new TypeError(`${path}.manual flag is only valid for manual rules`);
  return Object.freeze({
    id: text(source.id, `${path}.id`),
    category,
    rarity,
    name: text(source.name, `${path}.name`),
    description: text(source.description, `${path}.description`),
    hidden: boolean(source.hidden, `${path}.hidden`),
    manual,
    master: boolean(source.master, `${path}.master`),
    rule: Object.freeze({ kind, stat, goal, category: ruleCategory }),
  });
}

function projectWeapon(source: WeaponDefinition, tuningByWeapon: GameReferenceProjectionInput["tuningByWeapon"]): GameReferenceWeaponV1 {
  const id = text(source.id, "weapon.id");
  if (isRetiredWeaponSelection(id)) throw new TypeError(`weapon ${id} is retired and cannot be active`);
  if (!CANONICAL_FINAL_FIVE_WEAPON_IDS.includes(id as WeaponId)) throw new TypeError(`weapon ${id} is not an active Final Five weapon`);
  const weaponTuning = tuningByWeapon[id];
  if (weaponTuning === undefined) throw new TypeError(`missing public tuning for weapon ${id}`);
  return validateProjectedWeapon({
    id: id as WeaponId,
    name: text(source.name, `weapon ${id}.name`),
    model: text(source.model, `weapon ${id}.model`),
    playstyle: text(source.playstyle, `weapon ${id}.playstyle`),
    description: text(source.description, `weapon ${id}.description`),
    blurb: text(source.blurb, `weapon ${id}.blurb`),
    mechanics: stringList(source.mechanics, `weapon ${id}.mechanics`),
    tags: stringList(source.tags, `weapon ${id}.tags`),
    weaknesses: stringList(source.weaknesses, `weapon ${id}.weaknesses`),
    throwIdentity: text(source.throwIdentity, `weapon ${id}.throwIdentity`),
    ratings: ratings(source.ratings, `weapon ${id}.ratings`),
    throwCollisionPad: finite(source.throwCollisionPad, `weapon ${id}.throwCollisionPad`),
    channels: channels(source.channels, `weapon ${id}.channels`),
    tuning: tuning(weaponTuning, `weapon ${id}.tuning`),
  }, `weapon ${id}`);
}

/** Builds a reference without touching runtime callbacks, browser globals, or mutable state. */
export function buildGameReferenceV1(input: GameReferenceProjectionInput): GameReferenceV1 {
  const repository = text(input.repository, "repository");
  if (repository !== GAME_REFERENCE_REPOSITORY) throw new TypeError(`repository must be ${GAME_REFERENCE_REPOSITORY}`);
  const sourceSha = fullSha(input.sourceSha, "sourceSha");
  const terminologyVersion = text(input.terminologyVersion, "terminologyVersion");
  if (terminologyVersion !== GAME_REFERENCE_TERMINOLOGY_VERSION) throw new TypeError(`terminologyVersion must be ${GAME_REFERENCE_TERMINOLOGY_VERSION}`);
  const ids = input.weapons.map((weapon) => text(weapon.id, "weapon.id"));
  assertExactRoster(ids, "weapons");
  const byId = new Map(input.weapons.map((weapon) => [weapon.id, weapon] as const));
  if (byId.size !== input.weapons.length) throw new TypeError("weapons must not contain duplicate definitions");
  const weapons = Object.freeze(CANONICAL_FINAL_FIVE_WEAPON_IDS.map((id) => {
    const weapon = byId.get(id);
    if (weapon === undefined) throw new TypeError(`missing canonical weapon definition ${id}`);
    return projectWeapon(weapon, input.tuningByWeapon);
  }));
  const upgradeIds = input.upgrades.map((upgrade, index) => text(upgrade.id, `upgrade[${String(index)}].id`));
  assertCanonicalSourceIds(upgradeIds, CANONICAL_UPGRADE_IDS, "upgrades");
  const upgradesById = new Map(input.upgrades.map((upgrade) => [upgrade.id, upgrade] as const));
  const upgrades = Object.freeze(CANONICAL_UPGRADE_IDS.map((id, index) => {
    const upgrade = upgradesById.get(id);
    if (upgrade === undefined) throw new TypeError(`missing canonical upgrade definition ${id}`);
    return projectUpgrade(upgrade, `upgrade[${String(index)}]`);
  }));
  const achievementIds = input.achievements.map((achievement, index) => text(achievement.id, `achievement[${String(index)}].id`));
  assertCanonicalSourceIds(achievementIds, CANONICAL_ACHIEVEMENT_IDS, "achievements");
  const achievementsById = new Map(input.achievements.map((achievement) => [achievement.id, achievement] as const));
  const achievements = Object.freeze(CANONICAL_ACHIEVEMENT_IDS.map((id, index) => {
    const achievement = achievementsById.get(id);
    if (achievement === undefined) throw new TypeError(`missing canonical achievement definition ${id}`);
    return projectAchievement(achievement, `achievement[${String(index)}]`);
  }));
  const enemies = projectEnemyReference({
    enemyFamilies: input.enemyFamilies,
    enemyAffixes: input.enemyAffixes,
    enemyPresets: input.enemyPresets,
  });
  const bosses = projectBossReference({ bossDefinitions: input.bossDefinitions, stages: input.stages });
  const stageIds = input.stages.map((stage, index) => text(stage.id, `stage[${String(index)}].id`));
  assertCanonicalSourceIds(stageIds, STAGE_IDS, "stages");
  const stagesById = new Map(input.stages.map((stage) => [stage.id, stage] as const));
  const stages = Object.freeze(STAGE_IDS.map((id, index) => {
    const stage = stagesById.get(id);
    if (stage === undefined) throw new TypeError(`missing canonical stage definition ${id}`);
    return projectStage(stage, `stage[${String(index)}]`);
  }));
  const modeIds = input.modes.map((mode, index) => text(mode.id, `mode[${String(index)}].id`));
  assertCanonicalSourceIds(modeIds, MODE_IDS, "modes");
  const modesById = new Map(input.modes.map((mode) => [mode.id, mode] as const));
  const modes = Object.freeze(MODE_IDS.map((id, index) => {
    const mode = modesById.get(id);
    if (mode === undefined) throw new TypeError(`missing canonical mode definition ${id}`);
    return projectMode(mode, `mode[${String(index)}]`);
  }));
  const reference: GameReferenceV1 = Object.freeze({
    format: GAME_REFERENCE_FORMAT,
    schemaVersion: GAME_REFERENCE_SCHEMA_VERSION,
    source: Object.freeze({ repository, sha: sourceSha }),
    terminologyVersion,
    roster: Object.freeze({
      id: "final-five",
      schemaVersion: FINAL_FIVE_WEAPON_SCHEMA_VERSION,
      activeWeaponIds: Object.freeze([...CANONICAL_FINAL_FIVE_WEAPON_IDS]),
      retiredWeaponIds: Object.freeze([...RETIRED_WEAPON_IDS]),
    }),
    collections: Object.freeze({
      weapons: Object.freeze({ status: "complete", items: weapons }),
      upgrades: Object.freeze({ status: "complete", items: upgrades }),
      enemies: Object.freeze({ status: "complete", items: enemies }),
      bosses: Object.freeze({ status: "complete", items: bosses }),
      stages: Object.freeze({ status: "complete", items: stages }),
      modes: Object.freeze({ status: "complete", items: modes }),
      achievements: Object.freeze({ status: "complete", items: achievements }),
      "public-tuning": Object.freeze({ status: "deferred", reason: DEFERRED_COLLECTION_REASONS["public-tuning"] }),
    }),
  });
  assertValidGameReferenceV1(reference);
  return reference;
}

/** Rejects a generated artifact that was produced from a different source tree. */
export function assertCurrentSourceSha(reference: Pick<GameReferenceV1, "source">, expectedSha: string): void {
  const expected = fullSha(expectedSha, "expectedSha");
  if (reference.source.sha !== expected) throw new Error(`stale game reference: expected ${expected}, received ${reference.source.sha}`);
}

/** Validates an imported reference before a consumer trusts it. */
export function assertValidGameReferenceV1(value: unknown): asserts value is GameReferenceV1 {
  const source = record(value, "gameReference");
  exactKeys(source, "gameReference", ["format", "schemaVersion", "source", "terminologyVersion", "roster", "collections"]);
  if (source.format !== GAME_REFERENCE_FORMAT || source.schemaVersion !== GAME_REFERENCE_SCHEMA_VERSION) throw new TypeError("unsupported game-reference.v1 schema");
  const sourceInfo = record(source.source, "gameReference.source");
  exactKeys(sourceInfo, "gameReference.source", ["repository", "sha"]);
  if (text(sourceInfo.repository, "gameReference.source.repository") !== GAME_REFERENCE_REPOSITORY) throw new TypeError(`gameReference source repository must be ${GAME_REFERENCE_REPOSITORY}`);
  fullSha(sourceInfo.sha, "gameReference.source.sha");
  if (text(source.terminologyVersion, "gameReference.terminologyVersion") !== GAME_REFERENCE_TERMINOLOGY_VERSION) throw new TypeError(`gameReference terminologyVersion must be ${GAME_REFERENCE_TERMINOLOGY_VERSION}`);
  const roster = record(source.roster, "gameReference.roster");
  exactKeys(roster, "gameReference.roster", ["id", "schemaVersion", "activeWeaponIds", "retiredWeaponIds"]);
  if (roster.id !== "final-five" || roster.schemaVersion !== FINAL_FIVE_WEAPON_SCHEMA_VERSION) throw new TypeError("gameReference roster schema is not final-five-v1");
  const activeIds = stringList(roster.activeWeaponIds, "gameReference.roster.activeWeaponIds", CANONICAL_FINAL_FIVE_WEAPON_IDS.length);
  assertCanonicalRosterOrder(activeIds, "gameReference.roster.activeWeaponIds");
  const retiredIds = stringList(roster.retiredWeaponIds, "gameReference.roster.retiredWeaponIds", RETIRED_WEAPON_IDS.length);
  if (retiredIds.length !== RETIRED_WEAPON_IDS.length || retiredIds.some((id, index) => id !== RETIRED_WEAPON_IDS[index])) throw new TypeError("gameReference retired roster is not canonical");
  const collections = record(source.collections, "gameReference.collections");
  exactKeys(collections, "gameReference.collections", ["weapons", "upgrades", "enemies", "bosses", "stages", "modes", "achievements", "public-tuning"]);
  const weaponsCollection = completeCollection(collections.weapons, "gameReference.collections.weapons", validateProjectedWeapon);
  const projectedWeapons = weaponsCollection.items;
  const weaponIds = projectedWeapons.map((weapon) => weapon.id);
  assertCanonicalRosterOrder(weaponIds, "gameReference.collections.weapons.items");
  const upgradesCollection = completeCollection(collections.upgrades, "gameReference.collections.upgrades", validateProjectedUpgrade);
  assertUniqueCount(upgradesCollection.items.map((upgrade) => upgrade.id), EXPECTED_UPGRADE_COUNT, "gameReference.collections.upgrades.items");
  assertCanonicalOrderedIds(upgradesCollection.items.map((upgrade) => upgrade.id), CANONICAL_UPGRADE_IDS, "gameReference.collections.upgrades.items");
  const achievementsCollection = completeCollection(collections.achievements, "gameReference.collections.achievements", validateProjectedAchievement);
  assertUniqueCount(achievementsCollection.items.map((achievement) => achievement.id), EXPECTED_ACHIEVEMENT_COUNT, "gameReference.collections.achievements.items");
  assertCanonicalOrderedIds(achievementsCollection.items.map((achievement) => achievement.id), CANONICAL_ACHIEVEMENT_IDS, "gameReference.collections.achievements.items");
  const stagesCollection = completeCollection(collections.stages, "gameReference.collections.stages", validateProjectedStage);
  assertUniqueCount(stagesCollection.items.map((stage) => stage.id), EXPECTED_STAGE_COUNT, "gameReference.collections.stages.items");
  assertCanonicalOrderedIds(stagesCollection.items.map((stage) => stage.id), STAGE_IDS, "gameReference.collections.stages.items");
  const modesCollection = completeCollection(collections.modes, "gameReference.collections.modes", validateProjectedMode);
  assertUniqueCount(modesCollection.items.map((mode) => mode.id), MODE_IDS.length, "gameReference.collections.modes.items");
  assertCanonicalOrderedIds(modesCollection.items.map((mode) => mode.id), MODE_IDS, "gameReference.collections.modes.items");
  if (modesCollection.items.some((mode, index) => mode.order !== index)) throw new TypeError("gameReference.collections.modes.items must use canonical authored order");
  const enemiesCollection = record(collections.enemies, "gameReference.collections.enemies");
  exactKeys(enemiesCollection, "gameReference.collections.enemies", ["status", "items"]);
  if (enemiesCollection.status !== "complete") throw new TypeError("gameReference.collections.enemies must be a complete collection");
  validateProjectedEnemies(enemiesCollection.items, "gameReference.collections.enemies.items");
  const bossesCollection = record(collections.bosses, "gameReference.collections.bosses");
  exactKeys(bossesCollection, "gameReference.collections.bosses", ["status", "items"]);
  if (bossesCollection.status !== "complete" || !Array.isArray(bossesCollection.items)) throw new TypeError("gameReference.collections.bosses must be a complete collection");
  validateProjectedBosses(bossesCollection.items, "gameReference.collections.bosses.items");
  assertBossStageConsistency(stagesCollection.items, bossesCollection.items);
  deferredCollection(collections["public-tuning"], "gameReference.collections.public-tuning");
  canonicalStringify(value);
}

/** Stable canonical JSON for files, hashes, and deterministic tests. */
export function encodeGameReferenceV1(reference: GameReferenceV1): string {
  assertValidGameReferenceV1(reference);
  return `${canonicalStringify(reference)}\n`;
}
