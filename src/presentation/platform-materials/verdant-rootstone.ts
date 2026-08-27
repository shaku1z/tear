import { clamp } from "../../domain/geometry";

export type VerdantRootstoneState = "stable" | "stressed" | "warning" | "broken" | "reforming";

export interface VerdantRootstonePlatform {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly arenaState?: string;
  readonly stress?: number;
}

export interface VerdantRootstoneRenderPolicy {
  readonly timeSeconds: number;
  readonly lowGraphics: boolean;
  readonly highContrast: boolean;
  readonly stressRatio: number;
  readonly warningRatio: number;
  readonly reformRatio: number;
}

export const VERDANT_ROOTSTONE_COLORS = Object.freeze({
  body: "#234a36",
  bodyDeep: "#103b36",
  moss: "#7fa96a",
  warning: "#e4c95a",
  wetEdge: "#43aa9b",
  highContrastWarning: "#4b00d1",
});

export function verdantRootstoneState(platform: VerdantRootstonePlatform): VerdantRootstoneState {
  if (platform.arenaState === "warning" || platform.arenaState === "broken" || platform.arenaState === "reforming") {
    return platform.arenaState;
  }
  return (platform.stress ?? 0) > 0 ? "stressed" : "stable";
}

/** Draws only the presentation of the existing platform lifecycle. */
export function drawVerdantRootstone(
  context: CanvasRenderingContext2D,
  platform: VerdantRootstonePlatform,
  policy: VerdantRootstoneRenderPolicy,
): void {
  const state = verdantRootstoneState(platform);
  const stress = clamp(policy.stressRatio, 0, 1);
  const warning = clamp(policy.warningRatio, 0, 1);
  const reform = clamp(policy.reformRatio, 0, 1);
  context.save();

  if (state === "broken") {
    context.fillStyle = VERDANT_ROOTSTONE_COLORS.body;
    for (let index = 0; index < 5; index += 1) {
      const width = platform.w / 5 + 1;
      const fall = 16 + (index % 3) * 14;
      context.globalAlpha = 0.68 - index * 0.055;
      context.save();
      context.translate((index - 2) * 3, fall);
      context.rotate((index - 2) * 0.035);
      context.fillRect(platform.x + index * platform.w / 5, platform.y, width, platform.h);
      context.restore();
    }
    context.restore();
    return;
  }

  if (state === "reforming") {
    context.globalAlpha = 0.28 + reform * 0.62;
    context.strokeStyle = VERDANT_ROOTSTONE_COLORS.warning;
    context.lineWidth = policy.highContrast ? 5 : 3;
    context.setLineDash(policy.highContrast ? [12, 7] : [9, 8]);
    context.strokeRect(platform.x, platform.y, platform.w, platform.h);
    context.setLineDash([]);
    context.strokeStyle = VERDANT_ROOTSTONE_COLORS.moss;
    for (let index = 0; index < 4; index += 1) {
      const x = platform.x + platform.w * (0.14 + index * 0.24);
      context.beginPath(); context.moveTo(x, platform.y + platform.h + 20 * (1 - reform));
      context.quadraticCurveTo(x + (index % 2 ? 10 : -10), platform.y + 8, x + 4, platform.y - 8 * reform); context.stroke();
    }
    context.restore();
    return;
  }

  context.fillStyle = "rgba(0,0,0,0.16)";
  context.fillRect(platform.x + 4, platform.y + platform.h, platform.w, 7);
  const body = context.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
  body.addColorStop(0, stress > 0.5 ? "#31523c" : VERDANT_ROOTSTONE_COLORS.body);
  body.addColorStop(1, VERDANT_ROOTSTONE_COLORS.bodyDeep);
  context.fillStyle = body; context.fillRect(platform.x, platform.y, platform.w, platform.h);
  context.fillStyle = VERDANT_ROOTSTONE_COLORS.moss; context.fillRect(platform.x, platform.y, platform.w, 3);
  context.globalAlpha = 0.28; context.fillStyle = VERDANT_ROOTSTONE_COLORS.wetEdge;
  context.fillRect(platform.x, platform.y + platform.h - 3, platform.w, 3);

  if (!policy.lowGraphics) {
    context.globalAlpha = 0.3; context.strokeStyle = VERDANT_ROOTSTONE_COLORS.moss; context.lineWidth = 1.5;
    for (let x = platform.x + 22; x < platform.x + platform.w - 12; x += 54) {
      context.beginPath(); context.moveTo(x, platform.y + 5);
      context.quadraticCurveTo(x + 14, platform.y + platform.h * 0.48, x + 3, platform.y + platform.h - 5); context.stroke();
    }
  }

  if (state === "stressed") {
    context.globalAlpha = 0.12 + stress * 0.26; context.fillStyle = VERDANT_ROOTSTONE_COLORS.bodyDeep;
    context.fillRect(platform.x, platform.y, platform.w, platform.h);
  }
  if (state === "warning") {
    const pulse = 0.68 + 0.32 * Math.sin(policy.timeSeconds * 7);
    context.globalAlpha = (0.58 + warning * 0.34) * pulse;
    context.strokeStyle = policy.highContrast
      ? VERDANT_ROOTSTONE_COLORS.highContrastWarning
      : VERDANT_ROOTSTONE_COLORS.warning;
    context.lineWidth = (policy.highContrast ? 5 : 3) + warning;
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const x = platform.x + platform.w * (0.08 + index * 0.168);
      context.moveTo(x, platform.y);
      context.lineTo(x + (index % 2 ? 13 : -13), platform.y + platform.h * 0.72);
    }
    context.stroke();
    if (policy.highContrast) {
      context.globalAlpha = 0.9; context.setLineDash([12, 7]);
      context.strokeRect(platform.x, platform.y - 4, platform.w, platform.h + 4); context.setLineDash([]);
    }
  }
  context.globalAlpha = 1; context.restore();
}
