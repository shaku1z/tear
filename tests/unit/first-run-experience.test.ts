import { describe, expect, it } from "vitest";

import {
  defaultRunModeFor,
  FIRST_RUN_PLAY_LABEL,
  FIRST_RUN_SETUP_GUIDANCE,
  firstRunProfileFacts,
  isFirstRunProfile,
} from "../../src/gameplay/progression/first-run-guidance";
import { buildMenuSnapshot, buildSetupSnapshot } from "../../src/presentation/menu-setup-snapshots";
import { buildGameoverSnapshot, buildWinSnapshot } from "../../src/presentation/run-screen-snapshots";
import { CONTROL_HINT_RUN_LIMIT, CONTROL_HINT_SECONDS, domChromeVisibility, type DomChromeInput } from "../../src/presentation/dom-chrome-policy";
import { cinematicPromptForDevice } from "../../src/presentation/cinematic-prompts";
import { shouldDrawCanvasCursor } from "../../src/presentation/cursor-contract";
import { createLiveWorldSessionState } from "../../src/app/world/world-session-state";
import { CONFIG } from "../../src/config/game-config";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";

const RELEASE = createSurfaceAvailability("release");
const fresh = { tutorialDone: 0, runs: 0, modesPlayed: [] as string[] };

describe("first-run guidance from existing profile facts", () => {
  it("derives facts from stats and the started-modes set without a new saved field", () => {
    const stats: Record<string, number> = { tutorialDone: 1, runs: 4 };
    const facts = firstRunProfileFacts({ stat: (key) => stats[key] ?? 0, data: { modes: { campaign: true, tutorial: true } } });
    expect(facts).toEqual({ tutorialDone: 1, runs: 4, modesPlayed: ["campaign", "tutorial"] });
  });

  it("nudges a brand-new profile to the tutorial and stops once any history exists", () => {
    expect(isFirstRunProfile(fresh)).toBe(true);
    expect(defaultRunModeFor(fresh)).toBe("tutorial");
    // A started but unfinished tutorial is still a first run.
    expect(isFirstRunProfile({ ...fresh, modesPlayed: ["tutorial"] })).toBe(true);
    expect(isFirstRunProfile({ ...fresh, tutorialDone: 1 })).toBe(false);
    expect(isFirstRunProfile({ ...fresh, runs: 1 })).toBe(false);
    expect(isFirstRunProfile({ ...fresh, modesPlayed: ["endless"] })).toBe(false);
  });

  it("defaults to Adventure after the tutorial and keeps Endless for any other history", () => {
    expect(defaultRunModeFor({ tutorialDone: 1, runs: 0, modesPlayed: ["tutorial"] })).toBe("campaign");
    expect(defaultRunModeFor({ tutorialDone: 1, runs: 0, modesPlayed: ["tutorial", "playground"] })).toBe("endless");
    expect(defaultRunModeFor({ tutorialDone: 0, runs: 2, modesPlayed: ["endless"] })).toBe("endless");
  });

  it("reads the default live until the player picks, then keeps the explicit pick", () => {
    let mode: "tutorial" | "campaign" = "tutorial";
    const session = createLiveWorldSessionState(() => mode);
    expect(session.selection().mode).toBe("tutorial");
    mode = "campaign";
    expect(session.selectedMode()).toBe("campaign");
    session.setSelectedMode("endless");
    mode = "tutorial";
    expect(session.selection().mode).toBe("endless");
  });

  it("labels PLAY and guides setup only while the nudge applies", () => {
    const modes = [{ id: "tutorial", label: "Tutorial", blurb: "learn" }, { id: "endless", label: "Endless", blurb: "forever" }];
    const difficulties = [{ id: "normal", label: "Normal", desc: "fair", mods: { score: 1, coin: 1 } }];
    const menu = (firstRun: boolean, selectedMode: string) => buildMenuSnapshot({ username: "", campaignEmblem: false,
      signedIn: false, coins: 18_150, shards: 0, unlocked: 0, selectedMode, selectedDifficulty: "normal", modes, difficulties,
      biome: "", pendingFinale: false, surfaces: RELEASE, firstRun });
    expect(menu(true, "tutorial").playSub).toBe(FIRST_RUN_PLAY_LABEL);
    expect(menu(true, "endless").playSub).toBeUndefined();
    expect(menu(false, "tutorial").playSub).toBeUndefined();

    const setup = (firstRun: boolean, selectedMode: string) => buildSetupSnapshot({ selectedMode, selectedDifficulty: "normal",
      selectedWeapon: "sword", selectedBoss: "shuffle", startGlyph: "", modes: CONFIG.modes, difficulties, weapons: [],
      bosses: [], surfaces: RELEASE, best: { wave: 0, score: 0 }, formatTime: String, firstRun });
    const guided = setup(true, "tutorial");
    expect(guided.guidance).toBe(FIRST_RUN_SETUP_GUIDANCE);
    expect(guided.modes.find((mode) => mode.selected)?.id).toBe("tutorial");
    expect(setup(true, "campaign").guidance).toBeUndefined();
    expect(setup(false, "tutorial").guidance).toBeUndefined();
  });
});

