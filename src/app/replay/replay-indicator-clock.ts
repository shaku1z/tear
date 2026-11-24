import { createLiveHudFeedbackState } from "../interface/hud-feedback-state";

const TICKS_PER_SECOND = 120;
/** A step larger than this between two shown ticks is a seek, not playback: the easing starts over. */
const SEEK_TICKS = 240;

/** The world at a shown tick, as far as the HUD's easing needs it. */
export interface ReplayIndicatorMoment {
  readonly tick: number;
  readonly hpFraction: number;
  readonly multiplier: number;
}

/**
 * The HUD's easing in a replay. Live play eases the health bar and the multiplier on the frames it draws; a
 * replay draws the ticks it is shown, so the replay eases them over the ticks between two shown frames.
 * Playback moves a few ticks a frame and keeps the easing running; a seek starts it over at the shown values.
 * The easing is live play's own (`createLiveHudFeedbackState`). The banners are the world's own timers, which
 * its frame clock (src/app/world/detached/frame-clock.ts) runs as play does.
 */
export function createReplayIndicatorClock() {
  const hud = createLiveHudFeedbackState();
  let last: ReplayIndicatorMoment | undefined;
  let stepSeconds = 0;
  return Object.freeze({
    observe(moment: ReplayIndicatorMoment): void {
      const step = last === undefined ? -1 : moment.tick - last.tick;
      stepSeconds = step < 0 || step > SEEK_TICKS ? 0 : step / TICKS_PER_SECOND;
      if (last === undefined || step < 0 || step > SEEK_TICKS)
        hud.set({ lagHp: moment.hpFraction, multiplier: moment.multiplier, multiplierPop: 0 });
      else hud.advance({ hpFraction: moment.hpFraction, multiplier: moment.multiplier, deltaSeconds: stepSeconds });
      last = moment;
    },
    hud: hud.snapshot,
    hudClockSeconds: hud.clockSeconds,
    /** Seconds between the last two ticks observed; zero after a seek. */
    deltaSeconds: (): number => stepSeconds,
  });
}
