// Runs the checks listed in config/checks.json. CI runs the same list, group by group.
//
//   node scripts/run-checks.mjs                  every gate group in order (`pnpm check`)
//   node scripts/run-checks.mjs fast             the fast group (`pnpm check:quick`, the pre-push hook)
//   node scripts/run-checks.mjs static           one group: fast, static, unit, build, browser, nightly, weekly, mobile
//   node scripts/run-checks.mjs browser --list   print what would run
//   node scripts/run-checks.mjs browser --shard 2/4   one of four parts of a group (CI's parallel jobs)
//
// It stops at the first failing check. The browser and nightly groups serve the builds in dist/, so
// run the build group first. On this machine, every group except `fast` first waits its turn in
// the queue all worktrees of the repository share (scripts/queue.mjs), so parallel sessions do not
// starve each other into timeouts. A full `pnpm check` that passes on a clean
// checkout records the commit in the Git directory (`--passed` prints it) for the pull request.
//
// With TEAR_CHECK_RESULTS set to a file, each check's result is added to that file as it finishes
// (one file per run; CI uploads it per attempt). With TEAR_CHECK_PREVIOUS set to an earlier
// attempt's file, a check that failed there on the same tree and passes now prints a FLAKY line.
// Nothing is retried: a failure still fails the run.
//
// With --keep-going (the nightly workflow only), a failing check does not stop the run: every check
// runs, the run lists each failure at the end and still fails. Pull request runs stop at the first.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { joinQueue, lightKind, queueDirectory, queueSlots } from "./queue.mjs";

/** This copy of the gate. In CI it is main's copy (.github/actions/main-gate); locally, the checkout. */
const gateRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The checkout being checked: TEAR_CHECKED_ROOT when main's copy of the gate runs against a change. */
const root = process.env.TEAR_CHECKED_ROOT ? resolve(process.env.TEAR_CHECKED_ROOT) : gateRoot;

export function loadChecks(path = resolve(root, "config/checks.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * The checks that judge a change: every check of the gate's list with the gate's definition, then
 * each check whose group and id appear only in the change's list, with the change's definition.
 * Run from main's copy, a change can add checks but can neither drop nor soften one of main's; a
 * renamed id is main's check, still run, plus a new one.
 */
export function judgedChecks(gate, change) {
  const groups = {};
  for (const [name, checks] of Object.entries(gate.groups)) {
    const ids = new Set(checks.map((check) => check.id));
    groups[name] = [...checks, ...(change.groups[name] ?? []).filter((check) => !ids.has(check.id))];
  }
  for (const [name, checks] of Object.entries(change.groups)) if (!(name in groups)) groups[name] = checks;
  return { ...gate, gate: [...gate.gate, ...change.gate.filter((name) => !gate.gate.includes(name))], groups };
}

/** The list this run judges with: the gate's own, joined with the change's when the gate is main's copy. */
export function loadJudgedChecks() {
  const own = loadChecks(resolve(gateRoot, "config/checks.json"));
  return gateRoot === root ? own : judgedChecks(own, loadChecks(resolve(root, "config/checks.json")));
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

/** The time a check without a recorded `seconds` counts as when the shards are packed. */
export const DEFAULT_CHECK_SECONDS = 60;

/** Where scripts/ci-check-times.mjs writes the seconds each check took in recent Validate runs. */
export const CHECK_TIMES = resolve(root, "config/check-times.json");

/** The measured seconds by "group.id", or an empty map when there is no times file. */
export function loadCheckTimes(path = CHECK_TIMES) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")).seconds ?? {};
}

const positive = (value) => Number.isFinite(value) && value > 0;

/**
 * Part `index` (1-based) of `count`: the checks are packed longest first, each into the part with
 * the least time so far, and every part keeps list order. A check's time is its measured time in
 * `measured` (by "group.id"), else its recorded `seconds`, else DEFAULT_CHECK_SECONDS. Every
 * check lands in exactly one part, whatever the times say; a time that drifts only unbalances them.
 */
export function shardChecks(checks, index, count, measured = {}) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 1 || index > count)
    throw new RangeError(`invalid shard ${String(index)}/${String(count)}`);
  const seconds = (check) => {
    const time = measured[`${check.group}.${check.id}`];
    if (positive(time)) return time;
    return positive(check.seconds) ? check.seconds : DEFAULT_CHECK_SECONDS;
  };
  const order = checks
    .map((check, position) => ({ check, position }))
    .sort((a, b) => seconds(b.check) - seconds(a.check) || a.position - b.position);
  const totals = Array.from({ length: count }, () => 0);
  const part = new Map();
  for (const { check, position } of order) {
    const lightest = totals.indexOf(Math.min(...totals));
    totals[lightest] += seconds(check);
    part.set(position, lightest + 1);
  }
  return checks.filter((_, position) => part.get(position) === index);
}

