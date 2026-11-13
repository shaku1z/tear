// Read-only overview of every worktree of this repository: branch, ahead/behind origin/main, uncommitted
// changes, open pull request, age of the last commit, and flags for stale or unsafe-to-delete worktrees.
// Never fetches, writes, prunes or deletes. `--json` prints machine-readable rows; `--no-gh` skips the
// pull request lookup (which needs an authenticated `gh`).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const STALE_DAYS = 14;
const DAY_MS = 86_400_000;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return { ok: result.status === 0 && !result.error, stdout: String(result.stdout ?? "").trim() };
}

export function parseWorktreePorcelain(text) {
  const worktrees = [];
  let current;
  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length), branch: null, head: null, detached: false, locked: false };
      worktrees.push(current);
    } else if (current === undefined) continue;
    else if (line.startsWith("HEAD ")) current.head = line.slice(5);
    else if (line.startsWith("branch ")) current.branch = line.slice(7).replace(/^refs\/heads\//u, "");
    else if (line === "detached") current.detached = true;
    else if (line.startsWith("locked")) current.locked = true;
    else if (line === "prunable" || line.startsWith("prunable ")) current.prunable = true;
  }
  return worktrees;
}

export function classify(row, nowMs, staleDays = STALE_DAYS) {
  const flags = [];
  if (row.prunable) flags.push("missing");
  if (row.locked) flags.push("locked");
  if (row.detached) flags.push("detached");
  if (row.nodeModulesLink) flags.push("node_modules-link");
  if (row.dirty > 0) flags.push("dirty");
  if (row.ahead === 0 && row.branch !== null && row.branch !== "main") flags.push("merged-or-empty");
  if (row.ahead > 0 && row.pr === null && row.prLookup === "done") flags.push("no-pr");
  if (row.lastCommitMs !== null && nowMs - row.lastCommitMs > staleDays * DAY_MS) flags.push("stale");
  return flags;
}

function isLink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

function inspect(worktree, root) {
  const row = {
    ...worktree,
    ahead: null,
    behind: null,
    dirty: null,
    lastCommitMs: null,
    pr: null,
    prLookup: "skipped",
    nodeModulesLink: false,
  };
  if (worktree.prunable || !fs.existsSync(worktree.path)) return { ...row, prunable: true };
  row.nodeModulesLink = isLink(path.join(worktree.path, "node_modules"));
  const counts = run("git", ["rev-list", "--left-right", "--count", `origin/main...${worktree.head}`], root);
  if (counts.ok) [row.behind, row.ahead] = counts.stdout.split(/\s+/u).map(Number);
  const status = run(
    "git",
    ["--no-optional-locks", "-C", worktree.path, "status", "--porcelain", "--untracked-files=normal"],
    root,
  );
  if (status.ok) row.dirty = status.stdout === "" ? 0 : status.stdout.split(/\r?\n/u).length;
  const time = run("git", ["log", "-1", "--format=%ct", worktree.head], root);
  if (time.ok && time.stdout !== "") row.lastCommitMs = Number(time.stdout) * 1000;
  return row;
}

function openPullRequests(root) {
  const result = run(
    "gh",
    ["pr", "list", "--state", "open", "--limit", "200", "--json", "number,headRefName,isDraft,url"],
    root,
  );
  if (!result.ok) return null;
  try {
    return new Map(JSON.parse(result.stdout).map((pr) => [pr.headRefName, pr]));
  } catch {
    return null;
  }
}

function age(ms, nowMs) {
  if (ms === null) return "?";
  const days = Math.floor((nowMs - ms) / DAY_MS);
  return days >= 1 ? `${String(days)}d` : `${String(Math.floor((nowMs - ms) / 3_600_000))}h`;
}

export function collect(root, { gh = true, nowMs = Date.now() } = {}) {
  const porcelain = run("git", ["worktree", "list", "--porcelain"], root);
  if (!porcelain.ok) throw new Error("git worktree list failed");
  const prs = gh ? openPullRequests(root) : null;
  return parseWorktreePorcelain(porcelain.stdout).map((worktree) => {
    const row = inspect(worktree, root);
    if (prs !== null) {
      row.prLookup = "done";
      const pr = worktree.branch === null ? undefined : prs.get(worktree.branch);
      row.pr = pr === undefined ? null : { number: pr.number, draft: pr.isDraft, url: pr.url };
    } else if (gh) row.prLookup = "unavailable";
    return { ...row, flags: classify(row, nowMs) };
  });
}

function render(rows, nowMs) {
  const table = rows.map((row) => [
    row.path,
    row.branch ?? (row.detached ? `(detached ${String(row.head).slice(0, 8)})` : "?"),
    row.ahead === null ? "?" : `+${String(row.ahead)}/-${String(row.behind)}`,
    row.dirty === null ? "?" : String(row.dirty),
    row.pr === null
      ? row.prLookup === "done"
        ? "—"
        : "?"
      : `#${String(row.pr.number)}${row.pr.draft ? " draft" : ""}`,
    age(row.lastCommitMs, nowMs),
    row.flags.join(" "),
  ]);
  const header = ["worktree", "branch", "vs main", "dirty", "pr", "last", "flags"];
  const widths = header.map((title, column) => Math.max(title.length, ...table.map((line) => line[column].length)));
  const format = (line) =>
    line
      .map((cell, column) => cell.padEnd(widths[column]))
      .join("  ")
      .trimEnd();
  return [format(header), ...table.map(format)].join("\n");
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const unknown = args.filter((argument) => !["--json", "--no-gh"].includes(argument));
  if (unknown.length > 0) {
    console.error(`Usage: node scripts/who.mjs [--json] [--no-gh]\nunknown: ${unknown.join(" ")}`);
    process.exitCode = 1;
    return;
  }
  const nowMs = Date.now();
  const rows = collect(root, { gh: !args.includes("--no-gh"), nowMs });
  if (args.includes("--json")) console.log(JSON.stringify(rows, null, 2));
  else {
    console.log(render(rows, nowMs));
    if (rows.some((row) => row.prLookup === "unavailable"))
      console.log("\npull requests: gh unavailable or not signed in; the pr column shows ?");
    console.log(
      `\nvs main counts against the local origin/main ref (run git fetch first); stale = no commit in ${String(STALE_DAYS)} days.`,
    );
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
