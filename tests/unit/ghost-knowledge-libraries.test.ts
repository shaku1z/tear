import { describe, expect, it } from "vitest";

import {
  GhostCorpus,
  GhostLineageGraph,
  GovernedGhostLibrary,
  compileGhostRangeToTearSdl,
  createGhostV3,
  promoteReviewedGhostToCanon,
  recordScenarioExecutionAsGhost,
  triageRareGhostToFrontier,
  type GhostReplayTrident,
} from "../../src/ghost";
import type { GhostRangeV1, TearCausalEventV1, TearSnapshotV1 } from "../../src/tearbench";

const trident: GhostReplayTrident = {
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "test" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "test" },
  visual: { kind: "visual", status: "verified", available: true, resumable: false, seekable: true, reason: "test" },
};

function event(id: string, tick: number, parents: readonly string[] = []): TearCausalEventV1 {
  return {
    format: "tear-contract", kind: "event", schemaVersion: 1,
    id, type: "test.invariant-failed", tick, phase: "post-simulation-commit", sequence: 1,
    source: "developer", parentIds: parents,
    payload: { message: "failure", playerName: "Private Player", accountId: "secret" },
  };
}

function snapshot(): TearSnapshotV1 {
  return {
    format: "tear-contract", kind: "snapshot", schemaVersion: 1,
    id: "failure-start", tick: 10, stateClass: "recorded-canonical", seed: "7",
    hashes: { exact: "e", semantic: "s", visual: "v", progression: "p", environment: "n" },
    provenance: {
      actor: "developer", producer: "test",
      build: {
        version: "1", revision: "r", target: "unit", rulesetVersion: "rules",
        contentHash: "c", configHash: "g",
      },
      executionClass: "engineering", observationClass: "structured-state", trainingConsent: "no-training",
    },
    rng: {}, codecs: {},
    state: {
      "tear.run.v1": { mode: "campaign", difficulty: "normal", weapon: "sword", wave: 2 },
      profile: { playerName: "Private Player", email: "private@example.test", currency: 10 },
    },
  };
}

function sourceGhost() {
  return createGhostV3({
    id: "failure-ghost",
    rulesetVersion: "rules",
    sourceClassification: "native-v3",
    trident,
    actions: [{ kind: "command", id: 1, tick: 20, command: { type: "dash", x: 1_000, y: 0 } }],
    snapshots: [snapshot()],
    events: [event("cause", 8), event("failure", 20, ["cause"])],
    visual: { watchable: true },
  });
}

describe("governed Ghost knowledge libraries", () => {
  it("turns a failure into sanitized deterministic TearSDL and a watchable child Ghost", () => {
    const ghost = sourceGhost();
    const range: GhostRangeV1 = {
      format: "tear-contract", kind: "ghost-range", schemaVersion: 1,
      ghostId: ghost.id, fromTick: 18, toTick: 22, preRollTicks: 5, postRollTicks: 5,
      requiredCheckpointId: "failure-start",
    };
    const bridge = compileGhostRangeToTearSdl(ghost, range, snapshot());
    expect(bridge.selectedEventIds).toEqual(["failure"]);
    expect(bridge.requiredHistoryIds).toEqual(["cause"]);
    expect(JSON.stringify(bridge.document)).not.toMatch(/Private Player|private@example|secret/u);
    expect(bridge.document.stateClass).toBe("recorded-canonical");

    const child = recordScenarioExecutionAsGhost(bridge, {
      id: "failure-minimal-child",
      stateClass: "surgical-valid",
      actions: ghost.actions,
      snapshots: ghost.snapshots,
      events: ghost.events,
      trident,
    });
    expect(child).toMatchObject({
      id: "failure-minimal-child.tearghost",
      stateClass: "surgical-valid",
      ghost: { trident: { visual: { available: true } } },
      branchProvenance: {
        sourceScenarioId: bridge.document.id,
        sourceGhostId: ghost.id,
        sourceRootHash: ghost.rootHash,
        relation: "scenario",
      },
    });
  });

  it("keeps Canon, Graveyard, Frontier, and Corpus from being silently mixed", () => {
    const ghost = sourceGhost();
    const canon = new GovernedGhostLibrary("canon");
    const graveyard = new GovernedGhostLibrary("graveyard");
    const frontier = new GovernedGhostLibrary("frontier");
    const promoted = promoteReviewedGhostToCanon(canon, ghost, {
      approved: true, reviewer: "reviewer-1", at: "2026-07-23T00:00:00.000Z",
    });
    expect(() => { graveyard.add(promoted); }).toThrow(/cannot add canon/u);
    expect(triageRareGhostToFrontier(frontier, ghost, 0.95, "2026-07-23T00:00:00.000Z")).toBeDefined();
    expect(triageRareGhostToFrontier(frontier, ghost, 0.5, "2026-07-23T00:00:00.000Z")).toBeUndefined();
    expect(canon.list()).toHaveLength(1);
    expect(graveyard.list()).toHaveLength(0);
    expect(frontier.list()).toHaveLength(1);
  });

  it("records all governed lineage relation kinds", () => {
    const graph = new GhostLineageGraph();
    graph.addNode({ id: "root", rootHash: "root", kind: "ghost" });
    const relations = [
      "migration", "repair", "clip", "fork", "challenge", "correction",
      "scenario", "minimization", "training", "promotion",
    ] as const;
    for (const relation of relations) {
      const child = `${relation}-child`;
      graph.addNode({ id: child, rootHash: child, kind: relation === "scenario" ? "scenario" : "ghost" });
      graph.connect({
        id: `${relation}-edge`, parentId: "root", childId: child, relation,
        createdAt: "2026-07-23T00:00:00.000Z",
      });
    }
    expect(graph.childrenOf("root").map((edge) => edge.relation)).toEqual(relations);
    expect(graph.parentsOf("training-child")).toHaveLength(1);
  });

  it("enforces Corpus consent, deduplication, split assignment, and hidden holdouts", () => {
    const corpus = new GhostCorpus();
    const ghost = sourceGhost();
    corpus.ingest({
      ghost, consent: "anonymous-improvement", split: "hidden-holdout",
      createdAt: "2026-07-23T00:00:00.000Z", producer: "agent",
    });
    expect(corpus.list()).toEqual([]);
    expect(corpus.list(true)).toHaveLength(1);
    expect(() => corpus.ingest({
      ghost, consent: "public-training", split: "train",
      createdAt: "2026-07-23T00:00:00.000Z", producer: "agent",
    })).toThrow(/duplicate/u);
  });
});
