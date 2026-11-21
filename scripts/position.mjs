// Where each workstream stands. The curated source is one file per area, config/position/<area>.json,
// plus config/position/index.json (the order of the areas) and config/position/production.json (the
// deployed build). `pnpm position:render` writes one page per source file: docs/position/<area>.md,
// docs/position/production.md and the index docs/position/README.md.
// `pnpm check:docs` calls checkPosition(), so a stale or hand-edited page fails check:quick and CI's
// static.check-docs task.
//
// A pull request that changes one area edits that area's source file and its page and nothing else, so
// two pull requests in different areas never touch the same file. The index names each area and links to
// its page; it changes only when an area is added, removed or renamed. A deploy changes production's two files.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const POSITION_SOURCE_DIRECTORY = "config/position";
export const POSITION_INDEX_SOURCE_PATH = `${POSITION_SOURCE_DIRECTORY}/index.json`;
export const POSITION_PRODUCTION_SOURCE_PATH = `${POSITION_SOURCE_DIRECTORY}/production.json`;
export const POSITION_DOCUMENT_DIRECTORY = "docs/position";
export const POSITION_PRODUCTION_DOCUMENT_PATH = `${POSITION_DOCUMENT_DIRECTORY}/production.md`;
export const POSITION_INDEX_DOCUMENT_PATH = `${POSITION_DOCUMENT_DIRECTORY}/README.md`;

