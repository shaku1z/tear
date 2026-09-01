import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_REGISTRY_PATH = "config/terminology-registry.json";
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "dist", "artifacts", "Tear-archives"]);

export function normalizeRepoPath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//u, "");
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/gu, "\\$&");
}

export function globToRegExp(pattern) {
  const segments = normalizeRepoPath(pattern).split("/");
  let expression = "^";
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === "**") {
      expression += last ? "(?:[^/]+(?:/|$))*" : "(?:[^/]+/)*";
      return;
    }
    let part = "";
    for (const character of segment) {
      if (character === "*") part += "[^/]*";
      else if (character === "?") part += "[^/]";
      else part += escapeRegExp(character);
    }
    expression += part;
    if (!last) expression += "/";
  });
  expression += "$";
  return new RegExp(expression, "u");
}

export function matchesPathPattern(relativePath, pattern) {
  return globToRegExp(pattern).test(normalizeRepoPath(relativePath));
}

function pathMatchesAny(relativePath, patterns) {
  return patterns.some((pattern) => matchesPathPattern(relativePath, pattern));
}

function getPathExtension(relativePath) {
  return path.extname(relativePath).toLowerCase();
}

function walkFiles(root, relativeDirectory = "") {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) return [];
      return walkFiles(root, path.join(relativeDirectory, entry.name));
    }
    if (!entry.isFile()) return [];
    return [normalizeRepoPath(path.join(relativeDirectory, entry.name))];
  });
}

