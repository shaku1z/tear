import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { RELEASE_REPOSITORY } from "./release-artifact.mjs";
import { normalizeRepositoryIdentifier } from "./repository-identity.mjs";
import {
  readWorkspaceRecoverySecondWavePolicy,
} from "./report-workspace-recovery.mjs";
import {
  readParentLayoutPolicy,
  validateParentLayoutPolicy,
} from "./check-parent-layout.mjs";

export const DEFERRED_WORKSPACE_DEPENDENCY_FORMAT = "tear-deferred-workspace-dependency-audit";
export const DEFAULT_DEFERRED_SECOND_WAVE_POLICY_RELATIVE_PATH = "preservation/workspace-recovery-second-wave-sources.json";
export const DEFAULT_DEFERRED_PARENT_POLICY_RELATIVE_PATH = "preservation/workspace-parent-layout-policy.json";
export const WINDOWS_IO_REPARSE_TAG_MOUNT_POINT = 0xA0000003;
export const WINDOWS_IO_REPARSE_TAG_SYMLINK = 0xA000000C;

const SOURCE_ID = "second-wave-tear-budget-architecture";
const SOURCE_NAME = "Tear-budget-architecture";
const TARGET_ID = "second-wave-tear-tearscore-normalization";
const TARGET_NAME = "Tear-tearscore-normalization";
const DEPENDENCY_GROUP_ID = "second-wave-dependency-budget-node-modules";
const RELATIVE_DEPENDENCY_PATH = "node_modules";
const HISTORICAL_SOURCE_BYTES = 4_133_063;
const HISTORICAL_TARGET_BYTES = 30_660_424;
const HISTORICAL_COMBINED_BYTES = 34_793_487;
const FULL_SHA_PATTERN = /^[0-9a-f]{40,64}$/iu;
const WINDOWS_NAMESPACE_PREFIXES = ["\\\\?\\", "\\\\??\\"];
const DEFAULT_GIT_POINTER_LIMIT_BYTES = 4096;

export class DeferredWorkspaceDependencyError extends Error {
  constructor(message) {
    super(message);
    this.name = "DeferredWorkspaceDependencyError";
  }
}

