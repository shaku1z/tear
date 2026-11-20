import type { EnemyAffix, AffixEnemy } from "../gameplay/affixes";
import type {
  GameReferenceAchievementV1,
  GameReferenceBossV1,
  GameReferenceModeV1,
  GameReferenceStageV1,
  GameReferenceUpgradeV1,
  GameReferenceV1,
  GameReferenceWeaponV1,
} from "./game-reference";
import type { GameReferenceDifficultyV1 } from "./public-tuning-reference";

/**
 * The player wiki's data contract: one deterministic JSON document projected from
 * the game's own definitions. Callers (scripts/export-game-reference.mjs --wiki)
 * pass every source in as plain data, so this module stays pure and layer-legal.
 * Bump WIKI_DATA_SCHEMA_VERSION only for a change the wiki must adapt to.
 */
export const WIKI_DATA_FORMAT = "tear-wiki-data" as const;
export const WIKI_DATA_SCHEMA_VERSION = 1 as const;

export interface WikiBodyStats {
  readonly hp: number;
  readonly contactDamage: number;
  readonly speed: number;
}

export interface WikiEnemyCopy {
  readonly name: string;
  readonly role: string;
  readonly category: string;
  readonly desc: string;
}

/** One measurable change an affix makes to an enemy, computed by applying it. */
export interface WikiAffixEffect {
  readonly stat: string;
  readonly kind: "multiply" | "set" | "share-of-max-hp";
  readonly value: number;
}

export interface WikiShopItemInput {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly glyph: string;
  readonly desc: string;
  readonly levels: readonly Readonly<{ cost: number; effect: string }>[];
}

export interface WikiControlsInput {
  readonly keyboard: readonly Readonly<{ keys: readonly string[]; description: string }>[];
  readonly gamepad: readonly Readonly<{ action: string; buttons: readonly string[]; playstation: readonly string[] }>[];
  readonly gamepadSticks: readonly string[];
}

export interface WikiStyleInput {
  readonly tricks: readonly Readonly<{ name: string; points: number; description: string }>[];
  readonly ranks: readonly Readonly<{ name: string; gauge: number; multiplier: number }>[];
  readonly decaySeconds: number;
  readonly hitLoss: number;
  readonly varietyMultiplier: number;
}

/** A boss move the game declares as data (a boss attack table): when it can be used and its warning. */
export interface WikiBossMove {
  readonly id: string;
  readonly phases: readonly number[];
  /** The authored warning before the move lands, in seconds. */
  readonly tellSeconds: number;
  /** False for a move that only places something on the stage and never strikes. */
  readonly strikes: boolean;
}

export interface WikiDataInput {
  readonly reference: GameReferenceV1;
  /** Published enemy identities in canonical order and their Codex copy. */
  readonly enemyIds: readonly string[];
  readonly enemyCopy: Readonly<Record<string, WikiEnemyCopy>>;
  readonly bossCopy: Readonly<Record<string, string>>;
  /** Moves of each boss that declares them as data, keyed by boss id. Older bosses declare none. */
  readonly bossMoves: Readonly<Record<string, readonly WikiBossMove[]>>;
  /** Base stats read from real constructed instances, keyed by enemy kind or boss id. */
  readonly bodies: Readonly<Record<string, WikiBodyStats>>;
  readonly affixes: readonly EnemyAffix[];
  readonly elite: Readonly<Record<string, number>>;
  readonly status: Readonly<Record<string, number>>;
  /** The game's identity colours, keyed by enemy kind (bosses use `boss`). */
  readonly colors: Readonly<Record<string, string>>;
  readonly dash: Readonly<{ speed: number; duration: number; cooldown: number; iframe: number }>;
  readonly releaseModeIds: readonly string[];
  readonly shopCategories: readonly (readonly [string, string])[];
  readonly shop: readonly WikiShopItemInput[];
  readonly controls: WikiControlsInput;
  readonly style: WikiStyleInput;
  /** Names the wiki must never show: the terminology registry's retired aliases and its tooling product names. */
  readonly excludedNames: readonly string[];
  /** True only for a local preview built from uncommitted changes (`--allow-dirty`). */
  readonly dirty: boolean;
  /** IDs of preview-only content (Pale) that must never appear in the published document. */
  readonly previewIds: readonly string[];
  /** Every id the game itself defines, per wiki collection; each non-preview id must be documented. */
  readonly catalog: Readonly<Record<WikiCatalogKey, readonly string[]>>;
}

