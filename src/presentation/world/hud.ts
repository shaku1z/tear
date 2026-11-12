import type { BossHudSnapshot, HudSnapshot, WorldRenderContext, RunHudSnapshot } from "./contracts";
import { clamp } from "./primitives";

/**
 * HUD layout. Groups anchor to the visible screen rectangle plus the device safe
 * area (not the 16:9 logical frame), so an ultrawide or 4:3 window keeps the HUD in
 * its corners and out of the arena. HUD text sits directly on the scene in the
 * per-biome ink (`ui.ink`): no plate, outline or shadow behind it.
 */
export interface HudFrame {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly centerX: number;
}

export function hudFrame(context: WorldRenderContext): HudFrame {
  const inset = context.ui.t.space.lg, screen = context.screen;
  return {
    left: screen.x + context.safe.left + inset,
    right: screen.x + screen.w - context.safe.right - inset,
    top: screen.y + context.safe.top + inset,
    centerX: context.width / 2,
  };
}

/** Vertical rhythm of the centred run group (wave, stats) and the multiplier slot below it. */
function runGroupMetrics(context: WorldRenderContext) {
  const t = context.ui.t, pad = t.metric.hudPad, top = hudFrame(context).top;
  const titleY = top + pad + Math.round(t.type.h2 * 0.8);
  const valueY = titleY + t.space.sm + t.type.body;
  const labelY = valueY + t.type.micro + t.space.xs;
  const bottom = labelY + pad;
  const multiplierY = bottom + t.space.sm + Math.round(t.type.lead * 0.8);
  const comboY = multiplierY + t.space.xs;
  return { top, titleY, valueY, labelY, bottom, multiplierY, comboY, slotBottom: comboY + t.space.sm };
}

/** Shared lower lane for the boss header and adjacent teaching cards (top of the boss plate). */
export function bossHudTop(context: WorldRenderContext): number {
  return runGroupMetrics(context).slotBottom + context.ui.t.space.sm;
}

