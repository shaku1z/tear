/**
 * The boss arrival runs on the simulation clock (plans/active/CINEMATICS_OVERHAUL.md, the intro-clock slice).
 * The simulation advances the arrival one tick at a time; the frame only plays it at the arrival time scale.
 * Before the slice, the frame prelude counted it in wall seconds, so a world with no frame clock (replay
 * verify, the headless playtest) could not reproduce it. These tests hold the arrival a player sees to what
 * the frame clock gave: 1.4 s of wall time, and the same arrival progress whenever a tick has just run.
 */
import { describe, expect, it } from "vitest";

import { advanceFramePrelude, type MutableFramePreludeState } from "../../src/app/shell/frame-runtime";
import { CONFIG } from "../../src/config/game-config";
import { advanceBossIntro, bossIntroPlaying, type BossIntroClock } from "../../src/gameplay/run/boss-encounter";
import { FixedStepScheduler } from "../../src/simulation/fixed-step";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../../src/tearbench/simulation-profile";

const { introDur, introScale } = CONFIG.bossTheater;
const TICK_SECONDS = 1 / TEAR_SIMULATION_TICKS_PER_SECOND;
/** Ticks in one arrival: its game time (1.4 s at 0.25 is 0.35 s) at 120 ticks a second. */
const ARRIVAL_TICKS = Math.round((introDur * introScale) / TICK_SECONDS);

function arrival(delay = 0): BossIntroClock {
  return { delay, t: 0, dur: introDur, boss: { introT: introDur, dead: false, dying: false } };
}

function preludeState(): MutableFramePreludeState {
  return {
    slowMotion: 0,
    timeScale: 1,
    worldZoom: 1,
    worldZoomTarget: 1,
    zoom: 1,
    flash: 0,
    bannerTime: 0,
    stageBannerSeconds: 0,
    rankPopTime: 0,
    bossBeat: null,
  };
}

interface FrameTrace {
  /** Wall seconds from the arrival's start to the frame in which it ended. */
  readonly endSeconds: number;
  /** Simulation ticks run by the end of each frame, and the arrival progress then. */
  readonly ticks: readonly number[];
  readonly progress: readonly number[];
}

/**
 * Plays one arrival through the real frame prelude and fixed-step scheduler at `renderHz`. With
 * `frameClock`, the arrival is counted as it was before the slice: in the prelude, by wall seconds.
 */
function playArrival(renderHz: number, frameClock: boolean): FrameTrace {
  const dt = 1 / renderHz;
  const scheduler = new FixedStepScheduler({ ticksPerSecond: TEAR_SIMULATION_TICKS_PER_SECOND });
  const state = preludeState();
  let intro: BossIntroClock | null = arrival();
  const ticks: number[] = [],
    progress: number[] = [];
  let progressAtEnd = 0;
  for (let frame = 1; frame <= renderHz * 4; frame++) {
    let playing = bossIntroPlaying(intro);
    if (frameClock && intro !== null) {
      intro.t += dt;
      if (intro.boss) intro.boss.introT = Math.max(0, intro.dur - intro.t);
      if (intro.t >= intro.dur) intro = null;
      playing = intro !== null;
    }
    advanceFramePrelude({
      dt,
      state,
      parrySlowScale: CONFIG.juice.parrySlowScale,
      cinemaActive: false,
      playgroundSlow: false,
      bossArrivalPlaying: playing,
      introScale,
      lerp: (a, b, amount) => a + (b - a) * amount,
      clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    });
    scheduler.advance(dt * state.timeScale * 1000, (seconds) => {
      if (!frameClock && intro !== null && !advanceBossIntro(intro, seconds, introScale)) {
        progressAtEnd = intro.t;
        intro = null;
      }
    });
    ticks.push(scheduler.tick);
    progress.push(intro === null ? (frameClock ? introDur : progressAtEnd) : intro.t);
    if (intro === null) return { endSeconds: frame * dt, ticks, progress };
  }
  throw new Error("The arrival never ended");
}

describe("boss arrival clock", () => {
  it("is 42 simulation ticks for a 1.4 s arrival at time scale 0.25", () => {
    expect(ARRIVAL_TICKS).toBe(42);
    const intro = arrival();
    let ticks = 0;
    while (advanceBossIntro(intro, TICK_SECONDS, introScale)) {
      ticks++;
      expect(intro.boss?.introT).toBeCloseTo(introDur - (ticks * TICK_SECONDS) / introScale, 9);
    }
    expect(ticks + 1).toBe(ARRIVAL_TICKS);
    expect(intro.boss?.introT).toBe(0);
  });

  it.each([60, 120])("lasts 1.4 s of wall time within one frame at %i Hz, as the frame clock did", (renderHz) => {
    const ticked = playArrival(renderHz, false),
      framed = playArrival(renderHz, true);
    expect(Math.abs(ticked.endSeconds - introDur)).toBeLessThanOrEqual(1 / renderHz + 1e-9);
    expect(Math.abs(ticked.endSeconds - framed.endSeconds)).toBeLessThanOrEqual(1 / renderHz + 1e-9);
    expect(ticked.ticks.at(-1)).toBe(ARRIVAL_TICKS);
  });

  it.each([60, 120])(
    "shows the same arrival progress as the frame clock on every frame a tick ran, at %i Hz",
    (renderHz) => {
      const ticked = playArrival(renderHz, false),
        framed = playArrival(renderHz, true);
      let compared = 0;
      for (let frame = 0; frame < Math.min(ticked.ticks.length, framed.ticks.length); frame++) {
        expect(ticked.ticks[frame], `ticks by frame ${String(frame + 1)}`).toBe(framed.ticks[frame]);
        if (ticked.ticks[frame] === (ticked.ticks[frame - 1] ?? 0)) continue;
        expect(ticked.progress[frame], `progress at frame ${String(frame + 1)}`).toBeCloseTo(
          framed.progress[frame] ?? -1,
          9,
        );
        compared++;
      }
      expect(compared).toBeGreaterThanOrEqual(ARRIVAL_TICKS - 1);
    },
  );

  it("waits out its delay at full speed before the arrival plays", () => {
    const intro = arrival(0.5);
    let delayTicks = 0;
    while (!bossIntroPlaying(intro)) {
      expect(advanceBossIntro(intro, TICK_SECONDS, introScale)).toBe(true);
      expect(intro.boss?.introT).toBe(introDur);
      delayTicks++;
    }
    expect(delayTicks).toBe(60);
    let arrivalTicks = 1;
    while (advanceBossIntro(intro, TICK_SECONDS, introScale)) arrivalTicks++;
    expect(arrivalTicks).toBe(ARRIVAL_TICKS);
  });

  it("ends when the boss dies during its arrival", () => {
    const intro = arrival();
    expect(advanceBossIntro(intro, TICK_SECONDS, introScale)).toBe(true);
    if (intro.boss) intro.boss.dying = true;
    expect(bossIntroPlaying(intro)).toBe(false);
    expect(advanceBossIntro(intro, TICK_SECONDS, introScale)).toBe(false);
  });
});
