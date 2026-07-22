import type { BossRitualActor, BossRitualController, BossRitualCue, BossRitualIntent, BossRitualPlatform } from "../entities/boss-ritual-controller";
import type { ArenaPlatform, SourceVoidController, SourceVoidPlayer, SourceVoidState, SourceVoidTransitionState } from "../training/arena-rules";
import { launchBossRitual, launchSourceDescent, type RuntimeCinematicChannel } from "./cinematic-launch-runtime";
import { stepCinematicPlayer, type CinematicFinaleSnapshot, type CinematicRuntimeBlade,
  type CinematicRuntimePlayer } from "./cinematic-player-runtime";
import type { SourceRuntimeOwner, SourceVoidRuntimeBridge } from "./source-void-runtime";

export interface LiveRitualOwner extends BossRitualActor {
  _throwShield?(projectiles: unknown[]): void;
  _chooseVerticalTarget?(player: CinematicRuntimePlayer, platforms: readonly BossRitualPlatform[]): unknown;
  _startVertical?(mode: "vault", target: unknown, player: CinematicRuntimePlayer): void;
  verticalCd?: number; verticalTrackT?: number;
}
export interface LiveCinematicStory {
  finale: CinematicFinaleSnapshot | null; lastCinemaPlayerMode: string | null;
  markFinaleLanded(): void; syncFinale(): void;
}
export interface LiveCinematicRuntimeOptions {
  readonly cinema: RuntimeCinematicChannel & Readonly<{ playerMode: string }>;
  readonly sourceController: SourceVoidController;
  readonly ritualController: BossRitualController;
  readonly sourceRuntime: SourceVoidRuntimeBridge;
  readonly player: () => CinematicRuntimePlayer & SourceVoidPlayer;
  readonly blade: () => CinematicRuntimeBlade | null;
  readonly platforms: () => ArenaPlatform[];
  readonly ritualPlatforms: () => readonly BossRitualPlatform[];
  readonly replacePlatforms: (platforms: ArenaPlatform[]) => void;
  readonly projectiles: () => unknown[];
  readonly replaceProjectiles: (projectiles: unknown[]) => void;
  readonly sourceSeed: () => string | number;
  readonly setDescent: (transition: SourceVoidTransitionState | null) => void;
  readonly setStream: (stream: SourceVoidState) => void;
  readonly hasVoidScroll: () => boolean;
  readonly story: LiveCinematicStory;
  readonly policy: () => Readonly<{ play: boolean; brief: boolean }>;
  readonly reducedMotion: () => boolean;
  readonly gravity: () => number; readonly maxFall: () => number; readonly descentLiftVelocity: () => number;
  readonly viewportWidth: number; readonly groundY: () => number; readonly bomberColor: () => string;
  readonly dialogueDuck: () => number; readonly verticalResponse: () => number; readonly time: () => number;
  readonly lerp: (from: number, to: number, amount: number) => number;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly clearBossBeat: () => void;
  readonly setMusicDuck: (amount: number, duration: number) => void;
  readonly playSound: (cue: string) => void;
  readonly storeSeen: (key: string) => void;
  readonly landing: (x: number, y: number) => void;
  readonly finaleBladeCut: (segment: Readonly<{ previousX: number; previousY: number; x: number; y: number; speed: number }>) => void;
}

export function createLiveCinematicRuntime(options: LiveCinematicRuntimeOptions): Readonly<{
  startVoidDescent(owner: SourceRuntimeOwner | null): boolean;
  startBossTransformation(owner: LiveRitualOwner | null, cue: BossRitualCue | null): boolean;
  step(dt: number): void;
}> {
  const executeRitual = (owner: LiveRitualOwner, intents: readonly BossRitualIntent[]): void => {
    for (const intent of intents) {
      if (intent.type === "clear-boss-projectiles") options.replaceProjectiles(options.projectiles().filter((shot) => {
        const candidate = shot as Readonly<{ owner?: unknown; bossAttack?: boolean }>; return candidate.owner !== owner && !candidate.bossAttack;
      }));
      else if (intent.type === "music-duck") options.setMusicDuck(intent.amount, intent.duration);
      else if (intent.type === "sound") options.playSound(intent.cue);
      else if (intent.type === "throw-shield") owner._throwShield?.(options.projectiles());
      else if (intent.type === "resolve-first-vertical" && owner._chooseVerticalTarget && owner._startVertical) {
        const target = owner._chooseVerticalTarget(options.player(), options.ritualPlatforms());
        if (target) owner._startVertical("vault", target, options.player());
        else { owner.verticalCd = 0; owner.verticalTrackT = options.verticalResponse(); }
      } else if (intent.type === "store-seen") options.storeSeen(intent.key);
    }
  };
  return Object.freeze({
    startVoidDescent(owner) {
      if (!owner) return false;
      return launchSourceDescent({ controller: options.sourceController, cinema: options.cinema, owner,
        player: options.player(), seed: options.sourceSeed(), getPlatforms: options.platforms,
        setTransition: options.setDescent, setStream(stream) { options.setStream(stream); options.replacePlatforms(stream.platforms); },
        execute: (intents, source) => { options.sourceRuntime.execute(intents, source); },
        supportingPlayer: () => options.sourceRuntime.supporting(options.player()) !== null });
    },
    startBossTransformation(owner, cue) {
      if (!owner || !cue) return false;
      const policy = options.policy();
      return launchBossRitual({ controller: options.ritualController, cinema: options.cinema, owner, cue,
        ritual: { platforms: options.ritualPlatforms(), groundY: options.groundY(), bomberColor: options.bomberColor(),
          dialogueDuck: options.dialogueDuck(), brief: cue.brief === true || policy.brief },
        play: policy.play, reducedMotion: options.reducedMotion(), time: options.time(),
        execute: (intents) => { executeRitual(owner, intents); }, clearBossBeat: options.clearBossBeat });
    },
    step(dt) {
      const mode = options.cinema.playerMode; options.story.lastCinemaPlayerMode = mode;
      stepCinematicPlayer({ dt, mode, player: options.player(), blade: options.blade(),
        platforms: options.platforms(), gravity: options.gravity(), maxFall: options.maxFall(),
        descentLiftVelocity: options.descentLiftVelocity(), viewportWidth: options.viewportWidth,
        finale: options.story.finale, lerp: options.lerp, clamp: options.clamp,
        onFinaleLanded() { options.story.markFinaleLanded(); options.story.syncFinale(); },
        onLanding: options.landing, onFinaleBladeCut: options.finaleBladeCut });
      if (options.hasVoidScroll()) options.sourceRuntime.syncPlayer();
    },
  });
}
