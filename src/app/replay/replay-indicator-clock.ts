import { createLiveHudFeedbackState } from "../interface/hud-feedback-state";

const TICKS_PER_SECOND = 120;
/** A step larger than this between two shown ticks is a seek, not playback: timers start over. */
const SEEK_TICKS = 240;

/** The world at a shown tick, as far as the indicator timers need it. */
export interface ReplayIndicatorMoment {
  readonly tick: number;
  readonly wave: number;
  readonly stage: number;
  /** The stage banner's length, as the world set it when the stage began. */
  readonly stageBannerSeconds: number;
  readonly hpFraction: number;
  readonly multiplier: number;
}

/**
 * The timers behind a replay's indicators. Live play runs the wave and stage banners and the HUD's easing
 * on its frame clock; a re-simulated world has no frame clock, so the replay runs them on the ticks it
 * shows. Playback moves a few ticks a frame and keeps them running; a seek starts them over, so a banner
 * shows only when the replay plays through the moment it began, as in play. The HUD's easing is live
 * play's own (`createLiveHudFeedbackState`).
 */
export function createReplayIndicatorClock(waveBannerSeconds: number) {
  const hud = createLiveHudFeedbackState();
  let last: ReplayIndicatorMoment | undefined;
  let waveFrom: number | undefined;
  let stageFrom: Readonly<{ tick: number; seconds: number }> | undefined;
  let stepSeconds = 0;
  const elapsed = (tick: number, from: number) => (tick - from) / TICKS_PER_SECOND;
  return Object.freeze({
    observe(moment: ReplayIndicatorMoment): void {
      const step = last === undefined ? -1 : moment.tick - last.tick;
      stepSeconds = step < 0 || step > SEEK_TICKS ? 0 : step / TICKS_PER_SECOND;
      if (last === undefined || step < 0 || step > SEEK_TICKS) {
        waveFrom = undefined;
        stageFrom = undefined;
        hud.set({ lagHp: moment.hpFraction, multiplier: moment.multiplier, multiplierPop: 0 });
      } else {
        if (moment.wave !== last.wave) waveFrom = moment.tick;
        if (moment.stage !== last.stage) stageFrom = { tick: moment.tick, seconds: moment.stageBannerSeconds };
        hud.advance({ hpFraction: moment.hpFraction, multiplier: moment.multiplier, deltaSeconds: stepSeconds });
      }
      last = moment;
    },
    /** Seconds left on the wave banner at the last tick observed. */
    waveBanner: (): number =>
      last === undefined || waveFrom === undefined ? 0 : Math.max(0, waveBannerSeconds - elapsed(last.tick, waveFrom)),
    /** Seconds left on the stage banner at the last tick observed. */
    stageBanner: (): number =>
      last === undefined || stageFrom === undefined
        ? 0
        : Math.max(0, stageFrom.seconds - elapsed(last.tick, stageFrom.tick)),
    hud: hud.snapshot,
    hudClockSeconds: hud.clockSeconds,
    /** Seconds between the last two ticks observed; zero after a seek. */
    deltaSeconds: (): number => stepSeconds,
  });
}
