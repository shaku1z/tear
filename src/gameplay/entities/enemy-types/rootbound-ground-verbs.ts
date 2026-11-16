import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import {
  ROOTBOUND_CANOPY_STEP,
  ROOTBOUND_ROOTLINE,
  ROOTBOUND_SEED_ARC,
  ROOTBOUND_VINE_SWEEP,
  type RootboundCanopyStepStage,
  type RootboundRootlineStage,
  type RootboundSeedArcStage,
  type RootboundVineSweepStage,
} from "./rootbound-tuning";

type Point = Readonly<{ x: number; y: number }>;
type CanopyDestination = Readonly<{ x: number; y: number; platformId: string }>;

/** The Rootbound state its four ground verbs read and author. Phase I owns them; Phase III reuses them. */
export interface RootboundGroundVerbActor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly hw: number;
  readonly hh: number;
  facing: number;
  onGround: boolean;
  atk: string;
  vineSweepStage: RootboundVineSweepStage | null;
  vineSweepT: number;
  vineSweepHitSpent: boolean;
  vineSweepFacing: number;
  seedArcStage: RootboundSeedArcStage | null;
  seedArcT: number;
  rootlineStage: RootboundRootlineStage | null;
  rootlineT: number;
  rootlineFacing: number;
  rootlineCleanupReason: "natural-expiry" | "stage-transition" | null;
  canopyStepStage: RootboundCanopyStepStage | null;
  canopyStepT: number;
  canopyStepIndex: number;
  canopyStepStart: Point;
  canopyDestination: CanopyDestination | null;
  completePhaseOneAttack(): void;
}

type Dependencies = Pick<EnemyDependencies, "CONFIG" | "Projectile" | "aabbOverlap" | "clamp" | "lerp">;

export function rootboundVineSweepGeometry(boss: RootboundGroundVerbActor) {
  return Object.freeze({
    x: boss.x + (boss.vineSweepFacing * (boss.hw + ROOTBOUND_VINE_SWEEP.reach)) / 2,
    y: boss.y + boss.hh - ROOTBOUND_VINE_SWEEP.halfHeight,
    hw: (ROOTBOUND_VINE_SWEEP.reach - boss.hw) / 2,
    hh: ROOTBOUND_VINE_SWEEP.halfHeight,
    facing: boss.vineSweepFacing,
  });
}

export function updateRootboundVineSweep(
  boss: RootboundGroundVerbActor,
  dt: number,
  player: EnemyPlayerPort,
  d: Dependencies,
): void {
  if (boss.vineSweepStage === null) {
    boss.vineSweepStage = "windup";
    boss.vineSweepT = ROOTBOUND_VINE_SWEEP.windup;
    boss.vineSweepHitSpent = false;
    boss.vineSweepFacing = boss.facing;
    boss.atk = "vine-sweep:windup";
  }
  boss.vineSweepT = Math.max(0, boss.vineSweepT - dt);
  if (boss.vineSweepStage === "windup" && boss.vineSweepT <= 0) {
    boss.vineSweepStage = "active";
    boss.vineSweepT = ROOTBOUND_VINE_SWEEP.active;
    boss.atk = "vine-sweep:active";
  } else if (boss.vineSweepStage === "active") {
    const g = rootboundVineSweepGeometry(boss);
    if (
      !boss.vineSweepHitSpent &&
      !player.invulnerable &&
      d.aabbOverlap(g.x, g.y, g.hw, g.hh, player.x, player.y, player.hw, player.hh)
    ) {
      boss.vineSweepHitSpent = true;
      player.takeDamage(ROOTBOUND_VINE_SWEEP.damage, boss.x, boss);
    }
    if (boss.vineSweepT <= 0) {
      boss.vineSweepStage = "follow-through";
      boss.vineSweepT = ROOTBOUND_VINE_SWEEP.followThrough;
      boss.atk = "vine-sweep:follow-through";
    }
  } else if (boss.vineSweepStage === "follow-through" && boss.vineSweepT <= 0) {
    boss.vineSweepStage = null;
    boss.completePhaseOneAttack();
  }
}

