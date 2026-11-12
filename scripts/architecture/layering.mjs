import { matchesGlob } from "./selectors.mjs";

export const LAYERS_FORMAT = "tear-architecture-layers.v1";
const PERMISSIONS = new Set(["any", "type"]);

/** Validates the layer document: globs per layer and permitted cross-layer edges. */
export function parseLayers(document) {
  if (document?.format !== LAYERS_FORMAT || typeof document.layers !== "object" || typeof document.allow !== "object") {
    throw new Error(`architecture layers must be a ${LAYERS_FORMAT} document`);
  }
  const names = new Set(Object.keys(document.layers)), problems = [];
  for (const [name, globs] of Object.entries(document.layers)) {
    if (!Array.isArray(globs) || globs.length === 0) problems.push(`layer ${name} needs at least one glob`);
  }
  for (const [from, targets] of Object.entries(document.allow)) {
    if (!names.has(from)) problems.push(`allow.${from} is not a layer`);
    for (const [to, permission] of Object.entries(targets)) {
      if (!names.has(to)) problems.push(`allow.${from}.${to} is not a layer`);
      if (!PERMISSIONS.has(permission)) problems.push(`allow.${from}.${to} must be "any" or "type"`);
      if (to === from) problems.push(`allow.${from}.${to} is implicit`);
    }
  }
  if (problems.length > 0) throw new Error(`invalid architecture layers:\n- ${problems.join("\n- ")}`);
  return { layers: document.layers, allow: document.allow };
}

/** Every src file belongs to exactly one layer; anything else is an error, so a new directory must be placed. */
export function assignLayers(files, layers) {
  const assignment = new Map(), errors = [];
  for (const file of files) {
    const owners = Object.entries(layers).filter(([, globs]) => globs.some((glob) => matchesGlob(glob, file))).map(([name]) => name);
    if (owners.length === 1) assignment.set(file, owners[0]);
    else if (owners.length === 0) errors.push(`${file}: belongs to no layer in config/architecture-layers.json`);
    else errors.push(`${file}: belongs to several layers (${owners.join(", ")})`);
  }
  for (const [name, globs] of Object.entries(layers)) {
    for (const glob of globs) if (!files.some((file) => matchesGlob(glob, file))) errors.push(`layer ${name}: "${glob}" matches no file`);
  }
  return { assignment, errors };
}

export function permits(allow, fromLayer, toLayer, kind) {
  if (fromLayer === toLayer) return true;
  const permission = allow[fromLayer]?.[toLayer];
  return permission === "any" || (permission === "type" && kind === "type");
}

/** Cross-layer edges the layer document does not permit, one per file pair, with their strongest kind. */
export function layerViolations(graph, assignment, allow) {
  const violations = [];
  for (const [from, edges] of graph) {
    const fromLayer = assignment.get(from);
    for (const edge of edges) {
      const toLayer = assignment.get(edge.to);
      if (fromLayer === undefined || toLayer === undefined || permits(allow, fromLayer, toLayer, edge.kind)) continue;
      violations.push({ from, to: edge.to, kind: edge.kind, pair: `${fromLayer} -> ${toLayer}` });
    }
  }
  return violations.sort((left, right) => left.from.localeCompare(right.from, "en") || left.to.localeCompare(right.to, "en"));
}

const edgeKey = (edge) => `${edge.from} -> ${edge.to}`;

/**
 * Compares today's violating edges with the allowlist. A new edge, or a
 * type-only allowance that became a value import, is unexpected; an entry
 * whose source or target file is gone is stale (fails, so moves update the
 * list); an entry that no longer occurs, or weakened to type-only, is
 * tightenable and can be locked in with --update.
 */
export function compareLayerAllowlist(violations, allowlist, available) {
  const recorded = new Map(allowlist.map((entry) => [edgeKey(entry), entry]));
  const current = new Map(violations.map((entry) => [edgeKey(entry), entry]));
  const unexpected = violations.filter((edge) => {
    const entry = recorded.get(edgeKey(edge));
    return entry === undefined || (entry.kind === "type" && edge.kind === "value");
  });
  const stale = allowlist.filter((entry) => !available.has(entry.from) || !available.has(entry.to));
  const tightenable = allowlist.filter((entry) => {
    if (!available.has(entry.from) || !available.has(entry.to)) return false;
    const edge = current.get(edgeKey(entry));
    return edge === undefined || (entry.kind === "value" && edge.kind === "type");
  });
  return { unexpected, stale, tightenable };
}

/** Layer pairs that import each other with value edges (directory-level two-cycles), sorted. */
export function layerTwoCycles(graph, assignment) {
  const pairs = new Set();
  for (const [from, edges] of graph) {
    for (const edge of edges) {
      const fromLayer = assignment.get(from), toLayer = assignment.get(edge.to);
      if (edge.kind === "value" && fromLayer !== undefined && toLayer !== undefined && fromLayer !== toLayer) pairs.add(`${fromLayer}\n${toLayer}`);
    }
  }
  return [...pairs].map((pair) => pair.split("\n")).filter(([from, to]) => from < to && pairs.has(`${to}\n${from}`))
    .map(([from, to]) => `${from} <-> ${to}`).sort((left, right) => left.localeCompare(right, "en"));
}

/** Counts of edges by directory pair and kind, for the report. */
export function summarizeByPair(edges) {
  const pairs = new Map();
  for (const edge of edges) {
    const counts = pairs.get(edge.pair) ?? { value: 0, type: 0 };
    counts[edge.kind] += 1;
    pairs.set(edge.pair, counts);
  }
  return new Map([...pairs].sort(([left], [right]) => left.localeCompare(right, "en")));
}
