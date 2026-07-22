import { describe, expect, it } from "vitest";
import {
  IllegalLegacyAppTransitionError,
  LEGACY_APP_SCREENS,
  LEGAL_LEGACY_TRANSITIONS,
  LegacyAppStateController,
  type LegacyAppScreen,
} from "../../src/app/legacy-state-controller";

function controllerAt(screen: LegacyAppScreen): LegacyAppStateController {
  const controller = new LegacyAppStateController();
  if (screen !== "menu") {
    const path: Partial<Record<LegacyAppScreen, readonly LegacyAppScreen[]>> = {
      playing: ["playing"], paused: ["playing", "paused"], draft: ["playing", "draft"],
      reserve: ["playing", "draft", "reserve"], tierup: ["playing", "tierup"], continue: ["playing", "continue"],
      gameover: ["playing", "gameover"], win: ["playing", "win"], confirmquit: ["playing", "paused", "confirmquit"],
      pgmenu: ["playing", "pgmenu"], pglab: ["playing", "pglab"],
      replay: ["replay"],
    };
    for (const next of path[screen] ?? [screen]) controller.transition(next, next === "replay" ? { returnTo: "menu" } : {});
  }
  return controller;
}

describe("LegacyAppStateController transition matrix", () => {
  it("accepts every declared legal edge", () => {
    for (const from of LEGACY_APP_SCREENS) {
      for (const to of LEGAL_LEGACY_TRANSITIONS[from]) {
        const controller = from === "replay" ? controllerAt(to) : controllerAt(from);
        if (from === "replay") controller.transition("replay", { returnTo: to });
        const context = to === "replay" ? { returnTo: from } as const : {};
        expect(controller.transition(to, context), `${from} -> ${to}`).toBe(to);
      }
    }
  });

  it("rejects every undeclared edge", () => {
    for (const from of LEGACY_APP_SCREENS) {
      for (const to of LEGACY_APP_SCREENS) {
        if (to === from || LEGAL_LEGACY_TRANSITIONS[from].includes(to)) continue;
        const controller = from === "replay" ? controllerAt("menu") : controllerAt(from);
        if (from === "replay") controller.transition("replay", { returnTo: "menu" });
        expect(() => controller.transition(to), `${from} -/-> ${to}`).toThrow(IllegalLegacyAppTransitionError);
      }
    }
  });

  it("restores pause after settings and then resumes the same run", () => {
    const controller = new LegacyAppStateController();
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
    const controller = new LegacyAppStateController();
    controller.transition("profile");
    controller.transition("replay", { returnTo: "profile" });
    expect(() => controller.transition("menu")).toThrow(IllegalLegacyAppTransitionError);
    expect(controller.transition("profile")).toBe("profile");
  });
});
