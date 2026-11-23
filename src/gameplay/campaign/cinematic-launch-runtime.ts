import type {
  BossRitualContext,
  BossRitualActor,
  BossRitualController,
  BossRitualCue,
  BossRitualIntent,
  BossRitualOptions,
} from "../entities/boss-ritual-controller";
import type { SourceVoidTransitionState } from "../training/arena-rules";
import type { SourceRuntimeOwner } from "./source-void-runtime";
import type { CampaignCinematicDirector, CampaignCinematicScript } from "./cinematic-contracts";

export interface RuntimeCinematicChannel {
  readonly active: boolean;
  readonly id?: string | undefined;
  start(script: CampaignCinematicScript): unknown;
}

/**
 * The saved binding of the Source's retired void descent cinematic. The Unmake replaced it (cinematics plan
 * PR 4), so nothing captures one now; the shape stays in `bossCinematicBinding` until plan PR 5 removes the
 * binding with a codec step.
 */
export interface SourceDescentBinding {
  readonly kind: "source-descent";
  readonly owner: SourceRuntimeOwner;
  readonly transition: SourceVoidTransitionState;
}
export interface RitualBinding {
  readonly kind: "boss-ritual";
  readonly owner: BossRitualActor;
  readonly context: BossRitualContext;
  readonly ritual: BossRitualOptions;
  readonly reducedMotion: boolean;
  readonly time: number;
}
export type PortableBossCinematicBinding = SourceDescentBinding | RitualBinding;
export interface BossRitualLaunchOptions {
  readonly controller: BossRitualController;
  readonly cinema: RuntimeCinematicChannel;
  readonly owner: BossRitualActor;
  readonly cue: BossRitualCue;
  readonly ritual: BossRitualOptions;
  readonly play: boolean;
  readonly reducedMotion: boolean;
  readonly time: number;
  execute(intents: readonly BossRitualIntent[]): void;
  clearStageBeat(): void;
}

export function buildBossRitualScript(
  options: BossRitualLaunchOptions,
  context: BossRitualContext,
): CampaignCinematicScript {
  const started = { ...options.controller.prepare(options.owner, options.cue, options.ritual), context };
  const beats: CampaignCinematicScript["beats"] = started.sequence.beats.map((beat) => ({
    ...beat,
    onEnter() {
      options.execute(options.controller.enterBeat(started.context, beat.id));
    },
    onUpdate(_context, director: CampaignCinematicDirector) {
      options.execute(
        options.controller.updateBeat(started.context, beat.id, director.elapsed, director.progress, options.time),
      );
    },
  }));
  return {
    ...started.sequence,
    beats,
    onStart() {
      options.clearStageBeat();
      options.execute(options.controller.start(started.context, options.ritual));
    },
    onComplete() {
      options.execute(options.controller.complete(started.context));
    },
    onCancel() {
      options.execute(options.controller.cancel(started.context));
    },
  };
}
export function launchBossRitual(options: BossRitualLaunchOptions, bind?: (binding: RitualBinding) => void): boolean {
  if (options.cinema.active) return false;
  const started = options.controller.begin(options.owner, options.cue, options.ritual);
  if (!options.play) {
    options.execute(options.controller.start(started.context, options.ritual));
    options.execute(options.controller.complete(started.context));
    return true;
  }
  bind?.({
    kind: "boss-ritual",
    owner: options.owner,
    context: started.context,
    ritual: options.ritual,
    reducedMotion: options.reducedMotion,
    time: options.time,
  });
  options.cinema.start(buildBossRitualScript(options, started.context));
  return true;
}
