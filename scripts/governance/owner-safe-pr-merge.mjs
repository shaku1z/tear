// Owner-safe squash merge for shaku1z repositories. Ported from the shared governance skill, plus
// one Tear rule: a pull request merges only when `pnpm merge:ready` says so (MERGE_PRECONDITIONS).
// See scripts/governance/README.md. Usage:
//   node scripts/governance/owner-safe-pr-merge.mjs --repo <canonical path> --pr <n>
//     --match-head-commit <40-hex> --subject <line> --body-file <path> --authorize-owner-merge
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { OWNER, findForbiddenAttribution } from "./tear-git-guard.mjs";
import { decide, gatherFacts } from "../merge-ready.mjs";

const POLICIES = Object.freeze([
  {
    id: "tear",
    root: "C:\\Users\\realm\\Desktop\\game\\Tear",
    slug: "shaku1z/tear",
    origin: "https://github.com/shaku1z/tear.git",
  },
  {
    id: "tear-music",
    root: "C:\\Users\\realm\\Desktop\\game\\tear-score",
    slug: "shaku1z/tear-music",
    origin: "https://github.com/shaku1z/tear-music.git",
  },
  {
    id: "tear-wiki",
    root: "C:\\Users\\realm\\Desktop\\game\\tear-wiki",
    slug: "shaku1z/tear-wiki",
    origin: "https://github.com/shaku1z/tear-wiki.git",
  },
]);
// The wiki synchronization exception (tear-wiki only). Change the file set here, in one place.
const WIKI_SYNC_FILES = Object.freeze([
  "src/data/game-reference.v1.json",
  "src/data/game-reference.v1.receipt.json",
  "src/data/wiki-terminology.json",
]);
const WIKI_SYNC_BRANCH = /^codex\/sync-game-reference-[0-9a-f]{40}$/u;
const GITHUB_COMMITTER_EMAIL = "noreply@github.com";
const WIKI_SYNC_PR_AUTHOR_LOGIN = "app/github-actions";
const WIKI_SYNC_BOT_LOGIN = "github-actions[bot]";
const WIKI_SYNC_BOT_NAME = "github-actions[bot]";
const WIKI_SYNC_BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

class MergeFailure extends Error {}

function fail(message) {
  throw new MergeFailure(message);
}

function samePath(left, right) {
  const normalize = (value) => path.resolve(String(value)).replaceAll("\\", "/").replace(/\/$/u, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function normalizedRemote(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/u, "")
    .toLowerCase();
}

function run(repo, command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repo,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) fail(command + " could not start: " + result.error.message);
  if (!allowFailure && result.status !== 0) {
    fail(command + " failed (exit " + result.status + "): " + String(result.stderr || result.stdout || "").trim());
  }
  return result;
}

function jsonCommand(repo, command, args) {
  const output = String(run(repo, command, args).stdout ?? "").trim();
  try {
    return JSON.parse(output);
  } catch (error) {
    fail(command + " returned invalid JSON: " + error.message);
  }
}