export function collectMatchingFiles(root, patterns) {
  return walkFiles(root).filter((relativePath) => pathMatchesAny(relativePath, patterns));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON registry ${filePath}: ${error.message}`, { cause: error });
  }
}

export function loadRegistry(root, registryPath = DEFAULT_REGISTRY_PATH) {
  const absolutePath = path.isAbsolute(registryPath) ? registryPath : path.join(root, registryPath);
  return readJson(absolutePath);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const DEFAULT_MUTABLE_GENERATED_TEXT_FIELDS = Object.freeze([
  "description", "artifact", "text", "implementationDeliverable", "userVisibleResult", "acceptanceCondition",
]);
const DEFAULT_IMMUTABLE_SOURCE_FIELDS = Object.freeze([
  "id", "sourceStatement", "sourceTextHash", "atomicTextHash", "sourceVersion",
]);

function uniqueNormalized(values) {
  const seen = new Set();
  const duplicates = [];
  for (const value of values) {
    const normalized = value.trim().toLocaleLowerCase("en-US");
    if (seen.has(normalized)) duplicates.push(value);
    seen.add(normalized);
  }
  return duplicates;
}

function validateExpiry(expiry, label, errors) {
  const checkpoint = expiry?.checkpoint ?? expiry?.id;
  if (!expiry || !nonEmptyString(checkpoint) || !nonEmptyString(expiry.condition)) {
    errors.push(`${label} must include a checkpoint/id and condition`);
  }
}

function validateAllowlistEntries(entries, label, termIds, options = {}) {
  const errors = [];
  if (!Array.isArray(entries)) {
    return [`${label} must be an array`];
  }
  const ids = new Set();
  for (const [index, entry] of entries.entries()) {
    const prefix = `${label}[${index}]`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    for (const key of ["id", "pathPattern", "owner", "reason"]) {
      if (!nonEmptyString(entry[key])) errors.push(`${prefix}.${key} must be a non-empty string`);
    }
    if (ids.has(entry.id)) errors.push(`${prefix}.id duplicates another allowlist id: ${entry.id}`);
    ids.add(entry.id);
    if (!Array.isArray(entry.termIds) || entry.termIds.length === 0) {
      errors.push(`${prefix}.termIds must contain at least one exact ID`);
    } else {
      for (const termId of entry.termIds) {
        if (!termIds.has(termId)) errors.push(`${prefix}.termIds contains unknown ID: ${termId}`);
      }
    }
    if (!Array.isArray(entry.testEvidence) || entry.testEvidence.length === 0 || entry.testEvidence.some((value) => !nonEmptyString(value))) {
      errors.push(`${prefix}.testEvidence must contain at least one evidence reference`);
    }
    validateExpiry(entry.expiry, prefix, errors);
    const pattern = nonEmptyString(entry.pathPattern) ? normalizeRepoPath(entry.pathPattern) : "";
    if (pattern.includes("\\") || pattern.startsWith("/") || pattern.includes("..")) {
      errors.push(`${prefix}.pathPattern must be a repository-relative path pattern`);
    }
    if (!options.history && pattern.includes("**")) {
      errors.push(`${prefix}.pathPattern is too broad for mutable compatibility: ${pattern}`);
    }
    if (!options.history && (pattern.match(/\*/gu) ?? []).length > 2) {
      errors.push(`${prefix}.pathPattern has too many wildcards for mutable compatibility: ${pattern}`);
    }
    if (options.history) {
      const allowedHistoryRoots = ["plans/", "docs/checkpoints/", "docs/ghost3/", "docs/source/", "docs/TEARBENCH_GHOST3_", "docs/TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md", "docs/TEARBENCH_C40_WEAPON_ROSTER_EVIDENCE_INDEX.md", "public/vendor/tear-score/", "src/tearbench/evidence-routes.json"];
      if (!allowedHistoryRoots.some((root) => pattern === root || pattern.startsWith(root))) {
        errors.push(`${prefix}.pathPattern is outside an approved immutable-history root: ${pattern}`);
      }
    }
  }
  return errors;
}

export function validateRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object") return ["registry must be an object"];
  if (registry.schemaVersion !== 1) errors.push("registry.schemaVersion must equal 1");
  if (!nonEmptyString(registry.registryId)) errors.push("registry.registryId must be a non-empty string");
  const authority = registry.sourceAuthority;
  if (!authority || typeof authority !== "object") {
    errors.push("sourceAuthority must be an object");
  } else {
    const owners = authority.productionOwners;
    const requiredOwners = ["stages", "bosses", "environmentMechanics", "stageEnvironment", "publication", "canonicalScenarios"];
    if (!owners || typeof owners !== "object") errors.push("sourceAuthority.productionOwners must be an object");
    else for (const key of requiredOwners) if (!nonEmptyString(owners[key])) errors.push(`sourceAuthority.productionOwners.${key} must be a repository path`);
    if (!nonEmptyString(authority.projectionRule)) errors.push("sourceAuthority.projectionRule must be a non-empty policy");
    if (!nonEmptyString(authority.specializedMechanicsRule)) errors.push("sourceAuthority.specializedMechanicsRule must be a non-empty policy");
  }
  const projection = registry.mutableProjectionPolicy;
  if (!projection || typeof projection !== "object") {
    errors.push("mutableProjectionPolicy must be an object");
  } else {
    for (const [key, fallback] of [["mutableGeneratedTextFields", DEFAULT_MUTABLE_GENERATED_TEXT_FIELDS], ["immutableSourceFields", DEFAULT_IMMUTABLE_SOURCE_FIELDS]]) {
      if (!Array.isArray(projection[key]) || projection[key].length === 0 || projection[key].some((field) => !nonEmptyString(field))) {
        errors.push(`mutableProjectionPolicy.${key} must contain non-empty field names`);
      } else if (new Set(projection[key]).size !== projection[key].length) {
        errors.push(`mutableProjectionPolicy.${key} must not contain duplicate fields`);
      } else if (fallback.some((field) => !projection[key].includes(field))) {
        errors.push(`mutableProjectionPolicy.${key} is missing a required field`);
      }
    }
    for (const key of ["mutablePaths", "immutablePaths"]) {
      if (!Array.isArray(projection[key]) || projection[key].length === 0 || projection[key].some((value) => !nonEmptyString(value))) {
        errors.push(`mutableProjectionPolicy.${key} must contain repository paths`);
      }
    }
    const mutableFields = new Set(projection.mutableGeneratedTextFields ?? []);
    for (const field of projection.immutableSourceFields ?? []) {
      if (mutableFields.has(field)) errors.push(`mutableProjectionPolicy field cannot be both mutable and immutable: ${field}`);
    }
  }
  const currentSource = registry.currentSourcePolicy;
  if (!currentSource || typeof currentSource !== "object") {
    errors.push("currentSourcePolicy must be an object");
  } else {
    for (const key of ["mutableScanPaths", "immutableHistoryPaths", "staleDefinitionPatterns", "staleCheckpointCommentPatterns"]) {
      if (!Array.isArray(currentSource[key]) || currentSource[key].length === 0
        || currentSource[key].some((value) => !nonEmptyString(value))) {
        errors.push(`currentSourcePolicy.${key} must contain non-empty values`);
      }
    }
    const mutablePaths = currentSource.mutableScanPaths ?? [];
    const immutablePaths = currentSource.immutableHistoryPaths ?? [];
    for (const mutablePath of mutablePaths) {
      if (immutablePaths.some((immutablePath) => matchesPathPattern(mutablePath, immutablePath)
        || matchesPathPattern(immutablePath, mutablePath))) {
        errors.push(`currentSourcePolicy mutable path overlaps immutable history: ${mutablePath}`);
      }
    }
    for (const [key, patterns] of [["staleDefinitionPatterns", currentSource.staleDefinitionPatterns], ["staleCheckpointCommentPatterns", currentSource.staleCheckpointCommentPatterns]]) {
      for (const pattern of patterns ?? []) {
        try {
          new RegExp(pattern, "imu");
        } catch (error) {
          errors.push(`currentSourcePolicy.${key} contains invalid regular expression: ${String(error.message)}`);
        }
      }
    }
  }
  if (!Array.isArray(registry.terms) || registry.terms.length === 0) {
    errors.push("registry.terms must be a non-empty array");
    return errors;
  }

  const termIds = new Set();
  const canonicalDisplayNames = [];
  const canonicalCodeIds = [];
  const aliases = [];
  for (const [index, term] of registry.terms.entries()) {
    const prefix = `terms[${index}]`;
    if (!term || typeof term !== "object") {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    for (const key of ["id", "displayName", "codeId", "owner", "compatibilityStrategy"]) {
      if (!nonEmptyString(term[key])) errors.push(`${prefix}.${key} must be a non-empty string`);
    }
    if (termIds.has(term.id)) errors.push(`${prefix}.id duplicates another term: ${term.id}`);
    termIds.add(term.id);
    canonicalDisplayNames.push(term.displayName);
    canonicalCodeIds.push(term.codeId);
    if (!Array.isArray(term.deprecatedAliases)) errors.push(`${prefix}.deprecatedAliases must be an array`);
    if (!Array.isArray(term.deprecatedCopyAliases)) errors.push(`${prefix}.deprecatedCopyAliases must be an array`);
    const termAliases = Array.isArray(term.deprecatedAliases) ? term.deprecatedAliases : [];
    const copyAliases = Array.isArray(term.deprecatedCopyAliases) ? term.deprecatedCopyAliases : [];
    for (const alias of termAliases) {
      if (!nonEmptyString(alias)) errors.push(`${prefix}.deprecatedAliases must contain only non-empty strings`);
      aliases.push(alias);
    }
    for (const alias of copyAliases) {
      if (!termAliases.includes(alias)) errors.push(`${prefix}.deprecatedCopyAliases contains alias not in deprecatedAliases: ${alias}`);
    }
    if (term.deprecatedCopyAliasPathPatterns !== undefined) {
      if (!term.deprecatedCopyAliasPathPatterns || typeof term.deprecatedCopyAliasPathPatterns !== "object") {
        errors.push(`${prefix}.deprecatedCopyAliasPathPatterns must be an object`);
      } else {
        for (const [alias, patterns] of Object.entries(term.deprecatedCopyAliasPathPatterns)) {
          if (!copyAliases.includes(alias)) errors.push(`${prefix}.deprecatedCopyAliasPathPatterns contains an unregistered copy alias: ${alias}`);
          if (!Array.isArray(patterns) || patterns.length === 0 || patterns.some((pattern) => !nonEmptyString(pattern) || pattern.includes("**"))) {
            errors.push(`${prefix}.deprecatedCopyAliasPathPatterns.${alias} must contain narrow repository-relative patterns`);
          }
        }
      }
    }
    if (!term.persistenceImpact || typeof term.persistenceImpact !== "object") errors.push(`${prefix}.persistenceImpact must be an object`);
    validateExpiry(term.removalCheckpoint, `${prefix}.removalCheckpoint`, errors);
  }
  for (const [label, names] of [["display name", canonicalDisplayNames], ["code ID", canonicalCodeIds]]) {
    for (const duplicate of uniqueNormalized(names.filter(nonEmptyString))) {
      errors.push(`canonical ${label} is duplicated: ${duplicate}`);
    }
  }
  for (const duplicate of uniqueNormalized(aliases.filter(nonEmptyString))) {
    errors.push(`deprecated alias is duplicated: ${duplicate}`);
  }
  const canonicalNormalized = new Set([...canonicalDisplayNames, ...canonicalCodeIds].filter(nonEmptyString).map((value) => value.toLocaleLowerCase("en-US")));
  for (const alias of aliases.filter(nonEmptyString)) {
    if (canonicalNormalized.has(alias.toLocaleLowerCase("en-US"))) {
      errors.push(`deprecated alias is also a canonical name: ${alias}`);
    }
  }

  const scan = registry.userFacingCopyScan;
  if (!scan || !Array.isArray(scan.pathPatterns) || scan.pathPatterns.length === 0) {
    errors.push("userFacingCopyScan.pathPatterns must be a non-empty array");
  }
  const allAliases = new Set(aliases);
  for (const term of registry.terms) {
    for (const alias of term.deprecatedCopyAliases ?? []) {
      if (!allAliases.has(alias)) errors.push(`copy alias is not globally registered: ${alias}`);
    }
  }

  const allowlists = registry.allowlists;
  if (!allowlists || typeof allowlists !== "object") {
    errors.push("registry.allowlists must be an object");
  } else {
    errors.push(...validateAllowlistEntries(allowlists.immutableHistory, "allowlists.immutableHistory", termIds, { history: true }));
    errors.push(...validateAllowlistEntries(allowlists.mutableCompatibility, "allowlists.mutableCompatibility", termIds));
  }

  const roster = registry.activeRoster;
  if (!roster || typeof roster !== "object") {
    errors.push("registry.activeRoster must be an object");
  } else {
    if (!nonEmptyString(roster.sourceOfTruth)) errors.push("activeRoster.sourceOfTruth must be a repository path");
    if (!Array.isArray(roster.canonicalIds) || roster.canonicalIds.length !== 5) errors.push("activeRoster.canonicalIds must contain exactly five IDs");
    if (!Array.isArray(roster.canonicalDisplayNames) || roster.canonicalDisplayNames.length !== 5) errors.push("activeRoster.canonicalDisplayNames must contain exactly five names");
    if (!Array.isArray(roster.retiredIds) || roster.retiredIds.length !== 2) errors.push("activeRoster.retiredIds must contain exactly two IDs");
    const rosterIds = new Set([...(roster.retiredIds ?? []), ...(roster.canonicalIds ?? [])]);
    errors.push(...validateAllowlistEntries(roster.migrationAllowlist, "activeRoster.migrationAllowlist", rosterIds));
    errors.push(...validateAllowlistEntries(roster.historyAllowlist, "activeRoster.historyAllowlist", rosterIds, { history: true }));
  }
  return errors;
}

function replaceDeprecatedCopyAliases(value, registry) {
  let result = value;
  for (const term of registry.terms) {
    for (const alias of term.deprecatedCopyAliases ?? []) {
      const pattern = aliasPattern(alias);
      result = result.replace(pattern, (match, prefix = "") => `${prefix}${term.displayName}`);
    }
  }
  return result;
}

/**
 * Translate only mutable generated prose. Source IDs, source statements, and
 * hash-bound fields are copied byte-for-byte and never pass through aliases.
 */
export function translateMutableGeneratedDescriptions(value, registry) {
  const mutableFields = new Set(registry.mutableProjectionPolicy?.mutableGeneratedTextFields ?? DEFAULT_MUTABLE_GENERATED_TEXT_FIELDS);
  if (Array.isArray(value)) return value.map((entry) => translateMutableGeneratedDescriptions(entry, registry));
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = mutableFields.has(key) && typeof entry === "string"
      ? replaceDeprecatedCopyAliases(entry, registry)
      : (Array.isArray(entry) || (entry && typeof entry === "object"))
        ? translateMutableGeneratedDescriptions(entry, registry)
        : entry;
  }
  return result;
}

function scanPatternMatches(text, patterns) {
  return patterns.flatMap((pattern) => {
    const expression = new RegExp(pattern, "gimu");
    return [...text.matchAll(expression)].map((match) => ({ pattern, index: match.index ?? 0, text: match[0] }));
  });
}

/**
 * Reject only known stale provisional definitions and current checkpoint
 * claims. Explicit immutable-history paths are never scanned by this policy.
 */
export function scanStaleCurrentClaims(root, registry) {
  const policy = registry.currentSourcePolicy;
  const findings = [];
  const errors = [];
  const files = collectMatchingFiles(root, policy.mutableScanPaths)
    .filter((relativePath) => !pathMatchesAny(relativePath, policy.immutableHistoryPaths));
  for (const relativePath of files) {
    const text = fs.readFileSync(path.join(root, relativePath), "utf8");
    for (const { pattern, index, text: matchText } of scanPatternMatches(text, policy.staleDefinitionPatterns)) {
      const line = text.slice(0, index).split(/\r?\n/u).length;
      findings.push({ relativePath, line, kind: "stale-definition", pattern, text: matchText });
      errors.push(`${relativePath}:${line} contains stale provisional definition symbol "${matchText}"`);
    }
    for (const { pattern, index, text: matchText } of scanPatternMatches(text, policy.staleCheckpointCommentPatterns)) {
      const line = text.slice(0, index).split(/\r?\n/u).length;
      findings.push({ relativePath, line, kind: "stale-checkpoint-comment", pattern, text: matchText });
      errors.push(`${relativePath}:${line} contains stale current-facing checkpoint claim "${matchText}"`);
    }
  }
  return { errors, findings, scannedFiles: files.length };
}

export function sourceStringSegments(text) {
  const segments = [];
  for (let index = 0; index < text.length; index += 1) {
    const quote = text[index];
    if (quote !== "'" && quote !== '"' && quote !== "`") continue;
    const start = index + 1;
    let cursor = start;
    let escaped = false;
    for (; cursor < text.length; cursor += 1) {
      const character = text[cursor];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === quote) break;
    }
    if (cursor >= text.length) break;
    segments.push({ text: text.slice(start, cursor), offset: start });
    index = cursor;
  }
  return segments;
}

