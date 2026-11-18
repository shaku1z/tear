/**
 * Boss attacks as data. A boss move is authored once, as a definition: its timing, how it is chosen,
 * how the boss moves during it, where it hits, the tell the player sees and the stage objects it places.
 * Authors write seconds; `buildBossAttackTable` converts every time field to simulation ticks in one place,
 * so the runner (`boss-attack-runner.ts`) and the renderers only ever see ticks.
 */
import { BOSS_TELL_MIN_LEAD_SECONDS, type BossTellMark } from "./boss-tells";

/** The authoritative simulation rate. Boss attack tables are built against it once. */
export const BOSS_ATTACK_TICKS_PER_SECOND = 120;

/** The one seconds-to-ticks conversion for boss attacks: nearest whole tick. */
export function bossAttackSecondsToTicks(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new RangeError(`boss attack time must be >= 0 s: ${String(seconds)}`);
  return Math.round(seconds * BOSS_ATTACK_TICKS_PER_SECOND);
}

/** What a shape is placed against: the boss, the target as it stood when the tell began, or the arena. */
export type BossAttackAnchor = "boss" | "target" | "arena";

/**
 * Where a move hits. Closed, so a renderer or hit test can switch over `kind` and the type checker flags a
 * missing case. Horizontal offsets follow the boss's facing; distances are world pixels.
 */
export type BossHitShape =
  /** A box offset from its anchor. For "arena", `dx` is the world x and `dy` is measured from the ground. */
  | Readonly<{ kind: "box"; anchor: BossAttackAnchor; dx: number; dy: number; hw: number; hh: number }>
  /** A strip from the boss's front edge, `length` long, along its facing. */
  | Readonly<{ kind: "lane"; length: number; dy: number; hh: number }>
  /** A pillar standing on the ground, `height` tall, under the boss or the target. */
  | Readonly<{ kind: "column"; anchor: "boss" | "target"; hw: number; height: number }>
  /** A circle around the boss. */
  | Readonly<{ kind: "ring"; radius: number }>
  /**
   * A box that leaves the boss's front edge when the strike starts and travels along its facing. Authored
   * in pixels per second; a built table holds pixels per tick.
   */
  | Readonly<{ kind: "travel"; dy: number; hw: number; hh: number; speed: number }>;

/** Which part of the move a motion fills. */
export type BossMotionStage = "tell" | "active" | "recover";

/** How the boss moves during a move. Closed, like the shapes. The motion spans its whole stage. */
export type BossMotion =
  /** Travel `distance` along the facing. */
  | Readonly<{ kind: "dash"; stage: BossMotionStage; distance: number }>
  /** An arc to where the target stood, `height` above the start at its top. */
  | Readonly<{ kind: "leap"; stage: BossMotionStage; height: number }>
  /** Out of sight and untouchable, surfacing where the target stood. */
  | Readonly<{ kind: "burrow"; stage: BossMotionStage }>;

export type BossAttackHeight = "below" | "level" | "above";

/**
 * When a move must come, beside the weighted choice. A move with none of these is chosen by weight alone.
 * - `opens`: it is played first whenever the boss starts a phase it belongs to (an opening ritual). If it
 *   cannot start then, the phase opens with an ordinary move instead.
 * - `once`: it is played at most once in the runner's life.
 * - `afterMoves`: it is played as soon as that many other moves have begun since it last began, and only
 *   then (a big strike every few moves). It is owed at once if it has not been played yet.
 */
export interface BossAttackSchedule {
  readonly opens?: boolean;
  readonly once?: boolean;
  readonly afterMoves?: number;
}

