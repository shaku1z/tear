import type { BladePlayerPort, BladePresentationPort, BladeRenderSnapshot } from "../../gameplay/entities/blade";
import { isCanvasSurface } from "./canvas-surface";

export interface BladeRendererPolicy {
  readonly colors: Readonly<{ bladeGlow: string; bladeTrail: string; perfect: string }>;
  readonly juice: Readonly<{ trailAlpha: number }>;
  readonly chainSegments?: number;
  readonly chamberCount?: number;
}

export interface BladeRendererDependencies {
  readonly clock: { readonly sim: number };
  readonly policy: BladeRendererPolicy;
  readonly graphics: { readonly low: boolean };
  readonly theme: { readonly dark: boolean; readonly ink: string; readonly rim: string };
  readonly clamp: (value: number, min: number, max: number) => number;
  readonly len: (x: number, y: number) => number;
  readonly lerp: (from: number, to: number, amount: number) => number;
}

type Point = Readonly<{ x: number; y: number }>;

/**
 * Every blade is drawn in the theme's ink over a thin edge of the opposite tone. The theme takes its polarity from
 * the stage background, so ink alone vanishes where a floor or platform has the ink's own tone (a black floor on a
 * light stage); the edge keeps the silhouette on any ground. `width` is added on each side of an ink stroke.
 */
export const BLADE_EDGE = { light: "#ffffff", dark: "rgba(10,12,20,0.9)", width: 1.5 } as const;

