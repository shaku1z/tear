import { describe, expect, it, vi } from "vitest";

import {
  SURFACE_CHANNEL,
  createSurfaceAvailability,
  screenActionAvailable,
  screenActionSurface,
  screenSurface,
  type SurfaceId,
} from "../../src/domain/surface-availability";
import type { ScreenAction } from "../../src/domain/screen-actions";
import { createEngineeringQuery } from "../../src/app/shell/engineering-query";
import { gateScreenActions } from "../../src/app/interface/screen-action-bindings";
import { AppStateController } from "../../src/app/interface/app-state-controller";
import { APP_SCREENS } from "../../src/domain/screen-catalog";
import { MODE_CATALOG, RELEASE_FALLBACK_MODE, admittedRunMode, modeSurface } from "../../src/gameplay/run/mode-catalog";

const RELEASE = createSurfaceAvailability("release");
const ENGINEERING = createSurfaceAvailability("engineering");
const SURFACES = Object.keys(SURFACE_CHANNEL) as (keyof typeof SURFACE_CHANNEL)[];

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
    for (const screen of ["menu", "setup", "profile", "replay", "leaderboards", "playing"])
      expect(screenSurface(screen), screen).toBeUndefined();
    const engineering: readonly ScreenAction[] = [
      { type: "setup.start", race: true },
      { type: "setup.selectBoss", id: "warden" },
      { type: "career.control", command: "race" },
      { type: "replay.editor.toggle" },
      { type: "replay.challenge.start", id: "boss-memory-save" },
      { type: "profile.downloadGhostArchive", id: "c", paired: true },
    ];
    for (const action of engineering) {
      expect(screenActionSurface(action), JSON.stringify(action)).toBeDefined();
      expect(screenActionAvailable(RELEASE, action), JSON.stringify(action)).toBe(false);
      expect(screenActionAvailable(ENGINEERING, action), JSON.stringify(action)).toBe(true);
    }
    // Player features that must stay visible in release.
    const player: readonly ScreenAction[] = [
      { type: "setup.start" },
      { type: "setup.selectMode", id: "endless" },
      { type: "navigate", to: "profile", tab: "vault" },
      { type: "career.control", command: "watch" },
      { type: "career.control", command: "chase" },
      { type: "career.control", command: "challenge" },
      { type: "career.control", command: "download" },
      { type: "replay.practice" },
      { type: "replay.challenge.open" },
      { type: "replay.challenge.start", id: "challenge-1" },
      { type: "replay.runDna.toggle" },
      { type: "profile.watchGhostCapsule", id: "c" },
      { type: "profile.downloadGhostArchive", id: "c" },
      { type: "profile.restoreGhostArchive", id: "j", revision: 1 },
      { type: "profile.repairGhostCapsule", id: "c" },
      { type: "profile.publishReplay", id: "r" },
      { type: "leaderboards.watchReplay", id: "r" },
      { type: "chase.control", command: "toggle" },
      { type: "tutorial.action", command: "open-practice" },
    ];
    for (const action of player) expect(screenActionAvailable(RELEASE, action), JSON.stringify(action)).toBe(true);
  });

  it("makes engineering actions inert in release regardless of the dispatching path", () => {
    const routed = vi.fn<(action: ScreenAction) => void>();
    const release = gateScreenActions(RELEASE, routed),
      engineering = gateScreenActions(ENGINEERING, routed);
    release({ type: "replay.editor.toggle" });
    release({ type: "setup.start", race: true });
    expect(routed).not.toHaveBeenCalled();
    release({ type: "setup.start" });
    expect(routed).toHaveBeenCalledExactlyOnceWith({ type: "setup.start" });
    engineering({ type: "replay.editor.toggle" });
    expect(routed).toHaveBeenLastCalledWith({ type: "replay.editor.toggle" });
  });
});

describe("engineering query gate", () => {
  const search = "?test=1&stemcue=x&watchagent=1&replay-hub=1";
  it("yields no parameters in release", () => {
    const query = createEngineeringQuery(RELEASE, search);
    expect(query.search).toBe("");
    for (const name of ["test", "stemcue", "watchagent", "replay-hub", "stems", "bossdebug"])
      expect(query.get(name), name).toBeNull();
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
      ["campaign", "release"],
      ["endless", "release"],
      ["gauntlet", "release"],
      ["playground", "release"],
      ["tutorial", "release"],
      ["bossonly", "engineering"],
      ["sandbox", "engineering"],
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
  it("lets a release build enter every catalogued screen, since none is engineering-only", () => {
    const release = new AppStateController(RELEASE);
    expect(release.transition("setup")).toBe("setup");
    for (const screen of APP_SCREENS) expect(release.canEnter(screen), screen).toBe(true);
  });
});
