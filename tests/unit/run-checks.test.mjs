// The machine-wide check slots, the group selection and the flaky-check report of scripts/run-checks.mjs.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flakyLine,
  loadChecks,
  recordResult,
  RESULTS_FORMAT,
  runCheckList,
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

describe("running the list", () => {
  // A three-check list whose first and last checks fail. The checks never start a process: each
  // "runs" by returning its exit code, so the result does not depend on how busy the machine is.
  const step = (id, code) => ({ group: "demo", id, run: `exit ${String(code)}`, code });
  const list = [step("first", 3), step("second", 0), step("third", 4)];
  function runList(options) {
    const ran = [];
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const outcome = runCheckList(list, {
        ...options,
        execute: (check) => {
          ran.push(check.id);
          return { status: check.code };
        },
      });
      return { ...outcome, ran };
    } finally {
      vi.restoreAllMocks();
    }
  }

  it("stops at the first failing check, with that check's exit status", () => {
    const outcome = runList({});
    expect(outcome).toMatchObject({ status: 3, stopped: true, ran: ["first"] });
  });

  it("with keepGoing runs every check, names each failure and still fails", () => {
    const outcome = runList({ keepGoing: true });
    expect(outcome).toEqual({
      status: 1,
      stopped: false,
      ran: ["first", "second", "third"],
      failures: ["demo.first (exit 3)", "demo.third (exit 4)"],
    });
  });

  it("reports each check to onPass or onFail by name", () => {
    const passed = [];
    const failed = [];
    runList({
      keepGoing: true,
      onPass: (name) => passed.push(name),
      onFail: (name, _seconds, reason) => failed.push(`${name}: ${reason}`),
    });
    expect(passed).toEqual(["demo.second"]);
    expect(failed).toEqual(["demo.first: exit 3", "demo.third: exit 4"]);
  });

  it("counts a check that could not start, or was killed, as failed", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const outcome = runCheckList([step("missing", 0), step("killed", 0)], {
        keepGoing: true,
        execute: (check) =>
          check.id === "missing" ? { error: new Error("spawn ENOENT") } : { status: null, signal: "SIGTERM" },
      });
      expect(outcome.failures).toEqual(["demo.missing (spawn ENOENT)", "demo.killed (exit SIGTERM)"]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
