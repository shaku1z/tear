import { describe, expect, it, vi } from "vitest";

import {
  SURFACE_CHANNEL, createSurfaceAvailability, screenActionAvailable, screenActionSurface, screenSurface, type SurfaceId,
} from "../../src/domain/surface-availability";
import type { ScreenAction } from "../../src/domain/screen-actions";
import { createEngineeringQuery } from "../../src/app/shell/engineering-query";
import { gateScreenActions } from "../../src/app/interface/screen-action-bindings";
import {
  IllegalLegacyAppTransitionError, APP_SCREENS, AppStateController, UnavailableLegacyAppScreenError,
} from "../../src/app/interface/app-state-controller";
import { MODE_CATALOG, RELEASE_FALLBACK_MODE, admittedRunMode, modeSurface } from "../../src/gameplay/run/mode-catalog";

const RELEASE = createSurfaceAvailability("release");
const ENGINEERING = createSurfaceAvailability("engineering");
const SURFACES = Object.keys(SURFACE_CHANNEL) as SurfaceId[];
const ENGINEERING_SCREENS = ["academy", "foundry", "ghostlab", "botevidence", "ghostpublication", "ghostsupport"] as const;

describe("surface availability policy", () => {
  it("is a frozen source-owned table whose release channel admits only release surfaces", () => {
    expect(Object.isFrozen(SURFACE_CHANNEL)).toBe(true);
    for (const id of SURFACES) {
      expect(RELEASE.allows(id), id).toBe(SURFACE_CHANNEL[id] === "release");
      expect(ENGINEERING.allows(id), id).toBe(true);
    }
    expect(RELEASE.admits("release")).toBe(true);
    expect(RELEASE.admits("engineering")).toBe(false);
    expect(ENGINEERING.admits("engineering")).toBe(true);
    expect(() => RELEASE.allows("screen:unknown" as SurfaceId)).toThrow(RangeError);
    expect(() => createSurfaceAvailability("beta" as "release")).toThrow(TypeError);
  });

  it("classifies engineering screens, routes and unfinished features", () => {
    for (const screen of ENGINEERING_SCREENS) expect(screenSurface(screen), screen).toBeDefined();
    for (const screen of ["menu", "setup", "profile", "replay", "leaderboards", "playing"]) expect(screenSurface(screen), screen).toBeUndefined();
    const engineering: readonly ScreenAction[] = [
      { type: "training-archive.open" }, { type: "academy.retry" }, { type: "training-operations.open" }, { type: "foundry.refresh" },
      { type: "game-agent.open" }, { type: "run-monitor.open" }, { type: "run-monitor.control", command: "start" },
      { type: "replay.hub.open", destination: "vault" }, { type: "replay.hub.watch", command: "pause" },
      { type: "ghostlab.open", destination: "career" }, { type: "ghostlab.watch", command: "stop" },
      { type: "navigate", to: "ghostlab" }, { type: "navigate", to: "academy" },
      { type: "setup.start", race: true }, { type: "setup.selectBoss", id: "warden" },
      { type: "career.control", command: "race" }, { type: "career.control", command: "beat" }, { type: "career.control", command: "beat-receive" },
      { type: "career.control", command: "coach" }, { type: "career.control", command: "publish" },
      { type: "replay.coach.open" }, { type: "replay.editor.toggle" }, { type: "replay.studio.toggle" },
      { type: "replay.challenge.start", id: "boss-memory-save" }, { type: "profile.loadOwnGhostCapsules" },
      { type: "profile.openGhostPublication", id: "c" }, { type: "profile.openGhostSupport", id: "c" }, { type: "ghostsupport.create" },
      { type: "profile.downloadGhostArchive", id: "c", paired: true },
    ];
    for (const action of engineering) {
      expect(screenActionSurface(action), JSON.stringify(action)).toBeDefined();
      expect(screenActionAvailable(RELEASE, action), JSON.stringify(action)).toBe(false);
      expect(screenActionAvailable(ENGINEERING, action), JSON.stringify(action)).toBe(true);
    }
    // Player features that must stay visible in release.
    const player: readonly ScreenAction[] = [
      { type: "setup.start" }, { type: "setup.selectMode", id: "endless" }, { type: "navigate", to: "profile", tab: "vault" },
      { type: "career.control", command: "watch" }, { type: "career.control", command: "chase" }, { type: "career.control", command: "challenge" },
      { type: "career.control", command: "download" }, { type: "replay.practice" }, { type: "replay.challenge.open" },
      { type: "replay.challenge.start", id: "challenge-1" }, { type: "replay.runDna.toggle" }, { type: "profile.watchGhostCapsule", id: "c" },
      { type: "profile.downloadGhostArchive", id: "c" }, { type: "profile.restoreGhostArchive", id: "j", revision: 1 },
      { type: "profile.repairGhostCapsule", id: "c" }, { type: "profile.publishReplay", id: "r" }, { type: "leaderboards.watchReplay", id: "r" },
      { type: "chase.control", command: "toggle" }, { type: "tutorial.action", command: "open-practice" },
    ];
    for (const action of player) expect(screenActionAvailable(RELEASE, action), JSON.stringify(action)).toBe(true);
  });

  it("makes engineering actions inert in release regardless of the dispatching path", () => {
    const routed = vi.fn<(action: ScreenAction) => void>();
    const release = gateScreenActions(RELEASE, routed), engineering = gateScreenActions(ENGINEERING, routed);
    release({ type: "training-archive.open" }); release({ type: "training-operations.open" }); release({ type: "game-agent.open" });
    release({ type: "replay.hub.open", destination: "watch" }); release({ type: "navigate", to: "ghostlab" });
    release({ type: "run-monitor.control", command: "start" }); release({ type: "setup.start", race: true });
    expect(routed).not.toHaveBeenCalled();
    release({ type: "setup.start" });
    expect(routed).toHaveBeenCalledExactlyOnceWith({ type: "setup.start" });
    engineering({ type: "training-archive.open" });
    expect(routed).toHaveBeenLastCalledWith({ type: "training-archive.open" });
  });
});

