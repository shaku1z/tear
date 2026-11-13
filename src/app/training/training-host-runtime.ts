import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameEnemy, GameRun } from "../shell/game-runtime-state";
import type { LiveGameHostState } from "../world/game-host-state";
import { createLiveTutorialRuntime, resetTutorialActors, recoverTutorialBlade } from "../../gameplay/training/live-tutorial-runtime";
import { PLAYGROUND_ALL_KINDS, PlaygroundController } from "../../gameplay/training/playground-controller";
import { createPlaygroundRuntimeBridge } from "../../gameplay/training/runtime-bridge";
import { createLivePlaygroundPresentation } from "../../gameplay/training/live-playground-presentation";
import type { PlaygroundScreenModel } from "../../gameplay/training/live-playground-presentation";
import type { ArenaPlatform } from "../../gameplay/training/arena-rules";
import { createTutorialArena } from "../../gameplay/training/tutorial-arenas";
import type { AppScreen } from "../interface/app-state-controller";
import type { TutorialGhostSnapshot } from "../../gameplay/training/tutorial-controller";
import { AUTHORED_BOSS_ROSTER } from "../../gameplay/run/content-director";
import type { LiveWaveSpawnSpec } from "../../gameplay/run/live-enemy-spawn";
import type { RunDifficulty } from "../../gameplay/run/session";
import { practiceEnemyCatalog } from "../../gameplay/training/practice-enemy-catalog";

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

function requireRun(state: LiveGameHostState): GameRun {
  const run = state.run();
  if (run === null) throw new Error("Training host requires an active run");
  return run;
}

