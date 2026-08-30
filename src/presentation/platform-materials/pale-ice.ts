import { clamp } from "../../domain/geometry";

export type PaleIceState = "stable" | "stressed" | "warning" | "broken" | "reforming";

export interface PaleIcePlatform {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly arenaState?: string;
  readonly stress?: number;
}

export interface PaleIceRenderPolicy {
  readonly timeSeconds: number;
  readonly lowGraphics: boolean;
  readonly highContrast: boolean;
  readonly reducedMotion: boolean;
  readonly flashScale: number;
  readonly stressRatio: number;
  readonly warningRatio: number;
  readonly reformRatio: number;
}

export const PALE_ICE_COLORS = Object.freeze({
  body: "#1f3557",
  bodyDeep: "#12213b",
  snow: "#d8eaff",
  iceEdge: "#78c4df",
  reflection: "#ef8da8",
  warning: "#69d59f",
  highContrastWarning: "#4b00d1",
});

export const PALE_ICE_DETAIL_LIMITS = Object.freeze({
  icicles: 7,
  fractures: 6,
  lowGraphicsFractures: 2,
});

export function paleIceState(platform: PaleIcePlatform): PaleIceState {
  if (platform.arenaState === "warning" || platform.arenaState === "broken" || platform.arenaState === "reforming") {
    return platform.arenaState;
  }
  return (platform.stress ?? 0) > 0 ? "stressed" : "stable";
}

/** Presentation-only snow and ice treatment for the existing platform lifecycle. */
export function drawPaleIce(
  context: CanvasRenderingContext2D,
  platform: PaleIcePlatform,
  policy: PaleIceRenderPolicy,
): void {
  const state = paleIceState(platform);
  const stress = clamp(policy.stressRatio, 0, 1);
  const warning = clamp(policy.warningRatio, 0, 1);
  const reform = clamp(policy.reformRatio, 0, 1);
  context.save();

  if (state === "broken") {
    for (let index = 0; index < 6; index += 1) {
      const width = platform.w / 6 + 1;
      context.globalAlpha = 0.75 - index * 0.06;
      context.fillStyle = index % 2 === 0 ? PALE_ICE_COLORS.body : PALE_ICE_COLORS.bodyDeep;
      context.save();
      context.translate((index - 2.5) * 3, 18 + (index % 3) * 13);
      context.rotate((index - 2.5) * 0.04);
      context.fillRect(platform.x + index * platform.w / 6, platform.y, width, platform.h);
      context.restore();
    }
    context.restore();
    return;
  }

  if (state === "reforming") {
    context.globalAlpha = 0.25 + reform * 0.68;
    context.strokeStyle = policy.highContrast ? PALE_ICE_COLORS.highContrastWarning : PALE_ICE_COLORS.iceEdge;
    context.lineWidth = policy.highContrast ? 5 : 3;
    context.setLineDash(policy.highContrast ? [12, 7] : [9, 8]);
    context.strokeRect(platform.x, platform.y, platform.w, platform.h);
    context.setLineDash([]);
    context.fillStyle = PALE_ICE_COLORS.snow;
    context.fillRect(platform.x, platform.y + (1 - reform) * 7, platform.w * reform, 5);
    context.restore();
    return;
  }

  context.fillStyle = "rgba(10,24,44,0.18)";
  context.fillRect(platform.x + 5, platform.y + platform.h, platform.w, 8);
  const body = context.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
  body.addColorStop(0, PALE_ICE_COLORS.body);
  body.addColorStop(1, PALE_ICE_COLORS.bodyDeep);
  context.fillStyle = body;
  context.fillRect(platform.x, platform.y, platform.w, platform.h);

  // Snow remains a clean contact plane; cyan ice below it carries the biome identity.
  context.fillStyle = PALE_ICE_COLORS.snow;
  context.fillRect(platform.x, platform.y, platform.w, 5);
  context.globalAlpha = 0.78;
  context.fillStyle = PALE_ICE_COLORS.iceEdge;
  context.fillRect(platform.x, platform.y + 5, platform.w, 3);
  context.globalAlpha = 0.26;
  context.fillStyle = PALE_ICE_COLORS.reflection;
  context.fillRect(platform.x + platform.w * 0.18, platform.y + 6, platform.w * 0.28, 2);

  if (!policy.lowGraphics) {
    context.globalAlpha = 0.52;
    context.fillStyle = PALE_ICE_COLORS.iceEdge;
    const count = Math.min(PALE_ICE_DETAIL_LIMITS.icicles, Math.max(1, Math.floor(platform.w / 82)));
    for (let index = 0; index < count; index += 1) {
      const x = platform.x + platform.w * (0.1 + index * 0.8 / Math.max(1, count - 1));
      const length = 5 + (index % 3) * 4;
      context.beginPath();
      context.moveTo(x - 4, platform.y + platform.h - 1);
      context.lineTo(x, platform.y + platform.h + length);
      context.lineTo(x + 4, platform.y + platform.h - 1);
      context.closePath(); context.fill();
    }
  }

  const fractureCount = policy.lowGraphics
    ? PALE_ICE_DETAIL_LIMITS.lowGraphicsFractures
    : PALE_ICE_DETAIL_LIMITS.fractures;
  context.globalAlpha = 0.2 + stress * 0.35;
  context.strokeStyle = PALE_ICE_COLORS.iceEdge;
  context.lineWidth = policy.highContrast ? 2.5 : 1.5;
  context.beginPath();
  for (let index = 0; index < fractureCount; index += 1) {
    const x = platform.x + platform.w * (0.12 + index * 0.76 / Math.max(1, fractureCount - 1));
    context.moveTo(x, platform.y + 8);
    context.lineTo(x + (index % 2 === 0 ? 9 : -9), platform.y + Math.min(platform.h - 3, 15 + (index % 3) * 5));
  }
  context.stroke();

  if (state === "stressed") {
    context.globalAlpha = 0.08 + stress * 0.22;
    context.fillStyle = PALE_ICE_COLORS.bodyDeep;
    context.fillRect(platform.x, platform.y, platform.w, platform.h);
  }
  if (state === "warning") {
    const pulse = policy.reducedMotion ? 1 : 1 - 0.26 * policy.flashScale
      + 0.26 * policy.flashScale * Math.sin(policy.timeSeconds * 6);
    context.globalAlpha = (0.58 + warning * 0.34) * pulse;
    context.strokeStyle = policy.highContrast ? PALE_ICE_COLORS.highContrastWarning : PALE_ICE_COLORS.warning;
    context.lineWidth = (policy.highContrast ? 5 : 3) + warning;
    context.strokeRect(platform.x, platform.y - 3, platform.w, platform.h + 3);
    if (policy.highContrast) {
      context.setLineDash([12, 7]);
      context.strokeRect(platform.x, platform.y - 7, platform.w, platform.h + 7);
      context.setLineDash([]);
    }
  }
  context.globalAlpha = 1;
  context.restore();
}
