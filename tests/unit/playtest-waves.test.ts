import { describe, expect, it } from "vitest";

import { mergeSlices } from "../../src/playtest/boss-report";
import { attributeWaveHit, playWave, stageWaves, type WaveRequest } from "../../src/playtest/wave-play";
import { admitWaveReport, formatWaveReport, playWaveReport, waveRequests } from "../../src/playtest/wave-report";
import { createRootCounter, type RootObject } from "../../src/playtest/wave-roots";

const wave = (over: Partial<WaveRequest> = {}): WaveRequest => ({
  stage: "verdant-sanctum",
  wave: 32,
  difficulty: "normal",
  weapon: "sword",
  seed: "1",
  player: "cuts-objects",
  build: "drafted",
  maxTicks: 120 * 180,
  ...over,
});

const report = {
  stages: ["verdant-sanctum"],
  waves: [31, 32],
  difficulties: ["normal"] as const,
  weapons: ["sword"] as const,
  seeds: ["1", "2"],
  players: ["scripted"] as const,
  builds: ["drafted"] as const,
  maxTicks: 360,
};

describe("the root and snare count", () => {
  const snare = (
    id: string,
    snarePhase: string,
    state = "active",
    cleanupReason: string | null = null,
  ): RootObject => ({
    id,
    kind: "root-link",
    patternId: "root-snare",
    snarePhase,
    state,
    cleanupReason,
  });
  const root = (id: string, state = "active", cleanupReason: string | null = null): RootObject => ({
    id,
    kind: "root-link",
    state,
    cleanupReason,
  });

  it("counts a snare as caught when it holds, as cut when the player cuts a holding one, and the ticks held", () => {
    const counter = createRootCounter();
    const frames: RootObject[][] = [
      [snare("a", "warning"), snare("b", "warning"), snare("c", "warning")],
      [snare("a", "erupting"), snare("b", "warning", "destroyed"), snare("c", "erupting")],
      [snare("a", "holding"), snare("c", "holding")],
      [snare("a", "holding"), snare("c", "holding")],
      [snare("a", "holding", "destroyed"), snare("c", "holding", "expired", "natural-expiry")],
      [{ id: "wall", kind: "root-cage", state: "active" }],
    ];
    frames.forEach((objects, tick) => {
      counter.read(objects, [], tick);
    });
    // "b" was cut in its warning: a mark the player answered, not a catch and not a cut snare. "c" let go by itself.
    expect(counter.count()).toMatchObject({ snaresMarked: 3, snaresCaught: 2, snaresCut: 1, heldTicks: 2 });
  });

  it("counts ally roots grown and the ones the player cut, not the ones the game cleared", () => {
    const counter = createRootCounter();
    counter.read([root("r1"), root("r2"), root("r3")], [], 0);
    counter.read([root("r1", "destroyed"), root("r2", "destroyed", "stage-transition")], [], 1);
    expect(counter.count()).toMatchObject({ rootsGrown: 3, rootsCut: 1, snaresMarked: 0 });
  });

  it("follows each Rootbinder: its uproots, how long it lived and whether it died planted", () => {
    const counter = createRootCounter();
    const first = { rootPhase: "walk", dead: false };
    const second = { rootPhase: "walk" };
    const other = { kind: "charger" };
    counter.read([], [first, other], 10);
    first.rootPhase = "planted";
    counter.read([], [first, second, other], 20);
    first.rootPhase = "uprooted";
    counter.read([], [first, second], 30);
    counter.read([], [first, second], 31);
    first.rootPhase = "planted";
    second.rootPhase = "planted";
    counter.read([], [first, second], 40);
    first.dead = true;
    // The second is removed from the world without having been seen dead.
    counter.read([], [first], 50);
    expect(counter.count()).toMatchObject({
      uproots: 1,
      rootbinders: [
        { killTicks: 40, diedPlanted: true, uproots: 1 },
        { killTicks: 30, diedPlanted: true, uproots: 0 },
      ],
    });
  });
});

describe("what a hit in a wave is attributed to", () => {
  const player = { x: 100, y: 100, hw: 14, hh: 24 };
  const ranged = { kind: "ranged", x: 600, y: 100, hw: 17, hh: 22 };
  const charger = { kind: "charger", x: 130, y: 100, hw: 20, hh: 20, contactReach: 10 };

  it("is the owner of a shot on the player, else an enemy touching the player, else unmarked", () => {
    const shot = { x: 110, y: 96, r: 9, owner: ranged };
    expect(attributeWaveHit(player, [shot], [charger])).toBe("ranged shot");
    expect(attributeWaveHit(player, [{ ...shot, x: 400 }], [ranged, charger])).toBe("charger");
    expect(attributeWaveHit(player, [], [ranged])).toBe("unmarked");
    expect(attributeWaveHit(player, [{ x: 100, y: 100, r: 9 }], [])).toBe("unknown shot");
  });
});