/** One boss move as an author writes it. Every time is in seconds. */
export interface BossAttackDefinition<Phase extends string | number, Place = never> {
  readonly id: string;
  readonly phases: readonly Phase[];
  readonly timing: Readonly<{ tell: number; active: number; recover: number; punish?: number }>;
  /** Preferred horizontal distance to the target and height relation. `cooldown` is seconds before reuse. */
  readonly choose: Readonly<{
    range: readonly [number, number];
    height?: BossAttackHeight;
    weight: number;
    cooldown: number;
  }> &
    BossAttackSchedule;
  readonly motion?: BossMotion;
  /**
   * `every`: the strike repeats each `every` seconds of the active stage (a channel that keeps attacking); a
   * travelling shape starts again from the boss each time. Without it the move strikes once.
   */
  readonly hit?: Readonly<{ shape: BossHitShape; damage: number; parryable: boolean; every?: number }>;
  readonly tell: Readonly<{ mark: BossTellMark }>;
  readonly places?: readonly Readonly<{ at: "tell" | "active"; object: Place }>[];
}

/**
 * A boss's whole move list. `gap` is the pause between moves; `exposedDamageTaken` scales hits in punish.
 * A parryable move can be parried from `parryLead` seconds before it strikes until it lands; a parried move
 * leaves the boss exposed for `parryExposed` seconds.
 */
export interface BossAttackTableDefinition<Phase extends string | number, Place = never> {
  readonly bossId: string;
  readonly phases: readonly Phase[];
  readonly gap: number;
  readonly exposedDamageTaken: number;
  readonly parryLead: number;
  readonly parryExposed: number;
  readonly attacks: readonly BossAttackDefinition<Phase, Place>[];
}

/** A built move: the same definition with every time in ticks and travel speed in pixels per tick. */
export interface BossAttack<Phase extends string | number, Place = never> {
  readonly id: string;
  readonly phases: readonly Phase[];
  readonly timing: Readonly<{ tell: number; active: number; recover: number; punish: number }>;
  readonly choose: Readonly<{
    range: readonly [number, number];
    height?: BossAttackHeight;
    weight: number;
    cooldown: number;
  }> &
    BossAttackSchedule;
  readonly motion?: BossMotion;
  /** `every` in ticks, 0 for a single strike. */
  readonly hit?: Readonly<{ shape: BossHitShape; damage: number; parryable: boolean; every: number }>;
  readonly tell: Readonly<{ mark: BossTellMark }>;
  readonly places: readonly Readonly<{ at: "tell" | "active"; object: Place }>[];
}

export interface BossAttackTable<Phase extends string | number, Place = never> {
  readonly bossId: string;
  readonly phases: readonly Phase[];
  readonly gap: number;
  readonly exposedDamageTaken: number;
  readonly parryLead: number;
  readonly parryExposed: number;
  readonly attacks: readonly BossAttack<Phase, Place>[];
  readonly byId: ReadonlyMap<string, BossAttack<Phase, Place>>;
}

function fail(table: string, message: string): never {
  throw new TypeError(`boss attack table ${table}: ${message}`);
}

function buildShape(shape: BossHitShape): BossHitShape {
  if (shape.kind !== "travel") return Object.freeze({ ...shape });
  return Object.freeze({ ...shape, speed: shape.speed / BOSS_ATTACK_TICKS_PER_SECOND });
}

function buildTiming(
  table: string,
  attack: BossAttackDefinition<string | number, unknown>,
): BossAttack<string>["timing"] {
  const timing = Object.freeze({
    tell: bossAttackSecondsToTicks(attack.timing.tell),
    active: bossAttackSecondsToTicks(attack.timing.active),
    recover: bossAttackSecondsToTicks(attack.timing.recover),
    punish: bossAttackSecondsToTicks(attack.timing.punish ?? 0),
  });
  if (timing.tell < 1 || timing.active < 1) fail(table, `${attack.id} needs a tell and an active window`);
  if (attack.hit !== undefined && attack.timing.tell < BOSS_TELL_MIN_LEAD_SECONDS.normal)
    fail(table, `${attack.id} hits after a tell shorter than ${String(BOSS_TELL_MIN_LEAD_SECONDS.normal)} s`);
  return timing;
}

