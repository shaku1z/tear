import type { CodexScreenView, ScreenRenderContext, ShopScreenView } from "./contracts";
import { backControl, ellipsize, scrollHint, tabs } from "./screen-primitives";

export function createCodexShopRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function codex(view: CodexScreenView): void {
    const { canvas } = context;
    ui.title(canvas, "CODEX", width / 2, 92, ui.t.type.h1);
    canvas.fillStyle = ui.t.color.accent; canvas.globalAlpha = context.enterAmount;
    canvas.fillRect(width / 2 - 65 * context.enterAmount, 108, 130 * context.enterAmount, 3); canvas.globalAlpha = 1;
    tabs(context, view.tabs, (id) => ({ type: "codex.selectTab", id }));
    if (view.tab === "abilities") {
      ui.text(canvas, "STACKS pile up  ·  ★ UNIQUE are one-time  ·  ✦ SPECIAL evolve a tier with every boss  —  click a card to read its tiers",
        width / 2, 186, ui.t.type.caption, "center", ui.t.alpha.muted);
      if (view.filters) {
        const chipWidth = 112;
        const start = (width - (view.filters.length * chipWidth + (view.filters.length - 1) * 6 + 150)) / 2;
        view.filters.forEach((filter, index) => { context.enqueue({
          x: start + index * (chipWidth + 6), y: 200, w: chipWidth, h: 30,
          label: filter.label, selected: filter.id === view.filter,
          action: { type: "codex.selectFilter", id: filter.id }, size: 11,
        }); });
        context.enqueue({
          x: start + view.filters.length * (chipWidth + 6) + 8, y: 200, w: 150, h: 30,
          label: `SORT: ${(view.sort ?? "category").toUpperCase()}`, action: { type: "codex.cycleSort" }, size: 11,
        });
      }
    } else {
      const subtitle = view.tab === "guide" ? "HOW TO WIELD THE BLADE"
        : "every foe — what it does, its stats, and the affixes it can roll";
      ui.text(canvas, subtitle, width / 2, 186, ui.t.type.caption, "center", ui.t.alpha.muted);
      if (view.tab === "bestiary" && view.filters) {
        const chipWidth = 120, gap = 8;
        const start = (width - (view.filters.length * chipWidth + (view.filters.length - 1) * gap)) / 2;
        view.filters.forEach((filter, index) => { context.enqueue({
          x: start + index * (chipWidth + gap), y: 200, w: chipWidth, h: 30,
          label: filter.label, selected: filter.id === view.filter, size: 11,
          action: { type: "codex.selectFilter", id: filter.id },
        }); });
      }
    }
    if (view.tab === "guide" && view.guide) {
      guide(view.guide);
      backControl(context);
      return;
    }
    if (view.tab === "bestiary") bestiaryGrid(view.cards);
    else abilityGrid(view);
    backControl(context);
  }

  function abilityGrid(view: CodexScreenView): void {
    const { canvas } = context;
    const columns = 4, margin = 210, gap = 20, cardWidth = (width - margin * 2 - gap * 3) / columns;
    const cardHeight = 150, stride = 170, top = 244, visibleRows = 3;
    const offset = Math.max(0, Math.round(context.scroll / stride));
    view.cards.slice(offset * columns, (offset + visibleRows) * columns).forEach((card, localIndex) => {
      const column = localIndex % columns, row = Math.floor(localIndex / columns);
      const x = margin + column * (cardWidth + gap), y = top + row * stride;
      const accent = card.accent ?? ui.t.color.accent;
      const special = card.badge?.includes("SPECIAL") === true;
      const prized = special || card.badge?.includes("UNIQUE") === true;
      ui.card(canvas, x, y, cardWidth, cardHeight, context.focus === offset * columns + localIndex);
      ui.accentStrip(canvas, x, y, cardWidth, accent);
      if (special) {
        canvas.fillStyle = "#e8a32e"; canvas.globalAlpha = 0.9; canvas.fillRect(x, y + 6, cardWidth, 3);
        const gleamX = x + ((context.time * 80 + x % 200) % (cardWidth + 60)) - 30;
        const gradient = canvas.createLinearGradient(gleamX - 30, 0, gleamX + 30, 0);
        gradient.addColorStop(0, "rgba(255,255,255,0)"); gradient.addColorStop(0.5, "rgba(255,255,255,0.85)");
        gradient.addColorStop(1, "rgba(255,255,255,0)"); canvas.fillStyle = gradient; canvas.fillRect(x, y + 6, cardWidth, 3);
        canvas.globalAlpha = 1;
      }
      if (card.badge) {
        if (prized) ui.badge(canvas, card.badge, x + 12, y + 28, special ? "#e8a32e" : ui.t.color.unique, "left");
        else ui.tag(canvas, card.badge, x + 12, y + 26, ui.t.color.muted, "left", ui.t.type.micro);
      }
      if (card.category) ui.tag(canvas, card.category, x + cardWidth - 12, y + 26, accent, "right", ui.t.type.micro);
      canvas.fillStyle = ui.ink; canvas.textAlign = "left"; canvas.textBaseline = "alphabetic";
      let titleSize = ui.t.type.title; canvas.font = ui.font(titleSize, true);
      while (canvas.measureText(card.label).width > cardWidth - 24 && titleSize > ui.t.type.caption) {
        titleSize -= 1; canvas.font = ui.font(titleSize, true);
      }
      canvas.fillText(card.label, x + 12, y + 54);
      const tierCount = card.tierCount ?? 1, tier = Math.max(0, Math.min(card.tier ?? 0, tierCount - 1));
      for (let index = 0; index < tierCount; index += 1) {
        canvas.beginPath(); canvas.arc(x + 17 + index * 16, y + 73, 5, 0, Math.PI * 2);
        if (index === tier) { canvas.fillStyle = accent; canvas.fill(); canvas.strokeStyle = ui.ink; canvas.lineWidth = 1.2; canvas.stroke(); }
        else { canvas.strokeStyle = accent; canvas.lineWidth = 2; canvas.stroke(); }
      }
      if (tierCount > 1) ui.tag(canvas, tier === 0 ? "BASE" : `TIER ${String(tier + 1)}`, x + 19 + tierCount * 16, y + 77, accent, "left", ui.t.type.micro);
      if (card.description) ui.wrappedText(canvas, card.description, x + 12, y + 99, cardWidth - 24, 17, ui.t.type.micro, "left");
      if (tierCount > 1) ui.tag(canvas, "click to step through tiers", x + cardWidth / 2, y + cardHeight - 8, ui.t.color.muted, "center", ui.t.type.micro);
      context.enqueue({ x, y, w: cardWidth, h: cardHeight, label: "", hiddenBox: true,
        action: { type: "codex.inspect", id: card.id } });
    });
    scrollHint(context, view.canScrollUp, view.canScrollDown, top + visibleRows * stride + 2);
  }

  // ---- bestiary (source codexTabBestiary + drawBestiaryEntry) ----
  function wrapLeft(text: string, x: number, y: number, maxW: number, lineHeight: number, size: number, alpha?: number): number {
    const { canvas } = context;
    canvas.font = ui.font(size, false); canvas.textAlign = "left"; canvas.fillStyle = ui.ink;
    canvas.globalAlpha = alpha ?? 1;
    const words = text.split(" "); let line = "", yy = y;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (canvas.measureText(test).width > maxW && line) { canvas.fillText(line, x, yy); line = word; yy += lineHeight; }
      else line = test;
    }
    if (line) canvas.fillText(line, x, yy);
    canvas.globalAlpha = 1; return yy;
  }

  function statChip(x: number, y: number, label: string, value: string): number {
    const { canvas } = context, t = ui.t, w = 92, h = 26;
    canvas.strokeStyle = t.color.disabled ?? "#bbb"; canvas.lineWidth = 1.5; canvas.strokeRect(x, y, w, h);
    ui.tag(canvas, label, x + 9, y + 17, t.color.muted, "left", t.type.micro);
    canvas.fillStyle = ui.ink; canvas.font = ui.font(t.type.caption, true); canvas.textAlign = "right"; canvas.textBaseline = "alphabetic";
    canvas.fillText(value, x + w - 9, y + 17);
    return x + w + 8;
  }

  function affixChip(x: number, y: number, id: string, color: string): number {
    const { canvas } = context;
    const txt = id.toUpperCase();
    canvas.font = ui.font(ui.t.type.micro, true); const w = canvas.measureText(txt).width + 16;
    canvas.fillStyle = color; canvas.globalAlpha = 0.16; canvas.fillRect(x, y - 13, w, 18); canvas.globalAlpha = 1;
    canvas.strokeStyle = color; canvas.lineWidth = 1; canvas.strokeRect(x, y - 13, w, 18);
    canvas.fillStyle = color; canvas.textAlign = "left"; canvas.fillText(txt, x + 8, y);
    return x + w + 7;
  }

  function bestiaryEntry(card: CodexScreenView["cards"][number], x: number, y: number, w: number, h: number): void {
    const { canvas } = context, t = ui.t;
    const ac = card.accent ?? (card.boss ? t.color.danger : t.color.accent);
    ui.panel(canvas, x, y, w, h);
    ui.spine(canvas, x, y, h, ac, 6);
    // your history with this foe: boss pantheon FELLED seal / per-kind tally
    if (card.felled) ui.badge(canvas, card.felled.label, x + w - 14, y + h - 14, card.felled.color, "right");
    // preview (sized for the 150-tall card)
    const bw = 116, bx = x + 16, by = y + (h - 116) / 2;
    canvas.strokeStyle = t.color.disabled ?? "#bbb"; canvas.lineWidth = 1.5; canvas.strokeRect(bx, by, bw, 116);
    if (card.previewId) context.renderPreview?.(card.previewId, { x: bx, y: by, w: bw, h: 116 });
    // header line: name + role
    const ix = bx + bw + 20, rx = x + w;
    canvas.fillStyle = ui.ink; canvas.font = ui.font(t.type.lead, true); canvas.textAlign = "left"; canvas.textBaseline = "alphabetic";
    const nameW = canvas.measureText(card.label).width;
    canvas.fillText(card.label, ix, y + 30);
    if (card.category) ui.tag(canvas, card.category, ix + nameW + 14, y + 30, ac, "left", t.type.micro);
    // stat chips
    let sx = ix;
    for (const stat of card.stats ?? []) sx = statChip(sx, y + 40, stat.label, stat.value);
    // description (micro; even a 3-line wrap clears the VARIANTS row below)
    wrapLeft(card.description ?? "", ix, y + 78, rx - ix - 24, 17, t.type.micro, t.alpha.soft);
    // variants line
    if (card.variants) ui.tag(canvas, "VARIANTS:  " + card.variants, ix, y + h - 30, t.color.muted, "left", t.type.micro);
    // bottom line: affix chips (mobs) or a phase note (bosses)
    if (card.boss) {
      ui.tag(canvas, "MULTI-PHASE  —  attacks escalate as its health falls", ix, y + h - 12, t.color.danger, "left", t.type.micro);
    } else if (card.affixes) {
      canvas.font = ui.font(t.type.micro, true); canvas.fillStyle = t.color.muted; canvas.textAlign = "left"; canvas.textBaseline = "alphabetic";
      canvas.fillText("CAN ROLL:", ix, y + h - 12);
      let axx = ix + canvas.measureText("CAN ROLL:").width + 12;
      for (const affix of card.affixes) axx = affixChip(axx, y + h - 12, affix.id, affix.color);
    }
  }

  function bestiaryGrid(cards: CodexScreenView["cards"]): void {
    const { canvas } = context, t = ui.t;
    const cols = 2, mx = 210, gap = 24, cardW = (width - mx * 2 - gap) / cols, cardH = 150, stride = cardH + 16, top = 244, vis = 3;
    const gridRows = Math.ceil(cards.length / cols), maxOff = Math.max(0, gridRows - vis);
    const off = Math.max(0, Math.min(maxOff, Math.round(context.scroll / stride)));
    for (let r = 0; r < vis; r += 1) for (let c = 0; c < cols; c += 1) {
      const index = (off + r) * cols + c;
      const card = cards[index];
      if (card === undefined) continue;
      bestiaryEntry(card, mx + c * (cardW + gap), top + r * stride, cardW, cardH);
    }
    if (maxOff > 0) ui.scrollHint(canvas, width / 2, top + vis * stride - 14, off > 0, off < maxOff);
    ui.tag(canvas, "affixes: up to 3 per enemy, each ≈ (wave−1)×6% per slot — chaos scales with the wave",
      width / 2, top + vis * stride + 4, t.color.muted, "center", t.type.micro);
  }

  function guide(view: NonNullable<CodexScreenView["guide"]>): void {
    const { canvas } = context;
    const left = 250, leftWidth = 480, right = 830, rightWidth = 520;
    let y = ui.sectionLabel(canvas, "CONTROLS", left, 226, leftWidth) + 22;
    for (const row of view.controls) {
      ui.tag(canvas, row.keys.join(" + "), left, y, ui.t.color.accent, "left", ui.t.type.micro);
      ui.text(canvas, row.description, left + 172, y, ui.t.type.label, "left", ui.t.alpha.soft);
      y += 44;
    }
    ui.divider(canvas, left, y - 22, leftWidth, 0.1);
    ui.tag(canvas, "CONTROLLER", left, y + 2, ui.t.color.muted, "left", ui.t.type.micro);
    view.controller.forEach((line, index) => { ui.text(canvas, line, left + 130, y + 2 + index * 20, ui.t.type.micro, "left", ui.t.alpha.soft); });
    let trickY = ui.sectionLabel(canvas, "THE TRICK METER", right, 226, rightWidth) + 22;
    for (const trick of view.tricks) {
      ui.tag(canvas, trick.glyph, right, trickY, ui.t.color.accent, "left", ui.t.type.label);
      ui.text(canvas, trick.name, right + 30, trickY, ui.t.type.label);
      ui.text(canvas, trick.description, right + 176, trickY, ui.t.type.micro, "left", ui.t.alpha.muted);
      ui.tag(canvas, `+${String(trick.points)}`, right + rightWidth, trickY, trick.points >= 10 ? "#e0a326" : ui.t.color.accent, "right", ui.t.type.label);
      trickY += 31;
    }
    trickY = ui.sectionLabel(canvas, "THE LADDER", right, trickY + 16, rightWidth) + 20;
    for (const tier of view.ladder) {
      ui.bar(canvas, right, trickY - 10, 220, 8, tier.fraction, ui.t.color.accent);
      ui.text(canvas, tier.name, right + 236, trickY, ui.t.type.label);
      ui.tag(canvas, `×${String(tier.multiplier)}`, right + rightWidth, trickY, tier.multiplier >= 4 ? "#e0a326" : ui.t.color.muted, "right", ui.t.type.label);
      trickY += 27;
    }
    ui.text(canvas, view.variety, right, trickY + 10, ui.t.type.micro, "left", ui.t.alpha.muted);
  }

  function shop(view: ShopScreenView): void {
    const { canvas } = context;
    const gold = "#e0a326";
    ui.header(canvas, "SHOP", "permanent upgrades — applied at the start of every run", context.enterAmount, gold);
    canvas.save(); canvas.textAlign = "right"; canvas.textBaseline = "alphabetic";
    canvas.fillStyle = gold; canvas.font = ui.font(ui.t.type.h1, true);
    const balance = view.coins.toLocaleString(), balanceWidth = canvas.measureText(balance).width;
    canvas.fillText(balance, width - 220, 108);
    canvas.font = ui.font(ui.t.type.title, true); canvas.fillText("◆", width - 220 - balanceWidth - 14, 108);
    canvas.restore();
    ui.tag(canvas, "COINS", width - 220, 130, ui.t.color.muted, "right", ui.t.type.micro);
    ui.tag(canvas, `${String(view.ownedLevels)} / ${String(view.totalLevels)} LEVELS OWNED   ·   LIFETIME EARNED ◆ ${view.lifetimeEarned.toLocaleString()}`,
      240, 130, ui.t.color.muted, "left", ui.t.type.micro);
    const columnX = [240, 830] as const, columnWidth = 550, cardHeight = 62, rowHeight = 74;
    const viewTop = 158, viewBottom = height - 104;
    const split = Math.ceil(view.sections.length / 2);
    const columns = [view.sections.slice(0, split), view.sections.slice(split)] as const;
    canvas.save(); canvas.beginPath(); canvas.rect(210, viewTop, width - 420, viewBottom - viewTop); canvas.clip();
    columns.forEach((sections, column) => {
      const x = columnX[column] ?? columnX[0];
      let y = 176 - context.scroll;
      sections.forEach((section, localSection) => {
        y = ui.sectionLabel(canvas, section.label, x, y, columnWidth, gold) + 6;
        section.items.forEach((item) => {
          const visible = y + cardHeight >= viewTop && y <= viewBottom;
          const level = item.level ?? 0, maximumLevel = item.maxLevel ?? 0;
          const maxed = maximumLevel > 0 && level >= maximumLevel;
          ui.card(canvas, x, y, columnWidth, cardHeight, false);
          canvas.globalAlpha = level > 0 ? 0.16 : 0.055; canvas.fillStyle = level > 0 ? gold : ui.ink;
          canvas.fillRect(x + 10, y + 9, 44, 44); canvas.globalAlpha = 1;
          if (item.flash && item.flash > 0) { canvas.globalAlpha = item.flash * 0.3; canvas.fillStyle = gold; canvas.fillRect(x, y, columnWidth, cardHeight); canvas.globalAlpha = 1; }
          ui.tag(canvas, item.glyph ?? "◆", x + 32, y + 40, level > 0 ? gold : ui.t.color.muted, "center", 22);
          ui.text(canvas, item.label, x + 66, y + 24, ui.t.type.body);
          if (maximumLevel > 0) {
            const nameWidth = canvas.measureText(item.label).width;
            ui.tag(canvas, `LV ${String(level)}/${String(maximumLevel)}`, Math.min(x + 306, x + 80 + nameWidth), y + 24, level > 0 ? gold : ui.t.color.muted, "left", ui.t.type.micro);
            ui.pips(canvas, x + columnWidth - 118, y + 31, maximumLevel, level, gold);
          }
          if (item.description) {
            canvas.font = ui.font(ui.t.type.micro, false);
            ui.text(canvas, ellipsize(canvas, item.description, columnWidth - 306), x + 66, y + 45, ui.t.type.micro, "left", ui.t.alpha.soft);
          }
          const canBuy = !maxed && item.enabled !== false;
          context.enqueue({
            x: x + 446, y: y + 11, w: 94, h: 40, label: maxed ? "MAX" : (item.cost ?? "BUY"),
            selected: maxed, enabled: visible && canBuy, hiddenBox: !visible, accent: canBuy ? gold : undefined,
            action: { type: "shop.buy", id: item.id }, size: 13,
          });
          y += rowHeight;
        });
        if (localSection < sections.length - 1) y += 12;
      });
    });
    canvas.restore();
    scrollHint(context, view.canScrollUp, view.canScrollDown, height - 96);
    backControl(context);
  }

  return { codex, shop };
}
