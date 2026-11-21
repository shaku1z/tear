// The files that decide a verdict, from config/gate-files.json, and which of a change's files are
// among them. The scope job of Validate warns with it, and pnpm merge:ready refuses a change that
// touches one until the lead has reviewed it.
//
//   git diff --name-only origin/main HEAD | node scripts/gate-files.mjs --flag [list.json]
//     prints the changed gate files as a warning and to the run summary; always exits 0
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The label the merge desk adds once the lead has reviewed a change to gate files. */
export const GATE_LABEL = "gate-reviewed";

export function loadGateList(path = resolve(root, "config/gate-files.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The files that are gate files: an entry ending in `/` matches by start, any other matches exactly or as a prefix of a name (`scripts/ci-`). */
export function gateFilesIn(list, files) {
  const paths = list.files.map((entry) => entry.path);
  return files.filter((file) =>
    paths.some((path) => (path.endsWith("/") || path.endsWith("-") ? file.startsWith(path) : file === path)),
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--flag");
  if (at === -1) {
    console.error("usage: node scripts/gate-files.mjs --flag [list.json] < changed-files");
    process.exitCode = 2;
  } else {
    const list = loadGateList(process.argv[at + 1] === undefined ? undefined : resolve(process.argv[at + 1]));
    const changed = gateFilesIn(list, readFileSync(0, "utf8").split(/\r?\n/u).filter(Boolean));
    if (changed.length === 0) console.log("no gate files changed");
    else {
      const names = changed.join(", ");
      console.log(`::warning title=gate files changed::${names}: the lead reviews this change before it merges`);
      if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `### Gate files changed\n\n${changed.map((file) => `- \`${file}\``).join("\n")}\n\nThe lead reviews this change before it merges (\`${GATE_LABEL}\`).\n`,
        );
    }
  }
}
