/**
 * Shared by the two rules over every boss and enemy (move-visual-lifetime and boss-tell-weight).
 *
 * It builds each entity through the production enemy types, steps it at 120 Hz through the production
 * step (`stepEnemyActors`), and draws it each tick through the production renderers into a recording
 * canvas. The mark helpers report when they draw (`markObserver`), so every mark is logged with the
 * move that was live when it was drawn, and every other primitive is logged with where it landed.
 */
import { CONFIG } from "../../src/config/game-config";
import { clamp, len, lerp } from "../../src/domain/geometry";
import { stepEnemyActors, type EnemyStepActor } from "../../src/gameplay/combat/enemy-step-runtime";
import type { ArenaZone, EnemyPlatform, EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import { bossPhaseMarks, type BossDefinitionId } from "../../src/gameplay/run/boss-definitions";
import { ENEMY_IDENTITY_IDS, type EnemyKind } from "../../src/gameplay/run/content-director";
import { createBossArena } from "../../src/gameplay/training/arena-rules";
import { VARIANTS, applyVariant } from "../../src/gameplay/variants";
import { createEnemyPresentation } from "../../src/presentation/enemies/enemy-presentation";
import {
  ENEMY_MARK_HELPERS,
  type EnemyMarkHelper,
  type EnemyPropHelper,
} from "../../src/presentation/enemies/renderers/enemy-renderer-types";
import {
  STANDARD_ACTOR_FACTORIES,
  createEnemyHarness,
  createTestPlayer,
  type BehaviorActor,
} from "./enemy-test-harness";

export const DT = 1 / 120;

/** One primitive drawn by an entity's renderer, in world pixels. */
export interface DrawnPrimitive {
  /** The mark or prop helper drawing it, or null for what the renderer draws itself. */
  readonly helper: EnemyMarkHelper | EnemyPropHelper | null;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly dashed: boolean;
}

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * A 2D context that draws nothing and records every fill, stroke, rectangle, text and image as a world
 * box, through the current transform. It knows which mark helper, if any, is drawing.
 */
export function createRecordingCanvas() {
  const primitives: DrawnPrimitive[] = [];
  const helpers: (EnemyMarkHelper | EnemyPropHelper)[] = [];
  let m: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  let dash: number[] = [];
  const stack: { m: Matrix; dash: number[] }[] = [];
  let path: [number, number][] = [];
  const point = (x: number, y: number): [number, number] => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  const multiply = (n: Matrix) => {
    m = {
      a: m.a * n.a + m.c * n.b,
      b: m.b * n.a + m.d * n.b,
      c: m.a * n.c + m.c * n.d,
      d: m.b * n.c + m.d * n.d,
      e: m.a * n.e + m.c * n.f + m.e,
      f: m.b * n.e + m.d * n.f + m.f,
    };
  };
  const box = (x: number, y: number, rx: number, ry: number) => {
    path.push(point(x - rx, y - ry), point(x + rx, y - ry), point(x - rx, y + ry), point(x + rx, y + ry));
  };
  const emit = (points: readonly [number, number][]) => {
    if (points.length === 0) return;
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    primitives.push({
      helper: helpers.at(-1) ?? null,
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
      dashed: dash.some((part) => part > 0),
    });
  };
  const rectPoints = (x: number, y: number, w: number, h: number) => [
    point(x, y),
    point(x + w, y),
    point(x, y + h),
    point(x + w, y + h),
  ];
  const gradient = { addColorStop: () => undefined };
  const methods: Record<string, (...args: never[]) => unknown> = {
    save: () => stack.push({ m: { ...m }, dash: [...dash] }),
    restore: () => {
      const top = stack.pop();
      if (top) ({ m, dash } = top);
    },
    translate: (x: number, y: number) => {
      multiply({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
    },
    scale: (x: number, y: number) => {
      multiply({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 });
    },
    rotate: (r: number) => {
      multiply({ a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 });
    },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      multiply({ a, b, c, d, e, f });
    },
    setTransform: (a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) => {
      m = { a, b, c, d, e, f };
    },
    resetTransform: () => {
      m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
    getTransform: () => ({ ...m }),
    setLineDash: (segments: number[]) => {
      dash = [...segments];
    },
    getLineDash: () => [...dash],
    beginPath: () => {
      path = [];
    },
    moveTo: (x: number, y: number) => path.push(point(x, y)),
    lineTo: (x: number, y: number) => path.push(point(x, y)),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => path.push(point(cx, cy), point(x, y)),
    bezierCurveTo: (ax: number, ay: number, bx: number, by: number, x: number, y: number) =>
      path.push(point(ax, ay), point(bx, by), point(x, y)),
    arcTo: (ax: number, ay: number, x: number, y: number) => path.push(point(ax, ay), point(x, y)),
    arc: (x: number, y: number, r: number) => {
      box(x, y, r, r);
    },
    ellipse: (x: number, y: number, rx: number, ry: number) => {
      box(x, y, Math.max(rx, ry), Math.max(rx, ry));
    },
    rect: (x: number, y: number, w: number, h: number) => path.push(...rectPoints(x, y, w, h)),
    roundRect: (x: number, y: number, w: number, h: number) => path.push(...rectPoints(x, y, w, h)),
    closePath: () => undefined,
    clip: () => undefined,
    fill: () => {
      emit(path);
    },
    stroke: () => {
      emit(path);
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      emit(rectPoints(x, y, w, h));
    },
    strokeRect: (x: number, y: number, w: number, h: number) => {
      emit(rectPoints(x, y, w, h));
    },
    clearRect: () => undefined,
    fillText: (_text: string, x: number, y: number) => {
      emit([point(x, y)]);
    },
    strokeText: (_text: string, x: number, y: number) => {
      emit([point(x, y)]);
    },
    drawImage: () => undefined,
    measureText: (text: string) => ({ width: text.length * 7 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    isPointInPath: () => false,
  };
  const properties: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, font: "10px sans-serif" };
  const context = new Proxy(
    {},
    {
      get: (_target, key: string) => methods[key] ?? properties[key],
      set: (_target, key: string, value: unknown) => {
        properties[key] = value;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return {
    context,
    primitives,
    observer: {
      enter: (helper: EnemyMarkHelper | EnemyPropHelper) => helpers.push(helper),
      exit: () => helpers.pop(),
    },
    clear: () => {
      primitives.length = 0;
      path = [];
      dash = [];
      stack.length = 0;
      m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
  };
}

/** The entity's move state: a boss's `state`, or an enemy's `state` when it has one, else its `atk`. */
export type MoveSource = Readonly<{ state?: unknown; atk?: unknown }>;
export function moveState(entity: MoveSource): string {
  if (typeof entity.state === "string") return entity.state;
  return typeof entity.atk === "string" ? entity.atk : "";
}

/** What one tick looked like. */
export interface TickRecord {
  readonly tick: number;
  readonly state: string;
  readonly phase: number;
  readonly stunned: boolean;
  readonly dying: boolean;
  readonly marks: readonly EnemyMarkHelper[];
  /** Primitives drawn outside a mark helper, as distances past the body's box (0 inside it). */
  readonly reach: number;
  readonly dashedOutside: boolean;
  /** The primitives drawn outside a mark helper that reach more than 40 px past the body, for reports. */
  readonly far: readonly (DrawnPrimitive & { readonly reach: number })[];
  /** The production `liveMove()`: the move the entity is in, or null at rest. */
  readonly liveMove: string | null;
  /**
   * How many times this tick's step set each of the entity's move-state fields (`state`, and each `*State`
   * field such as the Source's `dashState`). A move that runs on is not set again; one ended, or started
   * again, is.
   */
  readonly stateWrites: Readonly<Record<string, number>>;
  readonly zones: readonly ArenaZone[];
}

export type Steppable = EnemyStepActor &
  BehaviorActor & {
    readonly isBoss?: boolean;
    phase?: number;
    state?: string;
    stateT?: number;
    zones?: ArenaZone[];
    cinematicRequest?: unknown;
    cinematicT?: number;
    introT?: number;
    practicePhaseEntry?(): { readonly phase: number };
    draw(context: CanvasRenderingContext2D, player?: unknown): void;
    liveMove(): string | null;
    drawRear?(context: CanvasRenderingContext2D): void;
  };

/** The phase the boss has entered (its `practicePhaseEntry()`, as the game commits it), else its phase field. */
function committedPhase(entity: Steppable): number {
  if (typeof entity.practicePhaseEntry === "function") return entity.practicePhaseEntry().phase;
  return typeof entity.phase === "number" ? entity.phase : 1;
}

export interface Subject {
  readonly id: string;
  readonly entity: Steppable;
  /** Advances one tick; true once the entity is gone. */
  step(tick: number): boolean;
  /** Draws the entity as the game does. A test may wrap it to plant a fault. */
  paint: () => void;
  draw(): TickRecord;
}

function presentationDependencies(
  clock: { sim: number },
  observer: ReturnType<typeof createRecordingCanvas>["observer"],
) {
  return {
    markObserver: observer,
    A11Y: { highContrast: false, reducedMotion: false },
    CLOCK: clock,
    policy: CONFIG,
    GFX: { low: false },
    THEME: { dark: true, ink: "#171219", rim: "#fff" },
    UI: { font: (size: number) => `${String(size)}px sans-serif`, tag: () => undefined, t: { type: { caption: 13 } } },
    clamp,
    len,
    lerp,
  };
}

/**
 * Counts every write to the entity's move-state fields: `state`, and each string field named `*State`.
 * The fields keep their values; only the writes are counted, for `TickRecord.stateWrites`.
 */
function watchMoveStateWrites(entity: Steppable): { taken(): Readonly<Record<string, number>> } {
  let counts: Record<string, number> = {};
  const target = entity as unknown as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (!(key === "state" || key.endsWith("State")) || typeof target[key] !== "string") continue;
    let value: unknown = target[key];
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: (next: unknown) => {
        counts[key] = (counts[key] ?? 0) + 1;
        value = next;
      },
    });
  }
  return {
    taken() {
      const taken = counts;
      counts = {};
      return taken;
    },
  };
}

function subjectFor(
  id: string,
  harness: ReturnType<typeof createEnemyHarness>,
  canvas: ReturnType<typeof createRecordingCanvas>,
  entity: Steppable,
  platforms: EnemyPlatform[],
  player: ReturnType<typeof createTestPlayer>,
): Subject {
  const projectiles: EnemyProjectile[] = [];
  let gone = false;
  const enemies: EnemyStepActor[] = [entity];
  const writes = watchMoveStateWrites(entity);
  return {
    id,
    entity,
    step(tick) {
      harness.clock.sim = tick * DT;
      stepEnemyActors({
        dt: DT,
        enemies,
        platforms,
        player,
        projectiles,
        freeze: false,
        gravity: CONFIG.world.gravity,
        groundY: CONFIG.world.groundY,
        viewportWidth: CONFIG.view.w,
        onKill: () => {
          gone = true;
        },
        startTransformation: () => false,
      });
      // The game hands a transformation to the cinematic layer; the rules watch the fight around it.
      entity.cinematicRequest = null;
      if (entity.dead) gone = true;
      projectiles.length = 0;
      player.damage.length = 0;
      return gone;
    },
    paint() {
      entity.drawRear?.(canvas.context);
      entity.draw(canvas.context, player);
    },
    draw() {
      canvas.clear();
      this.paint();
      const isMark = (helper: DrawnPrimitive["helper"]): helper is EnemyMarkHelper =>
        (ENEMY_MARK_HELPERS as readonly (string | null)[]).includes(helper);
      const marks = canvas.primitives.flatMap((primitive) => (isMark(primitive.helper) ? [primitive.helper] : []));
      const outside = canvas.primitives.filter((primitive) => primitive.helper === null);
      const reachOf = (primitive: DrawnPrimitive) =>
        Math.max(
          0,
          entity.x - entity.hw - primitive.x0,
          primitive.x1 - (entity.x + entity.hw),
          entity.y - entity.hh - primitive.y0,
          primitive.y1 - (entity.y + entity.hh),
        );
      const reach = Math.max(0, ...outside.map(reachOf));
      const far = outside.map((primitive) => ({ ...primitive, reach: reachOf(primitive) })).filter((p) => p.reach > 40);
      return {
        tick: Math.round(harness.clock.sim / DT),
        state: moveState(entity),
        phase: committedPhase(entity),
        stunned: entity.stun > 0,
        dying: entity.dying,
        marks: [...new Set(marks)],
        reach,
        dashedOutside: outside.some((primitive) => primitive.dashed),
        far,
        liveMove: entity.liveMove(),
        stateWrites: writes.taken(),
        zones: [...(entity.zones ?? [])],
      };
    },
  };
}

type HarnessBossId = Exclude<BossDefinitionId, "echo">;
const BOSS_CONSTRUCTORS = {
  warden: "Warden",
  colossus: "Colossus",
  aldric: "Aldric",
  rootbound: "Rootbound",
  "white-hart": "WhiteHart",
  source: "Source",
  "rootbound-rebuild": "RootboundRebuild",
} as const satisfies Record<HarnessBossId, string>;

export function createBossSubject(id: HarnessBossId): Subject & { readonly phaseMarks: readonly number[] } {
  const harness = createEnemyHarness([0.25, 0.75, 0.4, 0.6, 0.1, 0.9]);
  const canvas = createRecordingCanvas();
  createEnemyPresentation(presentationDependencies(harness.clock, canvas.observer)).install(harness.types);
  const Boss = harness.types[BOSS_CONSTRUCTORS[id]];
  const entity = new Boss(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as unknown as Steppable;
  entity.introT = 0;
  const player = Object.assign(createTestPlayer({ x: CONFIG.view.w / 2 + 250 }), {
    hazardDmgMult: 1,
    invulnerable: false,
  });
  const platforms = createBossArena(id, CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY, 0.5) ?? harness.platforms;
  return {
    ...subjectFor(id, harness, canvas, entity, platforms as EnemyPlatform[], player),
    phaseMarks: bossPhaseMarks(id),
  };
}

/** Every enemy kind the game defines, with no variant and with each of its variants. */
export function enemyCases(): readonly Readonly<{ kind: EnemyKind; variant: string | null }>[] {
  return ENEMY_IDENTITY_IDS.flatMap((kind) => [
    { kind, variant: null },
    ...(VARIANTS[kind] ?? []).map((variant) => ({ kind, variant: variant.id })),
  ]);
}

export function createEnemySubject(kind: EnemyKind, variant: string | null): Subject {
  const harness = createEnemyHarness([0.25, 0.75, 0.4, 0.6, 0.1, 0.9]);
  const canvas = createRecordingCanvas();
  createEnemyPresentation(presentationDependencies(harness.clock, canvas.observer)).install(harness.types);
  const entity = STANDARD_ACTOR_FACTORIES[kind](harness.types) as unknown as Steppable;
  if (variant !== null)
    applyVariant(
      entity,
      (VARIANTS[kind] ?? []).find((entry) => entry.id === variant),
    );
  entity.spawnT = 0;
  const player = Object.assign(createTestPlayer({ x: entity.x + 320 }), { hazardDmgMult: 1, invulnerable: false });
  return subjectFor(variant === null ? kind : `${kind}:${variant}`, harness, canvas, entity, harness.platforms, player);
}

/** A stun the fight injected: the move it caught, and the move state on the first tick after it ended. */
export interface StunProbe {
  readonly tick: number;
  readonly caught: string;
  readonly phase: number;
  resumed: string | null;
  /** The stun overlapped a phase change or the start of death, where the move ends by design. */
  ended: boolean;
}

export interface Fight {
  readonly records: readonly TickRecord[];
  readonly stuns: readonly StunProbe[];
}

/** How long each phase of a boss fight, and an enemy fight, is stepped. */
export const BOSS_PHASE_SECONDS = 40;
export const ENEMY_SECONDS = 20;
/** Seconds a stun lasts: the hammer's break on a boss (`applyBreak`), and a parry on an enemy. */
const BOSS_STUN = 0.42;
/** How long a boss fight waits, at the end of a phase, for a move to be live before crossing the next mark. */
const MID_MOVE_WAIT_SECONDS = 10;
const ENEMY_STUN = 0.5;

/**
 * Steps a fight and draws every tick. Every third move the entity starts is stunned on its tenth tick.
 * A boss runs each phase in turn, its health set just under the next phase mark while a move is live, then takes a lethal hit
 * and is stepped through its death.
 */
export function runFight(subject: Subject, boss: readonly number[] | null): Fight {
  const entity = subject.entity;
  const records: TickRecord[] = [];
  const stuns: StunProbe[] = [];
  let tick = 0,
    moves = 0,
    moveTicks = 0,
    open: StunProbe | null = null;
  const advance = (): boolean => {
    if (subject.step(tick)) return true;
    const record = subject.draw();
    records.push(record);
    if (open !== null && (record.phase !== open.phase || record.dying)) open.ended = true;
    if (open !== null && !record.stunned) {
      open.resumed = `${record.state}/${record.liveMove ?? "rest"}`;
      open = null;
    }
    if (record.liveMove === null) moveTicks = 0;
    else {
      if (moveTicks === 0 || record.liveMove !== records.at(-2)?.liveMove) {
        moves += 1;
        moveTicks = 0;
      }
      moveTicks += 1;
      if (moveTicks === 10 && moves % 3 === 0 && !record.stunned && !record.dying) {
        entity.stun = Math.max(entity.stun, boss === null ? ENEMY_STUN : BOSS_STUN);
        open = {
          tick: record.tick,
          caught: `${record.state}/${record.liveMove}`,
          phase: record.phase,
          resumed: null,
          ended: false,
        };
        stuns.push(open);
      }
    }
    tick += 1;
    return false;
  };
  if (boss === null) {
    for (let i = 0; i < ENEMY_SECONDS / DT; i += 1) if (advance()) break;
    return { records, stuns };
  }
  entity.introT = 0;
  for (let phase = 1; phase <= boss.length + 1; phase += 1) {
    if (phase > 1) {
      // Cross the mark mid-move, so the phase change has a live move to end.
      for (let i = 0; i < MID_MOVE_WAIT_SECONDS / DT; i += 1) {
        if (entity.liveMove() !== null && entity.stun <= 0) break;
        if (advance()) return { records, stuns };
      }
      entity.hp = entity.maxHp * ((boss[phase - 2] ?? 0) - 0.02);
    }
    for (let i = 0; i < BOSS_PHASE_SECONDS / DT; i += 1) if (advance()) return { records, stuns };
  }
  for (let i = 0; i < 12 / DT; i += 1) {
    if (!entity.dying && !entity.dead) {
      entity.hitCd = 0;
      entity.hit(entity.hp + 5000, 0, 0);
    }
    if (advance()) break;
  }
  return { records, stuns };
}
