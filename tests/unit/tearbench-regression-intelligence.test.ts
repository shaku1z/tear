import { describe, expect, it } from "vitest";

import {
  TearGhostGraveyard,
  adjudicateFailure,
  bisectStableRegression,
  clusterFailureSignatures,
  compareRegressionTraces,
  createFailureSignature,
  minimizeRecord,
  minimizeTimeline,
  routeRegressionOwnership,
  type TearRegressionFrame,
} from "../../src/tearbench";

type Action = "move" | "jump" | "dash" | "aim";

function trace(actions: readonly Action[], plantedRegression: boolean): TearRegressionFrame[] {
  let x = 0;
  return actions.map((action, index) => {
    const distance = action === "move" ? 1 : action === "dash" ? (plantedRegression ? 8 : 4) : 0;
    x += distance;
    return {
      tick: index + 1,
      semanticHash: `x:${String(x)}`,
      actionHash: action,
      state: { x },
      entityHashes: { player: `x:${String(x)}` },
      rng: { combat: "unchanged" },
      buildHash: "build-1",
    };
  });
}

describe("TearBench regression intelligence", () => {
  it("finds the planted first material divergence separately from downstream effects", () => {
    const actions: Action[] = ["move", "jump", "dash", "aim", "move"];
    const comparison = compareRegressionTraces(trace(actions, false), trace(actions, true));
    expect(comparison.equivalent).toBe(false);
    expect(comparison.firstMaterialDivergence).toMatchObject({ tick: 3 });
    expect(comparison.downstreamDivergenceTicks).toEqual([4, 5]);
  });

  it("reproduces and minimizes action, timeline, state, entity, build, and RNG evidence", () => {
    const original: Action[] = ["move", "jump", "dash", "aim", "move"];
    let verifications = 0;
    const minimized = minimizeTimeline(original, (candidate) => {
      verifications += 1;
      return candidate.includes("dash");
    }, 5);
    expect(minimized).toEqual(["dash"]);
    expect(verifications).toBeGreaterThanOrEqual(5);

    const record = { player: "same", enemy: "same", dashDistance: 8, rng: "same", build: "same" };
    const minimizedRecord = minimizeRecord(record, (candidate) => candidate.dashDistance === 8, 4);
    expect(minimizedRecord).toEqual({ dashDistance: 8 });
  });

  it("creates stable signatures, clusters failures, and adjudicates multiple policies", () => {
    const signature = createFailureSignature({
      scenarioId: "dash-one-way-platform",
      invariantId: "world.legal-bounds",
      firstDivergenceTick: 3,
      stateClass: "surgical-valid",
      entityKinds: ["player", "platform"],
    });
    const clusters = clusterFailureSignatures([
      { id: "one", signature },
      { id: "two", signature },
      { id: "other", signature: "sha256:other" },
    ]);
    expect(clusters.get(signature)).toHaveLength(2);
    expect(adjudicateFailure([
      { policyId: "competent", basePassed: true, candidatePassed: false, evidenceComplete: true, infrastructureHealthy: true },
      { policyId: "smoke", basePassed: true, candidatePassed: false, evidenceComplete: true, infrastructureHealthy: true },
    ])).toBe("product");
    expect(adjudicateFailure([
      { policyId: "competent", basePassed: true, candidatePassed: false, evidenceComplete: true, infrastructureHealthy: true },
      { policyId: "smoke", basePassed: true, candidatePassed: true, evidenceComplete: true, infrastructureHealthy: true },
    ])).toBe("policy");
  });

  it("routes ownership, bisects a stable reproduction, and retains graveyard history", () => {
    const ownership = routeRegressionOwnership(["src/gameplay/entities/player.ts"]);
    expect(ownership.owner).toBe("gameplay");
    const firstBad = bisectStableRegression(["a", "b", "c", "d", "e"], (commit) => ["d", "e"].includes(commit));
    expect(firstBad).toBe("d");

    const graveyard = new TearGhostGraveyard();
    graveyard.bury({
      id: "dash-distance-regression",
      signature: "sha256:signature",
      originalFailureId: "failure-full",
      minimalChildId: "failure-dash-only",
      fixCommit: "fixed-in-working-tree",
      invariantId: "world.legal-bounds",
      ownership,
      reopenHistory: [],
    });
    graveyard.reopen("dash-distance-regression", "2026-07-23T00:00:00.000Z", "mutation test reproduced");
    expect(graveyard.get("dash-distance-regression").reopenHistory).toHaveLength(1);
  });

  it("keeps the planted regression fixed as a permanent scenario assertion", () => {
    const actions: Action[] = ["move", "jump", "dash", "aim", "move"];
    const fixed = trace(actions, false);
    expect(fixed.at(-1)?.semanticHash).toBe("x:6");
    expect(compareRegressionTraces(fixed, trace(actions, false)).equivalent).toBe(true);
  });
});
