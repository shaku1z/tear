import type { GhostLocalVault, GhostVaultBackend, TearGhostManifest } from "../ghost";
import { GhostCapsuleReader, mapGhostCapsuleToReplayEnvelope, readGhostReplayRunContext } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import { createTearHumanCalibrationConsentAttestation, parseTearHumanCalibrationConsentAttestation, type TearHumanCalibrationConsentAttestationV1, type TearHumanCalibrationConsentLedger } from "./tearbot-human-calibration-source";

const KEY = "tearbot-human-calibration-pending:v1:";
export interface TearHumanCalibrationPendingAttestationStore {
  persist(attestation: TearHumanCalibrationConsentAttestationV1): Promise<void>;
}

/** Local-only pending custody. A later explicit Academy process decides whether to admit it; this code never trains, uploads, or admits. */
export class TearHumanCalibrationLocalPendingAttestationStore implements TearHumanCalibrationPendingAttestationStore {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }
  async persist(attestation: TearHumanCalibrationConsentAttestationV1): Promise<void> {
    const parsed = parseTearHumanCalibrationConsentAttestation(attestation);
    await this.#backend.put("analysis", `${KEY}${parsed.attestationHash}`, JSON.stringify(parsed));
  }
}

export interface TearHumanCalibrationCaptureCoordinator {
  started(): void;
  finalized(manifest: TearGhostManifest, vault: GhostLocalVault): Promise<void>;
}

interface ConsentSnapshot { readonly actor: string; readonly consent: "anonymous-improvement" | "public-training"; readonly revisionHash: string; }
export interface TearHumanCalibrationCaptureOptions {
  readonly currentSignedInActor: () => string | undefined;
  readonly trustedInputDevice: () => "keyboard-mouse" | "controller" | "touch" | undefined;
  readonly ledger: TearHumanCalibrationConsentLedger;
  readonly pending: TearHumanCalibrationPendingAttestationStore;
  readonly now: () => string;
}

/** Binds one completed V3 capture to the actor and explicit consent observed at its own start boundary. */
export function createTearHumanCalibrationCaptureCoordinator(options: TearHumanCalibrationCaptureOptions): TearHumanCalibrationCaptureCoordinator {
  let snapshot: Promise<ConsentSnapshot | undefined> | undefined;
  return Object.freeze({
    started(): void {
      const actor = options.currentSignedInActor();
      snapshot = actor === undefined ? Promise.resolve(undefined) : options.ledger.current(actor).then((current) => current === undefined ? undefined
        : Object.freeze({ actor, consent: current.consent, revisionHash: current.revisionHash }));
    },
    async finalized(manifest: TearGhostManifest, vault: GhostLocalVault): Promise<void> {
      const session = await snapshot;
      const device = options.trustedInputDevice();
      if (session === undefined || device === undefined || options.currentSignedInActor() !== session.actor
        || manifest.schemaVersion !== 2 || manifest.status !== "complete") return;
      const current = await options.ledger.current(session.actor);
      if (current?.consent !== session.consent || current.revisionHash !== session.revisionHash) return;
      const capsule = await new GhostCapsuleReader(vault).read(manifest.id);
      if (capsule.manifest.schemaVersion !== 2 || capsule.manifest.status !== "complete" || capsule.manifest.integrity.rootIntegrity !== manifest.integrity.rootIntegrity
        || capsule.maxTick < 0) return;
      const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
      if (readGhostReplayRunContext(capsule.manifest.provenance) === undefined || mapped.issues.length > 0 || mapped.accepted.commands !== capsule.tracks.commands.length) return;
      await options.pending.persist(createTearHumanCalibrationConsentAttestation({ participantId: session.actor, issuerId: "tear-live-human-calibration-capture",
        decidedAt: options.now(), consent: session.consent, consentRevisionHash: session.revisionHash, device, capsuleId: capsule.manifest.id,
        rootIntegrity: capsule.manifest.integrity.rootIntegrity, fromTick: 0, toTick: capsule.maxTick, actionHash: stableVerificationHash(mapped.ghost.actions) }));
    },
  });
}
