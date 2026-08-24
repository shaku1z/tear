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
const SCOPED_MARKDOWN_ROOTS = Object.freeze(["docs/", "plans/", "tear-wiki/"]);
const INDEX_PATH = "docs/README.md";
const PLANS_INDEX_PATH = "plans/README.md";

export const ACTIVE_PLAN_METADATA_PATHS = Object.freeze([
  "plans/CONTROLLER_QA.md",
  "plans/FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md",
  "plans/PARITY_RESTORATION_PLAN.md",
  "plans/TEARBENCH_C40_EXECUTION_GUIDE.md",
  "plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md",
  "plans/TEARBENCH_MASTER_HANDOFF.md",
  "plans/active/ECONOMY_REWORK_PLAN.md",
]);

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

function maskMarkdownCode(markdown) {
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
  return masked.join("").replace(/(`+)([^\r\n]*?)\1/gu, (match) => match.replace(/[^\r\n]/gu, " "));
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

function metadataValue(markdown, label) {
  const pattern = new RegExp(`^[ \\t]*-[ \\t]*\\*\\*${label}:\\*\\*[ \\t]*([^\\r\\n]+?)[ \\t]*$`, "imu");
  return markdown.match(pattern)?.[1]?.trim() ?? "";
}

export function checkActivePlanMetadata(root, activePlanPaths = ACTIVE_PLAN_METADATA_PATHS) {
  const errors = [];
  for (const relativePath of activePlanPaths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`active plan is missing: ${relativePath}`);
      continue;
    }
    const markdown = fs.readFileSync(absolutePath, "utf8");
    const owner = metadataValue(markdown, "Owner");
    const status = metadataValue(markdown, "Status");
    const closureCondition = metadataValue(markdown, "Closure condition");
    if (owner === "") errors.push(`${relativePath} must have nonempty Owner metadata`);
    if (status !== "Active") errors.push(`${relativePath} must have Status: Active metadata`);
    if (closureCondition === "") errors.push(`${relativePath} must have nonempty Closure condition metadata`);
  }
  return { errors, activePlanPaths: [...activePlanPaths] };
}

export function checkPlansAuthorityIndex(root, activePlanPaths = ACTIVE_PLAN_METADATA_PATHS) {
  const errors = [];
  const absolutePath = path.join(root, PLANS_INDEX_PATH);
  if (!fs.existsSync(absolutePath)) return { errors: [`authority index is missing: ${PLANS_INDEX_PATH}`] };
  const markdown = fs.readFileSync(absolutePath, "utf8");
  if (!/\|\s*File\s*\|\s*Classification\s*\|\s*Owner\s*\|\s*Status\s*\|\s*Closure condition\s*\|\s*Role\s*\|/iu.test(markdown)) {
    errors.push(`${PLANS_INDEX_PATH} must expose File, Classification, Owner, Status, Closure condition, and Role columns`);
  }
  for (const relativePath of activePlanPaths) {
    const linkPath = relativePath.slice("plans/".length);
    const fileName = path.posix.basename(relativePath);
    const expectedLink = `[${fileName}](${linkPath})`;
    if (!markdown.includes(expectedLink)) errors.push(`${PLANS_INDEX_PATH} must list active plan ${relativePath}`);
  }
  return { errors };
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
  const activePlans = checkActivePlanMetadata(absoluteRoot);
  const plansIndex = checkPlansAuthorityIndex(absoluteRoot);
  const errors = [...links.errors, ...policy.errors, ...artifacts.errors, ...activePlans.errors, ...plansIndex.errors];
  return {
    ok: errors.length === 0,
    errors,
    trackedMarkdownFiles: trackedFiles.length,
    rootMarkdownFiles: policy.rootFiles.length,
    localLinks: links.links.length,
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
