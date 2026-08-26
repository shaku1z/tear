import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_MARKDOWN_CLASSIFICATIONS = Object.freeze({
  "CONTRIBUTING.md": "current authority",
  "CRAZYGAMES.md": "current authority",
  "DEPLOYMENT.md": "current authority",
});

const ROOT_CLASSIFICATION_HEADING = "## Root Markdown classification";
const CURRENT_AUTHORITIES_HEADING = "## Current authorities";
const SCOPED_MARKDOWN_ROOTS = Object.freeze(["docs/", "plans/", "tear-wiki/"]);
const INDEX_PATH = "docs/README.md";
const PLANS_INDEX_PATH = "plans/README.md";

export const CANONICAL_ACTIVE_PLAN_PATHS = Object.freeze([
  "plans/CONTROLLER_QA.md",
  "plans/FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md",
  "plans/PARITY_RESTORATION_PLAN.md",
  "plans/TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md",
  "plans/TEARBENCH_C40_EXECUTION_GUIDE.md",
  "plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md",
  "plans/TEARBENCH_MASTER_HANDOFF.md",
  "plans/active/ECONOMY_REWORK_PLAN.md",
]);

// Compatibility export for callers that need the canonical active-plan list.
// The checker derives the active set from plans/README.md and compares it to
// this allowlist; it does not use this list as the source of active rows.
export const ACTIVE_PLAN_METADATA_PATHS = CANONICAL_ACTIVE_PLAN_PATHS;

const PATH_BOUND_TEARBENCH_ARTIFACTS = Object.freeze([
  "docs/source/TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN.v0.6.md",
  "plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md",
  "docs/tearbench-ghost3-requirements.json",
  "docs/TEARBENCH_GHOST3_NON_LOSSY_REQUIREMENTS_ANNEX.md",
  "docs/tearbench-ghost3-evidence-catalog.json",
  "docs/TEARBENCH_GHOST3_CAPABILITY_DASHBOARD.md",
  "docs/tearbench-c40-weapon-roster-evidence-index.json",
  "docs/TEARBENCH_C40_WEAPON_ROSTER_EVIDENCE_INDEX.md",
  "src/tearbench/canonical-scenarios.json",
  "src/tearbench/evidence-routes.json",
]);

function normalizeRepoPath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//u, "");
}

function runGit(root, argumentsList) {
  const result = spawnSync("git", ["-C", root, ...argumentsList], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`could not enumerate tracked Markdown files: ${(result.stderr || result.stdout || "git failed").trim()}`);
  }
  return result.stdout;
}

function isScopedMarkdownPath(relativePath) {
  return /^[^/]+\.md$/u.test(relativePath) || SCOPED_MARKDOWN_ROOTS.some((prefix) => relativePath.startsWith(prefix));
}

export function collectTrackedMarkdownFiles(root) {
  const output = runGit(root, ["ls-files", "-z", "--cached", "--", "*.md"]);
  return output.split("\0")
    .filter(Boolean)
    .map(normalizeRepoPath)
    .filter(isScopedMarkdownPath)
    .sort();
}