const INDEX_FIELDS = Object.freeze(["schema", "about", "areas"]);
const PRODUCTION_FIELDS = Object.freeze(["site", "commit", "since", "note"]);
const AREA_FIELDS = Object.freeze(["id", "name", "state", "summary", "next", "owner_action", "evidence"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const AREA_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const EVIDENCE_URL = /^https:\/\/github\.com\/shaku1z\/tear\/(?:pull|issues)\/\d+$/u;
const RESERVED_AREA_IDS = Object.freeze(["index", "production", "readme"]);

export function areaSourcePath(id) {
  return `${POSITION_SOURCE_DIRECTORY}/${id}.json`;
}

export function areaDocumentPath(id) {
  return `${POSITION_DOCUMENT_DIRECTORY}/${id}.md`;
}

/** The files a change to one area's state touches: its source and its page. */
export function areaFiles(id) {
  return [areaSourcePath(id), areaDocumentPath(id)];
}

function isText(value) {
  return typeof value === "string" && value.trim() === value && !/[\r\n|]/u.test(value);
}

function validateArea(area, root) {
  if (area === null || typeof area !== "object" || Array.isArray(area)) return ["must be an object"];
  const errors = [];
  const extra = Object.keys(area).filter((key) => !AREA_FIELDS.includes(key));
  if (extra.length > 0) errors.push(`has unknown fields: ${extra.join(", ")}`);
  if (!AREA_ID.test(String(area.id))) errors.push("id must be kebab-case");
  for (const field of ["name", "state", "summary", "next"]) {
    if (!isText(area[field]) || area[field].length === 0)
      errors.push(`${field} must be one line of non-empty text without "|"`);
  }
  if (!isText(area.owner_action)) errors.push("owner_action must be one line of text (may be empty)");
  if (!Array.isArray(area.evidence) || area.evidence.length === 0) {
    errors.push("evidence must list at least one path or pull request link");
    return errors;
  }
  for (const entry of area.evidence) {
    if (typeof entry !== "string") errors.push("evidence entries must be strings");
    else if (EVIDENCE_URL.test(entry)) continue;
    else if (path.isAbsolute(entry) || entry.includes("..") || entry.includes("\\"))
      errors.push(`evidence "${entry}" must be a repository-relative path with forward slashes`);
    else if (!fs.existsSync(path.join(root, entry))) errors.push(`evidence "${entry}" does not exist`);
  }
  return errors;
}

function validateIndex(index) {
  if (index === null || typeof index !== "object" || Array.isArray(index)) return ["must be a JSON object"];
  const errors = [];
  const extra = Object.keys(index).filter((key) => !INDEX_FIELDS.includes(key));
  if (extra.length > 0) errors.push(`has unknown fields: ${extra.join(", ")}`);
  if (index.schema !== 2) errors.push("schema must be 2");
  if (!isText(index.about)) errors.push("about must be one line of text");
  if (!Array.isArray(index.areas) || index.areas.length === 0) errors.push("areas must be a non-empty list of ids");
  else {
    const seen = new Set();
    for (const id of index.areas) {
      if (!AREA_ID.test(String(id)) || RESERVED_AREA_IDS.includes(id))
        errors.push(`areas entry "${String(id)}" must be a kebab-case id other than ${RESERVED_AREA_IDS.join(", ")}`);
      else if (seen.has(id)) errors.push(`areas lists "${id}" twice`);
      else seen.add(id);
    }
  }
  return errors;
}

function validateProduction(production) {
  if (production === null || typeof production !== "object" || Array.isArray(production))
    return ["must be a JSON object"];
  const errors = [];
  const extra = Object.keys(production).filter((key) => !PRODUCTION_FIELDS.includes(key));
  if (extra.length > 0) errors.push(`has unknown fields: ${extra.join(", ")}`);
  if (!/^[0-9a-f]{40}$/u.test(String(production.commit))) errors.push("commit must be a full SHA");
  if (!ISO_DATE.test(String(production.since))) errors.push("since must be an ISO date");
  if (!isText(production.site) || !isText(production.note)) errors.push("site and note must be one line of text");
  return errors;
}

/** The whole position, validated: the index, production and every area the index lists, in its order. */
export function validatePosition(position, root) {
  const errors = [
    ...validateIndex(position?.index).map((error) => `${POSITION_INDEX_SOURCE_PATH}: ${error}`),
    ...validateProduction(position?.production).map((error) => `${POSITION_PRODUCTION_SOURCE_PATH}: ${error}`),
  ];
  if (errors.length > 0) return errors;
  for (const id of position.index.areas) {
    const area = position.areas.find((entry) => entry?.id === id);
    if (area === undefined) errors.push(`${areaSourcePath(id)} is missing or its id is not "${id}"`);
    else errors.push(...validateArea(area, root).map((error) => `${areaSourcePath(id)}: ${error}`));
  }
  return errors;
}

function readJson(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return { errors: [`${relativePath} is missing`] };
  try {
    return { value: JSON.parse(fs.readFileSync(absolutePath, "utf8")), errors: [] };
  } catch (error) {
    return { errors: [`${relativePath} is invalid JSON: ${error.message}`] };
  }
}

function listNames(root, directory, extension) {
  const absolutePath = path.join(root, directory);
  if (!fs.existsSync(absolutePath)) return [];
  return fs
    .readdirSync(absolutePath)
    .filter((name) => name.endsWith(extension))
    .map((name) => name.slice(0, -extension.length))
    .sort();
}

/** Reads the index, production and one file per listed area. An area file the index does not list is an error. */
export function readPosition(root) {
  const index = readJson(root, POSITION_INDEX_SOURCE_PATH);
  if (index.errors.length > 0) return { errors: index.errors };
  const production = readJson(root, POSITION_PRODUCTION_SOURCE_PATH);
  const listed = Array.isArray(index.value?.areas) ? index.value.areas.map(String) : [];
  const errors = [...production.errors];
  const areas = [];
  for (const id of listed) {
    const area = readJson(root, areaSourcePath(id));
    errors.push(...area.errors);
    if (area.errors.length === 0) areas.push(area.value);
  }
  for (const name of listNames(root, POSITION_SOURCE_DIRECTORY, ".json"))
    if (name !== "index" && name !== "production" && !listed.includes(name))
      errors.push(`${areaSourcePath(name)} is not listed in ${POSITION_INDEX_SOURCE_PATH}`);
  return { position: { index: index.value, production: production.value, areas }, errors };
}

function evidenceLink(entry) {
  if (EVIDENCE_URL.test(entry)) return `[#${entry.split("/").at(-1)}](${entry})`;
  return `[${entry}](${path.posix.relative(POSITION_DOCUMENT_DIRECTORY, entry) || "."})`;
}

function generatedNote(sourcePath) {
  return [
    `<!-- Generated from ${sourcePath} by \`pnpm position:render\`. Do not edit this file by hand: -->`,
    "<!-- pnpm check:docs fails when it differs from the render. -->",
  ];
}

export function renderArea(area) {
  const lines = [
    `# ${area.name}`,
    "",
    ...generatedNote(areaSourcePath(area.id)),
    "",
    `**${area.state}.** ${area.summary}`,
    "",
    `- Next: ${area.next}`,
    `- Owner action: ${area.owner_action === "" ? "none" : area.owner_action}`,
    `- Evidence: ${area.evidence.map(evidenceLink).join(", ")}`,
    "",
    "[All areas](README.md)",
  ];
  return `${lines.join("\n")}\n`;
}

export function renderProduction(production) {
  const lines = [
    "# Production",
    "",
    ...generatedNote(POSITION_PRODUCTION_SOURCE_PATH),
    "",
    `${production.site} runs \`${production.commit.slice(0, 8)}\` (deployed ${production.since}). ${production.note}`,
    "",
    "[All areas](README.md)",
  ];
  return `${lines.join("\n")}\n`;
}

/** The index names the areas and links to their pages. It holds nothing that changes when an area's state does. */
export function renderIndex(position) {
  const lines = [
    "# Tear position",
    "",
    ...generatedNote(POSITION_INDEX_SOURCE_PATH),
    "",
    "Where each workstream stands: one page per area. To change an area, edit",
    `\`${POSITION_SOURCE_DIRECTORY}/<area>.json\` in the pull request that changes it, then run \`pnpm position:render\`.`,
    "That touches the area's own two files only, so pull requests in different areas do not conflict.",
    "",
    "The build players have: [Production](production.md).",
    "",
    "## Areas",
    "",
    ...position.areas.map((area) => `- [${area.name}](${area.id}.md)`),
  ];
  return `${lines.join("\n")}\n`;
}

/** Every generated page, by repository path. */
export function renderPosition(position) {
  const pages = new Map([
    [POSITION_INDEX_DOCUMENT_PATH, renderIndex(position)],
    [POSITION_PRODUCTION_DOCUMENT_PATH, renderProduction(position.production)],
  ]);
  for (const area of position.areas) pages.set(areaDocumentPath(area.id), renderArea(area));
  return pages;
}

function loadValid(root) {
  const { position, errors } = readPosition(root);
  if (errors.length > 0) return { errors };
  const invalid = validatePosition(position, root);
  return invalid.length > 0 ? { errors: invalid } : { position, errors: [] };
}

export function checkPosition(root) {
  const { position, errors } = loadValid(root);
  if (errors.length > 0) return { errors };
  const pages = renderPosition(position);
  const stale = [];
  for (const [relativePath, expected] of pages) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) stale.push(`${relativePath} is missing; run pnpm position:render`);
    else if (fs.readFileSync(absolutePath, "utf8").replaceAll("\r\n", "\n") !== expected)
      stale.push(
        `${relativePath} is stale or was edited by hand; change its source under ${POSITION_SOURCE_DIRECTORY}/ and run pnpm position:render`,
      );
  }
  for (const name of listNames(root, POSITION_DOCUMENT_DIRECTORY, ".md")) {
    const relativePath = `${POSITION_DOCUMENT_DIRECTORY}/${name}.md`;
    if (!pages.has(relativePath)) stale.push(`${relativePath} has no source area; run pnpm position:render`);
  }
  return stale.length > 0 ? { errors: stale } : { errors: [], areas: position.areas.length };
}

