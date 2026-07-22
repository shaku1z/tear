import type { CardView, CodexScreenView } from "./screens/contracts";
import type { UpgradeCategoryPresentation, UpgradePresentationSource } from "./run-screen-snapshots";

export const ABILITY_CATEGORY_ORDER = Object.freeze(["offense", "throw", "parry", "mobility", "resilience", "utility"] as const);
export const CODEX_TABS = Object.freeze([["abilities", "ABILITIES"], ["bestiary", "BESTIARY"], ["guide", "GUIDE"]] as const);
export const SPECIAL_ABILITY_COLOR = "#e8a32e";

export function buildCodexScreenSnapshot(input: {
  readonly tab: string; readonly filter: string; readonly sort: string; readonly scroll: number;
  readonly tabs: readonly (readonly [string, string])[]; readonly abilityCards: readonly CardView[];
  readonly abilityFilters: readonly (readonly [string, string])[]; readonly bestiaryCards: readonly CardView[];
  readonly bestiaryFilters: readonly CardView[]; readonly bestiaryFilter: string;
  readonly guide?: NonNullable<CodexScreenView["guide"]>;
}): Readonly<{ view: CodexScreenView; maximumScroll: number }> {
  const cards = input.tab === "abilities" ? input.abilityCards : input.tab === "bestiary" ? input.bestiaryCards : [];
  const filters = input.tab === "abilities"
    ? input.abilityFilters.map(([id, label]) => ({ id, label, selected: id === input.filter }))
    : input.tab === "bestiary" ? input.bestiaryFilters : undefined;
  const columns = input.tab === "bestiary" ? 2 : 4;
  // source strides: bestiary rows are 150 tall + 16 gap; ability grid rows 150 + 18
  const maximumScroll = Math.max(0, (Math.ceil(cards.length / columns) - 3) * (input.tab === "bestiary" ? 166 : 168));
  const scroll = Math.max(0, Math.min(maximumScroll, input.scroll));
  return Object.freeze({ maximumScroll, view: Object.freeze({ id: "codex", tab: input.tab,
    tabs: input.tabs.map(([id, label]) => ({ id, label, selected: id === input.tab })), cards,
    ...(filters === undefined ? {} : { filters }), filter: input.tab === "bestiary" ? input.bestiaryFilter : input.filter,
    sort: input.sort, ...(input.guide === undefined ? {} : { guide: input.guide }),
    canScrollUp: scroll > 0, canScrollDown: scroll < maximumScroll }) });
}

export function abilityBadge(upgrade: UpgradePresentationSource, uniqueColor: string, mutedColor: string): Readonly<{ label: string; color: string }> {
  if (upgrade.tiers !== undefined) return Object.freeze({ label: "✦ SPECIAL", color: SPECIAL_ABILITY_COLOR });
  if (upgrade.unique === true) return Object.freeze({ label: "★ UNIQUE", color: uniqueColor });
  return Object.freeze({ label: "STACKS", color: mutedColor });
}

export function buildCodexAbilityCards(input: {
  readonly upgrades: readonly UpgradePresentationSource[]; readonly filter: string; readonly sort: string;
  readonly tierView: Readonly<Record<string, number>>; readonly categories: Readonly<Record<string, UpgradeCategoryPresentation>>;
  readonly fallbackCategory: UpgradeCategoryPresentation; readonly uniqueColor: string; readonly mutedColor: string;
}): readonly CardView[] {
  const rank = (upgrade: UpgradePresentationSource): number => upgrade.tiers !== undefined ? 0 : (upgrade.unique === true ? 1 : 2);
  return input.upgrades.filter((upgrade) => input.filter === "all" || (upgrade.cat || "utility") === input.filter)
    .sort((left, right) => {
      if (input.sort === "name") return left.name.localeCompare(right.name);
      if (input.sort === "type") return rank(left) - rank(right) || left.name.localeCompare(right.name);
      const leftCategory = ABILITY_CATEGORY_ORDER.indexOf((left.cat || "utility") as typeof ABILITY_CATEGORY_ORDER[number]);
      const rightCategory = ABILITY_CATEGORY_ORDER.indexOf((right.cat || "utility") as typeof ABILITY_CATEGORY_ORDER[number]);
      return leftCategory !== rightCategory ? leftCategory - rightCategory : rank(left) - rank(right);
    }).map((upgrade) => {
      const category = input.categories[upgrade.cat] ?? input.fallbackCategory;
      const badge = abilityBadge(upgrade, input.uniqueColor, input.mutedColor);
      const tierCount = 1 + (upgrade.tiers?.length ?? 0);
      const tier = Math.min(input.tierView[upgrade.id] ?? 0, tierCount - 1);
      return Object.freeze({ id: upgrade.id, label: upgrade.name, category: category.name, badge: badge.label,
        accent: category.color, tier, tierCount,
        description: tier === 0 ? upgrade.desc : (upgrade.tiers?.[tier - 1]?.desc ?? upgrade.desc) });
    });
}

