// The containment check must fail on the bad case each rule exists for. The words here are stand-ins:
// the real list is data in config/containment.json, and the rules do not care which words it holds.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONFIG_PATH,
  countThemedWords,
  loweredConfig,
  measure,
  plainNameProblems,
  toolProblems,
  validateConfig,
  worktreeProblems,
} from "../../scripts/check-containment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const words = new Set(["grotto", "citadel"]);
const rule = { words: [...words], paths: ["old/grotto.ts"], files: { "src/old.ts": 2 } };

describe("plain names", () => {
  it("counts a listed word as a whole word or one part of a name, in any case", () => {
    expect(countThemedWords("the Grotto, bossCitadel, GROTTO_MODE, grotto-view, CitadelHTTPGrotto", words)).toBe(6);
  });

  it("does not count a longer word that contains a listed one", () => {
    expect(countThemedWords("grottos citadels ungrotto Grottoed", words)).toBe(0);
  });

  it("counts a version-numbered name as a word or a part, and only with its own digits", () => {
    const versions = new Set(["v2", "grotto"]);
    expect(countThemedWords("v2 ghostV2 tear-ghost-v2 GHOST_V2 storeV2Index profile_v2", versions)).toBe(6);
    expect(countThemedWords("v3 v21 v2x Fqv2vj uv2 v", versions)).toBe(0);
    expect(countThemedWords("grotto2 GROTTO3", versions)).toBe(2);
  });

  it("refuses a listed word in a new path and allows a baselined path", () => {
    const problems = plainNameProblems(
      ["old/grotto.ts", "src/app/citadel/menu.ts", "src/fine.ts"],
      new Map(),
      rule,
      words,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("path src/app/citadel/menu.ts");
  });

  it("refuses a new file with a listed word and a file over its baseline, and allows one at its baseline", () => {
    const counts = new Map([
      ["src/old.ts", 2],
      ["src/new.ts", 1],
    ]);
    const problems = plainNameProblems([], counts, rule, words);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("src/new.ts: 1 themed words, 0 allowed");
    expect(plainNameProblems([], new Map([["src/old.ts", 3]]), rule, words)).toHaveLength(1);
  });
});

describe("tools and worktrees", () => {
  it("refuses more package scripts or script files than the baseline", () => {
    const baseline = { packageScripts: 10, scriptFiles: 5 };
    expect(toolProblems({ packageScripts: 10, scriptFiles: 5 }, baseline)).toEqual([]);
    expect(toolProblems({ packageScripts: 11, scriptFiles: 6 }, baseline)).toHaveLength(2);
  });

  it("refuses more worktrees or local branches than the limit", () => {
    const limits = { maxWorktrees: 3, maxLocalBranches: 4 };
    expect(worktreeProblems({ worktrees: 3, localBranches: 4 }, limits)).toEqual([]);
    expect(worktreeProblems({ worktrees: 4, localBranches: 4 }, limits)[0]).toBe("4 worktrees, limit 3");
    expect(worktreeProblems({ worktrees: 1, localBranches: 9 }, limits)[0]).toBe("9 local branches, limit 4");
  });
});

describe("baselines", () => {
  const config = { plainNames: rule, tools: { mode: "enforce", packageScripts: 10, scriptFiles: 5 } };
  const tracked = ["old/grotto.ts", "new/citadel.ts"];
  const counts = new Map([
    ["src/old.ts", 1],
    ["src/new.ts", 4],
  ]);
  const tools = { packageScripts: 12, scriptFiles: 4 };

  it("only lowers: no new path, no new file, no higher number", () => {
    const next = loweredConfig(config, tracked, counts, tools, words);
    expect(next.plainNames.paths).toEqual(["old/grotto.ts"]);
    expect(next.plainNames.files).toEqual({ "src/old.ts": 1 });
    expect(next.tools).toMatchObject({ packageScripts: 10, scriptFiles: 4 });
  });

  it("raises only the one entry named", () => {
    expect(loweredConfig(config, tracked, counts, tools, words, "src/new.ts").plainNames.files).toEqual({
      "src/new.ts": 4,
      "src/old.ts": 1,
    });
    expect(loweredConfig(config, tracked, counts, tools, words, "new/citadel.ts").plainNames.paths).toEqual(tracked);
    expect(loweredConfig(config, tracked, counts, tools, words, "tools").tools.packageScripts).toBe(12);
  });
});

describe("the committed configuration", () => {
  const config = validateConfig(JSON.parse(fs.readFileSync(path.join(root, CONFIG_PATH), "utf8")));

  it("rejects an unknown mode", () => {
    expect(() => validateConfig({ ...config, tools: { ...config.tools, mode: "sometimes" } })).toThrow(/tools\.mode/u);
  });

  it("enforces plain names, and the repository passes it", () => {
    expect(config.plainNames.mode).toBe("enforce");
    const measured = measure(root, config);
    expect(plainNameProblems(measured.trackedPaths, measured.counts, config.plainNames, measured.words)).toEqual([]);
  });
});
