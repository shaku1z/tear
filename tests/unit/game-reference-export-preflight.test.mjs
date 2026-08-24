import { describe, expect, it } from "vitest";

import { assertCleanSourceIdentity } from "../../scripts/game-reference-export-preflight.mjs";

describe("game reference export preflight", () => {
  it("accepts only a clean tree attributed to the exact HEAD SHA", () => {
    const sha = "a".repeat(40);
    expect(assertCleanSourceIdentity({ headSha: sha, requestedSha: sha, status: "" })).toBe(sha);
  });

  it("rejects tracked or untracked worktree changes before source loading", () => {
    const sha = "a".repeat(40);
    expect(() => assertCleanSourceIdentity({ headSha: sha, requestedSha: sha, status: " M src/gameplay/weapons.ts" })).toThrow(/clean worktree/u);
    expect(() => assertCleanSourceIdentity({ headSha: sha, requestedSha: sha, status: "?? generated.json" })).toThrow(/clean worktree/u);
  });

  it("rejects abbreviated or mismatched requested SHAs", () => {
    const sha = "a".repeat(40);
    expect(() => assertCleanSourceIdentity({ headSha: sha, requestedSha: "a".repeat(7), status: "" })).toThrow(/full 40-character/u);
    expect(() => assertCleanSourceIdentity({ headSha: sha, requestedSha: "b".repeat(40), status: "" })).toThrow(/equal HEAD/u);
  });
});
