import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { RELEASE_REPOSITORY } from "./release-artifact.mjs";
import { normalizeRepositoryIdentifier } from "./repository-identity.mjs";
import {
  readWorkspaceRecoveryPolicyBundle,
  resolveWorkspaceRecoverySecondWavePartition,
  rootArgumentForSource,
  WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT,
  WORKSPACE_RECOVERY_REPORT_FORMAT,
} from "./report-workspace-recovery.mjs";

export const WORKSPACE_QUARANTINE_MANIFEST_FORMAT = "tear-workspace-quarantine-manifest";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const GIT_OBJECT_PATTERN = /^[0-9a-f]{40,64}$/u;
const RECOVERY_GROUP_PATTERN = /^\d{4}-\d{2}-\d{2}-g5-[a-z0-9-]+$/u;
const SOURCE_NAME_PATTERN = /^gsm-[^\\/]+$/iu;
const RECEIPT_NAMES = new Set(["tear-receipt-clean", "tear-receipt-clean2", "tear-receipt-clean3"]);
const HASH_CHUNK_SIZE = 1024 * 1024;
const MAX_REPORT_BYTES = 128 * 1024 * 1024;

export class WorkspaceQuarantineManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspaceQuarantineManifestError";
  }
}

function fail(message) {
  throw new WorkspaceQuarantineManifestError(message);
}

function comparablePath(value) {
  if (typeof value !== "string") return null;
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  const comparableLeft = comparablePath(left);
  const comparableRight = comparablePath(right);
  return comparableLeft !== null && comparableLeft === comparableRight;
}

function isPathInside(root, candidate, { allowEqual = false } = {}) {
  const relative = path.relative(root, candidate);
  if (relative === "") return allowEqual;
  return relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function normalizedPosixPath(value) {
  return String(value).replaceAll("\\", "/");
}

function safeRelativePath(value, label = "relative path") {
  const normalized = normalizedPosixPath(value);
  if (
    normalized === ""
    || normalized.startsWith("/")
    || /^[A-Za-z]:/u.test(normalized)
    || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) fail(`${label} is unsafe: ${value}`);
  return normalized;
}

function timestampUtc(milliseconds) {
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) fail("filesystem timestamp is invalid");
  return date.toISOString();
}

function inspectCanonical(candidate, label, expectedKind = undefined) {
  const absolute = path.resolve(candidate);
  let stats;
  try {
    stats = fs.lstatSync(absolute);
  } catch (error) {
    fail(`${label} is missing or unreadable: ${absolute} (${error.code ?? error.message})`);
  }
  if (stats.isSymbolicLink()) fail(`${label} is a symlink or reparse point: ${absolute}`);
  let realPath;
  try {
    realPath = fs.realpathSync.native(absolute);
  } catch (error) {
    fail(`${label} is not a resolvable canonical path: ${absolute} (${error.code ?? error.message})`);
  }
  if (!samePath(absolute, realPath)) fail(`${label} is a symlink or reparse point: ${absolute}`);
  if (expectedKind === "directory" && !stats.isDirectory()) fail(`${label} must be a directory: ${absolute}`);
  if (expectedKind === "file" && !stats.isFile()) fail(`${label} must be a regular file: ${absolute}`);
  return { path: absolute, realPath, stats };
}

function inspectAbsent(candidate, label) {
  const absolute = path.resolve(candidate);
  try {
    const stats = fs.lstatSync(absolute);
    fail(`${label} already exists; refusing overwrite or replacement: ${absolute} (${stats.isSymbolicLink() ? "symlink/reparse" : "path exists"})`);
  } catch (error) {
    if (error instanceof WorkspaceQuarantineManifestError) throw error;
    if (error.code !== "ENOENT") fail(`${label} could not be inspected: ${absolute} (${error.code ?? error.message})`);
  }
  return absolute;
}

function assertNoOverlap(label, candidate, roots) {
  for (const [rootLabel, root] of Object.entries(roots)) {
    if (samePath(candidate, root) || isPathInside(root, candidate, { allowEqual: true }) || isPathInside(candidate, root, { allowEqual: true })) {
      fail(`${label} overlaps ${rootLabel}`);
    }
  }
}

function sameVolume(left, right) {
  return samePath(path.parse(path.resolve(left)).root, path.parse(path.resolve(right)).root);
}

function runGit(root, argumentsList) {
  const result = spawnSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: "pipe",
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function gitValue(root, argumentsList, label) {
  const result = runGit(root, argumentsList);
  if (!result.ok) fail(`${label} failed: ${(result.error?.message || result.stderr || result.stdout || "unknown error").trim()}`);
  return result.stdout.trim();
}

function validateHash(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value.toLowerCase())) fail(`${label} must be a SHA-256 hex digest`);
  return value.toLowerCase();
}