export function userFacingSegments(relativePath, text, scan) {
  const extension = getPathExtension(relativePath);
  if (scan.wholeTextExtensions?.includes(extension)) return [{ text, offset: 0 }];
  const segments = sourceStringSegments(text);
  if (extension === ".tsx") {
    const markup = />((?:[^<]|<(?![/a-z]))+)</gu;
    for (const match of text.matchAll(markup)) {
      segments.push({ text: match[1], offset: match.index + 1 });
    }
  }
  return segments;
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split(/\r?\n/u).length;
}

function aliasPattern(alias) {
  const escaped = escapeRegExp(alias).replaceAll("\\ ", "\\s+");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, "giu");
}

function isCodeToken(segmentText, alias) {
  const trimmed = segmentText.trim();
  if (/^(?:\.\\.?[\\/]|[A-Za-z]:[\\/])/u.test(trimmed)) return true;
  if (alias === alias.toLocaleLowerCase("en-US")) return false;
  return /^[a-z0-9][a-z0-9_.:-]*$/u.test(trimmed);
}

function allowedOccurrence(relativePath, termId, registry) {
  const history = registry.allowlists.immutableHistory.find((entry) => entry.termIds.includes(termId) && matchesPathPattern(relativePath, entry.pathPattern));
  if (history) return { classification: "immutable-history", allowlistId: history.id };
  const compatibility = registry.allowlists.mutableCompatibility.find((entry) => entry.termIds.includes(termId) && matchesPathPattern(relativePath, entry.pathPattern));
  if (compatibility) return { classification: "mutable-compatibility", allowlistId: compatibility.id };
  return null;
}

