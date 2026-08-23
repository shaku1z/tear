import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { RELEASE_REPOSITORY } from "./release-artifact.mjs";
import { normalizeRepositoryIdentifier } from "./repository-identity.mjs";
import {
  readWorkspaceRecoveryPolicyBundle,
  rootArgumentForSource,
  WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT,
} from "./report-workspace-recovery.mjs";
import {
  validateSecondWavePartitionRecord,
  runWorkspaceQuarantinePreparation,
} from "./prepare-workspace-quarantine.mjs";

export const WORKSPACE_PRESERVATION_QUARANTINE_FORMAT = "tear-workspace-preservation-quarantine";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const GIT_OBJECT_PATTERN = /^[0-9a-f]{40,64}$/u;
const RECOVERY_GROUP_PATTERN = /^\d{4}-\d{2}-\d{2}-g5-[a-z0-9-]+$/u;
const EVENT_PATTERN = /^(\d{6})-[a-z0-9-]+\.json$/u;
const HASH_CHUNK_SIZE = 1024 * 1024;
const MAX_JSON_BYTES = 256 * 1024 * 1024;

export class WorkspacePreservationQuarantineError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspacePreservationQuarantineError";
  }
}

function fail(message) {
  throw new WorkspacePreservationQuarantineError(message);
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

function safeRelativePath(value, label = "relative path") {
  const normalized = String(value).replaceAll("\\", "/");
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

function optionalCanonical(candidate, label, expectedKind = undefined) {
  const absolute = path.resolve(candidate);
  try {
    fs.lstatSync(absolute);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    fail(`${label} could not be inspected: ${absolute} (${error.code ?? error.message})`);
  }
  return inspectCanonical(absolute, label, expectedKind);
}

function ensureAbsent(candidate, label) {
  const absolute = path.resolve(candidate);
  try {
    fs.lstatSync(absolute);
    fail(`${label} already exists; refusing overwrite: ${absolute}`);
  } catch (error) {
    if (error instanceof WorkspacePreservationQuarantineError) throw error;
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateHash(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value.toLowerCase())) fail(`${label} must be a SHA-256 hex digest`);
  return value.toLowerCase();
}

function readJsonEvidence(filePath, expectedSha256, label) {
  const inspection = inspectCanonical(filePath, label, "file");
  if (inspection.stats.size > MAX_JSON_BYTES) fail(`${label} exceeds the bounded size limit`);
  const raw = fs.readFileSync(inspection.path);
  const actualSha256 = sha256(raw);
  if (actualSha256 !== validateHash(expectedSha256, `${label} SHA-256`)) fail(`${label} SHA-256 does not match supplied evidence`);
  let parsed;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  return { path: inspection.path, parsed, raw, sha256: actualSha256 };
}

function runGit(root, argumentsList) {
  const result = spawnSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: "pipe",
  });
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
}

function gitValue(root, argumentsList, label) {
  const result = runGit(root, argumentsList);
  if (!result.ok) fail(`${label} failed: ${(result.error?.message || result.stderr || result.stdout || "unknown error").trim()}`);
  return result.stdout.trim();
}

function verifyRepository(repoRoot, report, manifest, { allowRecordedHeadAncestor = false } = {}) {
  const repo = inspectCanonical(repoRoot, "repo-root", "directory");
  const reportedRoot = path.resolve(gitValue(repo.path, ["rev-parse", "--show-toplevel"], "git root"));
  if (!samePath(repo.path, reportedRoot)) fail("repo-root is not the canonical Git root");
  const origin = normalizeRepositoryIdentifier(gitValue(repo.path, ["config", "--get", "remote.origin.url"], "git origin"));
  if (origin !== normalizeRepositoryIdentifier(RELEASE_REPOSITORY)) fail(`repo-root origin must identify ${RELEASE_REPOSITORY}`);
  if (gitValue(repo.path, ["status", "--porcelain=v1", "--untracked-files=all"], "git status") !== "") fail("repo-root must be clean");
  if (gitValue(repo.path, ["branch", "--show-current"], "git branch") !== "main") fail("repo-root must be on main");
  if (gitValue(repo.path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "git upstream") !== "origin/main") fail("main must track origin/main");
  const head = gitValue(repo.path, ["rev-parse", "HEAD"], "git HEAD").toLowerCase();
  const originMain = gitValue(repo.path, ["rev-parse", "origin/main"], "git origin/main").toLowerCase();
  if (!GIT_OBJECT_PATTERN.test(head) || head !== originMain) fail("main must exactly equal origin/main");
  const counts = gitValue(repo.path, ["rev-list", "--left-right", "--count", "HEAD...origin/main"], "git divergence").split(/\s+/u);
  if (counts.length !== 2 || counts.some((value) => value !== "0")) fail("main must exactly equal origin/main");
  const reportState = report.repositoryState;
  const manifestState = manifest.repositoryState;
  if (typeof reportState?.canonicalPath !== "string" || !samePath(reportState.canonicalPath, repo.path)) fail("report canonical path does not match repo-root");
  if (typeof manifestState?.canonicalPath !== "string" || !samePath(manifestState.canonicalPath, repo.path)) fail("manifest canonical path does not match repo-root");
  if (normalizeRepositoryIdentifier(reportState.origin) !== origin || reportState.branch !== "main" || reportState.upstream !== "origin/main") fail("report repository state is not exact clean main");
  if (normalizeRepositoryIdentifier(manifestState.origin) !== origin || manifestState.branch !== "main" || manifestState.upstream !== "origin/main") fail("manifest repository state is not exact clean main");
  const reportHead = String(reportState.head).toLowerCase();
  const reportOriginMain = String(reportState.originMain).toLowerCase();
  const manifestHead = String(manifestState.head).toLowerCase();
  const manifestOriginMain = String(manifestState.originMain).toLowerCase();
  if (!GIT_OBJECT_PATTERN.test(reportHead) || !GIT_OBJECT_PATTERN.test(reportOriginMain) || !GIT_OBJECT_PATTERN.test(manifestHead) || !GIT_OBJECT_PATTERN.test(manifestOriginMain)) fail("recorded repository heads are invalid");
  if (reportHead !== reportOriginMain || manifestHead !== manifestOriginMain || reportHead !== manifestHead) fail("report and manifest evidence heads diverge");
  if (reportHead !== head || reportOriginMain !== originMain) {
    if (!allowRecordedHeadAncestor) fail("report head does not match current exact origin/main");
    const ancestor = runGit(repo.path, ["merge-base", "--is-ancestor", reportHead, head]);
    if (!ancestor.ok) fail("recorded evidence head is not an ancestor of current exact origin/main");
  }
  return { ...repo, origin, head, originMain, evidenceHead: reportHead };
}

