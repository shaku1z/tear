import { describe, expect, it } from "vitest";
import { canonicalStringify, stableVerificationHash } from "../../src/replay/hash";

describe("stable verification hashing", () => {
  it("is independent of object insertion order", () => {
    const left = { player: { health: 4, x: -0 }, enemies: [{ id: "e2", health: 7 }], tick: 120 };
    const right = { tick: 120, enemies: [{ health: 7, id: "e2" }], player: { x: 0, health: 4 } };
    expect(canonicalStringify(left)).toBe(canonicalStringify(right));
    expect(stableVerificationHash(left)).toBe(stableVerificationHash(right));
  });

  it("rejects values that JSON replays cannot represent deterministically", () => {
    expect(() => stableVerificationHash({ health: Number.NaN })).toThrow(/non-finite/);
    expect(() => stableVerificationHash({ missing: undefined })).toThrow(/undefined/);
  });
});
