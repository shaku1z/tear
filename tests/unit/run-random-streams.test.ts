import { describe, expect, it } from "vitest";
import { RunRandomStreams } from "../../src/simulation/run-random";

function samples(streams: RunRandomStreams, name: Parameters<RunRandomStreams["stream"]>[0], count = 4): number[] {
  return Array.from({ length: count }, () => streams.stream(name).next());
}

describe("named run randomness", () => {
  it("reproduces every stream from the same master seed", () => {
    const left = new RunRandomStreams();
    const right = new RunRandomStreams();
    left.reset("run-42");
    right.reset("run-42");
    expect(samples(left, "combat")).toEqual(samples(right, "combat"));
    expect(samples(left, "draft")).toEqual(samples(right, "draft"));
  });

  it("does not let cosmetic consumption perturb gameplay streams", () => {
    const left = new RunRandomStreams();
    const right = new RunRandomStreams();
    left.reset(882901);
    right.reset(882901);
    samples(left, "cosmetic", 100);
    expect(samples(left, "combat", 12)).toEqual(samples(right, "combat", 12));
    expect(samples(left, "spawn", 12)).toEqual(samples(right, "spawn", 12));
  });

  it("captures and restores all stream cursors", () => {
    const streams = new RunRandomStreams();
    streams.reset("restore-me");
    samples(streams, "enemy-ai", 7);
    samples(streams, "boss", 3);
    const checkpoint = streams.snapshot();
    const expected = [samples(streams, "enemy-ai"), samples(streams, "boss")];
    streams.restore(checkpoint);
    expect([samples(streams, "enemy-ai"), samples(streams, "boss")]).toEqual(expected);
  });
});
