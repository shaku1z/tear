import { describe, expect, it } from "vitest";
import { FALLBACK_MUSIC_ROUTING } from "../../src/audio/music/music-routing-loader";
import {
  ENGINEERING_ONLY_BIOME_MUSIC_FALLBACKS,
  resolveMusicRoute,
} from "../../src/audio/music/music-routing-resolver";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";

describe("data-driven music routing", () => {
  it("reproduces the accepted canonical map for each campaign biome", () => {
    const expected: Readonly<Record<string, string>> = {
      "The Grounds": "slicing-life-1",
      "The Undercroft": "slicing-life-2",
      "The Crimson Fields": "beserker",
      "The Voidspire": "looking-out",
      "The Tear": "the-source",
    };
    for (const [biomeId, workId] of Object.entries(expected)) {
      expect(resolveMusicRoute(FALLBACK_MUSIC_ROUTING, { biomeId, scene: "gameplay", bossId: null })).toBe(workId);
    }
  });

  it("routes Echo to Reflection and otherwise lets a boss inherit its biome cue", () => {
    expect(resolveMusicRoute(FALLBACK_MUSIC_ROUTING, {
      biomeId: "The Voidspire", scene: "boss", bossId: "echo",
    })).toBe("reflection-of-the-bladeless");
    expect(resolveMusicRoute(FALLBACK_MUSIC_ROUTING, {
      biomeId: "The Crimson Fields", scene: "boss", bossId: "aldric",
    })).toBe("beserker");
  });

  it("keeps terminal states on the active biome's canonical bed when no moment rule exists", () => {
    expect(resolveMusicRoute(FALLBACK_MUSIC_ROUTING, {
      biomeId: "The Tear", scene: "victory", bossId: "source",
    })).toBe("the-source");
  });

  it("uses the default only when no route can legally match", () => {
    expect(resolveMusicRoute(FALLBACK_MUSIC_ROUTING, {
      biomeId: "Unknown", scene: "gameplay", bossId: null,
    })).toBe("fillet");
  });

  it("keeps Verdant and Pale playable on engineering fallbacks without publishing final routes", () => {
    expect(ENGINEERING_ONLY_BIOME_MUSIC_FALLBACKS).toEqual({
      "the-verdant-sanctum": "fillet",
      "the-pale-traverse": "fillet",
    });
    expect(resolveMusicRoute(FALLBACK_MUSIC_ROUTING, {
      biomeId: "The Verdant Sanctum", scene: "gameplay", bossId: null,
    })).toBe("fillet");
    expect(FALLBACK_MUSIC_ROUTING.rules.some((rule) => rule.match.biome === "the-verdant-sanctum")).toBe(false);
    expect(FALLBACK_MUSIC_ROUTING.rules.some((rule) => rule.match.bossId === "rootbound")).toBe(false);
    expect(resolveMusicRoute(FALLBACK_MUSIC_ROUTING, {
      biomeId: "Pale Traverse", scene: "gameplay", bossId: null,
    })).toBe("fillet");
    expect(resolveMusicRoute(FALLBACK_MUSIC_ROUTING, {
      biomeId: "The Pale Traverse", scene: "boss", bossId: "white-hart",
    })).toBe("fillet");
    expect(FALLBACK_MUSIC_ROUTING.rules.some((rule) => rule.match.biome === "the-pale-traverse")).toBe(false);
    expect(FALLBACK_MUSIC_ROUTING.rules.some((rule) => rule.match.bossId === "white-hart")).toBe(false);
  });

  it("normalizes authored biome aliases on both sides of a route match", () => {
    expect(resolveMusicRoute({
      format: "tear-music-routing",
      version: 1,
      defaultWorkId: "fillet",
      rules: [{
        id: "friendly-alias",
        match: { scene: "gameplay", biome: "grounds" },
        selection: { type: "primary", workId: "slicing-life-1" },
      }],
    }, { biomeId: "The Grounds", scene: "gameplay", bossId: null })).toBe(
      "slicing-life-1",
    );
  });

  it("rejects malformed asset input before routing reaches the music backend", () => {
    expect(() => validateMusicRoutingManifest({
      format: "tear-music-routing",
      version: 1,
      defaultWorkId: "fillet",
      rules: [{ id: "bad", match: { scene: "unknown" }, selection: { type: "primary", workId: "fillet" } }],
    })).toThrow("unknown scene");
  });
});