function releaseSeedArc(
  boss: RootboundGroundVerbActor,
  player: EnemyPlayerPort,
  projectiles: EnemyProjectile[],
  d: Dependencies,
): void {
  const flightT = (2 * ROOTBOUND_SEED_ARC.launchSpeed) / ROOTBOUND_SEED_ARC.gravity;
  for (const offset of [-ROOTBOUND_SEED_ARC.spread, 0, ROOTBOUND_SEED_ARC.spread]) {
    const startX = boss.x + boss.facing * boss.hw * 0.45;
    const startY = boss.y - boss.hh * 0.62;
    const landingX = d.clamp(player.x + offset, 80, d.CONFIG.view.w - 80);
    const seed = new d.Projectile(startX, startY, (landingX - startX) / flightT, -ROOTBOUND_SEED_ARC.launchSpeed);
    seed.setFamily("ordinaryProjectile");
    seed.kind = "orb";
    seed.tint = "#89b95d";
    seed.r = ROOTBOUND_SEED_ARC.radius;
    seed.dmg = ROOTBOUND_SEED_ARC.damage;
    seed.gravity = ROOTBOUND_SEED_ARC.gravity;
    seed.life = flightT + 0.4;
    seed.owner = boss;
    seed.sourceEnemy = boss;
    seed.landingX = landingX;
    seed.landingY = d.CONFIG.world.groundY;
    seed.landingT = flightT;
    seed.groundImpact = true;
    seed.bossAttack = "seed-arc";
    projectiles.push(seed);
  }
  boss.seedArcStage = "release";
  boss.seedArcT = ROOTBOUND_SEED_ARC.release;
  boss.atk = "seed-arc:release";
}

export function updateRootboundSeedArc(
  boss: RootboundGroundVerbActor,
  dt: number,
  player: EnemyPlayerPort,
  projectiles: EnemyProjectile[],
  d: Dependencies,
): void {
  if (boss.seedArcStage === null) {
    boss.seedArcStage = "windup";
    boss.seedArcT = ROOTBOUND_SEED_ARC.windup;
    boss.atk = "seed-arc:windup";
  }
  boss.seedArcT = Math.max(0, boss.seedArcT - dt);
  if (boss.seedArcStage === "windup" && boss.seedArcT <= 0) releaseSeedArc(boss, player, projectiles, d);
  else if (boss.seedArcStage === "release" && boss.seedArcT <= 0) {
    boss.seedArcStage = null;
    boss.completePhaseOneAttack();
  }
}

export function rootboundRootlineGeometry(boss: RootboundGroundVerbActor, groundY: number) {
  return Object.freeze({
    x: boss.rootlineFacing > 0 ? boss.x + boss.hw : boss.x - boss.hw - ROOTBOUND_ROOTLINE.width,
    y: groundY - ROOTBOUND_ROOTLINE.height,
    w: ROOTBOUND_ROOTLINE.width,
    h: ROOTBOUND_ROOTLINE.height,
  });
}

/** Rootline damage is applied by the Verdant environment field; the boss owns only its stages. */
export function updateRootboundRootline(boss: RootboundGroundVerbActor, dt: number): void {
  if (boss.rootlineStage === null) {
    boss.rootlineStage = "warning";
    boss.rootlineT = ROOTBOUND_ROOTLINE.windup;
    boss.rootlineFacing = boss.facing;
    boss.rootlineCleanupReason = null;
    boss.atk = "rootline:warning";
  }
  boss.rootlineT = Math.max(0, boss.rootlineT - dt);
  if (boss.rootlineStage === "warning" && boss.rootlineT <= 0) {
    boss.rootlineStage = "active";
    boss.rootlineT = ROOTBOUND_ROOTLINE.active;
    boss.atk = "rootline:active";
  } else if (boss.rootlineStage === "active" && boss.rootlineT <= 0) {
    boss.rootlineStage = "cleanup";
    boss.rootlineT = ROOTBOUND_ROOTLINE.cleanup;
    boss.atk = "rootline:cleanup";
  } else if (boss.rootlineStage === "cleanup" && boss.rootlineT <= 0) {
    boss.rootlineStage = null;
    boss.rootlineCleanupReason = "natural-expiry";
    boss.completePhaseOneAttack();
  }
}

