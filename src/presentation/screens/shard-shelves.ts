/**
 * The Shop's SHARDS tab drawn as shelves: one labelled shelf per cosmetic slot, a row of tall cards on it.
 * The equipped card is lit, a locked one is dimmed and says what earns it, and each card is one control
 * (equip, buy, or nothing to do yet), so keyboard, pad and touch reach the same actions.
 *
 * The preview on each card is drawn from the look's own colours and text (`ShardSwatchView`), so a new
 * item or slot needs no new drawing code here.
 */
import { SHARD_SHELF, shelfColumns } from "../shard-shelves-snapshot";
import { contrastRatio } from "../ui-color";
import type { ScreenAction, ScreenRenderContext, ShardCardView, ShardShelfView, ShardsView } from "./contracts";
import type { ScrollBlock, ScrollView } from "./compact-page";
import type { createPageFrame, PageFrame } from "./page-frame";

type Frame = ReturnType<typeof createPageFrame>;

/** Card parts, from the card's top-left corner. */
const CARD = Object.freeze({ pad: 12, swatch: 76, nameY: 116, tierY: 136, noteY: 150, button: 36 });
/** How far a card that cannot be had yet is faded. */
const DIM_ALPHA = 0.45;
/** Text over a preview takes whichever of these stands out more from the preview colour. */
const DARK = "#101018",
  LIGHT = "#f4f2fb";

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
    const fitted = ui.fitText(canvas, text, w - CARD.pad * 2, { size: ui.t.type.lead, floor: ui.t.type.micro, bold: true });
    const ground = colors[0];
    const ink =
      ground === undefined ? ui.ink : contrastRatio(DARK, ground) >= contrastRatio(LIGHT, ground) ? DARK : LIGHT;
    ui.tag(canvas, fitted.lines[0] ?? text, x + w / 2, y + h / 2 + fitted.size / 3, ink, "center", fitted.size);
  }

  function cardCell(card: ShardCardView, x: number, y: number, w: number, h: number, view: ScrollView): void {
    const { canvas } = context,
      t = ui.t,
      inner = w - CARD.pad * 2;
    const dimmed = card.state === "locked" || card.state === "elsewhere";
    ui.card(canvas, x, y, w, h, card.state === "equipped");
    canvas.globalAlpha = dimmed ? DIM_ALPHA : 1;
    swatch(card, x + CARD.pad, y + CARD.pad, inner, CARD.swatch);
    const name = ui.fitText(canvas, card.label, inner, { size: t.type.body, floor: t.type.label, bold: true });
    ui.displayText(canvas, name.lines[0] ?? card.label, x + CARD.pad, y + CARD.nameY, name.size);
    ui.tag(canvas, card.tier || "GAME LOOK", x + CARD.pad, y + CARD.tierY, t.color.muted, "left", t.type.micro);
    canvas.globalAlpha = 1;
    if (card.isNew) ui.badge(canvas, "NEW", x + w - CARD.pad, y + CARD.tierY, ui.readable(t.color.accent), "right", t.type.micro);
    if (card.note)
      ui.textBox(canvas, card.note, x + CARD.pad, y + CARD.noteY, inner, {
        size: t.type.micro,
        maxLines: 2,
        alpha: t.alpha.soft,
      });
    const { action, enabled } = cardAction(card);
    view.enqueue({
      x: x + CARD.pad,
      y: y + h - CARD.pad - CARD.button,
      w: inner,
      h: CARD.button,
      label: buttonLabel(card),
      selected: card.state === "equipped",
      enabled,
      accent: enabled ? t.color.accent : undefined,
      size: t.type.caption,
      action,
    });
  }

  function shelfHead(shelf: ShardShelfView, span: Readonly<{ left: number; width: number }>): ScrollBlock {
    const label = shelf.hookReady ? shelf.label : `${shelf.label}  ·  NOT SHOWN IN RUNS YET`;
    return {
      height: SHARD_SHELF.head,
      draw: (y) => {
        ui.sectionLabel(context.canvas, label, span.left, y + ui.t.type.micro, span.width, ui.t.color.accent);
      },
    };
  }

  /** Every shelf as body blocks: a label row, then the shelf's cards in rows. */
  function shelves(frame: PageFrame, view: ShardsView): ScrollBlock[] {
    const span = { left: frame.left, width: frame.width },
      columns = shelfColumns(frame.compact);
    return view.shelves.flatMap((shelf, index) => {
      const spacer: ScrollBlock[] = index > 0 ? [{ height: SHARD_SHELF.shelfGap, draw: () => undefined }] : [];
      const rows = pf.grid(
        span,
        shelf.cards,
        columns,
        () => SHARD_SHELF.card + SHARD_SHELF.gap,
        (card, x, y, w, _h, scroll) => {
          cardCell(card, x, y, w, SHARD_SHELF.card, scroll);
        },
        SHARD_SHELF.gap,
      );
      return [...spacer, shelfHead(shelf, span), ...rows];
    });
  }

  return { shelves };
}
