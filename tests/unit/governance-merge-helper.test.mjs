// The owner-safe merge helper (scripts/governance/owner-safe-pr-merge.mjs): the cases the shared skill
// tested, plus each refusal that guards a merge. No case calls GitHub.
import { describe, expect, it } from "vitest";
import {
  assertCleanPullRequest,
  assertHeadMatches,
  assertMergePreconditions,
  buildMergeArgs,
  hasSuccessfulRequiredCheck,
  requiredCheckState,
  isOwnerAuthoredPullRequest,
  isWikiSyncException,
  main,
  MERGE_PRECONDITIONS,
  parseArgs,
} from "../../scripts/governance/owner-safe-pr-merge.mjs";

const HEAD = "a".repeat(40);
const SOURCE = "b".repeat(40);
const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";
const OWNER_IDENTITY = { name: "shaku1z", email: "shatheartboy@gmail.com" };
const WIKI_FILES = [
  "src/data/game-reference.v1.json",
  "src/data/game-reference.v1.receipt.json",
  "src/data/wiki-terminology.json",
];
const TEAR = { id: "tear", slug: "shaku1z/tear" };
const GOOD_ARGS = [
  "--repo",
  "C:/Users/realm/Desktop/game/Tear",
  "--pr",
  "12",
  "--match-head-commit",
  HEAD,
  "--subject",
  "Clean subject",
  "--body",
  "Scope and evidence for this merge.",
];

function botCommit() {
  return {
    author: { login: "github-actions[bot]", type: "Bot", name: null },
    committer: { login: "github-actions[bot]", type: "Bot", name: "github-actions[bot]" },
    commit: {
      author: { name: "github-actions[bot]", email: BOT_EMAIL },
      committer: { name: "github-actions[bot]", email: BOT_EMAIL },
      message: `sync(wiki): game-reference ${SOURCE}`,
    },
  };
}

function wikiPullRequest(overrides = {}) {
  return {
    author: { login: "app/github-actions", is_bot: true },
    headRepositoryOwner: { login: "shaku1z" },
    headRepository: { name: "tear-wiki" },
    statusCheckRollup: [{ name: "check", conclusion: "SUCCESS" }],
    ...overrides,
  };
}

function ownerPullRequest(overrides = {}) {
  return {
    state: "OPEN",
    baseRefName: "main",
    headRefName: "codex/x",
    headRefOid: HEAD,
    author: { login: "shaku1z", is_bot: false },
    headRepositoryOwner: { login: "shaku1z" },
    headRepository: { name: "tear" },
    statusCheckRollup: [{ name: "check", conclusion: "SUCCESS" }],
    ...overrides,
  };
}

const ownerCommit = { commit: { author: OWNER_IDENTITY, committer: OWNER_IDENTITY, message: "feat: x" } };

function clean(prView, commits = [ownerCommit]) {
  return assertCleanPullRequest({
    policy: TEAR,
    prView,
    changedFiles: ["a.ts"],
    commits,
    authenticatedLogin: "shaku1z",
  });
}

