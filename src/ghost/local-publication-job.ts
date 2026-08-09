import { stableVerificationHash } from "../replay/hash";
import type { TearAcademyConsentRecordV1 } from "../agents/academy-candidate-admission";
import { parseGhostCapsuleManifest, type GhostLocalVault, type GhostVaultBackend, type TearGhostManifest } from "./capsule-vault";
import type { GhostPrivacyClass, GhostRunEligibilityInput, GhostVisibility } from "./cloud-publication";

const JOB_PREFIX = "ghost-publication-job:v1:";
const CUSTODY_PREFIX = "ghost-publication-custody:v1:";

export interface GhostPublicationCustodyV1 {
  readonly format: "tear-ghost-publication-custody";
  readonly schemaVersion: 1;
  readonly capsuleId: string;
  readonly consent: TearAcademyConsentRecordV1;
  readonly privacy: GhostPrivacyClass;
  readonly visibility: GhostVisibility;
  readonly eligibility: GhostRunEligibilityInput;
  readonly decidedAt: string;
  readonly custodyHash: string;
}

export interface GhostLocalPublicationJobV1 {
  readonly format: "tear-ghost-local-publication-job";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly status: "queued" | "cancelled";
  readonly source: Readonly<{ capsuleId: string; manifestHash: string; rootIntegrity: string; exportHash: string; byteLength: number }>;
  readonly transfer: Readonly<{ chunkCount: number; parts: readonly Readonly<{ partNumber: number; fromByte: number; toByte: number; hash: string }>[] }>;
  readonly custodyHash: string;
  readonly createdAt: string;
  readonly cancellationReason?: "cancelled-by-player" | "source-or-custody-changed";
  readonly jobHash: string;
}

export interface GhostLocalPublicationEnqueueInput {
  readonly capsuleId: string;
  readonly custody: Omit<GhostPublicationCustodyV1, "format" | "schemaVersion" | "capsuleId" | "custodyHash">;
  readonly createdAt: string;
  readonly partBytes: number;
}

function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function time(value: unknown): value is string { return nonEmpty(value) && Number.isFinite(Date.parse(value)); }
function object(value: unknown): Readonly<Record<string, unknown>> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function hash16(value: unknown): string { return stableVerificationHash(value); }
function custodyKey(id: string): string { return `${CUSTODY_PREFIX}${id}`; }
function jobKey(id: string): string { return `${JOB_PREFIX}${id}`; }

function validEligibility(value: unknown): value is GhostRunEligibilityInput {
  const source = object(value);
  return source !== undefined && ["resumed", "modded", "coached", "ghostAssisted", "bot", "debug", "stateForge"].every((key) => typeof source[key] === "boolean");
}

function validConsent(value: unknown): value is TearAcademyConsentRecordV1 {
  const source = object(value);
  return source?.format === "tear-academy-consent" && source.schemaVersion === 1 && nonEmpty(source.revision) && time(source.decidedAt)
    && ["granted", "denied", "revoked"].includes(String(source.localRecording))
    && ["granted", "denied", "revoked"].includes(String(source.cloudPublication))
    && ["granted", "denied", "revoked"].includes(String(source.analytics))
    && ["no-training", "private-personalization-only", "anonymous-improvement", "public-training"].includes(String(source.modelTraining));
}

function freezeCustody(draft: Omit<GhostPublicationCustodyV1, "custodyHash">): GhostPublicationCustodyV1 {
  const copy = Object.freeze({ ...draft, consent: Object.freeze({ ...draft.consent }), eligibility: Object.freeze({ ...draft.eligibility }) });
  return Object.freeze({ ...copy, custodyHash: hash16(copy) });
}

function parseCustody(bytes: string): GhostPublicationCustodyV1 {
  const source = object(JSON.parse(bytes) as unknown);
  if (source?.format !== "tear-ghost-publication-custody" || source.schemaVersion !== 1 || !nonEmpty(source.capsuleId)
    || !validConsent(source.consent) || source.consent.cloudPublication !== "granted" || !["public", "pseudonymous", "private", "sensitive"].includes(String(source.privacy))
    || !["private", "unlisted", "public"].includes(String(source.visibility)) || !validEligibility(source.eligibility) || !time(source.decidedAt) || !nonEmpty(source.custodyHash)) {
    throw new TypeError("invalid local publication custody");
  }
  const draft = { format: "tear-ghost-publication-custody" as const, schemaVersion: 1 as const, capsuleId: source.capsuleId,
    consent: Object.freeze({ ...source.consent }) as TearAcademyConsentRecordV1, privacy: source.privacy as GhostPrivacyClass,
    visibility: source.visibility as GhostVisibility, eligibility: Object.freeze({ ...source.eligibility }) as GhostRunEligibilityInput, decidedAt: source.decidedAt };
  const result = freezeCustody(draft);
  if (result.custodyHash !== source.custodyHash) throw new TypeError("local publication custody integrity mismatch");
  return result;
}

