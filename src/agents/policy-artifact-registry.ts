import type { GhostVaultBackend } from "../ghost";
import { stableVerificationHash } from "../replay/hash";
import type { TearBuildIdentityV1, TearObservationClass } from "../tearbench/contracts";

const ARTIFACT_KEY = "policy-artifact:v1:";
const ACTIVE_KEY = "policy-active:v1";
const ACTIVATION_KEY = "policy-activation:v1:";
const RETENTION_KEY = "policy-retention:v1:";
const PRODUCTION_EVALUATION_KEY = "policy-production-evaluation:v1:";
const PRODUCTION_OUTCOME_SUITE_KEY = "policy-production-outcome-suite:v1:";
const HASH = /^[a-f0-9]{16}$/u;

export interface TearPolicyRuntimeCompatibility {
  readonly runtime: "tear-policy-runtime.v1";
  readonly observationClass: TearObservationClass;
  readonly actionSchema: "tear-game-action-command-envelope.v1";
  readonly modelFormats: readonly string[];
}

export interface TearPolicyArtifactV1 {
  readonly format: "tear-policy-artifact";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly createdAt: string;
  readonly model: Readonly<{ format: string; payload: string; modelHash: string }>;
  readonly encoder: Readonly<{ id: string; schemaVersion: number; observationClass: TearObservationClass; normalizationHash: string }>;
  readonly actionSchema: "tear-game-action-command-envelope.v1";
  readonly recurrentState: Readonly<{ kind: "none" | "gru" | "lstm"; schemaVersion: number }>;
  readonly trainingManifest: Readonly<{ id: string; version: number; rootHash: string }>;
  readonly rewardVersion: string;
  readonly build: TearBuildIdentityV1;
  readonly metrics: Readonly<Record<string, number>>;
  readonly levelTarget: "class-a" | "class-b";
  readonly lineage: Readonly<{ trainingRunId: string; parentArtifactId?: string }>;
  readonly signature: Readonly<{ kind: "local-unsigned"; keyId: string }>;
  readonly compatibility: TearPolicyRuntimeCompatibility;
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly artifactHash: string;
}

export interface TearPolicyArtifactDraft extends Omit<TearPolicyArtifactV1, "format" | "schemaVersion" | "model" | "extensions" | "artifactHash"> {
  readonly model: Readonly<{ format: string; payload: string }>;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface TearPolicyActivationV1 {
  readonly format: "tear-policy-activation";
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly activatedAt: string;
  readonly previousArtifactId?: string;
  readonly activationHash: string;
}

export interface TearPolicyRetentionReceiptV1 {
  readonly format: "tear-policy-retention-receipt";
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly retainedAt: string;
  readonly maxUnactivated: number;
  readonly removedArtifactIds: readonly string[];
  readonly protectedArtifactIds: readonly string[];
  readonly receiptHash: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function timestamp(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value); }
function hashes(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function finiteMetrics(value: unknown): value is Readonly<Record<string, number>> {
  return record(value) && Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry));
}
function artifactKey(id: string): string { return `${ARTIFACT_KEY}${id}`; }
function activationKey(revision: number): string { return `${ACTIVATION_KEY}${String(revision).padStart(12, "0")}`; }
function retentionKey(revision: number): string { return `${RETENTION_KEY}${String(revision).padStart(12, "0")}`; }

function freezeCompatibility(value: TearPolicyRuntimeCompatibility): TearPolicyRuntimeCompatibility {
  return Object.freeze({ ...value, modelFormats: Object.freeze([...value.modelFormats]) });
}
function validCompatibility(value: unknown): value is TearPolicyRuntimeCompatibility {
  return record(value) && value.runtime === "tear-policy-runtime.v1"
    && (value.observationClass === "structured-state" || value.observationClass === "pixel-only")
    && value.actionSchema === "tear-game-action-command-envelope.v1"
    && Array.isArray(value.modelFormats) && value.modelFormats.length > 0
    && value.modelFormats.every(text) && new Set(value.modelFormats).size === value.modelFormats.length;
}
function artifactHash(value: Omit<TearPolicyArtifactV1, "artifactHash">): string { return stableVerificationHash(value); }
function activationHash(value: Omit<TearPolicyActivationV1, "activationHash">): string { return stableVerificationHash(value); }
function retentionHash(value: Omit<TearPolicyRetentionReceiptV1, "receiptHash">): string { return stableVerificationHash(value); }

