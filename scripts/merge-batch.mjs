// Checks several ready pull requests together, so they can merge on one Validate run instead of
// one run each (docs/RELEASE_AUTHORITY.md, "Merging").
//
//   node scripts/merge-batch.mjs [<pr> ...] [--without <pr>]   build a batch and start its check
//   node scripts/merge-batch.mjs --status <batch branch>        say whether the batch run passed
//   node scripts/merge-batch.mjs --verify <batch branch>        after the merges: main's tree is the checked tree
//   node scripts/merge-batch.mjs --prunable                     list batch branches nothing needs any more
//   node scripts/merge-batch.mjs --prune                        delete those, on origin and here
//   node scripts/merge-batch.mjs --merge <batch branch> --authorize-owner-merge
//                                                               merge the members in order, then --verify
//   node scripts/merge-batch.mjs --record "<pr>:<oid>,..."      (Validate only) record the verified members
//
// A batch is a branch `codex/batch-<utc stamp>` made from origin/main, with each member's head
// merged in with `git merge --no-ff`, in the order given (or in pull request order). A member
// that conflicts is left out and named. The branch is pushed from a throwaway worktree, where it
// is the current branch, so the pre-push guard checks it like any other branch, and Validate is
// started on it by hand, with the member list as its `batch` input. Validate records the members
// whose head is in the commit it checked as the `batch` annotation; `pnpm merge:ready` reads it.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CANONICAL } from "./governance/setup-hooks.mjs";

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
 * @param {{ status?: string, conclusion?: string | null, states?: Record<number, string>, running?: boolean, ageMinutes?: number }} batch
 *   the latest run on the branch (absent when there is none), whether any run on it is still going,
 *   each recorded member's state, and how long ago the branch's newest commit was made
 */
export function pruneVerdict(batch) {
  if (batch.running) return { prunable: false, reason: "a check is running on it" };
  if (batch.status === undefined) {
    // merge:batch pushes and then starts the run; a fresh branch may simply not have one yet.
    if ((batch.ageMinutes ?? 0) < 60)
      return { prunable: false, reason: "pushed under an hour ago; its run may not have started" };
    return { prunable: true, reason: "it has no Validate run" };
  }
  if (batch.status !== "completed") return { prunable: false, reason: `its run is ${batch.status}` };
  if (batch.conclusion !== "success") return { prunable: true, reason: `its run ended ${String(batch.conclusion)}` };
  const states = Object.entries(batch.states ?? {});
  if (states.length === 0) return { prunable: true, reason: "its run recorded no members" };
  const open = states.filter(([, state]) => state !== "MERGED" && state !== "CLOSED").map(([pr]) => `#${pr}`);
  if (open.length > 0) return { prunable: false, reason: `${open.join(", ")} may still merge on it` };
  return { prunable: true, reason: "every member is merged or closed" };
}

/** A failure worth trying again: the network or GitHub, not a refusal by the merge helper. */
export function isNetworkFailure(text) {
  return /TLS handshake timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|i\/o timeout|connection reset|HTTP 50[234]|Bad Gateway|Service Unavailable|Gateway Timeout/iu.test(
    String(text),
  );
}

/**
 * What --merge does next for each member, in batch order. A merged member is done if it merged
 * at the head the batch checked; anything else stops the sequence, because the members after it
 * were only checked together with it.
 * @param {{ pr: number, head: string }[]} members
 * @param {Record<number, { state: string, headRefOid: string }>} views
 */
export function mergePlan(members, views) {
  const plan = [];
  for (const member of members) {
    const view = views[member.pr];
    if (view?.state === "MERGED" && view.headRefOid === member.head) plan.push({ ...member, step: "done" });
    else if (view?.state === "OPEN" && view.headRefOid === member.head) plan.push({ ...member, step: "merge" });
    else {
      const what =
        view === undefined ? "unknown" : view.headRefOid !== member.head ? "moved" : view.state.toLowerCase();
      plan.push({ ...member, step: "stop", reason: `#${String(member.pr)} is ${what} since the batch` });
      break;
    }
  }
  return plan;
}

