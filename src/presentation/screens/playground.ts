import type { ChoiceView, PlaygroundScreenView, ScreenRenderContext } from "./contracts";
import { backControl, scrollHint } from "./screen-primitives";
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
    if (view.id === "pgmenu") renderBuildMenu(view);
    else renderAbilityLab(view);
    // The hint shares the footer row with BACK (to its right), never the last row.
    scrollHint(context, view.canScrollUp, view.canScrollDown);
    // The build menu resumes through its own RESUME button (and Tab / Esc); only
    // the lab carries a back control, which returns to the build menu.
    if (view.id === "pglab") backControl(context, { type: "navigate", to: "pgmenu" });
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

  // The source build menu (ee5e931 js/game.js renderPgMenu): a bespoke two-column
  // board — enemies/spawn modifiers/difficulty on the left, bosses/arena/weapons on
  // the right, toggles and actions in a bottom band. Section headings are plain
  // accent tags (no divider rule), matching the source.
  function renderBuildMenu(view: PlaygroundScreenView): void {
    const sections = new Map(view.sections.map((section) => [section.label, section]));
    const { canvas } = context,
      t = ui.t,
      accent = t.color.accent;
    const left = width / 2 - 620,
      right = width / 2 + 20,
      columnWidth = 600,
      bh = 42,
      gap = 10,
      gridTop = 208;
    const tag = (label: string, x: number, y: number): void => {
      ui.tag(canvas, label, x, y, accent, "left", t.type.micro);
    };
    const rowY = (row: number): number => gridTop + row * (bh + gap);
    // Everything under the enemy and boss grids is placed from the rows they use, and
    // each grid takes as many columns as it needs to end above the bottom band
    // (source top 640, 36 px clearance), so a new enemy or boss never lands on the next group.
    const bandTop = 640,
      bandClearance = 36,
      headingGap = 26;
    const leftStackBelow = headingGap + 66 + 4 + 38,
      rightStackBelow = headingGap + bh + 30 + 4 + bh;
    const rowsAbove = (below: number): number => Math.floor((bandTop - bandClearance - below - gridTop) / (bh + gap));
    const place = (choice: ChoiceView, grid: ChoiceGrid, index: number, x: number): void => {
      const cell = grid.cells[index];
      if (cell === undefined) return;
      enqueueChoice(
        choice,
        x + cell.column * (grid.cellWidth + gap),
        rowY(cell.row),
        grid.cellWidth * cell.span + gap * (cell.span - 1),
        bh,
        13,
      );
    };

    // ---- left: enemies (kind-coloured), the two-cell target dummy, spawn modifiers ----
    tag("SPAWN ENEMIES", left, 196);
    const enemies = sections.get("SPAWN ENEMIES")?.choices ?? [];
    // Source grid: three 196 px kinds per row (608 px), the dummy spanning two cells.
    const enemyGrid = choiceGrid(enemies.length, 2, {
      minColumns: 3,
      maxColumns: 4,
      maxRows: rowsAbove(leftStackBelow),
      width: 3 * 196 + 2 * gap,
      gap,
    });
    enemies.forEach((choice, index) => {
      place(choice, enemyGrid, index, left);
    });

    const modifierY = rowY(enemyGrid.rows) + headingGap;
    tag("SPAWN MODIFIERS", left, modifierY - 10);
    ui.text(canvas, "HP", left, modifierY + 28, t.type.label);
    sections.get("HP")?.choices.forEach((choice, index) => {
      enqueueChoice(choice, left + 44 + index * 92, modifierY + 4, 84, 38, 13);
    });
    ui.text(canvas, "COUNT", left + 340, modifierY + 28, t.type.label);
    sections.get("COUNT")?.choices.forEach((choice, index) => {
      enqueueChoice(choice, left + 424 + index * 92, modifierY + 4, 84, 38, 13);
    });

    // difficulty — the SAME tiers the real modes use, swapped live
    const difficultyY = modifierY + 66;
    tag("DIFFICULTY", left, difficultyY - 10);
    sections.get("DIFFICULTY")?.choices.forEach((choice, index) => {
      enqueueChoice(choice, left + index * (116 + 5), difficultyY + 4, 116, 38, 11);
    });

    // ---- right: bosses, arena, weapons ----
    tag("SUMMON A BOSS", right, 196);
    const bosses = sections.get("SUMMON A BOSS")?.choices ?? [];
    // Source grid: two 295 px bosses per row across the 600 px column.
    const bossGrid = choiceGrid(bosses.length, 1, {
      minColumns: 2,
      maxColumns: 3,
      maxRows: rowsAbove(rightStackBelow),
      width: columnWidth,
      gap,
    });
    bosses.forEach((choice, index) => {
      place(choice, bossGrid, index, right);
    });
    const arenaY = rowY(bossGrid.rows) + headingGap;
    tag("ARENA", right, arenaY - 10);
    sections.get("ARENA")?.choices.forEach((choice) => {
      enqueueChoice(choice, right, arenaY + 4, columnWidth, bh, 13);
    });
    const weaponY = arenaY + bh + 30;
    tag("WEAPON  (restarts the arena)", right, weaponY - 10);
    const weapons = sections.get("WEAPON")?.choices ?? [];
    if (weapons.length > 0) {
      const buttonWidth = (columnWidth - gap * (weapons.length - 1)) / weapons.length;
      weapons.forEach((choice, index) => {
        enqueueChoice(choice, right + index * (buttonWidth + gap), weaponY + 4, buttonWidth, bh, 13);
      });
    }

    // ---- bottom band: toggles + actions + resume ----
    // Source position unless a column still ends lower at its widest grid.
    const columnsBottom = Math.max(difficultyY + 4 + 38, weaponY + 4 + bh);
    const toggleY = Math.max(bandTop, columnsBottom + bandClearance);
    tag("MODIFIERS", left, toggleY - 10);
    sections.get("MODIFIERS")?.choices.forEach((choice, index) => {
      enqueueChoice(choice, left + index * (300 + 12), toggleY + 4, 300, bh, 13);
    });
    const actionY = toggleY + bh + 18;
    sections.get("ACTIONS")?.choices.forEach((choice, index) => {
      enqueueChoice(choice, left + index * (300 + 12), actionY, 300, bh, 13);
    });
    context.enqueue({
      x: width / 2 - 160,
      y: actionY + bh + 16,
      w: 320,
      h: 50,
      label: "RESUME",
      action: { type: "run.resume" },
    });
  }

  /**
   * Ability Lab rows (92 px pitch, matching the lab's scroll owner): name, one fitted
   * line of effect copy that stops before the action button, and the ownership tag.
   * Rows clip above the footer row, and a row's button is offered only while it is
   * fully inside the clip, so nothing reaches BACK or the scroll hint.
   */
  function renderAbilityLab(view: PlaygroundScreenView): void {
    const { canvas } = context,
      t = ui.t;
    const filters = view.sections.find((section) => section.label === "FILTERS");
    filters?.choices.forEach((choice, index) => {
      enqueueChoice(choice, width / 2 - 546 + index * 156, 168, 148, 34);
    });
    const abilities = view.sections.find((section) => section.label === "ABILITIES");
    const cardWidth = 588,
      cardHeight = 80,
      rowHeight = 92,
      top = 232,
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
