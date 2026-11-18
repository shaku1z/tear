import { bossTells, type BossTell } from "../gameplay/entities/boss-tells";

/** What a playtest reads about the boss being fought. Every field comes from the running world. */
export interface BossView {
  readonly id: string;
  readonly phase: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly dead: boolean;
  /** What the boss says it is doing, for naming a hit: its attack label, else its state. */
  readonly doing: string;
  readonly tells: readonly BossTell[];
  /**
   * True for a boss that does not declare its tells. Its only tell is a windup box around its own
   * body with no authored length, so a player cannot know where or when the strike lands.
   */
  readonly limitedTellData: boolean;
}

export interface PlayerBox {
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
}

interface BossActor {
  readonly isBoss?: boolean;
  readonly bossId?: string;
  readonly phase?: number;
  /** The phase the boss has committed to, declared by every boss with phase practice. */
  practicePhaseEntry?(): Readonly<{ phase: number }>;
  readonly hp: number;
  readonly maxHp?: number;
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly dead?: boolean;
  readonly dying?: boolean;
  readonly atk?: string;
  readonly state?: string;
  tells?(): readonly BossTell[];
}

export interface PlaytestWorld {
  enemies(): readonly unknown[];
  player(): unknown;
  run(): unknown;
}

/** The boss in the world, or null before it spawns and after it is removed. */
export function readBoss(world: PlaytestWorld): BossView | null {
  const actor = (world.enemies() as readonly BossActor[]).find((enemy) => enemy.isBoss === true);
  if (actor === undefined) return null;
  return {
    id: actor.bossId ?? "unknown",
    phase: bossPhase(actor),
    hp: Math.max(0, actor.hp),
    maxHp: actor.maxHp ?? actor.hp,
    x: actor.x,
    y: actor.y,
    hw: actor.hw,
    hh: actor.hh,
    dead: actor.dead === true || actor.dying === true || actor.hp <= 0,
    doing:
      actor.atk !== undefined && actor.atk !== "" && actor.atk !== "unavailable"
        ? actor.atk
        : (actor.state ?? "unknown"),
    tells: bossTells(actor),
    limitedTellData: typeof actor.tells !== "function",
  };
}

/**
 * The boss's phase: the committed phase it declares for practice, else its own phase field. The committed phase is
 * the one rule for every boss that has it; some keep the phase field elsewhere (the Echo's lives on its mirror).
 */
function bossPhase(actor: BossActor): number {
  if (typeof actor.practicePhaseEntry === "function") return actor.practicePhaseEntry().phase;
  return typeof actor.phase === "number" ? actor.phase : 1;
}

export function readPlayerBox(world: PlaytestWorld): PlayerBox | null {
  const player = world.player() as Partial<PlayerBox> | undefined;
  if (player === undefined || typeof player.x !== "number" || typeof player.y !== "number") return null;
  return { x: player.x, y: player.y, hw: player.hw ?? 14, hh: player.hh ?? 24 };
}

/**
 * How many defeats the game has answered by restoring the player instead of ending the run, as training modes do.
 * The game counts them where it resolves a defeat (`resolvePlayerDeath`).
 */
export function trainingResets(world: PlaytestWorld): number {
  const run = world.run() as { trainingResets?: unknown } | undefined;
  return typeof run?.trainingResets === "number" ? run.trainingResets : 0;
}

/** True when the box overlaps the rectangle grown by the margin on every side. */
export function boxOverlaps(
  box: PlayerBox,
  area: Readonly<{ x: number; y: number; hw: number; hh: number }>,
  margin = 0,
): boolean {
  return Math.abs(box.x - area.x) <= box.hw + area.hw + margin && Math.abs(box.y - area.y) <= box.hh + area.hh + margin;
}
