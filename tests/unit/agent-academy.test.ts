import { describe, expect, it } from "vitest";

import {
  CANONICAL_ACADEMY_LESSONS,
  TearDemonstrationCorpus,
  decodeBehaviorCloningManifest,
  encodeBehaviorCloningManifest,
  reviewDemonstration,
  trainBehaviorClonedPolicy,
  type TearAcademySample,
  type TearDatasetSplit,
} from "../../src/agents";
import type { GameAction } from "../../src/input/game-action";
import type { TearObservationV1 } from "../../src/tearbench";

function observation(tick: number, kind: "safe" | "recovery" | "parry", variation = 0): TearObservationV1 {
  const low = kind === "recovery";
  return {
    format: "tear-contract", kind: "observation", schemaVersion: 1, tick,
    observationClass: "structured-state",
    player: {
      x: 100 + variation, y: 600, vx: 0, vy: 0, hp: low ? 20 : 100, maxHp: 100,
      facing: 1, grounded: true, dashCharges: 1,
    },
    blade: {
      handX: 120, handY: 580, tipX: 180, tipY: 560,
      vx: 0, vy: 0, tipSpeed: 0, state: "held",
    },
    entities: kind === "parry"
      ? [{ id: `shot-${String(variation)}`, kind: "projectile", x: 150, y: 600, vx: -10, vy: 0 }]
      : [{ id: `enemy-${String(variation)}`, kind: "charger", x: 250, y: 600, vx: 0, vy: 0 }],
    run: {
      mode: "campaign", difficulty: "normal", weapon: "sword",
      stage: "grounds", wave: 1, score: 0, elapsedTicks: tick,
    },
    availableActions: ["move", "dash", "aim", "weapon"],
  };
}

const actions: Record<"safe" | "recovery" | "parry", readonly GameAction[]> = {
  safe: [{ type: "move", x: 1_000, y: 0 }],
  recovery: [{ type: "move", x: -1_000, y: 0 }, { type: "dash", x: -1_000, y: 0 }],
  parry: [{ type: "aim", turn: 0 }, { type: "weapon", intent: "primary", phase: "pressed" }],
};

function sample(
  id: string,
  lessonId: string,
  kind: "safe" | "recovery" | "parry",
  variation = 0,
  segmentKind: TearAcademySample["segmentKind"] = "demonstration",
): TearAcademySample {
  const tick = 10 + variation;
  return {
    id, lessonId, seed: `seed-${String(variation)}`,
    capsuleId: `capsule-${id}`, fromTick: tick - 2, toTick: tick + 2,
    observation: observation(tick, kind, variation),
    actions: actions[kind],
    events: [],
    rewardComponents: { survival: kind === "recovery" ? 1 : 0, progress: 1 },
    build: { weapon: "sword", upgrade: "tempo" },
    device: "semantic",
    provenance: {
      actor: segmentKind === "human-takeover" ? "human" : "scripted-bot",
      producer: "academy-test",
      build: {
        version: "1", revision: "r", target: "unit", rulesetVersion: "rules",
        contentHash: "content", configHash: "config",
      },
      executionClass: "training",
      observationClass: "structured-state",
      policyId: "teacher-v1",
      trainingConsent: "anonymous-improvement",
    },
    consent: "anonymous-improvement",
    segmentKind,
    tags: [kind, lessonId],
    ...(segmentKind === "policy-correction" ? { correctionOf: `${id}-mistake` } : {}),
  };
}

const approvedReview = reviewDemonstration({
  approved: true,
  reviewer: "academy-reviewer",
  tags: ["clean", "synchronized"],
  quality: { synchronization: 1, actionClarity: 0.9, outcomeValue: 0.9, recoveryValue: 0.8 },
});

function feature(value: TearObservationV1): string {
  if (value.player.hp / value.player.maxHp < 0.3) return "low-health";
  if (value.entities.some((entity) => entity.kind === "projectile")) return "incoming-projectile";
  return "safe-navigation";
}

describe("Agent Academy and demonstration corpus", () => {
  it("defines canonical lessons for every required teaching domain", () => {
    expect(CANONICAL_ACADEMY_LESSONS.map((lesson) => lesson.domain)).toEqual([
      "movement", "blade", "defense", "enemies", "bosses", "strategy", "interface",
    ]);
    expect(CANONICAL_ACADEMY_LESSONS.filter((lesson) => lesson.recoveryRequired).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps every synchronized sample tied to a capsule interval and consent state", () => {
    const corpus = new TearDemonstrationCorpus();
    const splits: readonly TearDatasetSplit[] = ["training", "validation", "calibration", "hidden-release-exam"];
    const segmentKinds = ["demonstration", "recovery", "human-takeover", "policy-correction"] as const;
    CANONICAL_ACADEMY_LESSONS.forEach((lesson, index) => {
      const entry = corpus.add(
        sample(`sample-${String(index)}`, lesson.id, index % 3 === 0 ? "recovery" : "safe", index, segmentKinds[index % 4]),
        approvedReview,
        splits[index % splits.length] ?? "training",
      );
      expect(entry.sample.observation.tick).toBeGreaterThanOrEqual(entry.sample.fromTick);
      expect(entry.sample.observation.tick).toBeLessThanOrEqual(entry.sample.toTick);
      expect(entry.sample.consent).toBe("anonymous-improvement");
    });
    expect(corpus.entries()).toHaveLength(6);
    expect(corpus.entries(true)).toHaveLength(7);
  });

  it("survives encode/decode without observation or action drift", () => {
    const corpus = new TearDemonstrationCorpus();
    corpus.add(sample("encoded", "movement-foundations", "safe"), approvedReview, "training");
    corpus.add(sample("encoded-recovery", "defense-parry", "recovery", 1, "recovery"), approvedReview, "validation");
    const manifest = corpus.export("dataset-v1", "2026-07-23T00:00:00.000Z");
    const decoded = decodeBehaviorCloningManifest(encodeBehaviorCloningManifest(manifest));
    expect(decoded.rootHash).toBe(manifest.rootHash);
    expect(decoded.entries.map((entry) => entry.sample.observation)).toEqual(manifest.entries.map((entry) => entry.sample.observation));
    expect(decoded.entries.map((entry) => entry.sample.actions)).toEqual(manifest.entries.map((entry) => entry.sample.actions));
    expect(Object.isFrozen(manifest)).toBe(true);
  });

  it("trains a first behavior-cloned policy that passes unseen seeds and recovery cases", () => {
    const corpus = new TearDemonstrationCorpus();
    for (let index = 0; index < 12; index += 1) {
      const kind = index % 3 === 0 ? "recovery" : index % 3 === 1 ? "parry" : "safe";
      corpus.add(sample(`train-${String(index)}`, "defense-parry", kind, index,
        kind === "recovery" ? "recovery" : "demonstration"), approvedReview, "training");
    }
    const policy = trainBehaviorClonedPolicy(corpus.export("bc-v1", "2026-07-23T00:00:00.000Z"), feature);
    const unseen = [
      observation(100, "safe", 101),
      observation(101, "recovery", 102),
      observation(102, "parry", 103),
      observation(103, "recovery", 104),
    ];
    const expected = [actions.safe, actions.recovery, actions.parry, actions.recovery];
    const passed = unseen.filter((entry, index) =>
      JSON.stringify(policy.decide(entry)) === JSON.stringify(expected[index])).length;
    expect(passed / unseen.length).toBeGreaterThanOrEqual(0.8);
    expect(policy.decide(unseen[1] ?? observation(1, "recovery"))).toContainEqual({
      type: "dash", x: -1_000, y: 0,
    });
  });
});
