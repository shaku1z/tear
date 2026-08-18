import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "./capsule-vault";
import type { GhostPrivacyClass, GhostVisibility } from "./cloud-publication";

const PREFIX = "ghost-publication-consent:v1:";

export interface GhostPublicationConsentActor {
  /** An account-local subject. It is hashed before any durable write. */
  readonly subject: string;
  readonly isAnonymous: boolean;
}

export interface GhostPublicationConsentRecordV1 {
  readonly format: "tear-ghost-publication-consent";
  readonly schemaVersion: 1;
  /** Opaque local account binding; never the Firebase UID itself. */
  readonly actorHash: string;
  readonly revision: number;
  readonly cloudPublication: "granted" | "revoked" | "denied";
  readonly privacy: GhostPrivacyClass;
  readonly visibility: GhostVisibility;
  readonly trainingConsent: false;
  readonly decidedAt: string;
  readonly recordHash: string;
}

export interface GhostPublicationConsentDecision {
  readonly revision: number;
  readonly cloudPublication: "granted" | "revoked";
  readonly decidedAt: string;
}

export interface GhostPublicationConsentValidator {
  acceptForJob(value: GhostPublicationConsentRecordV1): Promise<GhostPublicationConsentRecordV1>;
}

function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function timestamp(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function object(value: unknown): Record<string, unknown> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function actorHash(actor: GhostPublicationConsentActor): string {
  if (!text(actor.subject) || actor.isAnonymous) throw new RangeError("publication consent requires a signed-in nonanonymous actor");
  return stableVerificationHash({ format: "tear-ghost-publication-consent-actor", schemaVersion: 1, subject: actor.subject });
}
function key(hash: string): string { return `${PREFIX}${hash}`; }
function freeze(draft: Omit<GhostPublicationConsentRecordV1, "recordHash">): GhostPublicationConsentRecordV1 {
  const copy = Object.freeze({ ...draft });
  return Object.freeze({ ...copy, recordHash: stableVerificationHash(copy) });
}

export function parseGhostPublicationConsentRecord(value: unknown): GhostPublicationConsentRecordV1 {
  const source = object(value);
  if (source?.format !== "tear-ghost-publication-consent" || source.schemaVersion !== 1 || !text(source.actorHash)
    || !Number.isSafeInteger(source.revision) || (source.revision as number) < 0
    || !["granted", "revoked", "denied"].includes(String(source.cloudPublication))
    || source.privacy !== "pseudonymous" || source.visibility !== "private" || source.trainingConsent !== false
    || !timestamp(source.decidedAt) || !text(source.recordHash)) throw new TypeError("invalid ghost publication consent record");
  const parsed = freeze({ format: "tear-ghost-publication-consent", schemaVersion: 1, actorHash: source.actorHash,
    revision: source.revision as number, cloudPublication: source.cloudPublication as GhostPublicationConsentRecordV1["cloudPublication"],
    privacy: "pseudonymous", visibility: "private", trainingConsent: false, decidedAt: source.decidedAt });
  if (parsed.recordHash !== source.recordHash) throw new TypeError("ghost publication consent integrity mismatch");
  return parsed;
}

/**
 * Local-only account consent. No bearer, UID, display name, or remote state is
 * retained. The immutable policy deliberately starts pseudonymous/private and
 * always denies model-training use.
 */
export class GhostLocalPublicationConsentLedger implements GhostPublicationConsentValidator {
  readonly #backend: GhostVaultBackend;
  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async read(actor: GhostPublicationConsentActor): Promise<GhostPublicationConsentRecordV1> {
    const hash = actorHash(actor), raw = await this.#backend.get("analysis", key(hash));
    if (raw === undefined) return freeze({ format: "tear-ghost-publication-consent", schemaVersion: 1, actorHash: hash, revision: 0,
      cloudPublication: "denied", privacy: "pseudonymous", visibility: "private", trainingConsent: false, decidedAt: "1970-01-01T00:00:00.000Z" });
    try {
      const record = parseGhostPublicationConsentRecord(JSON.parse(raw) as unknown);
      if (record.actorHash !== hash) throw new TypeError("publication consent actor mismatch");
      return record;
    } catch { throw new TypeError("publication consent is unavailable or malformed"); }
  }

  async decide(actor: GhostPublicationConsentActor, decision: GhostPublicationConsentDecision): Promise<GhostPublicationConsentRecordV1> {
    if (!Number.isSafeInteger(decision.revision) || decision.revision < 1 || !timestamp(decision.decidedAt)) throw new TypeError("invalid publication consent decision");
    const hash = actorHash(actor), raw = await this.#backend.get("analysis", key(hash));
    const current = raw === undefined
      ? undefined
      : (() => { try { const value = parseGhostPublicationConsentRecord(JSON.parse(raw) as unknown); if (value.actorHash !== hash) throw new TypeError(); return value; } catch { throw new TypeError("publication consent is unavailable or malformed"); } })();
    const next = freeze({ format: "tear-ghost-publication-consent", schemaVersion: 1, actorHash: hash, revision: decision.revision,
      cloudPublication: decision.cloudPublication, privacy: "pseudonymous", visibility: "private", trainingConsent: false, decidedAt: decision.decidedAt });
    if (current?.revision === next.revision) {
      if (current.recordHash !== next.recordHash) throw new RangeError("publication consent revision conflicts with durable decision");
      return current;
    }
    if (decision.revision !== (current?.revision ?? 0) + 1) throw new RangeError("publication consent revision must advance exactly once");
    await this.#backend.commitIfMatches([{ store: "analysis", key: key(hash), ...(raw === undefined ? {} : { expected: raw }) }], [{ store: "analysis", key: key(hash), value: JSON.stringify(next) }]);
    return next;
  }

  /** Rechecks the current durable revision immediately before local job custody is accepted. */
  async acceptForJob(value: GhostPublicationConsentRecordV1): Promise<GhostPublicationConsentRecordV1> {
    const supplied = parseGhostPublicationConsentRecord(value);
    if (supplied.cloudPublication !== "granted") throw new RangeError("cloud publication consent is not granted");
    const raw = await this.#backend.get("analysis", key(supplied.actorHash));
    if (raw === undefined) throw new RangeError("publication consent is unavailable");
    let current: GhostPublicationConsentRecordV1;
    try { current = parseGhostPublicationConsentRecord(JSON.parse(raw) as unknown); } catch { throw new TypeError("publication consent is unavailable or malformed"); }
    if (current.recordHash !== supplied.recordHash || current.revision !== supplied.revision || current.cloudPublication !== "granted") {
      throw new RangeError("publication consent changed or was revoked");
    }
    return current;
  }
}
