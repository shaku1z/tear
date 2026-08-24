import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { normalizeRepositoryIdentifier } from "./repository-identity.mjs";

export const PARENT_LAYOUT_POLICY_FORMAT = "tear-workspace-parent-layout-policy";
export const DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH = "preservation/workspace-parent-layout-policy.json";
export const DEFAULT_PARENT_LAYOUT_POLICY_PATH = path.resolve(
  import.meta.dirname,
  "..",
  DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH,
);
export const DEFAULT_WORKSPACE_CONTRACT_RELATIVE_PATH = "config/workspace-contract.json";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const EXPECTED_REPOSITORY = "shaku1z/tear";
const EXPECTED_CANONICAL = Object.freeze({
  game: Object.freeze({ exactName: "Tear", repository: "shaku1z/tear", branch: "main", upstream: "origin/main" }),
  music: Object.freeze({ exactName: "tear-score", repository: "shaku1z/tear-music", branch: "main", upstream: "origin/main" }),
  wiki: Object.freeze({ exactName: "tear-wiki", repository: "shaku1z/tear-wiki", branch: "main", upstream: "origin/main" }),
  oracle: Object.freeze({
    exactName: "Tear-oracle",
    repository: "shaku1z/tear",
    lockedCommit: "ee5e93141d67cc02505b2227b3be0b10d1819e1c",
    role: "comparison-only",
    requiredState: "detached-clean-comparison-only",
    requiredLockReason: "comparison-only",
    lockReason: "comparison-only; never merge or develop here",
  }),
});
const EXPECTED_APPROVED_PATTERNS = Object.freeze([
  "^Tear-archives$",
  "^tear-git-recovery-",
  "^tear-g3-preservation-audit-",
  "^tear-g5-",
]);
const EXPECTED_FORBIDDEN_PATTERNS = Object.freeze([
  "^Tear-main-publication$",
  "^Tear-g5-canonical-",
]);
const EXPECTED_FORBIDDEN_FOR = Object.freeze(["development", "deployment"]);
const EXPECTED_DEFERRED_RELATION = Object.freeze({
  status: "deferred",
  operation: "audit-only",
  auditVisible: true,
  move: false,
  kind: "junction",
  source: Object.freeze({ exactName: "Tear-budget-architecture", relativePath: "node_modules" }),
  target: Object.freeze({ exactName: "Tear-tearscore-normalization", relativePath: "node_modules" }),
});

