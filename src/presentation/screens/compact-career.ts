import type { ProfileScreenView, ScreenAction, ScreenRenderContext } from "./contracts";
import { careerRowKey, labels as careerViews, percent, runFacts, SOURCE_COMMANDS, title as careerTitle, unknown as careerValue } from "./career-archive";
import { createCompactPage, type CompactPage, type FlowAction, type ScrollBlock } from "./compact-page";

type CareerView = NonNullable<ProfileScreenView["career"]>;
type CareerEntry = NonNullable<CareerView["selected"]>["entry"];
const PROFILE_HUE = "#b06cff";

/**
 * The CAREER ARCHIVE on the compact page: the run list (filters, rows, paging) or one
 * run's facts and actions, all as full-size touch targets in a scrolling body.
 */
export function createCompactCareer(context: ScreenRenderContext) {
  const { ui } = context, kit = createCompactPage(context);
  const back: ScreenAction = { type: "profile.selectTab", id: "bests" };

  const control = (label: string, command: string, enabled = true, id?: string): FlowAction =>
    ({ label, enabled, action: { type: "career.control", command, ...(id ? { id } : {}) } });

  /** A row of flowing buttons as one block. */
  function actionRow(page: CompactPage, items: readonly FlowAction[]): ScrollBlock {
    return { height: kit.actionsHeight(items, page.width), draw: (y, view) => kit.actions(items, page.left, y, page.width, view) };
  }

  function render(view: CareerView): void {
    const page = kit.header({ title: "CAREER ARCHIVE", hue: PROFILE_HUE, subtitle: "every run recorded on this device" });
    const blocks = view.selected ? detail(page, view, view.selected) : list(page, view);
    kit.footer(page, kit.scroll(page, blocks), back);
  }

  function list(page: CompactPage, view: CareerView): readonly ScrollBlock[] {
    const t = ui.t, blocks: ScrollBlock[] = [actionRow(page, [
      control("SEARCH / FILTERS", "search"), control(careerViews[view.query.view] ?? careerTitle(view.query.view), "view"),
      control(`SORT: ${view.query.sort.toUpperCase()}`, "sort"), control("CLEAR", "clear"), control("RECEIVE BEAT CODE", "beat-receive"),
    ])];
    blocks.push(kit.prose(page, `${view.total.toLocaleString("en-US")} ${view.total === 1 ? "run" : "runs"} found · ${
      view.retained.toLocaleString("en-US")} kept on this device${view.indexing ? " · still reading older runs…" : ""}`, { maxLines: 2 }));
    if (view.rows.length === 0) {
      blocks.push(kit.empty(page, "◇", view.status === "loading" ? "Reading your runs…" : "No runs match",
        view.status === "loading" ? undefined : "Try CLEAR to drop the filters, or play a run — it is recorded here automatically."));
    }
    for (const row of view.rows) {
      const e = row.entry, summary = view.query.view === "dna-evolution"
        ? Object.entries(e.dna).map(([key, value]) => `${key} ${percent(value)}`).join(" · ") || "Run DNA not recorded for this run"
        : `${e.date.slice(0, 10)} · wave ${careerValue(e.wave)} · score ${e.score === null ? "—" : e.score.toLocaleString("en-US")}${
          row.notes.retention === "pinned" ? " · pinned" : ""}${row.notes.tags.length ? ` · ${row.notes.tags.join(", ")}` : ""}`;
      const select = control(`${careerTitle(e.mode)} · ${careerTitle(e.weapon)} · ${careerTitle(e.result)}`, "select", true, careerRowKey(row));
      const height = t.metric.minTarget + t.space.xs + kit.lineCount(row.detail ?? summary, page.width, t.type.caption, 2) * kit.lineHeight(t.type.caption);
      blocks.push({ height, draw: (y, scrollView) => {
        scrollView.enqueue({ x: page.left, y, w: page.width, h: t.metric.minTarget, label: select.label, size: t.type.label, action: select.action });
        ui.textBox(context.canvas, row.detail ?? summary, page.left, y + t.metric.minTarget + t.space.xs + t.type.caption, page.width,
          { size: t.type.caption, maxLines: 2, lineHeight: kit.lineHeight(t.type.caption), alpha: t.alpha.muted });
      } });
    }
    blocks.push(actionRow(page, [control("‹ PREVIOUS", "previous", view.page > 0), control("NEXT ›", "next", view.page + 1 < view.pages)]));
    const pages = `Page ${String(view.page + 1)} / ${String(Math.max(1, view.pages))}`;
    blocks.push(kit.prose(page, view.message ? `${pages} · ${view.message}` : pages, { maxLines: 2 }));
    return blocks;
  }

  function detail(page: CompactPage, view: CareerView, selected: NonNullable<CareerView["selected"]>): readonly ScrollBlock[] {
    const t = ui.t, { entry: e, notes } = selected;
    const raceEligible = e.seedRaceRole === "reference" && e.verified === "receipts" && e.result !== null;
    const chaseEligible = !e.beatAttempt && !e.assisted && e.verified === "receipts" && selected.detail?.startsWith("Recorded category best") === true;
    const top: FlowAction[] = [control("BACK TO RESULTS", "back"),
      control(e.beatAttempt ? "BEAT RESULT" : "BEAT THIS RUN", e.beatAttempt ? "beat-review" : "beat", e.present && e.kind === "capsule")];
    if (e.beatAttempt) top.push(control("SAVE RESULT", "beat-save"), control("RETRY BEAT", "beat-retry"));
    const blocks: ScrollBlock[] = [actionRow(page, top)];
    runFacts(e, selected.detail, notes, chaseEligible).forEach((fact, index) => {
      blocks.push(kit.prose(page, fact, { size: index === 0 ? t.type.lead : t.type.body, alpha: t.alpha.soft, maxLines: 3 }));
    });
    if (e.unavailable.length > 0) blocks.push(kit.prose(page, `Not recorded for this run: ${e.unavailable.join(", ")}`, { maxLines: 2 }));
    if (view.message && !view.confirming) blocks.push(kit.prose(page, view.message, { maxLines: 2 }));
    if (view.confirming) {
      const question = "Delete this run from this device? Its tags go too. Copies you shared elsewhere stay.";
      blocks.push(kit.prose(page, question, { alpha: t.alpha.soft, maxLines: 2 }));
      blocks.push(actionRow(page, [control("DELETE LOCAL", "confirm-delete"), control("KEEP", "cancel-delete")]));
      return blocks;
    }
    blocks.push(actionRow(page, sourceActions(e, (command) => (command !== "chase" || chaseEligible) && (command !== "race" || raceEligible))));
    blocks.push(actionRow(page, [control("TAGS", "tags", e.kind === "capsule"), control(notes.retention === "pinned" ? "UNPIN" : "PIN", "pin"),
      control("KEEP…", "retention", e.kind === "capsule"), control("DELETE LOCAL", "delete")]));
    return blocks;
  }

  /** Ways to use the run's recording; commands this build does not offer are omitted. */
  function sourceActions(e: CareerEntry, eligible: (command: string) => boolean): readonly FlowAction[] {
    return SOURCE_COMMANDS.filter(([, command]) => context.available?.({ type: "career.control", command }) !== false)
      .map(([label, command]) => control(label, command, e.present && (e.kind === "capsule" || command === "watch") && eligible(command)));
  }

  return render;
}
