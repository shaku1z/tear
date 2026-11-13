import type { CardView, CodexScreenView } from "./screens/contracts";
import type { UpgradeCategoryPresentation, UpgradePresentationSource } from "./run-screen-snapshots";
import { publishedBestiaryEntries, type BestiaryEntry } from "./bestiary-catalog";

/** Bestiary rows on the codex card grid (2 columns). Renderer and scroll bounds share these. */
export const BESTIARY_CARD_HEIGHT = 172,
  BESTIARY_ROW_PITCH = 184;

export const ABILITY_CATEGORY_ORDER = Object.freeze([
  "offense",
  "throw",
  "parry",
  "mobility",
  "resilience",
  "utility",
] as const);
export const CODEX_TABS = Object.freeze([
  ["abilities", "ABILITIES"],
  ["bestiary", "BESTIARY"],
  ["guide", "GUIDE"],
] as const);
export const SPECIAL_ABILITY_COLOR = "#e8a32e";

export function buildCodexScreenSnapshot(input: {
  readonly tab: string;
  readonly filter: string;
  readonly sort: string;
  readonly scroll: number;
  readonly tabs: readonly (readonly [string, string])[];
  readonly abilityCards: readonly CardView[];
  readonly abilityFilters: readonly (readonly [string, string])[];
  readonly bestiaryCards: readonly CardView[];
  readonly bestiaryFilters: readonly CardView[];
  readonly bestiaryFilter: string;
  readonly guide?: NonNullable<CodexScreenView["guide"]>;
}): Readonly<{ view: CodexScreenView; maximumScroll: number }> {
  const cards = input.tab === "abilities" ? input.abilityCards : input.tab === "bestiary" ? input.bestiaryCards : [];
  const filters =
    input.tab === "abilities"
      ? input.abilityFilters.map(([id, label]) => ({ id, label, selected: id === input.filter }))
      : input.tab === "bestiary"
        ? input.bestiaryFilters
        : undefined;
  const columns = input.tab === "bestiary" ? 2 : 4;
  // bestiary rows use BESTIARY_ROW_PITCH; ability grid rows 150 + 20
  const maximumScroll = Math.max(
    0,
    (Math.ceil(cards.length / columns) - 3) * (input.tab === "bestiary" ? BESTIARY_ROW_PITCH : 170),
  );
  const scroll = Math.max(0, Math.min(maximumScroll, input.scroll));
  return Object.freeze({
    maximumScroll,
    view: Object.freeze({
      id: "codex",
      tab: input.tab,
      tabs: input.tabs.map(([id, label]) => ({ id, label, selected: id === input.tab })),
      cards,
      ...(filters === undefined ? {} : { filters }),
      filter: input.tab === "bestiary" ? input.bestiaryFilter : input.filter,
      sort: input.sort,
      ...(input.guide === undefined ? {} : { guide: input.guide }),
      canScrollUp: scroll > 0,
      canScrollDown: scroll < maximumScroll,
    }),
  });
}

export function abilityBadge(
  upgrade: UpgradePresentationSource,
  uniqueColor: string,
  mutedColor: string,
): Readonly<{ label: string; color: string }> {
  if (upgrade.tiers !== undefined) return Object.freeze({ label: "✦ SPECIAL", color: SPECIAL_ABILITY_COLOR });
  if (upgrade.unique === true) return Object.freeze({ label: "★ UNIQUE", color: uniqueColor });
  return Object.freeze({ label: "STACKS", color: mutedColor });
}

export function buildCodexAbilityCards(input: {
  readonly upgrades: readonly UpgradePresentationSource[];
  readonly filter: string;
  readonly sort: string;
  readonly tierView: Readonly<Record<string, number>>;
  readonly categories: Readonly<Record<string, UpgradeCategoryPresentation>>;
  readonly fallbackCategory: UpgradeCategoryPresentation;
  readonly uniqueColor: string;
  readonly mutedColor: string;
}): readonly CardView[] {
  const rank = (upgrade: UpgradePresentationSource): number =>
    upgrade.tiers !== undefined ? 0 : upgrade.unique === true ? 1 : 2;
  return input.upgrades
    .filter((upgrade) => input.filter === "all" || (upgrade.cat || "utility") === input.filter)
    .sort((left, right) => {
      if (input.sort === "name") return left.name.localeCompare(right.name);
      if (input.sort === "type") return rank(left) - rank(right) || left.name.localeCompare(right.name);
      const leftCategory = ABILITY_CATEGORY_ORDER.indexOf(
        (left.cat || "utility") as (typeof ABILITY_CATEGORY_ORDER)[number],
      );
      const rightCategory = ABILITY_CATEGORY_ORDER.indexOf(
        (right.cat || "utility") as (typeof ABILITY_CATEGORY_ORDER)[number],
      );
      return leftCategory !== rightCategory ? leftCategory - rightCategory : rank(left) - rank(right);
    })
    .map((upgrade) => {
      const category = input.categories[upgrade.cat] ?? input.fallbackCategory;
      const badge = abilityBadge(upgrade, input.uniqueColor, input.mutedColor);
      const tierCount = 1 + (upgrade.tiers?.length ?? 0);
      const tier = Math.min(input.tierView[upgrade.id] ?? 0, tierCount - 1);
      return Object.freeze({
        id: upgrade.id,
        label: upgrade.name,
        category: category.name,
        badge: badge.label,
        accent: category.color,
        tier,
        tierCount,
        description: tier === 0 ? upgrade.desc : (upgrade.tiers?.[tier - 1]?.desc ?? upgrade.desc),
      });
    });
}

