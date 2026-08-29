import type { EnvironmentPresentationSnapshot } from "../../gameplay/environment/presentation-snapshot";

export interface PaleEnvironmentPresentationOptions {
  readonly highContrast: boolean;
  readonly reducedMotion: boolean;
  readonly lowGraphics: boolean;
  readonly timeSeconds: number;
  readonly flashScale: number;
}

export const PALE_TRACK_PRESENTATION_LIMITS = Object.freeze({
  chevronsPerTrack: 16,
  lowGraphicsChevronsPerTrack: 4,
});

/** Renders immutable Aurora Track facts as route-first directional lanes. */
export function renderPaleEnvironmentPresentation(
  canvas: CanvasRenderingContext2D,
  snapshot: EnvironmentPresentationSnapshot,
  options: PaleEnvironmentPresentationOptions,
): void {
  if (snapshot.stageId !== "pale-traverse") return;
  canvas.save(); canvas.lineCap = "round"; canvas.lineJoin = "round";
  for (const field of snapshot.fields) {
    if (field.kind !== "aurora-track" || field.direction === undefined) continue;
    const { minX, maxX, minY, maxY } = field.bounds;
    const width = maxX - minX, height = maxY - minY;
    const warning = field.state === "warning" || field.state === "scheduled";
    const dormant = field.state === "cooldown" || field.state === "expired" || field.state === "destroyed";
    const pulse = options.reducedMotion ? 1 : 1 - 0.16 * options.flashScale
      + Math.sin(options.timeSeconds * 3.2) * 0.16 * options.flashScale;
    canvas.globalAlpha = (dormant ? 0.24 : warning ? 0.56 : 0.72) * pulse;
    canvas.fillStyle = options.highContrast ? "#4b00d1" : warning ? "#78c4df" : "#69d59f";
    canvas.strokeStyle = options.highContrast ? "#ffffff" : "#d8eaff";
    canvas.lineWidth = options.highContrast ? 5 : warning ? 3 : 2.5;
    canvas.setLineDash(warning ? [16, 10] : []);
    canvas.fillRect(minX, minY, width, height);
    canvas.strokeRect(minX, minY, width, height);
    canvas.setLineDash([]);

    const budget = options.lowGraphics
      ? PALE_TRACK_PRESENTATION_LIMITS.lowGraphicsChevronsPerTrack
      : PALE_TRACK_PRESENTATION_LIMITS.chevronsPerTrack;
    const count = Math.min(budget, Math.max(2, Math.floor(width / (options.lowGraphics ? 120 : 64))));
    const movingOffset = options.reducedMotion ? 0 : (options.timeSeconds * 28) % Math.max(1, width / count);
    canvas.globalAlpha = dormant ? 0.3 : 0.9;
    canvas.strokeStyle = options.highContrast ? "#fff36b" : field.direction === 1 ? "#d8eaff" : "#ef8da8";
    canvas.lineWidth = options.highContrast ? 5 : 3;
    for (let index = 0; index < count; index += 1) {
      const spacing = width / count;
      const rawX = minX + spacing * (index + 0.5) + field.direction * movingOffset;
      const x = minX + ((rawX - minX + width) % width);
      const y = minY + height / 2;
      const half = Math.min(12, height * 0.22);
      canvas.beginPath();
      canvas.moveTo(x - field.direction * half, y - half);
      canvas.lineTo(x + field.direction * half, y);
      canvas.lineTo(x - field.direction * half, y + half);
      canvas.stroke();
    }
  }
  canvas.restore();
}
