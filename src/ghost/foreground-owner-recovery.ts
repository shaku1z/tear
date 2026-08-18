import { ghostSha256 } from "./cloud-publication";
import type { GhostLocalVault, TearGhostManifest } from "./capsule-vault";
import type { GhostPublicationBearerPort } from "../platform/firebase-publication-bearer";

export interface GhostOwnerRecoveryCatalogEntry {
  readonly capsuleId: string; readonly buildId: string; readonly schemaVersion: number;
  readonly byteLength: number; readonly contentHash: string; readonly rootIntegrity: string;
  readonly status: "finalized"; readonly verification: "verified"; readonly moderation: "cleared";
}
export interface GhostForegroundOwnerRecoveryOptions {
  readonly endpoint: string; readonly fetch: typeof fetch; readonly bearer: GhostPublicationBearerPort;
  readonly vault: GhostLocalVault; readonly maximumBytes?: number;
}
export type GhostOwnerRecoveryResult =
  | Readonly<{ readonly status: "recovered"; readonly manifest: TearGhostManifest }>
  | Readonly<{ readonly status: "already-recovered"; readonly manifest: TearGhostManifest }>
  | Readonly<{ readonly status: "absent" }>;

const DEFAULT_MAXIMUM_BYTES = 64 * 1024 * 1024;
function record(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("malformed Ghost recovery response"); return value as Record<string, unknown>; }
function text(value: unknown): string { if (typeof value !== "string" || value.length === 0) throw new TypeError("malformed Ghost recovery metadata"); return value; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError("malformed Ghost recovery metadata"); return value as number; }
function parseEntry(value: unknown): GhostOwnerRecoveryCatalogEntry | undefined {
  const row = record(value);
  // Own catalog is also a publication-history view. Nonterminal, rejected, and
  // quarantined rows are deliberately not recovery candidates; they are never
  // allowed to fall through to object fetch.
  if (row.status !== "finalized") return undefined;
  const verdict = record(JSON.parse(text(row.verdict_json)) as unknown);
  if (verdict.status !== "verified" || verdict.moderation !== "cleared" || typeof row.active_verdict_id !== "string") throw new TypeError("cloud capsule is not finalized verified-cleared");
  const entry = { capsuleId: text(row.capsule_id), buildId: text(row.build_id), schemaVersion: integer(row.schema_version), byteLength: integer(row.byte_length), contentHash: text(row.content_hash), rootIntegrity: text(row.result_hash), status: "finalized" as const, verification: "verified" as const, moderation: "cleared" as const };
  if (verdict.capsuleId !== entry.capsuleId || verdict.buildId !== entry.buildId || verdict.contentHash !== entry.contentHash || verdict.resultHash !== entry.rootIntegrity) throw new TypeError("cloud recovery verdict identity mismatch");
  return Object.freeze(entry);
}

/** Explicit foreground owner recovery. It retains neither cloud metadata nor bytes. */
export class GhostForegroundOwnerRecovery {
  readonly #o: GhostForegroundOwnerRecoveryOptions;
  constructor(options: GhostForegroundOwnerRecoveryOptions) { this.#o = options; }
  async #request(path: string): Promise<Response> { const token = await this.#o.bearer.acquireAuthorization(); return this.#o.fetch(`${this.#o.endpoint.replace(/\/$/u, "")}${path}`, { headers: { authorization: token.authorization, accept: "application/json" } }); }
  async listOwnOnce(): Promise<readonly GhostOwnerRecoveryCatalogEntry[]> {
    const response = await this.#request("/v1/capsules?scope=own"); if (!response.ok) throw new Error(`Ghost recovery catalog failed: ${String(response.status)}`);
    const body = record(await response.json()), rows = body.capsules;
    if (!Array.isArray(rows)) throw new TypeError("malformed Ghost recovery catalog");
    const entries = rows.map(parseEntry).filter((entry): entry is GhostOwnerRecoveryCatalogEntry => entry !== undefined); if (new Set(entries.map((entry) => entry.capsuleId)).size !== entries.length) throw new TypeError("duplicate Ghost recovery catalog id");
    return Object.freeze(entries);
  }
  async recoverOnce(capsuleId: string): Promise<GhostOwnerRecoveryResult> {
    const entry = (await this.listOwnOnce()).find((candidate) => candidate.capsuleId === capsuleId);
    if (entry === undefined) return Object.freeze({ status: "absent" });
    const existing = await this.#o.vault.getManifest(capsuleId);
    if (existing !== undefined) {
      if (existing.schemaVersion === entry.schemaVersion && existing.rootIntegrity === entry.rootIntegrity) return Object.freeze({ status: "already-recovered", manifest: existing });
      throw new RangeError("local Ghost recovery custody conflicts with cloud capsule");
    }
    const response = await this.#request(`/v1/capsules/${encodeURIComponent(capsuleId)}/object`);
    if (response.status === 404) return Object.freeze({ status: "absent" });
    if (response.status !== 200 || response.headers.has("content-range")) throw new TypeError("Ghost recovery requires one complete object response");
    const maximum = this.#o.maximumBytes ?? DEFAULT_MAXIMUM_BYTES, bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== entry.byteLength || bytes.byteLength > maximum) throw new RangeError("Ghost recovery object length is invalid");
    const encoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (new TextEncoder().encode(encoded).byteLength !== bytes.byteLength || await ghostSha256(bytes) !== entry.contentHash) throw new TypeError("Ghost recovery object hash or UTF-8 encoding is invalid");
    const manifest = await this.#o.vault.importCapsule(encoded, { maxEncodedBytes: maximum, maxChunks: 20_000, maxChunkBytes: 8 * 1024 * 1024, maxExpansionRatio: 100 });
    if (manifest.id !== entry.capsuleId || manifest.schemaVersion !== entry.schemaVersion || manifest.rootIntegrity !== entry.rootIntegrity) throw new TypeError("recovered Ghost manifest does not match cloud custody");
    // Reopen through the Vault parser after the atomic import boundary.
    const reopened = await this.#o.vault.getManifest(manifest.id); if (reopened?.rootIntegrity !== entry.rootIntegrity) throw new TypeError("recovered Ghost cannot be reopened");
    return Object.freeze({ status: "recovered", manifest: reopened });
  }
}
