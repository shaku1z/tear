// The files that decide a verdict, from config/gate-files.json, and which of a change's files are
// among them. The scope job of Validate warns with it, and pnpm merge:ready refuses a change that
// touches one until the lead has reviewed it.
//
//   git diff --name-only origin/main HEAD | node scripts/gate-files.mjs --flag [list.json]
//     prints the changed gate files as a warning and to the run summary; always exits 0
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The label the merge desk adds once the lead has reviewed a change to gate files. */
export const GATE_LABEL = "gate-reviewed";

/**
 * The list, plus every script the checks reach that it does not already name (checkedScripts). The
 * checks are the `checks.json` beside the list: in Validate that is main's copy, next to main's list.
 */
export function loadGateList(path = resolve(root, "config/gate-files.json")) {
  const list = JSON.parse(readFileSync(path, "utf8"));
  const checksPath = resolve(dirname(path), "checks.json");
  if (!existsSync(checksPath)) return list;
  const reached = [...checkedScripts(JSON.parse(readFileSync(checksPath, "utf8")))]
    .filter(([file]) => gateFilesIn(list, [file]).length === 0)
    .map(([file, why]) => ({ path: file, why, reached: true }));
  return { ...list, files: [...list.files, ...reached] };
}

const RUN_SCRIPT = /(?:^|\s)(scripts\/[\w./-]+\.[cm]?js)(?=\s|$)/gu;
const RELATIVE_IMPORT = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["'](\.\.?\/[^"']+\.[cm]?js)["']/gu;
const config = (stem, extensions) => extensions.map((extension) => `${stem}.${extension}`);
const VITE = ["ts", "mts", "cts", "js", "mjs", "cjs"];

/**
 * The config files a check's tool reads without the command naming them: the file after the tool's
 * config flag, or else the first of its default paths that exists (the tool's own lookup order).
 */
export const TOOL_CONFIGS = [
  {
    tool: /\bvitest(?:\.mjs)?\s+run\b/u,
    flag: /\s(?:--config|-c)[ =](\S+)/u,
    defaults: [...config("vitest.config", VITE), ...config("vite.config", VITE)],
  },
  { tool: /\btsc(?:\.js)?\s/u, flag: /\s(?:-p|--project|-b|--build)\s+(\S+\.json)\b/u, defaults: ["tsconfig.json"] },
  {
    tool: /\bplaywright(?:\.js)?\s+test\b/u,
    flag: /\s(?:--config|-c)[ =](\S+)/u,
    defaults: config("playwright.config", ["ts", "mts", "js", "mjs", "cjs"]),
  },
];

/** The files a tsconfig brings in: the one it `extends` and the projects it lists as `references`. */
function tsconfigLinks(file, text) {
  const links = [...text.matchAll(/"(extends|path)"\s*:\s*"(\.\.?\/[^"]+)"/gu)].map(([, key, spec]) => {
    const target = posix.join(posix.dirname(file), spec);
    return [
      /\.json$/u.test(target) ? target : `${target}/tsconfig.json`,
      key === "extends" ? "extended" : "referenced",
    ];
  });
  return links.map(([target, how]) => [target, `${how} by ${file}`]);
}

/**
 * Every file that takes part in a verdict without being a test: each script a `config/checks.json`
 * command runs directly, each config file a check's tool reads (TOOL_CONFIGS), the tsconfigs those
 * extend or reference, and every script any of them imports from scripts/, followed to the end. A map
 * from path to the reason. Tests are not followed: a change may add and change its own tests.
 */
export function checkedScripts(checks, read = (file) => readFileSync(resolve(root, file), "utf8")) {
  const runs = [];
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === "object") {
      if (typeof value.run === "string") runs.push(value.run);
      Object.values(value).forEach(collect);
    }
  };
  collect(checks);
  const reached = new Map();
  const queue = [];
  const add = (file, why) => {
    if (reached.has(file)) return;
    reached.set(file, why);
    queue.push(file);
  };
  const exists = (file) => {
    try {
      read(file);
      return true;
    } catch {
      return false;
    }
  };
  for (const run of runs) {
    for (const [, file] of run.matchAll(RUN_SCRIPT)) add(file, `run by the check \`${run}\``);
    for (const { tool, flag, defaults } of TOOL_CONFIGS) {
      if (!tool.test(run)) continue;
      const named = flag.exec(run)?.[1];
      if (named !== undefined) add(posix.normalize(named), `named by the check \`${run}\``);
      else {
        const found = defaults.find(exists);
        if (found !== undefined) add(found, `read by default by the check \`${run}\``);
      }
    }
  }
  while (queue.length > 0) {
    const file = queue.shift();
    let text;
    try {
      text = read(file);
    } catch {
      continue; // a check names a file that does not exist: the check fails on its own
    }
    if (/(?:^|\/)tsconfig[^/]*\.json$/u.test(file))
      for (const [target, why] of tsconfigLinks(file, text)) add(target, why);
    for (const [, spec] of text.matchAll(RELATIVE_IMPORT)) {
      const imported = posix.join(posix.dirname(file), spec);
      if (imported.startsWith("scripts/")) add(imported, `imported by ${file}`);
    }
  }
  return reached;
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