function recoveryGroup(filePath, archiveRoot, label) {
  const relative = path.relative(archiveRoot, filePath).split(path.sep);
  if (relative.length < 2 || !RECOVERY_GROUP_PATTERN.test(relative[0])) fail(`${label} must be under an existing dated g5 recovery group`);
  return inspectCanonical(path.join(archiveRoot, relative[0]), `${label} recovery group`, "directory");
}

function parseRetention(value, now) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now.getTime()) fail("retain-until must be a valid future timestamp");
  return date.toISOString();
}

function policyProtected(relativePath, policy) {
  const segments = relativePath.split("/");
  if (policy.protected.segments.some((segment) => segments.some((candidate) => candidate.toLowerCase() === String(segment).toLowerCase()))) return true;
  return policy.protected.namePatterns.some((pattern) => segments.some((candidate) => new RegExp(pattern, "iu").test(candidate)));
}

function sourceRecords(report, manifest, roots, policyBundle) {
  if (!Array.isArray(report.sources) || !Array.isArray(manifest.roots?.sourceRoots) || report.sources.length !== manifest.roots.sourceRoots.length) fail("report and manifest source sets differ");
  const candidateRoots = report.inputs?.candidateRoots;
  if (!Array.isArray(candidateRoots) || candidateRoots.length !== report.sources.length) fail("report candidate roots are incomplete");
  if (report.inputs?.rootArguments !== undefined) {
    for (const [argument, expected] of [["workspace-root", roots.workspace.path], ["temp-root", roots.temp.path], ["archive-root", roots.archive.path]]) {
      if (!samePath(report.inputs.rootArguments[argument], expected)) fail(`report rootArguments.${argument} does not match its canonical root`);
    }
  }
  if (manifest.roots?.rootArguments !== undefined) {
    for (const [argument, expected] of [["workspace-root", roots.workspace.path], ["temp-root", roots.temp.path], ["archive-root", roots.archive.path]]) {
      if (!samePath(manifest.roots.rootArguments[argument], expected)) fail(`manifest rootArguments.${argument} does not match its canonical root`);
    }
  }
  if (policyBundle.kind === "second-wave") {
    const partition = validateSecondWavePartitionRecord(policyBundle, report.inputs?.partition, "report.inputs.partition");
    validateSecondWavePartitionRecord(policyBundle, manifest.roots?.partition, "manifest.roots.partition");
    validateSecondWavePartitionRecord(policyBundle, manifest.evidence?.partition, "manifest.evidence.partition");
    const manifestPartition = manifest.roots.partition;
    const evidencePartition = manifest.evidence.partition;
    if (manifestPartition.id !== partition.id || manifestPartition.sourceIds.some((sourceId, index) => sourceId !== partition.sourceIds[index]) || evidencePartition.id !== partition.id || evidencePartition.sourceIds.some((sourceId, index) => sourceId !== partition.sourceIds[index])) fail("manifest partition provenance does not match report partition");
  } else if (report.inputs?.partition !== undefined || manifest.roots?.partition !== undefined) {
    fail("first-wave evidence must not carry second-wave partition provenance");
  }
  const reportNames = new Set();
  for (const source of report.sources) {
    if (!source || typeof source.name !== "string") fail("report source root is invalid");
    const key = source.name.toLowerCase();
    if (reportNames.has(key)) fail(`report has case-insensitive duplicate source names: ${source.name}`);
    reportNames.add(key);
  }
  const records = [];
  const seen = new Set();
  const seenNames = new Set();
  for (const source of manifest.roots.sourceRoots) {
    if (!source || typeof source.name !== "string" || typeof source.id !== "string" || typeof source.path !== "string") fail("manifest source root is invalid");
    const nameKey = source.name.toLowerCase();
    if (seenNames.has(nameKey)) fail(`manifest has case-insensitive duplicate destination child mappings: ${source.name}`);
    seenNames.add(nameKey);
    const reportSource = report.sources.find((candidate) => candidate.name === source.name && candidate.id === source.id);
    if (reportSource === undefined || !samePath(reportSource.absolutePath, source.path) || !candidateRoots.some((candidate) => samePath(candidate, source.path))) fail(`manifest source does not match report: ${source.name}`);
    const sourcePath = path.resolve(source.path);
    const parent = path.dirname(sourcePath);
    const rootArgument = rootArgumentForSource(source);
    const reportRootArgument = rootArgumentForSource(reportSource);
    if (rootArgument !== reportRootArgument || (policyBundle.kind === "second-wave" && source.rootArgument !== rootArgument)) fail(`manifest/report rootArgument mismatch: ${source.name}`);
    const expectedParent = rootArgument === "temp-root" ? roots.temp.path : rootArgument === "workspace-root" ? roots.workspace.path : null;
    if (expectedParent === null || !samePath(parent, expectedParent)) fail(`source parent is not exact for ${source.name}`);
    if (policyBundle.kind === "second-wave") {
      const allowlisted = policyBundle.policy.sourceRoots.find((candidate) => candidate.id === source.id && candidate.name === source.name && candidate.rootArgument === rootArgument);
      if (allowlisted === undefined) fail(`source is not in the exact second-wave allowlist: ${source.name}`);
    }
    const workspaceOverlap = (samePath(sourcePath, roots.workspace.path) || isPathInside(roots.workspace.path, sourcePath, { allowEqual: true }) || isPathInside(sourcePath, roots.workspace.path, { allowEqual: true })) && !samePath(expectedParent, roots.workspace.path);
    const tempOverlap = (samePath(sourcePath, roots.temp.path) || isPathInside(roots.temp.path, sourcePath, { allowEqual: true }) || isPathInside(sourcePath, roots.temp.path, { allowEqual: true })) && !samePath(expectedParent, roots.temp.path);
    if (samePath(sourcePath, roots.repo.path) || samePath(sourcePath, roots.archive.path) || isPathInside(roots.repo.path, sourcePath, { allowEqual: true }) || isPathInside(roots.archive.path, sourcePath, { allowEqual: true }) || workspaceOverlap || tempOverlap) fail(`source overlaps protected root: ${source.name}`);
    if (seen.has(comparablePath(sourcePath))) fail(`duplicate source root: ${source.name}`);
    seen.add(comparablePath(sourcePath));
    records.push({ id: source.id, name: source.name, rootArgument, path: sourcePath, report: reportSource });
  }
  if (policyBundle.kind === "second-wave") {
    const partition = policyBundle.policy.partitions.find((candidate) => candidate.id === report.inputs.partition.id);
    const expected = partition.sourceIds.map((sourceId) => policyBundle.policy.sourceRoots.find((source) => source.id === sourceId));
    const actual = new Set(records.map((source) => `${source.id}\0${source.name}\0${source.rootArgument}`));
    if (actual.size !== expected.length || expected.some((source) => !actual.has(`${source.id}\0${source.name}\0${source.rootArgument}`))) fail(`manifest source set does not exactly match second-wave partition ${partition.id}`);
  }
  return records.sort((left, right) => left.name.localeCompare(right.name));
}

