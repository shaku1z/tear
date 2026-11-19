import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { changedFiles } from "./changed-files.mjs";

export const BASELINE_FORMAT = "tear-code-budget-baseline.v1";
export const DEFAULT_BASELINE_PATH = "config/code-budget-baseline.json";
export const BUDGET_METRICS = Object.freeze([
  "chars",
  "maxLineLength",
  "multiStatementLines",
  "largestFunctionStatements",
]);

/**
 * Absolute ceilings for every file without a baseline entry. Units:
 * - chars: non-whitespace characters, so splitting, joining, re-indenting or
 *   re-spacing code (what a formatter does) never counts as growth. The ceiling
 *   is the former 28,000 trimmed characters (~ 700 lines x 40) re-derived on
 *   this basis: across src at the switch, non-whitespace characters were 0.9044
 *   of trimmed characters, so 28,000 x 0.9044 = 25,323, rounded down to 25,300
 *   (~ 700 lines x 36). Every file over the old ceiling is over the new one.
 *   Import and re-export declarations and the module specifier of a dynamic
 *   `import()` or an `import("...")` type do not count: they are wiring, not
 *   code, and moving a module must not register as growth in its importers.
 * - maxLineLength: longest line, not counting string/template/regex literal
 *   text, and ignoring import and re-export declarations.
 * - multiStatementLines: lines where two or more statements or class members
 *   begin. A guard such as `if (done) return;` is one statement.
 * - largestFunctionStatements: statements owned by the largest function,
 *   excluding statements of nested functions.
 */
export const NEW_FILE_CEILINGS = Object.freeze({
  chars: 25_300,
  maxLineLength: 160,
  multiStatementLines: 0,
  largestFunctionStatements: 80,
});

/** The module size, in lines, that the chars ceiling stands for; `pnpm check:architecture` uses the same measure. */
export const MODULE_LINE_EQUIVALENTS = 700;

/** A file's size in line equivalents: its chars metric scaled so that the chars ceiling is MODULE_LINE_EQUIVALENTS. */
export function lineEquivalents(chars, ceilings = NEW_FILE_CEILINGS) {
  return Math.ceil((chars * MODULE_LINE_EQUIVALENTS) / ceilings.chars);
}

const METRIC_LABELS = Object.freeze({
  chars: "chars",
  maxLineLength: "max line",
  multiStatementLines: "multi-statement lines",
  largestFunctionStatements: "largest function",
});
const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
]);
const LITERAL_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
]);

function isCountedStatement(node) {
  return ts.isStatement(node) && node.kind !== ts.SyntaxKind.Block && node.kind !== ts.SyntaxKind.EmptyStatement;
}

function isImportLike(node) {
  return (
    ts.isImportDeclaration(node) ||
    ts.isImportEqualsDeclaration(node) ||
    (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined)
  );
}

/** The string literal naming a module in `import("x")` or an `import("x")` type, if node is one. */
function dynamicModuleSpecifier(node) {
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const [first] = node.arguments;
    return first !== undefined && ts.isStringLiteralLike(first) ? first : undefined;
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal))
    return node.argument.literal;
  return undefined;
}

/** Text with the given [start, end) ranges removed; line breaks inside a range are kept. */
function withoutRanges(text, ranges) {
  let result = "",
    cursor = 0;
  for (const [start, end] of [...ranges].sort((left, right) => left[0] - right[0])) {
    if (end <= cursor) continue;
    const from = Math.max(start, cursor);
    result += text.slice(cursor, from) + text.slice(from, end).replace(/[^\n]/gu, "");
    cursor = end;
  }
  return result + text.slice(cursor);
}

/** Statements in a statement list plus class members: the units a formatter puts on their own lines. */
function lineUnits(node) {
  if (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node)
  ) {
    return node.statements.filter((statement) => statement.kind !== ts.SyntaxKind.EmptyStatement);
  }
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    return node.members.filter((member) => member.kind !== ts.SyntaxKind.SemicolonClassElement);
  }
  return [];
}

