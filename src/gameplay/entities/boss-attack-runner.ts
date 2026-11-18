/**
 * The shared boss attack runner. A boss holds one `BossAttackRunnerState` and advances it once per
 * simulation tick; the runner chooses the next move (through the injected random source, never the same
 * move twice running, weighted by distance and height), steps it through tell, active, recover and punish,
 * and answers where it hits, where the boss moves and which tells to show. Everything is in ticks.
 */
import type { RandomSource } from "../../domain/random";
import {
  BOSS_ATTACK_TICKS_PER_SECOND,
  type BossAttack,
  type BossAttackHeight,
  type BossAttackTable,
  type BossHitShape,
} from "./boss-attacks";
import type { BossTell, BossTellStage } from "./boss-tells";

export type BossAttackStage = "tell" | "active" | "recover" | "punish";

type Point = Readonly<{ x: number; y: number }>;
type Box = Readonly<{ x: number; y: number; hw: number; hh: number }>;

/** The move in progress. `origin` and `target` are locked when its tell begins. */
export interface BossAttackRun {
  readonly attackId: string;
  readonly stage: BossAttackStage;
  readonly stageTick: number;
  readonly facing: 1 | -1;
  readonly origin: Point;
  readonly target: Point;
  readonly landed: boolean;
  /** True once the player parried it: the move skips to an exposed punish of the table's parry length. */
  readonly parried: boolean;
}

export interface BossAttackRunnerState {
  readonly run: BossAttackRun | null;
  readonly readyTick: number;
  readonly lastAttackId: string | null;
  readonly cooldownUntil: Readonly<Record<string, number>>;
  /** A forced exposure outside any move (a cut Graft, say): the ticks it spans, or null. */
  readonly exposed: Readonly<{ from: number; until: number }> | null;
  /** The phase the last move began in, or null before the first. A phase is open once a move began in it. */
  readonly openedPhase: string | number | null;
  /** How many moves have begun, and that count when each move last began (for `once` and `afterMoves`). */
  readonly begun: number;
  readonly begunAt: Readonly<Record<string, number>>;
}

export interface BossAttackContext<Phase extends string | number> {
  readonly tick: number;
  readonly phase: Phase;
  readonly boss: Box;
  readonly target: Box;
  readonly arena: Readonly<{ width: number; groundY: number }>;
  readonly random: RandomSource;
  /** Moves that may not be chosen now, by id (a move whose stage object is already out, say). */
  readonly blocked?: ReadonlySet<string>;
  /** Scales the pause after a move that finishes now (a stage object that hastens the boss, say). Default 1. */
  readonly gapMultiplier?: number;
}

export type BossAttackEvent<Place> =
  | Readonly<{ type: "stage"; attackId: string; stage: BossAttackStage }>
  | Readonly<{ type: "place"; attackId: string; object: Place }>
  | Readonly<{ type: "finished"; attackId: string }>;

/** Where a move hits right now, already placed in the world. */
export type BossHitArea =
  | Readonly<{ kind: "box"; x: number; y: number; hw: number; hh: number }>
  | Readonly<{ kind: "circle"; x: number; y: number; r: number }>;

const STAGE_ORDER: readonly BossAttackStage[] = Object.freeze(["tell", "active", "recover", "punish"]);

export function createBossAttackRunnerState(readyTick = 0): BossAttackRunnerState {
  return Object.freeze({
    run: null,
    readyTick,
    lastAttackId: null,
    cooldownUntil: Object.freeze({}),
    exposed: null,
    openedPhase: null,
    begun: 0,
    begunAt: Object.freeze({}),
  });
}

/**
 * Marks `phase` as already open, so no opening move is owed: for a fight restored part-way through a phase.
 */
export function openBossPhase(state: BossAttackRunnerState, phase: string | number): BossAttackRunnerState {
  return state.openedPhase === phase ? state : Object.freeze({ ...state, openedPhase: phase });
}

function heightOf(boss: Box, target: Box): BossAttackHeight {
  if (target.y > boss.y + boss.hh) return "below";
  if (target.y < boss.y - boss.hh) return "above";
  return "level";
}

