import type { EnvironmentGeometry, EnvironmentObjectState, EnvironmentPoint } from "./environment-contracts";

/**
 * Damage a stage object deals by touch, declared on the object itself. The environment runtime is the
 * only code that applies it: once per object per target, while the object is active.
 */
export interface EnvironmentContactDamage {
  readonly damage: number;
  /** False keeps the object harmless (a route that only shows the way). */
  readonly threatening: boolean;
  /** Targets this object has already hit; it never hits one twice. */
  readonly hitActorIds: readonly string[];
  /** True when the target's hazard damage multiplier applies. */
  readonly hazardScaled?: boolean;
}

/** Who stage objects can hurt. The owner's ID lets the binding name the attacker. */
export interface EnvironmentContactTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly invulnerable: boolean;
  readonly hazardDamageMultiplier: number;
  readonly takeDamage: (damage: number, sourceX: number, ownerId: string | null) => void;
}

type ContactEntry = Readonly<{
  state: EnvironmentObjectState;
  ownerId: string | null;
  geometry?: EnvironmentGeometry;
  points?: readonly EnvironmentPoint[];
  width?: number;
  eligibility?: Readonly<{ player: boolean }>;
}>;

/** The declaration on an entry, or undefined when the entry deals no contact damage. */
export function environmentContactDamage(entry: object): EnvironmentContactDamage | undefined {
  const candidate = entry as Partial<EnvironmentContactDamage>;
  if (typeof candidate.damage !== "number" || typeof candidate.threatening !== "boolean") return undefined;
  if (!Array.isArray(candidate.hitActorIds)) return undefined;
  return candidate as EnvironmentContactDamage;
}

function pointSegmentDistance(x: number, y: number, start: EnvironmentPoint, end: EnvironmentPoint): number {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - start.x, y - start.y);
  const amount = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared));
  return Math.hypot(x - (start.x + dx * amount), y - (start.y + dy * amount));
}

/** A route touches within half its width of its path; anything else by its box. */
function touches(entry: ContactEntry, target: EnvironmentContactTarget): boolean {
  if (entry.points !== undefined && entry.width !== undefined) {
    const reach = entry.width / 2 + Math.max(target.hw, target.hh);
    for (let index = 1; index < entry.points.length; index += 1) {
      const start = entry.points[index - 1],
        end = entry.points[index];
      if (start !== undefined && end !== undefined && pointSegmentDistance(target.x, target.y, start, end) <= reach)
        return true;
    }
    return false;
  }
  const g = entry.geometry;
  if (g === undefined) return false;
  return (
    target.x + target.hw >= g.x &&
    target.x - target.hw <= g.x + (g.w ?? 0) &&
    target.y + target.hh >= g.y &&
    target.y - target.hh <= g.y + (g.h ?? 0)
  );
}

function sourceX(entry: ContactEntry): number {
  if (entry.points !== undefined) return entry.points[0]?.x ?? 0;
  const g = entry.geometry;
  return g === undefined ? 0 : g.x + (g.w ?? 0) / 2;
}

/**
 * Applies one entry's declared contact damage to the targets it touches and returns the target IDs it
 * hit this time (empty when nothing changed). The caller records them on the entry.
 */
export function applyEnvironmentContactDamage(
  entry: ContactEntry,
  declaration: EnvironmentContactDamage,
  targets: readonly EnvironmentContactTarget[],
): readonly string[] {
  if (entry.state !== "active" || !declaration.threatening || entry.eligibility?.player === false) return [];
  const hit: string[] = [];
  for (const target of targets) {
    if (target.invulnerable || declaration.hitActorIds.includes(target.id) || hit.includes(target.id)) continue;
    if (!touches(entry, target)) continue;
    hit.push(target.id);
    const scale = declaration.hazardScaled === true ? target.hazardDamageMultiplier : 1;
    target.takeDamage(declaration.damage * scale, sourceX(entry), entry.ownerId);
  }
  return hit;
}
