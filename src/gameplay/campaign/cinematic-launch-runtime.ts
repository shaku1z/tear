import type { BossRitualContext, BossRitualActor, BossRitualController, BossRitualCue, BossRitualIntent, BossRitualOptions } from "../entities/boss-ritual-controller";
import type { ArenaPlatform, SourceDescentBeat, SourceVoidController, SourceVoidIntent, SourceVoidPlayer, SourceVoidState, SourceVoidTransitionState } from "../training/arena-rules";
import type { SourceRuntimeOwner } from "./source-void-runtime";
import type { CampaignCinematicDirector, CampaignCinematicScript } from "./cinematic-contracts";

export interface RuntimeCinematicChannel {
  readonly active: boolean; readonly id?: string | undefined;
  start(script: CampaignCinematicScript): unknown;
}

export interface SourceDescentLaunchOptions {
  readonly controller: SourceVoidController; readonly cinema: RuntimeCinematicChannel;
  readonly owner: SourceRuntimeOwner; readonly player: SourceVoidPlayer; readonly seed: string | number;
  getPlatforms(): ArenaPlatform[];
  setTransition(transition: SourceVoidTransitionState | null): void;
  setStream(stream: SourceVoidState): void;
  execute(intents: readonly SourceVoidIntent[], owner: SourceRuntimeOwner): void;
  supportingPlayer(): boolean;
}

export interface SourceDescentBinding { readonly kind: "source-descent"; readonly owner: SourceRuntimeOwner; readonly transition: SourceVoidTransitionState }
export interface RitualBinding { readonly kind: "boss-ritual"; readonly owner: BossRitualActor; readonly context: BossRitualContext; readonly ritual: BossRitualOptions; readonly reducedMotion: boolean; readonly time: number }
export type PortableBossCinematicBinding = SourceDescentBinding | RitualBinding;
export function sourceDescentActor(owner: SourceRuntimeOwner) {
  return { id: owner.presentationId ?? owner.bossId ?? "source", get x() { return owner.x; }, get y() { return owner.y; }, get color() { return owner.color; } };
}
export function buildSourceDescentScript(options: SourceDescentLaunchOptions, transition?: SourceVoidTransitionState): CampaignCinematicScript {
  // The live boss carries no generic `id`. Give the cinematic a stable adapter whose
  // position remains a live view of the actor without mutating the combat entity.
  const actorId = options.owner.presentationId ?? options.owner.bossId ?? "source";
  const voidActor = {
    id: actorId,
    get x() { return options.owner.x; },
    get y() { return options.owner.y; },
    get color() { return options.owner.color; },
  };
  const started = options.controller.prepareDescent(voidActor);
  if (transition !== undefined) Object.assign(started, { transition });
  function sync(transition: SourceVoidTransitionState): SourceVoidState | null {
    if (!transition.stream) return null;
    transition.stream.owner = voidActor; options.setStream(transition.stream); return transition.stream;
  }
  function enter(transition: SourceVoidTransitionState, beat: SourceDescentBeat): void {
    options.execute(options.controller.enterDescentBeat(transition, beat.id,
      options.getPlatforms(), options.seed, options.player), options.owner);
    sync(transition);
    if ((beat.id === "reveal" || beat.id === "land") && transition.stream) {
      for (const platform of transition.stream.platforms) if (platform.void) platform.materializationState = "active";
    }
  }
  const beats: CampaignCinematicScript["beats"] = started.sequence.beats.map((beat) => ({
    ...beat, ...(beat.id === "release" ? { skipScale: 1 } : {}),
    onEnter() { enter(started.transition, beat); },
    onUpdate(_context, director: CampaignCinematicDirector) {
      options.execute(options.controller.updateDescentBeat(beat.id, director.progress), options.owner);
      if (beat.id === "reveal" && director.progress > 0.32 && started.transition.stream) {
        for (const platform of started.transition.stream.platforms) if (platform.void) platform.materializationState = "active";
      }
    },
    ...(beat.id === "land" ? { waitUntil: () => options.supportingPlayer() } : {}),
  }));
  return { ...started.sequence, beats,
    onStart() { options.execute(started.intents, options.owner); },
    onSkip(_context, director) { options.execute(options.controller.unmakeArena(started.transition, options.getPlatforms()), options.owner); director.skipTo("release"); },
    onComplete() {
      const ensured = options.controller.ensureStream(started.transition, options.getPlatforms(), options.seed, options.player);
      sync(started.transition); options.execute(ensured.intents, options.owner);
      options.execute(options.controller.completeDescent(started.transition, options.player), options.owner);
    },
    onCancel() { options.execute(options.controller.cancelDescent(), options.owner); },
  };
}
export function launchSourceDescent(options: SourceDescentLaunchOptions, bind?: (binding: SourceDescentBinding) => void): boolean {
  if (options.cinema.active) return false;
  const transition = options.controller.beginDescent(sourceDescentActor(options.owner)).transition;
  options.setTransition(transition); bind?.({ kind: "source-descent", owner: options.owner, transition });
  options.cinema.start(buildSourceDescentScript(options, transition)); return true;
}

export interface BossRitualLaunchOptions {
  readonly controller: BossRitualController; readonly cinema: RuntimeCinematicChannel;
  readonly owner: BossRitualActor; readonly cue: BossRitualCue; readonly ritual: BossRitualOptions;
  readonly play: boolean; readonly reducedMotion: boolean; readonly time: number;
  execute(intents: readonly BossRitualIntent[]): void;
  clearBossBeat(): void;
}

export function buildBossRitualScript(options: BossRitualLaunchOptions, context: BossRitualContext): CampaignCinematicScript {
  const started = { ...options.controller.prepare(options.owner, options.cue, options.ritual), context };
  const beats: CampaignCinematicScript["beats"] = started.sequence.beats.map((beat) => ({ ...beat,
    onEnter() { options.execute(options.controller.enterBeat(started.context, beat.id)); },
    onUpdate(_context, director: CampaignCinematicDirector) { options.execute(options.controller.updateBeat(started.context, beat.id, director.elapsed, director.progress, options.time, options.reducedMotion)); },
  }));
  return { ...started.sequence, beats,
    onStart() { options.clearBossBeat(); options.execute(options.controller.start(started.context, options.ritual)); },
    onComplete() { options.execute(options.controller.complete(started.context, options.reducedMotion)); },
    onCancel() { options.execute(options.controller.cancel(started.context)); },
  };
}
export function launchBossRitual(options: BossRitualLaunchOptions, bind?: (binding: RitualBinding) => void): boolean {
  if (options.cinema.active) return false;
  const started = options.controller.begin(options.owner, options.cue, options.ritual);
  if (!options.play) {
    options.execute(options.controller.start(started.context, options.ritual)); options.execute(options.controller.complete(started.context, options.reducedMotion)); return true;
  }
  bind?.({ kind: "boss-ritual", owner: options.owner, context: started.context, ritual: options.ritual, reducedMotion: options.reducedMotion, time: options.time });
  options.cinema.start(buildBossRitualScript(options, started.context)); return true;
}
