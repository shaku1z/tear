import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { RELEASE_REPOSITORY } from "./release-artifact.mjs";
import { normalizeRepositoryIdentifier } from "./repository-identity.mjs";

export const DEFAULT_WORKSPACE_RECOVERY_POLICY_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "preservation",
  "workspace-recovery-policy.json",
);
export const DEFAULT_WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "preservation",
  "workspace-recovery-second-wave-sources.json",
);
export const WORKSPACE_RECOVERY_POLICY_FORMAT = "tear-workspace-recovery-policy";
export const WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT = "tear-workspace-recovery-second-wave-policy";
export const WORKSPACE_RECOVERY_REPORT_FORMAT = "tear-workspace-recovery-report";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const GIT_OBJECT_PATTERN = /^[0-9a-f]{40,64}$/u;
const SOURCE_NAME_PATTERN = /^gsm-[^\\/]+$/iu;
const RECOVERY_GROUP_PATTERN = /^\d{4}-\d{2}-\d{2}-g5-[a-z0-9-]+$/u;
const HASH_CHUNK_SIZE = 1024 * 1024;
const SECOND_WAVE_RETENTION_FLOOR_UTC = "2027-03-31T23:59:59.000Z";
const SECOND_WAVE_ROOT_ARGUMENTS = new Set(["workspace-root", "temp-root"]);
const SECOND_WAVE_CANONICAL_ROOT_NAMES = new Set(["tear", "tear-score", "tear-wiki", "tear-oracle"]);
const SECOND_WAVE_ARCHIVE_ROOT_PATTERNS = [/^tear-archives$/iu, /^tear-git-recovery-/iu, /^tear-g3-preservation-audit-/iu, /^tear-g5-/iu];
const SECOND_WAVE_PARTITION_COUNT = 5;
const SECOND_WAVE_TOTAL_OBSERVED_BYTES = 5753762275;
const SECOND_WAVE_ORDINARY_OBSERVED_BYTES = 5718968788;
const SECOND_WAVE_DEFERRED_OBSERVED_BYTES = 34793487;
const SECOND_WAVE_AUDIT_DATE_UTC = "2026-08-23T00:00:00.000Z";
const SECOND_WAVE_AUDIT_HEAD = "395d22c5cc107d9583c02e368f113edb69ea6c09";
const SECOND_WAVE_MAX_BYTES = 2147483648;
const SECOND_WAVE_DEFERRED_SOURCE_ID = "second-wave-tear-budget-architecture";
const SECOND_WAVE_DEFERRED_SOURCE_NAME = "Tear-budget-architecture";
const SECOND_WAVE_DEFERRED_SOURCE_PATH = "node_modules";
const SECOND_WAVE_DEFERRED_TARGET_SOURCE_ID = "second-wave-tear-tearscore-normalization";
const SECOND_WAVE_DEFERRED_TARGET_SOURCE_NAME = "Tear-tearscore-normalization";
const SECOND_WAVE_DEFERRED_TARGET_PATH = "node_modules";
const SECOND_WAVE_DEFERRED_REASON = "separate-coordinated-opaque-reparse-preservation-required";
const SECOND_WAVE_DEFERRED_GROUP_ID = "second-wave-dependency-budget-node-modules";
const SECOND_WAVE_PARTITION_BOUNDARY_MODE = "explicit-partition-v1-only";
const SECOND_WAVE_PRE_PARTITION_EVIDENCE_STATUS = "intentionally-invalidated-and-rejected";
const SECOND_WAVE_SUCCESSFUL_PRIOR_ARTIFACT = false;
const SECOND_WAVE_FAILED_ALL_AT_ONCE_REPORT = "2GiB-cap-rejection-produced-no-report";

export class WorkspaceRecoveryReportError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspaceRecoveryReportError";
  }
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function isPathInside(root, candidate, { allowEqual = false } = {}) {
  const relativePath = path.relative(root, candidate);
  if (relativePath === "") return allowEqual;
  return relativePath !== ".."
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
}

function normalizedPosixPath(value) {
  return String(value).replaceAll("\\", "/");
}

function normalizeManifestPath(value) {
  const normalized = normalizedPosixPath(value);
  if (
    normalized === ""
    || normalized.startsWith("/")
    || /^[A-Za-z]:/u.test(normalized)
    || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) return null;
  return normalized;
}

function relativeManifestPath(root, candidate) {
  const normalized = normalizeManifestPath(path.relative(root, candidate));
  if (normalized === null) throw new WorkspaceRecoveryReportError(`unsafe relative path: ${candidate}`);
  return normalized;
}

function formatUtc(milliseconds) {
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) throw new WorkspaceRecoveryReportError("timestamp is not representable as UTC");
  return date.toISOString();
}

function timestampRecord(stats) {
  return {
    atimeUtc: formatUtc(stats.atimeMs),
    mtimeUtc: formatUtc(stats.mtimeMs),
    birthtimeUtc: formatUtc(stats.birthtimeMs),
  };
}

function entryKind(stats) {
  if (stats === null || stats === undefined) return "unknown";
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  return "other";
}

function inspectPath(candidate, root) {
  const absoluteCandidate = path.resolve(candidate);
  let stats;
  try {
    stats = fs.lstatSync(absoluteCandidate);
  } catch (error) {
    return { stats: null, reason: `unreadable:${error.code ?? "unknown"}` };
  }
  if (stats.isSymbolicLink()) return { stats, reason: "symlink-or-reparse" };

  let realPath;
  try {
    realPath = fs.realpathSync.native(absoluteCandidate);
  } catch (error) {
    return { stats, reason: `unresolvable:${error.code ?? "unknown"}` };
  }
  if (!isPathInside(root, realPath, { allowEqual: true })) return { stats, reason: "outside-root" };
  if (!samePath(absoluteCandidate, realPath)) return { stats, reason: "symlink-or-reparse" };
  return { stats, realPath, reason: null };
}

function inspectCanonicalDirectory(candidate, label) {
  const absoluteCandidate = path.resolve(candidate);
  const inspection = inspectPath(absoluteCandidate, path.dirname(absoluteCandidate));
  if (inspection.reason !== null || inspection.stats === null || !inspection.stats.isDirectory()) {
    throw new WorkspaceRecoveryReportError(`${label} must be an existing canonical directory: ${absoluteCandidate}`);
  }
  return inspection.realPath;
}

function runGit(root, argumentsList, input = undefined) {
  const result = spawnSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    input,
    stdio: "pipe",
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function gitFailure(result, command) {
  const detail = result.error?.message || result.stderr || result.stdout || "unknown error";
  return `${command} failed: ${String(detail).trim()}`;
}

function readJsonFile(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new WorkspaceRecoveryReportError(`${label} could not be read: ${error.message}`);
  }
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch (error) {
    throw new WorkspaceRecoveryReportError(`${label} is not valid JSON: ${error.message}`);
  }
}

