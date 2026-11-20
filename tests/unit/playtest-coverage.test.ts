import { describe, expect, it } from "vitest";

import { AFFIXES } from "../../src/gameplay/affixes";
import { PUBLISHED_ENEMY_IDENTITY_IDS } from "../../src/gameplay/run/content-director";
import { stageIdsAvailableOn } from "../../src/gameplay/stages";
import { CANONICAL_UPGRADE_IDS } from "../../src/gameplay/upgrades";
import {
  appearedIn,
  COVERAGE_REPORTS,
  COVERAGE_SETS,
  coverageCatalogue,
  coverageRows,
  formatCoverage,
  type CoverageNames,
} from "../../src/playtest/coverage";
import { playEnemy } from "../../src/playtest/enemy-play";
import { playRun } from "../../src/playtest/run-play";

const names = (over: Partial<CoverageNames>): CoverageNames => ({
  enemy: [],
  "enemy affix": [],
  boss: [],
  "boss phase": [],
  upgrade: [],
  "stage object": [],
  ...over,
});

describe("the coverage list", () => {
  it("reads what the game defines from the game's own lists", () => {
    const catalogue = coverageCatalogue();
    expect(catalogue.enemy).toBe(PUBLISHED_ENEMY_IDENTITY_IDS);
    expect(catalogue["enemy affix"]).toEqual(AFFIXES.map((affix) => affix.id));
    expect(catalogue.upgrade).toBe(CANONICAL_UPGRADE_IDS);
    expect(catalogue.boss.length).toBeGreaterThan(0);
    // Every boss has its phases, named as a run and a fight name them.
    for (const boss of catalogue.boss) expect(catalogue["boss phase"]).toContain(`${boss} phase 1`);
    expect(catalogue["stage object"]).toEqual([]);
  });

  it("lists what is defined and never appeared, and what appeared under a name the game does not list", () => {
    const catalogue = names({ enemy: ["charger", "wraith"], upgrade: ["fleet"] });
    const rows = coverageRows(names({ enemy: ["charger", "ghost"], "stage object": ["root snare"] }), catalogue);
    expect(rows.find((row) => row.kind === "enemy")).toEqual({
      kind: "enemy",
      defined: 2,
      appeared: ["charger", "ghost"],
      never: ["wraith"],
      unlisted: ["ghost"],
    });
    expect(rows.find((row) => row.kind === "upgrade")?.never).toEqual(["fleet"]);
    // The game keeps no list of stage objects, so nothing there is missing or unlisted.
    expect(rows.find((row) => row.kind === "stage object")).toEqual({
      kind: "stage object",
      appeared: ["root snare"],
      never: [],
      unlisted: [],
    });
    const text = formatCoverage(rows);
    expect(text).toContain("enemy: 1 of 2 appeared\n  never appeared: wraith");
    expect(text).toContain("appeared but not in the game's list: ghost");
    expect(text).toContain("stage object: 1 appeared (root snare)");
    expect(text).toContain("2 listed things never appeared.");
  });

  it("says nothing is missing when everything the game lists appeared", () => {
    const catalogue = coverageCatalogue();
    const rows = coverageRows(catalogue, catalogue);
    expect(rows.every((row) => row.never.length === 0 && row.unlisted.length === 0)).toBe(true);
    expect(formatCoverage(rows)).toContain("Nothing the game lists is missing.");
  });

  it("plays every report, the waves report over every Adventure stage", () => {
    expect(COVERAGE_REPORTS).toEqual(["bosses", "waves", "runs", "enemies"]);
    expect(COVERAGE_SETS.waves[0]?.stage).toBe(stageIdsAvailableOn("adventure").join(","));
  });

  it("counts what played results brought into play: a run's enemies and offered upgrades, a meeting's enemy", () => {
    const run = playRun({
      mode: "endless",
      difficulty: "easy",
      weapon: "sword",
      seed: "1",
      player: "scripted",
      maxTicks: 120 * 1800,
    });
    expect(run.appeared.enemies.length).toBeGreaterThan(0);
    // The run cleared a wave and drafted, so its drafts offered more than it took.
    expect(run.appeared.offered.length).toBeGreaterThanOrEqual(Object.keys(run.upgrades).length);
    expect(run.appeared.offered.length).toBeGreaterThan(0);
    const meeting = playEnemy({
      enemy: "wraith",
      count: 1,
      difficulty: "normal",
      weapon: "sword",
      seed: "1",
      player: "still",
      maxTicks: 30,
    });
    const appeared = appearedIn({ runs: [run], enemies: [meeting] });
    expect(appeared.enemy).toEqual([...new Set([...run.appeared.enemies, "wraith"])].sort());
    expect(appeared.upgrade).toEqual(run.appeared.offered);
    const catalogue = coverageCatalogue();
    // Names a run records are the names the game's lists use.
    expect(coverageRows(appeared, catalogue).flatMap((row) => row.unlisted)).toEqual([]);
  }, 60_000);
});