export function scanDeprecatedUserFacingCopy(root, registry) {
  const errors = [];
  const findings = [];
  const scan = registry.userFacingCopyScan;
  const files = collectMatchingFiles(root, scan.pathPatterns);
  const termAliases = registry.terms.flatMap((term) => (term.deprecatedCopyAliases ?? []).map((alias) => ({
    termId: term.id,
    alias,
    pathPatterns: term.deprecatedCopyAliasPathPatterns?.[alias] ?? null,
  })));
  for (const relativePath of files) {
    if (pathMatchesAny(relativePath, scan.ignoredPathPatterns ?? [])) continue;
    const absolutePath = path.join(root, relativePath);
    const text = fs.readFileSync(absolutePath, "utf8");
    for (const segment of userFacingSegments(relativePath, text, scan)) {
      for (const { termId, alias, pathPatterns } of termAliases) {
        if (pathPatterns && !pathMatchesAny(relativePath, pathPatterns)) continue;
        if (isCodeToken(segment.text, alias)) continue;
        const allowance = allowedOccurrence(relativePath, termId, registry);
        for (const match of segment.text.matchAll(aliasPattern(alias))) {
          const aliasOffset = (match.index ?? 0) + (match[1]?.length ?? 0);
          const finding = {
            relativePath,
            line: lineNumber(text, segment.offset + aliasOffset),
            termId,
            alias,
            classification: allowance?.classification ?? "unallowlisted",
            allowlistId: allowance?.allowlistId ?? null,
          };
          findings.push(finding);
          if (!allowance) errors.push(`${relativePath}:${finding.line} contains deprecated user-facing alias "${alias}" for ${termId} without an explicit compatibility/history allowlist`);
        }
      }
    }
  }
  return { errors, findings, scannedFiles: files.length };
}

