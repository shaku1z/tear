import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { RELEASE_REPOSITORY } from "./release-artifact.mjs";
import { normalizeRepositoryIdentifier } from "./repository-identity.mjs";
import { readArtifactRetentionPolicy } from "./report-artifacts.mjs";

export { normalizeRepositoryIdentifier } from "./repository-identity.mjs";

const DEFAULT_CONTRACT_PATH = path.resolve(import.meta.dirname, "..", "config", "workspace-contract.json");
const ORACLE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

function commandError(result, command) {
  const detail = result.error?.message || result.stderr || result.stdout || "unknown error";
  return `${command} failed: ${String(detail).trim()}`;
}

function runGit(root, argumentsList) {
  const result = spawnSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function normalizeComparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  try {
    return normalizeComparablePath(fs.realpathSync(left)) === normalizeComparablePath(fs.realpathSync(right));
  } catch {
    return normalizeComparablePath(left) === normalizeComparablePath(right);
  }
}

function readContract(contractPath) {
  const parsed = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const errors = [];
  if (parsed?.schemaVersion !== 1) errors.push("workspace contract schemaVersion must be 1");
  if (typeof parsed?.repository !== "string" || parsed.repository.trim() === "") {
    errors.push("workspace contract repository is required");
  } else if (normalizeRepositoryIdentifier(parsed.repository) !== normalizeRepositoryIdentifier(RELEASE_REPOSITORY)) {
    errors.push(`workspace contract repository must identify ${RELEASE_REPOSITORY}`);
  }
  for (const field of ["requiredTrackedDirectories", "optionalTrackedDirectories", "forbiddenTrackedDirectories"]) {
    if (!Array.isArray(parsed?.[field]) || parsed[field].some((value) => typeof value !== "string" || value.includes("/"))) {
      errors.push(`workspace contract ${field} must contain top-level directory names`);
    }
  }
  if (typeof parsed?.deployment?.assetsDirectory !== "string" || !Array.isArray(parsed?.deployment?.configs)) {
    errors.push("workspace contract deployment configuration is incomplete");
  }
  if (!ORACLE_COMMIT_PATTERN.test(String(parsed?.oracle?.lockedCommit ?? ""))) {
    errors.push("workspace contract oracle lockedCommit must be a 40-character hexadecimal SHA");
  }
  return { contract: parsed, errors };
}

function stripJsonComments(text) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
    } else if (character === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      result += "\n";
    } else if (character === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
      index += 1;
    } else {
      result += character;
    }
  }
  return result;
}

