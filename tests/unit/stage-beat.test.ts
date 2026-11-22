/**
 * The stage beat (src/gameplay/stage-beat.ts): what is written over the world, held as world state and
 * stepped one simulation tick at a time (plans/active/CINEMATICS_OVERHAUL.md, PR 6).
 */
import { describe, expect, it } from "vitest";

import {
  STAGE_BEAT_KINDS,
  arrivalBanner,
  bannerBeat,
  lastFeedbackBanner,
  parseStageBeat,
  phaseNumeral,
  stageBeatProgress,
  stepStageBeat,
  type StageBeat,
} from "../../src/gameplay/stage-beat";

describe("stage beat", () => {
  it("holds a banner for 138 ticks (1.15 s), the hold the wall-clock banner had", () => {
    expect(STAGE_BEAT_KINDS.banner.ticks).toBe(138);
    let beat: StageBeat | null = bannerBeat({ title: "THE THRONE BURNS", accent: "#c33" });
    let shown = 0;
    while (beat !== null) {
      shown++;
      beat = stepStageBeat(beat);
    }
    expect(shown).toBe(138);
  });

  it("runs its progress from 0 on its first tick to 1 on its last", () => {
    let beat: StageBeat | null = bannerBeat({ title: "X", accent: "#fff" });
    expect(stageBeatProgress(beat)).toBe(0);
    let last = beat;
    while (beat !== null) {
      last = beat;
      beat = stepStageBeat(beat);
    }
    expect(stageBeatProgress(last)).toBe(1);
  });

  it("leads a phase-change banner with the phase numeral", () => {
    expect([1, 2, 3, 4, 5].map(phaseNumeral)).toEqual(["I", "II", "III", "IV", "V"]);
    expect(phaseNumeral(0)).toBeNull();
    expect(phaseNumeral(6)).toBeNull();
  });

  it("writes a boss's arrival as its name, its epithet and its opening line", () => {
    expect(
      arrivalBanner({ bossName: "ALDRIC", epithet: "THE BERSERKER KING", openingLine: "KNEEL.", color: "#c33" }),
    ).toMatchObject({ kind: "banner", mark: "ALDRIC", title: "THE BERSERKER KING", line: "KNEEL.", accent: "#c33" });
    expect(arrivalBanner({ bossName: "THE ECHO", color: "#93f" })).toMatchObject({
      mark: null,
      title: "THE ECHO",
      line: null,
    });
    expect(arrivalBanner({ bossName: "" })).toBeNull();
  });

  it("writes the last banner of a feedback batch, as live play shows it", () => {
    expect(
      lastFeedbackBanner(
        [[{ banner: "MIRRORED" }], "#93f"],
        [
          [{ banner: "STAGGERED" }, { color: "#fff" }, { banner: "THE THRONE BURNS", mark: "II", color: "#c33" }, {}],
          "#999",
        ],
      ),
    ).toMatchObject({ title: "THE THRONE BURNS", mark: "II", accent: "#c33", age: 0 });
    expect(lastFeedbackBanner([[{ banner: "STAGGERED" }], "#999"], [[], "#fff"])).toMatchObject({
      mark: null,
      accent: "#999",
    });
    expect(lastFeedbackBanner([[{ color: "#fff" }], "#999"])).toBeNull();
  });

  it("reads a saved beat back exactly, and refuses anything else", () => {
    const beat = stepStageBeat(bannerBeat({ title: "TRUE FORM", accent: "#93f", mark: "III", line: null }));
    expect(parseStageBeat(JSON.parse(JSON.stringify(beat)))).toEqual(beat);
    expect(parseStageBeat(null)).toBeNull();
    expect(parseStageBeat(undefined)).toBeNull();
    for (const bad of [
      "banner",
      { ...beat, kind: "card" },
      { ...beat, age: 138 },
      { ...beat, age: -1 },
      { ...beat, age: 1.5 },
      { ...beat, ticks: 42 },
      { ...beat, title: 3 },
      { ...beat, mark: 1 },
    ])
      expect(() => parseStageBeat(bad)).toThrow(/Invalid stage beat/);
  });
});
