import { DIFFICULTY_CATALOG, DIFFICULTY_IDS, type DifficultyDefinition, type DifficultyId, type DifficultyModifiers } from "../gameplay/run/difficulty-catalog";

export const PUBLIC_TUNING_SCHEMA_VERSION = 1 as const;

export interface GameReferenceDifficultyV1 {
  readonly id: DifficultyId;
  readonly label: string;
  readonly description: string;
  readonly oneHit: boolean;
  readonly modifiers: Readonly<DifficultyModifiers>;
}

export interface GameReferencePublicTuningV1 {
  readonly schemaVersion: typeof PUBLIC_TUNING_SCHEMA_VERSION;
  readonly difficultyCatalog: readonly GameReferenceDifficultyV1[];
}

const MODIFIER_KEYS = Object.freeze([
  "enemyHealth",
  "playerDamageTaken",
  "enemyCount",
  "coinReward",
  "scoreReward",
] as const);

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, path: string, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new TypeError(`${path} has unexpected or missing fields`);
  }
}

function exactOrderedKeys(value: Record<string, unknown>, path: string, expected: readonly string[]): void {
  exactKeys(value, path, expected);
  if (Object.keys(value).some((key, index) => key !== expected[index])) throw new TypeError(`${path} has non-canonical field order`);
}

function finitePositive(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new TypeError(`${path} must be a positive finite number`);
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function assertDifficultyMatchesExpected(value: unknown, expected: DifficultyDefinition, path: string): void {
  const source = record(value, path);
  exactOrderedKeys(source, path, ["id", "label", "description", "oneHit", "modifiers"]);
  if (source.id !== expected.id) throw new TypeError(`${path}.id is not in canonical authored order`);
  if (source.label !== expected.label) throw new TypeError(`${path}.label does not match authored difficulty ${expected.id}`);
  if (source.description !== expected.description) throw new TypeError(`${path}.description does not match authored difficulty ${expected.id}`);
  if (boolean(source.oneHit, `${path}.oneHit`) !== expected.oneHit) throw new TypeError(`${path}.oneHit does not match authored difficulty ${expected.id}`);
  const modifiers = record(source.modifiers, `${path}.modifiers`);
  exactOrderedKeys(modifiers, `${path}.modifiers`, MODIFIER_KEYS);
  for (const key of MODIFIER_KEYS) {
    const valueAtKey = finitePositive(modifiers[key], `${path}.modifiers.${key}`);
    if (valueAtKey !== expected.modifiers[key]) throw new TypeError(`${path}.modifiers.${key} does not match authored difficulty ${expected.id}`);
  }
}

function assertDifficultyCatalog(value: unknown, path: string): readonly GameReferenceDifficultyV1[] {
  if (!Array.isArray(value) || value.length !== DIFFICULTY_CATALOG.length) {
    throw new TypeError(`${path} must contain exactly ${String(DIFFICULTY_CATALOG.length)} authored difficulties`);
  }
  value.forEach((entry, index) => {
    const expected = DIFFICULTY_CATALOG[index];
    if (expected === undefined) throw new TypeError(`${path}[${String(index)}] has no canonical authored counterpart`);
    assertDifficultyMatchesExpected(entry, expected, `${path}[${String(index)}]`);
  });
  const ids = value.map((entry) => record(entry, path).id);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== DIFFICULTY_IDS[index])) {
    throw new TypeError(`${path} must use the canonical authored difficulty order without duplicates`);
  }
  return value as readonly GameReferenceDifficultyV1[];
}

/** Project only the authored difficulty values into the public reference contract. */
export function projectPublicTuning(difficulties: readonly DifficultyDefinition[]): GameReferencePublicTuningV1 {
  assertDifficultyCatalog(difficulties, "difficultyCatalog");
  const difficultyCatalog = Object.freeze(difficulties.map((difficulty) => Object.freeze({
    id: difficulty.id,
    label: difficulty.label,
    description: difficulty.description,
    oneHit: difficulty.oneHit,
    modifiers: Object.freeze({
      enemyHealth: difficulty.modifiers.enemyHealth,
      playerDamageTaken: difficulty.modifiers.playerDamageTaken,
      enemyCount: difficulty.modifiers.enemyCount,
      coinReward: difficulty.modifiers.coinReward,
      scoreReward: difficulty.modifiers.scoreReward,
    }),
  })));
  return Object.freeze({ schemaVersion: PUBLIC_TUNING_SCHEMA_VERSION, difficultyCatalog });
}

/** Strictly validate an imported public tuning value against the current authored catalog. */
export function assertValidPublicTuning(value: unknown, path = "publicTuning"): asserts value is GameReferencePublicTuningV1 {
  const source = record(value, path);
  exactOrderedKeys(source, path, ["schemaVersion", "difficultyCatalog"]);
  if (source.schemaVersion !== PUBLIC_TUNING_SCHEMA_VERSION) throw new TypeError(`${path}.schemaVersion is unsupported`);
  assertDifficultyCatalog(source.difficultyCatalog, `${path}.difficultyCatalog`);
}