/** Writes every page and removes pages whose area is gone. Returns the paths it changed. */
export function writePosition(root, position) {
  const pages = renderPosition(position);
  const changed = [];
  fs.mkdirSync(path.join(root, POSITION_DOCUMENT_DIRECTORY), { recursive: true });
  for (const [relativePath, content] of pages) {
    const absolutePath = path.join(root, relativePath);
    const current = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8").replaceAll("\r\n", "\n") : null;
    if (current === content) continue;
    fs.writeFileSync(absolutePath, content, "utf8");
    changed.push(relativePath);
  }
  for (const name of listNames(root, POSITION_DOCUMENT_DIRECTORY, ".md")) {
    const relativePath = `${POSITION_DOCUMENT_DIRECTORY}/${name}.md`;
    if (pages.has(relativePath)) continue;
    fs.rmSync(path.join(root, relativePath));
    changed.push(relativePath);
  }
  return changed.sort();
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const command = process.argv[2];
  if (command === "render") {
    const { position, errors } = loadValid(root);
    if (errors.length > 0) {
      console.error(["position source is invalid:", ...errors.map((error) => `- ${error}`)].join("\n"));
      process.exitCode = 1;
      return;
    }
    const changed = writePosition(root, position);
    console.log(
      `rendered ${POSITION_DOCUMENT_DIRECTORY}/ (${String(position.areas.length)} areas, ${String(changed.length)} page(s) changed)`,
    );
  } else if (command === "check") {
    const result = checkPosition(root);
    if (result.errors.length > 0) {
      console.error(result.errors.join("\n"));
      process.exitCode = 1;
      return;
    }
    console.log(`${POSITION_DOCUMENT_DIRECTORY}/ is current (${String(result.areas)} areas)`);
  } else {
    console.error("Usage: node scripts/position.mjs <render|check>");
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