function policyFor(repoArgument) {
  const repo = path.resolve(repoArgument || "");
  const policy = POLICIES.find((candidate) => samePath(candidate.root, repo));
  if (!policy) fail("refusing to merge outside an exact canonical repository path");
  const top = path.resolve(String(run(repo, "git", ["rev-parse", "--show-toplevel"]).stdout).trim());
  if (!samePath(top, policy.root)) fail("canonical repository top-level does not match expected path");
  const branch = String(run(repo, "git", ["symbolic-ref", "--quiet", "--short", "HEAD"]).stdout).trim();
  if (branch !== "main") fail("owner-safe merge must run from canonical main; found " + (branch || "(detached)"));
  const origin = String(run(repo, "git", ["config", "--local", "--get", "remote.origin.url"]).stdout).trim();
  if (normalizedRemote(origin) !== normalizedRemote(policy.origin)) {
    fail("exact origin mismatch: expected " + policy.origin + ", found " + (origin || "(missing)"));
  }
  return { repo, policy };
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseArgs(argv) {
  if (!argv.includes("--authorize-owner-merge")) {
    fail("refusing to merge: explicit --authorize-owner-merge is required");
  }
  const repo = valueAfter(argv, "--repo");
  const pr = valueAfter(argv, "--pr");
  const matchHeadCommit = valueAfter(argv, "--match-head-commit");
  const subject = valueAfter(argv, "--subject");
  const bodyFile = valueAfter(argv, "--body-file");
  const bodyInline = valueAfter(argv, "--body");
  if (!repo || !pr || !matchHeadCommit || !subject || (!bodyFile && !bodyInline)) {
    fail(
      "usage: --repo <canonical-path> --pr <number> --match-head-commit <exact-oid> --subject <clean> (--body-file <path> | --body <clean>) --authorize-owner-merge",
    );
  }
  if (!/^[1-9][0-9]*$/u.test(pr)) fail("--pr must be a positive number");
  if (!/^[0-9a-f]{40}$/u.test(matchHeadCommit)) fail("--match-head-commit must be an exact 40-character lowercase OID");
  if (subject.includes("\r") || subject.includes("\n") || !subject.trim()) fail("--subject must be one non-empty line");
  if (bodyFile && bodyInline) fail("provide only one of --body-file or --body");
  let body;
  if (bodyFile) {
    try {
      body = fs.readFileSync(path.resolve(bodyFile), "utf8");
    } catch (error) {
      fail("cannot read --body-file: " + error.message);
    }
  } else {
    body = bodyInline;
  }
  const subjectViolation = findForbiddenAttribution(subject);
  const bodyViolation = findForbiddenAttribution(body);
  if (subjectViolation || bodyViolation) fail("subject/body contains forbidden attribution");
  if (String(body).trim().length < 20) fail("owner-safe merge body must explain scope and evidence");
  return { repoArgument: repo, pr: Number(pr), matchHeadCommit, subject, body: String(body) };
}

export function buildMergeArgs({ pr, slug, subject, body, matchHeadCommit }) {
  return [
    "pr",
    "merge",
    String(pr),
    "--repo",
    slug,
    "--squash",
    "--author-email",
    OWNER.email,
    "--subject",
    subject,
    "--body",
    body,
    "--match-head-commit",
    matchHeadCommit,
  ];
}

function asArray(value) {
  if (Array.isArray(value)) return value.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
  return [];
}

function readPullRequest(repo, slug, pr) {
  return jsonCommand(repo, "gh", [
    "pr",
    "view",
    String(pr),
    "--repo",
    slug,
    "--json",
    "state,baseRefName,headRefName,headRefOid,mergeCommit,mergedAt,author,headRepositoryOwner,headRepository,statusCheckRollup",
  ]);
}

function readAuthenticatedUser(repo) {
  const user = jsonCommand(repo, "gh", ["api", "user"]);
  if (user?.login !== "shaku1z")
    fail("authenticated GitHub account is not shaku1z; refusing to publish as another account");
  return user;
}

function readPullRequestFiles(repo, slug, pr) {
  return asArray(jsonCommand(repo, "gh", ["api", "repos/" + slug + "/pulls/" + pr + "/files", "--paginate", "--slurp"]))
    .map((file) => file?.filename)
    .filter(Boolean);
}

function readPullRequestCommits(repo, slug, pr) {
  return asArray(
    jsonCommand(repo, "gh", ["api", "repos/" + slug + "/pulls/" + pr + "/commits", "--paginate", "--slurp"]),
  );
}

function commitIdentity(commit, key) {
  const identity = commit?.commit?.[key];
  return identity && { name: identity.name, email: identity.email };
}

function isOwnerCommit(commit) {
  const author = commitIdentity(commit, "author");
  const committer = commitIdentity(commit, "committer");
  return (
    author?.name === OWNER.name &&
    author?.email === OWNER.email &&
    committer?.name === OWNER.name &&
    committer?.email === OWNER.email
  );
}

function isExactWikiSyncBotCommit(commit) {
  const gitAuthor = commitIdentity(commit, "author");
  const gitCommitter = commitIdentity(commit, "committer");
  const apiAuthor = commit?.author;
  const apiCommitter = commit?.committer;
  const message = String(commit?.commit?.message || "");
  return (
    apiAuthor?.login === WIKI_SYNC_BOT_LOGIN &&
    apiAuthor?.type === "Bot" &&
    gitAuthor?.name === WIKI_SYNC_BOT_NAME &&
    gitAuthor?.email === WIKI_SYNC_BOT_EMAIL &&
    gitCommitter?.name === WIKI_SYNC_BOT_NAME &&
    gitCommitter?.email === WIKI_SYNC_BOT_EMAIL &&
    (!apiCommitter || apiCommitter.login === WIKI_SYNC_BOT_LOGIN) &&
    !findForbiddenAttribution(message) &&
    /^sync\(wiki\): game-reference [0-9a-f]{40}$/u.test(message.split(/\r?\n/u)[0].trim())
  );
}

export function hasSuccessfulRequiredCheck(statusCheckRollup) {
  return (
    Array.isArray(statusCheckRollup) &&
    statusCheckRollup.some(
      (check) =>
        (check?.name === "check" && check?.conclusion === "SUCCESS") ||
        (check?.context === "check" && check?.state === "SUCCESS"),
    )
  );
}

export function isWikiSyncException({ policyId, headRefName, changedFiles, commits, prView, authenticatedLogin }) {
  const files = [...new Set(changedFiles)].sort();
  const allowed = [...WIKI_SYNC_FILES].sort();
  const exactFiles = files.length === allowed.length && files.every((value, index) => value === allowed[index]);
  const exactBotCommits = commits.length > 0 && commits.every(isExactWikiSyncBotCommit);
  return (
    policyId === "tear-wiki" &&
    authenticatedLogin === "shaku1z" &&
    prView?.author?.login === WIKI_SYNC_PR_AUTHOR_LOGIN &&
    (prView?.author?.is_bot === true || prView?.author?.isBot === true) &&
    prView?.headRepositoryOwner?.login === "shaku1z" &&
    prView?.headRepository?.name === "tear-wiki" &&
    WIKI_SYNC_BRANCH.test(headRefName) &&
    exactFiles &&
    hasSuccessfulRequiredCheck(prView?.statusCheckRollup) &&
    exactBotCommits
  );
}

export function isOwnerAuthoredPullRequest(prView, authenticatedLogin) {
  const authorIsBot = prView?.author?.is_bot === true || prView?.author?.isBot === true;
  return authenticatedLogin === "shaku1z" && prView?.author?.login === "shaku1z" && !authorIsBot;
}

export function assertCleanPullRequest({ policy, prView, changedFiles, commits, authenticatedLogin }) {
  if (String(prView.state).toUpperCase() !== "OPEN") fail("PR must be open; current state is " + prView.state);
  if (prView.baseRefName !== "main") fail("PR base must be main; found " + prView.baseRefName);
  if (!prView.headRefOid) fail("PR has no head OID");
  if (!hasSuccessfulRequiredCheck(prView.statusCheckRollup))
    fail('required check "check" is not SUCCESS; refusing to merge');
  const expectedHeadRepository = policy.slug.split("/")[1];
  if (prView.headRepositoryOwner?.login !== "shaku1z" || prView.headRepository?.name !== expectedHeadRepository) {
    fail("PR head repository is not the exact canonical repository; forks are not accepted");
  }
  const foreign = commits.filter((commit) => !isOwnerCommit(commit));
  if (foreign.length === 0) {
    if (!isOwnerAuthoredPullRequest(prView, authenticatedLogin)) {
      fail("ordinary PR must be authored by shaku1z and merged while authenticated as shaku1z");
    }
    return { wikiSyncException: false };
  }
  if (
    !isWikiSyncException({
      policyId: policy.id,
      headRefName: prView.headRefName,
      changedFiles,
      commits,
      prView,
      authenticatedLogin,
    })
  ) {
    fail(
      "PR contains non-owner commits; only the authenticated exact three-file wiki sync bot PR with green check is permitted as a documented exception",
    );
  }
  return { wikiSyncException: true };
}

function assertWikiSyncBody(body, exception) {
  if (!exception) return;
  const normalized = body.toLowerCase();
  if (
    !normalized.includes("game-reference") ||
    !normalized.includes("reference triplet") ||
    !WIKI_SYNC_FILES.every((file) => normalized.includes(file))
  ) {
    fail("wiki synchronization exception requires an explicit clean body naming the game-reference reference triplet");
  }
}

function verifyMergedCommit(repo, slug, mergeOid, requestedSubject) {
  if (!/^[0-9a-f]{40}$/u.test(mergeOid || "")) fail("GitHub did not report an exact squash merge commit OID");
  const commit = jsonCommand(repo, "gh", ["api", "repos/" + slug + "/commits/" + mergeOid]);
  const author = commit?.commit?.author;
  const committer = commit?.commit?.committer;
  if (author?.name !== OWNER.name || author?.email !== OWNER.email) {
    fail("post-merge verification failed: squash author is not exactly " + OWNER.name + " <" + OWNER.email + ">");
  }
  if (committer?.email !== GITHUB_COMMITTER_EMAIL || !["GitHub", "web-flow"].includes(committer?.name)) {
    fail("post-merge verification failed: unexpected technical committer; expected GitHub <noreply@github.com>");
  }
  const message = String(commit?.commit?.message || "");
  if (findForbiddenAttribution(message))
    fail("post-merge verification failed: squash message contains forbidden attribution");
  if (!message.split(/\r?\n/u)[0].startsWith(requestedSubject)) {
    fail("post-merge verification failed: squash subject does not preserve the approved subject");
  }
  return { mergeOid, author, committer, message };
}

export function assertHeadMatches(prView, matchHeadCommit) {
  if (String(prView?.headRefOid).toLowerCase() !== matchHeadCommit) {
    fail("PR head changed: supplied --match-head-commit does not match the current exact head OID");
  }
}

// Further refusals, run in order after the checks above and before anything is merged. Each entry is
// { id, check(context) }, and check throws to refuse; context holds repo, policy, pr, prView,
// changedFiles, commits and authenticatedLogin.
export const MERGE_PRECONDITIONS = Object.freeze([
  {
    // Branches may be behind main (the pre-push guard no longer requires main's tip), so freshness
    // is decided here: main's newest commit checked and green, and the pull request's own pass not
    // older than a main change to the files it touches or to shared files, or a passed batch run
    // covering it (scripts/merge-ready.mjs).
    id: "merge-ready",
    check: ({ policy, pr }) => {
      if (policy.id !== "tear") return;
      const decision = decide(gatherFacts(pr, policy.slug));
      for (const note of decision.notes ?? []) console.warn(`merge-ready: ${note}`);
      if (!decision.ready) {
        const next = decision.action === undefined ? "" : `; next: ${decision.action}`;
        throw new Error(`${decision.reason}${next} (pnpm merge:ready ${String(pr)} says the same)`);
      }
    },
  },
]);

export function assertMergePreconditions(context, preconditions = MERGE_PRECONDITIONS) {
  for (const { id, check } of preconditions) {
    try {
      check(context);
    } catch (error) {
      fail(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function ownerSafeMerge(options) {
  const { repoArgument, pr, matchHeadCommit, subject, body, preconditions = MERGE_PRECONDITIONS } = options;
  const { repo, policy } = policyFor(repoArgument);
  const authenticatedUser = readAuthenticatedUser(repo);
  const before = readPullRequest(repo, policy.slug, pr);
  assertHeadMatches(before, matchHeadCommit);
  const changedFiles = readPullRequestFiles(repo, policy.slug, pr);
  const commits = readPullRequestCommits(repo, policy.slug, pr);
  const exceptionState = assertCleanPullRequest({
    policy,
    prView: before,
    changedFiles,
    commits,
    authenticatedLogin: authenticatedUser.login,
  });
  assertWikiSyncBody(body, exceptionState.wikiSyncException);
  assertMergePreconditions(
    { repo, policy, pr, prView: before, changedFiles, commits, authenticatedLogin: authenticatedUser.login },
    preconditions,
  );
  const mergeArgs = buildMergeArgs({
    pr,
    slug: policy.slug,
    subject,
    body,
    matchHeadCommit,
  });
  console.log(
    "[tear-governance] explicit authorization accepted; invoking: gh " +
      mergeArgs.map((value) => JSON.stringify(value)).join(" "),
  );
  const mergeResult = run(repo, "gh", mergeArgs);
  process.stdout.write(String(mergeResult.stdout || ""));
  const after = readPullRequest(repo, policy.slug, pr);
  const mergeOid = after?.mergeCommit?.oid;
  if (String(after.state).toUpperCase() !== "MERGED" || !after.mergedAt || !mergeOid) {
    fail("merge command returned without a completed protected squash merge; no retry was attempted");
  }
  const verified = verifyMergedCommit(repo, policy.slug, mergeOid, subject);
  console.log("[tear-governance] verified protected squash merge " + mergeOid + "; deployment was not performed");
  return { policy, pr, wikiSyncException: exceptionState.wikiSyncException, ...verified };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    ownerSafeMerge(options);
    return 0;
  } catch (error) {
    console.error(
      "[tear-governance] merge refused/failed: " + (error instanceof Error ? error.message : String(error)),
    );
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