function validateManifestShape(manifest, reportRead, roots, records) {
  if (manifest.format !== "tear-workspace-quarantine-manifest" || manifest.schemaVersion !== 1 || manifest.kind !== "read-only-plan") fail("manifest format or schema is invalid");
  if (manifest.applyAuthorized !== false) fail("manifest must be a read-only plan");
  if (manifest.reportSha256 !== reportRead.sha256) fail("manifest report SHA-256 does not match supplied report");
  if (manifest.policySha256 !== roots.policySha256) fail("manifest policy SHA-256 does not match current policy");
  if (manifest.summary?.quarantineEligibleEntries !== 0) fail("manifest contains quarantine-eligible entries");
  if (!Array.isArray(manifest.entries) || !Array.isArray(manifest.emptyDirectories)) fail("manifest evidence arrays are incomplete");
  const sourceByName = new Map(records.map((source) => [source.name, source]));
  const destination = path.resolve(manifest.destination?.path ?? "");
  if (!isPathInside(roots.group.path, destination) || samePath(destination, roots.group.path)) fail("manifest destination is outside its recovery group");
  if (manifest.destination.exists !== false || manifest.destination.created !== false) fail("manifest destination must be new-only");
  const seen = new Set();
  for (const entry of manifest.entries) {
    if (!sourceByName.has(entry.sourceName) || typeof entry.relativePath !== "string") fail("manifest entry source is invalid");
    const source = sourceByName.get(entry.sourceName);
    if (entry.rootArgument !== undefined && entry.rootArgument !== source.rootArgument) fail(`manifest entry rootArgument is invalid: ${entry.sourceName}/${entry.relativePath}`);
    const relativePath = safeRelativePath(entry.relativePath, "manifest entry");
    const key = `${entry.sourceName.toLowerCase()}\0${relativePath.toLowerCase()}`;
    if (seen.has(key)) fail(`manifest has duplicate path: ${entry.sourceName}/${relativePath}`);
    seen.add(key);
    const original = path.join(source.path, relativePath.split("/").join(path.sep));
    const planned = path.join(destination, source.name, relativePath.split("/").join(path.sep));
    if (!samePath(entry.sourceRoot, source.path) || !samePath(entry.originalPath, original) || !samePath(entry.plannedPath, planned) || entry.restoreRelativePath !== `${source.name}/${relativePath}`) fail(`manifest mapping is not exact: ${entry.sourceName}/${relativePath}`);
    if (entry.status === "protected") {
      if (entry.sha256 !== null) fail(`protected manifest entry carries a hash: ${entry.sourceName}/${relativePath}`);
    } else {
      validateHash(entry.sha256, `${entry.sourceName}/${relativePath}`);
    }
    if (typeof entry.mtimeUtc !== "string" || !Number.isFinite(new Date(entry.mtimeUtc).getTime())) fail(`manifest entry mtime is invalid: ${entry.sourceName}/${relativePath}`);
  }
  for (const entry of manifest.emptyDirectories) {
    if (!sourceByName.has(entry.sourceName) || typeof entry.relativePath !== "string") fail("manifest empty-directory source is invalid");
    const source = sourceByName.get(entry.sourceName);
    if (entry.rootArgument !== undefined && entry.rootArgument !== source.rootArgument) fail(`manifest empty-directory rootArgument is invalid: ${entry.sourceName}/${entry.relativePath}`);
    const relativePath = safeRelativePath(entry.relativePath, "manifest empty directory");
    const key = `${entry.sourceName.toLowerCase()}\0${relativePath.toLowerCase()}`;
    if (seen.has(key)) fail(`manifest has duplicate path: ${entry.sourceName}/${relativePath}`);
    seen.add(key);
    const original = path.join(source.path, relativePath.split("/").join(path.sep));
    const planned = path.join(destination, source.name, relativePath.split("/").join(path.sep));
    if (!samePath(entry.sourceRoot, source.path) || !samePath(entry.originalPath, original) || !samePath(entry.plannedPath, planned) || entry.restoreRelativePath !== `${source.name}/${relativePath}`) fail(`manifest empty-directory mapping is not exact: ${entry.sourceName}/${relativePath}`);
    if (entry.status !== "unverified-empty-directory" || typeof entry.mtimeUtc !== "string" || !Number.isFinite(new Date(entry.mtimeUtc).getTime())) fail(`manifest empty-directory evidence is invalid: ${entry.sourceName}/${relativePath}`);
  }
  return { destination, sourceByName };
}

function stableProjection(value, isRoot = true) {
  if (Array.isArray(value)) return value.map((child) => stableProjection(child, false));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().filter((key) => !(isRoot && key === "generatedAtUtc")).map((key) => [key, stableProjection(value[key], false)]));
  }
  return value;
}

function legacyCompatibilityProjection(manifest, core) {
  const clone = JSON.parse(JSON.stringify(manifest));
  const sourceRoots = clone.roots?.sourceRoots;
  const rootArgumentBySourceName = new Map();
  for (const source of [...(core.sources ?? []), ...(sourceRoots ?? [])]) {
    if (typeof source?.name !== "string") continue;
    rootArgumentBySourceName.set(source.name.toLowerCase(), rootArgumentForSource(source));
  }
  if (Array.isArray(sourceRoots)) {
    for (const source of sourceRoots) {
      if (source.rootArgument === undefined) source.rootArgument = rootArgumentForSource(source);
    }
    if (clone.roots.rootArguments === undefined) {
      clone.roots.rootArguments = {
        "workspace-root": core.workspace.path,
        "temp-root": core.temp.path,
        "archive-root": core.archive.path,
      };
    }
  }
  for (const entry of [...(clone.entries ?? []), ...(clone.emptyDirectories ?? [])]) {
    if (entry.rootArgument === undefined) {
      entry.rootArgument = rootArgumentBySourceName.get(String(entry.sourceName ?? "").toLowerCase())
        ?? rootArgumentForSource({ id: entry.sourceId });
    }
  }
  return clone;
}

