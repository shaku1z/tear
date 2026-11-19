// Owner guard for the Tear game repository, run by the hooks in scripts/governance/hooks/.
// Ported from the shared governance skill (~/.codex/skills/tear-program-governance), which still
// serves the music and wiki repositories; see scripts/governance/README.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const OWNER = Object.freeze({ name: "shaku1z", email: "shatheartboy@gmail.com" });
export const EXPECTED_HOOK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "hooks");
export const FEATURE_BRANCH_PATTERN = /^codex\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const ZERO_OID = /^0{40}$/u;
const FORBIDDEN_TRAILERS = Object.freeze([
  /co[\s_-]*authored[\s_-]*by\s*:/iu,
  /co[\s_-]*author\s*:/iu,
  /signed[\s_-]*off[\s_-]*by\s*:/iu,
  /authored[\s_-]*by\s*:/iu,
  /assisted[\s_-]*by\s*:/iu,
  /generated[\s_-]*by\s*:/iu,
  /reviewed[\s_-]*by\s*:/iu,
  /contributed[\s_-]*by\s*:/iu,
  /pair[\s_-]*program(?:med|ming)[\s_-]*by\s*:/iu,
  /ai[\s_-]*(?:assisted|generated|authored)[\s_-]*by\s*:/iu,
  /agent[\s_-]*by\s*:/iu,
  /bot[\s_-]*by\s*:/iu,
  /tool[\s_-]*by\s*:/iu,
  /created[\s_-]*by\s*:/iu,
  /built[\s_-]*by\s*:/iu,
  /tested[\s_-]*by\s*:/iu,
  /helped[\s_-]*by\s*:/iu,
]);
const FORBIDDEN_AGENT_PHRASE =
  /(?:co[\s_-]*authored|generated|assisted|authored|written|created|reviewed|contributed|pair[\s_-]*program(?:med|ming)|built|tested|helped)\s+by\s+(?:(?:an?|the)\s+)?(?:agent|bot|ai|cursor|factory[\s_-]*droid|claude|copilot|chatgpt|openai|codex|gemini|windsurf|cody)\b/iu;

class GuardFailure extends Error {
  constructor(message) {
    super(message);
    this.name = "GuardFailure";
  }
}

function fail(message) {
  throw new GuardFailure(message);
}

function trimOutput(result, label) {
  if (result.error) fail(label + " could not start: " + result.error.message);
  if (result.status !== 0) {
    fail(label + " failed (exit " + result.status + "): " + String(result.stderr || result.stdout || "").trim());
  }
  return String(result.stdout ?? "").trim();
}

