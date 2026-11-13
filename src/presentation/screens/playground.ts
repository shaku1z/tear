import type { PlaygroundScreenView, ScreenRenderContext } from "./contracts";
import { scrollHint, tabs } from "./screen-primitives";
import { createCompactPlayground } from "./compact-playground";

export interface GridCell {
  readonly column: number;
  readonly row: number;
  readonly span: number;
}
export interface ChoiceGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cells: readonly GridCell[];
}

/**
 * Flows `count` choices left to right into rows, the last one spanning `lastSpan` cells
 * (it starts a new row when the current one has too few cells left). Uses the fewest
 * columns from `minColumns` that keep the grid within `maxRows`; at `maxColumns` it
 * stops widening and grows downward instead.
 */
export function choiceGrid(
  count: number,
  lastSpan: number,
  options: Readonly<{ minColumns: number; maxColumns: number; maxRows: number; width: number; gap: number }>,
): ChoiceGrid {
  const flow = (columns: number): GridCell[] => {
    const cells: GridCell[] = [];
    for (let index = 0, slot = 0; index < count; index++) {
      const span = index === count - 1 ? Math.min(lastSpan, columns) : 1;
      if ((slot % columns) + span > columns) slot = Math.ceil(slot / columns) * columns;
      cells.push({ column: slot % columns, row: Math.floor(slot / columns), span });
      slot += span;
    }
    return cells;
  };
  let columns = options.minColumns,
    cells = flow(columns);
  const rowsOf = (list: readonly GridCell[]): number => list.reduce((rows, cell) => Math.max(rows, cell.row + 1), 0);
  while (rowsOf(cells) > options.maxRows && columns < options.maxColumns) cells = flow(++columns);
  return { columns, rows: rowsOf(cells), cellWidth: (options.width - options.gap * (columns - 1)) / columns, cells };
}

