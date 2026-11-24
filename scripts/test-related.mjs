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
  const hits =
    needles.length === 0
      ? []
      : lines(grep(git, ["-l", "-F", ...needles.flatMap((n) => ["-e", n]), "--", ...pathspecs]));
  const candidates = (needle) => hits.filter((file) => textOf(file).includes(needle));
  const scanners = lines(grep(git, ["-l", "-E", "-e", `["'](ls-files|grep)["']`, "--", ...pathspecs]));
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
  let status = 0;
  if (sources.length > 0 || vitest.length > 0)
    status ||= run(process.execPath, [
      path.join(root, "node_modules/vitest/vitest.mjs"),
      "related",
      "--run",
      ...flags,
      ...sources,
      ...vitest,
    ]);
  if (node.length > 0) status = run(process.execPath, ["--test", "--test-concurrency=1", ...node]) || status;
  return status;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exitCode = main();
