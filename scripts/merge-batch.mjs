// Checks several ready pull requests together, so they can merge on one Validate run instead of
// one run each (docs/RELEASE_AUTHORITY.md, "Merging").
//
//   node scripts/merge-batch.mjs [<pr> ...] [--without <pr>]   build a batch and start its check
//   node scripts/merge-batch.mjs --status <batch branch>        say whether the batch run passed
//   node scripts/merge-batch.mjs --verify <batch branch>        after the merges: main's tree is the checked tree
//   node scripts/merge-batch.mjs --prunable                     list batch branches nothing needs any more
//   node scripts/merge-batch.mjs --record "<pr>:<oid>,..."      (Validate only) record the verified members
//
// A batch is a branch `codex/batch-<utc stamp>` made from origin/main, with each member's head
// merged in with `git merge --no-ff`, in the order given (or in pull request order). A member
// that conflicts is left out and named. The branch is pushed from a throwaway worktree, where it
// is the current branch, so the pre-push guard checks it like any other branch, and Validate is
// started on it by hand, with the member list as its `batch` input. Validate records the members
// whose head is in the commit it checked as the `batch` annotation; `pnpm merge:ready` reads it.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BATCH_PREFIX = "codex/batch-";
/** A batch branch exactly as batchBranch names it, so a feature branch such as codex/batch-merge is never one. */
export const BATCH_BRANCH = /^codex\/batch-\d{8}t\d{6}z$/u;

/** "123:<oid>,124:<oid>" as members; throws on anything else, so a bad input never records. */
export function parseMembers(text) {
  const members = String(text)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d+):([0-9a-f]{40})$/u.exec(entry);
      if (!match) throw new Error(`not a batch member (<pr>:<40-character head oid>): ${entry}`);
      return { pr: Number(match[1]), head: match[2] };
    });
  if (members.length === 0) throw new Error("a batch needs at least one member");
  if (new Set(members.map((member) => member.pr)).size !== members.length) throw new Error("a member is listed twice");
  return members;
}

export const formatMembers = (members) => members.map((member) => `${String(member.pr)}:${member.head}`).join(",");

/** The annotation Validate writes, which merge-ready parses back (parseBatchNote there). */
export const batchNote = (main, members) => `main=${main} members=${formatMembers(members)}`;

/** Branch name for a batch started at `date`, in UTC to the second. */
export function batchBranch(date = new Date()) {
  return (
    BATCH_PREFIX +
    date
      .toISOString()
      .replace(/[-:]/gu, "")
      .replace(/\.\d+Z$/u, "z")
      .toLowerCase()
  );
}

/**
 * Which pull requests go in, in which order. With numbers, those (in the order given) less any
 * `--without`; without numbers, every open, non-draft pull request into main from this repository,
 * in number order. Each choice that cannot be a member is reported with its reason.
 */
export function chooseMembers(open, { numbers = [], without = [] } = {}) {
  const byNumber = new Map(open.map((pr) => [pr.number, pr]));
  const wanted = numbers.length > 0 ? numbers : [...byNumber.keys()].sort((a, b) => a - b);
  const chosen = [];
  const refused = [];
  for (const number of wanted) {
    const pr = byNumber.get(number);
    const reason = without.includes(number)
      ? "left out with --without"
      : pr === undefined
        ? "not an open pull request"
        : pr.isDraft
          ? "a draft"
          : pr.baseRefName !== "main"
            ? `targets ${pr.baseRefName}, not main`
            : pr.isCrossRepository
              ? "from a fork"
              : undefined;
    if (reason === undefined) chosen.push({ pr: number, head: pr.headRefOid, branch: pr.headRefName });
    else if (numbers.length > 0 || reason !== "a draft") refused.push({ pr: number, reason });
  }
  return { chosen, refused };
}

/** Validate's step: keeps only members whose head is in the checked commit, and fails if none is. */
export function recordedMembers(members, isInChecked) {
  const kept = members.filter((member) => isInChecked(member.head));
  const missing = members.filter((member) => !kept.includes(member));
  return { kept, missing };
}

/** After the merges: main must hold exactly the tree the batch run checked. */
export function treeVerdict({ mainTree, checkedTree, merged, members }) {
  const open = members.filter((member) => !merged.includes(member.pr)).map((member) => member.pr);
  if (open.length > 0) return { ok: false, message: `not merged yet: #${open.join(", #")}` };
  if (mainTree === checkedTree)
    return { ok: true, message: `main's tree ${mainTree.slice(0, 12)} is the tree the batch run checked` };
  return {
    ok: false,
    message: `MAIN DIFFERS FROM THE CHECKED BATCH: main's tree ${mainTree.slice(0, 12)}, checked tree ${checkedTree.slice(0, 12)}. Something other than the batch reached main, or a member merged a different head; run Validate on main before anything else merges.`,
  };
}