function fail(message) {
  throw new DeferredWorkspaceDependencyError(message);
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function isPathInside(root, candidate, { allowEqual = false } = {}) {
  const relative = path.relative(root, candidate);
  if (relative === "") return allowEqual;
  return relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function normalizedRelativePath(root, candidate) {
  const relative = path.relative(root, candidate).replaceAll(path.sep, "/");
  if (
    relative === ""
    || relative.startsWith("/")
    || /^[A-Za-z]:/u.test(relative)
    || relative.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) fail(`unsafe relative path: ${candidate}`);
  return relative;
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readJsonWithSha256(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
  }
  try {
    JSON.parse(raw);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  return { sha256: sha256Text(raw) };
}

function inspectCanonicalDirectory(candidate, label) {
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
    fail(`${label} is not canonical: ${absolute} (${error.code ?? error.message})`);
  }
  if (!samePath(absolute, realPath) || !stats.isDirectory()) fail(`${label} must be a canonical directory: ${absolute}`);
  return { path: absolute, realPath, stats };
}

function inspectEntry(candidate, root, label) {
  let stats;
  try {
    stats = fs.lstatSync(candidate);
  } catch (error) {
    fail(`${label} is missing or unreadable: ${candidate} (${error.code ?? error.message})`);
  }
  if (stats.isSymbolicLink()) {
    return { candidate, stats, realPath: null, reparse: true };
  }
  let realPath;
  try {
    realPath = fs.realpathSync.native(candidate);
  } catch (error) {
    fail(`${label} is not resolvable: ${candidate} (${error.code ?? error.message})`);
  }
  if (!samePath(candidate, realPath)) return { candidate, stats, realPath, reparse: true };
  if (!isPathInside(root, realPath, { allowEqual: true })) fail(`${label} resolves outside its root: ${candidate}`);
  return { candidate, stats, realPath, reparse: false };
}

function entryKind(stats) {
  if (stats === null || stats === undefined) return "unknown";
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  return "other";
}

function runGit(root, argumentsList) {
  const result = spawnSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: 1024 * 1024,
    stdio: "pipe",
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    error: result.error,
  };
}

function gitFailure(result, command) {
  const detail = result.error?.message || result.stderr || result.stdout || "unknown error";
  return `${command} failed: ${String(detail).trim()}`;
}

function gitValue(root, argumentsList, label) {
  const result = runGit(root, argumentsList);
  if (!result.ok) fail(gitFailure(result, label));
  return result.stdout.trim();
}

function formatReparseTag(value) {
  return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
}

function reparseTypeForTag(value) {
  if (value === WINDOWS_IO_REPARSE_TAG_MOUNT_POINT) return "mount-point";
  if (value === WINDOWS_IO_REPARSE_TAG_SYMLINK) return "symbolic-link";
  return "unknown";
}

function normalizeReparseTagProbeResult(result, candidate) {
  const rawValue = typeof result === "number" || typeof result === "string" ? result : result?.value ?? result?.tag;
  const value = typeof rawValue === "string"
    ? (/^0x[0-9a-f]+$/iu.test(rawValue) ? Number.parseInt(rawValue.slice(2), 16) : Number.NaN)
    : rawValue;
  if (!Number.isSafeInteger(value) || value < 0) fail(`reparse tag probe returned an invalid tag for ${candidate} (${String(rawValue)})`);
  return { value, tag: formatReparseTag(value), type: reparseTypeForTag(value) };
}

function queryWindowsReparseTag(candidate) {
  const result = spawnSync("fsutil", ["reparsepoint", "query", candidate], {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    stdio: "pipe",
    windowsHide: true,
  });
  const output = `${String(result.stdout ?? "")}\n${String(result.stderr ?? "")}`;
  if (result.status !== 0) {
    fail(`could not query the Windows reparse tag for ${candidate}: ${String(result.error?.message ?? output).trim()}`);
  }
  const labeled = output.match(/(?:reparse\s+tag\s+value|tag\s+value)\s*:\s*0x([0-9a-f]+)/iu);
  const fallback = labeled === null ? [...output.matchAll(/\b0x([0-9a-f]{8})\b/giu)] : [];
  const rawValue = labeled?.[1] ?? (fallback.length === 1 ? fallback[0][1] : null);
  if (rawValue === null || rawValue === undefined) fail(`could not parse an exact Windows reparse tag for ${candidate} (labeled=${String(labeled?.[1])}, fallback=${fallback.length})`);
  return normalizeReparseTagProbeResult(`0x${rawValue}`, candidate);
}

function verifyCanonicalGame(repoRoot) {
  const root = inspectCanonicalDirectory(repoRoot, "repo-root");
  const git = inspectGitState(root.path, DEFAULT_GIT_POINTER_LIMIT_BYTES);
  if (!git.valid) fail(`repo-root must expose a valid .git entry: ${root.path}`);
  const reportedRoot = path.resolve(gitValue(root.path, ["rev-parse", "--show-toplevel"], "git rev-parse --show-toplevel"));
  if (!samePath(root.path, reportedRoot)) fail(`repo-root is not the canonical Git root: ${root.path}`);

  const originRaw = gitValue(root.path, ["config", "--get", "remote.origin.url"], "git config remote.origin.url");
  const origin = normalizeRepositoryIdentifier(originRaw);
  if (origin !== normalizeRepositoryIdentifier(RELEASE_REPOSITORY)) {
    fail(`repo-root origin must identify ${RELEASE_REPOSITORY}; found ${origin || "missing"}`);
  }

  const status = gitValue(root.path, ["status", "--porcelain=v1", "--untracked-files=all"], "git status");
  const clean = status === "";
  if (!clean) fail(`repo-root must be clean; found ${status}`);
  const branch = gitValue(root.path, ["branch", "--show-current"], "git branch --show-current");
  if (branch !== "main") fail(`repo-root must be on main, found ${branch || "detached HEAD"}`);
  const upstreamResult = runGit(root.path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const upstream = upstreamResult.ok ? upstreamResult.stdout.trim() : "";
  if (upstream !== "origin/main") fail(`main must track origin/main, found ${upstream || "none"}`);
  const head = gitValue(root.path, ["rev-parse", "HEAD"], "git rev-parse HEAD").toLowerCase();
  const originMain = gitValue(root.path, ["rev-parse", "origin/main"], "git rev-parse origin/main").toLowerCase();
  if (!FULL_SHA_PATTERN.test(head) || !FULL_SHA_PATTERN.test(originMain)) fail("canonical main HEADs must be full Git object IDs");
  const divergence = gitValue(root.path, ["rev-list", "--left-right", "--count", "HEAD...origin/main"], "git rev-list HEAD...origin/main");
  const counts = divergence.split(/\s+/u);
  if (head !== originMain || counts.length !== 2 || counts.some((value) => value !== "0")) {
    fail(`main must exactly equal origin/main (ahead=${counts[0] ?? "unknown"}, behind=${counts[1] ?? "unknown"})`);
  }
  return {
    canonicalPath: root.path,
    git,
    origin,
    branch,
    upstream,
    head,
    originMain,
    clean,
    divergence: { ahead: counts[0], behind: counts[1] },
  };
}

function inspectGitState(rootPath, pointerLimitBytes) {
  const pointerPath = path.join(rootPath, ".git");
  let stats;
  try {
    stats = fs.lstatSync(pointerPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        status: "absent",
        kind: "missing",
        path: pointerPath,
        bytes: null,
        valid: false,
        lstat: { status: "absent", kind: "missing", bytes: null, reparse: false },
      };
    }
    return {
      status: "unreadable",
      kind: "unknown",
      path: pointerPath,
      bytes: null,
      valid: false,
      error: error.code ?? error.message,
      lstat: { status: "unreadable", kind: "unknown", bytes: null, reparse: false },
    };
  }
  const lstat = {
    status: "present",
    kind: entryKind(stats),
    bytes: stats.isFile() ? stats.size : null,
    reparse: stats.isSymbolicLink(),
  };
  if (stats.isSymbolicLink()) fail(`deferred root .git is a symlink or reparse point: ${pointerPath}`);
  let realPath;
  try {
    realPath = fs.realpathSync.native(pointerPath);
  } catch (error) {
    fail(`deferred root .git is not resolvable: ${pointerPath} (${error.code ?? error.message})`);
  }
  if (!samePath(pointerPath, realPath)) fail(`deferred root .git is a symlink or reparse point: ${pointerPath}`);
  if (stats.isDirectory()) {
    return { status: "directory", kind: "directory", path: pointerPath, bytes: stats.size, valid: true, lstat };
  }
  if (!stats.isFile()) fail(`deferred root .git has unsupported type: ${pointerPath}`);
  if (stats.size > pointerLimitBytes) fail(`deferred root .git pointer exceeds ${pointerLimitBytes} bytes: ${pointerPath}`);
  let text;
  try {
    text = fs.readFileSync(pointerPath, "utf8");
  } catch (error) {
    fail(`deferred root .git pointer could not be read: ${pointerPath} (${error.message})`);
  }
  const match = text.match(/^gitdir:\s*(.+?)\s*$/imu);
  if (match === null) return { status: "invalid", kind: "file", path: pointerPath, bytes: stats.size, valid: false, target: null, lstat };
  const target = path.resolve(path.dirname(pointerPath), match[1]);
  let targetStats;
  try {
    targetStats = fs.lstatSync(target);
  } catch (error) {
    return { status: "invalid-target", kind: "file", path: pointerPath, bytes: stats.size, valid: false, target, targetExists: false, targetError: error.code ?? "unknown", lstat };
  }
  if (targetStats.isSymbolicLink()) fail(`deferred root .git pointer target is a symlink or reparse point: ${target}`);
  let targetRealPath;
  try {
    targetRealPath = fs.realpathSync.native(target);
  } catch (error) {
    return { status: "invalid-target", kind: "file", path: pointerPath, bytes: stats.size, valid: false, target, targetExists: true, targetError: error.code ?? "unknown", lstat };
  }
  if (!samePath(target, targetRealPath)) fail(`deferred root .git pointer target is a symlink or reparse point: ${target}`);
  return {
    status: targetStats.isDirectory() ? "valid-target" : "invalid-target",
    kind: "file",
    path: pointerPath,
    bytes: stats.size,
    valid: targetStats.isDirectory(),
    target,
    targetExists: true,
    targetKind: entryKind(targetStats),
    lstat,
  };
}

function stripWindowsNamespace(value) {
  let result = String(value).trim();
  if (result.startsWith("\\\\?\\UNC\\")) result = `\\\\${result.slice(8)}`;
  else for (const prefix of WINDOWS_NAMESPACE_PREFIXES) if (result.startsWith(prefix)) result = result.slice(prefix.length);
  return result;
}

function inspectExactSourceJunction(sourcePath, targetPath, reparseTagProbe) {
  let sourceStats;
  try {
    sourceStats = fs.lstatSync(sourcePath);
  } catch (error) {
    fail(`deferred source junction is missing: ${sourcePath} (${error.code ?? error.message})`);
  }
  let sourceRealPath;
  try { sourceRealPath = fs.realpathSync.native(sourcePath); } catch (error) { fail(`deferred source junction is not resolvable: ${sourcePath} (${error.code ?? error.message})`); }
  if (!sourceStats.isSymbolicLink() && samePath(sourcePath, sourceRealPath)) fail(`deferred source node_modules must be the exact opaque junction/reparse: ${sourcePath}`);
  let reparse = { value: null, tag: null, type: process.platform === "win32" ? "unverified" : "symlink-test-fixture" };
  const probe = reparseTagProbe ?? (process.platform === "win32" ? queryWindowsReparseTag : null);
  if (probe !== null) {
    reparse = normalizeReparseTagProbeResult(probe(sourcePath), sourcePath);
    if (reparse.value !== WINDOWS_IO_REPARSE_TAG_MOUNT_POINT) {
      fail(`deferred source node_modules must be a Windows mount-point junction (tag ${formatReparseTag(WINDOWS_IO_REPARSE_TAG_MOUNT_POINT)}); found ${reparse.tag} ${reparse.type}: ${sourcePath}`);
    }
  } else if (process.platform === "win32") {
    fail(`deferred source node_modules reparse tag could not be verified: ${sourcePath}`);
  }
  let rawTarget;
  try {
    rawTarget = fs.readlinkSync(sourcePath, "utf8");
  } catch (error) {
    fail(`deferred source junction target could not be read: ${sourcePath} (${error.code ?? error.message})`);
  }
  const normalizedTarget = stripWindowsNamespace(rawTarget);
  const resolvedLinkTarget = path.isAbsolute(normalizedTarget)
    ? path.normalize(normalizedTarget)
    : path.resolve(path.dirname(sourcePath), normalizedTarget);
  if (!samePath(resolvedLinkTarget, path.resolve(targetPath))) {
    fail(`deferred source junction must use the exact target path ${targetPath}; readlink=${rawTarget}`);
  }
  let sourcePhysicalTarget;
  let linkPhysicalTarget;
  let expectedTarget;
  try {
    sourcePhysicalTarget = fs.realpathSync.native(sourcePath);
    linkPhysicalTarget = fs.realpathSync.native(resolvedLinkTarget);
    expectedTarget = fs.realpathSync.native(targetPath);
  } catch (error) {
    fail(`deferred source junction target could not be resolved physically: ${error.message}`);
  }
  if (!samePath(sourcePhysicalTarget, expectedTarget) || !samePath(linkPhysicalTarget, expectedTarget)) {
    fail(`deferred source junction must target ${targetPath}; readlink=${rawTarget}`);
  }
  return {
    status: "refused-opaque",
    kind: process.platform === "win32" ? "junction-or-reparse" : "symlink-test-fixture",
    path: sourcePath,
    relativePath: RELATIVE_DEPENDENCY_PATH,
    readlink: rawTarget,
    resolvedLinkTarget,
    physicalTarget: sourcePhysicalTarget,
    expectedPhysicalTarget: expectedTarget,
    targetMatches: true,
    reparseTag: reparse.tag,
    reparseTagValue: reparse.value,
    reparseType: reparse.type,
  };
}

function protectedMatch(relativePath, policy) {
  const segments = relativePath.replaceAll("\\", "/").split("/");
  const segment = policy.protected.segments.find((candidate) => segments.some((value) => value.toLowerCase() === String(candidate).toLowerCase()));
  if (segment !== undefined) return { reason: "protected-segment", value: segment };
  const pattern = policy.protected.namePatterns.find((candidate) => segments.some((value) => new RegExp(candidate, "iu").test(value)));
  return pattern === undefined ? null : { reason: "protected-name-pattern", value: pattern };
}

function scanRoot({ rootPath, role, policy, budget, sourceJunction, targetNodeModules }) {
  const root = inspectCanonicalDirectory(rootPath, `${role} root`);
  const gitState = inspectGitState(root.path, policy.limits.maxPointerBytes);
  const entries = [];
  const seenRelativePaths = new Set();
  const summary = {
    status: "scanned",
    scannedEntries: 0,
    fileEntries: 0,
    protectedEntries: 0,
    refusedEntries: 0,
    observedBytes: 0,
  };

  function accountEntry(relativePath) {
    const key = relativePath.toLowerCase();
    if (seenRelativePaths.has(key)) fail(`case-insensitive deferred source path collision: ${relativePath}`);
    seenRelativePaths.add(key);
    summary.scannedEntries += 1;
    budget.entries += 1;
    if (budget.entries > policy.limits.maxEntries) fail(`deferred dependency audit exceeds maxEntries ${policy.limits.maxEntries}`);
  }

  function accountBytes(bytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) fail("deferred dependency audit encountered an invalid file size");
    summary.observedBytes += bytes;
    budget.bytes += bytes;
    if (budget.bytes > policy.limits.maxBytes) fail(`deferred dependency audit exceeds maxBytes ${policy.limits.maxBytes}`);
  }

  function addEntry({ candidate, inspection, relativePath, decision, reasonCodes, countAsFile = false }) {
    accountEntry(relativePath);
    const bytes = inspection.stats.isFile() ? inspection.stats.size : null;
    if (bytes !== null && bytes > policy.limits.maxSingleFileBytes) {
      fail(`${role} file exceeds maxSingleFileBytes ${policy.limits.maxSingleFileBytes}: ${candidate}`);
    }
    entries.push({
      relativePath,
      absolutePath: candidate,
      kind: entryKind(inspection.stats),
      bytes,
      decision,
      reasonCodes,
    });
    if (countAsFile) summary.fileEntries += 1;
    if (decision === "protected") summary.protectedEntries += 1;
    if (decision === "refused") summary.refusedEntries += 1;
    if (bytes !== null) accountBytes(bytes);
  }

  function visit(directory, depth) {
    if (depth > policy.limits.maxDepth) fail(`deferred dependency audit exceeds maxDepth ${policy.limits.maxDepth}: ${directory}`);
    let children;
    try {
      children = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      fail(`cannot enumerate deferred root ${directory}: ${error.message}`);
    }
    for (const child of children) {
      const candidate = path.join(directory, child.name);
      const relativePath = normalizedRelativePath(root.path, candidate);
      if (role === "source" && relativePath.toLowerCase() === RELATIVE_DEPENDENCY_PATH.toLowerCase()) {
        if (sourceJunction === null) fail("source junction relation was not initialized");
        accountEntry(relativePath);
        entries.push({ ...sourceJunction, decision: "refused", reasonCodes: ["symlink-or-reparse", "opaque-deferred-dependency"] });
        summary.refusedEntries += 1;
        continue;
      }
      const inspection = inspectEntry(candidate, root.path, `${role} entry`);
      if (inspection.reparse) fail(`${role} contains an unexpected symlink or reparse point: ${candidate}`);
      const match = protectedMatch(relativePath, policy);
      if (match !== null) {
        addEntry({
          candidate,
          inspection,
          relativePath,
          decision: "protected",
          reasonCodes: [match.reason, ...(relativePath.toLowerCase() === ".git" ? ["nested-git"] : [])],
        });
        continue;
      }
      if (inspection.stats.isDirectory()) {
        visit(candidate, depth + 1);
        continue;
      }
      if (!inspection.stats.isFile()) fail(`${role} contains an unsupported filesystem entry: ${candidate}`);
      addEntry({ candidate, inspection, relativePath, decision: "ordinary", reasonCodes: [], countAsFile: true });
    }
  }

  if (role === "target" && targetNodeModules === null) fail("target protected node_modules was not initialized");
  visit(root.path, 0);
  return {
    role,
    path: root.path,
    realPath: root.realPath,
    git: gitState,
    entries,
    summary,
  };
}

