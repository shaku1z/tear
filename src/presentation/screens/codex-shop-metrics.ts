import type { CardView, CodexScreenView, ScreenRenderContext, ShopScreenView } from "./contracts";
import { BESTIARY_CARD_HEIGHT, BESTIARY_ROW_PITCH } from "../codex-snapshots";
import { SHOP_LIST_TOP, SHOP_ROW_PITCH, SHOP_SECTION_GAP, SHOP_SECTION_HEAD } from "../shop-snapshot";
import type { createPageFrame, PageFrame } from "./page-frame";

/**
 * The codex and shop metrics: what both densities draw with different numbers (`Metrics`, a
 * desktop and a phone table) and the desktop design's placements (`DESKTOP`). The drawers in
 * `codex-shop.ts` read only these; the phone table measures at the live tokens.
 */
type Tokens = ScreenRenderContext["ui"]["t"];
export type ShopItem = ShopScreenView["sections"][number]["items"][number];
export type Guide = NonNullable<CodexScreenView["guide"]>;
type Span = Readonly<{ left: number; width: number }>;
type Sized = Readonly<{ x: number; y: number; size: number }>;
/** Text measures at the live tokens (the page frame's). */
export type Measure = Pick<ReturnType<typeof createPageFrame>, "textWidth" | "lineCount" | "lineHeight">;
/** Where a shop row's parts sit, relative to the row's top left. */
export type ShopRow = ReturnType<typeof phoneShopRow>;
/** The guide's two columns: label baselines, row starts and advances, and the controller block. */
export type GuidePlan = ReturnType<typeof phoneGuide>;

/** A grid of cards: `columns` across `span`, `gap` apart, rows `rowGap` apart; `height` is a card's. */
interface CardGrid {
  readonly columns: number;
  readonly gap: number;
  readonly rowGap: number;
  readonly span: Span;
  readonly height: (card: CardView, width: number) => number;
}

/** An ability card's parts (baselines below the card top). */
export interface AbilityCard extends CardGrid {
  readonly pad: number;
  readonly badgeY: number;
  readonly tagY: number;
  readonly titleY: number;
  readonly titleFloor: number;
  readonly lineHeight: number;
  readonly copy: (tiered: boolean, height: number) => Readonly<{ y: number; maxLines: number }>;
  /** The tier pips: beside the badge (`inline`) or on a line of their own; `ring` outlines the current one in ink. */
  readonly tiers: Readonly<{
    inline: boolean;
    r: number;
    step: number;
    pipY: number;
    tagY: number;
    tagGap: number;
    ring: boolean;
  }>;
  /** SPECIAL cards: the gold edge with a gleam travelling along it, or the plain edge. */
  readonly gleam: boolean;
}

/** A bestiary entry's parts (relative to its top left). */
export interface BestiaryEntry extends CardGrid {
  readonly preview: Sized;
  readonly textGap: number;
  readonly inset: number;
  readonly nameY: number;
  readonly nameFloor: number;
  readonly nameReserve: number;
  readonly felledGap: number;
  readonly roleGap: number;
  readonly statsY: number;
  /** Stats as bordered chips, or as one plain line that stops at the edge. */
  readonly statChips: boolean;
  readonly lineHeight: number;
  readonly copyY: (card: CardView) => number;
  readonly lines: (
    card: CardView,
    height: number,
  ) => Readonly<{ description: number; variants: (y: number) => number }>;
  /** The boss note or affix row's baseline, from the end of the copy (or the entry's height). */
  readonly footerY: (cursor: number, height: number) => number;
  /** The copy is a fixed block: an empty description still takes its line. */
  readonly fixedBlock: boolean;
  readonly affix: Readonly<{ lead: number; pad: number; rise: number; height: number; inset: number; gap: number }>;
}

/** What both densities draw, with different numbers: the drawers read only this and `DESKTOP`. */
export interface Metrics {
  readonly gap: number;
  readonly align: "center" | "left";
  /** A truncated category or role still shows (desktop), or is left out (phone). */
  readonly keepTruncated: boolean;
  readonly shop: Readonly<{
    columns: number;
    step: number;
    width: number;
    inset: number;
    /** Desktop keeps BUY buttons scrolled out of the list (above this y) as hidden, disabled controls. */
    keepFrom: number | undefined;
    section: Readonly<{ height: number; baseline: number; lead: number }>;
    row: (item: ShopItem, width: number) => ShopRow;
  }>;
  readonly codex: Readonly<{ tierHint: string; guideCaption: string | undefined }>;
  readonly ability: AbilityCard;
  readonly bestiary: BestiaryEntry;
  readonly guide: (view: Guide) => GuidePlan;
}

