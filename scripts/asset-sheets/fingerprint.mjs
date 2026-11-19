// Fingerprints for `pnpm assets:sheets`: a scene's fingerprint is a hash of the files that draw it, every file
// they import (followed through relative imports), the sheets tool itself and the scene's own description.
// A scene whose fingerprint matches the last run's is up to date and is not drawn again.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { relativeImports } from "../relative-imports.mjs";

/** Files that decide every picture: the tool, the import reader it follows, and the frame path it draws through. */
const TOOL_FILES = [
  "scripts/asset-sheets.mjs",
  "scripts/relative-imports.mjs",
  "src/app/replay/browser-ghost-studio-media.ts",
  "src/presentation/world/production-replay-frame.ts",
  "src/app/world/environment-layer.ts",
];
const TOOL_FOLDER = "scripts/asset-sheets";

export function createFingerprints(repo) {
  const known = new Map();

  function info(file) {
    let entry = known.get(file);
    if (entry !== undefined) return entry;
    const absolute = path.join(repo, file);
    const text = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
    const imports = /\.(?:ts|tsx|mts|mjs|js)$/u.test(file) ? relativeImports(file, text, isFile) : [];
    entry = { hash: createHash("sha256").update(text).digest("hex"), imports };
    known.set(file, entry);
    return entry;
  }

  function isFile(candidate) {
    const absolute = path.join(repo, candidate);
    return existsSync(absolute) && statSync(absolute).isFile();
  }

  function closure(roots) {
    const seen = new Set();
    const queue = [...roots];
    while (queue.length > 0) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      queue.push(...info(file).imports);
    }
    return [...seen].sort();
  }

  function toolFiles() {
    const walk = (folder) =>
      readdirSync(path.join(repo, folder), { withFileTypes: true }).flatMap((entry) => {
        const file = `${folder}/${entry.name}`;
        return entry.isDirectory() ? walk(file) : [file];
      });
    return [...TOOL_FILES, ...walk(TOOL_FOLDER)].sort();
  }

  return {
    /** Forget cached file contents (after files change on disk). */
    forget() {
      known.clear();
    },
    /** The fingerprint of a scene drawn by `roots`, and how many files it covers. */
    of(roots, scene) {
      const files = closure(roots);
      const hash = createHash("sha256").update(JSON.stringify(scene));
      for (const file of [...toolFiles(), ...files]) hash.update(file).update(info(file).hash);
      return { fingerprint: hash.digest("hex"), files };
    },
  };
}
