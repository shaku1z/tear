import type { TearGhostManifest } from "./capsule-vault";
import type { GhostDoctorReport } from "./ghost-doctor";
import {
  GhostCorpus,
  GovernedGhostLibrary,
  promoteReviewedGhostToCanon,
  triageRareGhostToFrontier,
  type GhostCorpusEntry,
  type GhostLibraryEntry,
  type GhostLibraryKind,
} from "./knowledge-libraries";
import type { GhostEnvelopeV3 } from "./truth-kernel";
import type { GhostVaultBackend } from "./capsule-vault";

const GHOST_LIBRARY_ENTRY_FORMAT = "tearghost-library-entry";
const GHOST_LIBRARY_ENTRY_SCHEMA_VERSION = 1;
const libraryKinds = ["canon", "graveyard", "frontier", "corpus"] as const;

export interface GhostVaultKnowledgeLibraryInventory {
  readonly schemaVersion: 1;
  readonly entries: readonly (GhostLibraryEntry | GhostCorpusEntry)[];
  /** Stored bytes that were rejected rather than trusted or rewritten. */
  readonly rejectedEntryKeys: readonly string[];
}

type StoredGhostLibraryEntry = Readonly<{
  format: typeof GHOST_LIBRARY_ENTRY_FORMAT;
  schemaVersion: typeof GHOST_LIBRARY_ENTRY_SCHEMA_VERSION;
  entry: GhostLibraryEntry | GhostCorpusEntry;
}>;

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>> : undefined;
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  const candidate = record(value);
  if (candidate === undefined || !Object.values(candidate).every((entry) => typeof entry === "string")) return undefined;
  return Object.freeze(Object.fromEntries(Object.entries(candidate).map(([key, entry]) => [key, entry as string])));
}

function libraryKind(value: unknown): GhostLibraryKind | undefined {
  return libraryKinds.includes(value as GhostLibraryKind) ? value as GhostLibraryKind : undefined;
}

function baseEntry(value: unknown): GhostLibraryEntry | undefined {
  const candidate = record(value);
  const library = candidate === undefined ? undefined : libraryKind(candidate.library);
  const provenance = candidate === undefined ? undefined : stringRecord(candidate.provenance);
  if (candidate === undefined || library === undefined || provenance === undefined
    || typeof candidate.id !== "string" || candidate.id.length === 0
    || typeof candidate.ghostId !== "string" || candidate.ghostId.length === 0
    || typeof candidate.rootHash !== "string" || candidate.rootHash.length === 0
    || typeof candidate.createdAt !== "string" || candidate.createdAt.length === 0) return undefined;
  return Object.freeze({ id: candidate.id, library, ghostId: candidate.ghostId,
    rootHash: candidate.rootHash, createdAt: candidate.createdAt, provenance });
}

function corpusEntry(value: GhostLibraryEntry, source: unknown): GhostCorpusEntry | undefined {
  const candidate = record(source);
  if (value.library !== "corpus" || candidate === undefined
    || !["private-personalization-only", "anonymous-improvement", "public-training"].includes(String(candidate.consent))
    || !["train", "validation", "test", "hidden-holdout"].includes(String(candidate.split))
    || typeof candidate.deduplicationHash !== "string" || candidate.deduplicationHash.length === 0) return undefined;
  return Object.freeze({ ...value, library: "corpus" as const,
    consent: candidate.consent as GhostCorpusEntry["consent"],
    split: candidate.split as GhostCorpusEntry["split"], deduplicationHash: candidate.deduplicationHash });
}

function parseStoredEntry(value: string): GhostLibraryEntry | GhostCorpusEntry {
  const envelope = record(JSON.parse(value) as unknown);
  if (envelope?.format !== GHOST_LIBRARY_ENTRY_FORMAT) {
    throw new TypeError("unsupported Ghost library record");
  }
  if (envelope.schemaVersion !== GHOST_LIBRARY_ENTRY_SCHEMA_VERSION) {
    throw new TypeError("unsupported Ghost library record");
  }
  const entry = baseEntry(envelope.entry);
  if (entry === undefined) throw new TypeError("invalid Ghost library record");
  if (entry.library !== "corpus") return entry;
  const corpus = corpusEntry(entry, envelope.entry);
  if (corpus === undefined) throw new TypeError("invalid Ghost Corpus record");
  return corpus;
}

function entryKey(entry: Pick<GhostLibraryEntry, "library" | "id">): string {
  return `entry:${entry.library}:${entry.id}`;
}

function isCorpusEntry(entry: GhostLibraryEntry | GhostCorpusEntry): entry is GhostCorpusEntry {
  return entry.library === "corpus" && "split" in entry;
}