/** Owns tutorial and playground control, simulation bridge, and training screen models. */
export function createLiveTrainingHostRuntime(context: LiveTrainingHostContext) {
  const { dependencies: d, state } = context;
  const player = () => {
    const value = state.player();
    if (value === undefined) throw new Error("Training host requires a player");
    return value;
  };
  const tutorial = createLiveTutorialRuntime({
    reducedMotion: () => d.A11Y.reducedMotion,
    bossCatalog: () => d.practiceEncounterPersistence?.bossCatalog() ?? [],
    enemyCatalog: () => d.practiceEncounterPersistence?.catalog() ?? practiceEnemyCatalog((key) => d.PROFILE.stat(key)),
    config: d.CONFIG, viewportWidth: context.width, groundY: () => d.CONFIG.world.groundY,
    skipPressed: () => d.Input.pressed.has("KeyN"),
    movingLeft: () => player().aiInput?.left() === true, movingRight: () => player().aiInput?.right() === true,
    player, bladeState: () => state.blade()?.state ?? "held", bladeTipVY: () => state.blade()?.tipVY ?? 0, weaponId: () => requireRun(state).weaponId, enemies: () => state.enemies(),
    playSound: (cue) => { if (cue === "rankup") d.SFX.rankup(); else d.SFX.ui(); },
    spawn: (kind, hpScale) => {
      const enemy = context.spawn(kind, hpScale);
      if (enemy === undefined) throw new Error(`Training spawn failed for ${kind}`);
      return enemy;
    },
    installArena: (arena) => {
      context.stage.platforms = createTutorialArena(arena, context.width, context.height, d.CONFIG.world.groundY);
    },
    resetTrainingSpace: () => {
      context.resetTrainingCarry?.();
      state.setEnemies([]); state.setProjectiles([]);
      resetTutorialActors(d.CONFIG, context.width, player(), state.blade());
    },
    recoverBlade: () => { recoverTutorialBlade(d.CONFIG, player(), state.blade()); },
    beginPractice: () => { context.startPractice("completion"); }, finishBossPractice: () => { context.navigate("paused"); context.releasePointer(); },
    terminateRun: (reason) => { context.lifecycle.terminate(reason); },
    navigate: (screen) => { context.navigate(screen); }, releasePointer: context.releasePointer,
    addProfileStat: d.profileStatsPersistence.add,
    completeCourse: async (id) => {
      const status = await (d.tutorialCompletionPersistence?.complete(id) ?? Promise.resolve("unavailable"));
      const actor = state.player();
      if (actor !== undefined) context.addFloater(actor.x, actor.y - 70,
        status === "committed" || status === "already" ? "TUTORIAL PROGRESS SAVED" : "TUTORIAL COMPLETE · SAVE NOT CONFIRMED",
        true, status === "committed" || status === "already" ? d.CONFIG.colors.perfect : "#e0a326");
      return status;
    },
    checkAchievements: () => { d.ACH.check(); }, drawGhost: context.drawGhost,
  });

  const controller = new PlaygroundController();
  const runtime = createPlaygroundRuntimeBridge({
    controller,
    get difficulties() { return d.CONFIG.difficulties; }, get colors() { return d.CONFIG.colors; },
    get stageNames() { return d.PLAYGROUND_STAGES.map((stage) => stage.name); }, get groundY() { return d.CONFIG.world.groundY; },
    get viewportWidth() { return context.width; }, get viewportHeight() { return context.height; },
    get pressed() { return d.Input.pressed; }, get player() { return player(); }, get run() { return requireRun(state); },
    get enemies() { return state.enemies(); }, scalePlayerDamage: (ratio) => { d.CONFIG.player.dmgTakenMult *= ratio; },
    clearProjectiles: () => { state.setProjectiles([]); }, spawn: context.spawn,
    announce: (text, emphasis, color) => { const actor = player(); context.addFloater(actor.x, actor.y - 60, text, emphasis, color); },
    navigate: (screen) => { context.navigate(screen); if (screen === "pglab") context.resetScroll(); },
    releasePointer: context.releasePointer, requestPointer: context.requestPointer,
    dismissMirror: () => { d.Mirror.active = false; },
    selectArena: (arena) => { if (arena === -1) { context.selectStage(0); context.stage.platforms = runtime.homePlatforms(); } else context.selectStage(arena); },
    wipe: context.wipe, resetRun: () => { context.resetRun(requireRun(state).diff); },
    applyUpgrade: (id) => { const upgrade = d.UPGRADES.find((entry) => entry.id === id); if (upgrade !== undefined) d.applyUpgrade(upgrade, { config: d.CONFIG, ...trainingActors(state) }); },
    tierUp: (id) => { d.tierUp(id, { config: d.CONFIG, ...trainingActors(state) }); },
    actions: {
      selectWeapon: context.selectWeapon, restartWithWeapon: () => { context.resetRun(requireRun(state).diff); },
      resetAtDifficulty: () => { context.resetRun(requireRun(state).diff); },
      openLab: () => { context.navigate("pglab"); context.resetScroll(); }, clearLabScroll: context.resetScroll,
      lookupUpgrade: (id) => {
        const upgrade = d.UPGRADES.find((entry) => entry.id === id);
        if (upgrade === undefined) return null;
        const tierCount = upgrade.tiers?.length;
        return { id: upgrade.id, unique: upgrade.unique,
          ...(tierCount === undefined ? {} : { tierCount }), owned: requireRun(state).mods.owned[id] ?? 0,
          tier: requireRun(state).mods.tier[id] ?? 0 };
      },
      playUi: () => { d.SFX.ui(); }, playRankUp: () => { d.SFX.rankup(); },
    },
  });

  const presentation = createLivePlaygroundPresentation({
    run: () => requireRun(state), oneHit: () => player().oneHit, kinds: PLAYGROUND_ALL_KINDS,
    difficulties: () => d.CONFIG.difficulties, bosses: AUTHORED_BOSS_ROSTER,
    weapons: () => d.WEAPONS, colors: () => d.CONFIG.colors, uiAccent: () => "#13c4d6",
    stageAccent: () => context.stage.current.accent, arenaName: () => runtime.arenaName(),
    selectedWeapon: context.selectedWeapon, upgrades: () => d.UPGRADES, abilityColors: context.abilityColors,
    labFilter: () => controller.state.labFilter, viewportHeight: context.height,
    // The Ability Lab's phone composition (compact density) measures and clamps its own scroll extent.
    scroll: context.scroll, setScroll: (value) => { if (!d.UI.density.compact) context.setScroll(value); },
    renderMenu: context.renderMenu, renderLab: context.renderLab,
  });
  return Object.freeze({ tutorial, controller, runtime, presentation });
}

function trainingActors(state: LiveGameHostState) {
  const player = state.player();
  const blade = state.blade();
  const run = state.run();
  if (player === undefined || blade === undefined || run === null) throw new Error("Training actors are unavailable");
  return { player, blade, mods: run.mods };
}
