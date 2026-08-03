import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import { CANONICAL_ACADEMY_LESSONS, type TearDemonstrationSegmentKind } from "./academy";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCandidateCurationStore } from "./academy-candidate-curation";
import type { TearAcademyCandidateSplitStore, TearAcademyManifestReader } from "./academy-candidate-splits";
import type { TearAcademyReviewedSampleStore } from "./academy-reviewed-sample";

const ENTRY_KEY = "academy-corpus-entry:v1:";
const MANIFEST_KEY = "academy-corpus-manifest:v1:";

export interface TearAcademyCorpusEntryV1 {
  readonly format: "tear-academy-corpus-entry";
  readonly schemaVersion: 1;
  readonly candidateHash: string;
  readonly reviewedSampleHash: string;
  readonly custodyRecordHash: string;
  readonly curationDecisionHash: string;
  readonly splitAssignmentHash: string;
  readonly split: "training" | "validation" | "calibration" | "test" | "hidden-release-exam";
  readonly lessonId: string;
  readonly segmentKind: TearDemonstrationSegmentKind;
  readonly tags: readonly string[];
  readonly tracks: Readonly<{ observationSchema: "tear-canonical-gameplay-state.v1"; observationCount: number; actionSchema: "tear-game-action-command-envelope.v1"; actionCount: number; nativeEventCount: number; rootHash: string }>;
  readonly admittedAt: string;
  readonly actor: string;
  readonly entryHash: string;
}

export interface TearAcademyCorpusAdmissionRequest {
  readonly candidateHash: string;
  readonly lessonId: string;
  readonly segmentKind: TearDemonstrationSegmentKind;
  readonly tags: readonly string[];
  readonly admittedAt: string;
  readonly actor: string;
}

export interface TearAcademyCorpusManifestV1 {
  readonly format: "tear-academy-corpus-manifest";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly reader: TearAcademyManifestReader;
  readonly version: number;
  readonly createdAt: string;
  readonly previousManifestHash?: string;
  readonly entries: readonly TearAcademyCorpusEntryV1[];
  readonly rootHash: string;
  readonly manifestHash: string;
}

export interface TearAcademyCorpusManifestPublishRequest {
  readonly id: string;
  readonly reader: TearAcademyManifestReader;
  readonly version: number;
  readonly createdAt: string;
  readonly previousManifestHash?: string;
}

