import { stableVerificationHash } from "../replay/hash";
import { GhostCapsuleReader } from "./capsule-reader";
import { GhostLocalVault, GhostStreamingRecorder, createMemoryGhostVaultBackend, ghostRootIntegrity, migrateGhostCapsuleManifestV1, parseGhostCapsuleManifest } from "./capsule-vault";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { assessGhostReplayAdmission } from "./replay-admission";

export type GhostPreservationOutcome = "exact" | "migrated" | "visual-only" | "unsupported" | "rejected";
export interface GhostPreservationCorpusSourceDescriptor { readonly hash: string; readonly bytes: number; }
export interface GhostPreservationCorpusFixtureV1 { readonly format: "tear-preservation-corpus"; readonly schemaVersion: 1; readonly cases: readonly Readonly<{ readonly id: string; readonly expected: GhostPreservationOutcome; readonly source: GhostPreservationCorpusSourceDescriptor }>[]; }
export interface GhostPreservationCorpusResult { readonly id: string; readonly outcome: GhostPreservationOutcome; readonly sourceHash: string; readonly sourceBytes: number; readonly detail: string; readonly reader?: Readonly<{ rootIntegrity: string; bytes: number; admission: "rejected" | "unavailable" | "compatible"; mappedCommands: number }>; }
export interface GhostPreservationCorpusReport { readonly format: "tear-preservation-corpus-report"; readonly schemaVersion: 1; readonly results: readonly GhostPreservationCorpusResult[]; }
function bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function descriptor(source: string): GhostPreservationCorpusSourceDescriptor { return Object.freeze({ hash: stableVerificationHash(source), bytes: bytes(source) }); }
function readable(id: string, outcome: "exact" | "migrated" | "visual-only", source: string, capsule: Awaited<ReturnType<GhostCapsuleReader["read"]>>, detail: string): GhostPreservationCorpusResult { const mapped = mapGhostCapsuleToReplayEnvelope(capsule); const admission = assessGhostReplayAdmission(capsule); return Object.freeze({ id, outcome, sourceHash: stableVerificationHash(source), sourceBytes: bytes(source), detail, reader: Object.freeze({ rootIntegrity: capsule.manifest.rootIntegrity, bytes: capsule.manifest.chunks.reduce((total, chunk) => total + chunk.compressedBytes, 0), admission: admission.status, mappedCommands: mapped.accepted.commands }) }); }
async function v2(id: string): Promise<string> { const vault = new GhostLocalVault(createMemoryGhostVaultBackend()); const recorder = new GhostStreamingRecorder({ sessionId: id, createdAt: "2026-08-09T00:00:00.000Z", chunkEntries: 1, maxPendingWrites: 1, vault }); await recorder.start(); await recorder.append({ kind: "commands", tick: 1, value: { kind: "command", id: 1, tick: 1, command: { type: "jump", phase: "pressed" } } }); await recorder.append({ kind: "presentation", tick: 1, value: { frame: "preserved-local-sample" } }); await recorder.finalize("2026-08-09T00:00:01.000Z"); return vault.exportCapsule(id); }
async function v1(id: string, visual: boolean): Promise<string> { const vault = new GhostLocalVault(createMemoryGhostVaultBackend()); const manifest = parseGhostCapsuleManifest({ format: "tearghost-capsule", schemaVersion: 1, id, status: "complete", createdAt: "2026-08-09T00:00:00.000Z", recordingProfile: "legacy-unknown", chunks: [], rootIntegrity: ghostRootIntegrity([]), fidelity: { presentation: visual ? "reduced" : "full", downgrades: visual ? ["legacy visual evidence has no semantic action stream"] : [] } }); await vault.putManifest(manifest); return vault.exportCapsule(id); }
async function reopen(source: string): Promise<{ readonly vault: GhostLocalVault; readonly id: string }> { const vault = new GhostLocalVault(createMemoryGhostVaultBackend()); const manifest = await vault.importCapsule(source); return Object.freeze({ vault, id: manifest.id }); }