/** The desktop design's placements. The phone page never reads them: it flows and measures instead. */
export const DESKTOP = {
  captionY: 184,
  listTop: 244,
  rows: 3,
  filters: { y: 198, height: 32, abilities: 120, bestiary: 128 },
  sort: 170,
  shop: {
    /** The status line sits under the tab row, like the caption on the other tabbed pages. */
    statusTop: 168,
    statusBaseline: 16,
    listTop: SHOP_LIST_TOP - 4,
    column: 550,
    step: 570,
    buy: { w: 96, h: 40 },
  },
  guide: { labelTop: 226, left: { left: 250, width: 500 }, right: { left: 830, width: 520 } },
} as const;

function desktop(t: Tokens, width: number): Metrics {
  const { column, buy } = DESKTOP.shop,
    card = SHOP_ROW_PITCH - 10,
    textRight = column - buy.w - 24;
  const shopRow: ShopRow = {
    card,
    pitch: SHOP_ROW_PITCH,
    tile: { x: 10, y: 10, size: 44 },
    glyph: { x: 32, y: 41, size: 22 },
    name: { x: 66, y: 26, width: textRight - 66 - 150, floor: t.type.label, levelGap: 12 },
    pips: { x: textRight, y: 21 },
    copy: { y: 47, width: textRight - 66, lineHeight: 17 },
    buy: { x: column - buy.w - 10, y: (card - buy.h) / 2, ...buy },
  };
  const span = { left: 230, width: width - 460 },
    { left, right } = DESKTOP.guide;
  return {
    gap: 0,
    align: "center",
    keepTruncated: true,
    shop: {
      columns: 2,
      step: DESKTOP.shop.step,
      width: column,
      inset: 18,
      keepFrom: SHOP_LIST_TOP,
      section: { height: SHOP_SECTION_HEAD, baseline: 0, lead: SHOP_SECTION_GAP },
      row: () => shopRow,
    },
    codex: { tierHint: "click to step through tiers", guideCaption: "how to wield the blade" },
    ability: {
      columns: 4,
      gap: 20,
      rowGap: 20,
      span,
      height: () => 150,
      pad: 12,
      badgeY: 30,
      tagY: 28,
      titleY: 58,
      titleFloor: t.type.label,
      lineHeight: 17,
      gleam: true,
      copy: (tiered, height) => {
        const y = tiered ? 102 : 84;
        return { y, maxLines: Math.max(1, Math.floor((height - 8 - y) / 17) + 1) };
      },
      tiers: { inline: false, r: 5, step: 16, pipY: 76, tagY: 81, tagGap: 7, ring: true },
    },
    bestiary: {
      columns: 2,
      gap: 24,
      rowGap: BESTIARY_ROW_PITCH - BESTIARY_CARD_HEIGHT,
      span,
      height: () => BESTIARY_CARD_HEIGHT,
      preview: { x: 16, y: 14, size: 116 },
      textGap: 20,
      inset: 16,
      nameY: 30,
      nameFloor: t.type.label,
      nameReserve: 40,
      felledGap: 12,
      roleGap: 14,
      statsY: 40,
      statChips: true,
      lineHeight: 15,
      copyY: () => 82,
      fixedBlock: true,
      lines: (entry, height) => {
        const block = (y: number): number => Math.floor((height - 25 - y) / 15) + 1;
        return {
          description: Math.max(1, block(82) - (entry.variants ? 2 : 0)),
          variants: (y) => Math.max(1, block(y)),
        };
      },
      footerY: (_cursor, height) => height - 8,
      affix: { lead: 12, pad: 16, rise: 14, height: 19, inset: 8, gap: 7 },
    },
    guide: () => ({
      height: 0,
      left,
      right,
      labelY: DESKTOP.guide.labelTop - DESKTOP.listTop,
      after: { rows: 20, ladder: 18 },
      baseline: 0,
      rowLines: 1,
      rowLineHeight: undefined,
      keyWidth: 150,
      ladderBefore: 14,
      advance: { control: () => 40, trick: () => 30, ladder: 26 },
      trick: { nameX: 28, copyX: 150, copyWidth: right.width - 150 - 44 },
      bar: { rise: 10, width: 200 },
      variety: { offset: 8, maxLines: 2 },
      controller: { rule: true, x: 130, lineHeight: 18 },
    }),
  };
}

