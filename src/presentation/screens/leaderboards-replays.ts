import type { LeaderboardsScreenView, ReplayScreenView, ScreenRenderContext } from "./contracts";
import { backControl, ellipsize, chips, replayRow, scrollHint, tabs } from "./screen-primitives";
import { REPLAY_EDITOR_ACTIONS } from "../../replay/surface-route";

const LEADERBOARD_HUE = "#e0a326";
const REPLAY_CYAN = "#13c4d6";
const REPLAY_DARK = "#0e1017";
const REPLAY_PAPER = "#f1eff9";
const REPLAY_MUTED = "#c9ccd6";

export function createLeaderboardReplayRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function ledgerTitle(): void {
    const { canvas } = context;
    ui.title(canvas, "LEADERBOARDS", width / 2, 92, ui.t.type.h1);
    canvas.fillStyle = LEADERBOARD_HUE; canvas.globalAlpha = context.enterAmount;
    canvas.fillRect(width / 2 - 65 * context.enterAmount, 108, 130 * context.enterAmount, 3);
    canvas.globalAlpha = 1;
  }

  function leaderboards(view: LeaderboardsScreenView): void {
    const { canvas } = context;
    ledgerTitle();
    tabs(context, view.tabs, (id) => ({ type: "leaderboards.selectTab", id }), 124);
    if (view.modes) {
      ui.text(canvas, view.signInRequired ? "compete globally with an account" : "the world's finest runs",
        width / 2, 202, ui.t.type.caption, "center", ui.t.alpha.muted);
      chips(context, view.modes, (id) => ({ type: "leaderboards.selectBoard", id: `mode:${id}` }), 224, 190, 34);
      if (view.difficulties) chips(context, view.difficulties,
        (id) => ({ type: "leaderboards.selectBoard", id: `difficulty:${id}` }), 266, 132, 32, 8, 10);
      rankedBoard(view);
    } else {
      replayFeed(view);
    }
    backControl(context);
  }

  function rankedBoard(view: LeaderboardsScreenView): void {
    const { canvas } = context;
    const top = 316, listX = width / 2 - 460, listWidth = 920;
    if (view.signInRequired) {
      ui.text(canvas, view.message ?? "Global leaderboards need an account — your runs are waiting to count.",
        width / 2, top + 140, ui.t.type.body, "center", ui.t.alpha.muted);
      context.enqueue({ x: width / 2 - 160, y: 460, w: 320, h: 46, label: "SIGN IN VIA PROFILE",
        action: { type: "navigate", to: "profile", tab: "bests" } });
      return;
    }
    if (!view.podium || view.podium.length === 0) {
      ui.text(canvas, view.message ?? "No runs recorded on this board yet — set the first.",
        width / 2, top + 150, ui.t.type.body, "center", ui.t.alpha.soft);
      return;
    }

    const positions = [
      { x: width / 2 - 130, y: top, w: 260, h: 132, numberSize: 52 },
      { x: width / 2 - 420, y: top + 18, w: 260, h: 114, numberSize: 40 },
      { x: width / 2 + 160, y: top + 28, w: 260, h: 104, numberSize: 40 },
    ];
    view.podium.slice(0, 3).forEach((entry, index) => {
      const box = positions[index]; if (!box) return;
      ui.card(canvas, box.x, box.y, box.w, box.h, false, { edge: entry.color });
      canvas.save(); canvas.globalAlpha = 0.08; canvas.fillStyle = entry.color; canvas.fillRect(box.x, box.y, box.w, box.h);
      canvas.globalAlpha = 1; canvas.textAlign = "left"; canvas.textBaseline = "alphabetic";
      canvas.fillStyle = entry.color; canvas.font = ui.font(box.numberSize, true);
      canvas.fillText(String(entry.rank), box.x + 18, box.y + box.h / 2 + box.numberSize * 0.36);
      const textX = box.x + 24 + canvas.measureText(String(entry.rank)).width + 14;
      canvas.fillStyle = entry.mine ? ui.t.color.accent : ui.ink; canvas.font = ui.font(ui.t.type.body, true);
      canvas.fillText(entry.name + (entry.mine ? " (you)" : ""), textX, box.y + box.h / 2 - 8);
      canvas.fillStyle = ui.ink; canvas.globalAlpha = 0.65; canvas.font = ui.font(ui.t.type.micro, false);
      canvas.fillText(entry.detail, textX, box.y + box.h / 2 + 12); canvas.restore();
      if (entry.replayId) context.enqueue({ x: box.x + box.w - 58, y: box.y + box.h - 40, w: 48, h: 30,
        label: "▶", size: 11, action: { type: "leaderboards.watchReplay", id: entry.replayId } });
    });

    if (view.legacyGhostId) context.enqueue({ x: width / 2 - 130, y: top + 138, w: 260, h: 28,
      label: view.message?.length ? view.message : "▶  WATCH THE #1 RUN", size: 11,
      action: { type: "leaderboards.watchReplay", id: view.legacyGhostId } });
    else if (view.message) ui.text(canvas, view.message, width / 2, top + 152, ui.t.type.micro, "center", ui.t.alpha.muted);

    const headerY = top + 176;
    canvas.save(); canvas.textAlign = "left"; canvas.fillStyle = ui.ink; canvas.font = ui.font(ui.t.type.micro, true); canvas.globalAlpha = 0.6;
    canvas.fillText("#", listX + 14, headerY); canvas.fillText("PLAYER", listX + 70, headerY);
    canvas.textAlign = "right"; canvas.fillText("WAVE", listX + listWidth - 320, headerY);
    canvas.fillText("TIME", listX + listWidth - 180, headerY); canvas.fillText("SCORE", listX + listWidth - 20, headerY); canvas.restore();
    ui.divider(canvas, listX, headerY + 8, listWidth, 0.12);
    const bodyTop = headerY + 32, bodyBottom = height - 108;
    canvas.save(); canvas.beginPath(); canvas.rect(listX, bodyTop - 22, listWidth, Math.max(0, bodyBottom - bodyTop + 30)); canvas.clip();
    view.rows.forEach((row, index) => {
      const y = bodyTop + index * 34 - context.scroll;
      if (y < bodyTop - 28 || y > bodyBottom + 12) return;
      if (row.mine) { canvas.save(); canvas.globalAlpha = 0.1; canvas.fillStyle = ui.t.color.accent; canvas.fillRect(listX, y - 20, listWidth, 30); canvas.restore(); }
      canvas.textAlign = "left"; canvas.fillStyle = ui.ink; canvas.font = ui.font(ui.t.type.label, true); canvas.fillText(String(row.rank ?? index + 4), listX + 14, y);
      canvas.fillStyle = row.mine ? ui.t.color.accent : ui.ink; canvas.font = ui.font(ui.t.type.label, row.mine === true); canvas.fillText(row.title, listX + 70, y);
      if (row.available) context.enqueue({ x: listX + listWidth - 470, y: y - 18, w: 54, h: 26, label: "▶", size: 11,
        action: { type: "leaderboards.watchReplay", id: row.id } });
      canvas.textAlign = "right"; canvas.fillStyle = ui.ink; canvas.font = ui.font(ui.t.type.label, false);
      canvas.fillText(row.wave ?? "0", listX + listWidth - 320, y); canvas.fillText(row.time ?? "0:00", listX + listWidth - 180, y);
      canvas.font = ui.font(ui.t.type.label, true); canvas.fillText(row.score ?? "0", listX + listWidth - 20, y);
      ui.divider(canvas, listX, y + 8, listWidth, 0.06);
    });
    canvas.restore(); canvas.textAlign = "left";
    if (view.ownRank) ui.text(canvas, view.ownRank, width / 2, Math.min(height - 112,
      bodyTop + Math.min(8, view.rows.length) * 34 + 4), ui.t.type.micro, "center", ui.t.alpha.muted);
    scrollHint(context, view.canScrollUp, view.canScrollDown);
  }

  function replayFeed(view: LeaderboardsScreenView): void {
    const { canvas } = context;
    ui.text(canvas, "published runs from every blade — yours share from PROFILE ▸ REPLAYS",
      width / 2, 202, ui.t.type.caption, "center", ui.t.alpha.muted);
    if (view.message) ui.text(canvas, view.message, width / 2, 232, ui.t.type.caption, "center", ui.t.alpha.muted);
    const listX = width / 2 - 560, listWidth = 1120, top = 254, rowHeight = 96, bottom = height - 110;
    if (view.signInRequired) {
      context.enqueue({ x: width / 2 - 160, y: top + 170, w: 320, h: 46, label: "SIGN IN VIA PROFILE",
        action: { type: "navigate", to: "profile", tab: "bests" } });
      return;
    }
    canvas.save(); canvas.beginPath(); canvas.rect(0, top - 8, width, bottom - top + 16); canvas.clip();
    view.rows.forEach((row, index) => {
      const y = top + index * rowHeight - context.scroll;
      if (y + rowHeight < top - 8 || y > bottom + 8) return;
      replayRow(context, row, listX, y, listWidth, row.badge ? LEADERBOARD_HUE : ui.t.color.accent);
      context.enqueue({ x: listX + listWidth - 140, y: y + 20, w: 120, h: 40, label: "▶  WATCH",
        enabled: row.available, action: { type: "leaderboards.watchReplay", id: row.id } });
    });
    canvas.restore();
    scrollHint(context, view.canScrollUp, view.canScrollDown);
  }

  function replay(view: ReplayScreenView): void {
    const { canvas, safeInsets: safe, screenRectangle: screen } = context;
    canvas.save(); canvas.globalAlpha = 0.85; canvas.fillStyle = REPLAY_DARK;
    canvas.fillRect(screen.x, screen.y, screen.w, 54 + safe.t); canvas.globalAlpha = 1;
    canvas.fillStyle = REPLAY_CYAN; canvas.fillRect(screen.x, screen.y, screen.w, 3);
    canvas.textAlign = "left"; canvas.fillStyle = REPLAY_PAPER; canvas.font = ui.font(ui.t.type.lead, true);
    canvas.fillText(view.theater ? "◆ THEATER" : "▶ REPLAY", 40 + safe.l, 36 + safe.t);
    canvas.fillStyle = REPLAY_MUTED; canvas.font = ui.font(ui.t.type.body, false);
    if (view.comparison) {
      canvas.fillStyle = REPLAY_DARK; canvas.fillRect(36 + safe.l, 4 + safe.t, 150, 42);
      canvas.fillStyle = REPLAY_CYAN; canvas.font = ui.font(ui.t.type.lead, true); canvas.fillText("COMPARE", 40 + safe.l, 36 + safe.t);
      canvas.fillStyle = REPLAY_MUTED; canvas.font = ui.font(ui.t.type.body, false);
    }
    canvas.fillText(view.title + "   ·   " + view.detail, 200 + safe.l, 36 + safe.t);
    canvas.textAlign = "right"; canvas.fillStyle = REPLAY_CYAN; canvas.font = ui.font(ui.t.type.label, true);
    canvas.fillText(view.score ?? "", width - 36 - safe.r, 36 + safe.t); canvas.restore();

    if (view.comparison) comparisonState(view); else if (view.theater) theaterState(view);

    const barY = height - 96 - safe.b, barX = 220 + safe.l, barWidth = width - 440 - safe.l - safe.r;
    canvas.save(); canvas.globalAlpha = 0.85; canvas.fillStyle = REPLAY_DARK;
    canvas.fillRect(screen.x, barY - 18, screen.w, height - (barY - 18) + Math.max(0, -screen.y));
    canvas.globalAlpha = 0.25; canvas.fillStyle = REPLAY_PAPER; canvas.fillRect(barX, barY, barWidth, 5);
    canvas.globalAlpha = 1; canvas.fillStyle = REPLAY_CYAN; canvas.fillRect(barX, barY, barWidth * view.progress, 5);
    view.chapters?.forEach((chapter) => {
      canvas.fillStyle = chapter.boss ? ui.t.color.danger : REPLAY_PAPER; canvas.globalAlpha = chapter.boss ? 0.95 : 0.55;
      canvas.fillRect(barX + barWidth * chapter.fraction - 1, barY - 4, 2, 13);
    });
    canvas.globalAlpha = 1; canvas.fillStyle = REPLAY_PAPER; canvas.beginPath();
    canvas.arc(barX + barWidth * view.progress, barY + 2.5, 7, 0, Math.PI * 2); canvas.fill();
    canvas.textAlign = "right"; canvas.fillStyle = REPLAY_MUTED; canvas.font = ui.font(12, true);
    canvas.fillText(`${view.elapsed} / ${view.duration}`, barX + barWidth, barY - 10); canvas.restore();

    if (view.coach) { coachState(view); return; }
    const controlY = height - 66 - safe.b;
    context.enqueue({ x: 220 + safe.l, y: controlY, w: 64, h: 44, label: "|◀", action: { type: "replay.jumpChapter", direction: -1 } });
    context.enqueue({ x: 292 + safe.l, y: controlY, w: 96, h: 44, label: view.paused ? "▶" : "❚❚", action: { type: "replay.togglePause" } });
    context.enqueue({ x: 396 + safe.l, y: controlY, w: 64, h: 44, label: "▶|", action: { type: "replay.jumpChapter", direction: 1 } });
    context.enqueue({ x: 468 + safe.l, y: controlY, w: 76, h: 44, label: `${String(view.speed)}×`, action: { type: "replay.speed", value: view.speed >= 4 ? 0.25 : view.speed * 2 } });
    context.enqueue({ x: 552 + safe.l, y: controlY, w: 84, h: 44, label: "↺", action: { type: "replay.restart" } });
    if (view.theater) context.enqueue({ x: 644 + safe.l, y: controlY, w: 180, h: 44, label: "PRACTICE",
      enabled: view.practiceAvailable === true, action: { type: "replay.practice" } });
    if (view.theater) context.enqueue({ x: 832 + safe.l, y: controlY, w: 120, h: 44, label: "COACH",
      action: { type: "replay.coach.open" } });
    if (view.theater) context.enqueue({ x: 960 + safe.l, y: controlY, w: 120, h: 44, label: "RUN DNA",
      action: { type: "replay.runDna.toggle" } });
    context.enqueue({ x: width - 420 - safe.r, y: controlY, w: 90, h: 44, label: view.infoVisible ? "HIDE" : "INFO", action: { type: "replay.toggleInfo" } });
    context.enqueue({ x: width - 320 - safe.r, y: controlY, w: 200, h: 44, label: "‹  BACK", action: { type: "replay.exit" } });
    if (view.notice) ui.text(canvas, view.notice, width / 2, barY - 34, ui.t.type.caption, "center", ui.t.alpha.muted);
    if (view.infoVisible) replayInfo(view);
    if (view.runDna) runDnaState(view);
    if (view.studioCutList) studioCutListState(view);
  }

  function theaterState(view: ReplayScreenView): void {
    const { canvas, safeInsets: safe } = context;
    ui.text(canvas, "RECONSTRUCTED WORLD · PLAYER FOLLOW", 30 + safe.l, 78 + safe.t, ui.t.type.micro, "left", ui.t.alpha.soft);
    context.enqueue({ x: 30 + safe.l, y: 92 + safe.t, w: 190, h: 34, label: "REPLAY EDITOR",
      action: { type: REPLAY_EDITOR_ACTIONS.toggle } });
    if (view.coachReturnAvailable) context.enqueue({ x: 228 + safe.l, y: 92 + safe.t, w: 190, h: 34, label: "RETURN TO COACH",
      action: { type: "replay.coach.control", command: "scene", delta: 0 } });
  }

  function studioCutListState(view: ReplayScreenView): void {
    const cut = view.studioCutList, media = view.studioMedia;
    if (cut === undefined) return;
    const { canvas, safeInsets: safe } = context;
    const panelWidth = Math.min(920, width - 64 - safe.l - safe.r), panelHeight = 288;
    const x = width / 2 - panelWidth / 2, y = 148 + safe.t;
    ui.panel(canvas, x, y, panelWidth, panelHeight); ui.accentStrip(canvas, x, y, panelWidth, REPLAY_CYAN);
    ui.title(canvas, "REPLAY EDITOR · LOCAL WEBM", width / 2, y + 36, ui.t.type.lead);
    ui.text(canvas, "Reconstructed player-follow · simulation time · 30 fps · 640×360 · GIF unavailable", width / 2, y + 62, ui.t.type.micro, "center", ui.t.alpha.muted);
    ui.text(canvas, `IN ${media?.markIn === undefined ? "previous checkpoint" : String(media.markIn)} · OUT ${view.score ?? ""} · CLIPS ${String(cut.clipCount ?? 0)} · speed ${String(view.speed)}×`, x + 24, y + 91, ui.t.type.caption, "left", ui.t.alpha.soft);
    ui.text(canvas, `SOURCE ${cut.sourceGhostId ?? "current verified capsule"} · ${media?.status ?? "unavailable"}`, x + 24, y + 116, ui.t.type.micro, "left", ui.t.alpha.soft);
    ui.text(canvas, `EDL ${cut.edlHash ?? "mark IN, seek an OUT checkpoint, then append"}`, x + 24, y + 139, ui.t.type.micro, "left", ui.t.alpha.muted);
    const busy = media?.status === "rendering", gap = 8, w = (panelWidth - 64) / 3;
    context.enqueue({ x: x + 24, y: y + 160, w, h: 34, label: "MARK IN", enabled: view.practiceAvailable && !busy,
      action: { type: "replay.editor.media", command: "markIn" } });
    context.enqueue({ x: x + 24 + w + gap, y: y + 160, w, h: 34, label: "APPEND RANGE", enabled: view.practiceAvailable && !busy,
      action: { type: REPLAY_EDITOR_ACTIONS.createCutList } });
    context.enqueue({ x: x + 24 + (w + gap) * 2, y: y + 160, w, h: 34, label: "CLEAR CUTS", enabled: !busy,
      action: { type: "replay.editor.media", command: "clear" } });
    context.enqueue({ x: x + 24, y: y + 202, w, h: 34, label: busy ? "CANCEL ENCODING" : "ENCODE WEBM", enabled: busy || (media?.available === true && cut.edlHash !== undefined),
      action: { type: "replay.editor.media", command: busy ? "cancel" : "export" } });
    context.enqueue({ x: x + 24 + w + gap, y: y + 202, w, h: 34, label: "DOWNLOAD WEBM", enabled: media?.status === "ready" || media?.status === "download-requested",
      action: { type: "replay.editor.media", command: "download" } });
    context.enqueue({ x: x + 24 + (w + gap) * 2, y: y + 202, w, h: 34, label: "CLOSE EDITOR", action: { type: REPLAY_EDITOR_ACTIONS.toggle } });
    ui.text(canvas, media?.available ? "Up to 60s / 1800 frames / 64 MiB. Gameplay-only ranges; cinema/intro source-time unavailable." : "This browser has no supported local WebM encoder.", width / 2, y + 264, ui.t.type.micro, "center", ui.t.alpha.muted);
  }

  function comparisonState(view: ReplayScreenView): void {
    const comparison = view.comparison;
    if (comparison === undefined) return;
    const { canvas, safeInsets: safe } = context;
    const panelWidth = Math.min(760, width - 80 - safe.l - safe.r), panelHeight = 170 + comparison.runs.length * 30;
    const x = width / 2 - panelWidth / 2, y = height / 2 - panelHeight / 2 - 20;
    ui.panel(canvas, x, y, panelWidth, panelHeight);
    ui.accentStrip(canvas, x, y, panelWidth, REPLAY_CYAN);
    ui.title(canvas, "SEMANTIC COMPARISON", width / 2, y + 50, ui.t.type.h2);
    ui.tag(canvas, `EVENT ${comparison.eventType.toUpperCase()} - OCCURRENCE ${String(comparison.occurrence)}`,
      width / 2, y + 78, REPLAY_CYAN, "center", ui.t.type.label);
    comparison.runs.forEach((run, index) => {
      const rowY = y + 108 + index * 30;
      const source = run.sourceId.length > 28 ? `${run.sourceId.slice(0, 25)}...` : run.sourceId;
      ui.text(canvas, `RUN ${String(index + 1)}  ${source}`, x + 34, rowY, ui.t.type.caption, "left", ui.t.alpha.soft);
      ui.tag(canvas, run.tick === null ? "MISSING" : `TICK ${String(run.tick)}`, x + panelWidth - 34, rowY,
        run.tick === null ? ui.t.color.danger : REPLAY_CYAN, "right", ui.t.type.label);
    });
    ui.wrappedText(canvas, "Each row is reconstructed from its own verified source capsule. This compares semantic simulation state only; pixels, PCM, haptics, and device output are not compared here.",
      x + 34, y + panelHeight - 50, panelWidth - 68, 16, ui.t.type.micro, "left", ui.t.alpha.muted);
  }

  function coachState(view: ReplayScreenView): void {
    const coach = view.coach;
    if (coach === undefined) return;
    const { canvas, safeInsets: safe } = context;
    const panelWidth = Math.min(980, width - 48 - safe.l - safe.r);
    const x = width / 2 - panelWidth / 2, y = 50 + safe.t;
    const panelHeight = Math.min(650, height - y - 30 - safe.b), compact = panelHeight < 470;
    ui.panel(canvas, x, y, panelWidth, panelHeight); ui.accentStrip(canvas, x, y, panelWidth, REPLAY_CYAN);
    const text = (value: string, row: number, muted = false) => {
      canvas.font = ui.font(ui.t.type.micro);
      ui.text(canvas, ellipsize(canvas, value, panelWidth - 40), x + 20, y + row, ui.t.type.micro, "left", muted ? ui.t.alpha.muted : ui.t.alpha.soft);
    };
    const button = (label: string, column: number, row: number, command: "close" | "page" | "metric" | "moment" | "details" | "sources" | "rows" | "section", delta = 0, enabled = true) => {
      const w = (panelWidth - 52) / 4;
      context.enqueue({ x: x + 20 + column * (w + 4), y: y + row, w, h: 30, label, enabled,
        action: { type: "replay.coach.control", command, delta } });
    };
    text("COACH · YOUR SELECTED RUNS", 27);
    text(view.notice ?? coach.message, 49);
    button("RUNS", 0, 60, "sources"); button("DETAILS", 1, 60, "details", 0, coach.result !== undefined);
    button(coach.busy ? "CANCEL" : "CLOSE", 3, 60, "close");
    if (coach.selection || coach.result === undefined) {
      text(`Open run + ${String(coach.selected.length)} selected · up to 8 total`, 113);
      const start = coach.page;
      const visible = Math.max(1, Math.min(3, Math.floor((panelHeight - 164) / (compact ? 36 : 58))));
      coach.candidates.slice(start, start + visible).forEach((candidate, index) => {
        const rowY = y + 124 + index * (compact ? 36 : 58);
        if (rowY + 30 > y + panelHeight - 40) return;
        context.enqueue({ x: x + 20, y: rowY, w: panelWidth - 40, h: 30,
          label: `${coach.selected.includes(candidate.id) ? "✓ " : "+ "}${candidate.createdAt.slice(0, 19)} · ${candidate.id.slice(-20)}`, selected: coach.selected.includes(candidate.id),
          action: { type: "replay.coach.selectBaseline", id: candidate.id } });
        if (!compact) text(candidate.detail, 166 + index * 58, true);
      });
      if (coach.candidates.length === 0) text("No distinct compatible recordings available.", 151, true);
      button("PREVIOUS", 0, panelHeight - 34, "page", -1, coach.page > 0);
      button(`MORE ${String(coach.page + 1)}/${String(Math.max(1, coach.candidates.length))}`, 1, panelHeight - 34, "page", 1,
        coach.page + visible < coach.candidates.length);
      return;
    }
    const result = coach.result;
    if (coach.details) {
      const lines = [`${result.version} · evidence ${result.provenanceHash}`, `Shared window (${String(result.fromTick)}, ${String(result.toTick)}] · ${String(result.ticks)} recorded ticks · 120 Hz`,
        ...result.sources.map((source) => `${source.id} · ${source.detail} · root ${source.root}`), ...result.limitations, ...(coach.measurement?.history.map((row) => `${row.id}: first8 witness IDs ${row.eventIds.slice(0, 8).join(", ") || "none"}; unclassified ${row.unclassifiedEventIds.slice(0, 8).join(", ") || "none"}`) ?? [])];
      const perPage = Math.max(1, Math.min(10, Math.floor((panelHeight - 154) / 26))), offset = coach.rows;
      lines.slice(offset, offset + perPage).forEach((line, index) => { text(line, 115 + index * 26, true); });
      button("PREVIOUS", 0, panelHeight - 34, "rows", -1, coach.rows > 0);
      button("MORE", 1, panelHeight - 34, "rows", 1, offset + perPage < lines.length);
      return;
    }
    const metric = coach.measurement;
    if (metric === undefined) return;
    if (compact) {
      button("COUNTS", 0, 100, "section", 0); button("HISTORY", 1, 100, "section", 1); button("MOMENTS", 2, 100, "section", 2);
    }
    if (!compact || coach.section === 0) {
    const countsY = compact ? 151 : 113;
    text(`${metric.label} · n=${String(metric.sampleCount)}/${String(result.sources.length)} usable recordings`, countsY);
    text(`Count distribution: min ${metric.minimum === null ? "unavailable" : String(metric.minimum)} · median ${metric.median === null ? "unavailable" : String(metric.median)} · max ${metric.maximum === null ? "unavailable" : String(metric.maximum)}`, countsY + 23);
    text(`Same window (${String(result.fromTick)}, ${String(result.toTick)}] · ${String(result.ticks)} recorded ticks. No skill rating.`, countsY + 45, true);
    button("‹ MEASURE", 0, countsY + 59, "metric", -1); button("MEASURE ›", 1, countsY + 59, "metric", 1);
    }
    if (!compact || coach.section === 1) {
      const historyY = compact ? 151 : 229;
      text("CHRONOLOGICAL HISTORY · count / per 1,000 recorded ticks", historyY);
      metric.history.slice(coach.rows, coach.rows + 3).forEach((row, index) => {
        text(`${new Date(row.createdAt).toISOString().slice(0, 19)}Z · ${row.count === null ? `unavailable (${String(row.knownCount)} known; ${String(row.unclassified)} unclassified)` : String(row.count)} / ${row.per1000Ticks?.toFixed(2) ?? "unavailable"} · ${row.id === result.targetId ? "OPEN RUN" : row.id.slice(-12)}`, historyY + 25 + index * 23);
      });
      button("‹ HISTORY", 0, historyY + 90, "rows", -1, coach.rows > 0);
      button("HISTORY ›", 1, historyY + 90, "rows", 1, coach.rows + 3 < metric.history.length);
    }
    if (compact && coach.section !== 2) return;
    const momentY = compact ? 151 : 382, cited = coach.cited;
    text(cited === undefined ? "No identified cited moment in the open run for this measure." : `OPEN RUN MOMENT ${String(coach.moment + 1)}/${String(coach.momentCount)} · TICK ${String(cited.tick)}`, momentY);
    if (cited !== undefined && momentY + 76 < panelHeight) {
      button("‹ MOMENT", 0, momentY + 10, "moment", -1, coach.moment > 0);
      button("MOMENT ›", 1, momentY + 10, "moment", 1, coach.moment + 1 < coach.momentCount);
      context.enqueue({ x: x + 20, y: y + momentY + 46, w: (panelWidth - 44) / 2, h: 30, label: "VIEW MOMENT",
        action: { type: "replay.coach.viewMoment", id: cited.id } });
      context.enqueue({ x: x + 24 + (panelWidth - 44) / 2, y: y + momentY + 46, w: (panelWidth - 44) / 2, h: 30,
        label: "PRACTICE BEFORE", enabled: cited.priorTick !== undefined, action: { type: "replay.coach.practice", findingId: cited.id } });
      if (!compact) text(cited.priorTick === undefined ? "No strictly preceding verified checkpoint." : `Practice begins at checkpoint ${String(cited.priorTick)} · unranked · no saved progression`, momentY + 100, true);
      if (!compact) text(`Current verified replay: ${view.elapsed}`, momentY + 124, true);
    }
  }

  function runDnaState(view: ReplayScreenView): void {
    const dna = view.runDna;
    if (dna === undefined) return;
    const { canvas, safeInsets: safe } = context;
    const panelWidth = Math.min(860, width - 80 - safe.l - safe.r), panelHeight = 330;
    const x = width / 2 - panelWidth / 2, y = 90 + safe.t;
    ui.panel(canvas, x, y, panelWidth, panelHeight); ui.accentStrip(canvas, x, y, panelWidth, REPLAY_CYAN);
    ui.title(canvas, "RUN DNA · VERIFIED METRICS", width / 2, y + 38, ui.t.type.lead);
    ui.text(canvas, `FORMULA ${dna.formulaVersion} · EVIDENCE ${dna.evidenceCustody}`, x + 24, y + 64, ui.t.type.micro, "left", ui.t.alpha.muted);
    Object.entries(dna.sourceMetrics).forEach(([name, value], index) => { ui.text(canvas,
      `${name.toUpperCase()} · ${value === undefined ? "UNAVAILABLE" : String(value)}`, x + 24 + (index % 2) * 390, y + 94 + Math.floor(index / 2) * 22,
      ui.t.type.caption, "left", value === undefined ? ui.t.alpha.muted : ui.t.alpha.soft); });
    if (dna.dimensions) Object.entries(dna.dimensions).forEach(([name, value], index) => { ui.text(canvas,
      `${name.toUpperCase()} ${String(Math.round(value * 100))}%`, x + 24 + (index % 3) * 265, y + 198 + Math.floor(index / 3) * 24, ui.t.type.caption, "left", ui.t.alpha.soft); });
    if (!dna.available) dna.unavailable.slice(0, 3).forEach((entry, index) => { ui.text(canvas, `UNAVAILABLE · ${entry}`, x + 24, y + 250 + index * 18, ui.t.type.micro, "left", ui.t.alpha.muted); });
    else ui.text(canvas, "Derived only from the declared durable capsule metrics; no hidden events or profile data.", x + 24, y + 286, ui.t.type.micro, "left", ui.t.alpha.muted);
  }

  function replayInfo(view: ReplayScreenView): void {
    const { canvas, safeInsets: safe } = context;
    const x = width - 470 - safe.r, y = 74 + safe.t, panelWidth = 440, panelHeight = 560;
    canvas.save(); canvas.globalAlpha = 0.92; canvas.fillStyle = REPLAY_DARK; canvas.fillRect(x, y, panelWidth, panelHeight);
    canvas.globalAlpha = 0.8; canvas.strokeStyle = REPLAY_CYAN; canvas.lineWidth = 1.5; canvas.strokeRect(x, y, panelWidth, panelHeight);
    canvas.globalAlpha = 1; canvas.fillStyle = REPLAY_CYAN; canvas.fillRect(x, y, 4, panelHeight);
    canvas.textAlign = "left"; canvas.fillStyle = REPLAY_PAPER; canvas.font = ui.font(ui.t.type.lead, true); canvas.fillText("RUN SUMMARY", x + 20, y + 32);
    view.infoRows?.forEach((row, index) => {
      const rowY = y + 60 + index * 26;
      canvas.fillStyle = "#9fa3b4"; canvas.font = ui.font(12, false); canvas.textAlign = "left"; canvas.fillText(row.label, x + 20, rowY);
      canvas.fillStyle = REPLAY_PAPER; canvas.font = ui.font(13, true); canvas.textAlign = "right"; canvas.fillText(row.value, x + panelWidth - 20, rowY);
    });
    let loadoutY = y + 60 + (view.infoRows?.length ?? 0) * 26 + 8;
    canvas.textAlign = "left"; canvas.fillStyle = REPLAY_CYAN; canvas.font = ui.font(ui.t.type.micro, true); canvas.fillText("FINAL LOADOUT", x + 20, loadoutY);
    loadoutY += 14;
    if (!view.loadout || view.loadout.length === 0) {
      canvas.fillStyle = "#9fa3b4"; canvas.font = ui.font(12, false); canvas.fillText("(not recorded)", x + 20, loadoutY + 18);
    }
    view.loadout?.slice(0, 12).forEach((item) => {
      if (loadoutY > y + panelHeight - 30) return;
      if (item.accent) { canvas.fillStyle = item.accent; canvas.fillRect(x + 20, loadoutY + 8, 4, 22); }
      canvas.fillStyle = REPLAY_PAPER; canvas.font = ui.font(13, true); canvas.textAlign = "left"; canvas.fillText(item.label, x + 34, loadoutY + 24);
      canvas.fillStyle = "#9fa3b4"; canvas.font = ui.font(11, false); canvas.textAlign = "right"; canvas.fillText(item.footer ?? "", x + panelWidth - 20, loadoutY + 24);
      loadoutY += 34;
    });
    canvas.restore(); canvas.textAlign = "left";
  }

  return { leaderboards, replay };
}
