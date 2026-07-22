import type { PlaygroundScreenView, ScreenRenderContext } from "./contracts";
import { backControl, scrollHint } from "./screen-primitives";

export function createPlaygroundRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function render(view: PlaygroundScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.84);
    ui.header(canvas, view.title, view.subtitle, context.enterAmount, "#b06cff");
    if (view.id === "pgmenu") renderBuildMenu(view);
    else renderAbilityLab(view);
    scrollHint(context, view.canScrollUp, view.canScrollDown);
    backControl(context, view.id === "pglab"
      ? { type: "navigate", to: "pgmenu" }
      : { type: "run.resume" });
  }

  function enqueueChoice(choice: PlaygroundScreenView["sections"][number]["choices"][number], x: number, y: number, w: number, h = 42): void {
    context.enqueue({ x, y, w, h, label: choice.label, glyph: choice.glyph, sub: choice.sub ?? choice.description,
      selected: choice.selected, enabled: choice.enabled, accent: choice.accent,
      action: { type: "playground.action", id: choice.id } });
  }

  function renderBuildMenu(view: PlaygroundScreenView): void {
    const sections = new Map(view.sections.map((section) => [section.label, section]));
    const left = width / 2 - 620, right = width / 2 + 20, columnWidth = 600, gap = 10;
    const enemies = sections.get("SPAWN ENEMIES");
    ui.sectionLabel(context.canvas, "SPAWN ENEMIES", left, 188, columnWidth, "#b06cff");
    enemies?.choices.forEach((choice, index) => { enqueueChoice(choice, left + (index % 3) * 206, 208 + Math.floor(index / 3) * 52, 196); });
    const spawn = sections.get("SPAWN MODIFIERS");
    ui.sectionLabel(context.canvas, "SPAWN MODIFIERS", left, 482, columnWidth, "#b06cff");
    spawn?.choices.forEach((choice, index) => { enqueueChoice(choice, left + (index % 5) * 116, 502 + Math.floor(index / 5) * 50, 108, 38); });
    const bosses = sections.get("SUMMON A BOSS");
    ui.sectionLabel(context.canvas, "SUMMON A BOSS", right, 188, columnWidth, "#b06cff");
    bosses?.choices.forEach((choice, index) => { enqueueChoice(choice, right + (index % 2) * 305, 208 + Math.floor(index / 2) * 52, 295); });
    const world = sections.get("ARENA & WEAPON");
    ui.sectionLabel(context.canvas, "ARENA & WEAPON", right, 388, columnWidth, "#b06cff");
    world?.choices.forEach((choice, index) => { enqueueChoice(choice, right + (index ? (index - 1) * ((columnWidth - gap * Math.max(0, world.choices.length - 2)) / Math.max(1, world.choices.length - 1) + gap) : 0), index ? 460 : 408,
      index ? (columnWidth - gap * Math.max(0, world.choices.length - 2)) / Math.max(1, world.choices.length - 1) : columnWidth); });
    const modifiers = sections.get("MODIFIERS");
    modifiers?.choices.forEach((choice, index) => { enqueueChoice(choice, width / 2 - 620 + index * 312, 640, 300); });
    const actions = sections.get("ACTIONS");
    actions?.choices.forEach((choice, index) => { enqueueChoice(choice, width / 2 - 620 + index * 312, 700, 300); });
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
      ui.text(context.canvas, choice.label, x + 16, y + 28, ui.t.type.lead);
      if (choice.description) ui.text(context.canvas, choice.description, x + 16, y + 50, ui.t.type.micro, "left", ui.t.alpha.soft);
      if (choice.sub) ui.tag(context.canvas, choice.sub, x + 16, y + 69, choice.accent, "left", ui.t.type.micro);
      context.enqueue({ x: x + cardWidth - 118, y: y + 20, w: 102, h: 40, label: choice.glyph ?? "TAKE", enabled: choice.enabled,
        action: { type: "playground.action", id: choice.id } });
    });
    context.canvas.restore();
  }

  return { pgmenu: render, pglab: render };
}
