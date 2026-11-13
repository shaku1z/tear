// `pnpm who` lists worktrees read-only. These tests pin the porcelain parser and the flags that
// tell an agent a worktree is unsafe to remove or abandoned.
import { describe, expect, it } from "vitest";
import { STALE_DAYS, classify, parseWorktreePorcelain } from "../../scripts/who.mjs";

const PORCELAIN = [
  "worktree C:/game/Tear",
  "HEAD 1111111111111111111111111111111111111111",
  "branch refs/heads/main",
  "",
  "worktree C:/game/worktrees/Tear-a",
  "HEAD 2222222222222222222222222222222222222222",
  "branch refs/heads/codex/a",
  "locked",
  "",
  "worktree C:/game/worktrees/Tear-export",
  "HEAD 3333333333333333333333333333333333333333",
  "detached",
  "",
  "worktree C:/game/worktrees/gone",
  "HEAD 4444444444444444444444444444444444444444",
  "branch refs/heads/codex/gone",
  "prunable gitdir file points to non-existent location",
  "",
].join("\r\n");

const NOW = Date.UTC(2026, 10, 13);
const base = {
  branch: "codex/a",
  detached: false,
  locked: false,
  prunable: false,
  nodeModulesLink: false,
  dirty: 0,
  ahead: 2,
  behind: 0,
  pr: { number: 1 },
  prLookup: "done",
  lastCommitMs: NOW - 3_600_000,
};

describe("pnpm who", () => {
  it("parses branch, detached, locked and prunable worktrees, with CRLF output", () => {
    const rows = parseWorktreePorcelain(PORCELAIN);
    expect(rows.map((row) => row.branch)).toEqual(["main", "codex/a", null, "codex/gone"]);
    expect(rows.map((row) => row.detached)).toEqual([false, false, true, false]);
    expect(rows.map((row) => row.locked)).toEqual([false, true, false, false]);
    expect(rows[3].prunable).toBe(true);
    expect(rows[1].path).toBe("C:/game/worktrees/Tear-a");
  });

  it("raises no flag for a fresh, clean branch with a pull request", () => {
    expect(classify(base, NOW)).toEqual([]);
  });

  it("flags work that a removal would lose or a junction a delete would follow", () => {
    expect(classify({ ...base, dirty: 3 }, NOW)).toEqual(["dirty"]);
    expect(classify({ ...base, nodeModulesLink: true }, NOW)).toEqual(["node_modules-link"]);
    expect(classify({ ...base, pr: null }, NOW)).toEqual(["no-pr"]);
    expect(classify({ ...base, pr: null, prLookup: "unavailable" }, NOW)).toEqual([]);
  });

  it("flags merged or empty branches, stale ones, and missing worktrees", () => {
    expect(classify({ ...base, ahead: 0 }, NOW)).toEqual(["merged-or-empty"]);
    expect(classify({ ...base, ahead: 0, branch: "main" }, NOW)).toEqual([]);
    expect(classify({ ...base, lastCommitMs: NOW - (STALE_DAYS + 1) * 86_400_000 }, NOW)).toEqual(["stale"]);
    expect(classify({ ...base, prunable: true }, NOW)).toEqual(["missing"]);
  });
});
