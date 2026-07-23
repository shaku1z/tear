import type { AchievementsScreenView, ProfileScreenView, ScreenRenderContext } from "./contracts";
import { backControl, cardGrid, replayRow, scrollHint, tabs } from "./screen-primitives";

export function createProfileAchievementRenderers(context: ScreenRenderContext) {
  const { ui } = context;

  function profile(view: ProfileScreenView): void {
    const { canvas } = context;
    ui.title(canvas, "PROFILE", context.width / 2, 92, ui.t.type.h1);
    canvas.fillStyle = "#b06cff"; canvas.globalAlpha = context.enterAmount;
    canvas.fillRect(context.width / 2 - 65 * context.enterAmount, 108, 130 * context.enterAmount, 3); canvas.globalAlpha = 1;
    passport(view);
    tabs(context, view.tabs, (id) => ({ type: "profile.selectTab", id }), 252);
    const panelX = context.width / 2 - 460;
    if (view.message) ui.text(canvas, view.message, context.width / 2, 296, ui.t.type.caption, "center", ui.t.alpha.muted);
    if (view.tab === "replays" && view.replays) {
      const top = 322, bottom = context.height - 110, rowHeight = 96, listX = context.width / 2 - 560, listWidth = 1120;
      if (view.replays.length === 0 && view.emptyMessage) {
        ui.text(canvas, view.emptyMessage, context.width / 2, top + 140, ui.t.type.body, "center", ui.t.alpha.muted);
        context.enqueue({ x: context.width / 2 - 130, y: top + 168, w: 260, h: 46, label: "PLAY A RUN", action: { type: "profile.play" } });
      }
      canvas.save(); canvas.beginPath(); canvas.rect(0, top - 8, context.width, bottom - top + 16); canvas.clip();
      view.replays.forEach((replay, index) => {
        const y = top + index * rowHeight - context.scroll;
        if (y + rowHeight < top - 8 || y > bottom + 8) return;
        replayRow(context, replay, listX, y, listWidth, replay.pinned ? "#e0a326" : undefined);
        const actionsX = listX + listWidth - 392;
        context.enqueue({ x: actionsX, y: y + 20, w: 110, h: 40, label: "▶  WATCH", enabled: replay.available, action: { type: "profile.watchReplay", id: replay.id } });
        if (replay.local) {
          context.enqueue({ x: actionsX + 118, y: y + 20, w: 78, h: 40, label: replay.pinned ? "★" : "PIN", selected: replay.pinned,
            action: { type: "profile.pinReplay", id: replay.id, pinned: !replay.pinned } });
          context.enqueue({ x: actionsX + 204, y: y + 20, w: 96, h: 40, label: replay.shared ? "SHARED" : "SHARE", selected: replay.shared,
            enabled: !replay.shared, action: { type: "profile.publishReplay", id: replay.id } });
          context.enqueue({ x: actionsX + 308, y: y + 20, w: 64, h: 40, label: "✕", action: { type: "profile.deleteReplay", id: replay.id } });
        }
      });
      canvas.restore();
    } else if (view.tab === "bests") {
      if (view.finest) {
        ui.title(canvas, view.finest.headline, context.width / 2, 348, ui.t.type.h2);
        ui.tag(canvas, view.finest.detail, context.width / 2, 372, "#b06cff", "center", ui.t.type.micro);
      }
      if (view.records && view.records.length > 0) {
        const x = panelX, right = panelX + 920, headerY = 412;
        ui.tag(canvas, "MODE", x, headerY, ui.t.color.muted, "left", ui.t.type.micro);
        ui.tag(canvas, "WAVE", right - 320, headerY, ui.t.color.muted, "right", ui.t.type.micro);
        ui.tag(canvas, "TIME", right - 180, headerY, ui.t.color.muted, "right", ui.t.type.micro);
        ui.tag(canvas, "SCORE", right - 20, headerY, ui.t.color.muted, "right", ui.t.type.micro);
        ui.divider(canvas, x, headerY + 8, 920, 0.12);
        view.records.slice(0, 10).forEach((record, index) => {
          const y = headerY + 34 + index * 34;
          ui.text(canvas, record.mode, x, y, ui.t.type.label);
          ui.tag(canvas, record.difficulty.toUpperCase(), x + 164, y, record.accent, "left", ui.t.type.micro);
          ui.text(canvas, record.wave, right - 320, y, ui.t.type.label, "right");
          ui.text(canvas, record.time, right - 180, y, ui.t.type.label, "right", ui.t.alpha.soft);
          ui.text(canvas, record.score, right - 20, y, ui.t.type.label, "right");
          ui.divider(canvas, x, y + 11, 920, 0.06);
        });
      } else if (view.emptyMessage) {
        ui.text(canvas, view.emptyMessage, context.width / 2, 440, ui.t.type.body, "center", ui.t.alpha.muted);
        context.enqueue({ x: context.width / 2 - 130, y: 478, w: 260, h: 46, label: "PLAY A RUN", action: { type: "profile.play" } });
      }
    } else {
      view.stats.forEach((stat, index) => {
        const column = index % 4, row = Math.floor(index / 4);
        const x = context.width / 2 - 560 + column * 284.5;
        const y = 312 + row * 114;
        ui.card(canvas, x, y, 266.5, 96, false);
        if (stat.accent) { canvas.fillStyle = stat.accent; canvas.fillRect(x, y, 266.5, 4); }
        if (stat.glyph) ui.tag(canvas, stat.glyph, x + 20, y + 40, stat.accent, "left", 20);
        ui.title(canvas, stat.value, x + 141, y + 50, ui.t.type.h2);
        ui.tag(canvas, stat.label.toUpperCase(), x + 133, y + 78, ui.t.color.muted, "center", ui.t.type.micro);
      });
      if (view.journey) {
        const x = context.width / 2 - 560, y = 664;
        ui.sectionLabel(canvas, "THE JOURNEY", x, y, 1120, "#b06cff");
        ui.text(canvas, view.journey.biomes.map((item) => `${item.selected ? "◆" : "◇"} ${item.label.toUpperCase()}`).join("   "), x, y + 34, ui.t.type.micro);
        ui.text(canvas, view.journey.bosses.map((item) => `${item.selected ? "☠" : "◇"} ${item.label.toUpperCase()}`).join("   "), x, y + 58, ui.t.type.micro);
      }
    }
    scrollHint(context, view.canScrollUp, view.canScrollDown);
    backControl(context);
  }

  function passport(view: ProfileScreenView): void {
    const { canvas } = context;
    const x = context.width / 2 - 560, right = context.width / 2 + 560, y = 130, height = 100;
    canvas.globalAlpha = 0.05; canvas.fillStyle = ui.ink; canvas.fillRect(x, y, right - x, height); canvas.globalAlpha = 1;
    ui.tag(canvas, view.signedIn ? "● CLOUD LINKED" : "○ LOCAL PROFILE", x + 18, y + 22, view.signedIn ? "#2f9e6b" : ui.t.color.muted, "left", ui.t.type.micro);
    ui.displayText(canvas, view.name.toUpperCase(), x + 18, y + 54, ui.t.type.h2);
    if (view.cloudStatus) ui.text(canvas, view.cloudStatus, x + 18, y + 78, ui.t.type.caption, "left", ui.t.alpha.muted);
    const passport = view.passport;
    if (!passport) return;
    ui.tag(canvas, `◆ ${passport.coins.toLocaleString()}   ⬡ ${String(passport.shards)}`, x + 410, y + 36, "#b06cff", "left", ui.t.type.label);
    passport.showcases.forEach((seal, index) => { ui.tag(canvas, seal.glyph, right - 560 + index * 46, y + 58, seal.color, "center", 22); });
    context.enqueue({ x: right - 420, y: y + 30, w: 130, h: 40, label: `★ ${passport.achievements}`, action: { type: "profile.openAchievements" } });
    const actionX = right - 244;
    if (passport.renameLabel) context.enqueue({ x: actionX, y: y + 10, w: 230, h: 34, label: passport.renameLabel, enabled: passport.canRename, action: { type: "profile.rename" } });
    if (passport.canSignOut) context.enqueue({ x: actionX, y: y + 52, w: 230, h: 34, label: "SIGN OUT", action: { type: "profile.signOut" } });
    else if (passport.canSignIn) context.enqueue({ x: actionX, y: y + 28, w: 230, h: 40, label: passport.signInLabel ?? "SIGN IN", action: { type: "profile.signIn" } });
  }

  function achievements(view: AchievementsScreenView): void {
    const { canvas } = context;
    ui.header(canvas, "ACHIEVEMENTS", "master the blade · earn shards", context.enterAmount, "#e0a326");
    if (view.dailies) {
      const x = context.width / 2 - 560, width = 1120;
      ui.tag(canvas, "DAILY CHALLENGES", x, 150, ui.t.color.accent, "left", ui.t.type.micro);
      if (view.resetsIn) ui.tag(canvas, `RESETS IN ${view.resetsIn}`, x + width, 150, ui.t.color.muted, "right", ui.t.type.micro);
      view.dailies.slice(0, 3).forEach((daily, index) => {
        const cardWidth = (width - 32) / 3, cardX = x + index * (cardWidth + 16), y = 162;
        ui.card(canvas, cardX, y, cardWidth, 86, false); ui.accentStrip(canvas, cardX, y, cardWidth, daily.done ? "#2f9e6b" : ui.t.color.accent);
        ui.text(canvas, daily.label, cardX + 16, y + 30, ui.t.type.body);
        ui.bar(canvas, cardX + 16, y + 46, cardWidth - 130, 6, daily.goal > 0 ? daily.current / daily.goal : 0, daily.done ? "#2f9e6b" : ui.t.color.accent);
        ui.tag(canvas, daily.done ? "✓ DONE" : daily.reward, cardX + cardWidth - 16, y + 34, daily.done ? "#2f9e6b" : ui.t.color.accent, "right", ui.t.type.label);
        ui.text(canvas, `${String(daily.current)} / ${String(daily.goal)}`, cardX + 16, y + 70, 11, "left", ui.t.alpha.soft);
      });
      ui.tag(canvas, `◆ ${String(view.shards ?? 0)} SHARDS   ·   ${String(view.unlocked)} / ${String(view.total)} UNLOCKED`, x + 22, 292, ui.t.color.accent, "left", ui.t.type.label);
      if (view.nextUp) ui.tag(canvas, `NEXT UP ▸  ${view.nextUp}`, x + width - 22, 292, ui.t.color.accent, "right", ui.t.type.micro);
    }
    tabs(context, view.categories, (id) => ({ type: "achievements.selectCategory", id }), view.dailies ? 328 : 150);
    cardGrid(context, view.cards, (id) => ({ type: "achievements.inspect", id }), { top: view.dailies ? 382 : 210, columns: 2, rows: 3, height: 128 });
    scrollHint(context, view.canScrollUp, view.canScrollDown);
    backControl(context);
  }

  return { profile, achievements };
}