function verifyStablePreparedManifest(core, options) {
  if (optionalCanonical(core.destination, "destination", "directory") !== null) fail("destination must be absent before the first apply");
  const regenerated = runWorkspaceQuarantinePreparation({
    reportPath: core.reportRead.path,
    reportSha256: core.reportRead.sha256,
    policyPath: core.policyPath,
    repoRoot: core.repo.path,
    owner: core.owner,
    retainUntil: core.retainUntilUtc,
    destination: core.destination,
    now: options.now,
  });
  if (JSON.stringify(stableProjection(regenerated)) !== JSON.stringify(stableProjection(legacyCompatibilityProjection(core.manifest, core)))) fail("manifest stable evidence does not match a fresh read-only preparation");
  return regenerated;
}

function hashStableFile(filePath, expectedBytes, expectedMtime, policy) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > policy.limits.maxSingleFileBytes) fail(`file exceeds bounded size: ${filePath}`);
  const descriptor = fs.openSync(filePath, "r");
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_SIZE);
  let bytes = 0;
  try {
    const initial = fs.fstatSync(descriptor);
    if (!initial.isFile() || initial.size !== expectedBytes || timestampUtc(initial.mtimeMs) !== expectedMtime) fail(`file metadata changed: ${filePath}`);
    let read;
    do {
      read = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (read > 0) {
        hash.update(buffer.subarray(0, read));
        bytes += read;
      }
    } while (read > 0);
    const final = fs.fstatSync(descriptor);
    if (!final.isFile() || final.size !== expectedBytes || timestampUtc(final.mtimeMs) !== expectedMtime) fail(`file changed while hashing: ${filePath}`);
  } finally {
    fs.closeSync(descriptor);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function metadataMatches(entry, stats, kind) {
  return entry.kind === kind
    && (entry.bytes ?? null) === (stats.isFile() ? stats.size : null)
    && entry.mtimeUtc === timestampUtc(stats.mtimeMs);
}

function expectedRootData(core, sourceName) {
  const entries = new Map();
  const emptyDirectories = new Map();
  for (const entry of core.manifest.entries.filter((candidate) => candidate.sourceName === sourceName)) entries.set(entry.relativePath.toLowerCase(), entry);
  for (const entry of core.manifest.emptyDirectories.filter((candidate) => candidate.sourceName === sourceName)) emptyDirectories.set(entry.relativePath.toLowerCase(), entry);
  const expectedParents = new Set();
  for (const relativePath of [...entries.keys(), ...emptyDirectories.keys()]) {
    const parts = relativePath.split("/");
    for (let index = 1; index < parts.length; index += 1) expectedParents.add(parts.slice(0, index).join("/").toLowerCase());
  }
  return { entries, emptyDirectories, expectedParents };
}

function verifyWholeRoot(rootPath, sourceName, core, budget) {
  const root = inspectCanonical(rootPath, `${sourceName} root`, "directory");
  const expected = expectedRootData(core, sourceName);
  const seenEntries = new Set();
  const seenEmpty = new Set();
  const ordinaryDirectories = new Map();
  function accountFile(bytes) {
    budget.entries += 1;
    budget.bytes += bytes;
    if (budget.entries > core.policy.limits.maxEntries) fail(`whole-root preflight exceeds maxEntries ${core.policy.limits.maxEntries}`);
    if (budget.bytes > core.policy.limits.maxBytes) fail(`whole-root preflight exceeds maxBytes ${core.policy.limits.maxBytes}`);
  }
  function visit(directory, relativeDirectory, depth) {
    if (depth > core.policy.limits.maxDepth) fail(`whole-root preflight exceeds maxDepth: ${sourceName}`);
    let children;
    try {
      children = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      fail(`whole-root preflight cannot enumerate ${sourceName}: ${error.message}`);
    }
    let hasContent = false;
    for (const child of children) {
      const absolute = path.join(directory, child.name);
      let stats;
      try {
        stats = fs.lstatSync(absolute);
      } catch (error) {
        fail(`whole-root preflight cannot inspect ${absolute}: ${error.message}`);
      }
      if (stats.isSymbolicLink()) fail(`whole-root preflight found a symlink or reparse point: ${absolute}`);
      let realPath;
      try {
        realPath = fs.realpathSync.native(absolute);
      } catch (error) {
        fail(`whole-root preflight cannot resolve ${absolute}: ${error.code ?? error.message}`);
      }
      if (!samePath(absolute, realPath)) fail(`whole-root preflight found a symlink or reparse point: ${absolute}`);
      const relativePath = safeRelativePath(relativeDirectory === "" ? child.name : `${relativeDirectory}/${child.name}`, `${sourceName} path`);
      const key = relativePath.toLowerCase();
      const entry = expected.entries.get(key);
      const protectedPath = policyProtected(relativePath, core.policy);
      if (protectedPath || entry?.status === "protected") {
        if (entry?.status !== "protected") fail(`unexpected protected content: ${sourceName}/${relativePath}`);
        const kind = stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
        if (!metadataMatches(entry, stats, kind)) fail(`protected metadata changed: ${sourceName}/${relativePath}`);
        seenEntries.add(key);
        accountFile(stats.isFile() ? stats.size : 0);
        hasContent = true;
        continue;
      }
      if (entry !== undefined) {
        if (!stats.isFile() || !metadataMatches(entry, stats, "file")) fail(`whole-root file metadata changed: ${sourceName}/${relativePath}`);
        const actual = hashStableFile(absolute, entry.bytes, entry.mtimeUtc, core.policy);
        if (actual.sha256 !== entry.sha256) fail(`whole-root file hash changed: ${sourceName}/${relativePath}`);
        seenEntries.add(key);
        accountFile(actual.bytes);
        hasContent = true;
        continue;
      }
      if (stats.isDirectory()) {
        ordinaryDirectories.set(key, { relativePath, mtimeUtc: timestampUtc(stats.mtimeMs) });
        if (visit(absolute, relativePath, depth + 1)) hasContent = true;
        continue;
      }
      fail(`whole-root evidence was added: ${sourceName}/${relativePath}`);
    }
    return hasContent;
  }
  visit(root.path, "", 0);
  for (const [key] of expected.entries) if (!seenEntries.has(key)) fail(`whole-root evidence is missing: ${sourceName}/${key}`);
  for (const [key, entry] of expected.emptyDirectories) {
    const actual = ordinaryDirectories.get(key);
    if (actual === undefined) fail(`whole-root empty directory is missing: ${sourceName}/${entry.relativePath}`);
    if (actual.mtimeUtc !== entry.mtimeUtc) fail(`whole-root empty directory metadata changed: ${sourceName}/${entry.relativePath}`);
    seenEmpty.add(key);
  }
  for (const [key, actual] of ordinaryDirectories) {
    if (expected.emptyDirectories.has(key)) continue;
    if (!expected.expectedParents.has(key)) fail(`whole-root ordinary directory evidence is not in the manifest: ${sourceName}/${actual.relativePath}`);
  }
  return root;
}

function inspectDestination(destination, records) {
  const inspection = optionalCanonical(destination, "destination", "directory");
  if (inspection === null) return null;
  const expectedNames = new Set(records.map((source) => source.name.toLowerCase()));
  let children;
  try {
    children = fs.readdirSync(inspection.path, { withFileTypes: true });
  } catch (error) {
    fail(`destination cannot be enumerated: ${error.message}`);
  }
  for (const child of children) {
    const childPath = path.join(inspection.path, child.name);
    const childInspection = inspectCanonical(childPath, `destination child ${child.name}`);
    if (!expectedNames.has(child.name.toLowerCase()) || !childInspection.stats.isDirectory()) fail(`destination contains an unexpected child: ${childPath}`);
  }
  return inspection;
}

function preflightInitial(core) {
  if (optionalCanonical(core.destination, "destination", "directory") !== null) fail("destination collision: destination already exists");
  const budget = { entries: 0, bytes: 0 };
  for (const source of core.sources) {
    if (!sameVolume(source.path, core.destination)) fail(`source and destination are on different volumes: ${source.name}`);
    inspectCanonical(source.path, `source ${source.name}`, "directory");
    verifyWholeRoot(source.path, source.name, core, budget);
    ensureAbsent(path.join(core.destination, source.name), `destination source ${source.name}`);
  }
}

function preflightResume(core, events) {
  const destinationInspection = inspectDestination(core.destination, core.sources);
  if (destinationInspection === null) fail("resume destination is missing");
  const journalEvents = events.map((record) => record.event);
  const started = new Set(journalEvents.filter((event) => event.type === "move-start").map((event) => event.sourceName));
  const budget = { entries: 0, bytes: 0 };
  for (const source of core.sources) {
    const original = optionalCanonical(source.path, `source ${source.name}`, "directory");
    const targetPath = path.join(core.destination, source.name);
    const target = optionalCanonical(targetPath, `destination source ${source.name}`, "directory");
    if (original !== null && target !== null) fail(`source pair is both-present: ${source.name}`);
    if (original === null && target === null) fail(`source pair is both-missing: ${source.name}`);
    if (target !== null) {
      if (!started.has(source.name)) fail(`destination source exists without a journal move-start: ${source.name}`);
      verifyWholeRoot(target.path, source.name, core, budget);
    } else {
      verifyWholeRoot(original.path, source.name, core, budget);
    }
  }
}

function preflightCompleted(core) {
  const destinationInspection = inspectDestination(core.destination, core.sources);
  if (destinationInspection === null) fail("completed destination is missing");
  const budget = { entries: 0, bytes: 0 };
  for (const source of core.sources) {
    if (optionalCanonical(source.path, `source ${source.name}`, "directory") !== null) fail(`completed source is still present: ${source.name}`);
    const target = inspectCanonical(path.join(core.destination, source.name), `destination source ${source.name}`, "directory");
    verifyWholeRoot(target.path, source.name, core, budget);
  }
}

function journalFiles(journalPath) {
  const inspection = inspectCanonical(journalPath, "journal", "directory");
  const records = [];
  for (const child of fs.readdirSync(inspection.path, { withFileTypes: true })) {
    if (child.name === "completion-receipt.json") continue;
    const childPath = path.join(inspection.path, child.name);
    if (!child.isFile() || !EVENT_PATTERN.test(child.name)) fail(`journal contains an invalid child: ${childPath}`);
    const raw = fs.readFileSync(childPath);
    let event;
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch (error) {
      fail(`journal event is invalid JSON: ${childPath} (${error.message})`);
    }
    const sequence = Number(EVENT_PATTERN.exec(child.name)[1]);
    records.push({ name: child.name, path: childPath, raw, event, sequence });
  }
  records.sort((left, right) => left.sequence - right.sequence);
  records.forEach((record, index) => {
    if (record.sequence !== index + 1 || record.event.sequence !== record.sequence) fail("journal event sequence is not contiguous or immutable");
  });
  return { path: inspection.path, records };
}

function eventHash(journal) {
  const hash = createHash("sha256");
  for (const record of journal.records) hash.update(record.raw);
  return hash.digest("hex");
}

function writeEvent(journalPath, type, data) {
  const journal = journalFiles(journalPath);
  const sequence = journal.records.length + 1;
  const payload = { format: WORKSPACE_PRESERVATION_QUARANTINE_FORMAT, schemaVersion: 1, sequence, type, atUtc: new Date().toISOString(), ...data };
  const name = `${String(sequence).padStart(6, "0")}-${type.replace(/[^a-z0-9-]/gu, "-")}.json`;
  const eventPath = path.join(journal.path, name);
  try {
    fs.writeFileSync(eventPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    fail(`journal event could not be written without overwrite: ${error.message}`);
  }
  return payload;
}

function readReceipt(journalPath, name = "completion-receipt.json") {
  const receiptPath = path.join(journalPath, name);
  const inspection = optionalCanonical(receiptPath, `journal ${name}`, "file");
  if (inspection === null) return null;
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(inspection.path, "utf8"));
  } catch (error) {
    fail(`journal receipt is invalid: ${error.message}`);
  }
  return { path: inspection.path, receipt };
}

