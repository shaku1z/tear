import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  NEW_FILE_CEILINGS,
  evaluateBudget,
  formatReport,
  measureSource,
  overCeiling,
  parseArguments,
  serializeBaseline,
  updateBaseline,
} from "../scripts/check-code-budget.mjs";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-code-budget.mjs");
const small = Object.freeze({ chars: 10, maxLineLength: 10, multiStatementLines: 0, largestFunctionStatements: 1 });

function metrics(overrides = {}) {
  return {
    lines: 1,
    chars: 100,
    maxLineLength: 40,
    multiStatementLines: 0,
    largestFunctionStatements: 3,
    ...overrides,
  };
}

test("counts lines where several statements or class members begin, but not a one-line guard", () => {
  assert.equal(measureSource("a.ts", "a(); b();\nif (done) return;\n").multiStatementLines, 1);
  assert.equal(measureSource("a.ts", "function f() { if (x) { a(); b(); } }\n").multiStatementLines, 1);
  assert.equal(measureSource("a.ts", "class C { private a = 0; private b = 0; }\n").multiStatementLines, 1);
  assert.equal(measureSource("a.ts", "function f() {\n  if (done) return;\n  a();\n}\n").multiStatementLines, 0);
});

test("measures the largest function by its own statements, excluding nested functions", () => {
  const source =
    "function outer() {\n  const a = 1;\n  const inner = () => {\n    one();\n    two();\n    three();\n  };\n  return inner;\n}\n";
  assert.equal(measureSource("a.ts", source).largestFunctionStatements, 3);
});

test("ignores literal text and import declarations when measuring line length", () => {
  const literal = `const message = "${"x".repeat(300)}";\n`;
  assert.equal(measureSource("a.ts", literal).maxLineLength, "const message = ;".length);
  const imports = `import { ${Array.from({ length: 40 }, (_, index) => `name${String(index)}`).join(", ")} } from "./module";\nconst a = 1;\n`;
  assert.equal(measureSource("a.ts", imports).maxLineLength, "const a = 1;".length);
  assert.equal(
    measureSource("a.ts", `const total = ${Array.from({ length: 60 }, () => "value").join(" + ")};\n`).maxLineLength >
      160,
    true,
  );
});

test("character size ignores indentation, spacing, line splitting and line endings", () => {
  const packed = measureSource("a.ts", "function f() { a(); b(); }\n");
  const split = measureSource("a.ts", "function f() {\n    a();\n    b();\n}\n");
  const crlf = measureSource("a.ts", "function f() {\r\n    a();\r\n    b();\r\n}\r\n");
  const respaced = measureSource("a.ts", "function f(){a();b();}\n");
  assert.equal(split.chars, packed.chars);
  assert.equal(respaced.chars, packed.chars);
  assert.equal(packed.chars, "functionf(){a();b();}".length);
  assert.deepEqual(crlf, split);
  assert.equal(split.lines, 4);
});

test("character size does not count import and re-export declarations or dynamic module specifiers", () => {
  const code = "export const value = load();\n";
  const bare = measureSource("a.ts", code).chars;
  const wired = [
    'import { a, b } from "./near";\n',
    'import type {\n  C,\n  D,\n} from "../far/away/module";\n',
    'import * as ns from "./ns";\nimport "./side-effect";\nimport legacy = require("./cjs");\n',
    'export { e } from "./e";\nexport * from "./star";\nexport type { F } from "./f";\n',
    code,
  ].join("");
  assert.equal(measureSource("a.ts", wired).chars, bare);
  const dynamic = (specifier) =>
    measureSource("a.ts", `type M = typeof import("${specifier}");\nconst m = await import("${specifier}");\n`).chars;
  assert.equal(dynamic("./x"), dynamic("../../deeper/folder/x"));
  assert.equal(dynamic("./x"), measureSource("a.ts", "type M = typeof import();\nconst m = await import();\n").chars);
});

test("character size still counts local export lists, code beside an import and non-module strings", () => {
  const solid = (text) => text.replace(/\s+/gu, "").length;
  assert.equal(
    measureSource("a.ts", "const a = 1;\nexport { a };\n").chars,
    solid("const a = 1;") + solid("export { a };"),
  );
  assert.equal(measureSource("a.ts", 'import { a } from "./a"; run(a);\n').chars, "run(a);".length);
  assert.equal(
    measureSource("a.ts", 'const url = new URL("./asset.png", import.meta.url);\n').chars,
    solid('const url = new URL("./asset.png", import.meta.url);'),
  );
  assert.equal(measureSource("a.ts", 'call("./looks-like-a-path");\n').chars, 'call("./looks-like-a-path");'.length);
});

test("moving a module leaves the character size of its importers unchanged", () => {
  const importer = (specifier) =>
    `import { run } from "${specifier}";\nexport { helper } from "${specifier}";\nexport function go() { return run(); }\n`;
  assert.equal(
    measureSource("a.ts", importer("./live-thing")).chars,
    measureSource("a.ts", importer("./area/thing")).chars,
  );
});

test("new files must meet every absolute ceiling", () => {
  const measurements = new Map([
    ["src/new.ts", metrics({ multiStatementLines: 1, maxLineLength: 200 })],
    ["src/ok.ts", metrics()],
  ]);
  const { violations } = evaluateBudget(measurements, {});
  assert.deepEqual(
    violations.map(({ file, metric, kind }) => [file, metric, kind]),
    [
      ["src/new.ts", "maxLineLength", "new-file"],
      ["src/new.ts", "multiStatementLines", "new-file"],
    ],
  );
});

