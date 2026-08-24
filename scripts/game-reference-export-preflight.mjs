import { spawnSync } from "node:child_process";

const FULL_SHA = /^[a-f0-9]{40}$/u;

function normalizedSha(value, label) {
  if (typeof value !== "string" || !FULL_SHA.test(value.toLowerCase())) throw new TypeError(`${label} must be a full 40-character Git SHA`);
  return value.toLowerCase();
}

/** Pure preflight used before Vite or any game source module is loaded. */
export function assertCleanSourceIdentity(input) {
  const headSha = normalizedSha(input.headSha, "headSha");
  const requestedSha = normalizedSha(input.requestedSha, "requestedSha");
  if (typeof input.status !== "string" || input.status.length > 0) throw new Error("game reference export requires a clean worktree");
  if (requestedSha !== headSha) throw new Error(`game reference source SHA must equal HEAD ${headSha}`);
  return headSha;
}

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

/** Reads and validates repository identity without touching the Vite graph. */
export function readCleanSourceIdentity(root, requestedSha) {
  const headSha = git(root, "rev-parse", "HEAD");
  const status = git(root, "status", "--porcelain=v1", "--untracked-files=all");
  return assertCleanSourceIdentity({ headSha, requestedSha: requestedSha ?? headSha, status });
}