export function createPlaygroundRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;
  // Phone landscape (compact density) composes both screens as compact pages.
  const compact = createCompactPlayground(context);

  function render(view: PlaygroundScreenView): void {
    const { canvas } = context;
    // Source dim/header values (ee5e931): 0.88 over the frozen arena on the build
    // menu, 0.9 in the lab, and the default accent — not a forced purple hue.
    ui.dim(canvas, width, height, view.id === "pgmenu" ? 0.88 : 0.9);
    if (ui.density.compact) {
      if (view.id === "pgmenu") compact.buildMenu(view);
      else compact.abilityLab(view);
      return;
    }
    ui.header(canvas, view.title, view.subtitle, context.enterAmount);
    tabs(context, view.tabs ?? [], (id) => ({ type: "playground.action", id }), TAB_Y);
    if (view.id === "pgmenu") renderBuildMenu(view);
    else renderAbilityLab(view);
    // The hint shares the footer row with BACK (to its right), never the last row.
    scrollHint(context, view.canScrollUp, view.canScrollDown);
    // Every tab resumes through RESUME (and Tab / Esc); ABILITIES is a tab, not a sub-page.
    if (view.id === "pglab")
      context.enqueue({
        x: width / 2 - 160,
        y: ui.sheetFooter().y,
        w: 320,
        h: 50,
        label: "RESUME",
        action: { type: "run.resume" },
      });
  }

  function enqueueChoice(
    choice: PlaygroundScreenView["sections"][number]["choices"][number],
    x: number,
    y: number,
    w: number,
    h = 42,
    size?: number,
  ): void {
    context.enqueue({
      x,
      y,
      w,
      h,
      label: choice.label,
      glyph: choice.glyph,
      sub: choice.sub ?? choice.description,
      selected: choice.selected,
      enabled: choice.enabled,
      accent: choice.accent,
      size,
      action: { type: "playground.action", id: choice.id },
    });
  }

  /** Content starts under the tab strip. */
  const TAB_Y = 136,
    BODY_TOP = 212,
    SMALL_GROUP = 5,
    BAND_CHOICES = 10;

  /**
   * One tab of the Playground menu: each section is a plain accent heading over a grid
   * of buttons (as many columns as the page needs), with RESUME in the footer row.
   * Every tab uses the same layout, so a new enemy, boss, arena or weapon is one more
   * button in its tab's grid.
   */
  function renderBuildMenu(view: PlaygroundScreenView): void {
    const { canvas } = context,
      t = ui.t,
      left = width / 2 - 620,
      columnWidth = 1240,
      gap = 10,
      bottom = ui.sheetFooter().y - t.space.lg;
    // Consecutive small groups (a few options each, such as HEALTH, HOW MANY and
    // DIFFICULTY) share one band, each as wide as its share of the buttons.
    const bands: PlaygroundScreenView["sections"][number][][] = [];
    for (const section of view.sections) {
      const band = bands.at(-1),
        small = section.choices.length <= SMALL_GROUP;
      const bandCount = band?.reduce((total, entry) => total + entry.choices.length, 0) ?? 0;
      if (
        band &&
        small &&
        band.every((entry) => entry.choices.length <= SMALL_GROUP) &&
        bandCount + section.choices.length <= BAND_CHOICES
      )
        band.push(section);
      else bands.push([section]);
    }
    let y = BODY_TOP;
    for (const band of bands) {
      const total = band.reduce((sum, entry) => sum + entry.choices.length, 0),
        groupGap = 28,
        room = columnWidth - groupGap * (band.length - 1);
      let x = left,
        bandBottom = y;
      for (const section of band) {
        const span = band.length === 1 ? columnWidth : (room * section.choices.length) / total;
        ui.tag(canvas, section.label, x, y, t.color.accent, "left", t.type.micro);
        const top = y + 14,
          keyed = section.choices.some((choice) => choice.sub !== undefined),
          bh = keyed ? 54 : 46;
        const grid = choiceGrid(section.choices.length, 1, {
          minColumns: band.length === 1 ? Math.min(section.choices.length, 4) : section.choices.length,
          maxColumns: band.length === 1 ? 8 : section.choices.length,
          maxRows: Math.max(1, Math.floor((bottom - top) / (bh + gap))),
          width: span,
          gap,
        });
        section.choices.forEach((choice, index) => {
          const cell = grid.cells[index];
          if (cell === undefined) return;
          enqueueChoice(
            choice,
            x + cell.column * (grid.cellWidth + gap),
            top + cell.row * (bh + gap),
            grid.cellWidth,
            bh,
            14,
          );
        });
        bandBottom = Math.max(bandBottom, top + grid.rows * (bh + gap));
        x += span + groupGap;
      }
      y = bandBottom + 26;
    }
    context.enqueue({
      x: width / 2 - 160,
      y: ui.sheetFooter().y,
      w: 320,
      h: 50,
      label: "RESUME",
      action: { type: "run.resume" },
    });
  }

  /**
   * ABILITIES rows (92 px pitch, matching the lab's scroll owner): name, one fitted
   * line of effect copy that stops before the action button, and the ownership tag.
   * Rows clip above the footer row, and a row's button is offered only while it is
   * fully inside the clip, so nothing reaches BACK or the scroll hint.
   */
  function renderAbilityLab(view: PlaygroundScreenView): void {
    const { canvas } = context,
      t = ui.t;
    const filters = view.sections.find((section) => section.label === "FILTERS");
    filters?.choices.forEach((choice, index) => {
      enqueueChoice(choice, width / 2 - 546 + index * 156, BODY_TOP - 18, 148, 34);
    });
    const abilities = view.sections.find((section) => section.label === "ABILITIES");
    const cardWidth = 588,
      cardHeight = 80,
      rowHeight = 92,
      top = BODY_TOP + 40,
      left = width / 2 - cardWidth - 12;
    const bottom = ui.sheetFooter().y - t.space.md,
      buttonW = 102,
      buttonH = 40;
    const textW = cardWidth - 16 - buttonW - 32;
    canvas.save();
    canvas.beginPath();
    canvas.rect(0, top - 10, width, bottom - (top - 10));
    canvas.clip();
    abilities?.choices.forEach((choice, index) => {
      const x = left + (index % 2) * (cardWidth + 24),
        y = top + Math.floor(index / 2) * rowHeight - context.scroll;
      if (y + cardHeight < top - 10 || y > bottom) return;
      ui.card(canvas, x, y, cardWidth, cardHeight, false);
      ui.accentStrip(canvas, x, y, cardWidth, choice.accent);
      const name = ui.fitText(canvas, choice.label, textW, { size: t.type.lead, floor: t.type.label, bold: true });
      ui.displayText(canvas, name.lines[0] ?? choice.label, x + 16, y + 28, name.size);
      if (choice.description)
        ui.textBox(canvas, choice.description, x + 16, y + 50, textW, {
          size: t.type.micro,
          alpha: t.alpha.soft,
          maxLines: 1,
        });
      if (choice.sub)
        ui.tag(canvas, choice.sub, x + 16, y + 69, ui.readable(choice.accent ?? t.color.accent), "left", t.type.micro);
      const buttonY = y + (cardHeight - buttonH) / 2;
      if (buttonY >= top - 10 && buttonY + buttonH <= bottom) {
        context.enqueue({
          x: x + cardWidth - buttonW - 16,
          y: buttonY,
          w: buttonW,
          h: buttonH,
          label: choice.glyph ?? "TAKE",
          enabled: choice.enabled,
          action: { type: "playground.action", id: choice.id },
        });
      }
    });
    canvas.restore();
  }

  return { pgmenu: render, pglab: render };
}
