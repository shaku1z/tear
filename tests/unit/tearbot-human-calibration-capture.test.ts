import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend, GhostLocalVault, GhostStreamingRecorder, createGhostReplayRunContext, GHOST_REPLAY_CONTEXT_PROVENANCE_KEY } from "../../src/ghost";
import { createTearHumanCalibrationCaptureCoordinator, TearHumanCalibrationLocalConsentLedger, TearHumanCalibrationLocalPendingAttestationStore } from "../../src/agents";

async function fixture(withContext = true) {
  const backend = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(backend), id = "human-capture";
  const context = createGhostReplayRunContext({ runId: id, seed: "human", mode: "endless", difficulty: "normal", weaponId: "sword", ticksPerSecond: 120, build: { version: "1", revision: "human", target: "unit", rulesetVersion: "r", contentHash: "c", configHash: "g" }, rng: { world: { state: "1" } } });
  const recorder = new GhostStreamingRecorder({ sessionId: id, createdAt: "2026-08-08T00:00:00.000Z", vault, chunkEntries: 1, maxPendingWrites: 1,
    ...(withContext ? { provenance: { [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context } } : {}) });
  await recorder.start();
  await recorder.append({ kind: "commands", tick: 1, value: { kind: "command", id: 1, tick: 1, command: { type: "move", x: 1_000, y: 0 } } });
  const manifest = await recorder.finalize("2026-08-08T00:00:01.000Z");
  if (manifest.schemaVersion !== 2) throw new Error("missing V3 fixture");
  return { backend, vault, manifest };
}

async function keys(backend: Awaited<ReturnType<typeof fixture>>["backend"]) { return backend.keys("analysis"); }

describe("human calibration finalized capture coordinator", () => {
  it("persists a pending local attestation only for one trusted consent-bound completed V3 capture", async () => {
    const data = await fixture(), ledger = new TearHumanCalibrationLocalConsentLedger(data.backend);
    await ledger.set("player", "anonymous-improvement", "revision-1");
    const coordinator = createTearHumanCalibrationCaptureCoordinator({ currentSignedInActor: () => "player", trustedInputDevice: () => "keyboard-mouse", ledger,
      pending: new TearHumanCalibrationLocalPendingAttestationStore(data.backend), now: () => "2026-08-08T00:01:00.000Z" });
    coordinator.started(); await coordinator.finalized(data.manifest, data.vault);
    const stored = (await keys(data.backend)).filter((key) => key.startsWith("tearbot-human-calibration-pending:v1:"));
    expect(stored).toHaveLength(1);
    const storedValue = stored[0] === undefined ? undefined : await data.backend.get("analysis", stored[0]);
    expect(storedValue).toContain("tear-live-human-calibration-capture");
  });

  it("does nothing for untrusted input, guest/account change, revoked consent, or an invalid exact replay track", async () => {
    const data = await fixture(), ledger = new TearHumanCalibrationLocalConsentLedger(data.backend);
    await ledger.set("player", "anonymous-improvement", "revision-1");
    let actor: string | undefined = "player", trusted = true;
    const coordinator = createTearHumanCalibrationCaptureCoordinator({ currentSignedInActor: () => actor, trustedInputDevice: () => trusted ? "touch" : undefined, ledger,
      pending: new TearHumanCalibrationLocalPendingAttestationStore(data.backend), now: () => "2026-08-08T00:01:00.000Z" });
    coordinator.started(); trusted = false; await coordinator.finalized(data.manifest, data.vault);
    trusted = true; coordinator.started(); actor = undefined; await coordinator.finalized(data.manifest, data.vault);
    actor = "player"; coordinator.started(); await ledger.set("player", "revoked", "revision-2"); await coordinator.finalized(data.manifest, data.vault);
    expect((await keys(data.backend)).filter((key) => key.startsWith("tearbot-human-calibration-pending:v1:"))).toEqual([]);
    const noContext = await fixture(false), secondLedger = new TearHumanCalibrationLocalConsentLedger(noContext.backend);
    await secondLedger.set("player", "anonymous-improvement", "revision-1");
    const invalidTrack = createTearHumanCalibrationCaptureCoordinator({ currentSignedInActor: () => "player", trustedInputDevice: () => "keyboard-mouse", ledger: secondLedger,
      pending: new TearHumanCalibrationLocalPendingAttestationStore(noContext.backend), now: () => "2026-08-08T00:01:00.000Z" });
    invalidTrack.started(); await invalidTrack.finalized(noContext.manifest, noContext.vault);
    expect((await keys(noContext.backend)).filter((key) => key.startsWith("tearbot-human-calibration-pending:v1:"))).toEqual([]);
  });

  it("does nothing when the finalized root is not the exact completed capsule root", async () => {
    const data = await fixture(), ledger = new TearHumanCalibrationLocalConsentLedger(data.backend);
    await ledger.set("player", "public-training", "revision-1");
    const coordinator = createTearHumanCalibrationCaptureCoordinator({ currentSignedInActor: () => "player", trustedInputDevice: () => "keyboard-mouse", ledger,
      pending: new TearHumanCalibrationLocalPendingAttestationStore(data.backend), now: () => "2026-08-08T00:01:00.000Z" });
    coordinator.started(); await coordinator.finalized({ ...data.manifest, integrity: { ...data.manifest.integrity, rootIntegrity: "0".repeat(16) } }, data.vault);
    expect((await keys(data.backend)).filter((key) => key.startsWith("tearbot-human-calibration-pending:v1:"))).toEqual([]);
  });
});
