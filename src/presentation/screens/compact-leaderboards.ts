import type { LeaderboardsScreenView, ScreenRenderContext } from "./contracts";
import { createCompactPage, type CompactPage, type ScrollBlock, type ScrollView } from "./compact-page";

const LEADERBOARD_HUE = "#e0a326";
type PodiumEntry = NonNullable<LeaderboardsScreenView["podium"]>[number];
type RankRow = LeaderboardsScreenView["rows"][number];

/** Copy for the designed non-ready states, shared by the ranked board and the feed. */
function stateCopy(view: LeaderboardsScreenView, feed: boolean): readonly [string, string, string] | undefined {
  const status = view.status ?? (view.signInRequired ? "signin" : "ready");
  if (status === "ready") return undefined;
  if (status === "signin")
    return [
      "☰",
      feed ? "Sign in to see the replay feed" : "Sign in to compete",
      view.message ?? "Global boards need an account — your runs are waiting to count.",
    ];
  if (status === "loading") return ["◌", feed ? "Loading the feed…" : "Loading the ranks…", ""];
  if (status === "offline")
    return [
      "⚠",
      feed ? "Can't reach the replay feed" : "Can't reach the leaderboards",
      "Check your connection and open this tab again. Your local bests stay in PROFILE ▸ BESTS.",
    ];
  return [
    feed ? "▶" : "★",
    feed ? "Nothing published yet" : "No runs on this board yet",
    feed
      ? "Share a run from PROFILE ▸ REPLAYS and it appears here."
      : "Finish a run in this mode and difficulty to set the first record.",
  ];
}

/**
 * LEADERBOARDS on the compact page: the board pickers as a chip toolbar, then the
 * podium, the ranked table (a row with a recording carries its own watch control)
 * and the player's position; or the published replay feed as replay rows.
 */