function readReport(reportPath, expectedSha256) {
  const inspection = inspectCanonical(reportPath, "report", "file");
  if (inspection.stats.size > MAX_REPORT_BYTES) fail(`report exceeds the bounded size limit: ${reportPath}`);
  const raw = fs.readFileSync(inspection.path);
  const actualSha256 = createHash("sha256").update(raw).digest("hex");
  if (actualSha256 !== validateHash(expectedSha256, "report SHA-256")) fail("report SHA-256 does not match the supplied evidence");
  let report;
  try {
    report = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    fail(`report is not valid JSON: ${error.message}`);
  }
  if (report?.format !== WORKSPACE_RECOVERY_REPORT_FORMAT || report?.schemaVersion !== 1) {
    fail(`report must use ${WORKSPACE_RECOVERY_REPORT_FORMAT} schemaVersion 1`);
  }
  return { report, reportSha256: actualSha256, path: inspection.path };
}

function verifyRepository(repoRoot, reportState) {
  const inspection = inspectCanonical(repoRoot, "repo-root", "directory");
  const reportedRoot = path.resolve(gitValue(inspection.path, ["rev-parse", "--show-toplevel"], "git root"));
  if (!samePath(inspection.path, reportedRoot)) fail("repo-root is not the canonical Git root");
  const originRaw = gitValue(inspection.path, ["config", "--get", "remote.origin.url"], "git origin");
  const origin = normalizeRepositoryIdentifier(originRaw);
  if (origin !== normalizeRepositoryIdentifier(RELEASE_REPOSITORY)) fail(`repo-root origin must identify ${RELEASE_REPOSITORY}`);
  if (gitValue(inspection.path, ["status", "--porcelain=v1", "--untracked-files=all"], "git status") !== "") fail("repo-root must be clean");
  if (gitValue(inspection.path, ["branch", "--show-current"], "git branch") !== "main") fail("repo-root must be on main");
  if (gitValue(inspection.path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "git upstream") !== "origin/main") fail("main must track origin/main");
  const head = gitValue(inspection.path, ["rev-parse", "HEAD"], "git HEAD").toLowerCase();
  const originMain = gitValue(inspection.path, ["rev-parse", "origin/main"], "git origin/main").toLowerCase();
  if (!GIT_OBJECT_PATTERN.test(head) || !GIT_OBJECT_PATTERN.test(originMain) || head !== originMain) fail("main must exactly equal origin/main");
  const counts = gitValue(inspection.path, ["rev-list", "--left-right", "--count", "HEAD...origin/main"], "git divergence").split(/\s+/u);
  if (counts.length !== 2 || counts.some((value) => value !== "0")) fail("main must exactly equal origin/main");
  const expected = reportState;
  if (typeof expected?.canonicalPath !== "string" || !samePath(expected.canonicalPath, inspection.path)) fail("report repository canonical path does not match supplied repo-root");
  if (normalizeRepositoryIdentifier(expected.origin) !== origin || expected.branch !== "main" || expected.upstream !== "origin/main") {
    fail("report repository identity does not match the clean canonical main");
  }
  if (String(expected.head).toLowerCase() !== head || String(expected.originMain).toLowerCase() !== originMain) fail("report head does not match current exact origin/main");
  return { ...inspection, origin, head, originMain };
}

function parseRetention(value, now) {
  if (typeof value !== "string" || value.trim() === "") fail("retain-until must be an ISO timestamp");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail("retain-until must be a valid timestamp");
  if (date.getTime() <= now.getTime()) fail("retain-until must be in the future");
  return date.toISOString();
}

function assertRootLayout(report, repoRoot, reportPath) {
  const inputs = report.inputs;
  if (!inputs || typeof inputs !== "object" || !Array.isArray(inputs.candidateRoots)) fail("report inputs are incomplete");
  const workspace = inspectCanonical(inputs.workspaceRoot, "workspace-root", "directory");
  const temp = inspectCanonical(inputs.tempRoot, "temp-root", "directory");
  const archive = inspectCanonical(inputs.archiveRoot, "archive-root", "directory");
  const repo = path.resolve(repoRoot);
  if (!samePath(report.repositoryState?.canonicalPath, repo)) fail("report repo-root does not match supplied repo-root");
  if (!samePath(path.dirname(repo), workspace.path)) fail("repo-root must be a direct child of workspace-root");
  if (!samePath(path.dirname(archive.path), workspace.path)) fail("archive-root must be a direct child of workspace-root");
  if (samePath(workspace.path, temp.path) || isPathInside(workspace.path, temp.path, { allowEqual: true }) || isPathInside(temp.path, workspace.path, { allowEqual: true })) fail("temp-root must be disjoint from workspace-root");
  if (samePath(repo, archive.path) || isPathInside(repo, archive.path, { allowEqual: true }) || isPathInside(archive.path, repo, { allowEqual: true })) fail("repo-root and archive-root overlap");
  if (inputs.rootArguments !== undefined) {
    if (typeof inputs.rootArguments !== "object" || inputs.rootArguments === null) fail("report rootArguments must be an object");
    for (const [argument, expected] of [["workspace-root", workspace.path], ["temp-root", temp.path], ["archive-root", archive.path]]) {
      if (!samePath(inputs.rootArguments[argument], expected)) fail(`report rootArguments.${argument} does not match its canonical root`);
    }
  }
  const reportInspection = inspectCanonical(reportPath, "report", "file");
  if (!isPathInside(archive.path, reportInspection.path)) fail("report must be inside archive-root");
  const reportRelative = path.relative(archive.path, reportInspection.path).split(path.sep);
  if (reportRelative.length < 2 || !RECOVERY_GROUP_PATTERN.test(reportRelative[0])) fail("report must be under an existing dated g5 recovery group");
  const group = inspectCanonical(path.join(archive.path, reportRelative[0]), "recovery group", "directory");
  return { workspace, temp, archive, group };
}

