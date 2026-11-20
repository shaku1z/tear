import path from "node:path";
import { lineEquivalents, measureSource } from "../check-code-budget.mjs";
import { extractImports, resolveSpecifier } from "./source-graph.mjs";

export function ruleApplies(rule, file, resolver) {
  return resolver.matchesAny(rule.in, file) && !resolver.matchesAny(rule.except ?? [], file);
}

/** A module in an import rule's `to`, minus its `toExcept`. */
function targetSelected(rule, file, resolver) {
  return resolver.matchesAny(rule.to, file) && !resolver.matchesAny(rule.toExcept ?? [], file);
}

function edgeQualifies(rule, record) {
  const edges = rule.edges ?? "any";
  if (edges === "any") return true;
  if (record.typeOnly) return false;
  return edges === "value" || !record.dynamic;
}

function targetMatches(rule, resolution, resolver) {
  const candidates = resolution.resolved ? [resolution.target] : [resolution.target, `${resolution.target}.ts`];
  return candidates.some((candidate) => targetSelected(rule, candidate, resolver));
}

function snippet(text) {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}

export function finding(rule, file, detail) {
  return Object.freeze({ rule: rule.id, file, message: rule.message, detail });
}

function importFindings(rule, file, imports, context) {
  const reported = new Set(),
    findings = [];
  for (const record of imports) {
    if (!edgeQualifies(rule, record)) continue;
    const resolution = resolveSpecifier(file, record.specifier, context.available);
    if (resolution.external || reported.has(resolution.target) || !targetMatches(rule, resolution, context.resolver))
      continue;
    reported.add(resolution.target);
    const kind = record.typeOnly ? "type-only " : record.dynamic ? "dynamic " : "";
    findings.push(finding(rule, file, `${kind}import of ${resolution.target}`));
  }
  return findings;
}

/**
 * Module size in line equivalents: the code budget's formatting-independent character measure
 * (non-whitespace characters outside import wiring) scaled so that its ceiling is 700 lines.
 * Physical lines are not used because they depend on formatting. A module over the limit passes
 * only while config/code-budget-baseline.json records its size debt and it has not grown past it.
 */
function sizeFindings(rule, file, text, context) {
  const { chars } = measureSource(file, text);
  const size = lineEquivalents(chars);
  if (size <= rule.max) return [];
  const allowance = context.sizeAllowances?.get(file);
  if (allowance !== undefined && chars <= allowance) return [];
  const recorded = allowance === undefined ? "no recorded code-budget size debt" : `recorded ${String(allowance)}`;
  return [finding(rule, file, `${String(size)} line equivalents: ${String(chars)} chars, ${recorded}`)];
}

/** Findings of one rule for one module; the module must already be in the rule's scope. */
export function evaluateRule(rule, file, module, context) {
  if (rule.kind === "import") return importFindings(rule, file, module.imports, context);
  if (rule.kind === "text") {
    const match = rule.pattern.exec(module.text);
    return match === null ? [] : [finding(rule, file, `matched "${snippet(match[0])}"`)];
  }
  if (rule.kind === "size") return sizeFindings(rule, file, module.text, context);
  return [];
}

/** Every rule finding for one module text, e.g. a planted fixture or a single file under --explain. */
export function evaluateText(rules, file, text, context) {
  const module = { text, imports: extractImports(file, text) };
  return rules
    .filter((rule) => ruleApplies(rule, file, context.resolver))
    .flatMap((rule) => evaluateRule(rule, file, module, context));
}

function chain(parents, node) {
  const hops = [];
  for (let current = node; current !== undefined; current = parents.get(current)) hops.unshift(current);
  return hops;
}

/**
 * Transitive reach over every edge (type-only and dynamic included). Direct
 * edges are reported by the import check, so only paths with at least one
 * intermediate module are findings here; the first such path per source wins.
 */
export function transitiveFindings(rule, graph, resolver) {
  const findings = [];
  for (const source of graph.keys()) {
    if (!ruleApplies(rule, source, resolver)) continue;
    const parents = new Map((graph.get(source) ?? []).map((edge) => [edge.to, undefined]));
    const queue = [...parents.keys()];
    // The array iterator re-reads the length, so modules appended below are visited too (breadth first).
    for (const node of queue) {
      if (targetSelected(rule, node, resolver)) {
        if (parents.get(node) === undefined) continue;
        findings.push(finding(rule, source, `transitively through ${chain(parents, node).join(" -> ")}`));
        break;
      }
      for (const edge of graph.get(node) ?? []) {
        if (edge.to === source || parents.has(edge.to)) continue;
        parents.set(edge.to, node);
        queue.push(edge.to);
      }
    }
  }
  return findings;
}

