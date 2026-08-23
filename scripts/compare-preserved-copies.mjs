import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PRESERVED_COPY_COMPARISON_FORMAT = "tear-preserved-copy-comparison";
export const PRESERVED_COPY_COMPARISON_SCHEMA_VERSION = 2;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const GIT_HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const REQUIRED_ORIGIN = "github.com/shaku1z/tear.git";
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

function normalizeOriginUrl(value) {
  let raw = String(value ?? "").trim().split(/[?#]/u, 1)[0].replace(/\/+$/u, "");
  if (raw === "") return "";
  const urlMatch = raw.match(/^[a-z][a-z0-9+.-]*:\/\//iu);
  if (urlMatch) {
    try {
      const parsed = new URL(raw);
      if (parsed.username !== "" || parsed.password !== "" || parsed.port !== "") return "";
      raw = `${parsed.hostname}${parsed.pathname}`;
    } catch {
      return "";
    }
  } else {
    const scpMatch = raw.match(/^(?:[^@/]+@)?([^:]+):(.+)$/u);
    if (scpMatch) raw = `${scpMatch[1]}/${scpMatch[2]}`;
  }
  raw = raw.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "").toLowerCase();
  if (raw.endsWith(".git")) raw = raw.slice(0, -4);
  return `${raw}.git`;
}

function assertNoReparsePath(targetPath, label, { allowMissingFinal = true } = {}) {
  const absolutePath = path.resolve(targetPath);
  const parsed = path.parse(absolutePath);
  let current = parsed.root;
  const relative = path.relative(parsed.root, absolutePath);
  const segments = relative === "" ? [] : relative.split(path.sep);
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let inspection;
    try {
      inspection = fs.lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT" && allowMissingFinal && index === segments.length - 1) break;
      throw new Error(`${label} could not be inspected: ${current}: ${error.message}`, { cause: error });
    }
    if (inspection.isSymbolicLink()) throw new Error(`${label} contains a symlink or reparse point: ${current}`);
    try {
      const real = fs.realpathSync.native(current);
      if (!samePath(real, current)) throw new Error(`${label} contains a symlink or reparse point: ${current}`);
    } catch (error) {
      if (error.message.includes("contains a symlink or reparse point")) throw error;
      throw new Error(`${label} realpath could not be verified: ${current}: ${error.message}`, { cause: error });
    }
  }
  return absolutePath;
}

function assertRealPathInside(root, candidate, label, allowEqual = false) {
  let realRoot;
  let realCandidate;
  try {
    realRoot = fs.realpathSync.native(path.resolve(root));
    realCandidate = fs.realpathSync.native(path.resolve(candidate));
  } catch (error) {
    throw new Error(`${label} realpath could not be verified: ${error.message}`, { cause: error });
  }
  if (!isInside(realRoot, realCandidate, allowEqual)) throw new Error(`${label} realpath escapes its allowed root: ${candidate}`);
  return { realRoot, realCandidate };
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

function readCanonicalState(canonicalRoot) {
  const originRaw = git(canonicalRoot, ["config", "--get", "remote.origin.url"]).trim();
  const origin = normalizeOriginUrl(originRaw);
  const branch = git(canonicalRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]).trim();
  const head = git(canonicalRoot, ["rev-parse", "HEAD"]).trim().toLowerCase();
  const originMain = git(canonicalRoot, ["rev-parse", "origin/main"]).trim().toLowerCase();
  const status = git(canonicalRoot, ["status", "--porcelain=v1", "--untracked-files=all"]).trim();
  return { originRaw, origin, branch, head, originMain, status };
}

function assertCanonicalState(state, expectedHead, label = "canonical repository") {
  if (!GIT_HEAD_PATTERN.test(String(expectedHead ?? "").toLowerCase())) throw new Error("expected-head must be a full 40-character Git commit SHA-1");
  if (state.origin !== REQUIRED_ORIGIN) throw new Error(`${label} origin must normalize exactly to ${REQUIRED_ORIGIN}; found ${state.origin || state.originRaw || "missing"}`);
  if (state.branch !== "main" || state.head !== state.originMain || state.status !== "" || state.head !== expectedHead.toLowerCase()) {
    throw new Error(`${label} must be clean main equal to origin/main and expected-head (branch=${state.branch}, head=${state.head}, origin/main=${state.originMain}, expected-head=${expectedHead}, dirty=${state.status !== ""})`);
  }
}

function inspectCanonicalRepository(repoRoot, expectedHead) {
  const canonicalRoot = path.resolve(repoRoot);
  assertNoReparsePath(canonicalRoot, "canonical repository root", { allowMissingFinal: false });
  const gitRoot = path.resolve(git(canonicalRoot, ["rev-parse", "--show-toplevel"]).trim());
  if (!samePath(gitRoot, canonicalRoot)) throw new Error(`repo-root is not the canonical Git root: ${canonicalRoot}`);
  const initialState = readCanonicalState(canonicalRoot);
  assertCanonicalState(initialState, expectedHead);
  const paths = git(canonicalRoot, ["ls-files", "-z", "--cached"])
    .split("\0")
    .filter(Boolean)
    .map((value) => normalizeRelativePath(value, "canonical tracked path"));
  const byPath = new Map();
  const byHash = new Map();
  for (const relativePath of paths) {
    const absolutePath = path.join(canonicalRoot, ...relativePath.split("/"));
    assertNoReparsePath(absolutePath, `canonical tracked path ${relativePath}`, { allowMissingFinal: false });
    assertRealPathInside(canonicalRoot, absolutePath, `canonical tracked path ${relativePath}`);
    const inspection = fs.lstatSync(absolutePath);
    if (!inspection.isFile() || inspection.isSymbolicLink()) throw new Error(`canonical tracked path is not a regular file: ${relativePath}`);
    const sha256 = hashFileSync(absolutePath);
    byPath.set(relativePath, sha256);
    if (!byHash.has(sha256)) byHash.set(sha256, []);
    byHash.get(sha256).push(relativePath);
  }
  const afterCanonicalHashState = readCanonicalState(canonicalRoot);
  assertCanonicalState(afterCanonicalHashState, expectedHead, "canonical repository after hashing");
  return {
    canonicalRoot,
    origin: afterCanonicalHashState.origin,
    originRaw: afterCanonicalHashState.originRaw,
    branch: afterCanonicalHashState.branch,
    head: afterCanonicalHashState.head,
    originMain: afterCanonicalHashState.originMain,
    clean: true,
    trackedFiles: paths.length,
    byPath,
    byHash,
  };
}

function manifestSourceNames(manifest) {
  return [...new Set((manifest.entries ?? []).map((entry) => entry.sourceName).filter(Boolean))].sort();
}

function rootArgumentForPath(manifest, sourceRoot) {
  const roots = manifest.roots ?? {};
  const candidates = [];
  const rootArguments = roots.rootArguments && typeof roots.rootArguments === "object" ? roots.rootArguments : {};
  for (const [argument, value] of Object.entries(rootArguments)) {
    if (typeof value === "string" && samePath(value, sourceRoot)) candidates.push(argument);
  }
  const knownRoots = [
    ["workspace-root", roots.workspaceRoot],
    ["temp-root", roots.tempRoot],
    ["archive-root", roots.archiveRoot],
  ];
  for (const [argument, value] of knownRoots) {
    if (typeof value === "string" && isInside(value, sourceRoot, true)) candidates.push(argument);
  }
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) throw new Error(`source root must bind to exactly one rootArgument: ${sourceRoot}`);
  return unique[0];
}

