import type { PlaygroundScreenView, ScreenRenderContext } from "./contracts";
import { backControl, scrollHint } from "./screen-primitives";

export function createPlaygroundRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function render(view: PlaygroundScreenView): void {
    const { canvas } = context;
    // Source dim/header values (ee5e931): 0.88 over the frozen arena on the build
    // menu, 0.9 in the lab, and the default accent — not a forced purple hue.
    ui.dim(canvas, width, height, view.id === "pgmenu" ? 0.88 : 0.9);
    ui.header(canvas, view.title, view.subtitle, context.enterAmount);
    if (view.id === "pgmenu") renderBuildMenu(view);
    else renderAbilityLab(view);
    scrollHint(context, view.canScrollUp, view.canScrollDown);
    // The build menu resumes through its own RESUME button (and Tab / Esc); only
    // the lab carries a back control, which returns to the build menu.
    if (view.id === "pglab") backControl(context, { type: "navigate", to: "pgmenu" });
  }

  function enqueueChoice(choice: PlaygroundScreenView["sections"][number]["choices"][number], x: number, y: number, w: number, h = 42, size?: number): void {
    context.enqueue({ x, y, w, h, label: choice.label, glyph: choice.glyph, sub: choice.sub ?? choice.description,
      selected: choice.selected, enabled: choice.enabled, accent: choice.accent, size,
      action: { type: "playground.action", id: choice.id } });
  }

  // The source build menu (ee5e931 js/game.js renderPgMenu): a bespoke two-column
  // board — enemies/spawn modifiers/difficulty on the left, bosses/arena/weapons on
  // the right, toggles and actions in a bottom band. Section headings are plain
  // accent tags (no divider rule), matching the source.
  function renderBuildMenu(view: PlaygroundScreenView): void {
    const sections = new Map(view.sections.map((section) => [section.label, section]));
    const { canvas } = context, t = ui.t, accent = t.color.accent;
    const left = width / 2 - 620, right = width / 2 + 20, columnWidth = 600, bh = 42, gap = 10;
    const tag = (label: string, x: number, y: number): void => { ui.tag(canvas, label, x, y, accent, "left", t.type.micro); };

    // ---- left: enemies (kind-coloured), the target dummy, spawn modifiers ----
    tag("SPAWN ENEMIES", left, 196);
    const enemies = sections.get("SPAWN ENEMIES")?.choices ?? [];
    const kinds = enemies.slice(0, Math.max(0, enemies.length - 1));
    kinds.forEach((choice, index) => {
      enqueueChoice(choice, left + (index % 3) * (196 + gap), 208 + Math.floor(index / 3) * (bh + gap), 196, bh, 13);
    });
    const dummy = enemies[enemies.length - 1];
    if (dummy) enqueueChoice(dummy, left, 208 + 4 * (bh + gap), 402, bh, 13);

    const modifierY = 208 + 5 * (bh + gap) + 26;
    tag("SPAWN MODIFIERS", left, modifierY - 10);
    ui.text(canvas, "HP", left, modifierY + 28, t.type.label);
    sections.get("HP")?.choices.forEach((choice, index) => { enqueueChoice(choice, left + 44 + index * 92, modifierY + 4, 84, 38, 13); });
    ui.text(canvas, "COUNT", left + 340, modifierY + 28, t.type.label);
    sections.get("COUNT")?.choices.forEach((choice, index) => { enqueueChoice(choice, left + 424 + index * 92, modifierY + 4, 84, 38, 13); });

    // difficulty — the SAME tiers the real modes use, swapped live
    const difficultyY = modifierY + 66;
    tag("DIFFICULTY", left, difficultyY - 10);
    sections.get("DIFFICULTY")?.choices.forEach((choice, index) => { enqueueChoice(choice, left + index * (116 + 5), difficultyY + 4, 116, 38, 11); });

    // ---- right: bosses, arena, weapons ----
    tag("SUMMON A BOSS", right, 196);
    sections.get("SUMMON A BOSS")?.choices.forEach((choice, index) => {
      enqueueChoice(choice, right + (index % 2) * (295 + gap), 208 + Math.floor(index / 2) * (bh + gap), 295, bh, 13);
    });
    const arenaY = 208 + 3 * (bh + gap) + 26;
    tag("ARENA", right, arenaY - 10);
    sections.get("ARENA")?.choices.forEach((choice) => { enqueueChoice(choice, right, arenaY + 4, columnWidth, bh, 13); });
    const weaponY = arenaY + bh + 30;
    tag("WEAPON  (restarts the arena)", right, weaponY - 10);
    const weapons = sections.get("WEAPON")?.choices ?? [];
    if (weapons.length > 0) {
      const buttonWidth = (columnWidth - gap * (weapons.length - 1)) / weapons.length;
      weapons.forEach((choice, index) => { enqueueChoice(choice, right + index * (buttonWidth + gap), weaponY + 4, buttonWidth, bh, 13); });
    }

    // ---- bottom band: toggles + actions + resume ----
    const toggleY = 640;
    tag("MODIFIERS", left, toggleY - 10);
    sections.get("MODIFIERS")?.choices.forEach((choice, index) => { enqueueChoice(choice, left + index * (300 + 12), toggleY + 4, 300, bh, 13); });
    const actionY = toggleY + bh + 18;
    sections.get("ACTIONS")?.choices.forEach((choice, index) => { enqueueChoice(choice, left + index * (300 + 12), actionY, 300, bh, 13); });
    context.enqueue({ x: width / 2 - 160, y: actionY + bh + 16, w: 320, h: 50, label: "RESUME", action: { type: "run.resume" } });
  }

  function renderAbilityLab(view: PlaygroundScreenView): void {
    const filters = view.sections.find((section) => section.label === "FILTERS");
    filters?.choices.forEach((choice, index) => { enqueueChoice(choice, width / 2 - 546 + index * 156, 168, 148, 34); });
    const abilities = view.sections.find((section) => section.label === "ABILITIES");
    const cardWidth = 588, rowHeight = 92, top = 232, left = width / 2 - cardWidth - 12;
    context.canvas.save(); context.canvas.beginPath(); context.canvas.rect(0, top - 10, width, height - top - 98); context.canvas.clip();
    abilities?.choices.forEach((choice, index) => {
      const x = left + (index % 2) * (cardWidth + 24), y = top + Math.floor(index / 2) * rowHeight - context.scroll;
      if (y + 80 < top - 10 || y > height - 108) return;
      ui.card(context.canvas, x, y, cardWidth, 80, false); ui.accentStrip(context.canvas, x, y, cardWidth, choice.accent);
      ui.displayText(context.canvas, choice.label, x + 16, y + 28, ui.t.type.lead);
      if (choice.description) ui.text(context.canvas, choice.description, x + 16, y + 50, ui.t.type.micro, "left", ui.t.alpha.soft);
      if (choice.sub) ui.tag(context.canvas, choice.sub, x + 16, y + 69, choice.accent, "left", ui.t.type.micro);
      context.enqueue({ x: x + cardWidth - 118, y: y + 20, w: 102, h: 40, label: choice.glyph ?? "TAKE", enabled: choice.enabled,
        action: { type: "playground.action", id: choice.id } });
    });
    context.canvas.restore();
  }

  return { pgmenu: render, pglab: render };
}