interface TrickPoints { readonly hit: number; readonly throwHit: number; readonly deflect: number; readonly launch: number;
  readonly slam: number; readonly updraft: number; readonly superslam: number; readonly parry: number }
interface TrickTier { readonly name?: string; readonly at: number; readonly mult: number }
export function buildCodexGuide(points: TrickPoints, tiersSource: readonly TrickTier[]): NonNullable<CodexScreenView["guide"]> {
  const tricks = [
    ["/", "CUT", points.hit, "any clean blade hit"], ["➹", "THROW HIT", points.throwHit, "the thrown blade connects"],
    ["↩", "DEFLECT", points.deflect, "bat a shot away"], ["↑", "LAUNCH", points.launch, "fast UP swing pops them airborne"],
    ["⇂", "SLAM", points.slam, "airborne hit driving DOWN"], ["⇈", "UPDRAFT", points.updraft, "launch while rising"],
    ["⇊", "POWER SLAM", points.superslam, "slam during a fast descent"], ["✦", "PARRY", points.parry, "swing FAST through a shot — it homes back"],
  ] as const;
  const sorted = [...tricks].sort((left, right) => left[2] - right[2]).map(([glyph, name, score, description]) => ({ glyph, name, points: score, description }));
  const tiers = tiersSource.filter((tier) => tier.name !== undefined), maximum = tiers.at(-1)?.at ?? 1;
  return Object.freeze({ controls: [
    { keys: ["A", "D"], description: "move" }, { keys: ["W", "SPACE"], description: "jump" },
    { keys: ["S"], description: "hold — drop through platforms" },
    { keys: ["SHIFT"], description: "dash · aim 8-way with WASD · i-frames" },
    { keys: ["MOUSE"], description: "the blade — clean CUTS beat pokes" },
    { keys: ["RMB"], description: "throw / recall inside the dashed ring" },
    { keys: ["P"], description: "pause" }, { keys: ["ESC"], description: "release the mouse" },
  ], controller: ["left stick move · right stick swings the blade", "A jump · B dash · X throw · ▸ pause"],
    tricks: sorted, ladder: tiers.map((tier) => ({ name: tier.name ?? "", multiplier: tier.mult, fraction: tier.at / maximum })),
    variety: "VARIETY: repeating the same trick earns fewer points — mix your attacks." });
}

