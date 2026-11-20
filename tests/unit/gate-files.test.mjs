// The gate: main's copy judges a change (judgedChecks), and a change to a gate file waits for review.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DESIGN_CHECK_LABELS } from "../../scripts/design-check.mjs";
import { GATE_LABEL, gateFilesIn, loadGateList } from "../../scripts/gate-files.mjs";
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
    // Scripts the workflow runs that only describe or build, and decide no verdict.
    const notGate = new Set(["scripts/build-target.mjs"]);
    expect([...new Set(run)].filter((file) => !notGate.has(file) && gateFilesIn(list, [file]).length === 0)).toEqual(
      [],
    );
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
