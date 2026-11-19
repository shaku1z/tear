// eslint-suppressions.json is a shrinking ratchet for one rule only: the sites `tear/one-record-guard` found when
// it arrived, each to be converted to src/domain/records.ts. It may name no other rule, and nothing may let a
// stale entry pass: ESLint exits 2 on an entry that no longer matches, and scripts/lint.mjs refuses the options
// that would hide or grow it. The file, this test and its row in docs/REPOSITORY_MAP.md go when the last site does.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { REFUSED_OPTIONS } from "../../scripts/lint.mjs";

const root = resolve(import.meta.dirname, "../..");
const suppressions = JSON.parse(readFileSync(resolve(root, "eslint-suppressions.json"), "utf8"));
const checks = JSON.parse(readFileSync(resolve(root, "config/checks.json"), "utf8"));

describe("eslint-suppressions.json", () => {
  it("suppresses tear/one-record-guard only, in src/ where the rule runs", () => {
    const entries = Object.entries(suppressions);
    expect(entries.length).toBeGreaterThan(0);
    for (const [file, rules] of entries) {
      expect(file).toMatch(/^src\/.+\.ts$/u);
      expect(Object.keys(rules)).toEqual(["tear/one-record-guard"]);
    }
  });

  it("is checked by every lint run: no configured check passes an option that hides a stale entry", () => {
    const runs = [];
    const walk = (value) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object")
        for (const [key, entry] of Object.entries(value)) {
          if (key === "run") runs.push(String(entry));
          else walk(entry);
        }
    };
    walk(checks);
    expect(runs.some((run) => run === "node scripts/lint.mjs")).toBe(true);
    for (const run of runs) for (const option of REFUSED_OPTIONS) expect(run).not.toContain(option);
  });

  // The ratchet relies on how ESLint judges staleness. A full lint (`pnpm lint`, CI's static.lint) fails on an
  // entry that no longer matches. `lint.mjs --changed` lints named files only, so an entry for a file it did not
  // lint is left alone; staleness is judged once, by the full lint. Pinned against the real CLI on a tiny fixture.
  describe("how ESLint judges a stale entry", { timeout: 60_000 }, () => {
    const eslint = resolve(root, "node_modules/eslint/bin/eslint.js");
    let fixture = "";
    const run = (...args) => spawnSync(process.execPath, [eslint, ...args], { cwd: fixture, encoding: "utf8" });

    beforeAll(() => {
      fixture = mkdtempSync(join(tmpdir(), "tear-eslint-suppressions-"));
      writeFileSync(
        join(fixture, "eslint.config.mjs"),
        'export default [{ files: ["**/*.js"], rules: { "no-var": "error" } }];\n',
      );
      writeFileSync(join(fixture, "fixed.js"), "var fixed = 1;\nexport { fixed };\n");
      writeFileSync(join(fixture, "other.js"), "var other = 2;\nexport { other };\n");
      expect(run(".", "--suppress-all").status).toBe(0);
      writeFileSync(join(fixture, "fixed.js"), "const fixed = 1;\nexport { fixed };\n");
    });
    afterAll(() => rmSync(fixture, { recursive: true, force: true }));

    it("a full lint fails on the entry the fix left behind", () => {
      const result = run(".");
      expect(result.status).toBe(2);
      expect(result.stdout + result.stderr).toContain("suppressions left that do not occur anymore");
    });

    it("a lint of other files only (the --changed path) does not fail on it", () => {
      expect(run("other.js", "--no-warn-ignored").status).toBe(0);
    });
  });

  it.each(REFUSED_OPTIONS)("scripts/lint.mjs refuses %s before ESLint starts", (option) => {
    const result = spawnSync(process.execPath, ["scripts/lint.mjs", option], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("eslint-suppressions.json");
  });
});