/** How much a move wants to be chosen now: its weight, cut hard outside its range or height. */
function preference<Phase extends string | number, Place>(
  attack: BossAttack<Phase, Place>,
  context: BossAttackContext<Phase>,
): number {
  const [min, max] = attack.choose.range;
  const distance = Math.abs(context.target.x - context.boss.x);
  const outside = distance < min ? min - distance : distance > max ? distance - max : 0;
  let score =
    outside === 0 ? attack.choose.weight : (attack.choose.weight * 0.1) / (1 + outside / Math.max(1, max - min));
  if (attack.choose.height !== undefined && attack.choose.height !== heightOf(context.boss, context.target))
    score *= 0.1;
  return score;
}

/** Whether `attack` may start now at all: its phase, not twice running, not blocked, cooled down, not spent. */
function mayStart<Phase extends string | number>(
  attack: BossAttack<Phase, unknown>,
  state: BossAttackRunnerState,
  context: BossAttackContext<Phase>,
): boolean {
  return (
    attack.phases.includes(context.phase) &&
    attack.id !== state.lastAttackId &&
    context.blocked?.has(attack.id) !== true &&
    (state.cooldownUntil[attack.id] ?? 0) <= context.tick &&
    !(attack.choose.once === true && attack.id in state.begunAt)
  );
}

/** Whether a move on a count is owed: it has not been played, or enough other moves began since it was. */
function owed(attack: BossAttack<string | number, unknown>, state: BossAttackRunnerState): boolean {
  const after = attack.choose.afterMoves;
  if (after === undefined) return false;
  const at = state.begunAt[attack.id];
  return at === undefined || state.begun - at - 1 >= after;
}

/**
 * The moves to choose among now, by the schedule: a move that opens a phase not yet open, else a move on a
 * count that is owed, else the moves chosen by weight (a move on a count is never one of them).
 */
function scheduled<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  context: BossAttackContext<Phase>,
): BossAttack<Phase, Place>[] {
  const ready = table.attacks.filter((attack) => mayStart(attack, state, context));
  if (state.openedPhase !== context.phase) {
    const openers = ready.filter((attack) => attack.choose.opens === true);
    if (openers.length > 0) return openers;
  }
  const due = ready.filter((attack) => owed(attack, state));
  if (due.length > 0) return due;
  return ready.filter((attack) => attack.choose.afterMoves === undefined);
}

/** The next move, or null when none may start. Draws exactly one number from the random source. */
export function chooseBossAttack<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  context: BossAttackContext<Phase>,
): BossAttack<Phase, Place> | null {
  const candidates = scheduled(table, state, context);
  const scores = candidates.map((attack) => preference(attack, context));
  const total = scores.reduce((sum, score) => sum + score, 0);
  const roll = context.random.next() * total;
  let reached = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    reached += scores[index] ?? 0;
    if (roll < reached) return candidates[index] ?? null;
  }
  return candidates.at(-1) ?? null;
}

function placesAt<Place>(attack: BossAttack<string | number, Place>, at: "tell" | "active"): BossAttackEvent<Place>[] {
  return attack.places
    .filter((entry) => entry.at === at)
    .map((entry) => ({ type: "place", attackId: attack.id, object: entry.object }));
}

function begin<Phase extends string | number, Place>(
  attack: BossAttack<Phase, Place>,
  context: BossAttackContext<Phase>,
): BossAttackRun {
  const facing = context.target.x < context.boss.x ? -1 : 1;
  return Object.freeze({
    attackId: attack.id,
    stage: "tell",
    stageTick: context.tick,
    facing,
    origin: Object.freeze({ x: context.boss.x, y: context.boss.y }),
    target: Object.freeze({ x: context.target.x, y: context.target.y }),
    landed: false,
    parried: false,
  });
}

/** How long the run's current stage lasts, in ticks. A parried move's punish lasts the table's parry exposure. */
function stageLength(
  table: BossAttackTable<string | number, unknown>,
  attack: BossAttack<string | number, unknown>,
  run: BossAttackRun,
): number {
  return run.stage === "punish" && run.parried ? table.parryExposed : attack.timing[run.stage];
}