function validBuild(value: unknown): value is TearBuildIdentityV1 {
  return record(value) && ["version", "revision", "target", "rulesetVersion", "contentHash", "configHash"].every((key) => text(value[key]));
}

function freezeArtifact(value: Omit<TearPolicyArtifactV1, "artifactHash">): TearPolicyArtifactV1 {
  return Object.freeze({
    ...value,
    model: Object.freeze({ ...value.model }), encoder: Object.freeze({ ...value.encoder }),
    recurrentState: Object.freeze({ ...value.recurrentState }), trainingManifest: Object.freeze({ ...value.trainingManifest }),
    build: Object.freeze({ ...value.build }), metrics: Object.freeze({ ...value.metrics }), lineage: Object.freeze({ ...value.lineage }),
    signature: Object.freeze({ ...value.signature }), compatibility: freezeCompatibility(value.compatibility),
    extensions: Object.freeze(structuredClone(value.extensions)), artifactHash: artifactHash(value),
  });
}

export function createTearPolicyArtifact(input: TearPolicyArtifactDraft): TearPolicyArtifactV1 {
  const draft = {
    format: "tear-policy-artifact" as const, schemaVersion: 1 as const, id: input.id, createdAt: input.createdAt,
    model: Object.freeze({ ...input.model, modelHash: stableVerificationHash(input.model.payload) }),
    encoder: input.encoder, actionSchema: input.actionSchema, recurrentState: input.recurrentState,
    trainingManifest: input.trainingManifest, rewardVersion: input.rewardVersion, build: input.build, metrics: input.metrics,
    levelTarget: input.levelTarget, lineage: input.lineage, signature: input.signature, compatibility: input.compatibility,
    extensions: input.extensions ?? Object.freeze({}),
  };
  return parseTearPolicyArtifact({ ...draft, artifactHash: artifactHash(draft) });
}

export function parseTearPolicyArtifact(value: unknown): TearPolicyArtifactV1 {
  if (!record(value) || value.format !== "tear-policy-artifact" || value.schemaVersion !== 1
    || !text(value.id) || !timestamp(value.createdAt) || !record(value.model) || !text(value.model.format)
    || !text(value.model.payload) || !hashes(value.model.modelHash) || stableVerificationHash(value.model.payload) !== value.model.modelHash
    || !record(value.encoder) || !text(value.encoder.id) || !integer(value.encoder.schemaVersion) || value.encoder.schemaVersion < 1
    || (value.encoder.observationClass !== "structured-state" && value.encoder.observationClass !== "pixel-only") || !hashes(value.encoder.normalizationHash)
    || value.actionSchema !== "tear-game-action-command-envelope.v1" || !record(value.recurrentState)
    || !["none", "gru", "lstm"].includes(String(value.recurrentState.kind)) || !integer(value.recurrentState.schemaVersion) || value.recurrentState.schemaVersion < 1
    || !record(value.trainingManifest) || !text(value.trainingManifest.id) || !integer(value.trainingManifest.version) || value.trainingManifest.version < 1 || !hashes(value.trainingManifest.rootHash)
    || !text(value.rewardVersion) || !validBuild(value.build) || !finiteMetrics(value.metrics)
    || (value.levelTarget !== "class-a" && value.levelTarget !== "class-b") || !record(value.lineage) || !text(value.lineage.trainingRunId)
    || (value.lineage.parentArtifactId !== undefined && !text(value.lineage.parentArtifactId)) || !record(value.signature)
    || value.signature.kind !== "local-unsigned" || !text(value.signature.keyId) || !validCompatibility(value.compatibility)
    || (value.extensions !== undefined && !record(value.extensions)) || !hashes(value.artifactHash)) throw new TypeError("invalid policy artifact");
  const typed = value as unknown as Omit<TearPolicyArtifactV1, "artifactHash"> & { artifactHash: string };
  const { artifactHash: recorded, ...draft } = typed;
  if (recorded !== artifactHash(draft)) throw new TypeError("policy artifact integrity mismatch");
  return freezeArtifact(draft);
}

