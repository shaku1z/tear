import { describe, expect, it } from "vitest";

import {
  buryGraveyardEntry,
  createGraveyardArtifactReference,
  createGraveyardEntry,
  createGraveyardRegistry,
  createGraveyardReplayRequest,
  reopenGraveyardEntry,
  selectGraveyardEntries,
  validateGraveyardRegistry,
  type TearBenchRunArtifactV1,
  type TearFailureArtifactV1,
  type TearObservationV1,
} from "../../src/tearbench";

const observation: TearObservationV1 = {
  format: "tear-contract", kind: "observation", schemaVersion: 1, tick: 0, observationClass: "structured-state",
  player: { x: 100, y: 600, vx: 0, vy: 0, hp: 100, maxHp: 100, facing: 1, grounded: true, dashCharges: 1 },
  blade: { handX: 120, handY: 580, tipX: 180, tipY: 560, vx: 0, vy: 0, tipSpeed: 0, state: "held" },
  entities: [], run: { mode: "campaign", difficulty: "normal", weapon: "sword", stage: "grounds", wave: 1, score: 0, elapsedTicks: 0 }, availableActions: [],
};

function failedArtifact(id: string): TearFailureArtifactV1 {
  return {
    format: "tear-contract",
    kind: "failure",
    schemaVersion: 1,
    id,
    scenarioId: "dash-one-way-platform",
    scenarioVersion: 1,
    seed: "graveyard-seed",
    build: { version: "0.1.0", revision: "bad", target: "test", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" },
    firstFailureTick: 33,
    invariantId: "world.legal-bounds",
    severity: "error",
    message: "planted dash regression",
    actions: [],
    eventIds: [],
    hashes: { semantic: "semantic", exact: "exact", visual: "visual", progression: "progression", environment: "environment" },
    attachments: {},
  };
}

function fixedArtifact(): TearBenchRunArtifactV1 {
  return {
    format: "tearbench-run",
    schemaVersion: 1,
    id: "fixed-dash-run",
    createdAt: "2026-07-28T00:00:00.000Z",
    build: { version: "0.1.0", revision: "f00dbad", target: "test", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" },
    resolvedScenario: {
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id: "dash-one-way-platform", version: 1, description: "Dash", stateClass: "recorded-canonical", executionClass: "engineering",
      seed: "graveyard-seed", start: { mode: "campaign", difficulty: "normal", weapon: "sword" }, maxTicks: 60, assertions: [], tags: [],
    },
    seed: "graveyard-seed",
    status: "truncated",
    ticks: 60,
    actions: [], events: [], observations: [observation], metrics: {}, failures: [], console: [], hashes: { semantic: "fixed" }, attachments: {},
    rerun: { scenarioId: "dash-one-way-platform", scenarioVersion: 1, seed: "graveyard-seed", actionTrace: "fixed.actions.json" },
  };
}

function minimizedReplayRun(): TearBenchRunArtifactV1 {
  const fixed = fixedArtifact();
  return {
    ...fixed,
    id: "minimal-dash-replay",
    status: "truncated",
    actions: [{ kind: "command", id: 1, tick: 1, command: { type: "dash", x: 1000, y: 0 } }],
    failures: [],
    hashes: { semantic: "minimal-replay" },
  };
}

function entryAndArtifacts() {
  const original = failedArtifact("full-trace-failure");
  const minimal = failedArtifact("dash-only-failure");
  const minimalReplay = minimizedReplayRun();
  const minimalActions = minimalReplay.actions;
  const matchedMinimal = { ...minimal, actions: minimalActions };
  const verification = fixedArtifact();
  const entry = createGraveyardEntry({
    id: "dash-distance-regression",
    signature: "sha256:dash-distance",
    original: createGraveyardArtifactReference(original, "artifacts/graveyard/full.json"),
    minimalChild: createGraveyardArtifactReference(matchedMinimal, "artifacts/graveyard/minimal.json"),
    minimalReplay: { side: "candidate", artifact: createGraveyardArtifactReference(minimalReplay, "artifacts/graveyard/minimal-replay.json") },
    invariantId: "world.legal-bounds",
    selectors: ["movement-boundary-history"],
    ownership: { owner: "gameplay", hints: ["dash resolution"] },
    fix: {
      commit: "f00dbad",
      verification: {
        base: createGraveyardArtifactReference(verification, "artifacts/graveyard/fixed-base.json"),
        candidate: createGraveyardArtifactReference({ ...verification, id: "fixed-dash-candidate", build: { ...verification.build, revision: "f00dbee" } }, "artifacts/graveyard/fixed-candidate.json"),
      },
      recordedAt: "2026-07-28T00:00:00.000Z",
    },
    reopenHistory: [],
  });
  return {
    entry,
    artifacts: {
      "artifacts/graveyard/full.json": original,
      "artifacts/graveyard/minimal.json": matchedMinimal,
      "artifacts/graveyard/minimal-replay.json": minimalReplay,
      "artifacts/graveyard/fixed-base.json": verification,
      "artifacts/graveyard/fixed-candidate.json": { ...verification, id: "fixed-dash-candidate", build: { ...verification.build, revision: "f00dbee" } },
    },
  };
}

describe("persistent TearBench Graveyard", () => {
  it("retains original, minimized, fix, invariant, ownership, and pinned evidence", () => {
    const { entry, artifacts } = entryAndArtifacts();
    const registry = buryGraveyardEntry(createGraveyardRegistry(), entry);

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.entries)).toBe(true);
    expect(registry.entries[0]).toMatchObject({
      id: "dash-distance-regression",
      status: "closed",
      invariantId: "world.legal-bounds",
      ownership: { owner: "gameplay" },
      original: { id: "full-trace-failure", status: "failed" },
      minimalChild: { id: "dash-only-failure", status: "failed" },
      fix: { commit: "f00dbad", verification: { base: { id: "fixed-dash-run", status: "truncated" }, candidate: { id: "fixed-dash-candidate", status: "truncated" } } },
    });
    expect(() => validateGraveyardRegistry(registry, artifacts)).not.toThrow();
  });

  it("rejects a missing, substituted, or tampered artifact reference", () => {
    const { entry, artifacts } = entryAndArtifacts();
    const registry = buryGraveyardEntry(createGraveyardRegistry(), entry);
    expect(() => validateGraveyardRegistry(registry, {})).toThrow("artifact is missing");
    expect(() => validateGraveyardRegistry(registry, {
      ...artifacts,
      "artifacts/graveyard/minimal.json": failedArtifact("substituted-minimal"),
    })).toThrow("reference does not match");
    const first = registry.entries.at(0);
    if (first === undefined) throw new Error("expected buried entry");
    const tampered = {
      ...registry,
      entries: [{ ...first, signature: "sha256:edited-after-burial" }],
    };
    expect(() => validateGraveyardRegistry(tampered)).toThrow("evidence hash");
  });

  it("reopens by producing a new immutable registry without erasing history", () => {
    const { entry } = entryAndArtifacts();
    const closed = buryGraveyardEntry(createGraveyardRegistry(), entry);
    const reopened = reopenGraveyardEntry(closed, entry.id, {
      at: "2026-07-29T00:00:00.000Z",
      reason: "new candidate reproduces the invariant",
    });

    expect(closed.entries[0]?.status).toBe("closed");
    expect(closed.entries[0]?.reopenHistory).toEqual([]);
    expect(reopened.entries[0]?.status).toBe("reopened");
    expect(reopened.entries[0]?.reopenHistory).toEqual([
      { at: "2026-07-29T00:00:00.000Z", reason: "new candidate reproduces the invariant" },
    ]);
    expect(() => buryGraveyardEntry(reopened, entry)).toThrow("already exists");
  });

  it("derives a clean-process replay only from the persisted minimized run and selects it by future diff evidence", () => {
    const { entry, artifacts } = entryAndArtifacts();
    const registry = buryGraveyardEntry(createGraveyardRegistry(), entry);
    const selected = selectGraveyardEntries(registry, ["movement-boundary-history"]);
    expect(selected.map((item) => item.id)).toEqual([entry.id]);
    expect(selectGraveyardEntries(registry, ["all-shared-runtime-history"])).toHaveLength(1);
    const selectedEntry = selected.at(0);
    if (selectedEntry === undefined) throw new Error("expected selected graveyard entry");

    expect(createGraveyardReplayRequest(selectedEntry, artifacts)).toMatchObject({
      entryId: entry.id,
      scenarioId: "dash-one-way-platform",
      seed: "graveyard-seed",
      maxTicks: 60,
      invariantId: "world.legal-bounds",
      actions: [{ command: { type: "dash" } }],
    });
  });

  it("requires distinct failed original/minimal evidence and a passed fixed verification", () => {
    const { entry } = entryAndArtifacts();
    const { evidenceHash: _evidenceHash, status: _status, ...entryInput } = entry;
    void _evidenceHash;
    void _status;
    expect(() => createGraveyardEntry({
      ...entryInput,
      minimalChild: entry.original,
    })).toThrow("distinct");
    expect(() => createGraveyardEntry({
      ...entryInput,
      fix: { ...entry.fix, verification: { base: entry.original, candidate: entry.original } },
    })).toThrow("fix verification");
  });

  it("refuses a case whose separately retained replay does not preserve the minimized failure action trace", () => {
    const { entry, artifacts } = entryAndArtifacts();
    const registry = buryGraveyardEntry(createGraveyardRegistry(), entry);
    expect(() => validateGraveyardRegistry(registry, {
      ...artifacts,
      "artifacts/graveyard/minimal-replay.json": fixedArtifact(),
    })).toThrow("artifact reference does not match");
  });
});
