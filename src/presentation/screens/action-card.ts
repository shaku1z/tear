import type { ChoiceView, ScreenAction, ScreenRenderContext } from "./contracts";
import type { PageFrame, ScrollView } from "./page-frame";

type Tokens = ScreenRenderContext["ui"]["t"];
type Box = Readonly<{ x: number; y: number; w: number; h: number }>;

/**
 * The action card: a name, its effect copy, a tag (ownership, status) and one action button on
 * the right. The Playground's ABILITIES tab draws it; any list of "read it, then take it" choices
 * can. The copy wraps instead of clipping: desktop gives it three lines inside a fixed card, the
 * phone sizes each row from its copy.
 */
export interface ActionCardMetrics {
  readonly gap: number;
  readonly span: (frame: PageFrame) => Readonly<{ left: number; width: number }>;
  readonly columnGap: number;
  readonly pad: number;
  /** The row's height, and the card inside it (`inset` below the row's top). */
  readonly row: (choices: readonly ChoiceView[]) => number;
  readonly inset: number;
  readonly card: (row: number) => number;
  readonly button: Readonly<{ w: number; h: number; size: number | undefined }>;
  readonly name: Readonly<{ baseline: number; floor: number }>;
  /** The effect copy: baseline below the name's, lines and line height. */
  readonly copy: Readonly<{ baseline: number; maxLines: number; lineHeight: number }>;
  /** Where the tag goes: right-aligned on the name line (desktop) or under the copy (phone). */
  readonly tag: "name-line" | "after-copy";
}

/** Copy lines a card can hold before it would rather grow (phone) or stop (desktop). */
const DESKTOP_COPY_LINES = 3;
const PHONE_COPY_LINES = 4;

/**
 * Desktop: 80 px cards on 92 px rows. The pitch is fixed because the scroll owner
 * (live-playground-presentation) steps the same 92 px; three copy lines fit the longest effect.
 */
export function desktopActionCard(t: Tokens, width: number): ActionCardMetrics {
  return {
    gap: 0,
    span: () => ({ left: width / 2 - 600, width: 1200 }),
    columnGap: 24,
    pad: 16,
    row: () => 92,
    inset: 10,
    card: () => 80,
    button: { w: 102, h: 40, size: undefined },
    name: { baseline: 24, floor: t.type.label },
    copy: { baseline: 18, maxLines: DESKTOP_COPY_LINES, lineHeight: 15 },
    tag: "name-line",
  };
}

/** Phone: each row as tall as its tallest card's copy, at the live tokens. */
export function phoneActionCard(
  t: Tokens,
  frame: PageFrame,
  lineHeight: number,
  lines: (text: string, width: number, maxLines: number) => number,
): ActionCardMetrics {
  const pad = t.space.md,
    button = { w: Math.max(180, t.metric.minTarget * 1.8), h: t.metric.minTarget, size: t.type.label };
  const copyW = (frame.width - t.space.md) / 2 - pad * 3 - button.w;
  const height = (choice: ChoiceView): number =>
    Math.max(
      t.metric.minTarget + pad * 2,
      pad +
        t.type.lead +
        t.space.sm +
        (choice.description ? lines(choice.description, copyW, PHONE_COPY_LINES) * lineHeight : 0) +
        (choice.sub ? t.space.xs + t.type.micro : 0) +
        pad,
    );
  return {
    gap: t.space.md,
    span: (page) => page,
    columnGap: t.space.md,
    pad,
    row: (choices) => Math.max(...choices.map(height)),
    inset: 0,
    card: (row) => row,
    button,
    name: { baseline: pad + t.type.lead, floor: t.type.micro },
    copy: { baseline: t.space.sm + t.type.micro, maxLines: PHONE_COPY_LINES, lineHeight },
    tag: "after-copy",
  };
}

/** Draws action cards; the button goes through the scroll view so it is offered only while visible. */
export function createActionCard(context: ScreenRenderContext) {
  const { ui } = context;
  return function drawActionCard(
    m: ActionCardMetrics,
    choice: ChoiceView,
    card: Box,
    view: ScrollView,
    action: ScreenAction,
  ): void {
    const { canvas } = context,
      t = ui.t,
      { x, y, w, h } = card,
      copyW = w - m.pad * 3 - m.button.w;
    ui.card(canvas, x, y, w, h, false);
    ui.accentStrip(canvas, x, y, w, choice.accent);
    const nameY = y + m.name.baseline,
      tagInk = ui.readable(choice.accent ?? t.color.accent);
    // A tag on the name line takes its width (and a gap) from the name.
    let nameW = copyW;
    if (choice.sub && m.tag === "name-line") {
      canvas.save();
      canvas.font = ui.font(t.type.micro, true);
      nameW = Math.max(copyW / 2, copyW - canvas.measureText(choice.sub).width - t.space.md * 2);
      canvas.restore();
      ui.tag(canvas, choice.sub, x + m.pad + copyW, nameY, tagInk, "right", t.type.micro);
    }
    const name = ui.fitText(canvas, choice.label, nameW, { size: t.type.lead, floor: m.name.floor, bold: true });
    ui.displayText(canvas, name.lines[0] ?? choice.label, x + m.pad, nameY, name.size);
    let cursor = nameY;
    if (choice.description) {
      const { maxLines, lineHeight } = m.copy;
      const copy = { size: t.type.micro, maxLines, lineHeight, alpha: t.alpha.soft };
      cursor = ui.textBox(canvas, choice.description, x + m.pad, nameY + m.copy.baseline, copyW, copy).lastBaseline;
    }
    if (choice.sub && m.tag === "after-copy")
      ui.tag(canvas, choice.sub, x + m.pad, cursor + t.space.xs + t.type.micro, tagInk, "left", t.type.micro);
    view.enqueue({
      x: x + w - m.pad - m.button.w,
      y: y + (h - m.button.h) / 2,
      w: m.button.w,
      h: m.button.h,
      label: choice.glyph ?? "TAKE",
      enabled: choice.enabled,
      size: m.button.size,
      action,
    });
  };
}
