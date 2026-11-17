// The machine-wide check slots, the group selection and the flaky-check report of scripts/run-checks.mjs.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  flakyLine,
  loadChecks,
  recordResult,
  RESULTS_FORMAT,
  selectChecks,
  takeSlot,
} from "../../scripts/run-checks.mjs";

const made = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), "tear-check-slots-"));
  made.push(path);
  return path;
};
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("check slots", () => {
  it("lets a second taker in only after the first releases its slot", async () => {
    const slots = directory();
    const release = await takeSlot({ directory: slots, slots: 1, wait: 10, log: () => undefined });
    let second = false;
    const waiting = takeSlot({ directory: slots, slots: 1, wait: 10, log: () => undefined }).then((done) => {
      second = true;
      return done;
    });
    await new Promise((done) => setTimeout(done, 100));
    expect(second).toBe(false);
    release();
    (await waiting)();
    expect(second).toBe(true);
    expect(readdirSync(slots)).toEqual([]);
  });

  it("takes over a slot whose owner process has died", async () => {
    const slots = directory();
    writeFileSync(join(slots, "slot-0.json"), JSON.stringify({ pid: 2 ** 22 + 12_345, since: Date.now() }));
    const release = await takeSlot({ directory: slots, slots: 1, wait: 10, log: () => undefined });
    release();
  });
});

describe("check groups", () => {
  it("runs the gate groups in order when no group is named", () => {
    const config = loadChecks();
    const groups = [...new Set(selectChecks(config).map((check) => check.group))];
    expect(groups).toEqual(config.gate);
    expect(config.gate).toEqual(["static", "unit", "build", "browser"]);
  });

  it("keeps the fast group free of browsers and builds", () => {
    for (const check of selectChecks(loadChecks(), "fast"))
      expect(check.run).not.toMatch(/browser|build-target|vitest\.mjs run$/u);
  });
});

describe("check results and flaky checks", () => {
  const run = { commit: "c1", tree: "t1", attempt: 1 };

  it("collects every group's results of one attempt in one file", () => {
    const file = join(directory(), "results", "results.json");
    recordResult(file, run, { check: "static.lint", status: "pass", seconds: 2 });
    recordResult(file, run, { check: "browser.pale-variants", status: "fail", seconds: 60, reason: "exit 1" });
    const record = JSON.parse(readFileSync(file, "utf8"));
    expect(record).toMatchObject({ format: RESULTS_FORMAT, ...run });
    expect(record.results.map((result) => `${result.check}:${result.status}`)).toEqual([
      "static.lint:pass",
      "browser.pale-variants:fail",
    ]);
  });

  it("starts the file again for another tree or attempt", () => {
    const file = join(directory(), "results.json");
    recordResult(file, run, { check: "static.lint", status: "fail", seconds: 2, reason: "exit 1" });
    recordResult(file, { ...run, attempt: 2 }, { check: "static.lint", status: "pass", seconds: 2 });
    expect(JSON.parse(readFileSync(file, "utf8")).results).toEqual([
      { check: "static.lint", status: "pass", seconds: 2 },
    ]);
  });

  it("names a check that failed on an earlier attempt of the same tree and passes now", () => {
    const previous = {
      format: RESULTS_FORMAT,
      ...run,
      results: [
        { check: "static.lint", status: "pass", seconds: 2 },
        { check: "browser.pale-variants", status: "fail", seconds: 60, reason: "exit 1" },
      ],
    };
    expect(flakyLine(previous, "t1", "browser.pale-variants", 2)).toBe(
      "FLAKY browser.pale-variants: failed on attempt 1 (exit 1), passed on attempt 2",
    );
    expect(flakyLine(previous, "t1", "static.lint", 2)).toBeUndefined();
    // Another tree is another change: its failure is not a flake of this one.
    expect(flakyLine(previous, "t2", "browser.pale-variants", 2)).toBeUndefined();
    expect(flakyLine(undefined, "t1", "browser.pale-variants", 2)).toBeUndefined();
  });
});

describe("--keep-going", () => {
  // A three-check list whose first and last checks fail.
  function runList(extra) {
    const dir = directory();
    const config = join(dir, "checks.json");
    const step = (id, code) => ({ id, run: `node -e process.exit(${String(code)})` });
    writeFileSync(
      config,
      JSON.stringify({ gate: ["demo"], groups: { demo: [step("first", 3), step("second", 0), step("third", 4)] } }),
    );
    const env = { ...process.env, CI: "1", TEAR_CHECKS_CONFIG: config };
    delete env.TEAR_CHECK_RESULTS;
    delete env.GITHUB_STEP_SUMMARY;
    return spawnSync(process.execPath, ["scripts/run-checks.mjs", "demo", ...extra], { encoding: "utf8", env });
  }

  it("stops at the first failing check without it", () => {
    const result = runList([]);
    expect(result.status).toBe(3);
    expect(result.stdout).not.toMatch(/demo\.second/u);
  });

  it("runs every check, lists each failure and still fails with it", () => {
    const result = runList(["--keep-going"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/PASS demo\.second/u);
    expect(result.stderr).toMatch(
      /FAIL 2 of 3 check\(s\) in \d+ s:\n {2}demo\.first \(exit 3\)\n {2}demo\.third \(exit 4\)/u,
    );
  });
});