interface TrickPoints {
  readonly hit: number;
  readonly throwHit: number;
  readonly deflect: number;
  readonly launch: number;
  readonly slam: number;
  readonly updraft: number;
  readonly superslam: number;
  readonly parry: number;
}
interface TrickTier {
  readonly name?: string;
  readonly at: number;
  readonly mult: number;
}
export interface ControllerGuideLabels {
  readonly jump: string;
  readonly dash: string;
  readonly throw: string;
  readonly tether: string;
  readonly pause: string;
}
export function buildCodexGuide(
  points: TrickPoints,
  tiersSource: readonly TrickTier[],
  controller: ControllerGuideLabels,
): NonNullable<CodexScreenView["guide"]> {
  const tricks = [
    ["/", "CUT", points.hit, "any clean blade hit"],
    ["➹", "THROW HIT", points.throwHit, "the thrown blade connects"],
    ["↩", "DEFLECT", points.deflect, "bat a shot away"],
    ["↑", "LAUNCH", points.launch, "fast UP swing pops them airborne"],
    ["⇂", "SLAM", points.slam, "airborne hit driving DOWN"],
    ["⇈", "UPDRAFT", points.updraft, "launch while rising"],
    ["⇊", "POWER SLAM", points.superslam, "slam during a fast descent"],
    ["✦", "PARRY", points.parry, "swing FAST through a shot — it homes back"],
  ] as const;
  const sorted = [...tricks]
    .sort((left, right) => left[2] - right[2])
    .map(([glyph, name, score, description]) => ({ glyph, name, points: score, description }));
  const tiers = tiersSource.filter((tier) => tier.name !== undefined),
    maximum = tiers.at(-1)?.at ?? 1;
  return Object.freeze({
    controls: [
      { keys: ["A", "D"], description: "move" },
      { keys: ["W", "SPACE"], description: "jump" },
      { keys: ["S"], description: "hold — drop through platforms" },
      { keys: ["SHIFT"], description: "dash · aim 8-way with WASD · i-frames" },
      { keys: ["MOUSE"], description: "the blade — clean CUTS beat pokes" },
      { keys: ["RMB"], description: "throw / recall inside the dashed ring" },
      { keys: ["P"], description: "pause" },
      { keys: ["ESC"], description: "release the mouse" },
    ],
    controller: [
      "left stick move · right stick swings the blade",
      `${controller.jump} jump · ${controller.dash} dash · ${controller.throw} throw · ${controller.tether} tether · ${controller.pause} pause`,
    ],
    tricks: sorted,
    ladder: tiers.map((tier) => ({ name: tier.name ?? "", multiplier: tier.mult, fraction: tier.at / maximum })),
    variety: "VARIETY: repeating the same trick earns fewer points — mix your attacks.",
  });
}

export interface BestiaryEntryDetail {
  readonly accent?: string;
  readonly stats?: readonly Readonly<{ label: string; value: string }>[];
  readonly felled?: Readonly<{ label: string; color: string }>;
  readonly affixes?: readonly Readonly<{ id: string; color: string }>[];
}

export function buildBestiaryView(
  filter: string,
  categoryColors: Readonly<Record<string, string>>,
  danger: string,
  accent: string,
  detail?: (entry: BestiaryEntry) => BestiaryEntryDetail | undefined,
): Readonly<{ filters: readonly CardView[]; cards: readonly CardView[] }> {
  const ids = [
    ["all", "ALL"],
    ["melee", "MELEE"],
    ["ranged", "RANGED"],
    ["air", "AIR"],
    ["support", "SUPPORT"],
    ["boss", "BOSS"],
  ] as const;
  return Object.freeze({
    filters: ids.map(([id, label]) => ({ id, label, selected: id === filter })),
    cards: publishedBestiaryEntries()
      .filter((entry) => filter === "all" || entry.category === filter)
      .map((entry) => {
        const rich = detail?.(entry);
        return {
          id: "bestiary:" + entry.id,
          label: entry.name,
          category: entry.role,
          badge: entry.boss ? "MULTI-PHASE" : entry.category.toUpperCase(),
          description: entry.desc,
          ...(entry.variants === undefined ? {} : { variants: entry.variants }),
          boss: entry.boss === true,
          previewId: "creature:" + entry.id,
          accent: rich?.accent ?? (entry.boss ? danger : (categoryColors[entry.category] ?? accent)),
          ...(rich?.stats === undefined ? {} : { stats: rich.stats }),
          ...(rich?.felled === undefined ? {} : { felled: rich.felled }),
          ...(rich?.affixes === undefined ? {} : { affixes: rich.affixes }),
        };
      }),
  });
}