function maskMarkdownFencedCode(markdown) {
  const lines = markdown.split(/(\r?\n)/u);
  let fenced = false;
  const masked = [];
  for (const line of lines) {
    if (/^\s*(`{3,}|~{3,})/u.test(line)) {
      fenced = !fenced;
      masked.push(line.replace(/[^\r\n]/gu, " "));
    } else if (fenced) {
      masked.push(line.replace(/[^\r\n]/gu, " "));
    } else {
      masked.push(line);
    }
  }
  return masked.join("");
}

function maskMarkdownCode(markdown) {
  return maskMarkdownFencedCode(markdown).replace(/(`+)([^\r\n]*?)\1/gu, (match) => match.replace(/[^\r\n]/gu, " "));
}

function stripDestination(destination) {
  const trimmed = destination.trim();
  return trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;
}

function isExternalDestination(destination) {
  return /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/u.test(destination);
}

function destinationWithoutFragment(destination) {
  const marker = destination.search(/[?#]/u);
  return marker === -1 ? destination : destination.slice(0, marker);
}

export function parseMarkdownLinks(markdown) {
  const maskedMarkdown = maskMarkdownCode(markdown);
  const links = [];
  const pattern = /(!?)\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/gu;
  for (const match of maskedMarkdown.matchAll(pattern)) {
    if (match[1] === "!") continue;
    const rawDestination = stripDestination(match[2]);
    if (rawDestination === "" || rawDestination.startsWith("#") || isExternalDestination(rawDestination)) continue;
    const destination = destinationWithoutFragment(rawDestination);
    if (destination === "") continue;
    links.push({ destination, offset: match.index ?? 0 });
  }
  return links;
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split(/\r?\n/u).length;
}

function isAbsoluteLocalPath(destination) {
  return path.posix.isAbsolute(destination)
    || /^[A-Za-z]:[\\/]/u.test(destination)
    || destination.startsWith("\\\\");
}

export function resolveLocalLink(root, sourceRelativePath, destination) {
  const normalizedDestination = destination.replaceAll("\\", "/");
  if (isAbsoluteLocalPath(normalizedDestination)) {
    return { ok: false, error: `${sourceRelativePath} uses an absolute local link: ${destination}` };
  }
  let decodedDestination;
  try {
    decodedDestination = decodeURIComponent(normalizedDestination).replaceAll("\\", "/");
  } catch {
    return { ok: false, error: `${sourceRelativePath} uses an invalid URI-encoded local link: ${destination}` };
  }
  if (isAbsoluteLocalPath(decodedDestination)) {
    return { ok: false, error: `${sourceRelativePath} uses an absolute local link: ${destination}` };
  }
  if (decodedDestination.includes("\0")) {
    return { ok: false, error: `${sourceRelativePath} uses a NUL-containing local link: ${destination}` };
  }
  const repositoryRoot = path.resolve(root);
  const sourceDirectory = path.dirname(path.join(repositoryRoot, sourceRelativePath));
  const target = path.resolve(sourceDirectory, decodedDestination);
  const rootPrefix = `${repositoryRoot}${path.sep}`;
  if (target !== repositoryRoot && !target.startsWith(rootPrefix)) {
    return { ok: false, error: `${sourceRelativePath} escapes the repository root: ${destination}` };
  }
  if (!fs.existsSync(target)) {
    return { ok: false, error: `${sourceRelativePath} points to a missing local path: ${destination}` };
  }
  try {
    const realRoot = fs.realpathSync(repositoryRoot);
    const realTarget = fs.realpathSync(target);
    const realPrefix = `${realRoot}${path.sep}`;
    if (realTarget !== realRoot && !realTarget.startsWith(realPrefix)) {
      return { ok: false, error: `${sourceRelativePath} resolves outside the repository through a link: ${destination}` };
    }
  } catch (error) {
    return { ok: false, error: `${sourceRelativePath} local link cannot be inspected: ${destination} (${error.message})` };
  }
  return { ok: true, target };
}

export function checkLocalLinks(root, files = collectTrackedMarkdownFiles(root)) {
  const errors = [];
  const links = [];
  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`tracked Markdown file is missing from the worktree: ${relativePath}`);
      continue;
    }
    const markdown = fs.readFileSync(absolutePath, "utf8");
    for (const link of parseMarkdownLinks(markdown)) {
      const result = resolveLocalLink(root, relativePath, link.destination);
      links.push({ relativePath, destination: link.destination, line: lineNumber(markdown, link.offset) });
      if (!result.ok) errors.push(`${result.error} (line ${lineNumber(markdown, link.offset)})`);
    }
  }
  return { errors, links };
}

function metadataEntries(markdown, label) {
  const maskedMarkdown = maskMarkdownFencedCode(markdown);
  const pattern = new RegExp(`^[ \\t]*-[ \\t]*\\*\\*${label}:\\*\\*[ \\t]*([^\\r\\n]*)[ \\t]*$`, "gmu");
  return [...maskedMarkdown.matchAll(pattern)].map((match) => match[1].trim());
}

