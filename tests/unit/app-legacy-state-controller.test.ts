import { describe, expect, it } from "vitest";
import { IllegalLegacyAppTransitionError, AppStateController } from "../../src/app/interface/app-state-controller";
import { APP_SCREENS, LEGAL_TRANSITIONS, type AppScreen } from "../../src/domain/screen-catalog";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";

const ENGINEERING = createSurfaceAvailability("engineering");

function controllerAt(screen: AppScreen): AppStateController {
  const controller = new AppStateController(ENGINEERING);
  if (screen !== "menu") {
    const path: Partial<Record<AppScreen, readonly AppScreen[]>> = {
      playing: ["playing"],
      paused: ["playing", "paused"],
      draft: ["playing", "draft"],
      reserve: ["playing", "draft", "reserve"],
      tierup: ["playing", "tierup"],
      continue: ["playing", "continue"],
      gameover: ["playing", "gameover"],
      win: ["playing", "win"],
      confirmquit: ["playing", "paused", "confirmquit"],
      pgmenu: ["playing", "pgmenu"],
      pglab: ["playing", "pglab"],
      replay: ["replay"],
    };
    for (const next of path[screen] ?? [screen])
      controller.transition(next, next === "replay" ? { returnTo: "menu" } : {});
  }
  return controller;
}

describe("AppStateController transition matrix", () => {
  it("accepts every declared legal edge", () => {
    for (const from of APP_SCREENS) {
      for (const to of LEGAL_TRANSITIONS[from]) {
        const controller =
          from === "replay" && to === "playing"
            ? controllerAt("menu")
            : from === "replay"
              ? controllerAt(to)
              : controllerAt(from);
        if (from === "replay") controller.transition("replay", { returnTo: to });
        const context =
          to === "replay"
            ? ({ returnTo: from } as const)
            : from === "replay" && to === "playing"
              ? ({ practiceLaunch: true } as const)
              : {};
        expect(controller.transition(to, context), `${from} -> ${to}`).toBe(to);
      }
    }
  });

  it("rejects every undeclared edge except the return to the screen this one was opened from", () => {
    for (const from of APP_SCREENS) {
      for (const to of APP_SCREENS) {
        if (to === from || LEGAL_TRANSITIONS[from].includes(to)) continue;
        const controller = from === "replay" ? controllerAt("menu") : controllerAt(from);
        if (from === "replay") controller.transition("replay", { returnTo: "menu" });
        if (to === controller.snapshot().back) continue;
        expect(() => controller.transition(to), `${from} -/-> ${to}`).toThrow(IllegalLegacyAppTransitionError);
      }
    }
  });

  it("restores pause after settings and then resumes the same run", () => {
    const controller = new AppStateController(ENGINEERING);
    controller.transition("setup");
    controller.transition("playing", { runId: "run-1" });
    controller.transition("paused");
    controller.transition("settings", { leaving: { focus: 3, scroll: 0 } });
    expect(controller.snapshot().back).toBe("paused");
    controller.transition("paused");
    expect(controller.snapshot()).toMatchObject({ back: "playing", arrival: { screen: "paused", focus: 3 } });
    controller.transition("playing");
    expect(controller.snapshot()).toMatchObject({ screen: "playing", runId: "run-1" });
  });

  it("returns a page to the screen it was opened from, with the control the player left", () => {
    const controller = new AppStateController(ENGINEERING);
    controller.transition("settings", { leaving: { focus: 5, scroll: 0 } });
    controller.transition("codex", { leaving: { focus: 2, scroll: 140 } });
    expect(LEGAL_TRANSITIONS.codex).not.toContain("settings");
    expect(controller.canTransition("settings")).toBe(true);
    controller.transition("settings");
    expect(controller.snapshot()).toMatchObject({
      back: "menu",
      arrival: { screen: "settings", focus: 2, scroll: 140 },
    });
    controller.transition("menu");
    expect(controller.snapshot()).toMatchObject({ back: null, arrival: { screen: "menu", focus: 5 } });
    controller.transition("codex");
    expect(() => controller.transition("settings")).toThrow(IllegalLegacyAppTransitionError);
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
    controller.transition("profile");
    controller.transition("replay", { returnTo: "profile" });
    expect(() => controller.transition("playing")).toThrow(IllegalLegacyAppTransitionError);
    expect(controller.transition("playing", { practiceLaunch: true, runId: "practice-child" })).toBe("playing");
  });
});
