import { describe, expect, it, vi } from "vitest";
import { advanceFixedSimulation, advanceFramePrelude, commitBossIntroSnapshot, emitLiveMusicEvent, syncMusicTheme,
  type MutableFramePreludeState } from "../../src/app/live-frame-runtime";

describe("live frame runtime", () => {
  it("advances theater, zoom and UI timers in their canonical order", () => {
    const boss = { hp: 10, maxHp: 10, introT: 2 };
    const state: MutableFramePreludeState = { slowMotion: 0.5, timeScale: 1, worldZoom: 1, worldZoomTarget: 2,
      zoom: 1, flash: 1, bannerTime: 1, stageBannerSeconds: 1, rankPopTime: 1,
      bossIntro: { delay: 0, t: 0, dur: 1, boss }, bossBeat: { t: 0.1 } };
    advanceFramePrelude({ dt: 0.25, state, parrySlowScale: 0.2, cinemaActive: false, playgroundSlow: false,
      introScale: 0.4, lerp: (a, b, t) => a + (b - a) * t, clamp: (v, min, max) => Math.max(min, Math.min(max, v)) });
    expect(state.timeScale).toBe(0.2); expect(state.bossBeat).toBeNull(); expect(boss.introT).toBe(0.75);
    expect(state.flash).toBeCloseTo(0.2); expect(state).toMatchObject({ worldZoom: 1.75, zoom: 1.75,
      bannerTime: 0.75, stageBannerSeconds: 0.75, rankPopTime: 0.7 });
  });

  it("commits the terminal intro frame from a detached snapshot to the live boss", () => {
    const boss = { hp: 10, maxHp: 10, introT: 0.0084 };
    const live = { delay: 0, t: 0.9916, dur: 1, boss };
    const state: MutableFramePreludeState = { slowMotion: 0, timeScale: 1, worldZoom: 1, worldZoomTarget: 1,
      zoom: 1, flash: 0, bannerTime: 0, stageBannerSeconds: 0, rankPopTime: 0,
      bossIntro: { delay: live.delay, t: live.t, dur: live.dur, boss: { ...boss } }, bossBeat: null };
    advanceFramePrelude({ dt: 1 / 60, state, parrySlowScale: 0.2, cinemaActive: false, playgroundSlow: false,
      introScale: 0.4, lerp: (a, b, t) => a + (b - a) * t, clamp: (v, min, max) => Math.max(min, Math.min(max, v)) });
    expect(commitBossIntroSnapshot(live, state.bossIntro)).toBeNull();
    expect(boss.introT).toBe(0);
  });

  it("records semantic aim passively while the raw device input drives the live step", () => {
    const order: string[] = []; const gauge = vi.fn();
    const simulation = { tick: 0, advance: (_ms: number, step: (seconds: number, tick: number) => void) => {
      step(1 / 60, 4); return { tick: 4, steps: 1, droppedMilliseconds: 0 };
    } };
    advanceFixedSimulation({ dt: 1 / 60, timeScale: 1, hitStop: 0, state: () => "playing", simulation,
      recording: () => true, aimRadius: 2,
      sampleAim: () => { order.push("sample"); return { x: 0, y: 1 }; },
      pushAim: (turn, magnitude) => { order.push(`aim:${String(turn)}:${String(magnitude)}`); },
      drainActions: () => { order.push("drain"); return []; },
      authoritativeStep: () => order.push("authoritative"),
      clearOverrides: () => order.push("clear"), step: () => order.push("step"), gauge });
    expect(order).toEqual(["sample", "aim:250000:500", "drain", "clear", "step"]);
    expect(gauge).toHaveBeenCalledTimes(3);
  });

  it("selects menu, boss and fallback music themes without platform globals", () => {
    const calls: unknown[][] = []; const port = { setMusicTheme: (...args: unknown[]) => { calls.push(args); } };
    syncMusicTheme(port, { menu: true, attractReady: true, attractStage: "forge", runMode: null,
      stageName: null, bossWave: false, appState: "menu" });
    syncMusicTheme(port, { menu: false, attractReady: false, attractStage: "menu", runMode: "campaign",
      stageName: "void", bossWave: true, appState: "playing" });
    expect(calls).toEqual([["forge", false], ["void", true]]);
  });

  it("emits run-relative semantic music events", () => {
    const emit = vi.fn();
    emitLiveMusicEvent({ active: true, emit, update: vi.fn() },
      { runTime: 3, mode: "campaign", diff: "normal", spawnQueue: [], combo: 0 }, "perfect-parry", { weaponId: "tear" });
    expect(emit).toHaveBeenCalledWith(3, { type: "perfect-parry", weaponId: "tear" });
  });
});