describe("a wave played headless", () => {
  it("plays Verdant wave 32 to its end and measures it from the running game", () => {
    const result = playWave(wave());
    expect(result).toMatchObject({ end: "cleared", wave: 32, graceTicks: 360, upgrades: 31 });
    // The game's own clear time, from its wave log: the ticks played, less the tick the log is read on.
    expect(result.ticks - (result.clearTicks ?? 0)).toBeLessThanOrEqual(1);
    expect(result.spawned.map((enemy) => enemy.kind)).toContain("rootbinder");
    expect(result.kills).toBe(result.spawned.length);
    expect(result.elites).toBe(result.spawned.filter((enemy) => enemy.affixes.length > 0).length);
    const attributed = Object.values(result.hitsBy);
    expect(attributed.reduce((total, hits) => total + hits.damage, 0)).toBeCloseTo(result.damageTaken, 6);
    expect(attributed.reduce((total, hits) => total + hits.hits, 0)).toBe(result.hitsTaken);
    expect(result.roots.rootbinders).toHaveLength(1);
    expect(result.roots.rootbinders[0]?.killTicks).toBeGreaterThan(0);
    expect(result.roots.rootsGrown).toBeGreaterThanOrEqual(result.roots.rootsCut);
  }, 60_000);

  it("reports a defeat as a defeat, with where the player fell, though the game logs the wave", () => {
    const result = playWave(wave({ wave: 35, player: "still", build: "none" }));
    expect(result.end).toBe("player defeated");
    expect(result.clearTicks).toBeUndefined();
    expect(result.diedAt?.tick).toBe(result.ticks);
    expect(result.upgrades).toBe(0);
    expect(result.damageTaken).toBeGreaterThanOrEqual(100);
  }, 60_000);

  it("plays the same wave the same way from the same seed, and another way from another", () => {
    const short = wave({ maxTicks: 900 });
    expect(playWave(short)).toEqual(playWave(short));
    expect(playWave(wave({ maxTicks: 900, seed: "2" })).spawned).not.toEqual(playWave(short).spawned);
  }, 60_000);

  it("plays a wave of the Grounds past its first, where the stage shows no story chapter to skip", () => {
    const result = playWave(wave({ stage: "grounds", wave: 2, maxTicks: 600 }));
    expect(result.end).not.toBe("broken");
    expect(result.spawned.length).toBeGreaterThan(0);
    // The drafts before the wave are recorded for the coverage list: more offered than taken.
    expect(result.offered.length).toBeGreaterThan(result.upgrades);
  }, 60_000);
});

describe("the wave report", () => {
  it("asks for a stage's nine waves before its boss, for every seed, in a fixed order", () => {
    expect(stageWaves("verdant-sanctum")).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39]);
    expect(waveRequests({ ...report, waves: stageWaves("verdant-sanctum") })).toHaveLength(18);
    expect(waveRequests(report).map((request) => `${String(request.wave)}/${request.seed}`)).toEqual([
      "31/1",
      "31/2",
      "32/1",
      "32/2",
    ]);
  });

  it("refuses a mistyped stage, wave, build or player by name before any wave is played", () => {
    expect(() => admitWaveReport({ ...report, stages: ["verdant"] })).toThrow(TypeError);
    expect(() => stageWaves("verdant")).toThrow('no Adventure stage "verdant"');
    expect(() => admitWaveReport({ ...report, waves: [12] })).toThrow("waves 31 to 40");
    expect(() => admitWaveReport({ ...report, builds: ["bought" as never] })).toThrow('no build "bought"');
    expect(() => admitWaveReport({ ...report, players: ["nobody" as never] })).toThrow('no player "nobody"');
  });

  it("plays the same waves whole and in shares, and prints a row for each wave", () => {
    const whole = playWaveReport(report);
    const shares = [0, 1, 2].map((index) => playWaveReport(report, { index, of: 3 }));
    expect(mergeSlices(shares)).toEqual(whole);
    const text = formatWaveReport(whole, true);
    expect(text).toContain("verdant-sanctum  difficulty normal  weapon sword  build drafted  player scripted  2 seeds");
    expect(text.split("\n").filter((line) => /^3[12] {4}0\/2/u.test(line))).toHaveLength(2);
    expect(text).toContain("wave 31 seed 1: time limit after 3.0 s");
    expect(text).toContain("tier-ups and anything bought are not part of it");
  }, 60_000);
});
