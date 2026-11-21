// The gate: main's copy judges a change (judgedChecks), and a change to a gate file waits for review.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { posix, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DESIGN_CHECK_LABELS } from "../../scripts/design-check.mjs";
import { checkedScripts, GATE_LABEL, gateFilesIn, loadGateList } from "../../scripts/gate-files.mjs";
import { decide, FIX_LABEL } from "../../scripts/merge-ready.mjs";
import { judgedChecks, loadChecks } from "../../scripts/run-checks.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/gu, "\n");
const list = loadGateList();

/** Every file under `folder`, as repository paths. */
function walk(folder) {
  return readdirSync(resolve(root, folder)).flatMap((name) => {
    const path = `${folder}/${name}`;
    return statSync(resolve(root, path)).isDirectory() ? walk(path) : [path];
  });
}

const config = (groups, gate = Object.keys(groups)) => ({ gate, groups });
const check = (id, run) => ({ id, run });

describe("the checks that judge a change (judgedChecks)", () => {
  const main = config({ unit: [check("vitest", "node vitest run"), check("lint", "node lint")] });

  it("runs every check of main's list with main's definition, whatever the change says", () => {
    const change = config({ unit: [check("vitest", "node vitest run --passWithNoTests")] });
    expect(judgedChecks(main, change).groups.unit).toEqual(main.groups.unit);
  });

  it("adds a check that only the change lists, with the change's definition", () => {
    const change = config({ unit: [...main.groups.unit, check("types", "node tsc")] });
    expect(judgedChecks(main, change).groups.unit.map((entry) => entry.id)).toEqual(["vitest", "lint", "types"]);
  });

  it("judges a renamed id as main's check, still run, plus a new one", () => {
    const change = config({ unit: [check("vitest-all", "node vitest run"), check("lint", "node lint")] });
    const judged = judgedChecks(main, change).groups.unit;
    expect(judged.map((entry) => entry.id)).toEqual(["vitest", "lint", "vitest-all"]);
    expect(judged[0]).toEqual(main.groups.unit[0]);
  });

  it("adds a gate group that only the change has, and keeps main's groups when the change drops them", () => {
    const change = config({ fast: [check("format", "node format")] });
    const judged = judgedChecks(main, change);
    expect(judged.gate).toEqual(["unit", "fast"]);
    expect(judged.groups.unit).toEqual(main.groups.unit);
  });

  it("is main's own list when the change adds nothing", () => {
    const own = loadChecks();
    expect(judgedChecks(own, own)).toEqual(own);
  });
});

describe("the gate file list (config/gate-files.json)", () => {
  const candidates = [
    ...["config", "scripts", ".github"].flatMap((folder) => walk(folder)),
    "eslint.config.mjs",
    ".prettierrc.json",
    ".prettierignore",
  ];

  it("names only files that exist, each with a reason", () => {
    for (const entry of list.files) {
      expect(entry.why, entry.path).toMatch(/\S/u);
      const exists = /[/-]$/u.test(entry.path)
        ? candidates.some((file) => file.startsWith(entry.path))
        : existsSync(resolve(root, entry.path));
      expect(exists, entry.path).toBe(true);
    }
  });

  it("copies from main only gate files, which exist, and the runner's imports with it", () => {
    for (const path of list.fromMain) {
      expect(gateFilesIn(list, [path]), path).toEqual([path]);
      expect(existsSync(resolve(root, path)), path).toBe(true);
    }
    for (const path of list.fromMain.filter((file) => file.endsWith(".mjs")))
      for (const [, imported] of read(path).matchAll(/from "\.\/([\w-]+\.mjs)"/gu))
        expect(list.fromMain, `${path} imports ${imported}`).toContain(`scripts/${imported}`);
  });

  it("covers every script and action the Validate workflow runs", () => {
    const workflow = read(".github/workflows/ci.yml");
    const run = [
      ...[...workflow.matchAll(/node (scripts\/[\w./-]+\.mjs)/gu)].map((match) => match[1]),
      ...[...workflow.matchAll(/\$TEAR_GATE\/([\w-]+\.mjs)/gu)].map((match) => `scripts/${match[1]}`),
      ...[...workflow.matchAll(/uses: \.\/(\.github\/actions\/[\w-]+)/gu)].map((match) => `${match[1]}/action.yml`),
    ];
    expect(run.length).toBeGreaterThan(5);
    expect([...new Set(run)].filter((file) => gateFilesIn(list, [file]).length === 0)).toEqual([]);
  });

  it("matches exact paths exactly and prefixes by start", () => {
    expect(
      gateFilesIn(list, [
        "config/checks.json",
        "config/checks.json.bak",
        "scripts/ci-verdict.mjs",
        ".github/workflows/nightly.yml",
        "tests/unit/run-checks.test.mjs",
        "src/app/main.ts",
      ]),
    ).toEqual(["config/checks.json", "scripts/ci-verdict.mjs", ".github/workflows/nightly.yml"]);
  });
});

