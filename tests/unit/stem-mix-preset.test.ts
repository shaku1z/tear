import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dbToGain, planTierGains } from "../../src/audio/stems/tier";
import type { StemCueManifest } from "../../src/audio/stems/types";

const cue = JSON.parse(readFileSync("public/audio/cues/once-at-a-time/cue.json", "utf8")) as StemCueManifest;

describe("stem mix preset", () => {
  it("leaves every tier unchanged without a preset", () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      expect(planTierGains(cue, tier, undefined)).toEqual(planTierGains(cue, tier));
      expect(planTierGains(cue, tier, {})).toEqual(planTierGains(cue, tier));
    }
  });

  it("offsets one layer and silences another on top of the tier", () => {
    const plain = planTierGains(cue, 4);
    const mixed = planTierGains(cue, 4, { gainDb: { apex: 6 }, off: ["melody"] });
    expect(mixed.melody).toBe(0);
    expect(mixed.apex).toBeCloseTo((plain.apex ?? Number.NaN) * dbToGain(6), 9);
    expect(mixed.rhythm).toBe(plain.rhythm);
    expect(mixed.foundation).toBe(plain.foundation);
  });

  it("never brings in a layer the tier leaves silent", () => {
    const silentAtZero = cue.stems.map((stem) => stem.id).filter((id) => cue.tiers[0][id] === undefined);
    expect(silentAtZero.length).toBeGreaterThan(0);
    const boosted = planTierGains(cue, 0, { gainDb: Object.fromEntries(silentAtZero.map((id) => [id, 12])) });
    for (const id of silentAtZero) expect(boosted[id]).toBe(0);
  });

  it("ignores layer ids the cue does not have", () => {
    expect(planTierGains(cue, 3, { gainDb: { vocals: 6 }, off: ["choir"] })).toEqual(planTierGains(cue, 3));
  });

  it("ships the kinds each layer mixes, and never vocals", () => {
    for (const stem of cue.stems) {
      expect(stem.kinds?.length).toBeGreaterThan(0);
      expect(stem.kinds).not.toContain("vocals");
    }
  });
});
