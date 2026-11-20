import type { CareerEntry } from "../../ghost/career-archive";
import { careerRowKey } from "../../domain/career-row-key";
export { careerRowKey } from "../../domain/career-row-key";
import type { ProfileScreenView, ScreenAction, ScreenRenderContext } from "./contracts";
import {
  createPageFrame,
  evenSlots,
  type ButtonSlot,
  type FlowAction,
  type PageFrame,
  type ScrollBlock,
  type ScrollView,
} from "./page-frame";

export const labels: Readonly<Record<string, string>> = {
  history: "ALL RUNS",
  "personal-best": "PERSONAL BESTS",
  "first-clear": "FIRST CLEARS",
  "best-weapon": "BEST BY WEAPON",
  "boss-change": "BOSS CLEAR TIMES",
  "favorite-builds": "FAVORITE BUILDS",
  "near-miss": "BOSS NEAR MISSES",
  "style-milestones": "STYLE MILESTONES",
  "longest-survival": "LONGEST SURVIVAL",
  "dna-evolution": "RUN DNA HISTORY",
};
const PROFILE_HUE = "#b06cff";
export const SOURCE_COMMANDS = Object.freeze([
  ["THEATER", "watch"],
  ["DOWNLOAD", "download"],
  ["CHASE BEST", "chase"],
  ["RACE THIS REFERENCE", "race"],
] as const);
export const unknown = (value: string | number | null | undefined, fallback = "—"): string =>
  value === null || value === undefined || value === "" ? fallback : String(value);
