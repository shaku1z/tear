/*
 * Guarded local-only C26 regression bisection.
 *
 * This intentionally has no production-runtime dependency. It creates one
 * detached worktree below ignored TearBench artifacts, runs only the
 * test-build materializer there, and deletes only that exact worktree after
 * recording the evidence in the invoking clean checkout.
 */
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = resolve(root, "artifacts", "tearbench", "bisect");
const tempRoot = resolve(root, "artifacts", "tearbench", "bisect-worktrees");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new TypeError(`${name} requires a value`);
  return value;
}

function requiredOption(name, usage) {
  const value = option(name);
  if (!value) throw new TypeError(usage);
  return value;
}

function numericOption(name, fallback) {
  const value = Number.parseInt(option(name, String(fallback)), 10);
  if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be an integer`);
  return value;
}

function command(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
}

function git(args, cwd = root) {
  return command("git", args, cwd);
}

function gitOutput(args, cwd = root) {
  const result = git(args, cwd);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || result.error || "unknown error").trim()}`);
  return result.stdout.trim();
}

function isWithin(parent, target) {
  const path = relative(parent, target);
  return path !== "" && !path.startsWith(`..${sep}`) && path !== ".." && !path.includes(`..${sep}`);
}

function assertSafeTempWorktree(path) {
  if (!isWithin(tempRoot, path)) throw new TypeError("refusing to operate on a worktree outside artifacts/tearbench/bisect-worktrees");
}

function revisionDirectoryName(revision) {
  return revision.replaceAll(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 80);
}

function pnpmInvocation(args) {
  if (process.env.npm_execpath) return { executable: process.execPath, args: [process.env.npm_execpath, ...args] };
  if (process.env.APPDATA) {
    return {
      executable: process.execPath,
      args: [resolve(process.env.APPDATA, "npm", "node_modules", "pnpm", "bin", "pnpm.mjs"), ...args],
    };
  }
  return { executable: process.platform === "win32" ? "pnpm.cmd" : "pnpm", args };
}

function currentSourceMustBeClean() {
  const status = gitOutput(["status", "--porcelain", "--untracked-files=all"]);
  if (status !== "") {
    throw new Error("refusing local bisection from a dirty source checkout; commit, stash, or discard unrelated changes first");
  }
}

function resolveCommit(revision) {
  return gitOutput(["rev-parse", "--verify", `${revision}^{commit}`]);
}

function verifyCommitRange(good, bad, maxRevisions) {
  if (git(["merge-base", "--is-ancestor", good, bad]).status !== 0) {
    throw new Error("refusing bisection: --good must be an ancestor of --bad");
  }
  const candidates = [good, ...gitOutput(["rev-list", "--reverse", `${good}..${bad}`]).split(/\r?\n/u).filter(Boolean)];
  if (candidates.length < 2) throw new Error("refusing bisection: --good and --bad resolve to the same revision");
  if (candidates.length > maxRevisions) {
    throw new Error(`refusing bisection: ${String(candidates.length)} revisions exceed --max-revisions ${String(maxRevisions)}`);
  }
  return candidates;
}

async function withTearbenchModules(callback) {
  const { createServer } = await import("vite");
  const server = await createServer({ root, server: { middlewareMode: true } });
  try {
    return await callback({
      bisection: await server.ssrLoadModule("/src/tearbench/bisection.ts"),
      intelligence: await server.ssrLoadModule("/src/tearbench/regression-intelligence.ts"),
    });
  } finally {
    await server.close();
  }
}

async function readRun(path) {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  if (parsed?.format !== "tearbench-run") throw new TypeError(`materializer did not write a tearbench-run artifact: ${path}`);
  return parsed;
}

function runMaterializer(worktree, scenario, seed, actionTrace, artifactPath) {
  const invocation = pnpmInvocation([
    "tearbench", "run", scenario, "--seed", seed, "--repeat", "1", "--artifact", artifactPath,
    ...(actionTrace === undefined ? [] : ["--actions", actionTrace]),
  ]);
  return command(invocation.executable, invocation.args, worktree);
}

