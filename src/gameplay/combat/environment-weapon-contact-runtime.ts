import { segCircle, segPointDist, segSegmentDist } from "../../domain/geometry";
import type { EnvironmentCombatObjectState, EnvironmentGeometry } from "../environment/environment-contracts";
import type { EnvironmentDamageResult, EnvironmentCounterplayResolution } from "../environment/combat-object-runtime";
import type { EnvironmentCounterplayTag } from "../environment/environment-definitions";

export interface EnvironmentWeaponContactPort {
  combatObjects(): readonly EnvironmentCombatObjectState[];
  resolveCombatObjectCounterplay(id: string, capability: EnvironmentCounterplayTag): EnvironmentCounterplayResolution;
  damageCombatObject(id: string, amount: number, attackId: string, tick?: number): EnvironmentDamageResult;
}

export interface HeldEnvironmentWeaponContactInput {
  readonly environment: EnvironmentWeaponContactPort;
  readonly blade: Readonly<{
    state: string;
    swingId: number;
    weapon?: Readonly<{
      id: string;
      environmentCounterplay?: Readonly<{ held?: EnvironmentCounterplayTag }>;
    }> | null;
    damageAt(): number;
  }>;
  readonly segment: Readonly<{ x1: number; y1: number; x2: number; y2: number; pad: number }>;
  readonly tick?: number;
}

export interface EnvironmentWeaponContactResult {
  readonly considered: number;
  readonly accepted: number;
  readonly damaged: number;
  readonly destroyed: number;
}

export interface EnvironmentWeaponProjectileContactInput {
  readonly environment: EnvironmentWeaponContactPort;
  readonly weapon: Readonly<{
    id: string;
    environmentCounterplay?: Readonly<{ projectile?: EnvironmentCounterplayTag }>;
  }>;
  readonly projectiles: readonly {
    x: number;
    y: number;
    r?: number;
    dead: boolean;
    dmg?: number | null;
    family?: string;
    playerOwned?: boolean;
    weaponId?: string | null;
    attackId?: number;
    secondary?: boolean;
  }[];
  readonly tick?: number;
}

/**
 * Resolves held weapon geometry against environment-owned combat objects.
 * Enemy hit hooks are intentionally absent: objects cannot become Reversal or
 * Threadcut targets, award enemy rewards, or enter ordinary proc pipelines.
 */
export function resolveHeldEnvironmentWeaponContacts(
  input: HeldEnvironmentWeaponContactInput,
): EnvironmentWeaponContactResult {
  const capability = input.blade.weapon?.environmentCounterplay?.held;
  const damage = input.blade.damageAt();
  if (input.blade.state !== "held" || capability === undefined || !(damage > 0)) return emptyResult();
  const attackId = `${input.blade.weapon?.id ?? "unknown"}:held:swing:${String(input.blade.swingId)}`;
  return cutAlong(input.environment, input.segment, { capability, damage, attackId, tick: input.tick });
}

/** One blade segment against every standing object: each object the blade may cut takes the attack once. */
function cutAlong(
  environment: EnvironmentWeaponContactPort,
  segment: HeldEnvironmentWeaponContactInput["segment"],
  cut: Readonly<{ capability: EnvironmentCounterplayTag; damage: number; attackId: string; tick: number | undefined }>,
): EnvironmentWeaponContactResult {
  let considered = 0,
    accepted = 0,
    damaged = 0,
    destroyed = 0;
  for (const object of environment.combatObjects()) {
    if (object.state === "destroyed" || object.state === "expired" || !intersects(segment, object.geometry)) continue;
    considered += 1;
    if (!environment.resolveCombatObjectCounterplay(object.id, cut.capability).accepted) continue;
    accepted += 1;
    const result = environment.damageCombatObject(object.id, cut.damage, cut.attackId, cut.tick);
    if (result.accepted) damaged += 1;
    if (result.destroyed) destroyed += 1;
  }
  return Object.freeze({ considered, accepted, damaged, destroyed });
}

export interface ThrownEnvironmentWeaponContactInput {
  readonly environment: EnvironmentWeaponContactPort;
  readonly blade: Readonly<{
    thrown: boolean;
    state: string;
    throwId: number;
    throwDmg: number;
    weapon?: Readonly<{
      id: string;
      environmentCounterplay?: Readonly<{ held?: EnvironmentCounterplayTag }>;
    }> | null;
  }>;
  readonly segment: Readonly<{ x1: number; y1: number; x2: number; y2: number }>;
  readonly pad: number;
  readonly tick?: number;
}

/**
 * A thrown blade cuts whatever the same blade cuts when held: the flying blade's segment against
 * environment-owned combat objects, once on the way out and once on the way back. As with the held blade,
 * enemy hit hooks are absent.
 */