function writeReceipt(journalPath, core, sourceCount, eventCount) {
  const journal = journalFiles(journalPath);
  const receipt = {
    format: WORKSPACE_PRESERVATION_QUARANTINE_FORMAT,
    schemaVersion: 1,
    kind: "completion-receipt",
    status: "complete",
    reportSha256: core.reportRead.sha256,
    manifestSha256: core.manifestRead.sha256,
    policySha256: core.policySha256,
    head: core.evidenceHead,
    destination: core.destination,
    sourceCount,
    eventCount,
    eventsSha256: eventHash(journal),
    completedAtUtc: new Date().toISOString(),
    mutation: "same-volume-whole-root-rename-only",
  };
  const receiptPath = path.join(journal.path, "completion-receipt.json");
  try {
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    fail(`completion receipt could not be written without overwrite: ${error.message}`);
  }
  return receipt;
}

function validateJournalPath(core, journalPath, existing) {
  const absolute = path.resolve(journalPath);
  if (!isPathInside(core.group.path, absolute) || samePath(absolute, core.group.path)) fail("journal must be a child of the report recovery group");
  assertNoOverlap("journal", absolute, {
    report: core.reportRead.path,
    manifest: core.manifestRead.path,
    destination: core.destination,
    repo: core.repo.path,
    ...Object.fromEntries(core.sources.map((source) => [`source:${source.name}`, source.path])),
  });
  const parent = inspectCanonical(path.dirname(absolute), "journal parent", "directory");
  if (!sameVolume(absolute, core.destination) || !sameVolume(absolute, core.repo.path)) fail("journal must be on the canonical same volume");
  if (existing) inspectCanonical(absolute, "journal", "directory");
  else ensureAbsent(absolute, "journal");
  return { path: absolute, parent: parent.path, existing };
}

