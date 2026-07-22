import type { BossPresentationActor, Point, WeaponActor, WeaponPose } from "../../../gameplay/entities/enemy-contracts";
import type { CrownRenderPose, EnemyPresentationDependencies, RenderInstance } from "./enemy-renderer-types";

export function createEnemyRendererRuntime(dependencies: EnemyPresentationDependencies) {
  const { A11Y, CLOCK, CONFIG, GFX, THEME, UI, clamp, len, lerp } = dependencies;
  const CHIMERA_MOVE_COLOR: Record<string, keyof typeof CONFIG.colors> = {
    charger: "charger", brawler: "charger", stalker: "charger",
    ranged: "ranged", flyer: "flyer", bomber: "bomber", armored: "armored",
  };

    function chargeTelegraph(ctx: CanvasRenderingContext2D, x: number, cy: number, hh: number, dir: number, k: number, color: string) {
      const W = CONFIG.view.w;
      const x0 = dir > 0 ? x : 0, x1 = dir > 0 ? W : x, ww = x1 - x0;
      ctx.save();
      // lane fill
      ctx.fillStyle = color; ctx.globalAlpha = 0.10 + 0.18 * k;
      ctx.fillRect(x0, cy - hh, ww, hh * 2);
      // bright pulsing rails top + bottom
      ctx.globalAlpha = 0.45 + 0.45 * k;
      ctx.fillRect(x0, cy - hh - 1, ww, 3); ctx.fillRect(x0, cy + hh - 2, ww, 3);
      // chevrons marching the way it'll go
      ctx.globalAlpha = 0.5 + 0.4 * k;
      const march = (CLOCK.sim * 1000 / 90 * dir) % 46;
      for (let ax = x0 - 46 + march; ax < x1; ax += 46) {
        const px = dir > 0 ? ax : ax;
        ctx.beginPath(); ctx.moveTo(px, cy - 9); ctx.lineTo(px + dir * 13, cy); ctx.lineTo(px, cy + 9); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    function drawBossTransformationWorldCanvas(ctx: CanvasRenderingContext2D, boss: RenderInstance<"Enemy">) {
      if (!boss.cinematicPose) return;
      const p = clamp(boss.cinematicT || 0, 0, 1), reduced = A11Y.reducedMotion;
      const pulse = reduced ? 0.62 : 0.5 + 0.5 * Math.sin(CLOCK.sim * 18);
      const col = boss.cinematicColor || (boss.cinematicRequest?.color ?? boss.color);
      ctx.save(); ctx.strokeStyle = telegraphInk(col); ctx.fillStyle = col; ctx.lineCap = "round";
      if (boss.cinematicPose === "wardenRule" || boss.cinematicPose === "wardenBreak") {
        ctx.globalAlpha = 0.20 + pulse * 0.18; ctx.lineWidth = 5;
        for (let i = -2; i <= 2; i++) { const x = boss.x + i * 42; ctx.beginPath(); ctx.moveTo(x, boss.y - boss.hh - 90); ctx.lineTo(x + (boss.cinematicPose === "wardenBreak" ? i * 7 * p : 0), boss.y + boss.hh + 35); ctx.stroke(); }
        ctx.globalAlpha = 0.82; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(boss.x - boss.facing * 42, boss.y + 8);
        ctx.lineTo(boss.x + boss.facing * (150 + p * 52), boss.y - 44); ctx.stroke();
        weaponGlint(ctx, boss.x + boss.facing * (150 + p * 52), boss.y - 44, col, pulse);
      } else if (boss.cinematicPose === "colossusContainment" || boss.cinematicPose === "colossusCore") {
        ctx.translate(boss.x, boss.y); ctx.lineWidth = 4;
        for (let i = 0; i < 4; i++) {
          if (i < Math.floor(p * 4) && boss.cinematicPose === "colossusCore") continue;
          const r = boss.hw + 22 + i * 19; ctx.globalAlpha = 0.22 + i * 0.09;
          ctx.strokeRect(-r, -r * 0.78, r * 2, r * 1.56);
        }
        ctx.globalAlpha = 0.45 + pulse * 0.35; ctx.fillStyle = boss.cinematicPose === "colossusCore" ? CONFIG.colors.slam : CONFIG.colors.armoredShield;
        ctx.beginPath(); ctx.arc(0, -4, 15 + pulse * 8, 0, Math.PI * 2); ctx.fill();
      } else if (boss.cinematicPose === "aldricCrownfall" || boss.cinematicPose === "aldricFeral") {
        ctx.globalAlpha = 0.28 + pulse * 0.22; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(boss.x, boss.y - 16, boss.hw + 22 + p * 28, -Math.PI * 0.9, Math.PI * 0.1); ctx.stroke();
        if (boss.cinematicPose === "aldricFeral") weaponGlint(ctx, boss.x + boss.facing * 112, boss.y - 78, CONFIG.colors.bomber, pulse);
      } else if (boss.cinematicPose === "echoMirror") {
        const mx = CONFIG.view.w - boss.x; ctx.globalAlpha = 0.34 + pulse * 0.22; ctx.lineWidth = 3; ctx.setLineDash([12, 9]);
        ctx.beginPath(); ctx.moveTo(CONFIG.view.w / 2, 35); ctx.lineTo(CONFIG.view.w / 2, CONFIG.world.groundY); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.22 + p * 0.25; ctx.strokeRect(mx - boss.hw, boss.y - boss.hh, boss.hw * 2, boss.hh * 2);
        ctx.beginPath(); ctx.moveTo(boss.x, boss.y); ctx.lineTo(mx, boss.y); ctx.stroke();
      } else if (boss.cinematicPose === "sourceTrue") {
        ctx.translate(boss.x, boss.y); ctx.globalAlpha = 0.24 + pulse * 0.22; ctx.lineWidth = 4;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(0, 0, boss.hw * (1.2 + i * 0.5 + p * 0.25), boss.hh * (0.7 + i * 0.22), i * 0.25 + CLOCK.sim * (i % 2 ? -0.4 : 0.4), 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.restore();
    }

    function drawBossTransformationWorld(context: unknown, boss: BossPresentationActor): void {
      drawBossTransformationWorldCanvas(
        context as CanvasRenderingContext2D,
        boss as RenderInstance<"Enemy">,
      );
    }

    function telegraphInk(color: string) {
      if (!A11Y.highContrast) return color;
      return (THEME.dark) ? "#fff36b" : "#4b00d1";
    }

    function dangerLane(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dir: number, color: string, k: number) {
      ctx.save();
      const high = A11Y.highContrast; color = telegraphInk(color);
      const sx = dir >= 0 ? x : x - w;
      ctx.fillStyle = color; ctx.globalAlpha = (high ? 0.14 : 0.07) + (high ? 0.18 : 0.13) * k; ctx.fillRect(sx, y, w, h);
      ctx.strokeStyle = color; ctx.lineWidth = (high ? 4 : 2) + 2 * k; ctx.globalAlpha = 0.45 + 0.45 * k;
      ctx.setLineDash([12, 9]); ctx.strokeRect(sx, y, w, h); ctx.setLineDash([]);
      if (high) {
        ctx.globalAlpha = 0.72; ctx.lineWidth = 3;
        for (let px = sx + 24; px < sx + w; px += 44) { ctx.beginPath(); ctx.moveTo(px - dir * 12, y + h * 0.25); ctx.lineTo(px + dir * 9, y + h * 0.5); ctx.lineTo(px - dir * 12, y + h * 0.75); ctx.stroke(); }
      }
      ctx.restore();
    }

    function weaponGlint(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, k: number) {
      const r = 5 + 13 * clamp(k, 0, 1);
      ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.globalAlpha = 0.45 + 0.55 * k;
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
      ctx.rotate(Math.PI / 4); ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.moveTo(-r * 0.55, 0); ctx.lineTo(r * 0.55, 0); ctx.moveTo(0, -r * 0.55); ctx.lineTo(0, r * 0.55); ctx.stroke();
      ctx.restore();
    }

    function dangerColumn(ctx: CanvasRenderingContext2D, x: number, w: number, yTop: number, yGround: number, color: string, k: number) {
      ctx.save();
      const high = A11Y.highContrast; color = telegraphInk(color);
      ctx.fillStyle = color; ctx.globalAlpha = (high ? 0.15 : 0.08) + 0.10 * k;
      ctx.fillRect(x - w / 2, yTop, w, yGround - yTop);
      const pr = (CLOCK.sim / 0.5) % 1;
      ctx.globalAlpha = (0.5 + 0.4 * k) * (1 - pr);
      ctx.strokeStyle = color; ctx.lineWidth = high ? 5 : 3;
      ctx.beginPath(); ctx.ellipse(x, yGround, (w * 0.55) * (0.4 + pr * 0.6), 9, 0, 0, Math.PI * 2); ctx.stroke();
      if (high) { ctx.globalAlpha = 0.8; ctx.setLineDash([9, 7]); ctx.strokeRect(x - w / 2, yTop, w, yGround - yTop); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x - 14, yGround - 25); ctx.lineTo(x, yGround - 8); ctx.lineTo(x + 14, yGround - 25); ctx.stroke(); }
      ctx.restore();
    }

    function dangerReticle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, color: string) {
      ctx.save();
      const high = A11Y.highContrast; color = telegraphInk(color);
      ctx.strokeStyle = color; ctx.lineWidth = high ? 4.5 : 2.5; ctx.globalAlpha = 0.5 + 0.5 * k;
      const rot = CLOCK.sim / 0.4, rr = r * (1.4 - 0.4 * k);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(x, y, rr, rot + i * Math.PI / 2, rot + i * Math.PI / 2 + 0.7); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke();
      if (high) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.strokeRect(-9, -9, 18, 18); ctx.restore(); }
      ctx.restore();
    }

    function drawPeril(ctx: CanvasRenderingContext2D, boss: RenderInstance<"Enemy">) {
      const left = (boss._perilUntil || 0) - CLOCK.sim;
      if (left <= 0) return;
      const k = left / 0.6, s = 13 + (1 - k) * 8, high = A11Y.highContrast;
      ctx.save();
      ctx.translate(boss.x, boss.y - boss.hh - 34); ctx.rotate(Math.PI / 4);
      ctx.globalAlpha = 0.85 * k; ctx.fillStyle = high ? "#fff36b" : "#e23b3b";
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.globalAlpha = k; ctx.strokeStyle = high ? "#000" : "#fff"; ctx.lineWidth = high ? 4 : 2;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }

    function traceWeaponPolygon(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
      if (!points.length) return;
      const first = points[0]; if (!first) return;
      ctx.beginPath(); ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) { const point = points[i]; if (point) ctx.lineTo(point.x, point.y); }
      ctx.closePath();
    }

    function drawWardstaff(ctx: CanvasRenderingContext2D, pose: WeaponPose, actor: WeaponActor, dim: boolean) {
      const ph = actor.phase ?? 1, low = GFX.low;
      const steel = dim ? "#555" : "#303842", control = ph === 1 ? "#bfeef2" : (ph === 2 ? "#d7a83e" : "#d94b56");
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (!low && !dim && ph >= 3) { ctx.strokeStyle = CONFIG.colors.charger; ctx.globalAlpha = 0.28; ctx.lineWidth = 20;
        ctx.beginPath(); ctx.moveTo(pose.shaftA.x, pose.shaftA.y); ctx.lineTo(pose.tip.x, pose.tip.y); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = steel; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(pose.shaftA.x, pose.shaftA.y); ctx.lineTo(pose.shaftB.x, pose.shaftB.y); ctx.stroke();
      ctx.strokeStyle = dim ? "#777" : control; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pose.shaftA.x, pose.shaftA.y); ctx.lineTo(pose.shaftB.x, pose.shaftB.y); ctx.stroke();
      traceWeaponPolygon(ctx, pose.headPolygon); ctx.fillStyle = dim ? "#555" : (ph === 1 ? "#657482" : ph === 2 ? "#b88a2f" : "#51232a"); ctx.fill();
      ctx.strokeStyle = control; ctx.lineWidth = 4; ctx.stroke();
      const counterweight = pose.counterweight ?? pose.shaftA;
      ctx.fillStyle = steel; ctx.beginPath(); ctx.arc(counterweight.x, counterweight.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = control; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = control; ctx.lineWidth = ph >= 2 ? 5 : 3; ctx.beginPath(); ctx.arc(pose.guardRing.x, pose.guardRing.y, ph >= 2 ? 12 : 9, 0, Math.PI * 2); ctx.stroke();
      // Two separated hands make the staff's leverage readable in every pose.
      for (const hand of [pose.gripA, pose.gripB]) { ctx.fillStyle = dim ? "#555" : actor.color; ctx.beginPath(); ctx.arc(hand.x, hand.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.stroke(); }
      if (ph >= 3 && !dim) {   // failing custody bands and crimson stress fractures
        ctx.strokeStyle = "#ff9a8d"; ctx.lineWidth = 2;
        for (const t of [0.36, 0.58, 0.78]) { const x = lerp(pose.shaftA.x, pose.shaftB.x, t), y = lerp(pose.shaftA.y, pose.shaftB.y, t);
          ctx.beginPath(); ctx.moveTo(x - 5, y - 6); ctx.lineTo(x + 5, y + 6); ctx.stroke(); }
      }
      ctx.restore();
    }

    function drawGreatCleaver(ctx: CanvasRenderingContext2D, pose: WeaponPose, actor: WeaponActor, downed: boolean) {
      const low = GFX.low, angry = !!actor.anger, witnessed = !!actor.witnessEarned;
      const steel = downed ? "#2c292b" : (witnessed ? "#434951" : "#292b30");
      const gold = witnessed ? "#9c8a59" : "#b58a32", heat = angry ? "#fff0b0" : (actor.mode === "duel" ? "#842535" : "#ed4b32");
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (!low && !downed && actor.mode !== "duel") { ctx.strokeStyle = heat; ctx.globalAlpha = 0.24; ctx.lineWidth = 22;
        ctx.beginPath(); ctx.moveTo(pose.guardRing.x, pose.guardRing.y); ctx.lineTo(pose.tip.x, pose.tip.y); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = "#211f22"; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(pose.shaftA.x, pose.shaftA.y); ctx.lineTo(pose.shaftB.x, pose.shaftB.y); ctx.stroke();
      ctx.strokeStyle = gold; ctx.lineWidth = 4; ctx.stroke();
      traceWeaponPolygon(ctx, pose.headPolygon); ctx.fillStyle = steel; ctx.fill(); ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = heat; ctx.lineWidth = angry ? 5 : 3; ctx.beginPath();
      ctx.moveTo(pose.cuttingEdge.a.x, pose.cuttingEdge.a.y); ctx.lineTo(pose.cuttingEdge.b.x, pose.cuttingEdge.b.y); ctx.stroke();
      // Internal heat and the broken-crown notch remain readable without bloom.
      ctx.globalAlpha = downed ? 0.35 : 0.8; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pose.guardRing.x, pose.guardRing.y); ctx.lineTo(pose.tip.x, pose.tip.y); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = gold; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(pose.guardRing.x, pose.guardRing.y, 11, 0, Math.PI * 2); ctx.stroke();
      if (!downed) for (const hand of [pose.gripA, pose.gripB]) { ctx.fillStyle = actor.color; ctx.beginPath(); ctx.arc(hand.x, hand.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.stroke(); }
      if (angry && !downed) { ctx.strokeStyle = "#ff6a42"; ctx.lineWidth = 2;
        for (let i = 1; i < pose.headPolygon.length - 1; i += 2) { const p = pose.headPolygon[i]; if (!p) continue; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(lerp(p.x, pose.guardRing.x, 0.3), lerp(p.y, pose.guardRing.y, 0.3)); ctx.stroke(); } }
      ctx.restore();
    }

    function drawAldricCrown(ctx: CanvasRenderingContext2D, pose: CrownRenderPose | null, heat: number) {
      if (!pose) return;
      const hot = clamp(heat || 0, 0, 1), ink = typeof THEME !== "undefined" ? THEME.ink : "#17131c";
      ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.rot || 0);
      ctx.fillStyle = hot > 0.72 ? "#fff0a8" : "#caa85c"; ctx.strokeStyle = ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-17, 9); ctx.lineTo(-14, -9); ctx.lineTo(-5, 1); ctx.lineTo(0, -14);
      ctx.lineTo(6, 1); ctx.lineTo(15, -9); ctx.lineTo(18, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hot > 0.45 ? CONFIG.colors.bomber : "#74202b";
      for (const x of [-11, 0, 11]) { ctx.beginPath(); ctx.arc(x, 5, 2.8, 0, Math.PI * 2); ctx.fill(); }
      // The same broken seam grows while worn and remains on the airborne/fallen prop.
      ctx.globalAlpha = 0.55 + hot * 0.4; ctx.strokeStyle = hot > 0.65 ? "#fff" : CONFIG.colors.bomber; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-3, -10); ctx.lineTo(2, -3); ctx.lineTo(-1, 3); ctx.lineTo(5, 8); ctx.stroke();
      ctx.restore();
    }

  return Object.freeze({ A11Y, CLOCK, CONFIG, GFX, THEME, UI, clamp, len, lerp, CHIMERA_MOVE_COLOR, chargeTelegraph, dangerColumn, dangerLane, dangerReticle, drawAldricCrown, drawBossTransformationWorld, drawGreatCleaver, drawPeril, drawWardstaff, telegraphInk, traceWeaponPolygon, weaponGlint });
}

export type EnemyRendererRuntime = ReturnType<typeof createEnemyRendererRuntime>;
