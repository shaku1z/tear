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
  MAX_OWNED,
  MAX_PRICE,
  SLOT_GROUPS,
  type Acquisition,
  type CosmeticCatalog,
  type CosmeticItem,
  type Look,
  type LookFamily,
  type ParamSpec,
} from "./cosmetic-types";
import { ITEM_ID, REFERENCE_ID } from "./identifiers";
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
      return Number.isInteger(value) && (value as number) >= spec.min && (value as number) <= spec.max
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
      return typeof value === "string" && ITEM_ID.test(value) ? [] : [`${key} must be a lowercase id`];
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

function acquireProblems(entries: readonly Acquisition[], where: string): string[] {
  if (!Array.isArray(entries) || entries.length === 0) return [`${where}: acquire must list at least one way`];
  return entries.flatMap((entry) => {
    const how = (entry as { how?: unknown }).how;
    if (how === "shards") return [];
    if (typeof how === "string" && (ACQUIRE_KINDS_WITH_ID as readonly string[]).includes(how))
      return ITEM_ID.test((entry as { id?: string }).id ?? "") ? [] : [`${where}: acquire ${how} needs an id`];
    if (how === "code")
      return ITEM_ID.test((entry as { campaign?: string }).campaign ?? "")
        ? []
        : [`${where}: acquire code needs a campaign`];
    return [`${where}: unknown acquire kind`];
  });
}

function itemProblems(item: CosmeticItem, catalog: CosmeticCatalog, backdrops: ReadabilityBackdrops): string[] {
  const where = item.id;
  const slot = catalog.slots.find((entry) => entry.id === item.slot);
  const family = catalog.families.find((entry) => entry.id === slot?.family);
  const problems: string[] = [];
  if (!ITEM_ID.test(item.id)) problems.push(`${where}: id must be lowercase letters, digits and underscores`);
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
    if (!ITEM_ID.test(step.counter) || !Number.isInteger(step.at) || step.at <= previous)
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
    if (!REFERENCE_ID.test(family.id) || Object.keys(family.params).length === 0)
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
    if (!ITEM_ID.test(tier.id) || !Number.isSafeInteger(tier.price) || tier.price < 0 || tier.price > MAX_PRICE)
      problems.push(`tier ${tier.id}: price must be a whole number 0 to ${String(MAX_PRICE)}`);
  for (const slot of catalog.slots) {
    const family = catalog.families.find((entry) => entry.id === slot.family);
    if (
      !ITEM_ID.test(slot.id) ||
      slot.label.trim() === "" ||
      !(SLOT_GROUPS as readonly string[]).includes(slot.group) ||
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
    if (!ITEM_ID.test(collection.id) || collection.name.trim() === "") problems.push(`${where}: invalid id or name`);
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

/**
 * The one loader of the data files. It validates every row and throws with the full problem list, so a
 * catalog that exists is a catalog that passed.
 */
export function parseCosmeticCatalog(raw: RawCosmeticCatalog, backdrops: ReadabilityBackdrops): CosmeticCatalog {
  const catalog = raw as CosmeticCatalog;
  const problems = Object.values(raw).every(Array.isArray)
    ? validateCosmeticCatalog(catalog, backdrops)
    : ["every cosmetic data file must be a list"];
  if (problems.length > 0) throw new Error(["Invalid cosmetic data:", ...problems].join("\n"));
  return catalog;
}

/** The largest record a player can produce, in characters: every cap reached at once. Must fit MAX_STATE_CHARS. */
export function worstCaseStateSize(catalog: CosmeticCatalog): number {
  const id = "x".repeat(MAX_LOADOUT_NAME);
  const owned = Object.fromEntries(
    Array.from({ length: MAX_OWNED }, (_, index) => [`${id}${String(index)}`, MAX_PRICE]),
  );
  const slots = Object.fromEntries(catalog.slots.map((slot) => [slot.id, { id, at: 1_800_000_000_000 }]));
  const loadouts = Object.fromEntries(
    Array.from({ length: MAX_LOADOUTS }, (_, index) => [
      `loadout_${String(index)}`,
      { name: "x".repeat(MAX_LOADOUT_NAME), nameAt: 1_800_000_000_000, slots },
    ]),
  );
  return JSON.stringify({
    v: 1,
    owned,
    seen: owned,
    counters: owned,
    loadouts,
    active: { id: "loadout_0", at: 1_800_000_000_000 },
  }).length;
}
