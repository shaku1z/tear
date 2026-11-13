import type { CardView, CodexScreenView, ScreenRenderContext, ShopScreenView } from "./contracts";
import { createCompactPage, type CompactPage, type ScrollBlock, type ScrollView } from "./compact-page";

type ShopItem = ShopScreenView["sections"][number]["items"][number];
type Guide = NonNullable<CodexScreenView["guide"]>;
const SHOP_GOLD = "#e0a326", SPECIAL_GOLD = "#e8a32e";

/**
 * Phone compositions of the SHOP and the CODEX (abilities, bestiary, guide) on the
 * compact page: one column of upgrade rows, two columns of ability cards, one column
 * of bestiary entries and a two-column guide, all scrolling inside the page body.
 */
export function createCompactCodexShop(context: ScreenRenderContext) {
  const { ui } = context, kit = createCompactPage(context), { lineHeight, lineCount: lines } = kit;

  // ---- SHOP ------------------------------------------------------------------------
  function shop(view: ShopScreenView): void {
    const t = ui.t, goldInk = ui.readable(SHOP_GOLD);
    const page = kit.header({ title: "SHOP", hue: SHOP_GOLD,
      stat: { value: view.coins.toLocaleString("en-US"), label: "COINS", color: goldInk, glyph: "◆" } });
    const status = view.onboarding ?? `${String(view.ownedLevels)} / ${String(view.totalLevels)} LEVELS OWNED   ·   LIFETIME EARNED ◆ ${
      view.lifetimeEarned.toLocaleString("en-US")}`;
    const blocks: ScrollBlock[] = [kit.prose(page, status, { size: view.onboarding ? t.type.caption : t.type.micro,
      alpha: view.onboarding ? t.alpha.soft : t.alpha.muted, maxLines: 2 })];
    for (const section of view.sections) {
      blocks.push(kit.section(page, `${section.label}  ·  ${String(section.items.length)}`, SHOP_GOLD));
      for (const item of section.items) blocks.push(shopRow(page, item, goldInk));
    }
    kit.footer(page, kit.scroll(page, blocks));
  }

  /** One upgrade row: glyph tile, name + level, pips, up to two lines of effect copy, and BUY. */
  function shopRow(page: CompactPage, item: ShopItem, goldInk: string): ScrollBlock {
    const t = ui.t, pad = t.space.sm, tile = t.type.h1 + pad, buyW = Math.max(200, t.metric.minTarget * 2);
    const level = item.level ?? 0, maximum = item.maxLevel ?? 0, maxed = maximum > 0 && level >= maximum;
    const pipsW = maximum > 0 ? maximum * 14 + t.space.md : 0, textX = page.left + pad * 2 + tile, textRight = page.right - buyW - pad * 2 - pipsW;
    const descLines = item.description ? lines(item.description, page.right - buyW - pad * 2 - textX, t.type.micro, 2) : 0;
    const height = Math.max(t.metric.minTarget + pad * 2, pad * 2 + t.type.body + t.space.sm + descLines * lineHeight(t.type.micro));
    const draw = (y: number, view: ScrollView): void => {
      const { canvas } = context;
      ui.card(canvas, page.left, y, page.width, height, false);
      canvas.globalAlpha = level > 0 ? 0.16 : 0.055;
      canvas.fillStyle = level > 0 ? SHOP_GOLD : ui.ink;
      canvas.fillRect(page.left + pad, y + (height - tile) / 2, tile, tile);
      canvas.globalAlpha = 1;
      if (item.flash && item.flash > 0) {
        canvas.globalAlpha = item.flash * 0.3;
        canvas.fillStyle = SHOP_GOLD;
        canvas.fillRect(page.left, y, page.width, height);
        canvas.globalAlpha = 1;
      }
      ui.tag(canvas, item.glyph ?? "◆", page.left + pad + tile / 2, y + height / 2 + Math.round(t.type.title * 0.35),
        level > 0 ? goldInk : t.color.muted, "center", t.type.title);
      const levelText = maximum > 0 ? `LV ${String(level)}/${String(maximum)}` : "";
      const levelW = levelText ? kit.textWidth(levelText, t.type.micro, true) + t.space.md : 0;
      // Name and effect copy are centred as one block against the BUY control.
      const block = t.type.body + (descLines > 0 ? t.space.sm + descLines * lineHeight(t.type.micro) : 0);
      const nameY = y + (height - block) / 2 + Math.round(t.type.body * 0.85);
      const name = ui.fitText(canvas, item.label, textRight - textX - levelW, { size: t.type.body, floor: t.type.micro, bold: true });
      ui.displayText(canvas, name.lines[0] ?? item.label, textX, nameY, name.size);
      if (levelText) {
        ui.tag(canvas, levelText, textX + kit.textWidth(name.lines[0] ?? item.label, name.size, true) + t.space.md, nameY,
          level > 0 ? goldInk : t.color.muted, "left", t.type.micro);
        ui.pips(canvas, page.right - buyW - pad * 2, nameY - t.type.micro / 3, maximum, level, SHOP_GOLD);
      }
      if (item.description) {
        ui.textBox(canvas, item.description, textX, nameY + t.space.sm + t.type.micro, page.right - buyW - pad * 2 - textX,
          { size: t.type.micro, maxLines: 2, lineHeight: lineHeight(t.type.micro), alpha: t.alpha.soft });
      }
      const canBuy = !maxed && item.enabled !== false;
      view.enqueue({ x: page.right - buyW - pad, y: y + (height - t.metric.minTarget) / 2, w: buyW, h: t.metric.minTarget,
        label: maxed ? "MAX" : (item.cost ?? "BUY"), selected: maxed, enabled: canBuy, accent: canBuy ? SHOP_GOLD : undefined,
        action: { type: "shop.buy", id: item.id }, size: t.type.caption });
    };
    return { height, draw };
  }

  // ---- CODEX -----------------------------------------------------------------------
  function codex(view: CodexScreenView): void {
    const t = ui.t;
    // The sort cycles the whole ability list, so it sits with the view controls in the header row.
    const sort = view.tab === "abilities" ? { label: `SORT: ${(view.sort ?? "category").toUpperCase()}`, action: { type: "codex.cycleSort" } as const } : undefined;
    let page = kit.header({ title: "CODEX", tabs: view.tabs, tabAction: (id) => ({ type: "codex.selectTab", id }), trailing: sort });
    if (view.filters && view.tab !== "guide") {
      page = kit.toolbar(page, [{ items: view.filters.map((filter) => ({ ...filter, selected: filter.id === view.filter })),
        action: (id) => ({ type: "codex.selectFilter", id }) }]);
    }
    let blocks: readonly ScrollBlock[];
    if (view.tab === "guide" && view.guide) blocks = [guide(page, view.guide)];
    else if (view.tab === "bestiary") blocks = [kit.prose(page, "every foe — what it does, its stats, and the affixes it can roll", { maxLines: 2 }),
      ...view.cards.map((card) => bestiaryEntry(page, card))];
    else {
      blocks = [kit.prose(page, "STACKS pile up  ·  ★ UNIQUE are one-time  ·  ✦ SPECIAL evolve a tier with every boss  —  tap a card to step through tiers",
        { maxLines: 3 }), ...abilityGrid(page, view.cards)];
    }
    kit.footer(page, kit.scroll(page, blocks, t.space.md));
  }

  /** Height an ability card needs at the live tokens for `card`'s copy. */
  function abilityHeight(card: CardView, width: number): number {
    const t = ui.t, pad = t.space.md;
    const copy = card.description ? lines(card.description, width - pad * 2, t.type.micro, 5) : 0;
    return pad + t.type.micro + t.space.sm + t.type.title + t.space.sm + copy * lineHeight(t.type.micro) + pad;
  }

  function abilityGrid(page: CompactPage, cards: readonly CardView[]): readonly ScrollBlock[] {
    const columns = 2, width = (page.width - ui.t.space.md) / columns;
    return kit.grid(page, cards, columns, (row) => Math.max(...row.map((card) => abilityHeight(card, width))), abilityCard);
  }

  function abilityCard(card: CardView, x: number, y: number, w: number, h: number, view: ScrollView, index: number): void {
    const { canvas } = context, t = ui.t, pad = t.space.md, accent = card.accent ?? t.color.accent, accentInk = ui.readable(accent);
    const special = card.badge?.includes("SPECIAL") === true, prized = special || card.badge?.includes("UNIQUE") === true;
    ui.card(canvas, x, y, w, h, context.focus === index);
    ui.accentStrip(canvas, x, y, w, accent);
    if (special) {
      canvas.fillStyle = SPECIAL_GOLD;
      canvas.fillRect(x, y + 6, w, 3);
    }
    const tagY = y + pad + t.type.micro;
    let badgeW = 0;
    if (card.badge && prized) badgeW = ui.badge(canvas, card.badge, x + pad, tagY, special ? "#a86a0c" : ui.readable(t.color.unique), "left", t.type.micro);
    else if (card.badge) {
      ui.tag(canvas, card.badge, x + pad, tagY, t.color.muted, "left", t.type.micro);
      badgeW = kit.textWidth(card.badge, t.type.micro, true);
    }
    // The tier path (pips, then BASE / TIER n) follows the badge on the same line.
    const pathW = tierPath(card, x + pad + badgeW + t.space.md, tagY, accent, accentInk);
    if (card.category) {
      const category = ui.fitText(canvas, card.category, w - pad * 3 - badgeW - pathW, { size: t.type.micro, floor: t.type.micro, bold: true });
      if (!category.truncated) ui.tag(canvas, category.lines[0] ?? card.category, x + w - pad, tagY, accentInk, "right", t.type.micro);
    }
    const nameY = tagY + t.space.sm + t.type.title;
    const name = ui.fitText(canvas, card.label, w - pad * 2, { size: t.type.title, floor: t.type.micro, bold: true });
    ui.displayText(canvas, name.lines[0] ?? card.label, x + pad, nameY, name.size);
    const copyY = nameY + t.space.sm + t.type.micro;
    if (card.description) ui.textBox(canvas, card.description, x + pad, copyY, w - pad * 2,
      { size: t.type.micro, maxLines: 5, lineHeight: lineHeight(t.type.micro), alpha: t.alpha.soft });
    view.enqueue({ x, y, w, h, label: "", hiddenBox: true, action: { type: "codex.inspect", id: card.id } });
  }

  /** An evolving ability's tier pips and BASE / TIER n tag from `x` on baseline `y`; returns the width used. */
  function tierPath(card: CardView, x: number, y: number, accent: string, accentInk: string): number {
    const { canvas } = context, t = ui.t, count = card.tierCount ?? 1;
    if (count <= 1) return 0;
    const tier = Math.max(0, Math.min(card.tier ?? 0, count - 1)), pipY = y - t.type.micro * 0.35, label = tier === 0 ? "BASE" : `TIER ${String(tier + 1)}`;
    for (let pip = 0; pip < count; pip += 1) {
      canvas.beginPath();
      canvas.arc(x + 6 + pip * 20, pipY, 6, 0, Math.PI * 2);
      canvas.fillStyle = accent;
      canvas.strokeStyle = accent;
      canvas.lineWidth = 2;
      if (pip === tier) canvas.fill();
      else canvas.stroke();
    }
    ui.tag(canvas, label, x + count * 20 + t.space.xs, y, accentInk, "left", t.type.micro);
    return count * 20 + t.space.xs + kit.textWidth(label, t.type.micro, true) + t.space.md;
  }

  // ---- BESTIARY --------------------------------------------------------------------
  function bestiaryEntry(page: CompactPage, card: CardView): ScrollBlock {
    const t = ui.t, pad = t.space.md, preview = 150, textX = page.left + pad * 2 + preview, textW = page.right - pad - textX;
    const lh = lineHeight(t.type.micro);
    const description = card.description ? lines(card.description, textW, t.type.micro, 4) : 0;
    const variants = card.variants ? lines("Variants: " + card.variants, textW, t.type.micro, 2) : 0;
    const stats = (card.stats?.length ?? 0) > 0 ? t.type.caption + t.space.sm : 0;
    const footer = card.boss || (card.affixes?.length ?? 0) > 0 ? t.space.sm + t.type.micro + t.space.sm : 0;
    const height = Math.max(preview + pad * 2, pad + t.type.lead + t.space.sm + stats + (description + variants) * lh + footer + pad);
    const draw = (y: number): void => {
      const { canvas } = context, accent = card.accent ?? (card.boss ? t.color.danger : t.color.accent), accentInk = ui.readable(accent);
      ui.panel(canvas, page.left, y, page.width, height);
      ui.spine(canvas, page.left, y, height, accent, 6);
      canvas.strokeStyle = "rgba(40,42,54,0.3)";
      canvas.lineWidth = 1.5;
      canvas.strokeRect(page.left + pad, y + pad, preview, preview);
      if (card.previewId) context.renderPreview?.(card.previewId, { x: page.left + pad, y: y + pad, w: preview, h: preview });
      const nameY = y + pad + t.type.lead;
      const felled = card.felled;
      const felledW = felled ? ui.badge(canvas, felled.label, page.right - pad, nameY, ui.readable(felled.color), "right", t.type.micro) + pad : 0;
      const name = ui.fitText(canvas, card.label, textW - felledW, { size: t.type.lead, floor: t.type.micro, bold: true });
      ui.displayText(canvas, name.lines[0] ?? card.label, textX, nameY, name.size);
      const nameW = kit.textWidth(name.lines[0] ?? card.label, name.size, true);
      if (card.category) {
        const role = ui.fitText(canvas, card.category, textW - felledW - nameW - pad, { size: t.type.micro, floor: t.type.micro, bold: true });
        if (role.lines[0] && !role.truncated) ui.tag(canvas, role.lines[0], textX + nameW + pad, nameY, accentInk, "left", t.type.micro);
      }
      let cursor = nameY + t.space.sm;
      if (stats > 0) {
        cursor += t.type.caption;
        statLine(card.stats ?? [], textX, cursor, textW);
        cursor += t.space.sm;
      }
      const copy = ui.textBox(canvas, card.description ?? "", textX, cursor + t.type.micro, textW,
        { size: t.type.micro, maxLines: 4, lineHeight: lh, alpha: t.alpha.soft });
      cursor += card.description ? copy.height : 0;
      if (card.variants) cursor += ui.textBox(canvas, "Variants: " + card.variants, textX, cursor + t.type.micro, textW,
        { size: t.type.micro, maxLines: 2, lineHeight: lh, alpha: t.alpha.muted }).height;
      bestiaryFooter(card, textX, cursor + t.space.sm + t.type.micro, page.right - pad);
    };
    return { height, draw };
  }

  /** Stats as label / value pairs on one line, stopping before the right edge. */
  function statLine(stats: readonly Readonly<{ label: string; value: string }>[], x: number, y: number, width: number): void {
    const t = ui.t;
    let cursor = x;
    for (const stat of stats) {
      const labelW = kit.textWidth(stat.label, t.type.micro, true), valueW = kit.textWidth(stat.value, t.type.caption, true);
      if (cursor + labelW + valueW + t.space.sm > x + width) break;
      ui.tag(context.canvas, stat.label, cursor, y, t.color.muted, "left", t.type.micro);
      ui.tag(context.canvas, stat.value, cursor + labelW + t.space.xs, y, ui.ink, "left", t.type.caption);
      cursor += labelW + valueW + t.space.xs + t.space.xl;
    }
  }

  /** The multi-phase note for a boss, or the affixes an enemy can roll. */
  function bestiaryFooter(card: CardView, x: number, y: number, right: number): void {
    const t = ui.t, { canvas } = context;
    if (card.boss) {
      ui.tag(canvas, "MULTI-PHASE — attacks escalate as its health falls", x, y, ui.readable(t.color.danger), "left", t.type.micro);
      return;
    }
    if (!card.affixes || card.affixes.length === 0) return;
    ui.tag(canvas, "CAN ROLL", x, y, t.color.muted, "left", t.type.micro);
    let cursor = x + kit.textWidth("CAN ROLL", t.type.micro, true) + t.space.md;
    for (const affix of card.affixes) {
      const label = affix.id.toUpperCase(), w = kit.textWidth(label, t.type.micro, true) + t.space.md;
      if (cursor + w > right) break;
      canvas.fillStyle = affix.color;
      canvas.globalAlpha = 0.16;
      canvas.fillRect(cursor, y - t.type.micro, w, t.type.micro + 8);
      canvas.globalAlpha = 1;
      canvas.strokeStyle = affix.color;
      canvas.lineWidth = 1;
      canvas.strokeRect(cursor, y - t.type.micro, w, t.type.micro + 8);
      ui.tag(canvas, label, cursor + t.space.md / 2, y, ui.readable(affix.color), "left", t.type.micro);
      cursor += w + t.space.sm;
    }
  }

  // ---- GUIDE -----------------------------------------------------------------------
  /** The guide's two columns (controls | tricks and ladder) as one measured block. */
  function guide(page: CompactPage, view: Guide): ScrollBlock {
    const t = ui.t, gap = t.space.xl, columnW = (page.width - gap) / 2, right = page.left + columnW + gap;
    const keyW = Math.max(...view.controls.map((row) => kit.textWidth(row.keys.join(" + "), t.type.micro, true))) + t.space.xl;
    const rowH = (text: string, width: number, size: number): number => Math.max(lineHeight(t.type.label), lines(text, width, size, 2) * lineHeight(size));
    const controlsH = view.controls.reduce((sum, row) => sum + rowH(row.description, columnW - keyW, t.type.label) + t.space.sm, 0);
    const controllerH = view.controller.reduce((sum, line) => sum + lines(line, columnW, t.type.micro, 2) * lineHeight(t.type.micro), 0);
    const left = t.type.micro + t.space.md + controlsH + t.space.md + t.type.micro + t.space.sm + controllerH;
    const nameW = Math.max(...view.tricks.map((trick) => kit.textWidth(trick.name, t.type.label, true))) + t.type.label + t.space.sm + t.space.xl;
    const pointsW = kit.textWidth("+00", t.type.label, true) + t.space.sm, trickCopyW = columnW - nameW - pointsW;
    const tricksH = view.tricks.reduce((sum, trick) => sum + rowH(trick.description, trickCopyW, t.type.micro) + t.space.sm, 0);
    const ladderH = view.ladder.length * (lineHeight(t.type.label) + t.space.sm);
    const varietyH = lines(view.variety, columnW, t.type.micro, 3) * lineHeight(t.type.micro);
    const rightH = (t.type.micro + t.space.md) * 2 + tricksH + t.space.md + ladderH + t.space.sm + varietyH;
    const draw = (y: number): void => {
      guideControls(view, page.left, y, columnW, keyW, rowH);
      guideTricks(view, right, y, columnW, nameW, pointsW, rowH);
    };
    return { height: Math.max(left, rightH), draw };
  }

  function guideControls(view: Guide, x: number, y: number, width: number, keyW: number, rowH: (text: string, width: number, size: number) => number): void {
    const { canvas } = context, t = ui.t;
    let cursor = ui.sectionLabel(canvas, "CONTROLS", x, y + t.type.micro, width) + t.space.sm;
    for (const row of view.controls) {
      const h = rowH(row.description, width - keyW, t.type.label);
      ui.tag(canvas, row.keys.join(" + "), x, cursor + t.type.label, ui.readable(t.color.accent), "left", t.type.micro);
      ui.textBox(canvas, row.description, x + keyW, cursor + t.type.label, width - keyW,
        { size: t.type.label, maxLines: 2, lineHeight: lineHeight(t.type.label), alpha: t.alpha.soft });
      cursor += h + t.space.sm;
    }
    cursor = ui.sectionLabel(canvas, "CONTROLLER", x, cursor + t.space.md + t.type.micro, width, t.color.muted) + t.space.sm;
    for (const line of view.controller) {
      cursor += ui.textBox(canvas, line, x, cursor + t.type.micro, width,
        { size: t.type.micro, maxLines: 2, lineHeight: lineHeight(t.type.micro), alpha: t.alpha.soft }).height;
    }
  }

  function guideTricks(view: Guide, x: number, y: number, width: number, nameW: number, pointsW: number,
    rowH: (text: string, width: number, size: number) => number): void {
    const { canvas } = context, t = ui.t, gold = ui.readable("#e0a326"), accent = ui.readable(t.color.accent);
    let cursor = ui.sectionLabel(canvas, "THE TRICK METER", x, y + t.type.micro, width) + t.space.sm;
    for (const trick of view.tricks) {
      const h = rowH(trick.description, width - nameW - pointsW, t.type.micro), baseline = cursor + t.type.label;
      ui.tag(canvas, trick.glyph, x, baseline, accent, "left", t.type.label);
      ui.displayText(canvas, trick.name, x + t.type.label + t.space.sm, baseline, t.type.label);
      ui.textBox(canvas, trick.description, x + nameW, baseline, width - nameW - pointsW,
        { size: t.type.micro, maxLines: 2, lineHeight: lineHeight(t.type.micro), alpha: t.alpha.muted });
      ui.tag(canvas, `+${String(trick.points)}`, x + width, baseline, trick.points >= 10 ? gold : accent, "right", t.type.label);
      cursor += h + t.space.sm;
    }
    cursor = ui.sectionLabel(canvas, "THE LADDER", x, cursor + t.space.md + t.type.micro, width) + t.space.sm;
    for (const tier of view.ladder) {
      const baseline = cursor + t.type.label;
      ui.bar(canvas, x, baseline - t.type.label / 2, Math.round(width * 0.3), 8, tier.fraction, t.color.accent);
      ui.text(canvas, tier.name, x + Math.round(width * 0.3) + t.space.md, baseline, t.type.label);
      ui.tag(canvas, `×${String(tier.multiplier)}`, x + width, baseline, tier.multiplier >= 4 ? gold : t.color.muted, "right", t.type.label);
      cursor += lineHeight(t.type.label) + t.space.sm;
    }
    ui.textBox(canvas, view.variety, x, cursor + t.type.micro, width,
      { size: t.type.micro, maxLines: 3, lineHeight: lineHeight(t.type.micro), alpha: t.alpha.muted });
  }

  return Object.freeze({ shop, codex });
}