export function createBladeRenderer({
  policy,
  graphics,
  theme,
  clamp,
  len,
  lerp,
}: BladeRendererDependencies): BladePresentationPort {
  const colors = policy.colors;
  const trailAlpha = policy.juice.trailAlpha;
  const chainSegments = policy.chainSegments ?? 14;
  const chamberCount = policy.chamberCount ?? 4;
  /** The edge tone for the current theme; the theme can change between frames. */
  const edgeColor = (): string => (theme.dark ? BLADE_EDGE.dark : BLADE_EDGE.light);
  /**
   * Straight ink strokes over their edges: every edge first, then every ink stroke, so one stroke's edge never cuts
   * across another's ink. Only the first stroke carries the rim shadow, as the single ink stroke did before.
   */
  function edgedStrokes(
    context: CanvasRenderingContext2D,
    strokes: readonly Readonly<{ from: Point; to: Point; width: number }>[],
  ): void {
    for (const [color, extra] of [
      [edgeColor(), BLADE_EDGE.width * 2],
      [theme.ink, 0],
    ] as const)
      for (const stroke of strokes) {
        context.strokeStyle = color;
        context.lineWidth = stroke.width + extra;
        context.beginPath();
        context.moveTo(stroke.from.x, stroke.from.y);
        context.lineTo(stroke.to.x, stroke.to.y);
        context.stroke();
        context.shadowBlur = 0;
      }
  }
  function drawBody(context: CanvasRenderingContext2D, blade: BladeRenderSnapshot): void {
    const scale = blade.state === "held" ? 1 : blade.throwSizeMult;
    if (!graphics.low) {
      context.shadowColor = theme.rim;
      context.shadowBlur = 6;
    }
    context.strokeStyle = theme.ink;
    context.fillStyle = theme.ink;
    context.lineCap = "round";
    const outline = edgeColor();
    const tip = { x: blade.tipX, y: blade.tipY };

    if (blade.model === "hammer") {
      edgedStrokes(context, [{ from: blade, to: tip, width: 7 * scale }]);
      context.save();
      context.translate(blade.tipX, blade.tipY);
      context.rotate(blade.angle);
      const headLength = 22 * scale;
      const headHeight = 16 * scale;
      context.fillStyle = theme.ink;
      context.fillRect(-headLength * 0.35, -headHeight, headLength, headHeight * 2);
      context.strokeStyle = outline;
      context.lineWidth = 2;
      context.strokeRect(-headLength * 0.35, -headHeight, headLength, headHeight * 2);
      context.restore();
      return;
    }

    if (blade.model === "greatsword") {
      context.save();
      context.translate(blade.x, blade.y);
      context.rotate(blade.angle);
      const length = len(blade.tipX - blade.x, blade.tipY - blade.y),
        width = 14 * scale;
      // A readable two-handed hilt: pommel, wrapped grip, shoulders, and a broad
      // crossguard remain visible even when the weapon is spinning at throw scale.
      context.fillStyle = theme.ink;
      context.beginPath();
      context.arc(-25 * scale, 0, 5.5 * scale, 0, Math.PI * 2);
      context.fill();
      context.fillRect(-24 * scale, -4.5 * scale, 24 * scale, 9 * scale);
      context.strokeStyle = outline;
      context.lineWidth = 1.5 * scale;
      for (let x = -20; x <= -4; x += 5) {
        context.beginPath();
        context.moveTo(x * scale, -4.5 * scale);
        context.lineTo((x + 3) * scale, 4.5 * scale);
        context.stroke();
      }
      context.lineWidth = 5 * scale;
      context.beginPath();
      context.moveTo(-2 * scale, -20 * scale);
      context.lineTo(7 * scale, 0);
      context.lineTo(-2 * scale, 20 * scale);
      context.stroke();
      context.lineWidth = 3 * scale;
      context.beginPath();
      context.moveTo(-7 * scale, -17 * scale);
      context.lineTo(8 * scale, -10 * scale);
      context.moveTo(-7 * scale, 17 * scale);
      context.lineTo(8 * scale, 10 * scale);
      context.stroke();

      // Broad shouldered blade with a central fuller and a clipped, weighty point.
      context.beginPath();
      context.moveTo(4 * scale, -width * 0.6);
      context.lineTo(length * 0.2, -width);
      context.lineTo(length * 0.76, -width * 0.82);
      context.lineTo(length, 0);
      context.lineTo(length * 0.76, width * 0.82);
      context.lineTo(length * 0.2, width);
      context.lineTo(4 * scale, width * 0.6);
      context.closePath();
      context.fill();
      context.strokeStyle = outline;
      context.lineWidth = 2 * scale;
      context.stroke();
      context.globalAlpha = 0.45;
      context.strokeStyle = outline;
      context.lineWidth = 2 * scale;
      context.beginPath();
      context.moveTo(12 * scale, 0);
      context.lineTo(length * 0.78, 0);
      context.stroke();
      context.globalAlpha = 1;
      context.restore();
      return;
    }

    if (blade.model === "chainblade") {
      const hand = blade.lastHand() ?? { x: blade.x, y: blade.y };
      const chainColor = blade.tension > 0.7 ? colors.perfect : theme.ink;
      const segments = chainSegments;
      // Detached renderer fixtures from before the chain-point contract may not
      // carry the optional simulation detail; production snapshots do.
      const chainPoints = (Reflect.get(blade, "chainPoints") as readonly { x: number; y: number }[] | undefined) ?? [];
      const simulated = chainPoints.length === segments + 1 ? chainPoints : null;
      const sagAmount = (1 - blade.tension) * Math.min(42, len(blade.tipX - hand.x, blade.tipY - hand.y) * 0.16);
      const points: { x: number; y: number }[] = simulated ? chainPoints.slice() : [];
      if (!simulated)
        for (let index = 0; index <= segments; index++) {
          const amount = index / segments;
          points.push({
            x: lerp(hand.x, blade.tipX, amount),
            y: lerp(hand.y, blade.tipY, amount) + Math.sin(amount * Math.PI) * sagAmount,
          });
        }
      // The chain's edge first, then the chain over it; the links sit on the same edge.
      for (const [color, lineWidth] of [
        [outline, 2 * scale + BLADE_EDGE.width * 2],
        [chainColor, 2 * scale],
      ] as const) {
        context.lineWidth = lineWidth;
        context.strokeStyle = color;
        context.beginPath();
        context.moveTo(points[0]?.x ?? hand.x, points[0]?.y ?? hand.y);
        for (const point of points.slice(1)) context.lineTo(point.x, point.y);
        context.stroke();
      }
      // Alternating elongated links make the chain articulate instead of reading as
      // a single rubber tether. Link positions are deterministic simulation output.
      for (let index = 1; index < points.length - 1; index++) {
        const point = points[index],
          previous = points[index - 1],
          next = points[index + 1];
        if (!point || !previous || !next) continue;
        context.save();
        context.translate(point.x, point.y);
        context.rotate(Math.atan2(next.y - previous.y, next.x - previous.x) + (index % 2 ? 0 : Math.PI / 2));
        context.strokeStyle = chainColor;
        context.lineWidth = 2 * scale;
        context.beginPath();
        context.ellipse(0, 0, 5 * scale, 2.7 * scale, 0, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
      context.save();
      context.translate(blade.tipX, blade.tipY);
      context.rotate(blade.angle);
      context.beginPath();
      context.moveTo(13 * scale, 0);
      context.lineTo(-7 * scale, -11 * scale);
      context.lineTo(-3 * scale, 0);
      context.lineTo(-7 * scale, 11 * scale);
      context.closePath();
      context.fillStyle = theme.ink;
      context.fill();
      context.strokeStyle = outline;
      context.lineWidth = BLADE_EDGE.width;
      context.stroke();
      context.restore();
      return;
    }

    if (blade.model === "riftlock") {
      context.save();
      context.translate(blade.x, blade.y);
      context.rotate(blade.angle);
      const length = len(blade.tipX - blade.x, blade.tipY - blade.y);
      // Heavy pistol silhouette: angled grip, beavertail, trigger guard, slide,
      // squared muzzle, and a blade beneath the barrel.
      context.fillStyle = theme.ink;
      context.beginPath();
      context.moveTo(8 * scale, 2 * scale);
      context.lineTo(28 * scale, 4 * scale);
      context.lineTo(22 * scale, 30 * scale);
      context.lineTo(8 * scale, 27 * scale);
      context.lineTo(2 * scale, 8 * scale);
      context.closePath();
      context.fill();
      context.strokeStyle = outline;
      context.lineWidth = 1.5 * scale;
      context.stroke();
      context.beginPath();
      context.moveTo(10 * scale, 10 * scale);
      context.lineTo(22 * scale, 12 * scale);
      context.moveTo(11 * scale, 16 * scale);
      context.lineTo(20.5 * scale, 18 * scale);
      context.moveTo(13 * scale, 22 * scale);
      context.lineTo(19 * scale, 23.5 * scale);
      context.stroke();

      context.fillStyle = theme.ink;
      context.fillRect(-7 * scale, -13 * scale, length * 0.68, 17 * scale);
      context.strokeStyle = outline;
      context.lineWidth = 1.8 * scale;
      context.strokeRect(-7 * scale, -13 * scale, length * 0.68, 17 * scale);
      context.fillRect(length * 0.58, -10 * scale, length * 0.13, 13 * scale);
      context.strokeRect(length * 0.58, -10 * scale, length * 0.13, 13 * scale);
      context.beginPath();
      context.moveTo(-3 * scale, 4 * scale);
      context.lineTo(length * 0.55, 4 * scale);
      context.lineTo(length * 0.48, 10 * scale);
      context.lineTo(18 * scale, 10 * scale);
      context.lineTo(12 * scale, 4 * scale);
      context.closePath();
      context.fill();
      context.strokeStyle = outline;
      context.stroke();
      context.beginPath();
      context.ellipse(28 * scale, 8 * scale, 10 * scale, 7 * scale, 0, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(27 * scale, 3 * scale);
      context.lineTo(24 * scale, 10 * scale);
      context.stroke();

      const chambers = clamp(Math.floor(blade.riftChambers), 0, chamberCount);
      for (let index = 0; index < chamberCount; index++) {
        context.fillStyle = index < chambers ? colors.bladeGlow : theme.dark ? "#1b2130" : "#747983";
        context.fillRect(length * (0.13 + index * 0.085), -8 * scale, 4 * scale, 6 * scale);
      }
      context.fillStyle = theme.ink;
      context.beginPath();
      context.moveTo(length * 0.49, 9 * scale);
      context.lineTo(length, 0);
      context.lineTo(length * 0.6, 15 * scale);
      context.closePath();
      context.fill();
      context.strokeStyle = outline;
      context.lineWidth = 1.8 * scale;
      context.stroke();
      context.restore();
      return;
    }

    const guardX = Math.cos(blade.angle + Math.PI / 2) * 9;
    const guardY = Math.sin(blade.angle + Math.PI / 2) * 9;
    edgedStrokes(context, [
      { from: blade, to: tip, width: 7 * scale },
      {
        from: { x: blade.x - guardX, y: blade.y - guardY },
        to: { x: blade.x + guardX, y: blade.y + guardY },
        width: 5,
      },
    ]);
  }

  function drawTrail(context: CanvasRenderingContext2D, blade: BladeRenderSnapshot): void {
    if (graphics.low) return;
    const trail = blade.trail;
    const glow = theme.dark;
    if (glow) {
      context.save();
      context.globalCompositeOperation = "lighter";
    }
    context.fillStyle = blade.trailColor ?? colors.bladeTrail;
    const restored = ["#13c4d6", "#e0a326", "#b06cff", "#2f9e6b", "#eafcff"];
    for (let index = 1; index < trail.length; index++) {
      const previous = trail[index - 1];
      const current = trail[index];
      if (!previous || !current) continue;
      const segment = len(current.tx - previous.tx, current.ty - previous.ty);
      const speedAlpha = clamp((segment - 1) / 22, 0, 1);
      const alpha = (index / trail.length) * (trailAlpha + 0.3) * speedAlpha;
      if (alpha <= 0.002) continue;
      if (blade.restoredTrail) context.fillStyle = restored[index % restored.length] ?? restored[0] ?? "#13c4d6";
      context.globalAlpha = alpha;
      context.beginPath();
      context.moveTo(previous.hx, previous.hy);
      context.lineTo(previous.tx, previous.ty);
      context.lineTo(current.tx, current.ty);
      context.lineTo(current.hx, current.hy);
      context.closePath();
      context.fill();
    }
    context.globalAlpha = 1;
    if (glow) context.restore();
  }

  function drawTipGlow(context: CanvasRenderingContext2D, blade: BladeRenderSnapshot): void {
    if (blade.state !== "held" || blade.glowV <= 0.04) return;
    const glow = theme.dark;
    if (glow) {
      context.save();
      context.globalCompositeOperation = "lighter";
    }
    context.globalAlpha = 0.2 + blade.glowV * 0.5;
    context.fillStyle = blade.glowColor ?? colors.bladeGlow;
    context.beginPath();
    context.arc(blade.tipX, blade.tipY, 4 + blade.glowV * 13, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    if (glow) context.restore();
  }

  function drawReversalMarks(context: CanvasRenderingContext2D, blade: BladeRenderSnapshot): void {
    if (blade.model !== "sword") return;
    context.strokeStyle = colors.perfect;
    context.lineWidth = 2;
    for (const mark of blade.reversals) {
      const requiredX = -mark.directionX,
        requiredY = -mark.directionY;
      context.globalAlpha = mark.exited ? 0.9 : 0.45;
      context.beginPath();
      context.arc(mark.x, mark.y, mark.exited ? 16 : 12, 0, Math.PI * 2);
      context.moveTo(mark.x, mark.y);
      context.lineTo(mark.x + requiredX * 18, mark.y + requiredY * 18);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  return {
    draw(surface: unknown, blade: BladeRenderSnapshot, player: BladePlayerPort): void {
      if (!isCanvasSurface(surface)) return;
      const context = surface;
      const hand = blade.handPos(player);
      drawTrail(context, blade);
      drawReversalMarks(context, blade);

      if (blade.state === "held") {
        if (!blade.finalFree) {
          context.strokeStyle = "#cfcfcf";
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(hand.x, hand.y);
          context.lineTo(blade.x, blade.y);
          context.stroke();
        }
        drawTipGlow(context, blade);
        drawBody(context, blade);
        return;
      }

      const actionPoint = blade.actionPoint();
      const actionRange = blade.actionRange();
      const actionDistance = len(actionPoint.x - hand.x, actionPoint.y - hand.y);
      const inRange =
        blade.hostile || Boolean(blade.stolenBy) || !Number.isFinite(actionRange) || actionDistance <= actionRange;
      if (!blade.hideThrowUI) {
        context.setLineDash([6, 6]);
        context.strokeStyle = inRange ? theme.ink : theme.dark ? "rgba(236,235,246,0.45)" : "#cfcfcf";
        context.lineWidth = inRange ? 2 : 1.5;
        context.beginPath();
        context.moveTo(hand.x, hand.y);
        context.lineTo(actionPoint.x, actionPoint.y);
        context.stroke();
        if (Number.isFinite(actionRange) && blade.state !== "returning") {
          context.strokeStyle = theme.dark ? "rgba(236,235,246,0.30)" : "#dcdcdc";
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(hand.x, hand.y, actionRange, 0, Math.PI * 2);
          context.stroke();
        }
        context.setLineDash([]);
      }
      drawBody(context, blade);
      if (["embedded", "hooked"].includes(blade.state) && inRange) {
        context.strokeStyle = theme.ink;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(actionPoint.x, actionPoint.y, 13, 0, Math.PI * 2);
        context.stroke();
      }
    },
  };
}
