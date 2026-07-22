import type { PlayerPresentationPort, PlayerRenderSnapshot } from "../../gameplay/entities/player";
import { isCanvasSurface } from "./canvas-surface";

export interface PlayerRendererDependencies {
  readonly colors: { readonly eye: string; readonly perfect: string };
  readonly graphics: { readonly low: boolean };
  readonly theme: { readonly ink: string; readonly rim: string };
  readonly clamp: (value: number, min: number, max: number) => number;
}

export function createPlayerRenderer({ colors, graphics, theme, clamp }: PlayerRendererDependencies): PlayerPresentationPort {
  return {
    draw(surface: unknown, player: PlayerRenderSnapshot): void {
      if (!isCanvasSurface(surface)) return;
      const context = surface;
      if (player.iframe > 0 && player.dashTimer <= 0 && Math.floor(player.iframe * 20) % 2 === 0) return;

      if (player.cinematicGraceT > 0) {
        const grace = clamp(player.cinematicGraceT / 0.7, 0, 1);
        context.save(); context.globalAlpha = 0.28 * grace;
        context.strokeStyle = colors.perfect;
        context.lineWidth = 2; context.beginPath();
        context.ellipse(player.x, player.y + player.hh, player.hw + 8, 6, 0, 0, Math.PI * 2);
        context.stroke(); context.restore();
      }

      const vertical = clamp(player.vy / 2200, -1, 1);
      const scaleY = player.onGround ? 1 : 1 - vertical * 0.12;
      const scaleX = player.onGround ? 1 : 1 + vertical * 0.10;
      context.save();
      context.translate(player.x, player.y + player.hh);
      context.scale(scaleX, scaleY);
      context.translate(-player.x, -(player.y + player.hh));
      context.fillStyle = theme.ink;
      if (!graphics.low) { context.shadowColor = theme.rim; context.shadowBlur = 7; }
      context.fillRect(player.x - player.hw, player.y - player.hh, player.hw * 2, player.hh * 2);
      context.shadowBlur = 0;
      context.fillStyle = colors.eye;
      const eyeX = player.x + player.facing * 5;
      context.fillRect(eyeX - 4, player.y - player.hh + 12, 8, 5);
      context.restore();
    },
  };
}