function validateJournalStart(journal, core) {
  const start = journal.records.find((record) => record.event.type === "run-start");
  if (start === undefined) fail("journal has no run-start event");
  const event = start.event;
  if (event.reportSha256 !== core.reportRead.sha256 || event.manifestSha256 !== core.manifestRead.sha256 || event.policySha256 !== core.policySha256 || !samePath(eventDestinationPath(event), core.destination)) fail("journal identity does not match supplied evidence");
  return event;
}

function eventDestinationPath(event) {
  return typeof event.destination === "object" && event.destination !== null ? event.destination.path : event.destination;
}

function validateJournalIntegrity(journal, core, { requireApplyComplete = false } = {}) {
  const sourceByName = new Map(core.sources.map((source) => [source.name.toLowerCase(), source]));
  const sourceIndex = new Map(core.sources.map((source, index) => [source.name, index]));
  const started = new Set();
  const terminal = new Set();
  let runStarted = false;
  let preflightCompleted = false;
  let destinationCreateStarted = false;
  let destinationCreated = false;
  let resumePreflightCompleted = false;
  let applyCompleted = false;
  let applyCompleteCount = 0;

  for (const [index, record] of journal.records.entries()) {
    const event = record.event;
    if (event.format !== WORKSPACE_PRESERVATION_QUARANTINE_FORMAT || event.schemaVersion !== 1 || typeof event.type !== "string" || !Number.isInteger(event.sequence) || event.sequence !== index + 1 || typeof event.atUtc !== "string" || !Number.isFinite(new Date(event.atUtc).getTime())) fail(`journal event is malformed or fabricated: ${record.name}`);
    if (applyCompleted) fail(`journal event follows apply-complete: ${record.name}`);

    switch (event.type) {
      case "run-start":
        if (index !== 0 || runStarted || event.mode !== "apply" || event.reportSha256 !== core.reportRead.sha256 || event.manifestSha256 !== core.manifestRead.sha256 || event.policySha256 !== core.policySha256 || event.sourceCount !== core.sources.length || !samePath(eventDestinationPath(event), core.destination)) fail(`journal run-start is invalid: ${record.name}`);
        runStarted = true;
        break;
      case "preflight-complete":
        if (!runStarted || preflightCompleted || event.sourceCount !== core.sources.length || !samePath(eventDestinationPath(event), core.destination)) fail(`journal preflight-complete is invalid: ${record.name}`);
        preflightCompleted = true;
        break;
      case "destination-create-start":
        if (!preflightCompleted || destinationCreateStarted || !samePath(eventDestinationPath(event), core.destination)) fail(`journal destination-create-start is invalid: ${record.name}`);
        destinationCreateStarted = true;
        break;
      case "destination-created":
        if (!destinationCreateStarted || destinationCreated || !samePath(eventDestinationPath(event), core.destination)) fail(`journal destination-created is invalid: ${record.name}`);
        destinationCreated = true;
        break;
      case "resume-preflight-complete":
        if (!destinationCreateStarted || resumePreflightCompleted || !samePath(eventDestinationPath(event), core.destination)) fail(`journal resume-preflight-complete is invalid: ${record.name}`);
        resumePreflightCompleted = true;
        break;
      case "move-start":
      case "move-complete":
      case "move-recovered": {
        if (!destinationCreateStarted || (!destinationCreated && !resumePreflightCompleted) || typeof event.sourceName !== "string" || typeof event.sourcePath !== "string" || typeof event.destinationPath !== "string") fail(`journal ${event.type} is invalid: ${record.name}`);
        const source = sourceByName.get(event.sourceName.toLowerCase());
        if (source === undefined || source.name !== event.sourceName || !samePath(event.sourcePath, source.path) || !samePath(event.destinationPath, path.join(core.destination, source.name))) fail(`journal ${event.type} source identity is invalid: ${record.name}`);
        const indexForSource = sourceIndex.get(source.name);
        if (core.sources.slice(0, indexForSource).some((candidate) => !terminal.has(candidate.name))) fail(`journal ${event.type} is out of source order: ${record.name}`);
        if (event.type === "move-start") {
          if (started.has(source.name) || terminal.has(source.name)) fail(`journal has duplicate move-start: ${source.name}`);
          started.add(source.name);
        } else {
          if (!started.has(source.name) || terminal.has(source.name)) fail(`journal has out-of-order or duplicate move terminal: ${source.name}`);
          terminal.add(source.name);
        }
        break;
      }
      case "apply-complete":
        if (!destinationCreateStarted || applyCompleted || terminal.size !== core.sources.length || event.sourceCount !== core.sources.length || !samePath(eventDestinationPath(event), core.destination)) fail(`journal apply-complete is invalid: ${record.name}`);
        applyCompleted = true;
        applyCompleteCount += 1;
        break;
      default:
        fail(`journal event type is not allowed: ${record.name}`);
    }
  }
  if (!runStarted || !preflightCompleted || !destinationCreateStarted) fail("journal lifecycle is incomplete");
  if (requireApplyComplete && applyCompleteCount !== 1) fail("journal must contain exactly one apply-complete terminal event before receipt validation");
}

function validateCompletionReceipt(receiptRecord, journalPath, core) {
  const journal = journalFiles(journalPath);
  validateJournalIntegrity(journal, core, { requireApplyComplete: true });
  const receipt = receiptRecord.receipt;
  if (receipt.format !== WORKSPACE_PRESERVATION_QUARANTINE_FORMAT || receipt.schemaVersion !== 1 || receipt.kind !== "completion-receipt" || receipt.status !== "complete") fail("completion receipt format or status is invalid");
  if (receipt.reportSha256 !== core.reportRead.sha256 || receipt.manifestSha256 !== core.manifestRead.sha256 || receipt.policySha256 !== core.policySha256 || String(receipt.head).toLowerCase() !== core.evidenceHead || !samePath(receipt.destination, core.destination) || receipt.sourceCount !== core.sources.length || receipt.mutation !== "same-volume-whole-root-rename-only") fail("completion receipt identity does not match supplied evidence");
  if (receipt.eventCount !== journal.records.length || receipt.eventsSha256 !== eventHash(journal)) fail("completion receipt event hash or count does not match the immutable journal");
  return receipt;
}

