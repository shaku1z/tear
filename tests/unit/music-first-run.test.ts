import { describe, expect, it } from "vitest";
import { parseMusicCatalog, type MusicCatalog } from "../../src/audio/music/catalog";
import { resolveMusicRoute } from "../../src/audio/music/music-routing-resolver";
import type { MusicRoutingContext } from "../../src/audio/music/music-routing-types";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import { admittedMusicProgress } from "../../src/audio/music/run-progress";
import { snapshotProgress, type ProgressSource } from "../../src/domain/progress-facts";
import { musicProgressRouting } from "../../src/audio/stems/biome-stem-backend";

const VERDANT = "The Verdant Sanctum";

/** Saved progress that reached these biomes and defeated these bosses (given as `kill<Name>` stat suffixes). */
const saved = (biomes: readonly string[], bosses: readonly string[] = []): ProgressSource => ({
  stats: {
    _biomes: Object.fromEntries(biomes.map((name) => [name, 1])),
    ...Object.fromEntries(bosses.map((name) => [`kill${name}`, 1])),
  },
  ach: {},
});

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
  it("snapshots the biomes reached and bosses defeated, and later play does not change it", () => {
    const stats: Record<string, unknown> = { _biomes: { "The Grounds": 1 }, killRootbound: 1, kills: 90 };
    const snapshot = snapshotProgress({ stats, ach: { first_boss: 123 } });
    stats.killEcho = 1;
    (stats._biomes as Record<string, number>)[VERDANT] = 1;
    expect(snapshot).toEqual({
      stats: { _biomes: { "The Grounds": 1 }, killRootbound: 1, kills: 90 },
      ach: { first_boss: 1 },
    });
  });

  it("makes a biome no earlier run reached a first run", () => {
    const fresh = saved(["The Grounds"]);
    expect(musicProgressRouting(fresh, catalog, VERDANT).firstRun).toBe(true);
    expect(musicProgressRouting(fresh, catalog, "The Grounds").firstRun).toBe(false);
  });

  it("unlocks Spring by defeating Rootbound", () => {
    const before = musicProgressRouting(saved([VERDANT]), catalog, VERDANT);
    const after = musicProgressRouting(saved([VERDANT], ["Rootbound"]), catalog, VERDANT);
    expect(before.isUnlocked("spring")).toBe(false);
    expect(after.isUnlocked("spring")).toBe(true);
    expect(after.isUnlocked("once-at-a-time")).toBe(true);
  });

  it("reads any condition of the shared language", () => {
    const unlockCatalog = parseMusicCatalog({
      format: "tear-music-catalog",
      version: 1,
      stations: [],
      works: [
        { id: "grinder", unlock: { type: "stat-threshold", stat: "kills", goal: 10 } },
        { id: "both", unlock: { type: "all", of: [{ type: "default" }, { type: "achievement", id: "first_boss" }] } },
      ],
    });
    const routing = (stats: Record<string, unknown>, ach: Record<string, unknown> = {}) =>
      musicProgressRouting({ stats, ach }, unlockCatalog, VERDANT);
    expect(routing({ kills: 9 }).isUnlocked("grinder")).toBe(false);
    expect(routing({ kills: 10 }).isUnlocked("grinder")).toBe(true);
    expect(routing({}).isUnlocked("both")).toBe(false);
    expect(routing({}, { first_boss: 1 }).isUnlocked("both")).toBe(true);
    expect(routing({ kills: 99 }).isUnlocked("not-a-work")).toBe(false);
  });

  it("refuses a catalog whose work has an unlock this build cannot read", () => {
    const withUnlock = (unlock?: unknown) => ({
      format: "tear-music-catalog",
      version: 1,
      stations: [],
      works: [{ id: "w", ...(unlock === undefined ? {} : { unlock }) }],
    });
    for (const unlock of [{ type: "moon-phase" }, { type: "boss-defeat" }, undefined])
      expect(() => parseMusicCatalog(withUnlock(unlock)), JSON.stringify(unlock)).toThrow(/invalid music work unlock/u);
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
  const progress = saved(["The Grounds"]);
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
