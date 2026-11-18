/**
 * The one validator for the cosmetic data files. It reads families as data, so a new slot, family
 * parameter or item needs no new checking code: slots name a family, families list their parameters and
 * ranges, items give a look, and every row is checked the same way.
 *
 * Safety rules enforced here for every item: colours stay readable against the real stage backdrops,
 * combat looks avoid the red/orange enemy-tell band, every parameter stays inside its family's budget
 * (which bounds particle counts, alpha, widths and pulse rates, and keeps flashes at or below
 * MAX_FLASHES_PER_SECOND), each family has a calm look for reduced motion, and the saved record fits its size budget.
 */
import { colourProblem, isHexColor, type ReadabilityBackdrops } from "./cosmetic-readability";
import {
  ACQUIRE_KINDS_WITH_ID,
  MAX_FLASHES_PER_SECOND,
  MAX_LOADOUT_NAME,
  MAX_LOADOUTS,
  MAX_PRICE,
  SLOT_GROUPS,
  COSMETIC_STATE_VERSION,
  type Acquisition,
  type CosmeticCatalog,
  type CosmeticItem,
  type Look,
  type LookFamily,
  type ParamSpec,
} from "./cosmetic-types";
import { isItemId, isReferenceId, MAX_ID_LENGTH } from "./identifiers";
import { isRecord } from "./records";
import { conditionProblems } from "./unlock-condition";

interface LookOptions {
  /** Backdrops to check readable colours against; omitted for defaults, which are the game's own look. */
  readonly backdrops?: ReadabilityBackdrops;
  readonly rejectTell: boolean;
  /** A calm look or an evolution step only overrides some parameters. */
  readonly partial: boolean;
}