function sourceBinding(manifest: TearGhostManifest, exported: string): GhostLocalPublicationJobV1["source"] {
  return Object.freeze({ capsuleId: manifest.id, manifestHash: hash16(manifest), rootIntegrity: manifest.rootIntegrity,
    exportHash: hash16(exported), byteLength: new TextEncoder().encode(exported).byteLength });
}

function parts(exported: string, partBytes: number): GhostLocalPublicationJobV1["transfer"] {
  if (!Number.isSafeInteger(partBytes) || partBytes < 1 || partBytes > 8 * 1024 * 1024) throw new RangeError("publication partBytes is outside local bounds");
  const bytes = new TextEncoder().encode(exported);
  const list = [] as { partNumber: number; fromByte: number; toByte: number; hash: string }[];
  for (let fromByte = 0, partNumber = 1; fromByte < bytes.byteLength; fromByte += partBytes, partNumber += 1) {
    const toByte = Math.min(bytes.byteLength, fromByte + partBytes);
    list.push(Object.freeze({ partNumber, fromByte, toByte, hash: hash16(bytes.slice(fromByte, toByte)) }));
  }
  return Object.freeze({ chunkCount: list.length, parts: Object.freeze(list) });
}

function freezeJob(draft: Omit<GhostLocalPublicationJobV1, "jobHash">): GhostLocalPublicationJobV1 {
  const copy = Object.freeze({ ...draft, source: Object.freeze({ ...draft.source }), transfer: Object.freeze({ ...draft.transfer, parts: Object.freeze(draft.transfer.parts.map((part) => Object.freeze({ ...part }))) }) });
  return Object.freeze({ ...copy, jobHash: hash16(copy) });
}

function parseJob(bytes: string): GhostLocalPublicationJobV1 {
  const source = object(JSON.parse(bytes) as unknown), binding = source === undefined ? undefined : object(source.source), transfer = source === undefined ? undefined : object(source.transfer);
  if (source?.format !== "tear-ghost-local-publication-job" || source.schemaVersion !== 1 || !nonEmpty(source.id) || !["queued", "cancelled"].includes(String(source.status))
    || binding === undefined || !nonEmpty(binding.capsuleId) || !nonEmpty(binding.manifestHash) || !nonEmpty(binding.rootIntegrity) || !nonEmpty(binding.exportHash)
    || !Number.isSafeInteger(binding.byteLength) || (binding.byteLength as number) < 1 || transfer === undefined || !Number.isSafeInteger(transfer.chunkCount)
    || !Array.isArray(transfer.parts) || transfer.parts.length !== transfer.chunkCount || !nonEmpty(source.custodyHash) || !time(source.createdAt) || !nonEmpty(source.jobHash)
    || (source.status === "cancelled" && !["cancelled-by-player", "source-or-custody-changed"].includes(String(source.cancellationReason)))) throw new TypeError("invalid local publication job");
  const job = freezeJob({ format: "tear-ghost-local-publication-job", schemaVersion: 1, id: source.id, status: source.status as "queued" | "cancelled",
    source: Object.freeze({ capsuleId: binding.capsuleId, manifestHash: binding.manifestHash, rootIntegrity: binding.rootIntegrity, exportHash: binding.exportHash, byteLength: binding.byteLength as number }),
    transfer: Object.freeze({ chunkCount: transfer.chunkCount, parts: Object.freeze(transfer.parts.map((part) => { const p = object(part); if (p === undefined || !Number.isSafeInteger(p.partNumber) || !Number.isSafeInteger(p.fromByte) || !Number.isSafeInteger(p.toByte) || !nonEmpty(p.hash) || (p.fromByte as number) < 0 || (p.toByte as number) <= (p.fromByte as number)) throw new TypeError("invalid local publication part"); return Object.freeze({ partNumber: p.partNumber as number, fromByte: p.fromByte as number, toByte: p.toByte as number, hash: p.hash }); })) }),
    custodyHash: source.custodyHash, createdAt: source.createdAt,
    ...(source.status === "cancelled" ? { cancellationReason: source.cancellationReason as "cancelled-by-player" | "source-or-custody-changed" } : {}) });
  if (job.jobHash !== source.jobHash) throw new TypeError("local publication job integrity mismatch");
  return job;
}