function planSection(indexText, heading) {
  const start = indexText.indexOf(heading);
  if (start === -1) return "";
  const rest = indexText.slice(start + heading.length);
  const nextHeading = rest.search(/^##\s+/mu);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function parsePlanTableRows(section) {
  const rows = [];
  for (const line of section.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
    if (cells.length === 0 || cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) continue;
    rows.push(cells);
  }
  return rows;
}

function parsePlanLink(cell) {
  const match = cell.match(/^\[[^\]]+\]\(([^)]+)\)$/u);
  if (!match) return null;
  const rawDestination = stripDestination(match[1]);
  if (rawDestination === "" || rawDestination.startsWith("#") || isExternalDestination(rawDestination)) return null;
  const destination = destinationWithoutFragment(rawDestination).replaceAll("\\", "/");
  if (isAbsoluteLocalPath(destination) || destination.startsWith("../") || destination === "..") return null;
  const normalized = normalizeRepoPath(path.posix.normalize(path.posix.join("plans", destination)));
  if (!normalized.startsWith("plans/") || !normalized.endsWith(".md")) return null;
  return normalized;
}

function nonemptyPlanCell(value) {
  return value !== undefined && value.trim() !== "" && value.trim() !== "—" && value.trim() !== "-";
}

function markdownLinkDestinations(markdown) {
  const pattern = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/gu;
  return [...markdown.matchAll(pattern)]
    .filter((match) => match[0].startsWith("!") === false)
    .map((match) => ({ destination: stripDestination(match[1]) }));
}

export function parseCurrentAuthoritiesTable(indexText) {
  const errors = [];
  const rows = [];
  const seenTopics = new Set();
  const seenPrimaryPaths = new Set();
  const maskedIndexText = maskMarkdownFencedCode(indexText);
  const section = planSection(maskedIndexText, CURRENT_AUTHORITIES_HEADING);
  if (section === "") return { errors: [`${INDEX_PATH} is missing the ${CURRENT_AUTHORITIES_HEADING} section`], rows };

  let headerSeen = false;
  for (const [rowIndex, cells] of parsePlanTableRows(section).entries()) {
    if (cells.length === 3 && cells[0].toLowerCase() === "topic" && cells[1].toLowerCase() === "primary authority") {
      if (headerSeen) errors.push(`${INDEX_PATH} current authorities table has duplicate headers`);
      headerSeen = true;
      continue;
    }
    if (cells.length !== 3) {
      errors.push(`${INDEX_PATH} current authorities row ${rowIndex + 1} must have Topic, Primary authority, and Supporting contract/evidence cells`);
      continue;
    }
    const topic = cells[0].trim();
    if (!nonemptyPlanCell(topic)) {
      errors.push(`${INDEX_PATH} current authorities row ${rowIndex + 1} has an empty topic`);
      continue;
    }
    const topicKey = topic.toLocaleLowerCase("en-US");
    if (seenTopics.has(topicKey)) errors.push(`${INDEX_PATH} current authorities has a duplicate topic: ${topic}`);
    else seenTopics.add(topicKey);

    const links = markdownLinkDestinations(cells[1]);
    const localLinks = links.filter(({ destination }) => {
      const normalized = destination.replaceAll("\\", "/");
      return normalized !== ""
        && !normalized.startsWith("#")
        && !isExternalDestination(normalized)
        && !isAbsoluteLocalPath(normalized);
    });
    let primaryDestination = localLinks.length === 1 ? destinationWithoutFragment(localLinks[0].destination).replaceAll("\\", "/") : "";
    if (links.length !== 1 || localLinks.length !== 1) {
      errors.push(`${INDEX_PATH} current authority topic ${topic} must have exactly one local Markdown primary link`);
    } else if (!primaryDestination.toLowerCase().endsWith(".md")) {
      errors.push(`${INDEX_PATH} current authority topic ${topic} primary link must target a Markdown document`);
      primaryDestination = "";
    }

    let primaryPath = "";
    if (primaryDestination !== "") {
      primaryPath = normalizeRepoPath(path.posix.normalize(path.posix.join("docs", primaryDestination)));
      if (seenPrimaryPaths.has(primaryPath)) errors.push(`${INDEX_PATH} current authorities reuses a primary authority path: ${primaryPath}`);
      else seenPrimaryPaths.add(primaryPath);
    }
    rows.push({ topic, primaryDestination, primaryPath, supporting: cells[2] });
  }
  if (!headerSeen) errors.push(`${INDEX_PATH} current authorities table must expose Topic, Primary authority, and Supporting contract/evidence columns`);
  return { errors, rows };
}

