import { describe, expect, it } from "vitest";
import { buildWatchChoiceScore } from "../../src/agents/watch-build-choice";

describe("Watch Agent build scoring", () => {
  it("prefers Riftlock throw synergy over held/parry fallback scores", () => {
    expect(buildWatchChoiceScore("quickdraw", "riftlock"))
      .toBeGreaterThan(buildWatchChoiceScore("parry_split", "riftlock"));
    expect(buildWatchChoiceScore("parry_split", "sword"))
      .toBeGreaterThan(buildWatchChoiceScore("quickdraw", "sword"));
  });
});
