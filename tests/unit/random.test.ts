import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../src/domain/random";

describe("SeededRandom", () => {
  it("replays the same sequence for the same string seed", () => {
    const left = new SeededRandom("run:campaign:42");
    const right = new SeededRandom("run:campaign:42");
    expect(Array.from({ length: 100 }, () => left.nextUint32()))
      .toEqual(Array.from({ length: 100 }, () => right.nextUint32()));
  });

  it("restores an exact sequence position", () => {
    const random = new SeededRandom(72);
    random.next();
    const snapshot = random.snapshot();
    const expected = random.nextUint32();
    random.restore(snapshot);
    expect(random.nextUint32()).toBe(expected);
  });
});
