#!/usr/bin/env node
// The one Prettier target list. `pnpm format` (--write), `pnpm format:check` (--check) and the
// TearBench `static.format` task (which CI's check:functional runs) all execute this file, so
// they cannot drift apart. Exclusions inside these targets live in `.prettierignore`; the
// settings live in `.prettierrc.json`. Extra arguments are passed through to Prettier. `--changed`
// checks only the files this checkout changes (scripts/changed-files.mjs), which is exact for formatting.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { changedFiles, withinTargets } from "./changed-files.mjs";

export const FORMAT_TARGETS = Object.freeze([
  "src",
  "tests",
  "scripts",
  "eslint.config.mjs",
  "vite.config.ts",
  "vitest.config.ts",
  "vitest.endurance.config.ts",
  "package.json",
  "tsconfig*.json",
  "firebase.json",
  "wrangler*.jsonc",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const prettier = resolve(root, "node_modules", "prettier", "bin", "prettier.cjs");
  const options = process.argv.slice(2);
  let targets = FORMAT_TARGETS;
  if (options.includes("--changed")) {
    targets = changedFiles(root).filter((file) => withinTargets(file, FORMAT_TARGETS));
    if (targets.length === 0) {
      console.log("format: no changed files to check");
      process.exit(0);
    }
    options.splice(options.indexOf("--changed"), 1, "--ignore-unknown");
  }
  const mode = options.includes("--write") || options.includes("--check") ? [] : ["--check"];
  const result = spawnSync(process.execPath, [prettier, ...mode, "--log-level", "warn", ...options, ...targets], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
