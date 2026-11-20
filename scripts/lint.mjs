// The one ESLint target list. `pnpm lint` and the TearBench `static.lint` task (which
// CI's check:functional runs) both execute this file, so the two cannot drift apart.
// Extra arguments (for example `--fix` or `--cache`) are passed through to ESLint. `--changed` lints
// only the files this checkout changes (scripts/changed-files.mjs); the full lint still runs in CI.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { changedFiles, withinTargets } from "./changed-files.mjs";

export const LINT_TARGETS = Object.freeze([
  "src",
  "scripts",
  "tests",
  "vite.config.ts",
  "vitest.config.ts",
  "vitest.endurance.config.ts",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const eslint = resolve(root, "node_modules", "eslint", "bin", "eslint.js");
  // Type-aware linting of the whole repository needs more than Node's default heap; without this
  // ESLint dies with "JavaScript heap out of memory" on the hosted runner, which has about 16 GB.
  const heap = "--max-old-space-size=6144";
  const options = process.argv.slice(2);
  let targets = LINT_TARGETS;
  if (options.includes("--changed")) {
    targets = changedFiles(root).filter((file) => /.(?:[cm]?js|ts)$/u.test(file) && withinTargets(file, LINT_TARGETS));
    if (targets.length === 0) {
      console.log("lint: no changed files to lint");
      process.exit(0);
    }
    options.splice(options.indexOf("--changed"), 1, "--no-warn-ignored");
  }
  const result = spawnSync(process.execPath, [heap, eslint, ...targets, ...options], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
