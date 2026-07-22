import type { CONFIG as GAME_CONFIG } from "../../config/game-config";
import type {
  BladePlayerPort,
  BladePresentationPort,
  BladeRenderSnapshot,
} from "../../gameplay/entities/blade";
import { isCanvasSurface } from "./canvas-surface";

type GameConfig = typeof GAME_CONFIG;

export interface BladeRendererDependencies {
  readonly clock: { readonly sim: number };
  readonly config: GameConfig;
  readonly graphics: { readonly low: boolean };
  readonly theme: { readonly dark: boolean; readonly ink: string; readonly rim: string };
  readonly clamp: (value: number, min: number, max: number) => number;
  readonly len: (x: number, y: number) => number;
  readonly lerp: (from: number, to: number, amount: number) => number;
}

export function createBladeRenderer({
  clock, config, graphics, theme, clamp, len, lerp,
}: BladeRendererDependencies): BladePresentationPort {
  function drawBody(context: CanvasRenderingContext2D, blade: BladeRenderSnapshot): void {
    const scale = blade.state === "held" ? 1 : blade.throwSizeMult;
    if (!graphics.low) { context.shadowColor = theme.rim; context.shadowBlur = 6; }
    context.strokeStyle = theme.ink;
    context.fillStyle = theme.ink;
    context.lineCap = "round";

    if (blade.model === "hammer") {
      context.lineWidth = 7 * scale;
      context.beginPath(); context.moveTo(blade.x, blade.y); context.lineTo(blade.tipX, blade.tipY); context.stroke();
      context.shadowBlur = 0;
      context.save(); context.translate(blade.tipX, blade.tipY); context.rotate(blade.angle);
      const headLength = 22 * scale;
      const headHeight = 16 * scale;
      context.fillRect(-headLength * 0.35, -headHeight, headLength, headHeight * 2);
      context.strokeStyle = theme.dark ? "rgba(10,12,20,0.9)" : "#fff"; context.lineWidth = 2;
      context.strokeRect(-headLength * 0.35, -headHeight, headLength, headHeight * 2);
      context.restore(); return;
    }

    if (blade.model === "spear") {
      context.lineWidth = 5 * scale;
      context.beginPath(); context.moveTo(blade.x, blade.y); context.lineTo(blade.tipX, blade.tipY); context.stroke();
      context.save(); context.translate(blade.tipX, blade.tipY); context.rotate(blade.angle);
      context.beginPath(); context.moveTo(8 * scale, 0); context.lineTo(-13 * scale, -9 * scale); context.lineTo(-9 * scale, 0); context.lineTo(-13 * scale, 9 * scale); context.closePath(); context.fill();
      context.restore(); return;
    }

    if (blade.model === "chainblade") {
      const hand = blade.lastHand() ?? { x: blade.x, y: blade.y };
      context.lineWidth = 3; context.strokeStyle = blade.tension > 0.7 ? config.colors.perfect : theme.ink;
      context.beginPath(); context.moveTo(hand.x, hand.y);
      const segments = 7;
      for (let index = 1; index <= segments; index++) {
        const amount = index / segments;
        const sag = Math.sin(amount * Math.PI) * (1 - blade.tension) * 28;
        context.lineTo(lerp(hand.x, blade.tipX, amount), lerp(hand.y, blade.tipY, amount) + sag);
      }
      context.stroke();
      context.save(); context.translate(blade.tipX, blade.tipY); context.rotate(blade.angle);
      context.beginPath(); context.moveTo(13 * scale, 0); context.lineTo(-7 * scale, -11 * scale); context.lineTo(-3 * scale, 0); context.lineTo(-7 * scale, 11 * scale); context.closePath(); context.fill();
      context.restore(); return;
    }

    if (blade.model === "ringblade") {
      const radius = 20 * scale;
      context.lineWidth = 7 * scale; context.strokeStyle = theme.ink;
      context.beginPath(); context.arc(blade.x, blade.y, radius, 0, Math.PI * 2); context.stroke();
      context.lineWidth = 2; context.strokeStyle = config.colors.bladeGlow;
      const charge = blade.state === "held" ? blade.orbit : blade.circuitOrbit;
      const spin = clock.sim * (5 + charge * 9);
      for (let index = 0; index < 3; index++) {
        const angle = spin + index * Math.PI * 2 / 3;
        context.beginPath(); context.arc(blade.x, blade.y, radius + 3, angle, angle + 0.55); context.stroke();
      }
      if (blade.state === "circuiting" && blade.circuitEnergyMax > 0) {
        const energy = clamp(blade.circuitEnergy / blade.circuitEnergyMax, 0, 1);
        context.globalAlpha = 0.35 + energy * 0.65;
        context.lineWidth = 3; context.beginPath();
        context.arc(blade.x, blade.y, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * energy);
        context.stroke(); context.globalAlpha = 1;
      }
      return;
    }

    context.lineWidth = 7 * scale;
    context.beginPath(); context.moveTo(blade.x, blade.y); context.lineTo(blade.tipX, blade.tipY); context.stroke();
    context.shadowBlur = 0;
    const guardX = Math.cos(blade.angle + Math.PI / 2) * 9;
    const guardY = Math.sin(blade.angle + Math.PI / 2) * 9;
    context.lineWidth = 5; context.beginPath();
    context.moveTo(blade.x - guardX, blade.y - guardY); context.lineTo(blade.x + guardX, blade.y + guardY); context.stroke();
  }

  function drawTrail(context: CanvasRenderingContext2D, blade: BladeRenderSnapshot): void {
    if (graphics.low) return;
    const trail = blade.trail;
    const glow = theme.dark;
    if (glow) { context.save(); context.globalCompositeOperation = "lighter"; }
    context.fillStyle = blade.trailColor ?? config.colors.bladeTrail;
    const restored = ["#13c4d6", "#e0a326", "#b06cff", "#2f9e6b", "#eafcff"];
    for (let index = 1; index < trail.length; index++) {
      const previous = trail[index - 1];
      const current = trail[index];
      if (!previous || !current) continue;
      const segment = len(current.tx - previous.tx, current.ty - previous.ty);
      const speedAlpha = clamp((segment - 1) / 22, 0, 1);
      const alpha = (index / trail.length) * (config.juice.trailAlpha + 0.3) * speedAlpha;
      if (alpha <= 0.002) continue;
      if (blade.restoredTrail) context.fillStyle = restored[index % restored.length] ?? restored[0] ?? "#13c4d6";
      context.globalAlpha = alpha;
      context.beginPath(); context.moveTo(previous.hx, previous.hy); context.lineTo(previous.tx, previous.ty);
      context.lineTo(current.tx, current.ty); context.lineTo(current.hx, current.hy); context.closePath(); context.fill();
    }
    context.globalAlpha = 1;
    if (glow) context.restore();
  }

  function drawTipGlow(context: CanvasRenderingContext2D, blade: BladeRenderSnapshot): void {
    if (blade.state !== "held" || blade.glowV <= 0.04) return;
    const glow = theme.dark;
    if (glow) { context.save(); context.globalCompositeOperation = "lighter"; }
    context.globalAlpha = 0.2 + blade.glowV * 0.5;
    context.fillStyle = blade.glowColor ?? config.colors.bladeGlow;
    context.beginPath(); context.arc(blade.tipX, blade.tipY, 4 + blade.glowV * 13, 0, Math.PI * 2); context.fill();
    context.globalAlpha = 1;
    if (glow) context.restore();
  }

  return {
    draw(surface: unknown, blade: BladeRenderSnapshot, player: BladePlayerPort): void {
      if (!isCanvasSurface(surface)) return;
      const context = surface;
      const hand = blade.handPos(player);
      drawTrail(context, blade);

      if (blade.state === "held") {
        if (!blade.finalFree) {
          context.strokeStyle = "#cfcfcf"; context.lineWidth = 2; context.beginPath();
          context.moveTo(hand.x, hand.y); context.lineTo(blade.x, blade.y); context.stroke();
        }
        drawTipGlow(context, blade); drawBody(context, blade); return;
      }

      const actionPoint = blade.actionPoint();
      const actionRange = blade.actionRange();
      const actionDistance = len(actionPoint.x - hand.x, actionPoint.y - hand.y);
      const inRange = blade.hostile || Boolean(blade.stolenBy) || !Number.isFinite(actionRange) || actionDistance <= actionRange;
      if (!blade.hideThrowUI) {
        context.setLineDash([6, 6]);
        context.strokeStyle = inRange ? theme.ink : (theme.dark ? "rgba(236,235,246,0.45)" : "#cfcfcf");
        context.lineWidth = inRange ? 2 : 1.5; context.beginPath();
        context.moveTo(hand.x, hand.y); context.lineTo(actionPoint.x, actionPoint.y); context.stroke();
        if (Number.isFinite(actionRange) && blade.state !== "returning") {
          context.strokeStyle = theme.dark ? "rgba(236,235,246,0.30)" : "#dcdcdc";
          context.lineWidth = 1.5; context.beginPath(); context.arc(hand.x, hand.y, actionRange, 0, Math.PI * 2); context.stroke();
        }
        context.setLineDash([]);
      }
      drawBody(context, blade);
      if (["embedded", "latched"].includes(blade.state) && inRange) {
        context.strokeStyle = theme.ink; context.lineWidth = 2; context.beginPath();
        context.arc(actionPoint.x, actionPoint.y, 13, 0, Math.PI * 2); context.stroke();
      }
    },
  };
}
