import { aabbOverlap } from "../../domain/geometry";
import type {
  CombatActorState,
  CombatEntityIntent,
  EntityId,
  ProjectileCollisionTuning,
  ProjectilePatch,
  ProjectilePlayerState,
  ProjectileState,
  SlowZoneState,
  SpecialProjectileTuning,
} from "./combat-entity-contracts";

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function sourceId(projectile: ProjectileState): EntityId | null {
  return projectile.sourceEnemyId ?? projectile.ownerId;
}

function projectilePatch(projectileId: EntityId, patch: ProjectilePatch): CombatEntityIntent {
  return { type: "projectile-patch", projectileId, patch };
}

export interface ProjectileCollisionInput {
  readonly projectiles: readonly ProjectileState[];
  readonly actors: readonly CombatActorState[];
  readonly player: ProjectilePlayerState;
  readonly tuning: ProjectileCollisionTuning;
}

function planSweeperCollision(
  projectile: ProjectileState,
  input: ProjectileCollisionInput,
): readonly CombatEntityIntent[] {
  const owner = input.actors.find((actor) => actor.id === projectile.ownerId);
  if (projectile.sweeperState === "returned" && owner !== undefined && !owner.dead && !owner.dying &&
      distance(projectile.x, projectile.y, owner.x, owner.y) <= projectile.r + owner.radius) {
    return [
      ...(projectile.hasCounteredCallback ? [{ type: "sweeper-countered-callback", projectileId: projectile.id } as const] : []),
      { type: "shatter-sweeper", projectileId: projectile.id, reason: "ownerReturn" },
    ];
  }
  if (projectile.sweeperState !== "hostile" || !aabbOverlap(
    projectile.x, projectile.y, projectile.r, projectile.r,
    input.player.x, input.player.y, input.player.hw, input.player.hh,
  )) return [];
  if (input.tuning.phaseStep && input.player.dashTimer > 0) {
    const speed = Math.max(Math.hypot(projectile.vx, projectile.vy), input.tuning.projectileSpeed) * input.tuning.deflectBoost;
    const dx = input.player.dashX || input.player.facing;
    const dy = input.player.dashY || 0;
    return [
      { type: "counter-sweeper", projectileId: projectile.id, method: "phaseStep", dx, dy, speed },
      { type: "fx-burst", x: projectile.x, y: projectile.y, dx, dy, count: 9, color: input.tuning.deflectedColor },
      { type: "fx-flash", x: projectile.x, y: projectile.y, radius: 38, color: input.tuning.deflectedColor },
      { type: "floater", x: projectile.x, y: projectile.y - 18, text: "PHASE!", big: true, color: input.tuning.deflectedColor },
      { type: "add-style", style: "deflect" },
    ];
  }
  const shatter: CombatEntityIntent = { type: "shatter-sweeper", projectileId: projectile.id, reason: "playerHit" };
  return [{
    type: "damage-player",
    damage: projectile.dmg ?? input.tuning.projectileDamage,
    sourceX: projectile.x,
    sourceId: projectile.ownerId,
    cause: "sweeper",
    projectileId: projectile.id,
    onHit: [shatter, { type: "lose-style" }, { type: "sound", sound: "hurt" }],
    onAbsorbed: [shatter, { type: "shield-absorbed" }],
    onRejected: input.player.dashTimer > 0 ? [{ type: "dash-dodge", projectileId: projectile.id }] : [],
  }];
}