function canonicalPolicyPath(repoRoot, suppliedPath, relativePath, label) {
  const expected = path.resolve(repoRoot, relativePath);
  const actual = path.resolve(suppliedPath ?? expected);
  if (!samePath(actual, expected)) fail(`${label} must be the tracked repository policy: ${expected}`);
  let stats;
  try {
    stats = fs.lstatSync(actual);
  } catch (error) {
    fail(`${label} is missing or unreadable: ${actual} (${error.code ?? error.message})`);
  }
  if (stats.isSymbolicLink() || !stats.isFile()) fail(`${label} must be a canonical regular file: ${actual}`);
  let realPath;
  try {
    realPath = fs.realpathSync.native(actual);
  } catch (error) {
    fail(`${label} is not canonical: ${actual} (${error.code ?? error.message})`);
  }
  if (!samePath(actual, realPath)) fail(`${label} must be a canonical regular file: ${actual}`);
  return actual;
}

function loadAndBindPolicies(repoRoot, options) {
  const secondWavePath = canonicalPolicyPath(repoRoot, options.secondWavePolicyPath, DEFAULT_DEFERRED_SECOND_WAVE_POLICY_RELATIVE_PATH, "second-wave policy");
  const parentPolicyPath = canonicalPolicyPath(repoRoot, options.parentPolicyPath, DEFAULT_DEFERRED_PARENT_POLICY_RELATIVE_PATH, "parent-layout policy");
  const secondLoaded = readWorkspaceRecoverySecondWavePolicy(secondWavePath);
  if (secondLoaded.errors.length > 0) fail(`workspace recovery second-wave policy is invalid:\n- ${secondLoaded.errors.join("\n- ")}`);
  const parentLoaded = readParentLayoutPolicy(parentPolicyPath);
  const parentErrors = [...parentLoaded.errors, ...validateParentLayoutPolicy(parentLoaded.policy)];
  if (parentErrors.length > 0) fail(`workspace parent-layout policy is invalid:\n- ${[...new Set(parentErrors)].join("\n- ")}`);

  const deferred = new Map(secondLoaded.policy.deferredSources.map((record) => [record.id, record]));
  const source = deferred.get(SOURCE_ID);
  const target = deferred.get(TARGET_ID);
  const group = secondLoaded.policy.dependencyGroup;
  const relation = parentLoaded.policy.reparse.deferredAuditRelation;
  if (source?.name !== SOURCE_NAME || source?.rootArgument !== "temp-root" || source?.relativePath !== RELATIVE_DEPENDENCY_PATH || source?.targetSourceId !== TARGET_ID || source?.targetRelativePath !== RELATIVE_DEPENDENCY_PATH || source?.observedBytes !== HISTORICAL_SOURCE_BYTES || source?.currentOperation !== "deferred") {
    fail("second-wave policy does not bind the exact deferred source and historical bytes");
  }
  if (target?.name !== TARGET_NAME || target?.rootArgument !== "temp-root" || target?.observedBytes !== HISTORICAL_TARGET_BYTES || target?.currentOperation !== "deferred") {
    fail("second-wave policy does not bind the exact deferred target and historical bytes");
  }
  if (group?.id !== DEPENDENCY_GROUP_ID || JSON.stringify(group.sourceIds) !== JSON.stringify([SOURCE_ID, TARGET_ID]) || group.junctionSourceId !== SOURCE_ID || group.junctionRelativePath !== RELATIVE_DEPENDENCY_PATH || group.targetSourceId !== TARGET_ID || group.targetRelativePath !== RELATIVE_DEPENDENCY_PATH || group.auditedObservedBytes !== HISTORICAL_COMBINED_BYTES || group.currentOperation !== "deferred") {
    fail("second-wave policy does not bind the exact dependency group relation");
  }
  if (relation?.status !== "deferred" || relation?.operation !== "audit-only" || relation?.auditVisible !== true || relation?.move !== false || relation?.kind !== "junction" || relation?.source?.exactName !== SOURCE_NAME || relation?.source?.relativePath !== RELATIVE_DEPENDENCY_PATH || relation?.target?.exactName !== TARGET_NAME || relation?.target?.relativePath !== RELATIVE_DEPENDENCY_PATH) {
    fail("parent-layout policy does not bind the exact deferred junction relation");
  }
  return {
    secondWave: secondLoaded,
    parent: parentLoaded,
    source,
    target,
    group,
    relation,
  };
}