/** Subject and body for a member's squash merge: its title with its number, and its summary paragraph. */
export function mergeMessage(pr) {
  const subject = `${pr.title} (#${String(pr.number)})`;
  const paragraphs = String(pr.body ?? "")
    .replace(/\r\n/gu, "\n")
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith("#"));
  return { subject, body: paragraphs[0] ?? pr.title };
}

/** "job: step" for each failed step of a run's jobs (Validate runs its checks in several jobs). */
export function failedSteps(jobs) {
  return jobs.flatMap((job) =>
    (job.steps ?? []).filter((step) => step.conclusion === "failure").map((step) => `${job.name}: ${step.name}`),
  );
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
  const running = runs.some((entry) => entry.status !== "completed");
  if (runs.length === 0) return { latest: undefined, job: undefined, jobs: [], note: "", running };
  const latest = runs[0];
  const jobs = JSON.parse(gh(["api", `repos/${slug}/actions/runs/${String(latest.id)}/jobs`])).jobs;
  // The batch annotation is on the required job, `check`; failed steps can be in any job.
  const job = jobs.find((entry) => entry.name === "check");
  const notes = job ? JSON.parse(gh(["api", `repos/${slug}/check-runs/${String(job.id)}/annotations`])) : [];
  const note = notes.find((entry) => entry.title === "batch")?.message ?? "";
  return { latest, job, jobs, note, running };
}