function sha256Bytes(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function validateInteger(value, label, { min = 1 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) return `${label} must be an integer >= ${min}`;
  return null;
}

export function validateWorkspaceRecoveryPolicy(policy) {
  const errors = [];
  if (policy?.format !== WORKSPACE_RECOVERY_POLICY_FORMAT) errors.push(`format must be ${WORKSPACE_RECOVERY_POLICY_FORMAT}`);
  if (policy?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (policy?.repository !== RELEASE_REPOSITORY) errors.push(`repository must be ${RELEASE_REPOSITORY}`);

  const expectedCategories = ["invalid-gsm-worktrees", "receipt-copies", "publication-copy"];
  if (!Array.isArray(policy?.sourceCategories) || policy.sourceCategories.length !== expectedCategories.length) {
    errors.push(`sourceCategories must contain exactly ${expectedCategories.length} entries`);
  } else {
    for (const [index, expectedId] of expectedCategories.entries()) {
      const category = policy.sourceCategories[index];
      if (category?.id !== expectedId) errors.push(`sourceCategories[${index}].id must be ${expectedId}`);
      if (["workspace-root", "workspace-root", "temp-root"][index] !== category?.rootArgument) {
        errors.push(`sourceCategories[${index}].rootArgument is invalid`);
      }
    }
    if (policy.sourceCategories[0]?.discovery !== "direct-child-name-matches-gsm-dash") {
      errors.push("invalid-gsm-worktrees must use direct gsm-* discovery");
    }
    if (policy.sourceCategories[0]?.maxMatches !== policy.limits?.maxSourceCandidates) {
      errors.push("gsm maxMatches must equal limits.maxSourceCandidates");
    }
    if (JSON.stringify(policy.sourceCategories[1]?.exactNames) !== JSON.stringify([
      "Tear-receipt-clean",
      "Tear-receipt-clean2",
      "Tear-receipt-clean3",
    ])) errors.push("receipt-copies exactNames are incomplete");
    if (JSON.stringify(policy.sourceCategories[2]?.exactNames) !== JSON.stringify(["Tear-main-publication"])) {
      errors.push("publication-copy exactNames must contain Tear-main-publication");
    }
  }

  if (policy?.boundary?.fetch !== false) errors.push("boundary.fetch must be false");
  if (policy?.boundary?.mutation !== "report-only") errors.push("boundary.mutation must be report-only");
  if (policy?.protectedRoots?.neverSourceCandidates !== true) errors.push("protectedRoots.neverSourceCandidates must be true");
  if (policy?.protectedRoots?.mode !== "metadata-only-no-descent") errors.push("protectedRoots.mode must be metadata-only-no-descent");
  if (policy?.protected?.reparsePoints !== "refuse") errors.push("protected.reparsePoints must be refuse");
  if (policy?.protected?.gitPointer !== "metadata-only-with-pointer-byte-cap") errors.push("protected.gitPointer must be metadata-only-with-pointer-byte-cap");
  if (policy?.protected?.hashProtectedContent !== false) errors.push("protected.hashProtectedContent must be false");
  if (!Array.isArray(policy?.protected?.segments) || !policy.protected.segments.includes(".git")) {
    errors.push("protected.segments must include .git");
  }
  if (!Array.isArray(policy?.protected?.namePatterns) || policy.protected.namePatterns.length === 0) {
    errors.push("protected.namePatterns must not be empty");
  } else {
    for (const [index, pattern] of policy.protected.namePatterns.entries()) {
      try {
        new RegExp(pattern, "iu");
      } catch (error) {
        errors.push(`protected.namePatterns[${index}] is invalid: ${error.message}`);
      }
    }
  }
  for (const field of [
    "maxSourceCandidates",
    "maxEntries",
    "maxBytes",
    "maxDepth",
    "maxPointerBytes",
    "maxSingleFileBytes",
    "maxPreservedManifestBytes",
  ]) {
    const error = validateInteger(policy?.limits?.[field], `limits.${field}`);
    if (error !== null) errors.push(error);
  }
  if (!Array.isArray(policy?.comparisonTiers) || policy.comparisonTiers.length < 3) errors.push("comparisonTiers must contain the bounded comparison order");
  if (!Array.isArray(policy?.report?.statusValues) || !policy.report.statusValues.includes("review") || !policy.report.statusValues.includes("no-go")) {
    errors.push("report.statusValues must contain review and no-go");
  }
  if (policy?.report?.outputOverwrite !== false) errors.push("report.outputOverwrite must be false");
  if (policy?.quarantine?.implemented !== false) errors.push("quarantine.implemented must be false");
  if (policy?.quarantine?.eligibility !== "never-emitted-by-this-reporter") errors.push("quarantine eligibility must remain deferred");
  if (policy?.hash?.algorithm !== "sha256") errors.push("hash.algorithm must be sha256");
  if (policy?.hash?.pathEncoding !== "relative-posix-v1") errors.push("hash.pathEncoding must be relative-posix-v1");
  return errors;
}

export function validateWorkspaceRecoverySecondWavePolicy(policy) {
  const errors = [];
  if (policy?.format !== WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT) errors.push(`format must be ${WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT}`);
  if (policy?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (policy?.repository !== RELEASE_REPOSITORY) errors.push(`repository must be ${RELEASE_REPOSITORY}`);
  if (policy?.boundary?.fetch !== false) errors.push("boundary.fetch must be false");
  if (policy?.boundary?.selection !== "exact-source-name-and-root-argument-only") errors.push("boundary.selection must be exact-source-name-and-root-argument-only");
  if (policy?.boundary?.looseFiles !== "excluded") errors.push("boundary.looseFiles must be excluded");
  if (policy?.boundary?.archiveRecoveryRoots !== "excluded") errors.push("boundary.archiveRecoveryRoots must be excluded");
  if (policy?.boundary?.canonicalRoots !== "excluded") errors.push("boundary.canonicalRoots must be excluded");
  if (policy?.retention?.mode !== "one-floor-for-entire-operation") errors.push("retention.mode must be one-floor-for-entire-operation");
  if (policy?.retention?.minimumUtc !== SECOND_WAVE_RETENTION_FLOOR_UTC) errors.push(`retention.minimumUtc must be ${SECOND_WAVE_RETENTION_FLOOR_UTC}`);
  const sourceIds = new Set();
  const sourceIdsByLower = new Map();
  const sourceRecordsById = new Map();
  if (!Array.isArray(policy?.sourceRoots) || policy.sourceRoots.length !== 45) {
    errors.push("sourceRoots must contain exactly the reviewed 45 directory roots");
  } else {
    const names = new Set();
    for (const [index, source] of policy.sourceRoots.entries()) {
      if (typeof source?.id !== "string" || !/^second-wave-[^\\/]+$/u.test(source.id)) errors.push(`sourceRoots[${index}].id must be an exact second-wave identifier`);
      if (typeof source?.name !== "string" || source.name.trim() === "") errors.push(`sourceRoots[${index}].name must be non-empty`);
      if (!SECOND_WAVE_ROOT_ARGUMENTS.has(source?.rootArgument)) errors.push(`sourceRoots[${index}].rootArgument must be workspace-root or temp-root`);
      const idKey = String(source?.id ?? "").toLowerCase();
      const nameKey = String(source?.name ?? "").toLowerCase();
      if (sourceIds.has(source?.id)) errors.push(`sourceRoots has a duplicate id: ${source.id}`);
      if (sourceIdsByLower.has(idKey)) errors.push(`sourceRoots has a case-insensitive duplicate id: ${source.id}`);
      if (names.has(nameKey)) errors.push(`sourceRoots has a case-insensitive duplicate name: ${source.name}`);
      sourceIds.add(source?.id);
      sourceIdsByLower.set(idKey, source?.id);
      sourceRecordsById.set(source?.id, source);
      names.add(nameKey);
      if (SECOND_WAVE_CANONICAL_ROOT_NAMES.has(nameKey)) errors.push(`sourceRoots[${index}] cannot name a canonical root: ${source.name}`);
      if (SECOND_WAVE_ARCHIVE_ROOT_PATTERNS.some((pattern) => pattern.test(String(source?.name ?? "")))) errors.push(`sourceRoots[${index}] cannot name an archive/recovery root: ${source.name}`);
      if (source?.retentionClass !== undefined && source.retentionClass !== "high-risk-long-retention") errors.push(`sourceRoots[${index}].retentionClass is invalid`);
    }
    if (!policy.sourceRoots.some((source) => source.name === "tear-score-g2-audit-1611bbb" && source.retentionClass === "high-risk-long-retention")) {
      errors.push("tear-score-g2-audit-1611bbb must be the high-risk long-retention source");
    }
  }
  const partitionAudit = policy?.partitionAudit;
  if (typeof partitionAudit !== "object" || partitionAudit === null) {
    errors.push("partitionAudit must be present");
  } else {
    if (partitionAudit.auditDateUtc !== SECOND_WAVE_AUDIT_DATE_UTC) errors.push(`partitionAudit.auditDateUtc must be ${SECOND_WAVE_AUDIT_DATE_UTC}`);
    if (partitionAudit.repositoryHead !== SECOND_WAVE_AUDIT_HEAD) errors.push(`partitionAudit.repositoryHead must be ${SECOND_WAVE_AUDIT_HEAD}`);
    if (typeof partitionAudit.method !== "string" || partitionAudit.method.trim() === "") errors.push("partitionAudit.method must be non-empty");
    if (typeof partitionAudit.evidenceNote !== "string" || partitionAudit.evidenceNote.trim() === "") errors.push("partitionAudit.evidenceNote must be non-empty");
    for (const field of ["totalObservedBytes", "ordinaryPartitionObservedBytes", "deferredObservedBytes"]) {
      const error = validateInteger(partitionAudit[field], `partitionAudit.${field}`, { min: 0 });
      if (error !== null) errors.push(error);
    }
    if (partitionAudit.totalObservedBytes !== SECOND_WAVE_TOTAL_OBSERVED_BYTES) errors.push(`partitionAudit.totalObservedBytes must be ${SECOND_WAVE_TOTAL_OBSERVED_BYTES}`);
    if (partitionAudit.ordinaryPartitionObservedBytes !== SECOND_WAVE_ORDINARY_OBSERVED_BYTES) errors.push(`partitionAudit.ordinaryPartitionObservedBytes must be ${SECOND_WAVE_ORDINARY_OBSERVED_BYTES}`);
    if (partitionAudit.deferredObservedBytes !== SECOND_WAVE_DEFERRED_OBSERVED_BYTES) errors.push(`partitionAudit.deferredObservedBytes must be ${SECOND_WAVE_DEFERRED_OBSERVED_BYTES}`);
    if (partitionAudit.totalObservedBytes !== undefined && partitionAudit.ordinaryPartitionObservedBytes !== undefined && partitionAudit.deferredObservedBytes !== undefined && partitionAudit.ordinaryPartitionObservedBytes + partitionAudit.deferredObservedBytes !== partitionAudit.totalObservedBytes) {
      errors.push("partitionAudit ordinary and deferred bytes must sum to totalObservedBytes");
    }
  }
  const deferredSources = policy?.deferredSources;
  const deferredIds = new Set();
  if (!Array.isArray(deferredSources) || deferredSources.length !== 2) {
    errors.push("deferredSources must contain exactly two coordinated dependency sources");
  } else {
    for (const [index, deferred] of deferredSources.entries()) {
      if (typeof deferred?.id !== "string" || ![SECOND_WAVE_DEFERRED_SOURCE_ID, SECOND_WAVE_DEFERRED_TARGET_SOURCE_ID].includes(deferred.id)) errors.push(`deferredSources[${index}].id must be a recognized dependency source`);
      if (deferred?.id === SECOND_WAVE_DEFERRED_SOURCE_ID && deferred.name !== SECOND_WAVE_DEFERRED_SOURCE_NAME) errors.push(`deferredSources[${index}].name must be ${SECOND_WAVE_DEFERRED_SOURCE_NAME}`);
      if (deferred?.id === SECOND_WAVE_DEFERRED_TARGET_SOURCE_ID && deferred.name !== SECOND_WAVE_DEFERRED_TARGET_SOURCE_NAME) errors.push(`deferredSources[${index}].name must be ${SECOND_WAVE_DEFERRED_TARGET_SOURCE_NAME}`);
      if (deferred?.rootArgument !== "temp-root") errors.push(`deferredSources[${index}].rootArgument must be temp-root`);
      if (deferred?.dependencyGroupId !== SECOND_WAVE_DEFERRED_GROUP_ID) errors.push(`deferredSources[${index}].dependencyGroupId must be ${SECOND_WAVE_DEFERRED_GROUP_ID}`);
      if (deferred?.reason !== SECOND_WAVE_DEFERRED_REASON) errors.push(`deferredSources[${index}].reason must be ${SECOND_WAVE_DEFERRED_REASON}`);
      if (deferred?.currentOperation !== "deferred") errors.push(`deferredSources[${index}].currentOperation must be deferred`);
      const key = String(deferred?.id ?? "").toLowerCase();
      if (deferredIds.has(key)) errors.push(`deferredSources has a case-insensitive duplicate id: ${deferred.id}`);
      deferredIds.add(key);
      if (sourceIdsByLower.size > 0 && sourceIdsByLower.get(key) !== deferred?.id) errors.push(`deferred source is not an exact sourceRoots entry: ${deferred.id}`);
      const sourceRecord = sourceRecordsById.get(deferred?.id);
      if (sourceRecord !== undefined) {
        if (deferred?.name !== sourceRecord.name) errors.push(`deferred source name must match sourceRoots entry: ${deferred.id}`);
        if (deferred?.rootArgument !== sourceRecord.rootArgument) errors.push(`deferred source rootArgument must match sourceRoots entry: ${deferred.id}`);
      }
      if (deferred?.id === SECOND_WAVE_DEFERRED_SOURCE_ID) {
        if (deferred.role !== "reparse-source") errors.push("budget deferred source role must be reparse-source");
        if (deferred.relativePath !== SECOND_WAVE_DEFERRED_SOURCE_PATH) errors.push(`budget deferred relativePath must be ${SECOND_WAVE_DEFERRED_SOURCE_PATH}`);
        if (deferred.targetSourceId !== SECOND_WAVE_DEFERRED_TARGET_SOURCE_ID) errors.push(`budget deferred targetSourceId must be ${SECOND_WAVE_DEFERRED_TARGET_SOURCE_ID}`);
        if (deferred.targetRelativePath !== SECOND_WAVE_DEFERRED_TARGET_PATH) errors.push(`budget deferred targetRelativePath must be ${SECOND_WAVE_DEFERRED_TARGET_PATH}`);
        if (deferred.observedBytes !== 4133063) errors.push("budget deferred observedBytes must be 4133063");
      }
      if (deferred?.id === SECOND_WAVE_DEFERRED_TARGET_SOURCE_ID) {
        if (deferred.role !== "dependency-target") errors.push("dependency target role must be dependency-target");
        if (deferred.heldBecause !== "target-of-opaque-reparse") errors.push("dependency target must be held because it is the opaque-reparse target");
        if (deferred.observedBytes !== 30660424) errors.push("dependency target observedBytes must be 30660424");
      }
    }
  }
  const dependencyGroup = policy?.dependencyGroup;
  if (typeof dependencyGroup !== "object" || dependencyGroup === null) {
    errors.push("dependencyGroup must be present");
  } else {
    if (dependencyGroup.id !== SECOND_WAVE_DEFERRED_GROUP_ID) errors.push(`dependencyGroup.id must be ${SECOND_WAVE_DEFERRED_GROUP_ID}`);
    if (JSON.stringify(dependencyGroup.sourceIds) !== JSON.stringify([SECOND_WAVE_DEFERRED_SOURCE_ID, SECOND_WAVE_DEFERRED_TARGET_SOURCE_ID])) errors.push("dependencyGroup.sourceIds must contain exactly the junction source and its target");
    if (dependencyGroup.junctionSourceId !== SECOND_WAVE_DEFERRED_SOURCE_ID) errors.push("dependencyGroup.junctionSourceId is invalid");
    if (dependencyGroup.junctionRelativePath !== SECOND_WAVE_DEFERRED_SOURCE_PATH) errors.push("dependencyGroup.junctionRelativePath is invalid");
    if (dependencyGroup.targetSourceId !== SECOND_WAVE_DEFERRED_TARGET_SOURCE_ID) errors.push("dependencyGroup.targetSourceId is invalid");
    if (dependencyGroup.targetRelativePath !== SECOND_WAVE_DEFERRED_TARGET_PATH) errors.push("dependencyGroup.targetRelativePath is invalid");
    if (dependencyGroup.reason !== SECOND_WAVE_DEFERRED_REASON) errors.push("dependencyGroup.reason is invalid");
    if (dependencyGroup.currentOperation !== "deferred") errors.push("dependencyGroup.currentOperation must be deferred");
    if (dependencyGroup.auditedObservedBytes !== SECOND_WAVE_DEFERRED_OBSERVED_BYTES) errors.push(`dependencyGroup.auditedObservedBytes must be ${SECOND_WAVE_DEFERRED_OBSERVED_BYTES}`);
    if (sourceIdsByLower.size > 0 && (sourceIdsByLower.get(String(dependencyGroup.junctionSourceId ?? "").toLowerCase()) !== dependencyGroup.junctionSourceId || sourceIdsByLower.get(String(dependencyGroup.targetSourceId ?? "").toLowerCase()) !== dependencyGroup.targetSourceId)) errors.push("dependencyGroup sources must be exact sourceRoots entries");
  }
  const partitions = policy?.partitions;
  const partitionIds = new Set();
  const assignedSourceIds = new Set();
  let partitionBytes = 0;
  if (!Array.isArray(partitions) || partitions.length !== SECOND_WAVE_PARTITION_COUNT) {
    errors.push(`partitions must contain exactly ${SECOND_WAVE_PARTITION_COUNT} entries`);
  } else {
    for (const [index, partition] of partitions.entries()) {
      if (typeof partition?.id !== "string" || partition.id.trim() === "") errors.push(`partitions[${index}].id must be non-empty`);
      const idKey = String(partition?.id ?? "").toLowerCase();
      if (partitionIds.has(idKey)) errors.push(`partitions has a case-insensitive duplicate id: ${partition.id}`);
      partitionIds.add(idKey);
      if (typeof partition?.name !== "string" || partition.name.trim() === "") errors.push(`partitions[${index}].name must be non-empty`);
      if (!Array.isArray(partition?.sourceIds) || partition.sourceIds.length === 0) {
        errors.push(`partitions[${index}].sourceIds must be a non-empty array`);
      } else {
        const localIds = new Set();
        for (const sourceId of partition.sourceIds) {
          if (typeof sourceId !== "string" || !sourceIds.has(sourceId)) {
            errors.push(`partitions[${index}] references an unknown source id: ${sourceId}`);
            continue;
          }
          const sourceKey = sourceId.toLowerCase();
          if (sourceIdsByLower.get(sourceKey) !== sourceId) errors.push(`partitions[${index}] must use canonical source id casing: ${sourceId}`);
          if (localIds.has(sourceKey)) errors.push(`partitions[${index}] has a duplicate source id: ${sourceId}`);
          if (assignedSourceIds.has(sourceKey)) errors.push(`source id is assigned to more than one partition: ${sourceId}`);
          localIds.add(sourceKey);
          assignedSourceIds.add(sourceKey);
          if (deferredIds.has(sourceKey)) errors.push(`deferred source cannot be included in an ordinary partition: ${sourceId}`);
        }
      }
      const bytesError = validateInteger(partition?.auditedObservedBytes, `partitions[${index}].auditedObservedBytes`, { min: 0 });
      if (bytesError !== null) errors.push(bytesError);
      else {
        partitionBytes += partition.auditedObservedBytes;
        if (partition.auditedObservedBytes >= SECOND_WAVE_MAX_BYTES) errors.push(`partitions[${index}].auditedObservedBytes must remain below limits.maxBytes`);
      }
    }
  }
  if (sourceIds.size === 45 && deferredIds.size === 2) {
    const expectedOrdinaryIds = new Set([...sourceIdsByLower.keys()].filter((key) => !deferredIds.has(key)));
    if (assignedSourceIds.size !== expectedOrdinaryIds.size || [...expectedOrdinaryIds].some((id) => !assignedSourceIds.has(id))) errors.push("partition union must contain exactly all non-deferred source ids");
    if (assignedSourceIds.size + deferredIds.size !== sourceIds.size) errors.push("partition union plus deferred sources must account for all 45 source ids");
  }
  if (partitionAudit?.ordinaryPartitionObservedBytes !== undefined && partitionBytes !== partitionAudit.ordinaryPartitionObservedBytes) errors.push("partition auditedObservedBytes must sum to partitionAudit.ordinaryPartitionObservedBytes");
  if (policy?.limits?.maxBytes !== SECOND_WAVE_MAX_BYTES) errors.push(`second-wave limits.maxBytes must remain ${SECOND_WAVE_MAX_BYTES}`);
  if (JSON.stringify(policy?.exclusions?.canonicalRoots) !== JSON.stringify(["Tear", "tear-score", "tear-wiki", "Tear-oracle"])) errors.push("exclusions.canonicalRoots must exclude all canonical roots");
  if (policy?.exclusions?.looseFiles !== "all" || policy?.exclusions?.unlistedDirectories !== "all" || policy?.exclusions?.unrelatedRoots !== "all") errors.push("second-wave exclusions must reject loose, unlisted, and unrelated roots");
  if (policy?.runtime?.operation !== "same-volume-whole-root-rename-only" || policy?.runtime?.copy !== false || policy?.runtime?.delete !== false || policy?.runtime?.overwrite !== false || policy?.runtime?.fetch !== false) errors.push("second-wave runtime must remain apply-only whole-root rename with no copy/delete/overwrite/fetch");
  if (policy?.compatibility?.reportFormat !== WORKSPACE_RECOVERY_REPORT_FORMAT || policy?.compatibility?.reportSchemaVersion !== 1) errors.push("second-wave report compatibility must remain v1");
  if (policy?.compatibility?.partitionBoundary?.mode !== SECOND_WAVE_PARTITION_BOUNDARY_MODE || policy?.compatibility?.partitionBoundary?.prePartitionEvidence !== SECOND_WAVE_PRE_PARTITION_EVIDENCE_STATUS || policy?.compatibility?.partitionBoundary?.successfulPriorArtifact !== SECOND_WAVE_SUCCESSFUL_PRIOR_ARTIFACT || policy?.compatibility?.partitionBoundary?.failedAllAtOnceReport !== SECOND_WAVE_FAILED_ALL_AT_ONCE_REPORT) errors.push("second-wave compatibility must reject pre-partition evidence and record that the failed all-at-once attempt produced no report");
  if (policy?.protected?.reparsePoints !== undefined && policy.protected.reparsePoints !== "refuse") errors.push("second-wave protected.reparsePoints must be refuse when supplied");
  if (!Array.isArray(policy?.protected?.segments) || !policy.protected.segments.includes(".git")) errors.push("second-wave protected.segments must include .git");
  if (!Array.isArray(policy?.protected?.namePatterns) || policy.protected.namePatterns.length === 0) errors.push("second-wave protected.namePatterns must not be empty");
  for (const [index, pattern] of (policy?.protected?.namePatterns ?? []).entries()) {
    try {
      new RegExp(pattern, "iu");
    } catch (error) {
      errors.push(`protected.namePatterns[${index}] is invalid: ${error.message}`);
    }
  }
  for (const field of [
    "maxSourceCandidates",
    "maxEntries",
    "maxBytes",
    "maxDepth",
    "maxPointerBytes",
    "maxSingleFileBytes",
    "maxPreservedManifestBytes",
  ]) {
    const error = validateInteger(policy?.limits?.[field], `limits.${field}`);
    if (error !== null) errors.push(error);
  }
  if (policy?.hash?.algorithm !== "sha256" || policy?.hash?.pathEncoding !== "relative-posix-v1") errors.push("second-wave hash contract must be sha256 relative-posix-v1");
  return errors;
}

export function readWorkspaceRecoveryPolicy(policyPath = DEFAULT_WORKSPACE_RECOVERY_POLICY_PATH) {
  const absolutePath = path.resolve(policyPath);
  try {
    const { parsed, raw } = readJsonFile(absolutePath, absolutePath);
    return {
      policy: parsed,
      scanPolicy: parsed,
      kind: "first-wave",
      errors: validateWorkspaceRecoveryPolicy(parsed),
      path: absolutePath,
      sha256: sha256Bytes(Buffer.from(raw, "utf8")),
    };
  } catch (error) {
    return { policy: null, errors: [error.message], path: absolutePath, sha256: null };
  }
}

export function readWorkspaceRecoverySecondWavePolicy(policyPath = DEFAULT_WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_PATH) {
  const absolutePath = path.resolve(policyPath);
  try {
    const { parsed, raw } = readJsonFile(absolutePath, absolutePath);
    const basePolicy = readWorkspaceRecoveryPolicy(DEFAULT_WORKSPACE_RECOVERY_POLICY_PATH);
    const errors = validateWorkspaceRecoverySecondWavePolicy(parsed);
    if (basePolicy.errors.length > 0) errors.push(...basePolicy.errors.map((error) => `base policy: ${error}`));
    return {
      policy: parsed,
      scanPolicy: basePolicy.policy,
      kind: "second-wave",
      errors,
      path: absolutePath,
      sha256: sha256Bytes(Buffer.from(raw, "utf8")),
      allowlistPath: absolutePath,
      allowlistSha256: sha256Bytes(Buffer.from(raw, "utf8")),
      basePolicyPath: basePolicy.path,
      basePolicySha256: basePolicy.sha256,
    };
  } catch (error) {
    return { policy: null, scanPolicy: null, kind: "second-wave", errors: [error.message], path: absolutePath, sha256: null, allowlistPath: absolutePath, allowlistSha256: null };
  }
}

export function readWorkspaceRecoveryPolicyBundle(policyPath = DEFAULT_WORKSPACE_RECOVERY_POLICY_PATH) {
  const absolutePath = path.resolve(policyPath);
  try {
    const { parsed } = readJsonFile(absolutePath, absolutePath);
    if (parsed?.format === WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT) return readWorkspaceRecoverySecondWavePolicy(absolutePath);
  } catch {
    // Preserve the canonical base-policy reader's detailed error below.
  }
  return readWorkspaceRecoveryPolicy(absolutePath);
}

export function legacyRootArgumentForSource(source) {
  return source?.id === "publication-copy" ? "temp-root" : "workspace-root";
}

export function rootArgumentForSource(source) {
  return typeof source?.rootArgument === "string" && source.rootArgument.trim() !== ""
    ? source.rootArgument
    : legacyRootArgumentForSource(source);
}

export function resolveWorkspaceRecoverySecondWavePartition(policy, partitionId) {
  if (!Array.isArray(policy?.partitions)) throw new WorkspaceRecoveryReportError("second-wave policy has no partition definitions");
  if (typeof partitionId !== "string" || partitionId.trim() === "") throw new WorkspaceRecoveryReportError("--partition is required when using the second-wave policy");
  const partition = policy.partitions.find((candidate) => candidate?.id === partitionId);
  if (partition === undefined) throw new WorkspaceRecoveryReportError(`unknown second-wave partition: ${partitionId}`);
  return partition;
}

function secondWavePartitionProvenance(policy, partition) {
  if (partition === null || partition === undefined) return null;
  return {
    id: partition.id,
    sourceIds: [...partition.sourceIds],
    auditedObservedBytes: partition.auditedObservedBytes,
    audit: {
      auditDateUtc: policy.partitionAudit.auditDateUtc,
      repositoryHead: policy.partitionAudit.repositoryHead,
      totalObservedBytes: policy.partitionAudit.totalObservedBytes,
      ordinaryPartitionObservedBytes: policy.partitionAudit.ordinaryPartitionObservedBytes,
      deferredObservedBytes: policy.partitionAudit.deferredObservedBytes,
    },
  };
}

function validateNoOverlap(roots) {
  const entries = Object.entries(roots);
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    const [leftName, leftRoot] = entries[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const [rightName, rightRoot] = entries[rightIndex];
      if (samePath(leftRoot, rightRoot) || isPathInside(leftRoot, rightRoot) || isPathInside(rightRoot, leftRoot)) {
        throw new WorkspaceRecoveryReportError(`${leftName} and ${rightName} roots overlap`);
      }
    }
  }
}

function assertDirectChild(parent, child, label) {
  if (!samePath(path.dirname(child), parent)) {
    throw new WorkspaceRecoveryReportError(`${label} must be a direct child of workspace-root: ${child}`);
  }
}

function assertCandidateRootsDisjoint(candidates, repositoryRoot, archiveRoot) {
  for (const candidate of candidates) {
    let comparableCandidate = candidate.candidate;
    try {
      comparableCandidate = fs.realpathSync.native(candidate.candidate);
    } catch {
      // The normal inspection below will record the candidate as refused.
    }
    for (const [label, root] of [["repo-root", repositoryRoot], ["archive-root", archiveRoot]]) {
      if (samePath(comparableCandidate, root) || isPathInside(root, comparableCandidate, { allowEqual: true }) || isPathInside(comparableCandidate, root, { allowEqual: true })) {
        throw new WorkspaceRecoveryReportError(`${candidate.name} candidate overlaps ${label}`);
      }
    }
  }
}

function resolveRepositoryIdentity(repoRoot) {
  const root = inspectCanonicalDirectory(repoRoot, "repo-root");
  const gitRoot = runGit(root, ["rev-parse", "--show-toplevel"]);
  if (!gitRoot.ok) throw new WorkspaceRecoveryReportError(gitFailure(gitRoot, "git rev-parse --show-toplevel"));
  const reportedRoot = path.resolve(gitRoot.stdout.trim());
  if (!samePath(root, reportedRoot)) throw new WorkspaceRecoveryReportError(`repo-root is not the canonical Git root: ${root}`);

  const origin = runGit(root, ["config", "--get", "remote.origin.url"]);
  const originIdentifier = origin.ok ? normalizeRepositoryIdentifier(origin.stdout.trim()) : "";
  if (!origin.ok || originIdentifier !== normalizeRepositoryIdentifier(RELEASE_REPOSITORY)) {
    throw new WorkspaceRecoveryReportError(`repo-root origin must identify ${RELEASE_REPOSITORY}; found ${originIdentifier || "missing"}`);
  }

  const status = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!status.ok) throw new WorkspaceRecoveryReportError(gitFailure(status, "git status"));
  if (status.stdout.trim() !== "") throw new WorkspaceRecoveryReportError(`repo-root must be clean; found ${status.stdout.trim()}`);

  const branch = runGit(root, ["branch", "--show-current"]);
  if (!branch.ok || branch.stdout.trim() !== "main") throw new WorkspaceRecoveryReportError(`repo-root must be on main, found ${branch.ok ? branch.stdout.trim() || "detached HEAD" : "unknown"}`);
  const upstream = runGit(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (!upstream.ok || upstream.stdout.trim() !== "origin/main") throw new WorkspaceRecoveryReportError(`main must track origin/main, found ${upstream.ok ? upstream.stdout.trim() || "none" : "none"}`);

  const headResult = runGit(root, ["rev-parse", "HEAD"]);
  const remoteResult = runGit(root, ["rev-parse", "origin/main"]);
  const head = headResult.ok ? headResult.stdout.trim().toLowerCase() : "";
  const remoteHead = remoteResult.ok ? remoteResult.stdout.trim().toLowerCase() : "";
  if (!headResult.ok || !GIT_OBJECT_PATTERN.test(head)) throw new WorkspaceRecoveryReportError(gitFailure(headResult, "git rev-parse HEAD"));
  if (!remoteResult.ok || !GIT_OBJECT_PATTERN.test(remoteHead)) throw new WorkspaceRecoveryReportError(gitFailure(remoteResult, "git rev-parse origin/main"));
  const equality = runGit(root, ["rev-list", "--left-right", "--count", "HEAD...origin/main"]);
  const counts = equality.stdout.trim().split(/\s+/u);
  if (!equality.ok || counts.length !== 2 || counts.some((value) => value !== "0") || head !== remoteHead) {
    throw new WorkspaceRecoveryReportError(`main must exactly equal origin/main (ahead=${counts[0] ?? "unknown"}, behind=${counts[1] ?? "unknown"})`);
  }

  const objectFormat = runGit(root, ["rev-parse", "--show-object-format"]);
  const reachable = loadReachableGitBlobs(root, head, objectFormat.ok ? objectFormat.stdout.trim() : "");
  return {
    root,
    repository: RELEASE_REPOSITORY,
    origin: originIdentifier,
    branch: "main",
    upstream: "origin/main",
    head,
    remoteHead,
    reachable,
  };
}

function loadReachableGitBlobs(root, head, objectFormat) {
  if (objectFormat !== "sha1") {
    return { status: "unavailable", reason: `unsupported-object-format:${objectFormat || "unknown"}`, objectFormat };
  }
  const history = runGit(root, ["rev-list", "--objects", "HEAD"]);
  if (!history.ok) return { status: "unavailable", reason: gitFailure(history, "git rev-list --objects"), objectFormat };
  const objectIds = new Set();
  const paths = new Map();
  for (const record of history.stdout.split(/\r?\n/u)) {
    if (record.trim() === "") continue;
    const separator = record.search(/\s/u);
    if (separator < 0) continue;
    const objectId = record.slice(0, separator);
    if (!GIT_OBJECT_PATTERN.test(objectId)) continue;
    objectIds.add(objectId);
    const relativePath = normalizeManifestPath(record.slice(separator).trim());
    if (relativePath !== null) paths.set(relativePath, objectId);
  }
  return {
    status: "available",
    objectFormat,
    reference: "HEAD-history",
    head,
    objectIds,
    paths,
  };
}

function makeHashState(stats, objectFormat) {
  const sha256 = createHash("sha256");
  const gitObject = objectFormat === "sha1" ? createHash("sha1") : null;
  if (gitObject !== null) gitObject.update(`blob ${stats.size}\0`, "utf8");
  return { sha256, gitObject };
}

function hashRegularFile(filePath, expectedStats, policy, objectFormat) {
  if (expectedStats.size > policy.limits.maxSingleFileBytes) {
    throw new WorkspaceRecoveryReportError(`file exceeds maxSingleFileBytes: ${filePath}`);
  }
  const descriptor = fs.openSync(filePath, "r");
  const state = makeHashState(expectedStats, objectFormat);
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_SIZE);
  let bytes = 0;
  try {
    const initial = fs.fstatSync(descriptor);
    if (!initial.isFile() || initial.size !== expectedStats.size || initial.mtimeMs !== expectedStats.mtimeMs) {
      throw new WorkspaceRecoveryReportError(`file changed before hashing: ${filePath}`);
    }
    let read;
    do {
      read = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (read > 0) {
        const chunk = buffer.subarray(0, read);
        state.sha256.update(chunk);
        state.gitObject?.update(chunk);
        bytes += read;
      }
    } while (read > 0);
    const finalStats = fs.fstatSync(descriptor);
    if (!finalStats.isFile() || finalStats.size !== expectedStats.size || finalStats.mtimeMs !== expectedStats.mtimeMs) {
      throw new WorkspaceRecoveryReportError(`file changed during hashing: ${filePath}`);
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return {
    bytes,
    sha256: state.sha256.digest("hex"),
    gitObjectId: state.gitObject === null ? null : state.gitObject.digest("hex"),
  };
}

function matchesSegmentPolicy(relativePath, policy) {
  const segments = normalizedPosixPath(relativePath).split("/");
  const protectedSegment = policy.protected.segments.find((segment) => segments.some((candidate) => candidate.toLowerCase() === segment.toLowerCase()));
  if (protectedSegment !== undefined) return { reason: "protected-segment", segment: protectedSegment };
  const protectedPattern = policy.protected.namePatterns.find((pattern) => segments.some((candidate) => new RegExp(pattern, "iu").test(candidate)));
  if (protectedPattern !== undefined) return { reason: "protected-name-pattern", pattern: protectedPattern };
  return null;
}

function pointerMetadata(pointerPath, policy) {
  let stats;
  try {
    stats = fs.lstatSync(pointerPath);
  } catch (error) {
    return { status: "unreadable", reason: error.code ?? "unknown" };
  }
  if (stats.isSymbolicLink()) return { status: "refused", reason: "symlink-or-reparse", bytes: null };
  if (stats.isDirectory()) return { status: "directory", bytes: null, target: null };
  if (!stats.isFile()) return { status: "unsupported", bytes: stats.size, target: null };
  const bytes = stats.size;
  if (bytes > policy.limits.maxPointerBytes) return { status: "refused", reason: "pointer-too-large", bytes, target: null };
  let text;
  const descriptor = fs.openSync(pointerPath, "r");
  try {
    const buffer = Buffer.alloc(policy.limits.maxPointerBytes + 1);
    const read = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    text = buffer.subarray(0, read).toString("utf8");
  } catch (error) {
    return { status: "unreadable", reason: error.code ?? "unknown", bytes, target: null };
  } finally {
    fs.closeSync(descriptor);
  }
  const match = text.match(/^gitdir:\s*(.+?)\s*$/imu);
  if (match === null) return { status: "invalid", bytes, target: null };
  const target = path.resolve(path.dirname(pointerPath), match[1]);
  let targetStats;
  try {
    targetStats = fs.lstatSync(target);
  } catch (error) {
    return { status: "invalid", bytes, target, targetExists: false, targetError: error.code ?? "unknown" };
  }
  if (targetStats.isSymbolicLink()) {
    return { status: "invalid", bytes, target, targetExists: true, targetKind: "symlink-or-reparse" };
  }
  return {
    status: targetStats.isDirectory() ? "valid-target" : "invalid",
    bytes,
    target,
    targetExists: true,
    targetKind: entryKind(targetStats),
  };
}

function makeEntry({ source, candidate, sourceRoot, inspection, decision, reasonCodes, hash = null, comparison = null, pointer = null }) {
  const relativePath = relativeManifestPath(sourceRoot, candidate);
  return {
    sourceId: source.id,
    sourceName: source.name,
    absolutePath: candidate,
    relativePath,
    kind: entryKind(inspection.stats),
    bytes: inspection.stats?.isFile() ? inspection.stats.size : null,
    timestamps: inspection.stats === null ? null : timestampRecord(inspection.stats),
    sha256: hash?.sha256 ?? null,
    decision,
    reasonCodes,
    comparison,
    gitPointer: pointer,
  };
}

function comparisonForFile({ relativePath, repo, hash, preservedHashes }) {
  const canonicalCandidate = path.resolve(repo.root, relativePath);
  const canonicalInspection = inspectPath(canonicalCandidate, repo.root);
  if (canonicalInspection.reason === null && canonicalInspection.stats?.isFile() && canonicalInspection.stats.size <= Number.MAX_SAFE_INTEGER) {
    try {
      const canonicalHash = hashRegularFile(canonicalCandidate, canonicalInspection.stats, {
        limits: { maxSingleFileBytes: Number.MAX_SAFE_INTEGER },
      }, null);
      if (canonicalHash.sha256 === hash.sha256) {
        return {
          status: "duplicate",
          tier: "canonical-same-relative-path",
          relativePath,
        };
      }
    } catch {
      // A changing or protected canonical comparison is not evidence of equality;
      // continue with the independent reachable-object and manifest tiers.
    }
  }

  if (repo.reachable.status === "available" && hash.gitObjectId !== null && repo.reachable.objectIds.has(hash.gitObjectId)) {
    const reachablePath = [...repo.reachable.paths.entries()].find(([, objectId]) => objectId === hash.gitObjectId)?.[0] ?? null;
    return {
      status: "duplicate",
      tier: "reachable-git-blob",
      reference: repo.reachable.reference,
      head: repo.reachable.head,
      relativePath: reachablePath,
    };
  }

  const preservedByPath = preservedHashes.byPath.get(relativePath);
  const preserved = preservedByPath?.sha256 === hash.sha256
    ? preservedByPath
    : preservedHashes.byHash.get(hash.sha256);
  if (preserved !== undefined) {
    return {
      status: "duplicate",
      tier: "preserved-manifest-sha256",
      manifest: preserved.manifest,
      relativePath: preserved.relativePath ?? null,
    };
  }
  return {
    status: "review",
    tier: "review-unknown-or-unique",
    reason: "no-approved-duplicate-match",
  };
}

function collectManifestPairs(value, manifestLabel, result, pathHint = "") {
  if (result.count > 100000) throw new WorkspaceRecoveryReportError(`preserved manifest exceeds entry limit: ${manifestLabel}`);
  if (Array.isArray(value)) {
    for (const child of value) collectManifestPairs(child, manifestLabel, result, pathHint);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const candidatePath = value.relativePath ?? value.repoRelativePath ?? value.path ?? value.name;
  const candidateHash = value.sha256 ?? value.hash;
  if (typeof candidatePath === "string" && typeof candidateHash === "string" && SHA256_PATTERN.test(candidateHash.toLowerCase())) {
    const relativePath = normalizeManifestPath(candidatePath);
    if (relativePath !== null) {
      const record = { manifest: manifestLabel, relativePath, sha256: candidateHash.toLowerCase() };
      const existingPath = result.byPath.get(relativePath);
      if (existingPath !== undefined && existingPath.sha256 !== record.sha256) {
        throw new WorkspaceRecoveryReportError(`preserved manifests disagree for ${relativePath}`);
      }
      result.byPath.set(relativePath, record);
      result.byHash.set(record.sha256, record);
      result.count += 1;
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "sha256" || key === "hash" || key === "relativePath" || key === "repoRelativePath" || key === "path" || key === "name") continue;
    collectManifestPairs(child, manifestLabel, result, `${pathHint}/${key}`);
  }
}

function loadPreservedManifests(manifestPaths, policy) {
  const result = { byPath: new Map(), byHash: new Map(), metadata: [], count: 0 };
  for (const manifestPath of manifestPaths) {
    const absolutePath = path.resolve(manifestPath);
    const inspection = inspectPath(absolutePath, path.dirname(absolutePath));
    if (inspection.reason !== null || inspection.stats === null || !inspection.stats.isFile()) {
      throw new WorkspaceRecoveryReportError(`preserved manifest must be a canonical file: ${absolutePath}`);
    }
    if (inspection.stats.size > policy.limits.maxPreservedManifestBytes) {
      throw new WorkspaceRecoveryReportError(`preserved manifest exceeds maxPreservedManifestBytes: ${absolutePath}`);
    }
    const { raw, parsed } = readJsonFile(absolutePath, absolutePath);
    const beforeCount = result.count;
    collectManifestPairs(parsed, absolutePath, result);
    result.metadata.push({
      absolutePath,
      bytes: inspection.stats.size,
      sha256: sha256Bytes(Buffer.from(raw, "utf8")),
      entries: result.count - beforeCount,
    });
  }
  return result;
}

function sourceRootEntry({ source, candidate, inspection, policy, repo, budget }) {
  const result = {
    id: source.id,
    name: source.name,
    rootArgument: rootArgumentForSource(source),
    absolutePath: candidate,
    rootKind: entryKind(inspection.stats),
    rootDecision: inspection.reason === null && inspection.stats?.isDirectory() ? "scanned" : "refused",
    rootReasonCodes: inspection.reason === null ? [] : [inspection.reason],
    entries: [],
    summary: {
      status: "no-go",
      scannedEntries: 0,
      fileEntries: 0,
      hashedEntries: 0,
      duplicateEntries: 0,
      reviewEntries: 0,
      protectedEntries: 0,
      refusedEntries: inspection.reason === null ? 0 : 1,
      observedBytes: 0,
      hashedBytes: 0,
    },
    gitPointer: null,
  };
  if (inspection.reason !== null || inspection.stats === null || !inspection.stats.isDirectory()) return result;

  const sourceRoot = inspection.realPath;
  const pointerPath = path.join(sourceRoot, ".git");
  let pointerInspection;
  try {
    pointerInspection = { stats: fs.lstatSync(pointerPath), reason: null };
  } catch {
    pointerInspection = { stats: null, reason: "missing" };
  }
  if (pointerInspection.stats !== null) result.gitPointer = pointerMetadata(pointerPath, policy);

  const manifestKeys = new Set();
  function pushEntry(entry) {
    const key = entry.relativePath.toLowerCase();
    if (manifestKeys.has(key)) throw new WorkspaceRecoveryReportError(`case-folded source path collision: ${entry.relativePath}`);
    manifestKeys.add(key);
    result.entries.push(entry);
    result.summary.scannedEntries += 1;
    budget.entries += 1;
    if (budget.entries > policy.limits.maxEntries) throw new WorkspaceRecoveryReportError(`report exceeds maxEntries ${policy.limits.maxEntries}`);
  }

  function accountBytes(bytes) {
    budget.bytes += bytes;
    if (budget.bytes > policy.limits.maxBytes) throw new WorkspaceRecoveryReportError(`report exceeds maxBytes ${policy.limits.maxBytes}`);
  }

  function visit(directory, depth) {
    if (depth > policy.limits.maxDepth) throw new WorkspaceRecoveryReportError(`report exceeds maxDepth ${policy.limits.maxDepth}: ${directory}`);
    let children;
    try {
      children = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      throw new WorkspaceRecoveryReportError(`cannot enumerate source ${directory}: ${error.message}`);
    }
    for (const child of children) {
      const candidate = path.join(directory, child.name);
      const inspection = inspectPath(candidate, sourceRoot);
      if (inspection.reason !== null || inspection.stats === null) {
        if (inspection.stats?.isFile()) accountBytes(inspection.stats.size);
        pushEntry(makeEntry({
          source,
          candidate,
          sourceRoot,
          inspection,
          decision: "refused",
          reasonCodes: [inspection.reason ?? "unreadable"],
        }));
        result.summary.refusedEntries += 1;
        continue;
      }
      const relativePath = relativeManifestPath(sourceRoot, candidate);
      const protectedMatch = matchesSegmentPolicy(relativePath, policy);
      if (protectedMatch !== null) {
        let pointer = null;
        if (relativePath.toLowerCase() === ".git" && inspection.stats.isFile()) pointer = pointerMetadata(candidate, policy);
        pushEntry(makeEntry({
          source,
          candidate,
          sourceRoot,
          inspection,
          decision: "protected",
          reasonCodes: [protectedMatch.reason, ...(relativePath.toLowerCase() === ".git" ? ["nested-git"] : [])],
          pointer,
        }));
        result.summary.protectedEntries += 1;
        if (inspection.stats.isFile()) {
          result.summary.observedBytes += inspection.stats.size;
          accountBytes(inspection.stats.size);
        }
        continue;
      }
      if (inspection.stats.isDirectory()) {
        visit(candidate, depth + 1);
        continue;
      }
      if (!inspection.stats.isFile()) {
        pushEntry(makeEntry({
          source,
          candidate,
          sourceRoot,
          inspection,
          decision: "refused",
          reasonCodes: ["unsupported-file-type"],
        }));
        result.summary.refusedEntries += 1;
        continue;
      }

      result.summary.fileEntries += 1;
      result.summary.observedBytes += inspection.stats.size;
      accountBytes(inspection.stats.size);
      if (inspection.stats.size > policy.limits.maxSingleFileBytes) {
        pushEntry(makeEntry({
          source,
          candidate,
          sourceRoot,
          inspection,
          decision: "review",
          reasonCodes: ["single-file-limit"],
        }));
        result.summary.reviewEntries += 1;
        continue;
      }

      let hash;
      try {
        hash = hashRegularFile(candidate, inspection.stats, policy, repo.reachable.objectFormat === "sha1" ? "sha1" : null);
      } catch {
        pushEntry(makeEntry({
          source,
          candidate,
          sourceRoot,
          inspection,
          decision: "refused",
          reasonCodes: ["changed-during-read"],
        }));
        result.summary.refusedEntries += 1;
        continue;
      }
      result.summary.hashedEntries += 1;
      result.summary.hashedBytes += hash.bytes;
      const comparison = comparisonForFile({
        candidate,
        relativePath,
        sourceRoot,
        repo,
        hash,
        preservedHashes,
      });
      const decision = comparison.status === "duplicate" ? "duplicate" : "review";
      pushEntry(makeEntry({
        source,
        candidate,
        sourceRoot,
        inspection,
        decision,
        reasonCodes: comparison.status === "duplicate" ? [] : ["unknown-or-unique"],
        hash,
        comparison,
      }));
      if (decision === "duplicate") result.summary.duplicateEntries += 1;
      else result.summary.reviewEntries += 1;
    }
  }

  const preservedHashes = repo.preservedHashes;
  visit(sourceRoot, 0);
  const hasHardStop = result.rootDecision !== "scanned"
    || result.summary.refusedEntries > 0
    || result.summary.reviewEntries > 0
    || result.summary.protectedEntries > 0;
  result.summary.status = hasHardStop ? "no-go" : "review";
  return result;
}

function discoverDirectCandidates(root, sourceId, policy) {
  let children;
  try {
    children = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    throw new WorkspaceRecoveryReportError(`cannot enumerate source parent ${root}: ${error.message}`);
  }
  const exactNames = sourceId === "receipt-copies"
    ? new Set(["tear-receipt-clean", "tear-receipt-clean2", "tear-receipt-clean3"])
    : null;
  const candidates = [];
  for (const child of children) {
    const lowerName = child.name.toLowerCase();
    const matches = sourceId === "invalid-gsm-worktrees"
      ? SOURCE_NAME_PATTERN.test(child.name)
      : exactNames?.has(lowerName) === true;
    if (matches) candidates.push({ id: sourceId, name: child.name, candidate: path.join(root, child.name) });
  }
  candidates.sort((left, right) => left.name.localeCompare(right.name));
  if (candidates.length > policy.limits.maxSourceCandidates) throw new WorkspaceRecoveryReportError(`source candidates exceed maxSourceCandidates ${policy.limits.maxSourceCandidates}`);
  return candidates;
}

function discoverPublicationCandidate(root) {
  const candidate = path.join(root, "Tear-main-publication");
  try {
    fs.lstatSync(candidate);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new WorkspaceRecoveryReportError(`cannot inspect publication candidate: ${error.message}`);
  }
  return [{ id: "publication-copy", name: "Tear-main-publication", candidate }];
}

function discoverSecondWaveCandidates(roots, policy, partition) {
  const candidates = [];
  const sourcesById = new Map(policy.sourceRoots.map((source) => [source.id, source]));
  const deferredIds = new Set(policy.deferredSources.map((source) => source.id));
  for (const sourceId of partition.sourceIds) {
    const source = sourcesById.get(sourceId);
    if (source === undefined) throw new WorkspaceRecoveryReportError(`second-wave partition references an unknown source: ${sourceId}`);
    if (deferredIds.has(source.id)) throw new WorkspaceRecoveryReportError(`deferred dependency source cannot be selected for an ordinary partition: ${source.name}`);
    if (SECOND_WAVE_CANONICAL_ROOT_NAMES.has(source.name.toLowerCase()) || SECOND_WAVE_ARCHIVE_ROOT_PATTERNS.some((pattern) => pattern.test(source.name))) {
      throw new WorkspaceRecoveryReportError(`exact second-wave source is a protected canonical/archive root: ${source.name}`);
    }
    const parent = source.rootArgument === "workspace-root" ? roots.workspaceRoot : roots.tempRoot;
    const candidate = path.join(parent, source.name);
    let stats;
    try {
      stats = fs.lstatSync(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") throw new WorkspaceRecoveryReportError(`cannot inspect exact second-wave source ${source.name}: ${error.message}`);
      stats = null;
    }
    if (stats?.isSymbolicLink()) throw new WorkspaceRecoveryReportError(`exact second-wave source is a symlink or reparse point: ${source.name}`);
    candidates.push({ id: source.id, name: source.name, rootArgument: source.rootArgument, candidate });
  }
  return candidates;
}

function inspectProtectedMetadata(roots, policy) {
  const records = [];
  const protectedPatterns = policy.protectedRoots.archiveNames;
  for (const [argumentName, root] of Object.entries(roots)) {
    if (argumentName === "archiveRoot") {
      records.push({
        argument: argumentName,
        name: path.basename(root),
        absolutePath: root,
        kind: "directory",
        status: "protected-metadata-only",
        reasonCodes: ["archive-root"],
      });
    }
    let children;
    try {
      children = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!protectedPatterns.some((pattern) => child.name.toLowerCase().startsWith(pattern.toLowerCase()))) continue;
      const candidate = path.join(root, child.name);
      const inspection = inspectPath(candidate, root);
      records.push({
        argument: argumentName,
        name: child.name,
        absolutePath: candidate,
        kind: entryKind(inspection.stats),
        status: "protected-metadata-only",
        reasonCodes: [inspection.reason ?? "protected-name"],
      });
    }
  }
  return records;
}

function parseRetainUntil(value, nowMs) {
  if (typeof value !== "string" || value.trim() === "") throw new WorkspaceRecoveryReportError("retain-until must be an ISO timestamp");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new WorkspaceRecoveryReportError("retain-until must be a valid timestamp");
  if (date.getTime() <= nowMs) throw new WorkspaceRecoveryReportError("retain-until must be in the future");
  return date.toISOString();
}

function assertOutputPathSafe(outputPath, archiveRoot, repoRoot, candidateRoots) {
  if (archiveRoot === undefined || repoRoot === undefined || candidateRoots === undefined) {
    throw new WorkspaceRecoveryReportError("archiveRoot, repoRoot, and candidateRoots are required for output validation");
  }
  const absoluteOutput = path.resolve(outputPath);
  if (!absoluteOutput.toLowerCase().endsWith(".json")) throw new WorkspaceRecoveryReportError("output must end with .json");
  if (!isPathInside(archiveRoot, absoluteOutput)) throw new WorkspaceRecoveryReportError("output must be inside archive-root");
  for (const [label, root] of Object.entries({ repoRoot, ...candidateRoots })) {
    if (isPathInside(root, absoluteOutput, { allowEqual: true })) throw new WorkspaceRecoveryReportError(`output must be outside ${label}`);
  }
  const relativeToArchive = path.relative(archiveRoot, absoluteOutput);
  const segments = relativeToArchive.split(path.sep);
  if (segments.length < 2 || !RECOVERY_GROUP_PATTERN.test(segments[0])) {
    throw new WorkspaceRecoveryReportError("output must be under an existing dated g5 recovery group");
  }
  let existingOutput;
  try {
    existingOutput = fs.lstatSync(absoluteOutput);
  } catch (error) {
    if (error.code !== "ENOENT") throw new WorkspaceRecoveryReportError(`could not inspect output: ${error.message}`);
  }
  if (existingOutput !== undefined) throw new WorkspaceRecoveryReportError(`output already exists; refusing overwrite: ${absoluteOutput}`);
  const parent = path.dirname(absoluteOutput);
  const parentInspection = inspectPath(parent, archiveRoot);
  if (parentInspection.reason !== null || parentInspection.stats === null || !parentInspection.stats.isDirectory()) {
    throw new WorkspaceRecoveryReportError(`output parent must be an existing canonical directory: ${parent}`);
  }
  return absoluteOutput;
}

export function writeWorkspaceRecoveryReport(outputPath, report, { archiveRoot, repoRoot, candidateRoots, sourceRoots } = {}) {
  const roots = candidateRoots ?? sourceRoots;
  const absoluteOutput = assertOutputPathSafe(outputPath, path.resolve(archiveRoot), path.resolve(repoRoot), roots);
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  try {
    fs.writeFileSync(absoluteOutput, payload, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    throw new WorkspaceRecoveryReportError(`could not write report without overwrite: ${error.message}`);
  }
  return absoluteOutput;
}

function summarizeReport(report) {
  return {
    format: report.format,
    schemaVersion: report.schemaVersion,
    repository: report.repository,
    head: report.repositoryState.head,
    generatedAtUtc: report.generatedAtUtc,
    owner: report.owner,
    retainUntilUtc: report.retainUntilUtc,
    status: report.summary.status,
    summary: report.summary,
    sources: report.sources.map((source) => ({
      id: source.id,
      name: source.name,
      rootDecision: source.rootDecision,
      summary: source.summary,
    })),
    protectedRootCount: report.protectedRoots.length,
    preservedManifestCount: report.preservedManifests.length,
    quarantine: report.quarantine,
  };
}

export function runWorkspaceRecoveryReport(options = {}) {
  const {
    repoRoot,
    workspaceRoot,
    tempRoot,
    archiveRoot,
    owner,
    retainUntil,
    outputPath,
    preservedManifestPaths = [],
    policyPath = DEFAULT_WORKSPACE_RECOVERY_POLICY_PATH,
    partition,
    policy: suppliedPolicy,
    now = new Date(),
  } = options;
  if (!Array.isArray(preservedManifestPaths)) throw new WorkspaceRecoveryReportError("preservedManifestPaths must be an array");
  for (const field of ["repoRoot", "workspaceRoot", "tempRoot", "archiveRoot", "owner", "retainUntil"]) {
    if (typeof options[field] === "undefined" || options[field] === null || String(options[field]).trim() === "") {
      throw new WorkspaceRecoveryReportError(`${field} is required`);
    }
  }
  const loaded = suppliedPolicy === undefined ? readWorkspaceRecoveryPolicyBundle(policyPath) : {
    policy: suppliedPolicy,
    scanPolicy: suppliedPolicy?.format === WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT
      ? readWorkspaceRecoveryPolicy(DEFAULT_WORKSPACE_RECOVERY_POLICY_PATH).policy
      : suppliedPolicy,
    kind: suppliedPolicy?.format === WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT ? "second-wave" : "first-wave",
    errors: suppliedPolicy?.format === WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT
      ? validateWorkspaceRecoverySecondWavePolicy(suppliedPolicy)
      : validateWorkspaceRecoveryPolicy(suppliedPolicy),
    path: path.resolve(policyPath),
    sha256: sha256Bytes(Buffer.from(JSON.stringify(suppliedPolicy), "utf8")),
    allowlistPath: suppliedPolicy?.format === WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT ? path.resolve(policyPath) : undefined,
    allowlistSha256: suppliedPolicy?.format === WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT ? sha256Bytes(Buffer.from(JSON.stringify(suppliedPolicy), "utf8")) : undefined,
  };
  if (loaded.errors.length > 0) throw new WorkspaceRecoveryReportError(`workspace recovery policy is invalid:\n- ${loaded.errors.join("\n- ")}`);
  if (loaded.kind === "first-wave" && partition !== undefined) throw new WorkspaceRecoveryReportError("first-wave policy does not accept --partition");
  const selectedPartition = loaded.kind === "second-wave" ? resolveWorkspaceRecoverySecondWavePartition(loaded.policy, partition) : null;
  const policy = loaded.scanPolicy ?? loaded.policy;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new WorkspaceRecoveryReportError("now must be a valid date");
  const retainUntilUtc = parseRetainUntil(retainUntil, nowMs);
  if (loaded.kind === "second-wave" && new Date(retainUntilUtc).getTime() < new Date(loaded.policy.retention.minimumUtc).getTime()) {
    throw new WorkspaceRecoveryReportError(`second-wave retain-until must be on or after ${loaded.policy.retention.minimumUtc}`);
  }
  if (typeof owner !== "string" || owner.trim() === "") throw new WorkspaceRecoveryReportError("owner must be a non-empty identifier");

  const repositoryState = resolveRepositoryIdentity(repoRoot);
  const roots = {
    workspaceRoot: inspectCanonicalDirectory(workspaceRoot, "workspace-root"),
    tempRoot: inspectCanonicalDirectory(tempRoot, "temp-root"),
    archiveRoot: inspectCanonicalDirectory(archiveRoot, "archive-root"),
  };
  assertDirectChild(roots.workspaceRoot, repositoryState.root, "repo-root");
  assertDirectChild(roots.workspaceRoot, roots.archiveRoot, "archive-root");
  validateNoOverlap({ repoRoot: repositoryState.root, archiveRoot: roots.archiveRoot });
  if (samePath(roots.workspaceRoot, roots.tempRoot) || isPathInside(roots.workspaceRoot, roots.tempRoot, { allowEqual: true }) || isPathInside(roots.tempRoot, roots.workspaceRoot, { allowEqual: true })) {
    throw new WorkspaceRecoveryReportError("temp-root must be disjoint from workspace-root");
  }

  const candidates = loaded.kind === "second-wave"
    ? discoverSecondWaveCandidates(roots, loaded.policy, selectedPartition)
    : [
      ...discoverDirectCandidates(roots.workspaceRoot, "invalid-gsm-worktrees", policy),
      ...discoverDirectCandidates(roots.workspaceRoot, "receipt-copies", policy),
      ...discoverPublicationCandidate(roots.tempRoot),
    ];
  if (candidates.length > policy.limits.maxSourceCandidates) throw new WorkspaceRecoveryReportError(`source candidates exceed maxSourceCandidates ${policy.limits.maxSourceCandidates}`);
  assertCandidateRootsDisjoint(candidates, repositoryState.root, roots.archiveRoot);
  const candidateRoots = Object.fromEntries(candidates.map((candidate, index) => [`candidate-${index}`, candidate.candidate]));
  if (outputPath !== undefined) assertOutputPathSafe(outputPath, roots.archiveRoot, repositoryState.root, candidateRoots);

  for (const manifestPath of preservedManifestPaths) {
    const absoluteManifest = path.resolve(manifestPath);
    if (isPathInside(repositoryState.root, absoluteManifest, { allowEqual: true })) throw new WorkspaceRecoveryReportError("preserved manifests must be outside repo-root");
    if (isPathInside(roots.tempRoot, absoluteManifest, { allowEqual: true })) throw new WorkspaceRecoveryReportError("preserved manifests must be outside temp-root");
    for (const [label, candidateRoot] of Object.entries(candidateRoots)) {
      if (isPathInside(candidateRoot, absoluteManifest, { allowEqual: true })) throw new WorkspaceRecoveryReportError(`preserved manifests must be outside ${label}`);
    }
  }

  const preservedHashes = loadPreservedManifests(preservedManifestPaths, policy);
  const repo = { ...repositoryState, preservedHashes };
  const budget = { entries: 0, bytes: 0 };
  const sources = candidates.map((source) => {
    const rootArgument = rootArgumentForSource(source);
    const sourceParent = rootArgument === "temp-root" ? roots.tempRoot : roots.workspaceRoot;
    const inspection = inspectPath(source.candidate, sourceParent);
    return sourceRootEntry({ source, candidate: source.candidate, inspection, policy, repo, budget });
  });
  const summary = {
    status: sources.some((source) => source.summary.status === "no-go") ? "no-go" : "review",
    discoveredSources: sources.length,
    scannedEntries: sources.reduce((total, source) => total + source.summary.scannedEntries, 0),
    fileEntries: sources.reduce((total, source) => total + source.summary.fileEntries, 0),
    hashedEntries: sources.reduce((total, source) => total + source.summary.hashedEntries, 0),
    duplicateEntries: sources.reduce((total, source) => total + source.summary.duplicateEntries, 0),
    reviewEntries: sources.reduce((total, source) => total + source.summary.reviewEntries, 0),
    protectedEntries: sources.reduce((total, source) => total + source.summary.protectedEntries, 0),
    refusedEntries: sources.reduce((total, source) => total + source.summary.refusedEntries, 0),
    observedBytes: sources.reduce((total, source) => total + source.summary.observedBytes, 0),
    hashedBytes: sources.reduce((total, source) => total + source.summary.hashedBytes, 0),
    quarantineEligibleEntries: 0,
  };
  const report = {
    format: WORKSPACE_RECOVERY_REPORT_FORMAT,
    schemaVersion: 1,
    kind: "report-only-selection",
    repository: RELEASE_REPOSITORY,
    policySha256: loaded.sha256,
    generatedAtUtc: formatUtc(nowMs),
    owner: owner.trim(),
    retainUntilUtc,
    repositoryState: {
      canonicalPath: repositoryState.root,
      origin: repositoryState.origin,
      branch: repositoryState.branch,
      upstream: repositoryState.upstream,
      head: repositoryState.head,
      originMain: repositoryState.remoteHead,
      reachableGit: {
        status: repositoryState.reachable.status,
        objectFormat: repositoryState.reachable.objectFormat,
        reference: repositoryState.reachable.reference,
        head: repositoryState.reachable.head,
        reason: repositoryState.reachable.reason,
      },
    },
    inputs: {
      workspaceRoot: roots.workspaceRoot,
      tempRoot: roots.tempRoot,
      archiveRoot: roots.archiveRoot,
      rootArguments: {
        "workspace-root": roots.workspaceRoot,
        "temp-root": roots.tempRoot,
        "archive-root": roots.archiveRoot,
      },
      candidateRoots: sources.map((source) => source.absolutePath),
      ...(loaded.kind === "second-wave" ? {
        allowlist: {
          format: WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT,
          path: loaded.allowlistPath ?? loaded.path,
          sha256: loaded.allowlistSha256 ?? loaded.sha256,
        },
        partition: secondWavePartitionProvenance(loaded.policy, selectedPartition),
      } : {}),
    },
    protectedRoots: inspectProtectedMetadata({ workspaceRoot: roots.workspaceRoot, tempRoot: roots.tempRoot, archiveRoot: roots.archiveRoot }, policy),
    preservedManifests: preservedHashes.metadata,
    sources,
    summary,
    quarantine: {
      status: "deferred",
      eligibility: "never-emitted-by-this-reporter",
      futureReviewRequired: true,
    },
    restoreGuidance: {
      status: "report-only",
      instructions: [
        "This report performs no move, quarantine, deletion, or archive-directory creation.",
        "No entry in this report is quarantine-eligible; review and a separate immutable recovery manifest are required.",
        "Any future restore must verify the recorded SHA-256, timestamps, owner, retention date, and exact relative path before a reversible operation.",
      ],
    },
  };
  return report;
}

function parseArguments(argumentsList) {
  const options = { summaryOnly: false, preservedManifestPaths: [] };
  const seenSingletons = new Set();
  const valueFlags = new Map([
    ["--repo-root", "repoRoot"],
    ["--workspace-root", "workspaceRoot"],
    ["--temp-root", "tempRoot"],
    ["--archive-root", "archiveRoot"],
    ["--policy", "policyPath"],
    ["--partition", "partition"],
    ["--owner", "owner"],
    ["--retain-until", "retainUntil"],
    ["--output", "outputPath"],
  ]);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      if (seenSingletons.has(argument)) throw new WorkspaceRecoveryReportError(`duplicate argument: ${argument}`);
      seenSingletons.add(argument);
      options.help = true;
      continue;
    }
    if (argument === "--summary-only") {
      if (seenSingletons.has(argument)) throw new WorkspaceRecoveryReportError(`duplicate argument: ${argument}`);
      seenSingletons.add(argument);
      options.summaryOnly = true;
      continue;
    }
    if (argument === "--preserved-manifest") {
      const value = argumentsList[++index];
      if (value === undefined || value.startsWith("--")) throw new WorkspaceRecoveryReportError("--preserved-manifest requires a value");
      options.preservedManifestPaths.push(path.resolve(value));
      continue;
    }
    const optionName = valueFlags.get(argument);
    if (optionName === undefined) throw new WorkspaceRecoveryReportError(`unknown argument: ${argument}`);
    if (seenSingletons.has(argument)) throw new WorkspaceRecoveryReportError(`duplicate argument: ${argument}`);
    seenSingletons.add(argument);
    const value = argumentsList[++index];
    if (value === undefined || value.startsWith("--")) throw new WorkspaceRecoveryReportError(`${argument} requires a value`);
    options[optionName] = ["repoRoot", "workspaceRoot", "tempRoot", "archiveRoot", "policyPath", "outputPath"].includes(optionName) ? path.resolve(value) : value;
  }
  if (options.help) return options;
  for (const field of ["repoRoot", "workspaceRoot", "tempRoot", "archiveRoot", "owner", "retainUntil"]) {
    if (options[field] === undefined) throw new WorkspaceRecoveryReportError(`--${field.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`)} is required`);
  }
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/report-workspace-recovery.mjs --repo-root <repo> --workspace-root <dir> --temp-root <dir> --archive-root <dir> --owner <id> --retain-until <UTC> [--policy <policy.json>] [--partition <id>] [--output <new-report.json>] [--summary-only] [--preserved-manifest <manifest.json>]");
      return;
    }
    const report = runWorkspaceRecoveryReport(options);
    if (options.outputPath !== undefined) {
      writeWorkspaceRecoveryReport(options.outputPath, report, {
        archiveRoot: report.inputs.archiveRoot,
        repoRoot: report.repositoryState.canonicalPath,
        candidateRoots: Object.fromEntries(report.inputs.candidateRoots.map((candidateRoot, index) => [`candidate-${index}`, candidateRoot])),
      });
    }
    console.log(JSON.stringify(options.summaryOnly ? summarizeReport(report) : report, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === path.resolve(import.meta.filename)) main();
