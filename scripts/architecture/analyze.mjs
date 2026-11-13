import path from "node:path";
import {
  DEFAULT_BASELINE_PATH as CODE_BUDGET_BASELINE_PATH,
  readBaseline as readBudgetBaseline,
} from "../check-code-budget.mjs";
import { applyMoves, parseBaseline, readJson } from "./baseline.mjs";
import { compareCycles, findCycles, valueGraph } from "./cycles.mjs";
import { evaluateTree, formatFinding, runRuleFixtures } from "./evaluate.mjs";
import { assignLayers, compareLayerAllowlist, layerViolations, parseLayers } from "./layering.mjs";
import { RULES, ruleSelectorUsages } from "./rules.mjs";
import { createSelectorResolver, parseRoles, validateCoverage } from "./selectors.mjs";

export const DEFAULT_PATHS = Object.freeze({
  roles: "config/architecture-roles.json",
  layers: "config/architecture-layers.json",
  baseline: "config/architecture-baseline.json",
  codeBudget: CODE_BUDGET_BASELINE_PATH,
});

/**
 * Recorded size debt from the code budget baseline: file -> recorded chars. A module over the
 * size limit is held by that ratchet (its chars may only fall) instead of failing here.
 */
export function sizeAllowances(budgetFiles) {
  return new Map(
    Object.entries(budgetFiles)
      .filter(([, entry]) => Number.isFinite(entry?.chars))
      .map(([file, entry]) => [file, entry.chars]),
  );
}

/**
 * Reads the configuration documents relative to the repository root; `baseline: null` starts from an
 * empty baseline and `codeBudget: null` from no recorded size debt.
 */
export function loadConfiguration(root, paths = DEFAULT_PATHS, rules = RULES) {
  const baseline =
    paths.baseline === null
      ? { layerViolations: [], cycles: [] }
      : parseBaseline(
          readJson(path.resolve(root, paths.baseline), "architecture baseline; create it with --initialize"),
        );
  const codeBudget = paths.codeBudget ?? null;
  return {
    rules,
    roles: parseRoles(readJson(path.resolve(root, paths.roles), "architecture role map")),
    layers: parseLayers(readJson(path.resolve(root, paths.layers), "architecture layering")),
    baseline,
    sizeAllowances:
      codeBudget === null ? new Map() : sizeAllowances(readBudgetBaseline(path.resolve(root, codeBudget))),
  };
}

function configurationErrors(configuration, tree, resolver) {
  const errors = validateCoverage(configuration.roles, tree.files, ruleSelectorUsages(configuration.rules));
  const ids = configuration.rules.map((rule) => rule.id);
  for (const id of ids.filter((value, index) => ids.indexOf(value) !== index))
    errors.push(`rule id ${id} is declared twice`);
  if (errors.length === 0) errors.push(...runRuleFixtures(configuration.rules, tree, resolver));
  return errors;
}

/**
 * The whole gate over one source tree: fail-closed configuration coverage,
 * re-proved rule fixtures, rule findings, layer violations against the
 * allowlist, and import cycles against the recorded cycles.
 */
export function analyzeTree(tree, configuration, { moves = new Map() } = {}) {
  const resolver = createSelectorResolver(configuration.roles);
  const configErrors = configurationErrors(configuration, tree, resolver);
  const findings =
    configErrors.length === 0
      ? evaluateTree(configuration.rules, tree, resolver, { sizeAllowances: configuration.sizeAllowances })
      : [];
  const { assignment, errors: layerErrors } = assignLayers(tree.files, configuration.layers.layers);
  const baseline = applyMoves(configuration.baseline, moves);
  const violations = layerViolations(tree.graph, assignment, configuration.layers.allow);
  const layers = { violations, ...compareLayerAllowlist(violations, baseline.layerViolations, tree.available) };
  const cycleList = findCycles(valueGraph(tree.graph));
  const cycles = { current: cycleList, ...compareCycles(cycleList, baseline.cycles, tree.available) };
  return { configuration, resolver, tree, assignment, baseline, configErrors, layerErrors, findings, layers, cycles };
}

const UPDATE_HINT = "node scripts/check-source-architecture.mjs --update";

/** Failures --update cannot resolve: configuration coverage, fixtures, layer assignment and rule findings. */
export function structuralErrors(analysis) {
  return [
    ...analysis.configErrors.map(
      (error) =>
        `${error} (update config/architecture-roles.json in the same change that moved, renamed or deleted it)`,
    ),
    ...analysis.layerErrors,
    ...(analysis.tree.unresolved ?? []).map(
      ({ from, to }) => `${from}: relative import of ${to} reaches no file, so the import graph would be incomplete`,
    ),
    ...analysis.findings.map(formatFinding),
  ];
}

/** Every failing condition as one actionable line. */
export function gateErrors(analysis) {
  const { layers, cycles } = analysis;
  return [
    ...structuralErrors(analysis),
    ...layers.unexpected.map(
      (edge) =>
        `${edge.from} -> ${edge.to} (${edge.kind}): ${edge.pair} is not an allowed layer edge ` +
        `(config/architecture-layers.json); remove the import, or record a reviewed exception with ${UPDATE_HINT} --allow-increase ${edge.from}`,
    ),
    ...layers.stale.map(
      (entry) =>
        `allowlisted edge ${entry.from} -> ${entry.to} names a file that no longer exists; ` +
        `run ${UPDATE_HINT} (with --move <old>=<new> or --moves-file <json> for moved files)`,
    ),
    ...cycles.unexpected.map(
      (cycle) =>
        `new or grown import cycle of ${String(cycle.length)} files: ${cycle.join(" <-> ")}; ` +
        `break it, or record a reviewed exception with ${UPDATE_HINT} --allow-increase <file>`,
    ),
    ...cycles.stale.map(
      (cycle) =>
        `recorded cycle (${String(cycle.length)} files) names a file that no longer exists: ` +
        `${cycle.filter((file) => !analysis.tree.available.has(file)).join(", ")}; run ${UPDATE_HINT} (with --move/--moves-file)`,
    ),
  ];
}