export function parseTearPolicyActivation(value: unknown): TearPolicyActivationV1 {
  if (!record(value) || value.format !== "tear-policy-activation" || value.schemaVersion !== 1 || !integer(value.revision)
    || value.revision < 1 || !text(value.artifactId) || !hashes(value.artifactHash) || !timestamp(value.activatedAt)
    || (value.previousArtifactId !== undefined && !text(value.previousArtifactId)) || !hashes(value.activationHash)) throw new TypeError("invalid policy activation");
  const typed = value as unknown as Omit<TearPolicyActivationV1, "activationHash"> & { activationHash: string };
  const { activationHash: recorded, ...draft } = typed;
  if (recorded !== activationHash(draft)) throw new TypeError("policy activation integrity mismatch");
  return Object.freeze({ ...draft, activationHash: recorded });
}

function parseRetentionReceipt(value: unknown): TearPolicyRetentionReceiptV1 {
  if (!record(value) || value.format !== "tear-policy-retention-receipt" || value.schemaVersion !== 1 || !integer(value.revision)
    || value.revision < 1 || !timestamp(value.retainedAt) || !integer(value.maxUnactivated) || value.maxUnactivated < 0
    || !Array.isArray(value.removedArtifactIds) || !value.removedArtifactIds.every(text)
    || !Array.isArray(value.protectedArtifactIds) || !value.protectedArtifactIds.every(text) || !hashes(value.receiptHash)) {
    throw new TypeError("invalid policy retention receipt");
  }
  const { receiptHash: recorded, ...draft } = value as unknown as Omit<TearPolicyRetentionReceiptV1, "receiptHash"> & { receiptHash: string };
  if (recorded !== retentionHash(draft)) throw new TypeError("policy retention receipt integrity mismatch");
  return Object.freeze({ ...draft, removedArtifactIds: Object.freeze([...draft.removedArtifactIds]),
    protectedArtifactIds: Object.freeze([...draft.protectedArtifactIds]), receiptHash: recorded });
}

function compatible(artifact: TearPolicyArtifactV1, runtime: TearPolicyRuntimeCompatibility): boolean {
  return artifact.encoder.observationClass === runtime.observationClass
    && artifact.compatibility.observationClass === runtime.observationClass
    && runtime.modelFormats.includes(artifact.model.format) && artifact.compatibility.modelFormats.includes(artifact.model.format);
}

/** Durable local registry. It stores opaque model bytes only; executing them belongs to a later C32 runtime slice. */
export class TearPolicyArtifactRegistry {
  readonly #backend: GhostVaultBackend;
  readonly #runtime: TearPolicyRuntimeCompatibility;

  constructor(backend: GhostVaultBackend, runtime: TearPolicyRuntimeCompatibility) {
    if (!validCompatibility(runtime)) throw new TypeError("invalid policy runtime compatibility");
    this.#backend = backend; this.#runtime = freezeCompatibility(runtime);
  }

