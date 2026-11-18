/**
 * The asset manifest (config/asset-manifest.json): every asset the game draws, one row each, keyed by an asset
 * id in the same format Shards items use to name art. This module reads it, checks it against the game's
 * registries and turns its rows into the scenes `pnpm assets:sheets` runs.
 *
 * A row names a category and the registry entry it draws (`subject`). Each category has one registry here and
 * one stager in ./page/stagers.ts, so adding the next enemy, boss or stage object is one row, and adding a new
 * kind of thing (Shards cosmetics) is a category row, a registry line and a stager.
 *
 * Pure data (no DOM): the unit test, the page and the command all use it.
 */
import RAW_MANIFEST from "../../config/asset-manifest.json";
import { PROJECTILE_FAMILIES } from "../../src/gameplay/entities/projectile";
import { ROOTBOUND_MOVES } from "../../src/gameplay/entities/enemy-types/rootbound-moves";
import { ENVIRONMENT_OBJECT_KIND_IDS } from "../../src/gameplay/environment/environment-object-kinds";
import { BOSS_DEFINITIONS, BOSS_PHASE_ORDINALS } from "../../src/gameplay/run/boss-definitions";
import { ENEMY_HOME_STAGE, ENEMY_IDENTITY_IDS } from "../../src/gameplay/run/content-director";
import {
  PLAYGROUND_RUNTIME_STAGE_IDS,
  STAGE_BOSS_HOME,
  STAGE_DISPLAY_NAMES,
  type StageId,
} from "../../src/gameplay/stages";
import { VARIANTS, variantHomeStage } from "../../src/gameplay/variants";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";

export const MANIFEST_SCHEMA = "tear-asset-manifest.v1";
/** How each kind of scene is staged; each has one stager in ./page/stagers.ts. */
export const STAGER_KINDS = ["player", "weapon", "enemy", "boss", "stage"] as const;
export type StagerKind = (typeof STAGER_KINDS)[number];
const BUDGET_KEYS = ["svgBytes", "pngBytes", "png3xBytes"] as const;
export type FileBudget = Readonly<Record<(typeof BUDGET_KEYS)[number], number>>;

export type ManifestCategory = Readonly<{
  id: string;
  about: string;
  /** null: no scenes of its own; pictured when another scene shows it (stage objects, projectiles). */
  stager: StagerKind | null;
  seconds: number;
  variantSeconds: number;
  sources: readonly string[];
}>;
export type ManifestRow = Readonly<{
  id: string;
  category: string;
  subject: string;
  name?: string;
  sources: readonly string[];
  allies: readonly string[];
  seconds?: number;
  budget: Partial<FileBudget>;
}>;
export type AssetManifest = Readonly<{
  idPattern: RegExp;
  budget: FileBudget & Readonly<{ totalBytes: number }>;
  categories: readonly ManifestCategory[];
  rows: readonly ManifestRow[];
}>;

/** One asset as the sheets write it: a manifest row, or an enemy variant derived from its enemy's row. */
export type SheetAsset = Readonly<{
  id: string;
  category: string;
  subject: string;
  name: string;
  sources: readonly string[];
  budget: FileBudget;
}>;
export type SceneSetup =
  | Readonly<{ kind: "player"; weaponId: string }>
  | Readonly<{ kind: "weapon"; weaponId: string }>
  | Readonly<{ kind: "enemy"; enemyId: string; variantId?: string; allies: readonly string[] }>
  | Readonly<{ kind: "boss"; bossId: string; phase: 1 | 2 | 3 }>
  | Readonly<{ kind: "stage" }>;
/** One deterministic run of the real game that the sheets take pictures of. */
export type SheetScene = Readonly<{
  id: string;
  category: string;
  /** The asset id the scene's own pictures belong to. */
  asset: string;
  name: string;
  /** Files that draw the asset. A change to them (or what they import) draws the scene again. */
  sources: readonly string[];
  stageId: string;
  /** Simulated seconds to watch (120 ticks each). */
  seconds: number;
  setup: SceneSetup;
}>;

