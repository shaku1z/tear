import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import type { TearHumanCalibrationConsentLedger } from "./tearbot-human-calibration-source";

export type TearHumanCalibrationConsent = "anonymous-improvement" | "public-training" | "revoked";
export interface TearHumanCalibrationConsentRecord {
  readonly participantId: string;
  readonly consent: TearHumanCalibrationConsent;
  readonly revision: string;
  readonly revisionHash: string;
}

export class TearHumanCalibrationLocalConsentLedger implements TearHumanCalibrationConsentLedger {
  readonly #backend: GhostVaultBackend; constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async set(participantId: string, consent: TearHumanCalibrationConsent, revision: string): Promise<string> {
    if (!participantId.trim() || !revision.trim()) throw new TypeError("human calibration consent requires a participant and revision");
    const value = { participantId, consent, revision };
    const revisionHash = stableVerificationHash(value);
    await this.#backend.put("analysis", `tearbot-human-calibration-consent:v1:${participantId}`, JSON.stringify({ ...value, revisionHash }));
    return revisionHash;
  }
  /** Read the local decision for presentation. `current` deliberately hides revoked decisions from training admission. */
  async read(participantId: string): Promise<TearHumanCalibrationConsentRecord | undefined> {
    const raw = await this.#backend.get("analysis", `tearbot-human-calibration-consent:v1:${participantId}`);
    if (!raw) return undefined;
    try {
      const value = JSON.parse(raw) as TearHumanCalibrationConsentRecord;
      if (value.participantId !== participantId || !["anonymous-improvement", "public-training", "revoked"].includes(value.consent)
        || typeof value.revision !== "string" || !value.revision.trim() || typeof value.revisionHash !== "string"
        || stableVerificationHash({ participantId: value.participantId, consent: value.consent, revision: value.revision }) !== value.revisionHash) return undefined;
      return Object.freeze({ participantId: value.participantId, consent: value.consent, revision: value.revision, revisionHash: value.revisionHash });
    } catch { return undefined; }
  }
  async current(participantId: string) {
    const value = await this.read(participantId);
    return value?.consent === "anonymous-improvement" || value?.consent === "public-training"
      ? Object.freeze({ consent: value.consent, revisionHash: value.revisionHash }) : undefined;
  }
}