/** Durable local intent only. It never stores export bytes, an identity, or a bearer credential. */
export class GhostLocalPublicationJobs {
  readonly #vault: GhostLocalVault;
  readonly #backend: GhostVaultBackend;
  constructor(vault: GhostLocalVault) { this.#vault = vault; this.#backend = vault.backend(); }

  async enqueue(input: GhostLocalPublicationEnqueueInput): Promise<GhostLocalPublicationJobV1> {
    if (!nonEmpty(input.capsuleId) || !time(input.createdAt)) throw new TypeError("publication enqueue requires a capsule and timestamp");
    let manifest: TearGhostManifest | undefined;
    try { manifest = await this.#vault.getManifest(input.capsuleId); } catch { throw new RangeError("publication requires a complete healthy capsule"); }
    if (manifest?.status !== "complete") throw new RangeError("publication requires a complete healthy capsule");
    const exported = await this.#vault.exportCapsule(input.capsuleId);
    const parsed = object(JSON.parse(exported) as unknown), chunks = parsed === undefined ? undefined : object(parsed.chunks);
    let exportedManifest: TearGhostManifest;
    try { exportedManifest = parsed === undefined ? (() => { throw new TypeError("missing export"); })() : parseGhostCapsuleManifest(parsed.manifest); } catch { throw new TypeError("publication export is incomplete or malformed"); }
    if (chunks === undefined || Object.keys(chunks).length !== manifest.chunks.length || exportedManifest.rootIntegrity !== manifest.rootIntegrity) throw new TypeError("publication export is incomplete or malformed");
    for (const chunk of manifest.chunks) if (typeof chunks[chunk.id] !== "string") throw new TypeError("publication export is missing a source chunk");
    const custody = freezeCustody({ format: "tear-ghost-publication-custody", schemaVersion: 1, capsuleId: input.capsuleId, consent: input.custody.consent,
      privacy: input.custody.privacy, visibility: input.custody.visibility, eligibility: input.custody.eligibility, decidedAt: input.custody.decidedAt });
    if (custody.consent.cloudPublication !== "granted") throw new RangeError("cloud publication custody is not granted");
    const source = sourceBinding(manifest, exported), id = hash16({ source, custodyHash: custody.custodyHash });
    const job = freezeJob({ format: "tear-ghost-local-publication-job", schemaVersion: 1, id, status: "queued", source, transfer: parts(exported, input.partBytes), custodyHash: custody.custodyHash, createdAt: input.createdAt });
    const oldJob = await this.#backend.get("uploadJobs", jobKey(id)), oldCustody = await this.#backend.get("analysis", custodyKey(input.capsuleId));
    if (oldJob !== undefined) { const existing = parseJob(oldJob); if (existing.jobHash === job.jobHash) return existing; throw new TypeError("publication job id conflicts with different durable bytes"); }
    if (oldCustody !== undefined) { const existing = parseCustody(oldCustody); if (existing.custodyHash !== custody.custodyHash) throw new RangeError("publication custody has changed; create a new explicit job after review"); }
    await this.#backend.commitIfMatches([{ store: "manifests", key: input.capsuleId, expected: JSON.stringify(manifest) }, { store: "uploadJobs", key: jobKey(id) }, { store: "analysis", key: custodyKey(input.capsuleId), ...(oldCustody === undefined ? {} : { expected: oldCustody }) }], [
      { store: "analysis", key: custodyKey(input.capsuleId), value: JSON.stringify(custody) }, { store: "uploadJobs", key: jobKey(id), value: JSON.stringify(job) },
    ]);
    return job;
  }

  async read(id: string): Promise<GhostLocalPublicationJobV1 | undefined> {
    const raw = await this.#backend.get("uploadJobs", jobKey(id)); if (raw === undefined) return undefined;
    const job = parseJob(raw); if (job.status === "cancelled") return job;
    const [manifestRaw, custodyRaw] = await Promise.all([this.#backend.get("manifests", job.source.capsuleId), this.#backend.get("analysis", custodyKey(job.source.capsuleId))]);
    let current: boolean;
    try { const manifest = manifestRaw === undefined ? undefined : parseGhostCapsuleManifest(JSON.parse(manifestRaw)); const custody = custodyRaw === undefined ? undefined : parseCustody(custodyRaw); current = manifest?.status === "complete" && custody?.custodyHash === job.custodyHash && custody.consent.cloudPublication === "granted" && manifest.rootIntegrity === job.source.rootIntegrity && hash16(manifest) === job.source.manifestHash && hash16(await this.#vault.exportCapsule(job.source.capsuleId)) === job.source.exportHash; } catch { current = false; }
    if (current) return job;
    const { jobHash: ignoredJobHash, ...prior } = job; void ignoredJobHash;
    const cancelled = freezeJob({ ...prior, status: "cancelled", cancellationReason: "source-or-custody-changed" });
    await this.#backend.commitIfMatches([{ store: "uploadJobs", key: jobKey(id), expected: raw }], [{ store: "uploadJobs", key: jobKey(id), value: JSON.stringify(cancelled) }]);
    return cancelled;
  }

  async cancel(id: string): Promise<GhostLocalPublicationJobV1> {
    const raw = await this.#backend.get("uploadJobs", jobKey(id)); if (raw === undefined) throw new RangeError("local publication job does not exist");
    const job = parseJob(raw); if (job.status === "cancelled") return job;
    const { jobHash: ignoredJobHash, ...prior } = job; void ignoredJobHash;
    const cancelled = freezeJob({ ...prior, status: "cancelled", cancellationReason: "cancelled-by-player" });
    await this.#backend.commitIfMatches([{ store: "uploadJobs", key: jobKey(id), expected: raw }], [{ store: "uploadJobs", key: jobKey(id), value: JSON.stringify(cancelled) }]);
    return cancelled;
  }
}
