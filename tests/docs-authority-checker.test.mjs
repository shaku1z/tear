import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_PLAN_METADATA_PATHS,
  checkRootDocumentationPolicy,
  checkActivePlanMetadata,
  checkPlansAuthorityIndex,
  parseMarkdownLinks,
  parseRootClassificationTable,
  resolveLocalLink,
  runDocsCheck,
} from "../scripts/check-docs.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootFiles = [
  "CONTRIBUTING.md",
  "CRAZYGAMES.md",
  "DEPLOYMENT.md",
];

test("docs checker passes the canonical tracked documentation baseline", () => {
  const result = runDocsCheck({ root: repositoryRoot });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.rootMarkdownFiles, 3);
  assert.equal(result.pathBoundArtifacts, 10);
  assert.ok(result.trackedMarkdownFiles >= 100);
  assert.ok(result.localLinks >= 30);
  assert.equal(result.activePlans, ACTIVE_PLAN_METADATA_PATHS.length);
});

test("active plans carry explicit owner, active status, closure condition, and index columns", () => {
  const metadata = checkActivePlanMetadata(repositoryRoot);
  assert.deepEqual(metadata.errors, []);
  assert.deepEqual(checkPlansAuthorityIndex(repositoryRoot).errors, []);
});

test("active-plan metadata rejects missing owner or non-active status", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-plan-metadata-"));
  try {
    for (const relativePath of ACTIVE_PLAN_METADATA_PATHS) {
      const source = path.join(repositoryRoot, relativePath);
      const destination = path.join(fixtureRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
    const target = path.join(fixtureRoot, ACTIVE_PLAN_METADATA_PATHS[0]);
    fs.writeFileSync(target, fs.readFileSync(target, "utf8")
      .replace("- **Owner:** QA owner", "- **Owner:**")
      .replace("- **Status:** Active", "- **Status:** Paused"), "utf8");
    const result = checkActivePlanMetadata(fixtureRoot);
    assert.match(result.errors.join("\n"), /nonempty Owner|Status: Active/u);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("local links reject missing, traversal, drive, and UNC destinations", () => {
  const cases = [
    ["missing.md", /missing local path/u],
    ["../../outside.md", /escapes the repository root/u],
    ["%2e%2e/%2e%2e/outside.md", /escapes the repository root/u],
    ["C:/outside.md", /absolute local link/u],
    ["\\\\server\\share\\outside.md", /absolute local link/u],
    ["%5c%5cserver%5cshare%5coutside.md", /absolute local link/u],
  ];
  for (const [destination, message] of cases) {
    const result = resolveLocalLink(repositoryRoot, "docs/README.md", destination);
    assert.equal(result.ok, false, destination);
    assert.match(result.error, message, destination);
  }
});

test("anchors, fragments, external destinations, images, and fenced examples are ignored", () => {
  const markdown = [
    "```md",
    "[fenced](missing-fenced.md)",
    "```",
    "![image](missing-image.png)",
    "[anchor](#heading)",
    "[external](https://example.com/docs)",
    "[mail](mailto:owner@example.com)",
    "[fragment](README.md#intro)",
    "[query](README.md?raw=1#intro)",
  ].join("\n");
  const links = parseMarkdownLinks(markdown);
  assert.deepEqual(links.map(({ destination }) => destination), ["README.md", "README.md"]);
  for (const link of links) {
    assert.equal(resolveLocalLink(repositoryRoot, "docs/README.md", link.destination).ok, true);
  }
});

test("root classification parser accepts the explanatory history suffix", () => {
  const index = fs.readFileSync(path.join(repositoryRoot, "docs", "README.md"), "utf8");
  const parsed = parseRootClassificationTable(index);
  assert.equal(parsed.errors.length, 0, parsed.errors.join("\n"));
  assert.equal(parsed.rows.size, 3);
  assert.equal(parsed.rows.get("DEPLOYMENT.md"), "current authority");
});

test("root policy rejects a mutated classification table in a temporary fixture", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-docs-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot, "docs"), { recursive: true });
    const index = fs.readFileSync(path.join(repositoryRoot, "docs", "README.md"), "utf8")
      .replace("| `DEPLOYMENT.md` | current authority |", "| `DEPLOYMENT.md` | unknown |")
      .replace("| `CONTRIBUTING.md` | current authority |", "| `CONTRIBUTING.md` | current authority |\n| `CONTRIBUTING.md` | current authority |\n");
    fs.writeFileSync(path.join(fixtureRoot, "docs", "README.md"), index, "utf8");
    const result = checkRootDocumentationPolicy(fixtureRoot, [...rootFiles, "docs/README.md"]);
    assert.equal(result.errors.some((error) => /unknown classification/u.test(error)), true);
    assert.equal(result.errors.some((error) => /more than once/u.test(error)), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
