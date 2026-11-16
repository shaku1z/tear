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
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Files whose change can break any other change, so a merge touching them makes every pass stale. */
export const SHARED_FILES = Object.freeze([
  /^package\.json$/u,
  /^pnpm-lock\.yaml$/u,
  /^pnpm-workspace\.yaml$/u,
  /^\.github\/workflows\//u,
  /^config\//u,
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

/**
 * The decision, from facts already gathered. Pure, so tests can cover every rule.
 * @param {object} facts
 * @param {{ conclusion: string, headSha: string, url?: string } | undefined} facts.main latest finished main run
 * @param {{ headSha: string, labels: string[], files: string[], draft: boolean, state: string }} facts.pr
 * @param {{ status: string, conclusion: string | null, checkedHead?: string, checkedMain?: string, url?: string } | undefined} facts.run
 *   latest Validate run for the pull request's head
 * @param {string[] | undefined} facts.mainFilesSince files changed on main since `run.checkedMain`
 * @param {string | undefined} facts.mainTip main's newest commit (origin/main after a fetch)
 */
export function decide({ main, pr, run, mainFilesSince, mainTip }) {
  const no = (reason, action) => ({ ready: false, reason, action });
  if (pr.state !== "OPEN") return no(`the pull request is ${pr.state.toLowerCase()}`);
  if (pr.draft) return no("the pull request is a draft", "mark it ready, which starts a check");
  const fixesMain = pr.labels.includes(FIX_LABEL);
  if (main === undefined) return no("main has no finished Validate run yet", "wait for main's check");
  if (main.conclusion !== "success" && !fixesMain) {
    return no(
      `main is red: its latest finished check (${main.headSha.slice(0, 8)}) ended ${main.conclusion}`,
      `fix main first, or label the pull request that fixes it "${FIX_LABEL}"`,
    );
  }
  if (mainTip !== undefined && main.headSha !== mainTip && !fixesMain) {
    return no(
      `main's newest commit (${mainTip.slice(0, 8)}) has no finished check; the last finished one is ${main.headSha.slice(0, 8)}`,
      'wait for main\'s check of its newest commit; if that run was cancelled, start one on main with "Run workflow"',
    );
  }
  if (run === undefined) return no("no Validate run exists for the pull request's current head", "refresh");
  if (run.status !== "completed") return no(`the check for the current head is still ${run.status}`, "wait");
  // A skipped run (the pull request was a draft when it started) or a cancelled one checked nothing.
  if (run.conclusion === "skipped" || run.conclusion === "cancelled") {
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
  const view = JSON.parse(gh(["pr", "view", String(number), "--json", "state,isDraft,headRefOid,headRefName,labels"]));
  const files = JSON.parse(gh(["api", `repos/${slug}/pulls/${String(number)}/files`, "--paginate", "--slurp"]))
    .flat()
    .flatMap((file) => [file.filename, ...(file.previous_filename ? [file.previous_filename] : [])]);
  const pr = {
    state: view.state,
    draft: view.isDraft,
    headSha: view.headRefOid,
    headRefName: view.headRefName,
    labels: view.labels.map((label) => label.name),
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
  const latest = runs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
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
  return { slug, main, pr, run, mainFilesSince, mainTip };
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
    if (!decision.ready && decision.action !== undefined) console.log(`next: ${note ?? decision.action}`);
    if (facts.run?.url) console.log(`check: ${facts.run.url}`);
  }
  return decision.ready ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