export type WikiCatalogKey =
  "weapons" | "upgrades" | "enemies" | "affixes" | "bosses" | "stages" | "modes" | "achievements" | "shop";

export interface WikiDataV1 {
  readonly format: typeof WIKI_DATA_FORMAT;
  readonly schemaVersion: typeof WIKI_DATA_SCHEMA_VERSION;
  readonly source: Readonly<{ repository: string; sha: string; dirty: boolean }>;
  readonly excludedNames: readonly string[];
  readonly weapons: readonly GameReferenceWeaponV1[];
  readonly upgrades: readonly GameReferenceUpgradeV1[];
  readonly enemies: readonly Readonly<
    WikiEnemyCopy & {
      id: string;
      color: string;
      stats: WikiBodyStats;
      affixIds: readonly string[];
      variants: readonly Readonly<{ id: string; name: string; minWave: number | null }>[];
      stageIds: readonly string[];
    }
  >[];
  readonly affixes: readonly Readonly<{
    id: string;
    color: string;
    appliesTo: readonly string[];
    effects: readonly WikiAffixEffect[];
  }>[];
  readonly affixCombos: readonly Readonly<{ enemyId: string; affixIds: readonly string[] }>[];
  readonly elite: Readonly<Record<string, number>>;
  readonly status: Readonly<Record<string, number>>;
  readonly dash: WikiDataInput["dash"];
  readonly bosses: readonly Readonly<
    Omit<GameReferenceBossV1, "phaseMarks"> & {
      desc: string;
      color: string;
      stats: WikiBodyStats;
      phaseMarks: readonly number[];
      moves: readonly WikiBossMove[];
    }
  >[];
  readonly stages: readonly Readonly<Omit<GameReferenceStageV1, "musicId">>[];
  readonly modes: readonly Readonly<Pick<GameReferenceModeV1, "id" | "label" | "blurb" | "classification">>[];
  readonly difficulties: readonly GameReferenceDifficultyV1[];
  readonly achievements: readonly GameReferenceAchievementV1[];
  readonly shop: Readonly<{
    categories: readonly Readonly<{ id: string; label: string }>[];
    items: readonly WikiShopItemInput[];
  }>;
  readonly controls: WikiControlsInput;
  readonly style: WikiStyleInput;
}

const PROBE_FIELDS = [
  "maxHp",
  "weight",
  "speedMult",
  "fireRateMult",
  "volley",
  "contactReach",
  "contactDmg",
  "hw",
  "maxShield",
] as const satisfies readonly (keyof AffixEnemy)[];

