import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  DEFAULT_ARTIFACT_RETENTION_POLICY_PATH,
  runArtifactReport,
} from "./report-artifacts.mjs";

export const DEFAULT_ARTIFACT_DISPOSITION_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "preservation",
  "artifact-retention-disposition.json",
);
export const ARTIFACT_DISPOSITION_FORMAT = "tear-artifact-retention-disposition";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SHA1_PATTERN = /^[0-9a-f]{40}$/u;
const EXPECTED_GROUPS = new Map([
  ["c24-mixed-age-build-assets", { count: 90, bytes: 31_657_362 }],
  ["c3-path-bound-scenarios", { count: 8, bytes: 10_774 }],
  ["historical-provenance", { count: 6, bytes: 15_178 }],
]);
const HISTORICAL_PATHS = new Set([
  "artifacts/tearbench/c20-ci-selection.json",
  "artifacts/tearbench/c20-selection.json",
  "artifacts/tearbench/c21-completion-plan-ci.json",
  "artifacts/tearbench/c21-completion-plan-selection.json",
  "artifacts/tearbench/c6-wave99.json",
  "artifacts/tearbench/non-lossy-annex-plan-selection.json",
]);

function readJson(filePath) {
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, "utf8")), errors: [] };
  } catch (error) {
    return {
      value: null,
      errors: [`could not read disposition JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function readArtifactDisposition(dispositionPath = DEFAULT_ARTIFACT_DISPOSITION_PATH) {
  const absolutePath = path.resolve(dispositionPath);
  const result = readJson(absolutePath);
  return { path: absolutePath, disposition: result.value, errors: result.errors };
}

function expectedGroupFor(relativePath) {
  if (relativePath.startsWith("artifacts/tearbench/c24/")) return "c24-mixed-age-build-assets";
  if (relativePath.startsWith("artifacts/tearbench/c3-") && relativePath.endsWith(".json")) return "c3-path-bound-scenarios";
  if (HISTORICAL_PATHS.has(relativePath)) return "historical-provenance";
  return null;
}

function isSafeArtifactPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) return false;
  const normalized = relativePath.replaceAll("\\", "/");
  return normalized === relativePath
    && normalized.startsWith("artifacts/")
    && !normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

export function validateArtifactDispositionShape(disposition) {
  const errors = [];
  if (disposition?.format !== ARTIFACT_DISPOSITION_FORMAT) errors.push(`format must be ${ARTIFACT_DISPOSITION_FORMAT}`);
  if (disposition?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (disposition?.kind !== "retain-in-place") errors.push("kind must be retain-in-place");
  if (disposition?.repository !== "shaku1z/tear") errors.push("repository must be shaku1z/tear");
  if (!SHA1_PATTERN.test(disposition?.canonical?.head ?? "")) errors.push("canonical.head must be a 40-character SHA-1");
  if (disposition?.canonical?.branch !== "main") errors.push("canonical.branch must be main");
  if (disposition?.canonical?.originMain !== disposition?.canonical?.head) errors.push("canonical.originMain must equal canonical.head");

  const source = disposition?.sourceReport;
  if (source?.format !== "tear-artifact-retention-manifest") errors.push("sourceReport.format must identify the artifact report");
  if (source?.sourceId !== "ignored-artifacts" || source?.sourceRelativePath !== "artifacts") errors.push("sourceReport must identify the ignored-artifacts/artifacts source");
  if (!SHA256_PATTERN.test(source?.sha256 ?? "")) errors.push("sourceReport.sha256 must be a SHA-256");
  if (!SHA256_PATTERN.test(source?.policySha256 ?? "")) errors.push("sourceReport.policySha256 must be a SHA-256");
  if (!Number.isSafeInteger(source?.summary?.eligibleEntries) || source.summary.eligibleEntries !== 104) errors.push("sourceReport.summary.eligibleEntries must be 104");
  if (!Number.isSafeInteger(source?.summary?.eligibleBytes) || source.summary.eligibleBytes !== 31_683_314) errors.push("sourceReport.summary.eligibleBytes must be 31683314");

  const entries = disposition?.entries;
  if (!Array.isArray(entries) || entries.length !== 104) {
    errors.push("entries must contain exactly 104 files");
  }
  if (!Array.isArray(disposition?.groups) || disposition.groups.length !== EXPECTED_GROUPS.size) {
    errors.push("groups must contain exactly the three reviewed disposition groups");
  }
  for (const [id, expected] of EXPECTED_GROUPS) {
    const group = disposition?.groups?.find((candidate) => candidate?.id === id);
    if (group === undefined) {
      errors.push(`missing disposition group ${id}`);
    } else {
      if (group.count !== expected.count) errors.push(`${id}.count must be ${expected.count}`);
      if (group.bytes !== expected.bytes) errors.push(`${id}.bytes must be ${expected.bytes}`);
      if (typeof group.reason !== "string" || group.reason.trim() === "") errors.push(`${id}.reason must explain the retain-in-place decision`);
    }
  }
  const seen = new Set();
  const groupTotals = new Map([...EXPECTED_GROUPS.keys()].map((id) => [id, { count: 0, bytes: 0 }]));
  for (const [index, entry] of (Array.isArray(entries) ? entries : []).entries()) {
    const label = `entries[${index}]`;
    if (!isSafeArtifactPath(entry?.path)) errors.push(`${label}.path must be a safe artifacts-relative POSIX path`);
    const pathKey = String(entry?.path ?? "").toLowerCase();
    if (seen.has(pathKey)) errors.push(`${label}.path is duplicated case-insensitively`);
    seen.add(pathKey);
    if (!Number.isSafeInteger(entry?.bytes) || entry.bytes < 0) errors.push(`${label}.bytes must be a non-negative safe integer`);
    if (!SHA256_PATTERN.test(entry?.sha256 ?? "")) errors.push(`${label}.sha256 must be a SHA-256`);
    if (typeof entry?.mtimeUtc !== "string" || Number.isNaN(Date.parse(entry.mtimeUtc))) errors.push(`${label}.mtimeUtc must be an ISO timestamp`);
    if (!EXPECTED_GROUPS.has(entry?.group)) errors.push(`${label}.group is not an expected disposition group`);
    const expectedGroup = expectedGroupFor(entry?.path);
    if (expectedGroup !== entry?.group) errors.push(`${label}.group does not match its path-bound group`);
    if (entry?.sourceReport !== "artifact-retention-report-5281470") errors.push(`${label}.sourceReport must bind the reviewed source report`);
    if (EXPECTED_GROUPS.has(entry?.group)) {
      const totals = groupTotals.get(entry.group);
      totals.count += 1;
      totals.bytes += entry.bytes;
    }
  }
  for (const [id, expected] of EXPECTED_GROUPS) {
    const actual = groupTotals.get(id);
    if (actual.count !== expected.count) errors.push(`${id} count must be ${expected.count}; found ${actual.count}`);
    if (actual.bytes !== expected.bytes) errors.push(`${id} bytes must be ${expected.bytes}; found ${actual.bytes}`);
  }
  if (Array.isArray(entries)) {
    const totalBytes = entries.reduce((sum, entry) => sum + (Number.isSafeInteger(entry?.bytes) ? entry.bytes : 0), 0);
    if (totalBytes !== 31_683_314) errors.push(`entries total bytes must be 31683314; found ${totalBytes}`);
  }

  const authorization = disposition?.authorization;
  for (const field of ["quarantine", "delete", "deduplicate", "overwrite", "move"]) {
    if (authorization?.[field] !== "not-authorized") errors.push(`authorization.${field} must be not-authorized`);
  }
  if (authorization?.decision !== "retain-in-place") errors.push("authorization.decision must be retain-in-place");
  if (authorization?.ageEligibilityIsNotMoveAuthorization !== true) errors.push("age eligibility must not authorize movement");
  if (authorization?.futureAgeEligibleFiles !== "unreviewed-until-separately-dispositioned") errors.push("future age-eligible files must remain unreviewed");
  if (authorization?.artifactQuarantine?.relativePath !== ".artifact-quarantine" || authorization?.artifactQuarantine?.status !== "unused" || authorization?.artifactQuarantine?.existsAtEvidence !== false) {
    errors.push(".artifact-quarantine must be recorded as unused and absent at evidence time");
  }

  if (disposition?.validation?.hashAlgorithm !== "sha256" || disposition?.validation?.pathEncoding !== "relative-posix-v1") errors.push("validation must use SHA-256 relative-posix-v1 bindings");
  if (disposition?.validation?.currentFileSet !== "exact" || disposition?.validation?.futureEligibleHandling !== "surface-as-unreviewed") errors.push("validation must enforce an exact set and surface future files as unreviewed");
  return errors;
}

export function compareArtifactDispositionEntries(dispositionEntries, currentEntries) {
  const expected = new Map(dispositionEntries.map((entry) => [entry.path, entry]));
  const current = new Map(currentEntries.map((entry) => [entry.repoRelativePath, entry]));
  const unreviewed = [...current.keys()].filter((relativePath) => !expected.has(relativePath)).sort();
  const missing = [...expected.keys()].filter((relativePath) => !current.has(relativePath)).sort();
  const changed = [];
  for (const [relativePath, entry] of expected) {
    const currentEntry = current.get(relativePath);
    if (currentEntry !== undefined && (currentEntry.bytes !== entry.bytes || currentEntry.sha256 !== entry.sha256 || currentEntry.timestamps?.mtimeUtc !== entry.mtimeUtc)) {
      changed.push({ path: relativePath, expected: { bytes: entry.bytes, sha256: entry.sha256, mtimeUtc: entry.mtimeUtc }, current: { bytes: currentEntry.bytes, sha256: currentEntry.sha256, mtimeUtc: currentEntry.timestamps?.mtimeUtc } });
    }
  }
  return { unreviewed, missing, changed };
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe", windowsHide: true });
  return { ok: result.status === 0, stdout: String(result.stdout ?? "").trim(), stderr: String(result.stderr ?? "").trim() };
}

export function validateArtifactDisposition({
  root = process.cwd(),
  dispositionPath = DEFAULT_ARTIFACT_DISPOSITION_PATH,
  policyPath = DEFAULT_ARTIFACT_RETENTION_POLICY_PATH,
  now = new Date(),
} = {}) {
  const absoluteRoot = path.resolve(root);
  const loaded = readArtifactDisposition(dispositionPath);
  const errors = [...loaded.errors, ...validateArtifactDispositionShape(loaded.disposition)];
  if (loaded.disposition === null || errors.length > 0) return { ok: false, status: "invalid", errors, unreviewed: [], missing: [], changed: [] };

  const disposition = loaded.disposition;
  const headResult = git(absoluteRoot, ["rev-parse", "HEAD"]);
  if (!headResult.ok) errors.push("could not read current Git HEAD");
  else {
    const ancestor = git(absoluteRoot, ["merge-base", "--is-ancestor", disposition.canonical.head, headResult.stdout]);
    if (!ancestor.ok) errors.push(`disposition evidence head ${disposition.canonical.head} is not an ancestor of current HEAD ${headResult.stdout}`);
  }
  const quarantinePath = path.resolve(absoluteRoot, ".artifact-quarantine");
  if (fs.existsSync(quarantinePath)) {
    let children = [];
    try { children = fs.readdirSync(quarantinePath); } catch (error) { errors.push(`could not inspect .artifact-quarantine: ${error instanceof Error ? error.message : String(error)}`); }
    if (children.length > 0) errors.push(".artifact-quarantine is not unused; it contains entries");
  }

  let report;
  try {
    report = runArtifactReport({
      root: absoluteRoot,
      policyPath,
      sourceId: disposition.sourceReport.sourceId,
      minAgeDays: disposition.sourceReport.age.minAgeDays,
      now,
    });
  } catch (error) {
    errors.push(`current artifact report failed: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, status: "invalid", errors, unreviewed: [], missing: [], changed: [] };
  }
  if (report.policySha256 !== disposition.sourceReport.policySha256) errors.push("current artifact policy hash differs from the disposition evidence");
  const comparison = compareArtifactDispositionEntries(disposition.entries, report.entries.filter((entry) => entry.decision === "eligible"));
  if (comparison.unreviewed.length > 0) errors.push(`${comparison.unreviewed.length} age-eligible artifact(s) are unreviewed: ${comparison.unreviewed.join(", ")}`);
  if (comparison.missing.length > 0) errors.push(`${comparison.missing.length} disposed artifact(s) are missing or no longer eligible: ${comparison.missing.join(", ")}`);
  if (comparison.changed.length > 0) errors.push(`${comparison.changed.length} disposed artifact(s) changed size, hash, or mtime`);
  const status = comparison.unreviewed.length > 0 ? "unreviewed" : errors.length > 0 ? "invalid" : "valid";
  return { ok: errors.length === 0, status, errors, unreviewed: comparison.unreviewed, missing: comparison.missing, changed: comparison.changed, current: { head: report.head, summary: report.summary } };
}

function main() {
  try {
    const result = validateArtifactDisposition();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(import.meta.filename)) main();
