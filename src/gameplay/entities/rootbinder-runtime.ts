import type { EnvironmentCombatObjectState } from "../environment/environment-contracts";
import { environmentObjectDefinition } from "../environment/environment-definitions";

/**
 * The Rootbinder: a support that walks away from the player, plants itself and roots allies in reach. A
 * rooted ally cannot be flung or lifted until its root is cut. Every number of the enemy's behaviour is in
 * this table; its body (size, health, speed) is in `CONFIG.rootbinder`.
 */
export const ROOTBINDER_RULES = Object.freeze({
  ticksPerSecond: 120,
  /** It plants only once the player is at least this far away, or once it has walked `maxWalkTicks`. */
  standoff: 300,
  walkTicks: 60,
  maxWalkTicks: 360,
  /** The plant wind-up, in which it stands still and shows that it is about to root. */
  plantWindupTicks: 72,
  /** Planted with no ally rooted for this long, it pulls up and walks again. */
  idlePlantedTicks: 360,
  /** Uprooted, it is stunned in place; then it walks for `recoverTicks` before it may plant again. */
  uprootedTicks: 144,
  recoverTicks: 480,
  /** Allies it roots at once, how near one must stand to be rooted, and how far one may stray before the root snaps. */
  maxLinks: 2,
  linkReach: 420,
  linkMaxLength: 520,
  /** Damage it takes while planted or uprooted, as a multiple. */
  plantedDamageTaken: 1.3,
  /** One hit of at least this share of its full health uproots it. */
  uprootHitShare: 0.3,
  /** How long an ally staggers when its root is cut. */
  freedStaggerSeconds: 0.5,
  /** Upward speed given to an ally cut free while it stands in an active lift field. */
  cutLaunchSpeed: 900,
});

export type RootbinderPhase = "walk" | "plant-windup" | "planted" | "uprooted" | "recover";

/** Phases in which the Rootbinder stands still. */
export function rootbinderStandsStill(phase: RootbinderPhase): boolean {
  return phase === "plant-windup" || phase === "planted" || phase === "uprooted";
}

/** Phases in which it is open: it takes more damage and its body does not hurt. */
export function rootbinderIsOpen(phase: RootbinderPhase): boolean {
  return phase === "planted" || phase === "uprooted";
}

export interface RootbinderState {
  readonly state: RootbinderPhase;
  /** Absolute simulation tick at which this phase began. */
  readonly stateTick: number;
  /** Absolute simulation tick at which this phase is due to end. */
  readonly transitionTick: number;
  /** Absolute simulation tick reached by the authoritative fixed-step owner. */
  readonly simulationTick: number;
}

/** What the Rootbinder reads from the world each tick. */
export interface RootbinderFacts {
  readonly playerDistance: number;
  /** Allies it has rooted right now. */
  readonly links: number;
}

export function createRootbinderState(): RootbinderState {
  return Object.freeze({
    state: "walk" as const,
    stateTick: 0,
    transitionTick: ROOTBINDER_RULES.walkTicks,
    simulationTick: 0,
  });
}

function enter(value: RootbinderState, state: RootbinderPhase, tick: number, ticks: number): RootbinderState {
  return Object.freeze({ ...value, state, stateTick: tick, transitionTick: tick + ticks, simulationTick: tick });
}

function advanceOneTick(value: RootbinderState, facts: RootbinderFacts): RootbinderState {
  const rules = ROOTBINDER_RULES;
  const tick = value.simulationTick + 1;
  const due = tick >= value.transitionTick;
  switch (value.state) {
    case "walk":
      if (due && (facts.playerDistance >= rules.standoff || tick - value.stateTick >= rules.maxWalkTicks))
        return enter(value, "plant-windup", tick, rules.plantWindupTicks);
      break;
    case "plant-windup":
      if (due) return enter(value, "planted", tick, rules.idlePlantedTicks);
      break;
    case "planted":
      if (facts.links > 0)
        return Object.freeze({ ...value, simulationTick: tick, transitionTick: tick + rules.idlePlantedTicks });
      if (due) return enter(value, "walk", tick, rules.walkTicks);
      break;
    case "uprooted":
      if (due) return enter(value, "recover", tick, rules.recoverTicks);
      break;
    case "recover":
      if (due) return enter(value, "walk", tick, rules.walkTicks);
      break;
  }
  return Object.freeze({ ...value, simulationTick: tick });
}

