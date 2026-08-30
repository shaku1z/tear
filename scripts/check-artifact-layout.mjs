import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const layoutPath = path.join(root, "config", "artifact-layout.json");
const errors = [];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`cannot read ${path.relative(root, filePath)}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function safeRelative(value) {
  const checkedValue = typeof value === "string" && value.endsWith("/") ? value.slice(0, -1) : value;
  return typeof value === "string"
    && value !== ""
    && value === value.replaceAll("\\", "/")
    && !path.isAbsolute(checkedValue)
    && !checkedValue.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

const layout = readJson(layoutPath);
if (layout?.format !== "tear-artifact-layout" || layout?.version !== 1) {
  errors.push("config/artifact-layout.json has an unsupported format or version");
}

const declaredPaths = [
  ...Object.values(layout?.tracked ?? {}),
  ...Object.values(layout?.generated ?? {}),
  layout?.legacyCompatibility?.policy,
  ...(layout?.legacyCompatibility?.prefixes ?? []),
];
for (const declaredPath of declaredPaths) {
  if (!safeRelative(declaredPath)) errors.push(`unsafe or invalid declared path: ${String(declaredPath)}`);
}

const ignored = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
for (const rule of ["artifacts/", ".artifact-quarantine/", "*.tsbuildinfo"]) {
  if (!ignored.split(/\r?\n/u).includes(rule)) errors.push(`.gitignore must contain ${rule}`);
}

const tracked = spawnSync("git", ["ls-files", "--", "artifacts"], { cwd: root, encoding: "utf8" });
if (tracked.status !== 0) errors.push(`git ls-files failed: ${tracked.stderr.trim()}`);
const trackedArtifacts = tracked.stdout.trim();
if (trackedArtifacts !== "") errors.push(`generated artifacts are tracked:\n${trackedArtifacts}`);

const rootCacheFiles = fs.readdirSync(root).filter((name) => name.endsWith(".tsbuildinfo"));
if (rootCacheFiles.length > 0) errors.push(`TypeScript build caches pollute the repository root: ${rootCacheFiles.join(", ")}`);

for (const [relativePath, needle] of [
  ["scripts/package-crazygames.mjs", "\"artifacts\", \"tear-crazygames.zip\""],
  ["scripts/check-reproducible-build.mjs", "\"artifacts\", \"tear-crazygames.zip\""],
  [".github/workflows/ci.yml", "artifacts/tear-crazygames.zip"],
]) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  if (source.includes(needle)) errors.push(`${relativePath} still uses the pre-policy package path`);
}

const requiredDocs = [
  "docs/ARTIFACTS.md",
  "docs/checkpoints/ARTIFACT_HYGIENE.md",
  "docs/checkpoints/verdant-sanctum/README.md",
  "docs/checkpoints/verdant-sanctum/VS3-C9_EVIDENCE.md",
  "docs/checkpoints/verdant-sanctum/VS3-C12_EVIDENCE.md",
];
for (const relativePath of requiredDocs) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`missing durable evidence authority: ${relativePath}`);
}

const activeLegacyReferences = [
  ["tests/browser-state-forge-runtime.js", "artifacts\", \"tearbench\", \"c23"],
  ["tests/browser-state-forge-studio.js", "artifacts\", \"tearbench\", \"c23"],
  ["tests/browser-state-forge-exit-matrix.js", "artifacts\", \"tearbench\", \"c23"],
  ["tests/browser-verdant-presentation.js", "artifacts\", \"tearbench\", \"verdant-c9"],
  ["tests/unit/tearbench-progression-ledger.test.ts", "\"tearbench\", \"c23\""],
  ["tests/browser-c27a-live-parity-trace.js", "focusedCapture ? \"c27a-focused\" : \"c27a\""],
  ["scripts/run-current-live-detached-parity.mjs", "\"c27a-focused\""],
  ["tests/unit/current-live-detached-mechanic-parity.test.ts", "artifacts/tearbench/c27a"],
  ["tests/unit/detached-live-parity.test.ts", "artifacts/tearbench/c27a"],
  ["tests/unit/detached-finale-live-parity.test.ts", "artifacts/tearbench/c27a"],
  ["tests/unit/production-c27a-matrix.test.ts", "artifacts/tearbench/c27a"],
  ["scripts/measure-production-headless-long-run.mjs", "artifacts/tearbench/c30/"],
  ["package.json", "artifacts/tearbench/c26/"],
  ["package.json", "artifacts/tearbench/c30/"],
  ["package.json", "artifacts/tearbench/c39/"],
];
for (const [relativePath, needle] of activeLegacyReferences) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  if (source.includes(needle)) errors.push(`${relativePath} still emits active evidence into a legacy checkpoint path`);
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Artifact layout OK: tracked evidence, ignored output, caches, and active checkpoint generators are separated.");
}