export function runTerminologyCheck({ root = process.cwd(), registryPath = DEFAULT_REGISTRY_PATH } = {}) {
  const registry = loadRegistry(root, registryPath);
  const validationErrors = validateRegistry(registry);
  if (validationErrors.length > 0) return { ok: false, errors: validationErrors, findings: [], scannedFiles: 0, registry };
  const scanResult = scanDeprecatedUserFacingCopy(root, registry);
  const staleResult = scanStaleCurrentClaims(root, registry);
  return {
    ok: scanResult.errors.length === 0 && staleResult.errors.length === 0,
    errors: [...scanResult.errors, ...staleResult.errors],
    findings: [...scanResult.findings, ...staleResult.findings],
    scannedFiles: scanResult.scannedFiles,
    staleScannedFiles: staleResult.scannedFiles,
    registry,
  };
}

function parseCliArguments(argumentsList) {
  const options = { root: process.cwd(), registryPath: DEFAULT_REGISTRY_PATH };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--root") options.root = path.resolve(argumentsList[++index]);
    else if (argument === "--registry") options.registryPath = argumentsList[++index];
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/check-terminology.mjs [--root <repo>] [--registry <path>]");
      return;
    }
    const result = runTerminologyCheck(options);
    if (!result.ok) {
      console.error(["Terminology check failed:", ...result.errors.map((error) => `- ${error}`)].join("\n"));
      process.exitCode = 1;
      return;
    }
    const allowlisted = result.findings.filter((finding) => finding.classification !== "unallowlisted").length;
    console.log(`terminology check passed (${result.registry.terms.length} terms, ${result.scannedFiles} files scanned, ${allowlisted} allowlisted deprecated-copy occurrences)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === thisFile) main();
