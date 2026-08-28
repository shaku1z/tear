import { segCircle, segSegmentDist } from "../../domain/geometry";
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
  let considered = 0, accepted = 0, damaged = 0, destroyed = 0;
  const attackId = `${input.blade.weapon?.id ?? "unknown"}:held:swing:${String(input.blade.swingId)}`;
  for (const object of input.environment.combatObjects()) {
    if (object.state === "destroyed" || object.state === "expired" || !intersects(input.segment, object.geometry)) continue;
    considered += 1;
    if (!input.environment.resolveCombatObjectCounterplay(object.id, capability).accepted) continue;
    accepted += 1;
    const result = input.environment.damageCombatObject(object.id, damage, attackId, input.tick);
    if (result.accepted) damaged += 1;
    if (result.destroyed) destroyed += 1;
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
      const previous = points[index - 1], current = points[index];
      if (previous !== undefined && current !== undefined
        && segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2,
          previous.x, previous.y, current.x, current.y) <= segment.pad) return true;
    }
  }
  if (geometry.radius !== undefined) {
    return segCircle(segment.x1, segment.y1, segment.x2, segment.y2,
      geometry.x, geometry.y, geometry.radius + segment.pad);
  }
  const width = geometry.w ?? 0, height = geometry.h ?? 0;
  if (!(width > 0) || !(height > 0)) return false;
  const left = geometry.x - segment.pad, top = geometry.y - segment.pad;
  const right = geometry.x + width + segment.pad, bottom = geometry.y + height + segment.pad;
  if (inside(segment.x1, segment.y1, left, top, right, bottom)
    || inside(segment.x2, segment.y2, left, top, right, bottom)) return true;
  return segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2, left, top, right, top) === 0
    || segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2, right, top, right, bottom) === 0
    || segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2, right, bottom, left, bottom) === 0
    || segSegmentDist(segment.x1, segment.y1, segment.x2, segment.y2, left, bottom, left, top) === 0;
}

function inside(x: number, y: number, left: number, top: number, right: number, bottom: number): boolean {
  return x >= left && x <= right && y >= top && y <= bottom;
}
