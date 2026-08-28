import type { EnvironmentPresentationSnapshot } from "../../gameplay/environment/presentation-snapshot";

export interface VerdantEnvironmentPresentationOptions {
  readonly highContrast: boolean;
  readonly reducedMotion: boolean;
  readonly lowGraphics: boolean;
  readonly timeSeconds: number;
  readonly flashScale: number;
}

/** Draws future-compatible Graft/Regrowth facts already admitted by the environment kernel. */
export function renderVerdantEnvironmentPresentation(
  canvas: CanvasRenderingContext2D,
  snapshot: EnvironmentPresentationSnapshot,
  options: VerdantEnvironmentPresentationOptions,
): void {
  if (snapshot.stageId !== "verdant-sanctum") return;
  canvas.save(); canvas.lineCap = "round";
  for (const field of snapshot.fields) {
    if (field.kind !== "rootline") continue;
    const { minX, maxX, minY, maxY } = field.bounds;
    const warning = field.state === "warning" || field.state === "scheduled";
    canvas.globalAlpha = field.state === "expired" ? 0.2 : warning ? 0.72 : field.state === "cooldown" ? 0.45 : 0.94;
    canvas.strokeStyle = options.highContrast ? "#fff36b" : "#d7b84c";
    canvas.fillStyle = options.highContrast ? "#ffffff" : "#4f713f";
    canvas.lineWidth = options.highContrast ? 6 : 4;
    canvas.setLineDash(warning ? [18, 10] : []);
    canvas.strokeRect(minX, minY, maxX - minX, maxY - minY);
    canvas.setLineDash([]);
    if (!warning) {
      const toothWidth = options.lowGraphics ? 54 : 34;
      canvas.beginPath();
      for (let x = minX; x < maxX; x += toothWidth) {
        canvas.moveTo(x, maxY); canvas.lineTo(Math.min(maxX, x + toothWidth / 2), minY); canvas.lineTo(Math.min(maxX, x + toothWidth), maxY);
      }
      canvas.fill();
    }
  }
  for (const anchor of snapshot.combatObjects) {
    if (anchor.kind !== "graft-anchor") continue;
    const geometry = anchor.geometry;
    const radius = geometry.radius ?? Math.max(12, Math.min(geometry.w ?? 32, geometry.h ?? 32) / 2);
    const x = geometry.radius === undefined ? geometry.x + (geometry.w ?? radius * 2) / 2 : geometry.x;
    const y = geometry.radius === undefined ? geometry.y + (geometry.h ?? radius * 2) / 2 : geometry.y;
    const warning = anchor.state === "warning" || anchor.state === "scheduled";
    const pulse = options.reducedMotion ? 1 : 1 - 0.22 * options.flashScale + Math.sin(options.timeSeconds * 6) * 0.22 * options.flashScale;
    canvas.globalAlpha = anchor.state === "destroyed" || anchor.state === "expired" ? 0.34 : pulse;
    canvas.fillStyle = options.highContrast ? "#4b00d1" : "#7fa96a";
    canvas.strokeStyle = options.highContrast ? "#ffffff" : "#e4c95a";
    canvas.lineWidth = options.highContrast ? 5 : 3;
    canvas.beginPath(); canvas.moveTo(x, y - radius); canvas.lineTo(x + radius, y);
    canvas.lineTo(x, y + radius); canvas.lineTo(x - radius, y); canvas.closePath(); canvas.fill(); canvas.stroke();
    if (warning) {
      canvas.setLineDash([10, 7]); canvas.beginPath(); canvas.arc(x, y, radius + 14, 0, Math.PI * 2); canvas.stroke(); canvas.setLineDash([]);
    }
    if (!options.lowGraphics && anchor.integrityRatio < 1) {
      canvas.beginPath(); canvas.moveTo(x - radius * 0.45, y - radius * 0.2);
      canvas.lineTo(x, y + radius * 0.12); canvas.lineTo(x + radius * 0.36, y - radius * 0.36); canvas.stroke();
    }
  }
  for (const route of snapshot.routes) {
    if (route.kind !== "regrowth-link" || route.points.length < 2) continue;
    const first = route.points[0];
    if (first === undefined) continue;
    canvas.globalAlpha = route.state === "destroyed" || route.state === "expired" ? 0.25 : 0.82;
    canvas.strokeStyle = options.highContrast ? "#ffffff" : "#43aa9b";
    canvas.lineWidth = options.highContrast ? 5 : 3;
    canvas.setLineDash(route.state === "warning" || route.state === "scheduled" ? [12, 8] : []);
    canvas.beginPath(); canvas.moveTo(first.x, first.y);
    for (let index = 1; index < route.points.length; index += 1) {
      const point = route.points[index]; if (point !== undefined) canvas.lineTo(point.x, point.y);
    }
    canvas.stroke(); canvas.setLineDash([]);
  }
  canvas.restore();
}