function sourceRecordsForName(manifest, sourceName) {
  const roots = Array.isArray(manifest.roots?.sourceRoots) ? manifest.roots.sourceRoots : [];
  return roots.filter((source) => source && source.name === sourceName);
}

function loadCorpus(manifestInputs, targetNames, archiveGroupRoot) {
  const manifests = [];
  const entries = [];
  const seenManifestPaths = new Set();
  const seenEntryKeys = new Set();
  for (const input of manifestInputs) {
    const absolutePath = path.resolve(input.path);
    const key = absolutePath.toLowerCase();
    if (seenManifestPaths.has(key)) throw new Error(`duplicate preservation manifest supplied: ${absolutePath}`);
    seenManifestPaths.add(key);
    assertNoReparsePath(absolutePath, `manifest ${absolutePath}`, { allowMissingFinal: false });
    assertRealPathInside(archiveGroupRoot, absolutePath, `manifest ${absolutePath}`);
    const manifest = readJson(absolutePath, `manifest ${absolutePath}`);
    if (manifest.format !== "tear-workspace-quarantine-manifest" || manifest.schemaVersion !== 1) {
      throw new Error(`unsupported preservation manifest: ${absolutePath}`);
    }
    const observedManifestSha256 = hashFileSync(absolutePath);
    if (!SHA256_PATTERN.test(input.expectedSha256) || observedManifestSha256 !== input.expectedSha256.toLowerCase()) {
      throw new Error(`manifest SHA-256 does not match expected value: ${absolutePath}`);
    }
    const manifestEntries = Array.isArray(manifest.entries) ? manifest.entries : [];
    manifests.push({
      path: absolutePath,
      sha256: observedManifestSha256,
      sourceNames: manifestSourceNames(manifest),
      entryCount: manifestEntries.length,
    });
    for (const entry of manifestEntries) {
      if (typeof entry.sourceName !== "string" || typeof entry.relativePath !== "string") continue;
      const relativePath = normalizeRelativePath(entry.relativePath, `manifest ${absolutePath} entry`);
      const sourceKey = [String(entry.sourceId ?? ""), entry.sourceName, relativePath].join(String.fromCharCode(0));
      if (seenEntryKeys.has(sourceKey)) throw new Error(`duplicate preservation entry supplied: ${entry.sourceName}/${relativePath}`);
      seenEntryKeys.add(sourceKey);
      entries.push({ ...entry, relativePath, manifestPath: absolutePath, manifest });
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

function validateSelectedSourceBindings(entries, targetNames) {
  const selected = new Map();
  for (const sourceName of targetNames) {
    const sourceEntries = entries.filter((entry) => entry.sourceName === sourceName);
    if (sourceEntries.length === 0) continue;
    const bindings = new Map();
    for (const entry of sourceEntries) {
      const records = sourceRecordsForName(entry.manifest, sourceName);
      if (records.length !== 1) throw new Error(`selected source must have exactly one source-root record: ${sourceName}`);
      const record = records[0];
      if (typeof record.id !== "string" || typeof record.path !== "string" || record.name !== sourceName) throw new Error(`selected source-root record is incomplete: ${sourceName}`);
      const sourceRoot = path.resolve(record.path);
      assertNoReparsePath(sourceRoot, `selected source root ${sourceName}`);
      const rootArgument = typeof record.rootArgument === "string" ? record.rootArgument : rootArgumentForPath(entry.manifest, sourceRoot);
      const bindingKey = `${record.id}\u0000${sourceName}\u0000${sourceRoot.toLowerCase()}\u0000${rootArgument}`;
      bindings.set(bindingKey, { sourceId: record.id, sourceName, sourceRoot, rootArgument, manifest: entry.manifest, destination: entry.manifest.destination?.path });
      if (entry.sourceId !== record.id || typeof entry.sourceRoot !== "string" || !samePath(entry.sourceRoot, sourceRoot)) {
        throw new Error(`selected source identity is not exact: ${sourceName}/${entry.relativePath}`);
      }
      if (entry.rootArgument !== undefined && entry.rootArgument !== rootArgument) throw new Error(`selected source rootArgument is not exact: ${sourceName}/${entry.relativePath}`);
      if (entry.originalPath !== undefined && !samePath(entry.originalPath, path.join(sourceRoot, ...entry.relativePath.split("/")))) {
        throw new Error(`selected source originalPath is not exact: ${sourceName}/${entry.relativePath}`);
      }
      const expectedRestore = `${sourceName}/${entry.relativePath}`;
      if (entry.restoreRelativePath !== expectedRestore) throw new Error(`selected source restore mapping is not exact: ${sourceName}/${entry.relativePath}`);
      if (entry.plannedPath !== undefined && typeof entry.manifest.destination?.path === "string") {
        const expectedPlanned = path.join(entry.manifest.destination.path, sourceName, ...entry.relativePath.split("/"));
        if (!samePath(entry.plannedPath, expectedPlanned)) throw new Error(`selected source planned mapping is not exact: ${sourceName}/${entry.relativePath}`);
      }
    }
    if (bindings.size !== 1) throw new Error(`selected source has duplicate or conflicting identity bindings: ${sourceName}`);
    selected.set(sourceName, [...bindings.values()][0]);
  }
  return selected;
}

function summarizeMatches(entries) {
  return {
    count: entries.length,
    samples: entries.slice(0, SAMPLE_LIMIT).map((entry) => ({ sourceName: entry.sourceName, relativePath: entry.relativePath })),
    truncated: entries.length > SAMPLE_LIMIT,
  };
}

function enumerateExtraOrdinaryFiles(targetRoot, entries) {
  const byPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  const protectedDirectories = new Set(entries.filter((entry) => entry.kind === "directory" && entry.sha256 === null).map((entry) => entry.relativePath));
  const extras = [];
  const walk = (directory, parentRelativePath = "") => {
    assertNoReparsePath(directory, `target copy ${targetRoot}`, { allowMissingFinal: false });
    assertRealPathInside(targetRoot, directory, `target copy ${targetRoot}`, true);
    for (const child of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = parentRelativePath === "" ? child.name : `${parentRelativePath}/${child.name}`;
      const absolutePath = path.join(directory, child.name);
      assertNoReparsePath(absolutePath, `target copy entry ${relativePath}`, { allowMissingFinal: false });
      assertRealPathInside(targetRoot, absolutePath, `target copy entry ${relativePath}`);
      const inspection = fs.lstatSync(absolutePath);
      if (inspection.isDirectory()) {
        const manifestEntry = byPath.get(relativePath);
        if (manifestEntry && manifestEntry.kind !== "directory") throw new Error(`target copy entry kind conflicts with manifest: ${relativePath}`);
        if (!protectedDirectories.has(relativePath)) walk(absolutePath, relativePath);
      } else if (inspection.isFile()) {
        const manifestEntry = byPath.get(relativePath);
        if (!manifestEntry || manifestEntry.kind !== "file") extras.push(relativePath);
      } else {
        throw new Error(`target copy contains unsupported ordinary entry: ${relativePath}`);
      }
    }
  };
  walk(targetRoot);
  return extras.sort();
}

function inspectTargetEntry(entry, targetRoot, canonical, corpus, peerByHash) {
  const relativePath = entry.relativePath;
  const absolutePath = path.resolve(targetRoot, ...relativePath.split("/"));
  if (!isInside(targetRoot, absolutePath)) throw new Error(`target entry escapes copy root: ${entry.sourceName}/${relativePath}`);
  assertNoReparsePath(absolutePath, `target entry ${entry.sourceName}/${relativePath}`);
  const lstat = fs.existsSync(absolutePath) ? fs.lstatSync(absolutePath) : null;
  if (lstat) assertRealPathInside(targetRoot, absolutePath, `target entry ${entry.sourceName}/${relativePath}`);
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
  const equalShaElsewhere = canonicalContentMatches.length > 0 || preservationPathMatches.length > 0 || preservationContentMatches.length > 0 || peerCopyMatches.length > 0;
  const duplicateContent = canonicalPathMatch || equalShaElsewhere;
  const unmatchedContent = !duplicateContent;
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
    unmatchedContent,
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
  expectedManifestSha256,
  archiveGroupRoot,
  expectedHead,
  targetNames = TARGET_COPY_NAMES,
  now = new Date(),
} = {}) {
  if (!Array.isArray(targetNames) || targetNames.length === 0) throw new Error("targetNames must not be empty");
  const normalizedTargetNames = targetNames.map((name) => String(name));
  const targetNameKeys = normalizedTargetNames.map((name) => name.toLowerCase());
  if (new Set(targetNameKeys).size !== normalizedTargetNames.length) throw new Error("targetNames must not contain duplicates");
  if (!GIT_HEAD_PATTERN.test(String(expectedHead ?? "").toLowerCase())) throw new Error("expected-head is required and must be a full 40-character Git commit SHA-1");
  const archiveGroup = path.resolve(archiveGroupRoot ?? "");
  if (!archiveGroupRoot || !fs.existsSync(archiveGroup) || !fs.lstatSync(archiveGroup).isDirectory()) throw new Error(`archive-group-root must be an existing directory: ${archiveGroup}`);
  assertNoReparsePath(archiveGroup, "archive-group-root", { allowMissingFinal: false });
  assertRealPathInside(archiveGroup, archiveGroup, "archive-group-root", true);
  const canonical = inspectCanonicalRepository(path.resolve(repoRoot ?? process.cwd()), expectedHead);
  const payload = path.resolve(payloadRoot);
  if (!fs.existsSync(payload) || !fs.lstatSync(payload).isDirectory()) throw new Error(`payload root must be an existing directory: ${payload}`);
  assertNoReparsePath(payload, "payload root", { allowMissingFinal: false });
  assertRealPathInside(archiveGroup, payload, "payload root", true);
  const manifestFiles = manifestPaths ?? [];
  if (!Array.isArray(manifestFiles) || manifestFiles.length === 0) throw new Error("manifestPaths must contain at least one preservation manifest");
  if (manifestFiles.some((value) => typeof value !== "string" && (typeof value !== "object" || value === null || typeof value.path !== "string"))) throw new Error("manifestPaths must contain paths or {path, expectedSha256} records");
  if (!Array.isArray(expectedManifestSha256) && manifestFiles.some((value) => typeof value !== "object" || typeof value.expectedSha256 !== "string")) throw new Error("expectedManifestSha256 must provide one SHA-256 for every supplied manifest");
  if (Array.isArray(expectedManifestSha256) && expectedManifestSha256.length !== manifestFiles.length && manifestFiles.some((value) => typeof value !== "object" || typeof value.expectedSha256 !== "string")) throw new Error("expectedManifestSha256 must provide one SHA-256 for every supplied manifest");
  const manifestInputs = manifestFiles.map((value, index) => ({ path: path.resolve(typeof value === "object" ? value.path : value), expectedSha256: String(typeof value === "object" && typeof value.expectedSha256 === "string" ? value.expectedSha256 : expectedManifestSha256?.[index] ?? "").toLowerCase() }));
  const corpus = loadCorpus(manifestInputs, normalizedTargetNames, archiveGroup);
  const targetEntries = corpus.entries.filter((entry) => normalizedTargetNames.includes(entry.sourceName));
  const actualTargetNames = [...new Set(targetEntries.map((entry) => entry.sourceName))].sort();
  if (actualTargetNames.length !== normalizedTargetNames.length || normalizedTargetNames.some((name) => !actualTargetNames.includes(name))) {
    throw new Error(`manifests do not contain every requested target copy: ${normalizedTargetNames.join(", ")}`);
  }
  const selectedBindings = validateSelectedSourceBindings(targetEntries, normalizedTargetNames);
  const peerByHash = new Map();
  for (const entry of targetEntries) {
    if (!entry.sha256) continue;
    if (!peerByHash.has(entry.sha256)) peerByHash.set(entry.sha256, []);
    peerByHash.get(entry.sha256).push(entry);
  }
  const copies = [];
  for (const sourceName of normalizedTargetNames) {
    const root = path.resolve(payload, sourceName);
    if (!isInside(payload, root) || !fs.existsSync(root) || !fs.lstatSync(root).isDirectory()) throw new Error(`preserved target copy is missing: ${root}`);
    assertNoReparsePath(root, `preserved target copy ${sourceName}`, { allowMissingFinal: false });
    assertRealPathInside(payload, root, `preserved target copy ${sourceName}`);
    const entries = targetEntries.filter((entry) => entry.sourceName === sourceName);
    const binding = selectedBindings.get(sourceName);
    if (!binding || !samePath(root, path.resolve(payload, sourceName))) throw new Error(`selected target source mapping is not exact: ${sourceName}`);
    const extraOrdinaryFiles = enumerateExtraOrdinaryFiles(root, entries);
    if (extraOrdinaryFiles.length > 0) throw new Error(`preserved target copy contains ordinary files absent from manifest (${sourceName}): ${extraOrdinaryFiles.slice(0, SAMPLE_LIMIT).join(", ")}${extraOrdinaryFiles.length > SAMPLE_LIMIT ? " …" : ""}`);
    const comparisons = entries.map((entry) => inspectTargetEntry(entry, root, canonical, corpus, peerByHash));
    const summary = {
      manifestEntries: entries.length,
      checkedHashableEntries: comparisons.filter((entry) => entry.manifestSha256 !== null && entry.status !== "hashable-missing-or-nonregular").length,
      protectedUnhashedEntries: comparisons.filter((entry) => entry.status.startsWith("protected-unhashed")).length,
      protectedUnhashedBytes: comparisons.filter((entry) => entry.status.startsWith("protected-unhashed")).reduce((total, entry) => total + (entry.bytes ?? 0), 0),
      hashMismatches: comparisons.filter((entry) => entry.status === "manifest-hash-mismatch").length,
      missingOrNonregular: comparisons.filter((entry) => entry.status === "hashable-missing-or-nonregular").length,
      uniqueContent: comparisons.filter((entry) => entry.status === "unique-content").length,
      unmatchedContent: comparisons.filter((entry) => entry.unmatchedContent).length,
      duplicateContent: comparisons.filter((entry) => entry.duplicateContent).length,
      canonicalExactPath: comparisons.filter((entry) => entry.status === "canonical-exact-path").length,
      canonicalPathConflicts: comparisons.filter((entry) => entry.status === "canonical-path-conflict").length,
      canonicalContentDuplicates: comparisons.filter((entry) => entry.status === "canonical-content-duplicate").length,
      preservationExactPath: comparisons.filter((entry) => entry.status === "preservation-exact-path").length,
      preservationContentDuplicates: comparisons.filter((entry) => entry.status === "preservation-content-duplicate").length,
      peerCopyDuplicates: comparisons.filter((entry) => entry.status === "peer-copy-duplicate").length,
    };
    copies.push({ sourceName, root, sourceId: binding.sourceId, sourceRoot: binding.sourceRoot, rootArgument: binding.rootArgument, restoreRoot: `${sourceName}/`, sourceIntegrity: summary.hashMismatches === 0 && summary.missingOrNonregular === 0 && summary.unmatchedContent === 0 ? "verified-hashable-content; protected-content-unhashed" : "review-required", summary, entries: comparisons });
  }
  const finalCanonicalState = readCanonicalState(canonical.canonicalRoot);
  assertCanonicalState(finalCanonicalState, expectedHead, "canonical repository after comparison hashing");
  return {
    format: PRESERVED_COPY_COMPARISON_FORMAT,
    schemaVersion: PRESERVED_COPY_COMPARISON_SCHEMA_VERSION,
    generatedAtUtc: new Date(now).toISOString(),
    mode: "read-only",
    scope: {
      targetCopies: normalizedTargetNames,
      payloadRoot: payload,
      archiveGroupRoot: archiveGroup,
      canonicalRepository: canonical.canonicalRoot,
      canonicalReachableReference: "clean main exactly equal to origin/main",
      preservationCorpus: "all SHA-256-hashed entries from supplied manifests, excluding target copies; protected entries remain metadata-only",
    },
    canonical: {
      root: canonical.canonicalRoot,
      origin: canonical.origin,
      originRaw: canonical.originRaw,
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
      expectedHead: expectedHead.toLowerCase(),
    },
    copies,
    disposition: {
      uniqueContentMeans: "No equal SHA-256 was found in canonical reachable files, other preserved corpus roots, or the peer target copy; this is unmatched content requiring review.",
      unmatchedContentMeans: "A hashable entry with no equal SHA-256 elsewhere is unmatched content even when its relative path conflicts with canonical main; it is not a disposal authorization.",
      duplicateContentMeans: "An equal SHA-256 was found in canonical reachable files, another preserved corpus root, or the peer target copy; exact-path and path-conflict status remain separate.",
      canonicalPathConflictMeans: "The same relative path exists in canonical main with a different SHA-256; without an equal SHA-256 elsewhere, the entry remains unmatched content.",
      protectedUnknownMeans: "The preservation manifest intentionally supplied no content hash; this report records metadata/presence only and does not descend or hash protected content.",
      disposalAuthorization: "This read-only comparison authorizes no disposal, deletion, overwrite, or mutation; all unmatched, path-conflict, and protected entries require separate review.",
      deferredDependencyGroup: "The Tear-budget-architecture/node_modules junction and Tear-tearscore-normalization target were not selected by this comparison and remain deferred.",
    },
  };
}

function parseArguments(argumentsList) {
  const options = { repoRoot: process.cwd(), targetNames: [], manifestPaths: [], expectedManifestSha256: [] };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--repo-root") options.repoRoot = path.resolve(argumentsList[++index]);
    else if (argument === "--payload") options.payloadRoot = path.resolve(argumentsList[++index]);
    else if (argument === "--manifest") options.manifestPaths.push(path.resolve(argumentsList[++index]));
    else if (argument === "--manifest-sha256" || argument === "--expected-manifest-sha256") options.expectedManifestSha256.push(String(argumentsList[++index] ?? "").toLowerCase());
    else if (argument === "--archive-group-root") options.archiveGroupRoot = path.resolve(argumentsList[++index]);
    else if (argument === "--expected-head") options.expectedHead = String(argumentsList[++index] ?? "").toLowerCase();
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
      console.log("Usage: node scripts/compare-preserved-copies.mjs --repo-root <game> --payload <payload-root> --archive-group-root <existing-archive-group> --expected-head <full-commit-sha> --manifest <manifest.json> --manifest-sha256 <sha256> [--manifest <manifest.json> --manifest-sha256 <sha256> ...] --output <new-report.json>");
      return;
    }
    if (!options.payloadRoot || !options.archiveGroupRoot || !options.expectedHead || !options.output || options.manifestPaths.length === 0) throw new Error("--payload, --archive-group-root, --expected-head, --manifest, and --output are required");
    if (options.expectedManifestSha256.length !== options.manifestPaths.length) throw new Error("every --manifest requires exactly one --manifest-sha256");
    const output = path.resolve(options.output);
    const outputExists = (() => {
      try {
        fs.lstatSync(output);
        return true;
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    })();
    if (outputExists) throw new Error(`output must be new-only and must not already exist: ${output}`);
    if (isInside(options.payloadRoot, output) || isInside(options.repoRoot, output)) throw new Error("output must remain outside the canonical repository and preserved payload");
    const outputParent = path.dirname(output);
    if (!fs.existsSync(outputParent) || !fs.lstatSync(outputParent).isDirectory()) throw new Error(`output parent must be an existing directory: ${outputParent}`);
    assertNoReparsePath(outputParent, "output parent", { allowMissingFinal: false });
    assertRealPathInside(options.archiveGroupRoot, outputParent, "output parent", true);
    const report = comparePreservedCopies(options);
    assertNoReparsePath(outputParent, "output parent before write", { allowMissingFinal: false });
    assertRealPathInside(options.archiveGroupRoot, outputParent, "output parent before write", true);
    try {
      fs.lstatSync(output);
      throw new Error(`output was created concurrently and will not be overwritten: ${output}`);
    } catch (error) {
      if (error.message.includes("output was created concurrently")) throw error;
      if (error.code !== "ENOENT") throw error;
    }
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const summary = report.copies.map((copy) => `${copy.sourceName}: ${copy.summary.manifestEntries} entries, ${copy.summary.unmatchedContent} unmatched, ${copy.summary.duplicateContent} duplicate, ${copy.summary.protectedUnhashedEntries} protected/unhashed`).join("; ");
    console.log(`preserved-copy comparison written: ${output}`);
    console.log(summary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === thisFile) main();
