import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findStation,
  findWork,
  musicCatalogSemanticProjection,
  parseMusicCatalog,
  selectVersion,
  stationWorks,
  type MusicRights,
} from "../../src/audio/music/catalog";

const authoredCatalog = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../public/audio/catalog.json"), "utf8"),
) as Record<string, unknown>;
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
    expect(selectVersion(source, "boss", ["final-phase", "adaptive-game"])?.versionId).toBe("adaptive-game");
  });

  it("honours the station's preferred version order when available", () => {
    const beserker = findWork(catalog, "beserker");
    if (!beserker) throw new Error("beserker work is required");
    expect(selectVersion(beserker, "gameplay", ["adaptive-game"])?.versionId).toBe("adaptive-game");
  });

  it("THE ARCHIVE yields nothing for gameplay because its versions are linear", () => {
    const archive = findStation(catalog, "archive");
    if (!archive) throw new Error("archive station is required");
    expect(archive.filters.adaptiveRequiredDuringGameplay).toBe(false);
    // canonical-ost versions are all unavailable + linear, so no gameplay-safe pick
    expect(stationWorks(catalog, archive, "gameplay")).toHaveLength(0);
  });

  it("routes the Void biome and its boss to distinct works", () => {
    expect(findWork(catalog, "looking-out")).not.toBeNull();
    const boss = findWork(catalog, "reflection-of-the-bladeless");
    if (!boss) throw new Error("reflection-of-the-bladeless work is required");
    // the Void boss cue must be legal during a boss fight
    expect(selectVersion(boss, "boss", ["adaptive-game"])?.versionId).toBe("adaptive-game");
  });

  it("CUTLINE draws the kinetic combat works for gameplay", () => {
    const cutline = findStation(catalog, "cutline");
    if (!cutline) throw new Error("cutline station is required");
    const works = stationWorks(catalog, cutline, "gameplay").map((w) => w.id);
    expect(works).toContain("beserker");
  });

  it("mirrors the canonical conservative rights contract for all eleven works", () => {
    expect(catalog.works).toHaveLength(EXPECTED_WORK_IDS.length);
    for (const work of catalog.works) {
      expect(work.rights, work.id).toEqual(expectedRights(work.id));
    }
  });

  it("normalizes the legacy catalog format without changing semantic content or cue IDs", () => {
    const legacy = parseMusicCatalog({ ...authoredCatalog, format: "tear-signal-catalog" });
    expect(legacy).toEqual(catalog);
    expect(musicCatalogSemanticProjection(legacy)).toEqual(musicCatalogSemanticProjection(catalog));
    expect(legacy.works.flatMap((work) => Object.values(work.versions).map((version) => version.cue)))
      .toEqual(catalog.works.flatMap((work) => Object.values(work.versions).map((version) => version.cue)));
  });
});
