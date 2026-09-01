import { isWeaponId } from "../../gameplay/weapon-selection";
import type {
  AttackPresentationAction,
  AttackPresentationCue,
  AttackPresentationPhase,
} from "../../gameplay/combat/attack-presentation-cue";

const PREFIX = "attack:v1";
const ACTIONS = new Set<AttackPresentationAction>(["held", "throw", "projectile", "secondary", "parry", "impact", "catch", "kill"]);
const PHASES = new Set<AttackPresentationPhase>(["start", "contact", "impact", "resolve", "return", "parry", "kill"]);

/** Compact, versioned cosmetic projection for legacy visual replay packets. */
export function encodeAttackPresentationEffect(cue: AttackPresentationCue): string {
  const offsetX = Math.round(cue.sourceX - cue.x), offsetY = Math.round(cue.sourceY - cue.y);
  return [PREFIX, cue.weaponId, cue.action, cue.phase, cue.variant,
    offsetX, offsetY, Math.round(cue.directionX), Math.round(cue.directionY), Math.round(cue.intensity * 100)].join(":");
}

export function decodeAttackPresentationEffect(effect: string, x: number, y: number, attackId: number): AttackPresentationCue | null {
  const [family, version, weaponId, action, phase, variant, offsetX, offsetY, directionX, directionY, intensity] = effect.split(":");
  if (`${family ?? ""}:${version ?? ""}` !== PREFIX || weaponId === undefined || !isWeaponId(weaponId)
    || !ACTIONS.has(action as AttackPresentationAction) || !PHASES.has(phase as AttackPresentationPhase)
    || variant === undefined || variant.length === 0) return null;
  const values = [offsetX, offsetY, directionX, directionY, intensity].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [sourceOffsetX = 0, sourceOffsetY = 0, dx = 0, dy = 0, strength = 0] = values;
  const bounded = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));
  return Object.freeze({ weaponId, attackId, action: action as AttackPresentationAction,
    phase: phase as AttackPresentationPhase, variant,
    sourceX: x + bounded(sourceOffsetX, 4096), sourceY: y + bounded(sourceOffsetY, 4096), x, y,
    directionX: bounded(dx, 5000), directionY: bounded(dy, 5000),
    intensity: Math.max(0, Math.min(1, strength / 100)) });
}