export function readDeploymentAssets(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return { ok: false, error: `${relativePath} is missing` };
  let text;
  try {
    text = stripJsonComments(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    return { ok: false, error: `${relativePath} cannot be read: ${error.message}` };
  }
  const values = [...text.matchAll(/"directory"\s*:\s*"([^"]*)"/gu)].map((match) => match[1]);
  if (values.length !== 1) {
    return { ok: false, error: `${relativePath} must declare exactly one assets directory` };
  }
  return { ok: true, value: values[0] };
}

function isUnsafeDeploymentPath(value) {
  const normalized = value.replaceAll("\\", "/");
  return path.posix.isAbsolute(normalized)
    || /^[A-Za-z]:\//u.test(normalized)
    || normalized.startsWith("//")
    || normalized.split("/").includes("..");
}

export function parseWorktreeList(text) {
  const entries = [];
  let current = null;
  for (const line of text.split(/\r?\n/u)) {
    if (line === "") continue;
    if (line.startsWith("worktree ")) {
      if (current !== null) entries.push(current);
      current = { path: line.slice("worktree ".length), bare: false, head: null, branch: null, locked: false, lockReason: null };
    } else if (current !== null && line === "bare") {
      current.bare = true;
    } else if (current !== null && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (current !== null && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    } else if (current !== null && line === "locked") {
      current.locked = true;
      current.lockReason = "";
    } else if (current !== null && line.startsWith("locked ")) {
      current.locked = true;
      current.lockReason = line.slice("locked ".length);
    }
  }
  if (current !== null) entries.push(current);
  return entries;
}

export function scanRegisteredWorktrees(root) {
  const result = runGit(root, ["worktree", "list", "--porcelain"]);
  if (!result.ok) return { entries: [], errors: [commandError(result, "git worktree list --porcelain")] };
  const entries = parseWorktreeList(result.stdout);
  const errors = [];
  for (const entry of entries) {
    if (entry.bare) continue;
    if (!fs.existsSync(entry.path)) {
      errors.push(`registered worktree path is missing: ${entry.path}`);
      continue;
    }
    const inside = runGit(entry.path, ["rev-parse", "--is-inside-work-tree"]);
    if (!inside.ok || inside.stdout.trim() !== "true") {
      errors.push(`registered worktree is not readable: ${entry.path}`);
      continue;
    }
    const gitDirectory = runGit(entry.path, ["rev-parse", "--git-dir"]);
    if (!gitDirectory.ok) {
      errors.push(`registered worktree Git directory is unreadable: ${entry.path}`);
      continue;
    }
    const absoluteGitDirectory = path.isAbsolute(gitDirectory.stdout.trim())
      ? gitDirectory.stdout.trim()
      : path.resolve(entry.path, gitDirectory.stdout.trim());
    if (!fs.existsSync(absoluteGitDirectory)) {
      errors.push(`registered worktree Git directory is missing: ${entry.path}`);
    }
  }
  if (entries.length === 0) errors.push("Git reported no registered worktrees");
  return { entries, errors };
}

export function scanWorkspaceGitPointers(workspaceRoot, canonicalRoot) {
  const errors = [];
  const findings = [];
  const absoluteWorkspaceRoot = path.resolve(workspaceRoot);
  if (!fs.existsSync(absoluteWorkspaceRoot) || !fs.statSync(absoluteWorkspaceRoot).isDirectory()) {
    return { errors: [`workspace-root is not a directory: ${absoluteWorkspaceRoot}`], findings };
  }
  for (const entry of fs.readdirSync(absoluteWorkspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(absoluteWorkspaceRoot, entry.name);
    if (samePath(candidate, canonicalRoot)) continue;
    const pointerPath = path.join(candidate, ".git");
    let pointerStat;
    try {
      pointerStat = fs.lstatSync(pointerPath);
    } catch {
      continue;
    }
    if (!pointerStat.isFile()) continue;
    let pointer;
    try {
      pointer = fs.readFileSync(pointerPath, "utf8").trim().match(/^gitdir:\s*(.+)$/imu)?.[1];
    } catch (error) {
      findings.push(`could not read .git pointer ${pointerPath}: ${error.message}`);
      continue;
    }
    if (!pointer) {
      findings.push(`invalid .git pointer: ${pointerPath}`);
      continue;
    }
    const target = path.resolve(path.dirname(pointerPath), pointer);
    if (!fs.existsSync(target)) findings.push(`invalid .git pointer target: ${pointerPath} -> ${target}`);
  }
  return { errors, findings };
}

function checkIdentity(root, contract, env, errors) {
  const gitRootResult = runGit(root, ["rev-parse", "--show-toplevel"]);
  if (!gitRootResult.ok) {
    errors.push(commandError(gitRootResult, "git rev-parse --show-toplevel"));
    return { head: null, origin: "", environmentRepository: "" };
  }
  const gitRoot = gitRootResult.stdout.trim();
  if (!samePath(root, gitRoot)) errors.push(`requested root is not the canonical Git root: ${root}`);

  const headResult = runGit(root, ["rev-parse", "HEAD"]);
  if (!headResult.ok) errors.push(commandError(headResult, "git rev-parse HEAD"));
  const head = headResult.ok ? headResult.stdout.trim().toLowerCase() : null;
  const originResult = runGit(root, ["config", "--get", "remote.origin.url"]);
  const origin = originResult.ok ? originResult.stdout.trim() : "";
  const environmentRepository = String(env.GITHUB_REPOSITORY ?? "").trim();
  const sources = [
    origin === "" ? null : { label: "origin", value: normalizeRepositoryIdentifier(origin) },
    environmentRepository === "" ? null : { label: "GITHUB_REPOSITORY", value: normalizeRepositoryIdentifier(environmentRepository) },
  ].filter(Boolean);
  const expected = normalizeRepositoryIdentifier(contract.repository);
  if (sources.length === 0) {
    errors.push("canonical repository identity is unavailable (origin and GITHUB_REPOSITORY are both missing)");
  } else {
    for (const source of sources) {
      if (source.value === "" || source.value !== expected) {
        errors.push(`${source.label} does not identify ${contract.repository}: ${source.value || "unparseable"}`);
      }
    }
    if (sources.length > 1 && sources[0].value !== sources[1].value) {
      errors.push(`origin and GITHUB_REPOSITORY disagree: ${sources[0].value} != ${sources[1].value}`);
    }
  }
  const expectedSha = String(env.GITHUB_SHA ?? "").trim().toLowerCase();
  if (expectedSha !== "" && head !== expectedSha) errors.push(`HEAD ${head ?? "unknown"} does not equal GITHUB_SHA ${expectedSha}`);
  return { head, origin, environmentRepository };
}

function checkTrackedStructure(root, contract, errors) {
  const result = runGit(root, ["ls-tree", "-d", "--name-only", "HEAD"]);
  if (!result.ok) {
    errors.push(commandError(result, "git ls-tree -d --name-only HEAD"));
    return [];
  }
  const tracked = result.stdout.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean);
  const trackedSet = new Set(tracked);
  const required = new Set(contract.requiredTrackedDirectories);
  const optional = new Set(contract.optionalTrackedDirectories);
  const forbidden = new Set(contract.forbiddenTrackedDirectories);
  for (const directory of required) if (!trackedSet.has(directory)) errors.push(`required tracked directory is missing: ${directory}`);
  for (const directory of trackedSet) {
    if (forbidden.has(directory)) errors.push(`forbidden generated/output directory is tracked: ${directory}`);
    else if (!required.has(directory) && !optional.has(directory)) errors.push(`unexpected tracked top-level directory: ${directory}`);
  }
  return tracked;
}

function checkDeployment(root, contract, errors) {
  const expected = contract.deployment.assetsDirectory;
  for (const relativePath of contract.deployment.configs) {
    const result = readDeploymentAssets(root, relativePath);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    if (isUnsafeDeploymentPath(result.value) || result.value !== expected) {
      errors.push(`${relativePath} must use the safe assets directory ${expected}; found ${result.value}`);
    }
  }
}

function checkStrictGitState(root, errors) {
  const status = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!status.ok) errors.push(commandError(status, "git status --porcelain=v1 --untracked-files=all"));
  else if (status.stdout.trim() !== "") errors.push(`strict workspace is dirty:\n${status.stdout.trim()}`);

  const branch = runGit(root, ["branch", "--show-current"]);
  if (!branch.ok || branch.stdout.trim() !== "main") errors.push(`strict workspace must be on main, found ${branch.ok ? branch.stdout.trim() || "detached HEAD" : "unknown"}`);

  const upstream = runGit(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (!upstream.ok || upstream.stdout.trim() !== "origin/main") errors.push(`strict main must track origin/main, found ${upstream.ok ? upstream.stdout.trim() || "none" : "none"}`);

  const remote = runGit(root, ["rev-parse", "origin/main"]);
  if (!remote.ok) {
    errors.push(commandError(remote, "git rev-parse origin/main"));
  } else {
    const equality = runGit(root, ["rev-list", "--left-right", "--count", "HEAD...origin/main"]);
    const counts = equality.stdout.trim().split(/\s+/u);
    if (!equality.ok || counts.length !== 2 || counts.some((value) => value !== "0")) {
      errors.push(`strict main must exactly equal origin/main (ahead=${counts[0] ?? "unknown"}, behind=${counts[1] ?? "unknown"})`);
    }
  }
}

function checkOracle(oracleRoot, contract, errors, registeredEntries) {
  if (oracleRoot === undefined) return { status: "skipped", root: null, head: null };
  const root = path.resolve(oracleRoot);
  if (!fs.existsSync(root)) {
    errors.push(`oracle root is missing: ${root}`);
    return { status: "missing", root, head: null };
  }
  const head = runGit(root, ["rev-parse", "HEAD"]);
  const branch = runGit(root, ["branch", "--show-current"]);
  const status = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const initialErrorCount = errors.length;
  const actualHead = head.ok ? head.stdout.trim().toLowerCase() : null;
  if (!head.ok) errors.push(commandError(head, "oracle git rev-parse HEAD"));
  if (actualHead !== String(contract.oracle.lockedCommit).toLowerCase()) {
    errors.push(`oracle HEAD must be locked to ${contract.oracle.lockedCommit}; found ${actualHead ?? "unknown"}`);
  }
  if (!branch.ok || branch.stdout.trim() !== "") errors.push("oracle must remain detached for comparison-only use");
  if (!status.ok || status.stdout.trim() !== "") errors.push("oracle must be clean for comparison-only use");
  const entry = registeredEntries.find((candidate) => !candidate.bare && samePath(candidate.path, root));
  if (entry === undefined) {
    errors.push(`oracle must be a registered worktree: ${root}`);
  } else if (!entry.locked) {
    errors.push("oracle worktree must be locked with a comparison-only reason");
  } else if (!/comparison-only/iu.test(entry.lockReason ?? "")) {
    errors.push(`oracle worktree lock reason must contain comparison-only; found ${entry.lockReason || "empty"}`);
  }
  return { status: errors.length === initialErrorCount ? "validated" : "invalid", root, head: actualHead };
}

function parseArguments(argumentsList) {
  const options = { mode: "ci", root: process.cwd() };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--ci") options.mode = "ci";
    else if (argument === "--strict") options.mode = "strict";
    else if (argument === "--root") options.root = path.resolve(argumentsList[++index]);
    else if (argument === "--contract") options.contractPath = path.resolve(argumentsList[++index]);
    else if (argument === "--workspace-root") options.workspaceRoot = path.resolve(argumentsList[++index]);
    else if (argument === "--oracle-root") options.oracleRoot = path.resolve(argumentsList[++index]);
    else if (argument === "--expected-sha") options.expectedSha = argumentsList[++index];
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export function runWorkspaceCheck({
  root = process.cwd(),
  mode = "ci",
  contractPath = DEFAULT_CONTRACT_PATH,
  workspaceRoot,
  oracleRoot,
  expectedSha,
  env = process.env,
} = {}) {
  if (mode !== "ci" && mode !== "strict") throw new TypeError(`unsupported workspace check mode: ${mode}`);
  const absoluteRoot = path.resolve(root);
  const errors = [];
  const findings = [];
  const loaded = readContract(path.resolve(contractPath));
  errors.push(...loaded.errors);
  const contract = loaded.contract;
  const artifactPolicy = readArtifactRetentionPolicy();
  errors.push(...artifactPolicy.errors.map((error) => `artifact retention policy: ${error}`));
  if (expectedSha !== undefined) env = { ...env, GITHUB_SHA: expectedSha };
  if (!fs.existsSync(absoluteRoot)) {
    errors.push(`workspace root is missing: ${absoluteRoot}`);
    return {
      ok: false,
      mode,
      errors,
      findings,
      trackedDirectories: [],
      head: null,
      oracle: { status: "skipped" },
      artifactPolicy: { status: artifactPolicy.errors.length === 0 ? "validated" : "invalid", path: artifactPolicy.path },
    };
  }
  const identity = checkIdentity(absoluteRoot, contract, env, errors);
  const trackedDirectories = checkTrackedStructure(absoluteRoot, contract, errors);
  checkDeployment(absoluteRoot, contract, errors);

  let registeredEntries = [];
  if (mode === "strict") {
    checkStrictGitState(absoluteRoot, errors);
    const worktrees = scanRegisteredWorktrees(absoluteRoot);
    errors.push(...worktrees.errors);
    registeredEntries = worktrees.entries;
  }

  const resolvedWorkspaceRoot = workspaceRoot ?? (mode === "strict" ? env.TEAR_WORKSPACE_ROOT : undefined);
  if (resolvedWorkspaceRoot !== undefined) {
    const pointerScan = scanWorkspaceGitPointers(resolvedWorkspaceRoot, absoluteRoot);
    findings.push(...pointerScan.findings);
    if (mode === "strict") errors.push(...pointerScan.errors, ...pointerScan.findings);
  }

  const resolvedOracleRoot = oracleRoot ?? (mode === "strict" ? env.TEAR_ORACLE_ROOT : undefined);
  const oracle = mode === "strict"
    ? checkOracle(resolvedOracleRoot, contract, errors, registeredEntries)
    : { status: "skipped", root: null, head: null };
  return {
    ok: errors.length === 0,
    mode,
    errors,
    findings,
    trackedDirectories,
    head: identity.head,
    oracle,
    artifactPolicy: { status: artifactPolicy.errors.length === 0 ? "validated" : "invalid", path: artifactPolicy.path },
  };
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/check-workspace.mjs [--ci|--strict] [--root <repo>] [--workspace-root <dir>] [--oracle-root <repo>] [--expected-sha <sha>]");
      return;
    }
    const result = runWorkspaceCheck(options);
    if (!result.ok) {
      console.error([`workspace ${result.mode} check failed:`, ...result.errors.map((error) => `- ${error}`)].join("\n"));
      if (result.findings.length > 0) console.error(["workspace findings:", ...result.findings.map((finding) => `- ${finding}`)].join("\n"));
      process.exitCode = 1;
      return;
    }
    console.log(`workspace ${result.mode} check passed (${result.head ?? "unknown"}, ${result.trackedDirectories.length} tracked top-level directories, oracle ${result.oracle.status})`);
    if (result.findings.length > 0) console.log(["workspace findings:", ...result.findings.map((finding) => `- ${finding}`)].join("\n"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === thisFile) main();
