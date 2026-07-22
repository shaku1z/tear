import type { CONFIG as GAME_CONFIG } from "../../config/game-config";
import type {
  MirrorHostRenderSnapshot,
  MirrorPresentationPort,
  MirrorRenderSnapshot,
  ReflectionRenderSnapshot,
} from "../../gameplay/entities/mirror";
import { isCanvasSurface } from "./canvas-surface";

type GameConfig = typeof GAME_CONFIG;

export interface MirrorRendererDependencies {
  readonly clock: { readonly sim: number };
  readonly config: GameConfig;
  readonly effects: { burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void };
  readonly graphics: { readonly low: boolean };
  readonly theme: { readonly ink: string };
  readonly clamp: (value: number, min: number, max: number) => number;
  readonly cosmeticRandom: () => number;
}

export function createMirrorRenderer({
  clock, config, effects, graphics, theme, clamp, cosmeticRandom,
}: MirrorRendererDependencies): MirrorPresentationPort {
  function drawTelegraph(context: CanvasRenderingContext2D, mirror: MirrorRenderSnapshot): void {
    const move = mirror.mv;
    if (move?.id !== "slam" || (move.ph !== "tele" && move.ph !== "hang" && move.ph !== "exec")) return;
    const groundY = config.world.groundY;
    const actor = mirror.actor;
    const pulse = 0.5 + 0.5 * Math.sin(clock.sim * 1000 / 70);
    context.save(); context.globalAlpha = 0.12 + 0.16 * pulse; context.fillStyle = mirror.color;
    context.fillRect(actor.x - 22, actor.y, 44, Math.max(0, groundY - actor.y));
    context.globalAlpha = 0.45 + 0.4 * pulse; context.strokeStyle = "#fff"; context.lineWidth = 3; context.setLineDash([11, 8]);
    context.beginPath(); context.ellipse(actor.x, groundY - 2, 48, 12, 0, 0, 6.2832); context.stroke(); context.setLineDash([]);
    context.globalAlpha = 0.55 + 0.4 * pulse; context.strokeStyle = mirror.color; context.lineWidth = 4;
    context.beginPath(); context.ellipse(actor.x, groundY - 2, 30, 8, 0, 0, 6.2832); context.stroke();
    context.restore(); context.globalAlpha = 1;
  }

  function drawGlint(context: CanvasRenderingContext2D, mirror: MirrorRenderSnapshot): void {
    const move = mirror.mv;
    if (!move || (move.ph !== "tele" && move.ph !== "hang")) return;
    const blade = mirror.blade;
    const pulse = 0.55 + 0.45 * Math.sin(clock.sim * 1000 / 55);
    context.save(); context.globalCompositeOperation = "lighter";
    context.globalAlpha = 0.7 * pulse; context.strokeStyle = "#f0e6ff"; context.lineWidth = 3; context.lineCap = "round";
    context.beginPath(); context.moveTo(blade.x, blade.y); context.lineTo(blade.tipX, blade.tipY); context.stroke();
    context.globalAlpha = pulse; context.fillStyle = "#fff";
    context.beginPath(); context.arc(blade.tipX, blade.tipY, 3.5 + 2 * pulse, 0, 6.2832); context.fill();
    context.restore();
  }

  function drawWaves(context: CanvasRenderingContext2D, mirror: MirrorRenderSnapshot): void {
    for (const wave of mirror.waves) {
      const life = wave.big ? 1.15 : 0.85;
      const progress = 1 - wave.life / life;
      const alpha = clamp(wave.life / life, 0, 1);
      const scale = wave.big ? 1.9 : 1;
      context.save();
      if (!graphics.low) context.globalCompositeOperation = "lighter";
      context.globalAlpha = 0.75 * alpha; context.strokeStyle = mirror.color; context.lineWidth = 4 * scale;
      context.beginPath(); context.arc(wave.x, wave.y, (12 + progress * 12) * scale, Math.PI, 0); context.stroke();
      context.globalAlpha = 0.5 * alpha; context.strokeStyle = "#efe3ff"; context.lineWidth = 2 * scale;
      context.beginPath(); context.arc(wave.x, wave.y, (7 + progress * 9) * scale, Math.PI, 0); context.stroke();
      context.restore();
    }
    context.globalAlpha = 1;
  }

  function drawLock(context: CanvasRenderingContext2D, mirror: MirrorRenderSnapshot): void {
    const lock = mirror.lock;
    if (!lock) return;
    const pulse = 0.6 + 0.4 * Math.sin(clock.sim * 1000 / 28);
    context.save();
    if (!graphics.low) context.globalCompositeOperation = "lighter";
    const radius = 15 + 9 * pulse;
    const gradient = context.createRadialGradient(lock.x, lock.y, 1, lock.x, lock.y, radius * 2.3);
    gradient.addColorStop(0, "#ffffff"); gradient.addColorStop(0.4, mirror.color); gradient.addColorStop(1, "rgba(176,108,255,0)");
    context.globalAlpha = 0.92; context.fillStyle = gradient; context.beginPath(); context.arc(lock.x, lock.y, radius * 2.3, 0, 6.2832); context.fill();
    context.globalAlpha = 0.85; context.lineWidth = 3.5; context.strokeStyle = lock.press > 0.6 ? "#4bd6ff" : mirror.color;
    context.beginPath(); context.arc(lock.x, lock.y, 22, -Math.PI / 2, -Math.PI / 2 + 6.2832 * lock.press); context.stroke();
    context.restore(); context.globalAlpha = 1; context.globalCompositeOperation = "source-over";
  }

  function drawReflectionHp(context: CanvasRenderingContext2D, reflection: ReflectionRenderSnapshot): void {
    if (reflection.noBar) return;
    const health = clamp(reflection.hp / reflection.maxHp, 0, 1);
    const shielded = reflection.maxShield > 0 && reflection.shield > 0;
    const status = reflection.bleedStacks > 0 || reflection.burnT > 0 || reflection.markT > 0
      || reflection.seamT > 0 || reflection.severT > 0 || reflection.breakPressure > 0;
    const hit = clamp(reflection.flash / 0.08, 0, 1);
    if (health >= 1 && !shielded && hit <= 0 && !status) return;
    const width = Math.max(reflection.hw * 2, 28);
    const x = reflection.x - width / 2;
    const y = reflection.y - reflection.hh - 15;
    const height = 5;
    const centerY = y + height / 2;
    const displayHealth = clamp(reflection.hpDisplay / reflection.maxHp, 0, 1);
    const low = health <= 0.3;
    context.save();
    if (hit > 0) {
      context.translate(reflection.x, centerY); context.scale(1 + hit * 0.05, 1 + hit * 0.45); context.translate(-reflection.x, -centerY);
    }
    context.fillStyle = "rgba(0,0,0,0.82)"; context.fillRect(x - 1.5, y - 1.5, width + 3, height + 3);
    context.fillStyle = "#39343f"; context.fillRect(x, y, width, height);
    if (displayHealth > health) {
      context.fillStyle = config.colors.slam; context.fillRect(x + width * health, y, width * (displayHealth - health), height);
    }
    context.fillStyle = low ? config.colors.charger : "#fff"; context.fillRect(x, y, width * health, height);
    if (hit > 0) {
      context.globalAlpha = hit * 0.7; context.fillStyle = "#fff"; context.fillRect(x, y, width * health, height); context.globalAlpha = 1;
    }
    context.fillStyle = low ? config.colors.charger : config.colors.eye;
    context.fillRect(x + width * health - 1.5, y - 1, 2.5, height + 2);
    if (shielded) {
      context.fillStyle = config.colors.perfect;
      context.fillRect(x, y - 5, width * clamp(reflection.shield / reflection.maxShield, 0, 1), 3);
    }
    if (status) {
      let statusX = x;
      const statusY = y - (shielded ? 9 : 5) - 4;
      if (reflection.bleedStacks > 0) { context.fillStyle = config.colors.charger; context.fillRect(statusX, statusY, 4, 4); statusX += 6; }
      if (reflection.burnT > 0) { context.fillStyle = config.colors.slam; context.fillRect(statusX, statusY, 4, 4); statusX += 6; }
      if (reflection.markT > 0) { context.fillStyle = config.colors.eye; context.fillRect(statusX, statusY, 4, 4); }
      if (reflection.seamT > 0) { statusX += 6; context.fillStyle = config.colors.perfect; context.fillRect(statusX, statusY, 2, 6); }
      if (reflection.severT > 0) { statusX += 6; context.fillStyle = "#b06cff"; context.fillRect(statusX, statusY, 4, 4); }
      if (reflection.breakPressure > 0) { statusX += 6; context.fillStyle = config.colors.armoredShield; context.fillRect(statusX, statusY, 5, 3); }
    }
    context.restore();
  }

  return {
    drawMirror(surface: unknown, mirror: MirrorRenderSnapshot): void {
      if (!isCanvasSurface(surface) || !mirror.active || !mirror.host) return;
      const context = surface;
      const actor = mirror.actor;
      const phase = mirror.phase;
      drawTelegraph(context, mirror);

      for (const image of mirror.imgs) {
        context.save(); context.globalAlpha = clamp(image.t / 0.4, 0, 1) * 0.3; context.fillStyle = mirror.color;
        context.fillRect(image.x - actor.hw, image.y - actor.hh, actor.hw * 2, actor.hh * 2); context.restore();
      }
      if (phase > 1 && !graphics.low) {
        context.save(); context.globalCompositeOperation = "lighter"; context.globalAlpha = 0.10 + 0.06 * phase;
        const radius = 42 + phase * 15;
        const gradient = context.createRadialGradient(actor.x, actor.y, 4, actor.x, actor.y, radius);
        gradient.addColorStop(0, mirror.color); gradient.addColorStop(1, "rgba(176,108,255,0)");
        context.fillStyle = gradient; context.beginPath(); context.arc(actor.x, actor.y, radius, 0, 6.2832); context.fill(); context.restore();
      }
      if (!graphics.low) {
        const split = (1 - mirror.sync) * 9 + 1;
        const jitter = Math.sin(clock.sim * 1000 * 0.018) * split * 0.35;
        context.save(); context.globalCompositeOperation = "lighter"; context.globalAlpha = (0.10 + 0.3 * (1 - mirror.sync)) * (1 - mirror.white);
        context.fillStyle = "#4bd6ff"; context.fillRect(actor.x - actor.hw - split + jitter, actor.y - actor.hh - jitter * 0.4, actor.hw * 2, actor.hh * 2);
        context.fillStyle = "#ff4b93"; context.fillRect(actor.x - actor.hw + split - jitter, actor.y - actor.hh + jitter * 0.4, actor.hw * 2, actor.hh * 2);
        context.restore();
      }

      context.save(); context.translate(actor.x, actor.y);
      context.rotate(clamp(actor.vx / 2400, -1, 1) * 0.14);
      context.globalAlpha = 1 - mirror.white * 0.88;
      context.fillStyle = mirror.host.flash > 0 ? "#fff" : theme.ink;
      if (!graphics.low) { context.shadowColor = mirror.color; context.shadowBlur = 10; }
      context.fillRect(-actor.hw, -actor.hh, actor.hw * 2, actor.hh * 2); context.shadowBlur = 0;
      if (!graphics.low) {
        context.fillStyle = mirror.color;
        context.globalAlpha = (0.65 + 0.25 * Math.sin(clock.sim * 1000 / 220)) * (1 - mirror.white * 0.88);
        context.fillRect(mirror.facing > 0 ? actor.hw - 2.5 : -actor.hw, -actor.hh, 2.5, actor.hh * 2);
        context.globalAlpha = 1 - mirror.white * 0.88;
      }
      if (phase >= 2) {
        context.strokeStyle = mirror.color; context.lineWidth = 1.6;
        context.globalAlpha = (0.5 + 0.5 * Math.sin(clock.sim * 1000 / 300)) * (1 - mirror.white * 0.88);
        context.beginPath();
        context.moveTo(-actor.hw * 0.5, -actor.hh); context.lineTo(-actor.hw * 0.1, -actor.hh * 0.3); context.lineTo(-actor.hw * 0.6, actor.hh * 0.4);
        context.moveTo(actor.hw * 0.6, -actor.hh * 0.6); context.lineTo(actor.hw * 0.15, 0); context.lineTo(actor.hw * 0.55, actor.hh);
        if (phase >= 3) { context.moveTo(0, -actor.hh); context.lineTo(actor.hw * 0.2, -actor.hh * 0.1); context.lineTo(-actor.hw * 0.2, actor.hh * 0.7); }
        context.stroke();
      }
      context.restore();
      context.fillStyle = config.colors.eye;
      context.fillRect(actor.x + mirror.facing * 5 - 4, actor.y - actor.hh + 12, 8, 5);
      mirror.blade.draw(surface, actor);
      drawGlint(context, mirror); drawWaves(context, mirror); drawLock(context, mirror);
    },

    drawHostFallback(surface: unknown, host: MirrorHostRenderSnapshot): void {
      if (!isCanvasSurface(surface)) return;
      const x = host.x - host.hw;
      const y = host.y - host.hh;
      surface.fillStyle = theme.ink; surface.fillRect(x, y, host.hw * 2, host.hh * 2);
      surface.fillStyle = config.colors.eye; surface.fillRect(host.x + host.facing * 5 - 4, y + 12, 8, 5);
      surface.strokeStyle = "#b06cff"; surface.lineWidth = 3; surface.lineCap = "round";
      surface.beginPath(); surface.moveTo(host.x, host.y); surface.lineTo(host.x, host.y - host.hh - 26); surface.stroke();
    },

    drawReflection(surface: unknown, reflection: ReflectionRenderSnapshot): void {
      if (!isCanvasSurface(surface)) return;
      const radius = reflection.hw + 6;
      if (!graphics.low) {
        surface.save(); surface.globalCompositeOperation = "lighter"; surface.globalAlpha = 0.38 + (reflection.pattern ? 0.15 : 0);
        const gradient = surface.createRadialGradient(reflection.x, reflection.y, 2, reflection.x, reflection.y, radius * 2.3);
        gradient.addColorStop(0, reflection.color); gradient.addColorStop(1, "rgba(0,0,0,0)");
        surface.fillStyle = gradient; surface.beginPath(); surface.arc(reflection.x, reflection.y, radius * 2.3, 0, 6.2832); surface.fill(); surface.restore();
      }
      surface.save(); surface.fillStyle = reflection.flash > 0 ? "#ffffff" : reflection.color;
      if (!graphics.low) { surface.shadowColor = reflection.color; surface.shadowBlur = 14; }
      surface.beginPath(); surface.moveTo(reflection.x, reflection.y - reflection.hh); surface.lineTo(reflection.x + reflection.hw, reflection.y);
      surface.lineTo(reflection.x, reflection.y + reflection.hh); surface.lineTo(reflection.x - reflection.hw, reflection.y); surface.closePath(); surface.fill();
      surface.shadowBlur = 0; surface.strokeStyle = "#ffffff"; surface.lineWidth = 2; surface.globalAlpha = 0.85; surface.stroke();
      surface.globalAlpha = 1; surface.fillStyle = config.colors.eye; surface.fillRect(reflection.x + reflection.facing * 4 - 4, reflection.y - 6, 8, 5);
      surface.restore();
      drawReflectionHp(surface, reflection);
    },

    saberLockSparks(x: number, y: number, color: string): void {
      effects.burst(
        x + (cosmeticRandom() * 2 - 1) * 7,
        y + (cosmeticRandom() * 2 - 1) * 7,
        cosmeticRandom() * 2 - 1,
        (cosmeticRandom() * 2 - 1) - 0.3,
        3,
        cosmeticRandom() < 0.5 ? "#ffffff" : color,
      );
    },
  };
}