export function checkCurrentAuthorityTable(root) {
  const absolutePath = path.join(root, INDEX_PATH);
  if (!fs.existsSync(absolutePath)) return { errors: [`authority index is missing: ${INDEX_PATH}`], rows: [] };
  const parsed = parseCurrentAuthoritiesTable(fs.readFileSync(absolutePath, "utf8"));
  const errors = [...parsed.errors];
  for (const row of parsed.rows) {
    if (row.primaryDestination === "") continue;
    const result = resolveLocalLink(root, INDEX_PATH, row.primaryDestination);
    if (!result.ok) errors.push(result.error);
  }
  return { errors, rows: parsed.rows };
}

export function parsePlansAuthorityIndex(indexText) {
  const errors = [];
  const rows = [];
  const seenPaths = new Set();
  const maskedIndexText = maskMarkdownFencedCode(indexText);
  const classificationSectionText = planSection(maskedIndexText, "## Plan classification");
  const activeSectionText = planSection(maskedIndexText, "## Active plans");
  if (classificationSectionText === "") errors.push(`${PLANS_INDEX_PATH} is missing the ## Plan classification section`);
  if (activeSectionText === "") errors.push(`${PLANS_INDEX_PATH} is missing the ## Active plans section`);

  const parseRows = (section, sectionName, activeSection) => {
    const tableRows = parsePlanTableRows(section);
    for (const [rowIndex, cells] of tableRows.entries()) {
      const firstCell = cells[0] ?? "";
      if (/^(?:File|Document)$/iu.test(firstCell)) continue;
      const relativePath = parsePlanLink(firstCell);
      if (relativePath === null) {
        errors.push(`${PLANS_INDEX_PATH} has a malformed plan link in ${sectionName} row ${rowIndex + 1}`);
        continue;
      }
      const expectedCellCount = activeSection ? 5 : 6;
      if (cells.length !== expectedCellCount) {
        errors.push(`${PLANS_INDEX_PATH} ${sectionName} row for ${relativePath} must have ${expectedCellCount} cells`);
        continue;
      }
      if (seenPaths.has(relativePath)) {
        errors.push(`${PLANS_INDEX_PATH} lists a plan more than once: ${relativePath}`);
        continue;
      }
      seenPaths.add(relativePath);
      const owner = activeSection ? cells[1] : cells[2];
      const status = activeSection ? cells[2] : cells[3];
      const closureCondition = activeSection ? cells[3] : cells[4];
      if (activeSection || /^active plan(?:\s|$)/iu.test(cells[1] ?? "")) {
        if (!nonemptyPlanCell(owner)) errors.push(`${PLANS_INDEX_PATH} has empty Owner metadata for ${relativePath}`);
        if (!nonemptyPlanCell(status)) errors.push(`${PLANS_INDEX_PATH} has empty Status metadata for ${relativePath}`);
        if (!nonemptyPlanCell(closureCondition)) errors.push(`${PLANS_INDEX_PATH} has empty Closure condition metadata for ${relativePath}`);
      }
      rows.push({
        relativePath,
        classification: activeSection ? "active plan" : (cells[1] ?? "").trim().toLowerCase(),
        owner: owner.trim(),
        status: status.trim(),
        closureCondition: closureCondition.trim(),
        active: activeSection || /^active plan(?:\s|$)/iu.test(cells[1] ?? ""),
      });
    }
  };
  if (classificationSectionText !== "") parseRows(classificationSectionText, "classification", false);
  if (activeSectionText !== "") parseRows(activeSectionText, "active", true);
  return { errors, rows, activePlanPaths: rows.filter((row) => row.active).map((row) => row.relativePath) };
}

