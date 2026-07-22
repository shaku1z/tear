import type { EnemyStatusSnapshot, FinaleWorldSnapshot, PantheonDebugSnapshot, WorldBounds } from "./contracts";
import type { EnemyVisualSnapshot } from "./entity-layer";
import type { SceneEffectsSnapshot } from "./scene-effects";

export interface StatusEnemySource {
  readonly x: number; readonly y: number; readonly hw: number; readonly hh: number;
  readonly bleedStacks: number; readonly burnT: number; readonly markT: number;
}
export function buildEnemyStatusSnapshot(enemy: StatusEnemySource, input: {
  readonly bleedMaximum: number; readonly bleedColor: string; readonly burnColor: string; readonly markColor: string;
}): EnemyStatusSnapshot {
  return Object.freeze({ x: enemy.x, y: enemy.y, halfWidth: enemy.hw, halfHeight: enemy.hh,
    bleedStacks: enemy.bleedStacks, bleedMaximum: input.bleedMaximum, burnTime: enemy.burnT, markTime: enemy.markT,
    bleedColor: input.bleedColor, burnColor: input.burnColor, markColor: input.markColor });
}

export interface ScenePlatformSource {
  readonly arenaPlatId?: string; readonly crackT: number; readonly crackMax?: number; readonly crackColor?: string;
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
}
export interface SceneBossSource { readonly isBoss?: boolean; readonly isMiniBoss?: boolean; readonly bossId: string; readonly color: string;
  readonly zones?: readonly Readonly<{ x: number; w?: number; kind?: string; on?: boolean; arming?: boolean; warn?: boolean; warnK?: number;
    life?: number; maxLife?: number; dir?: number }>[]; readonly zoneColor?: string }
export function buildSceneEffectsSnapshot(input: {
  readonly voidActive: boolean; readonly enemies: readonly SceneBossSource[]; readonly platforms: readonly ScenePlatformSource[];
  readonly walls: readonly Readonly<{ x: number; y: number; w: number; life: number; maxLife: number }>[];
  readonly slowZones: readonly Readonly<{ x: number; y: number; r: number; life: number }>[];
  readonly width: number; readonly height: number; readonly groundY: number; readonly timeMilliseconds: number;
  readonly lowGraphics: boolean; readonly highContrast: boolean; readonly darkTheme: boolean; readonly ink: string;
  readonly defaultZoneWidth: number; readonly colors: Readonly<{ sludge: string; slam: string; bomber: string; charger: string }>;
  readonly seamLife: number; readonly trailLife: number;
}): SceneEffectsSnapshot {
  const dressing = input.voidActive ? undefined : input.enemies.find((enemy) => enemy.isBoss && !enemy.isMiniBoss);
  const zoneBoss = input.voidActive ? undefined : input.enemies.find((enemy) => enemy.isBoss && (enemy.zones?.length ?? 0) > 0);
  return Object.freeze({ width: input.width, height: input.height, groundY: input.groundY, timeMilliseconds: input.timeMilliseconds,
    lowGraphics: input.lowGraphics, highContrast: input.highContrast, darkTheme: input.darkTheme, ink: input.ink,
    dressing: dressing === undefined ? undefined : { bossId: dressing.bossId, color: dressing.color },
    cracks: input.platforms.filter((platform) => !platform.arenaPlatId && platform.crackT > 0).map((platform) => ({
      x: platform.x, y: platform.y, w: platform.w, h: platform.h, time: platform.crackT,
      maximum: platform.crackMax ?? 0.8, color: platform.crackColor ?? input.colors.charger })),
    walls: input.walls.map((wall) => ({ x: wall.x, y: wall.y, w: wall.w, life: wall.life, maximum: wall.maxLife })),
    slowZones: input.slowZones.map((zone) => ({ x: zone.x, y: zone.y, radius: zone.r, life: zone.life })),
    bossZones: (zoneBoss?.zones ?? []).map((zone) => ({ x: zone.x, width: zone.w ?? input.defaultZoneWidth,
      kind: zone.kind ?? "fallback", active: zone.on !== false, arming: zone.arming === true, warning: zone.warn === true,
      warningAmount: zone.warnK ?? 0, life: zone.life ?? 0, maximumLife: zone.maxLife ?? 0, direction: zone.dir ?? 1 })),
    zoneColor: zoneBoss?.zoneColor ?? input.colors.charger, sludgeColor: input.colors.sludge, slamColor: input.colors.slam,
    bomberColor: input.colors.bomber, chargerColor: input.colors.charger, defaultZoneWidth: input.defaultZoneWidth,
    seamLife: input.seamLife, trailLife: input.trailLife });
}