function phone(t: Tokens, frame: PageFrame, m: Measure): Metrics {
  const { space, type } = t,
    pad = space.md,
    micro = m.lineHeight(type.micro);
  const tagY = pad + type.micro,
    titleY = tagY + space.sm + type.title,
    nameY = pad + type.lead,
    preview = 150;
  const copyLines = (text: string | undefined, width: number, size: number, max: number): number =>
    text ? m.lineCount(text, width, size, max) : 0;
  const hasStats = (card: CardView): boolean => (card.stats?.length ?? 0) > 0;
  return {
    gap: space.md,
    align: "left",
    keepTruncated: false,
    shop: {
      columns: 1,
      step: 0,
      width: frame.width,
      inset: 0,
      keepFrom: undefined,
      section: { height: type.micro + space.sm, baseline: type.micro, lead: 0 },
      row: (item, width) => phoneShopRow(t, m, item, width),
    },
    codex: { tierHint: "tap a card to step through tiers", guideCaption: undefined },
    ability: {
      columns: 2,
      gap: space.md,
      rowGap: space.md,
      span: frame,
      pad,
      badgeY: tagY,
      tagY,
      titleY,
      titleFloor: type.micro,
      lineHeight: micro,
      gleam: false,
      height: (card, width) =>
        pad +
        type.micro +
        space.sm +
        type.title +
        space.sm +
        copyLines(card.description, width - pad * 2, type.micro, 5) * micro +
        pad,
      copy: () => ({ y: titleY + space.sm + type.micro, maxLines: 5 }),
      tiers: { inline: true, r: 6, step: 20, pipY: tagY - type.micro * 0.35, tagY, tagGap: space.xs, ring: false },
    },
    bestiary: {
      columns: 1,
      gap: 0,
      rowGap: space.md,
      span: frame,
      preview: { x: pad, y: pad, size: preview },
      textGap: pad,
      inset: pad,
      nameY,
      nameFloor: type.micro,
      nameReserve: 0,
      felledGap: pad,
      roleGap: pad,
      statsY: nameY + space.sm + type.caption,
      statChips: false,
      lineHeight: micro,
      fixedBlock: false,
      height: (card, width) => {
        const textWidth = width - pad - (pad * 2 + preview);
        const lines =
          copyLines(card.description, textWidth, type.micro, 4) +
          copyLines(card.variants && "Variants: " + card.variants, textWidth, type.micro, 2);
        const stats = hasStats(card) ? type.caption + space.sm : 0;
        const footer = card.boss || (card.affixes?.length ?? 0) > 0 ? space.sm + type.micro + space.sm : 0;
        return Math.max(preview + pad * 2, pad + type.lead + space.sm + stats + lines * micro + footer + pad);
      },
      copyY: (card) => nameY + space.sm + (hasStats(card) ? type.caption + space.sm : 0) + type.micro,
      lines: () => ({ description: 4, variants: () => 2 }),
      footerY: (cursor) => cursor + space.sm,
      affix: {
        lead: space.md,
        pad: space.md,
        rise: type.micro,
        height: type.micro + 8,
        inset: space.md / 2,
        gap: space.sm,
      },
    },
    guide: (view) => phoneGuide(t, frame, m, view),
  };
}

