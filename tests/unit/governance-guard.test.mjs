// The owner guard behind every commit and push in this repository (scripts/governance/). Each case runs
// in a scratch repository with the hooks active, against the in-repo guard and, on a machine that has
// it, the shared skill copy that still serves the music and wiki repositories, so the two can be shown
// to agree. Set TEAR_GOVERNANCE_PARITY=0 to skip the shared copy.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHARED = "C:/Users/realm/.codex/skills/tear-program-governance";
const ORIGIN = "https://github.com/shaku1z/tear.git";
const ZERO = "0".repeat(40);
const OWNER = { name: "shaku1z", email: "shatheartboy@gmail.com" };
const FOREIGN = { name: "Factory Droid", email: "bot@example.com" };
const GITHUB = { name: "GitHub", email: "noreply@github.com" };

const IMPLEMENTATIONS = [
  {
    label: "in-repo",
    guard: path.join(ROOT, "scripts/governance/tear-git-guard.mjs"),
    hooks: path.join(ROOT, "scripts/governance/hooks"),
  },
];
if (
  process.env.TEAR_GOVERNANCE_PARITY !== "0" &&
  !process.env.CI &&
  fs.existsSync(path.join(SHARED, "scripts/tear-git-guard.mjs"))
)
  IMPLEMENTATIONS.push({
    label: "shared",
    guard: path.join(SHARED, "scripts/tear-git-guard.mjs"),
    hooks: path.join(SHARED, "hooks"),
  });

function git(repo, args, options = {}) {
  return spawnSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true, maxBuffer: 8 << 20, ...options });
}

function gitOk(repo, args, options = {}) {
  const result = git(repo, args, options);
  expect(result.status, `git ${args.join(" ")}: ${result.stderr || result.stdout}`).toBe(0);
  return String(result.stdout ?? "").trim();
}

const identityEnv = (identity) => ({
  ...process.env,
  GIT_AUTHOR_NAME: identity.name,
  GIT_AUTHOR_EMAIL: identity.email,
  GIT_COMMITTER_NAME: identity.name,
  GIT_COMMITTER_EMAIL: identity.email,
});

function setOwnerPolicy(repo, hooks) {
  for (const [key, value] of [
    ["user.name", OWNER.name],
    ["user.email", OWNER.email],
    ["author.name", OWNER.name],
    ["author.email", OWNER.email],
    ["committer.name", OWNER.name],
    ["committer.email", OWNER.email],
    ["user.useConfigOnly", "true"],
    ["core.hooksPath", hooks.replaceAll("\\", "/")],
    ["tear.governance.repository", "tear"],
    ["tear.governance.expectedOrigin", ORIGIN],
    ["tear.governance.ownerName", OWNER.name],
    ["tear.governance.ownerEmail", OWNER.email],
  ])
    gitOk(repo, ["config", "--local", "--replace-all", key, value]);
  const commonDir = path.resolve(repo, gitOk(repo, ["rev-parse", "--git-common-dir"]));
  gitOk(repo, ["config", "--local", "--replace-all", "tear.governance.gitCommonDir", commonDir.replaceAll("\\", "/")]);
}

/** A scratch repository with one published commit on origin/main and a codex/test-scope branch. */
function buildRepo(impl, baseIdentity) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "tear-governance-"));
  gitOk(repo, ["init", "--initial-branch", "main"]);
  gitOk(repo, ["remote", "add", "origin", ORIGIN]);
  fs.writeFileSync(path.join(repo, "base.txt"), "base\n");
  gitOk(repo, ["add", "base.txt"]);
  // The baseline is written before the policy and hooks are configured, as published history would be.
  gitOk(repo, ["commit", "-m", "published baseline"], { env: identityEnv(baseIdentity) });
  const base = gitOk(repo, ["rev-parse", "HEAD"]);
  setOwnerPolicy(repo, impl.hooks);
  gitOk(repo, ["update-ref", "refs/remotes/origin/main", base]);
  gitOk(repo, ["checkout", "-b", "codex/test-scope"]);
  return { repo, base };
}

// Building a repository costs about twenty git processes, so each case copies a template built once per
// guard copy and baseline identity, then records its own Git directory as the installed policy expects.
const templates = new Map();
afterAll(() => {
  for (const { repo } of templates.values()) fs.rmSync(repo, { recursive: true, force: true });
});

