import type { LeaderboardsScreenView, ScreenControl, ScreenRenderContext } from "./contracts";
import { createPageFrame, type PageFrame, type ScrollBlock, type ScrollView } from "./page-frame";

export const LEADERBOARD_HUE = "#e0a326";

/** The ranked table's headings when a view names none (the score boards). */
const DEFAULT_HEADINGS = Object.freeze({ count: "WAVE", time: "TIME", score: "SCORE" });

type PodiumEntry = NonNullable<LeaderboardsScreenView["podium"]>[number];
type RankRow = LeaderboardsScreenView["rows"][number];
type Tokens = ScreenRenderContext["ui"]["t"];
type Place = Omit<ScreenControl, "label" | "action">;

/** Where one podium card sits and how its parts are placed inside it. */
interface PodiumBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly numeralSize: number;
  readonly numeralX: number;
  readonly numeralBaseline: number;
  /** Space between the numeral and the name. */
  readonly textGap: number;
  /** Right edge of the name and detail (short of the watch control, when there is one). */
  readonly textRight: number;
  readonly nameBaseline: number;
  readonly detailBaseline: number;
  /** Extra width the detail line may run past the name's width. */
  readonly detailOverhang: number;
  readonly detailLines: number;
  readonly detailLineHeight: number | undefined;
  readonly watch: Place;
}

/** The ranked table's columns: x of each cell (WAVE, TIME and SCORE are right edges). */
interface RankColumns {
  readonly left: number;
  readonly width: number;
  readonly rankX: number;
  readonly playerX: number;
  readonly waveX: number;
  readonly timeX: number;
  readonly scoreX: number;
  readonly watchX: number;
}

interface RowMetrics {
  readonly height: number;
  /** Text baseline, from the row's top. */
  readonly baseline: number;
  /** The player's own row tint, from the row's top. */
  readonly highlight: Readonly<{ top: number; height: number }>;
  /** The hairline under the row, from the row's top. */
  readonly rule: number;
  /** The player name is fitted to its column and drawn bold on every row (not only the player's own). */
  readonly fitPlayer: boolean;
  readonly timeAlpha: number | undefined;
  readonly watch: Readonly<{ top: number; w: number; h: number; size: number }>;
}

/** What both densities draw with different numbers (desktop-only placements are in `DESKTOP`). */
interface LeaderboardMetrics {
  /** Space between body blocks. */
  readonly gap: number;
  readonly podiumHeight: number;
  readonly podium: (frame: PageFrame, y: number, index: number, watch: boolean) => PodiumBox | null;
  /** The watch-the-#1 line (or the board message) under the podium; a reserved line keeps its height when empty. */
  readonly line: Readonly<{ reserve: boolean; height: number; size: number; baseline: number }>;
  readonly columns: (frame: PageFrame, watch: boolean) => RankColumns;
  /** Column headings: block height, baseline from the top, ink, and the rule below the baseline. */
  readonly header: Readonly<{ height: number; baseline: number; muted: "alpha" | "colour"; rule: number }>;
  readonly row: (watch: boolean) => RowMetrics;
  readonly ownRank: Readonly<{ size: number; maxLines: number; height: number; baseline: number }>;
}

const lineHeight = (size: number): number => Math.round(size * 1.25);

/** The desktop design's placements, which the phone page does not use (it flows and measures instead). */
const DESKTOP = {
  tabsY: 124,
  captionY: 184,
  modePicker: { y: 198, width: 190, height: 34 },
  difficultyPicker: { y: 240, width: 150, height: 32 },
  /** Where each tab's body starts, where its state centres, and which list rows are drawn. */
  ranked: { top: 300, stateCentre: 110, cull: { above: 28, below: 10 } },
  feed: { top: 202, stateCentre: 178, cull: { above: 104, below: 0 } },
  state: { wrap: 720, ctaWidth: 320, ctaHeight: 46 },
  replay: { width: 1120, pitch: 96, inset: 8, textReserve: 170 },
} as const;

