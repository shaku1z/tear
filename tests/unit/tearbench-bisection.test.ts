import { describe, expect, it } from "vitest";

import {
  classifyBisectAttempts,
  createBisectRevisionRecord,
  deriveBisectOwnershipHints,
  selectFirstStableBadRevision,
  validateBisectRequest,
} from "../../src/tearbench/bisection";

const attempts = (outcomes: readonly ("reproduces" | "does-not-reproduce")[]) => outcomes.map((outcome, index) => ({
  attempt: index + 1,
  outcome,
  artifactPath: `artifacts/attempt-${String(index + 1)}.json`,
}));

describe("TearBench guarded local bisection", () => {
  it("requires bounded repeated evidence before any worktree is created", () => {
    expect(validateBisectRequest({ goodRevision: "good", badRevision: "bad", repetitions: 3, maxRevisions: 24 }))
      .toMatchObject({ repetitions: 3, maxRevisions: 24 });
    expect(() => validateBisectRequest({ goodRevision: "good", badRevision: "bad", repetitions: 1, maxRevisions: 24 }))
      .toThrow("2 through 10");
    expect(() => validateBisectRequest({ goodRevision: "good", badRevision: "bad", repetitions: 3, maxRevisions: 65 }))
      .toThrow("2 through 64");
  });

  it("preserves repeated reproduction records and refuses flaky attribution", () => {
    expect(classifyBisectAttempts(attempts(["reproduces", "reproduces"]))).toBe("reproduces");
    expect(classifyBisectAttempts(attempts(["does-not-reproduce", "does-not-reproduce"]))).toBe("does-not-reproduce");
    expect(classifyBisectAttempts(attempts(["does-not-reproduce", "reproduces"]))).toBe("unstable");
    expect(() => createBisectRevisionRecord("candidate", [{ attempt: 1, outcome: "execution-error" }, { attempt: 2, outcome: "execution-error", error: "build failed" }]))
      .toThrow("requires its error evidence");
  });

  it("only returns a first-bad revision for stable monotonic evidence", () => {
    const bad = createBisectRevisionRecord("bad", attempts(["reproduces", "reproduces"]));
    const records = [
      createBisectRevisionRecord("good", attempts(["does-not-reproduce", "does-not-reproduce"])),
      createBisectRevisionRecord("middle", attempts(["does-not-reproduce", "does-not-reproduce"])),
      createBisectRevisionRecord("first-bad", attempts(["reproduces", "reproduces"])),
      bad,
    ];
    expect(selectFirstStableBadRevision(records)).toEqual({ firstBadRevision: "first-bad" });
    const unstable = [...records.slice(0, 2), createBisectRevisionRecord("first-bad", attempts(["reproduces", "does-not-reproduce"])), bad];
    expect(selectFirstStableBadRevision(unstable).reason).toContain("unstable");
  });

  it("produces reviewable ownership hints from changed paths and the first material tick", () => {
    const hints = deriveBisectOwnershipHints({
      changedPaths: ["src/gameplay/entities/player.ts", "src/presentation/hud.ts"],
      firstBadRevision: "abc123",
      investigation: {
        format: "tearbench-regression-investigation", schemaVersion: 1, createdAt: "2026-07-28T00:00:00.000Z",
        observationClass: "privileged-diagnostic", coordinates: { scenarioId: "movement-jump", scenarioVersion: 1, seed: "42", actionsHash: "a", target: "test", rulesetVersion: "v1", configHash: "c" },
        base: { id: "base", build: {} as never, artifactHash: "base" }, candidate: { id: "candidate", build: {} as never, artifactHash: "candidate" },
        comparison: { equivalent: false, firstMaterialDivergence: { tick: 37, base: { tick: 37, semanticHash: "base" }, candidate: { tick: 37, semanticHash: "candidate" } }, downstreamDivergenceTicks: [] },
        status: "diverged", evidenceHash: "e",
      },
    });
    expect(hints.route.owner).toBe("presentation");
    expect(hints.hints).toContain("first material divergence was observed at fixed tick 37");
    expect(hints.hints.join(" ")).toContain("abc123");
  });
});
