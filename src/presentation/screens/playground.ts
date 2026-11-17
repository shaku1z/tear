import type { ChoiceView, PlaygroundScreenView, ScreenControl, ScreenRenderContext } from "./contracts";
import { createPageFrame, type FlowAction, type PageFrame, type ScrollBlock, type ScrollView } from "./page-frame";

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

type Tokens = ScreenRenderContext["ui"]["t"];
/** The view's choices for one section. */
type Choices = (section: string) => readonly ChoiceView[];

/**
 * A build-menu group: its heading and the view sections it shows (its own name unless `sections`
 * says otherwise). A group of several sections names each button by its section on the phone.
 */
interface Group {
  readonly label: string;
  readonly sections?: readonly string[];
  /** A lone wide choice (the arena cycler): half the phone's columns. */
  readonly wide?: boolean;
}

/** The build menu's groups, in the source's order (ee5e931 js/game.js renderPgMenu). */
const GROUPS: readonly Group[] = [
  { label: "SPAWN ENEMIES" },
  { label: "SPAWN MODIFIERS", sections: ["HP", "COUNT"] },
  { label: "DIFFICULTY" },
  { label: "SUMMON A BOSS" },
  { label: "ARENA", wide: true },
  { label: "WEAPON  (restarts the arena)", sections: ["WEAPON"] },
  { label: "MODIFIERS" },
  { label: "ACTIONS" },
];
/** A group's heading by the start of its label. */
const heading = (start: string): string => GROUPS.find((group) => group.label.startsWith(start))?.label ?? start;

/** The build menu laid out: its body blocks and, when it sits in the footer row, RESUME. */
interface MenuLayout {
  readonly blocks: readonly ScrollBlock[];
  readonly resume?: FlowAction | undefined;
}
const RESUME: FlowAction = { label: "RESUME", action: { type: "run.resume" } };

/** The Ability Lab card: what both densities draw with different numbers. */
interface LabMetrics {
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
  readonly copy: Readonly<{ baseline: number; maxLines: number; lineHeight: number | undefined }>;
  /** The ownership tag's baseline: fixed in the card (desktop) or after the copy (phone). */
  readonly sub: (cardTop: number, copyBaseline: number) => number;
}

/** Desktop: 80 px cards on 92 px rows (the lab's scroll owner steps the same pitch). */
function desktopLab(t: Tokens, width: number): LabMetrics {
  return {
    gap: 0,
    span: () => ({ left: width / 2 - 600, width: 1200 }),
    columnGap: 24,
    pad: 16,
    row: () => 92,
    inset: 10,
    card: () => 80,
    button: { w: 102, h: 40, size: undefined },
    name: { baseline: 28, floor: t.type.label },
    copy: { baseline: 22, maxLines: 1, lineHeight: undefined },
    sub: (top) => top + 69,
  };
}

/** Phone: cards measured at the live tokens, as tall as the row's tallest. */
function phoneLab(t: Tokens, frame: PageFrame, lh: number, lines: (text: string, width: number) => number): LabMetrics {
  const pad = t.space.md,
    button = { w: Math.max(180, t.metric.minTarget * 1.8), h: t.metric.minTarget, size: t.type.label };
  const copyW = (frame.width - t.space.md) / 2 - pad * 3 - button.w;
  const height = (choice: ChoiceView): number =>
    Math.max(
      t.metric.minTarget + pad * 2,
      pad +
        t.type.lead +
        t.space.sm +
        (choice.description ? lines(choice.description, copyW) * lh : 0) +
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
    copy: { baseline: t.space.sm + t.type.micro, maxLines: 2, lineHeight: lh },
    sub: (_top, copy) => copy + t.space.xs + t.type.micro,
  };
}

/**
 * The PLAYGROUND build menu and ABILITY LAB over the frozen arena (no sheet), one definition at
 * both densities. The build menu's groups are one list: desktop places them on the source's
 * two-column board (`board`); the phone flows them as rows of full-size buttons under plain
 * accent headings, with RESUME in the footer row (`flow`). The lab draws one card at both
 * densities from `LabMetrics`.
 */