function initRepo(impl, { baseIdentity = OWNER } = {}) {
  const key = `${impl.label}:${baseIdentity.email}`;
  if (!templates.has(key)) templates.set(key, buildRepo(impl, baseIdentity));
  const template = templates.get(key);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "tear-governance-"));
  fs.cpSync(template.repo, repo, { recursive: true });
  const commonDir = path.resolve(repo, ".git").replaceAll("\\", "/");
  gitOk(repo, ["config", "--local", "--replace-all", "tear.governance.gitCommonDir", commonDir]);
  return { repo, base: template.base };
}

let counter = 0;
function tryCommit(repo, message, extraArgs = [], file = "feature.txt") {
  counter += 1;
  fs.writeFileSync(path.join(repo, file), `${message}\n${String(counter)}\n`);
  gitOk(repo, ["add", file]);
  return git(repo, ["commit", ...extraArgs, "-m", message]);
}

function prePush(impl, repo, line, remote = "origin", url = ORIGIN) {
  return spawnSync(process.execPath, [impl.guard, "pre-push", remote, url], {
    cwd: repo,
    input: `${line}\n`,
    encoding: "utf8",
    windowsHide: true,
  });
}

function commitTree(repo, message, parent, identity) {
  const tree = gitOk(repo, ["rev-parse", `${parent}^{tree}`]);
  return gitOk(repo, ["commit-tree", tree, "-p", parent], { input: `${message}\n`, env: identityEnv(identity) });
}