function paramProblem(key: string, spec: ParamSpec, value: unknown, options: LookOptions): string[] {
  const colour = (hex: unknown, readable: boolean | undefined): string[] => {
    if (typeof hex !== "string") return [`${key} must be a #rrggbb colour`];
    if (!readable || !options.backdrops)
      return isHexColor(hex) ? [] : [`${key}: "${String(hex)}" is not a #rrggbb colour`];
    const problem = colourProblem(hex, options.backdrops, options.rejectTell);
    return problem ? [`${key}: ${problem}`] : [];
  };
  switch (spec.type) {
    case "color":
      return colour(value, spec.readable);
    case "colors":
      if (!Array.isArray(value) || value.length < spec.min || value.length > spec.max)
        return [`${key} must list ${String(spec.min)} to ${String(spec.max)} colours`];
      return value.flatMap((entry: unknown) => colour(entry, spec.readable));
    case "number":
      return typeof value === "number" && Number.isFinite(value) && value >= spec.min && value <= spec.max
        ? []
        : [`${key} must be a number from ${String(spec.min)} to ${String(spec.max)}`];
    case "int":
      return typeof value === "number" && Number.isInteger(value) && value >= spec.min && value <= spec.max
        ? []
        : [`${key} must be a whole number from ${String(spec.min)} to ${String(spec.max)}`];
    case "enum":
      return typeof value === "string" && spec.values.includes(value)
        ? []
        : [`${key} must be one of ${spec.values.join(", ")}`];
    case "text":
      return typeof value === "string" &&
        value.length >= spec.min &&
        value.length <= spec.max &&
        /^[A-Za-z0-9 '&.\-★✦◆✶❈]+$/u.test(value)
        ? []
        : [`${key} must be ${String(spec.min)} to ${String(spec.max)} plain characters`];
    case "id":
      return isItemId(value) ? [] : [`${key} must be a lowercase id`];
  }
}

export function lookProblems(look: Look, family: LookFamily, where: string, options: LookOptions): string[] {
  if (!isRecord(look)) return [`${where}: look must be an object`];
  const problems: string[] = [];
  for (const key of Object.keys(look))
    if (!(key in family.params)) problems.push(`${where}: look key "${key}" is not allowed on ${family.id}`);
  for (const [key, spec] of Object.entries(family.params)) {
    if (!(key in look)) {
      if (!options.partial) problems.push(`${where}: look is missing "${key}"`);
      continue;
    }
    problems.push(...paramProblem(key, spec, look[key], options).map((message) => `${where}: ${message}`));
  }
  return problems;
}

/** Whether a closed list of names holds the value, without widening the list's type. */
const listed = (names: readonly string[], value: unknown): boolean => names.some((name) => name === value);

function acquireProblems(entries: readonly Acquisition[], where: string): string[] {
  if (entries.length === 0) return [`${where}: acquire must list at least one way`];
  return entries.flatMap((entry: unknown) => {
    if (!isRecord(entry)) return [`${where}: each acquire entry must be an object`];
    const how = entry.how;
    if (how === "shards") return [];
    if (typeof how === "string" && listed(ACQUIRE_KINDS_WITH_ID, how))
      return isItemId(entry.id) ? [] : [`${where}: acquire ${how} needs an id`];
    if (how === "code") return isItemId(entry.campaign) ? [] : [`${where}: acquire code needs a campaign`];
    return [`${where}: unknown acquire kind`];
  });
}

function itemProblems(item: CosmeticItem, catalog: CosmeticCatalog, backdrops: ReadabilityBackdrops): string[] {
  const where = item.id;
  const slot = catalog.slots.find((entry) => entry.id === item.slot);
  const family = catalog.families.find((entry) => entry.id === slot?.family);
  const problems: string[] = [];
  if (!isItemId(item.id)) problems.push(`${where}: id must be lowercase letters, digits and underscores`);
  if (item.name.trim() === "" || /\s\d+$/u.test(item.name))
    problems.push(`${where}: needs a real name, not a numbered stand-in`);
  if (!slot || !family) return [...problems, `${where}: unknown slot ${item.slot}`];
  if (!catalog.tiers.some((tier) => tier.id === item.tier)) problems.push(`${where}: unknown tier ${item.tier}`);
  problems.push(...acquireProblems(item.acquire, where));
  if (item.collection !== undefined && !catalog.collections.some((entry) => entry.id === item.collection))
    problems.push(`${where}: unknown collection ${item.collection}`);
  if (item.unlock) problems.push(...conditionProblems(item.unlock, where));
  const rejectTell = slot.group === "combat";
  problems.push(...lookProblems(item.look, family, where, { backdrops, rejectTell, partial: false }));
  if (item.asset !== undefined && !catalog.assets.includes(item.asset))
    problems.push(`${where}: asset ${item.asset} is not in the manifest`);
  let previous = 0;
  for (const step of item.evolves ?? []) {
    if (!isItemId(step.counter) || !Number.isInteger(step.at) || step.at <= previous)
      problems.push(`${where}: evolution steps need a counter id and rising "at"`);
    previous = step.at;
    problems.push(...lookProblems(step.look, family, `${where} evolution`, { backdrops, rejectTell, partial: true }));
  }
  return problems;
}

/** Every reason the catalog is invalid, over every row. Empty means valid. */
export function validateCosmeticCatalog(catalog: CosmeticCatalog, backdrops: ReadabilityBackdrops): string[] {
  const problems: string[] = [];
  const unique = (ids: readonly string[], label: string): void => {
    if (new Set(ids).size !== ids.length) problems.push(`duplicate ${label} id`);
  };
  unique(
    catalog.slots.map((entry) => entry.id),
    "slot",
  );
  unique(
    catalog.families.map((entry) => entry.id),
    "family",
  );
  unique(
    catalog.tiers.map((entry) => entry.id),
    "tier",
  );
  unique(
    catalog.collections.map((entry) => entry.id),
    "collection",
  );
  unique(
    catalog.items.map((entry) => entry.id),
    "item",
  );

  for (const family of catalog.families) {
    if (!isReferenceId(family.id) || Object.keys(family.params).length === 0)
      problems.push(`family ${family.id}: needs an id and parameters`);
    for (const [key, spec] of Object.entries(family.params)) {
      if (spec.type === "number" && spec.unit === "per-second" && spec.max > MAX_FLASHES_PER_SECOND)
        problems.push(`family ${family.id}: ${key} may not exceed ${String(MAX_FLASHES_PER_SECOND)} per second`);
    }
    problems.push(
      ...lookProblems(family.calm, family, `family ${family.id} calm look`, { rejectTell: false, partial: true }),
    );
  }
  for (const tier of catalog.tiers)
    if (!isItemId(tier.id) || !Number.isSafeInteger(tier.price) || tier.price < 0 || tier.price > MAX_PRICE)
      problems.push(`tier ${tier.id}: price must be a whole number 0 to ${String(MAX_PRICE)}`);
  for (const slot of catalog.slots) {
    const family = catalog.families.find((entry) => entry.id === slot.family);
    if (
      !isItemId(slot.id) ||
      slot.label.trim() === "" ||
      !listed(SLOT_GROUPS, slot.group) ||
      !["ready", "not yet"].includes(slot.hook)
    )
      problems.push(`slot ${slot.id}: invalid id, label, group or hook`);
    if (!family) problems.push(`slot ${slot.id}: unknown family ${slot.family}`);
    else
      problems.push(
        ...lookProblems(slot.default, family, `slot ${slot.id} default`, { rejectTell: false, partial: false }),
      );
  }
  for (const collection of catalog.collections) {
    const where = `collection ${collection.id}`;
    if (!isItemId(collection.id) || collection.name.trim() === "") problems.push(`${where}: invalid id or name`);
    problems.push(...conditionProblems(collection.unlock, where));
    if (collection.reward !== undefined) {
      const reward = catalog.items.find((entry) => entry.id === collection.reward);
      if (reward?.collection !== collection.id || !reward.acquire.some((entry) => entry.how === "collection"))
        problems.push(`${where}: reward must be an item of this collection acquired by "collection"`);
    }
  }
  for (const item of catalog.items) problems.push(...itemProblems(item, catalog, backdrops));
  return problems;
}

/** The data files as imported: arrays of rows whose shape the validator, not the compiler, vouches for. */
export type RawCosmeticCatalog = { readonly [Key in keyof CosmeticCatalog]: readonly unknown[] };

const FIELD_KINDS = ["string", "number", "boolean", "record", "list"] as const;
type FieldKind = (typeof FIELD_KINDS)[number];
/** A row's fields and their kinds; a trailing "?" marks an optional field. */
type RowShape = Readonly<Record<string, FieldKind | `${FieldKind}?`>>;

/** What every row of each data file must look like before the rules above may read its fields. */
const ROW_SHAPES: Readonly<Record<Exclude<keyof CosmeticCatalog, "assets">, RowShape>> = {
  slots: { id: "string", label: "string", group: "string", family: "string", hook: "string", default: "record" },
  families: { id: "string", params: "record", calm: "record" },
  tiers: { id: "string", price: "number" },
  collections: { id: "string", name: "string", unlock: "record", reward: "string?" },
  items: {
    id: "string",
    slot: "string",
    name: "string",
    tier: "string",
    acquire: "list",
    look: "record",
    collection: "string?",
    unlock: "record?",
    asset: "string?",
    evolves: "list?",
  },
};
/** The fields each kind of family parameter needs, beyond its `type`. */
const PARAM_SHAPES: Readonly<Record<ParamSpec["type"], RowShape>> = {
  color: { readable: "boolean?" },
  colors: { min: "number", max: "number", readable: "boolean?" },
  number: { min: "number", max: "number", unit: "string?" },
  int: { min: "number", max: "number" },
  enum: { values: "list" },
  text: { min: "number", max: "number" },
  id: {},
};
const EVOLUTION_SHAPE: RowShape = { counter: "string", at: "number", look: "record" };

function isKind(value: unknown, kind: FieldKind): boolean {
  switch (kind) {
    case "record":
      return isRecord(value);
    case "list":
      return Array.isArray(value);
    default:
      return typeof value === kind;
  }
}

/** Every way a value differs from a shape: not an object, a required field missing, a field of the wrong kind. */
function shapeProblems(value: unknown, shape: RowShape, where: string): string[] {
  if (!isRecord(value)) return [`${where}: must be an object`];
  return Object.entries(shape).flatMap(([key, spelled]) => {
    const optional = spelled.endsWith("?");
    const kind = FIELD_KINDS.find((entry) => entry === (optional ? spelled.slice(0, -1) : spelled)) ?? "record";
    if (value[key] === undefined) return optional ? [] : [`${where}: missing ${key}`];
    return isKind(value[key], kind) ? [] : [`${where}: ${key} must be a ${kind}`];
  });
}

const rowName = (file: string, row: unknown, index: number): string =>
  `${file} ${isRecord(row) && typeof row.id === "string" ? row.id : `row ${String(index + 1)}`}`;

/** The entry of a table keyed by name, read from data without widening the name. */
const entryNamed = <T>(table: Readonly<Record<string, T>>, name: string): T | undefined =>
  Object.entries(table).find(([key]) => key === name)?.[1];

/** Shape problems inside a row that passed its own shape: family parameters and evolution steps. */
function nestedProblems(file: string, row: Record<string, unknown>, where: string): string[] {
  if (file === "families" && isRecord(row.params))
    return Object.entries(row.params).flatMap(([key, spec]) => {
      const at = `${where} parameter ${key}`;
      if (!isRecord(spec) || typeof spec.type !== "string") return [`${at}: needs a type`];
      const fields = entryNamed(PARAM_SHAPES, spec.type);
      return fields ? shapeProblems(spec, fields, at) : [`${at}: unknown type ${spec.type}`];
    });
  if (file === "items" && Array.isArray(row.evolves))
    return row.evolves.flatMap((step: unknown, index) =>
      shapeProblems(step, EVOLUTION_SHAPE, `${where} evolution ${String(index + 1)}`),
    );
  return [];
}

/** Every row of every file checked against its shape. Empty means the rules can read every field safely. */
function catalogShapeProblems(raw: RawCosmeticCatalog): string[] {
  const problems: string[] = [];
  for (const [file, rows] of Object.entries(raw)) {
    if (!Array.isArray(rows)) {
      problems.push(`${file}: must be a list`);
      continue;
    }
    const shape = entryNamed(ROW_SHAPES, file);
    rows.forEach((row: unknown, index) => {
      const where = rowName(file, row, index);
      if (!shape) {
        if (typeof row !== "string") problems.push(`${where}: must be a string`);
        return;
      }
      const own = shapeProblems(row, shape, where);
      problems.push(...own);
      if (own.length === 0 && isRecord(row)) problems.push(...nestedProblems(file, row, where));
    });
  }
  return problems;
}

/**
 * The one loader of the data files. It checks every row's shape, then every rule, and throws with the full
 * problem list, so a catalog that exists is a catalog that passed. A malformed row is a listed problem,
 * never a bare TypeError.
 */
export function parseCosmeticCatalog(raw: RawCosmeticCatalog, backdrops: ReadabilityBackdrops): CosmeticCatalog {
  const problems = catalogShapeProblems(raw);
  // Once the shapes pass, every row has the fields and kinds `CosmeticCatalog` declares; the rules check values.
  const catalog = raw as CosmeticCatalog;
  if (problems.length === 0) problems.push(...validateCosmeticCatalog(catalog, backdrops));
  if (problems.length > 0) throw new Error(["Invalid cosmetic data:", ...problems].join("\n"));
  return catalog;
}

/** A time later than any real save time, so the worst case is never shorter than a real record. */
const LATEST_PLAUSIBLE_TIME = 9_999_999_999_999;

/**
 * The largest cosmetic record this catalog allows, in characters. It must fit MAX_STATE_CHARS.
 *
 * Owned ids are never dropped, so the bound is the catalog, not MAX_OWNED (which only refuses a purchase).
 * The worst case is every item owned, seen and counted, plus MAX_LOADOUTS loadouts with every slot filled.
 * Every value is at its longest: the highest price, the latest plausible time, the largest counter, ids at
 * MAX_ID_LENGTH where a player chooses them, and loadout names that each escape to six characters in JSON.
 *
 * An id from a newer client's catalog is kept too. That build checks its own catalog's worst case, so
 * holding its items fits the same budget.
 */
export function worstCaseStateSize(catalog: CosmeticCatalog): number {
  const items = catalog.items.map((item) => item.id);
  const longestItem = items.reduce((longest, id) => (id.length > longest.length ? id : longest), "");
  const at = LATEST_PLAUSIBLE_TIME;
  const every = (value: number) => Object.fromEntries(items.map((id) => [id, value]));
  const slots = Object.fromEntries(catalog.slots.map((slot) => [slot.id, { id: longestItem, at }]));
  const loadoutId = (index: number) => `${String(index)}_`.padEnd(MAX_ID_LENGTH, "x");
  const loadouts = Object.fromEntries(
    Array.from({ length: MAX_LOADOUTS }, (_, index) => [
      loadoutId(index),
      { name: "\u0001".repeat(MAX_LOADOUT_NAME), nameAt: at, deletedAt: at, slots },
    ]),
  );
  return JSON.stringify({
    v: COSMETIC_STATE_VERSION,
    owned: every(MAX_PRICE),
    seen: every(at),
    counters: every(Number.MAX_SAFE_INTEGER),
    loadouts,
    active: { id: loadoutId(0), at },
  }).length;
}
