import type { CodexScreenView, ScreenRenderContext, ShopScreenView } from "./contracts";
import { backControl, cardGrid, scrollHint, tabs } from "./screen-primitives";

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
      const subtitle = view.tab === "guide" ? "HOW TO WIELD THE BLADE" : "ENEMIES, BOSSES, AND THEIR COUNTERPLAY";
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
    cardGrid(context, view.cards, (id) => ({ type: "codex.inspect", id }), { top: 244, columns: view.tab === "bestiary" ? 2 : 4 });
    scrollHint(context, view.canScrollUp, view.canScrollDown);
    backControl(context);
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
    ui.tag(canvas, "COINS", width - 220, 130, ui.t.color.muted, "right", ui.t.type.micro);
    ui.title(canvas, view.coins.toLocaleString(), width - 220, 108, ui.t.type.h1);
    ui.tag(canvas, `${String(view.ownedLevels)} / ${String(view.totalLevels)} LEVELS OWNED   ·   LIFETIME EARNED ◆ ${view.lifetimeEarned.toLocaleString()}`,
      240, 130, ui.t.color.muted, "left", ui.t.type.micro);
    const columnX = [240, 830];
    view.sections.forEach((section, sectionIndex) => {
      const column = sectionIndex < Math.ceil(view.sections.length / 2) ? 0 : 1;
      const localSection = column === 0 ? sectionIndex : sectionIndex - Math.ceil(view.sections.length / 2);
      let y = 176 + localSection * 300 - context.scroll;
      y = ui.sectionLabel(canvas, section.label, columnX[column] ?? 240, y, 550, gold) + 6;
      section.items.forEach((item) => {
        const x = columnX[column] ?? 240;
        ui.card(canvas, x, y, 550, 62, false);
        if (item.flash && item.flash > 0) { canvas.globalAlpha = item.flash; canvas.fillStyle = gold; canvas.fillRect(x, y, 550, 62); canvas.globalAlpha = 1; }
        ui.tag(canvas, item.glyph ?? "◆", x + 32, y + 40, item.level ? gold : ui.t.color.muted, "center", 22);
        ui.text(canvas, item.label, x + 66, y + 24, ui.t.type.body);
        if (item.level !== undefined && item.maxLevel !== undefined) ui.tag(canvas, `LV ${String(item.level)}/${String(item.maxLevel)}`, x + 250, y + 24, item.level ? gold : ui.t.color.muted, "left", ui.t.type.micro);
        if (item.description) ui.text(canvas, item.description, x + 66, y + 45, ui.t.type.micro, "left", ui.t.alpha.soft);
        const maxed = item.level !== undefined && item.maxLevel !== undefined && item.level >= item.maxLevel;
        if (item.level !== undefined && item.maxLevel !== undefined) {
          const right = x + 430, gap = 11, start = right - (item.maxLevel - 1) * gap;
          for (let pip = 0; pip < item.maxLevel; pip++) {
            canvas.beginPath(); canvas.arc(start + pip * gap, y + 31, 3.5, 0, Math.PI * 2);
            if (pip < item.level) { canvas.fillStyle = gold; canvas.fill(); }
            else { canvas.strokeStyle = ui.t.color.muted; canvas.lineWidth = 1; canvas.stroke(); }
          }
        }
        context.enqueue({
          x: x + 446, y: y + 11, w: 94, h: 40, label: maxed ? "MAX" : (item.cost ?? "BUY"),
          selected: maxed, enabled: !maxed && item.enabled !== false, accent: !maxed && item.enabled !== false ? gold : undefined,
          action: { type: "shop.buy", id: item.id }, size: 13,
        });
        y += 74;
      });
    });
    scrollHint(context, view.canScrollUp, view.canScrollDown, height - 96);
    backControl(context);
  }

  return { codex, shop };
}
