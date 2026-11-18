import { describe, expect, it, vi } from "vitest";
import * as browserReference from "../../src/app/replay/browser-live-ghost-reference";
import { createLiveGhostChase } from "../../src/app/replay/ghost-chase-composition";
import type { GameRun, GamePlayer } from "../../src/gameplay/runtime/game-runtime-state";
import { readGhostRunAssistance } from "../../src/gameplay/run/ghost-assistance";
import {
  ghostReferenceArena,
  type GhostLiveReference,
  type GhostReferenceFrame,
} from "../../src/ghost/live-ghost-reference-data";

const ui = { font: () => "", t: { type: { micro: 12 }, color: { cinema: "", cinemaInk: "", accent: "" } } };

function reference(arena: string): GhostLiveReference {
  const assistance = readGhostRunAssistance({
    format: "tear-ghost-chase",
    version: 1,
    sourceId: "source",
    sourceManifestHash: "a".repeat(16),
    sourceRoot: "b".repeat(16),
    actor: "unknown",
    coachEnabled: true,
    ghostVisible: true,
    competitiveEligible: false,
  });
  if (!assistance) throw new Error("fixture disposition");
  const frame: GhostReferenceFrame = {
    tick: 0,
    time: 0,
    stage: 0,
    wave: 1,
    score: 20,
    hp: 90,
    maxHp: 100,
    waveTime: 0,
    arena,
    blocked: false,
    player: { x: 30, y: 40, hw: 10, hh: 20, facing: 1 },
    blade: { x: 30, y: 40, tipX: 55, tipY: 45, state: "held" },
  };
  return {
    version: 1,
    assistance,
    mode: "endless",
    difficulty: "normal",
    weapon: "sword",
    seed: "source-seed",
    build: { version: "1", revision: "r", target: "test", rulesetVersion: "v", contentHash: "c", configHash: "config" },
    frames: [frame, { ...frame, tick: 120, time: 1, waveTime: 1 }],
    splits: [],
  };
}

function harness(arena: (platforms: readonly Readonly<{ x: number; y: number; w: number; h: number }>[]) => string) {
  const ledge = { x: 200, y: 600, w: 300, h: 20 },
    platforms = [{ x: 0, y: 800, w: 1600, h: 100 }, ledge];
  const read = vi.fn(() => platforms);
  const run = {
    runSeed: 71,
    mode: "endless",
    diff: "normal",
    weaponId: "sword",
    runTime: 0.5,
    waveTime: 0.5,
    wave: 1,
    score: 40,
  } as unknown as GameRun;
  const player = { hp: 80, maxHp: 120 } as unknown as GamePlayer;
  const source = reference(arena(platforms));
  const port = vi
    .spyOn(browserReference, "createBrowserLiveGhostReference")
    .mockReturnValue({ prepare: () => Promise.resolve(source), current: () => Promise.resolve(true) });
  try {
    const chase = createLiveGhostChase({
      factory: undefined,
      ui,
      run: () => run,
      player: () => player,
      stage: () => 0,
      platforms: read,
      blocked: () => false,
      prepareStart: () => {
        chase.takeSetupLaunch();
      },
      start: () => {
        chase.installed(run);
      },
    });
    return { chase, ledge, read };
  } finally {
    port.mockRestore();
  }
}

describe("live Chase arena identity", () => {
  it("never hashes the platforms while no reference is selected", () => {
    const { chase, read } = harness(ghostReferenceArena);
    for (let tick = 0; tick < 240; tick += 1) chase.observe();
    chase.snapshot();
    expect(read).not.toHaveBeenCalled();
  });

  it("compares the current platform hash, exactly as the eager value did, once a reference is running", async () => {
    const { chase, ledge, read } = harness(ghostReferenceArena);
    await chase.choose("source");
    chase.observe();
    expect(read).toHaveBeenCalled();
    expect(chase.snapshot()).toMatchObject({ active: true });
    expect("pose" in chase.snapshot()).toBe(true);
    // Geometry changed in place: the next observation derives a new arena and refuses the projection.
    ledge.x = 260;
    chase.observe();
    expect("pose" in chase.snapshot()).toBe(false);
    expect(chase.snapshot().message).toContain("Different encounter");
  });

  it("refuses a reference recorded on another arena", async () => {
    const { chase } = harness(() => "other-arena");
    await chase.choose("source");
    chase.observe();
    expect("pose" in chase.snapshot()).toBe(false);
  });
});
