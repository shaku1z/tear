import { CLOCK, CONFIG } from "../../src/config/game-config";
import { aabbOverlap, clamp, len, lerp, segPointDist, segSegmentDist } from "../../src/domain/geometry";
import { createEnemyTypes, type EnemyTypes } from "../../src/gameplay/entities/enemies";
import type { EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import type { EnemyBaseInstance } from "../../src/gameplay/entities/enemy-types/enemy-base";
import { createProjectile } from "../../src/gameplay/entities/projectile";
import type { EnemyKind } from "../../src/gameplay/run/content-director";

const FX = {
  burst() { return; },
  ember() { return; },
  explode() { return; },
  ghost() { return; },
  ring() { return; },
  shockwave() { return; },
};

const SFX = {
  rankup() { return; },
  crescent() { return; },
  sweeperBat() { return; },
  sourceDepthPrepare() { return; },
  sourceDepthSnap() { return; },
};

export interface TestPlayer extends EnemyPlayerPort {
  readonly damage: { amount: number; sourceX: number; source: unknown }[];
}

export type BehaviorActor = EnemyBaseInstance & {
  update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void;
  supportType?: string;
};

export function createTestPlayer(overrides: Partial<TestPlayer> = {}): TestPlayer {
  const damage: TestPlayer["damage"] = [];
  return {
    x: 1120, y: CONFIG.world.groundY - 36, vx: 0, vy: 0, hw: 18, hh: 36,
    onGround: true, facing: -1, hp: 100, maxHp: 100, dashTimer: 0, dashX: 0,
    voidSlowT: 0, voidMajorWindow: false, voidLane: null, voidTransferT: 0,
    lastTrickKind: "hit", lastTrickT: 0, damage,
    takeDamage(amount, sourceX, source) { damage.push({ amount, sourceX, source }); },
    ...overrides,
  };
}

export function createEnemyHarness(randomValues: readonly number[] = [0.5]) {
  let randomIndex = 0;
  const next = () => randomValues[randomIndex++ % randomValues.length] ?? 0.5;
  const Projectile = createProjectile({ CLOCK, CONFIG, FX, presentation: { draw() { return; } }, SFX, clamp, len, lerp });
  const types = createEnemyTypes({
    CLOCK, CONFIG, FX, GAME_RANDOM: { next }, Projectile, SFX,
    aabbOverlap, clamp, cosmeticRandom: next, len, lerp, segPointDist, segSegmentDist,
  });
  const platforms: EnemyPlatform[] = [
    { id: "floor", x: 0, y: CONFIG.world.groundY, w: CONFIG.view.w, h: CONFIG.view.h - CONFIG.world.groundY, floor: true },
    { id: "ledge", x: 650, y: 520, w: 300, h: 24, oneway: true, arenaPlatId: "test:ledge", arenaState: "stable" },
  ];
  return { Projectile, types, platforms, player: createTestPlayer() };
}

type ActorFactory = (types: EnemyTypes) => BehaviorActor;

export const STANDARD_ACTOR_FACTORIES: Readonly<Record<EnemyKind, ActorFactory>> = Object.freeze({
  charger: (types) => new types.Charger(360, CONFIG.world.groundY - CONFIG.enemy.h / 2) as BehaviorActor,
  ranged: (types) => new types.Ranged(360, CONFIG.world.groundY - CONFIG.ranged.h / 2) as BehaviorActor,
  flyer: (types) => new types.Flyer(360, 300) as BehaviorActor,
  bomber: (types) => new types.Bomber(360, 300) as BehaviorActor,
  armored: (types) => new types.Armored(360, CONFIG.world.groundY - CONFIG.armored.h / 2) as BehaviorActor,
  priest: (types) => new types.Support(360, CONFIG.world.groundY - CONFIG.support.h / 2, "priest") as BehaviorActor,
  mender: (types) => new types.Support(360, CONFIG.world.groundY - CONFIG.support.h / 2, "mender") as BehaviorActor,
  herald: (types) => new types.Support(360, CONFIG.world.groundY - CONFIG.support.h / 2, "herald") as BehaviorActor,
  anchor: (types) => new types.Support(360, CONFIG.world.groundY - CONFIG.support.h / 2, "anchor") as BehaviorActor,
  wraith: (types) => new types.Wraith(360, 300) as BehaviorActor,
  chimera: (types) => new types.Chimera(360, CONFIG.world.groundY - CONFIG.chimera.h / 2) as BehaviorActor,
});

export function createStandardActor(kind: EnemyKind, types: EnemyTypes): BehaviorActor {
  return STANDARD_ACTOR_FACTORIES[kind](types);
}

export function updateActor(actor: BehaviorActor, frames: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
  for (let frame = 0; frame < frames; frame += 1) actor.update(1 / 60, platforms, player, projectiles);
}

export function behaviorSnapshot(actor: BehaviorActor, projectiles: readonly EnemyProjectile[]) {
  const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return {
    x: round(actor.x), y: round(actor.y), vx: round(actor.vx), vy: round(actor.vy),
    hp: round(actor.hp), atk: actor.atk, behavior: actor.behavior, dead: actor.dead,
    projectiles: projectiles.map((shot) => ({
      x: round(shot.x), y: round(shot.y), vx: round(shot.vx), vy: round(shot.vy),
      family: shot.family, kind: shot.kind, bomb: shot.bomb, mine: shot.mine, mud: shot.mud,
      ownerIsActor: shot.owner === actor,
    })),
  };
}
