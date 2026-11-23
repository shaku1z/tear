import type { ReplayScreenView, ScreenRenderContext } from "./contracts";
import { ellipsize } from "./screen-primitives";
import { createLeaderboardRenderers } from "./leaderboards";

const REPLAY_CYAN = "#13c4d6";
const REPLAY_DARK = "#0e1017";
const REPLAY_PAPER = "#f1eff9";
const REPLAY_MUTED = "#c9ccd6";
/** Space kept free at the top-right of the replay bar for the DOM fullscreen control. */
const REPLAY_TOP_RESERVE = 200;

export function createLeaderboardReplayRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;
  const { leaderboards } = createLeaderboardRenderers(context);

  /** The dark top bar: mode label, title and detail (ellipsized to the room left), and the score. */
  function replayTopBar(view: ReplayScreenView): void {
    const { canvas, safeInsets: safe, screenRectangle: screen } = context;
    canvas.save();
    canvas.globalAlpha = 0.85;
    canvas.fillStyle = REPLAY_DARK;
    canvas.fillRect(screen.x, screen.y, screen.w, 54 + safe.t);
    canvas.globalAlpha = 1;
    canvas.fillStyle = REPLAY_CYAN;
    canvas.fillRect(screen.x, screen.y, screen.w, 3);
    canvas.textAlign = "left";
    canvas.fillStyle = REPLAY_PAPER;
    canvas.font = ui.font(ui.t.type.lead, true);
    canvas.fillText("▶ REPLAY", 40 + safe.l, 36 + safe.t);
    canvas.fillStyle = REPLAY_MUTED;
    canvas.font = ui.font(ui.t.type.body, false);
    const header = view.title + "   ·   " + view.detail;
    const headerWidth = Math.max(
      0,
      width - safe.l - safe.r - 280 - REPLAY_TOP_RESERVE - canvas.measureText(view.score ?? "").width,
    );
    canvas.fillText(ellipsize(canvas, header, headerWidth), 200 + safe.l, 36 + safe.t);
    canvas.textAlign = "right";
    canvas.fillStyle = REPLAY_CYAN;
    canvas.font = ui.font(ui.t.type.label, true);
    // The browser's FULLSCREEN control sits over the top-right corner: keep clear of it.
    canvas.fillText(view.score ?? "", width - REPLAY_TOP_RESERVE - safe.r, 36 + safe.t);
    canvas.restore();
  }

  /** The dark transport strip: progress track, chapter ticks (bosses in red), playhead and clock. */
  function replayProgressBar(view: ReplayScreenView, barX: number, barY: number, barWidth: number): void {
    const { canvas, screenRectangle: screen } = context;
    canvas.save();
    canvas.globalAlpha = 0.85;
    canvas.fillStyle = REPLAY_DARK;
    canvas.fillRect(screen.x, barY - 18, screen.w, height - (barY - 18) + Math.max(0, -screen.y));
    canvas.globalAlpha = 0.25;
    canvas.fillStyle = REPLAY_PAPER;
    canvas.fillRect(barX, barY, barWidth, 5);
    canvas.globalAlpha = 1;
    canvas.fillStyle = REPLAY_CYAN;
    canvas.fillRect(barX, barY, barWidth * view.progress, 5);
    view.chapters?.forEach((chapter) => {
      canvas.fillStyle = chapter.boss ? ui.t.color.danger : REPLAY_PAPER;
      canvas.globalAlpha = chapter.boss ? 0.95 : 0.55;
      canvas.fillRect(barX + barWidth * chapter.fraction - 1, barY - 4, 2, 13);
    });
    canvas.globalAlpha = 1;
    canvas.fillStyle = REPLAY_PAPER;
    canvas.beginPath();
    canvas.arc(barX + barWidth * view.progress, barY + 2.5, 7, 0, Math.PI * 2);
    canvas.fill();
    // The clock reads on the track's line, past its end: above the track it crossed the strip's top edge.
    canvas.textAlign = "left";
    canvas.textBaseline = "middle";
    canvas.fillStyle = REPLAY_MUTED;
    canvas.font = ui.font(ui.t.type.caption, true);
    canvas.fillText(`${view.elapsed} / ${view.duration}`, barX + barWidth + 16, barY + 2.5);
    canvas.restore();
  }

  function replay(view: ReplayScreenView): void {
    const { canvas, safeInsets: safe } = context;
    replayTopBar(view);

    if (view.theater) theaterState();

    const barY = height - 96 - safe.b,
      barX = 220 + safe.l,
      barWidth = width - 440 - safe.l - safe.r;
    replayProgressBar(view, barX, barY, barWidth);

    // The transport bar is a dark surface: its controls use the rail (ghost) style so they
    // read the same as every other dark-surface control, on any biome.
    const controlY = height - 66 - safe.b;
    context.enqueue({
      x: 220 + safe.l,
      y: controlY,
      w: 64,
      h: 44,
      label: "|◀",
      ghost: true,
      action: { type: "replay.jumpChapter", direction: -1 },
    });
    context.enqueue({
      x: 292 + safe.l,
      y: controlY,
      w: 96,
      h: 44,
      label: view.paused ? "▶" : "❚❚",
      ghost: true,
      action: { type: "replay.togglePause" },
    });
    context.enqueue({
      x: 396 + safe.l,
      y: controlY,
      w: 64,
      h: 44,
      label: "▶|",
      ghost: true,
      action: { type: "replay.jumpChapter", direction: 1 },
    });
    context.enqueue({
      x: 468 + safe.l,
      y: controlY,
      w: 76,
      h: 44,
      label: `${String(view.speed)}×`,
      ghost: true,
      action: { type: "replay.speed", value: view.speed >= 4 ? 0.25 : view.speed * 2 },
    });
    context.enqueue({
      x: 552 + safe.l,
      y: controlY,
      w: 84,
      h: 44,
      label: "↺",
      ghost: true,
      action: { type: "replay.restart" },
    });
    if (view.theater)
      context.enqueue({
        x: 644 + safe.l,
        y: controlY,
        w: 180,
        h: 44,
        label: "PRACTICE",
        ghost: true,
        enabled: view.practiceAvailable === true,
        action: { type: "replay.practice" },
      });
    context.enqueue({
      x: width - 420 - safe.r,
      y: controlY,
      w: 90,
      h: 44,
      label: view.infoVisible ? "HIDE" : "INFO",
      ghost: true,
      action: { type: "replay.toggleInfo" },
    });
    context.enqueue({
      x: width - 320 - safe.r,
      y: controlY,
      w: 200,
      h: 44,
      label: "‹  BACK",
      ghost: true,
      action: { type: "replay.exit" },
    });
    if (view.notice) ui.text(canvas, view.notice, width / 2, barY - 34, ui.t.type.caption, "center", ui.t.alpha.muted);
    if (view.infoVisible) replayInfo(view);
    if (view.cutList) replayEditorPanel(view);
  }

  function theaterState(): void {
    const { safeInsets: safe } = context;
    context.enqueue({
      x: 30 + safe.l,
      y: 92 + safe.t,
      w: 190,
      h: 34,
      label: "REPLAY EDITOR",
      action: { type: "replay.editor.toggle" },
    });
  }

  function replayEditorPanel(view: ReplayScreenView): void {
    const cut = view.cutList,
      media = view.clipExport;
    if (cut === undefined) return;
    const { canvas, safeInsets: safe } = context;
    const panelWidth = Math.min(920, width - 64 - safe.l - safe.r),
      panelHeight = 288;
    const x = width / 2 - panelWidth / 2,
      y = 148 + safe.t;
    ui.panel(canvas, x, y, panelWidth, panelHeight);
    ui.accentStrip(canvas, x, y, panelWidth, REPLAY_CYAN);
    ui.title(canvas, "REPLAY EDITOR · LOCAL WEBM", width / 2, y + 36, ui.t.type.lead);
    ui.text(
      canvas,
      "Reconstructed player-follow · simulation time · 30 fps · 640×360",
      width / 2,
      y + 62,
      ui.t.type.micro,
      "center",
      ui.t.alpha.muted,
    );
    ui.text(
      canvas,
      `IN ${media?.markIn === undefined ? "previous checkpoint" : String(media.markIn)} · OUT ${view.score ?? ""} · CLIPS ${String(cut.clipCount ?? 0)} · speed ${String(view.speed)}×`,
      x + 24,
      y + 91,
      ui.t.type.caption,
      "left",
      ui.t.alpha.soft,
    );
    ui.text(
      canvas,
      `SOURCE ${cut.sourceGhostId ?? "current verified capsule"} · ${media?.status ?? "unavailable"}`,
      x + 24,
      y + 116,
      ui.t.type.micro,
      "left",
      ui.t.alpha.soft,
    );
    ui.text(
      canvas,
      `CUT LIST ${cut.cutListHash ?? "mark IN, seek an OUT checkpoint, then append"}`,
      x + 24,
      y + 139,
      ui.t.type.micro,
      "left",
      ui.t.alpha.muted,
    );
    const busy = media?.status === "rendering",
      gap = 8,
      w = (panelWidth - 64) / 3;
    context.enqueue({
      x: x + 24,
      y: y + 160,
      w,
      h: 34,
      label: "MARK IN",
      enabled: view.practiceAvailable && !busy,
      action: { type: "replay.editor.media", command: "markIn" },
    });
    context.enqueue({
      x: x + 24 + w + gap,
      y: y + 160,
      w,
      h: 34,
      label: "APPEND RANGE",
      enabled: view.practiceAvailable && !busy,
      action: { type: "replay.editor.appendClip" },
    });
    context.enqueue({
      x: x + 24 + (w + gap) * 2,
      y: y + 160,
      w,
      h: 34,
      label: "CLEAR CUTS",
      enabled: !busy,
      action: { type: "replay.editor.media", command: "clear" },
    });
    context.enqueue({
      x: x + 24,
      y: y + 202,
      w,
      h: 34,
      label: busy ? "CANCEL ENCODING" : "ENCODE WEBM",
      enabled: busy || (media?.available === true && cut.cutListHash !== undefined),
      action: { type: "replay.editor.media", command: busy ? "cancel" : "export" },
    });
    context.enqueue({
      x: x + 24 + w + gap,
      y: y + 202,
      w,
      h: 34,
      label: "DOWNLOAD WEBM",
      enabled: media?.status === "ready" || media?.status === "download-requested",
      action: { type: "replay.editor.media", command: "download" },
    });
    context.enqueue({
      x: x + 24 + (w + gap) * 2,
      y: y + 202,
      w,
      h: 34,
      label: "CLOSE EDITOR",
      action: { type: "replay.editor.toggle" },
    });
    ui.text(
      canvas,
      media?.available
        ? "Up to 60s / 1800 frames / 64 MiB. Gameplay-only ranges; cinema/intro source-time unavailable."
        : "This browser has no supported local WebM encoder.",
      width / 2,
      y + 264,
      ui.t.type.micro,
      "center",
      ui.t.alpha.muted,
    );
  }

  function replayInfo(view: ReplayScreenView): void {
    const { canvas, safeInsets: safe } = context;
    const x = width - 470 - safe.r,
      y = 74 + safe.t,
      panelWidth = 440,
      panelHeight = 560;
    canvas.save();
    canvas.globalAlpha = 0.97;
    canvas.fillStyle = REPLAY_DARK;
    canvas.fillRect(x, y, panelWidth, panelHeight);
    canvas.globalAlpha = 0.8;
    canvas.strokeStyle = REPLAY_CYAN;
    canvas.lineWidth = 1.5;
    canvas.strokeRect(x, y, panelWidth, panelHeight);
    canvas.globalAlpha = 1;
    canvas.fillStyle = REPLAY_CYAN;
    canvas.fillRect(x, y, 4, panelHeight);
    canvas.textAlign = "left";
    canvas.fillStyle = REPLAY_PAPER;
    canvas.font = ui.font(ui.t.type.lead, true);
    canvas.fillText("RUN SUMMARY", x + 20, y + 32);
    view.infoRows?.forEach((row, index) => {
      const rowY = y + 60 + index * 26;
      canvas.fillStyle = "#b4b8c8";
      canvas.font = ui.font(ui.t.type.micro, false);
      canvas.textAlign = "left";
      canvas.fillText(row.label, x + 20, rowY);
      canvas.fillStyle = REPLAY_PAPER;
      canvas.font = ui.font(ui.t.type.caption, true);
      canvas.textAlign = "right";
      canvas.fillText(ellipsize(canvas, row.value, panelWidth - 200), x + panelWidth - 20, rowY);
    });
    let loadoutY = y + 60 + (view.infoRows?.length ?? 0) * 26 + 8;
    canvas.textAlign = "left";
    canvas.fillStyle = REPLAY_CYAN;
    canvas.font = ui.font(ui.t.type.micro, true);
    canvas.fillText(view.loadoutHeading?.title ?? "FINAL LOADOUT", x + 20, loadoutY);
    loadoutY += 14;
    if (!view.loadout || view.loadout.length === 0) {
      canvas.fillStyle = "#b4b8c8";
      canvas.font = ui.font(ui.t.type.micro, false);
      canvas.fillText(view.loadoutHeading?.empty ?? "(not recorded)", x + 20, loadoutY + 18);
    }
    view.loadout?.slice(0, 12).forEach((item) => {
      if (loadoutY > y + panelHeight - 30) return;
      if (item.accent) {
        canvas.fillStyle = item.accent;
        canvas.fillRect(x + 20, loadoutY + 8, 4, 22);
      }
      canvas.fillStyle = REPLAY_PAPER;
      canvas.font = ui.font(ui.t.type.caption, true);
      canvas.textAlign = "left";
      canvas.fillText(item.label, x + 34, loadoutY + 24);
      canvas.fillStyle = "#b4b8c8";
      canvas.font = ui.font(ui.t.type.micro, false);
      canvas.textAlign = "right";
      canvas.fillText(item.footer ?? "", x + panelWidth - 20, loadoutY + 24);
      loadoutY += 34;
    });
    canvas.restore();
    canvas.textAlign = "left";
  }

  return { leaderboards, replay };
}
