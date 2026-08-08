import { createIndexedDbGhostVaultBackend } from "../ghost";
import { createTearHumanCalibrationCaptureCoordinator, TearHumanCalibrationLocalConsentLedger, TearHumanCalibrationLocalPendingAttestationStore } from "../agents";
import { createLiveHumanInputProvenance } from "./live-human-input-provenance";

/** Browser-only C35 composition. Its callback can create local pending custody, never admission or training. */
export function createLiveHumanCalibrationCaptureComposition(factory: IDBFactory | undefined, target: Window, currentSignedInActor: () => string | undefined) {
  const input = createLiveHumanInputProvenance(target);
  const backend = factory === undefined ? undefined : createIndexedDbGhostVaultBackend(factory);
  const capture = backend === undefined ? undefined : createTearHumanCalibrationCaptureCoordinator({
    currentSignedInActor, trustedInputDevice: input.device,
    ledger: { current: async (actor) => new TearHumanCalibrationLocalConsentLedger(await backend).current(actor) },
    pending: { persist: async (attestation) => new TearHumanCalibrationLocalPendingAttestationStore(await backend).persist(attestation) },
    now: () => new Date().toISOString(),
  });
  return Object.freeze({ input, capture });
}