function probeEnemy(kind: string): AffixEnemy {
  return {
    kind,
    hp: 100,
    maxHp: 100,
    weight: 1,
    speedMult: 1,
    fireRateMult: 1,
    volley: 1,
    contactReach: 0,
    contactDmg: 10,
    hw: 10,
    shield: 0,
    maxShield: 0,
    color: "#000000",
    affixes: [],
    affixCount: 0,
  };
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** Applies an affix to a neutral probe and reports every stat it changed. */
export function measureAffix(affix: EnemyAffix, kind: string): readonly WikiAffixEffect[] {
  const before = probeEnemy(kind),
    after = probeEnemy(kind);
  affix.apply(after);
  const effects: WikiAffixEffect[] = [];
  for (const stat of PROBE_FIELDS) {
    const from = before[stat],
      to = after[stat];
    if (from === to) continue;
    if (stat === "maxShield") effects.push({ stat: "shield", kind: "share-of-max-hp", value: round(to / after.maxHp) });
    else if (from === 0 || stat === "volley") effects.push({ stat, kind: "set", value: round(to) });
    else effects.push({ stat, kind: "multiply", value: round(to / from) });
  }
  return effects;
}

function requireRecord<T>(record: Readonly<Record<string, T>>, id: string, label: string): T {
  const value = record[id];
  if (value === undefined) throw new Error(`wiki data: missing ${label} for ${id}`);
  return value;
}

function bodyStats(body: WikiBodyStats): WikiBodyStats {
  return { hp: Math.round(body.hp), contactDamage: round(body.contactDamage), speed: Math.round(body.speed) };
}

export function buildWikiDataV1(input: WikiDataInput): WikiDataV1 {
  const { reference } = input;
  const collections = reference.collections;
  const enemySource = collections.enemies.items;
  const stages = collections.stages.items;
  const familyById = new Map(enemySource.families.map((family) => [family.id as string, family]));

  const affixes = input.affixes.map((affix) => {
    const appliesTo = input.enemyIds.filter((kind) => affix.appliesTo(probeEnemy(kind)));
    const sample = appliesTo[0] ?? "charger";
    return { id: affix.id, color: affix.color, appliesTo, effects: measureAffix(affix, sample) };
  });

  const enemies = input.enemyIds.map((id) => {
    const copy = requireRecord(input.enemyCopy, id, "Codex copy");
    const family = familyById.get(id);
    if (family === undefined) throw new Error(`wiki data: enemy ${id} has no reference family`);
    return {
      id,
      ...copy,
      color: requireRecord(input.colors, id, "identity colour"),
      stats: bodyStats(requireRecord(input.bodies, id, "body stats")),
      affixIds: affixes.filter((affix) => affix.appliesTo.includes(id)).map((affix) => affix.id),
      variants: family.variants.map(({ id: variantId, name, minWave }) => ({ id: variantId, name, minWave })),
      stageIds: stages.filter((stage) => stage.pool.some((entry) => entry.kind === id)).map((stage) => stage.id),
    };
  });

  const bosses = collections.bosses.items.map((boss) => ({
    id: boss.id,
    name: boss.name,
    stageId: boss.stageId,
    desc: requireRecord(input.bossCopy, boss.id, "Codex copy"),
    color: requireRecord(input.colors, "boss", "identity colour"),
    stats: bodyStats(requireRecord(input.bodies, boss.id, "body stats")),
    phaseMarks: [...boss.phaseMarks],
    moves: [...(input.bossMoves[boss.id] ?? [])],
  }));

  const release = new Set(input.releaseModeIds);
  const modes = collections.modes.items
    .filter((mode) => mode.enabled && release.has(mode.id))
    .map(({ id, label, blurb, classification }) => ({ id, label, blurb, classification }));

  const data: WikiDataV1 = {
    format: WIKI_DATA_FORMAT,
    schemaVersion: WIKI_DATA_SCHEMA_VERSION,
    source: { ...reference.source, dirty: input.dirty },
    excludedNames: input.excludedNames,
    weapons: collections.weapons.items,
    upgrades: collections.upgrades.items,
    enemies,
    affixes,
    affixCombos: enemySource.presets.map((preset) => ({ enemyId: preset.familyId, affixIds: preset.affixIds })),
    elite: input.elite,
    status: input.status,
    dash: input.dash,
    bosses,
    stages: stages.map(({ id, name, blurb, boss, pool, layout, narrative, theme }) => ({
      id,
      name,
      blurb,
      boss,
      pool,
      layout,
      narrative,
      theme,
    })),
    modes,
    difficulties: collections["public-tuning"].items.difficultyCatalog,
    achievements: collections.achievements.items,
    shop: {
      categories: input.shopCategories.map(([id, label]) => ({ id, label })),
      items: input.shop,
    },
    controls: input.controls,
    style: input.style,
  };
  assertNoPreviewContent(data, input.previewIds);
  assertWikiCoverage(data, input.catalog, input.previewIds);
  return data;
}

/** Fails if the game defines a (non-preview) entity that the document does not describe. */
export function assertWikiCoverage(
  data: WikiDataV1,
  catalog: Readonly<Record<WikiCatalogKey, readonly string[]>>,
  previewIds: readonly string[],
): void {
  const preview = new Set(previewIds);
  const documented: Record<WikiCatalogKey, readonly { readonly id: string }[]> = {
    weapons: data.weapons,
    upgrades: data.upgrades,
    enemies: data.enemies,
    affixes: data.affixes,
    bosses: data.bosses,
    stages: data.stages,
    modes: data.modes,
    achievements: data.achievements,
    shop: data.shop.items,
  };
  const missing = (Object.keys(documented) as WikiCatalogKey[]).flatMap((key) => {
    const ids = new Set(documented[key].map((entry) => entry.id));
    return catalog[key].filter((id) => !preview.has(id) && !ids.has(id)).map((id) => `${key}/${id}`);
  });
  if (missing.length > 0) throw new Error(`wiki data is missing game content: ${missing.join(", ")}`);
}

/** Fails if any preview-only identifier appears anywhere in the document. */
export function assertNoPreviewContent(data: WikiDataV1, previewIds: readonly string[]): void {
  const text = JSON.stringify(data);
  const leaked = previewIds.filter((id) => text.includes(`"${id}"`));
  if (leaked.length > 0) throw new Error(`wiki data leaks preview content: ${leaked.join(", ")}`);
}

export function encodeWikiDataV1(data: WikiDataV1): string {
  return `${JSON.stringify(data, null, 1)}\n`;
}