async function cleanupWorktree(path, created) {
  if (!created) return;
  assertSafeTempWorktree(path);
  const removal = git(["worktree", "remove", "--force", path]);
  // Git owns a linked worktree's metadata. Only remove this exact ignored
  // directory if Git already removed it or left a failed-removal remnant.
  if (removal.status !== 0) await rm(path, { recursive: true, force: true });
}

function attemptError(attempt, error) {
  return Object.freeze({ attempt, outcome: "execution-error", error: error.slice(0, 2_000) });
}

async function executeRevision({ worktree, revision, scenario, seed, repetitions, baseArtifacts, actionTrace, modules, runRoot }) {
  const checkout = git(["checkout", "--detach", revision], worktree);
  if (checkout.status !== 0) {
    return {
      record: modules.bisection.createBisectRevisionRecord(revision, Array.from({ length: repetitions }, (_, index) =>
        attemptError(index + 1, `clean detached checkout failed: ${(checkout.stderr || checkout.stdout || checkout.error || "unknown error").trim()}`))),
    };
  }
  const status = git(["status", "--porcelain", "--untracked-files=all"], worktree);
  if (status.status !== 0 || status.stdout.trim() !== "") {
    return {
      record: modules.bisection.createBisectRevisionRecord(revision, Array.from({ length: repetitions }, (_, index) =>
        attemptError(index + 1, "worktree was not clean before materialization"))),
    };
  }
  const attempts = [];
  let firstInvestigation;
  for (let index = 0; index < repetitions; index += 1) {
    const attempt = index + 1;
    const artifactPath = resolve(runRoot, revisionDirectoryName(revision), `attempt-${String(attempt)}.json`);
    await mkdir(dirname(artifactPath), { recursive: true });
    const result = runMaterializer(worktree, scenario, seed, actionTrace, artifactPath);
    if (result.status !== 0) {
      attempts.push(attemptError(attempt, `materializer failed: ${(result.stderr || result.stdout || result.error || "unknown error").trim()}`));
      continue;
    }
    try {
      const candidate = await readRun(artifactPath);
      const priorAttemptPath = attempts[0]?.artifactPath;
      const basePath = baseArtifacts[index] ?? priorAttemptPath;
      const base = basePath === undefined ? candidate : await readRun(basePath);
      const investigation = modules.intelligence.investigateRegressionRuns({ base, candidate, createdAt: new Date().toISOString() });
      const investigationPath = artifactPath.replace(/\.json$/u, ".investigation.json");
      await writeFile(investigationPath, `${JSON.stringify(investigation, null, 2)}\n`, "utf8");
      if (firstInvestigation === undefined && !investigation.comparison.equivalent) firstInvestigation = investigation;
      attempts.push(Object.freeze({
        attempt,
        outcome: investigation.comparison.equivalent ? "does-not-reproduce" : "reproduces",
        artifactPath,
        investigationPath,
        ...(investigation.comparison.firstMaterialDivergence === undefined ? {} : { firstMaterialDivergenceTick: investigation.comparison.firstMaterialDivergence.tick }),
      }));
    } catch (error) {
      attempts.push(attemptError(attempt, error instanceof Error ? error.message : String(error)));
    }
  }
  return { record: modules.bisection.createBisectRevisionRecord(revision, attempts), firstInvestigation };
}

function changedPathsForCommit(revision) {
  const result = git(["diff-tree", "--no-commit-id", "--name-only", "-r", revision]);
  return result.status === 0 ? result.stdout.split(/\r?\n/u).map((path) => path.trim()).filter(Boolean) : [];
}

function usage() {
  return "usage: node scripts/tearbench-bisect-worktree.mjs --good <ancestor-revision> --bad <known-bad-revision> --scenario <canonical-id> [--seed value] [--actions trace.json] [--repetitions 3] [--max-revisions 24] [--artifact path]";
}

