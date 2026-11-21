// Containment: three rules that keep the repository from growing the way it did before the cleanup.
// Limits and baselines are data in config/containment.json; nothing here names a file or a feature.
//
// 1. Plain names. A listed themed word (as a whole word, or one part of a camelCase or snake_case
//    name) may not appear in a new tracked path, and a tracked text file may not hold more of them
//    than its baseline. A file without a baseline entry holds none.
// 2. Tools. The number of package scripts and of files under scripts/ may not pass its baseline.
// 3. Worktrees. The number of worktrees and local branches on this machine may not pass its limit.
//
// A rule in mode "observe" prints what it would refuse and passes; "enforce" fails; "off" is silent.
// `--update` lowers baselines to today's numbers and never raises one. Growth is a reviewed decision:
// `--allow-increase <path>` (a file, or `tools`) raises that one entry, and the config is a gate file.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const CONFIG_PATH = "config/containment.json";
const MODES = ["off", "observe", "enforce"];

/** The parts of a name: `bossForge_LAB2` gives boss, Forge, LAB. */
const NAME_PARTS = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+/gu;

/** How many parts of `text` are one of `words` (lower case). */
export function countThemedWords(text, words) {
  let count = 0;
  for (const [part] of text.matchAll(NAME_PARTS)) if (words.has(part.toLowerCase())) count += 1;
  return count;
}

export function validateConfig(config) {
  for (const rule of ["plainNames", "tools", "worktrees"]) {
    if (!MODES.includes(config[rule]?.mode))
      throw new Error(`${CONFIG_PATH}: ${rule}.mode must be one of ${MODES.join(", ")}`);
  }
  return config;
}

const skipped = (file, rule) =>
  file === CONFIG_PATH ||
  rule.skipPrefixes.some((prefix) => file.startsWith(prefix)) ||
  rule.skipSuffixes.some((suffix) => file.endsWith(suffix));

/**
 * @param {string[]} trackedPaths every tracked path
 * @param {Map<string, number>} counts themed words per scanned file (files with none may be absent)
 * @param {{ paths: string[], files: Record<string, number> }} rule the plainNames section
 * @param {Set<string>} words
 */
export function plainNameProblems(trackedPaths, counts, rule, words) {
  const problems = [];
  const knownPaths = new Set(rule.paths);
  for (const file of trackedPaths) {
    if (countThemedWords(file, words) > 0 && !knownPaths.has(file))
      problems.push(`path ${file}: a themed word in a new file or folder name`);
  }
  for (const [file, count] of counts) {
    const allowed = rule.files[file] ?? 0;
    if (count > allowed)
      problems.push(`${file}: ${String(count)} themed words, ${String(allowed)} allowed (${themedHint(rule)})`);
  }
  return problems;
}

const themedHint = (rule) => `listed words: ${rule.words.join(", ")}; name the thing for what it does`;

export function toolProblems(counts, rule) {
  return Object.entries(counts)
    .filter(([name, count]) => count > rule[name])
    .map(
      ([name, count]) =>
        `${name}: ${String(count)}, baseline ${String(rule[name])}. A new tool needs a plan or task card that names it; remove one or have the increase reviewed`,
    );
}

export function worktreeProblems(counts, rule) {
  const problems = [];
  if (counts.worktrees > rule.maxWorktrees)
    problems.push(`${String(counts.worktrees)} worktrees, limit ${String(rule.maxWorktrees)}`);
  if (counts.localBranches > rule.maxLocalBranches)
    problems.push(`${String(counts.localBranches)} local branches, limit ${String(rule.maxLocalBranches)}`);
  if (problems.length > 0)
    problems.push("pnpm who and pnpm leftovers list what is merged or abandoned; remove those before starting more");
  return problems;
}

/** Baselines lowered to today's numbers. Nothing is raised except the one entry named by `allow`. */
export function loweredConfig(config, trackedPaths, counts, toolCounts, words, allow = null) {
  const files = {};
  for (const [file, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    const allowed = config.plainNames.files[file] ?? 0;
    const next = file === allow ? count : Math.min(count, allowed);
    if (next > 0) files[file] = next;
  }
  const paths = trackedPaths.filter(
    (file) => countThemedWords(file, words) > 0 && (config.plainNames.paths.includes(file) || file === allow),
  );
  const tools = { ...config.tools };
  for (const [name, count] of Object.entries(toolCounts))
    tools[name] = allow === "tools" ? count : Math.min(count, config.tools[name]);
  return { ...config, plainNames: { ...config.plainNames, paths, files }, tools };
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0 && result.status !== 1) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.split("\n").filter(Boolean);
}

/** What the rules judge, read from the checkout at `root`. */
export function measure(root, config) {
  const rule = config.plainNames;
  const words = new Set(rule.words);
  const trackedPaths = git(root, ["ls-files"]);
  const candidates = git(root, ["grep", "-I", "-l", "-i", "-E", rule.words.join("|"), "--", "."]);
  const counts = new Map();
  for (const file of candidates) {
    if (skipped(file, rule)) continue;
    const count = countThemedWords(fs.readFileSync(path.join(root, file), "utf8"), words);
    if (count > 0) counts.set(file, count);
  }
  const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  const toolCounts = {
    packageScripts: Object.keys(scripts).length,
    scriptFiles: trackedPaths.filter((file) => file.startsWith("scripts/")).length,
  };
  const worktreeCounts = {
    worktrees: git(root, ["worktree", "list", "--porcelain"]).filter((line) => line.startsWith("worktree ")).length,
    localBranches: git(root, ["for-each-ref", "--format=%(refname)", "refs/heads"]).length,
  };
  return { words, trackedPaths, counts, toolCounts, worktreeCounts };
}

function report(name, mode, problems) {
  if (mode === "off" || problems.length === 0) return true;
  const label = mode === "enforce" ? "FAIL" : "would fail (observe)";
  console.log(`containment ${name}: ${label}`);
  for (const problem of problems) console.log(`  ${problem}`);
  return mode !== "enforce";
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const file = path.join(root, CONFIG_PATH);
  const config = validateConfig(JSON.parse(fs.readFileSync(file, "utf8")));
  const measured = measure(root, config);
  const allowAt = args.indexOf("--allow-increase");
  if (args.includes("--update") || allowAt !== -1) {
    const allow = allowAt === -1 ? null : (args[allowAt + 1] ?? null);
    if (allowAt !== -1 && allow === null) throw new Error("--allow-increase needs a path or `tools`");
    const next = loweredConfig(
      config,
      measured.trackedPaths,
      measured.counts,
      measured.toolCounts,
      measured.words,
      allow,
    );
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`containment: wrote ${CONFIG_PATH}`);
    return;
  }
  const passed = [
    report(
      "plain names",
      config.plainNames.mode,
      plainNameProblems(measured.trackedPaths, measured.counts, config.plainNames, measured.words),
    ),
    report("tools", config.tools.mode, toolProblems(measured.toolCounts, config.tools)),
    report("worktrees", config.worktrees.mode, worktreeProblems(measured.worktreeCounts, config.worktrees)),
  ].every(Boolean);
  if (passed) console.log("containment: ok");
  else process.exitCode = 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
