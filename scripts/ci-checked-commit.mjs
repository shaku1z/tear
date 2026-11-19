// Validate's checked commit (.github/actions/checked-commit): a pull request's head merged with the one
// main commit the scope job picked, made with a fixed identity, message and date so every job's merge is
// the identical commit. A job whose checkout is not the commit the scope job recorded is refused. The
// action runs `node scripts/ci-checked-commit.mjs` with MAIN and EXPECTED; the tests call main() with a
// recording git, so they start no process.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Runs git in the checkout and returns its trimmed output; throws when git fails. */
function realGit(args, env = {}) {
  return execFileSync("git", args, { encoding: "utf8", env: { ...process.env, ...env } }).trim();
}

/**
 * Merges MAIN into the checked-out change (when MAIN is set), checks the result against EXPECTED (when
 * set), and records the commit for the later steps. Returns the exit code.
 * @param {Record<string, string | undefined>} env MAIN, EXPECTED, GITHUB_OUTPUT, GITHUB_ENV
 * @param {{ git?: (args: string[], env?: Record<string, string>) => string, log?: (line: string) => void,
 *   append?: (file: string, text: string) => void }} [io]
 */
export function main(env = process.env, { git = realGit, log = console.log, append = appendFileSync } = {}) {
  const mainCommit = env.MAIN ?? "";
  const expected = env.EXPECTED ?? "";
  if (mainCommit !== "") {
    git(["fetch", "--quiet", "origin", `+${mainCommit}:refs/remotes/origin/main`]);
    // The merge takes main's commit date, so it does not depend on when or where the job ran.
    const date = git(["log", "-1", "--format=%cI", mainCommit]);
    try {
      git(
        [
          "-c",
          "user.name=validate",
          "-c",
          "user.email=validate@invalid",
          "merge",
          "--quiet",
          "--no-edit",
          "-m",
          `Validate: merge main ${mainCommit}`,
          mainCommit,
        ],
        { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      );
    } catch {
      log("::error::This change does not merge cleanly with current main. Bring it up to date.");
      return 1;
    }
  }
  const commit = git(["rev-parse", "HEAD"]);
  if (expected !== "" && commit !== expected) {
    log(`::error::This job checked out ${commit}, not the commit the scope job recorded (${expected}).`);
    return 1;
  }
  append(env.GITHUB_OUTPUT ?? "", `commit=${commit}\n`);
  // Every later step checks and builds this commit, not GitHub's GITHUB_SHA (its own merge ref).
  append(env.GITHUB_ENV ?? "", `TEAR_RELEASE_SHA=${commit}\nTEAR_BUILD_GIT_SHA=${commit}\n`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