export function checkActivePlanMetadata(root, indexResult = undefined) {
  const index = indexResult ?? checkPlansAuthorityIndex(root);
  const errors = indexResult === undefined ? [...index.errors] : [];
  const activeRows = index.activeRows ?? index.rows?.filter((row) => row.active) ?? [];
  const activePlanPaths = activeRows.map((row) => row.relativePath);
  for (const row of activeRows) {
    const relativePath = row.relativePath;
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`active plan is missing: ${relativePath}`);
      continue;
    }
    const markdown = fs.readFileSync(absolutePath, "utf8");
    const metadata = {};
    for (const label of ["Owner", "Status", "Closure condition"]) {
      const values = metadataEntries(markdown, label);
      if (values.length === 0) errors.push(`${relativePath} is missing ${label} metadata`);
      if (values.length > 1) errors.push(`${relativePath} has duplicate ${label} metadata`);
      metadata[label] = values.length === 1 ? values[0] : "";
    }
    if (metadata.Owner === "") errors.push(`${relativePath} must have nonempty Owner metadata`);
    if (metadata.Status !== "Active") errors.push(`${relativePath} must have Status: Active metadata`);
    if (metadata["Closure condition"] === "") errors.push(`${relativePath} must have nonempty Closure condition metadata`);
    if (metadata.Owner !== row.owner) errors.push(`${relativePath} Owner metadata does not match ${PLANS_INDEX_PATH}`);
    if (metadata.Status !== row.status) errors.push(`${relativePath} Status metadata does not match ${PLANS_INDEX_PATH}`);
    if (metadata["Closure condition"] !== row.closureCondition) errors.push(`${relativePath} Closure condition metadata does not match ${PLANS_INDEX_PATH}`);
  }
  return { errors, activePlanPaths };
}

export function checkPlansAuthorityIndex(root) {
  const errors = [];
  const absolutePath = path.join(root, PLANS_INDEX_PATH);
  if (!fs.existsSync(absolutePath)) return { errors: [`authority index is missing: ${PLANS_INDEX_PATH}`], rows: [], activeRows: [], activePlanPaths: [] };
  const markdown = fs.readFileSync(absolutePath, "utf8");
  if (!/\|\s*File\s*\|\s*Classification\s*\|\s*Owner\s*\|\s*Status\s*\|\s*Closure condition\s*\|\s*Role\s*\|/iu.test(maskMarkdownCode(markdown))) {
    errors.push(`${PLANS_INDEX_PATH} must expose File, Classification, Owner, Status, Closure condition, and Role columns`);
  }
  const parsed = parsePlansAuthorityIndex(markdown);
  errors.push(...parsed.errors);
  const activeRows = parsed.rows.filter((row) => row.active);
  const actual = new Set(activeRows.map((row) => row.relativePath));
  const canonical = new Set(CANONICAL_ACTIVE_PLAN_PATHS);
  if (activeRows.length !== CANONICAL_ACTIVE_PLAN_PATHS.length || actual.size !== activeRows.length) {
    errors.push(`${PLANS_INDEX_PATH} active plan set must contain exactly the canonical active plans; update the canonical allowlist intentionally when it changes`);
  }
  for (const relativePath of CANONICAL_ACTIVE_PLAN_PATHS) {
    if (!actual.has(relativePath)) errors.push(`${PLANS_INDEX_PATH} must list canonical active plan ${relativePath}`);
  }
  for (const relativePath of actual) {
    if (!canonical.has(relativePath)) errors.push(`${PLANS_INDEX_PATH} contains an extra active plan; update the canonical allowlist intentionally: ${relativePath}`);
  }
  return { errors, rows: parsed.rows, activeRows, activePlanPaths: [...actual] };
}

function classificationSection(indexText) {
  const start = indexText.indexOf(ROOT_CLASSIFICATION_HEADING);
  if (start === -1) return "";
  const rest = indexText.slice(start + ROOT_CLASSIFICATION_HEADING.length);
  const nextHeading = rest.search(/^##\s+/mu);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function parseClassificationCell(cell) {
  const match = cell.trim().match(/^(current authority|active plan|completed plan|history)(?:\s*\([^)]*\))?$/iu);
  return match?.[1].toLowerCase() ?? null;
}

export function parseRootClassificationTable(indexText) {
  const rows = new Map();
  const errors = [];
  const section = classificationSection(indexText);
  if (section === "") return { rows, errors: [`${INDEX_PATH} is missing the ${ROOT_CLASSIFICATION_HEADING} section`] };
  const rowPattern = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/gmu;
  for (const match of section.matchAll(rowPattern)) {
    const file = match[1];
    const classification = parseClassificationCell(match[2]);
    if (rows.has(file)) errors.push(`${INDEX_PATH} classifies root Markdown more than once: ${file}`);
    else rows.set(file, classification);
    if (classification === null) errors.push(`${INDEX_PATH} has an unknown classification for ${file}: ${match[2].trim()}`);
  }
  return { rows, errors };
}

