import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { RELEASE_REPOSITORY } from "./release-artifact.mjs";
import { normalizeRepositoryIdentifier } from "./repository-identity.mjs";

export const DEFAULT_ARTIFACT_RETENTION_POLICY_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "preservation",
  "artifact-retention-policy.json",
);
export const ARTIFACT_RETENTION_POLICY_FORMAT = "tear-artifact-retention-policy";
export const ARTIFACT_RETENTION_MANIFEST_FORMAT = "tear-artifact-retention-manifest";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const WINDOWS_ABSOLUTE_PATTERN = /^(?:[A-Za-z]:|[\\/])/u;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHUNK_SIZE = 1024 * 1024;

export class ArtifactReportError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArtifactReportError";
  }
}

function comparablePath(value) {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function isPathInside(root, candidate, { allowEqual = false } = {}) {
  const relativePath = path.relative(root, candidate);
  if (relativePath === "") return allowEqual;
  return relativePath !== ".."
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
}

function normalizeRelativePath(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new ArtifactReportError(`${label} must be a non-empty relative path`);
  const normalized = value.replaceAll("\\", "/");
  if (WINDOWS_ABSOLUTE_PATTERN.test(normalized) || normalized.split("/").includes("..")) {
    throw new ArtifactReportError(`${label} must remain inside the repository: ${value}`);
  }
  if (normalized === "." || normalized.split("/").some((segment) => segment === "" || segment === ".")) {
    throw new ArtifactReportError(`${label} must not contain empty or dot path segments: ${value}`);
  }
  return normalized.replace(/\/+$/u, "");
}

function normalizeManifestPath(value) {
  const normalized = String(value).replaceAll("\\", "/");
  if (normalized === "" || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized)) return null;
  if (normalized.split("/").some((segment) => segment === ".." || segment === "" || segment === ".")) return null;
  return normalized;
}

function prefixMatches(value, prefix) {
  const normalizedValue = value.toLowerCase().replace(/\/+$/u, "");
  const normalizedPrefix = prefix.toLowerCase().replace(/\/+$/u, "");
  return normalizedValue === normalizedPrefix || normalizedValue.startsWith(`${normalizedPrefix}/`);
}