function collectSyntax(source) {
  const unitLines = new Map(),
    literalRanges = [],
    importLines = new Set(),
    wiringRanges = [];
  let largestFunctionStatements = 0;
  const lineOf = (position) => source.getLineAndCharacterOfPosition(position).line;
  const visit = (node, owner) => {
    if (owner !== undefined && isCountedStatement(node)) owner.statements += 1;
    for (const unit of lineUnits(node)) {
      const line = lineOf(unit.getStart(source));
      unitLines.set(line, (unitLines.get(line) ?? 0) + 1);
    }
    if (LITERAL_KINDS.has(node.kind)) literalRanges.push([node.getStart(source), node.end]);
    if (isImportLike(node)) {
      for (let line = lineOf(node.getStart(source)); line <= lineOf(node.end); line += 1) importLines.add(line);
      wiringRanges.push([node.getStart(source), node.end]);
    }
    const specifier = dynamicModuleSpecifier(node);
    if (specifier !== undefined) wiringRanges.push([specifier.getStart(source), specifier.end]);
    if (FUNCTION_KINDS.has(node.kind)) {
      const own = { statements: 0 };
      ts.forEachChild(node, (child) => {
        visit(child, own);
      });
      largestFunctionStatements = Math.max(largestFunctionStatements, own.statements);
      return;
    }
    ts.forEachChild(node, (child) => {
      visit(child, owner);
    });
  };
  visit(source, undefined);
  literalRanges.sort((left, right) => left[0] - right[0]);
  return { unitLines, literalRanges, importLines, wiringRanges, largestFunctionStatements };
}

/** Longest line once literal text and import declarations are disregarded. */
function effectiveMaxLineLength(lines, lineStarts, literalRanges, importLines) {
  let longest = 0,
    cursor = 0;
  lines.forEach((line, index) => {
    const start = lineStarts[index],
      end = start + line.length;
    while (cursor < literalRanges.length && literalRanges[cursor][1] <= start) cursor += 1;
    let literalText = 0;
    for (let next = cursor; next < literalRanges.length && literalRanges[next][0] < end; next += 1) {
      literalText += Math.max(0, Math.min(end, literalRanges[next][1]) - Math.max(start, literalRanges[next][0]));
    }
    if (!importLines.has(index)) longest = Math.max(longest, line.length - literalText);
  });
  return longest;
}

/** Deterministic metrics for one TypeScript source text (line endings normalised first). */
export function measureSource(fileName, rawText) {
  const text = rawText.replaceAll("\r\n", "\n");
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const { unitLines, literalRanges, importLines, wiringRanges, largestFunctionStatements } = collectSyntax(source);
  const lines = text.split("\n");
  return Object.freeze({
    lines: text.endsWith("\n") ? lines.length - 1 : lines.length,
    chars: withoutRanges(text, wiringRanges).replace(/\s+/gu, "").length,
    maxLineLength: effectiveMaxLineLength(lines, source.getLineStarts(), literalRanges, importLines),
    multiStatementLines: [...unitLines.values()].filter((count) => count > 1).length,
    largestFunctionStatements,
  });
}

function listSourceFiles(root, directory = "src") {
  const absolute = path.join(root, directory);
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return listSourceFiles(root, relative);
      return entry.isFile() && entry.name.endsWith(".ts") ? [relative] : [];
    });
}

/** Measures every `src/**\/*.ts` file under root, keyed by repository-relative POSIX path. */
export function measureTree(root) {
  return new Map(
    listSourceFiles(root).map((file) => [file, measureSource(file, fs.readFileSync(path.join(root, file), "utf8"))]),
  );
}

function limitFor(entry, metric, ceilings) {
  return entry?.[metric] ?? ceilings[metric];
}

/** The metrics of one file that exceed the absolute ceilings; these are what a baseline records. */
export function overCeiling(metrics, ceilings = NEW_FILE_CEILINGS) {
  return Object.fromEntries(
    BUDGET_METRICS.filter((metric) => metrics[metric] > ceilings[metric]).map((metric) => [metric, metrics[metric]]),
  );
}

