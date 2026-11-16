/**
 * Boss tells: what a boss is about to strike, as data. A boss reports its current tells, the shared
 * renderer draws them, and the rule tests read the same data, so a warning a player sees and a warning
 * a test measures cannot drift apart.
 */
/** "exposed" marks a boss open to punishment after a move: it never hurts, and hits on the boss count more. */
export type BossTellStage = "warning" | "active" | "exposed";

/** How the tell is drawn. Every tell also carries the rectangle it threatens; "self" marks the boss itself. */
export type BossTellMark = "lane" | "column" | "reticle" | "band" | "box" | "destination" | "self";

export interface BossTell {
  /** Stable per attack and target, for example "rootline" or "memory-choir:2". */
  readonly id: string;
  readonly attackId: string;
  readonly mark: BossTellMark;
  readonly stage: BossTellStage;
  /** Centre and half extents of the threatened area, in world pixels. */
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  /** For a lane: the side the strike travels toward. */
  readonly dir?: number;
  /** Authored warning length in seconds, and what is left of it (0 once active). */
  readonly leadSeconds: number;
  readonly remainingSeconds: number;
  /** False for a tell that marks movement only (a landing spot) and never hurts. */
  readonly damaging: boolean;
}

export interface BossTellSource {
  tells?(): readonly BossTell[];
  readonly state?: string;
  readonly stateT?: number;
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
}

export type BossTellDifficulty = "easy" | "normal" | "hard" | "extreme";

/**
 * The shortest warning a damaging boss attack may have, per difficulty. Boss windups do not scale with
 * difficulty today, so every row holds the agreed normal value until tuning says otherwise.
 */
export const BOSS_TELL_MIN_LEAD_SECONDS: Readonly<Record<BossTellDifficulty, number>> = Object.freeze({
  easy: 0.45,
  normal: 0.45,
  hard: 0.45,
  extreme: 0.45,
});

const EMPTY: readonly BossTell[] = Object.freeze([]);

/** Windup state names the older bosses share: "windup", "lungewind", "smashwind", "aim". */
const WINDUP_STATE = /(?:wind|windup|aim)$/u;

/**
 * A boss's tells. A boss that reports its own is read directly. An older boss that does not is read
 * from its state machine: a windup state becomes one tell around its body with no authored length, so
 * the rule tests can time it but cannot check where it strikes.
 */
export function bossTells(boss: BossTellSource): readonly BossTell[] {
  if (typeof boss.tells === "function") return boss.tells();
  const state = boss.state ?? "";
  if (!WINDUP_STATE.test(state)) return EMPTY;
  return Object.freeze([
    Object.freeze({
      id: `state:${state}`,
      attackId: state,
      mark: "self" as const,
      stage: "warning" as const,
      x: boss.x,
      y: boss.y,
      hw: boss.hw,
      hh: boss.hh,
      leadSeconds: 0,
      remainingSeconds: Math.max(0, boss.stateT ?? 0),
      damaging: true,
    }),
  ]);
}

/** True when a boss reports authored tells rather than being read from its state names. */
export function bossReportsTells(boss: BossTellSource): boolean {
  return typeof boss.tells === "function";
}

/** 0 at the start of the warning, 1 at the strike. */
export function bossTellProgress(tell: BossTell): number {
  if (tell.stage === "active" || tell.leadSeconds <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - tell.remainingSeconds / tell.leadSeconds));
}

export function bossTellCovers(
  tell: BossTell,
  target: Readonly<{ x: number; y: number; hw: number; hh: number }>,
): boolean {
  return Math.abs(tell.x - target.x) <= tell.hw + target.hw && Math.abs(tell.y - target.y) <= tell.hh + target.hh;
}
