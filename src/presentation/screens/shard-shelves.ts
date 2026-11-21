/**
 * The Shop's SHARDS tab drawn as shelves: the loadout row, a strip per collection, then one labelled shelf
 * per cosmetic slot with a row of tall cards on it. The equipped card is lit, a locked one is dimmed and says
 * what earns it, and each card and loadout is one control (equip, buy, switch, or nothing to do yet), so
 * keyboard, pad and touch reach the same actions.
 *
 * The preview on each card is drawn from the look's own colours and text (`ShardSwatchView`), so a new
 * item or slot needs no new drawing code here.
 */
import { DEFAULT_LOADOUT_ID, MAX_LOADOUTS } from "../../domain/cosmetic-types";
import {
  SHARD_CARD,
  SHARD_SHELF,
  shardCardLayout,
  shelfColumns,
  type ShardCardLayout,
} from "../shard-shelves-snapshot";
import { contrastRatio } from "../ui-color";
import type { ScreenAction, ScreenRenderContext } from "./contracts";
import type { ShardCardView, ShardCollectionView, ShardShelfView, ShardsView } from "./shard-contracts";
import type { ScrollBlock, ScrollView } from "./compact-page";
import type { createPageFrame, PageFrame } from "./page-frame";

type Frame = ReturnType<typeof createPageFrame>;

/** How far a card that cannot be had yet is faded. */
const DIM_ALPHA = 0.45;
/** Text over a preview takes whichever of these stands out more from the preview colour. */
const DARK = "#101018",
  LIGHT = "#f4f2fb";
/** The loadout row is cut into one slot per possible loadout, one for + NEW, and two for RENAME and DELETE. */
const LOADOUT_ROW_SLOTS = MAX_LOADOUTS + 3;
type Span = Readonly<{ left: number; width: number }>;

