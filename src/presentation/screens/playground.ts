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
type Section = PlaygroundScreenView["sections"][number];

/** Desktop chrome under the overlay header: the tab strip, then the tab's body. */
const DESKTOP = { tabsY: 136, bodyTop: 212 } as const;

/**
 * The menu tab's numbers at each density. A group is a section of the open tab: a plain accent
 * heading over a grid of buttons. Small groups share one band, each as wide as its share of the
 * buttons, while the band has room (`band`).
 */
interface MenuMetrics {
  readonly gap: number;
  /** Heading block height, and the space between bands. */
  readonly heading: number;
  readonly bandGap: number;
  /** A group that may share a band has at most `small` choices; a band holds at most `choices`. */
  readonly band: Readonly<{ small: number; choices: number }>;
  /** Columns for a group of `count` choices in `width`, alone in its band or not. */
  readonly columns: (count: number, width: number, alone: boolean) => number;
  /** Button height; keyed choices (a shortcut on the sub line) are taller on desktop. */
  readonly button: (keyed: boolean) => number;
  readonly size: number;
  /** Desktop buttons carry the glyph and the sub line; the phone puts the sub after the label. */
  readonly detail: boolean;
}

/** Desktop: up to eight columns; a band shares the 1120 column. */
function desktopMenu(): MenuMetrics {
  return {
    gap: 10,
    heading: 14,
    bandGap: 16,
    band: { small: 5, choices: 10 },
    columns: (count, _width, alone) => (alone ? Math.min(Math.max(count, 1), count <= 4 ? 4 : 8) : count),
    button: (keyed) => (keyed ? 54 : 46),
    size: 14,
    detail: true,
  };
}

/** Phone: full-size touch targets, the column count from the page width (narrowest 270 px), no shared bands. */
function phoneMenu(t: Tokens): MenuMetrics {
  const gap = t.metric.btnGap;
  return {
    gap: t.space.sm,
    heading: t.type.micro + t.space.xs,
    bandGap: 0,
    band: { small: 0, choices: 0 },
    columns: (_count, width) => Math.max(3, Math.floor((width + gap) / (270 + gap))),
    button: () => t.metric.minTarget,
    size: t.type.label,
    detail: false,
  };
}

/** The ABILITIES card: what both densities draw with different numbers. */
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

/** Every tab returns to the arena through RESUME (and Tab / Esc); there is no BACK. */
const RESUME: FlowAction = { label: "RESUME", action: { type: "run.resume" } };

/** Consecutive small groups share a band while it has room (never on the phone). */
function bands(sections: readonly Section[], m: MenuMetrics): Section[][] {
  const out: Section[][] = [];
  for (const section of sections) {
    if (section.choices.length === 0) continue;
    const band = out.at(-1),
      small = (entry: Section): boolean => entry.choices.length <= m.band.small;
    const count = band?.reduce((total, entry) => total + entry.choices.length, 0) ?? 0;
    if (band && small(section) && band.every(small) && count + section.choices.length <= m.band.choices)
      band.push(section);
    else out.push([section]);
  }
  return out;
}

/**
 * The PLAYGROUND menu over the frozen arena (no sheet), one definition at both densities: the tab
 * strip, then the open tab. The build-menu tabs are groups of buttons laid out from `MenuMetrics`;
 * ABILITIES (screen `pglab`) draws one card at both densities from `LabMetrics`. RESUME sits in
 * the footer row on every tab.
 */
