import { canonicalBossRitualCue } from "../entities/boss-ritual-cues";
import type {
  BossRitualActor,
  BossRitualController,
  BossRitualCue,
  BossRitualIntent,
  BossRitualPlatform,
} from "../entities/boss-ritual-controller";
import type { ArenaPlatform, SourceVoidPlayer } from "../training/arena-rules";
import {
  buildBossRitualScript,
  launchBossRitual,
  type PortableBossCinematicBinding,
  type RuntimeCinematicChannel,
} from "./cinematic-launch-runtime";
import {
  stepCinematicPlayer,
  type CinematicFinaleSnapshot,
  type CinematicRuntimeBlade,
  type CinematicRuntimePlayer,
} from "./cinematic-player-runtime";
import type { SourceVoidRuntimeBridge } from "./source-void-runtime";
import { isObject, requireRecord } from "../../domain/records";

export type LiveRitualOwner = BossRitualActor;
export interface LiveCinematicStory {
  finale: CinematicFinaleSnapshot | null;
  lastCinemaPlayerMode: string | null;
  markFinaleLanded(): void;
  syncFinale(): void;
}
export interface LiveCinematicRuntimeOptions {
  readonly cinema: RuntimeCinematicChannel & Readonly<{ playerMode: string }>;
  readonly ritualController: BossRitualController;
  readonly sourceRuntime: SourceVoidRuntimeBridge;
  readonly player: () => CinematicRuntimePlayer & SourceVoidPlayer;
  readonly blade: () => CinematicRuntimeBlade | null;
  readonly platforms: () => ArenaPlatform[];
  readonly ritualPlatforms: () => readonly BossRitualPlatform[];
  readonly replacePlatforms: (platforms: ArenaPlatform[]) => void;
  readonly projectiles: () => unknown[];
  readonly replaceProjectiles: (projectiles: unknown[]) => void;
  readonly hasVoidScroll: () => boolean;
  readonly story: LiveCinematicStory;
  readonly policy: () => Readonly<{ play: boolean; brief: boolean }>;
  readonly reducedMotion: () => boolean;
  readonly gravity: () => number;
  readonly maxFall: () => number;
  readonly descentLiftVelocity: () => number;
  readonly viewportWidth: number;
  readonly groundY: () => number;
  readonly bomberColor: () => string;
  readonly dialogueDuck: () => number;
  readonly time: () => number;
  readonly lerp: (from: number, to: number, amount: number) => number;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly clearBossBeat: () => void;
  readonly setMusicDuck: (amount: number, duration: number) => void;
  readonly playSound: (cue: string) => void;
  readonly storeSeen: (key: string) => void;
  readonly landing: (x: number, y: number) => void;
  readonly finaleBladeCut: (
    segment: Readonly<{ previousX: number; previousY: number; x: number; y: number; speed: number }>,
  ) => void;
}