function runGit(root, argumentsList) {
  const result = spawnSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function gitError(result, command) {
  const detail = result.error?.message || result.stderr || result.stdout || "unknown error";
  return `${command} failed: ${String(detail).trim()}`;
}

function sha256Bytes(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function sha256File(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
  let bytes = 0;
  try {
    let read;
    do {
      read = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (read > 0) {
        hash.update(buffer.subarray(0, read));
        bytes += read;
      }
    } while (read > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function formatUtc(milliseconds) {
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) throw new ArtifactReportError("file timestamp is not representable as UTC");
  return date.toISOString();
}

function timestamps(stats) {
  return {
    atimeUtc: formatUtc(stats.atimeMs),
    mtimeUtc: formatUtc(stats.mtimeMs),
    birthtimeUtc: formatUtc(stats.birthtimeMs),
  };
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ArtifactReportError(`${filePath} is not valid JSON: ${error.message}`);
  }
  return { parsed, raw };
}

function validateRelativePrefix(value, label) {
  if (typeof value !== "string" || value.trim() === "") return `${label} must be a non-empty string`;
  const withoutTrailingSlash = value.replace(/[\\/]$/u, "");
  try {
    normalizeRelativePath(withoutTrailingSlash, label);
  } catch (error) {
    return error.message;
  }
  return null;
}

export function validateArtifactRetentionPolicy(policy) {
  const errors = [];
  if (policy?.format !== ARTIFACT_RETENTION_POLICY_FORMAT) errors.push(`format must be ${ARTIFACT_RETENTION_POLICY_FORMAT}`);
  if (policy?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (policy?.repository !== RELEASE_REPOSITORY) errors.push(`repository must be ${RELEASE_REPOSITORY}`);

  const boundary = policy?.boundary;
  for (const field of ["rootMustBeCanonicalGitRoot", "sourceMustBeInsideRoot", "destinationMustBeInsideRoot"]) {
    if (boundary?.[field] !== true) errors.push(`boundary.${field} must be true`);
  }
  if (boundary?.externalRoots !== false) errors.push("boundary.externalRoots must be false");

  if (!Array.isArray(policy?.sourceRoots) || policy.sourceRoots.length !== 1) {
    errors.push("sourceRoots must contain exactly one allowlisted source");
  } else {
    const source = policy.sourceRoots[0];
    if (source?.id !== "ignored-artifacts") errors.push("sourceRoots[0].id must be ignored-artifacts");
    if (source?.relativePath !== "artifacts") errors.push("sourceRoots[0].relativePath must be artifacts");
    try {
      normalizeRelativePath(source?.relativePath, "sourceRoots[0].relativePath");
    } catch (error) {
      errors.push(error.message);
    }
  }

  const destination = policy?.destination;
  if (destination?.relativeParent !== ".artifact-quarantine") errors.push("destination.relativeParent must be .artifact-quarantine");
  try {
    normalizeRelativePath(destination?.relativeParent, "destination.relativeParent");
  } catch (error) {
    errors.push(error.message);
  }
  if (destination?.mustBeExistingEmptyDirectory !== true) errors.push("destination.mustBeExistingEmptyDirectory must be true");
  if (destination?.sameVolumeAsSource !== true) errors.push("destination.sameVolumeAsSource must be true");

  const age = policy?.age;
  if (age?.basis !== "mtimeUtc") errors.push("age.basis must be mtimeUtc");
  if (!Number.isSafeInteger(age?.defaultMinAgeDays) || age.defaultMinAgeDays < 0) errors.push("age.defaultMinAgeDays must be a non-negative integer");
  if (age?.applyRequiresExplicitMinAgeDays !== true) errors.push("age.applyRequiresExplicitMinAgeDays must be true");
  if (age?.futureMtime !== "refuse") errors.push("age.futureMtime must be refuse");

  for (const field of ["maxEntries", "maxBytes", "maxDepth"]) {
    if (!Number.isSafeInteger(policy?.limits?.[field]) || policy.limits[field] <= 0) errors.push(`limits.${field} must be a positive integer`);
  }

  const protectedPolicy = policy?.protected;
  for (const field of ["activeOutputPrefixes", "preservedPrefixes"]) {
    if (!Array.isArray(protectedPolicy?.[field])) errors.push(`protected.${field} must be an array`);
    else for (const [index, prefix] of protectedPolicy[field].entries()) {
      const error = validateRelativePrefix(prefix, `protected.${field}[${index}]`);
      if (error) errors.push(error);
    }
  }
  if (!Array.isArray(protectedPolicy?.forbiddenSegments) || !protectedPolicy.forbiddenSegments.includes(".git")) {
    errors.push("protected.forbiddenSegments must include .git");
  }
  for (const requiredPrefix of ["artifacts/tearbench/generated/", "artifacts/tearbench/receipts/"]) {
    if (!protectedPolicy?.activeOutputPrefixes?.some((prefix) => prefix.toLowerCase().replace(/[\\/]$/u, "") === requiredPrefix.slice(0, -1))) {
      errors.push(`protected.activeOutputPrefixes must include ${requiredPrefix}`);
    }
  }
  if (!protectedPolicy?.preservedPrefixes?.some((prefix) => prefix.toLowerCase().replace(/[\\/]$/u, "") === "artifacts/t26w")) {
    errors.push("protected.preservedPrefixes must include artifacts/t26w/");
  }
  if (!Array.isArray(protectedPolicy?.recoveryNamePatterns) || protectedPolicy.recoveryNamePatterns.length === 0) {
    errors.push("protected.recoveryNamePatterns must not be empty");
  } else {
    for (const [index, pattern] of protectedPolicy.recoveryNamePatterns.entries()) {
      try {
        new RegExp(pattern, "iu");
      } catch (error) {
        errors.push(`protected.recoveryNamePatterns[${index}] is invalid: ${error.message}`);
      }
    }
  }
  if (protectedPolicy?.reparsePoints !== "refuse") errors.push("protected.reparsePoints must be refuse");

  if (policy?.hash?.algorithm !== "sha256") errors.push("hash.algorithm must be sha256");
  if (policy?.hash?.pathEncoding !== "relative-posix-v1") errors.push("hash.pathEncoding must be relative-posix-v1");

  if (policy?.preserve?.operation !== "same-volume-rename-only") errors.push("preserve.operation must be same-volume-rename-only");
  if (policy?.preserve?.relativePaths !== true) errors.push("preserve.relativePaths must be true");
  if (!Array.isArray(policy?.preserve?.timestamps) || !["atimeUtc", "mtimeUtc", "birthtimeUtc"].every((field) => policy.preserve.timestamps.includes(field))) {
    errors.push("preserve.timestamps must include atimeUtc, mtimeUtc, and birthtimeUtc");
  }
  if (policy?.preserve?.restoreInstructions !== "required") errors.push("preserve.restoreInstructions must be required");

  for (const field of ["requiresCleanMain", "sameVolumeRenameOnly", "overwrite", "deleteSource"]) {
    if (typeof policy?.apply?.[field] !== "boolean") errors.push(`apply.${field} must be boolean`);
  }
  if (policy?.apply?.requiresCleanMain !== true) errors.push("apply.requiresCleanMain must be true");
  if (policy?.apply?.sameVolumeRenameOnly !== true) errors.push("apply.sameVolumeRenameOnly must be true");
  if (policy?.apply?.overwrite !== false) errors.push("apply.overwrite must be false");
  if (policy?.apply?.deleteSource !== false) errors.push("apply.deleteSource must be false");
  if (policy?.apply?.journal !== "required") errors.push("apply.journal must be required");

  return errors;
}

export function readArtifactRetentionPolicy(policyPath = DEFAULT_ARTIFACT_RETENTION_POLICY_PATH) {
  const absolutePath = path.resolve(policyPath);
  try {
    const { parsed, raw } = readJsonFile(absolutePath);
    const errors = validateArtifactRetentionPolicy(parsed);
    return {
      policy: parsed,
      errors,
      path: absolutePath,
      sha256: sha256Bytes(Buffer.from(raw, "utf8")),
    };
  } catch (error) {
    return {
      policy: null,
      errors: [error.message],
      path: absolutePath,
      sha256: null,
    };
  }
}

function inspectPath(candidate, root) {
  let stats;
  try {
    stats = fs.lstatSync(candidate);
  } catch (error) {
    return { stats: null, reason: `unreadable:${error.code ?? "unknown"}` };
  }
  if (stats.isSymbolicLink()) return { stats, reason: "symlink-or-reparse" };

  let realPath;
  try {
    realPath = fs.realpathSync.native(candidate);
  } catch (error) {
    return { stats, reason: `unresolvable:${error.code ?? "unknown"}` };
  }
  if (!isPathInside(root, realPath, { allowEqual: true })) return { stats, reason: "outside-root" };
  if (!samePath(candidate, realPath)) return { stats, reason: "symlink-or-reparse" };
  return { stats, realPath, reason: null };
}

function entryKind(stats) {
  if (stats === null) return "unknown";
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  return "other";
}

function makeEntry({ sourceRoot, repoRoot, candidate, stats, decision, reasonCodes, sha256 = null, bytes = null }) {
  const relativePath = normalizeManifestPath(path.relative(sourceRoot, candidate).replaceAll("\\", "/"));
  if (relativePath === null) throw new ArtifactReportError(`unsafe manifest path: ${candidate}`);
  return {
    relativePath,
    repoRelativePath: normalizeManifestPath(path.relative(repoRoot, candidate).replaceAll("\\", "/")),
    kind: entryKind(stats),
    bytes,
    sha256,
    timestamps: stats === null ? null : timestamps(stats),
    decision,
    reasonCodes,
  };
}

function reasonForProtectedPath(repoRelativePath, policy) {
  const segments = repoRelativePath.split("/");
  if (segments.some((segment) => policy.protected.forbiddenSegments.some((forbidden) => segment.toLowerCase() === forbidden.toLowerCase()))) {
    return "nested-git";
  }
  for (const pattern of policy.protected.recoveryNamePatterns) {
    if (new RegExp(pattern, "iu").test(repoRelativePath)) return "recovery-archive";
  }
  for (const prefix of policy.protected.activeOutputPrefixes) {
    if (prefixMatches(repoRelativePath, prefix)) return "active-output";
  }
  for (const prefix of policy.protected.preservedPrefixes) {
    if (prefixMatches(repoRelativePath, prefix)) return "preserved-subtree";
  }
  return null;
}

function assertAge(minAgeDays) {
  if (!Number.isSafeInteger(minAgeDays) || minAgeDays < 0) throw new ArtifactReportError("minAgeDays must be a non-negative integer");
}

function resolveRepositoryRoot(root) {
  const absoluteRoot = path.resolve(root);
  const rootInspection = inspectPath(absoluteRoot, path.dirname(absoluteRoot));
  if (rootInspection.reason !== null || rootInspection.stats === null || !rootInspection.stats.isDirectory()) {
    throw new ArtifactReportError(`root must be a regular canonical directory: ${absoluteRoot}`);
  }
  const gitRoot = runGit(absoluteRoot, ["rev-parse", "--show-toplevel"]);
  if (!gitRoot.ok) throw new ArtifactReportError(gitError(gitRoot, "git rev-parse --show-toplevel"));
  const reportedRoot = path.resolve(gitRoot.stdout.trim());
  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync.native(absoluteRoot);
  } catch (error) {
    throw new ArtifactReportError(`cannot resolve root: ${error.message}`);
  }
  if (!samePath(canonicalRoot, reportedRoot) || !samePath(canonicalRoot, absoluteRoot)) {
    throw new ArtifactReportError(`root is not the canonical Git root: ${absoluteRoot}`);
  }
  const origin = runGit(absoluteRoot, ["config", "--get", "remote.origin.url"]);
  const originUrl = origin.ok ? origin.stdout.trim() : "";
  if (!origin.ok || normalizeRepositoryIdentifier(originUrl) !== normalizeRepositoryIdentifier(RELEASE_REPOSITORY)) {
    throw new ArtifactReportError(`root remote.origin.url must identify ${RELEASE_REPOSITORY}; found ${originUrl || "missing"}`);
  }
  const head = runGit(absoluteRoot, ["rev-parse", "HEAD"]);
  if (!head.ok || !SHA_PATTERN.test(head.stdout.trim().toLowerCase())) throw new ArtifactReportError(gitError(head, "git rev-parse HEAD"));
  return { canonicalRoot, head: head.stdout.trim().toLowerCase() };
}

function resolveSourceRoot({ root, policy, sourceId }) {
  const source = policy.sourceRoots.find((candidate) => candidate.id === sourceId);
  if (source === undefined) throw new ArtifactReportError(`source is not allowlisted: ${sourceId}`);
  const relativeSource = normalizeRelativePath(source.relativePath, `source ${source.id}`);
  const sourceRoot = path.resolve(root, relativeSource);
  if (!isPathInside(root, sourceRoot)) throw new ArtifactReportError(`source is outside the repository: ${source.relativePath}`);
  const inspection = inspectPath(sourceRoot, root);
  if (inspection.reason !== null || inspection.stats === null || !inspection.stats.isDirectory()) {
    throw new ArtifactReportError(`source must be a canonical directory: ${sourceRoot}`);
  }
  return { id: source.id, relativePath: relativeSource, sourceRoot: inspection.realPath };
}

function createSummary(entries, observedBytes, scannedEntries) {
  const summary = {
    scannedEntries,
    eligibleEntries: 0,
    eligibleBytes: 0,
    protectedEntries: 0,
    refusedEntries: 0,
    tooYoungEntries: 0,
    futureEntries: 0,
    observedBytes,
  };
  for (const entry of entries) {
    if (entry.decision === "eligible") {
      summary.eligibleEntries += 1;
      summary.eligibleBytes += entry.bytes;
    } else if (entry.decision === "protected") summary.protectedEntries += 1;
    else if (entry.decision === "refused") summary.refusedEntries += 1;
    else if (entry.decision === "too-young") summary.tooYoungEntries += 1;
    else if (entry.decision === "future") summary.futureEntries += 1;
  }
  return summary;
}

function reportEntry({ sourceRoot, repoRoot, candidate, inspection, decision, reasonCodes, sha256 = null, bytes = null }) {
  return makeEntry({
    sourceRoot,
    repoRoot,
    candidate,
    stats: inspection.stats,
    decision,
    reasonCodes,
    sha256,
    bytes,
  });
}

export function runArtifactReport({
  root,
  policyPath,
  sourceId,
  minAgeDays,
  now = new Date(),
} = {}) {
  if (root === undefined || policyPath === undefined || sourceId === undefined || minAgeDays === undefined) {
    throw new ArtifactReportError("root, policy, source, and minAgeDays are required");
  }
  assertAge(minAgeDays);
  const loaded = readArtifactRetentionPolicy(policyPath);
  if (loaded.errors.length > 0) throw new ArtifactReportError(`artifact retention policy is invalid:\n- ${loaded.errors.join("\n- ")}`);
  const { canonicalRoot, head } = resolveRepositoryRoot(root);
  const source = resolveSourceRoot({ root: canonicalRoot, policy: loaded.policy, sourceId });
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new ArtifactReportError("now must be a valid date");
  const cutoffMs = nowMs - minAgeDays * DAY_MS;
  const entries = [];
  const manifestPathKeys = new Set();
  let observedBytes = 0;
  let scannedEntries = 0;

  function pushEntry(entry) {
    const manifestPathKey = entry.relativePath.toLowerCase();
    if (manifestPathKeys.has(manifestPathKey)) throw new ArtifactReportError(`artifact report has a case-folded path collision: ${entry.relativePath}`);
    manifestPathKeys.add(manifestPathKey);
    entries.push(entry);
    if (entries.length > loaded.policy.limits.maxEntries) throw new ArtifactReportError(`artifact report exceeds maxEntries ${loaded.policy.limits.maxEntries}`);
  }

  function visit(directory, depth) {
    if (depth > loaded.policy.limits.maxDepth) throw new ArtifactReportError(`artifact report exceeds maxDepth ${loaded.policy.limits.maxDepth}: ${directory}`);
    const children = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      scannedEntries += 1;
      if (scannedEntries > loaded.policy.limits.maxEntries) throw new ArtifactReportError(`artifact report exceeds maxEntries ${loaded.policy.limits.maxEntries}`);
      const candidate = path.join(directory, child.name);
      const inspection = inspectPath(candidate, canonicalRoot);
      const repoRelativePath = normalizeManifestPath(path.relative(canonicalRoot, candidate).replaceAll("\\", "/"));
      if (repoRelativePath === null) throw new ArtifactReportError(`unsafe repository-relative path: ${candidate}`);
      if (inspection.reason !== null || inspection.stats === null) {
        pushEntry(reportEntry({
          sourceRoot: source.sourceRoot,
          repoRoot: canonicalRoot,
          candidate,
          inspection,
          decision: "refused",
          reasonCodes: [inspection.reason ?? "unreadable"],
          bytes: inspection.stats?.isFile() ? inspection.stats.size : null,
        }));
        continue;
      }

      const protectedReason = reasonForProtectedPath(repoRelativePath, loaded.policy);
      if (protectedReason !== null) {
        const decision = ["nested-git", "recovery-archive"].includes(protectedReason) ? "refused" : "protected";
        pushEntry(reportEntry({
          sourceRoot: source.sourceRoot,
          repoRoot: canonicalRoot,
          candidate,
          inspection,
          decision,
          reasonCodes: [protectedReason],
          bytes: inspection.stats.isFile() ? inspection.stats.size : null,
        }));
        if (inspection.stats.isDirectory()) continue;
        if (inspection.stats.isFile()) {
          observedBytes += inspection.stats.size;
          if (observedBytes > loaded.policy.limits.maxBytes) throw new ArtifactReportError(`artifact report exceeds maxBytes ${loaded.policy.limits.maxBytes}`);
        }
        continue;
      }

      if (inspection.stats.isDirectory()) {
        visit(candidate, depth + 1);
        continue;
      }
      if (!inspection.stats.isFile()) {
        pushEntry(reportEntry({
          sourceRoot: source.sourceRoot,
          repoRoot: canonicalRoot,
          candidate,
          inspection,
          decision: "refused",
          reasonCodes: ["unsupported-file-type"],
        }));
        continue;
      }

      observedBytes += inspection.stats.size;
      if (observedBytes > loaded.policy.limits.maxBytes) throw new ArtifactReportError(`artifact report exceeds maxBytes ${loaded.policy.limits.maxBytes}`);
      const fileTimestamps = timestamps(inspection.stats);
      if (inspection.stats.mtimeMs > nowMs) {
        pushEntry(reportEntry({
          sourceRoot: source.sourceRoot,
          repoRoot: canonicalRoot,
          candidate,
          inspection,
          decision: "future",
          reasonCodes: ["future-mtime"],
          bytes: inspection.stats.size,
        }));
        continue;
      }
      if (inspection.stats.mtimeMs >= cutoffMs) {
        pushEntry(reportEntry({
          sourceRoot: source.sourceRoot,
          repoRoot: canonicalRoot,
          candidate,
          inspection,
          decision: "too-young",
          reasonCodes: ["below-min-age"],
          bytes: inspection.stats.size,
        }));
        continue;
      }

      const hash = sha256File(candidate);
      const afterHash = fs.lstatSync(candidate);
      if (!afterHash.isFile() || afterHash.size !== inspection.stats.size || afterHash.mtimeMs !== inspection.stats.mtimeMs) {
        pushEntry(reportEntry({
          sourceRoot: source.sourceRoot,
          repoRoot: canonicalRoot,
          candidate,
          inspection: { ...inspection, stats: afterHash },
          decision: "refused",
          reasonCodes: ["changed-during-read"],
          bytes: afterHash.size,
        }));
        continue;
      }
      pushEntry(reportEntry({
        sourceRoot: source.sourceRoot,
        repoRoot: canonicalRoot,
        candidate,
        inspection: { ...inspection, stats: afterHash },
        decision: "eligible",
        reasonCodes: [],
        sha256: hash.sha256,
        bytes: hash.bytes,
      }));
      if (fileTimestamps.mtimeUtc !== timestamps(afterHash).mtimeUtc) throw new ArtifactReportError(`file timestamp changed while hashing: ${candidate}`);
    }
  }

  visit(source.sourceRoot, 0);
  const manifest = {
    format: ARTIFACT_RETENTION_MANIFEST_FORMAT,
    schemaVersion: 1,
    kind: "selection",
    repository: loaded.policy.repository,
    repoRoot: {
      relativePath: ".",
      canonicalPath: canonicalRoot,
    },
    sourceRoot: {
      id: source.id,
      relativePath: source.relativePath,
      canonicalPath: source.sourceRoot,
    },
    policySha256: loaded.sha256,
    head,
    generatedAtUtc: formatUtc(nowMs),
    age: {
      basis: "mtimeUtc",
      minAgeDays,
      cutoffUtc: formatUtc(cutoffMs),
    },
    entries,
    summary: createSummary(entries, observedBytes, scannedEntries),
    restoreGuidance: {
      status: "quarantine-deferred",
      instructions: [
        "This report performs no move or deletion.",
        "Do not create a quarantine receipt until the manifest, owner, retention date, and recovery procedure are reviewed.",
        "Any future restore must verify each recorded SHA-256 and timestamp before moving a relative path back under the source root.",
      ],
    },
  };
  return manifest;
}

function assertOutputPathSafe(outputPath, sourceRoot) {
  const absoluteOutput = path.resolve(outputPath);
  if (isPathInside(sourceRoot, absoluteOutput, { allowEqual: true })) throw new ArtifactReportError("output must be outside the scanned source root");
  if (fs.existsSync(absoluteOutput)) throw new ArtifactReportError(`output already exists; refusing overwrite: ${absoluteOutput}`);
  const parent = path.dirname(absoluteOutput);
  if (!fs.existsSync(parent)) throw new ArtifactReportError(`output parent does not exist: ${parent}`);
  const parentInspection = inspectPath(parent, path.dirname(parent));
  if (parentInspection.reason !== null || parentInspection.stats === null || !parentInspection.stats.isDirectory()) {
    throw new ArtifactReportError(`output parent is not a canonical directory: ${parent}`);
  }
  return absoluteOutput;
}

export function writeArtifactReport(outputPath, manifest) {
  const absoluteOutput = assertOutputPathSafe(outputPath, manifest.sourceRoot.canonicalPath);
  const payload = `${JSON.stringify(manifest, null, 2)}\n`;
  try {
    fs.writeFileSync(absoluteOutput, payload, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    throw new ArtifactReportError(`could not write report without overwrite: ${error.message}`);
  }
  return absoluteOutput;
}

function parseArguments(argumentsList) {
  const options = { summaryOnly: false };
  const seen = new Set();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    if (argument === "--summary-only") {
      options.summaryOnly = true;
      continue;
    }
    const valueFlags = new Map([
      ["--root", "root"],
      ["--policy", "policyPath"],
      ["--source", "sourceId"],
      ["--min-age-days", "minAgeDays"],
      ["--output", "outputPath"],
    ]);
    const optionName = valueFlags.get(argument);
    if (optionName === undefined) throw new ArtifactReportError(`unknown argument: ${argument}`);
    if (seen.has(argument)) throw new ArtifactReportError(`duplicate argument: ${argument}`);
    seen.add(argument);
    const value = argumentsList[++index];
    if (value === undefined || value.startsWith("--")) throw new ArtifactReportError(`${argument} requires a value`);
    options[optionName] = optionName === "minAgeDays" ? Number(value) : value;
  }
  if (options.help) return options;
  for (const field of ["root", "policyPath", "sourceId", "minAgeDays"]) {
    if (options[field] === undefined) throw new ArtifactReportError(`--${field === "policyPath" ? "policy" : field === "sourceId" ? "source" : field === "minAgeDays" ? "min-age-days" : "root"} is required`);
  }
  assertAge(options.minAgeDays);
  if (options.outputPath !== undefined) options.outputPath = path.resolve(options.outputPath);
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/report-artifacts.mjs --root <repo> --policy <policy.json> --source <source-id> --min-age-days <days> [--summary-only] [--output <new-file.json>]");
      return;
    }
    const manifest = runArtifactReport(options);
    if (options.outputPath !== undefined) writeArtifactReport(options.outputPath, manifest);
    const output = options.summaryOnly
      ? {
        format: manifest.format,
        schemaVersion: manifest.schemaVersion,
        sourceRoot: manifest.sourceRoot,
        head: manifest.head,
        summary: manifest.summary,
      }
      : manifest;
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(import.meta.filename)) main();
