// pnpm test:related (scripts/test-related.mjs) picks the tests a change can break, including the ones
// vitest's import graph cannot see. #418 went red on main after a green local run: it moved
// src/app/replay/browser-replay-clip-export.ts off the replay format, and tests/unit/replay-record.test.ts
// pinned that path in a list without importing it.
import { describe, expect, it } from "vitest";
import { folders, nodeTestFiles, relatedTests, selectTests } from "../../scripts/test-related.mjs";

/** selectTests over in-memory test files, the way relatedTests calls it over git grep's hits. */
function pick(changed, files, scanners = []) {
  const tests = Object.keys(files);
  return selectTests({
    changed,
    tests,
    candidates: (needle) => tests.filter((file) => files[file].includes(needle)),
    textOf: (file) => files[file],
    scanners,
  });
}

describe("test:related", () => {
  it("picks a test that pins a changed file in a list and imports nothing (the #418 miss)", () => {
    const picked = pick(["src/app/replay/browser-replay-clip-export.ts"], {
      "tests/unit/replay-record.test.ts": `const REPLAY_FORMAT_FILES = [\n  "src/app/replay/browser-replay-clip-export.ts",\n];`,
      "tests/unit/unrelated.test.ts": `import { x } from "../../src/app/other";`,
    });
    expect([...picked.keys()]).toEqual(["tests/unit/replay-record.test.ts"]);
    expect(picked.get("tests/unit/replay-record.test.ts")).toEqual([
      "names src/app/replay/browser-replay-clip-export.ts",
    ]);
  });

  it("picks a test naming a deleted file without its extension, and not one naming a longer name", () => {
    const picked = pick(["src/app/replay/watch.ts"], {
      "tests/unit/a.test.ts": `expect(existsSync("src/app/replay/watch")).toBe(false);`,
      "tests/unit/b.test.ts": `const file = "src/app/replay/watch-screen.ts";`,
    });
    expect([...picked.keys()]).toEqual(["tests/unit/a.test.ts"]);
    const readme = pick(["README.md"], {
      "tests/unit/root.test.ts": `readFileSync(join(root, "README.md"))`,
      "tests/unit/docs.test.ts": `readFileSync("docs/README.md")`,
    });
    expect([...readme.keys()]).toEqual(["tests/unit/root.test.ts"]);
  });

  it("picks a test that names a folder holding the change as a whole string", () => {
    const picked = pick(["src/app/replay/watch.ts"], {
      "tests/unit/reads.test.ts": `git(["grep", "-l", "x", "--", "src/app/replay/"]);`,
      "tests/unit/sibling.test.ts": `readdirSync("src/app/replay-tools");`,
    });
    expect([...picked.keys()]).toEqual(["tests/unit/reads.test.ts"]);
    expect(folders("src/app/replay/watch.ts")).toEqual(["src/app/replay", "src/app", "src"]);
  });

  it("adds the tests that read the tree with git to any change, and picks a changed test itself", () => {
    const files = { "tests/unit/scan.test.mjs": "", "tests/unit/self.test.ts": "" };
    expect([...pick(["docs/README.md"], files, ["tests/unit/scan.test.mjs"]).keys()]).toEqual([
      "tests/unit/scan.test.mjs",
    ]);
    expect([...pick([], files, ["tests/unit/scan.test.mjs"]).keys()]).toEqual([]);
    expect(
      pick(["tests/unit/self.test.ts", "tests/unit/not-collected.test.ts"], files).get("tests/unit/self.test.ts"),
    ).toEqual(["changed"]);
  });

  it("reads the node:test files from the commands that run them", () => {
    expect(
      nodeTestFiles([
        "node --test --test-concurrency=1 tests/a.test.mjs tests/parity/b.test.mjs && node scripts/x.mjs",
        "node --test wiki/tests/wiki.test.mjs",
        "vitest run tests/unit/c.test.ts",
      ]),
    ).toEqual(["tests/a.test.mjs", "tests/parity/b.test.mjs"]);
  });

  it("in this repository, finds the tree scanners and the node:test files for a source change", () => {
    const { vitest, node, picked } = relatedTests(["src/app/replay/watch.ts"]);
    expect(vitest).toContain("tests/unit/replay-record.test.ts");
    expect(picked.get("tests/unit/replay-record.test.ts")).toContain("reads the tree with git");
    expect(vitest).toContain("tests/unit/release-developer-code.test.mjs");
    expect(node).toContain("tests/source-architecture.test.mjs");
    for (const file of [...vitest, ...node]) expect(file).toMatch(/^tests\/.+\.test\.(?:ts|mjs)$/u);
  });
});
