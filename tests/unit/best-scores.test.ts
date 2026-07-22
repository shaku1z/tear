import { describe, expect, it } from "vitest";

import { BestScoreRepository } from "../../src/gameplay/scoring/best-scores";

describe("BestScoreRepository", () => {
  it("records deeper waves and uses score as the same-wave tie breaker", () => {
    const values = new Map<string, string>();
    const scores = new BestScoreRepository({
      get: (key) => values.get(key) ?? null,
      set: (key, value) => values.set(key, value),
    });

    expect(scores.record({ mode: "endless", difficulty: "normal", wave: 4, score: 100, time: 20 })).toBe(true);
    expect(scores.record({ mode: "endless", difficulty: "normal", wave: 4, score: 90, time: 18 })).toBe(false);
    expect(scores.record({ mode: "endless", difficulty: "normal", wave: 4, score: 110, time: 30 })).toBe(true);
    expect(scores.read("endless", "normal")).toEqual({ wave: 4, score: 110, time: 30 });
  });

  it("treats malformed and non-finite persisted values as an empty safe score", () => {
    const scores = new BestScoreRepository({ get: () => "{bad", set: () => undefined });
    expect(scores.read("campaign", "hard")).toEqual({ wave: 0, score: 0, time: 0 });

    const invalid = new BestScoreRepository({
      get: () => JSON.stringify({ wave: -4, score: "huge", time: null }),
      set: () => undefined,
    });
    expect(invalid.read("campaign", "hard")).toEqual({ wave: 0, score: 0, time: 0 });
  });
});