describe("engineering query gate", () => {
  const search = "?test=1&stemcue=x&foundryPreview=0123456789abcdef0123456789abcdef&watchagent=1&replay-hub=1";
  it("yields no parameters in release", () => {
    const query = createEngineeringQuery(RELEASE, search);
    expect(query.search).toBe("");
    for (const name of ["test", "stemcue", "foundryPreview", "watchagent", "replay-hub", "stems", "bossdebug"]) expect(query.get(name), name).toBeNull();
  });
  it("preserves every parameter in engineering builds", () => {
    const query = createEngineeringQuery(ENGINEERING, search);
    expect(query.search).toBe(search);
    expect(query.get("test")).toBe("1");
    expect(query.get("stemcue")).toBe("x");
  });
});

describe("run-mode admission", () => {
  it("keeps Boss Test and Enemy Test in the catalog as engineering modes", () => {
    expect(MODE_CATALOG.map((mode) => [mode.id, modeSurface(mode.id)])).toEqual([
      ["campaign", "release"], ["endless", "release"], ["gauntlet", "release"], ["playground", "release"],
      ["tutorial", "release"], ["bossonly", "engineering"], ["sandbox", "engineering"],
    ]);
  });
  it("falls back from a stale engineering selection to a release mode in release builds only", () => {
    expect(RELEASE_FALLBACK_MODE).toBe("endless");
    expect(admittedRunMode("bossonly", RELEASE)).toBe("endless");
    expect(admittedRunMode("sandbox", RELEASE)).toBe("endless");
    expect(admittedRunMode("campaign", RELEASE)).toBe("campaign");
    expect(admittedRunMode("bossonly", ENGINEERING)).toBe("bossonly");
    expect(admittedRunMode("sandbox", ENGINEERING)).toBe("sandbox");
  });
});

describe("application state controller surface guard", () => {
  it("refuses every engineering screen in release by any path, including rename", () => {
    for (const screen of ENGINEERING_SCREENS) {
      const fromMenu = new AppStateController(RELEASE);
      expect(fromMenu.canEnter(screen), screen).toBe(false);
      expect(fromMenu.canTransition(screen), screen).toBe(false);
      expect(() => fromMenu.transition(screen), screen).toThrow(UnavailableLegacyAppScreenError);
      expect(fromMenu.screen).toBe("menu");
      const fromRename = new AppStateController(RELEASE);
      fromRename.transition("rename");
      expect(() => fromRename.transition(screen), screen).toThrow(IllegalLegacyAppTransitionError);
      expect(fromRename.screen).toBe("rename");
    }
    const release = new AppStateController(RELEASE);
    expect(release.transition("setup")).toBe("setup");
    for (const screen of APP_SCREENS) {
      if (!(ENGINEERING_SCREENS as readonly string[]).includes(screen)) expect(release.canEnter(screen), screen).toBe(true);
    }
  });
  it("keeps every engineering screen enterable in engineering builds", () => {
    const controller = new AppStateController(ENGINEERING);
    expect(controller.transition("ghostlab")).toBe("ghostlab");
    expect(controller.transition("botevidence")).toBe("botevidence");
    expect(controller.transition("menu")).toBe("menu");
    expect(controller.transition("academy")).toBe("academy");
  });
});
