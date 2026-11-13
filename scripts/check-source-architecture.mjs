import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PATHS,
  analyzeTree,
  gateErrors,
  loadConfiguration,
  structuralErrors,
} from "./architecture/analyze.mjs";
import { serializeBaseline, updateArchitectureBaseline } from "./architecture/baseline.mjs";
import { cycleSummary } from "./architecture/cycles.mjs";
import { explainFile } from "./architecture/explain.mjs";
import { layerTwoCycles, summarizeByPair } from "./architecture/layering.mjs";
import { readSourceTree } from "./architecture/source-graph.mjs";

export { analyzeTree, gateErrors, loadConfiguration } from "./architecture/analyze.mjs";

const USAGE =
  "Usage: node scripts/check-source-architecture.mjs [--explain <file>]" +
  " [--update [--allow-increase <file>]... [--move <old>=<new>]... [--moves-file <json>] | --initialize] [--root <repo>]";

function readMovesFile(file) {
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  if (document === null || typeof document !== "object" || Array.isArray(document))
    throw new Error(`${file} must map old paths to new paths`);
  return Object.entries(document);
}

function addMove(options, from, to) {
  if (!from || !to) throw new Error("--move expects <old-path>=<new-path>");
  options.moves.set(from.replaceAll("\\", "/"), to.replaceAll("\\", "/"));
}

export function parseArguments(argumentsList) {
  const options = {
    root: process.cwd(),
    explain: undefined,
    update: false,
    initialize: false,
    allowIncrease: new Set(),
    moves: new Map(),
    help: false,
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index],
      value = () => {
        const next = argumentsList[++index];
        if (next === undefined) throw new Error(`${argument} requires a value`);
        return next.replaceAll("\\", "/");
      };
    if (argument === "--update") options.update = true;
    else if (argument === "--initialize") options.initialize = true;
    else if (argument === "--explain") options.explain = value().replace(/^\.\//u, "");
    else if (argument === "--allow-increase") options.allowIncrease.add(value());
    else if (argument === "--move") {
      const parts = value().split("=");
      if (parts.length !== 2) throw new Error("--move expects <old-path>=<new-path>");
      addMove(options, parts[0], parts[1]);
    } else if (argument === "--moves-file") for (const [from, to] of readMovesFile(value())) addMove(options, from, to);
    else if (argument === "--root") options.root = path.resolve(value());
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.update && (options.allowIncrease.size > 0 || options.moves.size > 0))
    throw new Error("--allow-increase, --move and --moves-file require --update");
  if (options.initialize && options.update) throw new Error("--initialize and --update are exclusive");
  return options;
}

/** Concise deterministic summary: rule and role counts, allowlisted edges by directory pair, cycles. */
export function formatSummary(analysis) {
  const { configuration, tree, layers, cycles } = analysis;
  const layerOf = (file) => analysis.assignment.get(file) ?? "?";
  const recorded = configuration.baseline.layerViolations.map((entry) => ({
    ...entry,
    pair: `${layerOf(entry.from)} -> ${layerOf(entry.to)}`,
  }));
  const value = recorded.filter((entry) => entry.kind === "value").length;
  const roleCount = Object.keys(configuration.roles).length;
  const lines = [
    `architecture rules: ${String(configuration.rules.length)} rules over ${String(tree.modules.size)} modules, ${String(roleCount)} roles`,
    `layer allowlist: ${String(recorded.length)} recorded violating edges (${String(value)} value, ${String(recorded.length - value)} type-only); ` +
      `current ${String(layers.violations.length)}`,
  ];
  for (const [pair, counts] of summarizeByPair(recorded))
    lines.push(`  ${pair}: ${String(counts.value)} value, ${String(counts.type)} type-only`);
  const twoCycles = layerTwoCycles(tree.graph, analysis.assignment);
  lines.push(
    `directory two-way value dependencies: ${String(twoCycles.length)}${twoCycles.length > 0 ? ` (${twoCycles.join(", ")})` : ""}`,
  );
  const summary = cycleSummary(cycles.current);
  lines.push(
    `file import cycles (static value imports): ${String(summary.count)} cycles over ${String(summary.files)} files; ` +
      `largest ${String(summary.largest)} files`,
  );
  if (cycles.current.length > 0) lines.push(`  largest: ${cycles.current[0].join(", ")}`);
  return lines.join("\n");
}

function runUpdate(options, analysis, baselinePath) {
  const { configuration, layers, cycles } = analysis;
  const previous = configuration.baseline;
  const result = updateArchitectureBaseline(
    layers.violations,
    cycles.current,
    analysis.baseline,
    options.allowIncrease,
  );
  if (result.refused.length > 0) {
    console.error(
      [
        "Refusing to grow the architecture baseline (pass --allow-increase <file> only for a reviewed, deliberate exception):",
        ...result.refused.map((entry) => `- ${entry.kind}: ${entry.detail}`),
      ].join("\n"),
    );
    return 1;
  }
  for (const entry of result.increased)
    console.warn(`!!! ARCHITECTURE BASELINE RAISED: ${entry.kind} ${entry.detail} !!!`);
  fs.writeFileSync(baselinePath, serializeBaseline(result.baseline));
  console.log(
    `architecture baseline written: ${String(result.baseline.layerViolations.length)} edges (was ${String(previous.layerViolations.length)}), ` +
      `${String(result.baseline.cycles.length)} cycles (was ${String(previous.cycles.length)})`,
  );
  return 0;
}

function runInitialize(analysis, baselinePath) {
  if (fs.existsSync(baselinePath)) throw new Error(`${baselinePath} already exists; use --update to lower it`);
  const structural = structuralErrors(analysis);
  if (structural.length > 0)
    throw new Error(
      ["Fix these before initializing the baseline:", ...structural.map((error) => `- ${error}`)].join("\n"),
    );
  const baseline = { layerViolations: analysis.layers.violations, cycles: analysis.cycles.current };
  fs.writeFileSync(baselinePath, serializeBaseline(baseline));
  console.warn(
    `!!! ARCHITECTURE BASELINE INITIALIZED with ${String(baseline.layerViolations.length)} edges and ${String(baseline.cycles.length)} cycles !!!`,
  );
  return 0;
}

function main() {
  const started = performance.now();
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const baselinePath = path.resolve(options.root, DEFAULT_PATHS.baseline);
  const configuration = loadConfiguration(options.root, {
    ...DEFAULT_PATHS,
    baseline: options.initialize ? null : DEFAULT_PATHS.baseline,
  });
  const analysis = analyzeTree(readSourceTree(options.root), configuration, { moves: options.moves });
  if (options.explain !== undefined) {
    console.log(explainFile(options.explain, analysis));
    return 0;
  }
  if (options.initialize) return runInitialize(analysis, baselinePath);
  console.log(formatSummary(analysis));
  const errors = gateErrors(analysis);
  if (options.update) {
    const structural = structuralErrors(analysis);
    if (structural.length > 0) {
      console.error(["Fix these before updating the baseline:", ...structural.map((error) => `- ${error}`)].join("\n"));
      return 1;
    }
    return runUpdate(options, analysis, baselinePath);
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (errors.length > 0) {
    console.error(["Source architecture gate failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
    return 1;
  }
  const tightenable = analysis.layers.tightenable.length + analysis.cycles.tightenable.length;
  const hint = tightenable > 0 ? `; ${String(tightenable)} baseline entries can be locked in with --update` : "";
  console.log(`source architecture gate passed (${seconds} s${hint})`);
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === thisFile) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
