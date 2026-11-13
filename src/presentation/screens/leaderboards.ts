import type { LeaderboardsScreenView, ScreenRenderContext } from "./contracts";
import { chips, clipBody, page, pageFooter, replayRow, tabs } from "./screen-primitives";
import { createCompactLeaderboards } from "./compact-leaderboards";

export const LEADERBOARD_HUE = "#e0a326";

type PodiumEntry = NonNullable<LeaderboardsScreenView["podium"]>[number];
type RankRow = LeaderboardsScreenView["rows"][number];
type PodiumBox = Readonly<{ x: number; y: number; w: number; h: number; numberSize: number }>;
/** The ranked list's columns: left edge and width of the table. */
type RankColumns = Readonly<{ listX: number; listWidth: number }>;

/** LEADERBOARDS: the ranked board (podium + table) and the published replay feed. */
export function createLeaderboardRenderers(context: ScreenRenderContext) {
  const { ui, width } = context;
  // Phone landscape (compact density) composes the boards as a compact page.
  const compact = createCompactLeaderboards(context);

  function leaderboards(view: LeaderboardsScreenView): void {
    if (ui.density.compact) {
      compact(view);
      return;
    }
    const { canvas } = context;
    const layout = page(context, { title: "LEADERBOARDS", hue: LEADERBOARD_HUE });
    tabs(context, view.tabs, (id) => ({ type: "leaderboards.selectTab", id }), 124);
    if (view.modes) {
      ui.text(canvas, view.signInRequired ? "compete globally with an account" : "the world's finest runs",
        width / 2, 184, ui.t.type.caption, "center", ui.t.alpha.muted);
      chips(context, view.modes, (id) => ({ type: "leaderboards.selectBoard", id: `mode:${id}` }), 198, 190, 34);
      if (view.difficulties) {
        chips(context, view.difficulties, (id) => ({ type: "leaderboards.selectBoard", id: `difficulty:${id}` }), 240, 150, 32);
      }
      rankedBoard(view, layout.bodyBottom);
    } else {
      replayFeed(view, layout.bodyBottom);
    }
    pageFooter(context, { canScrollUp: view.canScrollUp, canScrollDown: view.canScrollDown });
  }

  /** The designed non-ready states, shared by the ranked board and the feed. */
  function boardState(view: LeaderboardsScreenView, centreY: number, feed: boolean): boolean {
    const status = view.status ?? (view.signInRequired ? "signin" : "ready");
    if (status === "ready") return false;
    const { canvas } = context;
    const copy = {
      signin: [
        "☰",
        feed ? "Sign in to see the replay feed" : "Sign in to compete",
        view.message ?? "Global boards need an account — your runs are waiting to count.",
      ],
      loading: ["◌", feed ? "Loading the feed…" : "Loading the ranks…", ""],
      offline: [
        "⚠",
        feed ? "Can't reach the replay feed" : "Can't reach the leaderboards",
        "Check your connection and open this tab again. Your local bests stay in PROFILE ▸ BESTS.",
      ],
      empty: [
        feed ? "▶" : "★",
        feed ? "Nothing published yet" : "No runs on this board yet",
        feed ? "Share a run from PROFILE ▸ REPLAYS and it appears here." : "Finish a run in this mode and difficulty to set the first record.",
      ],
    } as const;
    const [glyph, line, detail] = copy[status];
    const ctaY = ui.emptyState(canvas, glyph, line, width / 2, centreY, detail || undefined, 720);
    if (status === "signin") {
      context.enqueue({
        x: width / 2 - 160, y: ctaY, w: 320, h: 46, label: "SIGN IN VIA PROFILE",
        action: { type: "navigate", to: "profile", tab: "bests" },
      });
    }
    return true;
  }

  /** One podium card: rank numeral, name, run detail and an optional watch button. */
  function podiumCard(entry: PodiumEntry, box: PodiumBox): void {
    const { canvas } = context;
    ui.card(canvas, box.x, box.y, box.w, box.h, false, { edge: entry.color });
    canvas.save();
    canvas.globalAlpha = 0.08;
    canvas.fillStyle = entry.color;
    canvas.fillRect(box.x, box.y, box.w, box.h);
    canvas.globalAlpha = 1;
    canvas.textAlign = "left";
    canvas.textBaseline = "alphabetic";
    canvas.fillStyle = ui.readable(entry.color, 3);
    canvas.font = ui.font(box.numberSize, true);
    canvas.fillText(String(entry.rank), box.x + 18, box.y + box.h / 2 + box.numberSize * 0.36);
    const textX = box.x + 24 + canvas.measureText(String(entry.rank)).width + 14, textWidth = box.x + box.w - 64 - textX;
    const name = ui.fitText(canvas, entry.name + (entry.mine ? " (you)" : ""), textWidth, { size: ui.t.type.body, floor: ui.t.type.micro, bold: true });
    canvas.fillStyle = entry.mine ? ui.readable(ui.t.color.accent) : ui.ink;
    canvas.font = ui.font(name.size, true);
    canvas.fillText(name.lines[0] ?? entry.name, textX, box.y + box.h / 2 - 8);
    canvas.restore();
    ui.textBox(canvas, entry.detail, textX, box.y + box.h / 2 + 14, textWidth + 50, { size: ui.t.type.micro, alpha: ui.t.alpha.muted, maxLines: 1 });
    if (entry.replayId) {
      context.enqueue({
        x: box.x + box.w - 58, y: box.y + box.h - 40, w: 48, h: 30,
        label: "▶", size: ui.t.type.caption, action: { type: "leaderboards.watchReplay", id: entry.replayId },
      });
    }
  }

  /** Column headings over the ranked table. */
  function rankHeader({ listX, listWidth }: RankColumns, headerY: number): void {
    const { canvas } = context;
    canvas.save();
    canvas.textAlign = "left";
    canvas.fillStyle = ui.ink;
    canvas.font = ui.font(ui.t.type.micro, true);
    canvas.globalAlpha = ui.t.alpha.muted;
    canvas.fillText("#", listX + 14, headerY);
    canvas.fillText("PLAYER", listX + 70, headerY);
    canvas.textAlign = "right";
    canvas.fillText("WAVE", listX + listWidth - 320, headerY);
    canvas.fillText("TIME", listX + listWidth - 180, headerY);
    canvas.fillText("SCORE", listX + listWidth - 20, headerY);
    canvas.restore();
    ui.divider(canvas, listX, headerY + 8, listWidth, 0.16);
  }

  /** One ranked table row; the watch button is only offered while the row is fully inside the list. */
  function rankRow(row: RankRow, index: number, y: number, { listX, listWidth }: RankColumns, bodyTop: number, listBottom: number): void {
    const { canvas } = context;
    if (row.mine) {
      canvas.save();
      canvas.globalAlpha = 0.1;
      canvas.fillStyle = ui.t.color.accent;
      canvas.fillRect(listX, y - 20, listWidth, 30);
      canvas.restore();
    }
    canvas.textAlign = "left";
    canvas.fillStyle = ui.ink;
    canvas.font = ui.font(ui.t.type.label, true);
    canvas.fillText(String(row.rank ?? index + 4), listX + 14, y);
    canvas.fillStyle = row.mine ? ui.readable(ui.t.color.accent) : ui.ink;
    canvas.font = ui.font(ui.t.type.label, row.mine === true);
    canvas.fillText(row.title, listX + 70, y);
    if (row.available && y - 18 >= bodyTop - 22 && y + 8 <= listBottom) {
      context.enqueue({
        x: listX + listWidth - 470, y: y - 18, w: 54, h: 26, label: "▶", size: ui.t.type.micro,
        action: { type: "leaderboards.watchReplay", id: row.id },
      });
    }
    canvas.textAlign = "right";
    canvas.fillStyle = ui.ink;
    canvas.font = ui.font(ui.t.type.label, false);
    canvas.fillText(row.wave ?? "0", listX + listWidth - 320, y);
    canvas.fillText(row.time ?? "0:00", listX + listWidth - 180, y);
    canvas.font = ui.font(ui.t.type.label, true);
    canvas.fillText(row.score ?? "0", listX + listWidth - 20, y);
    ui.divider(canvas, listX, y + 8, listWidth, 0.08);
  }

  function rankedBoard(view: LeaderboardsScreenView, bodyBottom: number): void {
    const { canvas } = context;
    const top = 300, columns: RankColumns = { listX: width / 2 - 460, listWidth: 920 };
    if (boardState(view, top + 110, false)) return;
    if (!view.podium || view.podium.length === 0) return;

    const positions: readonly PodiumBox[] = [
      { x: width / 2 - 130, y: top, w: 260, h: 132, numberSize: 52 },
      { x: width / 2 - 420, y: top + 18, w: 260, h: 114, numberSize: 40 },
      { x: width / 2 + 160, y: top + 28, w: 260, h: 104, numberSize: 40 },
    ];
    view.podium.slice(0, 3).forEach((entry, index) => {
      const box = positions[index];
      if (box) podiumCard(entry, box);
    });

    if (view.legacyGhostId) {
      context.enqueue({
        x: width / 2 - 140, y: top + 140, w: 280, h: 30,
        label: view.message?.length ? view.message : "▶  WATCH THE #1 RUN", size: ui.t.type.micro,
        action: { type: "leaderboards.watchReplay", id: view.legacyGhostId },
      });
    } else if (view.message) ui.text(canvas, view.message, width / 2, top + 158, ui.t.type.micro, "center", ui.t.alpha.muted);

    const headerY = top + 194;
    rankHeader(columns, headerY);
    const bodyTop = headerY + 34, listBottom = bodyBottom - (view.ownRank ? 24 : 0);
    clipBody(context, bodyTop - 22, listBottom, () => {
      view.rows.forEach((row, index) => {
        const y = bodyTop + index * 34 - context.scroll;
        if (y < bodyTop - 28 || y > listBottom + 12) return;
        rankRow(row, index, y, columns, bodyTop, listBottom);
      });
    });
    canvas.textAlign = "left";
    if (view.ownRank) ui.text(canvas, view.ownRank, width / 2, bodyBottom - 4, ui.t.type.micro, "center", ui.t.alpha.muted);
  }

  function replayFeed(view: LeaderboardsScreenView, bodyBottom: number): void {
    const { canvas } = context;
    ui.text(canvas, "published runs from every blade — share yours from PROFILE ▸ REPLAYS",
      width / 2, 184, ui.t.type.caption, "center", ui.t.alpha.muted);
    const listX = width / 2 - 560, listWidth = 1120, top = 210, rowHeight = 96;
    if (boardState(view, top + 170, true)) return;
    clipBody(context, top - 8, bodyBottom, () => {
      view.rows.forEach((row, index) => {
        const y = top + index * rowHeight - context.scroll;
        if (y + rowHeight < top - 8 || y > bodyBottom + 8) return;
        replayRow(context, row, listX, y, listWidth, row.badge ? LEADERBOARD_HUE : ui.t.color.accent, 170);
        if (y + 20 >= top - 8 && y + 60 <= bodyBottom) {
          context.enqueue({
            x: listX + listWidth - 140, y: y + 20, w: 120, h: 40, label: "▶  WATCH",
            enabled: row.available, action: { type: "leaderboards.watchReplay", id: row.id },
          });
        }
      });
    });
  }

  return { leaderboards };
}
