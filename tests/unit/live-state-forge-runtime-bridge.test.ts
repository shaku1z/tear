import { describe, expect, it, vi } from "vitest";

import type { GameRun } from "../../src/app/game-runtime-state";
import { createLiveStateForgeRuntimeBridge } from "../../src/app/live-state-forge-runtime-bridge";
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
  it("migrates absent banner/protection fields to canonical values during restore", () => {
    const restoreStageBanner = vi.fn(); const restoreCinemaProtection = vi.fn();
    const bridge = createLiveStateForgeRuntimeBridge({
      captureTransient: () => ({}), restoreTransient: vi.fn(), captureLifecycle: initialRunLifecycleSnapshot,
      restoreLifecycle: vi.fn(), captureChapterBinding: () => null, stageChapterBinding: () => null,
      installChapterBinding: () => undefined, captureCinemaProtection: () => ({ active: false, lastMode: null }),
      restoreCinemaProtection, captureStageBanner: () => ({ name: "", seconds: 0 }), restoreStageBanner,
      cinema: { captureState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
        validateState: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1, restoreState: vi.fn() },
    });
    bridge.restore({ lifecycle: initialRunLifecycleSnapshot(), cinema: INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 });
    expect(restoreStageBanner).toHaveBeenCalledWith("", 0);
    expect(restoreCinemaProtection).toHaveBeenCalledWith({ active: false, lastMode: null });
  });

  it("validates reconstructed chapter position and lifecycle before commit", () => {
    const binding = { script: { id: "chapter-0", revision: "binding", beats: [{ id: "enter" }] }, context: {} };
    const validateState = vi.fn(() => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1);
    const bridge = createLiveStateForgeRuntimeBridge({
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