export function resolveThrownEnvironmentWeaponContacts(
  input: ThrownEnvironmentWeaponContactInput,
): EnvironmentWeaponContactResult {
  const { blade } = input;
  const capability = blade.weapon?.environmentCounterplay?.held;
  if (!blade.thrown || (blade.state !== "flying" && blade.state !== "returning")) return emptyResult();
  if (capability === undefined || !(blade.throwDmg > 0)) return emptyResult();
  const attackId = `${blade.weapon?.id ?? "unknown"}:throw:${String(blade.throwId)}:${blade.state}`;
  const segment = { ...input.segment, pad: input.pad };
  return cutAlong(input.environment, segment, { capability, damage: blade.throwDmg, attackId, tick: input.tick });
}

/** Resolves player-owned cutting projectiles without invoking enemy throw-hit mechanics. */
export function resolveEnvironmentWeaponProjectileContacts(
  input: EnvironmentWeaponProjectileContactInput,
): EnvironmentWeaponContactResult {
  const capability = input.weapon.environmentCounterplay?.projectile;
  if (capability === undefined) return emptyResult();
  let considered = 0,
    accepted = 0,
    damaged = 0,
    destroyed = 0;
  for (const projectile of input.projectiles) {
    if (
      projectile.dead ||
      projectile.family !== "weaponProjectile" ||
      projectile.playerOwned !== true ||
      projectile.weaponId !== input.weapon.id ||
      projectile.secondary === true
    )
      continue;
    const damage = projectile.dmg ?? 0;
    if (!(damage > 0) || !Number.isSafeInteger(projectile.attackId) || (projectile.attackId ?? 0) < 1) continue;
    for (const object of input.environment.combatObjects()) {
      if (
        object.state === "destroyed" ||
        object.state === "expired" ||
        !intersectsCircle(projectile.x, projectile.y, projectile.r ?? 0, object.geometry)
      )
        continue;
      considered += 1;
      if (!input.environment.resolveCombatObjectCounterplay(object.id, capability).accepted) continue;
      accepted += 1;
      const attackId = `${input.weapon.id}:projectile:${String(projectile.attackId)}`;
      const result = input.environment.damageCombatObject(object.id, damage, attackId, input.tick);
      if (result.accepted) damaged += 1;
      if (result.destroyed) destroyed += 1;
      projectile.dead = true;
      break;
    }
  }
  return Object.freeze({ considered, accepted, damaged, destroyed });
}

function emptyResult(): EnvironmentWeaponContactResult {
  return Object.freeze({ considered: 0, accepted: 0, damaged: 0, destroyed: 0 });
}

function intersects(segment: HeldEnvironmentWeaponContactInput["segment"], geometry: EnvironmentGeometry): boolean {
  const points = geometry.points;
  if (points !== undefined && points.length > 1) {
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1],
        current = points[index];
      if (
        previous !== undefined &&
        current !== undefined &&
        segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2, previous.x, previous.y, current.x, current.y) <=
          segment.pad
      )
        return true;
    }
  }
  if (geometry.radius !== undefined) {
    return segCircle(
      segment.x1,
      segment.y1,
      segment.x2,
      segment.y2,
      geometry.x,
      geometry.y,
      geometry.radius + segment.pad,
    );
  }
  const width = geometry.w ?? 0,
    height = geometry.h ?? 0;
  if (!(width > 0) || !(height > 0)) return false;
  const left = geometry.x - segment.pad,
    top = geometry.y - segment.pad;
  const right = geometry.x + width + segment.pad,
    bottom = geometry.y + height + segment.pad;
  if (
    inside(segment.x1, segment.y1, left, top, right, bottom) ||
    inside(segment.x2, segment.y2, left, top, right, bottom)
  )
    return true;
  return (
    segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2, left, top, right, top) === 0 ||
    segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2, right, top, right, bottom) === 0 ||
    segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2, right, bottom, left, bottom) === 0 ||
    segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2, left, bottom, left, top) === 0
  );
}

function intersectsCircle(x: number, y: number, radius: number, geometry: EnvironmentGeometry): boolean {
  const points = geometry.points;
  if (points !== undefined && points.length > 1) {
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1],
        current = points[index];
      if (
        previous !== undefined &&
        current !== undefined &&
        segPointDist(previous.x, previous.y, current.x, current.y, x, y).dist <= radius
      )
        return true;
    }
  }
  if (geometry.radius !== undefined) return Math.hypot(x - geometry.x, y - geometry.y) <= radius + geometry.radius;
  const width = geometry.w ?? 0,
    height = geometry.h ?? 0;
  if (!(width > 0) || !(height > 0)) return false;
  const closestX = Math.max(geometry.x, Math.min(x, geometry.x + width));
  const closestY = Math.max(geometry.y, Math.min(y, geometry.y + height));
  return Math.hypot(x - closestX, y - closestY) <= radius;
}

function inside(x: number, y: number, left: number, top: number, right: number, bottom: number): boolean {
  return x >= left && x <= right && y >= top && y <= bottom;
}