// The forbidden canonical scratch family is intentionally a more-specific
// exception to the approved tear-g5 archive prefix. The checker gives the
// forbidden family precedence; every other approved/forbidden overlap is
// ambiguous and rejected.
const ALLOWED_SPECIFIC_FORBIDDEN_OVERRIDE = Object.freeze({
  approved: "^tear-g5-",
  forbidden: "^tear-g5-canonical-",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label, errors) {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }
  const expectedSet = new Set(expected);
  for (const key of expected) if (!Object.hasOwn(value, key)) errors.push(`${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!expectedSet.has(key)) errors.push(`${label}.${key} is not permitted`);
  return true;
}

function equalObjectValues(actual, expected, label, errors) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (actual?.[key] !== expectedValue) errors.push(`${label}.${key} must be ${JSON.stringify(expectedValue)}`);
  }
}

function isAbsolutePathString(value) {
  const text = String(value);
  return path.posix.isAbsolute(text.replaceAll("\\", "/"))
    || /^[A-Za-z]:[\\/]/u.test(text)
    || /^\\\\/u.test(text)
    || /^\\/u.test(text)
    || /^file:\/\//iu.test(text)
    || /(?:^|[\s("'])\\\\[^\\s]+/u.test(text)
    || /(?:^|[\s("'])[A-Za-z]:[\\/]/u.test(text);
}

function findAbsolutePaths(value, label, errors, seen = new Set()) {
  if (typeof value === "string") {
    if (isAbsolutePathString(value)) errors.push(`${label} must not contain an absolute path`);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findAbsolutePaths(entry, `${label}[${index}]`, errors, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) findAbsolutePaths(entry, `${label}.${key}`, errors, seen);
  }
}

function caseInsensitiveNameCollisions(names) {
  const seen = new Map();
  const collisions = [];
  for (const entry of names) {
    const key = String(entry.value ?? "").toLocaleLowerCase("en-US");
    if (seen.has(key)) collisions.push(`${entry.label} collides with ${seen.get(key)} (case-insensitive)`);
    else seen.set(key, entry.label);
  }
  return collisions;
}

function patternDescriptor(pattern) {
  if (typeof pattern !== "string" || !pattern.startsWith("^")) return null;
  const anchoredEnd = pattern.endsWith("$");
  const literal = pattern.slice(1, anchoredEnd ? -1 : undefined);
  // The production policy deliberately uses literal names and prefixes. A
  // pattern containing regex operators would make overlap analysis unsafe.
  if (literal === "" || /[.*+?^${}()|[\]\\]/u.test(literal)) return null;
  return { pattern, literal: literal.toLocaleLowerCase("en-US"), anchoredEnd };
}

function patternMatchesSameName(left, right) {
  if (left.literal === right.literal) return true;
  if (left.anchoredEnd && right.anchoredEnd) return false;
  if (!left.anchoredEnd && right.literal.startsWith(left.literal)) return true;
  if (!right.anchoredEnd && left.literal.startsWith(right.literal)) return true;
  return false;
}

function isAllowedOverride(approved, forbidden) {
  return approved.toLocaleLowerCase("en-US") === ALLOWED_SPECIFIC_FORBIDDEN_OVERRIDE.approved
    && forbidden.toLocaleLowerCase("en-US") === ALLOWED_SPECIFIC_FORBIDDEN_OVERRIDE.forbidden;
}

function validatePatternList(patterns, label, expected, errors) {
  if (!Array.isArray(patterns)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  if (JSON.stringify(patterns) !== JSON.stringify(expected)) errors.push(`${label} must contain the exact mandated patterns`);
  const seen = new Set();
  const descriptors = [];
  for (const [index, pattern] of patterns.entries()) {
    if (typeof pattern !== "string" || !pattern.startsWith("^")) {
      errors.push(`${label}[${index}] must be anchored at the beginning`);
      continue;
    }
    try {
      new RegExp(pattern, "iu");
    } catch (error) {
      errors.push(`${label}[${index}] is not a valid regular expression: ${error.message}`);
      continue;
    }
    const key = pattern.toLocaleLowerCase("en-US");
    if (seen.has(key)) errors.push(`${label} contains a case-insensitive duplicate: ${pattern}`);
    seen.add(key);
    const descriptor = patternDescriptor(pattern);
    if (descriptor === null) errors.push(`${label}[${index}] must be a literal anchored name or prefix`);
    else descriptors.push(descriptor);
  }
  for (let leftIndex = 0; leftIndex < descriptors.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < descriptors.length; rightIndex += 1) {
      if (patternMatchesSameName(descriptors[leftIndex], descriptors[rightIndex])) {
        errors.push(`${label} contains ambiguous overlapping patterns: ${descriptors[leftIndex].pattern} and ${descriptors[rightIndex].pattern}`);
      }
    }
  }
  return descriptors;
}

function validateCrossPatternOverlap(approvedDescriptors, forbiddenDescriptors, errors) {
  for (const approved of approvedDescriptors) {
    for (const forbidden of forbiddenDescriptors) {
      if (!patternMatchesSameName(approved, forbidden)) continue;
      if (isAllowedOverride(approved.pattern, forbidden.pattern)) continue;
      errors.push(`approved and forbidden patterns overlap ambiguously: ${approved.pattern} and ${forbidden.pattern}`);
    }
  }
}

function validateCanonical(policy, errors) {
  if (!exactKeys(policy?.canonical, ["game", "music", "wiki", "oracle"], "canonical", errors)) return;
  for (const key of ["game", "music", "wiki"]) {
    if (exactKeys(policy.canonical[key], ["exactName", "repository", "branch", "upstream"], `canonical.${key}`, errors)) {
      equalObjectValues(policy.canonical[key], EXPECTED_CANONICAL[key], `canonical.${key}`, errors);
    }
  }
  if (exactKeys(policy.canonical.oracle, ["exactName", "repository", "lockedCommit", "role", "requiredState", "requiredLockReason", "lockReason"], "canonical.oracle", errors)) {
    equalObjectValues(policy.canonical.oracle, EXPECTED_CANONICAL.oracle, "canonical.oracle", errors);
    if (!FULL_SHA_PATTERN.test(String(policy.canonical.oracle.lockedCommit ?? ""))) errors.push("canonical.oracle.lockedCommit must be a full 40-character SHA-1");
  }
}

function validateNames(policy, errors) {
  if (!exactKeys(policy?.names, ["approvedArchiveRecoveryPatterns", "forbiddenPatterns", "forbiddenFor", "collisionPolicy"], "names", errors)) return;
  const approved = validatePatternList(policy.names.approvedArchiveRecoveryPatterns, "names.approvedArchiveRecoveryPatterns", EXPECTED_APPROVED_PATTERNS, errors);
  const forbidden = validatePatternList(policy.names.forbiddenPatterns, "names.forbiddenPatterns", EXPECTED_FORBIDDEN_PATTERNS, errors);
  validateCrossPatternOverlap(approved, forbidden, errors);
  if (JSON.stringify(policy.names.forbiddenFor) !== JSON.stringify(EXPECTED_FORBIDDEN_FOR)) errors.push("names.forbiddenFor must be exactly development and deployment");
  if (exactKeys(policy.names.collisionPolicy, ["comparison", "onCollision"], "names.collisionPolicy", errors)) {
    equalObjectValues(policy.names.collisionPolicy, { comparison: "case-insensitive", onCollision: "reject" }, "names.collisionPolicy", errors);
  }
}

function validateReparse(policy, errors) {
  if (!exactKeys(policy?.reparse, ["default", "deferredAuditRelation"], "reparse", errors)) return;
  if (policy.reparse.default !== "refuse") errors.push("reparse.default must be refuse");
  const relation = policy.reparse.deferredAuditRelation;
  if (!exactKeys(relation, ["status", "operation", "auditVisible", "move", "kind", "source", "target"], "reparse.deferredAuditRelation", errors)) return;
  equalObjectValues(relation, {
    status: EXPECTED_DEFERRED_RELATION.status,
    operation: EXPECTED_DEFERRED_RELATION.operation,
    auditVisible: EXPECTED_DEFERRED_RELATION.auditVisible,
    move: EXPECTED_DEFERRED_RELATION.move,
    kind: EXPECTED_DEFERRED_RELATION.kind,
  }, "reparse.deferredAuditRelation", errors);
  for (const side of ["source", "target"]) {
    if (exactKeys(relation[side], ["exactName", "relativePath"], `reparse.deferredAuditRelation.${side}`, errors)) {
      equalObjectValues(relation[side], EXPECTED_DEFERRED_RELATION[side], `reparse.deferredAuditRelation.${side}`, errors);
      if (path.posix.isAbsolute(String(relation[side].relativePath ?? "").replaceAll("\\", "/"))) errors.push(`reparse.deferredAuditRelation.${side}.relativePath must be relative`);
      if (String(relation[side].relativePath ?? "").split(/[\\/]/u).includes("..")) errors.push(`reparse.deferredAuditRelation.${side}.relativePath must not escape its root`);
    }
  }
  if (relation?.source?.exactName?.toLocaleLowerCase("en-US") === relation?.target?.exactName?.toLocaleLowerCase("en-US")) {
    errors.push("reparse deferred source and target names must be distinct case-insensitively");
  }
}

function validateLooseItems(policy, errors) {
  if (!exactKeys(policy?.looseItems, ["mode", "autoMove", "autoDelete", "autoDeploy", "autoMerge"], "looseItems", errors)) return;
  if (policy.looseItems.mode !== "report-only") errors.push("looseItems.mode must be report-only");
  for (const field of ["autoMove", "autoDelete", "autoDeploy", "autoMerge"]) {
    if (policy.looseItems[field] !== false) errors.push(`looseItems.${field} must be false`);
  }
}

export function validateParentLayoutPolicy(policy) {
  const errors = [];
  if (!isRecord(policy)) {
    return ["parent-layout policy must be a JSON object"];
  }
  findAbsolutePaths(policy, "policy", errors);
  if (!exactKeys(policy, ["format", "schemaVersion", "repository", "canonical", "names", "reparse", "looseItems"], "policy", errors)) return errors;
  if (policy.format !== PARENT_LAYOUT_POLICY_FORMAT) errors.push(`policy.format must be ${PARENT_LAYOUT_POLICY_FORMAT}`);
  if (policy.schemaVersion !== 1) errors.push("policy.schemaVersion must be 1");
  if (policy.repository !== EXPECTED_REPOSITORY) errors.push(`policy.repository must be ${EXPECTED_REPOSITORY}`);
  validateCanonical(policy, errors);
  validateNames(policy, errors);
  validateReparse(policy, errors);
  validateLooseItems(policy, errors);

  const names = [];
  for (const [key, value] of Object.entries(policy.canonical ?? {})) {
    if (typeof value?.exactName === "string") names.push({ value: value.exactName, label: `canonical.${key}.exactName` });
  }
  for (const side of ["source", "target"]) {
    const value = policy.reparse?.deferredAuditRelation?.[side];
    if (typeof value?.exactName === "string") names.push({ value: value.exactName, label: `reparse.deferredAuditRelation.${side}.exactName` });
  }
  errors.push(...caseInsensitiveNameCollisions(names));
  return [...new Set(errors)];
}

// Keep the shape-oriented name available to focused contract tests and future
// callers that follow the existing preservation-validator naming convention.
export const validateParentLayoutPolicyShape = validateParentLayoutPolicy;

function readJson(filePath) {
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, "utf8")), errors: [] };
  } catch (error) {
    return { value: null, errors: [`could not read parent-layout policy: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

export function readParentLayoutPolicy(policyPath = DEFAULT_PARENT_LAYOUT_POLICY_PATH) {
  const absolutePath = path.resolve(policyPath);
  const result = readJson(absolutePath);
  return { path: absolutePath, policy: result.value, errors: result.errors };
}

function readContractReference(contractPath) {
  try {
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    return { contract, errors: [] };
  } catch (error) {
    return { contract: null, errors: [`could not read workspace contract: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  try {
    return comparablePath(fs.realpathSync.native(left)) === comparablePath(fs.realpathSync.native(right));
  } catch {
    return comparablePath(left) === comparablePath(right);
  }
}

function pathInside(root, candidate, { allowEqual = false } = {}) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === "") return allowEqual;
  return relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function isReparsePoint(stats) {
  return stats.isSymbolicLink();
}

function strictGit(root, argumentsList) {
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
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
    error: result.error,
  };
}

function strictGitValue(root, argumentsList) {
  const result = strictGit(root, argumentsList);
  return result.ok ? result.stdout : null;
}

function recordNoGo(noGo, message) {
  noGo.push(message);
}

function recordReview(review, message) {
  review.push(message);
}

function inspectRootDirectory(candidate, label, noGo) {
  if (typeof candidate !== "string" || candidate.trim() === "") {
    recordNoGo(noGo, `${label} is required`);
    return null;
  }
  const absolute = path.resolve(candidate);
  let stats;
  try {
    stats = fs.lstatSync(absolute);
  } catch (error) {
    recordNoGo(noGo, `${label} is missing or unreadable (${error.code ?? error.message})`);
    return null;
  }
  if (isReparsePoint(stats)) {
    recordNoGo(noGo, `${label} must not be a symlink or reparse point`);
    return null;
  }
  if (!stats.isDirectory()) {
    recordNoGo(noGo, `${label} must be a directory`);
    return null;
  }
  try {
    const realPath = fs.realpathSync.native(absolute);
    if (!samePath(absolute, realPath)) {
      recordNoGo(noGo, `${label} must resolve to itself`);
      return null;
    }
  } catch (error) {
    recordNoGo(noGo, `${label} cannot be resolved (${error.code ?? error.message})`);
    return null;
  }
  return absolute;
}

function inspectGitPointer(root, label, noGo, { required = true } = {}) {
  const pointerPath = path.join(root, ".git");
  let stats;
  try {
    stats = fs.lstatSync(pointerPath);
  } catch (error) {
    if (error.code === "ENOENT" && !required) return false;
    recordNoGo(noGo, `${label} has no readable .git entry`);
    return false;
  }
  if (isReparsePoint(stats)) {
    recordNoGo(noGo, `${label} .git entry must not be a symlink or reparse point`);
    return false;
  }
  if (stats.isDirectory()) return true;
  if (!stats.isFile()) {
    recordNoGo(noGo, `${label} .git entry must be a directory or gitdir pointer file`);
    return false;
  }
  let contents;
  try {
    contents = fs.readFileSync(pointerPath, "utf8");
  } catch (error) {
    recordNoGo(noGo, `${label} .git pointer cannot be read (${error.code ?? error.message})`);
    return false;
  }
  const targetMatch = contents.trim().match(/^gitdir:\s*(.+)$/imu);
  if (targetMatch === null || targetMatch[1].trim() === "") {
    recordNoGo(noGo, `${label} has an invalid .git pointer`);
    return false;
  }
  const target = path.resolve(path.dirname(pointerPath), targetMatch[1].trim());
  let targetStats;
  try {
    targetStats = fs.lstatSync(target);
  } catch (error) {
    recordNoGo(noGo, `${label} has an invalid .git pointer target (${error.code ?? error.message})`);
    return false;
  }
  if (isReparsePoint(targetStats)) recordNoGo(noGo, `${label} .git pointer target must not be a symlink or reparse point`);
  return true;
}

function inspectGitRepository({ root, label, expectedRepository, expectedBranch, expectedUpstream, expectedHead, noGo }) {
  const result = { label, status: "no-go", branch: null, upstream: null, head: null, originMain: null };
  if (root === null) return result;
  inspectGitPointer(root, label, noGo);

  const topLevel = strictGitValue(root, ["rev-parse", "--show-toplevel"]);
  if (topLevel === null) recordNoGo(noGo, `${label} is not a readable Git worktree`);
  else if (!samePath(root, topLevel)) recordNoGo(noGo, `${label} Git top-level does not match its canonical path`);

  const remote = strictGitValue(root, ["config", "--get", "remote.origin.url"]);
  if (remote === null || normalizeRepositoryIdentifier(remote) !== expectedRepository) {
    recordNoGo(noGo, `${label} origin must identify ${expectedRepository}`);
  }

  const branch = strictGitValue(root, ["branch", "--show-current"]);
  result.branch = branch ?? null;
  if (expectedBranch !== undefined && branch !== expectedBranch) recordNoGo(noGo, `${label} branch must be ${expectedBranch || "detached"}`);

  if (expectedUpstream !== undefined) {
    const upstream = strictGitValue(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    result.upstream = upstream ?? null;
    if (upstream !== expectedUpstream) recordNoGo(noGo, `${label} upstream must be ${expectedUpstream}`);
  }

  const status = strictGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!status.ok) recordNoGo(noGo, `${label} Git status could not be read`);
  else if (status.stdout.trim() !== "") recordNoGo(noGo, `${label} Git worktree must be clean`);

  const head = strictGitValue(root, ["rev-parse", "HEAD"]);
  result.head = head?.toLowerCase() ?? null;
  if (head === null) recordNoGo(noGo, `${label} HEAD could not be read`);
  if (expectedHead !== undefined && result.head !== expectedHead.toLowerCase()) recordNoGo(noGo, `${label} HEAD must be ${expectedHead}`);

  const originMain = strictGitValue(root, ["rev-parse", "origin/main"]);
  result.originMain = originMain?.toLowerCase() ?? null;
  if (expectedUpstream !== undefined && originMain === null) recordNoGo(noGo, `${label} origin/main could not be read`);
  if (expectedUpstream !== undefined && result.head !== null && result.originMain !== null && result.head !== result.originMain) {
    recordNoGo(noGo, `${label} HEAD must equal origin/main`);
  }
  result.status = "validated";
  return result;
}

function parseWorktreePorcelain(text) {
  const entries = [];
  let current = null;
  for (const line of String(text ?? "").split(/\r?\n/u)) {
    if (line === "") continue;
    if (line.startsWith("worktree ")) {
      if (current !== null) entries.push(current);
      current = { path: line.slice("worktree ".length), branch: null, detached: false, locked: false, lockReason: null, bare: false };
    } else if (current === null) {
      continue;
    } else if (line === "bare") {
      current.bare = true;
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).toLowerCase();
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    } else if (line === "detached") {
      current.detached = true;
    } else if (line === "locked") {
      current.locked = true;
      current.lockReason = "";
    } else if (line.startsWith("locked ")) {
      current.locked = true;
      current.lockReason = line.slice("locked ".length);
    }
  }
  if (current !== null) entries.push(current);
  return entries;
}

function checkExactWorktrees({ gameRoot, oracleRoot, oraclePolicy, noGo }) {
  const result = { status: "no-go", entries: 0 };
  const list = strictGit(gameRoot, ["worktree", "list", "--porcelain"]);
  if (!list.ok) {
    recordNoGo(noGo, "canonical game worktree porcelain could not be read");
    return result;
  }
  const entries = parseWorktreePorcelain(list.stdout);
  result.entries = entries.length;
  if (entries.length !== 2) recordNoGo(noGo, `game worktree porcelain must contain exactly canonical game and locked oracle; found ${entries.length}`);
  const canonical = entries.find((entry) => samePath(entry.path, gameRoot));
  if (canonical === undefined) {
    recordNoGo(noGo, "game worktree porcelain is missing the canonical game root");
  } else {
    if (canonical.bare || canonical.detached || canonical.branch !== "refs/heads/main") recordNoGo(noGo, "canonical game worktree porcelain must be branch main");
  }
  const oracle = entries.find((entry) => samePath(entry.path, oracleRoot));
  if (oracle === undefined) {
    recordNoGo(noGo, "game worktree porcelain is missing the canonical oracle root");
  } else {
    if (oracle.bare || !oracle.detached || oracle.branch !== null) recordNoGo(noGo, "oracle worktree porcelain must be detached");
    if (!oracle.locked || !new RegExp(oraclePolicy.requiredLockReason, "iu").test(oracle.lockReason ?? "")) {
      recordNoGo(noGo, "oracle worktree must be locked with a comparison-only reason");
    }
  }
  for (const entry of entries) {
    if (!samePath(entry.path, gameRoot) && !samePath(entry.path, oracleRoot)) recordNoGo(noGo, "an unapproved Git worktree is registered");
  }
  result.status = noGo.length === 0 ? "validated" : "no-go";
  return result;
}

function immediateChildren(root, label, noGo, { inspectPointers = false, allowedReparseNames = [] } = {}) {
  let children;
  try {
    children = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    recordNoGo(noGo, `${label} immediate children could not be read (${error.code ?? error.message})`);
    return [];
  }
  const names = new Map();
  const allowedReparse = new Set(allowedReparseNames.map((name) => name.toLocaleLowerCase("en-US")));
  const result = [];
  for (const entry of children) {
    const nameKey = entry.name.toLocaleLowerCase("en-US");
    if (names.has(nameKey)) recordNoGo(noGo, `${label} has a case-insensitive name collision: ${names.get(nameKey)} and ${entry.name}`);
    else names.set(nameKey, entry.name);
    const candidate = path.join(root, entry.name);
    let stats;
    try {
      stats = fs.lstatSync(candidate);
    } catch (error) {
      recordNoGo(noGo, `${label} child ${entry.name} could not be inspected (${error.code ?? error.message})`);
      continue;
    }
    const reparse = isReparsePoint(stats);
    if (reparse && !allowedReparse.has(entry.name.toLocaleLowerCase("en-US"))) recordNoGo(noGo, `${label} child ${entry.name} is an immediate symlink or reparse point`);
    if (inspectPointers && !reparse && stats.isDirectory()) inspectGitPointer(candidate, `${label} child ${entry.name}`, noGo, { required: false });
    result.push({ name: entry.name, kind: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other", reparse });
  }
  return result;
}

function classifyChildren(children, location, policy, review, noGo) {
  const approved = policy.names.approvedArchiveRecoveryPatterns.map((pattern) => new RegExp(pattern, "iu"));
  const forbidden = policy.names.forbiddenPatterns.map((pattern) => new RegExp(pattern, "iu"));
  const canonicalNames = new Set(Object.values(policy.canonical).map((value) => value.exactName.toLocaleLowerCase("en-US")));
  const deferredNames = new Set([
    policy.reparse.deferredAuditRelation.source.exactName,
    policy.reparse.deferredAuditRelation.target.exactName,
  ].map((value) => value.toLocaleLowerCase("en-US")));
  const classifications = [];
  for (const child of children) {
    const nameKey = child.name.toLocaleLowerCase("en-US");
    let classification = "unrelated";
    if (forbidden.some((pattern) => pattern.test(child.name))) {
      classification = "forbidden-no-go";
      recordNoGo(noGo, `${location} contains forbidden name ${child.name}`);
    } else if (approved.some((pattern) => pattern.test(child.name))) {
      classification = "approved-archive-recovery";
    } else if (canonicalNames.has(nameKey)) {
      classification = "canonical-root";
    } else if (deferredNames.has(nameKey)) {
      classification = "deferred-reparse-pair";
    } else if (/tear/iu.test(child.name)) {
      classification = "loose-tear-related-review";
      recordReview(review, `${location} contains loose Tear-related ${child.kind}: ${child.name}`);
    }
    classifications.push({ location, name: child.name, kind: child.kind, classification });
  }
  return classifications;
}

function checkDeferredPair({ tempRoot, policy, noGo, review }) {
  const relation = policy.reparse.deferredAuditRelation;
  const sourceRoot = path.join(tempRoot, relation.source.exactName);
  const targetRoot = path.join(tempRoot, relation.target.exactName);
  const result = { status: "no-go", source: relation.source.exactName, target: relation.target.exactName };
  const source = inspectRootDirectory(sourceRoot, "deferred junction source root", noGo);
  const target = inspectRootDirectory(targetRoot, "deferred junction target root", noGo);
  if (source === null || target === null) return result;

  immediateChildren(source, "deferred junction source root", noGo, {
    inspectPointers: true,
    allowedReparseNames: [relation.source.relativePath],
  });
  immediateChildren(target, "deferred junction target root", noGo, { inspectPointers: true });

  const sourceNode = path.join(source, relation.source.relativePath);
  const targetNode = path.join(target, relation.target.relativePath);
  let sourceStats;
  let targetStats;
  try {
    sourceStats = fs.lstatSync(sourceNode);
  } catch (error) {
    recordNoGo(noGo, `deferred junction source ${relation.source.relativePath} is missing (${error.code ?? error.message})`);
  }
  try {
    targetStats = fs.lstatSync(targetNode);
  } catch (error) {
    recordNoGo(noGo, `deferred junction target ${relation.target.relativePath} is missing (${error.code ?? error.message})`);
  }
  if (sourceStats !== undefined && !isReparsePoint(sourceStats)) {
    recordNoGo(noGo, "deferred junction source node_modules must be a directory junction");
  }
  if (sourceStats !== undefined && isReparsePoint(sourceStats)) {
    try {
      if (!fs.statSync(sourceNode).isDirectory()) recordNoGo(noGo, "deferred junction source node_modules must resolve to a directory");
    } catch (error) {
      recordNoGo(noGo, `deferred junction source node_modules cannot be inspected (${error.code ?? error.message})`);
    }
  }
  if (targetStats !== undefined && (isReparsePoint(targetStats) || !targetStats.isDirectory())) {
    recordNoGo(noGo, "deferred junction target node_modules must be a normal directory");
  }
  if (sourceStats !== undefined && targetStats !== undefined && isReparsePoint(sourceStats) && !isReparsePoint(targetStats)) {
    try {
      if (!samePath(fs.realpathSync.native(sourceNode), targetNode)) recordNoGo(noGo, "deferred junction source must resolve exactly to target node_modules");
    } catch (error) {
      recordNoGo(noGo, `deferred junction source cannot be resolved (${error.code ?? error.message})`);
    }
  }
  if (noGo.length === 0) result.status = "validated";
  else recordReview(review, "deferred junction remains audit-only and was not modified");
  return result;
}

function runStrictParentLayoutInspection({ root, workspaceRoot, tempRoot, archiveRoot, oracleRoot, policy, policyErrors }) {
  const noGo = [...policyErrors];
  const review = [];
  const classifications = [];
  const checks = { roots: {}, worktrees: { status: "not-run" }, deferredPair: { status: "not-run" } };
  const requiredRoots = [
    ["workspaceRoot", workspaceRoot],
    ["tempRoot", tempRoot],
    ["archiveRoot", archiveRoot],
    ["oracleRoot", oracleRoot],
  ];
  for (const [name, value] of requiredRoots) if (typeof value !== "string" || value.trim() === "") recordNoGo(noGo, `strict mode requires explicit --${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`);
  if (policyErrors.length > 0 || noGo.length > policyErrors.length) {
    return {
      ok: false,
      mode: "strict",
      status: "no-go",
      policyRelativePath: DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH,
      checks,
      classifications,
      noGo: [...new Set(noGo)],
      review: [],
      errors: [...new Set(noGo)],
    };
  }
  if (!isRecord(policy)) {
    return {
      ok: false,
      mode: "strict",
      status: "no-go",
      policyRelativePath: DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH,
      checks,
      classifications,
      noGo: [...new Set(noGo)],
      review: [],
      errors: [...new Set(noGo)],
    };
  }

  const absoluteRoot = path.resolve(root);
  const absoluteWorkspaceRoot = inspectRootDirectory(workspaceRoot, "workspace root", noGo);
  const absoluteTempRoot = inspectRootDirectory(tempRoot, "temporary root", noGo);
  const absoluteArchiveRoot = inspectRootDirectory(archiveRoot, "archive root", noGo);
  const absoluteOracleRoot = inspectRootDirectory(oracleRoot, "oracle root", noGo);
  const expectedGameRoot = absoluteWorkspaceRoot === null ? null : path.join(absoluteWorkspaceRoot, policy.canonical.game.exactName);
  const expectedMusicRoot = absoluteWorkspaceRoot === null ? null : path.join(absoluteWorkspaceRoot, policy.canonical.music.exactName);
  const expectedWikiRoot = absoluteWorkspaceRoot === null ? null : path.join(absoluteWorkspaceRoot, policy.canonical.wiki.exactName);
  if (expectedGameRoot === null || !samePath(absoluteRoot, expectedGameRoot)) recordNoGo(noGo, "--root must be the canonical game directory directly under --workspace-root");
  if (absoluteArchiveRoot !== null && absoluteWorkspaceRoot !== null && !samePath(absoluteArchiveRoot, path.join(absoluteWorkspaceRoot, "Tear-archives"))) recordNoGo(noGo, "--archive-root must be the Tear-archives directory under --workspace-root");
  if (absoluteOracleRoot !== null && absoluteWorkspaceRoot !== null && !samePath(absoluteOracleRoot, path.join(absoluteWorkspaceRoot, policy.canonical.oracle.exactName))) recordNoGo(noGo, "--oracle-root must be the canonical oracle directory under --workspace-root");
  if (absoluteWorkspaceRoot !== null && absoluteTempRoot !== null && (pathInside(absoluteWorkspaceRoot, absoluteTempRoot, { allowEqual: true }) || pathInside(absoluteTempRoot, absoluteWorkspaceRoot, { allowEqual: true }))) recordNoGo(noGo, "--temp-root must be separate from --workspace-root");
  const explicitRoots = [absoluteRoot, absoluteWorkspaceRoot, absoluteTempRoot, absoluteArchiveRoot, absoluteOracleRoot].filter((value) => value !== null);
  for (let leftIndex = 0; leftIndex < explicitRoots.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < explicitRoots.length; rightIndex += 1) {
      if (samePath(explicitRoots[leftIndex], explicitRoots[rightIndex])) recordNoGo(noGo, "strict roots must be distinct directories");
    }
  }

  const canonicalSpecs = [
    ["game", absoluteRoot, policy.canonical.game],
    ["music", expectedMusicRoot, policy.canonical.music],
    ["wiki", expectedWikiRoot, policy.canonical.wiki],
  ];
  for (const [key, candidate, spec] of canonicalSpecs) {
    const canonicalRoot = inspectRootDirectory(candidate, `canonical ${key} root`, noGo);
    checks.roots[key] = canonicalRoot === null
      ? { status: "no-go" }
      : inspectGitRepository({ root: canonicalRoot, label: `canonical ${key}`, expectedRepository: spec.repository, expectedBranch: spec.branch, expectedUpstream: spec.upstream, noGo });
    if (canonicalRoot !== null) immediateChildren(canonicalRoot, `canonical ${key} root`, noGo, { inspectPointers: false });
  }
  if (absoluteOracleRoot !== null) {
    checks.roots.oracle = inspectGitRepository({ root: absoluteOracleRoot, label: "oracle", expectedRepository: policy.canonical.oracle.repository, expectedBranch: "", expectedHead: policy.canonical.oracle.lockedCommit, noGo });
  }
  if (absoluteRoot !== null && absoluteOracleRoot !== null) checks.worktrees = checkExactWorktrees({ gameRoot: absoluteRoot, oracleRoot: absoluteOracleRoot, oraclePolicy: policy.canonical.oracle, noGo });

  if (absoluteWorkspaceRoot !== null) {
    const children = immediateChildren(absoluteWorkspaceRoot, "workspace root", noGo, { inspectPointers: true });
    classifications.push(...classifyChildren(children, "workspace root", policy, review, noGo));
    const expectedNames = [policy.canonical.game.exactName, policy.canonical.music.exactName, policy.canonical.wiki.exactName, policy.canonical.oracle.exactName, "Tear-archives"];
    for (const expectedName of expectedNames) if (!children.some((child) => child.name === expectedName)) recordNoGo(noGo, `workspace root is missing exact child ${expectedName}`);
  }
  if (absoluteTempRoot !== null) {
    const children = immediateChildren(absoluteTempRoot, "temporary root", noGo, { inspectPointers: true });
    classifications.push(...classifyChildren(children, "temporary root", policy, review, noGo));
  }
  if (absoluteArchiveRoot !== null) {
    // Deliberately inspect only this directory's entries. Archive payloads are
    // opaque preservation evidence and are never recursively enumerated.
    const children = immediateChildren(absoluteArchiveRoot, "archive root", noGo, { inspectPointers: false });
    classifications.push(...classifyChildren(children, "archive root", policy, review, noGo));
  }
  if (absoluteTempRoot !== null) checks.deferredPair = checkDeferredPair({ tempRoot: absoluteTempRoot, policy, noGo, review });

  const uniqueNoGo = [...new Set(noGo)];
  const uniqueReview = [...new Set(review)];
  const status = uniqueNoGo.length > 0 ? "no-go" : uniqueReview.length > 0 ? "review" : "pass";
  return {
    ok: status !== "no-go",
    mode: "strict",
    status,
    checks,
    classifications,
    noGo: uniqueNoGo,
    review: uniqueReview,
    errors: uniqueNoGo,
  };
}

export function runParentLayoutCheck({
  root = process.cwd(),
  policyPath,
  contractPath,
  checkContract = true,
  strict = false,
  workspaceRoot,
  tempRoot,
  archiveRoot,
  oracleRoot,
} = {}) {
  const absoluteRoot = path.resolve(root);
  const errors = [];
  let resolvedPolicyPath = policyPath === undefined
    ? path.join(absoluteRoot, DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH)
    : path.resolve(policyPath);
  if (checkContract) {
    const loadedContract = readContractReference(contractPath ?? path.join(absoluteRoot, DEFAULT_WORKSPACE_CONTRACT_RELATIVE_PATH));
    errors.push(...loadedContract.errors);
    if (loadedContract.contract?.parentLayoutPolicy !== `./${DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH}`) {
      errors.push(`workspace contract parentLayoutPolicy must be ./${DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH}`);
    }
    if (loadedContract.contract?.repository !== EXPECTED_REPOSITORY) errors.push(`workspace contract repository must be ${EXPECTED_REPOSITORY}`);
    if (policyPath === undefined && loadedContract.contract?.parentLayoutPolicy === "./preservation/workspace-parent-layout-policy.json") {
      resolvedPolicyPath = path.resolve(absoluteRoot, loadedContract.contract.parentLayoutPolicy);
    }
  }
  const loaded = readParentLayoutPolicy(resolvedPolicyPath);
  errors.push(...loaded.errors, ...validateParentLayoutPolicy(loaded.policy));
  if (strict) {
    const result = runStrictParentLayoutInspection({ root: absoluteRoot, workspaceRoot, tempRoot, archiveRoot, oracleRoot, policy: loaded.policy, policyErrors: errors });
    return { ...result, policyRelativePath: path.relative(absoluteRoot, loaded.path).replaceAll(path.sep, "/") };
  }
  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? "valid" : "invalid",
    policyRelativePath: path.relative(absoluteRoot, loaded.path).replaceAll(path.sep, "/"),
    errors: [...new Set(errors)],
  };
}

function parseArguments(argumentsList) {
  const options = { root: process.cwd() };
  const pathArgument = (argument, index) => {
    const value = argumentsList[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${argument} requires a path argument`);
    return path.resolve(value);
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--root") { options.root = pathArgument(argument, index); index += 1; }
    else if (argument === "--workspace-root") { options.workspaceRoot = pathArgument(argument, index); index += 1; }
    else if (argument === "--temp-root") { options.tempRoot = pathArgument(argument, index); index += 1; }
    else if (argument === "--archive-root") { options.archiveRoot = pathArgument(argument, index); index += 1; }
    else if (argument === "--oracle-root") { options.oracleRoot = pathArgument(argument, index); index += 1; }
    else if (argument === "--policy") { options.policyPath = pathArgument(argument, index); index += 1; }
    else if (argument === "--contract") { options.contractPath = pathArgument(argument, index); index += 1; }
    else if (argument === "--no-contract") options.checkContract = false;
    else if (argument === "--strict") options.strict = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(JSON.stringify({ usage: "node scripts/check-parent-layout.mjs [--root <repo>] [--policy <path>] [--contract <path>] [--no-contract] [--strict --workspace-root <dir> --temp-root <dir> --archive-root <dir> --oracle-root <dir>]" }));
      return;
    }
    const result = runParentLayoutCheck(options);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, status: "invalid", errors: [error instanceof Error ? error.message : String(error)] }, null, 2));
    process.exitCode = 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === thisFile) main();