describe("the scripts the checks reach (checkedScripts)", () => {
  const reached = checkedScripts(loadChecks());

  it("makes every script a config/checks.json command reaches a gate file", () => {
    expect(reached.size).toBeGreaterThan(20);
    expect([...reached.keys()].filter((file) => gateFilesIn(list, [file]).length === 0)).toEqual([]);
  });

  it("reaches the checkers' own modules, which the named configs alone missed", () => {
    expect(reached.get("scripts/check-source-architecture.mjs")).toContain(
      "node scripts/check-source-architecture.mjs",
    );
    expect(reached.get("scripts/architecture/evaluate.mjs")).toBe("imported by scripts/architecture/analyze.mjs");
    expect(reached.has("scripts/check-code-budget.mjs")).toBe(true);
    expect(reached.has("scripts/check-bundle-budget.mjs")).toBe(true);
  });

  it("sees every relative import of a reached script that stays in scripts/", () => {
    const anyImport = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["'](\.\.?\/[^"']+)["']/gu;
    const missed = [...reached.keys()].flatMap((file) =>
      [...read(file).matchAll(anyImport)]
        .map((match) => posix.join(posix.dirname(file), match[1]))
        .filter((target) => target.startsWith("scripts/") && !target.endsWith(".json") && !reached.has(target))
        .map((target) => `${file} -> ${target}`),
    );
    expect(missed).toEqual([]);
  });

  it("follows imports to the end, inside scripts/ only, and leaves tests alone", () => {
    const files = {
      "scripts/check-a.mjs": 'import { b } from "./lib/b.mjs";\nimport x from "../src/x.mjs";',
      "scripts/lib/b.mjs": 'const c = await import("./c.mjs");\nconst d = require("../d.cjs");',
      "scripts/lib/c.mjs": "export const c = 1;",
      "scripts/d.cjs": "module.exports = 1;",
    };
    const checks = {
      gate: ["fast"],
      groups: { fast: [check("a", "node scripts/check-a.mjs --changed"), check("t", "node tests/browser-x.js")] },
    };
    const found = checkedScripts(checks, (file) => {
      if (files[file] === undefined) throw new Error(`no ${file}`);
      return files[file];
    });
    expect([...found.keys()]).toEqual([
      "scripts/check-a.mjs",
      "scripts/lib/b.mjs",
      "scripts/lib/c.mjs",
      "scripts/d.cjs",
    ]);
    expect(found.get("scripts/lib/c.mjs")).toBe("imported by scripts/lib/b.mjs");
  });

  it("adds reached scripts to the list read beside its checks, and only those the list does not name", () => {
    const added = list.files.filter((entry) => entry.reached === true).map((entry) => entry.path);
    expect(added).toContain("scripts/architecture/evaluate.mjs");
    expect(added).not.toContain("scripts/run-checks.mjs");
    expect(JSON.parse(read("config/gate-files.json")).files.some((entry) => entry.reached)).toBe(false);
  });
});