/** The ids each category's rows must cover, from the game's registries. */
const REGISTRIES: Readonly<Record<string, () => readonly string[]>> = {
  player: () => WEAPON_IDS,
  weapons: () => WEAPON_IDS,
  enemies: () => ENEMY_IDENTITY_IDS,
  bosses: () => BOSS_DEFINITIONS.map((boss) => boss.id),
  "stage-objects": () => ENVIRONMENT_OBJECT_KIND_IDS,
  platforms: () => PLAYGROUND_RUNTIME_STAGE_IDS,
  projectiles: () => PROJECTILE_FAMILIES.map((family) => family.id),
};

const DEFAULT_STAGE: string = PLAYGROUND_RUNTIME_STAGE_IDS[0] ?? "grounds";
/** "white-hart" becomes "White Hart", "groundShock" becomes "Ground Shock". */
export const title = (id: string): string =>
  id
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/(^|[- ])([a-z])/giu, (_, gap: string, letter: string) => (gap ? " " : "") + letter.toUpperCase());
const snake = (id: string): string =>
  id
    .replace(/([a-z])([A-Z])/gu, "$1_$2")
    .replace(/-/gu, "_")
    .toLowerCase();

// Reading the JSON: each reader notes a problem and returns a safe value, so one bad row reports every fault.
type Fields = Readonly<Record<string, unknown>>;
const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function reader(problems: string[]) {
  const fields = (value: unknown, where: string): Fields => {
    if (isFields(value)) return value;
    problems.push(`${where} must be an object`);
    return {};
  };
  const text = (value: unknown, where: string): string => {
    if (typeof value === "string" && value !== "") return value;
    problems.push(`${where} must be a non-empty string`);
    return "";
  };
  const positive = (value: unknown, where: string): number => {
    if (typeof value === "number" && value > 0) return value;
    problems.push(`${where} must be a positive number`);
    return 1;
  };
  const texts = (value: unknown, where: string): readonly string[] => {
    if (value === undefined) return [];
    if (Array.isArray(value)) return value.map((item, index) => text(item, `${where}[${String(index)}]`));
    problems.push(`${where} must be a list of strings`);
    return [];
  };
  const list = (value: unknown, where: string): readonly unknown[] => {
    if (Array.isArray(value)) return value;
    problems.push(`${where} must be a list`);
    return [];
  };
  return { fields, text, positive, texts, list };
}

/** Reads and checks a manifest. Problems are sentences that say which row is wrong and why. */
export function readManifest(raw: unknown): { manifest: AssetManifest; problems: string[] } {
  const problems: string[] = [];
  const read = reader(problems);
  const top = read.fields(raw, "the manifest");
  if (top.schema !== MANIFEST_SCHEMA) problems.push(`schema must be "${MANIFEST_SCHEMA}"`);
  const idPattern = new RegExp(read.text(top.idPattern, "idPattern"), "u");
  const budgetFields = read.fields(top.budget, "budget");
  const budget = {
    svgBytes: read.positive(budgetFields.svgBytes, "budget.svgBytes"),
    pngBytes: read.positive(budgetFields.pngBytes, "budget.pngBytes"),
    png3xBytes: read.positive(budgetFields.png3xBytes, "budget.png3xBytes"),
    totalBytes: read.positive(budgetFields.totalBytes, "budget.totalBytes"),
  };
  const categories = read.list(top.categories, "categories").map((value, index): ManifestCategory => {
    const where = `categories[${String(index)}]`;
    const entry = read.fields(value, where);
    const id = read.text(entry.id, `${where}.id`);
    const stager = STAGER_KINDS.find((kind) => kind === entry.stager) ?? null;
    if (entry.stager !== null && stager === null)
      problems.push(`category ${id}: unknown stager ${JSON.stringify(entry.stager)}`);
    if (REGISTRIES[id] === undefined)
      problems.push(`category ${id} has no registry in scripts/asset-sheets/manifest.ts`);
    return {
      id,
      about: read.text(entry.about, `category ${id}.about`),
      stager,
      seconds: stager === null ? 0 : read.positive(entry.seconds, `category ${id}.seconds`),
      variantSeconds:
        entry.variantSeconds === undefined ? 0 : read.positive(entry.variantSeconds, `${id}.variantSeconds`),
      sources: read.texts(entry.sources, `category ${id}.sources`),
    };
  });
  const rows = read.list(top.assets, "assets").map((value, index): ManifestRow => {
    const entry = read.fields(value, `assets[${String(index)}]`);
    const id = read.text(entry.id, `assets[${String(index)}].id`);
    const budgetOverride = read.fields(entry.budget ?? {}, `asset ${id}.budget`);
    for (const key of Object.keys(budgetOverride))
      if (!BUDGET_KEYS.some((known) => known === key)) problems.push(`asset ${id}: unknown budget ${key}`);
    return {
      id,
      category: read.text(entry.category, `asset ${id}.category`),
      subject: read.text(entry.subject, `asset ${id}.subject`),
      ...(entry.name === undefined ? {} : { name: read.text(entry.name, `asset ${id}.name`) }),
      sources: read.texts(entry.sources, `asset ${id}.sources`),
      allies: read.texts(entry.allies, `asset ${id}.allies`),
      ...(entry.seconds === undefined ? {} : { seconds: read.positive(entry.seconds, `asset ${id}.seconds`) }),
      budget: Object.fromEntries(
        BUDGET_KEYS.filter((key) => budgetOverride[key] !== undefined).map((key) => [
          key,
          read.positive(budgetOverride[key], `asset ${id}.budget.${key}`),
        ]),
      ),
    };
  });
  const manifest: AssetManifest = { idPattern, budget, categories, rows };
  problems.push(...coverageProblems(manifest));
  return { manifest, problems };
}

