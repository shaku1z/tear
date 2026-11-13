import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { analyzeTree, gateErrors, loadConfiguration } from "../scripts/architecture/analyze.mjs";
import { applyMoves, movePath, updateArchitectureBaseline } from "../scripts/architecture/baseline.mjs";
import { compareCycles, findCycles, valueGraph } from "../scripts/architecture/cycles.mjs";
import { evaluateText, evaluateTree, runRuleFixtures, transitiveFindings } from "../scripts/architecture/evaluate.mjs";
import { explainFile } from "../scripts/architecture/explain.mjs";
import { assignLayers, compareLayerAllowlist, layerViolations } from "../scripts/architecture/layering.mjs";
import { RULES } from "../scripts/architecture/rules.mjs";
import { createSelectorResolver, globToRegExp, validateCoverage } from "../scripts/architecture/selectors.mjs";
import { createSourceTree, extractImports, readSourceTree, resolveSpecifier, unresolvedEdges } from "../scripts/architecture/source-graph.mjs";
import { parseArguments } from "../scripts/check-source-architecture.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repository, "scripts", "check-source-architecture.mjs");
const configuration = loadConfiguration(repository);
const realTree = readSourceTree(repository);
const resolver = createSelectorResolver(configuration.roles);
const context = { resolver, available: realTree.available };
const legacy = JSON.parse(fs.readFileSync(path.join(repository, "tests", "fixtures", "architecture-legacy-cases.json"), "utf8")).cases;

function tree(modules, extraFiles = []) {
  const files = [...new Set([...Object.keys(modules), ...extraFiles])].sort();
  const map = new Map(Object.entries(modules).filter(([file]) => file.endsWith(".ts")).map(([file, text]) => [file, { text, imports: extractImports(file, text) }]));
  return createSourceTree(files, map, new Set(files));
}

test("globs keep * inside a segment and let **/ span zero or more directories", () => {
  assert.equal(globToRegExp("src/app/**").test("src/app/shell/a.ts"), true);
  assert.equal(globToRegExp("src/*.d.ts").test("src/app/x.d.ts"), false);
  assert.equal(globToRegExp("src/**/browser/**").test("src/browser/x.ts"), true);
  assert.equal(globToRegExp("src/**/browser/**").test("src/tearbench/browser/x.ts"), true);
  assert.equal(globToRegExp("src/**/browser/**").test("src/platform/browser.ts"), false);
  assert.equal(globToRegExp("src/{a,b}/x.ts").test("src/b/x.ts"), true);
});

test("the compiler-based import reader distinguishes type-only, value, dynamic and re-export references", () => {
  const records = extractImports("src/a.ts", [
    'import type { A } from "./a";', 'import { type B } from "./b";', 'import { type C, D } from "./c";', 'import "./side-effect";',
    'export type { E } from "./e";', 'export * from "./f";', 'const g = import("./g");', 'let h: import("./h").H;', "// import { x } from './comment';",
  ].join("\n"));
  assert.deepEqual(records.map(({ specifier, typeOnly, dynamic }) => [specifier, typeOnly, dynamic]), [
    ["./a", true, false], ["./b", true, false], ["./c", false, false], ["./side-effect", false, false], ["./e", true, false],
    ["./f", false, false], ["./g", false, true], ["./h", true, false],
  ]);
  assert.deepEqual(records[2].names, ["D"]);
});

test("specifiers resolve like the bundler and keep unresolved candidates for planted fixtures", () => {
  const available = new Set(["src/a/b.ts", "src/a/c/index.ts", "src/data.json"]);
  assert.equal(resolveSpecifier("src/x/y.ts", "../a/b", available).target, "src/a/b.ts");
  assert.equal(resolveSpecifier("src/x/y.ts", "../a/b.js", available).target, "src/a/b.ts");
  assert.equal(resolveSpecifier("src/x/y.ts", "../a/c", available).target, "src/a/c/index.ts");
  assert.equal(resolveSpecifier("src/x/y.ts", "../data.json", available).target, "src/data.json");
  assert.deepEqual(resolveSpecifier("src/x/y.ts", "../remote/config", available), { target: "src/remote/config", resolved: false, external: false });
  assert.equal(resolveSpecifier("src/x/y.ts", "typescript", available).external, true);
});

