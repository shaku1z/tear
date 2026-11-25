// The tests a change can break, and a run of them: `pnpm test:related [files…] [--list] [vitest flags]`.
//
// `vitest related` alone follows imports, so it misses a test that names a file as text (a pinned
// list of paths, a config file a test reads) and a test that reads the whole tree with git. Both
// broke main after a green local run (#418: a file left a pinned list in tests/unit/replay-record.test.ts,
// which imports nothing it names). This adds them, and the node:test files the checks run:
//
//   - the changed test files themselves;
//   - tests whose text names a changed or deleted file by its repository path, with or without
//     its extension;
//   - tests that name, as a whole string, a folder holding a changed file (they read that folder);
//   - tests that run `git ls-files` or `git grep` (they read the tree, so any change can reach them);
//   - and, through `vitest related`, the tests whose imports reach a changed file.
//
// With no files it takes the branch's change: the diff from origin/main, uncommitted work and new
// files. `--list` prints what it picked and why, and runs nothing.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { VITEST_TEST_GLOBS, indexedTestFiles } from "./test-files.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function realGit(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** `git grep` output, or nothing when it matches nothing (exit 1). */
function grep(git, args) {
  try {
    return git(["grep", ...args]);
  } catch (error) {
    if (error?.status === 1) return "";
    throw error;
  }
}

const lines = (text) => text.split(/\r?\n/u).filter(Boolean);

/**
 * Room for one command's arguments, in characters. Windows limits a whole command line to 32,767
 * (CreateProcess fails with ENAMETOOLONG past it), and the program and its fixed flags take some of
 * that. Other systems allow far more, but one budget everywhere splits a run the same way on every
 * machine. Every list this script hands a command (changed paths, test files) goes through
 * `argumentBatches`, so a large change makes more commands, never a longer one.
 */
export const COMMAND_ARGUMENT_BUDGET = 24_000;

/** An argument's share of a command line: its characters, a separating space and two quotes. */
const argumentCost = (argument) => argument.length + 3;

/**
 * `items` split, in order, into batches whose cost fits `budget`. `cost` gives one item's share; an item
 * that alone exceeds the budget goes in a batch by itself (it cannot be split).
 */