/** Compares measurements with the recorded baseline: violations fail the gate, tightenable entries do not. */
export function evaluateBudget(measurements, baselineFiles, ceilings = NEW_FILE_CEILINGS) {
  const violations = [],
    tightenable = [];
  for (const [file, metrics] of measurements) {
    const entry = baselineFiles[file];
    for (const metric of BUDGET_METRICS) {
      const limit = limitFor(entry, metric, ceilings),
        value = metrics[metric];
      if (value > limit)
        violations.push({ file, metric, value, limit, kind: entry === undefined ? "new-file" : "regression" });
      else if (entry?.[metric] !== undefined && value < entry[metric])
        tightenable.push({ file, metric, from: entry[metric], to: value });
    }
  }
  for (const file of Object.keys(baselineFiles)) {
    if (!measurements.has(file))
      violations.push({ file, metric: undefined, value: undefined, limit: undefined, kind: "stale" });
  }
  return { violations, tightenable };
}

function applyMoves(baselineFiles, moves) {
  const entries = new Map(Object.entries(baselineFiles));
  for (const [from, to] of moves) {
    const entry = entries.get(from);
    if (entry === undefined) throw new Error(`--move ${from}=${to}: ${from} has no baseline entry`);
    if (entries.has(to)) throw new Error(`--move ${from}=${to}: ${to} already has a baseline entry`);
    entries.set(to, entry);
    entries.delete(from);
  }
  return Object.fromEntries(entries);
}

/**
 * Rebuilds the baseline from measurements. A value may rise above its previous
 * limit only for files named in allowIncrease; otherwise it is refused.
 *
 * With `scope` (a set of files), only those files' entries are rebuilt; every other entry is
 * kept as recorded. A branch then lowers only what it changed, and two branches that each
 * touch a file cannot leave main with an entry below that file's merged size.
 */
export function updateBaseline(
  measurements,
  baselineFiles,
  { allowIncrease = new Set(), moves = new Map(), ceilings = NEW_FILE_CEILINGS, scope } = {},
) {
  const previous = applyMoves(baselineFiles, moves),
    files = {},
    refused = [],
    increased = [];
  const inScope = (file) => scope === undefined || scope.has(file);
  for (const [file, entry] of Object.entries(previous)) if (!inScope(file)) files[file] = entry;
  for (const [file, metrics] of [...measurements].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    if (!inScope(file)) continue;
    const debt = overCeiling(metrics, ceilings);
    if (Object.keys(debt).length > 0) files[file] = debt;
    for (const [metric, value] of Object.entries(debt)) {
      const limit = limitFor(previous[file], metric, ceilings);
      if (value <= limit) continue;
      (allowIncrease.has(file) ? increased : refused).push({ file, metric, value, limit });
    }
  }
  const sorted = Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right, "en")));
  return { files: sorted, refused, increased };
}

/**
 * The files an `--update` rebuilds: those changed against the merge base with origin/main, the
 * ends of every --move, and entries whose file no longer exists (deleted or moved away).
 */
export function updateScope(changed, measurements, baselineFiles, moves = new Map()) {
  const scope = new Set(changed);
  for (const [from, to] of moves) scope.add(from).add(to);
  for (const file of Object.keys(baselineFiles)) if (!measurements.has(file)) scope.add(file);
  return scope;
}

/**
 * The passing check's hint. `scope` is what a plain --update rebuilds (`updateScope`), or undefined when
 * origin/main can't be compared; improvements outside it are locked in only by --update --all.
 */
export function tightenHint(tightenable, scope) {
  if (tightenable.length === 0) return "";
  if (scope === undefined)
    return `; ${String(tightenable.length)} improved metrics can be locked in with --update --all (no origin/main to compare)`;
  const inScope = tightenable.filter(({ file }) => scope.has(file)).length,
    outside = tightenable.length - inScope;
  const parts = [];
  if (inScope > 0)
    parts.push(`${String(inScope)} improved metrics in files this branch changes can be locked in with --update`);
  if (outside > 0)
    parts.push(`${String(outside)} improved metrics in other files can be locked in only with --update --all`);
  return `; ${parts.join("; ")}`;
}

