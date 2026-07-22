import type { LiveTutorialRuntime } from "../gameplay/training/live-tutorial-runtime";
import type { PlaygroundRuntimeBridge } from "../gameplay/training/runtime-bridge";
import type { createLivePlaygroundPresentation, PlaygroundScreenModel } from "../gameplay/training/live-playground-presentation";
import type { ArenaPlatform } from "../gameplay/training/arena-rules";
import type { TutorialGhostSnapshot, TutorialMark } from "../gameplay/training/tutorial-controller";
import type { LiveWaveSpawnSpec } from "../gameplay/run/live-enemy-spawn";
import type { RunDifficulty } from "../gameplay/run/session";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameEnemy, GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LegacyAppScreen } from "./legacy-state-controller";

interface TrainingLifecycle { terminate(reason: string): void }
interface TrainingStage { platforms: ArenaPlatform[]; readonly current: { readonly accent: string } }

export interface LiveTrainingHostContext {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly width: number;
  readonly height: number;
  readonly lifecycle: TrainingLifecycle;
  readonly stage: TrainingStage;
  readonly spawn: (kind: LiveWaveSpawnSpec["type"], hpScale: number) => GameEnemy | undefined;
  readonly navigate: (screen: LegacyAppScreen) => void;
  readonly resetScroll: () => void;
  readonly releasePointer: () => void;
  readonly requestPointer: () => void;
  readonly selectStage: (index: number) => void;
  readonly wipe: () => void;
  readonly resetRun: (difficulty: RunDifficulty) => void;
  readonly selectedWeapon: () => string;
  readonly selectWeapon: (id: string) => void;
  readonly addFloater: (x: number, y: number, text: string, emphasis: boolean, color: string) => void;
  readonly drawGhost: (snapshot: TutorialGhostSnapshot) => void;
  readonly abilityColors: () => Readonly<Record<string, Readonly<{ color: string }>>>;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly renderMenu: (model: PlaygroundScreenModel) => void;
  readonly renderLab: (model: PlaygroundScreenModel) => void;
}

type PlaygroundPresentation = ReturnType<typeof createLivePlaygroundPresentation>;
type TrainingRuntime = Readonly<{
  tutorial: LiveTutorialRuntime;
  runtime: PlaygroundRuntimeBridge;
  presentation: PlaygroundPresentation;
  controller: Readonly<{ state: PlaygroundRuntimeBridge["state"] }>;
}>;

export interface LiveTrainingHost extends TrainingRuntime {
  ensureLoaded(): Promise<void>;
}

function emptyProgress(): readonly [number, number] { return [0, 0]; }
const fallbackLesson: ReturnType<LiveTutorialRuntime["step"]> = Object.freeze({
  t: "", d: "", keys: Object.freeze([]), need: undefined, ranged: undefined, final: undefined,
  prog: emptyProgress, ok: () => false,
});

/** Lazy training facade. Its concrete runtime is fetched only before a training mode starts. */
export function createLiveTrainingHost(context: LiveTrainingHostContext): LiveTrainingHost {
  let loaded: TrainingRuntime | undefined;
  let loading: Promise<void> | undefined;
  const fallbackState = { god: false, freeze: false, slow: false, hpMultiplier: 1, count: 1, arena: -1, labFilter: "all" };

  const ensureLoaded = (): Promise<void> => {
    loading ??= import("./live-training-host-runtime").then((module) => {
      loaded = module.createLiveTrainingHostRuntime(context);
    });
    return loading;
  };
  const tutorial: LiveTutorialRuntime = {
    get active() { return loaded?.tutorial.active ?? false; },
    get idx() { return loaded?.tutorial.idx ?? 0; },
    get doneT() { return loaded?.tutorial.doneT ?? 0; },
    get endT() { return loaded?.tutorial.endT ?? 0; },
    get n() { return loaded?.tutorial.n ?? Object.freeze({}); },
    get gT() { return loaded?.tutorial.gT ?? 0; },
    get anchor() { return loaded?.tutorial.anchor ?? context.width / 2; },
    get steps() { return loaded?.tutorial.steps ?? Object.freeze([]); },
    start() { if (loaded === undefined) throw new Error("Training preflight must complete before tutorial start"); loaded.tutorial.start(); },
    stop() { loaded?.tutorial.stop(); },
    mark(kind: TutorialMark) { loaded?.tutorial.mark(kind); },
    step() { return loaded?.tutorial.step() ?? fallbackLesson; },
    drawGhost() { loaded?.tutorial.drawGhost(); },
    update(seconds: number) { loaded?.tutorial.update(seconds); },
  };
  const playground: PlaygroundRuntimeBridge = {
    get state() { return loaded?.runtime.state ?? fallbackState; },
    execute(intents) { if (loaded === undefined) throw new Error("Training preflight must complete before playground actions"); loaded.runtime.execute(intents); },
    setDifficulty(id) { if (loaded === undefined) throw new Error("Training preflight must complete before playground setup"); loaded.runtime.setDifficulty(id); },
    nextArena() { loaded?.runtime.nextArena(); }, arenaName() { return loaded?.runtime.arenaName() ?? "HOME"; },
    spawn(kind) { loaded?.runtime.spawn(kind); }, spawnDummy() { loaded?.runtime.spawnDummy(); },
    step() { loaded?.runtime.step(); }, dispatchAction(id) { loaded?.runtime.dispatchAction(id); },
    reset() { if (loaded) loaded.runtime.reset(); else Object.assign(fallbackState, { god: false, freeze: false, slow: false,
      hpMultiplier: 1, count: 1, arena: -1, labFilter: "all" }); },
    homePlatforms() {
      if (loaded) return loaded.runtime.homePlatforms();
      const ground = context.dependencies.CONFIG.world.groundY;
      return [
        { x: 0, y: ground, w: context.width, h: context.height - ground, floor: true },
        { x: context.width * 0.28, y: 560, w: 300, h: 24, oneway: true },
        { x: context.width * 0.62, y: 430, w: 260, h: 24, oneway: true },
      ];
    },
  };
  const presentation: PlaygroundPresentation = {
    renderMenu() { loaded?.presentation.renderMenu(); },
    renderLab() { loaded?.presentation.renderLab(); },
  };
  return Object.freeze({ tutorial, runtime: playground, presentation,
    controller: Object.freeze({ get state() { return playground.state; } }), ensureLoaded });
}

export function trainingRunRequiresPreflight(mode: GameRun["mode"]): boolean {
  return mode === "tutorial" || mode === "playground";
}
