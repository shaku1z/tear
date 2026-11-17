import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import {
  SHIPPING_BINDING,
  SHIPPING_CORPUS,
  TUTORIAL_GOLD_ROOTS,
  assertTutorialGoldFresh,
  collectTutorialGoldModules,
  committedTutorialGold,
  normalizeModuleSource,
  recordTutorialGoldVerified,
  runGoldTest,
  tutorialGoldBinding,
  tutorialGoldSourceFingerprint,
} from "../scripts/tutorial-gold-compatibility.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const original = tutorialGoldSourceFingerprint(repositoryRoot);

/** Names the first covered module whose normalised stream differs, for a readable failure. */
function firstStreamDifference(root, roots = TUTORIAL_GOLD_ROOTS) {
  const expected = collectTutorialGoldModules(repositoryRoot),
    actual = [...collectTutorialGoldModules(root, roots).values()];
  for (const [file, { stream: text }] of expected) {
    if (actual.some((module) => module.stream === text)) continue;
    const nearest = actual.find((module) => module.stream.slice(0, 200) === text.slice(0, 200))?.stream ?? "";
    let index = 0;
    while (index < text.length && text[index] === nearest[index]) index += 1;
    return `${file}: normalised stream differs near ${JSON.stringify(text.slice(Math.max(0, index - 120), index + 80))}`;
  }
  return "module streams match; the import graph differs";
}

function stream(text, resolveImport) {
  return normalizeModuleSource("module.ts", text, resolveImport).stream;
}

