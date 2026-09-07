import { describe, expect, it, vi } from "vitest";

import type { GameEnemy, GameRun } from "../../src/app/game-runtime-state";
import { createLiveStateForgeRuntimeBridge } from "../../src/app/live-state-forge-runtime-bridge";
import type { BossIntroState } from "../../src/app/live-game-host-state";
import { advanceFramePrelude, commitBossIntroSnapshot, type MutableFramePreludeState } from "../../src/app/live-frame-runtime";
import { decodeTearCodecValue } from "../../src/tearbench/detached-world-hydrator";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";
import { initialRunLifecycleSnapshot } from "../../src/gameplay/run/lifecycle";

function campaignRun(): GameRun {
  return { mode: "campaign", wave: 1, chapterState: "LORE_ENTER", _biomeIdx: 0,
    _prologueShown: true, isBossWave: false } as unknown as GameRun;
}

const transient = Object.freeze({
  hitStop: 0, shake: 0, timeScale: 1, slowmo: 0, zoom: 1, flash: 0, bannerT: 0,
  dashGhostT: 0, landingV: 0, wasDashing: false, wasSwinging: false, wasOnGround: true,
  worldZoom: 1, worldZoomTarget: 1, throwCd: 0, rankPopT: 0, rankPopText: "",
});

describe("live State Forge runtime bridge", () => {
  it.each([30, 60, 120])("restores hydrated boss intro ownership and completes at %i render Hz", (renderHz) => {
    const bossData = { isBoss: true, introT: 1.4, hp: 100, maxHp: 100, dead: false, dying: false };
    const oldBoss = { ...bossData } as GameEnemy;
    const restoredBoss = { ...bossData } as GameEnemy;
    const intro = { boss: oldBoss, delay: 0, t: 0, dur: 1.4 };
    const restoreBossIntro = vi.fn<(value: BossIntroState | null) => void>();
    const options = {
      captureTransient: () => transient, restoreTransient: vi.fn(), captureLifecycle: initialRunLifecycleSnapshot,
      restoreLifecycle: vi.fn(), captureChapterBinding: () => null, stageChapterBinding: () => null,
      installChapterBinding: () => undefined, captureCinemaProtection: () => ({ active: false, lastMode: null }),
      restoreCinemaProtection: vi.fn(), captureStageBanner: () => ({ name: "", seconds: 0 }),
      restoreStageBanner: vi.fn(), captureBossIntro: () => intro, restoreBossIntro,
      cinema: { captureState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
        validateState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1, restoreState: vi.fn() },
    };
    const bridge = createLiveStateForgeRuntimeBridge(options);
    expect(bridge.capture().bossIntro).toEqual(intro);
    const hydratedIntro = decodeTearCodecValue({ delay: 0, t: 0, dur: 1.4, boss: { $ref: "boss-1" } },
      new Map([["boss-1", restoredBoss]])) as BossIntroState;
    const snapshot = { ...bridge.capture(), bossIntro: hydratedIntro, cinema: INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 };
    expect(() => { bridge.validate(snapshot, campaignRun(), 0, [restoredBoss]); }).not.toThrow();
    expect(() => { bridge.validate(snapshot, campaignRun(), 0, [oldBoss]); }).toThrow(/not owned/);
    expect(() => { bridge.validate({ ...snapshot, bossIntro: null }, campaignRun(), 0, [restoredBoss]); })
      .toThrow(/missing its intro binding/);
    expect(() => { bridge.validate({ ...snapshot, bossIntroVersion: 2 }, campaignRun(), 0, [restoredBoss]); })
      .toThrow(/unsupported/);
    expect(() => { bridge.validate({ ...snapshot, bossIntro: { ...hydratedIntro, t: Number.NaN } },
      campaignRun(), 0, [restoredBoss]); }).toThrow(/invalid timers/);
    expect(restoreBossIntro).not.toHaveBeenCalled();
    bridge.restore(snapshot);
    expect(restoreBossIntro).toHaveBeenCalledWith(hydratedIntro);
    expect(restoreBossIntro.mock.calls[0]?.[0]?.boss).toBe(restoredBoss);
    expect(restoreBossIntro.mock.calls[0]?.[0]?.boss).not.toBe(oldBoss);
    let liveIntro = restoreBossIntro.mock.calls[0]?.[0] ?? null;
    for (let frame = 0; frame < renderHz * 2; frame++) {
      const state: MutableFramePreludeState = { slowMotion: 0, timeScale: 1, worldZoom: 1, worldZoomTarget: 1,
        zoom: 1, flash: 0, bannerTime: 0, stageBannerSeconds: 0, rankPopTime: 0, bossBeat: null,
        bossIntro: liveIntro === null ? null : { ...liveIntro, boss: { hp: restoredBoss.hp,
          maxHp: restoredBoss.maxHp, introT: restoredBoss.introT ?? 0 } } };
      advanceFramePrelude({ dt: 1 / renderHz, state, parrySlowScale: 0.2, cinemaActive: false, playgroundSlow: false,
        introScale: 0.4, lerp: (a, b, t) => a + (b - a) * t, clamp: (v, min, max) => Math.max(min, Math.min(max, v)) });
      liveIntro = commitBossIntroSnapshot(liveIntro, state.bossIntro);
    }
    expect(liveIntro).toBeNull();
    expect(restoredBoss.introT).toBe(0);
    expect(oldBoss.introT).toBe(1.4);
    bridge.restore({ ...bridge.capture(), bossIntro: null, cinema: INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 });
    expect(restoreBossIntro).toHaveBeenLastCalledWith(null);
  });

  it("migrates absent banner/protection fields to canonical values during restore", () => {
    const restoreStageBanner = vi.fn(); const restoreCinemaProtection = vi.fn();
    const clearEnvironmentRestore = vi.fn();
    const bridge = createLiveStateForgeRuntimeBridge({
      captureBossIntro: () => null, restoreBossIntro: vi.fn(),
      captureTransient: () => ({}), restoreTransient: vi.fn(), captureLifecycle: initialRunLifecycleSnapshot,
      restoreLifecycle: vi.fn(), captureChapterBinding: () => null, stageChapterBinding: () => null,
      installChapterBinding: () => undefined, captureCinemaProtection: () => ({ active: false, lastMode: null }),
      restoreCinemaProtection, captureStageBanner: () => ({ name: "", seconds: 0 }), restoreStageBanner,
      clearEnvironmentRestore,
      cinema: { captureState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
        validateState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1, restoreState: vi.fn() },
    });
    bridge.restore({ lifecycle: initialRunLifecycleSnapshot(), cinema: INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 });
    expect(restoreStageBanner).toHaveBeenCalledWith("", 0);
    expect(restoreCinemaProtection).toHaveBeenCalledWith({ active: false, lastMode: null });
    expect(clearEnvironmentRestore).not.toHaveBeenCalled();
  });

  it("validates reconstructed chapter position and lifecycle before commit", () => {
    const binding = { script: { id: "chapter-0", revision: "binding", beats: [{ id: "enter" }] }, context: {} };
    const validateState = vi.fn(() => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1);
    const bridge = createLiveStateForgeRuntimeBridge({
      captureBossIntro: () => null, restoreBossIntro: vi.fn(),
      captureTransient: () => ({}), restoreTransient: vi.fn(), captureLifecycle: initialRunLifecycleSnapshot,
      restoreLifecycle: vi.fn(), captureChapterBinding: () => ({}), stageChapterBinding: () => ({ binding,
        spec: { stageIndex: 0, prologueShownAfter: true, flowState: "LORE_ENTER", page: 0 } }),
      installChapterBinding: () => binding, captureCinemaProtection: () => ({ active: true, lastMode: "locked" }),
      restoreCinemaProtection: vi.fn(), captureStageBanner: () => ({ name: "", seconds: 0 }),
      restoreStageBanner: vi.fn(), cinema: { captureState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
        validateState, restoreState: vi.fn() },
    });
    const snapshot = { ...transient, chapterBinding: {}, stageBanner: { name: "", seconds: 0 },
      cinemaProtection: { active: true, lastMode: "locked" },
      cinema: { active: true, scriptId: "chapter-0", beatId: "enter" },
      lifecycle: { ...initialRunLifecycleSnapshot(), phase: "wave-prepared" as const, sessionId: "run-1",
        wave: 1, activationDeferred: true } };
    bridge.validate(snapshot, campaignRun(), 0);
    expect(validateState).toHaveBeenCalledWith(snapshot.cinema, binding);
    expect(() => { bridge.validate({ ...snapshot, cinema: { ...snapshot.cinema, beatId: "page-1" } }, campaignRun(), 0); })
      .toThrow(/inconsistent/);
  });

  it("rejects active legacy chapters without a reconstructible binding", () => {
    const bridge = createLiveStateForgeRuntimeBridge({
      captureBossIntro: () => null, restoreBossIntro: vi.fn(),
      captureTransient: () => ({}), restoreTransient: vi.fn(), captureLifecycle: initialRunLifecycleSnapshot,
      restoreLifecycle: vi.fn(), captureChapterBinding: () => null, stageChapterBinding: () => null,
      installChapterBinding: () => undefined, captureCinemaProtection: () => ({ active: false, lastMode: null }),
      restoreCinemaProtection: vi.fn(), captureStageBanner: () => ({ name: "", seconds: 0 }),
      restoreStageBanner: vi.fn(), cinema: { captureState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
        validateState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1, restoreState: vi.fn() },
    });
    expect(() => { bridge.validate({ ...transient,
      cinema: { active: true, scriptId: "chapter-0", beatId: "enter" },
      lifecycle: initialRunLifecycleSnapshot() }, campaignRun(), 0); }).toThrow(/missing its reconstructible binding/);
  });

  it("rejects non-finite transient runtime data before commit", () => {
    const bridge = createLiveStateForgeRuntimeBridge({
      captureBossIntro: () => null, restoreBossIntro: vi.fn(),
      captureTransient: () => transient, restoreTransient: vi.fn(), captureLifecycle: initialRunLifecycleSnapshot,
      restoreLifecycle: vi.fn(), captureChapterBinding: () => null, stageChapterBinding: () => null,
      installChapterBinding: () => undefined, captureCinemaProtection: () => ({ active: false, lastMode: null }),
      restoreCinemaProtection: vi.fn(), captureStageBanner: () => ({ name: "", seconds: 0 }),
      restoreStageBanner: vi.fn(), cinema: { captureState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
        validateState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1, restoreState: vi.fn() },
    });
    expect(() => { bridge.validate({ ...transient, hitStop: "not-a-number",
      cinema: INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 }, campaignRun(), 0); }).toThrow(/hitStop must be finite/);
    expect(() => { bridge.validate({ ...transient, cinema: INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
      lifecycle: { ...initialRunLifecycleSnapshot(), phase: "wave-prepared", sessionId: null, wave: 1,
        activationDeferred: true } }, campaignRun(), 0); }).toThrow(/inconsistent with its phase/);
    const legacy = { hitStop: 0, shake: 0, timeScale: 1, slowmo: 0, zoom: 1, flash: 0,
      bannerT: 0, dashGhostT: 0, worldZoom: 1, worldZoomTarget: 1, throwCd: 0, rankPopT: 0,
      rankPopText: "", lifecycle: initialRunLifecycleSnapshot(), cinema: INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 };
    expect(() => { bridge.validate(legacy, campaignRun(), 0); }).not.toThrow();
  });
});
