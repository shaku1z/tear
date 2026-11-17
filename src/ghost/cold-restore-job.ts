import type { GhostPortableArchiveBinding, GhostPairedArchiveBinding } from "./capsule-paired-archive";
import { canonicalStringify } from "../domain/hash";
import { ghostArchiveSha256, normalGhostArchiveLimits, type NormalGhostArchiveLimits } from "./capsule-archive";
import type { GhostImportBaseline } from "./capsule-import-plan";
import type { GhostVaultGuard, GhostVaultWrite } from "./capsule-vault-backend";

export type GhostColdRestoreState = "ready" | "restoring" | "failed" | "cancelled" | "complete";
export interface GhostColdRestoreJob {
  readonly format: "ghost-cold-restore-job";
  readonly schemaVersion: 1 | 2;
  readonly id: string;
  readonly revision: number;
  readonly state: GhostColdRestoreState;
  readonly lease: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly binding: GhostPortableArchiveBinding;
  readonly limits: NormalGhostArchiveLimits;
  readonly baseline: GhostImportBaseline;
  readonly resultHash: string | null;
  readonly failure: string | null;
}
export interface GhostColdRestoreResult {
  readonly format: "ghost-cold-restore-result";
  readonly schemaVersion: 1 | 2;
  readonly jobId: string;
  readonly revision: number;
  readonly lease: string;
  readonly binding: GhostPortableArchiveBinding;
  readonly kind: "imported" | "existing-exact";
}
export function ghostColdRestoreJobKey(id: string): string {
  if (!/^[a-zA-Z0-9._-]{1,128}$/u.test(id)) throw new TypeError("invalid cold restore job ID");
  return `ghost-cold-restore:job:v1:${id}`;
}
export function ghostColdRestoreResultKey(id: string): string {
  ghostColdRestoreJobKey(id);
  return `ghost-cold-restore:result:v1:${id}`;
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("invalid cold restore metadata");
  return value as Record<string, unknown>;
}
function binding(value: unknown): GhostPortableArchiveBinding {
  const v = object(value);
  if (v.protocol === "ghost-linked-archive-v1") {
    if (Object.keys(v).length !== 9 || !Array.isArray(v.members) || v.members.length !== 2)
      throw new TypeError("invalid paired archive binding");
    if (v.members.some((member) => object(member).protocol !== "ghost-normal-archive-v1"))
      throw new TypeError("nested paired archive binding");
    const members = v.members.map(binding);
    const [parent, companion] = members;
    if (
      parent?.protocol !== "ghost-normal-archive-v1" ||
      companion?.protocol !== "ghost-normal-archive-v1" ||
      parent.capsuleId === companion.capsuleId ||
      v.capsuleId !== parent.capsuleId ||
      v.schemaVersion !== parent.schemaVersion ||
      v.rootIntegrity !== parent.rootIntegrity ||
      members.some((m) => m.limitsDigest !== v.limitsDigest)
    )
      throw new TypeError("invalid paired archive members");
    const { members: ignored, ...base } = v;
    void ignored;
    binding({ ...base, protocol: "ghost-normal-archive-v1" });
    return Object.freeze({ ...v, members: Object.freeze(members) }) as unknown as GhostPairedArchiveBinding;
  }
  if (
    Object.keys(v).length !== 8 ||
    v.protocol !== "ghost-normal-archive-v1" ||
    !Number.isSafeInteger(v.byteLength) ||
    Number(v.byteLength) < 1 ||
    Number(v.byteLength) > 64 * 1024 * 1024 ||
    typeof v.schemaVersion !== "number" ||
    ![1, 2].includes(v.schemaVersion) ||
    typeof v.capsuleId !== "string" ||
    !v.capsuleId ||
    typeof v.rootIntegrity !== "string" ||
    !/^[a-f0-9]{16}$/u.test(v.rootIntegrity) ||
    [v.sha256, v.manifestDigest, v.limitsDigest].some(
      (hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/u.test(hash),
    )
  )
    throw new TypeError("invalid cold restore input binding");
  return Object.freeze({ ...v }) as unknown as GhostPortableArchiveBinding;
}
function baseline(value: unknown): GhostImportBaseline {
  const v = object(value);
  if (
    Object.keys(v).length !== 2 ||
    typeof v.kind !== "string" ||
    !["imported", "existing-exact"].includes(v.kind) ||
    !Array.isArray(v.slots) ||
    v.slots.length < 3 ||
    v.slots.length > 20_006
  )
    throw new TypeError("invalid cold restore destination baseline");
  const keys = new Set<string>();
  const slots = v.slots.map((entry: unknown) => {
    const slot = object(entry),
      key = `${String(slot.store)}:${String(slot.key)}`;
    if (
      Object.keys(slot).length !== 3 ||
      typeof slot.store !== "string" ||
      !["manifests", "chunks", "indexes", "analysis"].includes(slot.store) ||
      typeof slot.key !== "string" ||
      !slot.key ||
      (slot.sha256 !== null && (typeof slot.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(slot.sha256))) ||
      keys.has(key)
    )
      throw new TypeError("invalid cold restore destination slot");
    keys.add(key);
    return Object.freeze({ ...slot });
  });
  return Object.freeze({ kind: v.kind, slots: Object.freeze(slots) }) as GhostImportBaseline;
}
export function parseGhostColdRestoreJob(raw: string): GhostColdRestoreJob {
  const v = object(JSON.parse(raw) as unknown);
  if (
    Object.keys(v).length !== 13 ||
    v.format !== "ghost-cold-restore-job" ||
    ![1, 2].includes(v.schemaVersion as number) ||
    typeof v.id !== "string" ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 0 ||
    typeof v.state !== "string" ||
    !["ready", "restoring", "failed", "cancelled", "complete"].includes(v.state) ||
    (v.lease !== null && (typeof v.lease !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/u.test(v.lease))) ||
    typeof v.createdAt !== "string" ||
    typeof v.updatedAt !== "string" ||
    v.createdAt.length > 64 ||
    v.updatedAt.length > 64 ||
    (v.failure !== null && (typeof v.failure !== "string" || v.failure.length > 128)) ||
    (v.resultHash !== null && (typeof v.resultHash !== "string" || !/^[a-f0-9]{64}$/u.test(v.resultHash))) ||
    (v.state === "complete") !== (v.resultHash !== null) ||
    (["complete", "restoring"].includes(v.state) && v.lease === null)
  )
    throw new TypeError("invalid cold restore job");
  if ((v.schemaVersion === 2) !== (object(v.binding).protocol === "ghost-linked-archive-v1"))
    throw new TypeError("restore job protocol differs");
  ghostColdRestoreJobKey(v.id);
  const limits = object(v.limits);
  if (Object.keys(limits).length !== 9) throw new TypeError("invalid cold restore limits");
  return Object.freeze({
    ...v,
    binding: binding(v.binding),
    limits: normalGhostArchiveLimits(limits),
    baseline: baseline(v.baseline),
  }) as unknown as GhostColdRestoreJob;
}
export function parseGhostColdRestoreResult(raw: string): GhostColdRestoreResult {
  const v = object(JSON.parse(raw) as unknown);
  if (
    Object.keys(v).length !== 7 ||
    v.format !== "ghost-cold-restore-result" ||
    ![1, 2].includes(v.schemaVersion as number) ||
    typeof v.jobId !== "string" ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 1 ||
    typeof v.lease !== "string" ||
    !/^[a-zA-Z0-9._-]{1,128}$/u.test(v.lease) ||
    typeof v.kind !== "string" ||
    !["imported", "existing-exact"].includes(v.kind)
  )
    throw new TypeError("invalid cold restore result");
  if ((v.schemaVersion === 2) !== (object(v.binding).protocol === "ghost-linked-archive-v1"))
    throw new TypeError("restore result protocol differs");
  ghostColdRestoreJobKey(v.jobId);
  return Object.freeze({ ...v, binding: binding(v.binding) }) as unknown as GhostColdRestoreResult;
}
export function ghostColdRestoreRevision(
  job: GhostColdRestoreJob,
  changes: Pick<GhostColdRestoreJob, "state" | "lease" | "resultHash" | "failure">,
  now: string,
): GhostColdRestoreJob {
  return parseGhostColdRestoreJob(JSON.stringify({ ...job, ...changes, revision: job.revision + 1, updatedAt: now }));
}
declare const completionBrand: unique symbol;
export interface GhostColdRestoreCompletion {
  readonly [completionBrand]: true;
}
interface CompletionData {
  readonly job: GhostColdRestoreJob;
  readonly result: GhostColdRestoreResult;
  readonly guards: readonly GhostVaultGuard[];
  readonly writes: readonly GhostVaultWrite[];
}
const completions = new WeakMap<GhostColdRestoreCompletion, CompletionData>();
export function readGhostColdRestoreCompletion(value: GhostColdRestoreCompletion): CompletionData {
  const data = completions.get(value);
  if (data === undefined) throw new TypeError("invalid owned cold restore completion");
  return data;
}
export async function prepareGhostColdRestoreCompletion(raw: string, now: string): Promise<GhostColdRestoreCompletion> {
  const job = parseGhostColdRestoreJob(raw);
  if (job.state !== "restoring" || job.lease === null)
    throw new TypeError("cold restore completion requires an active owned attempt");
  const result = parseGhostColdRestoreResult(
    JSON.stringify({
      format: "ghost-cold-restore-result",
      schemaVersion: job.schemaVersion,
      jobId: job.id,
      revision: job.revision + 1,
      lease: job.lease,
      binding: job.binding,
      kind: job.baseline.kind,
    }),
  );
  const resultRaw = JSON.stringify(result),
    resultHash = await ghostArchiveSha256(new TextEncoder().encode(canonicalStringify(result)));
  const completed = ghostColdRestoreRevision(
    job,
    { state: "complete", lease: job.lease, resultHash, failure: null },
    now,
  );
  const completion = Object.freeze({}) as GhostColdRestoreCompletion;
  completions.set(
    completion,
    Object.freeze({
      job: completed,
      result,
      guards: Object.freeze(
        [
          { store: "analysis" as const, key: ghostColdRestoreJobKey(job.id), expected: raw },
          { store: "analysis" as const, key: ghostColdRestoreResultKey(job.id) },
        ].map((guard) => Object.freeze(guard)),
      ),
      writes: Object.freeze(
        [
          { store: "analysis" as const, key: ghostColdRestoreJobKey(job.id), value: JSON.stringify(completed) },
          { store: "analysis" as const, key: ghostColdRestoreResultKey(job.id), value: resultRaw },
        ].map((write) => Object.freeze(write)),
      ),
    }),
  );
  return completion;
}
