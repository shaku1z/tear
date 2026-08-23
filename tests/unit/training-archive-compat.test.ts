import { describe, expect, it } from "vitest";

import {
  CANONICAL_ACADEMY_LESSONS,
  TearAcademyCandidateCustodyStore,
  TearAcademyInspectionController,
  TearDemonstrationCorpus,
  TrainingArchiveCandidateCustodyStore,
  TrainingArchiveInspectionController,
  TrainingArchiveDemonstrationCorpus,
  CANONICAL_TRAINING_ARCHIVE_LESSONS,
  LEGACY_TRAINING_ARCHIVE_ACTIONS,
  LEGACY_TRAINING_ARCHIVE_QUERY_ALIASES,
  LEGACY_TRAINING_ARCHIVE_ROUTES,
  TRAINING_ARCHIVE_ACTIONS,
  TRAINING_ARCHIVE_QUERY,
  TRAINING_ARCHIVE_ROUTE,
  decodeBehaviorCloningManifest,
  decodeTrainingArchiveManifest,
  encodeBehaviorCloningManifest,
  encodeTrainingArchiveManifest,
  isTrainingArchiveRequested,
  normalizeTrainingArchiveSearch,
  requestedTrainingArchive,
  resolveTrainingArchiveRoute,
  reviewDemonstration,
  reviewTrainingArchiveDemonstration,
  type TearAcademySample,
} from "../../src/agents";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  ProductionHeadlessAcademyIntake,
} from "../../src/tearbench/production-headless-academy-intake";
import { TrainingArchiveHeadlessIntake } from "../../src/tearbench/training-archive";
import type { TearObservationV1 } from "../../src/tearbench";

function observation(): TearObservationV1 {
  return {
    format: "tear-contract", kind: "observation", schemaVersion: 1, tick: 10,
    observationClass: "structured-state",
    player: {
      x: 100, y: 600, vx: 0, vy: 0, hp: 100, maxHp: 100, facing: 1,
      grounded: true, dashCharges: 1,
    },
    blade: {
      handX: 120, handY: 580, tipX: 180, tipY: 560,
      vx: 0, vy: 0, tipSpeed: 0, state: "held",
    },
    entities: [{ id: "enemy-compat", kind: "charger", x: 250, y: 600, vx: 0, vy: 0 }],
    run: {
      mode: "campaign", difficulty: "normal", weapon: "sword", stage: "grounds",
      wave: 1, score: 0, elapsedTicks: 10,
    },
    availableActions: ["move", "dash", "aim", "weapon"],
  };
}

function sample(): TearAcademySample {
  return {
    id: "training-archive-compat-sample",
    lessonId: "movement-foundations",
    seed: "training-archive-compat-seed",
    capsuleId: "training-archive-compat-capsule",
    fromTick: 8,
    toTick: 12,
    observation: observation(),
    actions: [{ type: "move", x: 1_000, y: 0 }],
    events: [],
    rewardComponents: { survival: 1, progress: 1 },
    build: { weapon: "sword", upgrade: "tempo" },
    device: "semantic",
    provenance: {
      actor: "scripted-bot",
      producer: "training-archive-compat-test",
      build: {
        version: "1", revision: "compat", target: "unit", rulesetVersion: "rules",
        contentHash: "content", configHash: "config",
      },
      executionClass: "training",
      observationClass: "structured-state",
      policyId: "teacher-v1",
      trainingConsent: "anonymous-improvement",
    },
    consent: "anonymous-improvement",
    segmentKind: "demonstration",
    tags: ["compatibility", "training-archive"],
  };
}

const reviewInput = {
  approved: true,
  reviewer: "training-archive-compat-reviewer",
  tags: ["compatibility"],
  quality: { synchronization: 1, actionClarity: 1, outcomeValue: 1, recoveryValue: 1 },
};