export interface VisualEnemySource extends StatusEnemySource {
  readonly radius: number; readonly color: string; readonly spawnT: number; readonly flash: number; readonly dead?: boolean;
  readonly depthPlane?: string; readonly cinematicPose?: boolean; readonly buffs?: readonly string[];
  readonly kind: string; readonly supportType?: string; readonly enraged?: boolean; readonly variantName?: string; readonly affixes?: readonly unknown[];
  draw(canvas: CanvasRenderingContext2D, player: unknown): void; drawRear?(canvas: CanvasRenderingContext2D): void;
}
export function buildEntityLayerSnapshot(input: {
  readonly enemies: readonly VisualEnemySource[]; readonly sandbox: boolean; readonly player: unknown;
  readonly formatLabel: (enemy: VisualEnemySource) => string; readonly drawTransformation?: (canvas: CanvasRenderingContext2D, enemy: VisualEnemySource) => void;
  readonly drawStatus: (enemy: VisualEnemySource) => void;
}): readonly EnemyVisualSnapshot[] {
  return input.enemies.map((enemy) => Object.freeze({ x: enemy.x, y: enemy.y, halfWidth: enemy.hw, halfHeight: enemy.hh,
    radius: enemy.radius, color: enemy.color, spawnTime: enemy.spawnT, flashTime: enemy.flash, dead: enemy.dead === true,
    depthPlane: enemy.depthPlane, cinematicPose: enemy.cinematicPose === true, buffs: enemy.buffs ?? [],
    label: input.sandbox ? input.formatLabel(enemy) : undefined, draw: (canvas: CanvasRenderingContext2D) => { enemy.draw(canvas, input.player); },
    drawRear: enemy.drawRear === undefined ? undefined : (canvas: CanvasRenderingContext2D) => enemy.drawRear?.(canvas),
    drawTransformation: enemy.cinematicPose && input.drawTransformation !== undefined
      ? (canvas: CanvasRenderingContext2D) => input.drawTransformation?.(canvas, enemy) : undefined,
    drawStatus: enemy.bleedStacks > 0 || enemy.burnT > 0 || enemy.markT > 0 ? () => { input.drawStatus(enemy); } : undefined }));
}

export interface FinaleSource {
  readonly phase: string; readonly origin: Readonly<{ x: number; y: number }>;
  readonly anchors: readonly Readonly<{ x: number; y: number; r: number; depth: number; cut: boolean }>[];
  readonly severed: number; readonly restoredColor: boolean; readonly restoring: boolean; readonly restoredGravity: boolean;
  readonly tearClosed: boolean; readonly restore: number; readonly cutFlash: number; readonly relicProgress: number;
}
export function buildFinaleWorldSnapshot(finale: FinaleSource, input: {
  readonly fragmentCap: number; readonly stageAccents: readonly string[]; readonly groundY: number; readonly perfectColor: string;
  readonly relicColors: readonly [string, string, string, string]; readonly blade?: Readonly<{ x: number; y: number }>;
}): FinaleWorldSnapshot {
  return Object.freeze({ phase: finale.phase, origin: finale.origin,
    anchors: finale.anchors.map((anchor) => ({ x: anchor.x, y: anchor.y, radius: anchor.r, depth: anchor.depth, cut: anchor.cut })),
    severedIndex: finale.severed, restoredColor: finale.restoredColor, restoring: finale.restoring,
    restoredGravity: finale.restoredGravity, tearClosed: finale.tearClosed, restoreAmount: finale.restore,
    cutFlash: finale.cutFlash, relicProgress: finale.relicProgress, fragmentCap: input.fragmentCap,
    stageAccents: input.stageAccents, groundY: input.groundY, perfectColor: input.perfectColor,
    relicColors: input.relicColors, blade: input.blade });
}

