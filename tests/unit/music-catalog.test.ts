import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findWork,
  musicCatalogSemanticProjection,
  parseMusicCatalog,
  selectVersion,
  type MusicRights,
} from "../../src/audio/music/catalog";

const authoredCatalog = (
  JSON.parse(readFileSync(resolve(import.meta.dirname, "../../public/audio/music.json"), "utf8")) as {
    catalog: unknown;
  }
).catalog as Record<string, unknown>;
const catalog = parseMusicCatalog(authoredCatalog);

const EXPECTED_WORK_IDS = [
  "fillet",
  "shopkeeper",
  "the-source",
  "beserker",
  "slicing-life-1",
  "slicing-life-2",
  "looking-out",
  "reflection-of-the-bladeless",
  "bladeless",
  "steady",
  "troubleshooting",
  "once-at-a-time",
  "nocturnal-urgency",
  "spring",
] as const;

function expectedRights(workId: string): MusicRights {
  return {
    gameUse: true,
    streamSafe: false,
    vodSafe: false,
    albumRelease: false,
    commercialDistribution: false,
    territories: [],
    claims: {
      gameUse: {
        status: "asserted",
        basis: "owner-assertion",
        evidenceRef: `docs/audio/RIGHTS_REGISTER.md#${workId}-game-use`,
      },
      streamSafe: {
        status: "unknown",
        reason: "no-clearance-record",
      },
      vodSafe: {
        status: "unknown",
        reason: "no-clearance-record",
      },
      albumRelease: {
        status: "blocked",
        reason: "program-hold",
      },
      commercialDistribution: {
        status: "blocked",
        reason: "program-hold",
      },
    },
  };
}

describe("Music catalog", () => {
  it("loads every source work with a playable adaptive cue", () => {
    expect(catalog.format).toBe("tear-music-catalog");
    expect(catalog.works.map((work) => work.id)).toEqual([...EXPECTED_WORK_IDS]);
    for (const work of catalog.works) {
      const adaptive = work.versions["adaptive-game"];
      expect(adaptive?.available, `${work.id} adaptive-game`).toBe(true);
      expect(adaptive?.cue).toMatch(/^audio\/cues\//);
    }
  });

  it("never hands a linear OST version to gameplay or boss", () => {
    for (const work of catalog.works) {
      for (const context of ["gameplay", "boss"] as const) {
        const picked = selectVersion(work, context);
        if (picked) expect(picked.version.adaptive, `${work.id}/${context}`).toBe(true);
      }
    }
  });

  it("skips versions that are not yet produced", () => {
    const source = findWork(catalog, "the-source");
    if (!source) throw new Error("the-source work is required");
    // final-phase is planned but unavailable, so boss must fall back to adaptive-game
    expect(source.versions["final-phase"]?.available).toBe(false);
    expect(selectVersion(source, "boss")?.versionId).toBe("adaptive-game");
  });

  it("routes the Void biome and its boss to distinct works", () => {
    expect(findWork(catalog, "looking-out")).not.toBeNull();
    const boss = findWork(catalog, "reflection-of-the-bladeless");
    if (!boss) throw new Error("reflection-of-the-bladeless work is required");
    // the Void boss cue must be legal during a boss fight
    expect(selectVersion(boss, "boss")?.versionId).toBe("adaptive-game");
  });

  it("mirrors the canonical conservative rights contract for every work", () => {
    expect(catalog.works).toHaveLength(EXPECTED_WORK_IDS.length);
    for (const work of catalog.works) {
      expect(work.rights, work.id).toEqual(expectedRights(work.id));
    }
  });

  it("normalizes the legacy catalog format without changing semantic content or cue IDs", () => {
    const legacy = parseMusicCatalog({ ...authoredCatalog, format: "tear-signal-catalog" });
    expect(legacy).toEqual(catalog);
    expect(musicCatalogSemanticProjection(legacy)).toEqual(musicCatalogSemanticProjection(catalog));
    expect(legacy.works.flatMap((work) => Object.values(work.versions).map((version) => version.cue))).toEqual(
      catalog.works.flatMap((work) => Object.values(work.versions).map((version) => version.cue)),
    );
  });
});
