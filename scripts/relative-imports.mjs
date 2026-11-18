// The relative imports of a JavaScript or TypeScript file, read with one regular expression and no
// parser: static imports and re-exports, and dynamic `import("./x")`. Tools that follow imports
// cheaply use this (the asset-sheet fingerprints, the tool catalogue test). The architecture gate
// needs type-only and binding detail and keeps its compiler-based reader in
// scripts/architecture/source-graph.mjs, which costs about a second to load.
import path from "node:path";

const IMPORT =
  /(?:^|[\s;])(?:import|export)\s(?:[^"';]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/gmu;

/** Suffixes tried, in order, after the specifier's own path. */
const EXTENSIONS = Object.freeze([
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".mjs",
  ".js",
  ".json",
  "/index.ts",
  "/index.mjs",
  "/index.js",
]);

/** The relative specifiers in `text`, in order (`./x.mjs`, `../y`). */
export function relativeSpecifiers(text) {
  return [...text.matchAll(IMPORT)].map((match) => match[1] ?? match[2]);
}

/**
 * The repository file `specifier` names when imported from `from` (both repository-relative POSIX
 * paths), or null. `isFile(candidate)` says whether a candidate exists; a caller holding a file list
 * answers it without touching the disk. TypeScript sources import "./x.js" for "./x.ts".
 * @param {string} from
 * @param {string} specifier
 * @param {(candidate: string) => boolean} isFile
 */
export function resolveRelative(from, specifier, isFile) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  for (const extension of EXTENSIONS) if (isFile(`${base}${extension}`)) return `${base}${extension}`;
  const swapped = base.replace(/\.js$/u, ".ts");
  return swapped !== base && isFile(swapped) ? swapped : null;
}

/** The repository files `text` (the contents of `from`) imports through relative specifiers. */
export function relativeImports(from, text, isFile) {
  return relativeSpecifiers(text)
    .map((specifier) => resolveRelative(from, specifier, isFile))
    .filter((target) => target !== null);
}