interface BestiaryEntry { readonly name: string; readonly role: string; readonly variants?: string; readonly desc: string; readonly category: string; readonly boss?: boolean }
const BESTIARY: readonly BestiaryEntry[] = Object.freeze([
  { name: "Charger", role: "MELEE RUSHER", variants: "Brawler · Stalker · Executioner · Gravedigger · Duelist", category: "melee", desc: "Closes the gap and commits a telegraphed bull-charge. Bait the lunge into a wall — a whiff leaves it stunned and wide open." },
  { name: "Shooter", role: "KITING RANGED", variants: "Rifleman · Marksman · Warlock · Chain Caster", category: "ranged", desc: "Holds its distance, winds up a telegraphed shot, then kites away. Swing FAST through the shot to parry it back at them." },
  { name: "Flyer", role: "AERIAL SWOOPER", variants: "Dive Bomber · Swooper", category: "air", desc: "Hovers out of reach, then dives along an arc. Launch it or meet it with an up-swing to knock it out of the sky." },
  { name: "Bomber", role: "ARCING ARTILLERY", variants: "Juggler · Trapper · Sludge · Geomancer", category: "ranged", desc: "Lobs deflectable bombs from a standoff. Parry one back to detonate it in their face. Variants plant mines, mud, or walls." },
  { name: "Armored", role: "SHIELDED TANK", category: "melee", desc: "Plated on the side it faces; shrugs off ground hits. Launch it airborne to strip the guard, then punish — it enrages on break." },
  { name: "Priest", role: "SUPPORT · SHIELDS", category: "support", desc: "Hangs back and shields nearby allies. Cut the link beam, or rush the priest itself, to drop their protection." },
  { name: "Mender", role: "SUPPORT · HEALS", category: "support", desc: "Steadily heals the most wounded ally. Kill it first, or your damage just gets undone." },
  { name: "Herald", role: "SUPPORT · EMPOWERS", category: "support", desc: "Hastes and empowers the pack around it. The whole wave hits harder and faster while it lives." },
  { name: "Anchor", role: "SUPPORT · ROOTS", category: "support", desc: "Fragile, but snares you in place from range. Break its line to you, or kill it fast before the root lands." },
  { name: "Wraith", role: "PHASING STALKER", category: "air", desc: "Fades in and out of reach and is hard to pin down. Strike in the brief window it turns solid." },
  { name: "Chimera", role: "ADAPTIVE MIMIC", category: "melee", desc: "Adopts the attacks of whatever enemy types share its wave — it might charge, shoot, or bomb you. No two are alike." },
  { name: "The Warden", role: "STAGE 1 — THE GROUNDS", category: "boss", boss: true, desc: "Keeper of order. Slams shockwaves across the floor, paints prohibited red zones, and in its final phase dives from the ceiling." },
  { name: "Iron Colossus", role: "STAGE 2 — THE UNDERCROFT", category: "boss", boss: true, desc: "A containment engine. Front-shielded — strike from the air. Hurls a bouncing sweeper, heats floor panels, then charges you down." },
  { name: "Berserker King", role: "STAGE 3 — THE CRIMSON FIELDS", category: "boss", boss: true, desc: "Aldric. A pure duel that becomes a throne of fire — then a fake death, a frenzy, and summoned adds. He cannot die during the fall." },
  { name: "The Echo", role: "STAGE 4 — THE VOIDSPIRE", category: "boss", boss: true, desc: "You. Mirrors your last trick on a delay; repeat yourself and it anticipates. Splits in two, then vanishes in a blinding white-out." },
]);

export interface BestiaryEntryDetail {
  readonly accent?: string;
  readonly stats?: readonly Readonly<{ label: string; value: string }>[];
  readonly felled?: Readonly<{ label: string; color: string }>;
  readonly affixes?: readonly Readonly<{ id: string; color: string }>[];
}

export function buildBestiaryView(filter: string, categoryColors: Readonly<Record<string, string>>, danger: string, accent: string,
  detail?: (name: string, boss: boolean) => BestiaryEntryDetail | undefined): Readonly<{ filters: readonly CardView[]; cards: readonly CardView[] }> {
  const ids = [["all", "ALL"], ["melee", "MELEE"], ["ranged", "RANGED"], ["air", "AIR"], ["support", "SUPPORT"], ["boss", "BOSS"]] as const;
  return Object.freeze({ filters: ids.map(([id, label]) => ({ id, label, selected: id === filter })),
    cards: BESTIARY.filter((entry) => filter === "all" || entry.category === filter).map((entry) => {
      const rich = detail?.(entry.name, entry.boss === true);
      return {
        id: "bestiary:" + entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: entry.name,
        category: entry.role, badge: entry.boss ? "MULTI-PHASE" : entry.category.toUpperCase(), description: entry.desc,
        ...(entry.variants === undefined || entry.variants === "—" ? {} : { variants: entry.variants }),
        boss: entry.boss === true,
        previewId: "creature:" + entry.name,
        accent: rich?.accent ?? (entry.boss ? danger : (categoryColors[entry.category] ?? accent)),
        ...(rich?.stats === undefined ? {} : { stats: rich.stats }),
        ...(rich?.felled === undefined ? {} : { felled: rich.felled }),
        ...(rich?.affixes === undefined ? {} : { affixes: rich.affixes }),
      };
    }) });
}