export async function main() {
  const goodInput = requiredOption("--good", usage());
  const badInput = requiredOption("--bad", usage());
  const scenario = requiredOption("--scenario", usage());
  const seed = option("--seed", "1001");
  const repetitions = numericOption("--repetitions", 3);
  const maxRevisions = numericOption("--max-revisions", 24);
  const actionTrace = option("--actions");
  const artifactPath = resolve(option("--artifact", resolve(artifactRoot, `bisect-${Date.now()}.json`)));
  if (!isWithin(root, artifactPath)) throw new TypeError("bisection artifact must remain inside the workspace");

  return withTearbenchModules(async (modules) => {
    const request = modules.bisection.validateBisectRequest({ goodRevision: goodInput, badRevision: badInput, repetitions, maxRevisions });
    currentSourceMustBeClean();
    const good = resolveCommit(goodInput);
    const bad = resolveCommit(badInput);
    const candidates = verifyCommitRange(good, bad, maxRevisions);
    const tempWorktree = resolve(tempRoot, `bisect-${process.pid}-${Date.now()}`);
    assertSafeTempWorktree(tempWorktree);
    let created = false;
    const records = new Map();
    const runRoot = resolve(artifactRoot, `runs-${Date.now()}`);
    let baselineArtifacts;
    let currentInvestigation;
    let reason;
    try {
      await mkdir(tempRoot, { recursive: true });
      const add = git(["worktree", "add", "--detach", tempWorktree, good]);
      if (add.status !== 0) throw new Error(`clean worktree creation failed: ${(add.stderr || add.stdout || add.error || "unknown error").trim()}`);
      created = true;
      const baseline = await executeRevision({ worktree: tempWorktree, revision: good, scenario, seed, repetitions, baseArtifacts: [], actionTrace, modules, runRoot });
      records.set(good, baseline.record);
      baselineArtifacts = baseline.record.attempts.flatMap((attempt) => attempt.artifactPath === undefined ? [] : [attempt.artifactPath]);
      if (baseline.record.stability !== "does-not-reproduce" || baselineArtifacts.length !== repetitions) {
        reason = "the declared good revision was unavailable, unstable, or reproduced the regression";
      } else {
        let low = 0;
        let high = candidates.length - 1;
        while (low + 1 < high && reason === undefined) {
          const middle = Math.floor((low + high) / 2);
          const revision = candidates[middle];
          if (revision === undefined) throw new Error("bisection selected an invalid revision");
          const execution = await executeRevision({ worktree: tempWorktree, revision, scenario, seed, repetitions, baseArtifacts: baselineArtifacts, actionTrace, modules, runRoot });
          records.set(revision, execution.record);
          if (execution.firstInvestigation !== undefined) currentInvestigation = execution.firstInvestigation;
          if (execution.record.stability === "does-not-reproduce") low = middle;
          else if (execution.record.stability === "reproduces") high = middle;
          else reason = `revision ${revision} was ${execution.record.stability}`;
        }
        if (reason === undefined) {
          const revision = candidates[high];
          if (revision === undefined) throw new Error("bisection selected an invalid known-bad revision");
          if (!records.has(revision)) {
            const execution = await executeRevision({ worktree: tempWorktree, revision, scenario, seed, repetitions, baseArtifacts: baselineArtifacts, actionTrace, modules, runRoot });
            records.set(revision, execution.record);
            if (execution.firstInvestigation !== undefined) currentInvestigation = execution.firstInvestigation;
          }
        }
      }
      const ordered = [...records.values()].sort((left, right) => candidates.indexOf(left.revision) - candidates.indexOf(right.revision));
      const selected = reason === undefined ? modules.bisection.selectFirstStableBadRevision(ordered) : { reason };
      const firstBadRevision = selected.firstBadRevision;
      const ownership = modules.bisection.deriveBisectOwnershipHints({
        changedPaths: firstBadRevision === undefined ? [] : changedPathsForCommit(firstBadRevision),
        investigation: currentInvestigation,
        firstBadRevision,
      });
      const output = {
        format: "tearbench-local-bisection", schemaVersion: 1, createdAt: new Date().toISOString(), request,
        scenario: { id: scenario, seed, ...(actionTrace === undefined ? {} : { actionTrace }) },
        revisions: ordered,
        result: firstBadRevision === undefined
          ? { status: "inconclusive", reason: selected.reason ?? "no stable first-bad revision was established" }
          : { status: "first-bad-found", firstBadRevision },
        ownership,
      };
      await mkdir(dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
      console.log(`${output.result.status.toUpperCase()}${firstBadRevision === undefined ? "" : ` ${firstBadRevision}`}`);
      console.log(`artifact: ${artifactPath}`);
      return output;
    } finally {
      await cleanupWorktree(tempWorktree, created);
    }
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
