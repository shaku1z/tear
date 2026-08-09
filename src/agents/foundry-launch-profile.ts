import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCorpusStore, TearAcademyCorpusManifestV1 } from "./academy-corpus";
import { TearC34V3C32CandidateRegistry } from "./c34-v3-c32-policy-adapter";
import type { TearFoundryBootstrapRequestV1 } from "./foundry-job-bootstrap";
import { createTearFoundryExecutionBindingV3, type TearFoundryExecutionSuccessorDeclarationV3 } from "./foundry-job-execution-binding";
import { createTearFoundryJobV2, type TearFoundryEvaluationProtocolInputV1, type TearFoundryFrozenInputsV1 } from "./foundry-job-state";
import { parseTearPolicyActivation } from "./policy-artifact-registry";

const KEY = "foundry-launch-profile:v1:";
const HASH = /^[a-f0-9]{16}$/u;
type ManifestIdentity = Readonly<{ id: string; trainerId: string; version: number; manifestHash: string; rootHash: string }>;
type Schedule = Readonly<{ id: string; intervalMs: number; computeBudgetHash: string; storageBudgetHash: string }>;

/** Product-owned immutable authority for constructing a C36 bootstrap request. */
export interface TearFoundryLaunchProfileV1 {
  readonly format: "tear-foundry-launch-profile"; readonly schemaVersion: 1;
  readonly id: string; readonly jobId: string; readonly reason: string; readonly declaredAt: string;
  readonly manifest: ManifestIdentity; readonly schedule: Schedule;
  readonly inputs: Omit<TearFoundryFrozenInputsV1, "champion" | "corpusRecordHashes"> & Readonly<{ evaluationProtocol: TearFoundryEvaluationProtocolInputV1 }>;
  readonly successorDeclaration: TearFoundryExecutionSuccessorDeclarationV3; readonly profileHash: string;
}
export interface TearFoundryLaunchProfileProjectionV1 { readonly profileId: string; readonly disposition: "eligible" | "blocked"; }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function time(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function freeze(input: Omit<TearFoundryLaunchProfileV1, "format" | "schemaVersion" | "profileHash">): TearFoundryLaunchProfileV1 {
  if (!text(input.id) || !text(input.jobId) || !text(input.reason) || !time(input.declaredAt) || !text(input.manifest.id) || !text(input.manifest.trainerId)
    || !Number.isSafeInteger(input.manifest.version) || input.manifest.version < 1 || ![input.manifest.manifestHash, input.manifest.rootHash, input.schedule.computeBudgetHash, input.schedule.storageBudgetHash].every(hash)
    || !text(input.schedule.id) || !Number.isSafeInteger(input.schedule.intervalMs) || input.schedule.intervalMs < 60_000 || input.schedule.intervalMs > 2_592_000_000) throw new TypeError("invalid Foundry launch profile");
  // The existing job/binding constructors are the authoritative schema validators.
  const probe = createTearFoundryJobV2({ id: input.jobId, createdAt: input.declaredAt, reason: input.reason, inputs: { champion: { id: "profile-probe", artifactHash: "0".repeat(16) }, corpusRecordHashes: ["1".repeat(16)], ...input.inputs } });
  createTearFoundryExecutionBindingV3({ schedule: { id: input.schedule.id, revision: 2, scheduleHash: "2".repeat(16) }, job: { id: probe.id, jobHash: probe.jobHash, phase: "created" }, payload: { kind: "none" }, successorDeclaration: input.successorDeclaration });
  const { champion: _champion, corpusRecordHashes: _records, ...validatedInputs } = probe.inputs;
  const draft = Object.freeze({ format: "tear-foundry-launch-profile" as const, schemaVersion: 1 as const, id: input.id, jobId: input.jobId, reason: input.reason, declaredAt: input.declaredAt,
    manifest: Object.freeze({ ...input.manifest }), schedule: Object.freeze({ ...input.schedule }), inputs: Object.freeze(validatedInputs) as TearFoundryLaunchProfileV1["inputs"], successorDeclaration: structuredClone(input.successorDeclaration) });
  return Object.freeze({ ...draft, profileHash: stableVerificationHash(draft) });
}
export function createTearFoundryLaunchProfile(input: Omit<TearFoundryLaunchProfileV1, "format" | "schemaVersion" | "profileHash">): TearFoundryLaunchProfileV1 { return freeze(input); }
export function parseTearFoundryLaunchProfile(value: unknown): TearFoundryLaunchProfileV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid Foundry launch profile");
  const typed = value as TearFoundryLaunchProfileV1; if (typed.format !== "tear-foundry-launch-profile" || typed.schemaVersion !== 1 || !hash(typed.profileHash)) throw new TypeError("invalid Foundry launch profile");
  const { format: _format, schemaVersion: _schema, profileHash, ...draft } = typed, parsed = freeze(draft);
  if (profileHash !== parsed.profileHash) throw new TypeError("Foundry launch profile integrity mismatch"); return parsed;
}
function exactManifest(manifest: TearAcademyCorpusManifestV1 | undefined, profile: TearFoundryLaunchProfileV1, held: readonly { recordHash: string }[]): readonly string[] | undefined {
  if (manifest?.id !== profile.manifest.id || manifest.reader.kind !== "trainer" || manifest.reader.id !== profile.manifest.trainerId || manifest.version !== profile.manifest.version || manifest.manifestHash !== profile.manifest.manifestHash || manifest.rootHash !== profile.manifest.rootHash || manifest.entries.length < 1 || manifest.entries.some((entry) => entry.split === "hidden-release-exam")) return undefined;
  const records = manifest.entries.map((entry) => entry.custodyRecordHash);
  return new Set(records).size === records.length && records.every((record) => held.some((entry) => entry.recordHash === record)) ? Object.freeze([...records].sort()) : undefined;
}

