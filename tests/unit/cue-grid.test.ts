import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Grid-integrity contract, asserted against the cue manifests that actually ship.
 *
 * The rule this guards: a cue may only claim bar-quantized adaptive playback when
 * its loop is provably a whole number of bars at its stated tempo. Before this
 * check, every cue asserted a tempo the loop did not agree with, and the phrase
 * grid slid away from the audio by up to 1.25s on every wrap.
 */
const CUES = path.join(process.cwd(), "public/audio/cues");

interface Cue {
  readonly tempo: number;
  readonly sourceSampleRate: number;
  readonly loop: { readonly startFrame: number; readonly endFrame: number };
  readonly grid: {
    readonly beatsPerBar: number;
    readonly barsPerLoop: number;
    readonly secondsPerBar: number;
    readonly approvedBpm: number;
    readonly barQuantizedCompatible: boolean;
  };
  readonly analysis?: { readonly seamExcessDb?: number; readonly loopLufs?: number };
}

const ids = fs.existsSync(CUES)
  ? fs.readdirSync(CUES).filter((d) => fs.existsSync(path.join(CUES, d, "cue.json")))
  : [];

const load = (id: string): Cue => JSON.parse(fs.readFileSync(path.join(CUES, id, "cue.json"), "utf8")) as Cue;

describe("cue grid integrity", () => {
  it("ships the expected number of cues", () => {
    expect(ids.length).toBe(14);
  });

  it.each(ids)("%s: loop length is exactly barsPerLoop bars", (id) => {
    const cue = load(id);
    const loopSeconds = (cue.loop.endFrame - cue.loop.startFrame) / cue.sourceSampleRate;
    expect(cue.grid.barsPerLoop).toBeGreaterThan(0);
    // The bar length is derived from the loop, so this holds to the manifest's
    // 6-decimal rounding (~5µs). The runtime divides the frame counts directly
    // rather than reading this value back, so even that slack never reaches audio.
    expect(cue.grid.barsPerLoop * cue.grid.secondsPerBar).toBeCloseTo(loopSeconds, 4);
  });

  it.each(ids)("%s: approvedBpm agrees with secondsPerBar", (id) => {
    const cue = load(id);
    const implied = (60 * cue.grid.beatsPerBar) / cue.grid.secondsPerBar;
    // secondsPerBar in the manifest is itself rounded to 6dp, so recomputing
    // bpm from it reintroduces that rounding; 3dp is well past audible.
    expect(cue.grid.approvedBpm).toBeCloseTo(implied, 3);
    // `tempo` is the rounded display value of the same number, never a guess.
    expect(cue.tempo).toBeCloseTo(cue.grid.approvedBpm, 1);
  });

  it.each(ids)("%s: the loop is a whole number of bars and its seam and loudness were measured", (id) => {
    const cue = load(id);
    // The music tool derives the grid from the loop it cut, so a whole bar count is the
    // claim to check; a fractional one means the manifest was edited by hand.
    expect(Number.isInteger(cue.grid.barsPerLoop)).toBe(true);
    // The tool's own gates: the loop point may be at most 3 dB louder than the music
    // around it, and every cue sits at -16 LUFS within 1 LU.
    expect(cue.analysis?.seamExcessDb).toBeLessThanOrEqual(3);
    expect(Math.abs((cue.analysis?.loopLufs ?? Number.NaN) + 16)).toBeLessThanOrEqual(1);
  });

  it.each(ids)("%s: records a real tempo and key, never a placeholder", (id) => {
    const cue = load(id) as Cue & { key?: string };
    expect(cue.tempo).toBeGreaterThan(40);
    expect(cue.tempo).toBeLessThan(220);
    expect(cue.key ?? "").not.toBe("—");
  });
});