function planReflectedCollision(
  projectile: ProjectileState,
  input: ProjectileCollisionInput,
): readonly CombatEntityIntent[] {
  const intents: CombatEntityIntent[] = [];
  const piercedIds = new Set(projectile.piercedIds);
  for (const actor of input.actors) {
    if (actor.dead || actor.dying || (projectile.pierce && piercedIds.has(actor.id))) continue;
    if (distance(projectile.x, projectile.y, actor.x, actor.y) > projectile.r + actor.radius) continue;
    const damage = projectile.deflectDmg * input.tuning.deflectDamageMultiplier * input.tuning.runDamageMultiplier;
    intents.push(
      {
        type: "damage-enemy",
        enemyId: actor.id,
        damage,
        dx: projectile.vx,
        dy: projectile.vy,
        cause: "reflected",
        projectileId: projectile.id,
        perfect: projectile.perfect,
        sourceId: sourceId(projectile),
        parryStun: input.tuning.parryStun && !actor.isBoss ? 0.7 : 0,
        aegisParry: input.tuning.aegisParry,
        achievementTracking: input.tuning.achievementTracking,
        noteFirstPlayerDamage: true,
        emitReflectedHit: true,
      },
      { type: "fx-burst", x: projectile.x, y: projectile.y, dx: projectile.vx, dy: projectile.vy,
        count: input.tuning.sparkCount, color: input.tuning.deflectedColor },
      { type: "floater", x: actor.x, y: actor.y - 26, text: Math.round(damage).toString(), big: projectile.perfect },
      { type: "shake", amount: projectile.perfect ? input.tuning.shakeBig : input.tuning.shakeSmall },
    );
    if (projectile.pierce) {
      piercedIds.add(actor.id);
      intents.push(projectilePatch(projectile.id, { piercedIds: new Set(piercedIds) }));
    } else {
      intents.push(projectilePatch(projectile.id, { dead: true }));
      break;
    }
  }
  return intents;
}

function planHostileCollision(
  projectile: ProjectileState,
  input: ProjectileCollisionInput,
): readonly CombatEntityIntent[] {
  if (!aabbOverlap(
    projectile.x, projectile.y, projectile.r, projectile.r,
    input.player.x, input.player.y, input.player.hw, input.player.hh,
  )) return [];
  if (input.tuning.phaseStep && input.player.dashTimer > 0 && !projectile.unparryable) {
    const speed = Math.max(Math.hypot(projectile.vx, projectile.vy), input.tuning.projectileSpeed) * input.tuning.deflectBoost;
    const dx = input.player.dashX || input.player.facing;
    const dy = input.player.dashY || 0;
    return [
      { type: "deflect-projectile", projectileId: projectile.id, dx, dy, speed, perfect: false },
      { type: "fx-burst", x: projectile.x, y: projectile.y, dx: input.player.dashX, dy: input.player.dashY,
        count: 8, color: input.tuning.deflectedColor },
      { type: "fx-flash", x: projectile.x, y: projectile.y, radius: 34, color: input.tuning.deflectedColor },
      { type: "floater", x: projectile.x, y: projectile.y - 16, text: "PHASE!", big: true, color: input.tuning.deflectedColor },
      { type: "add-style", style: "deflect" },
      { type: "sound", sound: "deflect" },
    ];
  }
  const onHit: CombatEntityIntent[] = [{ type: "lose-style" }, { type: "sound", sound: "hurt" }];
  if (projectile.root > 0) {
    onHit.push(
      { type: "set-player-root", seconds: projectile.root },
      { type: "floater", x: input.player.x, y: input.player.y - 34, text: "ROOTED", big: true, color: input.tuning.rootColor },
    );
  }
  return [{
    type: "damage-player",
    damage: projectile.dmg ?? input.tuning.projectileDamage,
    sourceX: projectile.x,
    sourceId: projectile.ownerId,
    cause: "projectile",
    projectileId: projectile.id,
    acceptedProjectilePatch: { dead: true },
    onHit,
    onAbsorbed: [{ type: "shield-absorbed" }],
    onRejected: input.player.dashTimer > 0 ? [{ type: "dash-dodge", projectileId: projectile.id }] : [],
  }];
}

export function planProjectileCollisions(input: ProjectileCollisionInput): readonly CombatEntityIntent[] {
  const intents: CombatEntityIntent[] = [];
  for (const projectile of input.projectiles) {
    if (projectile.dead || projectile.bomb || projectile.mine || projectile.mud) continue;
    if (projectile.family === "sweeper") intents.push(...planSweeperCollision(projectile, input));
    else if (projectile.deflected) intents.push(...planReflectedCollision(projectile, input));
    else intents.push(...planHostileCollision(projectile, input));
  }
  return intents;
}

export interface CurveResolutionInput {
  readonly projectiles: readonly ProjectileState[];
  readonly player: Pick<ProjectilePlayerState, "x" | "y">;
  readonly dt: number;
  readonly defaultSpeed: number;
  readonly enemyShotColor: string;
}