export function createCompactLeaderboards(context: ScreenRenderContext) {
  const { ui } = context,
    kit = createCompactPage(context);

  function leaderboards(view: LeaderboardsScreenView): void {
    let page = kit.header({
      title: "LEADERBOARDS",
      hue: LEADERBOARD_HUE,
      tabs: view.tabs,
      tabAction: (id) => ({ type: "leaderboards.selectTab", id }),
    });
    const feed = !view.modes;
    if (view.modes) {
      page = kit.toolbar(page, [
        { items: view.modes, action: (id) => ({ type: "leaderboards.selectBoard", id: `mode:${id}` }) },
        {
          items: view.difficulties ?? [],
          action: (id) => ({ type: "leaderboards.selectBoard", id: `difficulty:${id}` }),
        },
      ]);
    }
    const blocks: ScrollBlock[] = [
      kit.prose(
        page,
        feed
          ? "published runs from every blade — share yours from PROFILE ▸ REPLAYS"
          : view.signInRequired
            ? "compete globally with an account"
            : "the world's finest runs",
        { maxLines: 2 },
      ),
    ];
    const state = stateCopy(view, feed);
    if (state) {
      blocks.push(
        kit.empty(
          page,
          state[0],
          state[1],
          state[2] || undefined,
          (view.status ?? (view.signInRequired ? "signin" : "ready")) === "signin"
            ? { label: "SIGN IN VIA PROFILE", action: { type: "navigate", to: "profile", tab: "bests" } }
            : undefined,
        ),
      );
    } else if (feed) {
      for (const row of view.rows) {
        blocks.push(
          kit.replayRow(
            page,
            row,
            [{ label: "▶  WATCH", enabled: row.available, action: { type: "leaderboards.watchReplay", id: row.id } }],
            row.badge ? LEADERBOARD_HUE : ui.t.color.accent,
          ),
        );
      }
    } else blocks.push(...rankedBoard(page, view));
    kit.footer(page, kit.scroll(page, blocks));
  }

  function rankedBoard(page: CompactPage, view: LeaderboardsScreenView): readonly ScrollBlock[] {
    const t = ui.t,
      blocks: ScrollBlock[] = [];
    const podium = (view.podium ?? []).slice(0, 3);
    if (podium.length === 0) return blocks;
    const pad = t.space.md,
      cardH = Math.max(
        t.metric.minTarget + pad * 2,
        pad * 2 + t.type.body + t.space.sm + kit.lineHeight(t.type.micro) * 2,
      );
    blocks.push(...kit.grid(page, podium, 3, () => cardH, podiumCard));
    if (view.legacyGhostId) {
      const id = view.legacyGhostId,
        label = view.message?.length ? view.message : "▶  WATCH THE #1 RUN";
      blocks.push({
        height: kit.actionsHeight([{ label, action: { type: "leaderboards.watchReplay", id } }], page.width),
        draw: (y, scrollView) =>
          kit.actions(
            [{ label, action: { type: "leaderboards.watchReplay", id } }],
            page.left,
            y,
            page.width,
            scrollView,
          ),
      });
    } else if (view.message) blocks.push(kit.prose(page, view.message, { maxLines: 2, align: "center" }));
    const watch = view.rows.some((row) => row.available === true);
    const columns = rankColumns(page, watch);
    const header = (y: number): void => {
      rankHeader(page, columns, y + t.type.micro);
    };
    blocks.push({ height: t.type.micro + t.space.sm, draw: header });
    const rowH = watch ? t.metric.minTarget + t.space.xs : kit.lineHeight(t.type.label) + t.space.md;
    view.rows.forEach((row, index) => {
      const draw = (y: number, scrollView: ScrollView): void => {
        rankRow(page, columns, row, index, y, rowH, scrollView);
      };
      blocks.push({ height: rowH, draw });
    });
    if (view.ownRank) blocks.push(kit.prose(page, view.ownRank, { size: t.type.micro, maxLines: 2, align: "center" }));
    return blocks;
  }

  /** Right edges of the WAVE, TIME and SCORE columns (and where the watch control sits). */
  function rankColumns(
    page: CompactPage,
    watch: boolean,
  ): Readonly<{ wave: number; time: number; score: number; watchX: number }> {
    const t = ui.t,
      watchW = watch ? t.metric.minTarget + t.space.md : 0,
      score = page.right - watchW;
    return { wave: score - 460, time: score - 230, score, watchX: page.right - t.metric.minTarget };
  }

  function rankHeader(page: CompactPage, columns: ReturnType<typeof rankColumns>, baseline: number): void {
    const t = ui.t,
      { canvas } = context;
    ui.tag(canvas, "#", page.left + t.space.sm, baseline, t.color.muted, "left", t.type.micro);
    ui.tag(canvas, "PLAYER", page.left + 90, baseline, t.color.muted, "left", t.type.micro);
    ui.tag(canvas, "WAVE", columns.wave, baseline, t.color.muted, "right", t.type.micro);
    ui.tag(canvas, "TIME", columns.time, baseline, t.color.muted, "right", t.type.micro);
    ui.tag(canvas, "SCORE", columns.score, baseline, t.color.muted, "right", t.type.micro);
    ui.divider(canvas, page.left, baseline + t.space.xs, page.width, 0.16);
  }

  function rankRow(
    page: CompactPage,
    columns: ReturnType<typeof rankColumns>,
    row: RankRow,
    index: number,
    y: number,
    h: number,
    view: ScrollView,
  ): void {
    const t = ui.t,
      { canvas } = context,
      baseline = y + h / 2 + Math.round(t.type.label * 0.35);
    if (row.mine) {
      canvas.save();
      canvas.globalAlpha = 0.1;
      canvas.fillStyle = t.color.accent;
      canvas.fillRect(page.left, y, page.width, h - t.space.xs);
      canvas.restore();
    }
    ui.tag(canvas, String(row.rank ?? index + 4), page.left + t.space.sm, baseline, ui.ink, "left", t.type.label);
    const player = ui.fitText(
      canvas,
      row.title,
      columns.wave - kit.textWidth("0000", t.type.label, false) - page.left - 90 - t.space.lg,
      { size: t.type.label, floor: t.type.micro, bold: row.mine === true },
    );
    ui.tag(
      canvas,
      player.lines[0] ?? row.title,
      page.left + 90,
      baseline,
      row.mine ? ui.readable(t.color.accent) : ui.ink,
      "left",
      player.size,
    );
    ui.text(canvas, row.wave ?? "0", columns.wave, baseline, t.type.label, "right");
    ui.text(canvas, row.time ?? "0:00", columns.time, baseline, t.type.label, "right", t.alpha.soft);
    ui.tag(canvas, row.score ?? "0", columns.score, baseline, ui.ink, "right", t.type.label);
    ui.divider(canvas, page.left, y + h - t.space.xs, page.width, 0.08);
    if (row.available)
      view.enqueue({
        x: columns.watchX,
        y,
        w: t.metric.minTarget,
        h: t.metric.minTarget,
        label: "▶",
        size: t.type.label,
        action: { type: "leaderboards.watchReplay", id: row.id },
      });
  }

  /** One podium card: rank numeral, name, run detail and an optional watch control. */
  function podiumCard(entry: PodiumEntry, x: number, y: number, w: number, h: number, view: ScrollView): void {
    const t = ui.t,
      { canvas } = context,
      pad = t.space.md,
      watch = entry.replayId ? t.metric.minTarget + pad : 0;
    ui.card(canvas, x, y, w, h, false, { edge: entry.color });
    canvas.save();
    canvas.globalAlpha = 0.08;
    canvas.fillStyle = entry.color;
    canvas.fillRect(x, y, w, h);
    canvas.restore();
    const numeral = String(entry.rank),
      numeralW = kit.textWidth(numeral, t.type.display, true);
    ui.tag(
      canvas,
      numeral,
      x + pad,
      y + h / 2 + Math.round(t.type.display * 0.35),
      ui.readable(entry.color, 3),
      "left",
      t.type.display,
    );
    const textX = x + pad * 2 + numeralW,
      textW = x + w - pad - watch - textX;
    const nameY = y + pad + t.type.body;
    const name = ui.fitText(canvas, entry.name + (entry.mine ? " (you)" : ""), textW, {
      size: t.type.body,
      floor: t.type.micro,
      bold: true,
    });
    ui.tag(
      canvas,
      name.lines[0] ?? entry.name,
      textX,
      nameY,
      entry.mine ? ui.readable(t.color.accent) : ui.ink,
      "left",
      name.size,
    );
    ui.textBox(canvas, entry.detail, textX, nameY + t.space.sm + t.type.micro, textW, {
      size: t.type.micro,
      maxLines: 2,
      lineHeight: kit.lineHeight(t.type.micro),
      alpha: t.alpha.muted,
    });
    if (entry.replayId)
      view.enqueue({
        x: x + w - pad - t.metric.minTarget,
        y: y + (h - t.metric.minTarget) / 2,
        w: t.metric.minTarget,
        h: t.metric.minTarget,
        label: "▶",
        size: t.type.label,
        action: { type: "leaderboards.watchReplay", id: entry.replayId },
      });
  }

  return leaderboards;
}
