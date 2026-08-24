import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PARENT_LAYOUT_POLICY_FORMAT = "tear-workspace-parent-layout-policy";
export const DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH = "preservation/workspace-parent-layout-policy.json";
export const DEFAULT_PARENT_LAYOUT_POLICY_PATH = path.resolve(
  import.meta.dirname,
  "..",
  DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH,
);
export const DEFAULT_WORKSPACE_CONTRACT_RELATIVE_PATH = "config/workspace-contract.json";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const EXPECTED_REPOSITORY = "shaku1z/tear";
const EXPECTED_CANONICAL = Object.freeze({
  game: Object.freeze({ exactName: "Tear", repository: "shaku1z/tear", branch: "main", upstream: "origin/main" }),
  music: Object.freeze({ exactName: "tear-score", repository: "shaku1z/tear-music", branch: "main", upstream: "origin/main" }),
  wiki: Object.freeze({ exactName: "tear-wiki", repository: "shaku1z/tear-wiki", branch: "main", upstream: "origin/main" }),
  oracle: Object.freeze({
    exactName: "Tear-oracle",
    repository: "shaku1z/tear",
    lockedCommit: "ee5e93141d67cc02505b2227b3be0b10d1819e1c",
    role: "comparison-only",
    requiredState: "detached-clean-comparison-only",
    requiredLockReason: "comparison-only",
    lockReason: "comparison-only; never merge or develop here",
  }),
});
const EXPECTED_APPROVED_PATTERNS = Object.freeze([
  "^Tear-archives$",
  "^tear-git-recovery-",
  "^tear-g3-preservation-audit-",
  "^tear-g5-",
]);
const EXPECTED_FORBIDDEN_PATTERNS = Object.freeze([
  "^Tear-main-publication$",
  "^Tear-g5-canonical-",
]);
const EXPECTED_FORBIDDEN_FOR = Object.freeze(["development", "deployment"]);
const EXPECTED_DEFERRED_RELATION = Object.freeze({
  status: "deferred",
  operation: "audit-only",
  auditVisible: true,
  move: false,
  kind: "junction",
  source: Object.freeze({ exactName: "Tear-budget-architecture", relativePath: "node_modules" }),
  target: Object.freeze({ exactName: "Tear-tearscore-normalization", relativePath: "node_modules" }),
});