export function resolveProjectileCurves(input: CurveResolutionInput): readonly CombatEntityIntent[] {
  if (!Number.isFinite(input.dt) || input.dt < 0) throw new RangeError("dt must be finite and non-negative");
  const intents: CombatEntityIntent[] = [];
  for (const projectile of input.projectiles) {
    if (projectile.dead || !projectile.curve || projectile.curved) continue;
    const curveT = projectile.curveT - input.dt;
    if (curveT > 0) {
      intents.push(projectilePatch(projectile.id, { curveT }));
      continue;
    }
    const speed = Math.hypot(projectile.vx, projectile.vy) || input.defaultSpeed;
    const dx = input.player.x - projectile.x;
    const dy = input.player.y - projectile.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const vx = dx / magnitude * speed;
    const vy = dy / magnitude * speed;
    intents.push(
      projectilePatch(projectile.id, { curveT, vx, vy, curved: true }),
      { type: "fx-burst", x: projectile.x, y: projectile.y, dx: vx, dy: vy, count: 4, color: input.enemyShotColor },
    );
  }
  return intents;
}

export interface SpecialProjectileInput {
  readonly projectiles: readonly ProjectileState[];
  readonly actors: readonly CombatActorState[];
  readonly player: Pick<ProjectilePlayerState, "x" | "y" | "hw" | "hh">;
  readonly dt: number;
  readonly tuning: SpecialProjectileTuning;
  readonly achievementTracking: boolean;
  readonly nextSlowZoneSequence: number;
}

export interface SpecialProjectileResolution {
  readonly nextSlowZoneSequence: number;
  readonly intents: readonly CombatEntityIntent[];
}

function explosionFeedback(tuning: SpecialProjectileTuning, deflected: boolean, x: number, y: number): CombatEntityIntent[] {
  return [
    { type: "fx-explode", x, y, color: deflected ? tuning.perfectColor : tuning.bomberColor, scale: deflected ? 1.5 : 1.2 },
    { type: "shake", amount: tuning.shakeBig },
    { type: "flash", amount: tuning.flashParry * (deflected ? 0.9 : 0.6) },
    { type: "sound", sound: "boom" },
  ];
}

export function planBombExplosion(
  x: number,
  y: number,
  deflected: boolean,
  source: EntityId | null,
  actors: readonly CombatActorState[],
  player: Pick<ProjectilePlayerState, "x" | "y" | "hw">,
  tuning: SpecialProjectileTuning,
  achievementTracking: boolean,
): readonly CombatEntityIntent[] {
  const intents = explosionFeedback(tuning, deflected, x, y);
  if (deflected) {
    const bomberIds = actors.filter((actor) => !actor.dead && actor.isBomber &&
      distance(actor.x, actor.y, x, y) <= tuning.blastRadius + actor.radius).map((actor) => actor.id);
    intents.push({
      type: "damage-enemy-aoe",
      x,
      y,
      radius: tuning.blastRadius,
      damage: tuning.blastDamage * 1.3,
      playerOwned: true,
      sourceId: source,
      achievement: achievementTracking ? { kind: "deflected-bomb", bomberIds, minimumKills: 5 } : null,
    });
  } else if (distance(player.x, player.y, x, y) <= tuning.blastRadius + player.hw) {
    intents.push({
      type: "damage-player",
      damage: tuning.blastDamage,
      sourceX: x,
      sourceId: source,
      cause: "bomb",
      onHit: [{ type: "lose-style" }, { type: "sound", sound: "hurt" }],
      onAbsorbed: [{ type: "shield-absorbed" }],
      onRejected: [],
    });
  }
  return intents;
}

