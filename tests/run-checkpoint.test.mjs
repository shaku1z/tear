import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CHECKPOINTS_PATH,
  ROOT,
  STEP_TOKEN,
  flattenCheckpoint,
  loadCheckpoints,
  runCheckpoint,
  stepCommand,
  validateCheckpoints,
} from "../scripts/run-checkpoint.mjs";

const runner = path.join(ROOT, "scripts", "run-checkpoint.mjs");
const packageScripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
const checkpoints = loadCheckpoints();
const step = (label, code) =>
  `node tests/fixtures/checkpoint-runner/step.mjs ${label}${code === undefined ? "" : ` ${String(code)}`}`;

function runCli(args) {
  return spawnSync(process.execPath, [runner, ...args], { cwd: ROOT, encoding: "utf8" });
}

function withLog(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tear-checkpoint-runner-"));
  const log = path.join(directory, "steps.log");
  fs.writeFileSync(log, "");
  try {
    const status = callback({ ...process.env, CHECKPOINT_RUNNER_LOG: log });
    return { status, lines: fs.readFileSync(log, "utf8").split("\n").filter(Boolean) };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/** Repository paths a leaf command reads; artifact paths are outputs and are not required to exist. */
function referencedPaths(command) {
  return command
    .split(" ")
    .slice(1)
    .map((token) => (token.includes("=") ? token.slice(token.indexOf("=") + 1) : token))
    .filter((token) => /^[\w.-]+\/[\w./-]+\.(?:[cm]?js|ts|json)$/u.test(token) && !token.startsWith("artifacts/"));
}

test("the data file matches its schema and every nested checkpoint resolves", () => {
  assert.doesNotThrow(() => validateCheckpoints(checkpoints));
  assert.ok(Object.keys(checkpoints).length > 0);
  for (const [name, entry] of Object.entries(checkpoints)) {
    assert.deepEqual(Object.keys(entry).sort(), ["description", "steps"], `${name} has only description and steps`);
  }
});

test("every checkpoint is runnable: its commands and the files they read exist", () => {
  const checked = new Set();
  for (const name of Object.keys(checkpoints)) {
    for (const command of flattenCheckpoint(checkpoints, name)) {
      const [executable, subcommand] = command.split(" ");
      if (executable === "pnpm" && subcommand !== "exec") {
        assert.ok(
          Object.hasOwn(packageScripts, subcommand),
          `${name}: "${command}" names a package script that does not exist`,
        );
      }
      for (const file of referencedPaths(command)) {
        assert.ok(fs.existsSync(path.join(ROOT, file)), `${name}: "${command}" reads missing ${file}`);
        checked.add(file);
      }
    }
  }
  assert.ok(
    checked.has("tests/browser-c27a-live-parity-trace.js") && checked.has("tests/unit/presentation-systems.test.ts"),
  );
  assert.ok(
    checked.has("tests/fixtures/c30-production-headless-terminal-movement-jump.json"),
    "flag values are checked too",
  );
});

test("checkpoint names left package.json and the runner is exposed as `pnpm checkpoint`", () => {
  assert.equal(packageScripts.checkpoint, "node scripts/run-checkpoint.mjs");
  for (const name of Object.keys(checkpoints))
    assert.ok(!Object.hasOwn(packageScripts, name), `${name} is still a package script`);
  for (const [name, command] of Object.entries(packageScripts)) {
    for (const checkpoint of Object.keys(checkpoints)) {
      assert.ok(
        !new RegExp(`pnpm (?:run )?${checkpoint.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\w:-])`, "u").test(
          command,
        ),
        `${name} calls moved checkpoint ${checkpoint} without the runner`,
      );
    }
  }
});

test("validation rejects malformed entries, shell text, unknown nesting and cycles", () => {
  const invalid = [
    { a: { steps: ["node x.mjs"] } },
    { a: { description: "d", steps: [] } },
    { a: { description: "d", steps: ["node x.mjs && node y.mjs"] } },
    { a: { description: "d", steps: ["node x.mjs > out.txt"] } },
    { a: { description: "d", steps: ["bash x.sh"] } },
    { a: { description: "d", steps: [{ checkpoint: "missing" }] } },
    { a: { description: "d", steps: [{ checkpoint: "b" }] }, b: { description: "d", steps: [{ checkpoint: "a" }] } },
  ];
  for (const value of invalid) assert.throws(() => validateCheckpoints(value), undefined, JSON.stringify(value));
  assert.equal(STEP_TOKEN.test("--fixture=tests/parity/mirror-pursuit.json"), true);
  assert.equal(STEP_TOKEN.test("$(whoami)"), false);
});

test("--list prints every checkpoint with its description", () => {
  const result = runCli(["--list"]);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length, Object.keys(checkpoints).length);
  for (const [name, entry] of Object.entries(checkpoints)) {
    assert.ok(
      lines.some((line) => line.startsWith(`${name} `) && line.endsWith(entry.description)),
      `${name} is listed`,
    );
  }
});

test("an unknown or missing checkpoint name fails without running anything", () => {
  const unknown = runCli(["check:c99:does-not-exist"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown checkpoint "check:c99:does-not-exist"/u);
  assert.equal(runCli([]).status, 2);
  assert.throws(() => runCheckpoint(checkpoints, "check:c99:does-not-exist"), /unknown checkpoint/u);
});

test("steps run in order and the first failing exit code stops the run and propagates", () => {
  const fixture = {
    outer: { description: "d", steps: [step("one"), { checkpoint: "inner" }, step("four")] },
    inner: { description: "d", steps: [step("two"), step("three", 7)] },
  };
  validateCheckpoints(fixture);
  const { status, lines } = withLog((env) => runCheckpoint(fixture, "outer", [], env));
  assert.equal(status, 7);
  assert.deepEqual(lines, ["one:outer", "two:inner", "three:inner"]);
});

test("a passing run exits 0 and extra arguments reach only the final step, through nesting", () => {
  const fixture = {
    outer: { description: "d", steps: [step("one"), { checkpoint: "inner" }] },
    inner: { description: "d", steps: [step("two"), step("three")] },
  };
  const passing = withLog((env) => runCheckpoint(fixture, "outer", [], env));
  assert.equal(passing.status, 0);
  assert.deepEqual(passing.lines, ["one:outer", "two:inner", "three:inner"]);
  const forwarded = withLog((env) => runCheckpoint(fixture, "outer", ["5"], env));
  assert.equal(forwarded.status, 5, "the appended argument became the final step's exit code");
});

test("the CLI runs a real checkpoint's pnpm step through the launching pnpm and propagates its exit code", () => {
  const name = "check:c27a:portable-core";
  assert.deepEqual(checkpoints[name]?.steps, ["pnpm check:architecture"]);
  const fakePnpm = path.join(ROOT, "tests", "fixtures", "checkpoint-runner", "step.mjs");
  for (const exit of ["0", "4"]) {
    const { status, lines } = withLog(
      (env) =>
        spawnSync(process.execPath, [runner, name], {
          cwd: ROOT,
          encoding: "utf8",
          env: { ...env, npm_execpath: fakePnpm, CHECKPOINT_RUNNER_EXIT: exit },
        }).status,
    );
    assert.equal(status, Number(exit));
    assert.deepEqual(lines, [`check:architecture:${name}`]);
  }
  const withoutPnpm = spawnSync(process.execPath, [runner, name], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, npm_execpath: "" },
  });
  assert.notEqual(withoutPnpm.status, 0, "a pnpm step without a launching pnpm fails instead of guessing");
  assert.match(withoutPnpm.stderr, /needs pnpm/u);
});

test("steps spawn without a shell: node uses this Node and pnpm re-enters the launching pnpm", () => {
  assert.deepEqual(stepCommand("node --test a.mjs", ["x"], {}), {
    file: process.execPath,
    args: ["--test", "a.mjs", "x"],
  });
  assert.deepEqual(stepCommand("pnpm check:architecture", [], { npm_execpath: "/p/pnpm.mjs" }), {
    file: process.execPath,
    args: ["/p/pnpm.mjs", "check:architecture"],
  });
  assert.deepEqual(stepCommand("pnpm check:architecture", [], { npm_execpath: "/p/pnpm.exe" }), {
    file: "/p/pnpm.exe",
    args: ["check:architecture"],
  });
  assert.equal(path.resolve(CHECKPOINTS_PATH), path.join(ROOT, "config", "checkpoints.json"));
});
