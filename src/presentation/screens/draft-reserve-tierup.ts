import type { DraftCardView, DraftScreenView, ReserveScreenView, ScreenAction, ScreenRenderContext, TierUpScreenView } from "./contracts";
import { scrollHint } from "./screen-primitives";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const ez = (t: number): number => { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - (1 - t) * (1 - t); };   // ease-out

interface ChoiceCardOptions {
  readonly accent: string;
  readonly tag: string;
  readonly tagColor?: string | undefined;
  readonly name: string;
  readonly desc: string;
  readonly foot?: string | null;
  readonly pips?: Readonly<{ next: number }>;
  readonly normalRow?: boolean;
  readonly action: ScreenAction;
}

export function createDraftRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;
  // per-card hover animation state persists across frames (source: hoverAnim["cc"+i])
  const hoverAnim: Record<string, number> = {};

  // Faithful port of the source choiceCard (game.js@ee5e931): deal-in from below,
  // hover lift + scale + wash, keybind badges, fit-to-width names, tier pips.
  function choiceCard(i: number, n: number, o: ChoiceCardOptions): void {
    const { canvas: ctx } = context;
    const t = ui.t, grid = n > 3 && !o.normalRow;
    const cw = grid ? 300 : (n > 3 ? 300 : 322), ch = grid ? 262 : 384, gap = grid ? 24 : (n > 3 ? 24 : 34);
    let x: number, y0: number;
    if (grid) {
      const perRow = 4, row = Math.floor(i / perRow), col = i % perRow;
      const inRow = Math.min(perRow, n - row * perRow);                       // centre the last row
      const rx0 = (width - (cw * inRow + gap * (inRow - 1))) / 2;
      const rows = Math.ceil(n / perRow);
      const scroll = rows > 2 ? context.scroll : 0;
      x = rx0 + col * (cw + gap);
      y0 = 196 + row * (ch + 26) - scroll;
      if (y0 + ch < 170 || y0 > height - 40) {
        context.enqueue({ x, y: y0, w: cw, h: ch, label: "", hiddenBox: true, enabled: false, action: o.action });
        return;
      }
    } else {
      const total = cw * n + gap * (n - 1);
      x = (width - total) / 2 + i * (cw + gap);
      y0 = 248;
    }
    const ac = o.accent;
    // compact-mode interior metrics
    const M = grid
      ? { strip: 7, tagY: 34, nameY: 66, divY: 80, pipY: 102, descY0: 128, descYP: 142, descLH: 21, descSize: t.type.label, selY: ch - 30, footY: ch - 14, badge: 0 }
      : { strip: 9, tagY: 44, nameY: 96, divY: 110, pipY: 136, descY0: 154, descYP: 172, descLH: 25, descSize: t.type.body, selY: ch - 46, footY: ch - 24, badge: 30 };
    const mouse = context.mouse;
    const hovered = (mouse.x >= x && mouse.x <= x + cw && mouse.y >= y0 && mouse.y <= y0 + ch) || i === context.focus;
    const a = hoverAnim["cc" + String(i)] = lerp(hoverAnim["cc" + String(i)] ?? 0, hovered ? 1 : 0, clamp(14 * context.deltaSeconds, 0, 1));
    const ce = clamp(ez((context.enterSeconds - i * 0.06) / 0.34), 0, 1);
    ctx.save();
    ctx.globalAlpha = ce;
    ctx.translate(0, (1 - ce) * 46 - a * 12);                       // deal-in from below + hover lift
    const cx = x + cw / 2, cy = y0 + ch / 2, s = 1 + a * 0.035;
    ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    ui.card(ctx, x, y0, cw, ch, a > 0.35);
    ctx.globalAlpha = ce;   // UI.card owns an internal hover wash; restore the deal-in fade for card contents
    ui.accentStrip(ctx, x, y0, cw, ac, M.strip);
    if (M.badge) {   // keybind badge for every large normal-draft card (1–4)
      ui.keyBadge(ctx, x + cw - 46, y0 + 24, M.badge, i + 1, ac);
    }
    ui.tag(ctx, o.tag, x + 22, y0 + M.tagY, o.tagColor ?? ac, "left", t.type.micro);
    ui.fitTitle(ctx, o.name, cx, y0 + M.nameY, cw - 44, grid ? t.type.lead : t.type.title, t.type.label);
    ui.accentStrip(ctx, cx - 28, y0 + M.divY, 56, ac, 3);
    let descY = y0 + M.descY0;
    if (o.pips) {
      ui.tierPips(ctx, cx, y0 + M.pipY, 3, o.pips.next, ac);
      descY = y0 + M.descYP;
    }
    ui.wrappedText(ctx, o.desc, cx, descY, cw - 52, M.descLH, M.descSize, "center");
    if (o.foot) ui.tag(ctx, o.foot, cx, y0 + M.footY, t.color.muted, "center", t.type.caption);
    const touch = context.touch;
    const selLabel = touch
      ? (i === context.focus ? "TAP AGAIN TO CONFIRM  ✓" : "TAP TO READ")
      : (a > 0.5 ? "▸  SELECT" : (M.badge ? "press  [ " + String(i + 1) + " ]" : ""));
    ui.tag(ctx, selLabel, cx, y0 + M.selY, (a > 0.5 || (touch && i === context.focus)) ? ac : t.color.muted, "center", t.type.micro);
    ctx.restore();
    context.enqueue({ x, y: y0, w: cw, h: ch, label: "", hiddenBox: true, confirm: true, action: o.action });
  }

  function cardFoot(card: DraftCardView): string | null {
    return card.owned ? "owned ×" + String(card.owned) : null;
  }

  function draft(view: DraftScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.84);
    ui.title(canvas, `WAVE ${String(view.wave)} CLEARED`, width / 2, 122, ui.t.type.display);
    ui.accentStrip(canvas, width / 2 - 80, 140, 160, ui.t.color.accent, 3);
    ui.text(canvas, `CHOOSE AN UPGRADE  ·  press 1 / 2 / 3${view.cards.length > 3 ? " / 4" : ""}`, width / 2, 176, ui.t.type.caption, "center", ui.t.alpha.muted);
    view.cards.forEach((card, i) => {
      choiceCard(i, view.cards.length, {
        accent: card.accent ?? ui.t.color.accent,
        tag: [card.badge, card.category].filter(Boolean).join("  ·  "),
        tagColor: card.badgeColor,
        name: card.label, desc: card.description ?? "", foot: cardFoot(card),
        normalRow: true,
        action: { type: "draft.choose", index: i },
      });
    });
    context.enqueue({ x: width / 2 - 150, y: 680, w: 300, h: ui.t.metric.btnH, label: `⟳  REROLL · ${String(view.rerolls)}  [R]`, enabled: view.rerolls > 0, action: { type: "draft.reroll" } });
  }

  function reserve(view: ReserveScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.88);
    ui.title(canvas, "RESERVE A CARD", width / 2, 122, ui.t.type.display);
    ui.accentStrip(canvas, width / 2 - 80, 140, 160, ui.t.color.accent, 3);
    ui.text(canvas, "THIS CARD REPLACES ONE OFFER IN YOUR NEXT NORMAL DRAFT", width / 2, 176, ui.t.type.caption, "center", ui.t.alpha.muted);
    view.cards.forEach((card, i) => {
      choiceCard(i, view.cards.length, {
        accent: card.accent ?? ui.t.color.accent,
        tag: ["RESERVE", card.badge, card.category].filter(Boolean).join(" · "),
        tagColor: card.badgeColor,
        name: card.label, desc: card.description ?? "", normalRow: true,
        action: { type: "reserve.choose", index: i },
      });
    });
    context.enqueue({ x: width / 2 - 110, y: 680, w: 220, h: ui.t.metric.btnH, label: "SKIP RESERVE", action: { type: "reserve.choose", index: -1 } });
  }

  function tierup(view: TierUpScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.86);
    ui.title(canvas, "THE WAY OPENS", width / 2, 122, ui.t.type.display);
    // the accent strip fades in with the screen (source: fillRect gated by ez(enterT / 0.3))
    canvas.fillStyle = ui.t.color.accent;
    canvas.globalAlpha = clamp(ez(context.enterSeconds / 0.3), 0, 1);
    canvas.fillRect(width / 2 - 80, 140, 160, 3);
    canvas.globalAlpha = 1;
    ui.text(canvas, "THE BOSS FALLS  ·  EVOLVE ANY ABILITY YOU OWN", width / 2, 176, ui.t.type.caption, "center", ui.t.alpha.muted);
    view.cards.forEach((card, i) => {
      const next = card.nextTier ?? (card.tier ?? 1) + 1;
      choiceCard(i, view.cards.length, {
        accent: card.accent ?? ui.t.color.accent,
        tag: `EVOLVE → TIER ${String(next)}  ·  ${card.category ?? ""}`,
        tagColor: card.accent,
        name: card.label, desc: card.description ?? "", pips: { next },
        action: { type: "tierup.choose", index: i },
      });
    });
    // past two grid rows, the deck scrolls
    if (view.cards.length > 8) scrollHint(context, view.canScrollUp, view.canScrollDown, height - 26);
  }

  return { draft, reserve, tierup };
}
