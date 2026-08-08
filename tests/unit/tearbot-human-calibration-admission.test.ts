import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend, GhostLocalVault, GhostStreamingRecorder, createGhostReplayRunContext, GHOST_REPLAY_CONTEXT_PROVENANCE_KEY } from "../../src/ghost";
import { createTearHumanCalibrationConsentAttestation, TearHumanCalibrationLocalConsentLedger, TearHumanCalibrationLocalPendingAttestationStore, TearHumanCalibrationPendingAdmissionController, TearHumanCalibrationSourceStore } from "../../src/agents";
import { stableVerificationHash } from "../../src/replay/hash";

async function fixture() { const backend = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(backend), id = "pending-human"; const context = createGhostReplayRunContext({ runId: id, seed: "human", mode: "endless", difficulty: "normal", weaponId: "sword", ticksPerSecond: 120, build: { version: "1", revision: "human", target: "unit", rulesetVersion: "r", contentHash: "c", configHash: "g" }, rng: { world: { state: "1" } } }); const recorder = new GhostStreamingRecorder({ sessionId: id, createdAt: "2026-08-08T00:00:00.000Z", vault, chunkEntries: 1, maxPendingWrites: 1, provenance: { [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context } }); await recorder.start(); const action = { kind: "command" as const, id: 1, tick: 1, command: { type: "move" as const, x: 1000, y: 0 } }; await recorder.append({ kind: "commands", tick: 1, value: action }); const manifest = await recorder.finalize("2026-08-08T00:00:01.000Z"); if (manifest.schemaVersion !== 2) throw new Error("missing V3 fixture"); return { backend, vault, id, root: manifest.integrity.rootIntegrity, actionHash: stableVerificationHash([action]) }; }

describe("explicit pending human calibration admission", () => {
  it("admits only an explicitly selected consent-current pending attestation and preserves duplicate rejection", async () => {
    const data = await fixture(), ledger = new TearHumanCalibrationLocalConsentLedger(data.backend), pending = new TearHumanCalibrationLocalPendingAttestationStore(data.backend);
    const revisionHash = await ledger.set("player", "anonymous-improvement", "r1");
    const attestation = createTearHumanCalibrationConsentAttestation({ participantId: "player", issuerId: "local", decidedAt: "2026-08-08T00:01:00.000Z", consent: "anonymous-improvement", consentRevisionHash: revisionHash, device: "keyboard-mouse", capsuleId: data.id, rootIntegrity: data.root, fromTick: 0, toTick: 1, actionHash: data.actionHash });
    await pending.persist(attestation);
    const controller = new TearHumanCalibrationPendingAdmissionController(pending, new TearHumanCalibrationSourceStore(data.backend, data.vault, ledger));
    expect(await controller.admit("f".repeat(16))).toBeUndefined();
    expect(await controller.admit(attestation.attestationHash)).toMatchObject({ participantId: "player" });
    await expect(controller.admit(attestation.attestationHash)).rejects.toThrow(/already admitted/u);
  });

  it("does not admit a pending attestation after revocation or consent revision mismatch", async () => {
    const data = await fixture(), ledger = new TearHumanCalibrationLocalConsentLedger(data.backend), pending = new TearHumanCalibrationLocalPendingAttestationStore(data.backend);
    const revisionHash = await ledger.set("player", "public-training", "r1");
    const attestation = createTearHumanCalibrationConsentAttestation({ participantId: "player", issuerId: "local", decidedAt: "2026-08-08T00:01:00.000Z", consent: "public-training", consentRevisionHash: revisionHash, device: "touch", capsuleId: data.id, rootIntegrity: data.root, fromTick: 0, toTick: 1, actionHash: data.actionHash });
    await pending.persist(attestation); await ledger.set("player", "revoked", "r2");
    const controller = new TearHumanCalibrationPendingAdmissionController(pending, new TearHumanCalibrationSourceStore(data.backend, data.vault, ledger));
    await expect(controller.admit(attestation.attestationHash)).rejects.toThrow(/changed|revoked/u);
  });
});