export function createShardShelves(context: ScreenRenderContext, pf: Frame) {
  const { ui } = context;

  /** The action a card's button runs, and whether the player can run it now. */
  function cardAction(card: ShardCardView): Readonly<{ action: ScreenAction; enabled: boolean }> {
    if (card.state === "available" && card.id !== null)
      return { action: { type: "shards.buy", id: card.id }, enabled: card.affordable };
    return { action: { type: "shards.equip", slot: card.slot, id: card.id }, enabled: card.state === "owned" };
  }

  function buttonLabel(card: ShardCardView): string {
    switch (card.state) {
      case "equipped":
        return "EQUIPPED";
      case "owned":
        return "EQUIP";
      case "available":
        return `⬡ ${(card.price ?? 0).toLocaleString("en-US")}`;
      case "locked":
        return card.price === undefined ? "LOCKED" : `LOCKED · ⬡ ${card.price.toLocaleString("en-US")}`;
      case "elsewhere":
        return "EARNED IN PLAY";
    }
  }

  /** The look's colours as bands across the preview, with its text (a title or banner) over them. */
  function swatch(card: ShardCardView, x: number, y: number, w: number, h: number): void {
    const { canvas } = context,
      { colors, text } = card.swatch;
    colors.forEach((color, index) => {
      canvas.fillStyle = color;
      canvas.fillRect(x + (index * w) / colors.length, y, w / colors.length + 0.5, h);
    });
    if (text === undefined) return;
    const fitted = ui.fitText(canvas, text, w - SHARD_CARD.pad * 2, {
      size: ui.t.type.lead,
      floor: ui.t.type.micro,
      bold: true,
    });
    const ground = colors[0];
    const ink =
      ground === undefined ? ui.ink : contrastRatio(DARK, ground) >= contrastRatio(LIGHT, ground) ? DARK : LIGHT;
    ui.tag(canvas, fitted.lines[0] ?? text, x + w / 2, y + h / 2 + fitted.size / 3, ink, "center", fitted.size);
  }

  function cardCell(
    card: ShardCardView,
    x: number,
    y: number,
    w: number,
    layout: ShardCardLayout,
    view: ScrollView,
  ): void {
    const { canvas } = context,
      t = ui.t,
      pad = SHARD_CARD.pad,
      inner = w - pad * 2,
      h = layout.height;
    const dimmed = card.state === "locked" || card.state === "elsewhere";
    ui.card(canvas, x, y, w, h, card.state === "equipped");
    canvas.globalAlpha = dimmed ? DIM_ALPHA : 1;
    swatch(card, x + pad, y + pad, inner, SHARD_CARD.swatch);
    const name = ui.fitText(canvas, card.label, inner, { size: t.type.body, floor: t.type.label, bold: true });
    ui.displayText(canvas, name.lines[0] ?? card.label, x + pad, y + layout.nameY, name.size);
    const tier = card.tier || "GAME LOOK";
    ui.textBox(canvas, card.collection ? `${tier} · ${card.collection}` : tier, x + pad, y + layout.tierY, inner, {
      size: t.type.micro,
      maxLines: 1,
      color: t.color.muted,
    });
    canvas.globalAlpha = 1;
    // NEW sits on the preview's top-right corner (the badge has its own fill), clear of a long name.
    if (card.isNew)
      ui.badge(
        canvas,
        "NEW",
        x + w - pad * 2,
        y + pad + layout.noteLine,
        ui.readable(t.color.accent),
        "right",
        t.type.micro,
      );
    if (card.note)
      ui.textBox(canvas, card.note, x + pad, y + layout.noteY, inner, {
        size: t.type.micro,
        maxLines: SHARD_CARD.noteLines,
        lineHeight: layout.noteLine,
        alpha: t.alpha.soft,
      });
    const { action, enabled } = cardAction(card);
    view.enqueue({
      x: x + pad,
      y: y + h - pad - layout.button,
      w: inner,
      h: layout.button,
      label: buttonLabel(card),
      selected: card.state === "equipped",
      enabled,
      accent: enabled ? t.color.accent : undefined,
      size: t.type.caption,
      action,
    });
  }

  function head(label: string, span: Span): ScrollBlock {
    return {
      height: SHARD_SHELF.head,
      draw: (y) => {
        ui.sectionLabel(context.canvas, label, span.left, y + ui.t.type.micro, span.width, ui.t.color.accent);
      },
    };
  }
  const spacer = (height: number): ScrollBlock => ({ height, draw: () => undefined });

  /** One chip per loadout (the active one lit), + NEW, and RENAME and DELETE acting on the active one. */
  function loadoutRow(view: ShardsView, span: Span): ScrollBlock {
    const gap = SHARD_SHELF.gap / 2,
      w = (span.width - (LOADOUT_ROW_SLOTS - 1) * gap) / LOADOUT_ROW_SLOTS;
    const at = (slot: number): number => span.left + slot * (w + gap);
    const active = view.loadouts.find((loadout) => loadout.active);
    const bar = SHARD_SHELF.bar,
      size = ui.t.type.caption;
    return {
      height: bar + SHARD_SHELF.gap,
      draw: (y, scroll) => {
        view.loadouts.forEach((loadout, index) => {
          scroll.enqueue({
            x: at(index),
            y,
            w,
            h: bar,
            label: loadout.name,
            selected: loadout.active,
            size,
            action: { type: "shards.useLoadout", id: loadout.id },
          });
        });
        if (view.canAddLoadout)
          scroll.enqueue({
            x: at(view.loadouts.length),
            y,
            w,
            h: bar,
            label: "+ NEW",
            ghost: true,
            size,
            action: { type: "shards.newLoadout" },
          });
        if (!active) return;
        scroll.enqueue({
          x: at(LOADOUT_ROW_SLOTS - 2),
          y,
          w,
          h: bar,
          label: "RENAME",
          ghost: true,
          size,
          action: { type: "shards.renameLoadout", id: active.id },
        });
        scroll.enqueue({
          x: at(LOADOUT_ROW_SLOTS - 1),
          y,
          w,
          h: bar,
          label: view.deleteArmed ? "CONFIRM" : "DELETE",
          ghost: !view.deleteArmed,
          enabled: active.id !== DEFAULT_LOADOUT_ID,
          accent: view.deleteArmed ? ui.t.color.danger : undefined,
          size,
          action: { type: "shards.deleteLoadout", id: active.id },
        });
      },
    };
  }

  /** A collection as one bar: its name and count on the left, the reward or what unlocks it on the right. */
  function collectionStrip(collection: ShardCollectionView, span: Span): ScrollBlock {
    const t = ui.t,
      bar = SHARD_SHELF.bar,
      pad = SHARD_CARD.pad;
    const status = collection.complete
      ? `COMPLETE${collection.reward ? ` · ${collection.reward.toUpperCase()} EARNED` : ""}`
      : collection.note || (collection.reward ? `REWARD · ${collection.reward.toUpperCase()}` : "");
    return {
      height: bar + SHARD_SHELF.gap,
      draw: (y) => {
        const { canvas } = context,
          baseline = y + bar / 2 + t.type.caption / 3;
        ui.card(canvas, span.left, y, span.width, bar, collection.complete);
        const count = `${collection.name.toUpperCase()}   ${String(collection.owned)}/${String(collection.total)}`;
        ui.tag(canvas, count, span.left + pad, baseline, ui.ink, "left", t.type.caption);
        ui.tag(canvas, status, span.left + span.width - pad, baseline, t.color.muted, "right", t.type.micro);
      },
    };
  }

  /** What stands above the shelves: the loadout row, then the collection strips. */
  function header(view: ShardsView, span: Span): ScrollBlock[] {
    const collections =
      view.collections.length === 0
        ? []
        : [head("COLLECTIONS", span), ...view.collections.map((entry) => collectionStrip(entry, span))];
    return [
      head("LOADOUTS", span),
      loadoutRow(view, span),
      spacer(SHARD_SHELF.shelfGap),
      ...collections,
      ...(collections.length === 0 ? [] : [spacer(SHARD_SHELF.shelfGap)]),
    ];
  }

  function shelfHead(shelf: ShardShelfView, span: Span): ScrollBlock {
    return head(shelf.hookReady ? shelf.label : `${shelf.label}  ·  NOT SHOWN IN RUNS YET`, span);
  }

  /** Every shelf as body blocks: a label row, then the shelf's cards in rows. */
  function shelves(frame: PageFrame, view: ShardsView): ScrollBlock[] {
    const span = { left: frame.left, width: frame.width },
      columns = shelfColumns(frame.compact),
      layout = shardCardLayout(ui.t.type, ui.t.metric.minTarget);
    const shelves = view.shelves.flatMap((shelf, index) => {
      const gap: ScrollBlock[] = index > 0 ? [spacer(SHARD_SHELF.shelfGap)] : [];
      const rows = pf.grid(
        span,
        shelf.cards,
        columns,
        () => layout.height + SHARD_SHELF.gap,
        (card, x, y, w, _h, scroll) => {
          cardCell(card, x, y, w, layout, scroll);
        },
        SHARD_SHELF.gap,
      );
      return [...gap, shelfHead(shelf, span), ...rows];
    });
    return [...header(view, span), ...shelves];
  }

  return { shelves };
}