describe("results correctness", () => {
  const base = { wave: 1, time: 11, best: { wave: 1, score: 0 }, earned: 0, coins: 0, replayAvailable: false,
    abilities: [], progress: [], log: [], formatTime: String } as const;
  it("never celebrates a scoreless run as a new best", () => {
    expect(buildGameoverSnapshot({ ...base, score: 0, isNew: true }).isNew).toBe(false);
    expect(buildGameoverSnapshot({ ...base, score: 40, isNew: true }).isNew).toBe(true);
    const win = { campaign: false, time: 1, earned: 0, coins: 0, difficulty: "normal", log: [], formatTime: String } as const;
    expect(buildWinSnapshot({ ...win, score: 0, isNew: true }).isNew).toBe(false);
    expect(buildWinSnapshot({ ...win, score: 9, isNew: true }).isNew).toBe(true);
  });
});

describe("DOM chrome over the canvas", () => {
  const playing: DomChromeInput = { screen: "playing", uiIncluded: true, pointerLockIncluded: true, touch: false,
    inputMode: "mouse", pointerLocked: true, runSeconds: 1, completedRuns: 0, presentationBusy: false };

  it("shows the control legend only in a newcomer's opening seconds on keyboard and mouse", () => {
    expect(domChromeVisibility(playing).controlHint).toBe(true);
    expect(domChromeVisibility({ ...playing, inputMode: "keyboard" }).controlHint).toBe(true);
    expect(domChromeVisibility({ ...playing, runSeconds: CONTROL_HINT_SECONDS }).controlHint).toBe(false);
    expect(domChromeVisibility({ ...playing, completedRuns: CONTROL_HINT_RUN_LIMIT }).controlHint).toBe(false);
    expect(domChromeVisibility({ ...playing, presentationBusy: true }).controlHint).toBe(false);
    expect(domChromeVisibility({ ...playing, inputMode: "gamepad" }).controlHint).toBe(false);
    expect(domChromeVisibility({ ...playing, inputMode: "touch", touch: true }).controlHint).toBe(false);
    expect(domChromeVisibility({ ...playing, screen: "paused" }).controlHint).toBe(false);
  });

  it("keeps the fullscreen button off the arena and off touch devices", () => {
    expect(domChromeVisibility(playing).fullscreen).toBe(false);
    expect(domChromeVisibility({ ...playing, screen: "menu" }).fullscreen).toBe(true);
    expect(domChromeVisibility({ ...playing, screen: "menu", touch: true }).fullscreen).toBe(false);
    expect(domChromeVisibility({ ...playing, screen: "menu", uiIncluded: false }).fullscreen).toBe(false);
  });

  it("keeps the pointer-capture hint for uncaptured desktop play only", () => {
    expect(domChromeVisibility(playing).lockHint).toBe(false);
    expect(domChromeVisibility({ ...playing, pointerLocked: false }).lockHint).toBe(true);
    expect(domChromeVisibility({ ...playing, pointerLocked: false, touch: true }).lockHint).toBe(false);
    expect(domChromeVisibility({ ...playing, pointerLocked: false, screen: "menu" }).lockHint).toBe(false);
  });

  it("never parks the canvas arrow at a touch position", () => {
    expect(shouldDrawCanvasCursor("menu", "touch")).toBe(false);
    expect(shouldDrawCanvasCursor("menu", "gamepad")).toBe(true);
    expect(shouldDrawCanvasCursor("menu")).toBe(true);
  });
});

describe("device-correct cinematic prompts", () => {
  const chapter = "TAP TO REVEAL  ·  HOLD TO SKIP CHAPTER";
  it("promises only what each device can do", () => {
    expect(cinematicPromptForDevice(chapter, "mouse")).toBe("CLICK TO REVEAL  ·  HOLD SPACE TO SKIP CHAPTER");
    expect(cinematicPromptForDevice(chapter, "keyboard")).toBe("SPACE TO REVEAL  ·  HOLD SPACE TO SKIP CHAPTER");
    expect(cinematicPromptForDevice(chapter, "gamepad", "✕")).toBe("✕ TO REVEAL  ·  HOLD ✕ TO SKIP CHAPTER");
    expect(cinematicPromptForDevice(chapter, "touch")).toBe("TAP TO REVEAL");
    expect(cinematicPromptForDevice("BRIEF SCENE  ·  HOLD TO SKIP", "touch")).toBe("BRIEF SCENE");
    expect(cinematicPromptForDevice("TAP TO REVEAL  ·  TAP AGAIN TO CONTINUE", "mouse"))
      .toBe("CLICK TO REVEAL  ·  CLICK AGAIN TO CONTINUE");
    expect(cinematicPromptForDevice("", "mouse")).toBe("");
    // The finale assist names the real key and is dropped where touch cannot hold it.
    const assist = "SWING THROUGH EACH ANCHOR  ·  HOLD CONFIRM OR WAIT FOR ASSIST";
    expect(cinematicPromptForDevice(assist, "keyboard")).toBe("SWING THROUGH EACH ANCHOR  ·  HOLD SPACE OR WAIT FOR ASSIST");
    expect(cinematicPromptForDevice(assist, "gamepad", "✕")).toBe("SWING THROUGH EACH ANCHOR  ·  HOLD ✕ OR WAIT FOR ASSIST");
    expect(cinematicPromptForDevice(assist, "touch")).toBe("SWING THROUGH EACH ANCHOR  ·  WAIT FOR ASSIST");
    expect(cinematicPromptForDevice("MOVE THE BLADE  ·  CUT THE TEAR ANCHORS  ·  HOLD CONFIRM TO ASSIST", "touch")).toBe("MOVE THE BLADE  ·  CUT THE TEAR ANCHORS");
  });
});
