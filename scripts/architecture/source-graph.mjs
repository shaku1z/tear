import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Lists every file under `<root>/src` as a sorted repository-relative POSIX path. */
export function listSourceFiles(root, directory = "src") {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return listSourceFiles(root, relative);
      return entry.isFile() ? [relative] : [];
    });
}

function bindingNames(clause) {
  const names = [];
  let namespace = clause.name !== undefined;
  const bindings = clause.namedBindings;
  if (bindings !== undefined && ts.isNamespaceImport(bindings)) namespace = true;
  else if (bindings !== undefined) {
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
    }
  }
  return { names, namespace };
}

function importDeclarationRecord(node) {
  const specifier = node.moduleSpecifier.text;
  const clause = node.importClause;
  if (clause === undefined)
    return { specifier, typeOnly: false, dynamic: false, reexport: false, names: [], namespace: true };
  const { names, namespace } = bindingNames(clause);
  const elements =
    clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
  const allTypeElements =
    elements.length > 0 && elements.every((element) => element.isTypeOnly) && clause.name === undefined;
  return {
    specifier,
    typeOnly: clause.isTypeOnly || allTypeElements,
    dynamic: false,
    reexport: false,
    names,
    namespace,
  };
}

function exportDeclarationRecord(node) {
  const specifier = node.moduleSpecifier.text;
  const clause = node.exportClause;
  if (clause === undefined || ts.isNamespaceExport(clause)) {
    return {
      specifier,
      typeOnly: node.isTypeOnly,
      dynamic: false,
      reexport: true,
      names: [],
      namespace: !node.isTypeOnly,
    };
  }
  const values = clause.elements.filter((element) => !element.isTypeOnly);
  const names = values.map((element) => (element.propertyName ?? element.name).text);
  return {
    specifier,
    typeOnly: node.isTypeOnly || values.length === 0,
    dynamic: false,
    reexport: true,
    names,
    namespace: false,
  };
}

function isDynamicImport(node) {
  return (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0 &&
    ts.isStringLiteralLike(node.arguments[0])
  );
}

function importTypeRecord(node) {
  const argument = node.argument;
  if (!ts.isLiteralTypeNode(argument) || !ts.isStringLiteralLike(argument.literal)) return undefined;
  return {
    specifier: argument.literal.text,
    typeOnly: true,
    dynamic: false,
    reexport: false,
    names: [],
    namespace: true,
  };
}

function nodeRecord(node) {
  if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier))
    return importDeclarationRecord(node);
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return exportDeclarationRecord(node);
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    const specifier = node.moduleReference.expression.text;
    return { specifier, typeOnly: node.isTypeOnly, dynamic: false, reexport: false, names: [], namespace: true };
  }
  if (isDynamicImport(node)) {
    return {
      specifier: node.arguments[0].text,
      typeOnly: false,
      dynamic: true,
      reexport: false,
      names: [],
      namespace: true,
    };
  }
  if (ts.isImportTypeNode(node)) return importTypeRecord(node);
  return undefined;
}

/**
 * Every module reference in one TypeScript source, read with the compiler parser:
 * static imports and re-exports, `import x = require()`, dynamic `import()` and
 * `import("...")` type queries. Type-only references are flagged so the layering
 * check can tell an erased type dependency from a runtime one.
 */
export function extractImports(fileName, text) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const records = [];
  const visit = (node) => {
    const record = nodeRecord(node);
    if (record !== undefined) records.push(record);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return records;
}

const RESOLUTION_SUFFIXES = Object.freeze([".ts", ".d.ts", "/index.ts", ""]);

/**
 * Resolves a specifier like the bundler does for repository sources. Returns the
 * existing file, or the normalised candidate path with `resolved: false` so that
 * a rule can still judge an import whose target does not exist (planted fixtures).
 * Bare package specifiers resolve to `npm:<name>`.
 */
export function resolveSpecifier(fromFile, specifier, available) {
  if (!specifier.startsWith(".")) return { target: `npm:${specifier}`, resolved: false, external: true };
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const stem = candidate.endsWith(".js") ? candidate.slice(0, -3) : candidate;
  for (const base of stem === candidate ? [candidate] : [stem, candidate]) {
    for (const suffix of RESOLUTION_SUFFIXES) {
      if (available.has(`${base}${suffix}`)) return { target: `${base}${suffix}`, resolved: true, external: false };
    }
  }
  return { target: candidate, resolved: false, external: false };
}

/** Edge kind lattice: a value edge also carries every type dependency. */
export function strongerKind(left, right) {
  return left === "value" || right === "value" ? "value" : "type";
}

function mergeEdge(edges, record, resolution) {
  const kind = record.typeOnly ? "type" : "value";
  const existing = edges.get(resolution.target);
  if (existing === undefined) {
    edges.set(resolution.target, {
      to: resolution.target,
      kind,
      staticValue: kind === "value" && !record.dynamic,
      resolved: resolution.resolved,
    });
    return;
  }
  existing.kind = strongerKind(existing.kind, kind);
  existing.staticValue ||= kind === "value" && !record.dynamic;
}

/** Collapses one file's module references into at most one edge per internal target. */
export function fileEdges(fromFile, records, available) {
  const edges = new Map();
  for (const record of records) {
    const resolution = resolveSpecifier(fromFile, record.specifier, available);
    if (!resolution.external) mergeEdge(edges, record, resolution);
  }
  return [...edges.values()].sort((left, right) => left.to.localeCompare(right.to, "en"));
}

/**
 * Reads the source tree once: the text and module references of every `.ts`
 * file plus the internal edge list. `files` holds every path under src (any
 * extension) so structural checks can see stray JavaScript.
 */
export function readSourceTree(root) {
  const files = listSourceFiles(root);
  const available = new Set(files);
  const modules = new Map();
  for (const file of files.filter((candidate) => candidate.endsWith(".ts"))) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    modules.set(file, { text, imports: extractImports(file, text) });
  }
  const tree = createSourceTree(files, modules, available);
  return { ...tree, unresolved: unresolvedEdges(root, tree.graph) };
}

/**
 * Relative imports that reach no file. Targets outside src (repository data
 * such as config/*.json) are fine when they exist on disk; anything else would
 * silently drop an edge from the layer and cycle checks, so it is reported.
 */
export function unresolvedEdges(root, graph) {
  const missing = [];
  for (const [from, edges] of graph) {
    for (const edge of edges) {
      if (edge.resolved) continue;
      const outside =
        !edge.to.startsWith("src/") &&
        RESOLUTION_SUFFIXES.some((suffix) => fs.existsSync(path.join(root, `${edge.to}${suffix}`)));
      if (!outside) missing.push({ from, to: edge.to });
    }
  }
  return missing;
}

/** Builds the tree object from in-memory modules; used by tests and planted fixtures. */
export function createSourceTree(files, modules, available = new Set(files)) {
  const graph = new Map();
  for (const [file, module] of modules) graph.set(file, fileEdges(file, module.imports, available));
  return { files, available, modules, graph };
}
