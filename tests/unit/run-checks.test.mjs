// Probe of an old head, do not merge.
// The group selection and the flaky-check report of scripts/run-checks.mjs.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CHECK_SECONDS,
  flakyLine,
  loadCheckTimes,
  loadChecks,
  recordResult,
  parseShard,
  RESULTS_FORMAT,
  runCheckList,
  selectChecks,
  shardChecks,
} from "../../scripts/run-checks.mjs";
import { medianTimes } from "../../scripts/ci-check-times.mjs";

const made = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), "tear-check-"));
  made.push(path);
  return path;
};
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
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

describe("shards", () => {
  const config = loadChecks();

  it("put every check of every group in exactly one shard, for any shard count", () => {
    for (const group of Object.keys(config.groups)) {
      const checks = selectChecks(config, group);
      for (let count = 1; count <= 6; count += 1) {
        const parts = Array.from({ length: count }, (_, part) => shardChecks(checks, part + 1, count));
        const ids = parts.flat().map((check) => check.id);
        expect(ids.sort(), `${group} in ${String(count)}`).toEqual(checks.map((check) => check.id).sort());
        // Each part keeps the list's order.
        for (const part of parts) expect(part).toEqual(checks.filter((check) => part.includes(check)));
      }
    }
  });

  it("count a check with no recorded time as the stated default, and still place it", () => {
    expect(DEFAULT_CHECK_SECONDS).toBe(60);
    const checks = [
      { id: "long", seconds: 100 },
      { id: "new" },
      { id: "zero", seconds: 0 },
      { id: "short", seconds: 50 },
    ];
    // Longest first into the lighter part: long (100) and new (60) start the two parts, zero (60)
    // joins new, and short (50) joins long. The two without a time are counted, and placed.
    expect(shardChecks(checks, 1, 2).map((check) => check.id)).toEqual(["long", "short"]);
    expect(shardChecks(checks, 2, 2).map((check) => check.id)).toEqual(["new", "zero"]);
  });

  it("are the same on every call, so each CI job picks its own part of one split", () => {
    const checks = selectChecks(config, "browser");
    expect(shardChecks(checks, 2, 4)).toEqual(shardChecks([...checks], 2, 4));
  });

  it("prefer a measured time, then the recorded one, then the default", () => {
    const checks = [
      { group: "g", id: "a", seconds: 10 },
      { group: "g", id: "b", seconds: 10 },
      { group: "g", id: "c", seconds: 100 },
      { group: "g", id: "d" },
    ];
    // Recorded: c (100) alone, then d (60), a and b together.
    expect(shardChecks(checks, 1, 2).map((check) => check.id)).toEqual(["c"]);
    // Measured: a really takes 200 s and gets a part to itself; c is measured at 50 s.
    const measured = { "g.a": 200, "g.c": 50, "g.zero": 0 };
    expect(shardChecks(checks, 1, 2, measured).map((check) => check.id)).toEqual(["a"]);
    expect(shardChecks(checks, 2, 2, measured).map((check) => check.id)).toEqual(["b", "c", "d"]);
  });

  it("read the committed times file, which names only checks that exist", () => {
    const measured = loadCheckTimes();
    const known = new Set(selectChecks(config).map((check) => `${check.group}.${check.id}`));
    for (const [check, seconds] of Object.entries(measured)) {
      expect(known.has(check), check).toBe(true);
      expect(seconds, check).toBeGreaterThan(0);
    }
    expect(loadCheckTimes(join(directory(), "absent.json"))).toEqual({});
  });

  it("take the median of each check's passing times across runs", () => {
    const run = (...results) => ({ results });
    const pass = (check, seconds) => ({ check, status: "pass", seconds });
    const files = [
      run(pass("b.x", 30), pass("b.y", 5)),
      run(pass("b.x", 10), { check: "b.y", status: "fail", seconds: 900 }),
      run(pass("b.x", 20), pass("b.y", 7)),
    ];
    expect(medianTimes(files)).toEqual({ "b.x": 20, "b.y": 6 });
  });

  it("reject a malformed shard", () => {
    expect(parseShard("2/4")).toEqual([2, 4]);
    for (const text of ["", "2", "a/b", "2/4/1", undefined])
      expect(() => parseShard(text), String(text)).toThrow(RangeError);
    for (const [part, count] of [
      [0, 4],
      [5, 4],
      [1, 0],
    ])
      expect(() => shardChecks([], part, count), `${String(part)}/${String(count)}`).toThrow(RangeError);
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