  async #quarantine(key: string, raw: string | undefined, reason: string): Promise<void> {
    await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "tear-policy-artifact-quarantine", schemaVersion: 1, key, raw: raw ?? null, reason, quarantinedAt: "unclocked" })));
  }

  async get(id: string): Promise<TearPolicyArtifactV1 | undefined> {
    if (!text(id)) throw new TypeError("policy artifact id is required");
    const key = artifactKey(id), raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try {
      const artifact = parseTearPolicyArtifact(JSON.parse(raw));
      if (artifact.id !== id) throw new TypeError("policy artifact key/id mismatch");
      if (!compatible(artifact, this.#runtime)) throw new RangeError("policy artifact is incompatible with this runtime");
      return artifact;
    } catch (error) {
      await this.#quarantine(key, raw, error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  async register(input: TearPolicyArtifactV1): Promise<TearPolicyArtifactV1> {
    const artifact = parseTearPolicyArtifact(input);
    if (!compatible(artifact, this.#runtime)) throw new RangeError("policy artifact is incompatible with this runtime");
    const key = artifactKey(artifact.id), existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) {
      const current = await this.get(artifact.id);
      if (current?.artifactHash === artifact.artifactHash) return current;
      throw new TypeError("policy artifact id is already occupied");
    }
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(artifact) },
      { store: "indexes", key: `policy-artifact:${artifact.id}`, value: JSON.stringify({ artifactHash: artifact.artifactHash, createdAt: artifact.createdAt }) },
    ]));
    return artifact;
  }

  async active(): Promise<TearPolicyActivationV1 | undefined> {
    const raw = await this.#backend.get("analysis", ACTIVE_KEY);
    if (raw === undefined) return undefined;
    try {
      const activation = parseTearPolicyActivation(JSON.parse(raw));
      const artifact = await this.get(activation.artifactId);
      if (artifact?.artifactHash !== activation.artifactHash) throw new TypeError("active policy artifact is unavailable");
      return activation;
    } catch (error) {
      await this.#quarantine(ACTIVE_KEY, raw, error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  async #nextRevision(): Promise<number> {
    return (await this.#backend.keys("indexes")).filter((key) => key.startsWith(ACTIVATION_KEY)).length + 1;
  }

  async #nextRetentionRevision(): Promise<number> {
    return (await this.#backend.keys("indexes")).filter((key) => key.startsWith(RETENTION_KEY)).length + 1;
  }

  async activate(id: string, activatedAt: string): Promise<TearPolicyActivationV1> {
    if (!timestamp(activatedAt)) throw new TypeError("policy activation timestamp is invalid");
    const artifact = await this.get(id);
    if (artifact === undefined) throw new RangeError("policy artifact is unavailable or incompatible");
    const previous = await this.active();
    const draft = { format: "tear-policy-activation" as const, schemaVersion: 1 as const, revision: await this.#nextRevision(), artifactId: artifact.id,
      artifactHash: artifact.artifactHash, activatedAt, ...(previous === undefined ? {} : { previousArtifactId: previous.artifactId }) };
    const activation = Object.freeze({ ...draft, activationHash: activationHash(draft) });
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key: ACTIVE_KEY, value: JSON.stringify(activation) },
      { store: "indexes", key: activationKey(activation.revision), value: JSON.stringify(activation) },
    ]));
    return activation;
  }

  async rollback(activatedAt: string): Promise<TearPolicyActivationV1 | undefined> {
    const current = await this.active();
    if (current?.previousArtifactId === undefined) return undefined;
    return this.activate(current.previousArtifactId, activatedAt);
  }

  async history(): Promise<readonly TearPolicyActivationV1[]> {
    const values = await Promise.all((await this.#backend.keys("indexes")).filter((key) => key.startsWith(ACTIVATION_KEY))
      .map(async (key) => ({ key, raw: await this.#backend.get("indexes", key) })));
    const entries: TearPolicyActivationV1[] = [];
    for (const { key, raw } of values) {
      try { if (raw !== undefined) entries.push(parseTearPolicyActivation(JSON.parse(raw))); }
      catch (error) { await this.#quarantine(key, raw, error instanceof Error ? error.message : String(error)); }
    }
    return Object.freeze(entries.sort((left, right) => left.revision - right.revision));
  }

  /**
   * Retains every active/rollback-referenced artifact and every lineage parent.
   * Only unactivated leaf artifacts are eligible, so retention cannot make a
   * recorded activation or rollback target unavailable.
   */
  async retainUnactivated(maxUnactivated: number, retainedAt: string): Promise<TearPolicyRetentionReceiptV1> {
    if (!integer(maxUnactivated) || maxUnactivated < 0 || !timestamp(retainedAt)) throw new TypeError("invalid policy retention request");
    const artifacts: TearPolicyArtifactV1[] = [];
    for (const key of (await this.#backend.keys("analysis")).filter((entry) => entry.startsWith(ARTIFACT_KEY))) {
      const id = key.slice(ARTIFACT_KEY.length), artifact = await this.get(id);
      if (artifact !== undefined) artifacts.push(artifact);
    }
    const protectedIds = new Set<string>((await this.history()).map((entry) => entry.artifactId));
    const active = await this.active();
    if (active !== undefined) protectedIds.add(active.artifactId);
    for (const key of (await this.#backend.keys("analysis")).filter((entry) => entry.startsWith(PRODUCTION_EVALUATION_KEY))) {
      const raw = await this.#backend.get("analysis", key);
      try {
        const report: unknown = raw === undefined ? undefined : JSON.parse(raw);
        if (!record(report) || report.format !== "tear-production-policy-evaluation" || !text(report.artifactId) || !hashes(report.artifactHash)) {
          throw new TypeError("invalid production policy evaluation reference");
        }
        protectedIds.add(report.artifactId);
      } catch (error) { await this.#quarantine(key, raw, error instanceof Error ? error.message : String(error)); }
    }
    for (const key of (await this.#backend.keys("analysis")).filter((entry) => entry.startsWith(PRODUCTION_OUTCOME_SUITE_KEY))) {
      const raw = await this.#backend.get("analysis", key);
      try {
        const report: unknown = raw === undefined ? undefined : JSON.parse(raw);
        if (!record(report) || report.format !== "tear-production-policy-outcome-suite" || !text(report.artifactId) || !hashes(report.artifactHash)) {
          throw new TypeError("invalid production policy outcome suite reference");
        }
        protectedIds.add(report.artifactId);
      } catch (error) { await this.#quarantine(key, raw, error instanceof Error ? error.message : String(error)); }
    }
    for (const artifact of artifacts) {
      if (artifact.lineage.parentArtifactId !== undefined) protectedIds.add(artifact.lineage.parentArtifactId);
    }
    const unactivatedLeaves = artifacts.filter((artifact) => !protectedIds.has(artifact.id))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const removedArtifactIds = unactivatedLeaves.slice(0, Math.max(0, unactivatedLeaves.length - maxUnactivated)).map((artifact) => artifact.id);
    const draft = { format: "tear-policy-retention-receipt" as const, schemaVersion: 1 as const,
      revision: await this.#nextRetentionRevision(), retainedAt, maxUnactivated,
      removedArtifactIds: Object.freeze(removedArtifactIds), protectedArtifactIds: Object.freeze([...protectedIds].sort()) };
    const receipt = Object.freeze({ ...draft, receiptHash: retentionHash(draft) });
    await this.#backend.commit(Object.freeze([
      ...removedArtifactIds.flatMap((id) => [
        { store: "analysis" as const, key: artifactKey(id) }, { store: "indexes" as const, key: `policy-artifact:${id}` },
      ]),
      { store: "analysis" as const, key: retentionKey(receipt.revision), value: JSON.stringify(receipt) },
      { store: "indexes" as const, key: retentionKey(receipt.revision), value: JSON.stringify(receipt) },
    ]));
    return receipt;
  }

  async retentionHistory(): Promise<readonly TearPolicyRetentionReceiptV1[]> {
    const entries: TearPolicyRetentionReceiptV1[] = [];
    for (const key of (await this.#backend.keys("indexes")).filter((entry) => entry.startsWith(RETENTION_KEY))) {
      const raw = await this.#backend.get("indexes", key);
      try { if (raw !== undefined) entries.push(parseRetentionReceipt(JSON.parse(raw))); }
      catch (error) { await this.#quarantine(key, raw, error instanceof Error ? error.message : String(error)); }
    }
    return Object.freeze(entries.sort((left, right) => left.revision - right.revision));
  }
}