/** The stage after `stage` that has any length, or null when the move is over. */
function nextStage(attack: BossAttack<string | number, unknown>, stage: BossAttackStage): BossAttackStage | null {
  for (const candidate of STAGE_ORDER.slice(STAGE_ORDER.indexOf(stage) + 1))
    if (attack.timing[candidate] > 0) return candidate;
  return null;
}

function finish<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  attack: BossAttack<Phase, Place>,
  context: BossAttackContext<Phase>,
): BossAttackRunnerState {
  const tick = context.tick;
  const scale = context.gapMultiplier ?? 1;
  if (!Number.isFinite(scale) || scale < 0) throw new RangeError("a move gap multiplier is a finite number, 0 or more");
  return Object.freeze({
    ...state,
    run: null,
    readyTick: tick + Math.round(table.gap * scale),
    lastAttackId: attack.id,
    cooldownUntil: Object.freeze({ ...state.cooldownUntil, [attack.id]: tick + attack.choose.cooldown }),
    exposed: null,
  });
}

/**
 * Forces the boss open for `ticks`, whatever it was doing: the move in progress ends without striking, hits
 * count as exposed, and the next move waits for the exposure and the table's gap. For answers that are not
 * a parry, such as cutting a stage object the boss depends on.
 */
export function exposeBossAttack(
  table: BossAttackTable<string | number, unknown>,
  state: BossAttackRunnerState,
  tick: number,
  ticks: number,
): BossAttackRunnerState {
  if (!Number.isSafeInteger(ticks) || ticks < 1) throw new RangeError("a forced exposure lasts at least one tick");
  const until = Math.max(tick + ticks, state.exposed?.until ?? 0);
  return Object.freeze({
    ...state,
    run: null,
    readyTick: until + table.gap,
    lastAttackId: state.run?.attackId ?? state.lastAttackId,
    exposed: Object.freeze({ from: tick, until }),
  });
}

/** Advances the runner by one tick and reports what happened. */
export function advanceBossAttack<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  context: BossAttackContext<Phase>,
): Readonly<{ state: BossAttackRunnerState; events: readonly BossAttackEvent<Place>[] }> {
  const run = state.run;
  if (run === null) {
    if (context.tick < state.readyTick) return { state, events: [] };
    const attack = chooseBossAttack(table, state, context);
    if (attack === null) return { state, events: [] };
    const started = Object.freeze({
      ...state,
      exposed: null,
      run: begin(attack, context),
      openedPhase: context.phase,
      begun: state.begun + 1,
      begunAt: Object.freeze({ ...state.begunAt, [attack.id]: state.begun }),
    });
    return {
      state: started,
      events: [{ type: "stage", attackId: attack.id, stage: "tell" }, ...placesAt(attack, "tell")],
    };
  }
  const attack = table.byId.get(run.attackId);
  if (attack === undefined) throw new TypeError(`unknown boss move ${run.attackId} in ${table.bossId}`);
  const elapsed = context.tick - run.stageTick;
  if (elapsed < stageLength(table, attack, run)) {
    // A repeating strike is armed again at the start of each repeat.
    const every = attack.hit?.every ?? 0;
    if (run.stage !== "active" || every === 0 || elapsed === 0 || elapsed % every !== 0 || run.parried)
      return { state, events: [] };
    return { state: Object.freeze({ ...state, run: Object.freeze({ ...run, landed: false }) }), events: [] };
  }
  const stage = nextStage(attack, run.stage);
  if (stage === null)
    return { state: finish(table, state, attack, context), events: [{ type: "finished", attackId: attack.id }] };
  const moved = Object.freeze({ ...run, stage, stageTick: context.tick });
  const events: BossAttackEvent<Place>[] = [{ type: "stage", attackId: attack.id, stage }];
  if (stage === "active") events.push(...placesAt(attack, "active"));
  return { state: Object.freeze({ ...state, run: moved }), events };
}

/**
 * True while a strike is on its way: the move in progress hits and is in its tell or active stage. The player
 * is busy reading or dodging it then, so rules that reward an unpressed boss (healing after a quiet spell)
 * should not count that time.
 */