/** A phone shop row: measured height, the name and copy centred as one block against BUY. */
function phoneShopRow(t: Tokens, m: Measure, item: ShopItem, width: number) {
  const { space, type } = t,
    pad = space.sm,
    tile = type.h1 + pad,
    buyW = Math.max(200, t.metric.minTarget * 2);
  const level = item.level ?? 0,
    maximum = item.maxLevel ?? 0;
  const pipsW = maximum > 0 ? maximum * 14 + space.md : 0,
    textX = pad * 2 + tile,
    copyWidth = width - buyW - pad * 2 - textX;
  const lines = item.description ? m.lineCount(item.description, copyWidth, type.micro, 2) : 0,
    lineHeight = m.lineHeight(type.micro);
  const height = Math.max(t.metric.minTarget + pad * 2, pad * 2 + type.body + space.sm + lines * lineHeight);
  const levelW = maximum > 0 ? m.textWidth(`LV ${String(level)}/${String(maximum)}`, type.micro, true) + space.md : 0;
  const block = type.body + (lines > 0 ? space.sm + lines * lineHeight : 0),
    nameY = (height - block) / 2 + Math.round(type.body * 0.85);
  return {
    card: height,
    pitch: height,
    tile: { x: pad, y: (height - tile) / 2, size: tile },
    glyph: { x: pad + tile / 2, y: height / 2 + Math.round(type.title * 0.35), size: type.title },
    name: {
      x: textX,
      y: nameY,
      width: width - buyW - pad * 2 - pipsW - textX - levelW,
      floor: type.micro,
      levelGap: space.md,
    },
    pips: { x: width - buyW - pad * 2, y: nameY - type.micro / 3 },
    copy: { y: nameY + space.sm + type.micro, width: copyWidth, lineHeight },
    buy: { x: width - buyW - pad, y: (height - t.metric.minTarget) / 2, w: buyW, h: t.metric.minTarget },
  };
}

/** The phone guide: two measured columns (controls | tricks and ladder) that wrap rows onto two lines. */
function phoneGuide(t: Tokens, frame: PageFrame, m: Measure, view: Guide) {
  const { space, type } = t,
    lh = m.lineHeight,
    columnW = (frame.width - space.xl) / 2;
  const rowH = (text: string, width: number, size: number): number =>
    Math.max(lh(type.label), m.lineCount(text, width, size, 2) * lh(size));
  const keyWidth =
    Math.max(...view.controls.map((row) => m.textWidth(row.keys.join(" + "), type.micro, true))) + space.xl;
  const nameW =
    Math.max(...view.tricks.map((trick) => m.textWidth(trick.name, type.label, true))) +
    type.label +
    space.sm +
    space.xl;
  const pointsW = m.textWidth("+00", type.label, true) + space.sm,
    copyWidth = columnW - nameW - pointsW;
  const advance = {
    control: (text: string) => rowH(text, columnW - keyWidth, type.label) + space.sm,
    trick: (text: string) => rowH(text, copyWidth, type.micro) + space.sm,
    ladder: lh(type.label) + space.sm,
  };
  const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
  const controller = sum(view.controller.map((line) => m.lineCount(line, columnW, type.micro, 2) * lh(type.micro)));
  const left = type.micro + space.md + sum(view.controls.map((row) => advance.control(row.description)));
  const right =
    (type.micro + space.md) * 2 +
    sum(view.tricks.map((trick) => advance.trick(trick.description))) +
    space.md +
    view.ladder.length * advance.ladder +
    space.sm +
    m.lineCount(view.variety, columnW, type.micro, 3) * lh(type.micro);
  return {
    height: Math.max(left + space.md + type.micro + space.sm + controller, right),
    left: { left: frame.left, width: columnW },
    right: { left: frame.left + columnW + space.xl, width: columnW },
    labelY: type.micro,
    after: { rows: space.sm, ladder: space.sm },
    baseline: type.label,
    rowLines: 2,
    rowLineHeight: lh as ((size: number) => number) | undefined,
    keyWidth,
    advance,
    ladderBefore: space.md + type.micro,
    trick: { nameX: type.label + space.sm, copyX: nameW, copyWidth },
    bar: { rise: type.label / 2, width: Math.round(columnW * 0.3) },
    variety: { offset: type.micro, maxLines: 3 },
    /** Desktop: a rule with the tag beside the lines; phone: a section label over them. */
    controller: { rule: false, x: 0, lineHeight: lh(type.micro) },
  };
}

/** The metrics table for the density the frame was opened at. */
export function codexShopMetrics(t: Tokens, frame: PageFrame, measure: Measure, width: number): Metrics {
  return frame.compact ? phone(t, frame, measure) : desktop(t, width);
}
