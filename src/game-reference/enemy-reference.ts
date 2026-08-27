import { ENEMY_KIND_IDS, type ActiveEnemyKind } from "../gameplay/run/content-director";
import type { EnemyAffix, EnemyPreset } from "../gameplay/affixes";
import type { EnemyVariant } from "../gameplay/variants";

/** The structural enemy catalog handoff; runtime behavior remains out of scope. */
export interface GameReferenceEnemyVariantV1 {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly minWave: number | null;
}

export interface GameReferenceEnemyFamilyV1 {
  readonly id: ActiveEnemyKind;
  readonly variants: readonly GameReferenceEnemyVariantV1[];
}

export interface GameReferenceEnemyAffixV1 {
  readonly id: string;
  readonly color: string;
}

export interface GameReferenceEnemyPresetV1 {
  readonly familyId: ActiveEnemyKind;
  readonly affixIds: readonly string[];
}

export interface GameReferenceEnemiesV1 {
  readonly families: readonly GameReferenceEnemyFamilyV1[];
  readonly affixes: readonly GameReferenceEnemyAffixV1[];
  readonly presets: readonly GameReferenceEnemyPresetV1[];
}

export interface EnemyReferenceFamilySource {
  readonly id: ActiveEnemyKind;
  readonly variants: readonly EnemyVariant[];
}

export interface EnemyReferenceProjectionInput {
  readonly enemyFamilies: readonly EnemyReferenceFamilySource[];
  readonly enemyAffixes: readonly EnemyAffix[];
  readonly enemyPresets: readonly EnemyPreset[];
}

/** Explicit contract signatures keep source reordering fail-closed. */
export const CANONICAL_ENEMY_KIND_IDS = Object.freeze([
  "charger", "ranged", "flyer", "bomber", "armored",
  "priest", "mender", "herald", "anchor", "wraith", "chimera",
] as const);

export const CANONICAL_ENEMY_VARIANT_IDS: Readonly<Record<ActiveEnemyKind, readonly string[]>> = Object.freeze({
  charger: Object.freeze(["bull", "brawler", "stalker", "executioner", "gravedigger", "duelist", "briar-stalker"]),
  ranged: Object.freeze(["sentinel", "rifleman", "marksman", "warlock", "chain", "seedcaster"]),
  flyer: Object.freeze(["swooper", "divebomber", "highdiver", "canopy-diver"]),
  bomber: Object.freeze(["lobber", "juggler", "trapper", "sludge", "geomancer"]),
  armored: Object.freeze(["bark-sentinel"]),
  priest: Object.freeze([]),
  mender: Object.freeze([]),
  herald: Object.freeze([]),
  anchor: Object.freeze([]),
  wraith: Object.freeze([]),
  chimera: Object.freeze([]),
});

export const CANONICAL_ENEMY_AFFIX_IDS = Object.freeze([
  "tank", "swift", "rapid", "volley", "armed", "warded",
] as const);

export interface EnemyPresetSignatureV1 {
  readonly familyId: ActiveEnemyKind;
  readonly affixIds: readonly string[];
}

export const CANONICAL_ENEMY_PRESETS: readonly EnemyPresetSignatureV1[] = Object.freeze([
  Object.freeze({ familyId: "ranged", affixIds: Object.freeze(["rapid", "volley"]) }),
  Object.freeze({ familyId: "charger", affixIds: Object.freeze(["tank", "armed"]) }),
  Object.freeze({ familyId: "armored", affixIds: Object.freeze(["warded", "tank"]) }),
]);

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
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) throw new TypeError(`${path} has unexpected or missing fields`);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${path} must be a finite number`);
  return value;
}

function positive(value: unknown, path: string): number {
  const result = finite(value, path);
  if (!(result > 0)) throw new RangeError(`${path} must be positive`);
  return result;
}

function safePositiveInteger(value: unknown, path: string): number {
  const result = positive(value, path);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${path} must be a safe positive integer`);
  return result;
}

function booleanFunction(value: unknown, path: string): void {
  if (typeof value !== "function") throw new TypeError(`${path} must be a function in the runtime source`);
}

function hexColor(value: unknown, path: string): string {
  const color = text(value, path);
  if (!/^#[0-9a-fA-F]{6}$/u.test(color)) throw new TypeError(`${path} must be a six-digit hex color`);
  return color;
}

function stringIds(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  const result = value.map((entry, index) => text(entry, `${path}[${String(index)}]`));
  if (new Set(result).size !== result.length) throw new TypeError(`${path} must not contain duplicate IDs`);
  return Object.freeze(result);
}

function assertCanonicalOrderedIds(actual: readonly string[], expected: readonly string[], path: string): void {
  if (new Set(actual).size !== actual.length) throw new TypeError(`${path} must not contain duplicate IDs`);
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new TypeError(`${path} must use the exact canonical authored order`);
  }
}

function expectedAt<T>(values: readonly T[], index: number, path: string): T {
  const value = values[index];
  if (value === undefined) throw new TypeError(`${path}[${String(index)}] is missing from the canonical signature`);
  return value;
}