/** A disposable copy of exactly the covered closure, so mutations never touch the checkout. */
function withClosureCopy(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tear-gold-fingerprint-"));
  try {
    for (const file of [...original.files, SHIPPING_CORPUS, SHIPPING_BINDING]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.copyFileSync(path.join(repositoryRoot, file), path.join(root, file));
    }
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function parse(file, text) {
  return ts.createSourceFile(
    file,
    text,
    { languageVersion: ts.ScriptTarget.Latest, jsDocParsingMode: ts.JSDocParsingMode.ParseNone },
    true,
    ts.ScriptKind.TS,
  );
}

function leafTokens(source) {
  const tokens = [];
  const visit = (node) => {
    const children = node.getChildren(source);
    if (children.length === 0 && node.kind !== ts.SyntaxKind.SyntaxList) tokens.push(node);
    else children.forEach(visit);
  };
  visit(source);
  return tokens;
}

function applyEdits(text, edits) {
  let result = text;
  for (const { start, end, insert } of [...edits].sort(
    (left, right) => right.start - left.start || right.end - left.end,
  )) {
    result = result.slice(0, start) + insert + result.slice(end);
  }
  return result;
}

/**
 * Formatter-like rewrite that keeps meaning: drops every comment, breaks the
 * line after each `;` and `,` (adding a comment and a blank line there) and
 * indents every line that is not inside a template literal or a comment.
 */
function reformat(file, text) {
  const source = parse(file, text),
    tokens = leafTokens(source),
    edits = [],
    protectedRanges = [],
    comments = new Map();
  for (const token of tokens) {
    for (const comment of ts.getLeadingCommentRanges(text, token.pos) ?? []) comments.set(comment.pos, comment.end);
    if (ts.isTemplateLiteralKind(token.kind) || token.kind === ts.SyntaxKind.StringLiteral)
      protectedRanges.push([token.getStart(source), token.end]);
    if (token.kind === ts.SyntaxKind.SemicolonToken || token.kind === ts.SyntaxKind.CommaToken) {
      edits.push({ start: token.end, end: token.end, insert: " // reformatted\n\n" });
    }
  }
  for (const [start, end] of comments) {
    edits.push({ start, end, insert: " " });
    protectedRanges.push([start, end]);
  }
  const inside = (position) => protectedRanges.some(([start, end]) => position > start && position < end);
  for (let position = 0; position < text.length; position = text.indexOf("\n", position) + 1 || text.length) {
    if (!inside(position)) edits.push({ start: position, end: position, insert: "    " });
  }
  return applyEdits(text, edits);
}

function resolveSpecifier(fromFile, specifier, exists) {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  return [`${base}.ts`, `${base}.json`, `${base}/index.ts`, base].find(
    (candidate) => /\.(ts|json)$/u.test(candidate) && exists(candidate),
  );
}

function specifierFor(fromFile, target) {
  const relative = path.posix.relative(path.posix.dirname(fromFile), target).replace(/\.ts$/u, "");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function isModuleSpecifier(node) {
  const parent = node.parent;
  return (
    ts.isStringLiteral(node) &&
    node.text.startsWith(".") &&
    parent !== undefined &&
    (((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) ||
      ts.isExternalModuleReference(parent) ||
      (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) ||
      (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword))
  );
}

/** Moves one module and rewrites every relative specifier in the closure that pointed at it or was written from it. */
function moveModule(root, files, from, to) {
  const exists = (file) => fs.existsSync(path.join(root, file));
  for (const file of files.filter((candidate) => candidate.endsWith(".ts"))) {
    const text = fs.readFileSync(path.join(root, file), "utf8"),
      source = parse(file, text),
      edits = [];
    const location = file === from ? to : file;
    const visit = (node) => {
      if (isModuleSpecifier(node)) {
        const target = resolveSpecifier(file, node.text, exists);
        if (target !== undefined && (target === from || file === from)) {
          edits.push({
            start: node.getStart(source) + 1,
            end: node.end - 1,
            insert: specifierFor(location, target === from ? to : target),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    fs.writeFileSync(path.join(root, file), applyEdits(text, edits));
  }
  fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
  fs.renameSync(path.join(root, from), path.join(root, to));
  return files.map((file) => (file === from ? to : file));
}

function firstNode(file, root, predicate) {
  const text = fs.readFileSync(path.join(root, file), "utf8"),
    source = parse(file, text);
  let found;
  const visit = (node) => {
    if (found === undefined && predicate(node)) found = node;
    else if (found === undefined) ts.forEachChild(node, visit);
  };
  visit(source);
  if (found === undefined) throw new Error(`${file} has no matching node`);
  return { text, source, node: found };
}

function mutated(file, predicate, replacement) {
  let fingerprint;
  withClosureCopy((root) => {
    const { text, source, node } = firstNode(file, root, predicate);
    fs.writeFileSync(
      path.join(root, file),
      applyEdits(text, [{ start: node.getStart(source), end: node.end, insert: replacement(node, source) }]),
    );
    fingerprint = tutorialGoldSourceFingerprint(root).sourceHash;
  });
  return fingerprint;
}

test("the normalised stream ignores formatting, comments and redundant punctuation", () => {
  const reference = stream(
    "const total = (1 + 2) * 3;\nexport const values = { alpha: 0.5, beta: [1, 2] };\nconst id = (value) => value;\n",
  );
  const variant = stream(
    [
      "/** documented */ const total=( (1+2) )*3 // trailing",
      "export const values = {",
      '  "alpha": .5,',
      "  beta: [1, 2,],",
      "}",
      "const id = value => value",
      "",
    ].join("\n"),
  );
  assert.equal(variant, reference);
  assert.equal(stream('type Choice =\n  | "a"\n  | "b";\n'), stream('type Choice = "a" | "b"\n'));
  assert.equal(stream('import type { Shape } from "./shape";\nexport const x = 1;\n'), stream("export const x = 1;\n"));
});

test("the normalised stream keeps every behavioural difference", () => {
  const reference = stream("const value = (1 + 2) * 3 < limit ? /a b/ : `x ${y} z`;\n");
  for (const changed of [
    "const value = 1 + 2 * 3 < limit ? /a b/ : `x ${y} z`;\n",
    "const value = (1 + 2) * 4 < limit ? /a b/ : `x ${y} z`;\n",
    "const value = (1 + 2) * 3 <= limit ? /a b/ : `x ${y} z`;\n",
    "const value = (1 + 2) * 3 < limit ? /ab/ : `x ${y} z`;\n",
    "const value = (1 + 2) * 3 < limit ? /a b/ : `x ${y}  z`;\n",
    "const value = (1 + 2) * 3 < bound ? /a b/ : `x ${y} z`;\n",
    "const value = (1 + 2) * 3 < limit ? /a b/ : `x ${y} z`;\nvoid value;\n",
  ])
    assert.notEqual(stream(changed), reference, changed);
});

test("value-import specifiers are replaced by their resolved targets, independent of the path text", () => {
  const near = normalizeModuleSource(
    "src/a/user.ts",
    'import { hash } from "./hash";\nexport const h = hash;\n',
    () => "src/a/hash.ts",
  );
  const far = normalizeModuleSource(
    "src/b/c/user.ts",
    'import { hash } from "../../a/hash";\nexport const h = hash;\n',
    () => "src/a/hash.ts",
  );
  assert.equal(near.stream, far.stream);
  assert.deepEqual(far.targets, ["src/a/hash.ts"]);
  const external = normalizeModuleSource(
    "src/a/user.ts",
    'import ts from "typescript";\nexport const t = ts;\n',
    () => undefined,
  );
  assert.match(external.stream, /str:"typescript"/u);
});

test("the real closure fingerprint follows value imports only and is reproducible", () => {
  assert.match(original.sourceHash, /^[a-f0-9]{64}$/u);
  assert.equal(original.files.length > 100, true);
  for (const rootFile of TUTORIAL_GOLD_ROOTS) assert.equal(original.files.includes(rootFile), true, rootFile);
  assert.equal(
    original.files.some(
      (file) => file.endsWith("tutorial-gold-reference-data.json") || file.endsWith("tutorial-gold-binding.json"),
    ),
    false,
  );
  assert.equal(tutorialGoldSourceFingerprint(repositoryRoot).sourceHash, original.sourceHash);
});

test("(i) reformatting every covered file leaves the fingerprint unchanged", () => {
  withClosureCopy((root) => {
    let addedLines = 0;
    for (const file of original.files) {
      const target = path.join(root, file),
        text = fs.readFileSync(target, "utf8");
      const rewritten = file.endsWith(".json")
        ? `${JSON.stringify(JSON.parse(text), null, 4)}\n`
        : reformat(file, text);
      addedLines += rewritten.split("\n").length - text.split("\n").length;
      fs.writeFileSync(target, rewritten.replaceAll("\n", "\r\n"));
    }
    assert.equal(addedLines > 10_000, true, "the rewrite must actually split lines");
    assert.equal(tutorialGoldSourceFingerprint(root).sourceHash, original.sourceHash, firstStreamDifference(root));
  });
});

test("(ii) moving and renaming covered files with their imports updated leaves the fingerprint unchanged", () => {
  withClosureCopy((root) => {
    const files = moveModule(root, original.files, "src/replay/hash.ts", "src/relocated/verification/stable-hash.ts");
    moveModule(
      root,
      files,
      "src/gameplay/training/tutorial-arenas.ts",
      "src/gameplay/training/arenas/course-arenas.ts",
    );
    const roots = TUTORIAL_GOLD_ROOTS.map((file) =>
      file === "src/gameplay/training/tutorial-arenas.ts" ? "src/gameplay/training/arenas/course-arenas.ts" : file,
    );
    const moved = tutorialGoldSourceFingerprint(root, roots);
    assert.equal(moved.files.includes("src/relocated/verification/stable-hash.ts"), true);
    assert.equal(moved.files.includes("src/replay/hash.ts"), false);
    assert.equal(moved.sourceHash, original.sourceHash, firstStreamDifference(root, roots));
  });
});

test("(iii) changing one numeric literal or one comparison operator changes the fingerprint", () => {
  const numeric = mutated(
    "src/gameplay/entities/player.ts",
    (node) => ts.isNumericLiteral(node),
    (node) => String(Number(node.text) + 1),
  );
  const comparison = mutated(
    "src/gameplay/entities/blade.ts",
    (node) => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.LessThanToken,
    (node, source) => `${node.left.getText(source)} <= ${node.right.getText(source)}`,
  );
  assert.notEqual(numeric, original.sourceHash);
  assert.notEqual(comparison, original.sourceHash);
  assert.notEqual(numeric, comparison);
});

/** A code change that a formatter cannot produce: one new exported value at the end of the module. */
function appendCode(root, file, marker) {
  const target = path.join(root, file);
  fs.writeFileSync(
    target,
    `${fs.readFileSync(target, "utf8")}\nexport const branchMarker${marker} = ${String(marker)};\n`,
  );
}

test("the committed binding names the corpus by content hash only, with no source fingerprint", () => {
  const binding = JSON.parse(fs.readFileSync(path.join(repositoryRoot, SHIPPING_BINDING), "utf8"));
  const corpus = JSON.parse(fs.readFileSync(path.join(repositoryRoot, SHIPPING_CORPUS), "utf8"));
  assert.deepEqual(binding, tutorialGoldBinding(corpus));
  assert.deepEqual(Object.keys(binding).sort(), ["corpusContentHash", "format"]);
  assert.equal(committedTutorialGold(repositoryRoot), corpus.contentHash);
});

test("a build runs the gold test unless it passed here for this code and corpus, and refuses when it fails", () => {
  withClosureCopy((root) => {
    const contentHash = committedTutorialGold(root);
    let runs = 0;
    const passing = (directory) => {
      runs += 1;
      recordTutorialGoldVerified(directory, tutorialGoldSourceFingerprint(directory).sourceHash, contentHash);
      return { ok: true, output: "" };
    };
    assert.equal(assertTutorialGoldFresh(root, { runTest: passing }), contentHash);
    assert.equal(runs, 1);
    assert.equal(assertTutorialGoldFresh(root, { runTest: passing }), contentHash);
    assert.equal(runs, 1, "a remembered pass for the same code and corpus is not run again");

    appendCode(root, "src/gameplay/entities/player.ts", 1);
    const failing = () => {
      runs += 1;
      return { ok: false, output: "Gold cut diverged at 812" };
    };
    assert.throws(() => assertTutorialGoldFresh(root, { runTest: failing }), /stale[\s\S]*diverged at 812/u);
    assert.equal(runs, 2, "changed tutorial code is verified again");
    // A test that exits cleanly without recording this exact pair (for example one that ran no test) is no pass.
    assert.throws(() => assertTutorialGoldFresh(root, { runTest: () => ({ ok: true, output: "" }) }), /stale/u);
    assert.equal(assertTutorialGoldFresh(root, { runTest: passing }), contentHash);

    const binding = path.join(root, SHIPPING_BINDING);
    fs.writeFileSync(binding, JSON.stringify({ ...tutorialGoldBinding({ contentHash: "0".repeat(16) }) }));
    assert.throws(() => assertTutorialGoldFresh(root, { runTest: passing }), /does not match its corpus/u);
  });
});

test("a build without vitest says vitest is missing, not that the gold is stale", () => {
  withClosureCopy((root) => {
    assert.throws(
      () => assertTutorialGoldFresh(root),
      (error) => {
        assert.match(error.message, /vitest is not installed/u);
        assert.doesNotMatch(error.message, /stale/u);
        return true;
      },
    );
    assert.throws(() => runGoldTest(root), /pnpm install --frozen-lockfile/u);
  });
});

test("two branches that change different tutorial roots merge without conflict and without a refresh", () => {
  withClosureCopy((root) => {
    const git = (...args) => {
      const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@invalid", ...args], {
        cwd: root,
        encoding: "utf8",
      });
      return { status: result.status, out: `${result.stdout}${result.stderr}`.trim() };
    };
    const corpus = JSON.parse(fs.readFileSync(path.join(root, SHIPPING_CORPUS), "utf8"));
    /** What the gold refresh writes when the gold output is unchanged: the binding for the same corpus. */
    const refresh = () =>
      fs.writeFileSync(path.join(root, SHIPPING_BINDING), `${JSON.stringify(tutorialGoldBinding(corpus), null, 2)}\n`);
    git("init", "--quiet", "--initial-branch", "main");
    git("config", "core.autocrlf", "false");
    refresh();
    git("add", "-A");
    git("commit", "--quiet", "-m", "base");
    const base = fs.readFileSync(path.join(root, SHIPPING_BINDING), "utf8");

    const branches = [
      ["a", "src/gameplay/entities/player.ts"],
      ["b", "src/gameplay/entities/blade.ts"],
    ];
    const fingerprints = [];
    for (const [index, [branch, file]] of branches.entries()) {
      git("checkout", "--quiet", "-b", branch, "main");
      appendCode(root, file, index + 2);
      refresh();
      fingerprints.push(tutorialGoldSourceFingerprint(root).sourceHash);
      git("commit", "--quiet", "-am", `change ${file}`);
      const touched = git("diff", "--name-only", "main", branch).out.split(/\r?\n/u);
      assert.deepEqual(touched, [file], "a code change that keeps the gold output commits nothing generated");
    }
    git("checkout", "--quiet", "a");
    const merge = git("merge", "--no-edit", "b");
    assert.equal(merge.status, 0, merge.out);
    assert.equal(fs.readFileSync(path.join(root, SHIPPING_BINDING), "utf8"), base);
    // The merged code has a fingerprint neither branch verified, so the next build runs the gold test on it.
    const merged = tutorialGoldSourceFingerprint(root).sourceHash;
    assert.equal(new Set([original.sourceHash, ...fingerprints, merged]).size, 4);
  });
});
