import type { ChoiceView, PlaygroundScreenView, ScreenControl, ScreenRenderContext } from "./contracts";
import { createCompactPage, type CompactPage, type ScrollBlock, type ScrollView } from "./compact-page";

type Section = PlaygroundScreenView["sections"][number];
/** Narrowest build-menu button; the column count follows from the page width. */
const PG_BUTTON_MIN_W = 270;

/**
 * The PLAYGROUND build menu and ABILITY LAB on the compact page, over the frozen arena
 * (no sheet). The build menu keeps the source's groups (spawn, modifiers, difficulty,
 * bosses, arena, weapon, toggles, actions) as rows of full-size buttons under plain
 * accent headings, with RESUME in the footer row; the lab lists abilities in two columns.
 */
export function createCompactPlayground(context: ScreenRenderContext) {
  const { ui } = context, kit = createCompactPage(context);

  function choiceControl(choice: ChoiceView, x: number, y: number, w: number, label = choice.label): ScreenControl {
    return { x, y, w, h: ui.t.metric.minTarget, label, selected: choice.selected, enabled: choice.enabled, accent: choice.accent,
      size: ui.t.type.label, action: { type: "playground.action", id: choice.id } };
  }

  /** A plain accent heading (no rule, as in the source build menu). */
  function heading(page: CompactPage, label: string): ScrollBlock {
    const t = ui.t;
    return { height: t.type.micro + t.space.xs, draw: (y) => {
      ui.tag(context.canvas, label, page.left, y + t.type.micro, ui.readable(t.color.accent), "left", t.type.micro);
    } };
  }

  /** Rows of buttons; `span` widens a lone choice (the arena cycler) across several columns. */
  function buttonRows(page: CompactPage, choices: readonly (readonly [ChoiceView, string])[], columns: number, span = 1): readonly ScrollBlock[] {
    const t = ui.t, gap = t.metric.btnGap, w = (page.width - gap * (columns - 1)) / columns, perRow = Math.max(1, Math.floor(columns / span));
    const blocks: ScrollBlock[] = [];
    for (let start = 0; start < choices.length; start += perRow) {
      const row = choices.slice(start, start + perRow);
      const draw = (y: number, view: ScrollView): void => {
        row.forEach(([choice, label], index) => {
          view.enqueue(choiceControl(choice, page.left + index * span * (w + gap), y, w * span + gap * (span - 1), label));
        });
      };
      blocks.push({ height: t.metric.minTarget, draw });
    }
    return blocks;
  }

  function buildMenu(view: PlaygroundScreenView): void {
    const t = ui.t, page = kit.header({ title: view.title, subtitle: view.subtitle, sheet: false });
    const sections = new Map(view.sections.map((section): [string, Section] => [section.label, section]));
    const choices = (label: string, prefix = ""): readonly (readonly [ChoiceView, string])[] =>
      (sections.get(label)?.choices ?? []).map((choice) => [choice, prefix ? `${prefix} ${choice.label}` : choice.label] as const);
    const columns = Math.max(3, Math.floor((page.width + t.metric.btnGap) / (PG_BUTTON_MIN_W + t.metric.btnGap)));
    const groups: readonly (readonly [string, readonly (readonly [ChoiceView, string])[], number])[] = [
      ["SPAWN ENEMIES", choices("SPAWN ENEMIES"), 1],
      ["SPAWN MODIFIERS", [...choices("HP", "HP"), ...choices("COUNT", "COUNT")], 1],
      ["DIFFICULTY", choices("DIFFICULTY"), 1],
      ["SUMMON A BOSS", choices("SUMMON A BOSS"), 1],
      ["ARENA", choices("ARENA"), Math.ceil(columns / 2)],
      ["WEAPON  (restarts the arena)", choices("WEAPON"), 1],
      ["MODIFIERS", choices("MODIFIERS"), 1],
      ["ACTIONS", choices("ACTIONS"), 1],
    ];
    const blocks: ScrollBlock[] = [];
    for (const [label, items, span] of groups) {
      if (items.length === 0) continue;
      blocks.push(heading(page, label), ...buttonRows(page, items, columns, span));
    }
    const state = kit.scroll(page, blocks, t.space.sm);
    // The build menu resumes through RESUME (and Tab / Esc), centred in the footer row.
    context.enqueue({ x: page.centerX - t.metric.backW / 2, y: page.footerY, w: t.metric.backW, h: t.metric.btnH, label: "RESUME",
      size: t.type.lead, action: { type: "run.resume" } });
    kit.footer(page, state, null);
  }

  function abilityLab(view: PlaygroundScreenView): void {
    const t = ui.t, pad = t.space.md;
    let page = kit.header({ title: view.title, subtitle: view.subtitle, sheet: false });
    const filters = view.sections.find((section) => section.label === "FILTERS")?.choices ?? [];
    page = kit.toolbar(page, [{ items: filters, action: (id) => ({ type: "playground.action", id }) }]);
    const abilities = view.sections.find((section) => section.label === "ABILITIES")?.choices ?? [];
    const width = (page.width - t.space.md) / 2, buttonW = Math.max(180, t.metric.minTarget * 1.8);
    const copyW = width - pad * 3 - buttonW;
    const cardH = (choice: ChoiceView): number => Math.max(t.metric.minTarget + pad * 2,
      pad + t.type.lead + t.space.sm + (choice.description ? kit.lineCount(choice.description, copyW, t.type.micro, 2) * kit.lineHeight(t.type.micro) : 0)
        + (choice.sub ? t.space.xs + t.type.micro : 0) + pad);
    const blocks = kit.grid(page, abilities, 2, (row) => Math.max(...row.map(cardH)), (choice, x, y, w, h, scrollView) => {
      const { canvas } = context;
      ui.card(canvas, x, y, w, h, false);
      ui.accentStrip(canvas, x, y, w, choice.accent);
      const nameY = y + pad + t.type.lead;
      const name = ui.fitText(canvas, choice.label, copyW, { size: t.type.lead, floor: t.type.micro, bold: true });
      ui.displayText(canvas, name.lines[0] ?? choice.label, x + pad, nameY, name.size);
      let cursor = nameY;
      if (choice.description) {
        cursor = ui.textBox(canvas, choice.description, x + pad, nameY + t.space.sm + t.type.micro, copyW,
          { size: t.type.micro, maxLines: 2, lineHeight: kit.lineHeight(t.type.micro), alpha: t.alpha.soft }).lastBaseline;
      }
      const subInk = ui.readable(choice.accent ?? t.color.accent);
      if (choice.sub) ui.tag(canvas, choice.sub, x + pad, cursor + t.space.xs + t.type.micro, subInk, "left", t.type.micro);
      scrollView.enqueue({ ...choiceControl(choice, x + w - pad - buttonW, y + (h - t.metric.minTarget) / 2, buttonW, choice.glyph ?? "TAKE"),
        accent: undefined, selected: undefined });
    });
    kit.footer(page, kit.scroll(page, blocks), { type: "navigate", to: "pgmenu" });
  }

  return Object.freeze({ buildMenu, abilityLab });
}
