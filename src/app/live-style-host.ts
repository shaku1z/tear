import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LiveTutorialRuntime } from "../gameplay/training/live-tutorial-runtime";
import { createLiveStyleAchievementRuntime } from "../gameplay/scoring/live-style-achievement-runtime";
import type { TutorialMark } from "../gameplay/training/tutorial-controller";

export interface LiveStyleHostServices {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly tutorial: LiveTutorialRuntime;
  readonly captureGhost: (trick: string, x: number, y: number, importance: 1 | 2 | 3) => void;
  readonly rankUp: (rank: string) => void;
  readonly musicRankChanged: (rank: string) => void;
  readonly addProjectile: (projectile: InstanceType<GameRuntimeDependencies["Projectile"]>) => void;
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`style host requires ${label}`);
  return value;
}

const TUTORIAL_MARKS: ReadonlySet<string> = new Set([
  "airHit", "dash", "deflect", "jump", "launch", "moveL", "moveR", "parry",
  "recall", "slam", "strike", "superslam", "throwHit", "updraft",
]);
function isTutorialMark(value: string): value is TutorialMark { return TUTORIAL_MARKS.has(value); }

/** Owns style scoring, achievement tracking, and split-projectile construction. */
export function createLiveStyleHost(services: LiveStyleHostServices) {
  const { dependencies: d, state } = services;
  const player = () => required(state.player(), "player");
  const achievementCheck = () => { d.ACH.check(); d.PROFILE.save(); };
  return createLiveStyleAchievementRuntime({
    run: () => state.run(), player, enemies: () => state.enemies(),
    moving: () => d.Input.left() || d.Input.right(), tuning: () => d.CONFIG.trick,
    colors: () => d.CONFIG.colors, ghostRecording: () => d.GHOST.recording(),
    styleIntents: {
      tutorialMark: (trick) => { if (isTutorialMark(trick)) services.tutorial.mark(trick); },
      ghostCapture: services.captureGhost,
      playerTrick: (trick, at) => { player().lastTrickKind = trick; player().lastTrickT = at; },
      rankUp: services.rankUp, musicRankChanged: services.musicRankChanged,
      haptic: (pattern) => { d.Input.buzz(typeof pattern === "number" ? pattern : [...pattern]); },
      profileAdd: (stat, amount) => { d.PROFILE.addStat(stat, amount); },
      dailyBump: (stat, amount) => { d.DAILY.bump(stat, amount); },
      profileMax: (stat, value) => { d.PROFILE.maxStat(stat, value); }, achievementCheck,
    },
    profileMax: (stat, value) => { d.PROFILE.maxStat(stat, value); }, achievementCheck,
    metaLevel: (id) => d.META.level(id), projectileSpeed: () => d.CONFIG.proj.speed,
    createProjectile: (x, y, vx, vy) => new d.Projectile(x, y, vx, vy),
    addProjectile: services.addProjectile,
  });
}
