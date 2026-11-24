/**
 * The replay's HUD easing (src/app/replay/replay-indicator-clock.ts): it eases over the ticks playback
 * passes, as play eases over its frames, and a seek starts it over at the shown values. The banners are the
 * world's own timers (tests/unit/detached-frame-clock.test.ts).
 */
import { describe, expect, it } from "vitest";

import { createReplayIndicatorClock } from "../../src/app/replay/replay-indicator-clock";

const at = (tick: number, hpFraction = 1, multiplier = 1) => ({ tick, hpFraction, multiplier }) as const;

describe("the replay indicator clock", () => {
  it("eases the health bar's lag as play does, and sets it at once after a seek", () => {
    const clock = createReplayIndicatorClock();
    clock.observe(at(0, 1));
    clock.observe(at(2, 0.5));
    expect(clock.hud().lagHp).toBeGreaterThan(0.5);
    expect(clock.hud().lagHp).toBeLessThan(1);
    clock.observe(at(5_000, 0.25));
    expect(clock.hud().lagHp).toBe(0.25);
  });

  it("gives the seconds between two shown ticks, and none across a seek or backwards", () => {
    const clock = createReplayIndicatorClock();
    clock.observe(at(100));
    clock.observe(at(102));
    expect(clock.deltaSeconds()).toBeCloseTo(1 / 60);
    clock.observe(at(2_000));
    expect(clock.deltaSeconds()).toBe(0);
    clock.observe(at(1_000));
    expect(clock.deltaSeconds()).toBe(0);
  });
});
