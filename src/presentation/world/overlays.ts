import type {
  AchievementToastSnapshot, BossIntroSnapshot, LegacyWorldRenderContext, ReticleSnapshot,
  StageBannerSnapshot, WaveBannerSnapshot,
} from "./contracts";
import { clamp } from "./primitives";

export function createOverlayRenderers(context: LegacyWorldRenderContext) {
  const canvas = context.canvas;
  const ui = context.ui;

  function fit(text: string, maxWidth: number): string {
    if (canvas.measureText(text).width <= maxWidth) return text;
    let end = text.length;
    while (end > 0 && canvas.measureText(text.slice(0, end).trimEnd() + "…").width > maxWidth) end -= 1;
    return text.slice(0, end).trimEnd() + "…";
  }

  // Placement is decided by the app: in a run it keeps the top-right; on the main menu it
  // sits bottom-right in the open scene; on sheet screens it uses the empty left of the
  // header, so it never covers a control, the coin balance, or the profile actions.
  function achievementToast(snapshot: AchievementToastSnapshot): void {
    const reveal = clamp(snapshot.reveal);
    if (reveal <= 0) return;
    const width = 356, height = 78, placement = snapshot.placement ?? "top-right";
    const restX = placement === "header-left" ? context.width / 2 - 600 : context.width - width - 22 - context.safe.right;
    const y = placement === "bottom-right" ? context.height - height - 22 - context.safe.bottom
      : placement === "header-left" ? 52 : 20 + context.safe.top;
    const travel = (width + 44) * (1 - reveal), x = placement === "header-left" ? restX - travel : restX + travel;
    canvas.save();
    canvas.globalAlpha = reveal; canvas.fillStyle = "#0e1017"; canvas.fillRect(x, y, width, height);
    canvas.globalAlpha = reveal * 0.9; canvas.strokeStyle = snapshot.rarityColor; canvas.lineWidth = 2;
    canvas.strokeRect(x, y, width, height); canvas.fillStyle = snapshot.rarityColor;
    canvas.fillRect(x, y, width, 3); canvas.fillRect(x, y, 4, height);
    canvas.globalAlpha = reveal * 0.18; canvas.fillRect(x + 14, y + 17, 44, 44);
    canvas.globalAlpha = reveal; canvas.fillStyle = snapshot.rarityColor; canvas.font = ui.font(22, true);
    canvas.textAlign = "center"; canvas.textBaseline = "middle";
    canvas.fillText(snapshot.categoryIcon || "★", x + 36, y + 40); canvas.textBaseline = "alphabetic";
    const textX = x + 70, textWidth = width - 70 - 14;
    canvas.textAlign = "right"; canvas.fillStyle = "#3fd6e6"; canvas.font = ui.font(ui.t.type.caption, true);
    const reward = `◆ +${String(snapshot.shards)}  +${String(snapshot.coins)}c`, rewardWidth = canvas.measureText(reward).width;
    canvas.fillText(reward, x + width - 12, y + 23);
    canvas.textAlign = "left"; canvas.fillStyle = snapshot.rarityColor; canvas.font = ui.font(ui.t.type.micro, true);
    canvas.fillText(fit(`UNLOCKED · ${snapshot.rarityName}`, textWidth - rewardWidth - 10), textX, y + 23);
    canvas.fillStyle = "#f1eff9"; canvas.font = ui.font(ui.t.type.body, true);
    canvas.fillText(fit(snapshot.name, textWidth), textX, y + 45);
    canvas.fillStyle = "#c9ccd6"; canvas.font = ui.font(ui.t.type.micro, false);
    canvas.fillText(fit(snapshot.description, textWidth), textX, y + 65);
    canvas.restore(); canvas.textAlign = "left"; canvas.textBaseline = "alphabetic";
  }

  function waveBanner(snapshot: WaveBannerSnapshot): void {
    const remaining = clamp(snapshot.remainingFraction);
    const alpha = Math.sin((1 - remaining) * Math.PI);
    canvas.save(); canvas.globalAlpha = clamp(alpha);
    ui.title(canvas, snapshot.bossWave ? "BOSS" : `WAVE ${String(snapshot.wave)}`,
      context.width / 2, 150, 60 + (1 - alpha) * 10);
    if (snapshot.waveTag) {
      ui.tag(canvas, snapshot.waveTag, context.width / 2, 186,
        snapshot.horde ? snapshot.hordeColor : snapshot.normalColor, "center", ui.t.type.lead);
    }
    canvas.restore();
  }

  function bossIntro(snapshot: BossIntroSnapshot): void {
    ui.bossIntro(canvas, { screen: snapshot.screen, bossName: snapshot.bossName || "BOSS",
      epithet: snapshot.epithet, openingLine: snapshot.openingLine, color: snapshot.color, t: snapshot.elapsed, dur: snapshot.duration });
  }

  function stageBanner(snapshot: StageBannerSnapshot): void {
    const alpha = Math.min(snapshot.elapsed, 1) * Math.min((3 - snapshot.elapsed) * 2.5, 1);
    const bossTest = snapshot.mode === "bossonly";
    const endlessLike = snapshot.mode === "endless" || snapshot.mode === "gauntlet";
    const label = bossTest ? "BOSS TEST" : (endlessLike ? "ENTERING" : `STAGE ${String(snapshot.stageIndex + 1)}`);
    canvas.save(); canvas.globalAlpha = clamp(alpha);
    ui.tag(canvas, label, context.width / 2, context.height / 2 - 70, snapshot.accent, "center", ui.t.type.body);
    ui.title(canvas, snapshot.stageName, context.width / 2, context.height / 2 - 22, ui.t.type.display);
    if (!bossTest) {
      canvas.globalAlpha = clamp(alpha) * ui.t.alpha.soft;
      ui.tag(canvas, snapshot.blurb, context.width / 2, context.height / 2 + 12, context.ink, "center", ui.t.type.body);
    }
    canvas.restore();
  }

  function reticle(snapshot: ReticleSnapshot): void {
    canvas.strokeStyle = "#000"; canvas.lineWidth = 1.5;
    canvas.beginPath(); canvas.arc(snapshot.x, snapshot.y, 4, 0, Math.PI * 2);
    canvas.moveTo(snapshot.x - 9, snapshot.y); canvas.lineTo(snapshot.x + 9, snapshot.y);
    canvas.moveTo(snapshot.x, snapshot.y - 9); canvas.lineTo(snapshot.x, snapshot.y + 9); canvas.stroke();
    if (snapshot.power) {
      canvas.save(); canvas.globalAlpha = 0.9;
      canvas.fillStyle = snapshot.power === "slam" ? snapshot.slamColor : snapshot.updraftColor;
      canvas.font = ui.font(22, true); canvas.textAlign = "center"; canvas.textBaseline = "middle";
      canvas.fillText(snapshot.power === "slam" ? "⇊" : "⇈", snapshot.x, snapshot.y + (snapshot.power === "slam" ? 24 : -24));
      canvas.restore();
    }
  }

  return { achievementToast, waveBanner, bossIntro, stageBanner, reticle };
}