export function bossAttackThreatens(
  table: BossAttackTable<string | number, unknown>,
  state: BossAttackRunnerState,
): boolean {
  const run = state.run;
  if (run === null || run.parried || (run.stage !== "tell" && run.stage !== "active")) return false;
  return table.byId.get(run.attackId)?.hit !== undefined;
}

/** The move in progress, if any. */
export function currentBossAttack<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
): BossAttack<Phase, Place> | null {
  return state.run === null ? null : (table.byId.get(state.run.attackId) ?? null);
}

/** Where `shape` sits now. `travelled` is how far a travelling shape has gone. */
export function placeBossHitShape(
  shape: BossHitShape,
  run: BossAttackRun,
  boss: Box,
  groundY: number,
  travelled: number,
): BossHitArea {
  switch (shape.kind) {
    case "box": {
      const anchor = shape.anchor === "boss" ? boss : shape.anchor === "target" ? run.target : { x: 0, y: groundY };
      const x = shape.anchor === "arena" ? shape.dx : anchor.x + run.facing * shape.dx;
      return { kind: "box", x, y: anchor.y + shape.dy, hw: shape.hw, hh: shape.hh };
    }
    case "lane":
      return {
        kind: "box",
        x: boss.x + run.facing * (boss.hw + shape.length / 2),
        y: boss.y + shape.dy,
        hw: shape.length / 2,
        hh: shape.hh,
      };
    case "column": {
      const x = shape.anchor === "boss" ? boss.x : run.target.x;
      return { kind: "box", x, y: groundY - shape.height / 2, hw: shape.hw, hh: shape.height / 2 };
    }
    case "ring":
      return { kind: "circle", x: boss.x, y: boss.y, r: shape.radius };
    case "travel":
      return {
        kind: "box",
        x: run.origin.x + run.facing * (boss.hw + shape.hw + travelled),
        y: run.origin.y + shape.dy,
        hw: shape.hw,
        hh: shape.hh,
      };
  }
}

/** Ticks since the current strike started: since the active stage began, or since the last repeat. */
function strikeElapsed(attack: BossAttack<string | number, unknown>, elapsed: number): number {
  const every = attack.hit?.every ?? 0;
  return every > 0 ? elapsed % every : elapsed;
}

/**
 * Where the move hits this tick: only while active and before it has landed. The boss applies the damage
 * through its own damage call (with its parry check) and then calls `markBossAttackLanded`.
 */
export function bossAttackHit<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  context: BossAttackContext<Phase>,
): Readonly<{ area: BossHitArea; damage: number; parryable: boolean }> | null {
  const run = state.run;
  const attack = currentBossAttack(table, state);
  if (run === null || attack?.hit === undefined || run.stage !== "active" || run.landed) return null;
  const travelled =
    attack.hit.shape.kind === "travel"
      ? attack.hit.shape.speed * strikeElapsed(attack, context.tick - run.stageTick)
      : 0;
  const area = placeBossHitShape(attack.hit.shape, run, context.boss, context.arena.groundY, travelled);
  return { area, damage: attack.hit.damage, parryable: attack.hit.parryable };
}

export function markBossAttackLanded(state: BossAttackRunnerState): BossAttackRunnerState {
  return state.run === null ? state : Object.freeze({ ...state, run: Object.freeze({ ...state.run, landed: true }) });
}

/** True while a parryable move can be parried: from `parryLead` before it strikes until it lands. */
export function bossAttackParryable<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  tick: number,
): boolean {
  const run = state.run;
  const attack = currentBossAttack(table, state);
  if (run === null || attack?.hit?.parryable !== true || run.landed) return false;
  if (run.stage === "active") return true;
  return run.stage === "tell" && run.stageTick + attack.timing.tell - tick <= table.parryLead;
}

/** Parries the move in progress: it never lands, and the boss is exposed for the table's parry length. */
export function parryBossAttack<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  tick: number,
): BossAttackRunnerState {
  const run = state.run;
  if (run === null || !bossAttackParryable(table, state, tick)) return state;
  const parried = Object.freeze({ ...run, stage: "punish" as const, stageTick: tick, landed: true, parried: true });
  return Object.freeze({ ...state, run: parried });
}

