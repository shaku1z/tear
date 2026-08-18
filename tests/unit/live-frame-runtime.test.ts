import { describe, expect, it, vi } from "vitest";
import type { CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import type { TearSimulationAdvanceLifecycle } from "../../src/gameplay/runtime/tear-simulation-runtime";
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

  it("delegates normal fixed ticks through the shared canonical simulation exactly once", () => {
    const order: string[] = []; const gauge = vi.fn(); const advances: number[] = [];
    const sealedByTick = new Map<number, readonly CommandEnvelope<GameAction>[]>();
    const simulation = {
      advance(milliseconds: number, actionsForTick: (tick: number) => readonly CommandEnvelope<GameAction>[],
        lifecycle?: TearSimulationAdvanceLifecycle) {
        advances.push(milliseconds);
        if (lifecycle === undefined) throw new Error("canonical lifecycle is required for the live frame path");
        const activeLifecycle = lifecycle;
        for (const tick of [4, 5]) {
          if (activeLifecycle.shouldStep?.(tick) === false) continue;
          try {
            activeLifecycle.beforeStep?.(tick);
            const actions = actionsForTick(tick);
            order.push(`canonical-step:${String(tick)}:${String(actions.length)}`);
            activeLifecycle.afterStep?.(tick);
          } finally {
            activeLifecycle.cleanupStep?.(tick);
          }
        }
        return { tick: 5, steps: 2, droppedMilliseconds: 0 };
      },
    };
    const state = vi.fn(() => "playing");
    const result = advanceFixedSimulation({ dt: 1 / 60, timeScale: 1, hitStop: 0, state, simulation,
      drainActions: (tick) => {
        const actions = Object.freeze([{ kind: "command" as const, id: tick, tick,
          command: { type: "move" as const, x: 1_000, y: 0 } }]);
        sealedByTick.set(tick, actions); order.push(`drain:${String(tick)}`); return actions;
      },
      recordSealedActions: (tick, actions) => {
        expect(actions).toBe(sealedByTick.get(tick)); order.push(`record:${String(tick)}`);
      },
      beforeStep: (tick) => order.push(`before:${String(tick)}`),
      afterStep: (tick) => order.push(`after:${String(tick)}`),
      clearSimulationInput: () => order.push("clear"), gauge });
    expect(advances).toEqual([1_000 / 60]);
    expect(state).toHaveBeenCalledTimes(2);
    expect(order).toEqual([
      "before:4", "drain:4", "record:4", "canonical-step:4:1", "after:4", "clear",
      "before:5", "drain:5", "record:5", "canonical-step:5:1", "after:5", "clear",
    ]);
    expect(gauge).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ hitStop: 0, steps: 2 });
  });

  it("does not drain or clear commands when the canonical runtime declines a non-playing tick", () => {
    const drainActions = vi.fn(() => []); const recordSealedActions = vi.fn(); const clearSimulationInput = vi.fn();
    const beforeStep = vi.fn(); const afterStep = vi.fn(); const simulation = {
      advance(_milliseconds: number, actionsForTick: (tick: number) => readonly CommandEnvelope<GameAction>[],
        lifecycle?: TearSimulationAdvanceLifecycle) {
        if (lifecycle === undefined) throw new Error("canonical lifecycle is required for the live frame path");
        const activeLifecycle = lifecycle;
        if (activeLifecycle.shouldStep?.(9) !== false) {
          try {
            activeLifecycle.beforeStep?.(9); actionsForTick(9); activeLifecycle.afterStep?.(9);
          } finally {
            activeLifecycle.cleanupStep?.(9);
          }
        }
        return { tick: 9, steps: 0, droppedMilliseconds: 0 };
      },
    };
    const result = advanceFixedSimulation({
      dt: 1 / 120, timeScale: 1, hitStop: 0, state: () => "paused", simulation, drainActions,
      recordSealedActions, beforeStep, afterStep, clearSimulationInput, gauge: () => { return; },
    });
    expect(drainActions).not.toHaveBeenCalled(); expect(recordSealedActions).not.toHaveBeenCalled();
    expect(beforeStep).not.toHaveBeenCalled(); expect(afterStep).not.toHaveBeenCalled();
    expect(clearSimulationInput).not.toHaveBeenCalled(); expect(result).toEqual({ hitStop: 0, steps: 0 });
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
