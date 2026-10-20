import { createBrowserLiveGhostReference } from "./browser-live-ghost-reference";
import { createLiveGhostReferenceController, type GhostChaseLiveState } from "./live-ghost-reference-controller";
import { ghostReferenceArena, ghostReferenceBoundary, type GhostLiveReference } from "../ghost/live-ghost-reference-data";
import { drawLiveGhostReference, drawLiveGhostSplits, type GhostChaseUi } from "../presentation/world/live-ghost-reference";
import type { GameRun, GamePlayer } from "./game-runtime-state";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";

export function createLiveGhostChase(options: Readonly<{ factory: IDBFactory | undefined; ui: GhostChaseUi; run(): GameRun; player(): GamePlayer; stage(): number;
  platforms(): readonly Readonly<{ x: number; y: number; w: number; h: number }>[]; blocked(): boolean;
  start(reference: GhostLiveReference): void; }>) {
  const controller = createLiveGhostReferenceController({ ...createBrowserLiveGhostReference(options.factory), start: options.start });
  const live = (): GhostChaseLiveState | undefined => {
    const run = options.run(), player = options.player();
    return { runId: run.runSeed, mode: run.mode, difficulty: run.diff, weapon: run.weaponId, time: run.runTime, waveTime: run.waveTime,
      stage: options.stage(), wave: run.wave, score: run.score, hp: player.hp, maxHp: player.maxHp, arena: ghostReferenceArena(options.platforms()), blocked: options.blocked(),
      ...(run.ghostAssistance === undefined ? {} : { assistance: run.ghostAssistance }) };
  };
  const view = () => { const value = controller.snapshot(live()); return !value.active && options.run().ghostAssistance ? Object.freeze({ ...value, message: "Assisted / noncompetitive run · reference not active" }) : value; };
  return Object.freeze({
    choose: controller.choose, cancelPreparation: controller.cancelPreparation, configuration: controller.configuration,
    installed(run: GameRun): void { const assistance = controller.assistance(); if (assistance) run.ghostAssistance = assistance; controller.installed(run.runSeed); },
    toggle: controller.toggle, stop: controller.stop,
    observe(): void { const state = live(); if (state) controller.observe(state); },
    event(event: TearGameplayEvent): void { const state = live(); if (state) { const boundary = ghostReferenceBoundary(event, state); if (boundary) controller.boundary({ ...state, wave: boundary.wave }, boundary.event); } },
    snapshot: view,
    draw: (canvas: CanvasRenderingContext2D) => { drawLiveGhostReference(canvas, controller.snapshot(live())); },
    hud: (canvas: CanvasRenderingContext2D, width: number) => { drawLiveGhostSplits(canvas, view(), width, options.ui); },
  });
}
