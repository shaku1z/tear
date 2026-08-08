import { describe, expect, it } from "vitest";

import {
  TearAcademyCandidateCustodyStore,
  TearAcademyCustodyActionRuntime,
  captureAcademyCandidateTracks,
  materializeAcademyCandidateCapsule,
  type TearAcademyCandidateCapsuleMaterializationReceiptV1,
  type TearAcademyCandidateDeclarationV1,
} from "../../src/agents";
import { GhostLocalVault, createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  ProductionHeadlessAcademyIntake,
  createProductionHeadlessEpisodePool,
  type ProductionHeadlessAcademyIntakeItem,
  type TearScenarioV1,
} from "../../src/tearbench";

function scenario(): TearScenarioV1 {
  return Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id: "c31-custody", version: 1, description: "C31 durable candidate custody",
    stateClass: "recorded-canonical", executionClass: "training", seed: "c31-custody-seed",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }), maxTicks: 2,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c31", "custody"] as const),
  });
}

async function candidate(): Promise<ProductionHeadlessAcademyIntakeItem> {
  const intake = new ProductionHeadlessAcademyIntake(1);
  await createProductionHeadlessEpisodePool(1).run([
    Object.freeze({ id: "c31-custody", scenario: scenario(), maxTicks: 2 }),
  ], () => Object.freeze({ decide: () => Object.freeze([Object.freeze([])]) }), {
    batchSize: 1, artifactConsumer: (sample) => { intake.offer(sample); },
  });
  const value = intake.take()[0];
  if (value === undefined) throw new Error("C30 source episode did not yield a candidate");
  return value;
}

function declaration(
  source: ProductionHeadlessAcademyIntakeItem,
  materialized: TearAcademyCandidateCapsuleMaterializationReceiptV1,
): TearAcademyCandidateDeclarationV1 {
  const build = materialized.attestation.build;
  return Object.freeze({
    format: "tear-academy-candidate", schemaVersion: 1, candidate: source,
    trackBundle: captureAcademyCandidateTracks(source, materialized.attestation),
    tracks: Object.freeze({
      fromTick: 0, toTick: source.tick, observationCount: source.tick + 1,
      actionEnvelopeCount: source.artifact.actions.length, eventsRecorded: true,
      rewardComponentsRecorded: true, intentsRecorded: true, buildRecorded: true, device: "semantic" as const,
    }),
    consent: Object.freeze({
      format: "tear-academy-consent", schemaVersion: 1, revision: "c31-custody-consent-1",
      decidedAt: "2026-08-02T00:00:00.000Z", localRecording: "granted" as const,
      cloudPublication: "denied" as const, analytics: "denied" as const,
      modelTraining: "anonymous-improvement" as const,
    }),
    privacy: Object.freeze({ classification: "anonymous" as const }),
    provenance: Object.freeze({
      actor: "scripted-bot" as const, producer: "c31-custody-test", build,
      executionClass: "training" as const, observationClass: "structured-state" as const,
      policyId: "c30-scripted", sourceId: source.episodeId, trainingConsent: "anonymous-improvement" as const,
    }),
  });
}

function privacyRetention() {
  return Object.freeze({
    classification: "anonymous" as const, revision: "c31-custody-privacy-1",
    declaredAt: "2026-08-02T00:00:00.000Z",
    authorizedActorIds: Object.freeze(["academy-curator", "player", "retention-worker"]),
  });
}

async function prepared() {
  const backend = createMemoryGhostVaultBackend();
  const vault = new GhostLocalVault(backend);
  const source = await candidate();
  const materialized = await materializeAcademyCandidateCapsule(source, {
    vault, capsuleId: "c31-custody-source",
    createdAt: "2026-08-02T00:00:00.000Z", completedAt: "2026-08-02T00:00:01.000Z",
  });
  return Object.freeze({ backend, vault, source, materialized, declaration: declaration(source, materialized) });
}

