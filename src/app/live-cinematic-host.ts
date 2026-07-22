import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameProjectile } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { ArenaPlatform, SourceVoidController } from "../gameplay/training/arena-rules";
import { createSourceVoidRuntimeBridge } from "../gameplay/campaign/source-void-runtime";
import { createLiveCinematicRuntime, type LiveCinematicRuntimeOptions,
  type LiveCinematicStory } from "../gameplay/campaign/live-cinematic-runtime";
import { BossRitualController } from "../gameplay/entities/boss-ritual-controller";
import type { VoidLane } from "../gameplay/voidgen-contracts";

interface CinematicStage { platforms: ArenaPlatform[]; readonly current: { readonly accent: string } }

export interface LiveCinematicHostContext {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly sourceController: SourceVoidController;
  readonly cinema: LiveCinematicRuntimeOptions["cinema"];
  readonly story: LiveCinematicStory;
  readonly stage: CinematicStage;
  readonly width: number;
  readonly policy: () => Readonly<{ play: boolean; brief: boolean }>;
  readonly clearBossBeat: () => void;
  readonly setWorldZoom: (value: number) => void;
  readonly spawnWisp: (x: number, y: number, lane: VoidLane) => void;
  readonly addFlash: (amount: number) => void;
  readonly addShake: (amount: number) => void;
  readonly loseStyle: () => void;
  readonly shieldAbsorb: () => void;
  readonly addFloater: (x: number, y: number, text: string, emphasis: boolean, color: string) => void;
  readonly finaleBladeCut: LiveCinematicRuntimeOptions["finaleBladeCut"];
  readonly playSound: (cue: string) => void;
}

/** Owns Source-void effects and cinematic player/ritual orchestration. */
export function createLiveCinematicHost(context: LiveCinematicHostContext) {
  const { dependencies: d, state } = context;
  const run = () => {
    const value = state.run();
    if (value === null) throw new Error("Cinematic host requires an active run");
    return value;
  };
  const player = () => {
    const value = state.player();
    if (value === undefined) throw new Error("Cinematic host requires a player");
    return value;
  };
  const sourceRuntime = createSourceVoidRuntimeBridge<GameProjectile>({
    controller: context.sourceController, get player() { return player(); }, get platforms() { return context.stage.platforms; },
    get projectiles() { return state.projectiles(); }, get perfectColor() { return d.CONFIG.colors.perfect; },
    get runTime() { return run().runTime; }, get state() { return run().voidScroll ?? null; },
    replaceProjectiles: (value) => { state.setProjectiles(value); },
    replacePlatforms: (value) => { context.stage.platforms = value; },
    clearDescent: () => { run().voidDescent = null; }, clearBossBeat: context.clearBossBeat,
    setWorldZoom: context.setWorldZoom, spawnWisp: context.spawnWisp,
    liveWispCount: () => state.enemies().filter((enemy) => enemy.isVoidWisp === true && !enemy.dead).length,
    flash: context.addFlash, shake: context.addShake,
    explode: (x, y, color, scale) => { d.FX.explode(x, y, color, scale); },
    burst: (x, y, dx, dy, count, color) => { d.FX.burst(x, y, dx, dy, count, color); },
    ring: (x, y, radius, color) => { d.FX.ring(x, y, radius, color); },
    shockwave: (x, y, radius, color, speed, width) => { d.FX.shockwave(x, y, radius, color, speed, width); },
    musicDuck: (amount, duration) => { d.SFX.setMusicDuck(amount, duration); },
    voidMix: (amount, duration) => { d.SFX.setVoidDescent(amount, duration); },
    sound: (cue) => { if (cue === "source-dialogue") d.SFX.dialogueTone("source"); else d.SFX.voidGroundTear(); },
    voidTransfer: () => { d.SFX.voidTransfer(); },
    onDamageResult: (result) => { if (result === "hit") { context.loseStyle(); d.SFX.hurt(); } else if (result === "absorbed") context.shieldAbsorb(); },
    floater: context.addFloater,
  });

  const runtime = createLiveCinematicRuntime({
    cinema: context.cinema, sourceController: context.sourceController,
    ritualController: new BossRitualController(), sourceRuntime,
    player, blade: () => state.blade() ?? null,
    platforms: () => context.stage.platforms, ritualPlatforms: () => context.stage.platforms,
    replacePlatforms: (value) => { context.stage.platforms = value; },
    projectiles: () => state.projectiles(), replaceProjectiles: (value) => { state.setProjectiles(projectiles(value)); },
    sourceSeed: () => run().voidSeed,
    setDescent: (value) => { run().voidDescent = value; }, setStream: (value) => { run().voidScroll = value; },
    hasVoidScroll: () => run().voidScroll != null, story: context.story, policy: context.policy,
    reducedMotion: () => d.A11Y.reducedMotion, gravity: () => d.CONFIG.world.gravity,
    maxFall: () => d.CONFIG.player.maxFall, descentLiftVelocity: () => d.CONFIG.source.descentLiftV,
    viewportWidth: context.width, groundY: () => d.CONFIG.world.groundY,
    bomberColor: () => d.CONFIG.colors.bomber, dialogueDuck: () => d.CONFIG.presentation.dialogueDuck,
    verticalResponse: () => d.CONFIG.aldric.verticalResponse, time: () => d.CLOCK.sim,
    lerp: d.lerp, clamp: d.clamp, clearBossBeat: context.clearBossBeat,
    setMusicDuck: (amount, duration) => { d.SFX.setMusicDuck(amount, duration); },
    playSound: context.playSound,
    storeSeen: (key) => { localStorage.setItem(key, "1"); },
    landing: (x, y) => { d.FX.burst(x, y, 0, -1, d.GFX.low ? 5 : 10, context.stage.current.accent); d.SFX.land(); },
    finaleBladeCut: context.finaleBladeCut,
  });
  return Object.freeze({ sourceRuntime, runtime });
}

function projectiles(values: unknown[]): GameProjectile[] {
  return values.filter((value): value is GameProjectile => typeof value === "object" && value !== null
    && "x" in value && "y" in value && "r" in value);
}
