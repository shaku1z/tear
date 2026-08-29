import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { UPGRADES } from "../../src/gameplay/upgrades";
import { calculateCoinAward } from "../../src/gameplay/scoring/coin-awards";
import { DIFFICULTY_CATALOG } from "../../src/gameplay/run/difficulty-catalog";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  buildCanonicalProgressionLedger,
  replayProgressionConfiguration,
  reconstructProgression,
  synthesizeProgression,
  type TearBuildSynthesisPolicy,
  type TearProgressionRequest,
} from "../../src/tearbench";

const baseRequest: TearProgressionRequest = {
  mode: "endless",
  difficulty: "hard",
  weapon: "hammer",
  targetWave: 99,
  meta: { startingHp: 10, currencyBonus: 2 },
  selections: [
    { id: "keen_edge", tier: 3 },
    { id: "bloodrite", tier: 3, unique: true },
    { id: "air_dash", tier: 1, unique: true },
  ],
  policy: "exact-ledger",
};

function selections(result: ReturnType<typeof synthesizeProgression>) {
  return result.ledger.events.filter((event) =>
    event.type === "draft.selected" || event.type === "tier.selected");
}

describe("production progression ledger", () => {
  it("derives wave currency from production coin awards across the active weapon roster", () => {
    for (const weapon of WEAPON_IDS) {
      const request = {
        ...baseRequest, mode: "campaign", difficulty: "normal", weapon, targetWave: 1, economy: { score: 0 },
      } satisfies TearProgressionRequest;
      const canonical = buildCanonicalProgressionLedger(request);
      const synthesized = synthesizeProgression({ ...request, selections: [] });
      expect(synthesized.statistics.estimatedFields).toEqual(["hp", "maxHp", "elapsedTicks", "score", "style", "kills"]);
      expect(synthesized.statistics.estimatedFields).not.toContain("currency");
      for (const events of [canonical.events, synthesized.ledger.events]) {
        const reward = events.find((event) => event.type === "reward.granted");
        expect(reward?.type === "reward.granted" ? reward.currency : undefined).toBe(10);
      }
    }
  });

  it("uses current difficulty and economy modifiers for synthesized rewards", () => {
    const difficulty = DIFFICULTY_CATALOG.find((candidate) => candidate.id === "hard");
    expect(difficulty).toBeDefined();
    if (difficulty === undefined) return;
    const economy = { score: 1_000, coinMagnetLevel: 2, fortuneLevel: 3 } as const;
    const ledger = buildCanonicalProgressionLedger({ ...baseRequest, difficulty: "hard", targetWave: 10, economy });
    const reward = ledger.events.find((event) => event.type === "reward.granted" && event.wave === 10);
    const expected = calculateCoinAward({
      score: economy.score, wave: 10, difficultyId: "hard",
      baseDifficultyMultiplier: difficulty.modifiers.coinReward, remoteMultiplier: 1,
      coinMagnetLevel: economy.coinMagnetLevel, fortuneLevel: economy.fortuneLevel,
    });
    expect(reward?.type === "reward.granted" ? reward.currency : undefined).toBe(expected.earned);
    expect(reward?.type === "reward.granted" ? reward.currency : undefined).toBe(201);
  });

  it("reconstructs repeated stacks, production tiers, progression, and configuration order", () => {
    const synthesized = synthesizeProgression(baseRequest);
    const reconstructed = reconstructProgression(synthesized.ledger);
    expect(synthesized.reachable).toBe(true);
    expect(reconstructed.progressionHash).toBe(synthesized.ledger.progressionHash);
    expect(reconstructed.configurationHash).toBe(synthesized.configurationHash);
    expect(reconstructed.build).toEqual(synthesized.build);
    expect(synthesized.build).toMatchObject({ keen_edge: 3, bloodrite: 3, air_dash: 1 });
    expect(synthesized.ledger.events.every((event, index) => event.index === index)).toBe(true);

    const mutations = synthesized.ledger.events.filter((event) => event.type === "configuration.mutated");
    expect(mutations).toHaveLength(99);
    expect(mutations.map((event) => event.wave)).toEqual(selections(synthesized).map((event) => event.wave));
  });

  it("derives reward points from production wave descriptions and resolves boss fallback drafts", () => {
    const canonical = buildCanonicalProgressionLedger({
      ...baseRequest,
      targetWave: 10,
      selections: [],
    });
    expect(canonical.draftOpportunities).toBe(9);
    expect(canonical.tierOpportunities).toBe(1);

    const noSpecial = synthesizeProgression({
      ...baseRequest,
      targetWave: 10,
      policy: "low-roll",
      selections: [{ id: "keen_edge", tier: 10 }],
    });
    const wave10 = noSpecial.ledger.events.filter((event) => "wave" in event && event.wave === 10);
    expect(wave10.some((event) => event.type === "boss.defeated")).toBe(true);
    expect(wave10.some((event) => event.type === "draft.selected")).toBe(true);
    expect(wave10.some((event) => event.type === "tier.selected")).toBe(false);
    expect(noSpecial.ledger.draftOpportunities).toBe(10);
    expect(noSpecial.ledger.tierOpportunities).toBe(0);
  });

  it("records a legal offer and one production selection for every earned reward", () => {
    const result = synthesizeProgression(baseRequest);
    const selected = selections(result);
    const earned = result.ledger.events.filter((event) =>
      event.type === "draft.earned" || event.type === "tier.earned");
    expect(selected).toHaveLength(99);
    expect(earned).toHaveLength(99);
    expect(result.ledger.draftOpportunities + result.ledger.tierOpportunities).toBe(99);
    for (const event of selected) {
      const offeredType = event.type === "draft.selected" ? "draft.offered" : "tier.offered";
      const offer = result.ledger.events.find((candidate) =>
        candidate.type === offeredType && candidate.wave === event.wave);
      expect(offer).toBeDefined();
      if (offer?.type === "draft.offered" || offer?.type === "tier.offered") {
        expect(offer.ids).toContain(event.id);
      }
    }
  });

  it("generates 10,000 legal target states without pick, unique, tier, or hash errors", () => {
    const modes = ["campaign", "endless", "gauntlet", "playground"] as const;
    const policies: readonly TearBuildSynthesisPolicy[] = [
      "exact-ledger", "replay-derived", "human-population", "agent-population",
      "archetype", "optimized", "low-roll", "anti-synergy", "coverage-seeking",
    ];
    const catalogue = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade] as const));
    const failures: string[] = [];
    const waveTargets = [1, 2, 3, 8, 9, 10, 24, 49, 99, 100] as const;
    const coverage = new Map<string, number>();
    for (let index = 0; index < 10_000; index += 1) {
      const targetWave = index < 5_000
        ? waveTargets[index % waveTargets.length] ?? 1
        : index % 5 + 1;
      const mode = modes[index % modes.length] ?? "campaign";
      const difficulty = index % 3 === 0 ? "extreme" : index % 2 === 0 ? "normal" : "hard";
      const weapon = index % 3 === 0 ? "sword" : index % 3 === 1 ? "hammer" : "riftlock";
      const policy = policies[index % policies.length] ?? "coverage-seeking";
      const result = synthesizeProgression({
        mode, difficulty, weapon, targetWave, policy,
      });
      coverage.set(`${mode}:${difficulty}:${weapon}:${policy}:${String(targetWave)}`,
        (coverage.get(`${mode}:${difficulty}:${weapon}:${policy}:${String(targetWave)}`) ?? 0) + 1);
      if (!result.reachable) failures.push(`${String(index)}: unreachable`);
      if (selections(result).length !== targetWave) failures.push(`${String(index)}: earned pick count`);
      if (result.ledger.draftOpportunities + result.ledger.tierOpportunities !== targetWave) {
        failures.push(`${String(index)}: opportunity count`);
      }
      if (!result.ledger.events.every((event, eventIndex) => event.index === eventIndex)) {
        failures.push(`${String(index)}: event order`);
      }
      if (reconstructProgression(result.ledger).configurationHash !== result.configurationHash) {
        failures.push(`${String(index)}: configuration hash`);
      }
      const replay = replayProgressionConfiguration(result.ledger, {
        resetConfiguration: () => undefined, setupRun: () => undefined,
        selectWeapon: () => undefined, applyMeta: () => undefined,
        applyDraft: () => undefined, applyTier: () => undefined,
      });
      if (replay.earnedPickCount !== targetWave || replay.appliedMutationCount !== targetWave) {
        failures.push(`${String(index)}: production-order replay count`);
      }
      for (const [id, tierOrCount] of Object.entries(result.build)) {
        const upgrade = catalogue.get(id);
        if (upgrade === undefined) failures.push(`${String(index)}: unknown upgrade`);
        else if (upgrade.unique && upgrade.tiers === undefined && tierOrCount !== 1) {
          failures.push(`${String(index)}: repeated unique`);
        } else if (upgrade.tiers !== undefined && tierOrCount > upgrade.tiers.length + 1) {
          failures.push(`${String(index)}: illegal tier`);
        }
      }
    }
    const artifactDirectory = resolve("artifacts", "tearbench", "checkpoints", "core", "C23", "state-forge");
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(resolve(artifactDirectory, "progression-10000.json"), JSON.stringify({
      generatedTargets: 10_000,
      failures,
      distinctCoverageCells: coverage.size,
      waveTargets: [...new Set([...waveTargets, 1, 2, 3, 4, 5])].sort((a, b) => a - b),
      modes,
      difficulties: ["normal", "hard", "extreme"],
      weapons: ["sword", "hammer", "riftlock"],
      policies,
      productionCatalogueSize: UPGRADES.length,
      orderedConfigurationReplay: true,
    }, null, 2));
    expect(failures).toEqual([]);
  }, 120_000);

  it("explains unknown, duplicate-unique, and unreachable tier requests with a nearest legal build", () => {
    const result = synthesizeProgression({
      ...baseRequest,
      targetWave: 2,
      selections: [
        { id: "bloodrite", tier: 3, unique: true },
        { id: "air_dash", tier: 1, unique: true },
        { id: "air_dash", tier: 1, unique: true },
        { id: "not_in_the_catalogue", tier: 1 },
      ],
    });
    expect(result.reachable).toBe(false);
    expect(result.explanation).toMatch(/unknown production upgrade/u);
    expect(result.explanation).toMatch(/cannot be requested twice/u);
    expect(result.explanation).toMatch(/requires tier 3/u);
    expect(result.nearestReachable).toContainEqual({ id: "bloodrite", tier: 1, unique: true });
  });

  it("keeps population policies provisional and quarantines corruption profiles", () => {
    expect(synthesizeProgression({ ...baseRequest, policy: "human-population" }).provisionalPopulationData).toBe(true);
    expect(synthesizeProgression({ ...baseRequest, policy: "agent-population" }).provisionalPopulationData).toBe(true);
    const corrupted = synthesizeProgression({ ...baseRequest, policy: "corruption" });
    expect(corrupted.reachable).toBe(false);
    expect(corrupted.explanation).toMatch(/must not enter balance evidence/u);
  });

  it("creates distinct deterministic low-roll, anti-synergy, and coverage histories", () => {
    const request = { ...baseRequest, targetWave: 24, selections: [] };
    const sequence = (policy: TearBuildSynthesisPolicy) =>
      selections(synthesizeProgression({ ...request, policy })).map((event) => event.id);
    expect(sequence("low-roll")).toEqual(sequence("low-roll"));
    expect(sequence("low-roll")).not.toEqual(sequence("anti-synergy"));
    expect(sequence("anti-synergy")).not.toEqual(sequence("coverage-seeking"));
  });

  it("rejects tampered progression hashes and out-of-order configuration mutations", () => {
    const result = synthesizeProgression({ ...baseRequest, targetWave: 3 });
    expect(() => reconstructProgression({
      ...result.ledger,
      progressionHash: "tampered",
    })).toThrow(/progression hash/u);

    const mutation = result.ledger.events.find((event) => event.type === "configuration.mutated");
    expect(mutation).toBeDefined();
    if (mutation?.type !== "configuration.mutated") return;
    const events = result.ledger.events.map((event) =>
      event.index === mutation.index ? { ...event, id: "wrong_mutation" } : event);
    expect(() => reconstructProgression({
      ...result.ledger,
      events,
      progressionHash: stableVerificationHash(events),
    })).toThrow(/out-of-order configuration mutation/u);
  });

  it("replays production mutations in order with one application per earned pick", () => {
    const target = synthesizeProgression({ ...baseRequest, selections: [], policy: "optimized" });
    const calls: string[] = [];
    const replay = replayProgressionConfiguration(target.ledger, {
      resetConfiguration: (revision) => { calls.push(`reset:${revision}`); },
      setupRun: (mode, difficulty) => { calls.push(`setup:${mode}:${difficulty}`); },
      selectWeapon: (weapon) => { calls.push(`weapon:${weapon}`); },
      applyMeta: (id, value) => { calls.push(`meta:${id}:${String(value)}`); },
      applyDraft: (id, occurrence) => { calls.push(`draft:${id}:${String(occurrence)}`); },
      applyTier: (id, tier) => { calls.push(`tier:${id}:${String(tier)}`); },
    });
    expect(calls.slice(0, 3).map((entry) => entry.split(":")[0])).toEqual(["reset", "setup", "weapon"]);
    expect(replay.earnedPickCount).toBe(99);
    expect(replay.appliedMutationCount).toBe(99);
    expect(replay.configurationHash).toBe(target.configurationHash);
    expect(replay.finalBuild).toEqual(target.build);
  });
});
