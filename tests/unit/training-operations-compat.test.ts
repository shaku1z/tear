import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  LEGACY_TRAINING_OPERATIONS_ACTIONS,
  LEGACY_TRAINING_OPERATIONS_QUERY_ALIASES,
  LEGACY_TRAINING_OPERATIONS_ROUTES,
  TRAINING_OPERATIONS_ACTIONS,
  TRAINING_OPERATIONS_QUERY,
  TRAINING_OPERATIONS_ROUTE,
  TrainingOperationsJobVault,
  TrainingOperationsLaunchProfileAuthority,
  TrainingOperationsRecoveryController,
  TrainingOperationsScheduleController,
  TrainingOperationsScheduleVault,
  TearFoundryJobScheduleVault,
  TearFoundryJobVault,
  TearFoundryLaunchProfileAuthority,
  TearFoundryRecoveryController,
  TearFoundryScheduleController,
  createTearFoundryJob,
  createTearFoundryJobSchedule,
  createTrainingOperationsJob,
  createTrainingOperationsSchedule,
  isTrainingOperationsRequested,
  normalizeTrainingOperationsSearch,
  parseTearFoundryJob,
  parseTearFoundryJobSchedule,
  parseTrainingOperationsJob,
  parseTrainingOperationsSchedule,
  requestedTrainingOperations,
  resolveTrainingOperationsRoute,
} from "../../src/agents";

const hashes = Object.freeze({
  artifact: "a".repeat(16),
  corpus: "b".repeat(16),
  evaluation: "c".repeat(16),
  reward: "d".repeat(16),
  invariant: "e".repeat(16),
  budget: "f".repeat(16),
  stop: "1".repeat(16),
  compute: "2".repeat(16),
  storage: "3".repeat(16),
});

function jobInput() {
  return {
    id: "training-operations-compat-job",
    createdAt: "2026-08-23T00:00:00.000Z",
    reason: "compatibility fixture",
    inputs: {
      champion: { id: "champion", artifactHash: hashes.artifact },
      corpusRecordHashes: [hashes.corpus],
      evaluationPlanHash: hashes.evaluation,
      rewardDefinitionHash: hashes.reward,
      invariantSetHash: hashes.invariant,
      budgetHash: hashes.budget,
      stopConditionsHash: hashes.stop,
    },
  } as const;
}

describe("Training Operations compatibility facade", () => {
  it("resolves canonical routes and normalizes enabled legacy links", () => {
    expect(TRAINING_OPERATIONS_ROUTE).toBe("training-operations");
    expect(TRAINING_OPERATIONS_QUERY).toBe("training-operations");
    expect(LEGACY_TRAINING_OPERATIONS_ROUTES).toEqual(["foundry"]);
    expect(LEGACY_TRAINING_OPERATIONS_QUERY_ALIASES).toEqual(["foundry"]);
    expect(resolveTrainingOperationsRoute("training-operations")).toBe("training-operations");
    expect(resolveTrainingOperationsRoute("foundry")).toBe("training-operations");
    expect(resolveTrainingOperationsRoute("unknown")).toBeUndefined();
    expect(isTrainingOperationsRequested("?training-operations=1")).toBe(true);
    expect(isTrainingOperationsRequested("?foundry=")).toBe(true);
    expect(isTrainingOperationsRequested("?foundry=0")).toBe(false);
    expect(requestedTrainingOperations("?test=1&foundry=1")).toBe("training-operations");
    expect(normalizeTrainingOperationsSearch("?test=1&foundry=1")).toBe("?test=1&training-operations=1");
    expect(normalizeTrainingOperationsSearch("?training-operations=0&foundry=1")).toBe("?training-operations=1");
    expect(normalizeTrainingOperationsSearch("?training-operations=0&test=1")).toBe("?training-operations=0&test=1");
  });

  it("pairs canonical actions with the preserved legacy action IDs", () => {
    expect(TRAINING_OPERATIONS_ACTIONS).toEqual({
      open: "training-operations.open",
      refresh: "training-operations.refresh",
      bootstrap: "training-operations.bootstrap",
      scheduleEnable: "training-operations.schedule.enable",
      scheduleDisable: "training-operations.schedule.disable",
    });
    expect(LEGACY_TRAINING_OPERATIONS_ACTIONS).toEqual({
      refresh: "foundry.refresh",
      bootstrap: "foundry.bootstrap",
      scheduleEnable: "foundry.schedule.enable",
      scheduleDisable: "foundry.schedule.disable",
    });
  });

  it("keeps safe v1/v2 API aliases as exact implementation identities", () => {
    expect(TrainingOperationsJobVault).toBe(TearFoundryJobVault);
    expect(TrainingOperationsScheduleVault).toBe(TearFoundryJobScheduleVault);
    expect(TrainingOperationsScheduleController).toBe(TearFoundryScheduleController);
    expect(TrainingOperationsRecoveryController).toBe(TearFoundryRecoveryController);
    expect(TrainingOperationsLaunchProfileAuthority).toBe(TearFoundryLaunchProfileAuthority);
  });

  it("preserves job and schedule wire bytes, formats, hashes, and durable keys", async () => {
    const legacyJob = createTearFoundryJob(jobInput());
    const canonicalJob = createTrainingOperationsJob(jobInput());
    expect(canonicalJob).toEqual(legacyJob);
    expect(JSON.stringify(canonicalJob)).toBe(JSON.stringify(legacyJob));
    expect(canonicalJob.format).toBe("tear-foundry-job");
    expect(parseTrainingOperationsJob(JSON.parse(JSON.stringify(legacyJob)))).toEqual(parseTearFoundryJob(legacyJob));

    const legacySchedule = createTearFoundryJobSchedule({
      id: "training-operations-compat-schedule", jobId: legacyJob.id, jobHash: legacyJob.jobHash,
      intervalMs: 60_000, computeBudgetHash: hashes.compute, storageBudgetHash: hashes.storage,
      stopConditionsHash: hashes.stop, state: "enabled", configuredAt: "2026-08-23T00:00:00.000Z",
    });
    const canonicalSchedule = createTrainingOperationsSchedule({
      id: "training-operations-compat-schedule", jobId: canonicalJob.id, jobHash: canonicalJob.jobHash,
      intervalMs: 60_000, computeBudgetHash: hashes.compute, storageBudgetHash: hashes.storage,
      stopConditionsHash: hashes.stop, state: "enabled", configuredAt: "2026-08-23T00:00:00.000Z",
    });
    expect(canonicalSchedule).toEqual(legacySchedule);
    expect(JSON.stringify(canonicalSchedule)).toBe(JSON.stringify(legacySchedule));
    expect(canonicalSchedule.format).toBe("tear-foundry-job-schedule");
    expect(parseTrainingOperationsSchedule(JSON.parse(JSON.stringify(legacySchedule)))).toEqual(parseTearFoundryJobSchedule(legacySchedule));

    const backend = createMemoryGhostVaultBackend();
    await new TrainingOperationsJobVault(backend).persist(canonicalJob);
    await new TrainingOperationsScheduleVault(backend).persist(canonicalSchedule);
    await expect(backend.get("analysis", `foundry-job:v1:${canonicalJob.id}`)).resolves.toBe(JSON.stringify(legacyJob));
    await expect(backend.get("analysis", `foundry-job-schedule:v1:${canonicalSchedule.id}`)).resolves.toBe(JSON.stringify(legacySchedule));
  });
});