function status(branch) {
  const { latest, jobs, note } = batchRun(branch);
  if (latest === undefined) throw new Error(`no Validate run on ${branch}`);
  console.log(`batch run ${latest.html_url}: ${latest.status}${latest.conclusion ? `, ${latest.conclusion}` : ""}`);
  console.log(note ? `members: ${note}` : "the run has not recorded its members yet");
  if (latest.conclusion === "success") {
    console.log("each member is READY for pnpm merge:ready while its head and main stay as the batch saw them");
    console.log(`merge them in the listed order, then: pnpm merge:batch --verify ${branch}`);
    return 0;
  }
  if (latest.status === "completed" && jobs.length > 0) {
    const steps = failedSteps(jobs);
    const log = run("gh", ["run", "view", String(latest.id), "--log-failed"], { allowFailure: true }).out;
    console.log(`failed step: ${steps.join(", ") || "(none recorded)"}`);
    const checks = failedChecks(log);
    if (checks.length > 0) console.log(`failed checks: ${checks.join(", ")}`);
    console.log("to try again without a member: pnpm merge:batch <members...> --without <pr>");
  }
  return 1;
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Merges each member through the owner merge helper, in batch order, then runs --verify. A network
 * failure is tried again (after checking that the merge did not in fact go through); a refusal
 * by the helper stops the sequence, so nothing merges out of the order the batch checked.
 */
function mergeAll(branch, authorized) {
  if (!authorized) throw new Error("--merge needs --authorize-owner-merge, which the merge helper requires");
  const { latest, note } = batchRun(branch);
  const members = /members=(\S+)/u.exec(note)?.[1];
  if (latest?.conclusion !== "success" || members === undefined) {
    throw new Error(`the batch run on ${branch} did not pass with recorded members`);
  }
  const helper = join(CANONICAL.root, "scripts", "governance", "owner-safe-pr-merge.mjs");
  const view = (number) =>
    JSON.parse(gh(["pr", "view", String(number), "--json", "number,state,headRefOid,title,body"]));
  const list = parseMembers(members);
  const plan = mergePlan(list, Object.fromEntries(list.map((member) => [member.pr, view(member.pr)])));
  for (const entry of plan) {
    if (entry.step === "done") console.log(`#${String(entry.pr)} is already merged`);
    if (entry.step === "stop") {
      console.error(`stopped: ${entry.reason}`);
      return 1;
    }
    if (entry.step !== "merge") continue;
    const { subject, body } = mergeMessage(view(entry.pr));
    const directory = mkdtempSync(join(tmpdir(), "tear-batch-merge-"));
    const bodyFile = join(directory, "body.txt");
    writeFileSync(bodyFile, `${body}\n`);
    const args = [helper, "--repo", CANONICAL.root, "--pr", String(entry.pr), "--match-head-commit", entry.head];
    args.push("--subject", subject, "--body-file", bodyFile, "--authorize-owner-merge");
    try {
      for (let attempt = 1; ; attempt += 1) {
        const result = run("node", args, { cwd: CANONICAL.root, allowFailure: true });
        if (result.ok) break;
        const output = `${result.err}\n${result.out}`;
        if (view(entry.pr).state === "MERGED") break; // the request went through before the connection failed
        if (!isNetworkFailure(output) || attempt === 4) {
          console.error(`stopped at #${String(entry.pr)}: ${output.trim()}`);
          return 1;
        }
        console.log(`#${String(entry.pr)}: network failure, trying again (${String(attempt)} of 3)`);
        pause(10_000 * attempt);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    console.log(`merged #${String(entry.pr)}: ${subject}`);
  }
  return verify(branch);
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

/** Every batch branch on origin with its prune verdict. */
function pruneVerdicts() {
  const heads = git(["ls-remote", "--heads", "origin", `${BATCH_PREFIX}*`])
    .out.split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => ({ oid: line.split(/\s+/u)[0], branch: line.split(/\s+/u)[1].replace(/^refs\/heads\//u, "") }))
    .filter((head) => BATCH_BRANCH.test(head.branch));
  return heads.map(({ oid, branch }) => {
    const { latest, note, running } = batchRun(branch);
    const members = /members=(\S+)/u.exec(note)?.[1];
    const states = Object.fromEntries(
      (members ? parseMembers(members) : []).map((member) => [
        member.pr,
        JSON.parse(gh(["pr", "view", String(member.pr), "--json", "state"])).state,
      ]),
    );
    git(["fetch", "--quiet", "origin", oid], { allowFailure: true });
    const committed = Number(git(["show", "-s", "--format=%ct", oid], { allowFailure: true }).out) * 1000;
    const ageMinutes = Number.isFinite(committed) && committed > 0 ? (Date.now() - committed) / 60_000 : Infinity;
    const verdict = pruneVerdict({
      status: latest?.status,
      conclusion: latest?.conclusion,
      states,
      running,
      ageMinutes,
    });
    return { branch, ...verdict };
  });
}

function prunable() {
  const verdicts = pruneVerdicts();
  if (verdicts.length === 0) console.log("no batch branches on origin");
  for (const entry of verdicts)
    console.log(`${entry.prunable ? "prunable" : "keep    "} ${entry.branch}: ${entry.reason}`);
  return 0;
}

/**
 * Deletes the batch branches --prunable reports, on origin and here. The push is made from a
 * throwaway worktree on the branch itself, so the pre-push guard sees a codex/ branch and allows
 * the deletion only because the name is exactly a batch branch. A running check is asked about
 * again just before each deletion.
 */
function prune() {
  const verdicts = pruneVerdicts();
  if (verdicts.length === 0) console.log("no batch branches on origin");
  let failed = 0;
  for (const entry of verdicts) {
    if (!entry.prunable) {
      console.log(`kept    ${entry.branch}: ${entry.reason}`);
      continue;
    }
    if (batchRun(entry.branch).running) {
      console.log(`kept    ${entry.branch}: a check started on it`);
      continue;
    }
    const directory = mkdtempSync(join(tmpdir(), "tear-batch-prune-"));
    try {
      git(["fetch", "--quiet", "origin", `+refs/heads/${entry.branch}:refs/remotes/origin/${entry.branch}`]);
      git(["worktree", "add", "--quiet", "-B", entry.branch, directory, `origin/${entry.branch}`]);
      git(["push", "--quiet", "origin", "--delete", entry.branch], { cwd: directory });
      console.log(`deleted ${entry.branch}: ${entry.reason}`);
    } catch (error) {
      failed += 1;
      console.error(`could not delete ${entry.branch}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      git(["worktree", "remove", "--force", directory], { allowFailure: true });
      rmSync(directory, { recursive: true, force: true });
      git(["branch", "-D", entry.branch], { allowFailure: true });
      git(["branch", "-dr", `origin/${entry.branch}`], { allowFailure: true });
    }
  }
  return failed === 0 ? 0 : 1;
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
    if (argv.includes("--prune")) return prune();
    if (argv.includes("--merge")) return mergeAll(value("--merge"), argv.includes("--authorize-owner-merge"));
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
