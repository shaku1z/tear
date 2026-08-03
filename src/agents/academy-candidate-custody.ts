import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import {
  assessAcademyCandidateEligibility,
  type TearAcademyCandidateDeclarationV1,
  type TearAcademyConsentRecordV1,
} from "./academy-candidate-admission";
import type { TearAcademyCandidateCapsuleMaterializationReceiptV1 } from "./academy-candidate-capsule-materializer";
import type { TearAcademyCandidateSourceAttestationV1 } from "./academy-candidate-source-attestation";

const CUSTODY_KEY_PREFIX = "academy-candidate-custody:v1:";

export type TearAcademyCandidateCustodyStatus = "held" | "revoked" | "expired";
export type TearAcademyCandidateRevocationScope = "local-recording" | "cloud-publication" | "analytics" | "model-training" | "all";

export interface TearAcademyCandidateRetentionPolicyV1 {
  readonly mode: "indefinite" | "until";
  readonly expiresAt?: string;
}

export interface TearAcademyCandidateCustodyEventV1 {
  readonly sequence: number;
  readonly kind: TearAcademyCandidateCustodyStatus;
  readonly decidedAt: string;
  readonly actor: string;
  readonly reason: string;
  readonly consentHash: string;
  readonly previousEventHash?: string;
  readonly revocationScope?: TearAcademyCandidateRevocationScope;
  readonly eventHash: string;
}

/** Durable pre-corpus custody only; this is not a reviewed Academy sample. */
export interface TearAcademyCandidateCustodyRecordV1 {
  readonly format: "tear-academy-candidate-custody";
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateHash: string;
  readonly status: TearAcademyCandidateCustodyStatus;
  readonly source: TearAcademyCandidateSourceAttestationV1;
  readonly admissionHash: string;
  readonly declarationHash: string;
  readonly consent: TearAcademyConsentRecordV1;
  readonly retention: TearAcademyCandidateRetentionPolicyV1;
  readonly events: readonly TearAcademyCandidateCustodyEventV1[];
  readonly recordHash: string;
}

export interface TearAcademyCandidateCustodyAcceptance {
  readonly declaration: TearAcademyCandidateDeclarationV1;
  readonly materialization: TearAcademyCandidateCapsuleMaterializationReceiptV1;
  readonly retention: TearAcademyCandidateRetentionPolicyV1;
  readonly decidedAt: string;
  readonly actor: string;
  readonly reason: string;
}

export interface TearAcademyCandidateCustodyRevocation {
  readonly candidateHash: string;
  readonly scope: TearAcademyCandidateRevocationScope;
  readonly consent: TearAcademyConsentRecordV1;
  readonly decidedAt: string;
  readonly actor: string;
  readonly reason: string;
}

