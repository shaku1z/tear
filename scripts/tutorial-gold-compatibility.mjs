import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

/**
 * Part of every fingerprint. Change it whenever the normalisation below
 * changes meaning, so an old binding can never match by accident.
 */
export const FINGERPRINT_SCHEME = "tear-tutorial-gold-fingerprint.v2";
export const TUTORIAL_GOLD_ROOTS = Object.freeze([
  "src/gameplay/entities/player.ts",
  "src/gameplay/entities/blade.ts",
  "src/gameplay/combat/live-opening-phase.ts",
  "src/gameplay/combat/live-collision-phase.ts",
  "src/gameplay/training/live-tutorial-runtime.ts",
  "src/gameplay/training/tutorial-gold-reference.ts",
  "src/tearbench/tutorial-course-driver.ts",
  "src/tearbench/tutorial-gold-generation.ts",
  "src/gameplay/training/tutorial-controller.ts",
  "src/gameplay/training/tutorial-arenas.ts",
  "src/tearbench/production-replay-composition.ts",
]);
export const SHIPPING_CORPUS = "src/gameplay/training/tutorial-gold-reference-data.json";
export const SHIPPING_BINDING = "src/gameplay/training/tutorial-gold-binding.json";
export const BINDING_FORMAT = "tear-tutorial-gold-binding.v1";
const GENERATED_OUTPUTS = new Set([SHIPPING_CORPUS, SHIPPING_BINDING]);
const REGENERATE_HINT =
  "set TEAR_TUTORIAL_GOLD_WRITE=1 and run pnpm exec vitest run tests/unit/tutorial-production-ghost.test.ts before building";

/** First declared name per SyntaxKind value; later aliases such as FirstToken are markers. */
const KIND_NAMES = (() => {
  const names = new Map();
  for (const [name, value] of Object.entries(ts.SyntaxKind))
    if (typeof value === "number" && !names.has(value)) names.set(value, name);
  return names;
})();
const PROPERTY_NAME_PARENTS = new Set([
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.EnumMember,
]);
const TEMPLATE_KINDS = new Set([
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);
const DROPPED_TOKENS = new Set([
  ts.SyntaxKind.OpenParenToken,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.EndOfFileToken,
]);

function isTypeOnlyModuleDeclaration(node) {
  if (ts.isImportDeclaration(node)) return node.importClause?.isTypeOnly === true;
  if (ts.isExportDeclaration(node)) return node.isTypeOnly && node.moduleSpecifier !== undefined;
  return ts.isImportEqualsDeclaration(node) && node.isTypeOnly;
}

function isValueModuleSpecifier(node) {
  const parent = node.parent;
  if (!ts.isStringLiteral(node) || parent === undefined) return false;
  if ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node)
    return true;
  if (ts.isExternalModuleReference(parent)) return true;
  return (
    ts.isCallExpression(parent) &&
    parent.expression.kind === ts.SyntaxKind.ImportKeyword &&
    parent.arguments[0] === node
  );
}

/**
 * Tokens a formatter adds or removes without changing meaning: grouping
 * parentheses (structure is serialised explicitly), list separators,
 * statement-terminating semicolons, empty statements and a leading union bar.
 */
function isFormattingToken(node, parent, index) {
  const kind = node.kind;
  if (DROPPED_TOKENS.has(kind)) return true;
  if (kind === ts.SyntaxKind.CommaToken) return parent.kind !== ts.SyntaxKind.BinaryExpression;
  if (kind === ts.SyntaxKind.SemicolonToken) return parent.kind !== ts.SyntaxKind.ForStatement;
  if (index !== 0 || (kind !== ts.SyntaxKind.BarToken && kind !== ts.SyntaxKind.AmpersandToken)) return false;
  const owner = parent.kind === ts.SyntaxKind.SyntaxList ? parent.parent : parent;
  return owner?.kind === ts.SyntaxKind.UnionType || owner?.kind === ts.SyntaxKind.IntersectionType;
}

function tokenText(node, parent, resolveImport, targets) {
  const kind = node.kind;
  if (kind === ts.SyntaxKind.Identifier || kind === ts.SyntaxKind.PrivateIdentifier) return `id:${node.text}`;
  if (kind === ts.SyntaxKind.StringLiteral) {
    if (PROPERTY_NAME_PARENTS.has(parent.kind) && parent.name === node) return `id:${node.text}`;
    if (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) return "@type-module";
    const target = isValueModuleSpecifier(node) ? resolveImport(node.text) : undefined;
    if (target !== undefined) {
      targets.push(target);
      return "@module";
    }
    return `str:${JSON.stringify(node.text)}`;
  }
  if (kind === ts.SyntaxKind.NumericLiteral) return `num:${String(Number(node.text.replaceAll("_", "")))}`;
  if (TEMPLATE_KINDS.has(kind)) return `${KIND_NAMES.get(kind)}:${JSON.stringify(node.rawText ?? node.text)}`;
  if (kind === ts.SyntaxKind.BigIntLiteral || kind === ts.SyntaxKind.RegularExpressionLiteral)
    return `${KIND_NAMES.get(kind)}:${node.text}`;
  return KIND_NAMES.get(kind);
}

