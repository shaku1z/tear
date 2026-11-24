import { clamp, lerp } from "../../../domain/geometry";
import type { TearWorldTransientState } from "../../../gameplay/runtime/tear-world-transient-state";
import { advanceFramePrelude, type MutableFramePreludeState } from "../../shell/frame-runtime";

/** The application frame a detached world plays between recorded frames: play's frame at 60 frames a second. */
const FRAME_SECONDS = 1 / 60;
/** The scheduler's own tolerance for a whole tick owed (FixedStepScheduler in src/simulation/fixed-step.ts). */
const WHOLE_TICK = 1 - 1e-9;
/** A tick no frame count reaches: frames stop owing ticks only under a hit-stop, which lasts a fraction of a second. */
const MAXIMUM_FRAMES_PER_TICK = 600;

/**
 * The ticks the frames played so far have paid for and the simulation has not yet stepped: play's
 * scheduler keeps the same count (FixedStepScheduler's accumulator). A world's checkpoint carries it, so a
 * world restored at any tick plays its next frame when the world it was taken from did.
 */
export interface DetachedFrameDebt {
  ticksOwed: number;
}

export interface DetachedFrameClockHost {
  readonly transient: TearWorldTransientState;
  readonly debt: DetachedFrameDebt;
  readonly stage: { bannerSeconds: number };
  readonly stepSeconds: number;
  readonly parrySlowScale: number;
  readonly cinemaActive: () => boolean;
  readonly playgroundSlow: () => boolean;
}

export interface DetachedFrameClock {
  /** One application frame, as play runs it on the playing screen: the prelude, then the hit-stop or the ticks it owes. */
  readonly frame: (seconds: number) => void;
  /** Plays the frames play would have played before the next tick, when no recorded frame owes it. */
  readonly beforeTick: () => void;
}

/**
 * A detached world's application frames. Play advances its frame-feel values once a frame
 * (RuntimeFrameCoordinator: `advanceFramePrelude`, then `advanceFixedSimulation`): the zoom eases, the
 * banners and the flash count down, slow motion wears off, and a hit-stop holds the ticks while it lasts.
 * A replay or headless world steps ticks, not frames, so without this clock none of those values move
 * between scenes and a replay shows a frame play never drew. The clock plays play's frames between ticks:
 * a recorded scene frame counts the ticks it owes as play's did, and `beforeTick` fills the rest with
 * 60-a-second frames, the way play's scheduler accumulates them. The simulation reads none of these values,
 * so the clock changes what a replay shows, never what it simulates.
 */
export function createDetachedFrameClock(host: DetachedFrameClockHost): DetachedFrameClock {
  const { transient, debt } = host;
  const prelude = (seconds: number): void => {
    const state: MutableFramePreludeState = {
      slowMotion: transient.impact.slowMotion,
      timeScale: transient.feel.timeScale,
      worldZoom: transient.feel.worldZoom,
      worldZoomTarget: transient.feel.worldZoomTarget,
      zoom: transient.feel.zoom,
      flash: transient.feel.flash,
      bannerTime: transient.feel.bannerSeconds,
      stageBannerSeconds: host.stage.bannerSeconds,
      rankPopTime: transient.feel.rankPopupSeconds,
    };
    advanceFramePrelude({
      dt: seconds,
      state,
      parrySlowScale: host.parrySlowScale,
      cinemaActive: host.cinemaActive(),
      playgroundSlow: host.playgroundSlow(),
      lerp,
      clamp,
    });
    transient.impact.slowMotion = state.slowMotion;
    Object.assign(transient.feel, {
      timeScale: state.timeScale,
      worldZoom: state.worldZoom,
      zoom: state.zoom,
      flash: state.flash,
      bannerSeconds: state.bannerTime,
      rankPopupSeconds: state.rankPopTime,
    });
    host.stage.bannerSeconds = state.stageBannerSeconds;
  };
  const frame = (seconds: number): void => {
    prelude(seconds);
    if (transient.impact.hitStop > 0) transient.impact.hitStop -= seconds;
    else debt.ticksOwed += (seconds * transient.feel.timeScale) / host.stepSeconds;
  };
  return Object.freeze({
    frame,
    beforeTick: () => {
      for (let frames = 0; debt.ticksOwed < WHOLE_TICK && frames < MAXIMUM_FRAMES_PER_TICK; frames += 1)
        frame(FRAME_SECONDS);
      debt.ticksOwed = Math.max(0, debt.ticksOwed - 1);
    },
  });
}