function sourceKindAllowed(source, sourcePath, roots, policyBundle) {
  const rootArgument = rootArgumentForSource(source);
  const expectedParent = rootArgument === "temp-root" ? roots.temp.path : rootArgument === "workspace-root" ? roots.workspace.path : null;
  if (expectedParent === null || !samePath(path.dirname(sourcePath), expectedParent)) return false;
  if (policyBundle.kind === "second-wave") {
    const allowlisted = policyBundle.policy.sourceRoots.find((candidate) => candidate.id === source.id && candidate.name === source.name);
    return allowlisted !== undefined && allowlisted.rootArgument === rootArgument;
  }
  if (source.id === "publication-copy") return path.basename(sourcePath).toLowerCase() === "tear-main-publication";
  if (source.id === "invalid-gsm-worktrees") return SOURCE_NAME_PATTERN.test(path.basename(sourcePath));
  if (source.id === "receipt-copies") return RECEIPT_NAMES.has(path.basename(sourcePath).toLowerCase());
  return false;
}

export function validateSecondWavePartitionRecord(policyBundle, record, label) {
  if (policyBundle.kind !== "second-wave") return null;
  if (record === null || typeof record !== "object") fail(`${label} must carry second-wave partition provenance`);
  let partition;
  try {
    partition = resolveWorkspaceRecoverySecondWavePartition(policyBundle.policy, record.id);
  } catch (error) {
    fail(`${label} is invalid: ${error.message}`);
  }
  if (!Array.isArray(record.sourceIds) || record.sourceIds.length !== partition.sourceIds.length || record.sourceIds.some((sourceId, index) => sourceId !== partition.sourceIds[index])) {
    fail(`${label} source IDs do not match partition ${partition.id}`);
  }
  if (record.auditedObservedBytes !== partition.auditedObservedBytes) fail(`${label} audited bytes do not match partition ${partition.id}`);
  const audit = record.audit;
  const expectedAudit = policyBundle.policy.partitionAudit;
  if (audit === null || typeof audit !== "object" || audit.auditDateUtc !== expectedAudit.auditDateUtc || audit.repositoryHead !== expectedAudit.repositoryHead || audit.totalObservedBytes !== expectedAudit.totalObservedBytes || audit.ordinaryPartitionObservedBytes !== expectedAudit.ordinaryPartitionObservedBytes || audit.deferredObservedBytes !== expectedAudit.deferredObservedBytes) {
    fail(`${label} audit provenance does not match the current policy`);
  }
  return partition;
}

function verifySources(report, roots, policyBundle) {
  const sources = report.sources;
  if (!Array.isArray(sources)) fail("report sources are incomplete");
  const candidateRoots = report.inputs.candidateRoots.map((value) => path.resolve(value));
  if (new Set(candidateRoots.map(comparablePath)).size !== candidateRoots.length || candidateRoots.length !== sources.length) fail("report candidate roots are not an exact unique source set");
  const seen = new Set();
  const verified = [];
  const selectedPartition = policyBundle.kind === "second-wave"
    ? validateSecondWavePartitionRecord(policyBundle, report.inputs?.partition, "report.inputs.partition")
    : null;
  for (const source of sources) {
    if (!source || typeof source !== "object" || typeof source.id !== "string" || typeof source.name !== "string") fail("report contains an invalid source record");
    const rootArgument = rootArgumentForSource(source);
    if (!['workspace-root', 'temp-root'].includes(rootArgument)) fail(`source has an invalid rootArgument: ${source.name}`);
    const sourcePath = path.resolve(source.absolutePath ?? "");
    const candidateIndex = candidateRoots.findIndex((candidate) => samePath(candidate, sourcePath));
    if (candidateIndex < 0 || seen.has(comparablePath(sourcePath))) fail(`source root is not an exact report candidate: ${sourcePath}`);
    seen.add(comparablePath(sourcePath));
    const inspection = inspectCanonical(sourcePath, `source ${source.name}`, "directory");
    if (policyBundle.kind === "second-wave" && source.rootArgument !== rootArgument) fail(`source rootArgument is invalid: ${source.name}`);
    if (!sourceKindAllowed(source, inspection.path, roots, policyBundle)) fail(`source has an invalid exact-name or parent: ${inspection.path}`);
    if (samePath(inspection.path, roots.archive.path) || isPathInside(inspection.path, roots.archive.path, { allowEqual: true }) || isPathInside(roots.archive.path, inspection.path, { allowEqual: true }) || samePath(inspection.path, roots.workspace.path) || samePath(inspection.path, roots.temp.path) || samePath(inspection.path, roots.repo.path)) fail(`source overlaps a protected root: ${inspection.path}`);
    if (source.rootDecision !== "scanned") fail(`source ${source.name} was not scanned in the supplied report`);
    verified.push({ ...source, rootArgument, path: inspection.path });
  }
  if (seen.size !== candidateRoots.length) fail("report candidate roots and source records differ");
  if (policyBundle.kind === "second-wave") {
    const expectedIds = new Set(selectedPartition.sourceIds);
    const actual = new Set(verified.map((source) => `${source.id}\0${source.name}\0${source.rootArgument}`));
    const expected = selectedPartition.sourceIds.map((sourceId) => policyBundle.policy.sourceRoots.find((source) => source.id === sourceId));
    if (actual.size !== expectedIds.size || expected.some((source) => !actual.has(`${source.id}\0${source.name}\0${source.rootArgument}`))) fail(`report source set does not exactly match second-wave partition ${selectedPartition.id}`);
  }
  for (let left = 0; left < verified.length; left += 1) {
    for (let right = left + 1; right < verified.length; right += 1) {
      if (samePath(verified[left].path, verified[right].path) || isPathInside(verified[left].path, verified[right].path, { allowEqual: true }) || isPathInside(verified[right].path, verified[left].path, { allowEqual: true })) fail("source roots overlap");
    }
  }
  return verified;
}

