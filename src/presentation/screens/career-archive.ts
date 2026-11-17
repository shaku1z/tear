import type { CareerEntry } from "../../ghost/career-archive";
import { careerRowKey } from "../../domain/career-row-key";
export { careerRowKey } from "../../domain/career-row-key";
import type { ProfileScreenView, ScreenAction, ScreenRenderContext } from "./contracts";
import { page, pageFooter } from "./screen-primitives";

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
  ["COACH", "coach"],
  ["CHALLENGE", "challenge"],
  ["DOWNLOAD", "download"],
  ["PUBLISH", "publish"],
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

/** Presentation only; text editing and source actions use explicit application ports. */
export function createCareerArchiveRenderer(context: ScreenRenderContext) {
  return (view: NonNullable<ProfileScreenView["career"]>): void => {
    const { ui, canvas, width } = context;
    const layout = page(context, {
      title: "CAREER ARCHIVE",
      subtitle: "every run recorded on this device",
      hue: PROFILE_HUE,
    });
    const left = layout.left,
      available = layout.contentWidth;
    const back: ScreenAction = { type: "profile.selectTab", id: "bests" };
    const line = (
      text: string,
      y: number,
      options: Readonly<{ muted?: boolean; size?: number; maxLines?: number }> = {},
    ): number =>
      ui.textBox(canvas, text, left, y, available, {
        size: options.size ?? ui.t.type.caption,
        alpha: options.muted === true ? ui.t.alpha.muted : ui.t.alpha.soft,
        maxLines: options.maxLines ?? 1,
      }).height;
    const button = (
      label: string,
      command: string,
      x: number,
      y: number,
      w = 170,
      enabled = true,
      id?: string,
      h = 36,
    ) => {
      context.enqueue({
        x,
        y,
        w,
        h,
        label,
        size: ui.t.type.label,
        enabled,
        action: { type: "career.control", command, ...(id ? { id } : {}) },
      });
    };
    const toolbarY = layout.bodyTop;
    /** Ways to use the run's recording; commands whose surface this build does not offer are omitted and the row closes up. */
    const sourceActions = (e: CareerEntry, y: number, eligible: (command: string) => boolean): void => {
      const sources = SOURCE_COMMANDS.filter(
        ([, command]) => context.available?.({ type: "career.control", command }) !== false,
      );
      const slots = sources.length,
        slotWidth = (available - (slots - 1) * 8) / slots;
      sources.forEach(([label, command], i) => {
        const enabled = e.present && (e.kind === "capsule" || command === "watch") && eligible(command);
        button(label, command, left + (i * (available + 8)) / slots, y, slotWidth, enabled);
      });
    };
    /** Tagging and retention for the run on this device. */
    const keepActions = (e: CareerEntry, retention: string, y: number): void => {
      const commands = [
        ["TAGS", "tags"],
        [retention === "pinned" ? "UNPIN" : "PIN", "pin"],
        ["KEEP…", "retention"],
        ["DELETE LOCAL", "delete"],
      ] as const;
      commands.forEach(([label, command], i) => {
        button(
          label,
          command,
          left + (i * (available + 8)) / 4,
          y,
          (available - 24) / 4,
          e.kind === "capsule" || command === "pin" || command === "delete",
        );
      });
    };
    if (!view.selected) {
      button("SEARCH / FILTERS", "search", left, toolbarY, 220);
      button(labels[view.query.view] ?? title(view.query.view), "view", left + 232, toolbarY, 250);
      button(`SORT: ${view.query.sort.toUpperCase()}`, "sort", left + 494, toolbarY, 190);
      button("CLEAR", "clear", left + 696, toolbarY, 120);
      button("RECEIVE BEAT CODE", "beat-receive", left + available - 230, toolbarY, 230);
      line(
        `${view.total.toLocaleString("en-US")} ${view.total === 1 ? "run" : "runs"} found · ${view.retained.toLocaleString("en-US")} kept on this device${view.indexing ? " · still reading older runs…" : ""}`,
        toolbarY + 66,
        { muted: true },
      );
      const listTop = toolbarY + 84,
        listBottom = layout.bodyBottom - 26;
      const rowHeight = Math.max(48, Math.min(92, (listBottom - listTop) / Math.max(3, view.rows.length)));
      view.rows.forEach((row, i) => {
        const e = row.entry,
          y = listTop + i * rowHeight;
        if (y + 38 > listBottom) return;
        button(
          `${title(e.mode)} · ${title(e.weapon)} · ${title(e.result)}`,
          "select",
          left,
          y,
          available,
          true,
          careerRowKey(row),
          38,
        );
        if (rowHeight >= 62) {
          const summary =
            view.query.view === "dna-evolution"
              ? Object.entries(e.dna)
                  .map(([key, value]) => `${key} ${percent(value)}`)
                  .join(" · ") || "Run DNA not recorded for this run"
              : `${e.date.slice(0, 10)} · wave ${unknown(e.wave)} · score ${e.score === null ? "—" : e.score.toLocaleString("en-US")}${row.notes.retention === "pinned" ? " · pinned" : ""}${row.notes.tags.length ? ` · ${row.notes.tags.join(", ")}` : ""}`;
          line(row.detail ?? summary, y + 56, { muted: true });
        }
      });
      if (!view.rows.length)
        ui.emptyState(
          canvas,
          "◇",
          view.status === "loading" ? "Reading your runs…" : "No runs match",
          width / 2,
          listTop + 120,
          view.status === "loading"
            ? undefined
            : "Try CLEAR to drop the filters, or play a run — it is recorded here automatically.",
          640,
        );
      const footer = pageFooter(context, { back });
      button("‹ PREVIOUS", "previous", left, footer.footerY + 6, 170, view.page > 0);
      button("NEXT ›", "next", left + 182, footer.footerY + 6, 150, view.page + 1 < view.pages);
      ui.text(
        canvas,
        `Page ${String(view.page + 1)} / ${String(Math.max(1, view.pages))}`,
        layout.right,
        footer.footerY + 30,
        ui.t.type.caption,
        "right",
        ui.t.alpha.muted,
      );
      if (view.message) line(view.message, layout.bodyBottom - 4, { muted: true });
      return;
    }
    const { entry: e, notes, detail } = view.selected;
    const raceEligible = e.seedRaceRole === "reference" && e.verified === "receipts" && e.result !== null;
    const chaseEligible =
      !e.beatAttempt &&
      !e.assisted &&
      e.verified === "receipts" &&
      detail?.startsWith("Recorded category best") === true;
    button("BACK TO RESULTS", "back", left, toolbarY, 230);
    button(
      e.beatAttempt ? "BEAT RESULT" : "BEAT THIS RUN",
      e.beatAttempt ? "beat-review" : "beat",
      left + 242,
      toolbarY,
      190,
      e.present && e.kind === "capsule",
    );
    if (e.beatAttempt) {
      button("SAVE RESULT", "beat-save", left + 444, toolbarY, 170);
      button("RETRY BEAT", "beat-retry", left + 626, toolbarY, 170);
    }
    const actionsY = layout.bodyBottom - 82;
    let y = toolbarY + 74;
    for (const [index, fact] of runFacts(e, detail, notes, chaseEligible).entries()) {
      if (y > actionsY - 56) break;
      y += line(fact, y, { size: index === 0 ? ui.t.type.lead : ui.t.type.body, maxLines: 2 }) + 6;
    }
    if (e.unavailable.length > 0 && y <= actionsY - 56)
      line(`Not recorded for this run: ${e.unavailable.join(", ")}`, y, { muted: true, maxLines: 2 });
    if (view.confirming) {
      line("Delete this run from this device? Its tags go too. Copies you shared elsewhere stay.", actionsY - 18);
      button("DELETE LOCAL", "confirm-delete", left, actionsY, 240);
      button("KEEP", "cancel-delete", left + 252, actionsY, 150);
    } else {
      sourceActions(
        e,
        actionsY,
        (command) => (command !== "chase" || chaseEligible) && (command !== "race" || raceEligible),
      );
      keepActions(e, notes.retention, actionsY + 44);
    }
    if (view.message && !view.confirming) line(view.message, actionsY - 18, { muted: true });
    pageFooter(context, { back });
  };
}
