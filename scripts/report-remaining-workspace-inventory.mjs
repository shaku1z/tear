import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { RELEASE_REPOSITORY } from "./release-artifact.mjs";
import { normalizeRepositoryIdentifier } from "./repository-identity.mjs";

export const DEFAULT_REMAINING_WORKSPACE_POLICY_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "preservation",
  "remaining-workspace-inventory-policy.json",
);
export const REMAINING_WORKSPACE_INVENTORY_FORMAT = "tear-remaining-workspace-inventory";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/u;

export class RemainingWorkspaceInventoryError extends Error {
  constructor(message) {
    super(message);
    this.name = "RemainingWorkspaceInventoryError";
  }
}

function fail(message) {
  throw new RemainingWorkspaceInventoryError(message);
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

function timestampUtc(milliseconds) {
  const value = new Date(milliseconds);
  if (!Number.isFinite(value.getTime())) fail("filesystem timestamp is invalid");
  return value.toISOString();
}

function metadata(stats) {
  return {
    kind: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : stats.isSymbolicLink() ? "symlink" : "other",
    bytes: Number.isSafeInteger(stats.size) ? stats.size : null,
    atimeUtc: timestampUtc(stats.atimeMs),
    mtimeUtc: timestampUtc(stats.mtimeMs),
    birthtimeUtc: timestampUtc(stats.birthtimeMs),
  };
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
  return { path: absolute, realPath, metadata: metadata(stats) };
}

function inspectImmediateEntry(root, name) {
  const absolute = path.join(root, name);
  let stats;
  try {
    stats = fs.lstatSync(absolute);
  } catch (error) {
    return { path: absolute, name, status: "refused", refusal: `unreadable:${error.code ?? "unknown"}` };
  }
  const result = { path: absolute, name, status: "available", metadata: metadata(stats) };
  if (stats.isSymbolicLink()) return { ...result, status: "refused", refusal: "symlink-or-reparse", git: null };
  try {
    const realPath = fs.realpathSync.native(absolute);
    if (!samePath(absolute, realPath)) return { ...result, status: "refused", refusal: "symlink-or-reparse", git: null };
    result.realPath = realPath;
  } catch (error) {
    return { ...result, status: "refused", refusal: `unresolvable:${error.code ?? "unknown"}`, git: null };
  }
  return result;
}

function runGit(root, argumentsList, maxOutputBytes) {
  const result = spawnSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: maxOutputBytes,
    stdio: "pipe",
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function commandValue(root, argumentsList, maxOutputBytes) {
  const result = runGit(root, argumentsList, maxOutputBytes);
  return result.ok ? result.stdout.trim() : null;
}

function redactRemote(value) {
  return String(value).replace(/:\/\/[^/@\s]+@/u, "://<redacted>@").replace(/^[^@/\s]+@([^:]+):/u, "$1:");
}

function normalizedRemote(value) {
  const redacted = redactRemote(value);
  const identity = normalizeRepositoryIdentifier(redacted);
  return identity || null;
}

function inspectGitPointer(root, maxPointerBytes) {
  const pointerPath = path.join(root, ".git");
  let stats;
  try {
    stats = fs.lstatSync(pointerPath);
  } catch (error) {
    if (error.code === "ENOENT") return { status: "absent" };
    return { status: `unreadable:${error.code ?? "unknown"}` };
  }
  if (stats.isSymbolicLink()) return { status: "symlink-or-reparse" };
  if (stats.isDirectory()) return { status: "directory", bytes: stats.size };
  if (!stats.isFile()) return { status: "unsupported", bytes: stats.size };
  if (stats.size > maxPointerBytes) return { status: "pointer-too-large", bytes: stats.size };
  let text;
  try {
    text = fs.readFileSync(pointerPath, "utf8");
  } catch (error) {
    return { status: `unreadable:${error.code ?? "unknown"}`, bytes: stats.size };
  }
  const targetMatch = text.match(/^gitdir:\s*(.+?)\s*$/imu);
  if (targetMatch === null) return { status: "invalid", bytes: stats.size };
  const target = path.resolve(root, targetMatch[1]);
  let targetStats;
  try {
    targetStats = fs.lstatSync(target);
  } catch (error) {
    return { status: "invalid-target", bytes: stats.size, targetExists: false, targetError: error.code ?? "unknown" };
  }
  return {
    status: targetStats.isDirectory() && !targetStats.isSymbolicLink() ? "valid-target" : "invalid-target",
    bytes: stats.size,
    targetExists: true,
    targetKind: targetStats.isDirectory() ? "directory" : targetStats.isFile() ? "file" : "other",
  };
}

function inspectGit(root, policy) {
  const maxOutputBytes = policy.limits.maxGitOutputBytes;
  const pointer = inspectGitPointer(root, policy.limits.maxPointerBytes);
  const workTree = commandValue(root, ["rev-parse", "--is-inside-work-tree"], maxOutputBytes);
  const bare = commandValue(root, ["rev-parse", "--is-bare-repository"], maxOutputBytes);
  if (workTree !== "true" && bare !== "true") {
    return { kind: "non-git", gitPointer: pointer };
  }
  const mode = bare === "true" ? "bare" : "worktree";
  const topLevel = commandValue(root, ["rev-parse", "--show-toplevel"], maxOutputBytes);
  const gitDirectory = commandValue(root, ["rev-parse", "--git-dir"], maxOutputBytes);
  const head = commandValue(root, ["rev-parse", "HEAD"], maxOutputBytes);
  const branch = commandValue(root, ["branch", "--show-current"], maxOutputBytes);
  const upstream = commandValue(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], maxOutputBytes);
  const statusResult = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"], maxOutputBytes);
  const remotes = [];
  const remoteNames = commandValue(root, ["remote"], maxOutputBytes)?.split(/\r?\n/u).filter(Boolean) ?? [];
  for (const name of remoteNames) {
    const urls = commandValue(root, ["remote", "get-url", "--all", name], maxOutputBytes)?.split(/\r?\n/u).filter(Boolean) ?? [];
    remotes.push({ name, identities: [...new Set(urls.map(normalizedRemote).filter(Boolean))] });
  }
  const origin = remotes.find((remote) => remote.name === "origin")?.identities[0] ?? null;
  const mergeBaseResult = runGit(root, ["merge-base", "HEAD", "origin/main"], maxOutputBytes);
  const divergenceResult = runGit(root, ["rev-list", "--left-right", "--count", "HEAD...origin/main"], maxOutputBytes);
  const divergence = divergenceResult.ok ? divergenceResult.stdout.trim().split(/\s+/u) : null;
  return {
    kind: statusResult.error?.code === "ENOBUFS" ? "git-output-limit" : mode,
    mode,
    gitPointer: pointer,
    topLevel,
    gitDirectory,
    head: FULL_SHA_PATTERN.test(String(head)) ? head.toLowerCase() : head,
    branch: branch || null,
    upstream: upstream || null,
    status: statusResult.ok ? (statusResult.stdout.trim() === "" ? "clean" : "dirty") : "unreadable",
    changedEntryCount: statusResult.ok ? (statusResult.stdout.trim() === "" ? 0 : statusResult.stdout.trim().split(/\r?\n/u).length) : null,
    remotes,
    origin,
    mergeBase: mergeBaseResult.ok && FULL_SHA_PATTERN.test(mergeBaseResult.stdout.trim()) ? mergeBaseResult.stdout.trim().toLowerCase() : null,
    mergeBaseStatus: mergeBaseResult.ok ? "available" : "unavailable",
    divergence: divergence?.length === 2 ? { ahead: divergence[0], behind: divergence[1] } : null,
  };
}

function readPolicy(policyPath) {
  const absolute = path.resolve(policyPath);
  let raw;
  try {
    raw = fs.readFileSync(absolute, "utf8");
  } catch (error) {
    fail(`policy could not be read: ${error.message}`);
  }
  let policy;
  try {
    policy = JSON.parse(raw);
  } catch (error) {
    fail(`policy is not valid JSON: ${error.message}`);
  }
  const errors = [];
  if (policy?.format !== "tear-remaining-workspace-inventory-policy") errors.push("format is invalid");
  if (policy?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (policy?.repository !== RELEASE_REPOSITORY) errors.push(`repository must be ${RELEASE_REPOSITORY}`);
  if (policy?.boundary?.fetch !== false || policy?.boundary?.mutation !== "report-only" || policy?.boundary?.recurseNonGit !== false || policy?.boundary?.hashPayloads !== false || policy?.boundary?.readGitMetadataOnly !== true) errors.push("boundary must remain read-only and metadata-only");
  if (policy?.roots?.repoAndArchiveDirectChildrenOfWorkspace !== true || policy?.roots?.tempDisjointFromWorkspace !== true) errors.push("root layout boundaries are invalid");
  const expectedCanonical = {
    game: { exactName: "Tear", repository: "shaku1z/tear", branch: "main", upstream: "origin/main" },
    music: { exactName: "tear-score", repository: "shaku1z/tear-music", branch: "main", upstream: "origin/main" },
    wiki: { exactName: "tear-wiki", repository: "shaku1z/tear-wiki", branch: "main", upstream: "origin/main" },
    oracle: { exactName: "Tear-oracle", repository: "shaku1z/tear", role: "comparison-only" },
  };
  for (const [name, expected] of Object.entries(expectedCanonical)) {
    for (const [field, value] of Object.entries(expected)) {
      if (policy?.canonical?.[name]?.[field] !== value) errors.push(`canonical.${name}.${field} must be ${value}`);
    }
  }
  if (!/^[0-9a-f]{7,40}$/iu.test(String(policy?.canonical?.oracle?.lockedCommit ?? ""))) errors.push("canonical.oracle.lockedCommit must be a hexadecimal commit prefix");
  if (!Number.isSafeInteger(policy?.limits?.maxImmediateChildren) || policy.limits.maxImmediateChildren < 1) errors.push("limits.maxImmediateChildren is invalid");
  if (!Number.isSafeInteger(policy?.limits?.maxGitOutputBytes) || policy.limits.maxGitOutputBytes < 4096) errors.push("limits.maxGitOutputBytes is invalid");
  if (!Number.isSafeInteger(policy?.limits?.maxPointerBytes) || policy.limits.maxPointerBytes < 1) errors.push("limits.maxPointerBytes is invalid");
  for (const [category, patterns] of Object.entries(policy.classification ?? {})) {
    if (category === "tearRelated" || category === "archiveGroup") continue;
    if (!Array.isArray(patterns)) errors.push(`classification.${category} must be an array`);
    else for (const pattern of patterns) {
      try { new RegExp(pattern, "iu"); } catch (error) { errors.push(`classification.${category} contains invalid regex: ${error.message}`); }
    }
  }
  try { new RegExp(policy?.classification?.tearRelated, "iu"); } catch (error) { errors.push(`classification.tearRelated is invalid: ${error.message}`); }
  try { new RegExp(policy?.classification?.archiveGroup, "iu"); } catch (error) { errors.push(`classification.archiveGroup is invalid: ${error.message}`); }
  if (/([A-Za-z]:[\\/]|(?:^|[\\/])Users(?:[\\/]|$)|Desktop)/iu.test(raw)) errors.push("policy must not contain machine-specific absolute paths");
  if (errors.length > 0) fail(`remaining workspace inventory policy is invalid:\n- ${errors.join("\n- ")}`);
  return { policy, sha256: createHash("sha256").update(raw, "utf8").digest("hex"), path: absolute };
}

function requireCanonicalPolicy(policyPath, repoRoot) {
  const expected = path.join(repoRoot, "preservation", "remaining-workspace-inventory-policy.json");
  if (!samePath(policyPath, expected)) fail("policy must be the tracked repository preservation policy");
  return readPolicy(policyPath);
}

function verifyCanonicalGame(repoRoot, workspaceRoot, policy) {
  const root = inspectCanonicalDirectory(repoRoot, "repo-root");
  if (!samePath(path.dirname(root.path), workspaceRoot) || path.basename(root.path) !== policy.canonical.game.exactName) fail("repo-root must be the canonical Tear direct child of workspace-root");
  const git = inspectGit(root.path, policy);
  if (git.kind !== "worktree" || git.mode !== "worktree") fail("repo-root must be a readable Git worktree");
  if (normalizeRepositoryIdentifier(git.origin) !== normalizeRepositoryIdentifier(policy.canonical.game.repository)) fail(`repo-root origin must identify ${policy.canonical.game.repository}`);
  if (git.status !== "clean") fail("repo-root must be clean");
  if (git.branch !== policy.canonical.game.branch || git.upstream !== policy.canonical.game.upstream) fail("repo-root must be clean main tracking origin/main");
  if (!FULL_SHA_PATTERN.test(String(git.head)) || git.head !== commandValue(root.path, ["rev-parse", "origin/main"], policy.limits.maxGitOutputBytes)?.toLowerCase()) fail("repo-root main must exactly equal origin/main");
  if (git.divergence === null || git.divergence.ahead !== "0" || git.divergence.behind !== "0") fail("repo-root main must have zero divergence from origin/main");
  return { ...root, git };
}

function parseWorktreeList(text) {
  const entries = [];
  let current = null;
  for (const line of text.split(/\r?\n/u)) {
    if (line === "") continue;
    if (line.startsWith("worktree ")) {
      if (current !== null) entries.push(current);
      current = { path: path.resolve(line.slice("worktree ".length)), bare: false, head: null, branch: null, locked: false, lockReason: null };
    } else if (current !== null && line === "bare") {
      current.bare = true;
    } else if (current !== null && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim().toLowerCase();
    } else if (current !== null && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).trim();
    } else if (current !== null && line === "locked") {
      current.locked = true;
      current.lockReason = "";
    } else if (current !== null && line.startsWith("locked ")) {
      current.locked = true;
      current.lockReason = line.slice("locked ".length).trim();
    }
  }
  if (current !== null) entries.push(current);
  return entries;
}

function inspectRegisteredWorktrees(repoRoot, policy) {
  const result = runGit(repoRoot, ["worktree", "list", "--porcelain"], policy.limits.maxGitOutputBytes);
  if (!result.ok) return { status: "unreadable", entries: [], error: "git worktree registration could not be read" };
  return { status: "available", entries: parseWorktreeList(result.stdout), error: null };
}

function resolveCommitPrefix(repoRoot, prefix, policy) {
  if (!/^[0-9a-f]{7,40}$/iu.test(String(prefix))) return null;
  const resolved = commandValue(repoRoot, ["rev-parse", "--verify", `${String(prefix)}^{commit}`], policy.limits.maxGitOutputBytes);
  return FULL_SHA_PATTERN.test(String(resolved)) ? resolved.toLowerCase() : null;
}

function verifyCanonicalGitRoot(root, spec, policy) {
  const blockers = [];
  const git = root.git;
  if (root.status !== "available" || root.metadata?.kind !== "directory") blockers.push(`filesystem status is ${root.status}`);
  if (git?.kind !== "worktree" || git.mode !== "worktree") blockers.push("root is not a readable Git worktree");
  if (normalizeRepositoryIdentifier(git?.origin) !== normalizeRepositoryIdentifier(spec.repository)) blockers.push(`origin does not identify ${spec.repository}`);
  if (git?.status !== "clean") blockers.push("worktree is not clean");
  if (git?.branch !== spec.branch) blockers.push(`branch is not ${spec.branch}`);
  if (git?.upstream !== spec.upstream) blockers.push(`upstream is not ${spec.upstream}`);
  const originMain = git?.kind === "worktree" ? commandValue(root.path, ["rev-parse", "origin/main"], policy.limits.maxGitOutputBytes) : null;
  if (!FULL_SHA_PATTERN.test(String(git?.head)) || git.head !== String(originMain ?? "").toLowerCase()) blockers.push("HEAD does not exactly equal origin/main");
  if (git?.divergence === null || git.divergence?.ahead !== "0" || git.divergence?.behind !== "0") blockers.push("main has non-zero divergence from origin/main");
  if (git?.mergeBaseStatus !== "available" || git.mergeBase !== git.head) blockers.push("merge-base evidence is unavailable or not the exact HEAD");
  return {
    status: blockers.length === 0 ? "validated" : "review",
    blockers,
    git,
    expected: { repository: spec.repository, branch: spec.branch, upstream: spec.upstream },
  };
}

function verifyCanonicalOracle(root, canonicalGame, policy, registrations) {
  const blockers = [];
  const git = root.git;
  const registration = registrations.entries.find((entry) => !entry.bare && samePath(entry.path, root.path));
  if (root.status !== "available" || root.metadata?.kind !== "directory") blockers.push(`filesystem status is ${root.status}`);
  if (git?.kind !== "worktree" || git.mode !== "worktree") blockers.push("oracle is not a readable Git worktree");
  const commonOrigin = git?.origin ?? canonicalGame.git.origin;
  if (normalizeRepositoryIdentifier(commonOrigin) !== normalizeRepositoryIdentifier(policy.canonical.oracle.repository)) blockers.push(`oracle origin does not identify ${policy.canonical.oracle.repository}`);
  if (git?.status !== "clean") blockers.push("oracle worktree is not clean");
  if (git?.branch !== null) blockers.push("oracle must remain detached");
  if (registration === undefined) blockers.push("oracle is not a registered Git worktree");
  else {
    if (registration.branch !== null) blockers.push("registered oracle worktree is not detached");
    if (!registration.locked || !/comparison-only/iu.test(registration.lockReason ?? "")) blockers.push("oracle worktree is not locked with a comparison-only reason");
    if (!FULL_SHA_PATTERN.test(String(registration.head)) || registration.head !== git.head) blockers.push("registered oracle HEAD does not match the inspected worktree");
  }
  const lockedCommit = resolveCommitPrefix(canonicalGame.path, policy.canonical.oracle.lockedCommit, policy);
  if (lockedCommit === null) blockers.push(`oracle locked commit prefix ${policy.canonical.oracle.lockedCommit} cannot be resolved to one commit`);
  else if (git?.head !== lockedCommit) blockers.push(`oracle HEAD is not the locked comparison commit ${lockedCommit}`);
  return {
    status: blockers.length === 0 ? "validated" : "review",
    blockers,
    git,
    registration: registration ?? null,
    expected: { repository: policy.canonical.oracle.repository, lockedCommitPrefix: policy.canonical.oracle.lockedCommit, role: policy.canonical.oracle.role },
  };
}

function applyCanonicalValidation(findings, policy, canonicalGame) {
  const registrations = inspectRegisteredWorktrees(canonicalGame.path, policy);
  const companionSpecs = [
    { name: policy.canonical.music.exactName, classification: "invalid-canonical-root", spec: policy.canonical.music },
    { name: policy.canonical.wiki.exactName, classification: "invalid-canonical-root", spec: policy.canonical.wiki },
  ];
  for (const companion of companionSpecs) {
    const finding = findings.find((entry) => entry.scope === "workspace-root" && entry.name === companion.name);
    if (finding === undefined || finding.classification === "missing-canonical-root") continue;
    const validation = verifyCanonicalGitRoot(finding, companion.spec, policy);
    finding.validation = validation;
    if (validation.status !== "validated") {
      finding.classification = companion.classification;
      finding.decision = "review";
      finding.status = "review";
      finding.blockers = validation.blockers;
    }
  }
  const oracle = findings.find((entry) => entry.scope === "workspace-root" && entry.name === policy.canonical.oracle.exactName);
  if (oracle !== undefined && oracle.classification !== "missing-canonical-root") {
    const validation = verifyCanonicalOracle(oracle, canonicalGame, policy, registrations);
    oracle.validation = validation;
    if (validation.status !== "validated") {
      oracle.classification = "invalid-oracle";
      oracle.decision = "review";
      oracle.status = "review";
      oracle.blockers = validation.blockers;
    }
  }
  return registrations;
}

function matchesAny(name, patterns) {
  return patterns.some((pattern) => new RegExp(pattern, "iu").test(name));
}

function classifyName(name, scope, policy) {
  const canonical = policy.canonical;
  if (scope === "workspace-root" && name === canonical.game.exactName) return { classification: "canonical-game", relevance: "canonical" };
  if (scope === "workspace-root" && name === canonical.music.exactName) return { classification: "canonical-music", relevance: "canonical" };
  if (scope === "workspace-root" && name === canonical.wiki.exactName) return { classification: "canonical-wiki", relevance: "canonical" };
  if (scope === "workspace-root" && name === canonical.oracle.exactName) return { classification: "locked-comparison-only-oracle", relevance: "comparison-only" };
  if (scope === "archive-root" && new RegExp(policy.classification.archiveGroup, "iu").test(name)) return { classification: "archive-recovery-keep", relevance: "protected" };
  if (matchesAny(name, policy.classification.archiveRecoveryKeep)) return { classification: "archive-recovery-keep", relevance: "protected" };
  if (matchesAny(name, policy.classification.evidenceRetentionHold)) return { classification: "evidence-retention-hold", relevance: "evidence" };
  if (matchesAny(name, policy.classification.laterQuarantineCandidate)) return { classification: "later-quarantine-candidate", relevance: "candidate" };
  if (new RegExp(policy.classification.tearRelated, "iu").test(name)) return { classification: "unknown-tear-related", relevance: "tear-related" };
  return { classification: "unrelated-root", relevance: "unrelated" };
}

function inspectChildren(root, scope, policy) {
  let children;
  try {
    children = fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    fail(`${scope} cannot be enumerated: ${error.message}`);
  }
  if (children.length > policy.limits.maxImmediateChildren) fail(`${scope} exceeds maxImmediateChildren ${policy.limits.maxImmediateChildren}`);
  return children.map((child) => {
    const entry = inspectImmediateEntry(root, child.name);
    const category = classifyName(child.name, scope, policy);
    const result = { scope, ...entry, ...category };
    if (entry.status === "refused") return { ...result, decision: "refused", git: null };
    if (entry.metadata.kind === "directory") return { ...result, decision: category.classification === "unknown-tear-related" ? "review" : "recorded", git: inspectGit(entry.path, policy) };
    return { ...result, decision: category.classification === "unknown-tear-related" ? "review" : "recorded", git: null };
  });
}

function addExpectedMissing(findings, workspaceRoot, policy) {
  const names = [policy.canonical.music.exactName, policy.canonical.wiki.exactName, policy.canonical.oracle.exactName];
  for (const name of names) {
    if (!findings.some((finding) => finding.scope === "workspace-root" && finding.name === name)) {
      findings.push({ scope: "workspace-root", name, path: path.join(workspaceRoot, name), status: "missing", decision: "review", classification: "missing-canonical-root", relevance: "canonical" });
    }
  }
}

function outputPathSafe(outputPath, archiveRoot, policy) {
  const absolute = path.resolve(outputPath);
  if (!absolute.toLowerCase().endsWith(".json")) fail("output must end with .json");
  if (!isPathInside(archiveRoot, absolute)) fail("output must be inside archive-root");
  const relative = path.relative(archiveRoot, absolute).split(path.sep);
  if (relative.length < 2 || !new RegExp(policy.classification.archiveGroup, "iu").test(relative[0])) fail("output must be under an existing dated archive recovery group");
  const group = inspectCanonicalDirectory(path.join(archiveRoot, relative[0]), "output recovery group");
  if (!isPathInside(group.path, absolute)) fail("output must remain inside its recovery group");
  let parent = path.dirname(absolute);
  while (!samePath(parent, group.path)) {
    if (!isPathInside(group.path, parent)) fail("output parent must remain inside its recovery group");
    try {
      const stats = fs.lstatSync(parent);
      if (stats.isSymbolicLink()) fail(`output parent is a symlink or reparse point: ${parent}`);
      const realPath = fs.realpathSync.native(parent);
      if (!samePath(parent, realPath) || !stats.isDirectory()) fail(`output parent must be a canonical directory: ${parent}`);
    } catch (error) {
      if (error instanceof RemainingWorkspaceInventoryError) throw error;
      if (error.code !== "ENOENT") fail(`output parent could not be inspected: ${error.message}`);
    }
    parent = path.dirname(parent);
  }
  try {
    fs.lstatSync(absolute);
    fail(`output already exists; refusing overwrite: ${absolute}`);
  } catch (error) {
    if (error instanceof RemainingWorkspaceInventoryError) throw error;
    if (error.code !== "ENOENT") fail(`output could not be inspected: ${error.message}`);
  }
  return absolute;
}

export function runRemainingWorkspaceInventory(options = {}) {
  for (const field of ["repoRoot", "workspaceRoot", "tempRoot", "archiveRoot"]) {
    if (options[field] === undefined || options[field] === null || String(options[field]).trim() === "") fail(`${field} is required`);
  }
  const repoRoot = path.resolve(options.repoRoot);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const tempRoot = path.resolve(options.tempRoot);
  const archiveRoot = path.resolve(options.archiveRoot);
  const loaded = requireCanonicalPolicy(options.policyPath ?? path.join(repoRoot, "preservation", "remaining-workspace-inventory-policy.json"), repoRoot);
  const policy = loaded.policy;
  const repo = verifyCanonicalGame(repoRoot, workspaceRoot, policy);
  const workspace = inspectCanonicalDirectory(workspaceRoot, "workspace-root");
  const temp = inspectCanonicalDirectory(tempRoot, "temp-root");
  const archive = inspectCanonicalDirectory(archiveRoot, "archive-root");
  if (!samePath(path.dirname(repo.path), workspace.path) || !samePath(path.dirname(archive.path), workspace.path)) fail("repo-root and archive-root must be direct workspace children");
  if (isPathInside(workspace.path, temp.path, { allowEqual: true }) || isPathInside(temp.path, workspace.path, { allowEqual: true })) fail("temp-root must be disjoint from workspace-root");
  const workspaceFindings = inspectChildren(workspace.path, "workspace-root", policy);
  const tempFindings = inspectChildren(temp.path, "temp-root", policy);
  const archiveFindings = inspectChildren(archive.path, "archive-root", policy);
  addExpectedMissing(workspaceFindings, workspace.path, policy);
  const registeredWorktrees = applyCanonicalValidation(workspaceFindings, policy, repo);
  const findings = [...workspaceFindings, ...tempFindings, ...archiveFindings];
  const report = {
    format: REMAINING_WORKSPACE_INVENTORY_FORMAT,
    schemaVersion: 1,
    kind: "metadata-only-report",
    generatedAtUtc: new Date(options.now ?? Date.now()).toISOString(),
    repository: RELEASE_REPOSITORY,
    policySha256: loaded.sha256,
    inputs: { repoRoot, workspaceRoot, tempRoot, archiveRoot },
    mutation: { mode: "report-only", writes: false, fetch: false, recurseNonGit: false, hashPayloads: false, refsChanged: false },
    canonicalGame: { path: repo.path, git: repo.git },
    roots: [
      { id: "workspace-root", path: workspace.path, metadata: workspace.metadata, immediateChildren: workspaceFindings.length },
      { id: "temp-root", path: temp.path, metadata: temp.metadata, immediateChildren: tempFindings.length },
      { id: "archive-root", path: archive.path, metadata: archive.metadata, immediateChildren: archiveFindings.length },
    ],
    findings,
    summary: {
      status: findings.some((finding) => finding.status === "refused" || finding.decision === "review" || finding.classification === "unknown-tear-related" || finding.classification === "missing-canonical-root") ? "review" : "recorded",
      findingCount: findings.length,
      gitRootCount: findings.filter((finding) => ["worktree", "bare", "git-output-limit"].includes(finding.git?.kind)).length,
      nonGitRootCount: findings.filter((finding) => finding.git?.kind === "non-git").length,
      unknownTearRelatedCount: findings.filter((finding) => finding.classification === "unknown-tear-related").length,
      refusedCount: findings.filter((finding) => finding.status === "refused").length,
      invalidCanonicalRootCount: findings.filter((finding) => finding.classification === "invalid-canonical-root").length,
      invalidOracleCount: findings.filter((finding) => finding.classification === "invalid-oracle").length,
      payloadHashes: "none",
    },
    classifications: {
      canonical: ["canonical-game", "canonical-music", "canonical-wiki"],
      comparisonOnly: ["locked-comparison-only-oracle"],
      invalidCanonical: ["invalid-canonical-root"],
      invalidOracle: ["invalid-oracle"],
      archiveRecoveryKeep: ["archive-recovery-keep"],
      evidenceRetentionHold: ["evidence-retention-hold"],
      laterQuarantineCandidate: ["later-quarantine-candidate"],
      unknownMustReview: ["unknown-tear-related"],
    },
    restoreGuidance: {
      status: "inventory-only",
      instructions: [
        "This report reads immediate metadata and bounded Git identity/status only.",
        "It performs no payload hashing, fetch, ref mutation, move, quarantine, deletion, or deployment.",
        "Any later disposition requires a separately reviewed manifest and fail-closed recovery procedure.",
      ],
    },
    registeredWorktrees: {
      status: registeredWorktrees.status,
      count: registeredWorktrees.entries.length,
      entries: registeredWorktrees.entries,
      error: registeredWorktrees.error,
    },
  };
  if (options.outputPath !== undefined) {
    const outputPath = outputPathSafe(options.outputPath, archive.path, policy);
    try {
      fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      fail(`could not write new-only report: ${error.message}`);
    }
  }
  return report;
}

function parseArguments(argumentsList) {
  const valueFlags = new Map([
    ["--repo-root", "repoRoot"],
    ["--workspace-root", "workspaceRoot"],
    ["--temp-root", "tempRoot"],
    ["--archive-root", "archiveRoot"],
    ["--policy", "policyPath"],
    ["--output", "outputPath"],
  ]);
  const options = {};
  const seen = new Set();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      options.help = true;
      continue;
    }
    const optionName = valueFlags.get(argument);
    if (optionName === undefined) fail(`unknown argument: ${argument}`);
    if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
    seen.add(argument);
    const value = argumentsList[++index];
    if (value === undefined || value.startsWith("--")) fail(`${argument} requires a value`);
    options[optionName] = path.resolve(value);
  }
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/report-remaining-workspace-inventory.mjs --repo-root <repo> --workspace-root <workspace> --temp-root <temp> --archive-root <archive> [--policy <policy.json>] [--output <new-report.json>]");
      return;
    }
    console.log(JSON.stringify(runRemainingWorkspaceInventory(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === path.resolve(import.meta.filename)) main();