export function createLiveCinematicRuntime(options: LiveCinematicRuntimeOptions): Readonly<{
  startBossTransformation(owner: LiveRitualOwner | null, cue: BossRitualCue | null): boolean;
  captureBinding(): PortableBossCinematicBinding | null;
  stageBinding(
    value: unknown,
    owners: readonly object[],
  ): Readonly<{ script: ReturnType<typeof buildBossRitualScript>; context: Record<string, never> }> | undefined;
  restoreBinding(value: unknown): void;
  step(dt: number): void;
}> {
  let binding: PortableBossCinematicBinding | null = null;
  let bindingScriptId: string | undefined;
  const executeRitual = (owner: LiveRitualOwner, intents: readonly BossRitualIntent[]): void => {
    for (const intent of intents) {
      if (intent.type === "clear-boss-projectiles")
        options.replaceProjectiles(
          options.projectiles().filter((shot) => {
            const candidate = shot as Readonly<{ owner?: unknown; bossAttack?: boolean }>;
            return candidate.owner !== owner && !candidate.bossAttack;
          }),
        );
      else if (intent.type === "music-duck") options.setMusicDuck(intent.amount, intent.duration);
      else if (intent.type === "sound") options.playSound(intent.cue);
      else options.storeSeen(intent.key);
    }
  };
  const ritualOptions = (owner: LiveRitualOwner, cue: BossRitualCue) => {
    const policy = options.policy();
    return {
      controller: options.ritualController,
      cinema: options.cinema,
      owner,
      cue,
      ritual: {
        platforms: options.ritualPlatforms(),
        groundY: options.groundY(),
        bomberColor: options.bomberColor(),
        dialogueDuck: options.dialogueDuck(),
        brief: cue.brief === true || policy.brief,
      },
      play: policy.play,
      reducedMotion: options.reducedMotion(),
      time: options.time(),
      execute: (intents: readonly BossRitualIntent[]) => {
        executeRitual(owner, intents);
      },
      clearBossBeat: options.clearBossBeat,
    };
  };
  return Object.freeze({
    startBossTransformation(owner, cue) {
      return (
        owner !== null &&
        cue !== null &&
        launchBossRitual(ritualOptions(owner, cue), (value) => {
          binding = value;
          bindingScriptId = value.context.cue.id;
        })
      );
    },
    captureBinding() {
      return options.cinema.active && options.cinema.id === bindingScriptId ? binding : null;
    },
    stageBinding(value, owners) {
      if (value === undefined || value === null) return undefined;
      const raw = requireRecord(value, "Invalid boss cinematic binding");
      if (raw.kind !== "source-descent" && raw.kind !== "boss-ritual")
        throw new TypeError("Invalid boss cinematic binding kind");
      // The Unmake replaced the Source's descent cinematic: a world saved inside one no longer loads.
      if (raw.kind === "source-descent") throw new RangeError("The Source's void descent cinematic was retired");
      if (raw.kind === "boss-ritual" && (!isObject(raw.context) || !isObject(raw.ritual)))
        throw new TypeError("Invalid ritual context");
      const saved = value as Extract<PortableBossCinematicBinding, { kind: "boss-ritual" }>;
      if (!owners.includes(saved.owner)) throw new RangeError("Boss cinematic owner is not in the candidate world");
      if (
        saved.context.owner !== saved.owner ||
        typeof saved.reducedMotion !== "boolean" ||
        !Number.isFinite(saved.time) ||
        typeof saved.context.crownSound !== "boolean" ||
        typeof saved.context.crownFractureColor !== "string"
      )
        throw new TypeError("Invalid ritual cinematic binding");
      const points: unknown[] = [saved.context.crownStart, saved.context.crownTarget];
      for (const point of points)
        if (
          point !== null &&
          (!isObject(point) ||
            !("x" in point) ||
            !("y" in point) ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y))
        )
          throw new TypeError("Invalid ritual crown context");
      if (
        Object.keys(saved).length !== 6 ||
        Object.keys(saved.context).length !== 7 ||
        Object.keys(saved.ritual).length !== 5 ||
        !Number.isFinite(saved.ritual.groundY) ||
        !Number.isFinite(saved.ritual.dialogueDuck) ||
        saved.ritual.dialogueDuck < 0 ||
        typeof saved.ritual.brief !== "boolean" ||
        typeof saved.ritual.bomberColor !== "string" ||
        (saved.context.crownStart !== null && !Number.isFinite(saved.context.crownStart.rot)) ||
        (saved.context.crownStart === null) !== (saved.context.crownTarget === null)
      )
        throw new TypeError("Invalid ritual context fields");
      const cue = canonicalBossRitualCue(saved.owner, saved.context.cue);
      return {
        script: buildBossRitualScript(
          {
            ...ritualOptions(saved.owner, cue),
            ritual: saved.ritual,
            reducedMotion: saved.reducedMotion,
            time: saved.time,
          },
          saved.context,
        ),
        context: {},
      };
    },
    restoreBinding(value) {
      bindingScriptId = undefined;
      binding = value === undefined ? null : (value as PortableBossCinematicBinding | null);
      if (binding?.kind === "boss-ritual") bindingScriptId = binding.context.cue.id;
    },
    step(dt) {
      const mode = options.cinema.playerMode;
      options.story.lastCinemaPlayerMode = mode;
      stepCinematicPlayer({
        dt,
        mode,
        player: options.player(),
        blade: options.blade(),
        platforms: options.platforms(),
        gravity: options.gravity(),
        maxFall: options.maxFall(),
        descentLiftVelocity: options.descentLiftVelocity(),
        viewportWidth: options.viewportWidth,
        finale: options.story.finale,
        lerp: options.lerp,
        clamp: options.clamp,
        onFinaleLanded() {
          options.story.markFinaleLanded();
          options.story.syncFinale();
        },
        onLanding: options.landing,
        onFinaleBladeCut: options.finaleBladeCut,
      });
      if (options.hasVoidScroll()) options.sourceRuntime.syncPlayer();
    },
  });
}