/**
 * Whether a batch branch is still needed. The tool never deletes branches (the pre-push guard
 * refuses deletions); it lists the ones that can go. A branch is kept while its run is going, or
 * while its run passed and a member is still open, since that member may still merge on it.
 * @param {{ status?: string, conclusion?: string | null, states?: Record<number, string> }} batch
 *   the latest run on the branch (absent when there is none) and each recorded member's state
 */
export function pruneVerdict(batch) {
  if (batch.status === undefined) return { prunable: true, reason: "it has no Validate run" };
  if (batch.status !== "completed") return { prunable: false, reason: `its run is ${batch.status}` };
  if (batch.conclusion !== "success") return { prunable: true, reason: `its run ended ${String(batch.conclusion)}` };
  const states = Object.entries(batch.states ?? {});
  if (states.length === 0) return { prunable: true, reason: "its run recorded no members" };
  const open = states.filter(([, state]) => state !== "MERGED" && state !== "CLOSED").map(([pr]) => `#${pr}`);
  if (open.length > 0) return { prunable: false, reason: `${open.join(", ")} may still merge on it` };
  return { prunable: true, reason: "every member is merged or closed" };
}

/** The failed checks a batch run reports: run-checks prints `FAIL <group>.<id> ...` for each. */
export function failedChecks(log) {
  return [...String(log).matchAll(/FAIL ([\w-]+\.[\w-]+) after/gu)].map((match) => match[1]);
}

function run(command, args, { cwd = root, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed: ${String(result.stderr || result.stdout).trim()}`);
  return { ok: result.status === 0, out: String(result.stdout).trim(), err: String(result.stderr).trim() };
}

const git = (args, options) => run("git", args, options);
const gh = (args) => run("gh", args).out;

/** Merges each chosen head into a fresh branch from origin/main; conflicting heads are left out. */
function buildBatch(chosen, branch, directory) {
  git(["fetch", "--quiet", "origin", "main", ...chosen.map((member) => `refs/pull/${String(member.pr)}/head`)]);
  git(["worktree", "add", "--quiet", "-b", branch, directory, "origin/main"]);
  const merged = [];
  const conflicted = [];
  for (const member of chosen) {
    git(["fetch", "--quiet", "origin", `refs/pull/${String(member.pr)}/head`], { cwd: directory });
    const fetched = git(["rev-parse", "FETCH_HEAD"], { cwd: directory }).out;
    if (fetched !== member.head) {
      conflicted.push({ pr: member.pr, reason: `its head moved to ${fetched.slice(0, 8)} while the batch was built` });
      continue;
    }
    const message = `Batch: merge #${String(member.pr)} (${member.branch} at ${member.head.slice(0, 8)})`;
    const result = git(["merge", "--no-ff", "--quiet", "-m", message, member.head], {
      cwd: directory,
      allowFailure: true,
    });
    if (result.ok) merged.push(member);
    else {
      git(["merge", "--abort"], { cwd: directory, allowFailure: true });
      conflicted.push({ pr: member.pr, reason: "conflicts with main or an earlier member" });
    }
  }
  return { merged, conflicted };
}

