import { BOSS_TELL_MIN_LEAD_SECONDS } from "./boss-tells";

/**
 * Where a move aims, as a field on the move's definition, for any boss or enemy (the new Rootbound's Second Swing
 * is the first; plans/active/VERDANT_PALE_REBUILD.md, 2.4). The mover reads the player once, when the move's tell
 * starts, and closes on that point through the tell: it never tracks the player after the tell has started, so the
 * strike is answered by moving out of that point, by jumping or by dashing again.
 */
export interface MoveAim {
  /** What it aims at: the player where they stand when the tell starts. */
  readonly at: "player-at-tell";
  /** How close it closes, as a share of the move's reach: the point is that far into the strike. */
  readonly reachShare: number;
  /** The farthest it steps toward the point during the tell, px. */
  readonly maxStep: number;
}

/** The player's dash timing, in seconds, as the game config holds it (`CONFIG.dash`). */
export interface DashTiming {
  readonly cooldown: number;
  readonly iframe: number;
}

/**
 * The shortest aimed tell, in ticks at 120 Hz: the shared minimum lead (BOSS_TELL_MIN_LEAD_SECONDS), or the
 * player's dash cooldown and its invulnerability together, whichever is longer. A dash spent as the tell starts
 * is then back in time to carry the player through the strike.
 */
export function minAimedTellTicks(dash: DashTiming): number {
  return Math.max(
    Math.ceil(BOSS_TELL_MIN_LEAD_SECONDS.normal * 120),
    Math.ceil(dash.cooldown * 120) + Math.ceil(dash.iframe * 120),
  );
}

/** An aimed move's tell in ticks: its own, after any phase scaling, and never under `minAimedTellTicks`. */
export function aimedTellTicks(ticks: number, dash: DashTiming): number {
  return Math.max(minAimedTellTicks(dash), Math.round(ticks));
}

/**
 * Where the mover stands to strike the aimed point: `reachShare` of `reach` short of it, on the mover's side, at
 * most `maxStep` from where it is, and inside the arena (`halfWidth` from either wall of `arenaWidth`).
 */
export function aimedStandX(
  aim: MoveAim,
  moverX: number,
  targetX: number,
  reach: number,
  halfWidth: number,
  arenaWidth: number,
): number {
  const side = Math.sign(moverX - targetX) || 1;
  const ideal = targetX + side * aim.reachShare * reach;
  const step = Math.max(-aim.maxStep, Math.min(aim.maxStep, ideal - moverX));
  return Math.max(halfWidth, Math.min(arenaWidth - halfWidth, moverX + step));
}

/** Where the mover is `progress` (0 to 1) through the tell: eased from where it started to where it stands. */
export function aimedTellX(fromX: number, standX: number, progress: number): number {
  const k = Math.max(0, Math.min(1, progress));
  return fromX + (standX - fromX) * k * k * (3 - 2 * k);
}
