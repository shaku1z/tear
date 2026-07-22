import type { HudSnapshot, LegacyWorldRenderContext } from "./contracts";
import { clamp } from "./primitives";

export function createHudRenderer(context: LegacyWorldRenderContext) {
  const canvas = context.canvas;
  const ui = context.ui;

  return function hud(snapshot: HudSnapshot): void {
    const player = snapshot.player;
    const run = snapshot.run;
    const type = ui.t.type;
    const lowHealth = player.hpFraction <= 0.25;
    const pulse = clamp(player.lowHpPulse);
    if (lowHealth) {
      canvas.save();
      const gradient = canvas.createRadialGradient(context.width / 2, context.height / 2, context.height * 0.34,
        context.width / 2, context.height / 2, context.height * 0.78);
      gradient.addColorStop(0, "rgba(226,59,59,0)");
      gradient.addColorStop(1, `rgba(226,59,59,${(0.10 + 0.13 * pulse).toFixed(3)})`);
      canvas.fillStyle = gradient;
      canvas.fillRect(context.screen.x, context.screen.y, context.screen.w, context.screen.h);
      canvas.restore();
    }

    const x = 28 + context.safe.left, y = 26 + context.safe.top, barWidth = 320, barHeight = 22;
    const resourceY = y + barHeight + 12, dashWidth = 34, dashHeight = 11, dashGap = 6;
    const maxDash = Math.max(1, player.maxDashCharges);
    const healthFill = lowHealth
      ? `rgb(${String(Math.round(150 + 95 * pulse))},${String(Math.round(34 + 22 * pulse))},${String(Math.round(40 + 18 * pulse))})`
      : "#262c37";
    canvas.save();
    canvas.globalAlpha = 0.22; canvas.fillStyle = context.ink; canvas.fillRect(x, y, barWidth, barHeight); canvas.globalAlpha = 1;
    if (player.lagHpFraction > player.hpFraction) {
      canvas.fillStyle = "rgba(226,59,59,0.9)";
      canvas.fillRect(x + barWidth * player.hpFraction, y, barWidth * (player.lagHpFraction - player.hpFraction), barHeight);
    }
    if (lowHealth && !context.lowGraphics) { canvas.shadowColor = "#e23b3b"; canvas.shadowBlur = 10 + 10 * pulse; }
    canvas.fillStyle = healthFill; canvas.fillRect(x, y, barWidth * player.hpFraction, barHeight); canvas.shadowBlur = 0;
    canvas.globalAlpha = 0.85; canvas.fillStyle = lowHealth ? "#ff9a9a" : player.accent;
    canvas.fillRect(x, y, barWidth * player.hpFraction, 2);
    canvas.globalAlpha = 0.35; canvas.strokeStyle = context.darkTheme ? "#000" : "#fff"; canvas.lineWidth = 1;
    for (let section = 1; section < 4; section++) {
      const sectionX = x + barWidth * section / 4;
      canvas.beginPath(); canvas.moveTo(sectionX, y); canvas.lineTo(sectionX, y + barHeight); canvas.stroke();
    }
    canvas.globalAlpha = 1; canvas.strokeStyle = context.ink; canvas.lineWidth = 2; canvas.strokeRect(x, y, barWidth, barHeight);
    canvas.font = ui.font(type.label, true); canvas.textAlign = "right"; canvas.fillStyle = "#fff";
    canvas.shadowColor = "rgba(0,0,0,0.65)"; canvas.shadowBlur = 3;
    canvas.fillText(`${String(Math.ceil(player.hp))} / ${String(player.maxHp)}`, x + barWidth - 8, y + barHeight - 5);
    canvas.shadowBlur = 0;
    canvas.restore();
    if (player.oneHit) ui.tag(canvas, "ONE-HIT", x + barWidth + 12, y + 6, "#e23b3b", "left", type.micro);

    for (let index = 0; index < maxDash; index++) {
      const dashX = x + index * (dashWidth + dashGap);
      if (index < player.dashCharges) { canvas.fillStyle = player.dashColor; canvas.fillRect(dashX, resourceY, dashWidth, dashHeight); }
      else if (index === player.dashCharges) {
        canvas.fillStyle = player.dashColor; canvas.globalAlpha = 0.45;
        canvas.fillRect(dashX, resourceY, dashWidth * player.dashRechargeFraction, dashHeight); canvas.globalAlpha = 1;
      }
      canvas.strokeStyle = context.ink; canvas.lineWidth = 1.5; canvas.strokeRect(dashX, resourceY, dashWidth, dashHeight);
    }
    ui.text(canvas, "DASH", x + maxDash * (dashWidth + dashGap) + 6, resourceY + dashHeight - 1, type.micro, "left", ui.t.alpha.soft);
    const shieldX = x + maxDash * (dashWidth + dashGap) + 62;
    for (let index = 0; index < player.maxShield; index++) {
      const itemX = shieldX + index * 20;
      if (index < player.shield) { canvas.fillStyle = player.shieldColor; canvas.fillRect(itemX, resourceY, 16, dashHeight); }
      else { canvas.strokeStyle = player.shieldColor; canvas.lineWidth = 2; canvas.strokeRect(itemX, resourceY, 16, dashHeight); }
    }
    canvas.strokeStyle = context.ink; canvas.fillStyle = context.ink;
    let abilityY = resourceY + 36;
    for (const ability of player.abilities) {
      ui.text(canvas, ability, x, abilityY, type.micro, "left", ui.t.alpha.soft);
      abilityY += 15;
    }

    if (run.mode !== "tutorial" && run.mode !== "playground") {
      ui.title(canvas, run.bossWave ? "BOSS" : `WAVE ${String(run.wave)}`, context.width / 2, 42, type.h2);
      stat("SCORE", String(run.score), context.width / 2 - 150);
      stat("TIME", run.timeLabel, context.width / 2);
      stat("LEFT", String(run.remaining), context.width / 2 + 150);
    }
    if (run.multiplier > 1) {
      canvas.save(); canvas.translate(context.width / 2, 106);
      const scale = 1 + run.multiplierPop * 0.4; canvas.scale(scale, scale);
      if (!context.lowGraphics) { canvas.shadowColor = run.trickColor; canvas.shadowBlur = 10; }
      ui.tag(canvas, `×${String(run.multiplier)}${run.rank ? `  ${run.rank}` : ""}`, 0, 0, run.trickColor, "center", type.lead);
      canvas.restore();
      const comboWidth = 240, comboX = context.width / 2 - comboWidth / 2;
      canvas.globalAlpha = 0.14; canvas.fillStyle = context.ink; canvas.fillRect(comboX, 114, comboWidth, 5); canvas.globalAlpha = 1;
      canvas.fillStyle = run.trickColor; canvas.fillRect(comboX, 114, comboWidth * clamp(run.comboFraction), 5);
    }
    canvas.textAlign = "left";

    if (snapshot.boss) {
      const boss = snapshot.boss;
      const width = 620, bossX = (context.width - width) / 2, bossY = 138;
      const fraction = clamp(boss.hpFraction * (boss.introSweep ?? 1));
      ui.bossHud(canvas, { x: bossX, y: bossY, w: width, h: ui.t.metric.bossHudH, frac: fraction,
        fill: boss.color, phaseFlash: boss.phaseFlash, time: context.timeSeconds, lowGraphics: context.lowGraphics,
        // The canonical UI reads phase marks but types its option as mutable. Preserve
        // the immutable snapshot contract without allocating a defensive array per frame.
        ...(boss.phaseMarks ? { phaseMarks: boss.phaseMarks as number[] } : {}),
        ...(boss.guard !== undefined ? { guard: boss.guard } : {}) });
      ui.tag(canvas, boss.name.toUpperCase(), context.width / 2, bossY - 6, boss.color, "center", type.caption);
      if (boss.epithet || boss.phaseTag) {
        ui.tag(canvas, `${boss.epithet ?? ""}${boss.phaseTag ? `   ·   ${boss.phaseTag}` : ""}`,
          context.width / 2, bossY - 24, ui.t.color.muted, "center", type.micro);
      }
    }
  };

  function stat(label: string, value: string, centerX: number): void {
    ui.text(canvas, value, centerX, 66, ui.t.type.label, "center");
    ui.text(canvas, label, centerX, 80, ui.t.type.micro, "center", ui.t.alpha.faint);
  }
}