function create(numbers, without) {
  const open = JSON.parse(
    gh([
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "number,isDraft,headRefOid,headRefName,baseRefName,isCrossRepository",
    ]),
  );
  const { chosen, refused } = chooseMembers(open, { numbers, without });
  for (const entry of refused) console.log(`left out #${String(entry.pr)}: ${entry.reason}`);
  if (chosen.length === 0) {
    console.log("no pull request to batch");
    return 1;
  }
  const branch = batchBranch();
  const directory = mkdtempSync(join(tmpdir(), "tear-batch-"));
  try {
    const { merged, conflicted } = buildBatch(chosen, branch, directory);
    for (const entry of conflicted) console.log(`left out #${String(entry.pr)}: ${entry.reason}`);
    if (merged.length === 0) {
      console.log("no member merged cleanly; nothing pushed");
      return 1;
    }
    git(["push", "--quiet", "-u", "origin", branch], { cwd: directory });
    gh(["workflow", "run", "ci.yml", "--ref", branch, "-f", `batch=${formatMembers(merged)}`]);
    console.log(`batch ${branch}: ${merged.map((member) => `#${String(member.pr)}`).join(", ")}, in this order`);
    console.log(`Validate started on it. When it finishes: pnpm merge:batch --status ${branch}`);
    return 0;
  } finally {
    git(["worktree", "remove", "--force", directory], { allowFailure: true });
    rmSync(directory, { recursive: true, force: true });
    git(["branch", "-D", branch], { allowFailure: true });
  }
}

/** The newest Validate run started by hand on the batch branch, with its batch annotation. */
function batchRun(branch) {
  const slug = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  const runs = JSON.parse(
    gh([
      "api",
      `repos/${slug}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=5`,
    ]),
  ).workflow_runs;
  if (runs.length === 0) return { latest: undefined, job: undefined, note: "" };
  const latest = runs[0];
  const job = JSON.parse(gh(["api", `repos/${slug}/actions/runs/${String(latest.id)}/jobs`])).jobs.find(
    (entry) => entry.name === "check",
  );
  const notes = job ? JSON.parse(gh(["api", `repos/${slug}/check-runs/${String(job.id)}/annotations`])) : [];
  const note = notes.find((entry) => entry.title === "batch")?.message ?? "";
  return { latest, job, note };
}

function status(branch) {
  const { latest, job, note } = batchRun(branch);
  if (latest === undefined) throw new Error(`no Validate run on ${branch}`);
  console.log(`batch run ${latest.html_url}: ${latest.status}${latest.conclusion ? `, ${latest.conclusion}` : ""}`);
  console.log(note ? `members: ${note}` : "the run has not recorded its members yet");
  if (latest.conclusion === "success") {
    console.log("each member is READY for pnpm merge:ready while its head and main stay as the batch saw them");
    console.log(`merge them in the listed order, then: pnpm merge:batch --verify ${branch}`);
    return 0;
  }
  if (latest.status === "completed" && job) {
    const steps = job.steps.filter((step) => step.conclusion === "failure").map((step) => step.name);
    const log = run("gh", ["run", "view", String(latest.id), "--log-failed"], { allowFailure: true }).out;
    console.log(`failed step: ${steps.join(", ") || "(none recorded)"}`);
    const checks = failedChecks(log);
    if (checks.length > 0) console.log(`failed checks: ${checks.join(", ")}`);
    console.log("to try again without a member: pnpm merge:batch <members...> --without <pr>");
  }
  return 1;
}

function verify(branch) {
  const { latest, note } = batchRun(branch);
  const main = /main=([0-9a-f]{40})/u.exec(note)?.[1];
  const members = /members=(\S+)/u.exec(note)?.[1];
  if (latest?.conclusion !== "success" || main === undefined || members === undefined) {
    console.error(`the batch run on ${branch} did not pass with recorded members; nothing to verify`);
    return 1;
  }
  git(["fetch", "--quiet", "origin", "main", branch]);
  const checkedTree = git(["merge-tree", "--write-tree", main, `origin/${branch}`]).out.split("\n")[0];
  const mainTree = git(["rev-parse", "origin/main^{tree}"]).out;
  const list = parseMembers(members);
  const merged = list
    .filter((member) => JSON.parse(gh(["pr", "view", String(member.pr), "--json", "state"])).state === "MERGED")
    .map((member) => member.pr);
  const verdict = treeVerdict({ mainTree, checkedTree, merged, members: list });
  (verdict.ok ? console.log : console.error)(verdict.message);
  return verdict.ok ? 0 : 1;
}

function prunable() {
  const heads = git(["ls-remote", "--heads", "origin", `${BATCH_PREFIX}*`])
    .out.split(/\r?\n/u)
    .filter(Boolean);
  const branches = heads
    .map((line) => line.split(/\s+/u)[1].replace(/^refs\/heads\//u, ""))
    .filter((branch) => BATCH_BRANCH.test(branch));
  if (branches.length === 0) console.log("no batch branches on origin");
  for (const branch of branches) {
    const { latest, note } = batchRun(branch);
    const members = /members=(\S+)/u.exec(note)?.[1];
    const states = Object.fromEntries(
      (members ? parseMembers(members) : []).map((member) => [
        member.pr,
        JSON.parse(gh(["pr", "view", String(member.pr), "--json", "state"])).state,
      ]),
    );
    const verdict = pruneVerdict({ status: latest?.status, conclusion: latest?.conclusion, states });
    console.log(`${verdict.prunable ? "prunable" : "keep    "} ${branch}: ${verdict.reason}`);
  }
  return 0;
}

/** Validate's step: writes the `batch` annotation from the members whose head the checked commit contains. */
function record(text) {
  const members = parseMembers(text);
  const cwd = process.cwd();
  const main = git(["rev-parse", "origin/main"], { cwd }).out;
  const { kept, missing } = recordedMembers(
    members,
    (head) => git(["merge-base", "--is-ancestor", head, "HEAD"], { cwd, allowFailure: true }).ok,
  );
  for (const member of missing)
    console.log(`::warning title=batch::#${String(member.pr)} head ${member.head} is not in the checked commit`);
  // A batch that checked less than it claims must not pass.
  if (missing.length > 0) throw new Error("a listed head is not in the checked commit");
  console.log(`::notice title=batch::${batchNote(main, kept)}`);
  return 0;
}

export function main(argv) {
  const value = (flag) => argv[argv.indexOf(flag) + 1];
  try {
    if (argv.includes("--record")) return record(value("--record"));
    if (argv.includes("--status")) return status(value("--status"));
    if (argv.includes("--verify")) return verify(value("--verify"));
    if (argv.includes("--prunable")) return prunable();
    const without = argv.flatMap((entry, index) => (argv[index - 1] === "--without" ? [Number(entry)] : []));
    const numbers = argv.filter((entry, index) => /^\d+$/u.test(entry) && argv[index - 1] !== "--without").map(Number);
    return create(numbers, without);
  } catch (error) {
    console.error(`merge:batch: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