export function createPlaygroundRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context,
    pf = createPageFrame(context);
  const action = (id: string) => ({ type: "playground.action", id }) as const;
  const scrollFlags = (view: PlaygroundScreenView) => ({
    canScrollUp: view.canScrollUp,
    canScrollDown: view.canScrollDown,
  });

  function render(view: PlaygroundScreenView): void {
    // Source dim values (ee5e931): 0.88 over the frozen arena on the build menu, 0.9 in the lab.
    ui.dim(context.canvas, width, height, view.id === "pgmenu" ? 0.88 : 0.9);
    const choices: Choices = (section) => view.sections.find((entry) => entry.label === section)?.choices ?? [];
    if (view.id === "pgmenu") buildMenu(view, choices);
    else abilityLab(view, choices);
  }

  function buildMenu(view: PlaygroundScreenView, choices: Choices): void {
    const frame = pf.open({ title: view.title, subtitle: view.subtitle, sheet: false, desktop: {} });
    const layout = (frame.compact ? flow : board)(frame, choices);
    const desktop = { top: 0, cull: { above: 0, below: 0 }, ...scrollFlags(view) };
    const state = pf.body(frame, { head: layout.blocks, gap: ui.t.space.sm, desktop });
    // The build menu resumes through RESUME (and Tab / Esc); it has no BACK.
    pf.close(frame, state, { back: null, primary: layout.resume });
  }

  /** A choice as a button; the desktop board's buttons also carry the glyph and the sub line. */
  function control(
    choice: ChoiceView,
    box: Readonly<{ x: number; y: number; w: number; h: number }>,
    size: number | undefined,
    detail = false,
  ): ScreenControl {
    return {
      ...box,
      label: choice.label,
      ...(detail ? { glyph: choice.glyph, sub: choice.sub ?? choice.description } : {}),
      selected: choice.selected,
      enabled: choice.enabled,
      accent: choice.accent,
      size,
      action: action(choice.id),
    };
  }

  /** The phone: each group as a plain accent heading over rows of full-size buttons. */
  function flow(frame: PageFrame, choices: Choices): MenuLayout {
    const t = ui.t,
      gap = t.metric.btnGap,
      h = t.metric.minTarget;
    // The narrowest button is 270 px; the column count follows from the page width.
    const columns = Math.max(3, Math.floor((frame.width + gap) / (270 + gap))),
      w = (frame.width - gap * (columns - 1)) / columns;
    const blocks: ScrollBlock[] = [];
    for (const group of GROUPS) {
      const sections = group.sections ?? [group.label],
        named = sections.length > 1;
      const items = sections.flatMap((section) =>
        choices(section).map((choice) => [choice, named ? `${section} ${choice.label}` : choice.label] as const),
      );
      if (items.length === 0) continue;
      const span = group.wide ? Math.ceil(columns / 2) : 1,
        perRow = Math.max(1, Math.floor(columns / span));
      const ink = ui.readable(t.color.accent);
      blocks.push({
        height: t.type.micro + t.space.xs,
        draw: (y) => {
          ui.tag(context.canvas, group.label, frame.left, y + t.type.micro, ink, "left", t.type.micro);
        },
      });
      for (let start = 0; start < items.length; start += perRow) {
        const row = items.slice(start, start + perRow);
        const draw = (y: number, view: ScrollView): void => {
          row.forEach(([choice, label], index) => {
            const box = { x: frame.left + index * span * (w + gap), y, w: w * span + gap * (span - 1), h };
            view.enqueue({ ...control(choice, box, t.type.label), label });
          });
        };
        blocks.push({ height: h, draw });
      }
    }
    return { blocks, resume: RESUME };
  }

  /**
   * Desktop: the source build menu (ee5e931 js/game.js renderPgMenu), a bespoke two-column board:
   * enemies, spawn modifiers and difficulty on the left; bosses, arena and weapons on the right;
   * toggles, actions and RESUME in a bottom band. Headings are plain accent tags.
   */
  function board(_frame: PageFrame, choices: Choices): MenuLayout {
    const { canvas } = context,
      t = ui.t;
    const left = width / 2 - 620,
      right = width / 2 + 20,
      columnWidth = 600,
      bh = 42,
      gap = 10,
      gridTop = 208;
    const tag = (label: string, x: number, y: number): void => {
      ui.tag(canvas, heading(label), x, y, t.color.accent, "left", t.type.micro);
    };
    const button = (choice: ChoiceView, x: number, y: number, w: number, h = bh, size = 13): void => {
      context.enqueue(control(choice, { x, y, w, h }, size, true));
    };
    const rowY = (row: number): number => gridTop + row * (bh + gap);
    // Everything under the enemy and boss grids is placed from the rows they use, and each grid
    // takes as many columns as it needs to end above the bottom band (source top 640, 36 px
    // clearance), so a new enemy or boss never lands on the next group.
    const bandTop = 640,
      bandClearance = 36,
      headingGap = 26;
    const rowsAbove = (below: number): number => Math.floor((bandTop - bandClearance - below - gridTop) / (bh + gap));
    const place = (list: readonly ChoiceView[], grid: ChoiceGrid, x: number): void => {
      list.forEach((choice, index) => {
        const cell = grid.cells[index];
        if (cell === undefined) return;
        const w = grid.cellWidth * cell.span + gap * (cell.span - 1);
        button(choice, x + cell.column * (grid.cellWidth + gap), rowY(cell.row), w);
      });
    };
    const draw = (): void => {
      // ---- left: enemies (kind-coloured), the two-cell target dummy, spawn modifiers ----
      tag("SPAWN ENEMIES", left, 196);
      const enemies = choices("SPAWN ENEMIES");
      // Source grid: three 196 px kinds per row (608 px), the dummy spanning two cells.
      const enemyGrid = choiceGrid(enemies.length, 2, {
        minColumns: 3,
        maxColumns: 4,
        maxRows: rowsAbove(headingGap + 66 + 4 + 38),
        width: 3 * 196 + 2 * gap,
        gap,
      });
      place(enemies, enemyGrid, left);
      const modifierY = rowY(enemyGrid.rows) + headingGap;
      tag("SPAWN MODIFIERS", left, modifierY - 10);
      ui.text(canvas, "HP", left, modifierY + 28, t.type.label);
      choices("HP").forEach((choice, index) => {
        button(choice, left + 44 + index * 92, modifierY + 4, 84, 38);
      });
      ui.text(canvas, "COUNT", left + 340, modifierY + 28, t.type.label);
      choices("COUNT").forEach((choice, index) => {
        button(choice, left + 424 + index * 92, modifierY + 4, 84, 38);
      });
      // difficulty: the same tiers the real modes use, swapped live
      const difficultyY = modifierY + 66;
      tag("DIFFICULTY", left, difficultyY - 10);
      choices("DIFFICULTY").forEach((choice, index) => {
        button(choice, left + index * (116 + 5), difficultyY + 4, 116, 38, 11);
      });

      // ---- right: bosses, arena, weapons ----
      tag("SUMMON A BOSS", right, 196);
      const bosses = choices("SUMMON A BOSS");
      // Source grid: two 295 px bosses per row across the 600 px column.
      const bossGrid = choiceGrid(bosses.length, 1, {
        minColumns: 2,
        maxColumns: 3,
        maxRows: rowsAbove(headingGap + bh + 30 + 4 + bh),
        width: columnWidth,
        gap,
      });
      place(bosses, bossGrid, right);
      const arenaY = rowY(bossGrid.rows) + headingGap;
      tag("ARENA", right, arenaY - 10);
      choices("ARENA").forEach((choice) => {
        button(choice, right, arenaY + 4, columnWidth);
      });
      const weaponY = arenaY + bh + 30;
      tag("WEAPON", right, weaponY - 10);
      const weapons = choices("WEAPON"),
        weaponW = (columnWidth - gap * (weapons.length - 1)) / weapons.length;
      weapons.forEach((choice, index) => {
        button(choice, right + index * (weaponW + gap), weaponY + 4, weaponW);
      });

      // ---- bottom band: toggles, actions and RESUME (source position unless a column ends lower) ----
      const toggleY = Math.max(bandTop, Math.max(difficultyY + 4 + 38, weaponY + 4 + bh) + bandClearance);
      tag("MODIFIERS", left, toggleY - 10);
      choices("MODIFIERS").forEach((choice, index) => {
        button(choice, left + index * (300 + 12), toggleY + 4, 300);
      });
      const actionY = toggleY + bh + 18;
      choices("ACTIONS").forEach((choice, index) => {
        button(choice, left + index * (300 + 12), actionY, 300);
      });
      context.enqueue({ x: width / 2 - 160, y: actionY + bh + 16, w: 320, h: 50, ...RESUME });
    };
    return { blocks: [{ height: 0, draw }] };
  }

  /**
   * The Ability Lab: the filters (buttons on desktop, chips on the phone), then the abilities in
   * two columns: name, the effect copy, the ownership tag and the action button. A row's button
   * is offered only while it is fully inside the list, so nothing reaches BACK or the hint.
   */
  function abilityLab(view: PlaygroundScreenView, choices: Choices): void {
    const t = ui.t;
    const filters = { y: 168, width: 148, height: 34, left: width / 2 - 546, buttons: true };
    const frame = pf.open({
      title: view.title,
      subtitle: view.subtitle,
      sheet: false,
      pickers: [{ items: choices("FILTERS"), action, desktop: filters }],
      desktop: {},
    });
    const lh = pf.lineHeight(t.type.micro),
      lines = (text: string, w: number): number => pf.lineCount(text, w, t.type.micro, 2);
    const m = frame.compact ? phoneLab(t, frame, lh, lines) : desktopLab(t, width);
    const cell = (choice: ChoiceView, x: number, y: number, w: number, h: number, scrollView: ScrollView): void => {
      labCard(m, choice, { x, y: y + m.inset, w, h: m.card(h) }, scrollView);
    };
    const list = pf.grid(m.span(frame), choices("ABILITIES"), 2, m.row, cell, m.columnGap);
    // Desktop rows start 10 px into the list (cards at 232), and a row is drawn from 90 px above it.
    const desktop = { top: 222, cull: { above: 90, below: 10 }, ...scrollFlags(view) };
    const state = pf.body(frame, { list, gap: m.gap, desktop });
    pf.close(frame, state, { back: { type: "navigate", to: "pgmenu" } });
  }

  function labCard(
    m: LabMetrics,
    choice: ChoiceView,
    card: Readonly<{ x: number; y: number; w: number; h: number }>,
    view: ScrollView,
  ): void {
    const { canvas } = context,
      t = ui.t,
      { x, y, w, h } = card,
      copyW = w - m.pad * 3 - m.button.w;
    ui.card(canvas, x, y, w, h, false);
    ui.accentStrip(canvas, x, y, w, choice.accent);
    const nameY = y + m.name.baseline;
    const name = ui.fitText(canvas, choice.label, copyW, { size: t.type.lead, floor: m.name.floor, bold: true });
    ui.displayText(canvas, name.lines[0] ?? choice.label, x + m.pad, nameY, name.size);
    let cursor = nameY;
    if (choice.description) {
      const { maxLines, lineHeight } = m.copy;
      const copy = { size: t.type.micro, maxLines, ...(lineHeight ? { lineHeight } : {}), alpha: t.alpha.soft };
      cursor = ui.textBox(canvas, choice.description, x + m.pad, nameY + m.copy.baseline, copyW, copy).lastBaseline;
    }
    const subInk = ui.readable(choice.accent ?? t.color.accent);
    if (choice.sub) ui.tag(canvas, choice.sub, x + m.pad, m.sub(y, cursor), subInk, "left", t.type.micro);
    view.enqueue({
      x: x + w - m.pad - m.button.w,
      y: y + (h - m.button.h) / 2,
      w: m.button.w,
      h: m.button.h,
      label: choice.glyph ?? "TAKE",
      enabled: choice.enabled,
      size: m.button.size,
      action: action(choice.id),
    });
  }

  return { pgmenu: render, pglab: render };
}