interface DebugPlatformSource { readonly platformId?: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly void?: boolean; readonly arenaState?: string; readonly materializationState?: string; readonly voidLane?: string; readonly chunkId?: number }
interface DebugProjectileSource { readonly x: number; readonly y: number; readonly r: number; readonly family?: string; readonly counterplay?: string; readonly sweeperState?: string }
interface DebugEnemySource { readonly debugGeometry?: readonly Readonly<{ a: Readonly<{ x: number; y: number }>; b: Readonly<{ x: number; y: number }> }>[];
  readonly zones?: readonly Readonly<{ x: number; w?: number; nextOn?: boolean; warnK?: number }>[] }
interface DebugChunkSource { readonly transferWindow?: Readonly<{ x0: number; x1: number }>;
  readonly connections?: readonly Readonly<{ from: string; to: string }>[] }
export function buildPantheonDebugSnapshot(input: {
  readonly enabled: boolean; readonly visible?: WorldBounds; readonly painted?: WorldBounds;
  readonly platforms: readonly DebugPlatformSource[]; readonly brokenPlatforms: readonly DebugPlatformSource[];
  readonly chunks: readonly DebugChunkSource[]; readonly projectiles: readonly DebugProjectileSource[]; readonly enemies: readonly DebugEnemySource[];
  readonly sourceUpperY: number; readonly sourceLowerY: number; readonly groundY: number; readonly defaultZoneWidth: number;
}): PantheonDebugSnapshot {
  const projectPlatform = (platform: DebugPlatformSource) => ({ id: platform.platformId ?? "", x: platform.x, y: platform.y,
    w: platform.w, h: platform.h, isVoid: platform.void === true, state: platform.arenaState ?? platform.materializationState,
    lane: platform.voidLane, chunkId: platform.chunkId });
  const voidPlatforms = new Map(input.platforms.filter((platform) => platform.void && platform.platformId !== undefined)
    .map((platform) => [platform.platformId ?? "", platform]));
  return Object.freeze({ enabled: input.enabled, visibleBounds: input.visible, paintedBounds: input.painted,
    platforms: input.platforms.filter((platform) => platform.platformId !== undefined).map(projectPlatform),
    brokenPlatforms: input.brokenPlatforms.map(projectPlatform),
    transferWindows: input.chunks.flatMap((chunk) => chunk.transferWindow === undefined ? [] : [chunk.transferWindow]),
    connections: input.chunks.flatMap((chunk) => (chunk.connections ?? []).flatMap((edge) => {
      const from = voidPlatforms.get(edge.from), to = voidPlatforms.get(edge.to);
      return from === undefined || to === undefined ? [] : [{ a: { x: from.x + from.w / 2, y: from.y }, b: { x: to.x + to.w / 2, y: to.y } }];
    })),
    projectiles: input.projectiles.filter((projectile) => projectile.family !== undefined && projectile.family !== "ordinaryProjectile")
      .map((projectile) => ({ x: projectile.x, y: projectile.y, radius: projectile.r,
        family: projectile.family ?? "", counterplay: projectile.counterplay ?? "", sweeperState: projectile.sweeperState })),
    enemies: input.enemies.map((enemy) => ({ geometry: enemy.debugGeometry ?? [],
      zones: (enemy.zones ?? []).map((zone) => ({ x: zone.x, width: zone.w ?? input.defaultZoneWidth,
        nextOn: zone.nextOn === true, warningAmount: zone.warnK ?? 0 })) })),
    sourceUpperY: input.sourceUpperY, sourceLowerY: input.sourceLowerY, groundY: input.groundY,
    defaultZoneWidth: input.defaultZoneWidth });
}
