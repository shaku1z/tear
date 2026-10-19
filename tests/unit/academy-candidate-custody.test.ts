import { describe, expect, it, vi } from "vitest";

import {
  TearAcademyCandidateCustodyStore,
  TearAcademyCustodyActionRuntime,
  captureAcademyCandidateTracks,
  materializeAcademyCandidateCapsule,
  type TearAcademyCandidateCapsuleMaterializationReceiptV1,
  type TearAcademyCandidateDeclarationV1,
} from "../../src/agents";
import { GhostLocalVault, createMemoryGhostVaultBackend, ghostCapsuleProtectionKey, maintainGhostVault,
  prepareGhostCapsuleProtection, parseGhostCapsuleProtection } from "../../src/ghost";
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

async function prepared(backend = createMemoryGhostVaultBackend()) {
  const vault = new GhostLocalVault(backend);
  const source = await candidate();
  const materialized = await materializeAcademyCandidateCapsule(source, {
    vault, capsuleId: "c31-custody-source",
    createdAt: "2026-08-02T00:00:00.000Z", completedAt: "2026-08-02T00:00:01.000Z",
  });
  return Object.freeze({ backend, vault, source, materialized, declaration: declaration(source, materialized) });
}

describe("C31 Academy candidate custody", () => {
  async function acceptPrepared(input: Awaited<ReturnType<typeof prepared>>) {
    const store = new TearAcademyCandidateCustodyStore(input.backend);
    const custody = await store.accept({ declaration: input.declaration, materialization: input.materialized,
      privacyRetention: privacyRetention(), retention: { mode: "indefinite" },
      decidedAt: "2026-08-02T00:01:00.000Z", actor: "academy-curator", reason: "retained source" });
    return { store, custody };
  }

  it.each(["source", "chunk", "custody"] as const)("refuses %s drift at the final custody acceptance transaction without partial protection", async (drift) => {
    const base = createMemoryGhostVaultBackend(); let mutate: (() => Promise<void>) | undefined;
    const backend = { ...base, async commitIfMatches(...args: Parameters<typeof base.commitIfMatches>) {
      if (mutate !== undefined && args[1].some((write) => write.key.startsWith("academy-candidate-custody:"))) { const once = mutate; mutate = undefined; await once(); }
      return base.commitIfMatches(...args);
    } };
    const input = await prepared(backend), manifest = await input.vault.getManifest(input.materialized.capsuleId); if (manifest === undefined) throw new Error("missing source");
    const key = `academy-candidate-custody:v1:${input.materialized.attestation.candidateHash}`;
    mutate = async () => { if (drift === "source") await base.remove("manifests", manifest.id); if (drift === "chunk") await base.put("chunks", manifest.chunks[0]?.id ?? "", "changed source"); if (drift === "custody") await base.put("analysis", key, "competing custody"); };
    await expect(acceptPrepared(input)).rejects.toThrow(); expect(await base.get("analysis", ghostCapsuleProtectionKey(manifest.id))).toBeUndefined();
    expect(await base.get("analysis", key)).toBe(drift === "custody" ? "competing custody" : undefined);
  });

  it("preserves a newer custody revocation when deletion reaches its final transaction", async () => {
    const base = createMemoryGhostVaultBackend(); let mutate: (() => Promise<void>) | undefined;
    const backend = { ...base, async commitIfMatches(...args: Parameters<typeof base.commitIfMatches>) {
      if (mutate !== undefined && args[1].some((write) => write.store === "manifests" && write.value === undefined)) { const once = mutate; mutate = undefined; await once(); }
      return base.commitIfMatches(...args);
    } };
    const input = await prepared(backend), { store, custody } = await acceptPrepared(input);
    mutate = async () => { await store.revoke({ candidateHash: custody.candidateHash, scope: "model-training", consent: { ...input.declaration.consent, revision: "newer-revocation", decidedAt: "2026-08-02T00:02:00.000Z", modelTraining: "no-training" }, decidedAt: "2026-08-02T00:02:00.000Z", actor: "player", reason: "withdraw training" }); };
    await expect(store.delete({ candidateHash: custody.candidateHash, vault: input.vault, actor: "player", decidedAt: "2026-08-02T00:03:00.000Z", reason: "stale delete" })).rejects.toThrow();
    expect((await store.get(custody.candidateHash))?.status).toBe("revoked"); expect(await input.vault.getManifest(input.materialized.capsuleId)).toBeDefined();
    expect(await base.get("analysis", ghostCapsuleProtectionKey(input.materialized.capsuleId))).toBeDefined();
  });

  it("refuses a changed chunk at deletion commit while preserving custody and protection", async () => {
    const base = createMemoryGhostVaultBackend(); let mutate: (() => Promise<void>) | undefined;
    const backend = { ...base, async commitIfMatches(...args: Parameters<typeof base.commitIfMatches>) {
      if (mutate !== undefined && args[1].some((write) => write.store === "manifests" && write.value === undefined)) { const once = mutate; mutate = undefined; await once(); }
      return base.commitIfMatches(...args);
    } };
    const input = await prepared(backend), { store, custody } = await acceptPrepared(input), manifest = await input.vault.getManifest(input.materialized.capsuleId); if (manifest === undefined) throw new Error("missing source");
    mutate = () => base.put("chunks", manifest.chunks[0]?.id ?? "", "changed source");
    await expect(store.delete({ candidateHash: custody.candidateHash, vault: input.vault, actor: "player", decidedAt: "2026-08-02T00:03:00.000Z", reason: "stale source delete" })).rejects.toThrow();
    expect(await store.get(custody.candidateHash)).toEqual(custody); expect(await input.vault.getManifest(manifest.id)).toBeDefined(); expect(await base.get("analysis", ghostCapsuleProtectionKey(manifest.id))).toBeDefined();
  });

  it("refuses source deletion when malformed legacy custody prevents a complete ownership scan", async () => {
    const input = await prepared(), { store, custody } = await acceptPrepared(input), key = "academy-candidate-custody:v1:malformed-legacy";
    await input.backend.put("analysis", key, "retained malformed legacy evidence");
    await expect(store.delete({ candidateHash: custody.candidateHash, vault: input.vault, actor: "player", decidedAt: "2026-08-02T00:03:00.000Z", reason: "must retain legacy source" })).rejects.toThrow(/malformed legacy custody/u);
    expect(await input.backend.get("analysis", key)).toBe("retained malformed legacy evidence");
    expect(await store.get(custody.candidateHash)).toEqual(custody); expect(await input.vault.getManifest(input.materialized.capsuleId)).toBeDefined();
  });

  it("pins accepted source bytes against direct removal and deletes only with its custody tombstone", async () => {
    const input = await prepared(), { store, custody } = await acceptPrepared(input);
    const id = input.materialized.capsuleId, key = ghostCapsuleProtectionKey(id);
    const before = await input.vault.exportCapsule(id);
    await expect(input.vault.removeCapsule(id)).rejects.toThrow(/protected/u);
    expect(await input.vault.enforceQuota(0, {})).toEqual([]);
    expect(await input.vault.exportCapsule(id)).toBe(before);
    const tombstone = await store.delete({ candidateHash: custody.candidateHash, vault: input.vault,
      actor: "player", decidedAt: "2026-08-02T00:02:00.000Z", reason: "delete source" });
    expect(tombstone.status).toBe("deleted");
    expect(await input.backend.get("analysis", key)).toBeUndefined();
    expect(await input.vault.getManifest(id)).toBeUndefined();
    expect(await store.held("2026-08-02T00:03:00.000Z")).toEqual([]);
  });

  it("backfills pre-protection custody before quota maintenance without changing custody events", async () => {
    const input = await prepared(), { store, custody } = await acceptPrepared(input);
    const id = input.materialized.capsuleId;
    await input.backend.remove("analysis", ghostCapsuleProtectionKey(id));
    const report = await maintainGhostVault(input.vault, { maximumBytes: 0,
      beforeQuota: async () => { await store.ensureSourceProtection(); } });
    expect(report.evictedCapsuleIds).toEqual([]);
    expect(await store.get(custody.candidateHash)).toEqual(custody);
    const first = await store.ensureSourceProtection();
    expect(first.protectedCandidateHashes).toEqual([custody.candidateHash]);
    expect(await store.ensureSourceProtection()).toEqual(first);
  });

  it("preserves source and custody together when the deletion transaction fails", async () => {
    const input = await prepared({ ...createMemoryGhostVaultBackend() }), { store, custody } = await acceptPrepared(input);
    const id = input.materialized.capsuleId, key = ghostCapsuleProtectionKey(id);
    const capsule = await input.vault.exportCapsule(id), marker = await input.backend.get("analysis", key);
    const spy = vi.spyOn(input.backend, "commitIfMatches").mockRejectedValueOnce(new Error("deletion interrupted"));
    await expect(store.delete({ candidateHash: custody.candidateHash, vault: input.vault, actor: "player",
      decidedAt: "2026-08-02T00:02:00.000Z", reason: "delete source" })).rejects.toThrow(/interrupted/u);
    expect(await input.vault.exportCapsule(id)).toBe(capsule);
    expect(await input.backend.get("analysis", key)).toBe(marker);
    expect(await store.get(custody.candidateHash)).toEqual(custody);
    spy.mockRestore();
  });

  it("merges protected owners only after a successful compare-and-swap", async () => {
    const input = await prepared(), { store, custody } = await acceptPrepared(input);
    const id = input.materialized.capsuleId, root = custody.source.capsuleRange.rootIntegrity;
    const first = await prepareGhostCapsuleProtection(input.backend, id, root, "another-owner");
    const stale = await prepareGhostCapsuleProtection(input.backend, id, root, "third-owner");
    await input.backend.commitIfMatches(first.guards, first.writes);
    await expect(input.backend.commitIfMatches(stale.guards, stale.writes)).rejects.toThrow(/conditional/u);
    const retry = await prepareGhostCapsuleProtection(input.backend, id, root, "third-owner");
    await input.backend.commitIfMatches(retry.guards, retry.writes);
    const raw = await input.backend.get("analysis", ghostCapsuleProtectionKey(id));
    if (raw === undefined) throw new Error("missing protection record");
    expect(parseGhostCapsuleProtection(raw, id).owners).toEqual([custody.candidateHash, "another-owner", "third-owner"].sort());
    await expect(store.delete({ candidateHash: custody.candidateHash, vault: input.vault, actor: "player",
      decidedAt: "2026-08-02T00:02:00.000Z", reason: "must preserve another owner" })).rejects.toThrow(/protected/u);
    expect(await input.vault.enforceQuota(0, {})).toEqual([]);
  });

  it("keeps malformed and future protection bytes intact while refusing custody use", async () => {
    for (const replacement of ["not-json", JSON.stringify({ format: "ghost-capsule-protection", schemaVersion: 2 })]) {
      const input = await prepared(), { store, custody } = await acceptPrepared(input);
      const id = input.materialized.capsuleId, key = ghostCapsuleProtectionKey(id);
      await input.backend.put("analysis", key, replacement);
      expect(await input.vault.enforceQuota(0, {})).toEqual([]);
      await expect(input.vault.removeCapsule(id)).rejects.toThrow();
      expect(await store.held("2026-08-02T00:03:00.000Z")).toEqual([]);
      expect(await store.get(custody.candidateHash)).toEqual(custody);
      expect(await input.backend.get("analysis", key)).toBe(replacement);
    }
  });

  it("excludes legacy custody whose source has gone without inventing a deletion event", async () => {
    const input = await prepared(), { store, custody } = await acceptPrepared(input);
    const id = input.materialized.capsuleId;
    await input.backend.remove("analysis", ghostCapsuleProtectionKey(id));
    expect(await input.vault.enforceQuota(0, {})).toEqual([id]);
    expect(await store.held("2026-08-02T00:03:00.000Z")).toEqual([]);
    expect(await store.get(custody.candidateHash)).toEqual(custody);
    expect((await store.ensureSourceProtection()).unavailableCandidateHashes).toEqual([custody.candidateHash]);
  });

  it("uses one known capsule fence when quota and acceptance race in either order", async () => {
    for (const winner of ["acceptance", "quota"] as const) {
      const input = await prepared({ ...createMemoryGhostVaultBackend() }), commit = input.backend.commitIfMatches.bind(input.backend);
      let raced = false;
      const spy = vi.spyOn(input.backend, "commitIfMatches").mockImplementation(async (guards, writes) => {
        const accepting = writes.some((write) => write.key.startsWith("academy-candidate-custody:v1:"));
        const deleting = writes.some((write) => write.store === "manifests" && write.value === undefined);
        if (!raced && (winner === "acceptance" ? deleting : accepting)) {
          raced = true;
          if (winner === "acceptance") await acceptPrepared(input);
          else await input.vault.enforceQuota(0, {});
        }
        return commit(guards, writes);
      });
      if (winner === "acceptance") {
        await expect(input.vault.enforceQuota(0, {})).rejects.toThrow();
        expect(await input.vault.getManifest(input.materialized.capsuleId)).toBeDefined();
        expect(await new TearAcademyCandidateCustodyStore(input.backend).held("2026-08-02T00:03:00.000Z")).toHaveLength(1);
      } else {
        await expect(acceptPrepared(input)).rejects.toThrow();
        expect(await input.vault.getManifest(input.materialized.capsuleId)).toBeUndefined();
        expect((await input.backend.keys("analysis")).filter((key) => key.startsWith("academy-candidate-custody:v1:"))).toEqual([]);
      }
      expect(raced).toBe(true);
      spy.mockRestore();
    }
  });

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