function withRepo(impl, run, options) {
  const { repo, base } = initRepo(impl, options);
  try {
    run(repo, base);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

for (const impl of IMPLEMENTATIONS) {
  describe(`owner guard (${impl.label})`, { timeout: 60_000 }, () => {
    it("accepts an owner commit on a codex branch", () =>
      withRepo(impl, (repo, base) => {
        expect(tryCommit(repo, "feat: owner change").status).toBe(0);
        expect(gitOk(repo, ["show", "-s", "--format=%an <%ae> %cn <%ce>"])).toBe(
          `${OWNER.name} <${OWNER.email}> ${OWNER.name} <${OWNER.email}>`,
        );
        expect(gitOk(repo, ["rev-parse", "HEAD^"])).toBe(base);
      }));

    it("rejects a commit under another configured identity", () =>
      withRepo(impl, (repo, base) => {
        gitOk(repo, ["config", "--local", "user.name", "Cursor"]);
        gitOk(repo, ["config", "--local", "user.email", "cursor@example.com"]);
        expect(tryCommit(repo, "feat: foreign").status).not.toBe(0);
        expect(gitOk(repo, ["rev-parse", "HEAD"])).toBe(base);
      }));

    it("rejects a command-line --author override", () =>
      withRepo(impl, (repo, base) => {
        expect(tryCommit(repo, "feat: title", ["--author", `${FOREIGN.name} <${FOREIGN.email}>`]).status).not.toBe(0);
        expect(gitOk(repo, ["rev-parse", "HEAD"])).toBe(base);
      }));

    it("rejects attribution trailers and phrases, including Unicode hyphens and CRLF", () =>
      withRepo(impl, (repo, base) => {
        expect(tryCommit(repo, "feat: clean title\n\nCo-authored-by: Someone <a@example.com>").status).not.toBe(0);
        expect(tryCommit(repo, "feat: clean\r\n\r\nCo\u2010Authored\u2010By: Cursor <c@example.com>").status).not.toBe(
          0,
        );
        expect(tryCommit(repo, "feat: thing\n\nGenerated by Claude").status).not.toBe(0);
        expect(gitOk(repo, ["rev-parse", "HEAD"])).toBe(base);
      }));

    it("still rejects a trailer when a commit asks git to skip hooks (prepare-commit-msg runs anyway)", () =>
      withRepo(impl, (repo, base) => {
        const skipHooks = ["--no-" + "verify"];
        expect(tryCommit(repo, "feat: title\n\nSigned-off-by: Bot <b@example.com>", skipHooks).status).not.toBe(0);
        expect(gitOk(repo, ["rev-parse", "HEAD"])).toBe(base);
      }));

    it("rejects a commit on main", () =>
      withRepo(impl, (repo, base) => {
        gitOk(repo, ["checkout", "main"]);
        expect(tryCommit(repo, "feat: on main").status).not.toBe(0);
        expect(gitOk(repo, ["rev-parse", "HEAD"])).toBe(base);
      }));

    it("rejects a commit on a detached HEAD", () =>
      withRepo(impl, (repo, base) => {
        gitOk(repo, ["checkout", "--detach"]);
        expect(tryCommit(repo, "feat: detached").status).not.toBe(0);
        expect(gitOk(repo, ["rev-parse", "HEAD"])).toBe(base);
      }));

    it("rejects a commit on a branch outside codex/<scope>", () =>
      withRepo(impl, (repo, base) => {
        gitOk(repo, ["checkout", "-b", "feature/other"]);
        expect(tryCommit(repo, "feat: wrong branch").status).not.toBe(0);
        expect(gitOk(repo, ["rev-parse", "HEAD"])).toBe(base);
      }));

    it("fires in a linked worktree that shares the repository config", () =>
      withRepo(impl, (repo) => {
        const linked = `${repo}-linked`;
        gitOk(repo, ["worktree", "add", "-b", "codex/linked", linked, "codex/test-scope"]);
        try {
          expect(tryCommit(linked, "feat: in worktree").status).toBe(0);
          expect(tryCommit(linked, "feat: x\n\nCo-authored-by: A <a@example.com>").status).not.toBe(0);
        } finally {
          gitOk(repo, ["worktree", "remove", "--force", linked]);
        }
      }));

    it("allows pushing owner commits to the same codex branch", () =>
      withRepo(impl, (repo) => {
        expect(tryCommit(repo, "feat: owner").status).toBe(0);
        const head = gitOk(repo, ["rev-parse", "HEAD"]);
        const result = prePush(impl, repo, `refs/heads/codex/test-scope ${head} refs/heads/codex/test-scope ${ZERO}`);
        expect(result.status, result.stderr).toBe(0);
      }));

    it("rejects a push to main", () =>
      withRepo(impl, (repo) => {
        expect(tryCommit(repo, "feat: owner").status).toBe(0);
        const head = gitOk(repo, ["rev-parse", "HEAD"]);
        expect(prePush(impl, repo, `refs/heads/codex/test-scope ${head} refs/heads/main ${ZERO}`).status).not.toBe(0);
      }));

    it("rejects a force push that is not a fast-forward", () =>
      withRepo(impl, (repo, base) => {
        expect(tryCommit(repo, "feat: first").status).toBe(0);
        const published = gitOk(repo, ["rev-parse", "HEAD"]);
        gitOk(repo, ["reset", "--hard", base]);
        expect(tryCommit(repo, "feat: rewritten", [], "other.txt").status).toBe(0);
        const rewritten = gitOk(repo, ["rev-parse", "HEAD"]);
        const line = `refs/heads/codex/test-scope ${rewritten} refs/heads/codex/test-scope ${published}`;
        const result = prePush(impl, repo, line);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/non-fast-forward/u);
      }));

    it("rejects a branch deletion and a push to another remote", () =>
      withRepo(impl, (repo) => {
        const deletion = `(delete) ${ZERO} refs/heads/codex/test-scope ${"a".repeat(40)}`;
        expect(prePush(impl, repo, deletion).status).not.toBe(0);
        const head = gitOk(repo, ["rev-parse", "HEAD"]);
        const line = `refs/heads/codex/test-scope ${head} refs/heads/codex/test-scope ${ZERO}`;
        expect(prePush(impl, repo, line, "fork", "https://github.com/someone/tear.git").status).not.toBe(0);
      }));

    it("rejects deleting any branch that is not exactly a batch branch", () =>
      withRepo(impl, (repo) => {
        for (const name of [
          "codex/batch-x",
          "codex/batch-20261116t232224z-extra",
          "codex/batch-20261116T232224Z",
          "codex/batch-merge",
          "codex/test-scope",
          "main",
        ]) {
          const deletion = `(delete) ${ZERO} refs/heads/${name} ${"a".repeat(40)}`;
          expect(prePush(impl, repo, deletion).status, name).not.toBe(0);
        }
      }));

    // The shared skill copy serves the music and wiki repositories, which have no batch branches,
    // and keeps refusing every deletion; this owner decision (2026-11-16) is the game repository's.
    it.runIf(impl.label === "in-repo")("allows deleting a batch branch, and only by its exact name", () =>
      withRepo(impl, (repo) => {
        const deletion = `(delete) ${ZERO} refs/heads/codex/batch-20261116t232224z ${"a".repeat(40)}`;
        expect(prePush(impl, repo, deletion).status).toBe(0);
        const disguised = `refs/heads/codex/test-scope ${ZERO} refs/heads/codex/batch-20261116t232224z ${"a".repeat(40)}`;
        expect(prePush(impl, repo, disguised).status).not.toBe(0);
      }),
    );

    it("rejects pushing a foreign commit object made without hooks", () =>
      withRepo(impl, (repo, base) => {
        const foreign = commitTree(repo, "feat: foreign object", base, FOREIGN);
        gitOk(repo, ["update-ref", "refs/heads/codex/test-scope", foreign]);
        const line = `refs/heads/codex/test-scope ${foreign} refs/heads/codex/test-scope ${ZERO}`;
        const result = prePush(impl, repo, line);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/not owner-authored/u);
      }));

    it("does not re-scan history already on origin/main", () =>
      withRepo(
        impl,
        (repo) => {
          expect(tryCommit(repo, "feat: owner follow-up").status).toBe(0);
          const head = gitOk(repo, ["rev-parse", "HEAD"]);
          const line = `refs/heads/codex/test-scope ${head} refs/heads/codex/test-scope ${ZERO}`;
          const result = prePush(impl, repo, line);
          expect(result.status, result.stderr).toBe(0);
        },
        { baseIdentity: { name: "Old Bot", email: "old-bot@example.com" } },
      ));

    it("lets a new branch start from an older commit of main, but not from unrelated history", () =>
      withRepo(impl, (repo, base) => {
        expect(tryCommit(repo, "feat: built before main moved").status).toBe(0);
        const feature = gitOk(repo, ["rev-parse", "HEAD"]);
        const newerMain = commitTree(repo, "squash merge on main", base, GITHUB);
        gitOk(repo, ["update-ref", "refs/remotes/origin/main", newerMain]);
        const behind = prePush(
          impl,
          repo,
          `refs/heads/codex/test-scope ${feature} refs/heads/codex/test-scope ${ZERO}`,
        );
        expect(behind.status, behind.stderr).toBe(0);

        const tree = gitOk(repo, ["rev-parse", `${feature}^{tree}`]);
        const orphan = gitOk(repo, ["commit-tree", tree], { input: "unrelated root\n", env: identityEnv(OWNER) });
        gitOk(repo, ["update-ref", "refs/heads/codex/test-scope", orphan]);
        const unrelated = prePush(
          impl,
          repo,
          `refs/heads/codex/test-scope ${orphan} refs/heads/codex/test-scope ${ZERO}`,
        );
        expect(unrelated.status).not.toBe(0);
        expect(unrelated.stderr).toMatch(/shares no history with origin\/main/u);
      }));

    it("lets a published branch take main in by merge, checking only its own commits", () =>
      withRepo(impl, (repo, base) => {
        expect(tryCommit(repo, "feat: first push").status).toBe(0);
        const feature = gitOk(repo, ["rev-parse", "HEAD"]);
        const newerMain = commitTree(repo, "squash merge on main", base, GITHUB);
        gitOk(repo, ["update-ref", "refs/remotes/origin/main", newerMain]);
        gitOk(repo, ["merge", "--no-ff", "-m", "Merge main into the branch", newerMain]);
        const merged = gitOk(repo, ["rev-parse", "HEAD"]);
        const update = prePush(
          impl,
          repo,
          `refs/heads/codex/test-scope ${merged} refs/heads/codex/test-scope ${feature}`,
        );
        expect(update.status, update.stderr).toBe(0);

        const foreign = commitTree(repo, "not the owner", merged, FOREIGN);
        gitOk(repo, ["update-ref", "refs/heads/codex/test-scope", foreign]);
        const rejected = prePush(
          impl,
          repo,
          `refs/heads/codex/test-scope ${foreign} refs/heads/codex/test-scope ${feature}`,
        );
        expect(rejected.status).not.toBe(0);
        expect(rejected.stderr).toMatch(/not owner-authored/u);

        const rewind = prePush(
          impl,
          repo,
          `refs/heads/codex/test-scope ${feature} refs/heads/codex/test-scope ${merged}`,
        );
        expect(rewind.status).not.toBe(0);
        expect(rewind.stderr).toMatch(/non-fast-forward/u);
      }));

    it("refuses to run when the configured hooks path is not its own", () =>
      withRepo(impl, (repo) => {
        gitOk(repo, ["config", "--local", "core.hooksPath", path.join(repo, "elsewhere").replaceAll("\\", "/")]);
        const result = spawnSync(process.execPath, [impl.guard, "pre-commit"], { cwd: repo, encoding: "utf8" });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/hooks are not active/u);
      }));
  });
}
