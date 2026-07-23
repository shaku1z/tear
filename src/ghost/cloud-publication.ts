import { canonicalStringify } from "../replay/hash";

export type GhostVisibility = "private" | "unlisted" | "public";
export type GhostValidationStage =
  | "structural" | "integrity" | "compatibility" | "simulation"
  | "result" | "anomaly" | "moderation";

export interface GhostRunEligibilityInput {
  readonly resumed: boolean;
  readonly modded: boolean;
  readonly coached: boolean;
  readonly ghostAssisted: boolean;
  readonly bot: boolean;
  readonly debug: boolean;
  readonly stateForge: boolean;
}

export interface GhostRunEligibility extends GhostRunEligibilityInput {
  readonly eligibleForHumanRecords: boolean;
  readonly reasons: readonly string[];
}

export function classifyRunEligibility(input: GhostRunEligibilityInput): GhostRunEligibility {
  const reasons = (Object.entries(input) as [keyof GhostRunEligibilityInput, boolean][])
    .filter(([, value]) => value)
    .map(([key]) => key);
  return Object.freeze({
    ...input,
    eligibleForHumanRecords: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}

export type GhostPrivacyClass = "public" | "pseudonymous" | "private" | "sensitive";

export interface GhostPublicationManifest {
  readonly capsuleId: string;
  readonly buildId: string;
  readonly schemaVersion: number;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly resultHash: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly privacy: GhostPrivacyClass;
  readonly eligibility: GhostRunEligibilityInput;
}

export interface GhostValidationResult {
  readonly stage: GhostValidationStage;
  readonly status: "pass" | "fail" | "unsupported" | "quarantined";
  readonly reason: string;
}

export interface GhostVerificationVerdict {
  readonly format: "ghost-verdict";
  readonly version: 1;
  readonly capsuleId: string;
  readonly buildId: string;
  readonly contentHash: string;
  readonly resultHash: string;
  readonly status: "verified" | "rejected" | "unsupported" | "quarantined";
  readonly stages: readonly GhostValidationResult[];
  readonly verifierId: string;
  readonly verifiedAt: string;
  readonly signatureAlgorithm: string;
  readonly signature: string;
}

export interface GhostHistoricalRuntime {
  readonly buildId: string;
  verify(capsule: Uint8Array, manifest: GhostPublicationManifest): Promise<Readonly<{
    resultHash: string;
    anomalous: boolean;
  }>>;
}

export interface GhostVerdictSigner {
  readonly id: string;
  readonly algorithm: string;
  sign(canonicalVerdict: string): Promise<string>;
}

export interface GhostModerationDecision {
  readonly blocked: boolean;
  readonly reason: string;
}

export interface GhostModerationPort {
  inspect(manifest: GhostPublicationManifest): Promise<GhostModerationDecision>;
}

export interface GhostPublicationPolicy {
  readonly maximumBytes: number;
  readonly maximumParts: number;
  readonly relayDelayTicks: number;
  readonly requestsPerWindow: number;
}

export interface GhostUploadPart {
  readonly partNumber: number;
  readonly bytes: Uint8Array;
  readonly hash: string;
}

export interface GhostUploadRecord {
  readonly uploadId: string;
  readonly ownerId: string;
  readonly manifest: GhostPublicationManifest;
  readonly visibility: GhostVisibility;
  readonly trainingConsent: boolean;
  readonly status: "uploading" | "finalized" | "deleted" | "quarantined";
  readonly parts: readonly GhostUploadPart[];
  readonly verdict?: GhostVerificationVerdict;
}

export interface GhostPublicMetadata {
  readonly capsuleId: string;
  readonly buildId: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly pseudonym: string;
  readonly visibility: Exclude<GhostVisibility, "private">;
  readonly eligibility: GhostRunEligibility;
  readonly verification: GhostVerificationVerdict["status"];
}

export interface GhostAuditEntry {
  readonly sequence: number;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly detail: string;
}

export interface GhostAppeal {
  readonly id: string;
  readonly capsuleId: string;
  readonly ownerId: string;
  readonly reason: string;
  readonly status: "open" | "upheld" | "reversed";
}

export interface GhostRelayFrame {
  readonly capsuleId: string;
  readonly tick: number;
  readonly availableAtTick: number;
  readonly payload: Uint8Array;
  readonly immutable: true;
}

function freezeRecord(record: GhostUploadRecord): GhostUploadRecord {
  return Object.freeze({
    ...record,
    manifest: Object.freeze({ ...record.manifest, tags: Object.freeze([...record.manifest.tags]) }),
    parts: Object.freeze(record.parts.map((part) => Object.freeze({ ...part, bytes: part.bytes.slice() }))),
  });
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function ghostSha256(bytes: Uint8Array | string): Promise<string> {
  const input = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return hex(await crypto.subtle.digest("SHA-256", Uint8Array.from(input).buffer));
}

export async function pseudonymizeGhostIdentity(identity: string, salt: string): Promise<string> {
  return `ghost-${(await ghostSha256(`${salt}\0${identity}`)).slice(0, 20)}`;
}

export function sanitizeGhostMetadata(manifest: GhostPublicationManifest): GhostPublicationManifest {
  const clean = (value: string, maximum: number): string => value
    .normalize("NFKC")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .replace(/(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})\S*/gu, "[redacted]")
    .trim()
    .slice(0, maximum);
  return Object.freeze({
    ...manifest,
    title: clean(manifest.title, 80),
    tags: Object.freeze(manifest.tags.slice(0, 12).map((tag) => clean(tag, 24)).filter(Boolean)),
  });
}

function concatenate(parts: readonly GhostUploadPart[]): Uint8Array {
  const ordered = [...parts].sort((left, right) => left.partNumber - right.partNumber);
  const total = ordered.reduce((sum, part) => sum + part.bytes.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of ordered) {
    output.set(part.bytes, offset);
    offset += part.bytes.byteLength;
  }
  return output;
}

function verdictStatus(stages: readonly GhostValidationResult[]): GhostVerificationVerdict["status"] {
  if (stages.some((stage) => stage.status === "quarantined")) return "quarantined";
  if (stages.some((stage) => stage.status === "fail")) return "rejected";
  if (stages.some((stage) => stage.status === "unsupported")) return "unsupported";
  return "verified";
}

export class GhostCloudPublicationService {
  readonly #records = new Map<string, GhostUploadRecord>();
  readonly #runtimes = new Map<string, GhostHistoricalRuntime>();
  readonly #audit: GhostAuditEntry[] = [];
  readonly #appeals = new Map<string, GhostAppeal>();
  readonly #blockedIdentities = new Set<string>();
  readonly #requestCounts = new Map<string, number>();
  readonly #relay = new Map<string, readonly GhostRelayFrame[]>();
  #sequence = 0;

  constructor(
    readonly policy: GhostPublicationPolicy,
    runtimes: readonly GhostHistoricalRuntime[],
    readonly signer: GhostVerdictSigner,
    readonly moderation: GhostModerationPort,
    readonly pseudonymSalt: string,
  ) {
    for (const runtime of runtimes) this.#runtimes.set(runtime.buildId, runtime);
  }

  #log(actor: string, action: string, target: string, detail: string): void {
    this.#sequence += 1;
    this.#audit.push(Object.freeze({ sequence: this.#sequence, actor, action, target, detail }));
  }

  #rateLimit(identity: string): void {
    const count = (this.#requestCounts.get(identity) ?? 0) + 1;
    this.#requestCounts.set(identity, count);
    if (count > this.policy.requestsPerWindow) throw new Error("publication rate limit exceeded");
    if (this.#blockedIdentities.has(identity)) throw new Error("identity is blocked");
  }

  beginUpload(
    ownerId: string,
    manifest: GhostPublicationManifest,
    options: Readonly<{ visibility: GhostVisibility; trainingConsent: boolean }>,
  ): GhostUploadRecord {
    this.#rateLimit(ownerId);
    if (!Number.isSafeInteger(manifest.byteLength) || manifest.byteLength <= 0 || manifest.byteLength > this.policy.maximumBytes) {
      throw new RangeError("capsule byte length is outside publication policy");
    }
    if (this.#records.has(manifest.capsuleId)) throw new Error("capsule already exists");
    const record = freezeRecord({
      uploadId: crypto.randomUUID(),
      ownerId,
      manifest: sanitizeGhostMetadata(manifest),
      visibility: options.visibility,
      trainingConsent: options.trainingConsent,
      status: "uploading",
      parts: [],
    });
    this.#records.set(manifest.capsuleId, record);
    this.#log(ownerId, "upload.begin", manifest.capsuleId, options.visibility);
    return record;
  }

  async uploadPart(ownerId: string, capsuleId: string, partNumber: number, bytes: Uint8Array): Promise<GhostUploadPart> {
    this.#rateLimit(ownerId);
    const record = this.#ownedRecord(ownerId, capsuleId);
    if (record.status !== "uploading") throw new Error("upload is not accepting parts");
    if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > this.policy.maximumParts) {
      throw new RangeError("part number is outside publication policy");
    }
    const part = Object.freeze({ partNumber, bytes: bytes.slice(), hash: await ghostSha256(bytes) });
    const parts = [...record.parts.filter((entry) => entry.partNumber !== partNumber), part]
      .sort((left, right) => left.partNumber - right.partNumber);
    this.#records.set(capsuleId, freezeRecord({ ...record, parts }));
    this.#log(ownerId, "upload.part", capsuleId, String(partNumber));
    return part;
  }

  async finalize(ownerId: string, capsuleId: string, verifiedAt: string): Promise<GhostVerificationVerdict> {
    this.#rateLimit(ownerId);
    const record = this.#ownedRecord(ownerId, capsuleId);
    if (record.status !== "uploading") throw new Error("upload cannot be finalized");
    const capsule = concatenate(record.parts);
    const stages: GhostValidationResult[] = [];
    stages.push({
      stage: "structural",
      status: capsule.byteLength === record.manifest.byteLength && record.parts.length > 0 ? "pass" : "fail",
      reason: capsule.byteLength === record.manifest.byteLength ? "bounded parts are complete" : "declared byte length differs",
    });
    const actualHash = await ghostSha256(capsule);
    stages.push({
      stage: "integrity",
      status: actualHash === record.manifest.contentHash ? "pass" : "fail",
      reason: actualHash === record.manifest.contentHash ? "SHA-256 content hash matches" : "SHA-256 content hash mismatch",
    });
    const runtime = this.#runtimes.get(record.manifest.buildId);
    stages.push({
      stage: "compatibility",
      status: runtime === undefined ? "unsupported" : "pass",
      reason: runtime === undefined ? "historical runtime is unavailable" : "trusted runtime is available",
    });
    if (runtime !== undefined && stages.every((stage) => stage.status === "pass")) {
      const simulation = await runtime.verify(capsule, record.manifest);
      stages.push({
        stage: "simulation",
        status: simulation.resultHash === record.manifest.resultHash ? "pass" : "fail",
        reason: simulation.resultHash === record.manifest.resultHash ? "trusted re-simulation matched" : "re-simulation diverged",
      });
      stages.push({
        stage: "result",
        status: simulation.resultHash === record.manifest.resultHash ? "pass" : "fail",
        reason: simulation.resultHash === record.manifest.resultHash ? "declared result is causal" : "declared result is not causal",
      });
      stages.push({
        stage: "anomaly",
        status: simulation.anomalous ? "quarantined" : "pass",
        reason: simulation.anomalous ? "runtime reported an anomaly" : "no anomaly detected",
      });
    } else {
      stages.push({ stage: "simulation", status: runtime === undefined ? "unsupported" : "fail", reason: "simulation not attempted" });
      stages.push({ stage: "result", status: runtime === undefined ? "unsupported" : "fail", reason: "result not established" });
      stages.push({ stage: "anomaly", status: runtime === undefined ? "unsupported" : "fail", reason: "anomaly status not established" });
    }
    const moderation = await this.moderation.inspect(record.manifest);
    stages.push({
      stage: "moderation",
      status: moderation.blocked ? "quarantined" : "pass",
      reason: moderation.reason,
    });
    const unsigned = {
      format: "ghost-verdict" as const,
      version: 1 as const,
      capsuleId,
      buildId: record.manifest.buildId,
      contentHash: actualHash,
      resultHash: record.manifest.resultHash,
      status: verdictStatus(stages),
      stages: Object.freeze(stages.map((stage) => Object.freeze(stage))),
      verifierId: this.signer.id,
      verifiedAt,
      signatureAlgorithm: this.signer.algorithm,
    };
    const verdict = Object.freeze({
      ...unsigned,
      signature: await this.signer.sign(canonicalStringify(unsigned)),
    });
    const status = verdict.status === "quarantined" ? "quarantined" : "finalized";
    this.#records.set(capsuleId, freezeRecord({ ...record, status, verdict }));
    this.#log(ownerId, "upload.finalize", capsuleId, verdict.status);
    return verdict;
  }

  async publicMetadata(): Promise<readonly GhostPublicMetadata[]> {
    const output: GhostPublicMetadata[] = [];
    for (const record of this.#records.values()) {
      if (record.status !== "finalized" || record.visibility === "private" || record.verdict === undefined) continue;
      output.push(Object.freeze({
        capsuleId: record.manifest.capsuleId,
        buildId: record.manifest.buildId,
        title: record.manifest.title,
        tags: record.manifest.tags,
        pseudonym: await pseudonymizeGhostIdentity(record.ownerId, this.pseudonymSalt),
        visibility: record.visibility,
        eligibility: classifyRunEligibility(record.manifest.eligibility),
        verification: record.verdict.status,
      }));
    }
    return Object.freeze(output);
  }

  download(capsuleId: string, range?: Readonly<{ from: number; toExclusive: number }>): Uint8Array | undefined {
    const record = this.#records.get(capsuleId);
    if (record?.status !== "finalized" || record.visibility === "private") return undefined;
    const bytes = concatenate(record.parts);
    if (range === undefined) return bytes;
    if (range.from < 0 || range.toExclusive <= range.from || range.toExclusive > bytes.byteLength) {
      throw new RangeError("download range is invalid");
    }
    return bytes.slice(range.from, range.toExclusive);
  }

  setVisibility(ownerId: string, capsuleId: string, visibility: GhostVisibility): void {
    this.#rateLimit(ownerId);
    const record = this.#ownedRecord(ownerId, capsuleId);
    this.#records.set(capsuleId, freezeRecord({ ...record, visibility }));
    this.#log(ownerId, "visibility.change", capsuleId, visibility);
  }

  setTrainingConsent(ownerId: string, capsuleId: string, trainingConsent: boolean): void {
    this.#rateLimit(ownerId);
    const record = this.#ownedRecord(ownerId, capsuleId);
    this.#records.set(capsuleId, freezeRecord({ ...record, trainingConsent }));
    this.#log(ownerId, "consent.change", capsuleId, String(trainingConsent));
  }

  delete(ownerId: string, capsuleId: string): Readonly<{ localRetentionUnaffected: true }> {
    this.#rateLimit(ownerId);
    const record = this.#ownedRecord(ownerId, capsuleId);
    this.#records.set(capsuleId, freezeRecord({ ...record, status: "deleted", visibility: "private", parts: [] }));
    this.#log(ownerId, "capsule.delete", capsuleId, "public object removed; local vault unaffected");
    return Object.freeze({ localRetentionUnaffected: true });
  }

  report(actor: string, capsuleId: string, reason: string): void {
    this.#rateLimit(actor);
    if (!this.#records.has(capsuleId)) throw new Error("capsule does not exist");
    this.#log(actor, "moderation.report", capsuleId, reason.slice(0, 240));
  }

  block(actor: string, identity: string): void {
    this.#blockedIdentities.add(identity);
    this.#log(actor, "identity.block", identity, "blocked");
  }

  appeal(ownerId: string, capsuleId: string, reason: string): GhostAppeal {
    const record = this.#ownedRecord(ownerId, capsuleId);
    if (record.status !== "quarantined") throw new Error("only quarantined capsules may be appealed");
    const appeal = Object.freeze({
      id: crypto.randomUUID(),
      capsuleId,
      ownerId,
      reason: reason.slice(0, 500),
      status: "open" as const,
    });
    this.#appeals.set(appeal.id, appeal);
    this.#log(ownerId, "moderation.appeal", capsuleId, appeal.id);
    return appeal;
  }

  appendRelayFrame(ownerId: string, capsuleId: string, tick: number, payload: Uint8Array): GhostRelayFrame {
    const record = this.#ownedRecord(ownerId, capsuleId);
    if (record.status !== "uploading" && record.status !== "finalized") throw new Error("relay source is unavailable");
    const frames = this.#relay.get(capsuleId) ?? [];
    if (frames.some((frame) => frame.tick === tick)) throw new Error("relay frames are immutable");
    const frame = Object.freeze({
      capsuleId,
      tick,
      availableAtTick: tick + this.policy.relayDelayTicks,
      payload: payload.slice(),
      immutable: true as const,
    });
    this.#relay.set(capsuleId, Object.freeze([...frames, frame].sort((left, right) => left.tick - right.tick)));
    return frame;
  }

  relayFrames(capsuleId: string, viewerTick: number): readonly GhostRelayFrame[] {
    return Object.freeze((this.#relay.get(capsuleId) ?? [])
      .filter((frame) => frame.availableAtTick <= viewerTick)
      .map((frame) => Object.freeze({ ...frame, payload: frame.payload.slice() })));
  }

  auditLog(): readonly GhostAuditEntry[] {
    return Object.freeze([...this.#audit]);
  }

  #ownedRecord(ownerId: string, capsuleId: string): GhostUploadRecord {
    const record = this.#records.get(capsuleId);
    if (record === undefined) throw new Error("capsule does not exist");
    if (record.ownerId !== ownerId) throw new Error("capsule owner mismatch");
    return record;
  }
}
