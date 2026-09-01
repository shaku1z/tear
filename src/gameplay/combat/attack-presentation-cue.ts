import type { WeaponId } from "../weapon-selection";

export type AttackPresentationAction = "held" | "throw" | "projectile" | "secondary" | "parry" | "impact" | "catch" | "kill";
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