test("an internal import that reaches no file is reported so the graph cannot silently lose an edge", () => {
  const graph = new Map([["src/a.ts", [{ to: "src/missing", resolved: false }, { to: "config/architecture-roles.json", resolved: false }]]]);
  assert.deepEqual(unresolvedEdges(repository, graph), [{ from: "src/a.ts", to: "src/missing" }]);
});

test("the current tree passes the gate with every rule fixture re-proved", () => {
  const analysis = analyzeTree(realTree, configuration);
  assert.deepEqual(gateErrors(analysis), []);
  assert.deepEqual(runRuleFixtures(configuration.rules, realTree, resolver), []);
});

test("every planted case of the pre-role gate keeps its verdict, and the deliberate strengthenings reject", () => {
  const mismatches = legacy.filter((entry) => (evaluateText(RULES, entry.file, entry.text, context).length > 0) !== entry.reject)
    .map((entry) => `${entry.file} [${entry.legacy.join(",")}]: ${entry.text}`);
  assert.deepEqual(mismatches, []);
  const covered = new Set(legacy.filter((entry) => entry.reject).flatMap((entry) => entry.legacy));
  assert.equal(covered.size, 76, "R01-R75 and S1 each keep at least one rejected case");
});

test("transitive biome isolation reports a reach through an intermediate module", () => {
  const rule = RULES.find((candidate) => candidate.id === "biome.pale-isolation");
  const graph = new Map([
    ["src/gameplay/environment/pale-environment-feature.ts", [{ to: "src/gameplay/environment/__shared-hop.ts" }]],
    ["src/gameplay/environment/__shared-hop.ts", [{ to: "src/gameplay/environment/graft-anchor.ts" }]],
  ]);
  const findings = transitiveFindings(rule, graph, resolver);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].detail, "transitively through src/gameplay/environment/__shared-hop.ts -> src/gameplay/environment/graft-anchor.ts");
});

test("structural rules reject stray JavaScript, oversized modules and suppressions but honour the data-table exemption", () => {
  const long = "const line = 1;\n".repeat(700);
  const findings = evaluateTree(RULES, tree({
    "src/gameplay/weapons.ts": long, "src/gameplay/upgrades.ts": long, "src/app/a.ts": "// @ts-nocheck\n", "src/app/b.js": "",
  }), resolver);
  assert.deepEqual(findings.map(({ file, rule }) => [file, rule]), [
    ["src/app/a.ts", "structure.no-suppressions"], ["src/app/b.js", "structure.typescript-only"], ["src/gameplay/weapons.ts", "structure.module-line-limit"],
  ]);
});

test("coverage fails closed when a referenced path, glob or role matches nothing, and when a role is unused", () => {
  const roles = {
    used: { purpose: "x", include: ["src/a.ts", "src/gone.ts"] },
    unused: { purpose: "x", include: ["src/a.ts"] },
    future: { purpose: "x", anticipate: ["src/later/**"] },
  };
  const errors = validateCoverage(roles, ["src/a.ts"], [{ where: "rule r", selectors: ["@used", "@future", "@missing", "src/none/**"] }]);
  assert.deepEqual(errors, [
    'role used.include: "src/gone.ts" matches no file', "rule r: unknown role @missing", 'rule r: "src/none/**" matches no file', "role unused is not used by any rule",
  ]);
});

test("a rule whose scope or pattern can no longer fire fails its planted fixture", () => {
  const broken = [{ ...RULES.find((rule) => rule.id === "app.live-root-player"), pattern: /\blet\s+playerState\b/u }];
  assert.match(runRuleFixtures(broken, realTree, resolver).join("\n"), /app\.live-root-player: reject fixture .* produced 0 findings/u);
  const emptyScope = [{ ...RULES.find((rule) => rule.id === "app.live-root-player"), in: ["src/nowhere/**"] }];
  assert.match(runRuleFixtures(emptyScope, realTree, resolver).join("\n"), /no current module in scope/u);
});

