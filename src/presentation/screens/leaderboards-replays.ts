import type { LeaderboardsScreenView, ReplayScreenView, ScreenRenderContext } from "./contracts";
import { backControl, scrollHint, tabs } from "./screen-primitives";

export function createLeaderboardReplayRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function leaderboards(view: LeaderboardsScreenView): void {
    const { canvas } = context;
    ui.header(canvas, "LEADERBOARDS", "records, rivals, and replay ghosts", context.enterAmount, "#13c4d6");
    tabs(context, view.tabs, (id) => ({ type: "leaderboards.selectTab", id }), 150);
    if (view.modes) tabs(context, view.modes, (id) => ({ type: "leaderboards.selectBoard", id: `mode:${id}` }), 206);
    if (view.difficulties) tabs(context, view.difficulties, (id) => ({ type: "leaderboards.selectBoard", id: `difficulty:${id}` }), 250);
    else if (view.boards) tabs(context, view.boards, (id) => ({ type: "leaderboards.selectBoard", id }), 204);
    if (view.message) ui.text(canvas, view.message, width / 2, view.modes ? 316 : 258, ui.t.type.caption, "center", ui.t.alpha.muted);
    if (view.signInRequired) context.enqueue({ x: width / 2 - 160, y: 460, w: 320, h: 46, label: "SIGN IN VIA PROFILE", action: { type: "navigate", to: "profile", tab: "bests" } });
    if (view.podium) {
      const positions = [{ x: width / 2 - 130, y: 316, w: 260, h: 132 }, { x: width / 2 - 420, y: 334, w: 260, h: 114 }, { x: width / 2 + 160, y: 344, w: 260, h: 104 }];
      view.podium.slice(0, 3).forEach((entry, index) => {
        const position = positions[index]; if (!position) return;
        ui.card(canvas, position.x, position.y, position.w, position.h, false);
        ui.title(canvas, String(entry.rank), position.x + 42, position.y + position.h / 2 + 18, index === 0 ? 52 : 40);
        ui.text(canvas, `${entry.name}${entry.mine ? " (you)" : ""}`, position.x + 86, position.y + position.h / 2 - 8, ui.t.type.body);
        ui.text(canvas, entry.detail, position.x + 86, position.y + position.h / 2 + 14, ui.t.type.micro, "left", ui.t.alpha.muted);
        if (entry.replayId) context.enqueue({ x: position.x + position.w - 58, y: position.y + position.h - 40, w: 48, h: 30, label: "▶", action: { type: "leaderboards.watchReplay", id: entry.replayId } });
      });
    }
    const top = view.podium ? 492 : (view.modes ? 316 : (view.boards ? 262 : 214));
    canvas.save(); canvas.beginPath(); canvas.rect(0, top - 8, width, height - top - 94); canvas.clip();
    view.rows.forEach((row, index) => {
      const y = top + index * 66 - context.scroll;
      if (y + 56 < top - 8 || y > height - 102) return;
      ui.card(canvas, 260, y, width - 520, 56, false);
      if (row.thumbnailId) context.renderPreview?.(row.thumbnailId, { x: 268, y: y + 4, w: 84, h: 48 });
      ui.tag(canvas, String(row.rank ?? index + 1).padStart(2, "0"), 282, y + 34, ui.t.color.accent, "left", ui.t.type.label);
      const textX = row.thumbnailId ? 368 : 340;
      ui.text(canvas, row.title, textX, y + 24, ui.t.type.label);
      ui.text(canvas, row.detail, textX, y + 44, ui.t.type.micro, "left", ui.t.alpha.muted);
      if (row.badge) ui.tag(canvas, row.badge, width - 430, y + 24, ui.t.color.accent, "right", ui.t.type.micro);
      context.enqueue({
        x: width - 410, y: y + 8, w: 130, h: 40, label: "▶ WATCH",
        enabled: row.available, action: { type: "leaderboards.watchReplay", id: row.id },
      });
    });
    canvas.restore();
    if (view.ownRank) ui.tag(canvas, view.ownRank, width / 2, Math.min(height - 116, top + Math.min(8, view.rows.length) * 66 + 18), ui.t.color.accent, "center", ui.t.type.micro);
    scrollHint(context, view.canScrollUp, view.canScrollDown);
    backControl(context);
  }

  function replay(view: ReplayScreenView): void {
    const { canvas } = context;
    ui.tag(canvas, "▶ REPLAY", 48, 50, ui.t.color.accent, "left", ui.t.type.lead);
    ui.text(canvas, view.title, 200, 50, ui.t.type.body, "left", ui.t.alpha.soft);
    ui.text(canvas, view.detail, 200, 76, ui.t.type.caption, "left", ui.t.alpha.muted);
    if (view.stage) ui.tag(canvas, view.stage.toUpperCase(), width - 48, 50, ui.t.color.accent, "right", ui.t.type.micro);
    if (view.score) ui.text(canvas, view.score, width - 48, 84, ui.t.type.title, "right");

    const controlY = height - 92;
    ui.panel(canvas, 32, controlY - 18, width - 64, 78);
    const barX = 220, barWidth = width - 440;
    ui.bar(canvas, barX, controlY + 8, barWidth, 7, view.progress, ui.t.color.accent);
    view.chapters?.forEach((chapter) => {
      canvas.fillStyle = chapter.boss ? ui.t.color.danger : ui.ink; canvas.globalAlpha = chapter.boss ? 0.95 : 0.55;
      canvas.fillRect(barX + barWidth * chapter.fraction - 1, controlY + 4, 2, 13); canvas.globalAlpha = 1;
    });
    canvas.fillStyle = ui.ink; canvas.beginPath(); canvas.arc(barX + barWidth * view.progress, controlY + 10.5, 7, 0, Math.PI * 2); canvas.fill();
    ui.text(canvas, `${view.elapsed} / ${view.duration}`, width / 2, controlY + 40, ui.t.type.micro, "center", ui.t.alpha.muted);
    context.enqueue({ x: 220, y: controlY + 28, w: 64, h: 44, label: "|◀", action: { type: "replay.jumpChapter", direction: -1 } });
    context.enqueue({ x: 292, y: controlY + 28, w: 96, h: 44, label: view.paused ? "▶" : "❚❚", action: { type: "replay.togglePause" } });
    context.enqueue({ x: 396, y: controlY + 28, w: 64, h: 44, label: "▶|", action: { type: "replay.jumpChapter", direction: 1 } });
    context.enqueue({ x: 468, y: controlY + 28, w: 76, h: 44, label: `${String(view.speed)}×`, action: { type: "replay.speed", value: view.speed >= 2 ? 0.5 : view.speed * 2 } });
    context.enqueue({ x: 552, y: controlY + 28, w: 84, h: 44, label: "↺", action: { type: "replay.restart" } });
    context.enqueue({ x: width - 420, y: controlY + 28, w: 90, h: 44, label: view.infoVisible ? "HIDE" : "INFO", action: { type: "replay.toggleInfo" } });
    context.enqueue({ x: width - 320, y: controlY + 28, w: 200, h: 44, label: "‹  BACK", action: { type: "replay.exit" } });
    if (view.infoVisible) replayInfo(view);
  }

  function replayInfo(view: ReplayScreenView): void {
    const { canvas } = context;
    const x = width - 470, y = 74, panelWidth = 440, panelHeight = 560;
    canvas.save(); canvas.globalAlpha = 0.92; canvas.fillStyle = "#0e1017"; canvas.fillRect(x, y, panelWidth, panelHeight);
    canvas.globalAlpha = 1; canvas.fillStyle = ui.t.color.accent; canvas.fillRect(x, y, 4, panelHeight);
    ui.text(canvas, "RUN SUMMARY", x + 20, y + 32, ui.t.type.lead);
    view.infoRows?.forEach((row, index) => {
      const rowY = y + 60 + index * 26;
      ui.text(canvas, row.label, x + 20, rowY, 12, "left", ui.t.alpha.muted);
      ui.text(canvas, row.value, x + panelWidth - 20, rowY, 13, "right");
    });
    const loadoutY = y + 60 + (view.infoRows?.length ?? 0) * 26 + 8;
    ui.tag(canvas, "FINAL LOADOUT", x + 20, loadoutY, ui.t.color.accent, "left", ui.t.type.micro);
    if (!view.loadout || view.loadout.length === 0) ui.text(canvas, "(not recorded)", x + 20, loadoutY + 28, 12, "left", ui.t.alpha.muted);
    view.loadout?.slice(0, 12).forEach((item, index) => {
      const itemY = loadoutY + 28 + index * 34;
      if (item.accent) { canvas.fillStyle = item.accent; canvas.fillRect(x + 20, itemY - 16, 4, 22); }
      ui.text(canvas, item.label, x + 34, itemY, 13);
      ui.text(canvas, item.footer ?? "", x + panelWidth - 20, itemY, 11, "right", ui.t.alpha.muted);
    });
    canvas.restore();
  }

  return { leaderboards, replay };
}
