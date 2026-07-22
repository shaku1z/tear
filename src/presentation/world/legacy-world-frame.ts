import {
  renderBossDressing,
  renderBossZoneEffects,
  renderGroundHazards,
  renderPlatformCracks,
  type SceneEffectsSnapshot,
} from "./scene-effects";
import {
  renderEntityLayer,
  renderFloaters,
  renderRearEntities,
  type EnemyVisualSnapshot,
  type EntityLayerOptions,
  type FloaterVisualSnapshot,
  type PlayerVisualSnapshot,
} from "./entity-layer";

export interface WorldBounds { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
export interface WorldCamera { readonly cx: number; readonly cy: number; readonly ox: number; readonly oy: number; readonly scale: number }
export interface WorldPlatform {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly floor?: boolean;
}

export interface LegacyWorldFramePorts<Platform extends WorldPlatform = WorldPlatform> {
  readonly canvas: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly screen: Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly zoom: number;
  readonly shake: number;
  readonly playing: boolean;
  readonly random: () => number;
  readonly biome: boolean;
  readonly debug: boolean;
  readonly timeSeconds: number;
  readonly reducedMotion: boolean;
  readonly stage: unknown;
  readonly playerX: number;
  readonly sceneEffects: SceneEffectsSnapshot;
  readonly enemies: readonly EnemyVisualSnapshot[];
  readonly player?: PlayerVisualSnapshot | undefined;
  readonly entityOptions: EntityLayerOptions;
  readonly floaters: readonly FloaterVisualSnapshot[];
  readonly brokenPlatforms: readonly Platform[];
  readonly platforms: readonly Platform[];
  readonly projectiles: readonly Readonly<{ draw: (canvas: CanvasRenderingContext2D) => void }>[];
  readonly setEffectView: (bounds: WorldBounds) => void;
  readonly drawBackdrop: (stage: unknown, time: number, playerX: number, bounds: WorldBounds) => void;
  readonly drawPlatform: (platform: Platform, stage: unknown, floor: boolean, bounds: WorldBounds) => void;
  readonly drawFinale: (layer: "rear" | "front") => void;
  readonly drawTutorialGhost: () => void;
  readonly tutorialActive: boolean;
  readonly drawPlayer: () => void;
  readonly drawBlade: () => void;
  readonly drawEffects: () => void;
  readonly drawDebug: (visible: WorldBounds, painted: WorldBounds) => void;
}

/** Draws one complete world frame from immutable visual snapshots and narrow draw ports. */
export function renderLegacyWorldFrame<Platform extends WorldPlatform>(ports: LegacyWorldFramePorts<Platform>): WorldCamera {
  const { canvas } = ports;
  canvas.save();
  const cx = ports.width / 2, cy = ports.height / 2;
  let ox = 0, oy = 0;
  if (ports.shake > 0 && ports.playing) {
    ox = (ports.random() * 2 - 1) * ports.shake;
    oy = (ports.random() * 2 - 1) * ports.shake;
  }
  const cameraScale = Math.max(0.01, ports.zoom), bleed = 56, screen = ports.screen;
  const visible = Object.freeze({
    left: cx + (screen.x - cx - ox) / cameraScale,
    top: cy + (screen.y - cy - oy) / cameraScale,
    right: cx + (screen.x + screen.w - cx - ox) / cameraScale,
    bottom: cy + (screen.y + screen.h - cy - oy) / cameraScale,
  });
  const painted = Object.freeze({ left: visible.left - bleed, top: visible.top - bleed,
    right: visible.right + bleed, bottom: visible.bottom + bleed });
  const camera = Object.freeze({ cx, cy, ox, oy, scale: cameraScale });
  ports.setEffectView(visible);
  canvas.translate(cx + ox, cy + oy); canvas.scale(ports.zoom, ports.zoom); canvas.translate(-cx, -cy);
  if (ports.debug && ports.biome) {
    canvas.fillStyle = "#ff00a8";
    canvas.fillRect(visible.left, visible.top, visible.right - visible.left, visible.bottom - visible.top);
  }
  if (ports.biome) ports.drawBackdrop(ports.stage, ports.timeSeconds * (ports.reducedMotion ? 0.25 : 1), ports.playerX, painted);
  renderBossDressing(canvas, ports.sceneEffects);
  renderRearEntities(canvas, ports.enemies);
  ports.drawFinale("rear");
  for (const platform of ports.brokenPlatforms) ports.drawPlatform(platform, ports.stage, false, painted);
  for (const platform of ports.platforms) ports.drawPlatform(platform, ports.stage, platform.floor === true, painted);
  renderPlatformCracks(canvas, ports.sceneEffects);
  ports.drawFinale("front");
  renderGroundHazards(canvas, ports.sceneEffects);
  renderBossZoneEffects(canvas, ports.sceneEffects);
  renderEntityLayer(canvas, ports.enemies, ports.player, ports.entityOptions);
  for (const projectile of ports.projectiles) projectile.draw(canvas);
  if (ports.tutorialActive) ports.drawTutorialGhost();
  ports.drawPlayer(); ports.drawBlade(); ports.drawEffects();
  ports.drawDebug(visible, painted);
  renderFloaters(canvas, ports.floaters);
  canvas.restore();
  return camera;
}
