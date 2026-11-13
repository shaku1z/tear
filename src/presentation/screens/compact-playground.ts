import type { ChoiceView, PlaygroundScreenView, ScreenControl, ScreenRenderContext } from "./contracts";
import { createCompactPage, type CompactPage, type ScrollBlock, type ScrollView } from "./compact-page";

/** Narrowest build-menu button; the column count follows from the page width. */
const PG_BUTTON_MIN_W = 270;

/**
 * The PLAYGROUND menu on the compact page, over the frozen arena (no sheet): the tab
 * strip in the header, the open tab as rows of full-size buttons under plain accent
 * headings, and RESUME in the footer row. ABILITIES lists abilities in two columns.
 */
export function createCompactPlayground(context: ScreenRenderContext) {
  const { ui } = context,
    kit = createCompactPage(context);

  function choiceControl(choice: ChoiceView, x: number, y: number, w: number, label = choice.label): ScreenControl {
    return {
      x,
      y,
      w,
      h: ui.t.metric.minTarget,
      label,
      selected: choice.selected,
      enabled: choice.enabled,
      accent: choice.accent,
      size: ui.t.type.label,
      action: { type: "playground.action", id: choice.id },
    };
  }

  /** A plain accent heading (no rule, as in the source build menu). */
  function heading(page: CompactPage, label: string): ScrollBlock {
    const t = ui.t;
    return {
      height: t.type.micro + t.space.xs,
      draw: (y) => {
        ui.tag(context.canvas, label, page.left, y + t.type.micro, ui.readable(t.color.accent), "left", t.type.micro);
      },
    };
  }

  /** Rows of buttons; `span` widens a lone choice (the arena cycler) across several columns. */
  function buttonRows(
    page: CompactPage,
    choices: readonly (readonly [ChoiceView, string])[],
    columns: number,
    span = 1,
  ): readonly ScrollBlock[] {
    const t = ui.t,
      gap = t.metric.btnGap,
      w = (page.width - gap * (columns - 1)) / columns,
      perRow = Math.max(1, Math.floor(columns / span));
    const blocks: ScrollBlock[] = [];
    for (let start = 0; start < choices.length; start += perRow) {
      const row = choices.slice(start, start + perRow);
      const draw = (y: number, view: ScrollView): void => {
        row.forEach(([choice, label], index) => {
          view.enqueue(
            choiceControl(choice, page.left + index * span * (w + gap), y, w * span + gap * (span - 1), label),
          );
        });
      };
      blocks.push({ height: t.metric.minTarget, draw });
    }
    return blocks;
  }

  function pageHeader(view: PlaygroundScreenView): CompactPage {
    return kit.header({
      title: view.title,
      subtitle: view.subtitle,
      sheet: false,
      tabs: view.tabs ?? [],
      tabAction: (id) => ({ type: "playground.action", id }),
    });
  }

  /** RESUME, centred in the footer row: every tab returns to the arena from here. */
  function resume(page: CompactPage): void {
    const t = ui.t;
    context.enqueue({
      x: page.centerX - t.metric.backW / 2,
      y: page.footerY,
      w: t.metric.backW,
      h: t.metric.btnH,
      label: "RESUME",
      size: t.type.lead,
      action: { type: "run.resume" },
    });
  }

  function buildMenu(view: PlaygroundScreenView): void {
    const t = ui.t,
      page = pageHeader(view);
    const columns = Math.max(3, Math.floor((page.width + t.metric.btnGap) / (PG_BUTTON_MIN_W + t.metric.btnGap)));
    const blocks: ScrollBlock[] = [];
    for (const section of view.sections) {
      const items = section.choices.map(
        (choice) => [choice, choice.sub === undefined ? choice.label : `${choice.label} · ${choice.sub}`] as const,
      );
      if (items.length > 0) blocks.push(heading(page, section.label), ...buttonRows(page, items, columns));
    }
    const state = kit.scroll(page, blocks, t.space.sm);
    resume(page);
    kit.footer(page, state, null);
  }

  function abilityLab(view: PlaygroundScreenView): void {
    const t = ui.t,
      pad = t.space.md;
    let page = pageHeader(view);
    const filters = view.sections.find((section) => section.label === "FILTERS")?.choices ?? [];
    page = kit.toolbar(page, [{ items: filters, action: (id) => ({ type: "playground.action", id }) }]);
    const abilities = view.sections.find((section) => section.label === "ABILITIES")?.choices ?? [];
    const width = (page.width - t.space.md) / 2,
      buttonW = Math.max(180, t.metric.minTarget * 1.8);
    const copyW = width - pad * 3 - buttonW;
    const cardH = (choice: ChoiceView): number =>
      Math.max(
        t.metric.minTarget + pad * 2,
        pad +
          t.type.lead +
          t.space.sm +
          (choice.description
            ? kit.lineCount(choice.description, copyW, t.type.micro, 2) * kit.lineHeight(t.type.micro)
            : 0) +
          (choice.sub ? t.space.xs + t.type.micro : 0) +
          pad,
      );
    const blocks = kit.grid(
      page,
      abilities,
      2,
      (row) => Math.max(...row.map(cardH)),
      (choice, x, y, w, h, scrollView) => {
        const { canvas } = context;
        ui.card(canvas, x, y, w, h, false);
        ui.accentStrip(canvas, x, y, w, choice.accent);
        const nameY = y + pad + t.type.lead;
        const name = ui.fitText(canvas, choice.label, copyW, { size: t.type.lead, floor: t.type.micro, bold: true });
        ui.displayText(canvas, name.lines[0] ?? choice.label, x + pad, nameY, name.size);
        let cursor = nameY;
        if (choice.description) {
          cursor = ui.textBox(canvas, choice.description, x + pad, nameY + t.space.sm + t.type.micro, copyW, {
            size: t.type.micro,
            maxLines: 2,
            lineHeight: kit.lineHeight(t.type.micro),
            alpha: t.alpha.soft,
          }).lastBaseline;
        }
        const subInk = ui.readable(choice.accent ?? t.color.accent);
        if (choice.sub)
          ui.tag(canvas, choice.sub, x + pad, cursor + t.space.xs + t.type.micro, subInk, "left", t.type.micro);
        scrollView.enqueue({
          ...choiceControl(
            choice,
            x + w - pad - buttonW,
            y + (h - t.metric.minTarget) / 2,
            buttonW,
            choice.glyph ?? "TAKE",
          ),
          accent: undefined,
          selected: undefined,
        });
      },
    );
    const state = kit.scroll(page, blocks);
    resume(page);
    kit.footer(page, state, null);
  }

  return Object.freeze({ buildMenu, abilityLab });
}
