import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findStation,
  findWork,
  selectVersion,
  stationWorks,
  type SignalCatalog,
} from "../../src/audio/signal/catalog";

const catalog = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../public/audio/catalog.json"), "utf8"),
) as SignalCatalog;

describe("THE SIGNAL catalog", () => {
  it("loads every source work with a playable adaptive cue", () => {
    expect(catalog.format).toBe("tear-signal-catalog");
    expect(catalog.works.length).toBeGreaterThanOrEqual(10);
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

  it("gives every work shippable rights metadata", () => {
    for (const work of catalog.works) {
      expect(work.rights.gameUse, work.id).toBe(true);
      expect(work.rights.streamSafe, work.id).toBe(true);
    }
  });
});
