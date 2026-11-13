#!/usr/bin/env node
// The one ESLint target list. `pnpm lint` and the TearBench `static.lint` task (which
// CI's check:functional runs) both execute this file, so the two cannot drift apart.
// Extra arguments (for example `--fix` or `--cache`) are passed through to ESLint.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LINT_TARGETS = Object.freeze([
  "src", "workers", "scripts", "tests", "vite.config.ts", "vitest.config.ts", "vitest.endurance.config.ts",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const eslint = resolve(root, "node_modules", "eslint", "bin", "eslint.js");
  const result = spawnSync(process.execPath, [eslint, ...LINT_TARGETS, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
