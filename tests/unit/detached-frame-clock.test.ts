/**
 * A detached world's frame clock (src/app/world/detached/frame-clock.ts) plays play's application frames
 * between ticks: two 60-a-second frames a tick pair, more under slow motion or a hit-stop, and none while
 * recorded frames already owe the tick. The banners, the flash and the zoom move on those frames as they do
 * in play, so a replay at a tick shows what play showed there.
 */
import { describe, expect, it } from "vitest";

import { advanceFramePrelude } from "../../src/app/shell/frame-runtime";
import { createDetachedFrameClock } from "../../src/app/world/detached/frame-clock";
import { clamp, lerp } from "../../src/domain/geometry";
import { createTearWorldTransientState } from "../../src/gameplay/runtime/tear-world-transient-state";

const STEP_SECONDS = 1 / 120;

function world() {
  const transient = createTearWorldTransientState();
  const stage = { bannerSeconds: 0 };
  const clock = createDetachedFrameClock({
    transient,
    debt: { ticksOwed: 0 },
    stage,
    stepSeconds: STEP_SECONDS,
    parrySlowScale: 0.28,
    cinemaActive: () => false,
    playgroundSlow: () => false,
  });
  // Count the frames each tick plays by watching the wave banner, which loses exactly a frame's seconds a frame.
  const framesBefore = (): number => {
    transient.feel.bannerSeconds = 100;
    clock.beforeTick();
    return Math.round((100 - transient.feel.bannerSeconds) * 60);
  };
  return { transient, stage, clock, framesBefore };
}

describe("a detached world's frame clock", () => {
  it("plays one 60-a-second frame for every two ticks, as play's frame does", () => {
    const { framesBefore } = world();
    expect([framesBefore(), framesBefore(), framesBefore(), framesBefore()]).toEqual([1, 0, 1, 0]);
  });

  it("counts the banners down on those frames: play's stage banner lasts its seconds of ticks", () => {
    const { stage, transient, clock } = world();
    stage.bannerSeconds = 1;
    transient.feel.bannerSeconds = 1.3;
    for (let tick = 0; tick < 60; tick += 1) clock.beforeTick();
    expect(stage.bannerSeconds).toBeCloseTo(0.5);
    expect(transient.feel.bannerSeconds).toBeCloseTo(0.8);
    for (let tick = 0; tick < 60; tick += 1) clock.beforeTick();
    expect(stage.bannerSeconds).toBe(0);
  });

  it("holds the ticks through a hit-stop, playing the frames play draws while it lasts", () => {
    const { transient, framesBefore } = world();
    transient.impact.hitStop = 0.04;
    // Three frames spend the hit-stop, the fourth pays for this tick and the next.
    expect(framesBefore()).toBe(4);
    expect(transient.impact.hitStop).toBeLessThanOrEqual(0);
    expect(framesBefore()).toBe(0);
  });

  it("plays more frames a tick under slow motion, at the parry's time scale", () => {
    const { transient, framesBefore } = world();
    transient.impact.slowMotion = 1;
    transient.feel.timeScale = 1;
    const frames = Array.from({ length: 8 }, () => framesBefore());
    // 0.28 of a frame's two ticks a frame: about one tick every two frames.
    expect(frames.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(14);
  });

  it("eases the zoom on its frames exactly as play's prelude does", () => {
    const { transient, clock } = world();
    transient.feel.zoom = 1.05;
    const play = {
      slowMotion: 0,
      timeScale: 1,
      worldZoom: transient.feel.worldZoom,
      worldZoomTarget: transient.feel.worldZoomTarget,
      zoom: 1.05,
      flash: 0,
      bannerTime: 0,
      stageBannerSeconds: 0,
      rankPopTime: 0,
    };
    for (let frame = 0; frame < 10; frame += 1) {
      advanceFramePrelude({
        dt: 1 / 60,
        state: play,
        parrySlowScale: 0.28,
        cinemaActive: false,
        playgroundSlow: false,
        lerp,
        clamp,
      });
      clock.beforeTick();
      clock.beforeTick();
    }
    expect(transient.feel.zoom).toBe(play.zoom);
  });

  it("plays no frame of its own for a tick a recorded frame already paid for", () => {
    const { transient, clock, framesBefore } = world();
    clock.frame(1 / 60);
    transient.feel.bannerSeconds = 100;
    clock.beforeTick();
    clock.beforeTick();
    expect(transient.feel.bannerSeconds).toBe(100);
    expect(framesBefore()).toBe(1);
  });
});