interface MaterializedSource { readonly id: string; readonly expected: GhostPreservationOutcome; readonly source: string; }
function verifyDescriptors(fixture: GhostPreservationCorpusFixtureV1, sources: readonly MaterializedSource[]): void {
  const expected = new Map(fixture.cases.map((entry) => [entry.id, entry]));
  if (expected.size !== fixture.cases.length) throw new TypeError("preservation corpus fixture IDs must be unique");
  if (expected.size !== sources.length) throw new TypeError("preservation corpus fixture must describe every local source");
  for (const source of sources) {
    const entry = expected.get(source.id);
    if (entry?.expected !== source.expected) throw new TypeError(`preservation corpus ${source.id} has an unexpected expected outcome`);
    const actual = descriptor(source.source);
    if (entry.source.hash !== actual.hash || entry.source.bytes !== actual.bytes) throw new TypeError(`preservation corpus ${source.id} source descriptor drifted before Vault import`);
  }
}

/** Materializes versioned local fixtures and proves only Vault/Reader boundaries. */
export async function runGhostPreservationCorpus(fixture: GhostPreservationCorpusFixtureV1): Promise<GhostPreservationCorpusReport> {
  const future = JSON.parse(await v2("c39-future")) as { manifest: { schemaVersion: number } }; future.manifest.schemaVersion = 999;
  const corrupt = JSON.parse(await v2("c39-corrupt")) as { chunks: Record<string, string> }; const [chunkId] = Object.keys(corrupt.chunks); if (chunkId === undefined) throw new TypeError("C39 corrupt fixture lacks a chunk"); corrupt.chunks[chunkId] = "corrupt-preservation-payload";
  const sources: readonly MaterializedSource[] = Object.freeze([
    { id: "v2-exact", expected: "exact", source: await v2("c39-v2-exact") }, { id: "v1-migrated", expected: "migrated", source: await v1("c39-v1-migrated", false) },
    { id: "v1-visual-only", expected: "visual-only", source: await v1("c39-v1-visual", true) }, { id: "future-unsupported", expected: "unsupported", source: JSON.stringify(future) }, { id: "corrupt-rejected", expected: "rejected", source: JSON.stringify(corrupt) },
  ]);
  verifyDescriptors(fixture, sources);
  const source = (id: string): string => { const found = sources.find((entry) => entry.id === id)?.source; if (found === undefined) throw new TypeError(`missing preservation corpus source ${id}`); return found; };
  const results: GhostPreservationCorpusResult[] = [];
  const exactSource = source("v2-exact"), exact = await reopen(exactSource); results.push(readable("v2-exact", "exact", exactSource, await new GhostCapsuleReader(exact.vault).read(exact.id), "schema-v2 source reopens through the production Vault and Reader"));
  const v1Source = source("v1-migrated"), beforeMigration = v1Source, legacy = parseGhostCapsuleManifest((JSON.parse(v1Source) as { manifest: unknown }).manifest); if (legacy.schemaVersion !== 1) throw new TypeError("C39 V1 fixture did not materialize a V1 manifest"); const migrated = migrateGhostCapsuleManifestV1(legacy); if (v1Source !== beforeMigration) throw new TypeError("C39 migration mutated its source payload"); const migratedVault = new GhostLocalVault(createMemoryGhostVaultBackend()); await migratedVault.putManifest(migrated); results.push(readable("v1-migrated", "migrated", v1Source, await new GhostCapsuleReader(migratedVault).read(migrated.id), "pure V1-to-V2 migration leaves the immutable V1 export unchanged"));
  const visualSource = source("v1-visual-only"), visual = await reopen(visualSource); results.push(readable("v1-visual-only", "visual-only", visualSource, await new GhostCapsuleReader(visual.vault).read(visual.id), "legacy V1 source remains readable but declares only reduced visual fidelity"));
  const futureSource = source("future-unsupported"); try { await reopen(futureSource); throw new Error("future preservation fixture was accepted"); } catch (error) { if (error instanceof Error && error.message === "future preservation fixture was accepted") throw error; results.push(Object.freeze({ id: "future-unsupported", outcome: "unsupported", sourceHash: stableVerificationHash(futureSource), sourceBytes: bytes(futureSource), detail: "unknown capsule schema is rejected before any Vault write" })); }
  const corruptSource = source("corrupt-rejected"); try { await reopen(corruptSource); throw new Error("corrupt preservation fixture was accepted"); } catch (error) { if (error instanceof Error && error.message === "corrupt preservation fixture was accepted") throw error; results.push(Object.freeze({ id: "corrupt-rejected", outcome: "rejected", sourceHash: stableVerificationHash(corruptSource), sourceBytes: bytes(corruptSource), detail: "checksum-corrupt source is rejected before a Vault commit" })); }
  return Object.freeze({ format: "tear-preservation-corpus-report", schemaVersion: 1, results: Object.freeze(results) });
}
