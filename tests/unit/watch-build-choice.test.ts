import { describe, expect, it } from "vitest";
import { buildWatchChoiceScore } from "../../src/agents/watch-build-choice";

describe("Watch Agent build scoring", () => {
  it("prefers ringblade throw synergy over held/parry fallback scores", () => {
    expect(buildWatchChoiceScore("quickdraw", "ringblade"))
      .toBeGreaterThan(buildWatchChoiceScore("parry_split", "ringblade"));
    expect(buildWatchChoiceScore("parry_split", "sword"))
      .toBeGreaterThan(buildWatchChoiceScore("quickdraw", "sword"));
  });
});