function checkChoice(table: string, attack: BossAttackDefinition<string | number, unknown>): void {
  const [min, max] = attack.choose.range;
  if (!(min >= 0 && max >= min)) fail(table, `${attack.id} has an empty range`);
  if (!(attack.choose.weight > 0)) fail(table, `${attack.id} needs a positive weight`);
  const after = attack.choose.afterMoves;
  if (after !== undefined && !(Number.isSafeInteger(after) && after >= 1))
    fail(table, `${attack.id} must come after a whole number of moves, at least one`);
  if (after !== undefined && attack.choose.once === true)
    fail(table, `${attack.id} cannot both come once and come back every few moves`);
}

function buildHit(
  table: string,
  attack: BossAttackDefinition<string | number, unknown>,
  active: number,
): BossAttack<string>["hit"] {
  const hit = attack.hit;
  if (hit === undefined) return undefined;
  const every = hit.every === undefined ? 0 : bossAttackSecondsToTicks(hit.every);
  if (hit.every !== undefined && (every < 1 || every >= active))
    fail(table, `${attack.id} repeats its strike less than once a tick or not within its active window`);
  return Object.freeze({ ...hit, shape: buildShape(hit.shape), every });
}

function buildAttack<Phase extends string | number, Place>(
  table: BossAttackTableDefinition<Phase, Place>,
  attack: BossAttackDefinition<Phase, Place>,
): BossAttack<Phase, Place> {
  checkChoice(table.bossId, attack);
  for (const phase of attack.phases)
    if (!table.phases.includes(phase)) fail(table.bossId, `${attack.id} names unknown phase ${String(phase)}`);
  const timing = buildTiming(table.bossId, attack);
  const hit = buildHit(table.bossId, attack, timing.active);
  return Object.freeze({
    id: attack.id,
    phases: Object.freeze([...attack.phases]),
    timing,
    choose: Object.freeze({ ...attack.choose, cooldown: bossAttackSecondsToTicks(attack.choose.cooldown) }),
    ...(attack.motion === undefined ? {} : { motion: Object.freeze({ ...attack.motion }) }),
    ...(hit === undefined ? {} : { hit }),
    tell: Object.freeze({ ...attack.tell }),
    places: Object.freeze((attack.places ?? []).map((entry) => Object.freeze({ ...entry }))),
  });
}

/** True for a move that can always come back by weight: one that is neither played once nor on a count. */
export function isOrdinaryBossAttack(attack: BossAttack<string | number, unknown>): boolean {
  return attack.choose.once !== true && attack.choose.afterMoves === undefined;
}

/**
 * Builds a boss's move list: checks it and converts every time to ticks. Each phase needs two ordinary moves
 * at least, because the runner never plays the same move twice running and must never be left without one.
 */
export function buildBossAttackTable<Phase extends string | number, Place = never>(
  definition: BossAttackTableDefinition<Phase, Place>,
): BossAttackTable<Phase, Place> {
  const attacks = definition.attacks.map((attack) => buildAttack(definition, attack));
  const byId = new Map<string, BossAttack<Phase, Place>>();
  for (const attack of attacks) {
    if (byId.has(attack.id)) fail(definition.bossId, `duplicate move ${attack.id}`);
    byId.set(attack.id, attack);
  }
  for (const phase of definition.phases)
    if (attacks.filter((attack) => attack.phases.includes(phase) && isOrdinaryBossAttack(attack)).length < 2)
      fail(definition.bossId, `phase ${String(phase)} needs at least two moves chosen by weight`);
  if (!(definition.exposedDamageTaken >= 1)) fail(definition.bossId, "exposed damage taken must be at least 1");
  return Object.freeze({
    bossId: definition.bossId,
    phases: Object.freeze([...definition.phases]),
    gap: bossAttackSecondsToTicks(definition.gap),
    exposedDamageTaken: definition.exposedDamageTaken,
    parryLead: bossAttackSecondsToTicks(definition.parryLead),
    parryExposed: bossAttackSecondsToTicks(definition.parryExposed),
    attacks: Object.freeze(attacks),
    byId,
  });
}
