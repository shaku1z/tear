import type { GameEnemy, GameFloater } from "./game-runtime-state";

export function isGameEnemy(value: unknown): value is GameEnemy {
  return typeof value === "object" && value !== null
    && "cfg" in value && "hit" in value && "damageTakenMult" in value && "x" in value && "y" in value;
}

export function isDodgeProjectile(value: unknown): value is Readonly<{ _dodged?: boolean }> {
  return typeof value === "object" && value !== null;
}

export function isRitualCue(value: unknown): value is Readonly<{ id: string }> {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
}

export function isEnemySample(value: GameEnemy): value is GameEnemy & { _gid?: number } {
  return value._gid === undefined || typeof value._gid === "number";
}

export function isCombatPlatform(
  value: unknown,
): value is Readonly<{ x: number; y: number; w: number; h: number }> {
  return typeof value === "object" && value !== null
    && "x" in value && typeof value.x === "number" && "y" in value && typeof value.y === "number"
    && "w" in value && typeof value.w === "number" && "h" in value && typeof value.h === "number";
}

export function isGameFloater(value: { y: number; life: number }): value is GameFloater {
  return "x" in value && "text" in value && "big" in value && "col" in value;
}

export function isWeaponEffect(value: unknown): value is Readonly<{ mechanic?: string }> {
  return typeof value === "object" && value !== null
    && (!("mechanic" in value) || typeof value.mechanic === "string");
}

export function makeCombatEnemy(value: unknown): GameEnemy {
  if (!isGameEnemy(value)) throw new TypeError("Combat enemy factory returned an incompatible actor");
  return value;
}
