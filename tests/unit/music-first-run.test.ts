import { describe, expect, it } from "vitest";
import type { MusicCatalog } from "../../src/audio/music/catalog";
import { resolveMusicRoute } from "../../src/audio/music/music-routing-resolver";
import type { MusicRoutingContext } from "../../src/audio/music/music-routing-types";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import { admittedMusicProgress, musicRunProgress } from "../../src/audio/music/run-progress";
import { musicProgressRouting } from "../../src/audio/stems/biome-stem-backend";

const VERDANT = "The Verdant Sanctum";

// The routing tear-music publishes for the Verdant Sanctum (shaku1z/tear-music#19).
const routing = (rejoin: boolean) =>
  validateMusicRoutingManifest({
    format: "tear-music-routing",
    version: 1,
    defaultWorkId: "fillet",
    rules: [
      {
        id: "verdant-first-run",
        match: { biome: "the-verdant-sanctum", scene: "gameplay", firstRun: true },
        selection: { type: "primary", workId: "spring" },
      },
      {
        id: "verdant-gameplay",
        match: { biome: "the-verdant-sanctum", scene: "gameplay" },
        selection: rejoin
          ? {
              type: "weighted-pool",
              entries: [
                { workId: "once-at-a-time", weight: 1 },
                { workId: "spring", weight: 1, requiresUnlock: true },
              ],
            }
          : { type: "primary", workId: "once-at-a-time" },
      },
      {
        id: "rootbound-boss",
        match: { bossId: "rootbound", scene: "boss" },
        selection: { type: "primary", workId: "nocturnal-urgency" },
      },
    ],
  });

const catalog = {
  works: [
    { id: "spring", unlock: { type: "boss-defeat", bossId: "rootbound" } },
    { id: "once-at-a-time", unlock: { type: "biome-enter", biome: VERDANT } },
  ],
} as unknown as MusicCatalog;

const verdant = (extra: Partial<MusicRoutingContext> = {}): MusicRoutingContext => ({
  biomeId: VERDANT,
  scene: "gameplay",
  bossId: null,
  ...extra,
});

describe("a first-run route plays only on the player's first run that reaches its biome", () => {
  it("plays Spring on the first Verdant run and Once At A Time on every other", () => {
    expect(resolveMusicRoute(routing(false), verdant({ firstRun: true }))).toBe("spring");
    expect(resolveMusicRoute(routing(false), verdant({ firstRun: false }))).toBe("once-at-a-time");
    expect(resolveMusicRoute(routing(false), verdant())).toBe("once-at-a-time");
  });

  it("leaves the boss its own song on the first run", () => {
    expect(resolveMusicRoute(routing(false), verdant({ scene: "boss", bossId: "rootbound", firstRun: true }))).toBe(
      "nocturnal-urgency",
    );
  });

  it("keeps an unlock-gated pool entry out until the work is unlocked", () => {
    for (let seed = 1; seed < 40; seed += 1)
      expect(resolveMusicRoute(routing(true), verdant(), seed)).toBe("once-at-a-time");
    const unlocked = new Set(
      Array.from({ length: 40 }, (_, seed) =>
        resolveMusicRoute(routing(true), verdant({ isUnlocked: () => true }), seed + 1),
      ),
    );
    expect(unlocked).toEqual(new Set(["once-at-a-time", "spring"]));
  });

  it("rejects a match or pool entry flag that is not a boolean", () => {
    const rule = (match: unknown, entry: unknown) => ({
      format: "tear-music-routing",
      version: 1,
      defaultWorkId: "fillet",
      rules: [{ id: "x", match, selection: { type: "weighted-pool", entries: [entry] } }],
    });
    expect(() => validateMusicRoutingManifest(rule({ firstRun: "yes" }, { workId: "a", weight: 1 }))).toThrow(
      /firstRun/u,
    );
    expect(() => validateMusicRoutingManifest(rule({}, { workId: "a", weight: 1, requiresUnlock: 1 }))).toThrow(
      /requiresUnlock/u,
    );
  });
});

describe("saved progress at run start decides first runs and unlocks", () => {
  it("reads biomes reached and bosses defeated from profile stats", () => {
    const progress = musicRunProgress(
      { _biomes: { "The Grounds": 1, [VERDANT]: 1 }, killRootbound: 1, killEcho: 0, kills: 90, kill_bomber: 4 },
      (id) => id === "rootbound" || id === "echo",
    );
    expect(progress).toEqual({ biomesReached: ["The Grounds", VERDANT], bossesDefeated: ["rootbound"] });
  });

  it("makes a biome no earlier run reached a first run", () => {
    const fresh = { biomesReached: ["The Grounds"], bossesDefeated: [] };
    expect(musicProgressRouting(fresh, catalog, VERDANT).firstRun).toBe(true);
    expect(musicProgressRouting(fresh, catalog, "The Grounds").firstRun).toBe(false);
  });

  it("unlocks Spring by defeating Rootbound", () => {
    const before = musicProgressRouting({ biomesReached: [VERDANT], bossesDefeated: [] }, catalog, VERDANT);
    const after = musicProgressRouting({ biomesReached: [VERDANT], bossesDefeated: ["rootbound"] }, catalog, VERDANT);
    expect(before.isUnlocked("spring")).toBe(false);
    expect(after.isUnlocked("spring")).toBe(true);
    expect(after.isUnlocked("once-at-a-time")).toBe(true);
  });

  it("gives no first run and no unlocks without progress (seed races, practice, menus)", () => {
    const none = musicProgressRouting(null, catalog, VERDANT);
    expect(none.firstRun).toBe(false);
    expect(none.isUnlocked("spring")).toBe(false);
  });
});

describe("a route this build cannot read never wins", () => {
  it("drops a rule naming an unknown condition, so the place keeps its ordinary song", () => {
    const manifest = validateMusicRoutingManifest({
      format: "tear-music-routing",
      version: 1,
      defaultWorkId: "fillet",
      rules: [
        {
          id: "verdant-someday",
          match: { biome: "the-verdant-sanctum", scene: "gameplay", nightOnly: true },
          selection: { type: "primary", workId: "spring" },
        },
        {
          id: "verdant-gameplay",
          match: { biome: "the-verdant-sanctum", scene: "gameplay" },
          selection: { type: "primary", workId: "once-at-a-time" },
        },
      ],
    });
    expect(manifest.rules.map((rule) => rule.id)).toEqual(["verdant-gameplay"]);
    expect(resolveMusicRoute(manifest, verdant({ firstRun: true }))).toBe("once-at-a-time");
  });
});

describe("saved progress reaches the music only in runs that record it", () => {
  const progress = { biomesReached: ["The Grounds"], bossesDefeated: [] };
  const run = { tracksProgress: true, seedRace: false, practice: false };
  it("passes progress in an ordinary run", () => {
    expect(admittedMusicProgress(progress, run)).toBe(progress);
  });
  it("withholds it in seed races, practice and untracked runs, so everyone hears Once At A Time", () => {
    expect(admittedMusicProgress(progress, { ...run, seedRace: true })).toBeNull();
    expect(admittedMusicProgress(progress, { ...run, practice: true })).toBeNull();
    expect(admittedMusicProgress(progress, { ...run, tracksProgress: false })).toBeNull();
  });
});