function matchesProtection(relativePath, policy) {
  const segments = normalizedPosixPath(relativePath).split("/");
  if (policy.protected.segments.some((segment) => segments.some((candidate) => candidate.toLowerCase() === String(segment).toLowerCase()))) return true;
  return policy.protected.namePatterns.some((pattern) => segments.some((candidate) => new RegExp(pattern, "iu").test(candidate)));
}

function inspectSourceEvidence(source, policy, budget) {
  const entries = [];
  const ordinaryDirectories = new Map();
  let observedBytes = 0;
  function pushEntry(entry) {
    entries.push(entry);
    budget.entries += 1;
    if (budget.entries > policy.limits.maxEntries) fail(`all sources exceed maxEntries ${policy.limits.maxEntries}`);
  }
  function account(bytes) {
    observedBytes += bytes;
    budget.bytes += bytes;
    if (budget.bytes > policy.limits.maxBytes) fail(`all sources exceed maxBytes ${policy.limits.maxBytes}`);
  }
  function visit(directory, depth) {
    if (depth > policy.limits.maxDepth) fail(`source exceeds maxDepth: ${source.name}`);
    let children;
    try {
      children = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      fail(`source cannot be enumerated: ${source.name} (${error.message})`);
    }
    for (const child of children) {
      const absolute = path.join(directory, child.name);
      let stats;
      try {
        stats = fs.lstatSync(absolute);
      } catch (error) {
        fail(`source entry cannot be inspected: ${absolute} (${error.message})`);
      }
      if (stats.isSymbolicLink()) fail(`source contains a symlink or reparse point: ${absolute}`);
      let realPath;
      try {
        realPath = fs.realpathSync.native(absolute);
      } catch (error) {
        fail(`source entry is not resolvable: ${absolute} (${error.code ?? error.message})`);
      }
      if (!samePath(absolute, realPath)) fail(`source contains a symlink or reparse point: ${absolute}`);
      const relativePath = safeRelativePath(path.relative(source.path, absolute), `source ${source.name} entry`);
      const protectedEntry = matchesProtection(relativePath, policy);
      const kind = stats.isFile() ? "file" : stats.isDirectory() ? "directory" : stats.isSymbolicLink() ? "symlink" : "other";
      if (protectedEntry) {
        pushEntry({ relativePath, absolutePath: absolute, kind, bytes: stats.isFile() ? stats.size : null, mtimeUtc: timestampUtc(stats.mtimeMs), protected: true });
        if (stats.isFile()) account(stats.size);
        continue;
      }
      if (stats.isDirectory()) {
        ordinaryDirectories.set(relativePath.toLowerCase(), {
          relativePath,
          mtimeUtc: timestampUtc(stats.mtimeMs),
        });
        visit(absolute, depth + 1);
        continue;
      }
      if (!stats.isFile()) {
        pushEntry({ relativePath, absolutePath: absolute, kind, bytes: stats.size ?? null, mtimeUtc: timestampUtc(stats.mtimeMs), protected: false });
        account(stats.size ?? 0);
        continue;
      }
      pushEntry({ relativePath, absolutePath: absolute, kind: "file", bytes: stats.size, mtimeUtc: timestampUtc(stats.mtimeMs), protected: false });
      account(stats.size);
    }
  }
  visit(source.path, 0);
  return { entries, ordinaryDirectories, observedBytes };
}

function expectedOrdinaryDirectories(entries) {
  const directories = new Set();
  for (const entry of entries) {
    const parts = entry.relativePath.split("/");
    for (let index = 1; index < parts.length; index += 1) directories.add(parts.slice(0, index).join("/").toLowerCase());
  }
  return directories;
}