function performMoves(core, journalPath, options, journal) {
  let moveCount = 0;
  const started = new Set(journal.records.filter((record) => record.event.type === "move-start").map((record) => record.event.sourceName));
  const completed = new Set(journal.records.filter((record) => ["move-complete", "move-recovered"].includes(record.event.type)).map((record) => record.event.sourceName));
  for (const source of core.sources) {
    const targetPath = path.join(core.destination, source.name);
    const original = optionalCanonical(source.path, `source ${source.name}`, "directory");
    const target = optionalCanonical(targetPath, `destination source ${source.name}`, "directory");
    if (original !== null && target !== null) fail(`source pair is both-present: ${source.name}`);
    if (original === null && target === null) fail(`source pair is both-missing: ${source.name}`);
    if (target !== null) {
      if (!started.has(source.name)) fail(`destination source exists without journal move-start: ${source.name}`);
      if (!completed.has(source.name)) writeEvent(journalPath, "move-recovered", { sourceName: source.name, sourcePath: source.path, destinationPath: targetPath });
      continue;
    }
    if (completed.has(source.name)) fail(`journal says moved but source remains: ${source.name}`);
    if (!started.has(source.name)) writeEvent(journalPath, "move-start", { sourceName: source.name, sourcePath: source.path, destinationPath: targetPath });
    try {
      fs.renameSync(source.path, targetPath);
    } catch (error) {
      fail(`whole-root rename failed for ${source.name}: ${error.message}`);
    }
    moveCount += 1;
    if (options.interruptAfterMoves !== undefined && moveCount >= options.interruptAfterMoves) throw new WorkspacePreservationQuarantineError("injected interruption after whole-root rename");
    writeEvent(journalPath, "move-complete", { sourceName: source.name, sourcePath: source.path, destinationPath: targetPath });
  }
  if (typeof options.beforeFinalCompletionVerification === "function") options.beforeFinalCompletionVerification(core);
  preflightCompleted(core);
  writeEvent(journalPath, "apply-complete", { sourceCount: core.sources.length, destination: core.destination });
  return writeReceipt(journalPath, core, core.sources.length, journalFiles(journalPath).records.length);
}