/** Every registry entry has exactly one row, every row draws a registry entry, and every id is unique. */
function coverageProblems(manifest: AssetManifest): string[] {
  const problems: string[] = [];
  const known = new Set(manifest.categories.map((category) => category.id));
  for (const row of manifest.rows) {
    if (!known.has(row.category)) problems.push(`asset ${row.id}: unknown category ${row.category}`);
    for (const ally of row.allies)
      if (!ENEMY_IDENTITY_IDS.some((enemy) => enemy === ally)) problems.push(`asset ${row.id}: unknown ally ${ally}`);
  }
  for (const category of manifest.categories) {
    const subjects = manifest.rows.filter((row) => row.category === category.id).map((row) => row.subject);
    const registry = REGISTRIES[category.id]?.() ?? [];
    for (const subject of registry)
      if (!subjects.includes(subject))
        problems.push(`${category.id}: "${subject}" has no row; add one to the manifest`);
    for (const subject of subjects) {
      if (!registry.includes(subject)) problems.push(`${category.id}: "${subject}" is not in the game's registry`);
      if (subjects.indexOf(subject) !== subjects.lastIndexOf(subject))
        problems.push(`${category.id}: "${subject}" has more than one row`);
    }
  }
  const ids = sheetAssets(manifest).map((asset) => asset.id);
  for (const id of new Set(ids)) {
    if (!manifest.idPattern.test(id)) problems.push(`asset id ${id} does not match ${manifest.idPattern.source}`);
    if (ids.indexOf(id) !== ids.lastIndexOf(id)) problems.push(`asset id ${id} is used more than once`);
  }
  return problems;
}

const categoryOf = (manifest: AssetManifest, id: string): ManifestCategory | undefined =>
  manifest.categories.find((category) => category.id === id);
const variantsOf = (row: ManifestRow, category: ManifestCategory | undefined) =>
  category?.stager === "enemy" ? (VARIANTS[row.subject] ?? []) : [];
const variantId = (row: ManifestRow, variant: string): string => `${row.id}_${snake(variant)}`;

function defaultName(row: ManifestRow, category: ManifestCategory | undefined): string {
  if (category?.stager === "player") return `Player holding the ${title(row.subject)}`;
  if (category?.stager === "boss") return BOSS_DEFINITIONS.find((boss) => boss.id === row.subject)?.name ?? row.subject;
  if (category?.stager === "stage")
    return `${(STAGE_DISPLAY_NAMES as Readonly<Record<string, string>>)[row.subject] ?? row.subject} platforms and floor`;
  return title(row.subject);
}

