import { clamp } from "../../domain/geometry";

/** Optional surface texture (a stage's scene package); false keeps the procedural fill. */
export interface RootstoneTexture {
  draw(
    context: CanvasRenderingContext2D,
    rectangle: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
    floor: boolean,
  ): boolean;
}

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
  readonly floor?: boolean;
  readonly timeSeconds: number;
  readonly lowGraphics: boolean;
  readonly highContrast: boolean;
  readonly reducedMotion: boolean;
  readonly flashScale: number;
  readonly stressRatio: number;
  readonly warningRatio: number;
  readonly reformRatio: number;
}

export const VERDANT_ROOTSTONE_COLORS = Object.freeze({
  body: "#245647",
  bodyDeep: "#123c34",
  ink: "#0a302a",
  facetLight: "#b9c39d",
  paleWarm: "#d8d0a8",
  moss: "#719b56",
  warning: "#e4c95a",
  preservationGold: "#d4b85f",
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
  material?: RootstoneTexture,
): void {
  const state = verdantRootstoneState(platform);
  const stress = clamp(policy.stressRatio, 0, 1);
  const warning = clamp(policy.warningRatio, 0, 1);
  const reform = clamp(policy.reformRatio, 0, 1);
  context.save();
  context.beginPath();
  context.rect(platform.x, platform.y, platform.w, platform.h);
  context.clip();

  if (state === "broken") {
    context.fillStyle = VERDANT_ROOTSTONE_COLORS.body;
    for (let index = 0; index < 5; index += 1) {
      const width = platform.w / 5 + 1;
      const fall = 16 + (index % 3) * 14;
      context.globalAlpha = 0.68 - index * 0.055;
      context.save();
      context.translate((index - 2) * 3, fall);
      context.rotate((index - 2) * 0.035);
      context.beginPath();
      context.rect(platform.x + (index * platform.w) / 5, platform.y, width, platform.h);
      context.clip();
      if (!material?.draw(context, platform, policy.floor === true)) {
        context.fillRect(platform.x + (index * platform.w) / 5, platform.y, width, platform.h);
      }
      context.restore();
    }
    context.restore();
    return;
  }

  if (state === "reforming") {
    const outlineWidth = policy.highContrast ? 5 : 3;
    context.setLineDash(policy.highContrast ? [12, 7] : [9, 8]);
    // Keep the unavailable surface hollow while separating its dashed cue
    // from both bright foliage and dark trunks in the prepared scene.
    context.globalAlpha = 1;
    context.strokeStyle = policy.highContrast ? VERDANT_ROOTSTONE_COLORS.paleWarm : VERDANT_ROOTSTONE_COLORS.bodyDeep;
    context.lineWidth = outlineWidth + 4;
    context.strokeRect(platform.x, platform.y, platform.w, platform.h);
    context.globalAlpha = policy.highContrast ? 1 : 0.65 + reform * 0.3;
    context.strokeStyle = policy.highContrast
      ? VERDANT_ROOTSTONE_COLORS.highContrastWarning
      : VERDANT_ROOTSTONE_COLORS.warning;
    context.lineWidth = outlineWidth;
    context.strokeRect(platform.x, platform.y, platform.w, platform.h);
    context.setLineDash([]);
    context.strokeStyle = VERDANT_ROOTSTONE_COLORS.moss;
    for (let index = 0; index < 4; index += 1) {
      const x = platform.x + platform.w * (0.14 + index * 0.24);
      context.beginPath();
      context.moveTo(x, platform.y + platform.h - 2);
      context.quadraticCurveTo(
        x + (index % 2 ? 10 : -10),
        platform.y + platform.h * (0.62 - reform * 0.28),
        x + 4,
        platform.y + 2,
      );
      context.stroke();
    }
    context.restore();
    return;
  }

  if (!material?.draw(context, platform, policy.floor === true)) {
    const body = context.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
    body.addColorStop(0, stress > 0.5 ? "#285d4c" : VERDANT_ROOTSTONE_COLORS.body);
    body.addColorStop(0.62, VERDANT_ROOTSTONE_COLORS.body);
    body.addColorStop(1, VERDANT_ROOTSTONE_COLORS.bodyDeep);
    context.fillStyle = body;
    context.fillRect(platform.x, platform.y, platform.w, platform.h);
    context.globalAlpha = 0.16;
    context.fillStyle = VERDANT_ROOTSTONE_COLORS.paleWarm;
    const strata = policy.lowGraphics ? 2 : 3;
    for (let index = 0; index < strata; index += 1) {
      const y = platform.y + platform.h * (0.22 + index * 0.16);
      const inset = 10 + (index % 2) * 17,
        available = Math.max(0, platform.w - inset * 2);
      context.fillRect(platform.x + inset, y, available * 0.29, index === 0 ? 2 : 1);
      context.fillRect(platform.x + inset + available * 0.39, y + 1, available * 0.24, 1);
      context.fillRect(platform.x + inset + available * 0.72, y, available * 0.28, 1);
    }
    if (!policy.lowGraphics) {
      context.globalAlpha = 0.1;
      context.fillStyle = VERDANT_ROOTSTONE_COLORS.facetLight;
      for (let index = 0; index < 3; index += 1) {
        const x = platform.x + platform.w * (0.16 + index * 0.32);
        context.beginPath();
        context.moveTo(x - 13, platform.y + 6);
        context.lineTo(x + 18, platform.y + 4);
        context.lineTo(x + 9, platform.y + platform.h * 0.55);
        context.lineTo(x - 20, platform.y + platform.h * 0.62);
        context.closePath();
        context.fill();
      }
    }
    context.globalAlpha = 1;
    context.fillStyle = VERDANT_ROOTSTONE_COLORS.moss;
    context.beginPath();
    context.moveTo(platform.x, platform.y + 5);
    context.lineTo(platform.x + platform.w * 0.1, platform.y + 1);
    context.lineTo(platform.x + platform.w * 0.22, platform.y + 3);
    context.lineTo(platform.x + platform.w * 0.36, platform.y);
    context.lineTo(platform.x + platform.w * 0.52, platform.y + 4);
    context.lineTo(platform.x + platform.w * 0.68, platform.y + 1);
    context.lineTo(platform.x + platform.w * 0.82, platform.y + 3);
    context.lineTo(platform.x + platform.w, platform.y + 1);
    context.lineTo(platform.x + platform.w, platform.y);
    context.lineTo(platform.x, platform.y);
    context.closePath();
    context.fill();
    context.globalAlpha = 0.35;
    context.fillStyle = VERDANT_ROOTSTONE_COLORS.wetEdge;
    context.fillRect(platform.x, platform.y + platform.h - 3, platform.w, 3);
    context.globalAlpha = 0.86;
    context.strokeStyle = VERDANT_ROOTSTONE_COLORS.ink;
    context.lineWidth = 2;
    context.strokeRect(platform.x, platform.y, platform.w, platform.h);

    if (!policy.lowGraphics) {
      context.globalAlpha = 0.19;
      context.strokeStyle = VERDANT_ROOTSTONE_COLORS.preservationGold;
      context.lineWidth = 1;
      for (let x = platform.x + 68; x < platform.x + platform.w - 28; x += 238) {
        context.beginPath();
        context.moveTo(x, platform.y + 4);
        context.lineTo(x + 5, platform.y + platform.h * 0.36);
        context.lineTo(x + 2, platform.y + platform.h * 0.58);
        context.stroke();
      }
    }
  }

  if (state === "stressed") {
    context.globalAlpha = 0.12 + stress * 0.26;
    context.fillStyle = VERDANT_ROOTSTONE_COLORS.bodyDeep;
    context.fillRect(platform.x, platform.y, platform.w, platform.h);
  }
  if (state === "warning") {
    const flash = clamp(policy.flashScale, 0, 1);
    const pulse =
      policy.reducedMotion || flash === 0 ? 1 : 1 - 0.28 * flash + 0.28 * flash * Math.sin(policy.timeSeconds * 7);
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
      context.globalAlpha = 0.9;
      context.setLineDash([12, 7]);
      context.strokeRect(platform.x, platform.y - 4, platform.w, platform.h + 4);
      context.setLineDash([]);
    }
  }
  context.globalAlpha = 1;
  context.restore();
}
