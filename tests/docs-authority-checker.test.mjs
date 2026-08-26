import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_PLAN_METADATA_PATHS,
  checkCurrentAuthorityTable,
  checkRootDocumentationPolicy,
  checkActivePlanMetadata,
  checkPlansAuthorityIndex,
  parsePlansAuthorityIndex,
  parseCurrentAuthoritiesTable,
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

function copyActivePlanFixture(fixtureRoot) {
  fs.mkdirSync(path.join(fixtureRoot, "plans"), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, "plans", "README.md"), path.join(fixtureRoot, "plans", "README.md"));
  for (const relativePath of ACTIVE_PLAN_METADATA_PATHS) {
    const source = path.join(repositoryRoot, relativePath);
    const destination = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

test("docs checker passes the canonical tracked documentation baseline", () => {
  const result = runDocsCheck({ root: repositoryRoot });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.rootMarkdownFiles, 3);
  assert.equal(result.pathBoundArtifacts, 10);
  assert.ok(result.trackedMarkdownFiles >= 100);
  assert.ok(result.localLinks >= 30);
  assert.equal(result.currentAuthorities, 9);
  assert.equal(result.activePlans, ACTIVE_PLAN_METADATA_PATHS.length);
});

test("current authority table has one local primary per unique topic", () => {
  const result = checkCurrentAuthorityTable(repositoryRoot);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 9);
});

test("current authority parser rejects duplicate topics, primary paths, and malformed multiple links", () => {
  const index = [
    "## Current authorities",
    "",
    "| Topic | Primary authority | Supporting contract/evidence |",
    "| --- | --- | --- |",
    "| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | — |",
    "| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | — |",
    "| Multiple | [A.md](A.md) and [B.md](B.md) | — |",
    "| Missing | no Markdown link | — |",
  ].join("\n");
  const result = parseCurrentAuthoritiesTable(index);
  const errors = result.errors.join("\n");
  assert.match(errors, /duplicate topic/u);
  assert.match(errors, /reuses a primary authority path/u);
  assert.match(errors, /exactly one local Markdown primary link/u);
});

test("active plans carry explicit owner, active status, closure condition, and index columns", () => {
  const metadata = checkActivePlanMetadata(repositoryRoot);
  assert.deepEqual(metadata.errors, []);
  assert.deepEqual(checkPlansAuthorityIndex(repositoryRoot).errors, []);
});

test("active-plan metadata rejects missing owner or non-active status", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-plan-metadata-"));
  try {
    copyActivePlanFixture(fixtureRoot);
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

test("plan metadata ignores fenced examples but rejects duplicate live fields", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-plan-duplicates-"));
  try {
    copyActivePlanFixture(fixtureRoot);
    const target = path.join(fixtureRoot, ACTIVE_PLAN_METADATA_PATHS[0]);
    const source = fs.readFileSync(target, "utf8");
    fs.writeFileSync(target, `${source}\n\`\`\`md\n- **Owner:** fenced example\n\`\`\`\n`, "utf8");
    assert.deepEqual(checkActivePlanMetadata(fixtureRoot).errors, []);
    fs.appendFileSync(target, "\n- **Owner:** duplicate live owner\n", "utf8");
    assert.match(checkActivePlanMetadata(fixtureRoot).errors.join("\n"), /duplicate Owner metadata/u);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("plan index and active-plan metadata must agree", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-plan-index-mismatch-"));
  try {
    copyActivePlanFixture(fixtureRoot);
    const indexPath = path.join(fixtureRoot, "plans", "README.md");
    fs.writeFileSync(indexPath, fs.readFileSync(indexPath, "utf8")
      .replace("| [CONTROLLER_QA.md](CONTROLLER_QA.md) | active plan | QA owner |", "| [CONTROLLER_QA.md](CONTROLLER_QA.md) | active plan | Different owner |"), "utf8");
    const index = checkPlansAuthorityIndex(fixtureRoot);
    assert.deepEqual(index.errors, []);
    const result = checkActivePlanMetadata(fixtureRoot, index);
    assert.match(result.errors.join("\n"), /CONTROLLER_QA.*Owner metadata does not match/u);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("an added active-plan row requires an intentional canonical-set update and metadata", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-plan-extra-"));
  try {
    copyActivePlanFixture(fixtureRoot);
    const indexPath = path.join(fixtureRoot, "plans", "README.md");
    const indexText = fs.readFileSync(indexPath, "utf8")
      .replace("## Completed plans", "| [EXTRA_ACTIVE.md](active/EXTRA_ACTIVE.md) | Extra owner | Active | Extra plan close condition. | Intentional negative fixture |\n\n## Completed plans");
    fs.writeFileSync(indexPath, indexText, "utf8");
    fs.writeFileSync(path.join(fixtureRoot, "plans", "active", "EXTRA_ACTIVE.md"), "# Extra active plan\n", "utf8");
    const index = checkPlansAuthorityIndex(fixtureRoot);
    assert.match(index.errors.join("\n"), /extra active plan|canonical active plans/u);
    const metadata = checkActivePlanMetadata(fixtureRoot, index);
    assert.match(metadata.errors.join("\n"), /EXTRA_ACTIVE.*missing Owner metadata/u);
    const parsed = parsePlansAuthorityIndex(indexText);
    assert.equal(parsed.activePlanPaths.includes("plans/active/EXTRA_ACTIVE.md"), true);
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
