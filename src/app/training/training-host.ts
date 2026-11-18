import type { LiveTutorialRuntime } from "../../gameplay/training/live-tutorial-runtime";
import { loadShippingTutorialGold } from "../../gameplay/training/tutorial-gold-shipping";
import type { PlaygroundRuntimeBridge } from "../../gameplay/training/runtime-bridge";
import type {
  createLivePlaygroundPresentation,
  PlaygroundScreenModel,
} from "../../gameplay/training/live-playground-presentation";
import type { ArenaPlatform } from "../../gameplay/training/arena-rules";
import type { TutorialGhostSnapshot, TutorialMark } from "../../gameplay/training/tutorial-controller";
import type { LiveWaveSpawnSpec } from "../../gameplay/run/live-enemy-spawn";
import type { RunDifficulty } from "../../gameplay/run/session";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameEnemy, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveGameHostState } from "../world/game-host-state";
import type { AppScreen } from "../../domain/screen-catalog";

interface TrainingLifecycle {
  terminate(reason: string): void;
}
interface TrainingStage {
  platforms: ArenaPlatform[];
  readonly current: { readonly accent: string };
}

export interface LiveTrainingHostContext {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly width: number;
  readonly height: number;
  readonly lifecycle: TrainingLifecycle;
  readonly stage: TrainingStage;
  readonly spawn: (kind: LiveWaveSpawnSpec["type"], hpScale: number) => GameEnemy | undefined;
  readonly navigate: (screen: AppScreen) => void;
  readonly resetScroll: () => void;
  readonly releasePointer: () => void;
  readonly requestPointer: () => void;
  readonly selectStage: (index: number) => void;
  readonly wipe: () => void;
  readonly resetRun: (difficulty: RunDifficulty) => void;
  readonly startPractice: (origin?: "completion") => void;
  readonly resetTrainingCarry?: () => void;
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
  openPractice(): boolean;
  ensureLoaded(): Promise<void>;
  startTutorial(start: () => void): Promise<void>;
}

function emptyProgress(): readonly [number, number] {
  return [0, 0];
}
const fallbackLesson: ReturnType<LiveTutorialRuntime["step"]> = Object.freeze({
  t: "",
  d: "",
  keys: Object.freeze([]),
  need: undefined,
  ranged: undefined,
  final: undefined,
  arena: "runway",
  arenaLabel: "THE RUNWAY",
  teachingFocus: "movement",
  prog: emptyProgress,
  ok: () => false,
});

