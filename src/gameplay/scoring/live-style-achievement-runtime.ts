import {
  bossKillIntents, breakStaticParry, dashDodgeIntents, hordeClearIntents, killIntents,
  markRevived, markStageRestriction, parryIntents, recordBossHit, resetStageRestrictions,
  stageDoneIntents, tickAchievementRuntime, tracksAchievements,
  type AchievementBoss, type AchievementEnemy, type AchievementPlayer, type AchievementRunState,
  type DodgeProjectile,
} from "../progression/achievement-runtime";
import { addStyle, loseStyle, rankForCombo, trickColor, updateStyle, type TrickTuning } from "./style-runtime";
import {
  applyStyleSnapshot, executeAchievementIntents, executeStyleIntents, snapshotStyle, splitParryProjectile,
  type MutableStyleRun, type SplitProjectile, type StyleIntentPorts,
} from "./style-runtime-coordinator";

export interface LiveStyleRun extends AchievementRunState, MutableStyleRun {}

export interface LiveStylePlayer extends AchievementPlayer { readonly x: number; readonly y: number }

export interface LiveAchievementTracker {
  on(): boolean;
  stageReset(): void;
  swung(): void;
  thrown(): void;
  jumped(): void;
  bossHit(enemy: AchievementBoss, source: string): void;
  bossKill(enemy: AchievementBoss): void;
  stageDone(): void;
  onKill(): void;
  parry(): void;
  breakStreak(): void;
  dashDodge(projectile: DodgeProjectile): void;
  revived(): void;
  hordeCleared(seconds: number): void;
  tick(dt: number): void;
}

export interface LiveStyleAchievementOptions<TProjectile extends SplitProjectile> {
  readonly run: () => LiveStyleRun | null;
  readonly player: () => LiveStylePlayer;
  readonly enemies: () => readonly AchievementEnemy[];
  readonly moving: () => boolean;
  readonly tuning: () => TrickTuning;
  readonly colors: () => Readonly<{ perfect: string; charger: string; bomber: string }>;
  readonly ghostRecording: () => boolean;
  readonly styleIntents: StyleIntentPorts;
  readonly profileMax: (stat: string, value: number) => void;
  readonly achievementCheck: () => void;
  readonly metaLevel: (id: "thickskin" | "warding" | "sharp") => number;
  readonly projectileSpeed: () => number;
  readonly createProjectile: (x: number, y: number, vx: number, vy: number) => TProjectile;
  readonly addProjectile: (projectile: TProjectile) => void;
}

export interface LiveStyleAchievementApi<TProjectile extends SplitProjectile> {
  readonly achievements: LiveAchievementTracker;
  readonly addStyle: (kind: string) => void;
  readonly tracks: () => boolean;
  readonly check: () => void;
  readonly loseStyle: () => void;
  readonly recompute: () => void;
  readonly update: (dt: number) => void;
  readonly color: (multiplier: number) => string;
  readonly splitProjectile: (projectile: TProjectile) => void;
  readonly formatTime: (seconds: number) => string;
}

export function createLiveStyleAchievementRuntime<TProjectile extends SplitProjectile>(
  options: LiveStyleAchievementOptions<TProjectile>,
): LiveStyleAchievementApi<TProjectile> {
  const run = (): LiveStyleRun => {
    const current = options.run();
    if (current === null) throw new Error("style runtime requires an active run");
    return current;
  };
  const dispatch = (intents: Parameters<typeof executeAchievementIntents>[0]): void => {
    executeAchievementIntents(intents, options.profileMax, options.achievementCheck);
  };
  const achievements: LiveAchievementTracker = {
    on: () => tracksAchievements(options.run()),
    stageReset: () => { resetStageRestrictions(options.run()); },
    swung: () => { markStageRestriction(options.run(), "swung"); },
    thrown: () => { markStageRestriction(options.run(), "thrown"); },
    jumped: () => { markStageRestriction(options.run(), "jumped"); },
    bossHit: (enemy: AchievementBoss, source: string) => { recordBossHit(enemy, source); },
    bossKill: (enemy: AchievementBoss) => { dispatch(bossKillIntents(options.run(), enemy)); },
    stageDone: () => { dispatch(stageDoneIntents(options.run(), {
      thickskin: options.metaLevel("thickskin"), warding: options.metaLevel("warding"), sharp: options.metaLevel("sharp"),
    })); },
    onKill: () => { dispatch(killIntents(options.run(), options.player())); },
    parry: () => { dispatch(parryIntents(options.run())); },
    breakStreak: () => { breakStaticParry(options.run()); },
    dashDodge: (projectile: DodgeProjectile) => { dispatch(dashDodgeIntents(options.run(), projectile)); },
    revived: () => { markRevived(options.run()); },
    hordeCleared: (seconds: number) => { dispatch(hordeClearIntents(options.run(), seconds)); },
    tick: (dt: number) => { dispatch(tickAchievementRuntime({ run: options.run(), player: options.player(),
      enemies: options.enemies(), moving: options.moving(), dt })); },
  };
  return Object.freeze({
    achievements,
    addStyle: (kind: string) => {
      const current = run(), player = options.player();
      const result = addStyle({ kind, state: snapshotStyle(current), tuning: options.tuning(),
        player: { x: player.x, y: player.y }, ghostRecording: options.ghostRecording(),
        achievementTracking: tracksAchievements(current) });
      applyStyleSnapshot(current, result.state); executeStyleIntents(result.intents, options.styleIntents);
    },
    tracks: () => tracksAchievements(options.run()),
    check: options.achievementCheck,
    loseStyle: () => { const current = run(); applyStyleSnapshot(current, loseStyle(snapshotStyle(current), options.tuning())); },
    recompute: () => { const current = run(), next = rankForCombo(current.combo, options.tuning().tiers);
      current.mult = next.mult; current.rank = next.rank; },
    update: (dt: number) => { const current = run(); applyStyleSnapshot(current, updateStyle(snapshotStyle(current), options.tuning(), dt)); },
    color: (multiplier: number) => trickColor(multiplier, options.colors()),
    splitProjectile: (projectile: TProjectile) => { splitParryProjectile(projectile, options.projectileSpeed(),
      options.createProjectile, options.addProjectile); },
    formatTime: (seconds: number) => `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`,
  });
}