test("layering assigns every file once and reports undeclared edges with their kind", () => {
  const layers = { low: ["src/low/**"], high: ["src/high/**"] };
  const { assignment, errors } = assignLayers(["src/low/a.ts", "src/high/b.ts", "src/stray.ts"], layers);
  assert.deepEqual(errors, ["src/stray.ts: belongs to no layer in config/architecture-layers.json"]);
  const graph = new Map([["src/low/a.ts", [{ to: "src/high/b.ts", kind: "type" }]], ["src/high/b.ts", [{ to: "src/low/a.ts", kind: "value" }]]]);
  assert.deepEqual(layerViolations(graph, assignment, { high: { low: "any" } }), [{ from: "src/low/a.ts", to: "src/high/b.ts", kind: "type", pair: "low -> high" }]);
  assert.deepEqual(layerViolations(graph, assignment, { high: { low: "any" }, low: { high: "type" } }), []);
});

test("the layer allowlist ratchets: new edges and type-to-value upgrades fail, vanished files are stale, removed edges tighten", () => {
  const available = new Set(["src/a.ts", "src/b.ts", "src/c.ts"]);
  const allowlist = [{ from: "src/a.ts", to: "src/b.ts", kind: "type" }, { from: "src/a.ts", to: "src/gone.ts", kind: "value" }, { from: "src/c.ts", to: "src/b.ts", kind: "value" }];
  const violations = [{ from: "src/a.ts", to: "src/b.ts", kind: "value" }, { from: "src/b.ts", to: "src/c.ts", kind: "type" }];
  const result = compareLayerAllowlist(violations, allowlist, available);
  assert.deepEqual(result.unexpected.map(({ from, to }) => `${from}>${to}`), ["src/a.ts>src/b.ts", "src/b.ts>src/c.ts"]);
  assert.deepEqual(result.stale.map(({ to }) => to), ["src/gone.ts"]);
  assert.deepEqual(result.tightenable.map(({ from }) => from), ["src/c.ts"]);
});

test("cycle detection finds strongly connected files over static value edges only", () => {
  const graph = new Map([
    ["src/a.ts", [{ to: "src/b.ts", staticValue: true }]], ["src/b.ts", [{ to: "src/a.ts", staticValue: true }, { to: "src/c.ts", staticValue: true }]],
    ["src/c.ts", [{ to: "src/b.ts", staticValue: false }]], ["src/d.ts", [{ to: "src/d.ts", staticValue: true }]],
  ]);
  assert.deepEqual(findCycles(valueGraph(graph)), [["src/a.ts", "src/b.ts"], ["src/d.ts"]]);
});