// The forbidden canonical scratch family is intentionally a more-specific
// exception to the approved tear-g5 archive prefix. The checker gives the
// forbidden family precedence; every other approved/forbidden overlap is
// ambiguous and rejected.
const ALLOWED_SPECIFIC_FORBIDDEN_OVERRIDE = Object.freeze({
  approved: "^tear-g5-",
  forbidden: "^tear-g5-canonical-",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label, errors) {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }
  const expectedSet = new Set(expected);
  for (const key of expected) if (!Object.hasOwn(value, key)) errors.push(`${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!expectedSet.has(key)) errors.push(`${label}.${key} is not permitted`);
  return true;
}

function equalObjectValues(actual, expected, label, errors) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (actual?.[key] !== expectedValue) errors.push(`${label}.${key} must be ${JSON.stringify(expectedValue)}`);
  }
}

function isAbsolutePathString(value) {
  const text = String(value);
  return path.posix.isAbsolute(text.replaceAll("\\", "/"))
    || /^[A-Za-z]:[\\/]/u.test(text)
    || /^\\\\/u.test(text)
    || /^\\/u.test(text)
    || /^file:\/\//iu.test(text)
    || /(?:^|[\s("'])\\\\[^\\s]+/u.test(text)
    || /(?:^|[\s("'])[A-Za-z]:[\\/]/u.test(text);
}

function findAbsolutePaths(value, label, errors, seen = new Set()) {
  if (typeof value === "string") {
    if (isAbsolutePathString(value)) errors.push(`${label} must not contain an absolute path`);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findAbsolutePaths(entry, `${label}[${index}]`, errors, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) findAbsolutePaths(entry, `${label}.${key}`, errors, seen);
  }
}

function caseInsensitiveNameCollisions(names) {
  const seen = new Map();
  const collisions = [];
  for (const entry of names) {
    const key = String(entry.value ?? "").toLocaleLowerCase("en-US");
    if (seen.has(key)) collisions.push(`${entry.label} collides with ${seen.get(key)} (case-insensitive)`);
    else seen.set(key, entry.label);
  }
  return collisions;
}

function patternDescriptor(pattern) {
  if (typeof pattern !== "string" || !pattern.startsWith("^")) return null;
  const anchoredEnd = pattern.endsWith("$");
  const literal = pattern.slice(1, anchoredEnd ? -1 : undefined);
  // The production policy deliberately uses literal names and prefixes. A
  // pattern containing regex operators would make overlap analysis unsafe.
  if (literal === "" || /[.*+?^${}()|[\]\\]/u.test(literal)) return null;
  return { pattern, literal: literal.toLocaleLowerCase("en-US"), anchoredEnd };
}

function patternMatchesSameName(left, right) {
  if (left.literal === right.literal) return true;
  if (left.anchoredEnd && right.anchoredEnd) return false;
  if (!left.anchoredEnd && right.literal.startsWith(left.literal)) return true;
  if (!right.anchoredEnd && left.literal.startsWith(right.literal)) return true;
  return false;
}

function isAllowedOverride(approved, forbidden) {
  return approved.toLocaleLowerCase("en-US") === ALLOWED_SPECIFIC_FORBIDDEN_OVERRIDE.approved
    && forbidden.toLocaleLowerCase("en-US") === ALLOWED_SPECIFIC_FORBIDDEN_OVERRIDE.forbidden;
}

function validatePatternList(patterns, label, expected, errors) {
  if (!Array.isArray(patterns)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  if (JSON.stringify(patterns) !== JSON.stringify(expected)) errors.push(`${label} must contain the exact mandated patterns`);
  const seen = new Set();
  const descriptors = [];
  for (const [index, pattern] of patterns.entries()) {
    if (typeof pattern !== "string" || !pattern.startsWith("^")) {
      errors.push(`${label}[${index}] must be anchored at the beginning`);
      continue;
    }
    try {
      new RegExp(pattern, "iu");
    } catch (error) {
      errors.push(`${label}[${index}] is not a valid regular expression: ${error.message}`);
      continue;
    }
    const key = pattern.toLocaleLowerCase("en-US");
    if (seen.has(key)) errors.push(`${label} contains a case-insensitive duplicate: ${pattern}`);
    seen.add(key);
    const descriptor = patternDescriptor(pattern);
    if (descriptor === null) errors.push(`${label}[${index}] must be a literal anchored name or prefix`);
    else descriptors.push(descriptor);
  }
  for (let leftIndex = 0; leftIndex < descriptors.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < descriptors.length; rightIndex += 1) {
      if (patternMatchesSameName(descriptors[leftIndex], descriptors[rightIndex])) {
        errors.push(`${label} contains ambiguous overlapping patterns: ${descriptors[leftIndex].pattern} and ${descriptors[rightIndex].pattern}`);
      }
    }
  }
  return descriptors;
}

function validateCrossPatternOverlap(approvedDescriptors, forbiddenDescriptors, errors) {
  for (const approved of approvedDescriptors) {
    for (const forbidden of forbiddenDescriptors) {
      if (!patternMatchesSameName(approved, forbidden)) continue;
      if (isAllowedOverride(approved.pattern, forbidden.pattern)) continue;
      errors.push(`approved and forbidden patterns overlap ambiguously: ${approved.pattern} and ${forbidden.pattern}`);
    }
  }
}

function validateCanonical(policy, errors) {
  if (!exactKeys(policy?.canonical, ["game", "music", "wiki", "oracle"], "canonical", errors)) return;
  for (const key of ["game", "music", "wiki"]) {
    if (exactKeys(policy.canonical[key], ["exactName", "repository", "branch", "upstream"], `canonical.${key}`, errors)) {
      equalObjectValues(policy.canonical[key], EXPECTED_CANONICAL[key], `canonical.${key}`, errors);
    }
  }
  if (exactKeys(policy.canonical.oracle, ["exactName", "repository", "lockedCommit", "role", "requiredState", "requiredLockReason", "lockReason"], "canonical.oracle", errors)) {
    equalObjectValues(policy.canonical.oracle, EXPECTED_CANONICAL.oracle, "canonical.oracle", errors);
    if (!FULL_SHA_PATTERN.test(String(policy.canonical.oracle.lockedCommit ?? ""))) errors.push("canonical.oracle.lockedCommit must be a full 40-character SHA-1");
  }
}

function validateNames(policy, errors) {
  if (!exactKeys(policy?.names, ["approvedArchiveRecoveryPatterns", "forbiddenPatterns", "forbiddenFor", "collisionPolicy"], "names", errors)) return;
  const approved = validatePatternList(policy.names.approvedArchiveRecoveryPatterns, "names.approvedArchiveRecoveryPatterns", EXPECTED_APPROVED_PATTERNS, errors);
  const forbidden = validatePatternList(policy.names.forbiddenPatterns, "names.forbiddenPatterns", EXPECTED_FORBIDDEN_PATTERNS, errors);
  validateCrossPatternOverlap(approved, forbidden, errors);
  if (JSON.stringify(policy.names.forbiddenFor) !== JSON.stringify(EXPECTED_FORBIDDEN_FOR)) errors.push("names.forbiddenFor must be exactly development and deployment");
  if (exactKeys(policy.names.collisionPolicy, ["comparison", "onCollision"], "names.collisionPolicy", errors)) {
    equalObjectValues(policy.names.collisionPolicy, { comparison: "case-insensitive", onCollision: "reject" }, "names.collisionPolicy", errors);
  }
}

function validateReparse(policy, errors) {
  if (!exactKeys(policy?.reparse, ["default", "deferredAuditRelation"], "reparse", errors)) return;
  if (policy.reparse.default !== "refuse") errors.push("reparse.default must be refuse");
  const relation = policy.reparse.deferredAuditRelation;
  if (!exactKeys(relation, ["status", "operation", "auditVisible", "move", "kind", "source", "target"], "reparse.deferredAuditRelation", errors)) return;
  equalObjectValues(relation, {
    status: EXPECTED_DEFERRED_RELATION.status,
    operation: EXPECTED_DEFERRED_RELATION.operation,
    auditVisible: EXPECTED_DEFERRED_RELATION.auditVisible,
    move: EXPECTED_DEFERRED_RELATION.move,
    kind: EXPECTED_DEFERRED_RELATION.kind,
  }, "reparse.deferredAuditRelation", errors);
  for (const side of ["source", "target"]) {
    if (exactKeys(relation[side], ["exactName", "relativePath"], `reparse.deferredAuditRelation.${side}`, errors)) {
      equalObjectValues(relation[side], EXPECTED_DEFERRED_RELATION[side], `reparse.deferredAuditRelation.${side}`, errors);
      if (path.posix.isAbsolute(String(relation[side].relativePath ?? "").replaceAll("\\", "/"))) errors.push(`reparse.deferredAuditRelation.${side}.relativePath must be relative`);
      if (String(relation[side].relativePath ?? "").split(/[\\/]/u).includes("..")) errors.push(`reparse.deferredAuditRelation.${side}.relativePath must not escape its root`);
    }
  }
  if (relation?.source?.exactName?.toLocaleLowerCase("en-US") === relation?.target?.exactName?.toLocaleLowerCase("en-US")) {
    errors.push("reparse deferred source and target names must be distinct case-insensitively");
  }
}

function validateLooseItems(policy, errors) {
  if (!exactKeys(policy?.looseItems, ["mode", "autoMove", "autoDelete", "autoDeploy", "autoMerge"], "looseItems", errors)) return;
  if (policy.looseItems.mode !== "report-only") errors.push("looseItems.mode must be report-only");
  for (const field of ["autoMove", "autoDelete", "autoDeploy", "autoMerge"]) {
    if (policy.looseItems[field] !== false) errors.push(`looseItems.${field} must be false`);
  }
}

export function validateParentLayoutPolicy(policy) {
  const errors = [];
  if (!isRecord(policy)) {
    return ["parent-layout policy must be a JSON object"];
  }
  findAbsolutePaths(policy, "policy", errors);
  if (!exactKeys(policy, ["format", "schemaVersion", "repository", "canonical", "names", "reparse", "looseItems"], "policy", errors)) return errors;
  if (policy.format !== PARENT_LAYOUT_POLICY_FORMAT) errors.push(`policy.format must be ${PARENT_LAYOUT_POLICY_FORMAT}`);
  if (policy.schemaVersion !== 1) errors.push("policy.schemaVersion must be 1");
  if (policy.repository !== EXPECTED_REPOSITORY) errors.push(`policy.repository must be ${EXPECTED_REPOSITORY}`);
  validateCanonical(policy, errors);
  validateNames(policy, errors);
  validateReparse(policy, errors);
  validateLooseItems(policy, errors);

  const names = [];
  for (const [key, value] of Object.entries(policy.canonical ?? {})) {
    if (typeof value?.exactName === "string") names.push({ value: value.exactName, label: `canonical.${key}.exactName` });
  }
  for (const side of ["source", "target"]) {
    const value = policy.reparse?.deferredAuditRelation?.[side];
    if (typeof value?.exactName === "string") names.push({ value: value.exactName, label: `reparse.deferredAuditRelation.${side}.exactName` });
  }
  errors.push(...caseInsensitiveNameCollisions(names));
  return [...new Set(errors)];
}

// Keep the shape-oriented name available to focused contract tests and future
// callers that follow the existing preservation-validator naming convention.
export const validateParentLayoutPolicyShape = validateParentLayoutPolicy;

function readJson(filePath) {
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, "utf8")), errors: [] };
  } catch (error) {
    return { value: null, errors: [`could not read parent-layout policy: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

export function readParentLayoutPolicy(policyPath = DEFAULT_PARENT_LAYOUT_POLICY_PATH) {
  const absolutePath = path.resolve(policyPath);
  const result = readJson(absolutePath);
  return { path: absolutePath, policy: result.value, errors: result.errors };
}

function readContractReference(contractPath) {
  try {
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    return { contract, errors: [] };
  } catch (error) {
    return { contract: null, errors: [`could not read workspace contract: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

export function runParentLayoutCheck({
  root = process.cwd(),
  policyPath,
  contractPath,
  checkContract = true,
} = {}) {
  const absoluteRoot = path.resolve(root);
  const errors = [];
  let resolvedPolicyPath = policyPath === undefined
    ? path.join(absoluteRoot, DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH)
    : path.resolve(policyPath);
  if (checkContract) {
    const loadedContract = readContractReference(contractPath ?? path.join(absoluteRoot, DEFAULT_WORKSPACE_CONTRACT_RELATIVE_PATH));
    errors.push(...loadedContract.errors);
    if (loadedContract.contract?.parentLayoutPolicy !== `./${DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH}`) {
      errors.push(`workspace contract parentLayoutPolicy must be ./${DEFAULT_PARENT_LAYOUT_POLICY_RELATIVE_PATH}`);
    }
    if (loadedContract.contract?.repository !== EXPECTED_REPOSITORY) errors.push(`workspace contract repository must be ${EXPECTED_REPOSITORY}`);
    if (policyPath === undefined && loadedContract.contract?.parentLayoutPolicy === "./preservation/workspace-parent-layout-policy.json") {
      resolvedPolicyPath = path.resolve(absoluteRoot, loadedContract.contract.parentLayoutPolicy);
    }
  }
  const loaded = readParentLayoutPolicy(resolvedPolicyPath);
  errors.push(...loaded.errors, ...validateParentLayoutPolicy(loaded.policy));
  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? "valid" : "invalid",
    policyRelativePath: path.relative(absoluteRoot, loaded.path).replaceAll(path.sep, "/"),
    errors: [...new Set(errors)],
  };
}

function parseArguments(argumentsList) {
  const options = { root: process.cwd() };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--root") options.root = path.resolve(argumentsList[++index]);
    else if (argument === "--policy") options.policyPath = path.resolve(argumentsList[++index]);
    else if (argument === "--contract") options.contractPath = path.resolve(argumentsList[++index]);
    else if (argument === "--no-contract") options.checkContract = false;
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(JSON.stringify({ usage: "node scripts/check-parent-layout.mjs [--root <repo>] [--policy <path>] [--contract <path>] [--no-contract]" }));
      return;
    }
    const result = runParentLayoutCheck(options);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, status: "invalid", errors: [error instanceof Error ? error.message : String(error)] }, null, 2));
    process.exitCode = 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === thisFile) main();