export function createPlaygroundRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context,
    pf = createPageFrame(context);
  const action = (id: string) => ({ type: "playground.action", id }) as const;
  const scrollFlags = (view: PlaygroundScreenView) => ({
    canScrollUp: view.canScrollUp,
    canScrollDown: view.canScrollDown,
  });

  function open(view: PlaygroundScreenView, pickers?: Parameters<typeof pf.open>[0]["pickers"]): PageFrame {
    return pf.open({
      title: view.title,
      subtitle: view.subtitle,
      sheet: false,
      tabs: view.tabs ?? [],
      tabAction: action,
      pickers,
      desktop: { tabsY: DESKTOP.tabsY },
    });
  }

  function render(view: PlaygroundScreenView): void {
    // Source dim values (ee5e931): 0.88 over the frozen arena on the build menu, 0.9 in the lab.
    ui.dim(context.canvas, width, height, view.id === "pgmenu" ? 0.88 : 0.9);
    const choices: Choices = (section) => view.sections.find((entry) => entry.label === section)?.choices ?? [];
    if (view.id === "pgmenu") menuTab(view);
    else abilityLab(view, choices);
  }

  function menuTab(view: PlaygroundScreenView): void {
    const frame = open(view);
    const m = frame.compact ? phoneMenu(ui.t) : desktopMenu();
    const blocks = bands(view.sections, m).flatMap((band, index) => [
      ...(index > 0 && m.bandGap > 0 ? [{ height: m.bandGap, draw: () => undefined }] : []),
      ...bandBlocks(frame, band, m),
    ]);
    const desktop = { top: DESKTOP.bodyTop, cull: { above: 0, below: 0 }, ...scrollFlags(view) };
    const state = pf.body(frame, { head: blocks, gap: m.gap, desktop });
    pf.close(frame, state, { back: null, primary: RESUME });
  }

  /** One band: the group headings, then each row of buttons as its own block. */
  function bandBlocks(frame: PageFrame, band: readonly Section[], m: MenuMetrics): ScrollBlock[] {
    const groupGap = 28,
      total = band.reduce((sum, entry) => sum + entry.choices.length, 0),
      room = frame.width - groupGap * (band.length - 1);
    let x = frame.left;
    const placed = band.map((section) => {
      const w = band.length === 1 ? frame.width : (room * section.choices.length) / total;
      const columns = m.columns(section.choices.length, w, band.length === 1);
      const grid = choiceGrid(section.choices.length, 1, {
        minColumns: columns,
        maxColumns: columns,
        maxRows: Number.MAX_SAFE_INTEGER,
        width: w,
        gap: m.gap,
      });
      const entry = { section, x, grid, keyed: section.choices.some((choice) => choice.sub !== undefined) };
      x += w + groupGap;
      return entry;
    });
    const ink = ui.readable(ui.t.color.accent),
      rows = Math.max(...placed.map((entry) => entry.grid.rows));
    const blocks: ScrollBlock[] = [
      {
        height: m.heading,
        draw: (y) => {
          for (const entry of placed)
            ui.tag(context.canvas, entry.section.label, entry.x, y + ui.t.type.micro, ink, "left", ui.t.type.micro);
        },
      },
    ];
    const h = m.button(placed.some((entry) => entry.keyed));
    for (let row = 0; row < rows; row++) {
      const draw = (y: number, scrollView: ScrollView): void => {
        for (const { section, x: left, grid } of placed)
          section.choices.forEach((choice, index) => {
            const cell = grid.cells[index];
            if (cell?.row !== row) return;
            const box = { x: left + cell.column * (grid.cellWidth + m.gap), y, w: grid.cellWidth, h };
            scrollView.enqueue(control(choice, box, m));
          });
      };
      blocks.push({ height: h, draw });
    }
    return blocks;
  }

  /** A choice as a button: desktop carries the glyph and the sub line, the phone the sub after the label. */
  function control(
    choice: ChoiceView,
    box: Readonly<{ x: number; y: number; w: number; h: number }>,
    m: MenuMetrics,
  ): ScreenControl {
    const label = m.detail || choice.sub === undefined ? choice.label : `${choice.label} · ${choice.sub}`;
    return {
      ...box,
      label,
      ...(m.detail ? { glyph: choice.glyph, sub: choice.sub ?? choice.description } : {}),
      selected: choice.selected,
      enabled: choice.enabled,
      accent: choice.accent,
      size: m.size,
      action: action(choice.id),
    };
  }

  /**
   * ABILITIES: the filters (buttons on desktop, chips on the phone), then the abilities in two
   * columns: name, the effect copy, the ownership tag and the action button. A row's button is
   * offered only while it is fully inside the list, so nothing reaches RESUME or the hint.
   */
  function abilityLab(view: PlaygroundScreenView, choices: Choices): void {
    const t = ui.t;
    const filters = { y: DESKTOP.bodyTop - 18, width: 148, height: 34, left: width / 2 - 546, buttons: true };
    const frame = open(view, [{ items: choices("FILTERS"), action, desktop: filters }]);
    const lh = pf.lineHeight(t.type.micro),
      lines = (text: string, w: number): number => pf.lineCount(text, w, t.type.micro, 2);
    const m = frame.compact ? phoneLab(t, frame, lh, lines) : desktopLab(t, width);
    const cell = (choice: ChoiceView, x: number, y: number, w: number, h: number, scrollView: ScrollView): void => {
      labCard(m, choice, { x, y: y + m.inset, w, h: m.card(h) }, scrollView);
    };
    const list = pf.grid(m.span(frame), choices("ABILITIES"), 2, m.row, cell, m.columnGap);
    // Desktop rows start 10 px into the list (cards 40 px under the filters), and a row is drawn from 90 px above it.
    const desktop = { top: DESKTOP.bodyTop + 30, cull: { above: 90, below: 10 }, ...scrollFlags(view) };
    const state = pf.body(frame, { list, gap: m.gap, desktop });
    pf.close(frame, state, { back: null, primary: RESUME });
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