test("the cycle baseline only shrinks: new or grown cycles fail, shrunk ones tighten, vanished files are stale", () => {
  const available = new Set(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]);
  const recorded = [["src/a.ts", "src/b.ts", "src/c.ts"], ["src/d.ts", "src/gone.ts"]];
  const shrunk = compareCycles([["src/a.ts", "src/b.ts"]], recorded, available);
  assert.deepEqual(shrunk.unexpected, []);
  assert.deepEqual(shrunk.tightenable, [recorded[0]]);
  assert.deepEqual(shrunk.stale, [recorded[1]]);
  assert.deepEqual(compareCycles([["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]], recorded, available).unexpected.length, 1);
});

test("--update refuses growth unless a file is named, and carries declared moves", () => {
  const previous = { layerViolations: [{ from: "src/old/a.ts", to: "src/b.ts", kind: "value" }], cycles: [["src/old/a.ts", "src/b.ts"]] };
  const current = [{ from: "src/new/a.ts", to: "src/b.ts", kind: "value" }];
  assert.equal(updateArchitectureBaseline(current, [["src/b.ts", "src/new/a.ts"]], previous).refused.length, 2);
  const moved = applyMoves(previous, new Map([["src/old/", "src/new/"]]));
  assert.deepEqual(updateArchitectureBaseline(current, [["src/b.ts", "src/new/a.ts"]], moved).refused, []);
  const allowed = updateArchitectureBaseline([...current, { from: "src/c.ts", to: "src/b.ts", kind: "type" }], [], moved, new Set(["src/c.ts"]));
  assert.deepEqual(allowed.refused, []);
  assert.equal(allowed.increased.length, 1);
  assert.equal(movePath("src/old/x/y.ts", new Map([["src/old/", "src/new/"]])), "src/new/x/y.ts");
});

test("argument parsing keeps escape hatches explicit", () => {
  assert.throws(() => parseArguments(["--allow-increase", "src/a.ts"]), /require --update/u);
  assert.throws(() => parseArguments(["--update", "--move", "src/a.ts"]), /old-path/u);
  assert.throws(() => parseArguments(["--update", "--initialize"]), /exclusive/u);
  const options = parseArguments(["--update", "--move", "src\\x.ts=src/y.ts", "--explain", "./src/a.ts"]);
  assert.deepEqual([...options.moves], [["src/x.ts", "src/y.ts"]]);
  assert.equal(options.explain, "src/a.ts");
});

test("--explain names the roles, rules, permissions and allowlist entries of a file", () => {
  const text = explainFile("src/app/shell/game-runtime.ts", analyzeTree(realTree, configuration));
  assert.match(text, /layer: app; may import/u);
  assert.match(text, /roles \(1\):\n {4}- app\.live-runtime-root/u);
  assert.match(text, /app\.live-root-player \[text\]/u);
  assert.match(text, /current findings: none/u);
});

function copyRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tear-architecture-"));
  fs.cpSync(path.join(repository, "src"), path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "config"));
  for (const name of ["architecture-roles.json", "architecture-layers.json", "architecture-baseline.json"]) {
    fs.copyFileSync(path.join(repository, "config", name), path.join(root, "config", name));
  }
  // Repository data that src imports from outside src (for example config/*.json), so every import still resolves.
  for (const edges of realTree.graph.values()) {
    for (const edge of edges.filter((candidate) => !candidate.resolved && !candidate.to.startsWith("src/"))) {
      fs.mkdirSync(path.dirname(path.join(root, edge.to)), { recursive: true });
      fs.copyFileSync(path.join(repository, edge.to), path.join(root, edge.to));
    }
  }
  return root;
}

test("the CLI fails closed on a move, rejects new edges and cycles, and ratchets the baseline", () => {
  const root = copyRepository();
  const run = (...argumentsList) => spawnSync(process.execPath, [script, "--root", root, ...argumentsList], { encoding: "utf8" });
  try {
    assert.equal(run().status, 0);
    const runtime = path.join(root, "src", "app", "shell", "game-runtime.ts"), moved = path.join(root, "src", "app", "shell", "moved-game-runtime.ts");
    fs.renameSync(runtime, moved);
    const failedMove = run();
    assert.equal(failedMove.status, 1);
    assert.match(failedMove.stderr, /role app\.live-runtime-root\.include: "src\/app\/shell\/game-runtime\.ts" matches no file/u);
    fs.renameSync(moved, runtime);
    const geometry = path.join(root, "src", "domain", "geometry.ts"), original = fs.readFileSync(geometry, "utf8");
    fs.appendFileSync(geometry, '\nimport { CONFIG as plantedConfig } from "../config/game-config";\nvoid plantedConfig;\n');
    const failed = run();
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /src\/domain\/geometry\.ts: world-owned gameplay must receive configuration .*\[core\.world-config-injection\]/u);
    assert.match(run("--update").stderr, /Fix these before updating the baseline/u);
    fs.writeFileSync(geometry, `${original}\nimport "../simulation/run-random";\n`);
    fs.appendFileSync(path.join(root, "src", "simulation", "run-random.ts"), '\nimport "../domain/geometry";\n');
    const ratchet = run();
    assert.equal(ratchet.status, 1);
    assert.match(ratchet.stderr, /src\/domain\/geometry\.ts -> src\/simulation\/run-random\.ts \(value\): domain -> simulation is not an allowed layer edge/u);
    assert.match(ratchet.stderr, /new or grown import cycle of \d+ files: .*src\/domain\/geometry\.ts/u);
    assert.match(run("--update").stderr, /Refusing to grow the architecture baseline/u);
    const allowed = run("--update", "--allow-increase", "src/domain/geometry.ts");
    assert.equal(allowed.status, 0);
    assert.match(allowed.stderr, /!!! ARCHITECTURE BASELINE RAISED: edge src\/domain\/geometry\.ts -> src\/simulation\/run-random\.ts/u);
    assert.equal(run().status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