/**
 * Canopy Step alternates: from the floor it climbs to a stable arena platform;
 * from a platform it drops back to the floor beside the player, so its ground
 * verbs (Vine Sweep, Rootline) always return to the space the player fights in.
 */
function selectCanopyDestination(
  boss: RootboundGroundVerbActor,
  platforms: readonly EnemyPlatform[],
  player: EnemyPlayerPort,
  d: Dependencies,
): CanopyDestination | null {
  const floorY = d.CONFIG.world.groundY - boss.hh;
  if (boss.y < floorY - 8) {
    const side = player.x < d.CONFIG.view.w / 2 ? 1 : -1;
    const margin = boss.hw + 40;
    return Object.freeze({
      x: d.clamp(player.x + side * ROOTBOUND_CANOPY_STEP.floorStandoff, margin, d.CONFIG.view.w - margin),
      y: floorY,
      platformId: "floor",
    });
  }
  const destinations = platforms
    .filter(
      (platform) =>
        platform.oneway &&
        platform.arenaPlatId !== undefined &&
        platform.arenaState !== "broken" &&
        platform.arenaState !== "warning" &&
        platform.w >= boss.hw * 2,
    )
    .map((platform) =>
      Object.freeze({
        x: platform.x + platform.w / 2,
        y: platform.y - boss.hh,
        platformId: platform.arenaPlatId ?? "",
      }),
    )
    .filter((destination) => Math.abs(destination.x - boss.x) > boss.hw || Math.abs(destination.y - boss.y) > 8);
  if (destinations.length === 0) return null;
  const destination = destinations[boss.canopyStepIndex % destinations.length];
  boss.canopyStepIndex += 1;
  return destination ?? null;
}

export function updateRootboundCanopyStep(
  boss: RootboundGroundVerbActor,
  dt: number,
  platforms: readonly EnemyPlatform[],
  player: EnemyPlayerPort,
  d: Dependencies,
): void {
  if (boss.canopyStepStage === null) {
    boss.canopyDestination = selectCanopyDestination(boss, platforms, player, d);
    if (boss.canopyDestination === null) {
      boss.completePhaseOneAttack();
      return;
    }
    boss.canopyStepStart = Object.freeze({ x: boss.x, y: boss.y });
    boss.canopyStepStage = "telegraph";
    boss.canopyStepT = ROOTBOUND_CANOPY_STEP.telegraph;
    boss.atk = "canopy-step:telegraph";
  }
  const destination = boss.canopyDestination;
  if (destination === null) return;
  boss.canopyStepT = Math.max(0, boss.canopyStepT - dt);
  if (boss.canopyStepStage === "telegraph" && boss.canopyStepT <= 0) {
    boss.canopyStepStage = "travel";
    boss.canopyStepT = ROOTBOUND_CANOPY_STEP.travel;
    boss.atk = "canopy-step:travel";
  } else if (boss.canopyStepStage === "travel") {
    const progress = d.clamp(1 - boss.canopyStepT / ROOTBOUND_CANOPY_STEP.travel, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    boss.x = d.lerp(boss.canopyStepStart.x, destination.x, eased);
    boss.y = d.lerp(boss.canopyStepStart.y, destination.y, eased) - Math.sin(progress * Math.PI) * 64;
    boss.vx = 0;
    boss.vy = 0;
    boss.onGround = false;
    if (boss.canopyStepT <= 0) {
      boss.x = destination.x;
      boss.y = destination.y;
      boss.onGround = true;
      boss.canopyStepStage = "settle";
      boss.canopyStepT = ROOTBOUND_CANOPY_STEP.settle;
      boss.atk = "canopy-step:settle";
    }
  } else if (boss.canopyStepStage === "settle" && boss.canopyStepT <= 0) {
    boss.canopyStepStage = null;
    boss.canopyDestination = null;
    boss.completePhaseOneAttack();
  }
}
