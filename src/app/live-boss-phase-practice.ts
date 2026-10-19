import { sourceDescentActor } from "../gameplay/campaign/cinematic-launch-runtime";
import type { CONFIG } from "../config/game-config";
import { createBossArena } from "../gameplay/training/arena-rules";
import { beginBossEncounter, cleanupBossEncounterActors } from "../gameplay/run/boss-encounter";
import { planBossPlacement } from "../gameplay/run/boss-placement";
import { STAGES, stagePlatforms } from "../gameplay/stages";
import { createBossPhasePracticeRuntime, validateBossPhasePracticeState, type BossPhasePracticeActor, type BossPhasePracticeState, type BossPhasePracticeWorld } from "../gameplay/training/boss-phase-practice-runtime";
import type { BossPracticePort } from "../gameplay/training/practice-boss-catalog";
import type { GameEnemy, GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";

type Binding = Pick<BossPhasePracticeState, "encounterId" | "generation" | "bossId" | "seed">;
type PracticeRun = GameRun & { practiceBossEntry?: Binding };
type BossActor = GameEnemy & BossPhasePracticeActor;
export function isPracticeBossActor(actor: object): actor is BossActor { return "practicePhaseEntry" in actor && typeof actor.practicePhaseEntry === "function" && "requestPracticePhase" in actor && typeof actor.requestPracticePhase === "function"; }

/** Shared host adapter. All entry decisions stay in the actor/runtime owners. */
export function createLiveBossPhasePractice(options: {
  config: typeof CONFIG; state: Pick<LiveGameHostState, "run" | "enemies" | "setEnemies" | "setProjectiles" | "setBossIntro" | "setBossBeat">;
  stage: { index: number; platforms: unknown[] }; selectStage(index: number): void; resetEnvironment(): void; createEnemy(id: string, x: number, y: number, run: GameRun): GameEnemy;
  cinematicActive(): boolean; cancelCinema(): void;
}) : BossPracticePort {
  const run = (): PracticeRun => { const value = options.state.run(); if (!value) throw new Error("Boss practice requires a run"); return value; };
  let original: BossActor | undefined;
  const world = (active: PracticeRun = run(), actors = options.state.enemies(), cinema = options.cinematicActive()): BossPhasePracticeWorld | null => {
    const binding = active.practiceBossEntry, actor = actors.find((entry) => entry.isBoss && entry.bossId === binding?.bossId);
    if (!binding || !actor || !isPracticeBossActor(actor)) return null;
    const phase = actor.practicePhaseEntry();
    return { ...binding, weaponId: active.weaponId, difficulty: active.diff, noProgression: active.mode === "tutorial",
      actor, cinematicActive: cinema, arenaReady: options.stage.platforms.length > 0,
      phaseWorldReady: binding.bossId !== "source" || phase.phase === 1 || (active.voidScroll !== null && !active.voidScroll.forming && (active.voidScroll.active || active.voidScroll.frozen) && active.voidScroll.platforms === options.stage.platforms && (phase.phase !== 3 || active.voidScroll.frozen)), checkpointReady: true };
  };
  const runtime = createBossPhasePracticeRuntime({
    createEncounter(request, generation, encounterId) {
      const active = run(); if (active.mode !== "tutorial" || active.weaponId !== "sword" || active.diff !== "normal") throw new RangeError("Boss practice requires baseline Sword/Normal tutorial disposition");
      active.practiceBossEntry = { bossId: request.bossId, generation, encounterId, seed: request.seed };
      options.selectStage(Math.max(0, STAGES.findIndex((stage) => stage.boss === request.bossId)));
      Reflect.set(active, "_biomeIdx", options.stage.index);
      options.stage.platforms = stagePlatforms(options.stage.index, options.config);
      const placement = planBossPlacement(request.bossId, options.config.view.w, options.config);
      const actor = options.createEnemy(placement.factoryId, placement.x, placement.y, active);
      if (!isPracticeBossActor(actor)) throw new RangeError("Boss lacks authored practice entry");
      actor.bossId = request.bossId; if (request.bossId === "echo") Reflect.set(actor, "_live", true);
      original = actor; active.curBoss = request.bossId; options.state.setEnemies([actor]);
      beginBossEncounter(active, actor, options.config.bossTheater.introDur, { platforms: () => options.stage.platforms,
        setPlatforms: (value) => { options.stage.platforms = value; },
        arenaFor: (id) => { const value = createBossArena(id, options.config.view.w, options.config.view.h, options.config.world.groundY, options.config.bossArena.reformWarn); return value === null ? null : [...value]; } });
      options.state.setBossIntro({ boss: actor, t: 0, dur: options.config.bossTheater.introDur, delay: 0 });
    }, observe: () => world(), cleanup() {
      cleanupBossEncounterActors(options.state.enemies(), "reset"); options.cancelCinema(); options.resetEnvironment();
      options.state.setEnemies([]); options.state.setProjectiles([]); options.state.setBossIntro(null); options.state.setBossBeat(null);
      const active = run(); active.voidScroll = null; Reflect.set(active, "voidDescent", null); original = undefined;
    },
  });
  return {
    begin(request) { const result = runtime.begin({ ...request, seed: String(run().runSeed) }); if (result.status === "refused") throw new Error(`Boss practice ${result.reason}`); return result.state; },
    afterWorldStep() {
      const saved = runtime.snapshot(); if (!saved || saved.lifecycle === "cancelled") return undefined;
      // Keep the real installed actor until its genuine death resolves, even if the collection removes it in this tick.
      if (original?.dead === true && saved.lifecycle === "active") return { runtime: saved, defeated: true };
      const result = runtime.afterWorldStep(); if (result.status === "refused") throw new Error(`Boss practice ${result.reason}`);
      return { runtime: result.state, defeated: false };
    },
    validate(selected, candidate) {
      const active = (candidate?.run ?? run()) as PracticeRun, actors = (candidate?.actors ?? options.state.enemies()) as readonly GameEnemy[], cinema = candidate?.cinematicActive ?? options.cinematicActive();
      if (active.mode !== "tutorial" || active.weaponId !== "sword" || active.diff !== "normal" || Object.keys(active.mods.owned).length !== 0 || String(active.runSeed) !== selected.runtime.seed ||
        active.practiceBossEntry?.encounterId !== selected.runtime.encounterId || active.practiceBossEntry.generation !== selected.runtime.generation) throw new RangeError("Boss practice candidate world binding mismatch");
      if (selected.defeated) { if (actors.some((actor) => actor.isBoss && !actor.dead)) throw new RangeError("Finished boss practice has a living boss"); return; }
      const candidateWorld = world(active, [...actors], cinema); if (!candidateWorld) throw new RangeError("Boss practice candidate actor missing");
      validateBossPhasePracticeState(selected.runtime, candidateWorld);
    },
    restore(selected) {
      if (!selected) { runtime.discardSelection(); original = undefined; return; }
      if (selected.defeated) { runtime.restoreFinished(selected.runtime); original = undefined; return; }
      const candidate = world(); if (!candidate) throw new Error("Restored boss practice actor missing");
      runtime.restore(selected.runtime, candidate); original = candidate.actor as BossActor;
      const stream = run().voidScroll; if (selected.bossId === "source" && stream) stream.owner = sourceDescentActor(original);
    },
    capture() { if (original?.dead !== true && runtime.snapshot() && runtime.captureAvailability() !== "canonical-checkpoint") throw new Error("Boss practice is between canonical entry boundaries"); },
    cancel() { runtime.cancel("exit"); original = undefined; },
  };
}