export function bossHitTouches(area: BossHitArea, target: Box): boolean {
  if (area.kind === "box")
    return Math.abs(area.x - target.x) <= area.hw + target.hw && Math.abs(area.y - target.y) <= area.hh + target.hh;
  const nearestX = Math.max(target.x - target.hw, Math.min(area.x, target.x + target.hw));
  const nearestY = Math.max(target.y - target.hh, Math.min(area.y, target.y + target.hh));
  return Math.hypot(area.x - nearestX, area.y - nearestY) <= area.r;
}

/** What a renderer needs to draw a move: which move, its stage, how far through it, and where it reaches now. */
export interface BossAttackPose {
  readonly attackId: string;
  readonly stage: BossAttackStage;
  /** 0 at the start of the stage, 1 at its end. */
  readonly progress: number;
  readonly facing: 1 | -1;
  readonly target: Point;
  /** Where the move's hit sits now (also after it landed), or null for a move with no hit. */
  readonly area: BossHitArea | null;
}

export function bossAttackPose<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  context: BossAttackContext<Phase>,
): BossAttackPose | null {
  const run = state.run;
  const attack = currentBossAttack(table, state);
  if (run === null || attack === null) return null;
  const elapsed = context.tick - run.stageTick;
  const progress = Math.min(1, Math.max(0, elapsed / Math.max(1, stageLength(table, attack, run))));
  const shape = attack.hit?.shape;
  const travelled =
    shape?.kind === "travel" && run.stage === "active" ? shape.speed * strikeElapsed(attack, elapsed) : 0;
  const area =
    shape === undefined ? null : placeBossHitShape(shape, run, context.boss, context.arena.groundY, travelled);
  return { attackId: attack.id, stage: run.stage, progress, facing: run.facing, target: run.target, area };
}

/** True while the boss is exposed (a move's punish stage or a forced exposure): hits on it are scaled. */
export function bossAttackExposed(state: BossAttackRunnerState, tick: number): boolean {
  return state.run?.stage === "punish" || (state.exposed !== null && tick < state.exposed.until);
}

/** How much damage the boss takes right now, as a multiplier. */
export function bossAttackDamageTaken(
  table: BossAttackTable<string | number, unknown>,
  state: BossAttackRunnerState,
  tick: number,
): number {
  return bossAttackExposed(state, tick) ? table.exposedDamageTaken : 1;
}

/** What the boss's body is doing, read from the runner state alone. */
export interface BossAttackStatus {
  /** "move:stage" while a move runs, otherwise null. */
  readonly label: string | null;
  readonly exposed: boolean;
  /** True while the move itself carries the body (it does not fall or slide on its own). */
  readonly carries: boolean;
  /** True while out of sight and untouchable (a burrow). */
  readonly hidden: boolean;
  readonly parryable: boolean;
}

/**
 * The flags a boss keeps about its own body. A boss sets them from this after every change to the runner
 * state (a tick, a parry, a forced exposure, a reset), so none of them can be left over from a move that a
 * parry or a cut ended early.
 */
export function bossAttackStatus<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  context: BossAttackContext<Phase>,
): BossAttackStatus {
  const run = state.run;
  const motion = bossAttackMotion(table, state, context);
  return {
    label: run === null ? null : `${run.attackId}:${run.stage}`,
    exposed: bossAttackExposed(state, context.tick),
    carries: motion !== null,
    hidden: motion?.hidden ?? false,
    parryable: bossAttackParryable(table, state, context.tick),
  };
}

/**
 * Where the move puts the boss this tick, or null when the move does not move it now. `hidden` means out
 * of sight and untouchable (a burrow). Positions stay inside the arena.
 */
