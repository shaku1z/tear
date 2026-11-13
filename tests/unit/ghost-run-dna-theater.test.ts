import { describe, expect, it } from "vitest";
import type { GhostReadCapsule } from "../../src/ghost/capsule-reader";
import { projectGhostRunDnaTheater } from "../../src/ghost/run-dna-theater";
import { RunDnaObserver } from "../../src/gameplay/runtime/run-dna-observer";
import { createGhostReplayRunContext } from "../../src/ghost/replay-admission";
import { createLiveGhostCausalEvent } from "../../src/ghost/live-causal-events";

function capsule(results: readonly unknown[]): GhostReadCapsule {
  return { manifest: { id: "verified-run" }, maxTick: 12, tracks: { commands: [], rng: [], events: [], keyframes: [], presentation: [],
    results: results.map((value, tick) => ({ kind: "results" as const, tick, value })) } } as unknown as GhostReadCapsule;
}

describe("verified Run DNA Theater projection", () => {
  it("leaves precision unavailable for a declared whole-run interval with no attacks", () => {
    // Projection contract only; native combat production is exercised separately.
    const observer = new RunDnaObserver("quiet-run", "quiet-capsule");
    observer.observeLoadout({ x: 0, y: 0, maxHp: 100 }, { mode: "endless", weaponId: "sword" });
    const result = observer.capture(0);
    const context = createGhostReplayRunContext({ runId: "quiet-run", seed: "quiet", mode: "endless", difficulty: "normal", weaponId: "sword", ticksPerSecond: 120,
      build: { version: "test", revision: "test", target: "test-standalone", rulesetVersion: "test", configHash: "test", contentHash: "test" }, rng: { gameplay: { state: 1 } } });
    const base = capsule([result]);
    const events = (["started", "abandoned"] as const).map((transition, index) => ({ kind: "events" as const, tick: 0, value: createLiveGhostCausalEvent({ kind: "run", tick: 0,
      transition, runId: "quiet-run", mode: "endless", difficulty: "normal", weaponId: "sword", wave: 1, score: 0, runTimeSeconds: 0 }, index + 1) }));
    const view = projectGhostRunDnaTheater({ ...base, maxTick: 0, manifest: { ...base.manifest, id: "quiet-capsule", status: "complete", provenance: { replayContext: context } }, tracks: { ...base.tracks, events } });
    expect(view.nativePolicy).toBe("native-combat-episodes-v1");
    expect(view.dimensions?.precision).toBeUndefined();
    expect(view.unavailable).toContain("precision: no accepted attack episodes");
  });
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