function compareMetadata(reportEntry, currentEntry) {
  if (reportEntry.kind !== currentEntry.kind || (reportEntry.bytes ?? null) !== (currentEntry.bytes ?? null)) return false;
  const expectedMtime = reportEntry.timestamps?.mtimeUtc;
  return typeof expectedMtime === "string" && expectedMtime === currentEntry.mtimeUtc;
}

function hashStableFile(filePath, expectedBytes, expectedMtime, maxBytes) {
  if (expectedBytes > maxBytes) fail(`hashed file exceeds maxSingleFileBytes: ${filePath}`);
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, "r");
  } catch (error) {
    fail(`hashed file could not be opened: ${filePath} (${error.message})`);
  }
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_SIZE);
  let bytes = 0;
  try {
    const initial = fs.fstatSync(descriptor);
    if (!initial.isFile() || initial.size !== expectedBytes || timestampUtc(initial.mtimeMs) !== expectedMtime) fail(`hashed file metadata changed: ${filePath}`);
    let read;
    do {
      read = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (read > 0) {
        hash.update(buffer.subarray(0, read));
        bytes += read;
      }
    } while (read > 0);
    const final = fs.fstatSync(descriptor);
    if (!final.isFile() || final.size !== expectedBytes || timestampUtc(final.mtimeMs) !== expectedMtime) fail(`hashed file changed while reading: ${filePath}`);
  } finally {
    fs.closeSync(descriptor);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function validateReportEntries(source, current, policy) {
  if (!Array.isArray(source.entries)) fail(`source ${source.name} entries are incomplete`);
  const reportEntries = new Map();
  for (const entry of source.entries) {
    if (!entry || typeof entry.relativePath !== "string") fail(`source ${source.name} has an invalid entry`);
    const relativePath = safeRelativePath(entry.relativePath, `source ${source.name} report entry`);
    const key = relativePath.toLowerCase();
    if (reportEntries.has(key)) fail(`source ${source.name} has duplicate entry paths`);
    const absolute = path.resolve(source.path, relativePath.split("/").join(path.sep));
    if (!samePath(entry.absolutePath, absolute)) fail(`source ${source.name} entry path is not exact: ${relativePath}`);
    if (entry.sha256 !== null && entry.sha256 !== undefined) validateHash(entry.sha256, `${source.name}/${relativePath} sha256`);
    reportEntries.set(key, { ...entry, relativePath, absolutePath: absolute });
  }
  const currentByPath = new Map(current.entries.map((entry) => [entry.relativePath.toLowerCase(), entry]));
  for (const [key, entry] of reportEntries) {
    const currentEntry = currentByPath.get(key);
    if (currentEntry === undefined) fail(`source evidence is missing: ${source.name}/${entry.relativePath}`);
    if (!compareMetadata(entry, currentEntry)) fail(`source metadata changed: ${source.name}/${entry.relativePath}`);
    if (entry.decision === "protected" && entry.sha256 !== null) fail(`protected entry must not carry a hash: ${source.name}/${entry.relativePath}`);
    if (entry.decision === "protected" && !currentEntry.protected) fail(`protected entry changed classification: ${source.name}/${entry.relativePath}`);
  }
  for (const [key, entry] of currentByPath) {
    if (!reportEntries.has(key)) fail(`source evidence was added: ${source.name}/${entry.relativePath}`);
  }
  const expectedDirectories = expectedOrdinaryDirectories([...reportEntries.values()].filter((entry) => entry.decision !== "protected"));
  for (const directory of expectedDirectories) if (!current.ordinaryDirectories.has(directory)) fail(`source directory evidence is missing: ${source.name}/${directory}`);
  const emptyDirectories = [];
  for (const [directoryKey, directoryRecord] of current.ordinaryDirectories) {
    if (expectedDirectories.has(directoryKey)) continue;
    const hasObservedDescendant = current.entries.some((entry) => entry.relativePath.toLowerCase().startsWith(`${directoryKey}/`));
    if (hasObservedDescendant) fail(`source directory evidence contains added content: ${source.name}/${directoryRecord.relativePath}`);
    emptyDirectories.push({
      relativePath: directoryRecord.relativePath,
      absolutePath: path.join(source.path, directoryRecord.relativePath.split("/").join(path.sep)),
      mtimeUtc: directoryRecord.mtimeUtc,
      status: "unverified-empty-directory",
      reason: "report-does-not-record-ordinary-empty-directories",
    });
  }

  const preparedEntries = [];
  for (const entry of reportEntries.values()) {
    const protectedEntry = entry.decision === "protected";
    if (protectedEntry) {
      preparedEntries.push({ entry, status: "protected", reason: "protected-content-is-no-go", sha256: null });
      continue;
    }
    if (typeof entry.sha256 !== "string" || !SHA256_PATTERN.test(entry.sha256.toLowerCase())) {
      preparedEntries.push({ entry, status: "review", reason: entry.decision === "refused" ? "refused-by-report" : "missing-approved-hash", sha256: null });
      continue;
    }
    const actual = hashStableFile(entry.absolutePath, entry.bytes, entry.timestamps?.mtimeUtc, policy.limits.maxSingleFileBytes);
    if (actual.sha256 !== entry.sha256.toLowerCase()) fail(`source hash changed: ${source.name}/${entry.relativePath}`);
    preparedEntries.push({ entry, status: "review", reason: entry.decision === "duplicate" ? "approved-duplicate-still-requires-review" : "review-only-source-evidence", sha256: actual.sha256 });
  }
  return { preparedEntries, emptyDirectories };
}

function destinationPlan(destination, roots, reportPath, sources) {
  const absoluteDestination = path.resolve(destination);
  if (!isPathInside(roots.archive.path, absoluteDestination)) fail("destination must be inside archive-root");
  if (!isPathInside(roots.group.path, absoluteDestination)) fail("destination must be under the existing dated recovery group containing the report");
  assertNoOverlap("destination", absoluteDestination, {
    "repo-root": roots.repo.path,
    "temp-root": roots.temp.path,
    report: reportPath,
    ...Object.fromEntries(sources.map((source) => [`source:${source.name}`, source.path])),
  });
  inspectAbsent(absoluteDestination, "destination");
  const parent = inspectCanonical(path.dirname(absoluteDestination), "destination parent", "directory");
  if (!sameVolume(absoluteDestination, roots.archive.path) || sources.some((source) => !sameVolume(absoluteDestination, source.path)) || !sameVolume(absoluteDestination, roots.repo.path)) fail("destination must be on the same volume as repo, archive, and every source");
  return { path: absoluteDestination, parent: parent.path, exists: false, created: false, sameVolume: true };
}

function outputPathSafe(output, roots, destination, sources) {
  if (output === undefined) return null;
  const absolute = path.resolve(output);
  if (!absolute.toLowerCase().endsWith(".json")) fail("output must end with .json");
  if (!isPathInside(roots.archive.path, absolute)) fail("output must be inside archive-root");
  if (!isPathInside(roots.group.path, absolute)) fail("output must be in the same dated g5 recovery group as the report");
  assertNoOverlap("output", absolute, {
    "repo-root": roots.repo.path,
    "temp-root": roots.temp.path,
    destination: destination.path,
    ...Object.fromEntries(sources.map((source) => [`source:${source.name}`, source.path])),
  });
  inspectAbsent(absolute, "output");
  inspectCanonical(path.dirname(absolute), "output parent", "directory");
  return absolute;
}

function sourceSummary(preparedEntries, emptyDirectories) {
  return {
    entries: preparedEntries.length,
    emptyDirectories: emptyDirectories.length,
    protected: preparedEntries.filter((entry) => entry.status === "protected").length,
    hashed: preparedEntries.filter((entry) => entry.sha256 !== null).length,
    review: preparedEntries.filter((entry) => entry.status === "review").length,
  };
}

function buildClusters(preparedEntriesBySource) {
  const byHash = new Map();
  for (const { source, entries } of preparedEntriesBySource) {
    for (const prepared of entries) {
      if (prepared.sha256 === null) continue;
      const list = byHash.get(prepared.sha256) ?? [];
      list.push({ source, prepared });
      byHash.set(prepared.sha256, list);
    }
  }
  return [...byHash.entries()]
    .filter(([, members]) => new Set(members.map(({ source }) => source.name)).size > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sha256, members]) => ({
      sha256,
      sourceNames: [...new Set(members.map(({ source }) => source.name))].sort(),
      entryCount: members.length,
      bytes: members[0].prepared.entry.bytes,
      members: members.map(({ source, prepared }) => ({
        sourceId: source.id,
        sourceName: source.name,
        relativePath: prepared.entry.relativePath,
      })),
    }));
}

