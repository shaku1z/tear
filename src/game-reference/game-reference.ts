import { canonicalStringify } from "../replay/hash";
import { FINAL_FIVE_WEAPON_SCHEMA_VERSION, isRetiredWeaponSelection, WEAPON_IDS, type WeaponId } from "../gameplay/weapon-selection";
import type { WeaponChannels, WeaponDefinition, WeaponRatings } from "../gameplay/weapons";

/** The game-owned, data-only handoff consumed by future external tooling. */
export const GAME_REFERENCE_FORMAT = "game-reference.v1" as const;
export const GAME_REFERENCE_SCHEMA_VERSION = 1 as const;
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

export interface DeferredGameReferenceCollectionV1 {
  readonly id: string;
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
    weapons: Readonly<{ status: "complete"; items: readonly GameReferenceWeaponV1[] }>;
  }>;
  readonly deferredCollections: readonly DeferredGameReferenceCollectionV1[];
}

export interface GameReferenceProjectionInput {
  readonly repository: string;
  readonly sourceSha: string;
  readonly terminologyVersion: string;
  readonly weapons: readonly WeaponDefinition[];
  readonly tuningByWeapon: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

const DEFERRED_COLLECTIONS: readonly DeferredGameReferenceCollectionV1[] = Object.freeze([
  Object.freeze({ id: "upgrades", status: "deferred", reason: "No complete data-only projection is selected in G6 slice 1." }),
  Object.freeze({ id: "enemies", status: "deferred", reason: "Enemy behavior definitions still include runtime constructors and hooks." }),
  Object.freeze({ id: "bosses", status: "deferred", reason: "Boss definitions require a separate data-only projection boundary." }),
  Object.freeze({ id: "stages", status: "deferred", reason: "Stage generation and hazards are not yet represented by a stable data-only contract." }),
  Object.freeze({ id: "modes", status: "deferred", reason: "Mode availability is assembled through application/runtime composition." }),
  Object.freeze({ id: "achievements", status: "deferred", reason: "Achievement definitions include runtime predicates and are not exported here." }),
  Object.freeze({ id: "public-tuning", status: "deferred", reason: "Only flat weapon tuning is safe to project in this foundation slice." }),
]);
const DEFERRED_COLLECTION_IDS = Object.freeze(DEFERRED_COLLECTIONS.map((entry) => entry.id));

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
    collections: Object.freeze({ weapons: Object.freeze({ status: "complete", items: weapons }) }),
    deferredCollections: DEFERRED_COLLECTIONS,
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
  exactKeys(source, "gameReference", ["format", "schemaVersion", "source", "terminologyVersion", "roster", "collections", "deferredCollections"]);
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
  exactKeys(collections, "gameReference.collections", ["weapons"]);
  const weaponsCollection = record(collections.weapons, "gameReference.collections.weapons");
  exactKeys(weaponsCollection, "gameReference.collections.weapons", ["status", "items"]);
  if (weaponsCollection.status !== "complete" || !Array.isArray(weaponsCollection.items)) throw new TypeError("gameReference weapon collection is incomplete");
  const projectedWeapons = weaponsCollection.items.map((weapon, index) => validateProjectedWeapon(weapon, `gameReference.collections.weapons.items[${String(index)}]`));
  const weaponIds = projectedWeapons.map((weapon) => weapon.id);
  assertCanonicalRosterOrder(weaponIds, "gameReference.collections.weapons.items");
  const deferred = source.deferredCollections;
  if (!Array.isArray(deferred)) throw new TypeError("gameReference.deferredCollections must be an array");
  const deferredIds: string[] = [];
  for (const [index, entry] of deferred.entries()) {
    const item = record(entry, `gameReference.deferredCollections[${String(index)}]`);
    exactKeys(item, `gameReference.deferredCollections[${String(index)}]`, ["id", "status", "reason"]);
    text(item.id, `gameReference.deferredCollections[${String(index)}].id`);
    if (item.status !== "deferred") throw new TypeError("gameReference deferred collection has an invalid status");
    text(item.reason, `gameReference.deferredCollections[${String(index)}].reason`);
    const id = item.id as string;
    if (deferredIds.includes(id)) throw new TypeError(`gameReference deferred collection ${id} is duplicated`);
    if (!DEFERRED_COLLECTION_IDS.includes(id)) throw new TypeError(`gameReference deferred collection ${id} is not canonical`);
    deferredIds.push(id);
  }
  if (deferredIds.length !== DEFERRED_COLLECTION_IDS.length || deferredIds.some((id, index) => id !== DEFERRED_COLLECTION_IDS[index])) throw new TypeError("gameReference deferred collections are incomplete or out of order");
  canonicalStringify(value);
}

/** Stable canonical JSON for files, hashes, and deterministic tests. */
export function encodeGameReferenceV1(reference: GameReferenceV1): string {
  assertValidGameReferenceV1(reference);
  return `${canonicalStringify(reference)}\n`;
}
