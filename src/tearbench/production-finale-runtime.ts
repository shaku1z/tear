import { createFinaleRuntime, type FinaleRuntimeState } from "../gameplay/campaign/finale-runtime";
import { FinaleController } from "../gameplay/campaign/finale-controller";
import type { PreparedVictory } from "../gameplay/run/outcome-planner";
import type { LiveGameHostState } from "../app/live-game-host-state";
import type { RunLifecycleController } from "../gameplay/run/lifecycle";
import type { CinematicDirectorPort, CinematicScript } from "../gameplay/runtime/cinematic-director";
import type { CONFIG } from "../config/game-config";
import { clamp } from "../domain/geometry";
import { stagePlatforms } from "../gameplay/stages";

/** Real finale controller/director over a detached world's actors. All durable ports stay absent. */
export function createProductionFinaleRuntime(options: Readonly<{
  state: LiveGameHostState; lifecycle: RunLifecycleController;
  config: typeof CONFIG; stage: { index: number; platforms: unknown[] };
  cinema: CinematicDirectorPort & { start(script: CinematicScript, context?: Record<string, unknown>): void };
  zoom(value: number): void;
}>) {
  const state = options.state;
  const player = () => { const p = state.player(); if (p === undefined) throw new Error("Finale player unavailable"); return p; };
  const blade = () => { const b = state.blade(); if (b === undefined) throw new Error("Finale blade unavailable"); return b; };
  const run = () => { const r = state.run(); if (r === null) throw new Error("Finale run unavailable"); return r; };
  const story: FinaleRuntimeState = { finale: null, finaleController: new FinaleController(options.config.finale),
    resetFinale() { story.finale = null; story.finaleController = new FinaleController(options.config.finale); },
    syncFinale() { story.finale = story.finaleController.state; return story.finale; } };
  let prepare: ((campaign: boolean, persist: boolean) => PreparedVictory) | undefined;
  let win: ((campaign: boolean) => void) | undefined;
  const runtime = createFinaleRuntime({ runtime: story,
    cinema: { start(script, context) {
      // Callback context is captured by the shared runtime, exactly as in the live host adapter.
      options.cinema.start({ ...script, beats: script.beats.map((beat) => ({ ...beat,
        onEnter: (_, d) => { beat.onEnter?.(context, d); }, onUpdate: (_, d) => { beat.onUpdate?.(context, d); },
        waitUntil: (_, d) => beat.waitUntil?.(context, d) ?? true })),
        onStart: (_, d) => { script.onStart?.(context, d); }, onSkip: (_, d) => { script.onSkip?.(context, d); },
        onComplete: (_, d) => { script.onComplete?.(context, d); }, onCancel: () => { script.onCancel?.(context); } }, {});
    } },
    run, player, blade, prepareVictory: (campaign, persist) => { if (prepare === undefined) throw new Error("Finale outcome owner unavailable"); return prepare(campaign, persist); },
    win: (campaign) => { if (win === undefined) throw new Error("Finale outcome owner unavailable"); win(campaign); },
    formatTime: (seconds) => `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`,
    viewport: { width: options.config.view.w, height: options.config.view.h }, perfectColor: () => options.config.colors.perfect,
    reducedMotion: () => false, lowGraphics: () => false,
    intents: {
      beginLifecycle: () => { options.lifecycle.beginFinale(); },
      clearCombat() { state.setEnemies([]); state.setProjectiles([]); state.setSlowZones([]); state.setTemporaryWalls([]); state.setBossIntro(null); state.setBossBeat(null); run().spawnQueue.length = 0; run().chapterState = "WAVE_LIVE"; },
      freezeVoid() { const r = run(); if (r.voidScroll) { r.voidScroll.active = false; r.voidScroll.frozen = true; } r.voidDescent = null; },
      worldZoom: options.zoom,
      finalBlade(active, restored) { const b = blade(); b.finalFree = active; if (restored) b.restoredTrail = true;
        if (active) { b.hostile = false; b.stolenBy = null; b.state = "held"; const hand = b.handPos(player()); b.x = hand.x; b.y = hand.y; b.vx = 0; b.vy = 0; } },
      restoreStageZero() { options.stage.index = 0; options.stage.platforms = stagePlatforms(0, options.config); state.setSlowZones([]); state.setTemporaryWalls([]); state.setEnemies([]); state.setProjectiles([]); },
      restorePlayer(min, max, y, vy) { const p = player(); p.x = clamp(p.x, p.hw + min, max - p.hw); p.y = Math.min(p.y, y); p.vx = 0; p.vy = vy; p.onGround = false; },
      ring: () => undefined, burst: () => undefined, flash: () => undefined, shake: () => undefined,
      vibrate: () => undefined, sound: () => undefined, voidMix: () => undefined, musicDuck: () => undefined,
      win: (campaign) => { if (win === undefined) throw new Error("Finale completion owner unavailable"); win(campaign); },
    },
  });
  return Object.freeze({ story, runtime, bindOutcome(prepareVictory: NonNullable<typeof prepare>, victory: NonNullable<typeof win>) { prepare = prepareVictory; win = victory; } });
}
