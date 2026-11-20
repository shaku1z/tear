import { describe, expect, it } from "vitest";

import {
  APP_SCREENS,
  LEGAL_TRANSITIONS,
  SCREEN_CATALOG,
  isAppScreen,
  isMenuScreen,
  isSheetScreen,
  isWorldScreen,
  screenDensity,
  screenNeedsConfirmArming,
  screenNeedsPointerSettle,
  screenResetsScrollOnEnter,
  type AppScreen,
} from "../../src/domain/screen-catalog";
import { createSurfaceAvailability, screenSurface } from "../../src/domain/surface-availability";

const listed = (predicate: (screen: string) => boolean): AppScreen[] => APP_SCREENS.filter(predicate);

describe("screen catalog", () => {
  it("the restore and frame-coordinator screen guard accepts every application screen", () => {
    // State Setup restore (src/app/engineering/live-state-setup-assembly.ts)
    // rejected a screen this guard did not accept with "invalid restored
    // screen", and the frame coordinator dropped it. The guard used to omit
    // the six engineering screens.
    const rejected = APP_SCREENS.filter((screen) => !isAppScreen(screen));
    expect(rejected).toEqual([]);
    for (const name of ["", "tearbot", "constructor", "toString", "__proto__"])
      expect(isAppScreen(name), name).toBe(false);
  });

  it("derives exactly the screen lists the separate guards used to hold", () => {
    expect(APP_SCREENS).toEqual([
      "menu",
      "setup",
      "playing",
      "paused",
      "draft",
      "reserve",
      "tierup",
      "settings",
      "continue",
      "gameover",
      "win",
      "replay",
      "confirmquit",
      "shop",
      "codex",
      "profile",
      "achievements",
      "leaderboards",
      "music",
      "rename",
      "pgmenu",
      "pglab",
    ]);
    expect(new Set(listed(isMenuScreen))).toEqual(
      new Set([
        "menu",
        "shop",
        "codex",
        "setup",
        "profile",
        "settings",
        "achievements",
        "leaderboards",
        "music",
        "rename",
      ]),
    );
    expect(new Set(listed(isWorldScreen))).toEqual(
      new Set([
        "playing",
        "draft",
        "reserve",
        "tierup",
        "paused",
        "confirmquit",
        "gameover",
        "win",
        "continue",
        "pgmenu",
        "pglab",
      ]),
    );
    expect(new Set(listed(screenNeedsConfirmArming))).toEqual(
      new Set(["draft", "reserve", "tierup", "gameover", "win", "continue", "paused", "confirmquit"]),
    );
    expect(new Set(listed(screenNeedsPointerSettle))).toEqual(
      new Set(["draft", "reserve", "tierup", "gameover", "win", "continue"]),
    );
    expect(new Set(listed((screen) => screenDensity(screen) === "compact"))).toEqual(
      new Set([
        "playing",
        "paused",
        "draft",
        "reserve",
        "tierup",
        "confirmquit",
        "continue",
        "gameover",
        "win",
        "menu",
        "setup",
        "settings",
      ]),
    );
    expect(new Set(listed((screen) => screenDensity(screen) === "phone"))).toEqual(
      new Set(["shop", "codex", "profile", "achievements", "leaderboards", "music", "pgmenu", "pglab"]),
    );
    expect(new Set(listed(isSheetScreen))).toEqual(
      new Set(["setup", "shop", "codex", "profile", "achievements", "leaderboards", "settings", "music"]),
    );
    expect(new Set(listed(screenResetsScrollOnEnter))).toEqual(new Set(["shop", "draft", "reserve", "tierup"]));
    expect(listed((screen) => SCREEN_CATALOG[screen as AppScreen].channel === "engineering")).toEqual([]);
  });

  it("names only catalogued screens in transitions and lets rename return anywhere else", () => {
    for (const screen of APP_SCREENS) {
      for (const target of LEGAL_TRANSITIONS[screen]) expect(isAppScreen(target), `${screen} -> ${target}`).toBe(true);
      expect(LEGAL_TRANSITIONS[screen], screen).not.toContain(screen);
    }
    expect(LEGAL_TRANSITIONS.rename).toEqual(APP_SCREENS.filter((screen) => screen !== "rename"));
    expect(Object.isFrozen(SCREEN_CATALOG)).toBe(true);
    expect(Object.isFrozen(LEGAL_TRANSITIONS.menu)).toBe(true);
  });

  it("gives every engineering screen, and only those, an engineering surface", () => {
    for (const screen of APP_SCREENS) {
      const engineering = SCREEN_CATALOG[screen].channel === "engineering";
      expect(screenSurface(screen), screen).toBe(engineering ? `screen:${screen}` : undefined);
      expect(createSurfaceAvailability("release").allows(`screen:${screen}`), screen).toBe(!engineering);
    }
  });
});