/** Desktop: the design's numbers. Phone: the live (compact) tokens. */
const METRICS: Readonly<Record<"desktop" | "phone", (t: Tokens) => LeaderboardMetrics>> = {
  desktop: (t) => ({
    gap: 0,
    podiumHeight: 140,
    podium: (frame, y, index) => {
      const slot = [
        { dx: -130, dy: 0, h: 132, numeral: 52 },
        { dx: -420, dy: 18, h: 114, numeral: 40 },
        { dx: 160, dy: 28, h: 104, numeral: 40 },
      ][index];
      if (!slot) return null;
      const x = frame.centerX + slot.dx,
        top = y + slot.dy,
        w = 260;
      return {
        x,
        y: top,
        w,
        h: slot.h,
        numeralSize: slot.numeral,
        numeralX: x + 18,
        numeralBaseline: top + slot.h / 2 + slot.numeral * 0.36,
        textGap: 20,
        textRight: x + w - 64,
        nameBaseline: top + slot.h / 2 - 8,
        detailBaseline: top + slot.h / 2 + 14,
        detailOverhang: 50,
        detailLines: 1,
        detailLineHeight: undefined,
        watch: { x: x + w - 58, y: top + slot.h - 40, w: 48, h: 30, size: t.type.caption },
      };
    },
    line: { reserve: true, height: 40, size: t.type.micro, baseline: 18 },
    columns: (frame) => {
      const left = frame.centerX - 460,
        width = 920;
      return {
        left,
        width,
        rankX: left + 14,
        playerX: left + 70,
        waveX: left + width - 320,
        timeX: left + width - 180,
        scoreX: left + width - 20,
        watchX: left + width - 470,
      };
    },
    header: { height: 26, baseline: 14, muted: "alpha", rule: 8 },
    row: () => ({
      height: 34,
      baseline: 22,
      highlight: { top: 2, height: 30 },
      rule: 30,
      fitPlayer: false,
      timeAlpha: undefined,
      watch: { top: 4, w: 54, h: 26, size: t.type.micro },
    }),
    ownRank: { size: t.type.micro, maxLines: 1, height: 24, baseline: 20 },
  }),
  phone: (t) => {
    const pad = t.space.md,
      target = t.metric.minTarget,
      cardHeight = Math.max(target + pad * 2, pad * 2 + t.type.body + t.space.sm + lineHeight(t.type.micro) * 2);
    return {
      gap: pad,
      podiumHeight: cardHeight,
      podium: (frame, y, index, watch) => {
        const w = (frame.width - pad * 2) / 3,
          x = frame.left + index * (w + pad),
          nameBaseline = y + pad + t.type.body;
        return {
          x,
          y,
          w,
          h: cardHeight,
          numeralSize: t.type.display,
          numeralX: x + pad,
          numeralBaseline: y + cardHeight / 2 + Math.round(t.type.display * 0.35),
          textGap: pad,
          textRight: x + w - pad - (watch ? target + pad : 0),
          nameBaseline,
          detailBaseline: nameBaseline + t.space.sm + t.type.micro,
          detailOverhang: 0,
          detailLines: 2,
          detailLineHeight: lineHeight(t.type.micro),
          watch: {
            x: x + w - pad - target,
            y: y + (cardHeight - target) / 2,
            w: target,
            h: target,
            size: t.type.label,
          },
        };
      },
      line: { reserve: false, height: 0, size: t.type.caption, baseline: 0 },
      columns: (frame, watch) => {
        const score = frame.right - (watch ? target + t.space.md : 0);
        return {
          left: frame.left,
          width: frame.width,
          rankX: frame.left + t.space.sm,
          playerX: frame.left + 90,
          waveX: score - 460,
          timeX: score - 230,
          scoreX: score,
          watchX: frame.right - target,
        };
      },
      header: { height: t.type.micro + t.space.sm, baseline: t.type.micro, muted: "colour", rule: t.space.xs },
      row: (watch) => {
        const height = watch ? target + t.space.xs : lineHeight(t.type.label) + t.space.md;
        return {
          height,
          baseline: height / 2 + Math.round(t.type.label * 0.35),
          highlight: { top: 0, height: height - t.space.xs },
          rule: height - t.space.xs,
          fitPlayer: true,
          timeAlpha: t.alpha.soft,
          watch: { top: 0, w: target, h: target, size: t.type.label },
        };
      },
      ownRank: { size: t.type.micro, maxLines: 2, height: 0, baseline: 0 },
    };
  },
};

/** Copy for the designed non-ready states, shared by the ranked board and the feed. */
function stateCopy(view: LeaderboardsScreenView, feed: boolean) {
  const status = view.status ?? (view.signInRequired ? "signin" : "ready");
  if (status === "ready") return undefined;
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
      feed
        ? "Share a run from PROFILE ▸ REPLAYS and it appears here."
        : "Finish a run in this mode and difficulty to set the first record.",
    ],
  } as const;
  const [glyph, line, detail] = copy[status];
  return { status, glyph, line, detail: detail || undefined };
}

/**
 * LEADERBOARDS: the ranked board (podium, table, the player's own rank) and the published replay
 * feed. One composition and one set of drawers at both densities: the page frame places the chrome
 * and the body, and the metrics table holds what differs between the desktop design and the phone.
 */
