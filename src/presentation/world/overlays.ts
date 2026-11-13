import type {
  AchievementToastSnapshot, BossIntroSnapshot, WorldRenderContext, ReticleSnapshot,
  StageBannerSnapshot, WaveBannerSnapshot,
} from "./contracts";
import { clamp } from "./primitives";
import { bossHudTop, hudFrame, hudType } from "./hud";

/** Widest an achievement toast may grow; it never spans a title or a control column. */
const TOAST_MAX_WIDTH = 360;
/**
 * The stage banner's accent label (ENTERING, STAGE n) sits on a tinted biome sky, not
 * on paper: darkened to 6:1 against paper it still clears 4.5:1 on the darkest light
 * sky (#dbe0e6) and on the warm sun glow behind the Grounds title.
 */
const BANNER_LABEL_CONTRAST = 6;

export function createOverlayRenderers(context: WorldRenderContext) {
  const canvas = context.canvas;
  const ui = context.ui;

  /**
   * One placement rule per context (decided by the app, see AchievementToastSnapshot):
   * - "hud": in a run, the top-right of the HUD frame, below any on-screen pause control;
   * - "corner": menus and run overlays, the bottom-right of the screen frame (the DOM
   *   fullscreen control lives top-right);
   * - "sheet-footer": sheet screens, the free left of the sheet's footer row (BACK is centred).
   * The controller queues achievements, so only one toast is ever on screen.
   */
  function toastRect(snapshot: AchievementToastSnapshot): Readonly<{ x: number; y: number; w: number; h: number; slim: boolean }> {
    const t = ui.t, frame = hudFrame(context), pad = t.space.sm;
    if (snapshot.placement === "sheet-footer") {
      const footer = ui.sheetFooter(), sheet = ui.sheetRect();
      const w = Math.min(TOAST_MAX_WIDTH, footer.backX - sheet.x - t.space.xl - t.space.md);
      return { x: sheet.x + t.space.xl, y: footer.y, w, h: footer.h, slim: true };
    }
    const w = Math.min(TOAST_MAX_WIDTH, frame.right - frame.left);
    const h = pad * 2 + t.type.micro + t.type.body + t.type.micro + t.space.xs * 2 + pad;
    if (snapshot.placement === "hud") return { x: frame.right - w, y: Math.max(frame.top, snapshot.clearTop ?? 0), w, h, slim: false };
    const bottom = context.screen.y + context.screen.h - context.safe.bottom - t.space.lg;
    return { x: frame.right - w, y: bottom - h, w, h, slim: false };
  }

  function achievementToast(snapshot: AchievementToastSnapshot): void {
    const reveal = clamp(snapshot.reveal);
    if (reveal <= 0) return;
    const t = ui.t, rect = toastRect(snapshot), pad = t.space.md, icon = Math.min(44, rect.h - t.space.sm * 2);
    const travel = (rect.w + t.space.xl) * (1 - reveal), x = rect.x + (snapshot.placement === "sheet-footer" ? -travel : travel);
    canvas.save();
    canvas.globalAlpha = reveal;
    canvas.fillStyle = t.color.scrim;
    canvas.fillRect(x, rect.y, rect.w, rect.h);
    canvas.fillStyle = snapshot.rarityColor;
    canvas.fillRect(x, rect.y, rect.w, 3);
    canvas.fillRect(x, rect.y, 4, rect.h);
    const iconX = x + pad, iconY = rect.y + (rect.h - icon) / 2, textX = iconX + icon + t.space.md, textW = x + rect.w - pad - textX;
    canvas.globalAlpha = reveal * 0.18;
    canvas.fillRect(iconX, iconY, icon, icon);
    canvas.globalAlpha = reveal;
    ui.tag(canvas, snapshot.categoryIcon || "★", iconX + icon / 2, iconY + icon / 2 + t.type.lead * 0.36, snapshot.rarityColor, "center", t.type.lead);
    const reward = `◆ +${String(snapshot.shards)}  +${String(snapshot.coins)}c`;
    canvas.font = ui.font(t.type.micro, true);
    const rewardW = canvas.measureText(reward).width;
    const firstY = rect.slim ? rect.y + rect.h / 2 - t.space.xs : rect.y + pad + t.type.micro;
    const status = ui.fitText(canvas, `UNLOCKED · ${snapshot.rarityName}`, textW - rewardW - t.space.sm, { size: t.type.micro, floor: t.type.micro, bold: true });
    ui.tag(canvas, status.lines[0] ?? "", textX, firstY, snapshot.rarityColor, "left", t.type.micro);
    ui.tag(canvas, reward, x + rect.w - pad, firstY, t.color.accent, "right", t.type.micro);
    const nameY = firstY + t.space.xs + (rect.slim ? t.type.label : t.type.body);
    const name = ui.fitText(canvas, snapshot.name, textW, { size: rect.slim ? t.type.label : t.type.body, floor: t.type.micro, bold: true });
    ui.tag(canvas, name.lines[0] ?? "", textX, nameY, t.color.scrimInk, "left", name.size);
    if (!rect.slim) {
      const description = ui.fitText(canvas, snapshot.description, textW, { size: t.type.micro, floor: t.type.micro });
      ui.textBox(canvas, description.lines[0] ?? "", textX, nameY + t.space.xs + t.type.micro, textW,
        { size: t.type.micro, color: t.color.scrimInk, alpha: t.alpha.soft, maxLines: 1 });
    }
    canvas.restore();
    canvas.textAlign = "left";
    canvas.textBaseline = "alphabetic";
  }

  /** Announcements share one band under the HUD lane, never over the spawn floor. */
  function announcementTop(): number {
    return bossHudTop(context) + ui.t.space.md;
  }

  function waveBanner(snapshot: WaveBannerSnapshot): void {
    const t = ui.t, type = hudType(context), alpha = clamp(Math.sin((1 - clamp(snapshot.remainingFraction)) * Math.PI));
    const top = announcementTop(), size = type.display, titleY = top + t.space.md + Math.round(size * 0.8);
    const title = snapshot.bossWave ? "BOSS" : `WAVE ${String(snapshot.wave)}`;
    canvas.save();
    canvas.globalAlpha = alpha;
    // Plain text over the scene in the biome ink, like the HUD.
    ui.tag(canvas, title, context.width / 2, titleY, ui.ink, "center", size);
    if (snapshot.waveTag) {
      ui.tag(canvas, snapshot.waveTag, context.width / 2, titleY + t.space.sm + type.lead,
        ui.readable(snapshot.horde ? snapshot.hordeColor : snapshot.normalColor), "center", type.lead);
    }
    canvas.restore();
  }

  function bossIntro(snapshot: BossIntroSnapshot): void {
    ui.bossIntro(canvas, { screen: snapshot.screen, bossName: snapshot.bossName || "BOSS",
      epithet: snapshot.epithet, openingLine: snapshot.openingLine, color: snapshot.color, t: snapshot.elapsed, dur: snapshot.duration });
  }

  function stageBanner(snapshot: StageBannerSnapshot): void {
    const t = ui.t, type = hudType(context), alpha = clamp(Math.min(snapshot.elapsed, 1) * Math.min((3 - snapshot.elapsed) * 2.5, 1));
    const bossTest = snapshot.mode === "bossonly";
    const endlessLike = snapshot.mode === "endless" || snapshot.mode === "gauntlet";
    const label = bossTest ? "BOSS TEST" : (endlessLike ? "ENTERING" : `STAGE ${String(snapshot.stageIndex + 1)}`);
    const top = announcementTop(), labelY = top + t.space.md + type.body;
    const nameY = labelY + t.space.sm + Math.round(type.display * 0.8), blurbY = nameY + t.space.sm + type.body;
    canvas.save();
    canvas.globalAlpha = alpha;
    // Plain text over the scene in the biome ink, like the HUD.
    ui.tag(canvas, label, context.width / 2, labelY, ui.readable(snapshot.accent, BANNER_LABEL_CONTRAST), "center", type.body);
    ui.tag(canvas, snapshot.stageName, context.width / 2, nameY, ui.ink, "center", type.display);
    if (!bossTest) ui.text(canvas, snapshot.blurb, context.width / 2, blurbY, type.body, "center", t.alpha.soft * alpha);
    canvas.restore();
  }

  function reticle(snapshot: ReticleSnapshot): void {
    canvas.strokeStyle = "#000";
    canvas.lineWidth = 1.5;
    canvas.beginPath();
    canvas.arc(snapshot.x, snapshot.y, 4, 0, Math.PI * 2);
    canvas.moveTo(snapshot.x - 9, snapshot.y);
    canvas.lineTo(snapshot.x + 9, snapshot.y);
    canvas.moveTo(snapshot.x, snapshot.y - 9);
    canvas.lineTo(snapshot.x, snapshot.y + 9);
    canvas.stroke();
    if (!snapshot.power) return;
    canvas.save();
    canvas.globalAlpha = 0.9;
    canvas.fillStyle = snapshot.power === "slam" ? snapshot.slamColor : snapshot.updraftColor;
    canvas.font = ui.font(22, true);
    canvas.textAlign = "center";
    canvas.textBaseline = "middle";
    canvas.fillText(snapshot.power === "slam" ? "⇊" : "⇈", snapshot.x, snapshot.y + (snapshot.power === "slam" ? 24 : -24));
    canvas.restore();
  }

  return { achievementToast, waveBanner, bossIntro, stageBanner, reticle };
}
