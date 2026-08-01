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
