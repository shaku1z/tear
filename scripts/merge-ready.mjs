// Answers "may this pull request merge now?" with yes or no and the reason. The merge helper
// calls it before merging; `pnpm merge:ready <pr>` runs it by hand.
//
//   node scripts/merge-ready.mjs 123             decide; exit 0 when ready, 1 when not
//   node scripts/merge-ready.mjs 123 --refresh   if the pass is stale or missing, start a fresh check
//   node scripts/merge-ready.mjs 123 --json      print the decision as JSON
//
// The rules (docs/RELEASE_AUTHORITY.md, "Merging"):
// 1. A red main stops merges: main's newest commit must have a finished Validate run, and the
//    latest finished run on main must have passed, unless the pull request carries the
//    `fixes-main` label. A main commit whose run was cancelled or is still running is not known to
//    be green, so it stops merges too.
// 2. A stale pass is not a pass: the pull request's latest Validate run for its current head must
//    have passed, and no commit merged into main since that run may touch a file the pull request
//    changes or a shared file below. Each run records the head and main it checked
//    (".github/workflows/ci.yml", "Record what was checked").
// 3. A passed batch covers its members: a pull request is also ready when a passed batch run
//    (`pnpm merge:batch`) checked its current head together with other members, and every commit
//    on main since the main that run checked is the merge of another member of that batch, at the
//    head the batch checked. The combination on main was then itself checked, so main's newest
//    commit need not have a finished run, and shared-file changes by other members do not make
//    the pass stale. A red main still stops it.
// 4. The design check is answered (docs/RELEASE_AUTHORITY.md, rule 5): the description gives a
//    non-empty answer after each design-check label of docs/ENGINEERING_STANDARD.md, or one
//    `Design check: not applicable — <reason>` line. The labels, the rule and the gate's mode
//    (off, observe, enforce; config/design-check.json) live in scripts/design-check.mjs. In observe
//    mode the decision carries a "would refuse" note instead of refusing.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { designCheckVerdict, readDesignCheckConfig } from "./design-check.mjs";
import { GATE_LABEL, gateFilesIn, loadGateList } from "./gate-files.mjs";
import { BATCH_BRANCH } from "./merge-batch.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Files whose change can break any other change, so a merge touching them makes every pass stale. */
export const SHARED_FILES = Object.freeze([
  /^package\.json$/u,
  /^pnpm-lock\.yaml$/u,
  /^pnpm-workspace\.yaml$/u,
  /^\.github\/workflows\//u,
  // Everything under config/ except the tool catalogue. The catalogue only describes package.json
  // (shared) and the files under scripts/, and tests/unit/tool-catalogue.test.mjs is its only
  // reader. A change that adds or removes a script must edit the catalogue itself, so it overlaps
  // any main change to it; a change that does neither cannot make main's catalogue invalid.
  /^config\/(?!tool-catalogue\.json$)/u,
  /^src\/tearbench\/task-registry\.json$/u,
  /^tsconfig[^/]*\.json$/u,
  /^eslint\.config\.mjs$/u,
  /^\.prettierrc\.json$/u,
  /^\.prettierignore$/u,
  /^vite\.config\.ts$/u,
  /^vitest[^/]*\.config\.ts$/u,
  /^scripts\/build-target\.mjs$/u,
]);

export const FIX_LABEL = "fixes-main";
/** Run conclusions that mean nothing was checked: a draft's run is skipped, a superseded one cancelled. */
const NOTHING_CHECKED = new Set(["skipped", "cancelled"]);

/**
 * The run that speaks for a head. A draft's skipped run can be created after the real one, so the
 * newest run that checked something (or is still running) counts; only when none did is the newest
 * run returned, and `decide` reports it as "nothing was checked".
 */