function assertDisjointRoots(roots) {
  const entries = Object.entries(roots);
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    const [leftName, left] = entries[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const [rightName, right] = entries[rightIndex];
      if (samePath(left.path, right.path) || isPathInside(left.path, right.path) || isPathInside(right.path, left.path)) {
        fail(`${leftName} and ${rightName} roots overlap or alias`);
      }
    }
  }
}

function inspectOutputPath(outputPath, archiveRoot, scannedRoots) {
  const absolute = path.resolve(outputPath);
  if (!absolute.toLowerCase().endsWith(".json")) fail("output must end with .json");
  if (!isPathInside(archiveRoot.path, absolute)) fail("output must be inside archive-root");
  for (const [label, root] of Object.entries(scannedRoots)) {
    if (isPathInside(root.path, absolute, { allowEqual: true })) fail(`output must be outside ${label}`);
  }
  try {
    fs.lstatSync(absolute);
    fail(`output already exists; refusing overwrite: ${absolute}`);
  } catch (error) {
    if (error instanceof DeferredWorkspaceDependencyError) throw error;
    if (error.code !== "ENOENT") fail(`output could not be inspected: ${error.message}`);
  }
  let parent = path.dirname(absolute);
  while (true) {
    if (!isPathInside(archiveRoot.path, parent, { allowEqual: true })) fail("output parent must remain inside archive-root");
    if (samePath(parent, archiveRoot.path)) break;
    let stats;
    try {
      stats = fs.lstatSync(parent);
    } catch (error) {
      fail(`output parent must already exist: ${parent} (${error.code ?? error.message})`);
    }
    if (stats.isSymbolicLink()) fail(`output parent is a symlink or reparse point: ${parent}`);
    const real = fs.realpathSync.native(parent);
    if (!samePath(parent, real) || !stats.isDirectory()) fail(`output parent must be a canonical directory: ${parent}`);
    parent = path.dirname(parent);
  }
  return absolute;
}