describe("the config files the checks' tools read (TOOL_CONFIGS)", () => {
  const reached = checkedScripts(loadChecks());

  it("reaches the vitest configs, every tsconfig through references and extends, and what they import", () => {
    expect(reached.get("vitest.config.ts")).toContain("read by default by the check");
    expect(reached.get("vitest.endurance.config.ts")).toContain("--config vitest.endurance.config.ts");
    expect(reached.get("tsconfig.json")).toContain("tsc -b");
    for (const project of ["tsconfig.app.json", "tsconfig.node.json", "tsconfig.test.json"])
      expect(reached.get(project), project).toBe("referenced by tsconfig.json");
    expect(reached.get("scripts/test-files.mjs")).toBe("imported by vitest.config.ts");
  });

  it("makes every root config of vitest, vite, playwright or tsc a gate file", () => {
    const configs = readdirSync(root).filter((name) =>
      /^(?:(?:vitest|vite|playwright)(?:\.[\w-]+)?\.config\.[cm]?[jt]s|tsconfig[\w.-]*\.json)$/u.test(name),
    );
    expect(configs.length).toBeGreaterThan(5);
    expect(configs.filter((name) => gateFilesIn(list, [name]).length === 0)).toEqual([]);
  });

  it("takes a named config over the default, follows extends and references, and finds playwright's default", () => {
    const files = {
      "vitest.config.ts": "export default {};",
      "vitest.slow.config.mts": 'import { x } from "./scripts/x.mjs";',
      "scripts/x.mjs": "export const x = 1;",
      "tsconfig.json": '{ "references": [{ "path": "./tsconfig.a.json" }, { "path": "./packages/b" }] }',
      "tsconfig.a.json": '{ "extends": "./tsconfig.base.json" }',
      "tsconfig.base.json": "{}",
      "packages/b/tsconfig.json": "{}",
      "playwright.config.ts": "export default {};",
    };
    const checks = {
      gate: ["fast"],
      groups: {
        fast: [
          check("slow", "node node_modules/vitest/vitest.mjs run --config vitest.slow.config.mts"),
          check("types", "node node_modules/typescript/bin/tsc -b"),
          check("e2e", "pnpm exec playwright test"),
        ],
      },
    };
    const found = checkedScripts(checks, (file) => {
      if (files[file] === undefined) throw new Error(`no ${file}`);
      return files[file];
    });
    expect([...found.keys()].sort()).toEqual(
      [
        "packages/b/tsconfig.json",
        "playwright.config.ts",
        "scripts/x.mjs",
        "tsconfig.a.json",
        "tsconfig.base.json",
        "tsconfig.json",
        "vitest.slow.config.mts",
      ].sort(),
    );
    expect(found.get("tsconfig.base.json")).toBe("extended by tsconfig.a.json");
  });
});

describe("merge readiness for a change to gate files", () => {
  const answered = DESIGN_CHECK_LABELS.map((label) => `- **${label}:** n/a: a fixture answer`).join("\n");
  const head = "a".repeat(40);
  const facts = (labels, main = { conclusion: "success", headSha: "c".repeat(40) }) => ({
    main,
    pr: { state: "OPEN", draft: false, headSha: head, labels, body: answered, files: ["config/checks.json"] },
    run: { status: "completed", conclusion: "success", checkedHead: head, checkedMain: "b".repeat(40) },
    mainFilesSince: [],
    gateList: list,
  });

  it("is not ready until the pull request carries the review label, and names the files", () => {
    expect(decide(facts([]))).toMatchObject({ ready: false, reason: expect.stringContaining("config/checks.json") });
    expect(decide(facts([]))).toMatchObject({ action: expect.stringContaining(GATE_LABEL) });
    expect(decide(facts([GATE_LABEL]))).toMatchObject({ ready: true });
  });

  it(`does not let "${FIX_LABEL}" bypass the review`, () => {
    const red = { conclusion: "failure", headSha: "d".repeat(40) };
    expect(decide(facts([FIX_LABEL], red))).toMatchObject({
      ready: false,
      reason: expect.stringContaining("gate files"),
    });
    expect(decide(facts([FIX_LABEL, GATE_LABEL], red))).toMatchObject({ ready: true });
  });

  it("leaves a change that touches no gate file alone", () => {
    const plain = facts([]);
    plain.pr.files = ["src/app/main.ts", "tests/unit/run-checks.test.mjs"];
    expect(decide(plain)).toMatchObject({ ready: true });
  });

  it("reads the list from the checkout that runs merge:ready", () => {
    expect(read("scripts/merge-ready.mjs")).toContain("gateList: loadGateList()");
  });
});
