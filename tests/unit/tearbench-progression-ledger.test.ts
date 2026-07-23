import { describe, expect, it } from "vitest";

import {
  buildCanonicalProgressionLedger,
  reconstructProgression,
  synthesizeProgression,
  type TearProgressionRequest,
} from "../../src/tearbench";

const baseRequest: TearProgressionRequest = {
  mode: "endless",
  difficulty: "hard",
  weapon: "hammer",
  targetWave: 99,
  meta: { startingHp: 10, currencyBonus: 2 },
  selections: [
    { id: "impact", tier: 3 },
    { id: "recall", tier: 2, unique: true },
  ],
  policy: "exact-ledger",
};

describe("canonical progression ledger", () => {
  it("reconstructs recorded build, progression, and configuration hashes", () => {
    const synthesized = synthesizeProgression(baseRequest);
    const reconstructed = reconstructProgression(synthesized.ledger);
    expect(synthesized.reachable).toBe(true);
    expect(reconstructed.progressionHash).toBe(synthesized.ledger.progressionHash);
    expect(reconstructed.configurationHash).toBe(synthesized.configurationHash);
    expect(reconstructed.build).toEqual(synthesized.build);
    expect(synthesized.ledger.events.every((event, index) => event.index === index)).toBe(true);
  });

  it("derives draft and tier opportunities from production wave descriptions", () => {
    const ledger = buildCanonicalProgressionLedger(baseRequest);
    const earnedDrafts = ledger.events.filter((event) => event.type === "draft.earned").length;
    const earnedTiers = ledger.events.filter((event) => event.type === "tier.earned").length;
    expect(ledger.draftOpportunities).toBe(earnedDrafts);
    expect(ledger.tierOpportunities).toBe(earnedTiers);
    expect(earnedDrafts + earnedTiers).toBe(99);
  });

  it("generates 10,000 legal target-wave states without opportunity or index errors", () => {
    const modes = ["campaign", "endless", "gauntlet", "playground"] as const;
    const failures: string[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      const targetWave = index % 100 + 1;
      const result = synthesizeProgression({
        mode: modes[index % modes.length] ?? "campaign",
        difficulty: index % 2 === 0 ? "normal" : "hard",
        weapon: index % 3 === 0 ? "sword" : "hammer",
        targetWave,
        selections: [{ id: `upgrade-${String(index % 17)}`, tier: 1 }],
        policy: "coverage-seeking",
      });
      if (!result.reachable) failures.push(`${String(index)}: unreachable`);
      if (result.ledger.draftOpportunities + result.ledger.tierOpportunities !== targetWave) {
        failures.push(`${String(index)}: opportunity count`);
      }
      if (!result.ledger.events.every((event, eventIndex) => event.index === eventIndex)) {
        failures.push(`${String(index)}: event order`);
      }
      if (!Number.isFinite(result.statistics.score)) failures.push(`${String(index)}: statistics`);
    }
    expect(failures).toEqual([]);
  }, 60_000);

  it("explains impossible builds and returns the nearest reachable prefix", () => {
    const result = synthesizeProgression({
      ...baseRequest,
      targetWave: 2,
      selections: [
        { id: "legal", tier: 1 },
        { id: "too-expensive", tier: 5 },
      ],
    });
    expect(result.reachable).toBe(false);
    expect(result.explanation).toMatch(/earned opportunities/u);
    expect(result.nearestReachable).toEqual([{ id: "legal", tier: 1 }]);
  });

  it("labels population-derived synthesis as provisional", () => {
    const result = synthesizeProgression({ ...baseRequest, policy: "human-population" });
    expect(result.provisionalPopulationData).toBe(true);
  });
});