export function checkRootDocumentationPolicy(root, trackedFiles = collectTrackedMarkdownFiles(root)) {
  const errors = [];
  const expectedFiles = Object.keys(ROOT_MARKDOWN_CLASSIFICATIONS).sort();
  const rootFiles = trackedFiles.filter((relativePath) => /^[^/]+\.md$/u.test(relativePath)).sort();
  for (const file of rootFiles) if (!Object.hasOwn(ROOT_MARKDOWN_CLASSIFICATIONS, file)) errors.push(`unexpected tracked root Markdown file: ${file}`);
  for (const file of expectedFiles) if (!rootFiles.includes(file)) errors.push(`expected tracked root Markdown file is missing: ${file}`);
  const indexAbsolutePath = path.join(root, INDEX_PATH);
  if (!fs.existsSync(indexAbsolutePath)) {
    errors.push(`authority index is missing: ${INDEX_PATH}`);
    return { errors, rootFiles, rows: new Map() };
  }
  const parsed = parseRootClassificationTable(fs.readFileSync(indexAbsolutePath, "utf8"));
  errors.push(...parsed.errors);
  for (const [file, expectedClassification] of Object.entries(ROOT_MARKDOWN_CLASSIFICATIONS)) {
    const actualClassification = parsed.rows.get(file);
    if (actualClassification !== expectedClassification) {
      errors.push(`${INDEX_PATH} must classify ${file} as ${expectedClassification}; found ${actualClassification ?? "missing"}`);
    }
  }
  for (const file of parsed.rows.keys()) {
    if (!Object.hasOwn(ROOT_MARKDOWN_CLASSIFICATIONS, file)) errors.push(`${INDEX_PATH} classifies an unallowlisted root Markdown file: ${file}`);
  }
  return { errors, rootFiles, rows: parsed.rows };
}

export function checkPathBoundArtifacts(root) {
  const errors = [];
  for (const relativePath of PATH_BOUND_TEARBENCH_ARTIFACTS) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`path-bound TearBench artifact is missing: ${relativePath}`);
      continue;
    }
    try {
      if (!fs.statSync(absolutePath).isFile()) errors.push(`path-bound TearBench artifact is not a regular file: ${relativePath}`);
    } catch (error) {
      errors.push(`path-bound TearBench artifact cannot be inspected: ${relativePath} (${error.message})`);
    }
  }
  return { errors, artifacts: PATH_BOUND_TEARBENCH_ARTIFACTS };
}

export function runDocsCheck({ root = process.cwd() } = {}) {
  const absoluteRoot = path.resolve(root);
  const trackedFiles = collectTrackedMarkdownFiles(absoluteRoot);
  const links = checkLocalLinks(absoluteRoot, trackedFiles);
  const policy = checkRootDocumentationPolicy(absoluteRoot, trackedFiles);
  const artifacts = checkPathBoundArtifacts(absoluteRoot);
  const authorities = checkCurrentAuthorityTable(absoluteRoot);
  const plansIndex = checkPlansAuthorityIndex(absoluteRoot);
  const activePlans = checkActivePlanMetadata(absoluteRoot, plansIndex);
  const errors = [...links.errors, ...policy.errors, ...artifacts.errors, ...authorities.errors, ...activePlans.errors, ...plansIndex.errors];
  return {
    ok: errors.length === 0,
    errors,
    trackedMarkdownFiles: trackedFiles.length,
    rootMarkdownFiles: policy.rootFiles.length,
    localLinks: links.links.length,
    currentAuthorities: authorities.rows.length,
    pathBoundArtifacts: artifacts.artifacts.length,
    activePlans: activePlans.activePlanPaths.length,
  };
}

function parseCliArguments(argumentsList) {
  const options = { root: process.cwd() };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--root") options.root = path.resolve(argumentsList[++index]);
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/check-docs.mjs [--root <repo>]");
      return;
    }
    const result = runDocsCheck(options);
    if (!result.ok) {
      console.error(["documentation authority check failed:", ...result.errors.map((error) => `- ${error}`)].join("\n"));
      process.exitCode = 1;
      return;
    }
    console.log(`documentation authority check passed (${result.trackedMarkdownFiles} tracked Markdown files, ${result.localLinks} local links resolved, ${result.rootMarkdownFiles} root files classified, ${result.pathBoundArtifacts} path-bound TearBench artifacts present)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === thisFile) main();