export function argumentBatches(items, budget = COMMAND_ARGUMENT_BUDGET, cost = argumentCost) {
  const batches = [];
  let batch = [];
  let used = 0;
  for (const item of items) {
    const share = cost(item);
    if (batch.length > 0 && used + share > budget) {
      batches.push(batch);
      batch = [];
      used = 0;
    }
    batch.push(item);
    used += share;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/** The argument lists for running `fixed` over `items`: one per batch that fits beside `fixed`. */
export function batchedArguments(fixed, items, budget = COMMAND_ARGUMENT_BUDGET) {
  const room = budget - fixed.reduce((total, argument) => total + argumentCost(argument), 0);
  return argumentBatches(items, room).map((batch) => [...fixed, ...batch]);
}

/**
 * The files among `files` that hold any of `patterns` (`git grep -l <mode> -e …`), run in batches of
 * patterns and of files that fit the command line together, and joined.
 */
function grepFiles(git, mode, patterns, files) {
  const half = Math.floor(COMMAND_ARGUMENT_BUDGET / 2);
  const hits = new Set();
  for (const someFiles of argumentBatches(files, half))
    for (const somePatterns of argumentBatches(patterns, half, (pattern) => argumentCost(pattern) + argumentCost("-e")))
      for (const file of lines(
        grep(git, ["-l", mode, ...somePatterns.flatMap((pattern) => ["-e", pattern]), "--", ...someFiles]),
      ))
        hits.add(file);
  return [...hits].sort();
}

/** The branch's change: committed since origin/main, uncommitted, and new untracked files, deletions included. */
export function branchChange({ git = realGit } = {}) {
  const base = git(["merge-base", "origin/main", "HEAD"]).trim();
  return [
    ...new Set([
      ...lines(git(["diff", "--name-only", "--no-renames", base, "HEAD"])),
      ...lines(git(["diff", "--name-only", "--no-renames", "HEAD"])),
      ...lines(git(["ls-files", "--others", "--exclude-standard"])),
    ]),
  ].sort();
}

/** The node:test files the checks and package scripts run (`node --test … <files>`). */
export function nodeTestFiles(commands) {
  const files = new Set();
  for (const command of commands)
    for (const run of command.matchAll(/node --test\b([^&|;]*)/gu))
      for (const word of run[1].trim().split(/\s+/u)) if (/^tests\/.+\.test\.mjs$/u.test(word)) files.add(word);
  return [...files].sort();
}

function checkCommands() {
  const scripts = Object.values(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts);
  const checks = [];
  const walk = (value) => {
    if (typeof value === "string") checks.push(value);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(JSON.parse(readFileSync(path.join(root, "config/checks.json"), "utf8")));
  return [...scripts, ...checks];
}

const withoutExtension = (file) => file.replace(/\.[^./]+$/u, "");
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Every folder above `file`, deepest first, without the repository root. */
export function folders(file) {
  const parts = file.split("/").slice(0, -1);
  return parts.map((_, index) => parts.slice(0, parts.length - index).join("/"));
}

/**
 * Why each test file goes with `changed`: a map from test file to its reasons. `textOf` reads a
 * candidate's text; `candidates` lists the files to consider for each text rule (a cheap superset,
 * such as git grep's fixed-string hits); `scanners` are the tests that read the tree with git.
 */
export function selectTests({ changed, tests, candidates, textOf, scanners }) {
  const known = new Set(tests);
  const picked = new Map();
  const add = (file, reason) => {
    if (!known.has(file)) return;
    if (!picked.has(file)) picked.set(file, []);
    if (!picked.get(file).includes(reason)) picked.get(file).push(reason);
  };
  for (const file of changed) add(file, "changed");
  for (const file of changed) {
    const stem = withoutExtension(file);
    // The path itself: not a longer name that starts with it (watch is not watch-screen), and not
    // one that ends with it (README is not docs/README).
    const names = new RegExp(`(?<![\\w./-])${escape(stem)}(?![\\w-])`, "u");
    for (const test of candidates(stem)) if (test !== file && names.test(textOf(test))) add(test, `names ${file}`);
    for (const folder of folders(file)) {
      const whole = new RegExp(`["'\`]${escape(folder)}/?["'\`]`, "u");
      for (const test of candidates(folder)) if (whole.test(textOf(test))) add(test, `reads ${folder}/`);
    }
  }
  if (changed.length > 0) for (const test of scanners) add(test, "reads the tree with git");
  return picked;
}

/** The selection for `changed` in this repository. */
export function relatedTests(changed, { git = realGit } = {}) {
  const vitestTests = indexedTestFiles(VITEST_TEST_GLOBS, { git });
  const nodeTests = nodeTestFiles(checkCommands()).filter((file) => existsSync(path.join(root, file)));
  const tests = [...vitestTests, ...nodeTests];
  const pathspecs = tests.map((file) => `:(literal)${file}`);
  const texts = new Map();
  const textOf = (file) => {
    if (!texts.has(file)) texts.set(file, readFileSync(path.join(root, file), "utf8"));
    return texts.get(file);
  };
  const needles = [...new Set(changed.flatMap((file) => [withoutExtension(file), ...folders(file)]))];
  // One git grep finds every file holding any needle; each rule then reads only those.
  const hits = needles.length === 0 ? [] : grepFiles(git, "-F", needles, pathspecs);
  const candidates = (needle) => hits.filter((file) => textOf(file).includes(needle));
  const scanners = grepFiles(git, "-E", [`["'](ls-files|grep)["']`], pathspecs);
  const picked = selectTests({ changed, tests, candidates, textOf, scanners });
  const nodeSet = new Set(nodeTests);
  return {
    picked,
    vitest: [...picked.keys()].filter((file) => !nodeSet.has(file)).sort(),
    node: [...picked.keys()].filter((file) => nodeSet.has(file)).sort(),
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function main() {
  const args = process.argv.slice(2);
  const list = args.includes("--list");
  const flags = args.filter((arg) => arg.startsWith("-") && arg !== "--list");
  const given = args
    .filter((arg) => !arg.startsWith("-"))
    .map((arg) => arg.replaceAll("\\", "/").replace(/^\.\//u, ""));
  const changed = given.length > 0 ? given : branchChange();
  const { picked, vitest, node } = relatedTests(changed);
  const sources = changed.filter((file) => existsSync(path.join(root, file)) && !picked.has(file));
  console.log(`test:related: ${changed.length} changed file(s); by text and tree: ${picked.size} test file(s).`);
  for (const [file, reasons] of [...picked].sort(([a], [b]) => a.localeCompare(b)))
    console.log(`  ${file}  (${reasons.join("; ")})`);
  if (list) {
    console.log("vitest related adds the tests whose imports reach a changed file; --list does not run it.");
    return 0;
  }
  // A change too large for one command line runs in several: each batch is its own run and its own
  // verdict, and every batch runs whatever an earlier one said. A test whose imports reach sources in
  // two batches runs in both.
  const vitestRuns = batchedArguments(
    [path.join(root, "node_modules/vitest/vitest.mjs"), "related", "--run", ...flags],
    [...sources, ...vitest],
  );
  const nodeRuns = batchedArguments(["--test", "--test-concurrency=1"], node);
  if (vitestRuns.length > 1 || nodeRuns.length > 1)
    console.log(
      `test:related: the files fill more than one command line: ${vitestRuns.length} vitest and ${nodeRuns.length} node:test run(s).`,
    );
  let status = 0;
  for (const args of [...vitestRuns, ...nodeRuns]) status = run(process.execPath, args) || status;
  return status;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exitCode = main();