/** Reads only immutable authority and returns a bootstrap request only when every prerequisite is current. */
export class TearFoundryLaunchProfileAuthority {
  readonly #backend: GhostVaultBackend; readonly #custody: TearAcademyCandidateCustodyStore; readonly #corpus: TearAcademyCorpusStore;
  constructor(backend: GhostVaultBackend, custody: TearAcademyCandidateCustodyStore, corpus: TearAcademyCorpusStore) { if (backend !== custody.backend() || backend !== corpus.backend()) throw new TypeError("Foundry launch profile must share the C31 Vault boundary"); this.#backend = backend; this.#custody = custody; this.#corpus = corpus; }
  async persist(input: TearFoundryLaunchProfileV1): Promise<TearFoundryLaunchProfileV1> { const profile = parseTearFoundryLaunchProfile(input), key = `${KEY}${profile.id}`, raw = await this.#backend.get("analysis", key); if (raw !== undefined) { const current = parseTearFoundryLaunchProfile(JSON.parse(raw)); if (current.profileHash !== profile.profileHash) throw new RangeError("Foundry launch profile ID already exists"); return current; } await this.#backend.commit(Object.freeze([{ store: "analysis", key, value: JSON.stringify(profile) }])); return profile; }
  async get(id: string): Promise<TearFoundryLaunchProfileV1 | undefined> { const key = `${KEY}${id}`, raw = await this.#backend.get("analysis", key); if (raw === undefined) return undefined; try { const profile = parseTearFoundryLaunchProfile(JSON.parse(raw)); if (profile.id !== id) throw new TypeError("Foundry launch profile key mismatch"); return profile; } catch (error) { await this.#backend.put("quarantine", key, JSON.stringify({ format: "foundry-launch-profile-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) })); return undefined; } }
  /** Deliberately opaque UI-safe summaries; configuration, hashes, and custody never leave this boundary. */
  async projections(at: string): Promise<readonly TearFoundryLaunchProfileProjectionV1[]> {
    const ids = (await this.#backend.keys("analysis")).filter((key) => key.startsWith(KEY)).map((key) => key.slice(KEY.length)).filter(text).sort();
    return Object.freeze(await Promise.all(ids.map((id) => this.projection(id, at))));
  }
  async projection(id: string, at: string): Promise<TearFoundryLaunchProfileProjectionV1> { return Object.freeze({ profileId: id, disposition: await this.#request(id, at) === undefined ? "blocked" : "eligible" }); }
  async buildBootstrapRequest(id: string, at: string): Promise<TearFoundryBootstrapRequestV1> { const request = await this.#request(id, at); if (request === undefined) throw new RangeError("Foundry launch profile is blocked"); return request; }
  async #request(id: string, at: string): Promise<TearFoundryBootstrapRequestV1 | undefined> {
    if (!text(id) || !time(at)) return undefined; const profile = await this.get(id); if (profile === undefined) return undefined;
    const [activeRaw, manifest, held] = await Promise.all([this.#backend.get("analysis", "policy-active:v1"), this.#corpus.getManifest(profile.manifest.id, { kind: "trainer", id: profile.manifest.trainerId }, profile.manifest.version), this.#custody.held(at)]);
    try {
      if (activeRaw === undefined) return undefined; const active = parseTearPolicyActivation(JSON.parse(activeRaw));
      const champion = await new TearC34V3C32CandidateRegistry(this.#backend).get(active.artifactId);
      const records = exactManifest(manifest, profile, held); if (champion === undefined || champion.artifactHash !== active.artifactHash || records === undefined) return undefined;
      const job = createTearFoundryJobV2({ id: profile.jobId, createdAt: at, reason: profile.reason, inputs: { ...profile.inputs, champion: { id: champion.id, artifactHash: champion.artifactHash }, corpusRecordHashes: records } });
      return Object.freeze({ job, manifest: profile.manifest, schedule: { ...profile.schedule, stopConditionsHash: profile.inputs.stopConditionsHash, configuredAt: at }, successorDeclaration: structuredClone(profile.successorDeclaration), bootstrappedAt: at });
    } catch { return undefined; }
  }
}