describe("C31 Academy candidate custody", () => {
  it("persists only an eligible materialized source and preserves its custody evidence across reload", async () => {
    const input = await prepared();
    const store = new TearAcademyCandidateCustodyStore(input.backend);
    await expect(store.accept({
      declaration: input.declaration, materialization: input.materialized,
      privacyRetention: Object.freeze({
        classification: "personal" as const, dataSubjectId: "player-1", revision: "wrong-classification",
        declaredAt: "2026-08-02T00:00:00.000Z", authorizedActorIds: Object.freeze(["player-1"]),
      }),
      retention: Object.freeze({ mode: "indefinite" as const }),
      decidedAt: "2026-08-02T00:01:00.000Z", actor: "academy-curator", reason: "wrong privacy class",
    })).rejects.toThrow(/retention decision/u);
    const custody = await store.accept({
      declaration: input.declaration, materialization: input.materialized,
      privacyRetention: privacyRetention(),
      retention: Object.freeze({ mode: "indefinite" as const }),
      decidedAt: "2026-08-02T00:01:00.000Z", actor: "academy-curator", reason: "verified source held for review",
    });
    const reloaded = await new TearAcademyCandidateCustodyStore(input.backend).get(custody.candidateHash);
    expect(custody).toMatchObject({
      format: "tear-academy-candidate-custody", status: "held",
      source: { capsuleRange: { capsuleId: input.materialized.capsuleId } },
      privacyRetention: { classification: "anonymous", authorizedActorIds: ["academy-curator", "player", "retention-worker"] },
    });
    expect(reloaded).toEqual(custody);
    await expect(store.accept({
      declaration: input.declaration, materialization: input.materialized,
      privacyRetention: privacyRetention(),
      retention: Object.freeze({ mode: "indefinite" as const }),
      decidedAt: "2026-08-02T00:01:00.000Z", actor: "academy-curator", reason: "duplicate",
    })).rejects.toThrow(/already exists/u);
  });

  it("propagates a model-training revocation into every future held-candidate query without erasing audit history", async () => {
    const input = await prepared();
    const store = new TearAcademyCandidateCustodyStore(input.backend);
    const custody = await store.accept({
      declaration: input.declaration, materialization: input.materialized,
      privacyRetention: privacyRetention(),
      retention: Object.freeze({ mode: "indefinite" as const }),
      decidedAt: "2026-08-02T00:01:00.000Z", actor: "academy-curator", reason: "verified source held for review",
    });
    const revokedConsent = Object.freeze({ ...input.declaration.consent, revision: "c31-custody-consent-2",
      decidedAt: "2026-08-02T00:02:00.000Z", modelTraining: "no-training" as const });
    await expect(store.revoke({
      candidateHash: custody.candidateHash, scope: "model-training", consent: revokedConsent,
      decidedAt: "2026-08-02T00:02:00.000Z", actor: "untrusted", reason: "not authorized",
    })).rejects.toThrow(/invalid/u);
    const revoked = await store.revoke({
      candidateHash: custody.candidateHash, scope: "model-training", consent: revokedConsent,
      decidedAt: "2026-08-02T00:02:00.000Z", actor: "player", reason: "withdrawn training consent",
    });
    expect(revoked).toMatchObject({ status: "revoked", consent: { modelTraining: "no-training" } });
    expect(revoked.events).toHaveLength(2);
    expect(await store.held("2026-08-02T00:03:00.000Z")).toEqual([]);
    await expect(store.revoke({
      candidateHash: custody.candidateHash, scope: "model-training", consent: revokedConsent,
      decidedAt: "2026-08-02T00:03:00.000Z", actor: "player", reason: "repeat",
    })).rejects.toThrow(/invalid|not/u);
  });

  it("allows only a declared local authority to withdraw model-training consent through the narrow Academy action runtime", async () => {
    const input = await prepared();
    const store = new TearAcademyCandidateCustodyStore(input.backend);
    const custody = await store.accept({ declaration: input.declaration, materialization: input.materialized,
      privacyRetention: privacyRetention(), retention: Object.freeze({ mode: "indefinite" as const }),
      decidedAt: "2026-08-02T00:01:00.000Z", actor: "academy-curator", reason: "verified source held for review" });
    const actions = new TearAcademyCustodyActionRuntime(store);
    await expect(actions.withdrawModelTraining(custody.candidateHash, "guest", "2026-08-02T00:02:00.000Z")).rejects.toThrow(/authorized/u);
    const revoked = await actions.withdrawModelTraining(custody.candidateHash, "player", "2026-08-02T00:02:00.000Z");
    expect(revoked).toMatchObject({ status: "revoked", consent: { modelTraining: "no-training" }, events: [{ kind: "held" }, { kind: "revoked", actor: "player", revocationScope: "model-training" }] });
    expect(await store.held("2026-08-02T00:03:00.000Z")).toEqual([]);
    await expect(actions.withdrawModelTraining(custody.candidateHash, "player", "2026-08-02T00:03:00.000Z")).rejects.toThrow(/authorized/u);
  });

  it("enforces retention expiry and quarantines malformed custody bytes from consumers", async () => {
    const input = await prepared();
    const store = new TearAcademyCandidateCustodyStore(input.backend);
    const custody = await store.accept({
      declaration: input.declaration, materialization: input.materialized,
      privacyRetention: privacyRetention(),
      retention: Object.freeze({ mode: "until" as const, expiresAt: "2026-08-02T00:02:00.000Z" }),
      decidedAt: "2026-08-02T00:01:00.000Z", actor: "academy-curator", reason: "short review retention",
    });
    expect(await store.held("2026-08-02T00:01:30.000Z")).toHaveLength(1);
    const expired = await store.expire(custody.candidateHash, "2026-08-02T00:02:00.000Z", "retention-worker");
    expect(expired.status).toBe("expired");
    expect(await store.held("2026-08-02T00:03:00.000Z")).toEqual([]);
    await input.backend.put("analysis", "academy-candidate-custody:v1:bad", "not-json");
    const inventory = await store.inventory();
    expect(inventory.records).toHaveLength(1);
    expect(inventory.rejectedKeys).toEqual(["academy-candidate-custody:v1:bad"]);
  });

  it("atomically deletes only its exact attested source while retaining a non-training custody tombstone", async () => {
    const input = await prepared();
    const store = new TearAcademyCandidateCustodyStore(input.backend);
    const custody = await store.accept({
      declaration: input.declaration, materialization: input.materialized,
      privacyRetention: privacyRetention(),
      retention: Object.freeze({ mode: "indefinite" as const }),
      decidedAt: "2026-08-02T00:01:00.000Z", actor: "academy-curator", reason: "verified source held for review",
    });
    await expect(store.delete({
      candidateHash: custody.candidateHash, decidedAt: "2026-08-02T00:02:00.000Z", actor: "player", reason: "erase source",
      vault: new GhostLocalVault(createMemoryGhostVaultBackend()),
    })).rejects.toThrow(/invalid/u);
    const deleted = await store.delete({
      candidateHash: custody.candidateHash, decidedAt: "2026-08-02T00:02:00.000Z", actor: "player", reason: "erase source",
      vault: input.vault,
    });
    expect(deleted).toMatchObject({ status: "deleted", events: [{ kind: "held" }, { kind: "deleted" }] });
    expect(await input.vault.getManifest(input.materialized.capsuleId)).toBeUndefined();
    expect(await store.get(custody.candidateHash)).toEqual(deleted);
    expect(await store.held("2026-08-02T00:03:00.000Z")).toEqual([]);
  });
});