export function createHudRenderer(context: WorldRenderContext) {
  const canvas = context.canvas;
  const ui = context.ui;

  function lowHealthVignette(pulse: number): void {
    canvas.save();
    const gradient = canvas.createRadialGradient(context.width / 2, context.height / 2, context.height * 0.34,
      context.width / 2, context.height / 2, context.height * 0.78);
    gradient.addColorStop(0, "rgba(226,59,59,0)");
    gradient.addColorStop(1, `rgba(226,59,59,${(0.10 + 0.13 * pulse).toFixed(3)})`);
    canvas.fillStyle = gradient;
    canvas.fillRect(context.screen.x, context.screen.y, context.screen.w, context.screen.h);
    canvas.restore();
  }

  function measure(text: string, size: number, bold: boolean): number {
    canvas.font = ui.font(size, bold);
    return canvas.measureText(text).width;
  }

  /** Top-left vitals: HP bar + value, dash and shield pips, abilities (capped). */
  function vitals(snapshot: HudSnapshot): void {
    const player = snapshot.player, t = ui.t, pad = t.metric.hudPad, frame = hudFrame(context);
    const lowHealth = player.hpFraction <= 0.25, pulse = clamp(player.lowHpPulse);
    const hpText = `${String(Math.ceil(player.hp))} / ${String(player.maxHp)}`;
    const barW = t.metric.hudBarW, barH = Math.max(t.metric.barH, Math.round(t.type.micro * 1.1));
    const valueW = measure(hpText, t.type.body, true);
    const maxDash = Math.max(1, player.maxDashCharges), pip = { w: 34, h: Math.max(11, Math.round(t.type.micro * 0.8)), gap: 6 };
    const abilityLines = player.abilities.length > t.metric.hudAbilityRows
      ? [`${String(player.abilities.length)} ABILITIES · PAUSE: ARSENAL`] : player.abilities;
    const lineH = t.type.micro + t.space.xs;
    const x = frame.left + pad, barY = frame.top + pad, resourceY = barY + barH + t.space.sm;
    const abilityY = resourceY + pip.h + t.space.sm + t.type.micro;
    hpBar(x, barY, barW, barH, lowHealth, pulse, snapshot);
    ui.text(canvas, hpText, x + barW + t.space.sm, barY + barH - 2, t.type.body, "left", t.alpha.full);
    if (player.oneHit) ui.tag(canvas, "ONE-HIT", x + barW + t.space.sm * 2 + valueW, barY + barH - 2, ui.readable(t.color.danger), "left", t.type.micro);
    const dashRight = pips(x, resourceY, maxDash, player.dashCharges, player.dashRechargeFraction, player.dashColor, pip);
    ui.text(canvas, "DASH", dashRight + t.space.xs, resourceY + pip.h, t.type.micro, "left", t.alpha.soft);
    const shieldX = dashRight + t.space.sm + measure("DASH", t.type.micro, false) + t.space.sm;
    for (let index = 0; index < player.maxShield; index++) shieldPip(shieldX + index * 20, resourceY, pip.h, index < player.shield, player.shieldColor);
    for (const [index, line] of abilityLines.entries()) ui.text(canvas, line, x, abilityY + index * lineH, t.type.micro, "left", t.alpha.soft);
  }

  /** HUD marks use the interface ink (`ui.ink`), the colour the per-biome theme contrasts with. */
  function hpBar(x: number, y: number, w: number, h: number, lowHealth: boolean, pulse: number, snapshot: HudSnapshot): void {
    const player = snapshot.player;
    canvas.save();
    canvas.globalAlpha = 0.22;
    canvas.fillStyle = ui.ink;
    canvas.fillRect(x, y, w, h);
    canvas.globalAlpha = 1;
    if (player.lagHpFraction > player.hpFraction) {
      canvas.fillStyle = "rgba(226,59,59,0.9)";
      canvas.fillRect(x + w * player.hpFraction, y, w * (player.lagHpFraction - player.hpFraction), h);
    }
    if (lowHealth && !context.lowGraphics) {
      canvas.shadowColor = "#e23b3b";
      canvas.shadowBlur = 10 + 10 * pulse;
    }
    canvas.fillStyle = lowHealth
      ? `rgb(${String(Math.round(150 + 95 * pulse))},${String(Math.round(34 + 22 * pulse))},${String(Math.round(40 + 18 * pulse))})`
      : ui.ink;
    canvas.globalAlpha = lowHealth ? 1 : 0.86;
    canvas.fillRect(x, y, w * player.hpFraction, h);
    canvas.shadowBlur = 0;
    canvas.globalAlpha = 1;
    canvas.fillStyle = lowHealth ? "#ff9a9a" : player.accent;
    canvas.fillRect(x, y, w * player.hpFraction, 2);
    canvas.globalAlpha = 0.35;
    canvas.strokeStyle = context.darkTheme ? "#000" : "#fff";
    canvas.lineWidth = 1;
    for (let section = 1; section < 4; section++) {
      canvas.beginPath();
      canvas.moveTo(x + w * section / 4, y);
      canvas.lineTo(x + w * section / 4, y + h);
      canvas.stroke();
    }
    canvas.globalAlpha = 1;
    canvas.strokeStyle = ui.ink;
    canvas.lineWidth = 2;
    canvas.strokeRect(x, y, w, h);
    canvas.restore();
  }

  function pips(x: number, y: number, count: number, charged: number, recharge: number, color: string,
    pip: Readonly<{ w: number; h: number; gap: number }>): number {
    for (let index = 0; index < count; index++) {
      const pipX = x + index * (pip.w + pip.gap);
      canvas.fillStyle = color;
      if (index < charged) canvas.fillRect(pipX, y, pip.w, pip.h);
      else if (index === charged) {
        canvas.globalAlpha = 0.45;
        canvas.fillRect(pipX, y, pip.w * recharge, pip.h);
        canvas.globalAlpha = 1;
      }
      canvas.strokeStyle = ui.ink;
      canvas.lineWidth = 1.5;
      canvas.strokeRect(pipX, y, pip.w, pip.h);
    }
    return x + count * (pip.w + pip.gap) - pip.gap;
  }

  function shieldPip(x: number, y: number, h: number, full: boolean, color: string): void {
    if (full) {
      canvas.fillStyle = color;
      canvas.fillRect(x, y, 16, h);
      return;
    }
    canvas.strokeStyle = color;
    canvas.lineWidth = 2;
    canvas.strokeRect(x, y, 16, h);
  }

  /** Top-centre run group: wave title and the score / time / enemies-left stats. */
  function runGroup(run: RunHudSnapshot): void {
    const t = ui.t, m = runGroupMetrics(context), cx = hudFrame(context).centerX;
    const stats: readonly (readonly [string, string])[] = [["SCORE", String(run.score)], ["TIME", run.timeLabel], ["LEFT", String(run.remaining)]];
    const column = Math.max(...stats.map(([name, value]) => Math.max(measure(name, t.type.micro, false), measure(value, t.type.body, false))))
      + t.space.xl;
    const title = run.bossWave ? "BOSS" : `WAVE ${String(run.wave)}`;
    ui.tag(canvas, title, cx, m.titleY, ui.ink, "center", t.type.h2);
    stats.forEach(([name, value], index) => {
      const x = cx + (index - 1) * column;
      ui.text(canvas, value, x, m.valueY, t.type.body, "center", t.alpha.full);
      ui.text(canvas, name, x, m.labelY, t.type.micro, "center", t.alpha.soft);
    });
  }

  /** Trick multiplier and combo meter, in the slot under the run group. */
  function multiplier(run: RunHudSnapshot): void {
    const t = ui.t, m = runGroupMetrics(context), cx = hudFrame(context).centerX;
    const label = `×${String(run.multiplier)}${run.rank ? `  ${run.rank}` : ""}`, comboW = 240;
    canvas.save();
    canvas.translate(cx, m.multiplierY);
    const pop = 1 + run.multiplierPop * 0.4;
    canvas.scale(pop, pop);
    if (!context.lowGraphics) {
      canvas.shadowColor = run.trickColor;
      canvas.shadowBlur = 10;
    }
    ui.tag(canvas, label, 0, 0, ui.readable(run.trickColor), "center", t.type.lead);
    canvas.restore();
    canvas.globalAlpha = 0.14;
    canvas.fillStyle = ui.ink;
    canvas.fillRect(cx - comboW / 2, m.comboY, comboW, 5);
    canvas.globalAlpha = 1;
    canvas.fillStyle = run.trickColor;
    canvas.fillRect(cx - comboW / 2, m.comboY, comboW * clamp(run.comboFraction), 5);
  }

  /** Boss header: name, epithet and phase over the boss bar's own dark cinematic frame; no plate. */
  function bossHeader(boss: BossHudSnapshot): void {
    const t = ui.t, pad = t.metric.hudPad, cx = hudFrame(context).centerX, width = 620;
    const top = bossHudTop(context);
    const epithet = `${boss.epithet ?? ""}${boss.phaseTag ? `   ·   ${boss.phaseTag}` : ""}`;
    const nameY = top + pad + Math.round(t.type.label * 0.8);
    const epithetY = nameY + (epithet ? t.space.xs + t.type.micro : 0);
    const barY = epithetY + t.space.sm;
    ui.tag(canvas, boss.name.toUpperCase(), cx, nameY, ui.ink, "center", t.type.label);
    const nameHalf = measure(boss.name.toUpperCase(), t.type.label, true) / 2;
    canvas.fillStyle = boss.color;
    canvas.fillRect(cx - nameHalf - t.space.sm - 8, nameY - t.type.label * 0.42, 8, 8);
    canvas.fillRect(cx + nameHalf + t.space.sm, nameY - t.type.label * 0.42, 8, 8);
    if (epithet) ui.text(canvas, epithet, cx, epithetY, t.type.micro, "center", t.alpha.soft);
    ui.bossHud(canvas, { x: cx - width / 2, y: barY, w: width, h: t.metric.bossHudH,
      frac: clamp(boss.hpFraction * (boss.introSweep ?? 1)), fill: boss.color, phaseFlash: boss.phaseFlash,
      time: context.timeSeconds, lowGraphics: context.lowGraphics,
      // The canonical UI reads phase marks but types its option as mutable. Preserve
      // the immutable snapshot contract without allocating a defensive array per frame.
      ...(boss.phaseMarks ? { phaseMarks: boss.phaseMarks as number[] } : {}),
      ...(boss.guard !== undefined ? { guard: boss.guard } : {}) });
  }

  return function hud(snapshot: HudSnapshot): void {
    const run = snapshot.run;
    if (snapshot.player.hpFraction <= 0.25) lowHealthVignette(clamp(snapshot.player.lowHpPulse));
    vitals(snapshot);
    if (run.mode !== "tutorial" && run.mode !== "playground") runGroup(run);
    if (run.multiplier > 1) multiplier(run);
    if (snapshot.boss) bossHeader(snapshot.boss);
    canvas.textAlign = "left";
  };
}