describe("owner-safe merge helper", () => {
  it("builds the exact owner-authored squash command, with no auto or admin merge", () => {
    const args = buildMergeArgs({ pr: 22, slug: "shaku1z/tear", subject: "s", body: "b", matchHeadCommit: HEAD });
    expect(args).toEqual([
      "pr",
      "merge",
      "22",
      "--repo",
      "shaku1z/tear",
      "--squash",
      "--author-email",
      "shatheartboy@gmail.com",
      "--subject",
      "s",
      "--body",
      "b",
      "--match-head-commit",
      HEAD,
    ]);
    expect(args).not.toContain("--auto");
    expect(args).not.toContain("--admin");
  });

  it("refuses without the explicit authorization flag", () => {
    expect(() => parseArgs(GOOD_ARGS)).toThrow(/--authorize-owner-merge is required/u);
    expect(main(GOOD_ARGS)).toBe(1);
    expect(parseArgs([...GOOD_ARGS, "--authorize-owner-merge"]).pr).toBe(12);
  });

  it("refuses an inexact head OID, a multi-line subject, an attributed body and a thin body", () => {
    const withFlag = (replace) => {
      const args = [...GOOD_ARGS, "--authorize-owner-merge"];
      for (const [flag, value] of Object.entries(replace)) args[args.indexOf(flag) + 1] = value;
      return args;
    };
    expect(() => parseArgs(withFlag({ "--match-head-commit": "abc123" }))).toThrow(/40-character/u);
    expect(() => parseArgs(withFlag({ "--subject": "one\ntwo" }))).toThrow(/one non-empty line/u);
    expect(() => parseArgs(withFlag({ "--body": "Fine body text.\n\nCo-authored-by: A <a@b.c>" }))).toThrow(
      /attribution/u,
    );
    expect(() => parseArgs(withFlag({ "--body": "short" }))).toThrow(/scope and evidence/u);
  });

  it("refuses when the pull request head moved since review", () => {
    expect(() => assertHeadMatches({ headRefOid: "c".repeat(40) }, HEAD)).toThrow(/PR head changed/u);
    expect(() => assertHeadMatches({ headRefOid: HEAD.toUpperCase() }, HEAD)).not.toThrow();
  });

  it("reads where the required check stands, so the batch and the merge judge it the same way", () => {
    expect(requiredCheckState([{ name: "check", conclusion: "SUCCESS" }])).toBe("success");
    expect(requiredCheckState([{ context: "check", state: "SUCCESS" }])).toBe("success");
    expect(requiredCheckState([{ name: "check", conclusion: "SKIPPED" }])).toBe("skipped");
    expect(requiredCheckState([{ name: "unit", conclusion: "SUCCESS" }])).toBe("missing");
    expect(requiredCheckState(undefined)).toBe("missing");
    expect(requiredCheckState([{ name: "check", status: "QUEUED", conclusion: "" }])).toBe("pending");
    expect(requiredCheckState([{ context: "check", state: "PENDING" }])).toBe("pending");
    expect(requiredCheckState([{ name: "check", conclusion: "FAILURE" }])).toBe("failed");
    expect(requiredCheckState([{ name: "check", conclusion: "CANCELLED" }])).toBe("failed");
  });

  it("refuses unless the required check is green", () => {
    expect(hasSuccessfulRequiredCheck([{ name: "check", conclusion: "SUCCESS" }])).toBe(true);
    expect(hasSuccessfulRequiredCheck([{ context: "check", state: "SUCCESS" }])).toBe(true);
    for (const rollup of [
      [],
      [{ name: "check", conclusion: "FAILURE" }],
      [{ name: "lint", conclusion: "SUCCESS" }],
      null,
    ])
      expect(hasSuccessfulRequiredCheck(rollup)).toBe(false);
    expect(() => clean(ownerPullRequest({ statusCheckRollup: [{ name: "check", conclusion: "PENDING" }] }))).toThrow(
      /not SUCCESS/u,
    );
  });

  it("accepts an open owner pull request into main and refuses the other shapes", () => {
    expect(clean(ownerPullRequest())).toEqual({ wikiSyncException: false });
    expect(() => clean(ownerPullRequest({ state: "MERGED" }))).toThrow(/must be open/u);
    expect(() => clean(ownerPullRequest({ baseRefName: "codex/other" }))).toThrow(/base must be main/u);
    expect(() => clean(ownerPullRequest({ headRepositoryOwner: { login: "someone" } }))).toThrow(/forks/u);
    expect(() => clean(ownerPullRequest({ author: { login: "factory-droid", is_bot: false } }))).toThrow(
      /authored by shaku1z/u,
    );
    const foreign = { commit: { author: { name: "Bot", email: "b@x" }, committer: OWNER_IDENTITY, message: "x" } };
    expect(() => clean(ownerPullRequest(), [foreign])).toThrow(/non-owner commits/u);
  });

  it("accepts only the exact authenticated wiki sync bot exception", () => {
    const base = {
      policyId: "tear-wiki",
      headRefName: `codex/sync-game-reference-${SOURCE}`,
      changedFiles: WIKI_FILES,
      commits: [botCommit()],
      prView: wikiPullRequest(),
      authenticatedLogin: "shaku1z",
    };
    expect(isWikiSyncException(base)).toBe(true);
    const wrongEmail = { ...botCommit(), commit: { ...botCommit().commit, author: { name: "x", email: "b@x" } } };
    for (const [label, overrides] of [
      ["wrong repository policy", { policyId: "tear" }],
      ["wrong authenticated account", { authenticatedLogin: "factory-droid" }],
      ["wrong PR author", { prView: wikiPullRequest({ author: { login: "github-actions[bot]", is_bot: true } }) }],
      ["failed check", { prView: wikiPullRequest({ statusCheckRollup: [{ name: "check", conclusion: "FAILURE" }] }) }],
      ["wrong head repository", { prView: wikiPullRequest({ headRepository: { name: "forked-wiki" } }) }],
      ["extra changed file", { changedFiles: [...WIKI_FILES, "README.md"] }],
      ["wrong bot email", { commits: [wrongEmail] }],
    ])
      expect(isWikiSyncException({ ...base, ...overrides }), label).toBe(false);
  });

  it("runs further merge preconditions in order and refuses with the first one that throws", () => {
    expect(MERGE_PRECONDITIONS.map((entry) => entry.id)).toEqual(["merge-ready"]);
    // The merge-ready rule applies to the game repository only.
    expect(() => assertMergePreconditions({ pr: 12, policy: { id: "tear-wiki" } })).not.toThrow();
    const seen = [];
    const preconditions = [
      { id: "first", check: (context) => seen.push(`first:${context.pr}`) },
      {
        id: "main-check-green",
        check: () => {
          throw new Error("main's latest check is red");
        },
      },
      { id: "never-reached", check: () => seen.push("never") },
    ];
    expect(() => assertMergePreconditions({ pr: 12 }, preconditions)).toThrow(
      /main-check-green: main's latest check is red/u,
    );
    expect(seen).toEqual(["first:12"]);
  });

  it("does not let owner commits hide a bot-authored pull request", () => {
    expect(isOwnerAuthoredPullRequest({ author: { login: "shaku1z", is_bot: true } }, "shaku1z")).toBe(false);
    expect(isOwnerAuthoredPullRequest({ author: { login: "shaku1z", isBot: true } }, "shaku1z")).toBe(false);
    expect(isOwnerAuthoredPullRequest({ author: { login: "shaku1z", is_bot: false } }, "shaku1z")).toBe(true);
    expect(isOwnerAuthoredPullRequest({ author: { login: "factory-droid", is_bot: false } }, "shaku1z")).toBe(false);
  });
});
