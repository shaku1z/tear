import { asRecord } from "../domain/records";
import type { TearGhostManifest } from "./capsule-vault";
import type { GhostDoctorReport } from "./ghost-doctor";
import type { GhostVaultBackend, GhostVaultGuard, GhostVaultWrite } from "./capsule-vault";

/**
 * The record the Vault keeps of a capsule whose stored chunks failed their integrity check.
 * Maintenance writes one per unhealthy capsule, and a repair commits against it, so a repaired
 * child always has a record of the damaged source it came from.
 *
 * The stored envelope, key and `library: "graveyard"` value are the ones existing vaults already
 * hold. Do not rename them: a vault written before this module was renamed must still read.
 */
const RECORD_FORMAT = "tearghost-library-entry";
const RECORD_SCHEMA_VERSION = 1;
const RECORD_LIBRARY = "graveyard";

export interface GhostCorruptCapsuleRecord {
  readonly id: string;
  readonly library: typeof RECORD_LIBRARY;
  readonly ghostId: string;
  readonly rootHash: string;
  readonly createdAt: string;
  readonly provenance: Readonly<Record<string, string>>;
}

type StoredRecord = Readonly<{
  format: typeof RECORD_FORMAT;
  schemaVersion: typeof RECORD_SCHEMA_VERSION;
  entry: GhostCorruptCapsuleRecord;
}>;

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function parseStoredRecord(value: string): GhostCorruptCapsuleRecord {
  const envelope = asRecord(JSON.parse(value) as unknown);
  if (envelope?.format !== RECORD_FORMAT || envelope.schemaVersion !== RECORD_SCHEMA_VERSION)
    throw new TypeError("unsupported corrupt-capsule record");
  const entry = asRecord(envelope.entry),
    provenance = asRecord(entry?.provenance);
  if (
    entry === undefined ||
    provenance === undefined ||
    entry.library !== RECORD_LIBRARY ||
    !text(entry.id) ||
    !text(entry.ghostId) ||
    !text(entry.rootHash) ||
    !text(entry.createdAt)
  )
    throw new TypeError("invalid corrupt-capsule record");
  const fields = Object.entries(provenance).filter((field): field is [string, string] => typeof field[1] === "string");
  if (fields.length !== Object.keys(provenance).length) throw new TypeError("invalid corrupt-capsule record");
  return Object.freeze({
    id: entry.id,
    library: RECORD_LIBRARY,
    ghostId: entry.ghostId,
    rootHash: entry.rootHash,
    createdAt: entry.createdAt,
    provenance: Object.freeze(Object.fromEntries(fields)),
  });
}

const recordId = (capsuleId: string): string => `${RECORD_LIBRARY}:${capsuleId}`;

/** The `libraries` store key of a capsule's record. */
export const corruptCapsuleRecordKey = (capsuleId: string): string => `entry:${RECORD_LIBRARY}:${recordId(capsuleId)}`;

export class GhostCorruptCapsuleRecords {
  readonly #backend: GhostVaultBackend;

  constructor(backend: GhostVaultBackend) {
    this.#backend = backend;
  }

  /** Writes the record for an unhealthy capsule, or confirms the one already stored. */
  async record(
    manifest: TearGhostManifest,
    report: GhostDoctorReport,
    discoveredAt: string,
  ): Promise<GhostCorruptCapsuleRecord> {
    const prepared = await this.prepare(manifest, report, discoveredAt);
    await this.#backend.commitIfMatches([prepared.guard], prepared.write === undefined ? [] : [prepared.write]);
    return prepared.entry;
  }

  /**
   * Validates and prepares one record without writing. A caller may join the returned guard,
   * and the write when the record is new, to its own commit. A stored record that is malformed
   * or names a different capsule or root is refused, never rewritten.
   */
  async prepare(
    manifest: TearGhostManifest,
    report: GhostDoctorReport,
    discoveredAt: string,
  ): Promise<Readonly<{ entry: GhostCorruptCapsuleRecord; guard: GhostVaultGuard; write?: GhostVaultWrite }>> {
    if (report.healthy) throw new TypeError("only an unhealthy capsule gets a corrupt-capsule record");
    const entry: GhostCorruptCapsuleRecord = Object.freeze({
      id: recordId(manifest.id),
      library: RECORD_LIBRARY,
      ghostId: manifest.id,
      rootHash: manifest.rootIntegrity,
      createdAt: discoveredAt,
      provenance: Object.freeze({
        source: "ghost-doctor",
        corruptChunks: String(report.corruptChunkIds.length),
        missingChunks: String(report.missingChunkIds.length),
      }),
    });
    const key = corruptCapsuleRecordKey(manifest.id),
      existing = await this.#backend.get("libraries", key);
    if (existing === undefined)
      return Object.freeze({
        entry,
        guard: Object.freeze({ store: "libraries", key }),
        write: Object.freeze({
          store: "libraries",
          key,
          value: JSON.stringify({
            format: RECORD_FORMAT,
            schemaVersion: RECORD_SCHEMA_VERSION,
            entry,
          } satisfies StoredRecord),
        }),
      });
    const parsed = parseStoredRecord(existing);
    if (parsed.ghostId !== entry.ghostId || parsed.rootHash !== entry.rootHash || parsed.id !== entry.id)
      throw new TypeError(`corrupt-capsule record conflicts with the capsule it names: ${entry.id}`);
    return Object.freeze({ entry: parsed, guard: Object.freeze({ store: "libraries", key, expected: existing }) });
  }
}
