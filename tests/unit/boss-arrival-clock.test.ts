/**
 * The boss arrival runs on the simulation clock at full speed (plans/active/CINEMATICS_OVERHAUL.md, PR 6).
 * The simulation advances it one tick at a time, and nothing slows the frame for it: a 1.0 s arrival is 120
 * ticks, and lasts 1.0 s of wall time in live play, whatever the render rate. Before PR 6 it played at a 0.25
 * time scale behind a letterbox (42 ticks over 1.4 s of wall time).
 */
import { describe, expect, it } from "vitest";

import { advanceFramePrelude, type MutableFramePreludeState } from "../../src/app/shell/frame-runtime";
import { CONFIG } from "../../src/config/game-config";
import { advanceBossIntro, bossIntroPlaying, type BossIntroClock } from "../../src/gameplay/run/boss-encounter";
import { FixedStepScheduler } from "../../src/simulation/fixed-step";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../../src/tearbench/simulation-profile";

const { introDur } = CONFIG.bossTheater;
const TICK_SECONDS = 1 / TEAR_SIMULATION_TICKS_PER_SECOND;
const ARRIVAL_TICKS = Math.round(introDur / TICK_SECONDS);

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
  };
}

/** Plays one arrival through the real frame prelude and fixed-step scheduler at `renderHz`. */
function playArrival(renderHz: number): Readonly<{ endSeconds: number; ticks: number; timeScales: number[] }> {
  const dt = 1 / renderHz;
  const scheduler = new FixedStepScheduler({ ticksPerSecond: TEAR_SIMULATION_TICKS_PER_SECOND });
  const state = preludeState();
  // Held in an object: the scheduler callback ends the arrival, which a plain local would hide from narrowing.
  const run: { intro: BossIntroClock | null } = { intro: arrival() };
  const timeScales: number[] = [];
  for (let frame = 1; frame <= renderHz * 4; frame++) {
    advanceFramePrelude({
      dt,
      state,
      parrySlowScale: CONFIG.juice.parrySlowScale,
      cinemaActive: false,
      playgroundSlow: false,
      lerp: (a, b, amount) => a + (b - a) * amount,
      clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    });
    timeScales.push(state.timeScale);
    scheduler.advance(dt * state.timeScale * 1000, (seconds) => {
      if (run.intro !== null && !advanceBossIntro(run.intro, seconds)) run.intro = null;
    });
    if (run.intro === null) return { endSeconds: frame * dt, ticks: scheduler.tick, timeScales };
  }
  throw new Error("The arrival never ended");
}

describe("boss arrival clock", () => {
  it("is 120 simulation ticks for a 1.0 s arrival, with the boss's countdown in step", () => {
    expect(introDur).toBe(1);
    expect(ARRIVAL_TICKS).toBe(120);
    const intro = arrival();
    let ticks = 0;
    while (advanceBossIntro(intro, TICK_SECONDS)) {
      ticks++;
      expect(intro.boss?.introT).toBeCloseTo(introDur - ticks * TICK_SECONDS, 9);
    }
    expect(ticks + 1).toBe(ARRIVAL_TICKS);
    expect(intro.boss?.introT).toBe(0);
  });

  it.each([60, 120, 144])("lasts 1.0 s of wall time at %i Hz, and never slows the frame", (renderHz) => {
    const played = playArrival(renderHz);
    expect(Math.abs(played.endSeconds - introDur)).toBeLessThanOrEqual(1 / renderHz + 1e-9);
    expect(played.ticks).toBe(ARRIVAL_TICKS);
    expect(played.timeScales.every((scale) => scale === 1)).toBe(true);
  });

  it("waits out its delay before the arrival plays", () => {
    const intro = arrival(0.5);
    let delayTicks = 0;
    while (!bossIntroPlaying(intro)) {
      expect(advanceBossIntro(intro, TICK_SECONDS)).toBe(true);
      expect(intro.boss?.introT).toBe(introDur);
      delayTicks++;
    }
    expect(delayTicks).toBe(60);
    let arrivalTicks = 1;
    while (advanceBossIntro(intro, TICK_SECONDS)) arrivalTicks++;
    expect(arrivalTicks).toBe(ARRIVAL_TICKS);
  });

  it("ends when the boss dies during its arrival", () => {
    const intro = arrival();
    expect(advanceBossIntro(intro, TICK_SECONDS)).toBe(true);
    if (intro.boss) intro.boss.dying = true;
    expect(bossIntroPlaying(intro)).toBe(false);
    expect(advanceBossIntro(intro, TICK_SECONDS)).toBe(false);
  });
});