export function runDeferredWorkspaceDependencyAudit(options = {}) {
  for (const field of ["repoRoot", "tempRoot", "archiveRoot", "outputPath"]) {
    if (options[field] === undefined || options[field] === null || String(options[field]).trim() === "") fail(`${field} is required`);
  }
  const repo = verifyCanonicalGame(options.repoRoot);
  const temp = inspectCanonicalDirectory(options.tempRoot, "temp-root");
  const archive = inspectCanonicalDirectory(options.archiveRoot, "archive-root");
  assertDisjointRoots({ repoRoot: { path: repo.canonicalPath }, tempRoot: temp, archiveRoot: archive });
  const policies = loadAndBindPolicies(repo.canonicalPath, options);
  const sourceRoot = inspectCanonicalDirectory(path.join(temp.path, SOURCE_NAME), SOURCE_NAME);
  const targetRoot = inspectCanonicalDirectory(path.join(temp.path, TARGET_NAME), TARGET_NAME);
  if (path.basename(sourceRoot.path) !== SOURCE_NAME || path.basename(targetRoot.path) !== TARGET_NAME) fail("deferred source and target names must be exact");
  const targetNodeModulesPath = path.join(targetRoot.path, RELATIVE_DEPENDENCY_PATH);
  let targetNodeModulesInspection;
  try {
    targetNodeModulesInspection = inspectEntry(targetNodeModulesPath, targetRoot.path, "target node_modules");
  } catch (error) {
    if (error instanceof DeferredWorkspaceDependencyError && /missing or unreadable/u.test(error.message)) fail("target node_modules is missing");
    throw error;
  }
  if (targetNodeModulesInspection.reparse || !targetNodeModulesInspection.stats.isDirectory()) fail("target node_modules must be a normal protected directory");
  const sourceNodeModulesPath = path.join(sourceRoot.path, RELATIVE_DEPENDENCY_PATH);
  const sourceJunction = inspectExactSourceJunction(sourceNodeModulesPath, targetNodeModulesPath, options.reparseTagProbe);
  const budget = { entries: 0, bytes: 0 };
  const sourceScan = scanRoot({ rootPath: sourceRoot.path, role: "source", policy: policies.secondWave.scanPolicy, budget, sourceJunction, targetNodeModules: null });
  const targetScan = scanRoot({ rootPath: targetRoot.path, role: "target", policy: policies.secondWave.scanPolicy, budget, sourceJunction: null, targetNodeModules: targetNodeModulesInspection });
  const current = {
    sourceObservedBytes: sourceScan.summary.observedBytes,
    targetObservedBytes: targetScan.summary.observedBytes,
    combinedObservedBytes: sourceScan.summary.observedBytes + targetScan.summary.observedBytes,
  };
  const historical = {
    sourceObservedBytes: HISTORICAL_SOURCE_BYTES,
    targetObservedBytes: HISTORICAL_TARGET_BYTES,
    combinedObservedBytes: HISTORICAL_COMBINED_BYTES,
  };
  const discrepancies = [];
  for (const field of Object.keys(historical)) {
    if (current[field] !== historical[field]) discrepancies.push(`${field}: current ${current[field]} != historical ${historical[field]}`);
  }
  const status = discrepancies.length === 0 ? "historical-sizing-match" : "stale-or-unexplained";
  const report = {
    format: DEFERRED_WORKSPACE_DEPENDENCY_FORMAT,
    schemaVersion: 1,
    kind: "metadata-only-read-only-audit",
    generatedAtUtc: new Date(options.now ?? Date.now()).toISOString(),
    repository: RELEASE_REPOSITORY,
    mutation: {
      mode: "report-only",
      writes: false,
      fetch: false,
      payloadHashes: "none",
      moves: false,
      deletes: false,
      deploy: false,
    },
    inputs: {
      repoRoot: repo.canonicalPath,
      tempRoot: temp.path,
      archiveRoot: archive.path,
      policies: {
        secondWave: { path: policies.secondWave.path, sha256: policies.secondWave.sha256 },
        parentLayout: { path: policies.parent.path, sha256: readJsonWithSha256(policies.parent.path, "parent-layout policy").sha256 },
      },
    },
    repositoryState: repo,
    policyBinding: {
      source: { id: policies.source.id, name: policies.source.name, rootArgument: policies.source.rootArgument, relativePath: policies.source.relativePath, observedBytes: policies.source.observedBytes },
      target: { id: policies.target.id, name: policies.target.name, rootArgument: policies.target.rootArgument, relativePath: policies.group.targetRelativePath, observedBytes: policies.target.observedBytes },
      dependencyGroup: { id: policies.group.id, sourceIds: [...policies.group.sourceIds], auditedObservedBytes: policies.group.auditedObservedBytes },
      parentRelation: policies.relation,
    },
    dependency: {
      groupId: DEPENDENCY_GROUP_ID,
      relation: sourceJunction,
      historical,
      current,
    },
    roots: [sourceScan, targetScan],
    summary: {
      status,
      discrepancies,
      scannedEntries: budget.entries,
      observedBytes: current.combinedObservedBytes,
      payloadHashes: "none",
      sourceObservedBytes: current.sourceObservedBytes,
      targetObservedBytes: current.targetObservedBytes,
      sizingComparison: {
        basis: "ordinary-file-byte-totals-only",
        contentCompared: false,
        pathsCompared: false,
        mtimesCompared: false,
        payloadHashes: "none",
        equalTotalsDoNotProve: ["content-equivalence", "path-equivalence", "mtime-equivalence"],
      },
    },
    restoreGuidance: {
      status: "audit-only",
      instructions: [
        "This audit performs no move, copy, overwrite, deletion, fetch, ref mutation, or deployment.",
        "historical-sizing-match compares only ordinary-file byte totals; equal totals do not prove content, path, or mtime equivalence, and payload hashes are none.",
        "The source node_modules reparse is recorded as opaque and refused; it is never traversed.",
        "Any later preservation requires a separately approved opaque-reparse operation that retains both dependency roots.",
      ],
    },
  };
  const output = inspectOutputPath(options.outputPath, archive, {
    repoRoot: { path: repo.canonicalPath },
    tempRoot: temp,
    sourceRoot,
    targetRoot,
  });
  try {
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    fail(`could not write new-only report: ${error.message}`);
  }
  return { ...report, outputPath: output };
}

function parseArguments(argumentsList) {
  const options = {};
  const valueFlags = new Map([
    ["--repo-root", "repoRoot"],
    ["--temp-root", "tempRoot"],
    ["--archive-root", "archiveRoot"],
    ["--output", "outputPath"],
  ]);
  const seen = new Set();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      options.help = true;
      continue;
    }
    const field = valueFlags.get(argument);
    if (field === undefined) fail(`unknown argument: ${argument}`);
    if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
    seen.add(argument);
    const value = argumentsList[++index];
    if (value === undefined || value.startsWith("--") || value.trim() === "") fail(`${argument} requires a value`);
    options[field] = path.resolve(value);
  }
  if (!options.help) for (const field of ["repoRoot", "tempRoot", "archiveRoot", "outputPath"]) if (options[field] === undefined) fail(`${field} is required`);
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/report-deferred-workspace-dependency.mjs --repo-root <repo> --temp-root <temp> --archive-root <archive> --output <new-report.json>");
      return;
    }
    console.log(JSON.stringify(runDeferredWorkspaceDependencyAudit(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) main();
