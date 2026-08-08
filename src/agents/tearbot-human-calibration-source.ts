import type { GhostVaultBackend, GhostLocalVault } from "../ghost";
import { GhostCapsuleReader, mapGhostCapsuleToReplayEnvelope, readGhostReplayRunContext } from "../ghost";
import { stableVerificationHash } from "../replay/hash";

const HASH = /^[a-f0-9]{16}$/u, KEY = "tearbot-human-calibration-source:v1:";
export interface TearHumanCalibrationConsentAttestationV1 {
  readonly format: "tearbot-human-calibration-consent"; readonly schemaVersion: 1;
  readonly participantId: string; readonly issuerId: string; readonly decidedAt: string;
  readonly consent: "anonymous-improvement" | "public-training"; readonly device: "keyboard-mouse" | "controller" | "touch";
  readonly capsuleId: string; readonly rootIntegrity: string; readonly fromTick: number; readonly toTick: number; readonly actionHash: string; readonly attestationHash: string;
}
export interface TearHumanCalibrationSourceReceiptV1 {
  readonly format: "tearbot-human-calibration-source"; readonly schemaVersion: 1; readonly participantId: string; readonly issuerId: string;
  readonly consentHash: string; readonly capsule: Readonly<{ id: string; rootIntegrity: string; fromTick: number; toTick: number; actionHash: string; replayContextHash: string }>;
  readonly features: Readonly<{ commandCount: number; activeCommandCount: number; activeCommandRate: number; meanInterCommandTicks: number; maximumInterCommandTicks: number }>;
  readonly receiptHash: string;
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function freeze<T>(value: T): T { return Object.freeze(structuredClone(value)); }
function attestationDraft(value: Omit<TearHumanCalibrationConsentAttestationV1, "attestationHash">): TearHumanCalibrationConsentAttestationV1 { if (!text(value.participantId) || !text(value.issuerId) || !Number.isFinite(Date.parse(value.decidedAt)) || !["anonymous-improvement", "public-training"].includes(value.consent) || !["keyboard-mouse", "controller", "touch"].includes(value.device) || !text(value.capsuleId) || !hash(value.rootIntegrity) || !Number.isSafeInteger(value.fromTick) || value.fromTick < 0 || !Number.isSafeInteger(value.toTick) || value.toTick < value.fromTick || !hash(value.actionHash)) throw new TypeError("invalid human calibration consent attestation"); const draft = freeze(value); return freeze({ ...draft, attestationHash: stableVerificationHash(draft) }); }
export function createTearHumanCalibrationConsentAttestation(input: Omit<TearHumanCalibrationConsentAttestationV1, "format" | "schemaVersion" | "attestationHash">): TearHumanCalibrationConsentAttestationV1 { return attestationDraft({ format: "tearbot-human-calibration-consent", schemaVersion: 1, ...input }); }
export function parseTearHumanCalibrationConsentAttestation(value: unknown): TearHumanCalibrationConsentAttestationV1 { if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid human calibration consent attestation"); const typed = value as TearHumanCalibrationConsentAttestationV1; if (!hash(typed.attestationHash)) throw new TypeError("invalid human calibration consent attestation"); const { attestationHash, ...draft } = typed, parsed = attestationDraft(draft); if (parsed.attestationHash !== attestationHash) throw new TypeError("human calibration consent attestation integrity mismatch"); return parsed; }

/** C35 source-only custody. Current normal capture does not issue these attestations, so no existing capsule becomes human evidence by inference. */
export class TearHumanCalibrationSourceStore {
  readonly #backend: GhostVaultBackend; readonly #vault: GhostLocalVault;
  constructor(backend: GhostVaultBackend, vault: GhostLocalVault) { this.#backend = backend; this.#vault = vault; }
  async admit(input: TearHumanCalibrationConsentAttestationV1): Promise<TearHumanCalibrationSourceReceiptV1> {
    const attestation = parseTearHumanCalibrationConsentAttestation(input), capsule = await new GhostCapsuleReader(this.#vault).read(attestation.capsuleId);
    if (capsule.manifest.schemaVersion !== 2 || capsule.manifest.status !== "complete" || capsule.manifest.integrity.rootIntegrity !== attestation.rootIntegrity || capsule.maxTick !== attestation.toTick || attestation.fromTick !== 0) throw new RangeError("human calibration requires one complete exact Ghost V3 capsule range");
    const context = readGhostReplayRunContext(capsule.manifest.provenance); const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
    if (context === undefined || mapped.issues.length > 0 || mapped.accepted.commands !== capsule.tracks.commands.length) throw new RangeError("human calibration requires a valid replay context and complete canonical command track");
    const actions = mapped.ghost.actions; const actionHash = stableVerificationHash(actions);
    if (actionHash !== attestation.actionHash) throw new RangeError("human calibration attestation action range does not match capsule");
    const duplicate = await this.#backend.get("indexes", `tearbot-human-calibration-participant:${attestation.participantId}:${attestation.capsuleId}`);
    if (duplicate !== undefined) throw new RangeError("human calibration capsule is already admitted for this participant");
    const ticks = actions.map((entry) => entry.tick), intervals = ticks.slice(1).map((tick, index) => tick - (ticks[index] ?? tick)); const active = actions.filter((entry) => Object.keys(entry.command).length > 1).length;
    const capsuleIdentity = freeze({ id: capsule.manifest.id, rootIntegrity: capsule.manifest.integrity.rootIntegrity, fromTick: attestation.fromTick, toTick: capsule.maxTick, actionHash, replayContextHash: stableVerificationHash(context) });
    const draft = { format: "tearbot-human-calibration-source" as const, schemaVersion: 1 as const, participantId: attestation.participantId, issuerId: attestation.issuerId, consentHash: attestation.attestationHash, capsule: capsuleIdentity, features: freeze({ commandCount: actions.length, activeCommandCount: active, activeCommandRate: actions.length === 0 ? 0 : active / actions.length, meanInterCommandTicks: intervals.length === 0 ? 0 : intervals.reduce((sum, value) => sum + value, 0) / intervals.length, maximumInterCommandTicks: intervals.length === 0 ? 0 : Math.max(...intervals) }) };
    const receipt = freeze({ ...draft, receiptHash: stableVerificationHash(draft) });
    await this.#backend.commit(Object.freeze([{ store: "analysis", key: `${KEY}${receipt.receiptHash}`, value: JSON.stringify(receipt) }, { store: "indexes", key: `tearbot-human-calibration-participant:${attestation.participantId}:${attestation.capsuleId}`, value: receipt.receiptHash }])); return receipt;
  }
}