function buildManifest({ report, reportPath, reportSha256, policySha256, repo, roots, sources, destination, generatedAtUtc, owner, retainUntilUtc, preparedEntriesBySource }) {
  const entries = [];
  const emptyDirectories = [];
  for (const { source, entries: preparedEntries } of preparedEntriesBySource) {
    for (const prepared of preparedEntries) {
      const relativePath = prepared.entry.relativePath;
      const restoreRelativePath = `${source.name}/${relativePath}`;
      safeRelativePath(restoreRelativePath, "restore mapping");
      entries.push({
        sourceId: source.id,
        sourceName: source.name,
        sourceRoot: source.path,
        rootArgument: source.rootArgument,
        relativePath,
        originalPath: prepared.entry.absolutePath,
        plannedPath: path.join(destination.path, source.name, relativePath.split("/").join(path.sep)),
        restoreRelativePath,
        kind: prepared.entry.kind,
        bytes: prepared.entry.bytes ?? null,
        mtimeUtc: prepared.entry.timestamps?.mtimeUtc ?? null,
        reportDecision: prepared.entry.decision,
        reportReasonCodes: Array.isArray(prepared.entry.reasonCodes) ? [...prepared.entry.reasonCodes] : [],
        sha256: prepared.sha256,
        status: prepared.status,
        reason: prepared.reason,
      });
    }
  }
  for (const { source, emptyDirectories: sourceEmptyDirectories } of preparedEntriesBySource) {
    for (const emptyDirectory of sourceEmptyDirectories) {
      const restoreRelativePath = `${source.name}/${emptyDirectory.relativePath}`;
      safeRelativePath(restoreRelativePath, "empty-directory restore mapping");
      emptyDirectories.push({
        sourceId: source.id,
        sourceName: source.name,
        sourceRoot: source.path,
        rootArgument: source.rootArgument,
        relativePath: emptyDirectory.relativePath,
        originalPath: emptyDirectory.absolutePath,
        plannedPath: path.join(destination.path, source.name, emptyDirectory.relativePath.split("/").join(path.sep)),
        restoreRelativePath,
        mtimeUtc: emptyDirectory.mtimeUtc,
        status: emptyDirectory.status,
        reason: emptyDirectory.reason,
      });
    }
  }
  const protectedCount = entries.filter((entry) => entry.status === "protected").length;
  const unknownCount = entries.filter((entry) => entry.status === "review" && entry.sha256 === null).length;
  return {
    format: WORKSPACE_QUARANTINE_MANIFEST_FORMAT,
    schemaVersion: 1,
    kind: "read-only-plan",
    applyAuthorized: false,
    generatedAtUtc,
    repository: RELEASE_REPOSITORY,
    repositoryState: {
      canonicalPath: repo.path,
      origin: repo.origin,
      branch: "main",
      upstream: "origin/main",
      head: repo.head,
      originMain: repo.originMain,
    },
    reportSha256,
    policySha256,
    owner,
    retainUntilUtc,
    roots: {
      workspaceRoot: roots.workspace.path,
      tempRoot: roots.temp.path,
      archiveRoot: roots.archive.path,
      rootArguments: {
        "workspace-root": roots.workspace.path,
        "temp-root": roots.temp.path,
        "archive-root": roots.archive.path,
      },
      ...(report.inputs?.partition ? { partition: JSON.parse(JSON.stringify(report.inputs.partition)) } : {}),
      sourceRoots: sources.map((source) => ({ id: source.id, name: source.name, rootArgument: source.rootArgument, path: source.path })),
    },
    destination: {
      path: destination.path,
      parent: destination.parent,
      sameVolume: true,
      exists: false,
      created: false,
      operation: "deferred-review-only",
    },
    summary: {
      status: protectedCount > 0 || unknownCount > 0 || entries.some((entry) => entry.status === "refused") ? "no-go" : "review",
      sourceCount: sources.length,
      entryCount: entries.length,
      hashedEntries: entries.filter((entry) => entry.sha256 !== null).length,
      protectedEntries: protectedCount,
      reviewEntries: entries.filter((entry) => entry.status === "review").length,
      emptyDirectories: emptyDirectories.length,
      crossSourceHashClusters: buildClusters(preparedEntriesBySource).length,
      quarantineEligibleEntries: 0,
    },
    crossSourceHashClusters: buildClusters(preparedEntriesBySource),
    entries,
    emptyDirectories,
    restoreGuidance: {
      status: "read-only-plan",
      instructions: [
        "This manifest creates no destination and authorizes no move, quarantine, deletion, or overwrite.",
        "Protected, changed, unknown, and cross-source material remains review-only; any protected content makes this plan no-go.",
        "A future authorized operation must revalidate this report SHA-256, policy SHA, exact clean main, source metadata, content hashes, owner, retention date, and restore mapping.",
      ],
      restoreMapping: "entries[] and emptyDirectories[] carry the proposed restore coordinates; no operation is performed here.",
    },
    evidence: {
      externalRecoveryReport: {
        format: WORKSPACE_RECOVERY_REPORT_FORMAT,
        path: reportPath,
        sha256: reportSha256,
        protectedGitStoreHashCoverage: "not-evaluated-by-this-preparer; no preservation claim",
      },
      ...(report.inputs?.allowlist ? {
        allowlist: {
          format: report.inputs.allowlist.format,
          path: report.inputs.allowlist.path,
          sha256: report.inputs.allowlist.sha256,
        },
      } : {}),
      ...(report.inputs?.partition ? { partition: JSON.parse(JSON.stringify(report.inputs.partition)) } : {}),
      reportGeneratedAtUtc: report.generatedAtUtc,
      reportStatus: report.summary?.status ?? "unknown",
      destinationCreated: false,
    },
  };
}

