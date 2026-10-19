import { canonicalStringify } from "../replay/hash";
import { prepareGhostCapsuleArchive, ghostArchiveSha256, type PreparedGhostCapsuleArchive, type NormalGhostArchiveLimits } from "./capsule-archive";
import { ghostCapsuleImportBaseline, ghostCapsuleImportGuards, type GhostImportBaseline } from "./capsule-import-plan";
import { ghostColdRestoreJobKey, ghostColdRestoreResultKey, parseGhostColdRestoreJob, parseGhostColdRestoreResult,
  ghostColdRestoreRevision, prepareGhostColdRestoreCompletion, readGhostColdRestoreCompletion, type GhostColdRestoreJob, type GhostColdRestoreResult } from "./cold-restore-job";
import type { GhostLocalVault } from "./capsule-vault";
import type { GhostVaultGuard, GhostVaultWrite } from "./capsule-vault-backend";

export type GhostColdRestoreFailure = "invalid-archive" | "limits" | "unavailable" | "input-mismatch" | "input-required" | "cancelled" | "conflict" | "logical-quota" | "physical-quota" | "commit-indeterminate";
export class GhostColdRestoreError extends Error {
  constructor(readonly code: GhostColdRestoreFailure, message: string, cause?: unknown) { super(message, { cause }); this.name = "GhostColdRestoreError"; }
}
interface ColdRestoreOptions { readonly now?: () => string; readonly lease?: () => string }
/** Local explicit intents only. Never retains a File, archive bytes, plan or account. */
export class GhostColdRestore {
  readonly #vault: GhostLocalVault;
  readonly #now: () => string;
  readonly #lease: () => string;
  constructor(vault: GhostLocalVault, options: ColdRestoreOptions = {}) {
    this.#vault = vault; this.#now = options.now ?? (() => new Date().toISOString()); this.#lease = options.lease ?? (() => crypto.randomUUID());
  }
  /** Metadata only; a complete receipt is historical until restore validates current custody. */
  async read(id: string): Promise<GhostColdRestoreJob | undefined> {
    const raw = await this.#vault.backend().get("analysis", ghostColdRestoreJobKey(id));
    return raw === undefined ? undefined : this.#job(raw, id);
  }
  #job(raw: string, id: string): GhostColdRestoreJob {
    try { const job = parseGhostColdRestoreJob(raw); if (job.id !== id) throw new TypeError("job key identity differs"); return job; }
    catch (error) { throw new GhostColdRestoreError("conflict", "cold restore job metadata is invalid for this key", error); }
  }
  async #metadata(guards: readonly GhostVaultGuard[], writes: readonly GhostVaultWrite[]): Promise<void> {
    try { await this.#vault.backend().commitIfMatches(guards, writes); }
    catch (error) {
      const code = error instanceof Error && error.name === "QuotaExceededError" ? "physical-quota" : error instanceof Error && /no longer matches|conditional write/u.test(error.message) ? "conflict" : "commit-indeterminate";
      throw new GhostColdRestoreError(code, "cold restore metadata transaction was not confirmed; inspect metadata and explicitly reselect", error);
    }
  }
  async #plan(archive: PreparedGhostCapsuleArchive, baseline?: GhostImportBaseline) {
    try { return await this.#vault.prepareCapsuleImport(archive, baseline); }
    catch (error) { throw new GhostColdRestoreError("conflict", "cold restore destination differs from its exact initial custody", error); }
  }
  async select(id: string, bytes: Uint8Array, limits: Partial<NormalGhostArchiveLimits> = {}): Promise<GhostColdRestoreJob> {
    const key = ghostColdRestoreJobKey(id), archive = await this.#archive(bytes, limits), plan = await this.#plan(archive), now = this.#now();
    const job = parseGhostColdRestoreJob(JSON.stringify({ format: "ghost-cold-restore-job", schemaVersion: 1, id, revision: 0, state: "ready", lease: null,
      createdAt: now, updatedAt: now, binding: archive.binding, limits: archive.limits, baseline: ghostCapsuleImportBaseline(plan), resultHash: null, failure: null }));
    await this.#metadata([...ghostCapsuleImportGuards(plan), { store: "analysis", key }, { store: "analysis", key: ghostColdRestoreResultKey(id) }],
      [{ store: "analysis", key, value: JSON.stringify(job) }]); return job;
  }
  async cancel(id: string, revision: number): Promise<GhostColdRestoreJob> {
    const backend = this.#vault.backend(), key = ghostColdRestoreJobKey(id), raw = await backend.get("analysis", key);
    if (raw === undefined) throw new GhostColdRestoreError("conflict", "cold restore job is absent");
    const job = this.#job(raw, id);
    if (job.state === "complete") return job;
    if (job.revision !== revision) throw new GhostColdRestoreError("conflict", "cold restore cancellation revision changed");
    if (job.state === "cancelled") return job;
    const cancelled = ghostColdRestoreRevision(job, { state: "cancelled", lease: null, resultHash: null, failure: null }, this.#now());
    await this.#metadata([{ store: "analysis", key, expected: raw }], [{ store: "analysis", key, value: JSON.stringify(cancelled) }]); return cancelled;
  }
  async restore(id: string, bytes: Uint8Array, limits?: Partial<NormalGhostArchiveLimits>, expectedJob?: GhostColdRestoreJob): Promise<GhostColdRestoreResult> {
    const backend = this.#vault.backend(), key = ghostColdRestoreJobKey(id), initialRaw = await backend.get("analysis", key);
    if (initialRaw === undefined) throw new GhostColdRestoreError("input-required", "select an explicit archive before restoring");
    const initial = this.#job(initialRaw, id);
    if (expectedJob !== undefined && canonicalStringify(initial) !== canonicalStringify(expectedJob)) throw new GhostColdRestoreError("conflict", "displayed restore job revision changed before claim");
    if (initial.state === "cancelled") throw new GhostColdRestoreError("cancelled", "cancelled cold restore requires a new intent");
    const archive = await this.#archive(bytes, limits ?? initial.limits);
    if (canonicalStringify(archive.binding) !== canonicalStringify(initial.binding) || canonicalStringify(archive.limits) !== canonicalStringify(initial.limits)) throw new GhostColdRestoreError("input-mismatch", "reselection differs from the immutable cold restore input");
    if (initial.state === "complete") return this.#resolve(archive, initial);
    const plan = await this.#plan(archive, initial.baseline);
    const active = ghostColdRestoreRevision(initial, { state: "restoring", lease: this.#lease(), resultHash: null, failure: null }, this.#now()), activeRaw = JSON.stringify(active);
    await this.#metadata([...ghostCapsuleImportGuards(plan), { store: "analysis", key, expected: initialRaw }, { store: "analysis", key: ghostColdRestoreResultKey(id) }], [{ store: "analysis", key, value: activeRaw }]);
    const completion = await prepareGhostColdRestoreCompletion(activeRaw, this.#now()), owned = readGhostColdRestoreCompletion(completion);
    try { await this.#vault.commitCapsuleImport(plan, completion); return owned.result; }
    catch (error) {
      let currentRaw: string | undefined, current: GhostColdRestoreJob | undefined;
      try {
        currentRaw = await backend.get("analysis", key);
        if (currentRaw !== undefined) current = this.#job(currentRaw, id);
      } catch (observationError) {
        throw new GhostColdRestoreError("commit-indeterminate", "cold restore commit metadata could not be observed; custody is unresolved", observationError);
      }
      if (current !== undefined) {
        if (canonicalStringify(current) === canonicalStringify(owned.job)) return this.#resolve(archive, owned.job);
        if (current.state === "cancelled") throw new GhostColdRestoreError("cancelled", "cancellation won before cold restore import", error);
      }
      if (currentRaw !== activeRaw) throw new GhostColdRestoreError("conflict", "cold restore attempt ownership changed", error);
      const code = error instanceof Error && error.name === "QuotaExceededError" ? "physical-quota" : error instanceof RangeError && error.message.includes("logical quota") ? "logical-quota" : "conflict";
      const failed = ghostColdRestoreRevision(active, { state: "failed", lease: null, resultHash: null, failure: code }, this.#now());
      try {
        // If no commit occurred, the original baseline + active job/result
        // absence still fence failure publication. Otherwise retain uncertainty.
        await backend.commitIfMatches([...ghostCapsuleImportGuards(plan), { store: "analysis", key, expected: activeRaw }, { store: "analysis", key: ghostColdRestoreResultKey(id) }], [{ store: "analysis", key, value: JSON.stringify(failed) }]);
      } catch (drift) { throw new GhostColdRestoreError("commit-indeterminate", "cold restore commit could not be resolved without adopting changed custody", drift); }
      throw new GhostColdRestoreError(code, "cold restore did not commit; exact input may be explicitly retried", error);
    }
  }
  async #archive(bytes: Uint8Array, limits: Partial<NormalGhostArchiveLimits>): Promise<PreparedGhostCapsuleArchive> {
    try { return await prepareGhostCapsuleArchive(bytes, limits); }
    catch (error) {
      const code = error instanceof RangeError ? "limits" : error instanceof ReferenceError || (error instanceof Error && error.name === "NotSupportedError") ? "unavailable" : "invalid-archive";
      throw new GhostColdRestoreError(code, "normal archive validation failed", error);
    }
  }
  async #resolve(archive: PreparedGhostCapsuleArchive, expected: GhostColdRestoreJob): Promise<GhostColdRestoreResult> {
    const backend = this.#vault.backend(), key = ghostColdRestoreJobKey(expected.id), resultKey = ghostColdRestoreResultKey(expected.id);
    try {
      const raw = await backend.get("analysis", key), resultRaw = await backend.get("analysis", resultKey);
      if (raw === undefined || resultRaw === undefined) throw new TypeError("cold restore completion records are absent");
      const job = parseGhostColdRestoreJob(raw), result = parseGhostColdRestoreResult(resultRaw);
      const hash = await ghostArchiveSha256(new TextEncoder().encode(canonicalStringify(result)));
      if (canonicalStringify(job) !== canonicalStringify(expected) || job.state !== "complete" || job.resultHash !== hash
        || result.jobId !== job.id || result.revision !== job.revision || result.lease !== job.lease || result.kind !== job.baseline.kind
        || canonicalStringify(result.binding) !== canonicalStringify(archive.binding)) throw new TypeError("cold restore completion ownership differs");
      const plan = await this.#vault.prepareCapsuleImport(archive);
      if (ghostCapsuleImportBaseline(plan).kind !== "existing-exact") throw new TypeError("historical completion lacks current exact custody");
      // Joint guard-only transaction is the last step: validation followed by a
      // competing mutation is never returned as current validated completion.
      await backend.commitIfMatches([...ghostCapsuleImportGuards(plan), { store: "analysis", key, expected: raw }, { store: "analysis", key: resultKey, expected: resultRaw }], []);
      return result;
    } catch (error) { throw new GhostColdRestoreError("commit-indeterminate", "historical cold restore result is not jointly validated current custody", error); }
  }
}