export function pickRun(runs) {
  const newestFirst = [...runs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return newestFirst.find((run) => !NOTHING_CHECKED.has(run.conclusion)) ?? newestFirst[0];
}

/** The `batch` annotation Validate writes (scripts/merge-batch.mjs, batchNote). */
export function parseBatchNote(message) {
  const main = /main=([0-9a-f]{40})/u.exec(message ?? "")?.[1];
  const list = /members=((?:\d+:[0-9a-f]{40},?)+)/u.exec(message ?? "")?.[1];
  if (main === undefined || list === undefined) return undefined;
  const members = list
    .split(",")
    .filter(Boolean)
    .map((entry) => ({ pr: Number(entry.split(":")[0]), head: entry.split(":")[1] }));
  return { main, members };
}

/**
 * Rule 3: whether a passed batch run covers this pull request as main is now.
 * @param {{ number: number, headSha: string }} pr
 * @param {{ conclusion: string, url?: string, main: string, members: { pr: number, head: string }[] } | undefined} batch
 * @param {{ sha: string, pr?: number, head?: string }[] | undefined} mainSinceBatch commits on main after
 *   `batch.main`, oldest first, each with the pull request it merged and that pull request's head
 */
export function batchCover(pr, batch, mainSinceBatch) {
  const no = (reason) => ({ covered: false, reason });
  if (batch === undefined) return no("no passed batch run names this pull request");
  if (batch.conclusion !== "success") return no(`the batch run ended ${batch.conclusion}`);
  const member = batch.members.find((entry) => entry.pr === pr.number);
  if (member === undefined) return no("the batch does not include this pull request");
  if (member.head !== pr.headSha) return no(`the head moved after the batch, which checked ${member.head.slice(0, 8)}`);
  if (mainSinceBatch === undefined) return no("could not list main's commits since the batch's main");
  for (const commit of mainSinceBatch) {
    const other = batch.members.find((entry) => entry.pr === commit.pr && entry.pr !== pr.number);
    if (other === undefined) {
      return no(`main has ${commit.sha.slice(0, 8)} since the batch, which is not another member's merge`);
    }
    if (other.head !== commit.head) {
      return no(`#${String(other.pr)} merged a head the batch did not check (${String(commit.head).slice(0, 8)})`);
    }
  }
  const merged = mainSinceBatch.map((commit) => `#${String(commit.pr)}`);
  const since = merged.length === 0 ? "main has not changed since" : `main changed since only by ${merged.join(", ")}`;
  const where = batch.url ? ` (${batch.url})` : "";
  return { covered: true, reason: `a batch run checked it with the other members${where}, and ${since}` };
}

/**
 * The decision, from facts already gathered. Pure, so tests can cover every rule.
 * @param {object} facts
 * @param {{ conclusion: string, headSha: string, url?: string } | undefined} facts.main latest finished main run
 * @param {{ headSha: string, labels: string[], files: string[], draft: boolean, state: string }} facts.pr
 * @param {{ status: string, conclusion: string | null, checkedHead?: string, checkedMain?: string, url?: string } | undefined} facts.run
 *   latest Validate run for the pull request's head
 * @param {string[] | undefined} facts.mainFilesSince files changed on main since `run.checkedMain`
 * @param {string | undefined} facts.mainTip main's newest commit (origin/main after a fetch)
 * @param {Parameters<typeof batchCover>[1]} [facts.batch] the newest passed batch run naming this head
 * @param {Parameters<typeof batchCover>[2]} [facts.mainSinceBatch]
 * @param {string} [facts.designCheckMode] the design-check gate's mode; missing means enforce
 * @param {{ files: { path: string }[] }} [facts.gateList] config/gate-files.json from the checkout that runs this
 * @returns {{ ready: boolean, reason: string, action?: string, notes?: string[] }} `notes` are printed and
 *   never change `ready`: a would-refuse in observe mode, or an accepted "not applicable" line
 */
export function decide(facts) {
  const { pr } = facts;
  if (pr.state !== "OPEN") return { ready: false, reason: `the pull request is ${pr.state.toLowerCase()}` };
  if (pr.draft)
    return { ready: false, reason: "the pull request is a draft", action: "mark it ready, which starts a check" };
  const verdict = designCheckVerdict(pr.body, facts.designCheckMode ?? "enforce");
  if (verdict.refuse !== undefined) {
    return {
      ready: false,
      reason: verdict.refuse,
      action: "answer each design-check label in the description (docs/ENGINEERING_STANDARD.md)",
    };
  }
  // Rule 5: a change to a gate file merges only after the lead's review. fixes-main does not bypass it.
  const gate = facts.gateList === undefined ? [] : gateFilesIn(facts.gateList, pr.files);
  if (gate.length > 0 && !pr.labels.includes(GATE_LABEL)) {
    const shown = gate.slice(0, 5).join(", ") + (gate.length > 5 ? `, and ${String(gate.length - 5)} more` : "");
    return {
      ready: false,
      reason: `it changes gate files (${shown})`,
      action: `the lead reviews it; the merge desk labels it "${GATE_LABEL}" only when the lead names the pull request and head`,
    };
  }
  const decision = decideChecks(facts);
  return verdict.note === undefined ? decision : { ...decision, notes: [verdict.note] };
}

/** Rules 1 to 3: main's state, the pull request's own pass, and batch cover. */
function decideChecks(facts) {
  const { main, pr } = facts;
  const no = (reason, action) => ({ ready: false, reason, action });
  if (main === undefined) return no("main has no finished Validate run yet", "wait for main's check");
  if (main.conclusion !== "success" && !pr.labels.includes(FIX_LABEL)) {
    return no(
      `main is red: its latest finished check (${main.headSha.slice(0, 8)}) ended ${main.conclusion}`,
      `fix main first, or label the pull request that fixes it "${FIX_LABEL}"`,
    );
  }
  const single = decideSingle(facts);
  if (single.ready || facts.batch === undefined) return single;
  if (main.conclusion !== "success")
    return { ...single, reason: `${single.reason}; a batch does not apply while main is red` };
  const cover = batchCover(pr, facts.batch, facts.mainSinceBatch);
  if (cover.covered) return { ready: true, reason: cover.reason };
  return { ...single, reason: `${single.reason}; batch: ${cover.reason}` };
}

/** Rules 1 and 2 for one pull request on its own run, after the state, draft and red-main checks. */
function decideSingle({ main, pr, run, mainFilesSince, mainTip }) {
  const no = (reason, action) => ({ ready: false, reason, action });
  const fixesMain = pr.labels.includes(FIX_LABEL);
  if (mainTip !== undefined && main.headSha !== mainTip && !fixesMain) {
    return no(
      `main's newest commit (${mainTip.slice(0, 8)}) has no finished check; the last finished one is ${main.headSha.slice(0, 8)}`,
      'wait for main\'s check of its newest commit; if that run was cancelled, start one on main with "Run workflow"',
    );
  }
  if (run === undefined) return no("no Validate run exists for the pull request's current head", "refresh");
  if (run.status !== "completed") return no(`the check for the current head is still ${run.status}`, "wait");
  // A skipped run (the pull request was a draft when it started) or a cancelled one checked nothing.
  if (NOTHING_CHECKED.has(run.conclusion)) {
    return no(`the latest run for the current head was ${run.conclusion}, so nothing was checked`, "refresh");
  }
  if (run.conclusion !== "success") return no(`the check for the current head ended ${run.conclusion}`, "fix it");
  if (run.checkedHead === undefined || run.checkedMain === undefined) {
    return no("the passing run did not record which main it checked against", "refresh");
  }
  if (run.checkedHead !== pr.headSha) return no("the passing run checked a different head", "refresh");
  if (mainFilesSince === undefined) return no("could not compare main with the checked main", "refresh");
  const touched = new Set(pr.files);
  const overlap = mainFilesSince.filter((file) => touched.has(file) || SHARED_FILES.some((rule) => rule.test(file)));
  if (overlap.length > 0) {
    const shown =
      overlap.slice(0, 5).join(", ") + (overlap.length > 5 ? `, and ${String(overlap.length - 5)} more` : "");
    return no(`main changed since the check, in files this change touches or shared files: ${shown}`, "refresh");
  }
  const since =
    mainFilesSince.length === 0 ? "main has not changed since" : "main changed only in unrelated files since";
  return {
    ready: true,
    reason: `${fixesMain && main.conclusion !== "success" ? "main is red but this is the fix; " : ""}the check passed and ${since}`,
  };
}

function gh(args) {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`gh ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : undefined;
}

const api = (path) => JSON.parse(gh(["api", path]));

/** Reads the facts `decide` needs from GitHub and the local clone. */
export function gatherFacts(
  number,
  slug = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim(),
) {
  const view = JSON.parse(
    gh(["pr", "view", String(number), "--json", "state,isDraft,headRefOid,headRefName,labels,body"]),
  );
  const files = JSON.parse(gh(["api", `repos/${slug}/pulls/${String(number)}/files`, "--paginate", "--slurp"]))
    .flat()
    .flatMap((file) => [file.filename, ...(file.previous_filename ? [file.previous_filename] : [])]);
  const pr = {
    number,
    state: view.state,
    draft: view.isDraft,
    headSha: view.headRefOid,
    headRefName: view.headRefName,
    labels: view.labels.map((label) => label.name),
    body: view.body,
    files,
  };
  const mainRuns = api(
    `repos/${slug}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&per_page=10`,
  );
  const latestMain = mainRuns.workflow_runs.find((run) => ["success", "failure", "timed_out"].includes(run.conclusion));
  const main =
    latestMain === undefined
      ? undefined
      : { conclusion: latestMain.conclusion, headSha: latestMain.head_sha, url: latestMain.html_url };
  const runs = api(
    `repos/${slug}/actions/workflows/ci.yml/runs?head_sha=${pr.headSha}&per_page=20`,
  ).workflow_runs.filter((run) => run.event === "pull_request" || run.event === "workflow_dispatch");
  const latest = pickRun(runs);
  let run;
  let mainFilesSince;
  if (latest !== undefined) {
    run = { status: latest.status, conclusion: latest.conclusion, url: latest.html_url };
    const job = api(`repos/${slug}/actions/runs/${String(latest.id)}/jobs`).jobs.find(
      (entry) => entry.name === "check",
    );
    if (job !== undefined && latest.status === "completed") {
      const notes = api(`repos/${slug}/check-runs/${String(job.id)}/annotations`);
      const checked = notes.find((note) => note.title === "checked")?.message ?? "";
      run.checkedHead = /head=([0-9a-f]{40})/u.exec(checked)?.[1];
      run.checkedMain = /main=([0-9a-f]{40})/u.exec(checked)?.[1];
    }
    if (run.checkedMain !== undefined) {
      git(["fetch", "--quiet", "origin", "main"]);
      const names = git(["diff", "--name-only", run.checkedMain, "origin/main"]);
      mainFilesSince = names?.split(/\r?\n/u).filter(Boolean);
    }
  }
  git(["fetch", "--quiet", "origin", "main"]);
  const mainTip = git(["rev-parse", "origin/main"])?.trim();
  const designCheckMode = readDesignCheckConfig(root).mode;
  // The canonical checkout on main runs merge:ready, so the list is main's, not the change's.
  return {
    slug,
    main,
    pr,
    run,
    mainFilesSince,
    mainTip,
    designCheckMode,
    gateList: loadGateList(),
    ...gatherBatch(slug, pr),
  };
}

/** The newest passed batch run that names this head, and main's commits since the main it checked. */
export function gatherBatch(slug, pr) {
  const runs = api(
    `repos/${slug}/actions/workflows/ci.yml/runs?event=workflow_dispatch&status=success&per_page=20`,
  ).workflow_runs.filter((entry) => BATCH_BRANCH.test(entry.head_branch ?? ""));
  for (const candidate of runs.slice(0, 8)) {
    const job = api(`repos/${slug}/actions/runs/${String(candidate.id)}/jobs`).jobs.find(
      (entry) => entry.name === "check",
    );
    if (job === undefined) continue;
    const notes = api(`repos/${slug}/check-runs/${String(job.id)}/annotations`);
    const note = parseBatchNote(notes.find((entry) => entry.title === "batch")?.message);
    if (note === undefined || !note.members.some((member) => member.pr === pr.number && member.head === pr.headSha))
      continue;
    const batch = { conclusion: candidate.conclusion, url: candidate.html_url, ...note };
    return { batch, mainSinceBatch: commitsSince(slug, note.main) };
  }
  return {};
}

/** First-parent commits on origin/main after `base`, oldest first, with the pull request each merged. */
function commitsSince(slug, base) {
  if (git(["merge-base", "--is-ancestor", base, "origin/main"]) === undefined) return undefined;
  const shas = git(["rev-list", "--first-parent", "--reverse", `${base}..origin/main`])
    ?.split(/\r?\n/u)
    .filter(Boolean);
  return shas?.map((sha) => {
    const merged = api(`repos/${slug}/commits/${sha}/pulls`).find((entry) => entry.merge_commit_sha === sha);
    return { sha, pr: merged?.number, head: merged?.head?.sha };
  });
}

/** Starts a fresh Validate run for the pull request's head; the workflow merges current main itself. */
export function refresh(pr) {
  gh(["workflow", "run", "ci.yml", "--ref", pr.headRefName]);
  return `started a fresh check of ${pr.headRefName} (${pr.headSha.slice(0, 8)}) merged with current main; run this again when it finishes`;
}

function main(argv) {
  const number = Number(argv.find((value) => /^\d+$/u.test(value)));
  if (!Number.isInteger(number) || number <= 0) {
    console.error("usage: node scripts/merge-ready.mjs <pull request number> [--refresh] [--json]");
    return 2;
  }
  const facts = gatherFacts(number);
  const decision = decide(facts);
  const refreshed = !decision.ready && decision.action === "refresh" && argv.includes("--refresh");
  const note = refreshed ? refresh(facts.pr) : undefined;
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ pr: number, ...decision, ...(note ? { refreshed: note } : {}) }, null, 2));
  } else {
    console.log(`${decision.ready ? "READY" : "NOT READY"} #${String(number)}: ${decision.reason}`);
    for (const note of decision.notes ?? []) console.log(note);
    if (!decision.ready && decision.action !== undefined) console.log(`next: ${note ?? decision.action}`);
    if (facts.run?.url) console.log(`check: ${facts.run.url}`);
  }
  return decision.ready ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