function git(args, { cwd = undefined, input = undefined, allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    input,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (allowFailure) return result;
  return trimOutput(result, "git " + args.join(" "));
}

function gitIn(repo, args, options = {}) {
  return git(args, { cwd: repo, ...options });
}

// Each hook is its own process, and on Windows every git process costs 100-200 ms, so the guard asks
// git once for what it needs and keeps the answers for the rest of the process.
const commonDirs = new Map();
const configSnapshots = new Map();

function repoRoot() {
  const both = git(["rev-parse", "--show-toplevel", "--git-common-dir"], { allowFailure: true });
  const lines = both.status === 0 ? String(both.stdout ?? "").split(/\r?\n/u) : [];
  // On failure, or on output this does not expect, the single call reports exactly what it always has.
  if (lines.length < 2 || !lines[0].trim() || !lines[1].trim()) {
    return path.resolve(git(["rev-parse", "--show-toplevel"]));
  }
  const root = path.resolve(lines[0].trim());
  // --git-common-dir is relative to the working directory, which is not always the top level.
  commonDirs.set(root, path.resolve(lines[1].trim()));
  return root;
}

function gitCommonDir(repo) {
  const known = commonDirs.get(path.resolve(repo));
  if (known) return known;
  const value = gitIn(repo, ["rev-parse", "--git-common-dir"]);
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(repo, value);
}

function samePath(left, right) {
  const normalize = (value) => path.resolve(String(value)).replaceAll("\\", "/").replace(/\/$/u, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function normalizeRemote(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/u, "")
    .toLowerCase();
}

/**
 * A config key as git compares it: the section and the final name ignore case, a subsection keeps it.
 * "--list" prints keys in this form, and "--get" normalises the key it is asked for the same way.
 */
export function canonicalConfigKey(key) {
  const text = String(key);
  const first = text.indexOf(".");
  const last = text.lastIndexOf(".");
  if (first === last) return text.toLowerCase();
  return text.slice(0, first).toLowerCase() + text.slice(first, last) + text.slice(last).toLowerCase();
}

/**
 * Parses "git config --null --list": entries end in NUL, a key is separated from its value by the first
 * newline, and a key with no value has no newline. A key set more than once keeps its last value, as
 * "--get" returns it. Values are trimmed as the guard trimmed "--get" output.
 */
export function parseConfigList(text) {
  const values = new Map();
  for (const entry of String(text).split("\0")) {
    if (!entry) continue;
    const newline = entry.indexOf("\n");
    const key = newline < 0 ? entry : entry.slice(0, newline);
    const value = newline < 0 ? "" : entry.slice(newline + 1);
    values.set(canonicalConfigKey(key), value.trim());
  }
  return values;
}

function configSnapshot(repo) {
  const key = path.resolve(repo);
  if (!configSnapshots.has(key)) {
    const result = gitIn(repo, ["config", "--local", "--null", "--list"], { allowFailure: true });
    // Where the list cannot be read, every "--get" would have failed too, and an unset key reads as "".
    configSnapshots.set(key, result.status === 0 ? parseConfigList(result.stdout ?? "") : new Map());
  }
  return configSnapshots.get(key);
}

function localConfig(repo, key) {
  return configSnapshot(repo).get(canonicalConfigKey(key)) ?? "";
}

function identityFromGitVar(value) {
  const match = String(value)
    .trim()
    .match(/^(.+?) <([^<>]+)>\s+\d+\s+[+-]\d{4}$/u);
  return match ? { name: match[1], email: match[2] } : null;
}

export function isOwnerIdentity(identity) {
  return identity?.name === OWNER.name && identity?.email === OWNER.email;
}

function assertEffectiveIdentity(repo, operation) {
  for (const [nameKey, emailKey, label] of [
    ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "author"],
    ["GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "committer"],
  ]) {
    const name = process.env[nameKey];
    const email = process.env[emailKey];
    if ((name !== undefined && name !== OWNER.name) || (email !== undefined && email !== OWNER.email)) {
      fail(operation + " blocked: " + label + " environment override is not " + OWNER.name + " <" + OWNER.email + ">");
    }
  }
  const author = identityFromGitVar(gitIn(repo, ["var", "GIT_AUTHOR_IDENT"]));
  const committer = identityFromGitVar(gitIn(repo, ["var", "GIT_COMMITTER_IDENT"]));
  if (!isOwnerIdentity(author)) {
    fail(
      operation +
        " blocked: effective author is " +
        (author ? author.name + " <" + author.email + ">" : "unparseable") +
        ", expected " +
        OWNER.name +
        " <" +
        OWNER.email +
        ">",
    );
  }
  if (!isOwnerIdentity(committer)) {
    fail(
      operation +
        " blocked: effective committer is " +
        (committer ? committer.name + " <" + committer.email + ">" : "unparseable") +
        ", expected " +
        OWNER.name +
        " <" +
        OWNER.email +
        ">",
    );
  }
}

function configuredHooksRoot(repo) {
  const configured = localConfig(repo, "core.hooksPath");
  if (!configured) return "";
  return path.isAbsolute(configured) ? path.resolve(configured) : path.resolve(repo, configured);
}

function assertInstalledPolicy(repo) {
  const expectedOrigin = localConfig(repo, "tear.governance.expectedOrigin");
  const repositoryId = localConfig(repo, "tear.governance.repository");
  const commonDirConfigured = localConfig(repo, "tear.governance.gitCommonDir");
  const origin = localConfig(repo, "remote.origin.url");
  const allowedIds = new Set(["tear", "tear-music", "tear-wiki"]);
  if (!allowedIds.has(repositoryId) || !expectedOrigin) {
    fail(
      "Tear governance is not installed for this repository; run install-owner-guards.mjs after validating the canonical origin",
    );
  }
  if (normalizeRemote(origin) !== normalizeRemote(expectedOrigin)) {
    fail("repository origin mismatch: expected " + expectedOrigin + ", found " + (origin || "(missing)"));
  }
  const expectedHooks = path.resolve(EXPECTED_HOOK_ROOT);
  if (!samePath(configuredHooksRoot(repo), expectedHooks)) {
    fail("shared owner hooks are not active (expected " + expectedHooks + ")");
  }
  if (localConfig(repo, "user.useConfigOnly").toLowerCase() !== "true") {
    fail("user.useConfigOnly=true is required");
  }
  for (const [key, expected] of [
    ["user.name", OWNER.name],
    ["user.email", OWNER.email],
    ["author.name", OWNER.name],
    ["author.email", OWNER.email],
    ["committer.name", OWNER.name],
    ["committer.email", OWNER.email],
    ["tear.governance.ownerName", OWNER.name],
    ["tear.governance.ownerEmail", OWNER.email],
  ]) {
    if (localConfig(repo, key) !== expected) fail(key + " is not the owner identity");
  }
  const commonDir = gitCommonDir(repo);
  if (!commonDirConfigured || !samePath(commonDirConfigured, commonDir)) {
    fail("Git common directory does not match the installed governance policy");
  }
  const expectedHookFiles = ["pre-commit", "commit-msg", "pre-merge-commit", "prepare-commit-msg", "pre-push"];
  for (const hookName of expectedHookFiles) {
    const hookPath = path.join(expectedHooks, hookName);
    if (!fs.existsSync(hookPath)) fail("shared hook is missing: " + hookName);
  }
  return { repositoryId, expectedOrigin, commonDir };
}

function currentBranch(repo) {
  const result = gitIn(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  return result.status === 0 ? String(result.stdout ?? "").trim() : "";
}

export function isApprovedFeatureBranch(branch) {
  return (
    Boolean(branch) &&
    FEATURE_BRANCH_PATTERN.test(branch) &&
    !branch.includes("..") &&
    !branch.includes("//") &&
    !branch.endsWith("/") &&
    !branch.includes("@{")
  );
}

function assertFeatureBranch(repo, operation) {
  const branch = currentBranch(repo);
  if (!branch) fail(operation + " blocked: detached HEAD is not a publishing workspace");
  if (branch === "main" || branch === "master" || /(?:^|[/-])(legacy|oracle)(?:$|[/-])/iu.test(branch)) {
    fail(operation + " blocked on protected/legacy branch " + branch);
  }
  if (!isApprovedFeatureBranch(branch)) {
    fail(operation + " requires a focused codex/<scope> branch; found " + branch);
  }
  return branch;
}

export function normalizeCommitMessage(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\p{Cf}\uFEFF]/gu, "")
    .replace(/[‐‑‒–—―﹘﹣－]/gu, "-")
    .replace(/[：]/gu, ":")
    .replace(/[\u00a0\u2007\u202f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function findForbiddenAttribution(text) {
  const normalized = normalizeCommitMessage(text);
  const trailer = FORBIDDEN_TRAILERS.find((pattern) => pattern.test(normalized));
  if (trailer) return "forbidden third-party attribution trailer";
  if (FORBIDDEN_AGENT_PHRASE.test(normalized)) return "forbidden agent/bot/AI attribution phrase";
  return null;
}

function assertCleanMessage(text, operation) {
  const violation = findForbiddenAttribution(text);
  if (violation)
    fail(operation + " blocked: " + violation + "; publish only owner-authored work without attribution trailers");
}

function readMessageFile(messagePath) {
  if (!messagePath) fail("commit message path is missing");
  let text;
  try {
    text = fs.readFileSync(messagePath, "utf8");
  } catch (error) {
    fail("cannot read commit message " + messagePath + ": " + error.message);
  }
  return text;
}

function assertCommitObject(repo, oid, operation) {
  const fields = gitIn(repo, ["show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce%x00%B", oid]).split("\0");
  const [authorName, authorEmail, committerName, committerEmail, ...messageParts] = fields;
  const author = { name: authorName, email: authorEmail };
  const committer = { name: committerName, email: committerEmail };
  if (!isOwnerIdentity(author) || !isOwnerIdentity(committer)) {
    fail(operation + " blocked: commit " + oid.slice(0, 12) + " is not owner-authored and owner-committed");
  }
  assertCleanMessage(messageParts.join("\0"), operation + " commit " + oid.slice(0, 12));
}

function isAncestor(repo, ancestor, descendant) {
  return gitIn(repo, ["merge-base", "--is-ancestor", ancestor, descendant], { allowFailure: true }).status === 0;
}

/** Batch branches as scripts/merge-batch.mjs names them (BATCH_BRANCH there), as a remote ref. */
export const BATCH_BRANCH_REF = /^refs\/heads\/codex\/batch-\d{8}t\d{6}z$/u;

function assertPushLine(repo, repositoryId, remoteName, remoteUrl, branch, line) {
  const fields = line.trim().split(/\s+/u);
  if (fields.length < 4) fail("pre-push blocked: malformed update line " + line);
  const [localRef, localOid, remoteRef, remoteOid] = fields;
  if (localRef === "(delete)" || ZERO_OID.test(localOid)) {
    // Owner decision, 2026-11-16: a throwaway batch branch (scripts/merge-batch.mjs --prune) may be
    // deleted. Its name must match the batch pattern exactly; every other deletion stays refused.
    if (localRef === "(delete)" && ZERO_OID.test(localOid) && BATCH_BRANCH_REF.test(remoteRef)) return;
    fail("pre-push blocked: branch deletion is not an approved publishing operation");
  }
  const expectedLocalRef = "refs/heads/" + branch;
  if (localRef !== expectedLocalRef)
    fail("pre-push blocked: push source " + localRef + " is not the current branch " + expectedLocalRef);
  if (!isApprovedFeatureBranch(branch)) fail("pre-push blocked: source branch " + branch + " is outside codex/<scope>");
  if (!/^refs\/heads\/codex\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(remoteRef) || remoteRef !== localRef) {
    fail("pre-push blocked: remote target " + remoteRef + " must be the same codex/<scope> branch");
  }
  const originMain = "refs/remotes/origin/main";
  if (gitIn(repo, ["show-ref", "--verify", "--quiet", originMain], { allowFailure: true }).status !== 0) {
    fail("pre-push blocked: fetch origin/main before publishing a feature branch");
  }
  // A branch is built on main's history but need not contain main's newest commit: main moves
  // many times a day, and requiring its tip made every finished branch be rebuilt and re-verified
  // before its first push. Freshness is enforced where it decides something: the pull request's
  // required check runs on the merge with current main, and the merge helper refuses a red main.
  if (gitIn(repo, ["merge-base", originMain, localOid], { allowFailure: true }).status !== 0) {
    fail("pre-push blocked: feature branch shares no history with origin/main");
  }
  if (!ZERO_OID.test(remoteOid) && !isAncestor(repo, remoteOid, localOid)) {
    fail("pre-push blocked: non-fast-forward/force update is not permitted");
  }
  // Only commits this push publishes are checked. Commits already on origin/main are published
  // history (squash merges are committed by GitHub), so a branch may take main in with
  // "git merge origin/main" to resolve a conflict and keep its one branch and pull request.
  const published = ZERO_OID.test(remoteOid) ? [originMain] : [originMain, remoteOid];
  const unpublished = gitIn(repo, ["rev-list", localOid, "--not", ...published], { allowFailure: true });
  if (unpublished.status !== 0) fail("cannot determine unpublished commits: " + (unpublished.stderr || "").trim());
  for (const oid of String(unpublished.stdout ?? "")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)) {
    assertCommitObject(repo, oid, "pre-push " + repositoryId);
  }
}

function runPrePush(repo, args) {
  const [remoteName, remoteUrl] = args;
  if (remoteName !== "origin") fail("pre-push blocked: only origin is approved, found " + (remoteName || "(missing)"));
  const expectedOrigin = localConfig(repo, "tear.governance.expectedOrigin");
  if (normalizeRemote(remoteUrl) !== normalizeRemote(expectedOrigin)) {
    fail("pre-push blocked: remote URL is not the exact approved origin " + expectedOrigin);
  }
  const branch = assertFeatureBranch(repo, "pre-push");
  const input = fs.readFileSync(0, "utf8");
  const lines = input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return;
  const repositoryId = localConfig(repo, "tear.governance.repository");
  for (const line of lines) assertPushLine(repo, repositoryId, remoteName, remoteUrl, branch, line);
}

export function runGuard(command, args = [], { repo = repoRoot() } = {}) {
  assertInstalledPolicy(repo);
  if (command === "pre-commit" || command === "pre-merge-commit") {
    assertEffectiveIdentity(repo, command);
    assertFeatureBranch(repo, command);
    return;
  }
  if (command === "prepare-commit-msg" || command === "commit-msg") {
    assertEffectiveIdentity(repo, command);
    assertFeatureBranch(repo, command);
    const messagePath = args[0];
    assertCleanMessage(readMessageFile(messagePath), command);
    return;
  }
  if (command === "pre-push") {
    assertEffectiveIdentity(repo, command);
    runPrePush(repo, args);
    return;
  }
  fail("unknown governance hook command " + command);
}

export function main(argv = process.argv.slice(2)) {
  try {
    runGuard(argv[0], argv.slice(1));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[tear-governance] " + message);
    return 1;
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