export interface TearAcademyCandidateCustodyInventoryV1 {
  readonly records: readonly TearAcademyCandidateCustodyRecordV1[];
  /** Corrupt bytes remain untouched and are excluded from Academy use. */
  readonly rejectedKeys: readonly string[];
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function custodyKey(candidateHash: string): string {
  return `${CUSTODY_KEY_PREFIX}${candidateHash}`;
}

function validConsent(value: unknown): value is TearAcademyConsentRecordV1 {
  const source = record(value);
  return source?.format === "tear-academy-consent" && source.schemaVersion === 1
    && nonEmpty(source.revision) && timestamp(source.decidedAt)
    && ["granted", "denied", "revoked"].includes(String(source.localRecording))
    && ["granted", "denied", "revoked"].includes(String(source.cloudPublication))
    && ["granted", "denied", "revoked"].includes(String(source.analytics))
    && ["no-training", "private-personalization-only", "anonymous-improvement", "public-training"]
      .includes(String(source.modelTraining));
}

function copyConsent(value: TearAcademyConsentRecordV1): TearAcademyConsentRecordV1 {
  return Object.freeze({ ...value });
}

function retention(value: unknown): TearAcademyCandidateRetentionPolicyV1 | undefined {
  const source = record(value);
  if (source === undefined || (source.mode !== "indefinite" && source.mode !== "until")) return undefined;
  if (source.mode === "indefinite") {
    if (source.expiresAt !== undefined) return undefined;
    return Object.freeze({ mode: "indefinite" });
  }
  if (!timestamp(source.expiresAt)) return undefined;
  return Object.freeze({ mode: "until", expiresAt: source.expiresAt });
}

function sourceAttestation(value: unknown): TearAcademyCandidateSourceAttestationV1 | undefined {
  const source = record(value);
  const build = source === undefined ? undefined : record(source.build);
  const range = source === undefined ? undefined : record(source.capsuleRange);
  if (source?.format !== "tear-academy-candidate-source-attestation" || source.schemaVersion !== 1
    || !nonEmpty(source.candidateId) || typeof source.candidateHash !== "string" || !/^[a-f0-9]{16}$/u.test(source.candidateHash)
    || source.device !== "semantic" || build === undefined || range === undefined
    || !["version", "revision", "target", "rulesetVersion", "contentHash", "configHash"].every((key) => nonEmpty(build[key]))
    || !nonEmpty(source.replayContextHash) || !nonEmpty(source.attestationHash)
    || !nonEmpty(range.capsuleId) || !nonEmpty(range.rootIntegrity) || range.fromTick !== 0
    || typeof range.toTick !== "number" || !Number.isSafeInteger(range.toTick) || range.toTick < 1
    || !nonEmpty(range.actionHash) || !nonEmpty(range.terminalAnchorHash)) return undefined;
  return Object.freeze(structuredClone(source)) as unknown as TearAcademyCandidateSourceAttestationV1;
}

function eventHash(value: Omit<TearAcademyCandidateCustodyEventV1, "eventHash">): string {
  return stableVerificationHash(value);
}

function copyEvent(value: TearAcademyCandidateCustodyEventV1): TearAcademyCandidateCustodyEventV1 {
  return Object.freeze({ ...value });
}

function appendEvent(
  events: readonly TearAcademyCandidateCustodyEventV1[],
  input: Omit<TearAcademyCandidateCustodyEventV1, "sequence" | "previousEventHash" | "eventHash">,
): TearAcademyCandidateCustodyEventV1 {
  const previous = events.at(-1);
  const draft = Object.freeze({
    ...input, sequence: events.length + 1,
    ...(previous === undefined ? {} : { previousEventHash: previous.eventHash }),
  });
  return Object.freeze({ ...draft, eventHash: eventHash(draft) });
}

function validEvent(
  value: unknown,
  expectedSequence: number,
  expectedPreviousHash: string | undefined,
): value is TearAcademyCandidateCustodyEventV1 {
  const source = record(value);
  if (source?.sequence !== expectedSequence) return false;
  if (!["held", "revoked", "expired"].includes(String(source.kind))
    || !timestamp(source.decidedAt) || !nonEmpty(source.actor) || !nonEmpty(source.reason)
    || !/^[a-f0-9]{16}$/u.test(String(source.consentHash)) || !nonEmpty(source.eventHash)
    || source.previousEventHash !== expectedPreviousHash) return false;
  if (source.kind === "revoked") {
    if (!["local-recording", "cloud-publication", "analytics", "model-training", "all"].includes(String(source.revocationScope))) {
      return false;
    }
  } else if (source.revocationScope !== undefined) return false;
  const draft = Object.freeze({
    sequence: expectedSequence, kind: source.kind as TearAcademyCandidateCustodyStatus,
    decidedAt: source.decidedAt, actor: source.actor, reason: source.reason,
    consentHash: source.consentHash as string,
    ...(expectedPreviousHash === undefined ? {} : { previousEventHash: expectedPreviousHash }),
    ...(source.kind === "revoked" ? { revocationScope: source.revocationScope as TearAcademyCandidateRevocationScope } : {}),
  } satisfies Omit<TearAcademyCandidateCustodyEventV1, "eventHash">);
  return source.eventHash === eventHash(draft);
}

function recordHash(value: Omit<TearAcademyCandidateCustodyRecordV1, "recordHash">): string {
  return stableVerificationHash(value);
}

function freezeRecord(value: Omit<TearAcademyCandidateCustodyRecordV1, "recordHash">): TearAcademyCandidateCustodyRecordV1 {
  return Object.freeze({
    ...value,
    source: Object.freeze(structuredClone(value.source)),
    consent: copyConsent(value.consent), retention: Object.freeze({ ...value.retention }),
    events: Object.freeze(value.events.map(copyEvent)),
    recordHash: recordHash(value),
  });
}

function parseRecord(value: string): TearAcademyCandidateCustodyRecordV1 {
  const source = record(JSON.parse(value) as unknown);
  const policy = source === undefined ? undefined : retention(source.retention);
  const candidateId = source?.candidateId;
  const candidateHash = source?.candidateHash;
  if (source?.format !== "tear-academy-candidate-custody" || source.schemaVersion !== 1
    || !nonEmpty(candidateId) || typeof candidateHash !== "string" || !/^[a-f0-9]{16}$/u.test(candidateHash)
    || !["held", "revoked", "expired"].includes(String(source.status)) || !validConsent(source.consent)
    || policy === undefined || !Array.isArray(source.events) || source.events.length === 0
    || !nonEmpty(source.admissionHash) || !nonEmpty(source.declarationHash) || !nonEmpty(source.recordHash)) {
    throw new TypeError("invalid Academy candidate custody record");
  }
  const eventCopies: TearAcademyCandidateCustodyEventV1[] = [];
  let previousHash: string | undefined;
  for (const [index, event] of source.events.entries()) {
    if (!validEvent(event, index + 1, previousHash)) throw new TypeError("invalid Academy candidate custody event chain");
    const copied = copyEvent(event);
    eventCopies.push(copied);
    previousHash = copied.eventHash;
  }
  const finalEvent = eventCopies.at(-1);
  if (finalEvent === undefined || finalEvent.kind !== source.status
    || finalEvent.consentHash !== stableVerificationHash(source.consent)) {
    throw new TypeError("Academy candidate custody status does not match its decision chain");
  }
  const attestation = sourceAttestation(source.source);
  if (attestation?.candidateId !== candidateId || attestation.candidateHash !== candidateHash) {
    throw new TypeError("invalid Academy candidate custody source");
  }
  const draft = {
    format: "tear-academy-candidate-custody" as const, schemaVersion: 1 as const,
    candidateId, candidateHash, status: source.status as TearAcademyCandidateCustodyStatus,
    source: attestation, admissionHash: source.admissionHash,
    declarationHash: source.declarationHash, consent: copyConsent(source.consent), retention: policy,
    events: Object.freeze(eventCopies),
  };
  if (source.recordHash !== recordHash(draft)) throw new TypeError("Academy candidate custody record integrity mismatch");
  return freezeRecord(draft);
}

function assertEligible(input: TearAcademyCandidateCustodyAcceptance): void {
  const admission = assessAcademyCandidateEligibility(input.declaration);
  const attestation = input.materialization.attestation;
  const candidate = input.declaration.candidate;
  const source = input.declaration.trackBundle?.source;
  if (admission.disposition !== "eligible" || admission.candidateHash === null
    || input.materialization.candidateId !== candidate.episodeId || attestation.candidateId !== candidate.episodeId
    || attestation.candidateHash !== admission.candidateHash || input.materialization.capsuleId !== attestation.capsuleRange.capsuleId
    || source?.buildProvenance.status !== "captured" || source.buildProvenance.attestationHash !== attestation.attestationHash
    || source.capsuleRange.status !== "captured" || source.capsuleRange.capsuleId !== attestation.capsuleRange.capsuleId) {
    throw new RangeError("C31 custody requires an eligible candidate with its materialized source attestation");
  }
  const policy = retention(input.retention);
  if (policy === undefined || !timestamp(input.decidedAt) || !nonEmpty(input.actor) || !nonEmpty(input.reason)) {
    throw new TypeError("C31 custody requires a valid retention decision");
  }
  if (policy.mode === "until" && (policy.expiresAt === undefined || Date.parse(policy.expiresAt) <= Date.parse(input.decidedAt))) {
    throw new RangeError("C31 custody retention expiry must follow its acceptance decision");
  }
}

function assertRevocation(input: TearAcademyCandidateCustodyRevocation, current: TearAcademyCandidateCustodyRecordV1): void {
  if (!/^[a-f0-9]{16}$/u.test(input.candidateHash) || current.status !== "held"
    || !timestamp(input.decidedAt) || !nonEmpty(input.actor) || !nonEmpty(input.reason) || !validConsent(input.consent)
    || !["local-recording", "cloud-publication", "analytics", "model-training", "all"].includes(input.scope)
    || input.consent.revision === current.consent.revision) {
    throw new TypeError("invalid C31 candidate revocation");
  }
  const revoked = (scope: TearAcademyCandidateRevocationScope): boolean => {
    if (scope === "model-training") return input.consent.modelTraining === "no-training";
    if (scope === "all") return false;
    if (scope === "local-recording") return input.consent.localRecording === "revoked";
    if (scope === "cloud-publication") return input.consent.cloudPublication === "revoked";
    return input.consent.analytics === "revoked";
  };
  if ((input.scope === "all"
    && (!revoked("local-recording") || !revoked("cloud-publication") || !revoked("analytics") || !revoked("model-training")))
    || (input.scope !== "all" && !revoked(input.scope))) {
    throw new RangeError("C31 revocation consent does not revoke its declared scope");
  }
}

/**
 * Durable, append-only custody for an eligible C31 source. It stores neither a
 * reviewed sample nor a training manifest; consumers must use `held()` so
 * revoked and expired candidates cannot enter future Academy work.
 */
export class TearAcademyCandidateCustodyStore {
  readonly #backend: GhostVaultBackend;

  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async accept(input: TearAcademyCandidateCustodyAcceptance): Promise<TearAcademyCandidateCustodyRecordV1> {
    assertEligible(input);
    const candidateHash = input.materialization.attestation.candidateHash;
    const key = custodyKey(candidateHash);
    if (await this.#backend.get("analysis", key) !== undefined) {
      throw new TypeError(`Academy candidate custody already exists: ${candidateHash}`);
    }
    const admission = assessAcademyCandidateEligibility(input.declaration);
    const consent = copyConsent(input.declaration.consent);
    const policy = retention(input.retention);
    if (policy === undefined || admission.candidateHash === null) throw new Error("eligible C31 custody input became invalid");
    const initial = appendEvent([], {
      kind: "held", decidedAt: input.decidedAt, actor: input.actor, reason: input.reason,
      consentHash: stableVerificationHash(consent),
    });
    const durable = freezeRecord({
      format: "tear-academy-candidate-custody", schemaVersion: 1,
      candidateId: input.materialization.candidateId, candidateHash, status: "held",
      source: input.materialization.attestation,
      admissionHash: stableVerificationHash(admission), declarationHash: stableVerificationHash(input.declaration),
      consent, retention: policy, events: Object.freeze([initial]),
    });
    await this.#backend.commit([Object.freeze({ store: "analysis", key, value: JSON.stringify(durable) })]);
    return durable;
  }

