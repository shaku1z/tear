import { describe, expect, it } from "vitest";
import { resolveMusicRoute } from "../../src/audio/music/music-routing-resolver";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import { routeSeedFromRunSeed } from "../../src/audio/stems/biome-stem-backend";

const routing = validateMusicRoutingManifest({
  format: "tear-music-routing",
  version: 1,
  defaultWorkId: "fillet",
  rules: [
    {
      id: "verdant-gameplay",
      match: { biome: "the-verdant-sanctum", scene: "gameplay" },
      selection: {
        type: "weighted-pool",
        entries: [
          { workId: "once-at-a-time", weight: 1 },
          { workId: "spring", weight: 1 },
        ],
      },
    },
  ],
});

const songFor = (runSeed: string): string =>
  resolveMusicRoute(
    routing,
    { biomeId: "The Verdant Sanctum", scene: "gameplay", bossId: null },
    routeSeedFromRunSeed(runSeed),
  );

describe("a routing pool picks one song per run from the run seed", () => {
  it("gives the same song for the same run seed", () => {
    for (const runSeed of ["daily-2026-11-16", "race-42", "0"]) expect(songFor(runSeed)).toBe(songFor(runSeed));
  });

  it("plays both songs across runs, roughly half each", () => {
    const picks = Array.from({ length: 400 }, (_, index) => songFor(`run-${String(index)}`));
    const spring = picks.filter((song) => song === "spring").length;
    expect(new Set(picks)).toEqual(new Set(["once-at-a-time", "spring"]));
    expect(spring).toBeGreaterThan(140);
    expect(spring).toBeLessThan(260);
  });

  it("turns a run seed into a stable unsigned 32-bit number", () => {
    expect(routeSeedFromRunSeed("")).toBe(0x811c9dc5);
    expect(routeSeedFromRunSeed("a")).toBe(0xe40c292c);
  });
});
