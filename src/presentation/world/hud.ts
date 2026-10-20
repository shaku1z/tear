import type { HudSnapshot, LegacyWorldRenderContext } from "./contracts";
import { clamp } from "./primitives";

/** Shared lower lane for boss UI and adjacent teaching cards. */
export function bossHudTop(context: LegacyWorldRenderContext, protectTextContrast: boolean | undefined, multiplier: number): number {
  const scale = context.cssPerLogicalPixel ?? 1;
  const compact = protectTextContrast === true && Number.isFinite(scale) && scale > 0 && scale < 0.75;
  const micro = compact ? Math.max(context.ui.t.type.micro, context.ui.t.type.micro / scale) : context.ui.t.type.micro;
  return (compact ? 205 + micro * 1.5 : protectTextContrast && multiplier > 1 ? 143 + micro * 1.5 : 138)
    + (compact ? context.safe.top : 0);
}

export function createHudRenderer(context: LegacyWorldRenderContext) {
  const canvas = context.canvas;
  const ui = context.ui;

  return function hud(snapshot: HudSnapshot): void {
    const player = snapshot.player;
    const run = snapshot.run;
    const type = ui.t.type;
    const cssScale = context.cssPerLogicalPixel ?? 1;
    const compact = snapshot.protectTextContrast === true && Number.isFinite(cssScale) && cssScale > 0 && cssScale < 0.75;
    const micro = compact ? Math.max(type.micro, type.micro / cssScale) : type.micro;
    const label = compact ? Math.max(type.label, type.label / cssScale) : type.label;
    const top = compact ? context.safe.top : 0;
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

    const x = 28 + context.safe.left, y = 26 + context.safe.top, barWidth = 320, barHeight = compact ? label + 12 : 22;
    const resourceY = y + barHeight + (compact ? micro : 12), dashWidth = 34, dashHeight = 11, dashGap = 6;
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
    canvas.font = ui.font(label, true); canvas.textAlign = "right"; canvas.fillStyle = "#fff";
    canvas.shadowColor = "rgba(0,0,0,0.65)"; canvas.shadowBlur = 3;
    canvas.fillText(`${String(Math.ceil(player.hp))} / ${String(player.maxHp)}`, x + barWidth - 8, y + barHeight - 5);
    canvas.shadowBlur = 0;
    canvas.restore();
    if (player.oneHit) ui.tag(canvas, "ONE-HIT", x + barWidth + 12, y + (compact ? micro : 6), "#e23b3b", "left", micro, snapshot.protectTextContrast);

    for (let index = 0; index < maxDash; index++) {
      const dashX = x + index * (dashWidth + dashGap);
      if (index < player.dashCharges) { canvas.fillStyle = player.dashColor; canvas.fillRect(dashX, resourceY, dashWidth, dashHeight); }
      else if (index === player.dashCharges) {
        canvas.fillStyle = player.dashColor; canvas.globalAlpha = 0.45;
        canvas.fillRect(dashX, resourceY, dashWidth * player.dashRechargeFraction, dashHeight); canvas.globalAlpha = 1;
      }
      canvas.strokeStyle = context.ink; canvas.lineWidth = 1.5; canvas.strokeRect(dashX, resourceY, dashWidth, dashHeight);
    }
    ui.text(canvas, "DASH", x + maxDash * (dashWidth + dashGap) + 6, resourceY + dashHeight - 1, micro, "left", ui.t.alpha.soft, snapshot.protectTextContrast);
    const shieldX = x + maxDash * (dashWidth + dashGap) + (compact ? micro * 3 + 20 : 62);
    for (let index = 0; index < player.maxShield; index++) {
      const itemX = shieldX + index * 20;
      if (index < player.shield) { canvas.fillStyle = player.shieldColor; canvas.fillRect(itemX, resourceY, 16, dashHeight); }
      else { canvas.strokeStyle = player.shieldColor; canvas.lineWidth = 2; canvas.strokeRect(itemX, resourceY, 16, dashHeight); }
    }
    canvas.strokeStyle = context.ink; canvas.fillStyle = context.ink;
    let abilityY = resourceY + 36;
    if (compact && player.abilities.length > 0) {
      ui.text(canvas, `${String(player.abilities.length)} ABILITIES`, x, abilityY, micro, "left", ui.t.alpha.soft, snapshot.protectTextContrast);
      ui.text(canvas, "PAUSE: ARSENAL", x, abilityY + micro + 8, micro, "left", ui.t.alpha.soft, snapshot.protectTextContrast);
    }
    for (const ability of compact ? [] : player.abilities) {
      ui.text(canvas, ability, x, abilityY, type.micro, "left", ui.t.alpha.soft, snapshot.protectTextContrast);
      abilityY += 15;
    }

    if (run.mode !== "tutorial" && run.mode !== "playground") {
      ui.title(canvas, run.bossWave ? "BOSS" : `WAVE ${String(run.wave)}`, context.width / 2, 42 + top, type.h2);
      stat("SCORE", String(run.score), context.width / 2 - (compact ? 210 : 150), snapshot.protectTextContrast, compact, label, micro, top);
      stat("TIME", run.timeLabel, context.width / 2, snapshot.protectTextContrast, compact, label, micro, top);
      stat("LEFT", String(run.remaining), context.width / 2 + (compact ? 210 : 150), snapshot.protectTextContrast, compact, label, micro, top);
    }
    if (run.multiplier > 1) {
      canvas.save(); canvas.translate(context.width / 2, (compact ? 150 : 106) + top);
      const scale = 1 + run.multiplierPop * 0.4; canvas.scale(scale, scale);
      if (!context.lowGraphics) { canvas.shadowColor = run.trickColor; canvas.shadowBlur = 10; }
      ui.tag(canvas, `×${String(run.multiplier)}${run.rank ? `  ${run.rank}` : ""}`, 0, 0, run.trickColor, "center", compact ? label : type.lead, snapshot.protectTextContrast);
      canvas.restore();
      const comboWidth = 240, comboX = context.width / 2 - comboWidth / 2;
      const comboY = (compact ? 158 : 114) + top;
      canvas.globalAlpha = 0.14; canvas.fillStyle = context.ink; canvas.fillRect(comboX, comboY, comboWidth, 5); canvas.globalAlpha = 1;
      canvas.fillStyle = run.trickColor; canvas.fillRect(comboX, comboY, comboWidth * clamp(run.comboFraction), 5);
    }
    canvas.textAlign = "left";

    if (snapshot.boss) {
      const boss = snapshot.boss;
      // Leave half a text line below the combo meter before the epithet's ascent.
      const width = 620, bossX = (context.width - width) / 2, bossY = bossHudTop(context, snapshot.protectTextContrast, run.multiplier);
      const fraction = clamp(boss.hpFraction * (boss.introSweep ?? 1));
      ui.bossHud(canvas, { x: bossX, y: bossY, w: width, h: ui.t.metric.bossHudH, frac: fraction,
        fill: boss.color, phaseFlash: boss.phaseFlash, time: context.timeSeconds, lowGraphics: context.lowGraphics,
        // The canonical UI reads phase marks but types its option as mutable. Preserve
        // the immutable snapshot contract without allocating a defensive array per frame.
        ...(boss.phaseMarks ? { phaseMarks: boss.phaseMarks as number[] } : {}),
        ...(boss.guard !== undefined ? { guard: boss.guard } : {}) });
      ui.tag(canvas, boss.name.toUpperCase(), context.width / 2, bossY - (compact ? 10 : 6), boss.color, "center", compact ? micro : type.caption, snapshot.protectTextContrast);
      if (boss.epithet || boss.phaseTag) {
        ui.tag(canvas, `${boss.epithet ?? ""}${boss.phaseTag ? `   ·   ${boss.phaseTag}` : ""}`,
          context.width / 2, bossY - (compact ? 42 : 24), snapshot.protectTextContrast ? context.ink : ui.t.color.muted,
          "center", micro, snapshot.protectTextContrast);
      }
    }
  };

  function stat(name: string, value: string, centerX: number, protectContrast: boolean | undefined,
    compact: boolean, label: number, micro: number, top: number): void {
    ui.text(canvas, value, centerX, (compact ? 78 : 66) + top, label, "center", undefined, protectContrast);
    ui.text(canvas, name, centerX, (compact ? 106 : 80) + top, micro, "center", ui.t.alpha.faint, protectContrast);
  }
}