function freezeInventory(
  entries: readonly (GhostLibraryEntry | GhostCorpusEntry)[],
  rejectedEntryKeys: readonly string[],
): GhostVaultKnowledgeLibraryInventory {
  return Object.freeze({ schemaVersion: 1 as const,
    entries: Object.freeze([...entries].sort((left, right) => left.id.localeCompare(right.id))),
    rejectedEntryKeys: Object.freeze([...rejectedEntryKeys].sort()) });
}

/**
 * Durable governance for Ghost knowledge. It keeps stored records untrusted
 * until their typed envelope validates, and never rewrites rejected bytes.
 */
export class GhostVaultKnowledgeLibraries {
  readonly #backend: GhostVaultBackend;

  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  async inventory(): Promise<GhostVaultKnowledgeLibraryInventory> {
    const entries: (GhostLibraryEntry | GhostCorpusEntry)[] = [];
    const rejectedEntryKeys: string[] = [];
    for (const key of await this.#backend.keys("libraries")) {
      const value = await this.#backend.get("libraries", key);
      if (value === undefined) continue;
      try { entries.push(parseStoredEntry(value)); }
      catch { rejectedEntryKeys.push(key); }
    }
    return freezeInventory(entries, rejectedEntryKeys);
  }

  async list(kind: GhostLibraryKind, includeHiddenHoldout = false): Promise<readonly GhostLibraryEntry[]> {
    const inventory = await this.inventory();
    return Object.freeze(inventory.entries.filter((entry) => entry.library === kind
      && (includeHiddenHoldout || !isCorpusEntry(entry) || entry.split !== "hidden-holdout")));
  }

  async recordCorruptCapsule(
    manifest: TearGhostManifest,
    report: GhostDoctorReport,
    discoveredAt: string,
  ): Promise<GhostLibraryEntry> {
    if (report.healthy) throw new TypeError("only an unhealthy capsule belongs in the Ghost Graveyard");
    const entry: GhostLibraryEntry = Object.freeze({
      id: `graveyard:${manifest.id}`, library: "graveyard", ghostId: manifest.id,
      rootHash: manifest.rootIntegrity, createdAt: discoveredAt,
      provenance: Object.freeze({ source: "ghost-doctor", corruptChunks: String(report.corruptChunkIds.length),
        missingChunks: String(report.missingChunkIds.length) }),
    });
    return this.#ensure(entry);
  }

  async promoteToCanon(
    ghost: GhostEnvelopeV3,
    review: Readonly<{ approved: boolean; reviewer: string; at: string }>,
  ): Promise<GhostLibraryEntry> {
    const canon = new GovernedGhostLibrary("canon");
    return this.#insert(promoteReviewedGhostToCanon(canon, ghost, review));
  }

  async triageToFrontier(ghost: GhostEnvelopeV3, noveltyScore: number, at: string): Promise<GhostLibraryEntry | undefined> {
    const frontier = new GovernedGhostLibrary("frontier");
    const entry = triageRareGhostToFrontier(frontier, ghost, noveltyScore, at);
    return entry === undefined ? undefined : this.#insert(entry);
  }

  async ingestCorpus(input: Readonly<{
    ghost: GhostEnvelopeV3;
    consent: GhostCorpusEntry["consent"];
    split: GhostCorpusEntry["split"];
    createdAt: string;
    producer: string;
  }>): Promise<GhostCorpusEntry> {
    const draft = new GhostCorpus().ingest(input);
    const existing = await this.list("corpus", true) as readonly GhostCorpusEntry[];
    if (existing.some((entry) => entry.deduplicationHash === draft.deduplicationHash)) {
      throw new TypeError("Corpus duplicate is already assigned");
    }
    return this.#insert(draft) as Promise<GhostCorpusEntry>;
  }

  async #insert(entry: GhostLibraryEntry | GhostCorpusEntry): Promise<GhostLibraryEntry | GhostCorpusEntry> {
    const key = entryKey(entry);
    if (await this.#backend.get("libraries", key) !== undefined) throw new TypeError(`Ghost library entry already exists: ${entry.id}`);
    await this.#backend.put("libraries", key, JSON.stringify({
      format: GHOST_LIBRARY_ENTRY_FORMAT, schemaVersion: GHOST_LIBRARY_ENTRY_SCHEMA_VERSION, entry,
    } satisfies StoredGhostLibraryEntry));
    return Object.freeze(structuredClone(entry));
  }

  async #ensure(entry: GhostLibraryEntry): Promise<GhostLibraryEntry> {
    const key = entryKey(entry);
    const existing = await this.#backend.get("libraries", key);
    if (existing === undefined) return this.#insert(entry);
    const parsed = parseStoredEntry(existing);
    if (parsed.library !== entry.library || parsed.ghostId !== entry.ghostId || parsed.rootHash !== entry.rootHash) {
      throw new TypeError(`Ghost library entry conflicts with custody record: ${entry.id}`);
    }
    return parsed;
  }
}