test("baselined files may improve but never exceed their recorded values", () => {
  const baseline = { "src/debt.ts": { chars: 40_000, multiStatementLines: 12 } };
  const improved = evaluateBudget(
    new Map([["src/debt.ts", metrics({ chars: 39_000, multiStatementLines: 12 })]]),
    baseline,
  );
  assert.deepEqual(improved.violations, []);
  assert.deepEqual(improved.tightenable, [{ file: "src/debt.ts", metric: "chars", from: 40_000, to: 39_000 }]);
  const regressed = evaluateBudget(
    new Map([["src/debt.ts", metrics({ chars: 40_001, maxLineLength: 161 })]]),
    baseline,
  );
  assert.deepEqual(
    regressed.violations.map(({ metric, limit, kind }) => [metric, limit, kind]),
    [
      ["chars", 40_000, "regression"],
      ["maxLineLength", NEW_FILE_CEILINGS.maxLineLength, "regression"],
    ],
  );
});

test("a baseline entry without a source file fails so it cannot grandfather a future file", () => {
  const { violations } = evaluateBudget(new Map(), { "src/gone.ts": { chars: 50_000 } });
  assert.deepEqual(
    violations.map(({ file, kind }) => [file, kind]),
    [["src/gone.ts", "stale"]],
  );
});

test("update lowers values, drops graduated files and refuses increases", () => {
  const baseline = { "src/a.ts": { chars: 40_000 }, "src/b.ts": { multiStatementLines: 3 } };
  const lowered = updateBaseline(
    new Map([
      ["src/a.ts", metrics({ chars: 30_000 })],
      ["src/b.ts", metrics()],
    ]),
    baseline,
  );
  assert.deepEqual(lowered, { files: { "src/a.ts": { chars: 30_000 } }, refused: [], increased: [] });
  const raised = updateBaseline(
    new Map([
      ["src/a.ts", metrics({ chars: 41_000 })],
      ["src/b.ts", metrics({ multiStatementLines: 3 })],
    ]),
    baseline,
  );
  assert.deepEqual(raised.refused, [{ file: "src/a.ts", metric: "chars", value: 41_000, limit: 40_000 }]);
  const allowed = updateBaseline(new Map([["src/a.ts", metrics({ chars: 41_000 })]]), baseline, {
    allowIncrease: new Set(["src/a.ts"]),
  });
  assert.deepEqual(allowed.refused, []);
  assert.deepEqual(allowed.increased, [{ file: "src/a.ts", metric: "chars", value: 41_000, limit: 40_000 }]);
});

test("update carries a moved file's debt only when the move is declared", () => {
  const baseline = { "src/old/a.ts": { chars: 40_000 } },
    measurements = new Map([["src/new/a.ts", metrics({ chars: 39_000 })]]);
  assert.equal(updateBaseline(measurements, baseline).refused.length, 1);
  const moved = updateBaseline(measurements, baseline, { moves: new Map([["src/old/a.ts", "src/new/a.ts"]]) });
  assert.deepEqual(moved, { files: { "src/new/a.ts": { chars: 39_000 } }, refused: [], increased: [] });
  assert.throws(
    () => updateBaseline(measurements, baseline, { moves: new Map([["src/missing.ts", "src/new/a.ts"]]) }),
    /no baseline entry/u,
  );
});

test("records only metrics over the ceilings and reports the worst offenders deterministically", () => {
  assert.deepEqual(overCeiling(metrics({ chars: 11, largestFunctionStatements: 1 }), small), {
    chars: 11,
    maxLineLength: 40,
  });
  const measurements = new Map([
    ["src/b.ts", metrics({ chars: 50 })],
    ["src/a.ts", metrics({ chars: 50 })],
    ["src/c.ts", metrics({ chars: 5, maxLineLength: 5, largestFunctionStatements: 1 })],
  ]);
  const report = formatReport(measurements, { ceilings: small, top: 2 });
  assert.match(report, /2 of 3 src files over a ceiling/u);
  assert.match(report, /1\. src\/a\.ts .*\n.*2\. src\/b\.ts/u);
});

test("argument parsing keeps escape hatches explicit", () => {
  assert.throws(() => parseArguments(["--allow-increase", "src/a.ts"]), /require --update/u);
  assert.throws(() => parseArguments(["--update", "--move", "src/a.ts"]), /old-path/u);
  assert.throws(() => parseArguments(["--update", "--initialize"]), /exclusive/u);
  const options = parseArguments(["--update", "--allow-increase", "src\\a.ts", "--move", "src/x.ts=src/y.ts"]);
  assert.deepEqual([...options.allowIncrease], ["src/a.ts"]);
  assert.deepEqual([...options.moves], [["src/x.ts", "src/y.ts"]]);
});

test("the CLI fails a planted packed file, refuses to raise it, and accepts an explicit exception loudly", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tear-code-budget-"));
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "config"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "clean.ts"), "export const value = 1;\n");
    fs.writeFileSync(path.join(root, "config", "code-budget-baseline.json"), serializeBaseline({}));
    const run = (...argumentsList) =>
      spawnSync(process.execPath, [script, "--root", root, ...argumentsList], { encoding: "utf8" });
    assert.equal(run().status, 0);
    fs.writeFileSync(path.join(root, "src", "packed.ts"), "export function f() { a(); b(); }\n");
    const failed = run();
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /src\/packed\.ts: multi-statement lines 1 exceeds the new-file ceiling 0/u);
    const refused = run("--update");
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Refusing to raise the code budget baseline/u);
    const allowed = run("--update", "--allow-increase", "src/packed.ts");
    assert.equal(allowed.status, 0);
    assert.match(allowed.stderr, /!!! CODE BUDGET BASELINE RAISED for src\/packed\.ts/u);
    assert.equal(run().status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