function serialize(node, parent, index, context) {
  const kind = node.kind;
  if (kind >= ts.SyntaxKind.FirstJSDocNode && kind <= ts.SyntaxKind.LastJSDocNode) return;
  if (
    isTypeOnlyModuleDeclaration(node) ||
    kind === ts.SyntaxKind.EmptyStatement ||
    kind === ts.SyntaxKind.SemicolonClassElement
  )
    return;
  const children = node.getChildren(context.source);
  if (children.length === 0) {
    if (kind !== ts.SyntaxKind.SyntaxList && !isFormattingToken(node, parent, index))
      context.tokens.push(tokenText(node, parent, context.resolveImport, context.targets));
    return;
  }
  const grouping = kind === ts.SyntaxKind.ParenthesizedExpression || kind === ts.SyntaxKind.ParenthesizedType;
  if (!grouping) context.tokens.push(`(${KIND_NAMES.get(kind)}`);
  children.forEach((child, childIndex) => {
    serialize(child, node, childIndex, context);
  });
  if (!grouping) context.tokens.push(")");
}

/**
 * Formatting-, comment- and path-independent form of one module. Resolved
 * value-import specifiers become `@module` placeholders whose targets are
 * returned in order; type-only imports carry no behaviour and are dropped.
 */
export function normalizeModuleSource(fileName, text, resolveImport = () => undefined) {
  if (fileName.endsWith(".json")) return { stream: `json:${JSON.stringify(JSON.parse(text))}`, targets: [] };
  const source = ts.createSourceFile(
    fileName,
    text,
    { languageVersion: ts.ScriptTarget.Latest, jsDocParsingMode: ts.JSDocParsingMode.ParseNone },
    true,
    ts.ScriptKind.TS,
  );
  const context = { source, resolveImport, targets: [], tokens: [] };
  serialize(source, source, 0, context);
  return { stream: context.tokens.join("\n"), targets: context.targets };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function moduleResolver(root, file) {
  return (specifier) => {
    if (!specifier.startsWith(".")) return undefined;
    const base = resolve(dirname(resolve(root, file)), specifier);
    const match = [`${base}.ts`, `${base}.json`, `${base}/index.ts`, base].find(
      (candidate) => /\.(ts|json)$/u.test(candidate) && existsSync(candidate),
    );
    return match === undefined ? undefined : relative(root, match).replaceAll("\\", "/");
  };
}

/** Normalised modules of the transitive value-import closure of roots, keyed by repository-relative path. */
export function collectTutorialGoldModules(root = process.cwd(), roots = TUTORIAL_GOLD_ROOTS) {
  const modules = new Map(),
    pending = [...roots];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file.startsWith("../") || GENERATED_OUTPUTS.has(file) || modules.has(file)) continue;
    const absolute = resolve(root, file);
    if (!existsSync(absolute))
      throw new Error(
        `tutorial gold fingerprint input ${file} does not exist; update TUTORIAL_GOLD_ROOTS after a move`,
      );
    const normalized = normalizeModuleSource(file, readFileSync(absolute, "utf8"), moduleResolver(root, file));
    modules.set(file, normalized);
    pending.push(...normalized.targets);
  }
  return modules;
}

/**
 * Order- and path-free combination: each module is identified by the hash of
 * its normalised text plus the hashes of the modules it imports, and the
 * sorted identities are hashed together with the scheme.
 */
export function combineModuleFingerprint(modules) {
  const local = new Map([...modules].map(([file, { stream }]) => [file, sha256(stream)]));
  // Generated gold outputs are imported but never hashed (they embed this fingerprint); they count by role.
  for (const output of GENERATED_OUTPUTS) local.set(output, `generated:${output.slice(output.lastIndexOf("/") + 1)}`);
  const identities = [...modules].map(([file, { targets }]) =>
    sha256([local.get(file), ...targets.map((target) => local.get(target))].join("\n")),
  );
  return sha256([FINGERPRINT_SCHEME, ...identities.sort()].join("\n"));
}

/** Behaviour fingerprint of the tutorial gold source closure; no generated outputs, Git state or timestamps. */
export function tutorialGoldSourceFingerprint(root = process.cwd(), roots = TUTORIAL_GOLD_ROOTS) {
  const modules = collectTutorialGoldModules(root, roots);
  return Object.freeze({
    sourceHash: combineModuleFingerprint(modules),
    files: Object.freeze([...modules.keys()].sort()),
  });
}

/** Builds check compatibility only; they never train, simulate or rewrite generated assets. */
export function assertTutorialGoldFresh(root = process.cwd()) {
  const expected = tutorialGoldSourceFingerprint(root).sourceHash;
  const binding = JSON.parse(readFileSync(resolve(root, SHIPPING_BINDING), "utf8"));
  const corpus = JSON.parse(readFileSync(resolve(root, SHIPPING_CORPUS), "utf8"));
  if (binding?.format !== BINDING_FORMAT || binding.sourceHash !== expected)
    throw new Error(`Tutorial gold references are stale; ${REGENERATE_HINT}`);
  if (corpus?.format !== "tear-tutorial-gold.v1" || corpus.contentHash !== binding.corpusContentHash) {
    throw new Error(`Tutorial gold binding does not match its corpus; ${REGENERATE_HINT}`);
  }
  return expected;
}