/** "2/4" as [2, 4]; throws on anything else. */
export function parseShard(text) {
  const match = /^(\d+)\/(\d+)$/u.exec(text ?? "");
  if (match === null) throw new RangeError(`--shard takes <part>/<count>, got ${String(text)}`);
  return [Number(match[1]), Number(match[2])];
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function gitPath(args) {
  const value = git(args);
  return value === undefined ? undefined : isAbsolute(value) ? value : resolve(root, value);
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

/** Runs one check as a child process, in the repository, with its output shown. */
function executeCheck(check) {
  const [command, ...args] = check.args;
  return spawnSync(command === "node" ? process.execPath : command, args, {
    cwd: root,
    stdio: "inherit",
    // Checks serve the builds already in dist/; TearBench scenario runs must not rebuild them.
    env: { ...process.env, TEARBENCH_REUSE_VERIFIED_BUILDS: "1" },
  });
}

/**
 * Runs `checks` in list order through `execute` (a check to { status, signal, error }). Without
 * `keepGoing` it stops at the first failing check and returns that check's exit status; with it,
 * every check runs and the status is 1 when any failed. `failures` names each failed check and why.
 */
export function runCheckList(checks, { keepGoing = false, execute = executeCheck, onPass, onFail } = {}) {
  const failures = [];
  for (const [index, check] of checks.entries()) {
    const name = `${check.group}.${check.id}`;
    const checkStarted = Date.now();
    console.log(`CHECK ${String(index + 1)}/${String(checks.length)} ${name}`);
    const result = execute(check);
    const seconds = ((Date.now() - checkStarted) / 1000).toFixed(1);
    if (result.error !== undefined || result.status !== 0) {
      const reason = result.error?.message ?? `exit ${String(result.status ?? result.signal)}`;
      console.error(`FAIL ${name} after ${seconds} s (${reason}): ${check.run}`);
      onFail?.(name, seconds, reason, check);
      failures.push(`${name} (${reason})`);
      if (!keepGoing) return { status: result.status || 1, failures, stopped: true };
      continue;
    }
    console.log(`PASS ${name} ${seconds} s`);
    onPass?.(name, seconds);
  }
  return { status: failures.length > 0 ? 1 : 0, failures, stopped: false };
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
  const shardAt = argv.indexOf("--shard");
  const listed = selectChecks(loadJudgedChecks(), group);
  const checks = shardAt === -1 ? listed : shardChecks(listed, ...parseShard(argv[shardAt + 1]), loadCheckTimes());
  if (shardAt !== -1)
    console.log(`shard ${argv[shardAt + 1]}: ${String(checks.length)} of ${String(listed.length)} check(s)`);
  if (argv.includes("--list")) {
    for (const check of checks) console.log(`${check.group}.${check.id}: ${check.run}`);
    return 0;
  }
  const local = process.env.CI === undefined;
  const directory = queueDirectory(root);
  const release =
    local && lightKind(["node", "scripts/run-checks.mjs", ...argv]) === undefined && directory !== undefined
      ? await joinQueue({ directory, slots: queueSlots(), label: `run-checks ${argv.join(" ")}` })
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
  const keepGoing = argv.includes("--keep-going");
  const startClean = git(["status", "--porcelain"]) === "";
  const started = Date.now();
  let outcome;
  try {
    outcome = runCheckList(checks, {
      keepGoing,
      onFail: (name, seconds, reason, check) => {
        record(name, "fail", seconds, reason);
        summary(`### Failed: \`${name}\`\n\n\`${check.run}\` (${reason}, after ${seconds} s)\n`);
      },
      onPass: (name, seconds) => {
        record(name, "pass", seconds);
        const flaky = flakyLine(previous, run.tree, name, run.attempt);
        if (flaky !== undefined) {
          console.log(flaky);
          if (!local) console.log(`::warning title=Flaky check::${flaky}`);
          summary(`### ${flaky}\n`);
        }
      },
    });
  } finally {
    release();
  }
  if (outcome.stopped) return outcome.status;
  const { failures } = outcome;
  const total = ((Date.now() - started) / 1000).toFixed(0);
  if (failures.length > 0) {
    const line = `FAIL ${String(failures.length)} of ${String(checks.length)} check(s) in ${total} s`;
    console.error(`${line}:\n${failures.map((failure) => `  ${failure}`).join("\n")}`);
    summary(`${line}:\n\n${failures.map((failure) => `- \`${failure}\``).join("\n")}\n`);
    return 1;
  }
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
