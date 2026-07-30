import { describe, expect, it } from "vitest";

import {
  GhostLongitudinalSkillGraph,
  analyzeGhostCoaching,
  calculateDraftRegret,
  compileFindingToDrill,
  createGhostV3,
  explainStructuredFinding,
  selectOneFix,
  type GhostCoachBaseline,
  type GhostReplayTrident,
} from "../../src/ghost";
import type { TearCausalEventV1, TearSnapshotV1 } from "../../src/tearbench";

const trident: GhostReplayTrident = {
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "test" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "test" },
  visual: { kind: "visual", status: "verified", available: true, resumable: false, seekable: true, reason: "test" },
};

function event(id: string, type: TearCausalEventV1["type"], tick: number): TearCausalEventV1 {
  return {
    format: "tear-contract", kind: "event", schemaVersion: 1,
    id, type, tick, phase: "post-simulation-commit", sequence: 1, source: "engine", payload: {},
  };
}

const events = [
  event("dash", "player.dash-started", 10),
  event("blade", "blade.swing-committed", 20),
  event("damage", "player.damaged", 30),
  event("target", "agent.target-changed", 40),
  event("draft", "draft.offered", 50),
  event("boss", "boss.attack-started", 60),
  event("wave", "wave.cleared", 70),
];

function snapshot(): TearSnapshotV1 {
  return {
    format: "tear-contract", kind: "snapshot", schemaVersion: 1,
    id: "coach-start", tick: 0, stateClass: "recorded-canonical", seed: "coach-seed",
    hashes: { exact: "e", semantic: "semantic-state", visual: "v", progression: "p", environment: "n" },
    provenance: {
      actor: "human", producer: "player",
      build: {
        version: "1", revision: "r", target: "unit", rulesetVersion: "rules",
        contentHash: "c", configHash: "g",
      },
      executionClass: "engineering", observationClass: "human-equivalent",
      trainingConsent: "private-personalization-only",
    },
    rng: {}, codecs: {},
    state: { "tear.run.v1": { mode: "campaign", difficulty: "normal", weapon: "sword", wave: 3 } },
  };
}

function ghost(visual: unknown) {
  return createGhostV3({
    id: "coach-ghost",
    rulesetVersion: "rules",
    sourceClassification: "native-v3",
    trident,
    actions: [{ kind: "command", id: 1, tick: 10, command: { type: "dash", x: 1_000, y: 0 } }],
    snapshots: [snapshot()],
    events,
    visual: visual as Readonly<Record<string, unknown>>,
  });
}

const metrics = {
  "movement.idleRatio": 0.4,
  "blade.missRatio": 0.5,
  "defense.damagePerMinute": 20,
  "targeting.badSwitchRatio": 0.3,
  "draft.regret": 0.2,
  "boss.missedPunishRatio": 0.45,
  "run.resourceWasteRatio": 0.35,
};

const baselines: GhostCoachBaseline[] = Object.entries(metrics).map(([metric, value], index) => ({
  kind: (["personal", "peer-band", "same-build", "tearbot", "expert"] as const)[index % 5] ?? "personal",
  id: `baseline-${String(index)}`,
  metric,
  value: value / 2,
  sampleCount: 100,
}));

describe("Ghost Coach", () => {
  it("produces reproducible structured findings for every analyzer domain", () => {
    const tracks = { ghost: ghost({ color: "red" }), metrics, buildId: "build", finalTick: 100 };
    const first = analyzeGhostCoaching(tracks, baselines);
    const second = analyzeGhostCoaching(tracks, baselines);
    expect(first.map((finding) => finding.domain)).toEqual([
      "movement", "blade", "defense", "targeting", "draft", "boss", "run-management",
    ]);
    expect(first.map((finding) => finding.evidenceHash)).toEqual(second.map((finding) => finding.evidenceHash));
    for (const finding of first) {
      expect(finding).toHaveProperty("range");
      expect(finding).toHaveProperty("eventIds");
      expect(finding).toHaveProperty("metrics");
      expect(finding).toHaveProperty("confidence");
      expect(finding).toHaveProperty("baseline");
      expect(finding).toHaveProperty("suggestedDrill");
    }
  });

  it("computes draft regret from counterfactual rollouts with uncertainty", () => {
    const regret = calculateDraftRegret("guard", [
      { choiceId: "guard", meanOutcome: 100, standardError: 2, rolloutCount: 50 },
      { choiceId: "tempo", meanOutcome: 120, standardError: 3, rolloutCount: 50 },
      { choiceId: "reach", meanOutcome: 105, standardError: 2, rolloutCount: 50 },
    ]);
    expect(regret).toMatchObject({ selectedChoiceId: "guard", bestChoiceId: "tempo", estimatedRegret: 20, supported: true });
    expect(regret.uncertainty95).toBeGreaterThan(0);
  });

  it("selects one fix and compiles a legal repeatable drill with available actions required", () => {
    const findings = analyzeGhostCoaching(
      { ghost: ghost({}), metrics, buildId: "build", finalTick: 100 },
      baselines,
    );
    const priority = selectOneFix(findings);
    if (priority === undefined) throw new Error("fixture finding is missing");
    const drill = compileFindingToDrill(priority, snapshot());
    expect(drill.state).toMatchObject({
      snapshotId: "coach-start",
      targetSkill: priority.domain,
      availableActionsRequired: true,
    });
    expect(drill.constraints).toMatchObject({ legalState: true });
  });

  it("ignores cosmetic-only replay changes when deriving conclusions", () => {
    const red = analyzeGhostCoaching({ ghost: ghost({ color: "red" }), metrics, buildId: "build", finalTick: 100 }, baselines);
    const blue = analyzeGhostCoaching({ ghost: ghost({ color: "blue", particles: 10_000 }), metrics, buildId: "build", finalTick: 100 }, baselines);
    expect(red.map((finding) => finding.evidenceHash)).toEqual(blue.map((finding) => finding.evidenceHash));
    expect(red.map((finding) => finding.metrics)).toEqual(blue.map((finding) => finding.metrics));
  });

  it("requires repeated measured drill improvement before making a claim", () => {
    const graph = new GhostLongitudinalSkillGraph();
    graph.add({ at: "2026-07-20", domain: "defense", value: 20 });
    graph.add({ at: "2026-07-21", domain: "defense", value: 18, drillId: "parry-drill" });
    graph.add({ at: "2026-07-22", domain: "defense", value: 15, drillId: "parry-drill" });
    expect(graph.improvement("defense", true).supported).toBe(false);
    graph.add({ at: "2026-07-23", domain: "defense", value: 12, drillId: "parry-drill" });
    expect(graph.improvement("defense", true)).toEqual({ supported: true, delta: -8, repetitions: 3 });
  });

  it("allows language models to explain but not invent structured evidence", async () => {
    const finding = analyzeGhostCoaching(
      { ghost: ghost({}), metrics, buildId: "build", finalTick: 100 },
      baselines,
    )[0];
    if (finding === undefined) throw new Error("fixture finding is missing");
    const result = await explainStructuredFinding(finding, {
      explain: (input) => Promise.resolve(`Practice ${input.suggestedDrill.title}.`),
    });
    expect(result.finding).toBe(finding);
    expect(result.explanation).toMatch(/^Practice/u);
  });
});