/** Every asset the sheets write: each row, and for an enemy row each of its variants. */
export function sheetAssets(manifest: AssetManifest): readonly SheetAsset[] {
  return manifest.rows.flatMap((row) => {
    const category = categoryOf(manifest, row.category);
    const name = row.name ?? defaultName(row, category);
    const sources = [...(category?.sources ?? []), ...row.sources];
    const budget = { ...manifest.budget, ...row.budget };
    const own: SheetAsset = { id: row.id, category: row.category, subject: row.subject, name, sources, budget };
    const variants = variantsOf(row, category).map((variant): SheetAsset => ({
      ...own,
      id: variantId(row, variant.id),
      name: `${variant.name} (${name} variant)`,
    }));
    return [own, ...variants];
  });
}

function bossHome(bossId: string): string {
  return Object.entries(STAGE_BOSS_HOME).find(([, boss]) => boss === bossId)?.[0] ?? DEFAULT_STAGE;
}

/** The scenes of one row, as its category's stager runs them. */
function rowScenes(manifest: AssetManifest, row: ManifestRow): SheetScene[] {
  const category = categoryOf(manifest, row.category);
  const stager = category?.stager ?? null;
  if (category === undefined || stager === null) return [];
  const [own] = sheetAssets({ ...manifest, rows: [row] });
  if (own === undefined) return [];
  const base = {
    id: `${row.category}/${row.id}`,
    category: row.category,
    asset: row.id,
    name: own.name,
    sources: own.sources,
    stageId: DEFAULT_STAGE,
    seconds: row.seconds ?? category.seconds,
  };
  switch (stager) {
    case "player":
    case "weapon":
      return [{ ...base, setup: { kind: stager, weaponId: row.subject } }];
    case "stage":
      return [{ ...base, stageId: row.subject, setup: { kind: "stage" } }];
    case "boss":
      return BOSS_PHASE_ORDINALS.map((phase) => ({
        ...base,
        id: `${base.id}/phase-${String(phase)}`,
        stageId: bossHome(row.subject),
        setup: { kind: "boss" as const, bossId: row.subject, phase },
      }));
    case "enemy": {
      const home = (ENEMY_HOME_STAGE as Readonly<Record<string, StageId>>)[row.subject] ?? DEFAULT_STAGE;
      const variants = variantsOf(row, category).map((variant) => ({
        ...base,
        id: `${row.category}/${variantId(row, variant.id)}`,
        asset: variantId(row, variant.id),
        name: `${variant.name} (${own.name} variant)`,
        stageId: variantHomeStage(variant.id) ?? DEFAULT_STAGE,
        seconds: category.variantSeconds || base.seconds,
        setup: { kind: "enemy" as const, enemyId: row.subject, variantId: variant.id, allies: [] },
      }));
      return [
        { ...base, stageId: home, setup: { kind: "enemy", enemyId: row.subject, allies: row.allies } },
        ...variants,
      ];
    }
  }
}

/** Every scene, in category order. */
export function sheetScenes(manifest: AssetManifest): readonly SheetScene[] {
  return manifest.categories.flatMap((category) =>
    manifest.rows.filter((row) => row.category === category.id).flatMap((row) => rowScenes(manifest, row)),
  );
}

/** The asset id a stage object kind or projectile family seen during play belongs to. */
export function byproductAsset(manifest: AssetManifest, category: string, subject: string): string {
  return (
    manifest.rows.find((row) => row.category === category && row.subject === subject)?.id ??
    `unlisted_${snake(subject)}`
  );
}

/** Boss move tables that are data. A boss whose moves become a table adds it here. */
const BOSS_MOVE_TABLES = [ROOTBOUND_MOVES] as const;

/** For each boss whose moves are data: a complete run photographs every move of every phase. */
export function bossMoveChecklist(manifest: AssetManifest) {
  return BOSS_MOVE_TABLES.flatMap((table) => {
    const row = manifest.rows.find(
      (entry) => entry.subject === table.bossId && categoryOf(manifest, entry.category)?.stager === "boss",
    );
    if (row === undefined) return [];
    return [{ asset: row.id, moves: table.attacks.map((attack) => ({ id: attack.id, phases: attack.phases })) }];
  });
}

/** The manifest the game ships with. */
export const ASSET_MANIFEST = readManifest(RAW_MANIFEST);
