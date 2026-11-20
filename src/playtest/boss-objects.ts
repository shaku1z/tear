import type { TearAgentObservation } from "../agents/contracts";
import type { TearObservedActorV1, TearObservationV1 } from "../tearbench/contracts";

/**
 * A thing on the stage a weapon can cut: a Graft, a cage wall, a root. Read from the observation, which gives
 * every such object the environment owns, so a new kind needs no edit here.
 */
export interface CuttableObject {
  readonly id: string;
  /** What it is, without its owner or its counter: "graft mercy", "root-cage left", "regrowth". */
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  /** Planted and not yet cut or gone. */
  readonly standing: boolean;
  readonly cut: boolean;
  readonly integrityRatio: number;
}

/** The observed kinds that are not enemies; the scripted player targets every other kind. */
const NOT_ENEMIES: readonly string[] = ["platform", "hazard", "projectile"];

/** A counter in an object id: a generation ("g2") or an index ("3"). */
const COUNTER = /^g?\d+$/u;

function objectName(id: string, ownerId: string | undefined): string {
  const own = ownerId !== undefined && id.startsWith(`${ownerId}:`) ? id.slice(ownerId.length + 1) : id;
  return own
    .split(":")
    .filter((part) => !COUNTER.test(part))
    .join(" ");
}

export function readCuttableObjects(state: TearObservationV1): readonly CuttableObject[] {
  return (state.environment?.combatObjects ?? []).map((object) => {
    const { minX, maxX, minY, maxY } = object.bounds;
    return {
      id: object.id,
      name: objectName(object.id, object.ownerId),
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      hw: (maxX - minX) / 2,
      hh: (maxY - minY) / 2,
      standing: object.state === "warning" || object.state === "active",
      cut: object.state === "destroyed",
      integrityRatio: object.integrityRatio,
    };
  });
}

export interface ObjectCount {
  /** Times one was planted. */
  placed: number;
  /** Times the player cut one down. */
  cut: number;
  /** Ticks one stood, summed over every one standing. */
  standingTicks: number;
}

/**
 * Counts, tick by tick, what was planted, how long it stood and what the player cut. An object that leaves
 * without being cut (the boss took it back, the phase ended) is counted as placed only.
 */
export function createObjectCounter(): (
  counts: Record<string, ObjectCount>,
  objects: readonly CuttableObject[],
) => void {
  const standing = new Set<string>();
  return (counts, objects) => {
    for (const object of objects) {
      const count = (counts[object.name] ??= { placed: 0, cut: 0, standingTicks: 0 });
      if (object.standing) {
        if (!standing.has(object.id)) count.placed += 1;
        standing.add(object.id);
        count.standingTicks += 1;
      } else if (standing.delete(object.id) && object.cut) count.cut += 1;
    }
    for (const id of standing) if (!objects.some((object) => object.id === id)) standing.delete(id);
  };
}

/**
 * How the cutting player goes about it. One place, in simulation ticks (120 a second) and world pixels.
 */
export const OBJECT_CUTTING = Object.freeze({
  /** Stand within this far of the middle of the object, sideways, and swing. */
  standPixels: 40,
  /** Jump when the middle of the object is more than this far above the middle of the player. */
  jumpAbovePixels: 40,
  /** Leave an object alone once this many ticks (6 s) of trying have not damaged it: it is out of reach. */
  giveUpTicks: 720,
});

/**
 * Chooses what to cut: the nearest standing object, kept until it is cut or gone, so the player does not
 * turn back and forth between two. One it has not damaged in `giveUpTicks` is left for as long as it stands.
 */
export function createObjectChoice(): (state: TearObservationV1) => CuttableObject | undefined {
  let chosen: string | undefined;
  let integrity = 0;
  let since = 0;
  const left = new Set<string>();
  return (state) => {
    const { player, tick } = state;
    const standing = readCuttableObjects(state).filter((object) => object.standing);
    for (const id of left) if (!standing.some((object) => object.id === id)) left.delete(id);
    let target = standing.find((object) => object.id === chosen);
    if (target !== undefined && target.integrityRatio < integrity) since = tick;
    if (target !== undefined && tick - since >= OBJECT_CUTTING.giveUpTicks) {
      left.add(target.id);
      target = undefined;
    }
    if (target === undefined) {
      const distance = (object: CuttableObject): number => Math.hypot(object.x - player.x, object.y - player.y);
      target = standing
        .filter((object) => !left.has(object.id))
        .sort((first, second) => distance(first) - distance(second) || first.id.localeCompare(second.id))[0];
      since = tick;
    }
    chosen = target?.id;
    integrity = target?.integrityRatio ?? 0;
    return target;
  };
}

/**
 * The observation with this object in place of the enemies, so the scripted player aims and swings at it as it
 * would at an enemy. Projectiles stay, so it still dodges. Unchanged before any enemy is in play.
 */
export function aimAtObject(observation: TearAgentObservation, object: CuttableObject): TearAgentObservation {
  const { entities } = observation.state;
  const isEnemy = (entity: TearObservedActorV1): boolean => !NOT_ENEMIES.includes(entity.kind);
  const enemy = entities.find(isEnemy);
  if (enemy === undefined) return observation;
  const standIn: TearObservedActorV1 = {
    id: object.id,
    kind: enemy.kind,
    x: object.x,
    y: object.y,
    vx: 0,
    vy: 0,
    hpRatio: object.integrityRatio,
    state: "idle",
    halfWidth: object.hw,
    halfHeight: object.hh,
  };
  return {
    ...observation,
    state: { ...observation.state, entities: [standIn, ...entities.filter((entity) => !isEnemy(entity))] },
  };
}
