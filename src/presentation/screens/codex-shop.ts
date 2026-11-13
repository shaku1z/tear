import type { CodexScreenView, ScreenRenderContext, ShopScreenView } from "./contracts";
import { clipBody, page, pageFooter, tabs } from "./screen-primitives";
import { BESTIARY_CARD_HEIGHT, BESTIARY_ROW_PITCH } from "../codex-snapshots";
import { SHOP_LIST_TOP, SHOP_ROW_PITCH, SHOP_SECTION_GAP, SHOP_SECTION_HEAD } from "../shop-snapshot";
import { createCompactCodexShop } from "./compact-codex-shop";

type ShopItemView = ShopScreenView["sections"][number]["items"][number];
const SHOP_GOLD = "#e0a326",
  SHOP_COLUMN_WIDTH = 550,
  SHOP_BUY_WIDTH = 96,
  SHOP_BUY_HEIGHT = 40;

export function createCodexShopRenderers(context: ScreenRenderContext) {
  const { ui, width } = context;
  // Phone landscape (compact density) composes these screens as compact pages.
  const compact = createCompactCodexShop(context);

  function codex(view: CodexScreenView): void {
    if (ui.density.compact) {
      compact.codex(view);
      return;
    }
    const { canvas } = context;
    page(context, { title: "CODEX" });
    tabs(context, view.tabs, (id) => ({ type: "codex.selectTab", id }));
    const subtitle =
      view.tab === "abilities"
        ? "STACKS pile up  ·  ★ UNIQUE are one-time  ·  ✦ SPECIAL evolve a tier with every boss  —  click to step through tiers"
        : view.tab === "guide"
          ? "how to wield the blade"
          : "every foe — what it does, its stats, and the affixes it can roll";
    ui.text(canvas, subtitle, width / 2, 184, ui.t.type.caption, "center", ui.t.alpha.muted);
    if (view.filters && view.tab !== "guide") {
      const sortWidth = view.tab === "abilities" ? 170 : 0,
        gap = 8,
        chipWidth = view.tab === "abilities" ? 120 : 128;
      const total = view.filters.length * (chipWidth + gap) - gap + (sortWidth ? sortWidth + gap * 2 : 0);
      const start = (width - total) / 2;
      view.filters.forEach((filter, index) => {
        context.enqueue({
          x: start + index * (chipWidth + gap),
          y: 198,
          w: chipWidth,
          h: 32,
          chip: true,
          label: filter.label,
          selected: filter.id === view.filter,
          size: ui.t.type.micro,
          action: { type: "codex.selectFilter", id: filter.id },
        });
      });
      if (sortWidth)
        context.enqueue({
          x: start + view.filters.length * (chipWidth + gap) + gap,
          y: 198,
          w: sortWidth,
          h: 32,
          chip: true,
          label: `SORT: ${(view.sort ?? "category").toUpperCase()}`,
          action: { type: "codex.cycleSort" },
          size: ui.t.type.micro,
        });
    }
    if (view.tab === "guide" && view.guide) guide(view.guide);
    else if (view.tab === "bestiary") bestiaryGrid(view.cards);
    else abilityGrid(view);
    pageFooter(context, { canScrollUp: view.canScrollUp, canScrollDown: view.canScrollDown });
  }

  function abilityGrid(view: CodexScreenView): void {
    const { canvas } = context;
    const columns = 4,
      margin = 230,
      gap = 20,
      cardWidth = (width - margin * 2 - gap * 3) / columns;
    const cardHeight = 150,
      stride = 170,
      top = 244,
      visibleRows = 3;
    const offset = Math.max(0, Math.round(context.scroll / stride));
    view.cards.slice(offset * columns, (offset + visibleRows) * columns).forEach((card, localIndex) => {
      const column = localIndex % columns,
        row = Math.floor(localIndex / columns);
      const x = margin + column * (cardWidth + gap),
        y = top + row * stride;
      const accent = card.accent ?? ui.t.color.accent,
        accentInk = ui.readable(accent);
      const special = card.badge?.includes("SPECIAL") === true;
      const prized = special || card.badge?.includes("UNIQUE") === true;
      ui.card(canvas, x, y, cardWidth, cardHeight, context.focus === offset * columns + localIndex);
      ui.accentStrip(canvas, x, y, cardWidth, accent);
      if (special) specialGleam(x, y, cardWidth);
      const badgeWidth = card.badge ? cardBadge(card.badge, x, y, prized, special) : 0;
      if (card.category) {
        const category = ui.fitText(canvas, card.category, cardWidth - 36 - badgeWidth, {
          size: ui.t.type.micro,
          floor: ui.t.type.micro,
          bold: true,
        });
        ui.tag(
          canvas,
          category.lines[0] ?? card.category,
          x + cardWidth - 12,
          y + 28,
          accentInk,
          "right",
          ui.t.type.micro,
        );
      }
      const title = ui.fitText(canvas, card.label, cardWidth - 24, {
        size: ui.t.type.title,
        floor: ui.t.type.label,
        bold: true,
      });
      ui.displayText(canvas, title.lines[0] ?? card.label, x + 12, y + 58, title.size);
      const tierCount = card.tierCount ?? 1,
        tier = Math.max(0, Math.min(card.tier ?? 0, tierCount - 1));
      let descriptionY = y + 84;
      if (tierCount > 1) {
        for (let index = 0; index < tierCount; index += 1) {
          canvas.beginPath();
          canvas.arc(x + 17 + index * 16, y + 76, 5, 0, Math.PI * 2);
          if (index === tier) {
            canvas.fillStyle = accent;
            canvas.fill();
            canvas.strokeStyle = ui.ink;
            canvas.lineWidth = 1.2;
            canvas.stroke();
          } else {
            canvas.strokeStyle = accent;
            canvas.lineWidth = 2;
            canvas.stroke();
          }
        }
        ui.tag(
          canvas,
          tier === 0 ? "BASE" : `TIER ${String(tier + 1)}`,
          x + 19 + tierCount * 16,
          y + 81,
          accentInk,
          "left",
          ui.t.type.micro,
        );
        descriptionY = y + 102;
      }
      if (card.description)
        ui.textBox(canvas, card.description, x + 12, descriptionY, cardWidth - 24, {
          size: ui.t.type.micro,
          lineHeight: 17,
          maxLines: Math.max(1, Math.floor((y + cardHeight - 8 - descriptionY) / 17) + 1),
          alpha: ui.t.alpha.soft,
        });
      context.enqueue({
        x,
        y,
        w: cardWidth,
        h: cardHeight,
        label: "",
        hiddenBox: true,
        action: { type: "codex.inspect", id: card.id },
      });
    });
  }

  /** The gold edge on a SPECIAL card, with a white gleam travelling along it. */
  function specialGleam(x: number, y: number, cardWidth: number): void {
    const { canvas } = context;
    canvas.fillStyle = "#e8a32e";
    canvas.globalAlpha = 0.9;
    canvas.fillRect(x, y + 6, cardWidth, 3);
    const gleamX = x + ((context.time * 80 + (x % 200)) % (cardWidth + 60)) - 30;
    const gradient = canvas.createLinearGradient(gleamX - 30, 0, gleamX + 30, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    canvas.fillStyle = gradient;
    canvas.fillRect(x, y + 6, cardWidth, 3);
    canvas.globalAlpha = 1;
  }

  /** SPECIAL / UNIQUE cards get a filled badge, others a plain tag; returns the width it took. */
  function cardBadge(badge: string, x: number, y: number, prized: boolean, special: boolean): number {
    const { canvas } = context;
    if (prized)
      return ui.badge(canvas, badge, x + 12, y + 30, special ? "#a86a0c" : ui.readable(ui.t.color.unique), "left");
    ui.tag(canvas, badge, x + 12, y + 28, ui.t.color.muted, "left", ui.t.type.micro);
    canvas.font = ui.font(ui.t.type.micro, true);
    return canvas.measureText(badge).width;
  }

  // ---- bestiary (source codexTabBestiary + drawBestiaryEntry) ----
  function statChip(x: number, y: number, label: string, value: string): number {
    const { canvas } = context,
      t = ui.t;
    canvas.font = ui.font(t.type.micro, true);
    const labelWidth = canvas.measureText(label).width;
    canvas.font = ui.font(t.type.caption, true);
    const valueWidth = canvas.measureText(value).width;
    const w = Math.max(92, labelWidth + valueWidth + 28),
      h = 26;
    canvas.strokeStyle = "rgba(40,42,54,0.35)";
    canvas.lineWidth = 1.5;
    canvas.strokeRect(x, y, w, h);
    ui.tag(canvas, label, x + 9, y + 18, t.color.muted, "left", t.type.micro);
    canvas.fillStyle = ui.ink;
    canvas.font = ui.font(t.type.caption, true);
    canvas.textAlign = "right";
    canvas.textBaseline = "alphabetic";
    canvas.fillText(value, x + w - 9, y + 18);
    return x + w + 8;
  }

  function affixChip(x: number, y: number, id: string, color: string, limit: number): number {
    const { canvas } = context;
    const txt = id.toUpperCase();
    canvas.font = ui.font(ui.t.type.micro, true);
    const w = canvas.measureText(txt).width + 16;
    if (x + w > limit) return limit + 1;
    const ink = ui.readable(color);
    canvas.fillStyle = color;
    canvas.globalAlpha = 0.16;
    canvas.fillRect(x, y - 14, w, 19);
    canvas.globalAlpha = 1;
    canvas.strokeStyle = color;
    canvas.lineWidth = 1;
    canvas.strokeRect(x, y - 14, w, 19);
    canvas.fillStyle = ink;
    canvas.textAlign = "left";
    canvas.fillText(txt, x + 8, y);
    return x + w + 7;
  }

  function bestiaryEntry(card: CodexScreenView["cards"][number], x: number, y: number, w: number, h: number): void {
    const { canvas } = context,
      t = ui.t;
    const ac = card.accent ?? (card.boss ? t.color.danger : t.color.accent),
      acInk = ui.readable(ac);
    ui.panel(canvas, x, y, w, h);
    ui.spine(canvas, x, y, h, ac, 6);
    const bw = 116,
      bx = x + 16,
      by = y + 14;
    canvas.strokeStyle = "rgba(40,42,54,0.3)";
    canvas.lineWidth = 1.5;
    canvas.strokeRect(bx, by, bw, 116);
    if (card.previewId) context.renderPreview?.(card.previewId, { x: bx, y: by, w: bw, h: 116 });
    const ix = bx + bw + 20,
      rx = x + w - 16,
      textWidth = rx - ix;
    // name line: name, role, and (right) your tally with this foe
    let feltWidth = 0;
    if (card.felled)
      feltWidth = ui.badge(canvas, card.felled.label, rx, y + 30, ui.readable(card.felled.color), "right") + 12;
    const name = ui.fitText(canvas, card.label, textWidth - feltWidth - 40, {
      size: t.type.lead,
      floor: t.type.label,
      bold: true,
    });
    ui.displayText(canvas, name.lines[0] ?? card.label, ix, y + 30, name.size);
    canvas.font = ui.font(name.size, true);
    const nameWidth = canvas.measureText(name.lines[0] ?? card.label).width;
    if (card.category) {
      const role = ui.fitText(canvas, card.category, textWidth - feltWidth - nameWidth - 14, {
        size: t.type.micro,
        floor: t.type.micro,
        bold: true,
      });
      ui.tag(canvas, role.lines[0] ?? "", ix + nameWidth + 14, y + 30, acInk, "left", t.type.micro);
    }
    let sx = ix;
    for (const stat of card.stats ?? []) sx = statChip(sx, y + 40, stat.label, stat.value);
    // description + variants share a measured block, so neither can run into the other
    // Description and variants share one measured block above the bottom row: the
    // variants line always gets the lines the description leaves (at least two).
    const bottomRow = y + h - 8,
      blockTop = y + 82,
      blockBottom = bottomRow - 17,
      lineHeight = 15;
    const blockLines = Math.floor((blockBottom - blockTop) / lineHeight) + 1;
    const variantLines = card.variants ? 2 : 0;
    const description = ui.textBox(canvas, card.description ?? "", ix, blockTop, textWidth, {
      size: t.type.micro,
      lineHeight,
      alpha: t.alpha.soft,
      maxLines: Math.max(1, blockLines - variantLines),
    });
    if (card.variants) {
      const variantsY = blockTop + description.height;
      ui.textBox(canvas, "Variants: " + card.variants, ix, variantsY, textWidth, {
        size: t.type.micro,
        lineHeight,
        alpha: t.alpha.muted,
        maxLines: Math.max(1, Math.floor((blockBottom - variantsY) / lineHeight) + 1),
      });
    }
    if (card.boss) {
      ui.tag(
        canvas,
        "MULTI-PHASE — attacks escalate as its health falls",
        ix,
        bottomRow,
        ui.readable(t.color.danger),
        "left",
        t.type.micro,
      );
    } else if (card.affixes && card.affixes.length > 0) {
      canvas.font = ui.font(t.type.micro, true);
      canvas.fillStyle = t.color.muted;
      canvas.textAlign = "left";
      canvas.textBaseline = "alphabetic";
      canvas.fillText("CAN ROLL", ix, bottomRow);
      let axx = ix + canvas.measureText("CAN ROLL").width + 12;
      for (const affix of card.affixes) axx = affixChip(axx, bottomRow, affix.id, affix.color, rx);
    }
  }

  function bestiaryGrid(cards: CodexScreenView["cards"]): void {
    const cols = 2,
      mx = 230,
      gap = 24,
      cardW = (width - mx * 2 - gap) / cols,
      cardH = BESTIARY_CARD_HEIGHT,
      stride = BESTIARY_ROW_PITCH,
      top = 244,
      vis = 3;
    const gridRows = Math.ceil(cards.length / cols),
      maxOff = Math.max(0, gridRows - vis);
    const off = Math.max(0, Math.min(maxOff, Math.round(context.scroll / stride)));
    for (let r = 0; r < vis; r += 1)
      for (let c = 0; c < cols; c += 1) {
        const index = (off + r) * cols + c;
        const card = cards[index];
        if (card === undefined) continue;
        bestiaryEntry(card, mx + c * (cardW + gap), top + r * stride, cardW, cardH);
      }
  }

  function guide(view: NonNullable<CodexScreenView["guide"]>): void {
    const { canvas } = context;
    const left = 250,
      leftWidth = 500,
      right = 830,
      rightWidth = 520;
    let y = ui.sectionLabel(canvas, "CONTROLS", left, 226, leftWidth) + 20;
    for (const row of view.controls) {
      ui.tag(canvas, row.keys.join(" + "), left, y, ui.readable(ui.t.color.accent), "left", ui.t.type.micro);
      ui.textBox(canvas, row.description, left + 150, y, leftWidth - 150, {
        size: ui.t.type.label,
        alpha: ui.t.alpha.soft,
        maxLines: 1,
      });
      y += 40;
    }
    ui.divider(canvas, left, y - 20, leftWidth, 0.14);
    ui.tag(canvas, "CONTROLLER", left, y + 4, ui.t.color.muted, "left", ui.t.type.micro);
    let controllerY = y + 4;
    view.controller.forEach((line) => {
      controllerY += ui.textBox(canvas, line, left + 130, controllerY, leftWidth - 130, {
        size: ui.t.type.micro,
        lineHeight: 18,
        alpha: ui.t.alpha.soft,
        maxLines: 2,
      }).height;
    });
    let trickY = ui.sectionLabel(canvas, "THE TRICK METER", right, 226, rightWidth) + 20;
    for (const trick of view.tricks) {
      ui.tag(canvas, trick.glyph, right, trickY, ui.readable(ui.t.color.accent), "left", ui.t.type.label);
      ui.displayText(canvas, trick.name, right + 28, trickY, ui.t.type.label);
      ui.textBox(canvas, trick.description, right + 150, trickY, rightWidth - 150 - 44, {
        size: ui.t.type.micro,
        alpha: ui.t.alpha.muted,
        maxLines: 1,
      });
      ui.tag(
        canvas,
        `+${String(trick.points)}`,
        right + rightWidth,
        trickY,
        trick.points >= 10 ? ui.readable("#e0a326") : ui.readable(ui.t.color.accent),
        "right",
        ui.t.type.label,
      );
      trickY += 30;
    }
    trickY = ui.sectionLabel(canvas, "THE LADDER", right, trickY + 14, rightWidth) + 18;
    for (const tier of view.ladder) {
      ui.bar(canvas, right, trickY - 10, 200, 8, tier.fraction, ui.t.color.accent);
      ui.text(canvas, tier.name, right + 216, trickY, ui.t.type.label);
      ui.tag(
        canvas,
        `×${String(tier.multiplier)}`,
        right + rightWidth,
        trickY,
        tier.multiplier >= 4 ? ui.readable("#e0a326") : ui.t.color.muted,
        "right",
        ui.t.type.label,
      );
      trickY += 26;
    }
    ui.textBox(canvas, view.variety, right, trickY + 8, rightWidth, {
      size: ui.t.type.micro,
      alpha: ui.t.alpha.muted,
      maxLines: 2,
    });
  }

  /** One upgrade card: icon tile, name and level, pips, description and the BUY button (hidden while scrolled out). */
  function shopItemRow(
    item: ShopItemView,
    x: number,
    y: number,
    goldInk: string,
    viewTop: number,
    viewBottom: number,
  ): void {
    const { canvas } = context;
    const gold = SHOP_GOLD,
      columnWidth = SHOP_COLUMN_WIDTH;
    const buttonWidth = SHOP_BUY_WIDTH,
      buttonHeight = SHOP_BUY_HEIGHT,
      textRight = columnWidth - buttonWidth - 24;
    const level = item.level ?? 0,
      maximumLevel = item.maxLevel ?? 0;
    const maxed = maximumLevel > 0 && level >= maximumLevel;
    const cardHeight = SHOP_ROW_PITCH - 10;
    ui.card(canvas, x, y, columnWidth, cardHeight, false);
    canvas.globalAlpha = level > 0 ? 0.16 : 0.055;
    canvas.fillStyle = level > 0 ? gold : ui.ink;
    canvas.fillRect(x + 10, y + 10, 44, 44);
    canvas.globalAlpha = 1;
    if (item.flash && item.flash > 0) {
      canvas.globalAlpha = item.flash * 0.3;
      canvas.fillStyle = gold;
      canvas.fillRect(x, y, columnWidth, cardHeight);
      canvas.globalAlpha = 1;
    }
    ui.tag(canvas, item.glyph ?? "◆", x + 32, y + 41, level > 0 ? goldInk : ui.t.color.muted, "center", 22);
    canvas.font = ui.font(ui.t.type.body, true);
    const name = ui.fitText(canvas, item.label, textRight - 66 - 150, {
      size: ui.t.type.body,
      floor: ui.t.type.label,
      bold: true,
    });
    ui.displayText(canvas, name.lines[0] ?? item.label, x + 66, y + 26, name.size);
    canvas.font = ui.font(name.size, true);
    const nameWidth = canvas.measureText(name.lines[0] ?? item.label).width;
    if (maximumLevel > 0) {
      const levelInk = level > 0 ? goldInk : ui.t.color.muted;
      ui.tag(
        canvas,
        `LV ${String(level)}/${String(maximumLevel)}`,
        x + 78 + nameWidth,
        y + 26,
        levelInk,
        "left",
        ui.t.type.micro,
      );
      ui.pips(canvas, x + textRight, y + 21, maximumLevel, level, gold);
    }
    if (item.description) {
      ui.textBox(canvas, item.description, x + 66, y + 47, textRight - 66, {
        size: ui.t.type.micro,
        lineHeight: 17,
        alpha: ui.t.alpha.soft,
        maxLines: 2,
      });
    }
    const buttonY = y + (cardHeight - buttonHeight) / 2;
    const visible = buttonY >= viewTop && buttonY + buttonHeight <= viewBottom;
    const canBuy = !maxed && item.enabled !== false;
    context.enqueue({
      x: x + columnWidth - buttonWidth - 10,
      y: buttonY,
      w: buttonWidth,
      h: buttonHeight,
      label: maxed ? "MAX" : (item.cost ?? "BUY"),
      selected: maxed,
      enabled: visible && canBuy,
      hiddenBox: !visible,
      accent: canBuy ? gold : undefined,
      action: { type: "shop.buy", id: item.id },
      size: ui.t.type.caption,
    });
  }

  function shop(view: ShopScreenView): void {
    if (ui.density.compact) {
      compact.shop(view);
      return;
    }
    const { canvas } = context;
    const gold = SHOP_GOLD,
      goldInk = ui.readable(gold);
    const layout = page(context, {
      title: "SHOP",
      subtitle: "permanent upgrades — applied at the start of every run",
      hue: gold,
      stat: { value: view.coins.toLocaleString("en-US"), label: "COINS", color: goldInk, glyph: "◆" },
    });
    // One status row under the header: the first-run hint replaces the ledger totals.
    const statusY = layout.bodyTop + 6;
    if (view.onboarding)
      ui.text(canvas, view.onboarding, width / 2, statusY, ui.t.type.caption, "center", ui.t.alpha.soft);
    else
      ui.tag(
        canvas,
        `${String(view.ownedLevels)} / ${String(view.totalLevels)} LEVELS OWNED   ·   LIFETIME EARNED ◆ ${view.lifetimeEarned.toLocaleString("en-US")}`,
        width / 2,
        statusY,
        ui.t.color.muted,
        "center",
        ui.t.type.micro,
      );
    const columnX = [layout.left, layout.left + 570] as const,
      columnWidth = SHOP_COLUMN_WIDTH;
    const viewTop = SHOP_LIST_TOP,
      viewBottom = layout.bodyBottom;
    const split = Math.ceil(view.sections.length / 2);
    const columns = [view.sections.slice(0, split), view.sections.slice(split)] as const;
    clipBody(context, viewTop - 4, viewBottom, () => {
      columns.forEach((sections, column) => {
        const x = columnX[column] ?? columnX[0];
        let y = viewTop + 14 - context.scroll;
        sections.forEach((section, localSection) => {
          y =
            ui.sectionLabel(canvas, `${section.label}  ·  ${String(section.items.length)}`, x, y, columnWidth, gold) +
            SHOP_SECTION_HEAD -
            18;
          section.items.forEach((item) => {
            shopItemRow(item, x, y, goldInk, viewTop, viewBottom);
            y += SHOP_ROW_PITCH;
          });
          if (localSection < sections.length - 1) y += SHOP_SECTION_GAP;
        });
      });
    });
    pageFooter(context, { canScrollUp: view.canScrollUp, canScrollDown: view.canScrollDown });
  }

  return { codex, shop };
}
