import type { LiveStyleAchievementOptions } from "../../gameplay/scoring/live-style-achievement-runtime";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { LiveGameHostState } from "../world/game-host-state";
import type { LiveWorldEntityConstructionPort } from "../world/world-entity-factory";
import type { LiveTutorialRuntime } from "../../gameplay/training/live-tutorial-runtime";
import { createLiveStyleAchievementRuntime } from "../../gameplay/scoring/live-style-achievement-runtime";
import { isTutorialMark } from "../../gameplay/training/tutorial-marks";

export interface LiveStyleHostServices {
  readonly observeStyle?: LiveStyleAchievementOptions<never>["observeStyle"];
  readonly persistentEffects?: () => boolean;
  readonly dependencies: GameRuntimeDependencies;
  readonly entities: Pick<LiveWorldEntityConstructionPort, "createProjectile">;
  readonly state: LiveGameHostState;
  readonly tutorial: LiveTutorialRuntime;
  readonly captureGhost: (trick: string, x: number, y: number) => void;
  readonly rankUp: (rank: string) => void;
  readonly musicRankChanged: (rank: string) => void;
  readonly addProjectile: (projectile: InstanceType<GameRuntimeDependencies["Projectile"]>) => void;
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`style host requires ${label}`);
  return value;
}

/** Owns style scoring, achievement tracking, and split-projectile construction. */
export function createLiveStyleHost(services: LiveStyleHostServices) {
  const { dependencies: d, state } = services;
  const player = () => required(state.player(), "player");
  const persistent = () => services.persistentEffects?.() !== false;
  const achievementCheck = () => {
    if (persistent()) d.styleAchievementPersistence.checkAndSave();
  };
  const profileMax = (stat: string, value: number) => {
    if (persistent()) d.profileStatsPersistence.max(stat, value);
  };
  return createLiveStyleAchievementRuntime({
    ...(services.observeStyle === undefined ? {} : { observeStyle: services.observeStyle }),
    persistentEffects: persistent,
    run: () => state.run(),
    player,
    enemies: () => state.enemies(),
    moving: () => d.Input.left() || d.Input.right(),
    tuning: () => d.CONFIG.trick,
    colors: () => d.CONFIG.colors,
    styleIntents: {
      tutorialMark: (trick) => {
        if (isTutorialMark(trick)) services.tutorial.mark(trick);
      },
      ghostCapture: services.captureGhost,
      playerTrick: (trick, at) => {
        player().lastTrickKind = trick;
        player().lastTrickT = at;
      },
      rankUp: services.rankUp,
      musicRankChanged: services.musicRankChanged,
      haptic: (pattern) => {
        d.Input.buzz(typeof pattern === "number" ? pattern : [...pattern]);
      },
      profileAdd: (stat, amount) => {
        if (persistent()) d.profileStatsPersistence.add(stat, amount);
      },
      dailyBump: (stat, amount) => {
        if (persistent()) d.DAILY.bump(stat, amount);
      },
      profileMax,
      achievementCheck,
    },
    profileMax,
    achievementCheck,
    metaLevel: (id) => d.META.level(id),
    projectileSpeed: () => d.CONFIG.proj.speed,
    createProjectile: services.entities.createProjectile,
    addProjectile: services.addProjectile,
  });
}