describe("Training Archive compatibility facade", () => {
  it("resolves canonical routes and normalizes enabled Academy links only", () => {
    expect(TRAINING_ARCHIVE_ROUTE).toBe("training-archive");
    expect(TRAINING_ARCHIVE_QUERY).toBe("training-archive");
    expect(LEGACY_TRAINING_ARCHIVE_ROUTES).toEqual(["academy", "agent-academy"]);
    expect(LEGACY_TRAINING_ARCHIVE_QUERY_ALIASES).toEqual(["academy", "agent-academy"]);
    expect(resolveTrainingArchiveRoute("training-archive")).toBe("training-archive");
    expect(resolveTrainingArchiveRoute("academy")).toBe("training-archive");
    expect(resolveTrainingArchiveRoute("agent-academy")).toBe("training-archive");
    expect(resolveTrainingArchiveRoute("unknown")).toBeUndefined();
    expect(isTrainingArchiveRequested("?training-archive=1")).toBe(true);
    expect(isTrainingArchiveRequested("?academy=1")).toBe(true);
    expect(isTrainingArchiveRequested("?agent-academy=")).toBe(true);
    expect(isTrainingArchiveRequested("?academy=0")).toBe(false);
    expect(requestedTrainingArchive("?test=1&academy=1")).toBe("training-archive");
    expect(normalizeTrainingArchiveSearch("?test=1&academy=1")).toBe("?test=1&training-archive=1");
    expect(normalizeTrainingArchiveSearch("?training-archive=0&academy=1")).toBe("?training-archive=1");
    expect(normalizeTrainingArchiveSearch("?training-archive=0&test=1")).toBe("?training-archive=0&test=1");
  });

  it("pairs canonical action vocabulary with the preserved Academy tokens", () => {
    expect(TRAINING_ARCHIVE_ACTIONS).toEqual({
      open: "training-archive.open",
      retry: "training-archive.retry",
      daggerAdvance: "training-archive.dagger.advance",
      daggerReview: "training-archive.dagger.review",
      withdrawModelTraining: "training-archive.record.withdrawModelTraining",
      humanCalibrationOptIn: "training-archive.humanCalibration.optIn",
      humanCalibrationRevoke: "training-archive.humanCalibration.revoke",
    });
    expect(LEGACY_TRAINING_ARCHIVE_ACTIONS).toEqual({
      retry: "academy.retry",
      daggerAdvance: "academy.dagger.advance",
      daggerReview: "academy.dagger.review",
      withdrawModelTraining: "academy.record.withdrawModelTraining",
      humanCalibrationOptIn: "academy.humanCalibration.optIn",
      humanCalibrationRevoke: "academy.humanCalibration.revoke",
    });
  });

  it("keeps the canonical Academy APIs as exact identity facades", () => {
    expect(CANONICAL_TRAINING_ARCHIVE_LESSONS).toBe(CANONICAL_ACADEMY_LESSONS);
    expect(TrainingArchiveDemonstrationCorpus).toBe(TearDemonstrationCorpus);
    expect(reviewTrainingArchiveDemonstration).toBe(reviewDemonstration);
    expect(TrainingArchiveCandidateCustodyStore).toBe(TearAcademyCandidateCustodyStore);
    expect(TrainingArchiveInspectionController).toBe(TearAcademyInspectionController);
  });

  it("preserves dataset serialization bytes, format, and root hash", () => {
    const legacyCorpus = new TearDemonstrationCorpus();
    const canonicalCorpus = new TrainingArchiveDemonstrationCorpus();
    legacyCorpus.add(sample(), reviewDemonstration(reviewInput), "training");
    canonicalCorpus.add(sample(), reviewTrainingArchiveDemonstration(reviewInput), "training");
    const legacyManifest = legacyCorpus.export("compatibility-dataset", "2026-08-23T00:00:00.000Z");
    const canonicalManifest = canonicalCorpus.export("compatibility-dataset", "2026-08-23T00:00:00.000Z");
    expect(canonicalManifest).toEqual(legacyManifest);
    expect(encodeTrainingArchiveManifest(canonicalManifest)).toBe(encodeBehaviorCloningManifest(legacyManifest));
    expect(stableVerificationHash(canonicalManifest)).toBe(stableVerificationHash(legacyManifest));
    expect(canonicalManifest.format).toBe("tear-behavior-cloning-dataset");
    expect(decodeTrainingArchiveManifest(encodeTrainingArchiveManifest(canonicalManifest))).toEqual(legacyManifest);
    expect(decodeBehaviorCloningManifest(encodeBehaviorCloningManifest(legacyManifest))).toEqual(canonicalManifest);
  });

  it("keeps the headless intake facade in TearBench and its historical format", () => {
    expect(TrainingArchiveHeadlessIntake).toBe(ProductionHeadlessAcademyIntake);
    const intake = new TrainingArchiveHeadlessIntake(1);
    expect(intake.snapshot()).toEqual({
      capacity: 1, queued: 0, accepted: 0, backpressured: 0, closed: 0, isClosed: false,
    });
  });
});