export function createLeaderboardRenderers(context: ScreenRenderContext) {
  const { ui } = context,
    frames = createPageFrame(context);

  function leaderboards(view: LeaderboardsScreenView): void {
    const m = METRICS[ui.density.compact ? "phone" : "desktop"](ui.t);
    const feed = !view.boards;
    const frame = frames.open({
      title: "LEADERBOARDS",
      hue: LEADERBOARD_HUE,
      tabs: view.tabs,
      tabAction: (id) => ({ type: "leaderboards.selectTab", id }),
      caption: feed
        ? "published runs from every blade — share yours from PROFILE ▸ REPLAYS"
        : view.signInRequired
          ? "compete globally with an account"
          : "the world's finest runs",
      pickers: view.boards && [
        {
          items: view.boards,
          action: (id) => ({ type: "leaderboards.selectBoard", id: `board:${id}` }),
          desktop: DESKTOP.modePicker,
        },
        {
          items: view.difficulties ?? [],
          action: (id) => ({ type: "leaderboards.selectBoard", id: `difficulty:${id}` }),
          desktop: DESKTOP.difficultyPicker,
        },
      ],
      desktop: { tabsY: DESKTOP.tabsY, captionY: DESKTOP.captionY },
    });
    const place = feed ? DESKTOP.feed : DESKTOP.ranked;
    const state = stateCopy(view, feed);
    let parts: Readonly<{
      head?: readonly ScrollBlock[];
      list?: readonly ScrollBlock[];
      tail?: readonly ScrollBlock[];
    }>;
    if (state) {
      const cta =
        state.status === "signin"
          ? { label: "SIGN IN VIA PROFILE", action: { type: "navigate", to: "profile", tab: "bests" } as const }
          : undefined;
      parts = { head: [frames.emptyState(frame, state, cta, { centre: place.stateCentre, ...DESKTOP.state })] };
    } else if (feed) parts = { list: view.rows.map((row) => feedRow(frame, row)) };
    else parts = rankedBoard(frame, m, view);
    const desktop = {
      top: place.top,
      cull: place.cull,
      canScrollUp: view.canScrollUp,
      canScrollDown: view.canScrollDown,
    };
    frames.close(frame, frames.body(frame, { ...parts, gap: m.gap, desktop }));
  }

  function feedRow(frame: PageFrame, row: RankRow): ScrollBlock {
    return frames.replay(
      frame,
      row,
      { label: "▶  WATCH", enabled: row.available, action: { type: "leaderboards.watchReplay", id: row.id } },
      row.badge ? LEADERBOARD_HUE : ui.t.color.accent,
      { x: frame.centerX - DESKTOP.replay.width / 2, ...DESKTOP.replay },
    );
  }

  /** The podium, the watch-the-#1 line, the column headings, the table rows and the player's own rank. */
  function rankedBoard(frame: PageFrame, m: LeaderboardMetrics, view: LeaderboardsScreenView) {
    const podium = (view.podium ?? []).slice(0, 3);
    if (podium.length === 0) return {};
    const head: ScrollBlock[] = [
      {
        height: m.podiumHeight,
        draw: (y, scrollView) => {
          podium.forEach((entry, index) => {
            const box = m.podium(frame, y, index, entry.replayId !== undefined);
            if (box) podiumCard(entry, box, scrollView);
          });
        },
      },
    ];
    if (view.message) {
      head.push(
        frames.prose(frame, view.message, {
          size: m.line.size,
          maxLines: 2,
          align: "center",
          baseline: m.line.baseline,
          height: m.line.height,
        }),
      );
    } else if (m.line.reserve) head.push({ height: m.line.height, draw: () => undefined });
    const watch = view.rows.some((row) => row.available === true);
    const columns = m.columns(frame, watch),
      row = m.row(watch);
    head.push({
      height: m.header.height,
      draw: (y) => {
        rankHeader(columns, y + m.header.baseline, m.header, view.headings ?? DEFAULT_HEADINGS);
      },
    });
    const list = view.rows.map((entry, index): ScrollBlock => ({
      height: row.height,
      draw: (y, scrollView) => {
        rankRow(entry, index, y, columns, row, scrollView);
      },
    }));
    const tail = view.ownRank ? [frames.prose(frame, view.ownRank, { ...m.ownRank, align: "center" })] : [];
    return { head, list, tail };
  }

  /** Text at one size, weight, colour and alpha: the one text call of every drawer here. */
  function ink(
    text: string,
    x: number,
    y: number,
    style: Readonly<{
      size: number;
      bold?: boolean;
      color?: string;
      align?: CanvasTextAlign;
      alpha?: number | undefined;
    }>,
  ): void {
    const { canvas } = context;
    canvas.fillStyle = style.color ?? ui.ink;
    canvas.font = ui.font(style.size, style.bold === true);
    canvas.textAlign = style.align ?? "left";
    canvas.textBaseline = "alphabetic";
    if (style.alpha !== undefined) canvas.globalAlpha = style.alpha;
    canvas.fillText(text, x, y);
    if (style.alpha !== undefined) canvas.globalAlpha = 1;
  }

  /** One podium card: rank numeral, name, run detail and an optional watch control. */
  function podiumCard(entry: PodiumEntry, box: PodiumBox, view: ScrollView): void {
    const { canvas } = context;
    ui.card(canvas, box.x, box.y, box.w, box.h, false, { edge: entry.color });
    canvas.save();
    canvas.globalAlpha = 0.08;
    canvas.fillStyle = entry.color;
    canvas.fillRect(box.x, box.y, box.w, box.h);
    canvas.restore();
    const numeral = String(entry.rank);
    ink(numeral, box.numeralX, box.numeralBaseline, {
      size: box.numeralSize,
      bold: true,
      color: ui.readable(entry.color, 3),
    });
    const textX = box.numeralX + frames.textWidth(numeral, box.numeralSize, true) + box.textGap,
      textWidth = box.textRight - textX;
    const name = ui.fitText(canvas, entry.name + (entry.mine ? " (you)" : ""), textWidth, {
      size: ui.t.type.body,
      floor: ui.t.type.micro,
      bold: true,
    });
    ink(name.lines[0] ?? entry.name, textX, box.nameBaseline, {
      size: name.size,
      bold: true,
      color: entry.mine ? ui.readable(ui.t.color.accent) : ui.ink,
    });
    ui.textBox(canvas, entry.detail, textX, box.detailBaseline, textWidth + box.detailOverhang, {
      size: ui.t.type.micro,
      maxLines: box.detailLines,
      ...(box.detailLineHeight === undefined ? {} : { lineHeight: box.detailLineHeight }),
      alpha: ui.t.alpha.muted,
    });
    if (entry.replayId)
      view.enqueue({ ...box.watch, label: "▶", action: { type: "leaderboards.watchReplay", id: entry.replayId } });
  }

  /** Column headings over the ranked table, and the rule under them. */
  function rankHeader(
    columns: RankColumns,
    baseline: number,
    header: LeaderboardMetrics["header"],
    headings: NonNullable<LeaderboardsScreenView["headings"]>,
  ): void {
    const style = {
      size: ui.t.type.micro,
      bold: true,
      color: header.muted === "colour" ? ui.t.color.muted : ui.ink,
      alpha: header.muted === "alpha" ? ui.t.alpha.muted : undefined,
    };
    ink("#", columns.rankX, baseline, style);
    ink("PLAYER", columns.playerX, baseline, style);
    ink(headings.count, columns.waveX, baseline, { ...style, align: "right" });
    ink(headings.time, columns.timeX, baseline, { ...style, align: "right" });
    ink(headings.score, columns.scoreX, baseline, { ...style, align: "right" });
    ui.divider(context.canvas, columns.left, baseline + header.rule, columns.width, 0.16);
  }

  /** One ranked table row; a row with a recording carries its own watch control. */
  function rankRow(
    row: RankRow,
    index: number,
    top: number,
    columns: RankColumns,
    metrics: RowMetrics,
    view: ScrollView,
  ): void {
    const { canvas } = context,
      t = ui.t,
      baseline = top + metrics.baseline;
    if (row.mine) {
      canvas.save();
      canvas.globalAlpha = 0.1;
      canvas.fillStyle = t.color.accent;
      canvas.fillRect(columns.left, top + metrics.highlight.top, columns.width, metrics.highlight.height);
      canvas.restore();
    }
    ink(String(row.rank ?? index + 4), columns.rankX, baseline, { size: t.type.label, bold: true });
    const player = metrics.fitPlayer
      ? ui.fitText(
          canvas,
          row.title,
          columns.waveX - frames.textWidth("0000", t.type.label, false) - columns.playerX - t.space.lg,
          { size: t.type.label, floor: t.type.micro, bold: row.mine === true },
        )
      : { lines: [row.title], size: t.type.label };
    ink(player.lines[0] ?? row.title, columns.playerX, baseline, {
      size: player.size,
      bold: metrics.fitPlayer || row.mine === true,
      color: row.mine ? ui.readable(t.color.accent) : ui.ink,
    });
    if (row.available)
      view.enqueue({
        x: columns.watchX,
        y: top + metrics.watch.top,
        w: metrics.watch.w,
        h: metrics.watch.h,
        label: "▶",
        size: metrics.watch.size,
        action: { type: "leaderboards.watchReplay", id: row.id },
      });
    ink(row.wave ?? "0", columns.waveX, baseline, { size: t.type.label, align: "right" });
    ink(row.time ?? "0:00", columns.timeX, baseline, { size: t.type.label, align: "right", alpha: metrics.timeAlpha });
    ink(row.score ?? "0", columns.scoreX, baseline, { size: t.type.label, bold: true, align: "right" });
    ui.divider(canvas, columns.left, top + metrics.rule, columns.width, 0.08);
  }

  return { leaderboards };
}
