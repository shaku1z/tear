/**
 * The replay's indicator timers (src/app/replay/replay-indicator-clock.ts): the wave and stage banners
 * run when playback passes the moment they began, and a seek starts them over, so a banner never shows
 * at a moment play did not show it.
 */
import { describe, expect, it } from "vitest";

import { createReplayIndicatorClock } from "../../src/app/replay/replay-indicator-clock";

const at = (tick: number, wave: number, stage = 0, hpFraction = 1) =>
  ({ tick, wave, stage, stageBannerSeconds: 3, hpFraction, multiplier: 1 }) as const;

describe("the replay indicator clock", () => {
  it("runs the wave banner from the tick its wave began while the replay plays through it", () => {
    const clock = createReplayIndicatorClock(2);
    clock.observe(at(100, 1));
    expect(clock.waveBanner()).toBe(0);
    clock.observe(at(104, 2));
    expect(clock.waveBanner()).toBe(2);
    clock.observe(at(164, 2));
    expect(clock.waveBanner()).toBeCloseTo(1.5);
    clock.observe(at(400, 2));
    expect(clock.waveBanner()).toBe(0);
  });

  it("starts the timers over on a seek, so a jump past a wave start shows no banner", () => {
    const clock = createReplayIndicatorClock(2);
    clock.observe(at(100, 1));
    clock.observe(at(2_000, 4));
    expect(clock.waveBanner()).toBe(0);
    clock.observe(at(1_000, 3));
    expect(clock.waveBanner()).toBe(0);
  });

  it("runs the stage banner for the length the world set when the stage began", () => {
    const clock = createReplayIndicatorClock(2);
    clock.observe(at(10, 5, 0));
    clock.observe(at(14, 6, 1));
    expect(clock.stageBanner()).toBe(3);
    clock.observe(at(134, 6, 1));
    expect(clock.stageBanner()).toBeCloseTo(2);
  });

  it("eases the health bar's lag as play does, and sets it at once after a seek", () => {
    const clock = createReplayIndicatorClock(2);
    clock.observe(at(0, 1, 0, 1));
    clock.observe(at(2, 1, 0, 0.5));
    expect(clock.hud().lagHp).toBeGreaterThan(0.5);
    expect(clock.hud().lagHp).toBeLessThan(1);
    clock.observe(at(5_000, 1, 0, 0.25));
    expect(clock.hud().lagHp).toBe(0.25);
  });
});