  async get(candidateHash: string): Promise<TearAcademyCandidateCustodyRecordV1 | undefined> {
    const stored = await this.#backend.get("analysis", custodyKey(candidateHash));
    return stored === undefined ? undefined : parseRecord(stored);
  }

  async revoke(input: TearAcademyCandidateCustodyRevocation): Promise<TearAcademyCandidateCustodyRecordV1> {
    const current = await this.get(input.candidateHash);
    if (current === undefined) throw new RangeError(`unknown Academy candidate custody: ${input.candidateHash}`);
    assertRevocation(input, current);
    const event = appendEvent(current.events, {
      kind: "revoked", decidedAt: input.decidedAt, actor: input.actor, reason: input.reason,
      consentHash: stableVerificationHash(input.consent), revocationScope: input.scope,
    });
    const { recordHash: ignoredRecordHash, ...prior } = current;
    void ignoredRecordHash;
    const revised = freezeRecord({ ...prior, status: "revoked", consent: copyConsent(input.consent),
      events: Object.freeze([...current.events, event]) });
    await this.#backend.commit([Object.freeze({ store: "analysis", key: custodyKey(revised.candidateHash), value: JSON.stringify(revised) })]);
    return revised;
  }

  async expire(candidateHash: string, decidedAt: string, actor: string): Promise<TearAcademyCandidateCustodyRecordV1> {
    const current = await this.get(candidateHash);
    const expiresAt = current?.retention.expiresAt;
    if (current?.status !== "held" || current.retention.mode !== "until" || expiresAt === undefined
      || !timestamp(decidedAt) || !nonEmpty(actor) || Date.parse(decidedAt) < Date.parse(expiresAt)) {
      throw new RangeError("Academy candidate custody is not ready to expire");
    }
    const event = appendEvent(current.events, {
      kind: "expired", decidedAt, actor, reason: "retention boundary reached",
      consentHash: stableVerificationHash(current.consent),
    });
    const { recordHash: ignoredRecordHash, ...prior } = current;
    void ignoredRecordHash;
    const revised = freezeRecord({ ...prior, status: "expired", events: Object.freeze([...current.events, event]) });
    await this.#backend.commit([Object.freeze({ store: "analysis", key: custodyKey(revised.candidateHash), value: JSON.stringify(revised) })]);
    return revised;
  }

  async held(at: string): Promise<readonly TearAcademyCandidateCustodyRecordV1[]> {
    if (!timestamp(at)) throw new TypeError("Academy custody query requires a valid timestamp");
    const inventory = await this.inventory();
    return Object.freeze(inventory.records.filter((entry) => entry.status === "held"
      && (entry.retention.mode === "indefinite" || (entry.retention.expiresAt !== undefined
        && Date.parse(entry.retention.expiresAt) > Date.parse(at)))));
  }

  async inventory(): Promise<TearAcademyCandidateCustodyInventoryV1> {
    const records: TearAcademyCandidateCustodyRecordV1[] = [];
    const rejectedKeys: string[] = [];
    for (const key of await this.#backend.keys("analysis")) {
      if (!key.startsWith(CUSTODY_KEY_PREFIX)) continue;
      const stored = await this.#backend.get("analysis", key);
      if (stored === undefined) continue;
      try { records.push(parseRecord(stored)); }
      catch { rejectedKeys.push(key); }
    }
    return Object.freeze({
      records: Object.freeze(records.sort((left, right) => left.candidateHash.localeCompare(right.candidateHash))),
      rejectedKeys: Object.freeze(rejectedKeys.sort()),
    });
  }
}