function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function timestamp(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function candidateKey(candidateHash: string): string { return `${ENTRY_KEY}${candidateHash}`; }
function manifestKey(id: string, reader: TearAcademyManifestReader, version: number): string { return `${MANIFEST_KEY}${reader.kind}:${reader.id}:${id}:${String(version)}`; }
function entryHash(value: Omit<TearAcademyCorpusEntryV1, "entryHash">): string { return stableVerificationHash(value); }
function manifestHash(value: Omit<TearAcademyCorpusManifestV1, "manifestHash">): string { return stableVerificationHash(value); }
function validTags(tags: readonly string[]): boolean { return tags.length <= 16 && tags.every((tag) => text(tag) && tag.length <= 96) && new Set(tags).size === tags.length; }
function lessonExists(lessonId: string): boolean { return CANONICAL_ACADEMY_LESSONS.some((lesson) => lesson.id === lessonId); }

function freezeEntry(value: Omit<TearAcademyCorpusEntryV1, "entryHash">): TearAcademyCorpusEntryV1 {
  return Object.freeze({ ...value, tags: Object.freeze([...value.tags]), tracks: Object.freeze({ ...value.tracks }), entryHash: entryHash(value) });
}

function parseEntry(value: string): TearAcademyCorpusEntryV1 {
  const raw: unknown = JSON.parse(value);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("invalid Academy corpus entry");
  const entry = raw as Record<string, unknown>;
  const tracks = entry.tracks;
  if (tracks === null || typeof tracks !== "object" || Array.isArray(tracks)) throw new TypeError("invalid Academy corpus entry");
  const track = tracks as Record<string, unknown>;
  if (entry.format !== "tear-academy-corpus-entry" || entry.schemaVersion !== 1 || !/^[a-f0-9]{16}$/u.test(String(entry.candidateHash))
    || !/^[a-f0-9]{16}$/u.test(String(entry.reviewedSampleHash)) || !/^[a-f0-9]{16}$/u.test(String(entry.custodyRecordHash))
    || !/^[a-f0-9]{16}$/u.test(String(entry.curationDecisionHash)) || !/^[a-f0-9]{16}$/u.test(String(entry.splitAssignmentHash))
    || !["training", "validation", "calibration", "test", "hidden-release-exam"].includes(String(entry.split))
    || !text(entry.lessonId) || !lessonExists(entry.lessonId) || !["demonstration", "recovery", "human-takeover", "policy-correction"].includes(String(entry.segmentKind))
    || !Array.isArray(entry.tags) || !validTags(entry.tags as string[])
    || track.observationSchema !== "tear-canonical-gameplay-state.v1" || !Number.isSafeInteger(track.observationCount)
    || track.actionSchema !== "tear-game-action-command-envelope.v1" || !Number.isSafeInteger(track.actionCount)
    || !Number.isSafeInteger(track.nativeEventCount) || !/^[a-f0-9]{16}$/u.test(String(track.rootHash))
    || !timestamp(entry.admittedAt) || !text(entry.actor) || !/^[a-f0-9]{16}$/u.test(String(entry.entryHash))) throw new TypeError("invalid Academy corpus entry");
  const typed = entry as unknown as Omit<TearAcademyCorpusEntryV1, "entryHash"> & { entryHash: string };
  const { entryHash: recorded, ...draft } = typed;
  if (recorded !== entryHash(draft)) throw new TypeError("Academy corpus entry integrity mismatch");
  return freezeEntry(draft);
}

function parseManifest(value: string): TearAcademyCorpusManifestV1 {
  const raw: unknown = JSON.parse(value);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("invalid Academy corpus manifest");
  const entry = raw as Record<string, unknown>; const reader = entry.reader as Record<string, unknown> | undefined;
  if (entry.format !== "tear-academy-corpus-manifest" || entry.schemaVersion !== 1 || !text(entry.id)
    || !["trainer", "examiner"].includes(String(reader?.kind)) || !text(reader?.id)
    || !Number.isSafeInteger(entry.version) || Number(entry.version) < 1 || !timestamp(entry.createdAt)
    || !Array.isArray(entry.entries) || !/^[a-f0-9]{16}$/u.test(String(entry.rootHash)) || !/^[a-f0-9]{16}$/u.test(String(entry.manifestHash))) throw new TypeError("invalid Academy corpus manifest");
  const typed = entry as unknown as Omit<TearAcademyCorpusManifestV1, "manifestHash"> & { manifestHash: string };
  const { manifestHash: recorded, ...draft } = typed;
  if (recorded !== manifestHash(draft)) throw new TypeError("Academy corpus manifest integrity mismatch");
  return Object.freeze({ ...typed, reader: Object.freeze({ ...typed.reader }), entries: Object.freeze(typed.entries.map((item) => parseEntry(JSON.stringify(item)))) });
}

/** Durable, governed corpus over C31 reviewed samples; it is the bridge from review to later trainer code. */
export class TearAcademyCorpusStore {
  readonly #backend: GhostVaultBackend;
  readonly #custody: TearAcademyCandidateCustodyStore;
  readonly #curation: TearAcademyCandidateCurationStore;
  readonly #splits: TearAcademyCandidateSplitStore;
  readonly #samples: TearAcademyReviewedSampleStore;

  constructor(backend: GhostVaultBackend, custody: TearAcademyCandidateCustodyStore, curation: TearAcademyCandidateCurationStore, splits: TearAcademyCandidateSplitStore, samples: TearAcademyReviewedSampleStore) {
    if (backend !== custody.backend() || backend !== curation.backend()) throw new TypeError("C31 corpus stores must share one Vault backend");
    this.#backend = backend; this.#custody = custody; this.#curation = curation; this.#splits = splits; this.#samples = samples;
  }

  async admit(input: TearAcademyCorpusAdmissionRequest): Promise<TearAcademyCorpusEntryV1> {
    if (!/^[a-f0-9]{16}$/u.test(input.candidateHash) || !lessonExists(input.lessonId) || !["demonstration", "recovery", "human-takeover", "policy-correction"].includes(input.segmentKind) || !validTags(input.tags) || !timestamp(input.admittedAt) || !text(input.actor)) throw new TypeError("invalid Academy corpus admission");
    const [custody, curation, split, sample] = await Promise.all([this.#custody.get(input.candidateHash), this.#curation.get(input.candidateHash), this.#splits.get(input.candidateHash), this.#samples.get(input.candidateHash)]);
    if (custody?.status !== "held" || !custody.privacyRetention.authorizedActorIds.includes(input.actor) || curation?.disposition !== "curation-approved" || split === undefined || sample === undefined) throw new RangeError("Academy corpus admission requires active reviewed governed custody");
    if (sample.custodyRecordHash !== custody.recordHash || sample.curationDecisionHash !== curation.decisionHash || sample.splitAssignmentHash !== split.assignmentHash || !(await this.#curation.active(input.admittedAt)).some((entry) => entry.candidateHash === input.candidateHash)) throw new RangeError("Academy corpus admission requires active reviewed governed custody");
    if (await this.#backend.get("analysis", candidateKey(input.candidateHash)) !== undefined) throw new TypeError("Academy corpus entry already exists");
    const tracks = sample.tracks;
    if (tracks === undefined) throw new RangeError("Academy reviewed sample lacks verified tracks");
    const draft = { format: "tear-academy-corpus-entry" as const, schemaVersion: 1 as const, candidateHash: input.candidateHash,
      reviewedSampleHash: sample.sampleHash, custodyRecordHash: custody.recordHash, curationDecisionHash: curation.decisionHash, splitAssignmentHash: split.assignmentHash, split: sample.split,
      lessonId: input.lessonId, segmentKind: input.segmentKind, tags: Object.freeze([...input.tags]),
      tracks: Object.freeze({ observationSchema: "tear-canonical-gameplay-state.v1" as const, observationCount: tracks.observations.length, actionSchema: "tear-game-action-command-envelope.v1" as const, actionCount: tracks.actions.length, nativeEventCount: tracks.nativeEvents.length, rootHash: stableVerificationHash({ observations: tracks.observations, actions: tracks.actions, nativeEvents: tracks.nativeEvents, rewardComponents: tracks.rewardComponents, intents: tracks.intents }) }),
      admittedAt: input.admittedAt, actor: input.actor };
    const entry = freezeEntry(draft);
    await this.#backend.commit([Object.freeze({ store: "analysis", key: candidateKey(entry.candidateHash), value: JSON.stringify(entry) })]);
    return entry;
  }

  async get(candidateHash: string): Promise<TearAcademyCorpusEntryV1 | undefined> { const value = await this.#backend.get("analysis", candidateKey(candidateHash)); return value === undefined ? undefined : parseEntry(value); }
  async inventory(): Promise<readonly TearAcademyCorpusEntryV1[]> { const entries: TearAcademyCorpusEntryV1[] = []; for (const name of await this.#backend.keys("analysis")) { if (!name.startsWith(ENTRY_KEY)) continue; const value = await this.#backend.get("analysis", name); if (value !== undefined) entries.push(parseEntry(value)); } return Object.freeze(entries.sort((left, right) => left.candidateHash.localeCompare(right.candidateHash))); }
  async manifest(input: TearAcademyCorpusManifestPublishRequest): Promise<TearAcademyCorpusManifestV1> {
    if (!text(input.id) || !["trainer", "examiner"].includes(input.reader.kind) || !text(input.reader.id) || !Number.isSafeInteger(input.version) || input.version < 1 || !timestamp(input.createdAt)) throw new TypeError("invalid Academy corpus manifest request");
    const active = new Set((await this.#curation.active(input.createdAt)).map((entry) => entry.candidateHash));
    const entries = Object.freeze((await this.inventory()).filter((entry) => active.has(entry.candidateHash) && (input.reader.kind === "examiner" || entry.split !== "hidden-release-exam")));
    const draft = { format: "tear-academy-corpus-manifest" as const, schemaVersion: 1 as const, id: input.id, reader: Object.freeze({ ...input.reader }), version: input.version, createdAt: input.createdAt, ...(input.previousManifestHash === undefined ? {} : { previousManifestHash: input.previousManifestHash }), entries, rootHash: stableVerificationHash(entries.map((entry) => entry.entryHash)) };
    return Object.freeze({ ...draft, manifestHash: manifestHash(draft) });
  }
  async publishManifest(input: TearAcademyCorpusManifestPublishRequest): Promise<TearAcademyCorpusManifestV1> { const manifest = await this.manifest(input); const key = manifestKey(manifest.id, manifest.reader, manifest.version); if (await this.#backend.get("analysis", key) !== undefined) throw new TypeError("Academy corpus manifest version already exists"); if (manifest.version > 1 && (!text(input.previousManifestHash) || (await this.getManifest(manifest.id, manifest.reader, manifest.version - 1))?.manifestHash !== input.previousManifestHash)) throw new RangeError("Academy corpus manifest revision requires its exact predecessor"); await this.#backend.commit([Object.freeze({ store: "analysis", key, value: JSON.stringify(manifest) })]); return manifest; }
  async getManifest(id: string, reader: TearAcademyManifestReader, version: number): Promise<TearAcademyCorpusManifestV1 | undefined> { const value = await this.#backend.get("analysis", manifestKey(id, reader, version)); if (value === undefined) return undefined; const manifest = parseManifest(value); if (manifest.id !== id || manifest.reader.kind !== reader.kind || manifest.reader.id !== reader.id || manifest.version !== version) throw new TypeError("Academy corpus manifest integrity mismatch"); return manifest; }
}
