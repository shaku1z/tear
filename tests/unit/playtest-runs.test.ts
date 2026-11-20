import { describe, expect, it } from "vitest";

import { mergeSlices } from "../../src/playtest/boss-report";
import { playRun, RUN_MODES, type RunRequest } from "../../src/playtest/run-play";
import { admitRunReport, formatRunReport, playRunReport, runRequests } from "../../src/playtest/run-report";

const run = (over: Partial<RunRequest> = {}): RunRequest => ({
  mode: "endless",
  difficulty: "easy",
  weapon: "sword",
  seed: "1",
  player: "scripted",
  maxTicks: 120 * 1800,
  ...over,
});

const report = {
  modes: ["endless", "gauntlet"],
  difficulties: ["easy"] as const,
  weapons: ["sword", "hammer"] as const,
  seeds: ["1"],
  players: ["scripted"] as const,
  maxTicks: 700,
};

describe("a run played headless from wave 1", () => {
  it("plays an Endless run to the player's defeat and measures every wave from the running game", () => {
    const result = playRun(run());
    expect(result.end).toBe("player defeated");
    // Every wave from the first to the one the run ended in, in order, each cleared but the last.
    expect(result.waves.map((wave) => wave.wave)).toEqual(
      Array.from({ length: result.endWave }, (_, index) => index + 1),
    );
    expect(result.waves.map((wave) => wave.cleared)).toEqual(
      result.waves.map((_, index) => index < result.endWave - 1),
    );
    expect(result.waves.at(-1)?.healthAtEnd).toBe(0);
    expect(result.waves[0]?.healthAtStart).toBe(100);
    for (const wave of result.waves) {
      // Health lost is counted whatever was won back, so it is at least the drop over the wave.
      expect(wave.damageTaken).toBeGreaterThanOrEqual(wave.healthAtStart - wave.healthAtEnd - 1e-6);
      expect(wave.ticks).toBeGreaterThan(0);
      if (wave.cleared) expect(wave.kills).toBeGreaterThan(0);
    }
    // The waves' own times leave out the pause and the draft between waves, so together they are under the run's.
    expect(result.waves.reduce((total, wave) => total + wave.ticks, 0)).toBeLessThanOrEqual(result.ticks);
    // The player drafted after the waves it cleared, as a player's run does.
    expect(Object.values(result.upgrades).reduce((total, count) => total + count, 0)).toBeGreaterThan(0);
  }, 60_000);

  it("skips the Adventure's opening chapter and plays on", () => {
    const result = playRun(run({ mode: "campaign", maxTicks: 1500 }));
    expect(result.end).toBe("time limit");
    expect(result.waves[0]).toMatchObject({ wave: 1, cleared: true });
    expect(result.endWave).toBeGreaterThan(1);
  }, 60_000);

  it("plays the same run from the same seed, and stops at the time limit with its wave not cleared", () => {
    const short = run({ maxTicks: 900 });
    const first = playRun(short);
    expect(playRun(short)).toEqual(first);
    expect(first).toMatchObject({ end: "time limit", ticks: 900 });
    expect(first.waves.at(-1)?.cleared).toBe(false);
  }, 60_000);
});

describe("the run report", () => {
  it("plays every mode the game runs as numbered waves, and asks for runs in a fixed order", () => {
    expect(RUN_MODES).toEqual(["campaign", "endless", "gauntlet"]);
    expect(runRequests(report).map((request) => `${request.mode}/${request.weapon}`)).toEqual([
      "endless/sword",
      "endless/hammer",
      "gauntlet/sword",
      "gauntlet/hammer",
    ]);
  });

  it("refuses a mistyped mode, weapon, difficulty or player by name before any run is played", () => {
    expect(() => admitRunReport({ ...report, modes: ["bossonly"] })).toThrow(
      'a run is played in campaign, endless, gauntlet, not "bossonly"',
    );
    expect(() => admitRunReport({ ...report, players: ["nobody" as never] })).toThrow('no player "nobody"');
    expect(() => admitRunReport({ ...report, weapons: ["spoon" as never] })).toThrow(TypeError);
    expect(() => admitRunReport({ ...report, difficulties: ["gentle" as never] })).toThrow(TypeError);
  });

  it("plays the same runs whole and in shares, and prints a row per weapon and per wave", () => {
    const whole = playRunReport(report);
    expect(mergeSlices([0, 1, 2].map((index) => playRunReport(report, { index, of: 3 })))).toEqual(whole);
    const text = formatRunReport(whole);
    expect(text).toContain("endless  difficulty easy  player scripted  1 seed");
    expect(text).toContain("gauntlet  difficulty easy  player scripted  1 seed");
    expect(text.split("\n").filter((line) => /^(sword|hammer) +0\/1/u.test(line))).toHaveLength(4);
    expect(text.split("\n").filter((line) => /^1 +2\/2/u.test(line))).toHaveLength(2);
    expect(text).toContain("4 of 4 runs were stopped by the time limit");
    expect(text).toContain("not how far a person gets");
  }, 60_000);
});
