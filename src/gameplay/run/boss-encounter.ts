/**
 * The simulation half of starting a boss encounter.
 *
 * Freezing the boss for its intro, stamping the fight clock, clearing carried
 * adds, and swapping in the arena are canonical world changes: they decide
 * where the boss stands, when it may act, and what the player can stand on.
 * Only banners, wipes, clip capture, and the intro overlay are presentation.
 *
 * Every host that spawns a boss — live, detached, replay, headless — must run
 * this exact routine, so it lives here rather than being restated per host.
 */
export interface BossEncounterRun<Platform> {
  readonly runTime: number;
  _bossFightT?: number | null;
  bossAdds?: readonly unknown[] | null;
  _preBossPlatforms?: Platform[];
  _brokenPlats?: readonly unknown[] | null;
  _arenaBroken?: Platform[] | null;
}

export interface BossEncounterEnemy {
  introT?: number;
  bossId?: string | null;
}

/**
 * A boss arrival in progress: `delay` game seconds before it starts (the stage wipe), then `t` of `dur`
 * arrival seconds. The record is world state; the simulation advances it one tick at a time.
 */
export interface BossIntroClock {
  delay: number;
  t: number;
  dur: number;
  boss: { introT?: number; dead?: boolean; dying?: boolean } | null;
}

/** Ignores float drift in summed tick lengths: 42 ticks end a 1.4 s arrival, 18 a 0.15 s delay. */
const ARRIVAL_END_EPSILON = 1e-9;

/**
 * Advances the arrival by one simulation tick of `stepSeconds`. The arrival plays at `introScale` time
 * scale, so one tick is stepSeconds / introScale of arrival: a 1.4 s arrival at 0.25 is 42 ticks of 1/120 s,
 * and lasts 1.4 s of wall time in live play. Returns false once the arrival is over (played out, or its boss
 * gone, dead or dying); the boss's `introT` is then 0.
 */
export function advanceBossIntro(intro: BossIntroClock, stepSeconds: number, introScale: number): boolean {
  if (intro.delay > 0) intro.delay = intro.delay - stepSeconds > ARRIVAL_END_EPSILON ? intro.delay - stepSeconds : 0;
  else intro.t = Math.min(intro.dur, intro.t + stepSeconds / introScale);
  const playing =
    intro.t < intro.dur - ARRIVAL_END_EPSILON && intro.boss !== null && !intro.boss.dead && !intro.boss.dying;
  if (intro.boss) intro.boss.introT = playing ? Math.max(0, intro.dur - intro.t) : 0;
  return playing;
}

/** True while the arrival plays (past its delay, boss alive): the frame then runs at the arrival time scale. */
export function bossIntroPlaying(intro: Readonly<BossIntroClock> | null): boolean {
  return intro !== null && intro.delay <= 0 && intro.boss !== null && !intro.boss.dead && !intro.boss.dying;
}

export type BossEncounterCleanupReason = "death" | "reset" | "retry" | "exit" | "stage-transition" | "restore";
export interface BossEncounterCleanupActor {
  readonly isBoss?: boolean;
  cleanupEncounter?(reason: BossEncounterCleanupReason): void;
}

/** Runs opt-in boss cleanup at every world replacement boundary; actors own the idempotence. */
export function cleanupBossEncounterActors(
  actors: readonly BossEncounterCleanupActor[],
  reason: BossEncounterCleanupReason,
): void {
  for (const actor of actors) if (actor.isBoss === true) actor.cleanupEncounter?.(reason);
}

export interface BossEncounterArena<Platform> {
  /** The current world platforms, replaced when the boss brings its own arena. */
  platforms(): Platform[];
  setPlatforms(platforms: Platform[]): void;
  /** The arena for this boss, or null when it fights on the current stage. */
  arenaFor(bossId: string): Platform[] | null;
}

export function beginBossEncounter<Platform>(
  run: BossEncounterRun<Platform>,
  enemy: BossEncounterEnemy,
  introDuration: number,
  arena: BossEncounterArena<Platform>,
): void {
  run._bossFightT = run.runTime;
  enemy.introT = introDuration;
  run.bossAdds = null;
  const platforms = arena.arenaFor(enemy.bossId ?? "warden");
  if (platforms === null) return;
  run._preBossPlatforms = arena.platforms();
  run._brokenPlats = null;
  run._arenaBroken = [];
  arena.setPlatforms(platforms);
}
