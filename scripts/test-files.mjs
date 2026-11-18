// The test files a vitest config may collect: the entries in git's index that match its globs.
// The index holds every tracked file plus every file staged with `git add` or `git add -N`, so a
// new test runs once it is added, and a file that is only on disk (a stale copy left in a
// worktree, a scratch probe) never runs.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const GLOB_CHARACTERS = /[[\]{}()!*?+@]/u;

function realGit(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Index entries matching `globs` (vitest glob syntax, relative to the repository root). Vitest
 * reads each entry back as a glob, so a name with a glob character is refused rather than
 * matched loosely.
 */
export function indexedTestFiles(globs, { git = realGit } = {}) {
  const files = git(["ls-files", "-z", "--", ...globs.map((glob) => `:(glob)${glob}`)])
    .split("\0")
    .filter(Boolean);
  const unsafe = files.filter((file) => GLOB_CHARACTERS.test(file));
  if (unsafe.length > 0)
    throw new Error(`Test file names must not contain glob characters; rename: ${unsafe.join(", ")}`);
  return files;
}
