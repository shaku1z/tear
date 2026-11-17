// Runs the checks listed in config/checks.json. CI runs the same list, group by group.
//
//   node scripts/run-checks.mjs                  every gate group in order (`pnpm check`)
//   node scripts/run-checks.mjs fast             the fast group (`pnpm check:quick`, the pre-push hook)
//   node scripts/run-checks.mjs static           one group: fast, static, unit, build, browser, nightly, weekly
//   node scripts/run-checks.mjs browser --list   print what would run
//
// It stops at the first failing check. The browser and nightly groups serve the builds in dist/, so
// run the build group first. On this machine, every group except `fast` first takes one of a few
// slots shared by all worktrees of the repository (TEAR_CHECK_SLOTS, default 2), so parallel
// sessions do not starve each other into timeouts. A full `pnpm check` that passes on a clean
// checkout records the commit in the Git directory (`--passed` prints it) for the pull request.
//
// With TEAR_CHECK_RESULTS set to a file, each check's result is added to that file as it finishes
// (one file per run; CI uploads it per attempt). With TEAR_CHECK_PREVIOUS set to an earlier
// attempt's file, a check that failed there on the same tree and passes now prints a FLAKY line.
// Nothing is retried: a failure still fails the run.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadChecks(path = resolve(root, "config/checks.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The checks one invocation runs, in list order, each with its exact argument list. */
export function selectChecks(config, group) {
  const selected = [];
  for (const name of group === undefined ? config.gate : [group]) {
    const checks = config.groups[name];
    if (checks === undefined) throw new RangeError(`unknown check group: ${name}`);
    for (const check of checks) selected.push({ ...check, group: name, args: check.run.split(" ") });
  }
  return selected;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function gitPath(args) {
  const value = git(args);
  return value === undefined ? undefined : isAbsolute(value) ? value : resolve(root, value);
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

/** Waits for a free machine-wide slot and returns a function that releases it. */
export async function takeSlot({ directory, slots, staleMs = 3 * 60 * 60_000, wait = 5000, log = console.log }) {
  mkdirSync(directory, { recursive: true });
  const started = Date.now();
  let announced = false;
  for (;;) {
    for (let index = 0; index < slots; index += 1) {
      const slot = resolve(directory, `slot-${String(index)}.json`);
      try {
        writeFileSync(slot, JSON.stringify({ pid: process.pid, since: Date.now(), cwd: root }), { flag: "wx" });
        return () => rmSync(slot, { force: true });
      } catch {
        try {
          const owner = JSON.parse(readFileSync(slot, "utf8"));
          if (!alive(owner.pid) || Date.now() - owner.since > staleMs) rmSync(slot, { force: true });
        } catch {
          // A slot being written right now, or already freed: try again on the next pass.
        }
      }
    }
    if (!announced) {
      log(`waiting for one of ${String(slots)} check slot(s) held by other sessions (${directory})`);
      announced = true;
    }
    await new Promise((done) => setTimeout(done, wait));
    if (Date.now() - started > staleMs) throw new Error("gave up waiting for a check slot");
  }
}

export const RESULTS_FORMAT = "tear-check-results.v1";

function readResults(path) {
  if (path === undefined || path === "") return undefined;
  try {
    const record = JSON.parse(readFileSync(path, "utf8"));
    return record.format === RESULTS_FORMAT ? record : undefined;
  } catch {
    return undefined;
  }
}

/** Adds one check's result to the run's results file, starting the file on the run's first check. */
export function recordResult(path, run, result) {
  const record = readResults(path);
  const results = record?.tree === run.tree && record?.attempt === run.attempt ? record.results : [];
  const next = {
    format: RESULTS_FORMAT,
    ...run,
    results: [...results.filter((r) => r.check !== result.check), result],
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, undefined, 2)}\n`);
}

/**
 * The FLAKY line for a check that just passed, when an earlier attempt of the same tree failed it;
 * undefined otherwise. A different tree is a different change, so its failure says nothing here.
 */
export function flakyLine(previous, tree, check, attempt) {
  if (previous === undefined || previous.tree !== tree) return undefined;
  const failed = previous.results.find((result) => result.check === check && result.status === "fail");
  if (failed === undefined) return undefined;
  return `FLAKY ${check}: failed on attempt ${String(previous.attempt)} (${failed.reason}), passed on attempt ${String(attempt)}`;
}

function summary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

async function main(argv) {
  const group = argv[0] === undefined || argv[0].startsWith("--") ? undefined : argv[0];
  const passedFile = gitPath(["rev-parse", "--git-path", "tear-check-passed.json"]);
  if (argv.includes("--passed")) {
    try {
      const record = JSON.parse(readFileSync(passedFile ?? "", "utf8"));
      console.log(`pnpm check passed on ${record.commit} at ${record.at}`);
      return 0;
    } catch {
      console.log("no recorded pnpm check pass in this checkout");
      return 1;
    }
  }
  const checks = selectChecks(loadChecks(), group);
  if (argv.includes("--list")) {
    for (const check of checks) console.log(`${check.group}.${check.id}: ${check.run}`);
    return 0;
  }
  const local = process.env.CI === undefined;
  const commonDir = gitPath(["rev-parse", "--git-common-dir"]);
  const release =
    local && group !== "fast" && commonDir !== undefined
      ? await takeSlot({
          directory: resolve(commonDir, "tear-check-slots"),
          slots: Math.max(1, Number(process.env.TEAR_CHECK_SLOTS ?? 2)),
        })
      : () => undefined;
  const startCommit = git(["rev-parse", "HEAD"]);
  const resultsFile = process.env.TEAR_CHECK_RESULTS || undefined;
  const previous = readResults(process.env.TEAR_CHECK_PREVIOUS);
  const run = {
    commit: startCommit,
    // The tree, not the commit: CI merges main into the head afresh on every attempt.
    tree: git(["rev-parse", "HEAD^{tree}"]),
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
  };
  const record = (check, status, seconds, reason) => {
    if (resultsFile !== undefined)
      recordResult(resultsFile, run, { check, status, seconds: Number(seconds), ...(reason ? { reason } : {}) });
  };
  const startClean = git(["status", "--porcelain"]) === "";
  const started = Date.now();
  try {
    for (const [index, check] of checks.entries()) {
      const checkStarted = Date.now();
      console.log(`CHECK ${String(index + 1)}/${String(checks.length)} ${check.group}.${check.id}`);
      const [command, ...args] = check.args;
      const result = spawnSync(command === "node" ? process.execPath : command, args, {
        cwd: root,
        stdio: "inherit",
        // Checks serve the builds already in dist/; TearBench scenario runs must not rebuild them.
        env: { ...process.env, TEARBENCH_REUSE_VERIFIED_BUILDS: "1" },
      });
      const seconds = ((Date.now() - checkStarted) / 1000).toFixed(1);
      if (result.error !== undefined || result.status !== 0) {
        const reason = result.error?.message ?? `exit ${String(result.status ?? result.signal)}`;
        console.error(`FAIL ${check.group}.${check.id} after ${seconds} s (${reason}): ${check.run}`);
        record(`${check.group}.${check.id}`, "fail", seconds, reason);
        summary(`### Failed: \`${check.group}.${check.id}\`\n\n\`${check.run}\` (${reason}, after ${seconds} s)\n`);
        return result.status || 1;
      }
      console.log(`PASS ${check.group}.${check.id} ${seconds} s`);
      record(`${check.group}.${check.id}`, "pass", seconds);
      const flaky = flakyLine(previous, run.tree, `${check.group}.${check.id}`, run.attempt);
      if (flaky !== undefined) {
        console.log(flaky);
        if (!local) console.log(`::warning title=Flaky check::${flaky}`);
        summary(`### ${flaky}\n`);
      }
    }
  } finally {
    release();
  }
  const total = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`PASS ${String(checks.length)} check(s) in ${total} s`);
  summary(`Passed ${String(checks.length)} check(s) in ${total} s.`);
  if (group === undefined && local && passedFile !== undefined) {
    const sameCommit = git(["rev-parse", "HEAD"]) === startCommit;
    if (startClean && sameCommit && git(["status", "--porcelain"]) === "") {
      writeFileSync(
        passedFile,
        `${JSON.stringify({ commit: startCommit, at: new Date().toISOString(), seconds: Number(total) })}\n`,
      );
      console.log(`pnpm check passed on ${String(startCommit)}: quote this commit when marking the pull request ready`);
    } else {
      console.log("pass not recorded: the checkout had uncommitted changes or moved during the run");
    }
  }
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
