import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PRESERVED_COPY_COMPARISON_FORMAT = "tear-preserved-copy-comparison";
export const PRESERVED_COPY_COMPARISON_SCHEMA_VERSION = 1;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TARGET_COPY_NAMES = Object.freeze(["Tear-main-publication", "Tear-receipt-clean"]);
const SAMPLE_LIMIT = 20;

function samePath(left, right) {
  const normalize = (value) => path.resolve(value).toLowerCase();
  return normalize(left) === normalize(right);
}

function isInside(root, candidate, allowEqual = false) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (allowEqual && relative === "")
    || (relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function normalizeRelativePath(value, label) {
  const normalized = String(value).replaceAll("\\", "/");
  if (
    normalized === ""
    || normalized.startsWith("/")
    || /^[A-Za-z]:/u.test(normalized)
    || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new Error(`${label} is not a safe relative path: ${value}`);
  return normalized;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} could not be read as JSON: ${error.message}`, { cause: error });
  }
}

function hashFileSync(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function git(root, argumentsList) {
  const result = spawnSync("git", ["-C", root, ...argumentsList], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`git ${argumentsList.join(" ")} failed: ${(result.stderr || result.stdout || "git failed").trim()}`);
  }
  return result.stdout;
}

function inspectCanonicalRepository(repoRoot) {
  const canonicalRoot = path.resolve(repoRoot);
  const gitRoot = path.resolve(git(canonicalRoot, ["rev-parse", "--show-toplevel"]).trim());
  if (!samePath(gitRoot, canonicalRoot)) throw new Error(`repo-root is not the canonical Git root: ${canonicalRoot}`);
  const branch = git(canonicalRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]).trim();
  const head = git(canonicalRoot, ["rev-parse", "HEAD"]).trim();
  const originMain = git(canonicalRoot, ["rev-parse", "origin/main"]).trim();
  const status = git(canonicalRoot, ["status", "--porcelain=v1", "--untracked-files=all"]).trim();
  if (branch !== "main" || head !== originMain || status !== "") {
    throw new Error(`canonical repository must be clean main equal to origin/main (branch=${branch}, head=${head}, origin/main=${originMain}, dirty=${status !== ""})`);
  }
  const paths = git(canonicalRoot, ["ls-files", "-z", "--cached"])
    .split("\0")
    .filter(Boolean)
    .map((value) => normalizeRelativePath(value, "canonical tracked path"));
  const byPath = new Map();
  const byHash = new Map();
  for (const relativePath of paths) {
    const absolutePath = path.join(canonicalRoot, ...relativePath.split("/"));
    const inspection = fs.lstatSync(absolutePath);
    if (!inspection.isFile() || inspection.isSymbolicLink()) throw new Error(`canonical tracked path is not a regular file: ${relativePath}`);
    const sha256 = hashFileSync(absolutePath);
    byPath.set(relativePath, sha256);
    if (!byHash.has(sha256)) byHash.set(sha256, []);
    byHash.get(sha256).push(relativePath);
  }
  return { canonicalRoot, branch, head, originMain, clean: true, trackedFiles: paths.length, byPath, byHash };
}

function manifestSourceNames(manifest) {
  return [...new Set((manifest.entries ?? []).map((entry) => entry.sourceName).filter(Boolean))].sort();
}

function loadCorpus(manifestPaths, targetNames) {
  const manifests = [];
  const entries = [];
  const seenManifestPaths = new Set();
  for (const manifestPath of manifestPaths) {
    const absolutePath = path.resolve(manifestPath);
    const key = absolutePath.toLowerCase();
    if (seenManifestPaths.has(key)) continue;
    seenManifestPaths.add(key);
    const manifest = readJson(absolutePath, `manifest ${absolutePath}`);
    if (manifest.format !== "tear-workspace-quarantine-manifest" || manifest.schemaVersion !== 1) {
      throw new Error(`unsupported preservation manifest: ${absolutePath}`);
    }
    const manifestEntries = Array.isArray(manifest.entries) ? manifest.entries : [];
    manifests.push({
      path: absolutePath,
      sha256: hashFileSync(absolutePath),
      sourceNames: manifestSourceNames(manifest),
      entryCount: manifestEntries.length,
    });
    for (const entry of manifestEntries) {
      if (typeof entry.sourceName !== "string" || typeof entry.relativePath !== "string") continue;
      const relativePath = normalizeRelativePath(entry.relativePath, `manifest ${absolutePath} entry`);
      entries.push({ ...entry, relativePath, manifestPath: absolutePath });
    }
  }
  const corpusEntries = entries.filter((entry) => entry.sha256 && !targetNames.includes(entry.sourceName));
  for (const entry of corpusEntries) {
    if (!SHA256_PATTERN.test(entry.sha256)) throw new Error(`invalid preservation SHA-256 for ${entry.sourceName}/${entry.relativePath}`);
  }
  const byPath = new Map();
  const byHash = new Map();
  for (const entry of corpusEntries) {
    if (!byPath.has(entry.relativePath)) byPath.set(entry.relativePath, []);
    byPath.get(entry.relativePath).push(entry);
    if (!byHash.has(entry.sha256)) byHash.set(entry.sha256, []);
    byHash.get(entry.sha256).push(entry);
  }
  return { manifests, entries, corpusEntries, byPath, byHash };
}

function summarizeMatches(entries) {
  return {
    count: entries.length,
    samples: entries.slice(0, SAMPLE_LIMIT).map((entry) => ({ sourceName: entry.sourceName, relativePath: entry.relativePath })),
    truncated: entries.length > SAMPLE_LIMIT,
  };
}

function inspectTargetEntry(entry, targetRoot, canonical, corpus, peerByHash) {
  const relativePath = entry.relativePath;
  const absolutePath = path.resolve(targetRoot, ...relativePath.split("/"));
  if (!isInside(targetRoot, absolutePath)) throw new Error(`target entry escapes copy root: ${entry.sourceName}/${relativePath}`);
  const lstat = fs.existsSync(absolutePath) ? fs.lstatSync(absolutePath) : null;
  const protectedEntry = entry.sha256 === null;
  if (protectedEntry) {
    return {
      relativePath,
      kind: entry.kind,
      bytes: entry.bytes ?? null,
      manifestSha256: null,
      observedSha256: null,
      status: lstat ? "protected-unhashed" : "protected-unhashed-missing",
      reportReasonCodes: entry.reportReasonCodes ?? [],
      duplicateContent: false,
    };
  }
  if (!lstat || !lstat.isFile() || lstat.isSymbolicLink()) {
    return {
      relativePath,
      kind: entry.kind,
      bytes: entry.bytes ?? null,
      manifestSha256: entry.sha256,
      observedSha256: null,
      status: "hashable-missing-or-nonregular",
      duplicateContent: false,
    };
  }
  const observedSha256 = hashFileSync(absolutePath);
  if (observedSha256 !== entry.sha256) {
    return {
      relativePath,
      kind: entry.kind,
      bytes: entry.bytes ?? null,
      manifestSha256: entry.sha256,
      observedSha256,
      status: "manifest-hash-mismatch",
      duplicateContent: false,
    };
  }
  const canonicalPathHash = canonical.byPath.get(relativePath);
  const canonicalPathMatch = canonicalPathHash === entry.sha256;
  const canonicalContentMatches = (canonical.byHash.get(entry.sha256) ?? []).filter((candidate) => candidate !== relativePath);
  const preservationPathMatches = (corpus.byPath.get(relativePath) ?? []).filter((candidate) => candidate.sha256 === entry.sha256);
  const preservationPathConflicts = (corpus.byPath.get(relativePath) ?? []).filter((candidate) => candidate.sha256 !== entry.sha256);
  const preservationContentMatches = corpus.byHash.get(entry.sha256) ?? [];
  const peerCopyMatches = (peerByHash.get(entry.sha256) ?? []).filter((candidate) => candidate.sourceName !== entry.sourceName || candidate.relativePath !== relativePath);
  const duplicateContent = canonicalPathMatch || canonicalContentMatches.length > 0 || preservationPathMatches.length > 0 || preservationContentMatches.length > 0 || peerCopyMatches.length > 0;
  let status = "unique-content";
  if (canonicalPathMatch) status = "canonical-exact-path";
  else if (canonicalPathHash) status = "canonical-path-conflict";
  else if (canonicalContentMatches.length > 0) status = "canonical-content-duplicate";
  else if (preservationPathMatches.length > 0) status = "preservation-exact-path";
  else if (preservationContentMatches.length > 0) status = "preservation-content-duplicate";
  else if (peerCopyMatches.length > 0) status = "peer-copy-duplicate";
  return {
    relativePath,
    kind: entry.kind,
    bytes: entry.bytes ?? null,
    manifestSha256: entry.sha256,
    observedSha256,
    status,
    duplicateContent,
    canonical: {
      exactPath: canonicalPathMatch,
      pathConflict: Boolean(canonicalPathHash && !canonicalPathMatch),
      contentMatches: summarizeMatches(canonicalContentMatches.map((candidate) => ({ sourceName: "canonical-main", relativePath: candidate }))),
    },
    preservation: {
      exactPathMatches: summarizeMatches(preservationPathMatches),
      pathConflicts: summarizeMatches(preservationPathConflicts),
      contentMatches: summarizeMatches(preservationContentMatches),
    },
    peerCopies: summarizeMatches(peerCopyMatches),
  };
}

export function comparePreservedCopies({
  repoRoot,
  payloadRoot,
  manifestPaths,
  targetNames = TARGET_COPY_NAMES,
  now = new Date(),
} = {}) {
  if (!Array.isArray(targetNames) || targetNames.length === 0) throw new Error("targetNames must not be empty");
  const canonical = inspectCanonicalRepository(path.resolve(repoRoot ?? process.cwd()));
  const payload = path.resolve(payloadRoot);
  if (!fs.existsSync(payload) || !fs.lstatSync(payload).isDirectory()) throw new Error(`payload root must be an existing directory: ${payload}`);
  const manifestFiles = manifestPaths?.map((value) => path.resolve(value)) ?? [];
  if (manifestFiles.length === 0) throw new Error("manifestPaths must contain at least one preservation manifest");
  const corpus = loadCorpus(manifestFiles, targetNames);
  const targetEntries = corpus.entries.filter((entry) => targetNames.includes(entry.sourceName));
  const actualTargetNames = [...new Set(targetEntries.map((entry) => entry.sourceName))].sort();
  if (actualTargetNames.length !== targetNames.length || targetNames.some((name) => !actualTargetNames.includes(name))) {
    throw new Error(`manifests do not contain every requested target copy: ${targetNames.join(", ")}`);
  }
  const peerByHash = new Map();
  for (const entry of targetEntries) {
    if (!entry.sha256) continue;
    if (!peerByHash.has(entry.sha256)) peerByHash.set(entry.sha256, []);
    peerByHash.get(entry.sha256).push(entry);
  }
  const copies = [];
  for (const sourceName of targetNames) {
    const root = path.resolve(payload, sourceName);
    if (!isInside(payload, root) || !fs.existsSync(root) || !fs.lstatSync(root).isDirectory()) throw new Error(`preserved target copy is missing: ${root}`);
    const entries = targetEntries.filter((entry) => entry.sourceName === sourceName);
    const comparisons = entries.map((entry) => inspectTargetEntry(entry, root, canonical, corpus, peerByHash));
    const summary = {
      manifestEntries: entries.length,
      checkedHashableEntries: comparisons.filter((entry) => entry.manifestSha256 !== null && entry.status !== "hashable-missing-or-nonregular").length,
      protectedUnhashedEntries: comparisons.filter((entry) => entry.status.startsWith("protected-unhashed")).length,
      protectedUnhashedBytes: comparisons.filter((entry) => entry.status.startsWith("protected-unhashed")).reduce((total, entry) => total + (entry.bytes ?? 0), 0),
      hashMismatches: comparisons.filter((entry) => entry.status === "manifest-hash-mismatch").length,
      missingOrNonregular: comparisons.filter((entry) => entry.status === "hashable-missing-or-nonregular").length,
      uniqueContent: comparisons.filter((entry) => entry.status === "unique-content").length,
      duplicateContent: comparisons.filter((entry) => entry.duplicateContent).length,
      canonicalExactPath: comparisons.filter((entry) => entry.status === "canonical-exact-path").length,
      canonicalPathConflicts: comparisons.filter((entry) => entry.status === "canonical-path-conflict").length,
      canonicalContentDuplicates: comparisons.filter((entry) => entry.status === "canonical-content-duplicate").length,
      preservationExactPath: comparisons.filter((entry) => entry.status === "preservation-exact-path").length,
      preservationContentDuplicates: comparisons.filter((entry) => entry.status === "preservation-content-duplicate").length,
      peerCopyDuplicates: comparisons.filter((entry) => entry.status === "peer-copy-duplicate").length,
    };
    copies.push({ sourceName, root, sourceIntegrity: summary.hashMismatches === 0 && summary.missingOrNonregular === 0 ? "verified-hashable-content; protected-content-unhashed" : "not-verified", summary, entries: comparisons });
  }
  return {
    format: PRESERVED_COPY_COMPARISON_FORMAT,
    schemaVersion: PRESERVED_COPY_COMPARISON_SCHEMA_VERSION,
    generatedAtUtc: new Date(now).toISOString(),
    mode: "read-only",
    scope: {
      targetCopies: targetNames,
      payloadRoot: payload,
      canonicalRepository: canonical.canonicalRoot,
      canonicalReachableReference: "clean main exactly equal to origin/main",
      preservationCorpus: "all SHA-256-hashed entries from supplied manifests, excluding target copies; protected entries remain metadata-only",
    },
    canonical: {
      root: canonical.canonicalRoot,
      branch: canonical.branch,
      head: canonical.head,
      originMain: canonical.originMain,
      clean: canonical.clean,
      trackedFiles: canonical.trackedFiles,
    },
    inputs: {
      manifests: corpus.manifests,
      targetEntryCount: targetEntries.length,
      preservationCorpusHashedEntries: corpus.corpusEntries.length,
      preservationCorpusHashClusters: corpus.byHash.size,
    },
    copies,
    disposition: {
      uniqueContentMeans: "No equal SHA-256 was found in canonical reachable files, other preserved corpus roots, or the peer target copy.",
      duplicateContentMeans: "An equal SHA-256 was found in canonical reachable files, another preserved corpus root, or the peer target copy; exact-path and path-conflict status remain separate.",
      protectedUnknownMeans: "The preservation manifest intentionally supplied no content hash; this report records metadata/presence only and does not descend or hash protected content.",
      deferredDependencyGroup: "The Tear-budget-architecture/node_modules junction and Tear-tearscore-normalization target were not selected by this comparison and remain deferred.",
    },
  };
}

function parseArguments(argumentsList) {
  const options = { repoRoot: process.cwd(), targetNames: [], manifestPaths: [] };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--repo-root") options.repoRoot = path.resolve(argumentsList[++index]);
    else if (argument === "--payload") options.payloadRoot = path.resolve(argumentsList[++index]);
    else if (argument === "--manifest") options.manifestPaths.push(path.resolve(argumentsList[++index]));
    else if (argument === "--target") options.targetNames.push(argumentsList[++index]);
    else if (argument === "--output") options.output = path.resolve(argumentsList[++index]);
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.targetNames.length === 0) options.targetNames = [...TARGET_COPY_NAMES];
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/compare-preserved-copies.mjs --repo-root <game> --payload <payload-root> --manifest <manifest.json> [--manifest <manifest.json> ...] --output <report.json>");
      return;
    }
    if (!options.payloadRoot || !options.output || options.manifestPaths.length === 0) throw new Error("--payload, --manifest, and --output are required");
    const output = path.resolve(options.output);
    if (isInside(options.payloadRoot, output) || samePath(output, options.repoRoot) || isInside(options.repoRoot, output)) {
      throw new Error("output must remain outside the canonical repository and preserved payload");
    }
    const report = comparePreservedCopies(options);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const summary = report.copies.map((copy) => `${copy.sourceName}: ${copy.summary.manifestEntries} entries, ${copy.summary.uniqueContent} unique, ${copy.summary.duplicateContent} duplicate, ${copy.summary.protectedUnhashedEntries} protected/unhashed`).join("; ");
    console.log(`preserved-copy comparison written: ${output}`);
    console.log(summary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === thisFile) main();