function assertManifestOptions(options) {
  for (const field of ["reportPath", "reportSha256", "policyPath", "repoRoot", "owner", "retainUntil", "destination"]) {
    if (options[field] === undefined || options[field] === null || String(options[field]).trim() === "") fail(`${field} is required`);
  }
  if (options.apply === true || options.move === true || options.delete === true || options.quarantine === true) fail("apply, move, delete, and quarantine are forbidden; this command is read-only");
}

export function runWorkspaceQuarantinePreparation(options = {}) {
  assertManifestOptions(options);
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  if (!Number.isFinite(now.getTime())) fail("now must be a valid date");
  const reportRead = readReport(options.reportPath, options.reportSha256);
  const report = reportRead.report;
  if (report.repository !== RELEASE_REPOSITORY) fail(`report repository must be ${RELEASE_REPOSITORY}`);
  const policyPath = path.resolve(options.policyPath);
  const repoRoot = path.resolve(options.repoRoot);
  const policyInspection = inspectCanonical(policyPath, "policy", "file");
  const expectedPolicyPaths = [
    path.join(repoRoot, "preservation", "workspace-recovery-policy.json"),
    path.join(repoRoot, "preservation", "workspace-recovery-second-wave-sources.json"),
  ];
  if (!expectedPolicyPaths.some((expectedPath) => samePath(policyInspection.path, expectedPath))) fail("policy must be a current canonical repository recovery policy");
  const loadedPolicy = readWorkspaceRecoveryPolicyBundle(policyInspection.path);
  if (loadedPolicy.errors.length > 0) fail(`workspace recovery policy is invalid:\n- ${loadedPolicy.errors.join("\n- ")}`);
  if (loadedPolicy.sha256 !== String(report.policySha256 ?? "").toLowerCase()) fail("current policy SHA-256 does not match the report");
  if (loadedPolicy.kind === "second-wave") {
    if (report.inputs?.allowlist?.format !== WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT || !samePath(report.inputs.allowlist.path, policyInspection.path) || report.inputs.allowlist.sha256 !== loadedPolicy.sha256) fail("second-wave report allowlist provenance does not match the current allowlist");
    if (new Date(report.retainUntilUtc).getTime() < new Date(loadedPolicy.policy.retention.minimumUtc).getTime()) fail(`second-wave retain-until must be on or after ${loadedPolicy.policy.retention.minimumUtc}`);
    validateSecondWavePartitionRecord(loadedPolicy, report.inputs?.partition, "report.inputs.partition");
  } else if (report.inputs?.allowlist !== undefined) {
    fail("first-wave report must not carry second-wave allowlist provenance");
  } else if (report.inputs?.partition !== undefined) {
    fail("first-wave report must not carry second-wave partition provenance");
  }
  const repo = verifyRepository(repoRoot, report.repositoryState);
  const roots = assertRootLayout(report, repo.path, reportRead.path);
  roots.repo = repo;
  const expectedOwner = String(report.owner ?? "").trim();
  if (expectedOwner === "" || String(options.owner).trim() !== expectedOwner) fail("owner does not match the report");
  const retainUntilUtc = parseRetention(String(options.retainUntil), now);
  if (retainUntilUtc !== report.retainUntilUtc) fail("retain-until does not match the report");
  const sources = verifySources(report, roots, loadedPolicy);
  const destination = destinationPlan(options.destination, roots, reportRead.path, sources);
  const outputPath = outputPathSafe(options.outputPath, roots, destination, sources);
  const evidenceBudget = { entries: 0, bytes: 0 };
  const preparedEntriesBySource = sources.map((source) => {
    const current = inspectSourceEvidence(source, loadedPolicy.scanPolicy ?? loadedPolicy.policy, evidenceBudget);
    const { preparedEntries, emptyDirectories } = validateReportEntries(source, current, loadedPolicy.scanPolicy ?? loadedPolicy.policy);
    return { source, entries: preparedEntries, emptyDirectories, summary: sourceSummary(preparedEntries, emptyDirectories) };
  });
  const generatedAtUtc = new Date(now.getTime()).toISOString();
  const manifest = buildManifest({
    report,
    reportPath: reportRead.path,
    reportSha256: reportRead.reportSha256,
    policySha256: loadedPolicy.sha256,
    repo,
    roots,
    sources,
    destination,
    generatedAtUtc,
    owner: expectedOwner,
    retainUntilUtc,
    preparedEntriesBySource,
  });
  if (outputPath !== null) {
    try {
      fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      fail(`could not write new-only manifest: ${error.message}`);
    }
  }
  return manifest;
}