/** All rule findings for the tree, sorted by file then rule. */
export function evaluateTree(rules, tree, resolver, { sizeAllowances = new Map() } = {}) {
  const context = { resolver, available: tree.available, sizeAllowances };
  const findings = [];
  for (const rule of rules.filter((candidate) => candidate.kind === "extension")) {
    for (const file of tree.files)
      if (ruleApplies(rule, file, resolver)) findings.push(finding(rule, file, "file exists"));
  }
  for (const [file, module] of tree.modules) {
    for (const rule of rules)
      if (rule.kind !== "extension" && ruleApplies(rule, file, resolver))
        findings.push(...evaluateRule(rule, file, module, context));
  }
  for (const rule of rules.filter((candidate) => candidate.transitive === true))
    findings.push(...transitiveFindings(rule, tree.graph, resolver));
  return findings.sort(
    (left, right) => left.file.localeCompare(right.file, "en") || left.rule.localeCompare(right.rule, "en"),
  );
}

export function formatFinding({ file, message, detail, rule }) {
  return `${file}: ${message} (${detail}) [${rule}]`;
}

function firstMember(selectors, except, files, resolver) {
  return files.find((file) => resolver.matchesAny(selectors, file) && !resolver.matchesAny(except, file));
}

function concreteTarget(selector, files, resolver) {
  if (!selector.startsWith("@")) return selector;
  return firstMember([selector], [], files, resolver);
}

function relativeSpecifier(from, target) {
  const relative = path.posix.relative(path.posix.dirname(from), target.replace(/\.ts$/u, ""));
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/** Turns a declarative fixture into module text for a concrete file. */
export function fixtureText(fixture, file, files, resolver) {
  if (fixture.text !== undefined) return fixture.text;
  const selector = fixture.imports ?? fixture.reexports ?? fixture.dynamic;
  const target = concreteTarget(selector, files, resolver);
  if (target === undefined) throw new Error(`fixture target ${selector} has no member`);
  const specifier = relativeSpecifier(file, target);
  if (fixture.reexports !== undefined) return `export * from "${specifier}";`;
  if (fixture.dynamic !== undefined) return `export const planted = import("${specifier}");`;
  return `import ${fixture.type === true ? "type " : ""}{ ${fixture.names ?? "planted"} } from "${specifier}";`;
}

function fixtureFile(rule, fixture, files, resolver) {
  if (fixture.file !== undefined) return concreteTarget(fixture.file, files, resolver);
  return firstMember(rule.in, rule.except ?? [], files, resolver);
}

/**
 * Re-proves every rule on each run: each `reject` fixture planted in a current
 * member of the rule's scope must produce exactly one finding of that rule and
 * each `accept` fixture none. A rule whose scope lost its members, or whose
 * pattern no longer fires, fails here instead of passing silently.
 */
export function runRuleFixtures(rules, tree, resolver) {
  const context = { resolver, available: tree.available },
    files = [...tree.modules.keys()],
    errors = [];
  for (const rule of rules) {
    for (const [expectation, fixtures] of [
      ["reject", rule.fixtures?.reject ?? []],
      ["accept", rule.fixtures?.accept ?? []],
    ]) {
      for (const fixture of fixtures) {
        const file = fixtureFile(rule, fixture, files, resolver);
        if (file === undefined || !ruleApplies(rule, file, resolver)) {
          errors.push(`rule ${rule.id}: no current module in scope for its ${expectation} fixture`);
          continue;
        }
        const text = fixtureText(fixture, file, files, resolver);
        const count = evaluateRule(rule, file, { text, imports: extractImports(file, text) }, context).length;
        if (count !== (expectation === "reject" ? 1 : 0))
          errors.push(`rule ${rule.id}: ${expectation} fixture in ${file} produced ${String(count)} findings: ${text}`);
      }
    }
  }
  return errors;
}