function assertEnemyKindContract(): void {
  assertCanonicalOrderedIds(ENEMY_KIND_IDS, CANONICAL_ENEMY_KIND_IDS, "ENEMY_KIND_IDS");
}

assertEnemyKindContract();

function validateProjectedVariant(value: unknown, expectedId: string, path: string): GameReferenceEnemyVariantV1 {
  const source = record(value, path);
  exactKeys(source, path, ["id", "name", "weight", "minWave"]);
  const id = text(source.id, `${path}.id`);
  if (id !== expectedId) throw new TypeError(`${path}.id must use the exact canonical variant order`);
  const minWave = source.minWave === null ? null : safePositiveInteger(source.minWave, `${path}.minWave`);
  return Object.freeze({ id, name: text(source.name, `${path}.name`), weight: positive(source.weight, `${path}.weight`), minWave });
}

function validateSourceVariant(value: unknown, expectedId: string, path: string): GameReferenceEnemyVariantV1 {
  const source = record(value, path);
  const hasMinWave = source.minWave !== undefined;
  exactKeys(source, path, hasMinWave ? ["id", "name", "weight", "minWave", "apply"] : ["id", "name", "weight", "apply"]);
  const id = text(source.id, `${path}.id`);
  if (id !== expectedId) throw new TypeError(`${path}.id must use the exact canonical variant order`);
  booleanFunction(source.apply, `${path}.apply`);
  const minWave = hasMinWave ? safePositiveInteger(source.minWave, `${path}.minWave`) : null;
  return validateProjectedVariant({ id, name: source.name, weight: source.weight, minWave }, expectedId, path);
}

function projectFamily(sourceValue: unknown, expectedId: ActiveEnemyKind, path: string): GameReferenceEnemyFamilyV1 {
  const source = record(sourceValue, path);
  exactKeys(source, path, ["id", "variants"]);
  const id = text(source.id, `${path}.id`);
  if (id !== expectedId) throw new TypeError(`${path}.id must use the exact canonical enemy-family order`);
  if (!Array.isArray(source.variants)) throw new TypeError(`${path}.variants must be an array`);
  const expectedVariantIds = CANONICAL_ENEMY_VARIANT_IDS[expectedId];
  const variantIds = source.variants.map((variant, index) => text(record(variant, `${path}.variants[${String(index)}]`).id, `${path}.variants[${String(index)}].id`));
  assertCanonicalOrderedIds(variantIds, expectedVariantIds, `${path}.variants`);
  const variants = Object.freeze(source.variants.map((variant, index) => validateSourceVariant(variant, expectedAt(expectedVariantIds, index, `${path}.variants`), `${path}.variants[${String(index)}]`)));
  return Object.freeze({ id: expectedId, variants });
}

function projectAffix(sourceValue: unknown, expectedId: string, path: string): GameReferenceEnemyAffixV1 {
  const source = record(sourceValue, path);
  exactKeys(source, path, ["id", "color", "appliesTo", "apply"]);
  const id = text(source.id, `${path}.id`);
  if (id !== expectedId) throw new TypeError(`${path}.id must use the exact canonical affix order`);
  booleanFunction(source.appliesTo, `${path}.appliesTo`);
  booleanFunction(source.apply, `${path}.apply`);
  return Object.freeze({ id, color: hexColor(source.color, `${path}.color`) });
}

function projectPreset(sourceValue: unknown, expected: EnemyPresetSignatureV1, path: string): GameReferenceEnemyPresetV1 {
  const source = record(sourceValue, path);
  exactKeys(source, path, ["type", "affixes"]);
  const familyId = text(source.type, `${path}.type`);
  if (familyId !== expected.familyId) throw new TypeError(`${path}.type must use the exact canonical preset order`);
  const affixIds = stringIds(source.affixes, `${path}.affixes`);
  assertCanonicalOrderedIds(affixIds, expected.affixIds, `${path}.affixes`);
  return Object.freeze({ familyId: expected.familyId, affixIds });
}

/** Projects only enemy IDs and authored structural metadata; callbacks are never copied. */
export function projectEnemyReference(input: EnemyReferenceProjectionInput): GameReferenceEnemiesV1 {
  assertEnemyKindContract();
  if (!Array.isArray(input.enemyFamilies)) throw new TypeError("enemyFamilies must be an array");
  const familyIds = input.enemyFamilies.map((family, index) => text(record(family, `enemyFamilies[${String(index)}]`).id, `enemyFamilies[${String(index)}].id`));
  assertCanonicalOrderedIds(familyIds, CANONICAL_ENEMY_KIND_IDS, "enemyFamilies");
  const families = Object.freeze(input.enemyFamilies.map((family, index) => projectFamily(family, expectedAt(CANONICAL_ENEMY_KIND_IDS, index, "enemyFamilies"), `enemyFamilies[${String(index)}]`)));

  if (!Array.isArray(input.enemyAffixes)) throw new TypeError("enemyAffixes must be an array");
  const affixIds = input.enemyAffixes.map((affix, index) => text(record(affix, `enemyAffixes[${String(index)}]`).id, `enemyAffixes[${String(index)}].id`));
  assertCanonicalOrderedIds(affixIds, CANONICAL_ENEMY_AFFIX_IDS, "enemyAffixes");
  const affixes = Object.freeze(input.enemyAffixes.map((affix, index) => projectAffix(affix, expectedAt(CANONICAL_ENEMY_AFFIX_IDS, index, "enemyAffixes"), `enemyAffixes[${String(index)}]`)));

  if (!Array.isArray(input.enemyPresets)) throw new TypeError("enemyPresets must be an array");
  const presetFamilies = input.enemyPresets.map((preset, index) => text(record(preset, `enemyPresets[${String(index)}]`).type, `enemyPresets[${String(index)}].type`));
  assertCanonicalOrderedIds(presetFamilies, CANONICAL_ENEMY_PRESETS.map((preset) => preset.familyId), "enemyPresets");
  const presets = Object.freeze(input.enemyPresets.map((preset, index) => projectPreset(preset, expectedAt(CANONICAL_ENEMY_PRESETS, index, "enemyPresets"), `enemyPresets[${String(index)}]`)));

  return validateProjectedEnemies({ families, affixes, presets }, "gameReference.collections.enemies.items");
}

