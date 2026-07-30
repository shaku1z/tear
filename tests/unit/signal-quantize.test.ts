import { describe, expect, it } from "vitest";
import { nextBoundaryTime, secondsPerBar } from "../../src/audio/signal/quantize";

describe("phrase quantization", () => {
  it("computes bar length from tempo and metre", () => {
    expect(secondsPerBar(120, 4)).toBeCloseTo(2, 5);
    expect(secondsPerBar(87.6, 4)).toBeCloseTo(2.7397, 3);
    expect(secondsPerBar(0)).toBe(2); // guard against bad manifests
  });

  it("lands on the next phrase boundary, not immediately", () => {
    // cue started at t=10, 2s bars, 2-bar phrases => boundaries at 10,14,18…
    expect(nextBoundaryTime(15, 10, 2, 2)).toBe(18);
    expect(nextBoundaryTime(10.5, 10, 2, 2)).toBe(14);
  });

  it("skips a boundary that is too close to schedule audibly", () => {
    // 13.95 is only 0.05s before the 14 boundary -> use 18 instead
    expect(nextBoundaryTime(13.95, 10, 2, 2)).toBe(18);
  });

  it("returns now when quantization is disabled (menu swaps)", () => {
    expect(nextBoundaryTime(15, 10, 2, 0)).toBe(15);
  });

  it("is exact when sitting on a boundary already", () => {
    expect(nextBoundaryTime(14 - 0.5, 10, 2, 2)).toBe(14);
  });

  describe("loop-anchored grid", () => {
    // A loop of 4.5 bars: the wrap lands mid-phrase, so extrapolating bars from
    // the cue start walks away from the audio a little more every cycle.
    const spb = 2;
    const loop = 9; // 4.5 bars

    it("treats the loop wrap as a boundary", () => {
      // Boundaries within a cycle: 0,4,8 then the wrap at 9 (not 12).
      expect(nextBoundaryTime(18.5, 10, spb, 2, 0.08, loop)).toBe(19);
    });

    it("re-anchors each cycle instead of accumulating drift", () => {
      // 101 cycles in, boundaries must still be measured from that cycle's start.
      const cycleStart = 10 + 101 * loop; // t = 919
      expect(nextBoundaryTime(cycleStart + 0.5, 10, spb, 2, 0.08, loop)).toBeCloseTo(cycleStart + 4, 9);
      // Without loop anchoring the same instant drifts to an unrelated offset.
      expect(nextBoundaryTime(cycleStart + 0.5, 10, spb, 2, 0.08, 0)).not.toBeCloseTo(cycleStart + 4, 3);
    });

    it("still skips boundaries too close to schedule, across a wrap", () => {
      // 8.97 into the cycle: the wrap at 9 is only 0.03s away -> next cycle's 4.
      expect(nextBoundaryTime(18.97, 10, spb, 2, 0.08, loop)).toBeCloseTo(23, 9);
    });

    it("matches the unanchored result when the loop is a whole phrase", () => {
      expect(nextBoundaryTime(15, 10, 2, 2, 0.08, 8)).toBe(nextBoundaryTime(15, 10, 2, 2));
    });
  });
});