/** Advances only deterministic simulation time; render cadence cannot affect phase boundaries. */
export function advanceRootbinder(value: RootbinderState, ticks: number, facts: RootbinderFacts): RootbinderState {
  if (!Number.isSafeInteger(ticks) || ticks < 0)
    throw new RangeError("Rootbinder ticks must be a non-negative safe integer");
  let current = value;
  for (let step = 0; step < ticks; step += 1) current = advanceOneTick(current, facts);
  return current;
}

/**
 * Pulls a Rootbinder out of the ground: every root it held was cut, or it took one heavy hit. It is stunned
 * where it stands and cannot plant again until it has recovered. One that is not planting or planted is
 * left as it is.
 */
export function uprootRootbinder(value: RootbinderState): RootbinderState {
  if (value.state !== "plant-windup" && value.state !== "planted") return value;
  return enter(value, "uprooted", value.simulationTick, ROOTBINDER_RULES.uprootedTicks);
}

/** How far through its plant wind-up a Rootbinder is, 0 to 1; 0 in every other phase. */
export function rootbinderWindup(value: RootbinderState): number {
  if (value.state !== "plant-windup") return 0;
  const length = value.transitionTick - value.stateTick;
  return length <= 0 ? 1 : Math.min(1, (value.simulationTick - value.stateTick) / length);
}

/** An ally a planted Rootbinder could root, as the stage-object layer sees it. */
export interface RootbinderAlly {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** False for an ally that cannot be rooted: dead, flying, a boss, a support that plants or anchors. */
  readonly rootable: boolean;
}

/**
 * The allies a planted Rootbinder roots next: the nearest rootable ones in reach that no root holds yet, up to
 * the free places it has. Ties go to the lower id, so the choice does not depend on array order.
 */
export function chooseRootTargets(
  source: Readonly<{ x: number; y: number }>,
  allies: readonly RootbinderAlly[],
  held: ReadonlySet<string>,
  free: number,
): readonly RootbinderAlly[] {
  if (free <= 0) return [];
  return allies
    .filter((ally) => ally.rootable && !held.has(ally.id))
    .map((ally) => ({ ally, distance: Math.hypot(ally.x - source.x, ally.y - source.y) }))
    .filter((entry) => entry.distance <= ROOTBINDER_RULES.linkReach)
    .sort((a, b) => a.distance - b.distance || (a.ally.id < b.ally.id ? -1 : 1))
    .slice(0, free)
    .map((entry) => entry.ally);
}

/** The two ends of a root, as a root-link's geometry. */
export function rootLinkGeometry(
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>,
): EnvironmentCombatObjectState["geometry"] {
  return Object.freeze({
    x: source.x,
    y: source.y,
    points: Object.freeze([Object.freeze({ x: source.x, y: source.y }), Object.freeze({ x: target.x, y: target.y })]),
  });
}

/** One root from a planted Rootbinder to an ally: the shared severable root-link, cut by a held or thrown blade. */
export function createRootLink(
  input: Readonly<{ id: string; ownerId: string; tick: number; source: Readonly<{ x: number; y: number }> }>,
  target: RootbinderAlly,
): EnvironmentCombatObjectState {
  return Object.freeze({
    id: input.id,
    factoryId: "root-link",
    kind: "root-link" as const,
    ownerId: input.ownerId,
    targetId: target.id,
    geometry: rootLinkGeometry(input.source, target),
    integrity: 1,
    maxIntegrity: 1,
    counterplayTags: environmentObjectDefinition("root-link").counterplayTags,
    procEligible: false,
    damageDedupeId: `${input.id}:damage`,
    state: "active" as const,
    stateTick: input.tick,
    cleanupReason: null,
  });
}