const clock = (seconds: number): string =>
  `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export const percent = (value: number): string => `${String(Math.round(value * 100))}%`;
export const title = (value: string | null): string =>
  value === null ? "—" : value.replace(/[-_]+/g, " ").toUpperCase();

/** A run's facts in player language: no ids, hashes, byte counts or custody terms. */
export function runFacts(
  entry: CareerEntry,
  detail: string | undefined,
  notes: Readonly<{ tags: readonly string[]; retention: string }>,
  chaseEligible: boolean,
): readonly string[] {
  const facts: string[] = [];
  facts.push(
    detail ??
      `${entry.kind === "legacy-visual" ? "OLDER RECORDING (WATCH ONLY) · " : ""}${title(entry.mode)} · ${title(entry.difficulty)} · ${title(entry.weapon)}`,
  );
  facts.push(
    `${entry.date.slice(0, 10)} · ${title(entry.result)} · wave ${unknown(entry.wave)} · score ${entry.score === null ? "—" : entry.score.toLocaleString("en-US")}`,
  );
  facts.push(
    `Time ${entry.seconds === null ? "—" : clock(entry.seconds)} · damage taken ${entry.damage === null ? "—" : String(Math.round(entry.damage))}`,
  );
  if (entry.loadout !== null)
    facts.push(
      `Build: ${entry.loadout.map((row) => `${title(row.id)}${row.count > 1 ? ` ×${String(row.count)}` : ""}${row.tier > 1 ? ` (tier ${String(row.tier)})` : ""}`).join(", ") || "no upgrades"}`,
    );
  if (entry.bosses !== null && entry.bosses.length > 0) facts.push(`Bosses: ${entry.bosses.map(title).join(", ")}`);
  if (entry.style)
    facts.push(
      `Style: best combo ${String(Math.round(entry.style.combo))} · ×${entry.style.multiplier.toFixed(1)} multiplier${entry.style.rank ? ` · rank ${entry.style.rank}` : ""}`,
    );
  if (entry.nearMiss !== null && entry.nearMiss.length > 0)
    facts.push(
      `So close: ${entry.nearMiss.map((miss) => `${title(miss.boss)} left at ${String(Math.round(miss.hp))} / ${String(Math.round(miss.maxHp))} HP`).join(", ")}`,
    );
  const dna = Object.entries(entry.dna);
  if (dna.length > 0) facts.push(`Run DNA: ${dna.map(([key, value]) => `${key} ${percent(value)}`).join(" · ")}`);
  facts.push(
    `Tags: ${notes.tags.join(", ") || "none"} · ${notes.retention === "pinned" ? "pinned" : "kept with recent runs"}`,
  );
  facts.push(
    entry.beatAttempt
      ? "A Beat This Run attempt — unranked, no progression."
      : entry.seedRaceRole
        ? "Seed-Locked Race run — shared setup, unranked, no rewards."
        : entry.assisted
          ? "Assisted run — unranked."
          : chaseEligible
            ? "CHASE is available: replay this best with your own choices (unranked)."
            : "",
  );
  return facts.filter((fact) => fact.length > 0);
}

type Tokens = ScreenRenderContext["ui"]["t"];
type CareerView = NonNullable<ProfileScreenView["career"]>;
type Selected = NonNullable<CareerView["selected"]>;
type Line = Readonly<{ size: number; maxLines: number; baseline: number; height?: number; gap?: number }>;
/** Desktop placement of a button row: its block height and where each button sits. */
type Buttons = Readonly<{ blockHeight: number; slots: (frame: PageFrame, count: number) => readonly ButtonSlot[] }>;

/** What both densities draw, with different numbers: the drawers read only this and `DESKTOP`. */
interface CareerMetrics {
  readonly gap: number;
  readonly count: Line;
  readonly fact: Line;
  readonly unavailable: Line;
  /** The run's status line: its message, or the delete question. */
  readonly status: Line;
  readonly row: Readonly<{
    button: number;
    summaryY: number;
    summaryLines: number;
    height: (space: number, count: number, lines: () => number) => number;
    summary: (height: number) => boolean;
  }>;
}

const METRICS: Readonly<Record<"desktop" | "phone", (t: Tokens) => CareerMetrics>> = {
  desktop: (t) => ({
    gap: 0,
    count: { size: t.type.caption, maxLines: 1, baseline: 0, height: 18 },
    fact: { size: t.type.body, maxLines: 2, baseline: 0, gap: 6 },
    unavailable: { size: t.type.caption, maxLines: 2, baseline: 0, gap: 0 },
    status: { size: t.type.caption, maxLines: 1, baseline: 0, height: 18 },
    row: {
      button: 38,
      summaryY: 56,
      summaryLines: 1,
      height: (space, count) => Math.max(48, Math.min(92, space / Math.max(3, count))),
      summary: (height) => height >= 62,
    },
  }),
  phone: (t) => ({
    gap: t.space.md,
    count: { size: t.type.caption, maxLines: 2, baseline: 0 },
    fact: { size: t.type.body, maxLines: 3, baseline: 0 },
    unavailable: { size: t.type.caption, maxLines: 2, baseline: 0 },
    status: { size: t.type.caption, maxLines: 2, baseline: 0 },
    row: {
      button: t.metric.minTarget,
      summaryY: t.metric.minTarget + t.space.xs + t.type.caption,
      summaryLines: 2,
      height: (_space, _count, lines) => t.metric.minTarget + t.space.xs + lines() * Math.round(t.type.caption * 1.25),
      summary: () => true,
    },
  }),
};

/** Desktop buttons at fixed offsets from the column's left (a negative offset counts from its right). */
const at =
  (...places: readonly (readonly [number, number])[]) =>
  (frame: PageFrame): readonly ButtonSlot[] =>
    places.map(([x, w]) => ({ x: x < 0 ? frame.left + frame.width + x : frame.left + x, w }));
const even = (blockHeight: number): Buttons => ({ blockHeight, slots: (frame, n) => evenSlots(frame, n, 8) });

/** The desktop design's placements, which the phone page does not use (it flows and measures instead). */
const DESKTOP = {
  button: 36,
  filters: { blockHeight: 66, slots: at([0, 220], [232, 250], [494, 190], [696, 120], [-230, 230]) },
  runActions: { blockHeight: 74, slots: at([0, 230], [242, 190], [444, 170], [626, 170]) },
  confirm: { blockHeight: 82, slots: at([0, 240], [252, 150]) },
  sources: even(44),
  keep: even(38),
  /** Room for the run rows: under the filters and the count line, above the pager's note line. */
  rowSpace: (frame: PageFrame) => frame.bottom - 26 - (frame.top + 84),
  cull: { above: 0, below: 38 },
  empty: { centre: 120, wrap: 640, ctaWidth: 0, ctaHeight: 0 },
} as const;

/** The CAREER ARCHIVE: the run list (filters, rows, paging) or one run's facts and actions, at both densities. */
export function createCareerArchiveRenderer(context: ScreenRenderContext) {
  const { ui } = context,
    frames = createPageFrame(context);
  const back: ScreenAction = { type: "profile.selectTab", id: "bests" };

  const control = (label: string, command: string, enabled = true, id?: string): FlowAction => ({
    label,
    enabled,
    action: { type: "career.control", command, ...(id ? { id } : {}) },
  });

  return (view: CareerView): void => {
    const m = METRICS[ui.density.compact ? "phone" : "desktop"](ui.t);
    const frame = frames.open({
      title: "CAREER ARCHIVE",
      subtitle: "every run recorded on this device",
      hue: PROFILE_HUE,
      desktop: {},
    });
    const desktop = { top: frame.top, cull: DESKTOP.cull, scrolls: false };
    const pager = view.selected
      ? undefined
      : {
          previous: control("‹ PREVIOUS", "previous", view.page > 0),
          next: control("NEXT ›", "next", view.page + 1 < view.pages),
          label: `Page ${String(view.page + 1)} / ${String(Math.max(1, view.pages))}`,
          note: view.message || undefined,
        };
    const parts = view.selected ? detail(frame, m, view, view.selected) : list(frame, m, view);
    frames.close(frame, frames.body(frame, { ...parts, pager, gap: m.gap, desktop }), { back, pager });
  };

  function buttons(frame: PageFrame, items: readonly FlowAction[], place: Buttons): ScrollBlock {
    const slots = place.slots(frame, items.length);
    return frames.actions(frame, items, {
      height: DESKTOP.button,
      size: ui.t.type.label,
      blockHeight: place.blockHeight,
      slots,
    });
  }

  function line(frame: PageFrame, text: string, style: Line, alpha?: number): ScrollBlock;
  function line(frame: PageFrame, text: string | undefined, style: Line, alpha?: number): ScrollBlock | undefined;
  function line(frame: PageFrame, text: string | undefined, style: Line, alpha = ui.t.alpha.muted) {
    return frames.prose(frame, text, { ...style, align: "left", alpha, box: true });
  }

  function list(frame: PageFrame, m: CareerMetrics, view: CareerView) {
    const filters = [
      control("SEARCH / FILTERS", "search"),
      control(labels[view.query.view] ?? title(view.query.view), "view"),
      control(`SORT: ${view.query.sort.toUpperCase()}`, "sort"),
      control("CLEAR", "clear"),
    ];
    const found = `${view.total.toLocaleString("en-US")} ${view.total === 1 ? "run" : "runs"} found`,
      kept = `${view.retained.toLocaleString("en-US")} kept on this device`;
    const head = [
      buttons(frame, filters, DESKTOP.filters),
      line(frame, `${found} · ${kept}${view.indexing ? " · still reading older runs…" : ""}`, m.count),
    ];
    if (view.rows.length === 0) {
      const loading = view.status === "loading";
      const copy = {
        glyph: "◇",
        line: loading ? "Reading your runs…" : "No runs match",
        detail: loading
          ? undefined
          : "Try CLEAR to drop the filters, or play a run — it is recorded here automatically.",
      };
      return { head, list: [frames.emptyState(frame, copy, undefined, DESKTOP.empty)] };
    }
    const space = DESKTOP.rowSpace(frame);
    return { head, list: view.rows.map((row) => runRow(frame, m, view, row, space)) };
  }

  function summaryOf(view: CareerView, row: CareerView["rows"][number]): string {
    const e = row.entry;
    if (row.detail) return row.detail;
    if (view.query.view === "dna-evolution")
      return (
        Object.entries(e.dna)
          .map(([key, value]) => `${key} ${percent(value)}`)
          .join(" · ") || "Run DNA not recorded for this run"
      );
    const score = e.score === null ? "—" : e.score.toLocaleString("en-US"),
      pinned = row.notes.retention === "pinned" ? " · pinned" : "",
      tags = row.notes.tags.length ? ` · ${row.notes.tags.join(", ")}` : "";
    return `${e.date.slice(0, 10)} · wave ${unknown(e.wave)} · score ${score}${pinned}${tags}`;
  }

  /** One run: a full-width button naming it, with its summary under it when there is room. */
  function runRow(
    frame: PageFrame,
    m: CareerMetrics,
    view: CareerView,
    row: CareerView["rows"][number],
    space: number,
  ): ScrollBlock {
    const t = ui.t,
      e = row.entry,
      summary = summaryOf(view, row);
    const label = `${title(e.mode)} · ${title(e.weapon)} · ${title(e.result)}`;
    const height = m.row.height(space, view.rows.length, () =>
      frames.lineCount(summary, frame.width, t.type.caption, m.row.summaryLines),
    );
    const draw = (y: number, scrollView: ScrollView): void => {
      const { action } = control(label, "select", true, careerRowKey(row));
      scrollView.enqueue({
        x: frame.left,
        y,
        w: frame.width,
        h: m.row.button,
        label,
        size: t.type.label,
        enabled: true,
        action,
      });
      if (m.row.summary(height))
        ui.textBox(context.canvas, summary, frame.left, y + m.row.summaryY, frame.width, {
          size: t.type.caption,
          maxLines: m.row.summaryLines,
          lineHeight: frames.lineHeight(t.type.caption),
          alpha: t.alpha.muted,
        });
    };
    return { height, draw };
  }

  function detail(frame: PageFrame, m: CareerMetrics, view: CareerView, selected: Selected) {
    const t = ui.t,
      { entry: e, notes } = selected;
    const raceEligible = e.seedRaceRole === "reference" && e.verified === "receipts" && e.result !== null;
    const chaseEligible =
      !e.beatAttempt &&
      !e.assisted &&
      e.verified === "receipts" &&
      selected.detail?.startsWith("Recorded category best") === true;
    const top: FlowAction[] = [control("BACK TO RESULTS", "back")];
    const facts = runFacts(e, selected.detail, notes, chaseEligible).map((fact, index) =>
      line(frame, fact, { ...m.fact, size: index === 0 ? t.type.lead : m.fact.size }, t.alpha.soft),
    );
    if (e.unavailable.length > 0)
      facts.push(line(frame, `Not recorded for this run: ${e.unavailable.join(", ")}`, m.unavailable));
    const head = [buttons(frame, top, DESKTOP.runActions)];
    if (view.confirming) {
      const question = "Delete this run from this device? Its tags go too. Copies you shared elsewhere stay.";
      const choice = [control("DELETE LOCAL", "confirm-delete"), control("KEEP", "cancel-delete")];
      const tail = [line(frame, question, m.status, t.alpha.soft), buttons(frame, choice, DESKTOP.confirm)];
      return { head, list: facts, tail };
    }
    // Ways to use the run's recording; commands this build does not offer are left out and the row closes up.
    const eligible = (command: string): boolean =>
      e.present &&
      (e.kind === "capsule" || command === "watch") &&
      (command !== "chase" || chaseEligible) &&
      (command !== "race" || raceEligible);
    const sources = SOURCE_COMMANDS.filter(
      ([, command]) => context.available?.({ type: "career.control", command }) !== false,
    ).map(([label, command]) => control(label, command, eligible(command)));
    const keep = [
      control("TAGS", "tags", e.kind === "capsule"),
      control(notes.retention === "pinned" ? "UNPIN" : "PIN", "pin"),
      control("KEEP…", "retention", e.kind === "capsule"),
      control("DELETE LOCAL", "delete"),
    ];
    const tail = [
      line(frame, view.message || undefined, m.status),
      buttons(frame, sources, DESKTOP.sources),
      buttons(frame, keep, DESKTOP.keep),
    ];
    return { head, list: facts, tail };
  }
}