function hasCompletionReceiptCandidate(journalPath) {
  if (typeof journalPath !== "string" || journalPath.trim() === "") return false;
  try {
    const stats = fs.lstatSync(path.join(path.resolve(journalPath), "completion-receipt.json"));
    return stats.isFile() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

function loadCore(options) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  if (!Number.isFinite(now.getTime())) fail("now must be a valid date");
  const reportRead = readJsonEvidence(options.reportPath, options.reportSha256, "report");
  const manifestRead = readJsonEvidence(options.manifestPath, options.manifestSha256, "manifest");
  const report = reportRead.parsed;
  const manifest = manifestRead.parsed;
  if (report.format !== "tear-workspace-recovery-report" || report.schemaVersion !== 1) fail("report format or schema is invalid");
  const repoRoot = path.resolve(options.repoRoot);
  const policyPath = path.resolve(options.policyPath);
  const policyInspection = inspectCanonical(policyPath, "policy", "file");
  const expectedPolicyPaths = [
    path.join(repoRoot, "preservation", "workspace-recovery-policy.json"),
    path.join(repoRoot, "preservation", "workspace-recovery-second-wave-sources.json"),
  ];
  if (!expectedPolicyPaths.some((expectedPath) => samePath(policyInspection.path, expectedPath))) fail("policy must be a current canonical repository recovery policy");
  const loadedPolicy = readWorkspaceRecoveryPolicyBundle(policyInspection.path);
  if (loadedPolicy.errors.length > 0) fail(`workspace recovery policy is invalid:\n- ${loadedPolicy.errors.join("\n- ")}`);
  if (loadedPolicy.sha256 !== String(report.policySha256 ?? "").toLowerCase()) fail("current policy SHA-256 does not match supplied report");
  if (loadedPolicy.kind === "second-wave") {
    if (report.inputs?.allowlist?.format !== WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_FORMAT || !samePath(report.inputs.allowlist.path, policyInspection.path) || report.inputs.allowlist.sha256 !== loadedPolicy.sha256) fail("second-wave report allowlist provenance does not match the current allowlist");
    if (new Date(report.retainUntilUtc).getTime() < new Date(loadedPolicy.policy.retention.minimumUtc).getTime()) fail(`second-wave retain-until must be on or after ${loadedPolicy.policy.retention.minimumUtc}`);
  } else if (report.inputs?.allowlist !== undefined) {
    fail("first-wave report must not carry second-wave allowlist provenance");
  }
  const repo = verifyRepository(repoRoot, report, manifest, { allowRecordedHeadAncestor: options.resume === true && hasCompletionReceiptCandidate(options.journalPath) });
  const workspace = inspectCanonical(report.inputs?.workspaceRoot, "workspace-root", "directory");
  const temp = inspectCanonical(report.inputs?.tempRoot, "temp-root", "directory");
  const archive = inspectCanonical(report.inputs?.archiveRoot, "archive-root", "directory");
  const group = recoveryGroup(reportRead.path, archive.path, "report");
  if (!samePath(manifestRead.path, path.join(group.path, path.basename(manifestRead.path)))) fail("manifest must be in the report recovery group");
  if (!samePath(manifest.evidence?.externalRecoveryReport?.path, reportRead.path) || manifest.evidence?.externalRecoveryReport?.sha256 !== reportRead.sha256) fail("manifest external report evidence does not match supplied report");
  if (!samePath(manifest.roots?.workspaceRoot, workspace.path) || !samePath(manifest.roots?.tempRoot, temp.path) || !samePath(manifest.roots?.archiveRoot, archive.path)) fail("manifest roots do not match report roots");
  if (report.inputs?.rootArguments !== undefined) {
    for (const [argument, expected] of [["workspace-root", workspace.path], ["temp-root", temp.path], ["archive-root", archive.path]]) {
      if (!samePath(report.inputs.rootArguments[argument], expected)) fail(`report rootArguments.${argument} does not match canonical roots`);
    }
  }
  if (manifest.roots?.rootArguments !== undefined) {
    for (const [argument, expected] of [["workspace-root", workspace.path], ["temp-root", temp.path], ["archive-root", archive.path]]) {
      if (!samePath(manifest.roots.rootArguments[argument], expected)) fail(`manifest rootArguments.${argument} does not match canonical roots`);
    }
  }
  if (!samePath(path.dirname(repo.path), workspace.path) || !samePath(path.dirname(archive.path), workspace.path)) fail("repo and archive roots must be direct workspace children");
  if (isPathInside(workspace.path, temp.path, { allowEqual: true }) || isPathInside(temp.path, workspace.path, { allowEqual: true })) fail("temp-root must be disjoint from workspace-root");
  const roots = { repo, workspace, temp, archive, group, policySha256: loadedPolicy.sha256 };
  const records = sourceRecords(report, manifest, roots, loadedPolicy);
  const destination = path.resolve(manifest.destination?.path ?? "");
  if (!samePath(path.dirname(destination), group.path) && !isPathInside(group.path, destination)) fail("destination is outside recovery group");
  assertNoOverlap("destination", destination, { repo: repo.path, temp: temp.path, report: reportRead.path, manifest: manifestRead.path, ...Object.fromEntries(records.map((source) => [`source:${source.name}`, source.path])) });
  if ([destination, ...records.map((source) => source.path), repo.path].some((root) => !sameVolume(root, destination))) fail("all roots must remain on the same volume");
  const owner = String(options.owner ?? "").trim();
  if (owner === "" || owner !== String(report.owner ?? "").trim() || owner !== String(manifest.owner ?? "").trim()) fail("owner does not match report and manifest");
  const retainUntilUtc = parseRetention(String(options.retainUntil ?? ""), now);
  if (retainUntilUtc !== report.retainUntilUtc || retainUntilUtc !== manifest.retainUntilUtc) fail("retain-until does not match report and manifest");
  const core = { now, reportRead, manifestRead, report, manifest, repo, policyPath, policyBundle: loadedPolicy, policy: loadedPolicy.scanPolicy ?? loadedPolicy.policy, policySha256: loadedPolicy.sha256, workspace, temp, archive, group, sources: records, destination, owner, retainUntilUtc, evidenceHead: repo.evidenceHead };
  validateManifestShape(manifest, reportRead, { ...roots, repo, policySha256: loadedPolicy.sha256 }, records);
  return core;
}

export function runWorkspacePreservationQuarantine(options = {}) {
  for (const field of ["reportPath", "reportSha256", "manifestPath", "manifestSha256", "policyPath", "repoRoot", "owner", "retainUntil", "journalPath"]) {
    if (options[field] === undefined || options[field] === null || String(options[field]).trim() === "") fail(`${field} is required`);
  }
  if (options.apply !== true || options.wholeRootPreservation !== true || options.acknowledgeNoGoProtectedContent !== true) fail("exact --apply, --whole-root-preservation, and --acknowledge-no-go-protected-content acknowledgements are required");
  if (options.restore === true || options.selective === true || options.copy === true || options.delete === true) fail("only apply-only whole-root preservation is supported; restore/selective/copy/delete are refused");
  const core = loadCore(options);
  const journalCandidate = path.resolve(options.journalPath);
  const existingJournal = optionalCanonical(journalCandidate, "journal", "directory") !== null;
  const journalMeta = validateJournalPath(core, journalCandidate, existingJournal);
  if (existingJournal && options.resume !== true) fail("existing journal requires explicit resume");
  if (!existingJournal && options.resume === true) fail("resume requires an existing journal");
  if (!existingJournal) {
    verifyStablePreparedManifest(core, options);
    preflightInitial(core);
    fs.mkdirSync(journalMeta.path);
    writeEvent(journalMeta.path, "run-start", { reportSha256: core.reportRead.sha256, manifestSha256: core.manifestRead.sha256, policySha256: core.policySha256, destination: core.destination, sourceCount: core.sources.length, mode: "apply" });
    writeEvent(journalMeta.path, "preflight-complete", { sourceCount: core.sources.length, destination: core.destination });
    writeEvent(journalMeta.path, "destination-create-start", { destination: core.destination });
    try {
      fs.mkdirSync(core.destination);
    } catch (error) {
      fail(`destination creation failed: ${error.message}`);
    }
    writeEvent(journalMeta.path, "destination-created", { destination: core.destination });
  } else {
    const journal = journalFiles(journalMeta.path);
    validateJournalIntegrity(journal, core);
    validateJournalStart(journal, core);
    const receiptRecord = readReceipt(journalMeta.path);
    if (receiptRecord !== null) {
      preflightCompleted(core);
      return validateCompletionReceipt(receiptRecord, journalMeta.path, core);
    }
    if (journal.records.some((record) => record.event.type === "apply-complete")) {
      preflightCompleted(core);
      return writeReceipt(journalMeta.path, core, core.sources.length, journal.records.length);
    }
    preflightResume(core, journal.records);
    writeEvent(journalMeta.path, "resume-preflight-complete", { destination: core.destination });
  }
  const journal = journalFiles(journalMeta.path);
  return performMoves(core, journalMeta.path, options, journal);
}

function parseArguments(argumentsList) {
  const options = {};
  const seen = new Set();
  const valueFlags = new Map([
    ["--report", "reportPath"],
    ["--report-sha256", "reportSha256"],
    ["--manifest", "manifestPath"],
    ["--manifest-sha256", "manifestSha256"],
    ["--policy", "policyPath"],
    ["--repo-root", "repoRoot"],
    ["--owner", "owner"],
    ["--retain-until", "retainUntil"],
    ["--journal", "journalPath"],
  ]);
  const booleanFlags = new Map([
    ["--apply", "apply"],
    ["--whole-root-preservation", "wholeRootPreservation"],
    ["--acknowledge-no-go-protected-content", "acknowledgeNoGoProtectedContent"],
    ["--resume", "resume"],
  ]);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      options.help = true;
      continue;
    }
    if (["--restore", "--selective", "--copy", "--delete", "--force", "--overwrite"].includes(argument)) fail(`${argument} is refused; this slice is apply-only whole-root preservation`);
    const booleanName = booleanFlags.get(argument);
    if (booleanName !== undefined) {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      options[booleanName] = true;
      continue;
    }
    const optionName = valueFlags.get(argument);
    if (optionName === undefined) fail(`unknown argument: ${argument}`);
    if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
    seen.add(argument);
    const value = argumentsList[++index];
    if (value === undefined || value.startsWith("--")) fail(`${argument} requires a value`);
    options[optionName] = ["reportPath", "manifestPath", "policyPath", "repoRoot", "journalPath"].includes(optionName) ? path.resolve(value) : value;
  }
  if (options.help) return options;
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/apply-workspace-quarantine.mjs --apply --whole-root-preservation --acknowledge-no-go-protected-content --report <report.json> --report-sha256 <sha256> --manifest <manifest.json> --manifest-sha256 <sha256> --policy <policy.json> --repo-root <repo> --owner <id> --retain-until <UTC> --journal <new-journal-dir> [--resume]");
      return;
    }
    console.log(JSON.stringify(runWorkspacePreservationQuarantine(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === path.resolve(import.meta.filename)) main();
