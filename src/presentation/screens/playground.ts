import type { ChoiceView, PlaygroundScreenView, ScreenControl, ScreenRenderContext } from "./contracts";
import { createActionCard, desktopActionCard, phoneActionCard } from "./action-card";
import { buttonGrid } from "./choice-grid";
import { createPageFrame, type FlowAction, type PageFrame, type ScrollBlock, type ScrollView } from "./page-frame";

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
    size: t.type.label,
    detail: false,
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
  const { ui, width } = context,
    pf = createPageFrame(context),
    card = createActionCard(context);
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
    const keyed = band.some((section) => section.choices.some((choice) => choice.sub !== undefined));
    let x = frame.left;
    const placed = band.map((section) => {
      const w = band.length === 1 ? frame.width : (room * section.choices.length) / total;
      const columns = m.columns(section.choices.length, w, band.length === 1),
        buttons = section.choices.map((choice) => control(choice, { x: 0, y: 0, w, h: 0 }, m, keyed));
      const grid = buttonGrid(ui, context.canvas, buttons, {
        minColumns: columns,
        maxColumns: columns,
        maxRows: Number.MAX_SAFE_INTEGER,
        width: w,
        gap: m.gap,
      });
      const entry = { section, x, grid };
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
    // One row height across the band: the tallest button any of its groups needs.
    const h = Math.max(...placed.map((entry) => entry.grid.rowHeight));
    for (let row = 0; row < rows; row++) {
      const draw = (y: number, scrollView: ScrollView): void => {
        for (const { section, x: left, grid } of placed)
          section.choices.forEach((choice, index) => {
            const cell = grid.cells[index];
            if (cell?.row !== row) return;
            const box = { x: left + cell.column * (grid.cellWidth + m.gap), y, w: grid.cellWidth, h };
            scrollView.enqueue(control(choice, box, m, keyed));
          });
      };
      blocks.push({ height: h, draw });
    }
    return blocks;
  }

  /**
   * A choice as a button: desktop carries the glyph and the sub line, the phone the sub after the
   * label. In a band where some buttons show a key, every button keeps the sub line's room (an
   * empty one where it has no key), so all labels sit on the same line.
   */
  function control(
    choice: ChoiceView,
    box: Readonly<{ x: number; y: number; w: number; h: number }>,
    m: MenuMetrics,
    keyed = false,
  ): ScreenControl {
    const label = m.detail || choice.sub === undefined ? choice.label : `${choice.label} · ${choice.sub}`;
    const sub = choice.sub ?? choice.description ?? (keyed ? " " : undefined);
    return {
      ...box,
      label,
      ...(m.detail ? { glyph: choice.glyph, sub } : {}),
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
      lines = (text: string, w: number, max: number): number => pf.lineCount(text, w, t.type.micro, max);
    const m = frame.compact ? phoneActionCard(t, frame, lh, lines) : desktopActionCard(t, width);
    const cell = (choice: ChoiceView, x: number, y: number, w: number, h: number, scrollView: ScrollView): void => {
      card(m, choice, { x, y: y + m.inset, w, h: m.card(h) }, scrollView, action(choice.id));
    };
    const list = pf.grid(m.span(frame), choices("ABILITIES"), 2, m.row, cell, m.columnGap);
    // Desktop rows start 10 px into the list (cards 40 px under the filters), and a row is drawn from 90 px above it.
    const desktop = { top: DESKTOP.bodyTop + 30, cull: { above: 90, below: 10 }, ...scrollFlags(view) };
    const state = pf.body(frame, { list, gap: m.gap, desktop });
    pf.close(frame, state, { back: null, primary: RESUME });
  }

  return { pgmenu: render, pglab: render };
}
