import { describe, expect, it } from "vitest";
import {
  IllegalLegacyAppTransitionError,
  APP_SCREENS,
  LEGAL_TRANSITIONS,
  AppStateController,
  type AppScreen,
} from "../../src/app/interface/app-state-controller";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";

const ENGINEERING = createSurfaceAvailability("engineering");

function controllerAt(screen: AppScreen): AppStateController {
  const controller = new AppStateController(ENGINEERING);
  if (screen !== "menu") {
    const path: Partial<Record<AppScreen, readonly AppScreen[]>> = {
      playing: ["playing"], paused: ["playing", "paused"], draft: ["playing", "draft"],
      reserve: ["playing", "draft", "reserve"], tierup: ["playing", "tierup"], continue: ["playing", "continue"],
      gameover: ["playing", "gameover"], win: ["playing", "win"], confirmquit: ["playing", "paused", "confirmquit"],
      pgmenu: ["playing", "pgmenu"], pglab: ["playing", "pglab"],
      // Bot Evidence is a read-only Ghost Lab child, not a menu destination.
      botevidence: ["ghostlab", "botevidence"],
      // Publication and Support are selected from a Vault row in Profile.
      ghostpublication: ["profile", "ghostpublication"], ghostsupport: ["profile", "ghostsupport"],
      replay: ["replay"],
    };
    for (const next of path[screen] ?? [screen]) controller.transition(next, next === "replay" ? { returnTo: "menu" } : {});
  }
  return controller;
}

describe("AppStateController transition matrix", () => {
  it("keeps Bot Evidence behind the normal Ghost Lab route", () => {
    const controller = new AppStateController(ENGINEERING);
    expect(() => controller.transition("botevidence")).toThrow(IllegalLegacyAppTransitionError);
    controller.transition("ghostlab");
    expect(controller.transition("botevidence")).toBe("botevidence");
  });

  it("accepts every declared legal edge", () => {
    for (const from of APP_SCREENS) {
      for (const to of LEGAL_TRANSITIONS[from]) {
        const controller = from === "replay" && to === "playing" ? controllerAt("menu")
          : from === "replay" ? controllerAt(to) : controllerAt(from);
        if (from === "replay") controller.transition("replay", { returnTo: to });
        const context = to === "replay" ? { returnTo: from } as const
          : from === "replay" && to === "playing" ? { practiceLaunch: true } as const : {};
        expect(controller.transition(to, context), `${from} -> ${to}`).toBe(to);
      }
    }
  });

  it("rejects every undeclared edge", () => {
    for (const from of APP_SCREENS) {
      for (const to of APP_SCREENS) {
        if (to === from || LEGAL_TRANSITIONS[from].includes(to)) continue;
        const controller = from === "replay" ? controllerAt("menu") : controllerAt(from);
        if (from === "replay") controller.transition("replay", { returnTo: "menu" });
        expect(() => controller.transition(to), `${from} -/-> ${to}`).toThrow(IllegalLegacyAppTransitionError);
      }
    }
  });

  it("restores pause after settings and then resumes the same run", () => {
    const controller = new AppStateController(ENGINEERING);
    controller.transition("setup");
    controller.transition("playing", { runId: "run-1" });
    controller.transition("paused");
    controller.transition("settings");
    expect(controller.settingsReturn).toBe("paused");
    controller.transition(controller.settingsReturn);
    expect(controller.settingsReturn).toBe("menu");
    controller.transition("playing");
    expect(controller.snapshot()).toMatchObject({ screen: "playing", runId: "run-1" });
  });

  it("only exits replay to its captured viewer origin", () => {
    const controller = new AppStateController(ENGINEERING);
    controller.transition("profile");
    controller.transition("replay", { returnTo: "profile" });
    expect(() => controller.transition("menu")).toThrow(IllegalLegacyAppTransitionError);
    expect(controller.transition("profile")).toBe("profile");
  });

  it("admits a replay-to-playing transition only for a verified practice launch", () => {
    const controller = new AppStateController(ENGINEERING);
    controller.transition("profile"); controller.transition("replay", { returnTo: "profile" });
    expect(() => controller.transition("playing")).toThrow(IllegalLegacyAppTransitionError);
    expect(controller.transition("playing", { practiceLaunch: true, runId: "practice-child" })).toBe("playing");
  });
});
