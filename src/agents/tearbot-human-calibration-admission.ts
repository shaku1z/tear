import type { TearHumanCalibrationPendingAttestationStore } from "./tearbot-human-calibration-capture";
import type { TearHumanCalibrationSourceReceiptV1, TearHumanCalibrationSourceStore } from "./tearbot-human-calibration-source";

/** Explicit local Academy boundary: pending capture evidence is inert until this method is called. */
export class TearHumanCalibrationPendingAdmissionController {
  readonly #pending: TearHumanCalibrationPendingAttestationStore;
  readonly #source: TearHumanCalibrationSourceStore;
  constructor(pending: TearHumanCalibrationPendingAttestationStore, source: TearHumanCalibrationSourceStore) { this.#pending = pending; this.#source = source; }
  async admit(attestationHash: string): Promise<TearHumanCalibrationSourceReceiptV1 | undefined> {
    const pending = await this.#pending.read(attestationHash);
    return pending === undefined ? undefined : this.#source.admit(pending);
  }
}
