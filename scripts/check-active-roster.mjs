import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  collectMatchingFiles,
  loadRegistry,
  matchesPathPattern,
  sourceStringSegments,
  validateRegistry,
} from "./check-terminology.mjs";

const DEFAULT_REGISTRY_PATH = "config/terminology-registry.json";
const REQUIRED_CANONICAL_IDS = Object.freeze(["sword", "hammer", "greatsword", "chainblade", "riftlock"]);
const REQUIRED_RETIRED_IDS = Object.freeze(["spear", "ringblade"]);
const REQUIRED_MIGRATION_MAP = Object.freeze({ spear: "greatsword", ringblade: "riftlock" });

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/gu, "\\$&");
}

function aliasPattern(alias) {
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(alias)}(?=$|[^A-Za-z0-9])`, "giu");
}

function getExtension(relativePath) {
  return path.extname(relativePath).toLowerCase();
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split(/\r?\n/u).length;
}

function segmentsForFile(relativePath, text) {
  const extension = getExtension(relativePath);
  if ([".json", ".html"].includes(extension)) return [{ text, offset: 0 }];
  return sourceStringSegments(text);
}

function allowedRosterOccurrence(relativePath, retiredId, roster) {
  const history = roster.historyAllowlist.find((entry) => entry.termIds.includes(retiredId) && matchesPathPattern(relativePath, entry.pathPattern));
  if (history) return { classification: "immutable-history", allowlistId: history.id };
  const migration = roster.migrationAllowlist.find((entry) => entry.termIds.includes(retiredId) && matchesPathPattern(relativePath, entry.pathPattern));
  if (migration) return { classification: "mutable-compatibility", allowlistId: migration.id };
  return null;
}

function parseQuotedValues(text) {
  return [...text.matchAll(/["']([^"']+)["']/gu)].map((match) => match[1]);
}

export function parseCanonicalWeaponIds(source) {
  const match = source.match(/WEAPON_IDS\s*=\s*Object\.freeze\(\s*\[([\s\S]*?)\]\s*as const\s*\)/u);
  if (!match) return null;
  return parseQuotedValues(match[1]);
}

export function parseWeaponMigrationMap(source) {
  const match = source.match(/WEAPON_SELECTION_MIGRATION\s*=\s*Object\.freeze\(\s*\{([\s\S]*?)\}\s*as const(?:\s+satisfies[^)]*)?\s*\)/u);
  if (!match) return null;
  const migration = {};
  for (const pair of match[1].matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*:\s*["']([^"']+)["']/gu)) {
    migration[pair[1]] = pair[2];
  }
  return migration;
}

function equalArrays(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function scanRetiredRosterCopy(root, registry) {
  const roster = registry.activeRoster;
  const findings = [];
  const errors = [];
  const files = collectMatchingFiles(root, roster.copyScanPathPatterns);
  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    const text = fs.readFileSync(absolutePath, "utf8");
    for (const segment of segmentsForFile(relativePath, text)) {
      for (const retiredId of roster.retiredIds) {
        for (const match of segment.text.matchAll(aliasPattern(retiredId))) {
          const offset = segment.offset + (match.index ?? 0) + match[1].length;
          const allowance = allowedRosterOccurrence(relativePath, retiredId, roster);
          const finding = {
            relativePath,
            line: lineNumber(text, offset),
            retiredId,
            classification: allowance?.classification ?? "unallowlisted",
            allowlistId: allowance?.allowlistId ?? null,
          };
          findings.push(finding);
          if (!allowance) {
            errors.push(`${relativePath}:${finding.line} contains retired active-roster ID "${retiredId}" outside an exact migration/history allowance`);
          }
        }
      }
    }
  }
  return { errors, findings, scannedFiles: files.length };
}

export function runActiveRosterCheck({ root = process.cwd(), registryPath = DEFAULT_REGISTRY_PATH } = {}) {
  const registry = loadRegistry(root, registryPath);
  const validationErrors = validateRegistry(registry);
  if (validationErrors.length > 0) return { ok: false, errors: validationErrors, findings: [], scannedFiles: 0, registry };
  const roster = registry.activeRoster;
  const sourcePath = path.join(root, roster.sourceOfTruth);
  const errors = [];
  if (!equalArrays(roster.canonicalIds, REQUIRED_CANONICAL_IDS)) {
    errors.push(`registry active roster must be [${REQUIRED_CANONICAL_IDS.join(", ")}]`);
  }
  if (!equalArrays(roster.retiredIds, REQUIRED_RETIRED_IDS)) {
    errors.push(`registry retired roster IDs must be [${REQUIRED_RETIRED_IDS.join(", ")}]`);
  }
  if (JSON.stringify(roster.migrationMap) !== JSON.stringify(REQUIRED_MIGRATION_MAP)) {
    errors.push(`registry migration map must be ${JSON.stringify(REQUIRED_MIGRATION_MAP)}`);
  }
  if (!fs.existsSync(sourcePath)) {
    errors.push(`active roster source of truth is missing: ${roster.sourceOfTruth}`);
    return { ok: false, errors, findings: [], scannedFiles: 0, registry };
  }
  const source = fs.readFileSync(sourcePath, "utf8");
  const actualIds = parseCanonicalWeaponIds(source);
  if (!actualIds) {
    errors.push(`unable to parse ${roster.sourceOfTruth}.${roster.sourceExpression}`);
  } else if (!equalArrays(actualIds, roster.canonicalIds)) {
    errors.push(`active roster order/IDs differ: expected [${roster.canonicalIds.join(", ")}], found [${actualIds.join(", ")}]`);
  }
  const actualMigration = parseWeaponMigrationMap(source);
  if (!actualMigration) {
    errors.push(`unable to parse active roster migration map in ${roster.sourceOfTruth}`);
  } else if (JSON.stringify(actualMigration) !== JSON.stringify(roster.migrationMap)) {
    errors.push(`active roster migration map differs from registry: expected ${JSON.stringify(roster.migrationMap)}, found ${JSON.stringify(actualMigration)}`);
  }
  const scanResult = scanRetiredRosterCopy(root, registry);
  errors.push(...scanResult.errors);
  return {
    ok: errors.length === 0,
    errors,
    findings: scanResult.findings,
    scannedFiles: scanResult.scannedFiles,
    actualIds,
    actualMigration,
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
      console.log("Usage: node scripts/check-active-roster.mjs [--root <repo>] [--registry <path>]");
      return;
    }
    const result = runActiveRosterCheck(options);
    if (!result.ok) {
      console.error(["active roster check failed:", ...result.errors.map((error) => `- ${error}`)].join("\n"));
      process.exitCode = 1;
      return;
    }
    const allowlisted = result.findings.filter((finding) => finding.classification !== "unallowlisted").length;
    console.log(`active roster check passed (${result.actualIds.join(", ")}, ${result.scannedFiles} files scanned, ${allowlisted} allowlisted retired-ID occurrences)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === thisFile) main();
