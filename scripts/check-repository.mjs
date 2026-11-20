// Repository-shape checks run by check:docs (and so check:quick and CI's static.check-docs task):
// docs/REPOSITORY_MAP.md names every tracked top-level entry, nothing its "Not tracked" table lists
// (build output, caches, generated evidence) is tracked, and tracked files in the document and
// evidence folders stay under a size cap unless config/size-caps.json gives them their own ceiling.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const REPOSITORY_MAP_PATH = "docs/REPOSITORY_MAP.md";
export const SIZE_CAPS_PATH = "config/size-caps.json";

export function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 })
    .split("\0")
    .filter(Boolean);
}

/** Top-level entries as the map names them: folders end in "/", files do not. */
export function trackedTopLevelEntries(files) {
  return [...new Set(files.map((file) => (file.includes("/") ? `${file.split("/")[0]}/` : file)))].sort();
}

/** The first-column code spans of the Folders and Files tables. */
export function mappedEntries(markdown) {
  const entries = [];
  let inTable = false;
  for (const line of markdown.replaceAll("\r\n", "\n").split("\n")) {
    if (/^## (?:Folders|Files)\s*$/u.test(line)) inTable = true;
    else if (line.startsWith("## ")) inTable = false;
    else if (inTable) {
      const match = /^\|\s*`([^`]+)`\s*\|/u.exec(line);
      if (match !== null) entries.push(match[1]);
    }
  }
  return entries.sort();
}

/** Every code span in the first column of the "Not tracked" table: generated folders that must stay out of git. */
export function untrackedEntries(markdown) {
  const entries = [];
  let inTable = false;
  for (const line of markdown.replaceAll("\r\n", "\n").split("\n")) {
    if (/^## Not tracked\s*$/u.test(line)) inTable = true;
    else if (line.startsWith("## ")) inTable = false;
    else if (inTable && line.startsWith("|")) {
      const firstCell = line.split("|")[1] ?? "";
      for (const match of firstCell.matchAll(/`([^`]+)`/gu)) entries.push(match[1]);
    }
  }
  return entries.sort();
}

/** Tracked top-level entries that the map says are generated and never committed. */
export function trackedGeneratedEntries(markdown, files) {
  const generated = new Set(untrackedEntries(markdown));
  return trackedTopLevelEntries(files).filter((entry) => generated.has(entry));
}

export function checkRepositoryMap(root, files = trackedFiles(root)) {
  const mapPath = path.join(root, REPOSITORY_MAP_PATH);
  if (!fs.existsSync(mapPath)) return { errors: [`${REPOSITORY_MAP_PATH} is missing`] };
  const markdown = fs.readFileSync(mapPath, "utf8");
  const mapped = mappedEntries(markdown);
  const present = trackedTopLevelEntries(files);
  const mappedSet = new Set(mapped);
  const presentSet = new Set(present);
  const errors = [
    ...present
      .filter((entry) => !mappedSet.has(entry))
      .map((entry) => `${REPOSITORY_MAP_PATH} does not describe tracked top-level entry ${entry}`),
    ...mapped
      .filter((entry) => !presentSet.has(entry))
      .map((entry) => `${REPOSITORY_MAP_PATH} describes ${entry}, which is not tracked`),
  ];
  const duplicates = mapped.filter((entry, index) => mapped.indexOf(entry) !== index);
  for (const entry of new Set(duplicates)) errors.push(`${REPOSITORY_MAP_PATH} lists ${entry} twice`);
  for (const entry of trackedGeneratedEntries(markdown, files))
    errors.push(
      `${entry} is tracked, but ${REPOSITORY_MAP_PATH} lists it under "Not tracked": generated output is never committed`,
    );
  return { errors, entries: present.length };
}

function readSizeCaps(root) {
  return JSON.parse(fs.readFileSync(path.join(root, SIZE_CAPS_PATH), "utf8"));
}

export function checkSizeCaps(
  root,
  files = trackedFiles(root),
  sizeOf = (file) => fs.statSync(path.join(root, file)).size,
) {
  const caps = readSizeCaps(root);
  const allowed = new Map(caps.allow.map((entry) => [entry.path, entry]));
  const errors = [];
  for (const file of files) {
    if (!caps.folders.some((folder) => file.startsWith(folder))) continue;
    const size = sizeOf(file);
    const exception = allowed.get(file);
    const limit = exception?.maxBytes ?? caps.maxBytes;
    if (size > limit)
      errors.push(
        exception === undefined
          ? `${file} is ${String(size)} bytes, over the ${String(caps.maxBytes)}-byte cap for tracked documents and evidence; keep large generated output in artifacts/ with a small tracked digest, or add a reviewed entry to ${SIZE_CAPS_PATH}`
          : `${file} is ${String(size)} bytes, over its ${String(limit)}-byte ceiling in ${SIZE_CAPS_PATH}`,
      );
  }
  for (const entry of caps.allow)
    if (!files.includes(entry.path)) errors.push(`${SIZE_CAPS_PATH} allows ${entry.path}, which is not tracked`);
  return { errors };
}

export function checkRepository(root) {
  const files = trackedFiles(root);
  return { errors: [...checkRepositoryMap(root, files).errors, ...checkSizeCaps(root, files).errors] };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { errors } = checkRepository(root);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("repository map, generated folders and size caps hold");
}