/** Strictly validates an imported, data-only enemy catalog and returns a frozen copy. */
export function validateProjectedEnemies(value: unknown, path: string): GameReferenceEnemiesV1 {
  const source = record(value, path);
  exactKeys(source, path, ["families", "affixes", "presets"]);

  if (!Array.isArray(source.families)) throw new TypeError(`${path}.families must be an array`);
  const familyIds = source.families.map((family, index) => text(record(family, `${path}.families[${String(index)}]`).id, `${path}.families[${String(index)}].id`));
  assertCanonicalOrderedIds(familyIds, CANONICAL_ENEMY_KIND_IDS, `${path}.families`);
  const families = Object.freeze(source.families.map((family, index) => {
    const item = record(family, `${path}.families[${String(index)}]`);
    exactKeys(item, `${path}.families[${String(index)}]`, ["id", "variants"]);
    const id = expectedAt(CANONICAL_ENEMY_KIND_IDS, index, `${path}.families`);
    if (!Array.isArray(item.variants)) throw new TypeError(`${path}.families[${String(index)}].variants must be an array`);
    const expectedVariantIds = CANONICAL_ENEMY_VARIANT_IDS[id];
    const variantIds = item.variants.map((variant, variantIndex) => text(record(variant, `${path}.families[${String(index)}].variants[${String(variantIndex)}]`).id, `${path}.families[${String(index)}].variants[${String(variantIndex)}].id`));
    assertCanonicalOrderedIds(variantIds, expectedVariantIds, `${path}.families[${String(index)}].variants`);
    const variants = Object.freeze(item.variants.map((variant, variantIndex) => validateProjectedVariant(variant, expectedAt(expectedVariantIds, variantIndex, `${path}.families[${String(index)}].variants`), `${path}.families[${String(index)}].variants[${String(variantIndex)}]`)));
    return Object.freeze({ id, variants });
  }));

  if (!Array.isArray(source.affixes)) throw new TypeError(`${path}.affixes must be an array`);
  const affixIds = source.affixes.map((affix, index) => text(record(affix, `${path}.affixes[${String(index)}]`).id, `${path}.affixes[${String(index)}].id`));
  assertCanonicalOrderedIds(affixIds, CANONICAL_ENEMY_AFFIX_IDS, `${path}.affixes`);
  const affixes = Object.freeze(source.affixes.map((affix, index) => {
    const item = record(affix, `${path}.affixes[${String(index)}]`);
    exactKeys(item, `${path}.affixes[${String(index)}]`, ["id", "color"]);
    return Object.freeze({ id: expectedAt(CANONICAL_ENEMY_AFFIX_IDS, index, `${path}.affixes`), color: hexColor(item.color, `${path}.affixes[${String(index)}].color`) });
  }));

  if (!Array.isArray(source.presets)) throw new TypeError(`${path}.presets must be an array`);
  const presetFamilies = source.presets.map((preset, index) => text(record(preset, `${path}.presets[${String(index)}]`).familyId, `${path}.presets[${String(index)}].familyId`));
  const expectedPresetFamilies = CANONICAL_ENEMY_PRESETS.map((preset) => preset.familyId);
  assertCanonicalOrderedIds(presetFamilies, expectedPresetFamilies, `${path}.presets`);
  const presets = Object.freeze(source.presets.map((preset, index) => {
    const item = record(preset, `${path}.presets[${String(index)}]`);
    exactKeys(item, `${path}.presets[${String(index)}]`, ["familyId", "affixIds"]);
    const expected = expectedAt(CANONICAL_ENEMY_PRESETS, index, `${path}.presets`);
    const ids = stringIds(item.affixIds, `${path}.presets[${String(index)}].affixIds`);
    assertCanonicalOrderedIds(ids, expected.affixIds, `${path}.presets[${String(index)}].affixIds`);
    return Object.freeze({ familyId: expected.familyId, affixIds: ids });
  }));

  return Object.freeze({ families, affixes, presets });
}
