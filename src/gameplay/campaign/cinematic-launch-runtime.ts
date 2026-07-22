import type { BossRitualActor, BossRitualController, BossRitualCue, BossRitualIntent, BossRitualOptions } from "../entities/boss-ritual-controller";
import type { ArenaPlatform, SourceDescentBeat, SourceVoidController, SourceVoidIntent, SourceVoidPlayer, SourceVoidState, SourceVoidTransitionState } from "../training/arena-rules";
import type { SourceRuntimeOwner } from "./source-void-runtime";
import type { CampaignCinematicDirector, CampaignCinematicScript } from "./cinematic-contracts";

export interface RuntimeCinematicChannel {
  readonly active: boolean;
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

export function launchSourceDescent(options: SourceDescentLaunchOptions): boolean {
  if (options.cinema.active) return false;
  const started = options.controller.beginDescent({ id: options.owner.presentationId ?? options.owner.bossId ?? "source",
    x: options.owner.x, y: options.owner.y, color: options.owner.color });
  options.setTransition(started.transition);
  function sync(transition: SourceVoidTransitionState): SourceVoidState | null {
    if (!transition.stream) return null;
    transition.stream.owner = options.owner; options.setStream(transition.stream); return transition.stream;
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
  options.cinema.start({ ...started.sequence, beats,
    onStart() { options.execute(started.intents, options.owner); },
    onSkip(_context, director) { options.execute(options.controller.unmakeArena(started.transition, options.getPlatforms()), options.owner); director.skipTo("release"); },
    onComplete() {
      const ensured = options.controller.ensureStream(started.transition, options.getPlatforms(), options.seed, options.player);
      sync(started.transition); options.execute(ensured.intents, options.owner);
      options.execute(options.controller.completeDescent(started.transition, options.player), options.owner);
    },
    onCancel() { options.execute(options.controller.cancelDescent(), options.owner); },
  });
  return true;
}

export interface BossRitualLaunchOptions {
  readonly controller: BossRitualController; readonly cinema: RuntimeCinematicChannel;
  readonly owner: BossRitualActor; readonly cue: BossRitualCue; readonly ritual: BossRitualOptions;
  readonly play: boolean; readonly reducedMotion: boolean; readonly time: number;
  execute(intents: readonly BossRitualIntent[]): void;
  clearBossBeat(): void;
}

export function launchBossRitual(options: BossRitualLaunchOptions): boolean {
  if (options.cinema.active) return false;
  const started = options.controller.begin(options.owner, options.cue, options.ritual);
  if (!options.play) {
    options.execute(options.controller.start(started.context, options.ritual));
    options.execute(options.controller.complete(started.context, options.reducedMotion));
    return true;
  }
  const beats: CampaignCinematicScript["beats"] = started.sequence.beats.map((beat) => ({ ...beat,
    onEnter() { options.execute(options.controller.enterBeat(started.context, beat.id)); },
    onUpdate(_context, director: CampaignCinematicDirector) { options.execute(options.controller.updateBeat(started.context, beat.id, director.elapsed, director.progress, options.time, options.reducedMotion)); },
  }));
  options.cinema.start({ ...started.sequence, beats,
    onStart() { options.clearBossBeat(); options.execute(options.controller.start(started.context, options.ritual)); },
    onComplete() { options.execute(options.controller.complete(started.context, options.reducedMotion)); },
    onCancel() { options.execute(options.controller.cancel(started.context)); },
  });
  return true;
}
