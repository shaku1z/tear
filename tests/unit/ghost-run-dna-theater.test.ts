import { describe, expect, it } from "vitest";
import type { GhostReadCapsule } from "../../src/ghost/capsule-reader";
import { projectGhostRunDnaTheater } from "../../src/ghost/run-dna-theater";

function capsule(results: readonly unknown[]): GhostReadCapsule {
  return { manifest: { id: "verified-run" }, maxTick: 12, tracks: { commands: [], rng: [], events: [], keyframes: [], presentation: [],
    results: results.map((value, tick) => ({ kind: "results" as const, tick, value })) } } as unknown as GhostReadCapsule;
}

describe("verified Run DNA Theater projection", () => {
  it("calculates only one complete declared metrics basis", () => {
    const view = projectGhostRunDnaTheater(capsule([{ kind: "run-dna-metrics-v1", metrics: {
      attacks: 40, combatTicks: 100, misses: 4, movingTicks: 80, damageTaken: 20, maxHp: 100, distinctManeuvers: 4, availableManeuvers: 8,
    } }]));
    expect(view).toMatchObject({ available: true, formulaVersion: "run-dna-v1", evidenceCustody: "verified capsule verified-run",
      dimensions: { aggression: 0.4, precision: 0.9, mobility: 0.8, defense: 0.8, experimentation: 0.5 } });
  });

  it("keeps missing and ambiguous declarations explicitly unavailable", () => {
    expect(projectGhostRunDnaTheater(capsule([])).unavailable).toContain("no declared run-dna-metrics-v1 result");
    const ambiguous = projectGhostRunDnaTheater(capsule([
      { kind: "run-dna-metrics-v1", metrics: {} }, { kind: "run-dna-metrics-v1", metrics: {} },
    ]));
    expect(ambiguous.available).toBe(false);
    expect(ambiguous.unavailable).toContain("ambiguous run-dna-metrics-v1 results");
    expect(ambiguous.sourceMetrics.attacks).toBeUndefined();
  });
});