function parseArguments(argumentsList) {
  const options = {};
  const seen = new Set();
  const valueFlags = new Map([
    ["--report", "reportPath"],
    ["--report-sha256", "reportSha256"],
    ["--policy", "policyPath"],
    ["--repo-root", "repoRoot"],
    ["--owner", "owner"],
    ["--retain-until", "retainUntil"],
    ["--destination", "destination"],
    ["--output", "outputPath"],
  ]);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      options.help = true;
      continue;
    }
    if (["--apply", "--move", "--delete", "--quarantine"].includes(argument)) fail(`${argument} is forbidden; this command is read-only`);
    const optionName = valueFlags.get(argument);
    if (optionName === undefined) fail(`unknown argument: ${argument}`);
    if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
    seen.add(argument);
    const value = argumentsList[++index];
    if (value === undefined || value.startsWith("--")) fail(`${argument} requires a value`);
    options[optionName] = ["reportPath", "policyPath", "repoRoot", "destination", "outputPath"].includes(optionName) ? path.resolve(value) : value;
  }
  if (options.help) return options;
  assertManifestOptions(options);
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/prepare-workspace-quarantine.mjs --report <report.json> --report-sha256 <sha256> --policy <repo/preservation/workspace-recovery-policy.json> --repo-root <repo> --owner <id> --retain-until <UTC> --destination <new-dir-under-existing-recovery-group> [--output <new-manifest.json>]");
      return;
    }
    console.log(JSON.stringify(runWorkspaceQuarantinePreparation(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === path.resolve(import.meta.filename)) main();