export function bossAttackMotion<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  context: BossAttackContext<Phase>,
): Readonly<{ x: number; y: number; hidden: boolean }> | null {
  const run = state.run;
  const attack = currentBossAttack(table, state);
  const motion = attack?.motion;
  if (run === null || attack === null || motion?.stage !== run.stage) return null;
  // The stage's last tick finishes the motion: a burrow surfaces, a leap lands, a dash reaches full length.
  const span = Math.max(1, attack.timing[run.stage]);
  const progress = Math.min(1, Math.max(0, (context.tick - run.stageTick + 1) / span));
  const clampX = (x: number) => Math.max(context.boss.hw, Math.min(context.arena.width - context.boss.hw, x));
  switch (motion.kind) {
    case "dash":
      return { x: clampX(run.origin.x + run.facing * motion.distance * progress), y: run.origin.y, hidden: false };
    case "leap":
      return {
        x: clampX(run.origin.x + (run.target.x - run.origin.x) * progress),
        y: run.origin.y - motion.height * 4 * progress * (1 - progress),
        hidden: false,
      };
    case "burrow":
      return { x: clampX(progress < 1 ? run.origin.x : run.target.x), y: run.origin.y, hidden: progress < 1 };
  }
}

function tellStage(stage: BossAttackStage): BossTellStage | null {
  switch (stage) {
    case "tell":
      return "warning";
    case "active":
      return "active";
    case "punish":
      return "exposed";
    case "recover":
      return null;
  }
}

function toBox(area: BossHitArea): Box {
  return area.kind === "box" ? area : { x: area.x, y: area.y, hw: area.r, hh: area.r };
}

/** The area a move's tell marks: where it will hit, or for a travelling strike, its whole path. */
function tellArea(attack: BossAttack<string | number, unknown>, run: BossAttackRun, boss: Box, groundY: number): Box {
  const shape = attack.hit?.shape;
  if (shape === undefined) return boss;
  if (shape.kind !== "travel") return toBox(placeBossHitShape(shape, run, boss, groundY, 0));
  const every = attack.hit?.every ?? 0;
  const path = shape.speed * (every > 0 ? every : attack.timing.active);
  const start = run.origin.x + run.facing * boss.hw;
  return {
    x: start + run.facing * (path / 2 + shape.hw),
    y: run.origin.y + shape.dy,
    hw: path / 2 + shape.hw,
    hh: shape.hh,
  };
}

/**
 * The tells this move shows now, in the shared tell format. Lengths are converted to seconds here, at the
 * edge, because the tell format is what the shared tell renderer and the B1 rule tests read.
 */
export function bossAttackTells<Phase extends string | number, Place>(
  table: BossAttackTable<Phase, Place>,
  state: BossAttackRunnerState,
  context: BossAttackContext<Phase>,
): readonly BossTell[] {
  const run = state.run;
  const attack = currentBossAttack(table, state);
  const stage = run === null ? null : tellStage(run.stage);
  if (run === null && state.exposed !== null && context.tick < state.exposed.until)
    return Object.freeze([
      Object.freeze({
        id: "exposed",
        attackId: "exposed",
        mark: "self" as const,
        stage: "exposed" as const,
        x: context.boss.x,
        y: context.boss.y,
        hw: context.boss.hw,
        hh: context.boss.hh,
        leadSeconds: (state.exposed.until - state.exposed.from) / BOSS_ATTACK_TICKS_PER_SECOND,
        remainingSeconds: (state.exposed.until - context.tick) / BOSS_ATTACK_TICKS_PER_SECOND,
        damaging: false,
      }),
    ]);
  if (run === null || attack === null || stage === null) return Object.freeze([]);
  const exposed = stage === "exposed";
  const area = exposed ? context.boss : tellArea(attack, run, context.boss, context.arena.groundY);
  const length = stageLength(table, attack, run);
  return Object.freeze([
    Object.freeze({
      id: exposed ? `${attack.id}:exposed` : attack.id,
      attackId: attack.id,
      mark: exposed ? "self" : attack.tell.mark,
      stage,
      x: area.x,
      y: area.y,
      hw: area.hw,
      hh: area.hh,
      dir: run.facing,
      leadSeconds: (stage === "exposed" ? length : attack.timing.tell) / BOSS_ATTACK_TICKS_PER_SECOND,
      remainingSeconds:
        stage === "active" ? 0 : Math.max(0, run.stageTick + length - context.tick) / BOSS_ATTACK_TICKS_PER_SECOND,
      damaging: !exposed && attack.hit !== undefined,
    }),
  ]);
}
