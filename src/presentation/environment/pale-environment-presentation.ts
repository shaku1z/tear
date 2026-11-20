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

/** The road's light: a band this thick lying on the surface, with its arrows this far above it. */
export const PALE_TRACK_ROAD = Object.freeze({ band: 8, arrowLift: 24, arrowHalf: 10 });

/**
 * Draws an Aurora Track as a road lying on its surface: a band of light along the surface (the bottom of the
 * road's box), a faint wash up to the height the road reaches, and arrows running its way. A road about to
 * wake is a dashed, paler band; a sleeping road is a thin dim line with no arrows moving.
 */
export function renderPaleEnvironmentPresentation(
  canvas: CanvasRenderingContext2D,
  snapshot: EnvironmentPresentationSnapshot,
  options: PaleEnvironmentPresentationOptions,
): void {
  if (snapshot.stageId !== "pale-traverse") return;
  canvas.save();
  canvas.lineCap = "round";
  canvas.lineJoin = "round";
  for (const field of snapshot.fields) {
    if (field.kind !== "aurora-track" || field.direction === undefined) continue;
    const { minX, maxX, minY, maxY } = field.bounds;
    const width = maxX - minX;
    const awake = field.state === "active";
    const warning = field.state === "warning" || field.state === "scheduled";
    const pulse = options.reducedMotion
      ? 1
      : 1 - 0.16 * options.flashScale + Math.sin(options.timeSeconds * 3.2) * 0.16 * options.flashScale;
    if (awake && !options.lowGraphics) {
      canvas.globalAlpha = 0.1 * pulse;
      canvas.fillStyle = options.highContrast ? "#4b00d1" : "#69d59f";
      canvas.fillRect(minX, minY, width, maxY - minY - PALE_TRACK_ROAD.band);
    }
    const band = awake || warning ? PALE_TRACK_ROAD.band : 3;
    canvas.globalAlpha = (awake ? 0.85 : warning ? 0.6 : 0.3) * pulse;
    canvas.fillStyle = options.highContrast ? "#4b00d1" : warning ? "#78c4df" : "#69d59f";
    canvas.fillRect(minX, maxY - band, width, band);
    canvas.strokeStyle = options.highContrast ? "#ffffff" : "#d8eaff";
    canvas.lineWidth = options.highContrast ? 4 : 2;
    canvas.setLineDash(warning ? [16, 10] : []);
    canvas.beginPath();
    canvas.moveTo(minX, maxY - band);
    canvas.lineTo(maxX, maxY - band);
    canvas.stroke();
    canvas.setLineDash([]);
    if (!awake && !warning) continue;

    const budget = options.lowGraphics
      ? PALE_TRACK_PRESENTATION_LIMITS.lowGraphicsChevronsPerTrack
      : PALE_TRACK_PRESENTATION_LIMITS.chevronsPerTrack;
    const count = Math.min(budget, Math.max(2, Math.floor(width / (options.lowGraphics ? 120 : 64))));
    const spacing = width / count;
    const movingOffset = options.reducedMotion || !awake ? 0 : (options.timeSeconds * 90) % spacing;
    canvas.globalAlpha = awake ? 0.9 : 0.45;
    canvas.strokeStyle = options.highContrast ? "#fff36b" : field.direction === 1 ? "#d8eaff" : "#ef8da8";
    canvas.lineWidth = options.highContrast ? 5 : 3;
    const y = maxY - PALE_TRACK_ROAD.arrowLift;
    const half = PALE_TRACK_ROAD.arrowHalf;
    for (let index = 0; index < count; index += 1) {
      const rawX = minX + spacing * (index + 0.5) + field.direction * movingOffset;
      const x = minX + ((rawX - minX + width) % width);
      canvas.beginPath();
      canvas.moveTo(x - field.direction * half, y - half);
      canvas.lineTo(x + field.direction * half, y);
      canvas.lineTo(x - field.direction * half, y + half);
      canvas.stroke();
    }
  }
  for (const route of snapshot.routes) {
    if (route.kind !== "ghost-track" || route.points.length < 2) continue;
    const warning = route.state === "warning" || route.state === "scheduled";
    const dormant = route.state === "expired" || route.state === "destroyed";
    canvas.globalAlpha = dormant ? 0.18 : route.threatening === false ? 0.34 : warning ? 0.68 : 0.82;
    canvas.strokeStyle = options.highContrast
      ? route.threatening === false
        ? "#ffffff"
        : "#fff36b"
      : route.threatening === false
        ? "#7a91a2"
        : warning
          ? "#ef8da8"
          : "#b9f4ff";
    canvas.lineWidth = options.highContrast ? Math.max(7, route.width ?? 5) : Math.max(4, (route.width ?? 16) * 0.18);
    canvas.setLineDash(warning || route.threatening === false ? [18, 12] : []);
    canvas.beginPath();
    route.points.forEach((point, index) => {
      if (index === 0) canvas.moveTo(point.x, point.y);
      else canvas.lineTo(point.x, point.y);
    });
    canvas.stroke();
    canvas.setLineDash([]);
    const first = route.points[0],
      last = route.points.at(-1);
    if (first !== undefined && last !== undefined && route.direction !== undefined) {
      const x = (first.x + last.x) / 2,
        y = (first.y + last.y) / 2,
        direction = route.direction;
      canvas.lineWidth = options.highContrast ? 6 : 3;
      canvas.beginPath();
      canvas.moveTo(x - direction * 16, y - 12);
      canvas.lineTo(x + direction * 16, y);
      canvas.lineTo(x - direction * 16, y + 12);
      canvas.stroke();
    }
  }
  canvas.restore();
}
