import { clamp } from "../../domain/geometry";
import type { BladeSlingReleaseEvent, BladeWeaponProjectileEvent } from "../entities/blade-contracts";
import type { WeaponId } from "../weapon-selection";

export type AttackPresentationAction =
  "held" | "throw" | "projectile" | "secondary" | "parry" | "impact" | "catch" | "kill";
export type AttackPresentationPhase = "start" | "contact" | "impact" | "resolve" | "return" | "parry" | "kill";
export type AttackPresentationMaterial = "flesh" | "metal" | "stone" | "air";

/**
 * Deterministic combat fact consumed by presentation. Canvas, sound, camera,
 * particle counts, and cosmetic randomness stay on the adapter side.
 */
export interface AttackPresentationCue {
  readonly weaponId: WeaponId;
  readonly attackId: number;
  readonly swingId?: number;
  readonly throwId?: number;
  readonly action: AttackPresentationAction;
  readonly phase: AttackPresentationPhase;
  readonly variant: string;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly x: number;
  readonly y: number;
  readonly directionX: number;
  readonly directionY: number;
  /** Optional presentation-only surface response. It never participates in collision or damage. */
  readonly normalX?: number;
  readonly normalY?: number;
  readonly material?: AttackPresentationMaterial;
  readonly intensity: number;
}

export interface AttackPresentationCueSink {
  emit(cue: AttackPresentationCue): void;
}

/*
 * The cues the weapon actions and a thrown blade's world impact make. Play and a replay's world both build them
 * here, so a replay presents an attack as play did.
 */

/** The Chainblade's sling: the blade released along its swing. */
export function slingReleaseCue(event: BladeSlingReleaseEvent, maximumReleaseSpeed: number): AttackPresentationCue {
  return {
    weaponId: "chainblade",
    attackId: event.attackId,
    throwId: event.throwId,
    action: "secondary",
    phase: "return",
    variant: "sling",
    sourceX: event.sourceX,
    sourceY: event.sourceY,
    x: event.x,
    y: event.y,
    directionX: event.vx,
    directionY: event.vy,
    normalX: -event.vy,
    normalY: event.vx,
    material: "air",
    intensity: clamp(Math.hypot(event.vx, event.vy) / Math.max(1, maximumReleaseSpeed), 0, 1),
  };
}

/** A Riftlock round leaving the muzzle; a secondary one is the backblast. */
export function riftlockRoundCue(event: BladeWeaponProjectileEvent, projectileSpeed: number): AttackPresentationCue {
  return {
    weaponId: "riftlock",
    attackId: event.attackId,
    throwId: event.throwId,
    action: "projectile",
    phase: "start",
    variant: event.secondary ? "backblastRound" : "razorRound",
    sourceX: event.x,
    sourceY: event.y,
    x: event.x,
    y: event.y,
    directionX: event.vx,
    directionY: event.vy,
    material: "air",
    intensity: clamp(Math.hypot(event.vx, event.vy) / Math.max(1, projectileSpeed), 0, 1),
  };
}

/** The thrown blade the world impact reads. */
export interface WorldImpactBlade {
  readonly attackId: number;
  readonly swingId?: number;
  readonly throwId?: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly impactVX?: number | null;
  readonly impactVY?: number | null;
  readonly throwOrigin?: Readonly<{ x: number; y: number }> | null;
}

/** A thrown blade striking the world: the Hammer's meteor and the Greatsword's wheel cut; null for any other. */
export function worldImpactCue(
  runWeaponId: string,
  mechanic: string | undefined,
  blade: WorldImpactBlade,
  maximumThrowSpeed: number,
): AttackPresentationCue | null {
  const weaponId =
    mechanic === "meteor" && runWeaponId === "hammer"
      ? "hammer"
      : mechanic === "wheelCut" && runWeaponId === "greatsword"
        ? "greatsword"
        : null;
  if (weaponId === null) return null;
  const directionX = blade.impactVX ?? blade.vx,
    directionY = blade.impactVY ?? blade.vy;
  return {
    weaponId,
    attackId: blade.attackId,
    ...(blade.swingId === undefined ? {} : { swingId: blade.swingId }),
    ...(blade.throwId === undefined ? {} : { throwId: blade.throwId }),
    action: "impact",
    phase: "impact",
    variant: weaponId === "hammer" ? "meteor" : "wheelCut",
    sourceX: blade.throwOrigin?.x ?? blade.x,
    sourceY: blade.throwOrigin?.y ?? blade.y,
    x: blade.x,
    y: blade.y,
    directionX,
    directionY,
    normalX: 0,
    normalY: -1,
    material: "stone",
    intensity: clamp(Math.hypot(directionX, directionY) / Math.max(1, maximumThrowSpeed), 0, 1),
  };
}