/** Lazy training facade. Its concrete runtime is fetched only before a training mode starts. */
export function createLiveTrainingHost(context: LiveTrainingHostContext): LiveTrainingHost {
  let bossPractice: Parameters<LiveTutorialRuntime["bindBossPractice"]>[0] | undefined;
  let loaded: TrainingRuntime | undefined;
  let loading: Promise<void> | undefined;
  let preparedCourseId: string | undefined;
  const fallbackState = {
    god: false,
    freeze: false,
    slow: false,
    hpMultiplier: 1,
    count: 1,
    arena: -1,
    labFilter: "all",
  };

  // The tutorial gold corpus is fetched by the same preflight, so a lesson never
  // starts before its demonstrations exist. A failed corpus load is retried by
  // the next preflight; meanwhile the coach shows no demonstration.
  const ensureLoaded = (): Promise<void> => {
    loading ??= import("./training-host-runtime").then((module) => {
      loaded = module.createLiveTrainingHostRuntime(context);
      if (bossPractice) loaded.tutorial.bindBossPractice(bossPractice);
    });
    return Promise.all([loading, loadShippingTutorialGold()]).then(() => undefined);
  };
  const tutorial: LiveTutorialRuntime = {
    openPractice: (tutorialDone) => loaded?.tutorial.openPractice(tutorialDone) ?? false,
    coachFrameEncounter: () => loaded?.tutorial.coachFrameEncounter(),
    session: () =>
      loaded?.tutorial.session() ?? {
        phase: "inactive",
        lessonId: "move",
        courseCompleted: false,
        helpVisible: false,
        instruction: "",
        progress: [0, 0],
        lessons: [],
      },
    restart: () => loaded?.tutorial.restart() ?? false,
    selectLesson: (id) => loaded?.tutorial.selectLesson(id) ?? false,
    selectAnnex: (id) => loaded?.tutorial.selectAnnex(id) ?? false,
    showAnnexes: () => {
      loaded?.tutorial.showAnnexes();
    },
    bindBossPractice: (port) => {
      bossPractice = port;
      loaded?.tutorial.bindBossPractice(port);
    },
    afterWorldStep: (frame, input) => {
      loaded?.tutorial.afterWorldStep(frame, input);
    },
    interruptCoaching: () => {
      loaded?.tutorial.interruptCoaching();
    },
    observeAttemptFact: (fact) => {
      loaded?.tutorial.observeAttemptFact(fact);
    },
    advanceUnfinished: (assisted) => loaded?.tutorial.advanceUnfinished(assisted) ?? false,
    captureCoachCommands: (commands) => {
      loaded?.tutorial.captureCoachCommands(commands);
    },
    coachAction: (command) => loaded?.tutorial.coachAction(command) ?? false,
    showBosses: () => {
      loaded?.tutorial.showBosses();
    },
    selectBoss: (id, retained) => loaded?.tutorial.selectBoss(id, retained) ?? false,
    selectEnemy: (id) => loaded?.tutorial.selectEnemy(id) ?? false,
    showCatalog: () => {
      loaded?.tutorial.showCatalog();
    },
    weaponEffect: (weaponId, effect) => {
      loaded?.tutorial.weaponEffect(weaponId, effect);
    },
    showHelp: () => {
      loaded?.tutorial.showHelp();
    },
    demonstrate: () => loaded?.tutorial.demonstrate() ?? false,
    captureSession: () => loaded?.tutorial.captureSession(),
    validateSession: (value, weaponId, actors, candidate) => {
      if (!loaded && value !== undefined) throw new Error("Load training before restoring a tutorial session");
      loaded?.tutorial.validateSession(value, weaponId, actors, candidate);
    },
    restoreSession: (value) => {
      if (!loaded && value !== undefined) throw new Error("Load training before restoring a tutorial session");
      loaded?.tutorial.restoreSession(value);
    },
    capturePresentation: () =>
      loaded?.tutorial.capturePresentation() ?? {
        version: 1,
        ghostTime: 0,
        anchorX: 0,
        evidencePulse: false,
        coachIdle: 0,
        coachDemoTime: 0,
        helpVisible: false,
      },
    restorePresentation: (value) => {
      loaded?.tutorial.restorePresentation(value);
    },
    get preparingBoss() {
      return loaded?.tutorial.preparingBoss ?? false;
    },
    get active() {
      return loaded?.tutorial.active ?? false;
    },
    get idx() {
      return loaded?.tutorial.idx ?? 0;
    },
    get doneT() {
      return loaded?.tutorial.doneT ?? 0;
    },
    get endT() {
      return loaded?.tutorial.endT ?? 0;
    },
    get n() {
      return loaded?.tutorial.n ?? Object.freeze({});
    },
    get gT() {
      return loaded?.tutorial.gT ?? 0;
    },
    get anchor() {
      return loaded?.tutorial.anchor ?? context.width / 2;
    },
    get steps() {
      return loaded?.tutorial.steps ?? Object.freeze([]);
    },
    start() {
      if (loaded === undefined) throw new Error("Training preflight must complete before tutorial start");
      loaded.tutorial.start(preparedCourseId ?? "unissued");
    },
    stop() {
      loaded?.tutorial.stop();
    },
    mark(kind: TutorialMark) {
      loaded?.tutorial.mark(kind);
    },
    step() {
      return loaded?.tutorial.step() ?? fallbackLesson;
    },
    drawGhost() {
      loaded?.tutorial.drawGhost();
    },
    update(seconds: number) {
      loaded?.tutorial.update(seconds);
    },
  };
  const playground: PlaygroundRuntimeBridge = {
    get state() {
      return loaded?.runtime.state ?? fallbackState;
    },
    execute(intents) {
      if (loaded === undefined) throw new Error("Training preflight must complete before playground actions");
      loaded.runtime.execute(intents);
    },
    setDifficulty(id) {
      if (loaded === undefined) throw new Error("Training preflight must complete before playground setup");
      loaded.runtime.setDifficulty(id);
    },
    get tab() {
      return loaded?.runtime.tab ?? "spawn";
    },
    set tab(value) {
      if (loaded) loaded.runtime.tab = value;
    },
    enterArena() {
      loaded?.runtime.enterArena();
    },
    nextArena() {
      loaded?.runtime.nextArena();
    },
    arenaName() {
      return loaded?.runtime.arenaName() ?? "HOME";
    },
    spawn(kind) {
      loaded?.runtime.spawn(kind);
    },
    spawnDummy() {
      loaded?.runtime.spawnDummy();
    },
    step() {
      loaded?.runtime.step();
    },
    dispatchAction(id) {
      loaded?.runtime.dispatchAction(id);
    },
    reset() {
      if (loaded) loaded.runtime.reset();
      else
        Object.assign(fallbackState, {
          god: false,
          freeze: false,
          slow: false,
          hpMultiplier: 1,
          count: 1,
          arena: 0,
          labFilter: "all",
        });
    },
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
    renderMenu() {
      loaded?.presentation.renderMenu();
    },
    renderLab() {
      loaded?.presentation.renderLab();
    },
  };
  return Object.freeze({
    tutorial,
    runtime: playground,
    presentation,
    openPractice: () => {
      const tutorialDone = context.dependencies.PROFILE.stat("tutorialDone");
      if (!loaded || !Number.isSafeInteger(tutorialDone) || tutorialDone <= 0) return false;
      context.selectWeapon("sword");
      context.startPractice();
      return loaded.tutorial.openPractice(tutorialDone);
    },
    controller: Object.freeze({
      get state() {
        return playground.state;
      },
    }),
    ensureLoaded,
    async startTutorial(start: () => void) {
      await ensureLoaded();
      const issued = await context.dependencies.tutorialCompletionPersistence?.issue();
      preparedCourseId = issued?.id ?? "unissued";
      try {
        start();
        if (issued?.status !== "committed") {
          const actor = context.state.player();
          if (actor !== undefined)
            context.addFloater(
              actor.x,
              actor.y - 70,
              "PROGRESS STORAGE UNAVAILABLE · COURSE IS PLAYABLE",
              true,
              "#e0a326",
            );
        }
      } finally {
        preparedCourseId = undefined;
      }
    },
  });
}

export function trainingRunRequiresPreflight(mode: GameRun["mode"]): boolean {
  return mode === "tutorial" || mode === "playground";
}