export function debtScore(metrics, ceilings = NEW_FILE_CEILINGS) {
  const excess = (metric) => Math.max(0, metrics[metric] - ceilings[metric]);
  return (
    Math.ceil((excess("chars") * MODULE_LINE_EQUIVALENTS) / ceilings.chars) +
    excess("multiStatementLines") +
    excess("largestFunctionStatements") +
    Math.ceil(excess("maxLineLength") / ceilings.maxLineLength)
  );
}

function formatNumber(value) {
  return value.toLocaleString("en-US");
}

/** Concise, deterministic progress report: totals over the ceilings and the worst offenders. */
export function formatReport(measurements, { top = 10, ceilings = NEW_FILE_CEILINGS } = {}) {
  const offenders = [...measurements]
    .map(([file, metrics]) => ({ file, metrics, score: debtScore(metrics, ceilings) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file, "en"));
  const total = (metric) =>
    offenders.reduce((sum, { metrics }) => sum + Math.max(0, metrics[metric] - ceilings[metric]), 0);
  const overLongLines = offenders.filter(({ metrics }) => metrics.maxLineLength > ceilings.maxLineLength).length;
  const lines = [
    `code budget debt: ${String(offenders.length)} of ${String(measurements.size)} src files over a ceiling ` +
      `(~${formatNumber(offenders.reduce((sum, entry) => sum + entry.score, 0))} lines of rework)`,
    `  chars over ${formatNumber(ceilings.chars)}: ${formatNumber(total("chars"))}; multi-statement lines: ${formatNumber(total("multiStatementLines"))}; ` +
      `function statements over ${String(ceilings.largestFunctionStatements)}: ${formatNumber(total("largestFunctionStatements"))}; ` +
      `files with lines over ${String(ceilings.maxLineLength)}: ${String(overLongLines)}`,
  ];
  if (offenders.length > 0) lines.push(`  worst ${String(Math.min(top, offenders.length))}:`);
  offenders.slice(0, top).forEach(({ file, metrics, score }, index) => {
    const detail = BUDGET_METRICS.map((metric) => `${METRIC_LABELS[metric]} ${formatNumber(metrics[metric])}`).join(
      ", ",
    );
    lines.push(`  ${String(index + 1).padStart(3)}. ${file} (~${formatNumber(score)}): ${detail}`);
  });
  return lines.join("\n");
}

function describeViolation({ file, metric, value, limit, kind }) {
  if (kind === "stale")
    return `${file}: baseline entry has no source file; run --update (use --move old=new for a moved file)`;
  const scope = kind === "new-file" ? "new-file ceiling" : "recorded baseline";
  return `${file}: ${METRIC_LABELS[metric]} ${formatNumber(value)} exceeds the ${scope} ${formatNumber(limit)}`;
}

export function readBaseline(file) {
  if (!fs.existsSync(file)) throw new Error(`${file} is missing; create it once with --initialize`);
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (value?.format !== BASELINE_FORMAT || value.files === null || typeof value.files !== "object") {
    throw new Error(`${file} is not a ${BASELINE_FORMAT} document`);
  }
  return value.files;
}

export function serializeBaseline(files) {
  const document = {
    format: BASELINE_FORMAT,
    note: "Debt recorded by `node scripts/check-code-budget.mjs --update`. Values may only fall; see docs/ARCHITECTURE.md.",
    files,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseArguments(argumentsList) {
  const options = {
    root: process.cwd(),
    baseline: DEFAULT_BASELINE_PATH,
    update: false,
    all: false,
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
    else if (argument === "--all") options.all = true;
    else if (argument === "--initialize") options.initialize = true;
    else if (argument === "--allow-increase") options.allowIncrease.add(value());
    else if (argument === "--move") {
      const [from, to, extra] = value().split("=");
      if (!from || !to || extra !== undefined) throw new Error("--move expects <old-path>=<new-path>");
      options.moves.set(from, to);
    } else if (argument === "--root") options.root = path.resolve(value());
    else if (argument === "--baseline") options.baseline = value();
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.update && (options.allowIncrease.size > 0 || options.moves.size > 0 || options.all))
    throw new Error("--allow-increase, --move and --all require --update");
  if (options.initialize && options.update) throw new Error("--initialize and --update are exclusive");
  return options;
}

/** The scope a plain --update would rebuild, or undefined when origin/main can't be compared. */
function scopeOrUndefined(root, measurements, baselineFiles) {
  try {
    return updateScope(changedFiles(root), measurements, baselineFiles);
  } catch {
    return undefined;
  }
}

function runUpdate(options, measurements, baselineFiles, baselinePath) {
  let changed;
  if (!options.all) {
    try {
      changed = changedFiles(options.root);
    } catch (error) {
      throw new Error(
        `--update rebuilds only the files changed against origin/main, and that comparison failed (${error.message.trim()}); pass --all to rebuild every entry`,
        { cause: error },
      );
    }
  }
  const scope = changed === undefined ? undefined : updateScope(changed, measurements, baselineFiles, options.moves);
  const result = updateBaseline(measurements, baselineFiles, { ...options, scope });
  if (result.refused.length > 0) {
    console.error(
      [
        "Refusing to raise the code budget baseline (pass --allow-increase <file> only for a reviewed, deliberate exception):",
        ...result.refused.map((entry) => `- ${describeViolation({ ...entry, kind: "regression" })}`),
      ].join("\n"),
    );
    return 1;
  }
  for (const { file, metric, value, limit } of result.increased) {
    console.warn(
      `!!! CODE BUDGET BASELINE RAISED for ${file}: ${METRIC_LABELS[metric]} ${formatNumber(limit)} -> ${formatNumber(value)} !!!`,
    );
  }
  fs.writeFileSync(baselinePath, serializeBaseline(result.files));
  const before = Object.keys(baselineFiles).length,
    after = Object.keys(result.files).length;
  console.log(
    `code budget baseline written: ${String(after)} files with recorded debt (was ${String(before)}); ` +
      (options.all ? "every entry rebuilt (--all)" : "only entries for files this branch changes rebuilt"),
  );
  return 0;
}

/** One-time creation: records the current debt of every file when no baseline exists yet. */
function runInitialize(measurements, baselinePath) {
  if (fs.existsSync(baselinePath)) throw new Error(`${baselinePath} already exists; use --update to lower it`);
  const { files } = updateBaseline(measurements, {}, { allowIncrease: new Set(measurements.keys()) });
  fs.writeFileSync(baselinePath, serializeBaseline(files));
  console.warn(
    `!!! CODE BUDGET BASELINE INITIALIZED with ${String(Object.keys(files).length)} files of recorded debt !!!`,
  );
  return 0;
}

function main() {
  const started = performance.now();
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node scripts/check-code-budget.mjs [--update [--all] [--allow-increase <file>]... [--move <old>=<new>]... | --initialize]" +
        " [--root <repo>] [--baseline <path>]",
    );
    return 0;
  }
  const baselinePath = path.resolve(options.root, options.baseline);
  const measurements = measureTree(options.root);
  console.log(formatReport(measurements));
  if (options.initialize) return runInitialize(measurements, baselinePath);
  const baselineFiles = readBaseline(baselinePath);
  if (options.update) return runUpdate(options, measurements, baselineFiles, baselinePath);
  const { violations, tightenable } = evaluateBudget(measurements, baselineFiles);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (violations.length > 0) {
    console.error(
      ["Code budget gate failed:", ...violations.map((violation) => `- ${describeViolation(violation)}`)].join("\n"),
    );
    return 1;
  }
  const scope = tightenable.length > 0 ? scopeOrUndefined(options.root, measurements, baselineFiles) : undefined;
  const hint = tightenHint(tightenable, scope);
  console.log(`code budget gate passed (${String(measurements.size)} files, ${seconds} s${hint})`);
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
