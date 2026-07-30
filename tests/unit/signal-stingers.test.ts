import { describe, expect, it } from "vitest";
import { canFire } from "../../src/audio/signal/stingers";

const NEVER = Number.NEGATIVE_INFINITY;

describe("stinger rate limiting", () => {
  it("fires when nothing has played yet", () => {
    expect(canFire("tearing", 100, undefined, NEVER)).toBe(true);
  });

  it("blocks a retrigger inside the stinger's own cooldown", () => {
    expect(canFire("tearing", 110, 100, 100)).toBe(false); // 25s cooldown
    expect(canFire("tearing", 126, 100, 100)).toBe(true);
  });

  it("blocks stingers stacking on each other via the global cooldown", () => {
    // victory has only a 10s cooldown, but another stinger just fired at 100
    expect(canFire("victory", 101, NEVER, 100)).toBe(false);
    expect(canFire("victory", 104, NEVER, 100)).toBe(true);
  });

  it("gives boss arrival a long cooldown so phases do not spam it", () => {
    expect(canFire("boss-arrival", 115, 100, 100)).toBe(false); // 20s
    expect(canFire("boss-arrival", 121, 100, 100)).toBe(true);
  });
});

describe("stingers are opt-in", () => {
  it("is disabled by default so accents never intrude on an unrelated track", async () => {
    const { stingersEnabled } = await import("../../src/audio/signal/stingers");
    expect(stingersEnabled()).toBe(false);
  });
});