export function planBomberDeathExplosion(
  bomber: CombatActorState,
  player: Pick<ProjectilePlayerState, "x" | "y" | "hw">,
  tuning: SpecialProjectileTuning,
  achievementTracking: boolean,
): readonly CombatEntityIntent[] {
  const intents: CombatEntityIntent[] = [
    { type: "fx-explode", x: bomber.x, y: bomber.y, color: tuning.bomberColor, scale: 1.35 },
    { type: "shake", amount: tuning.shakeBig },
    { type: "flash", amount: tuning.flashParry * 0.5 },
    { type: "sound", sound: "boom" },
    {
      type: "damage-enemy-aoe",
      x: bomber.x,
      y: bomber.y,
      radius: tuning.blastRadius,
      damage: tuning.blastDamage,
      playerOwned: false,
      sourceId: bomber.id,
      achievement: achievementTracking ? { kind: "bomber-betrayal" } : null,
    },
  ];
  if (distance(player.x, player.y, bomber.x, bomber.y) <= tuning.blastRadius + player.hw) {
    intents.push({
      type: "damage-player",
      damage: tuning.blastDamage,
      sourceX: bomber.x,
      sourceId: bomber.id,
      cause: "bomber-death",
      onHit: [{ type: "lose-style" }, { type: "sound", sound: "hurt" }],
      onAbsorbed: [{ type: "shield-absorbed" }],
      onRejected: [],
    });
  }
  return intents;
}

export function resolveSpecialProjectiles(input: SpecialProjectileInput): SpecialProjectileResolution {
  if (!Number.isFinite(input.dt) || input.dt < 0) throw new RangeError("dt must be finite and non-negative");
  const intents: CombatEntityIntent[] = [];
  let nextSlowZoneSequence = input.nextSlowZoneSequence;
  for (const projectile of input.projectiles) {
    if (projectile.dead) continue;
    if (projectile.bomb) {
      const hitGround = projectile.y + projectile.r >= input.tuning.groundY;
      const hitEnemy = projectile.deflected && input.actors.some((actor) => !actor.dead && actor.spawnT <= 0 &&
        distance(projectile.x, projectile.y, actor.x, actor.y) <= projectile.r + actor.radius);
      const hitPlayer = !projectile.deflected && aabbOverlap(
        projectile.x, projectile.y, projectile.r, projectile.r,
        input.player.x, input.player.y, input.player.hw, input.player.hh,
      );
      if (hitGround || hitEnemy || hitPlayer) {
        const y = Math.min(projectile.y, input.tuning.groundY - 2);
        intents.push(...planBombExplosion(projectile.x, y, projectile.deflected, sourceId(projectile),
          input.actors, input.player, input.tuning, input.achievementTracking));
        intents.push(projectilePatch(projectile.id, { dead: true }));
      }
    } else if (projectile.mud) {
      if (projectile.y + projectile.r >= input.tuning.groundY) {
        const zone: SlowZoneState = {
          id: `sludge-zone:${String(nextSlowZoneSequence)}`,
          x: projectile.x,
          y: input.tuning.groundY,
          r: input.tuning.sludgeZoneRadius,
          life: input.tuning.sludgeZoneLife,
        };
        nextSlowZoneSequence += 1;
        intents.push(
          { type: "add-slow-zone", zone },
          { type: "fx-burst", x: projectile.x, y: input.tuning.groundY, dx: 0, dy: -1, count: 8, color: input.tuning.sludgeColor },
          projectilePatch(projectile.id, { dead: true }),
        );
      }
    } else if (projectile.mine) {
      const patch: { x?: number; y?: number; vx?: number; vy?: number; armed?: boolean; armT?: number; life: number; dead?: boolean } = { life: 6 };
      if (projectile.y + projectile.r >= input.tuning.groundY) {
        patch.y = input.tuning.groundY - projectile.r;
        patch.vx = 0;
        patch.vy = 0;
      }
      if (!projectile.armed) {
        patch.armT = projectile.armT - input.dt;
        if (patch.armT <= 0) patch.armed = true;
      }
      const resolvedY = patch.y ?? projectile.y;
      if (projectile.armed && !projectile.deflected &&
        distance(input.player.x, input.player.y, projectile.x, resolvedY) < projectile.r + input.tuning.mineTrigger) {
        intents.push(...planBombExplosion(projectile.x, resolvedY, false, sourceId(projectile),
          input.actors, input.player, input.tuning, input.achievementTracking));
        patch.dead = true;
      }
      intents.push(projectilePatch(projectile.id, patch));
    }
  }
  return { nextSlowZoneSequence, intents };
}
