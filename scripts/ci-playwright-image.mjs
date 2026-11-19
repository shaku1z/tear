// The Playwright container image every browser job runs in, named from the version pnpm-lock.yaml
// installs. The lockfile is the one owner of that version: bumping @playwright/test changes the
// image with no workflow edit.
//
//   node scripts/ci-playwright-image.mjs      prints playwright_image=<image> for $GITHUB_OUTPUT
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");

/** The @playwright/test version the root importer of a pnpm lockfile installs. */
export function lockedPlaywrightVersion(lockfile) {
  const match = /\n {6}'@playwright\/test':\n {8}specifier: [^\n]+\n {8}version: (\d+\.\d+\.\d+)\n/u.exec(lockfile);
  if (match === null) throw new Error("pnpm-lock.yaml installs no @playwright/test for the repository root");
  return match[1];
}

/** Playwright's own image for that version, on the Ubuntu release GitHub's runners use. */
export function playwrightImage(version) {
  return `mcr.microsoft.com/playwright:v${version}-noble`;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lockfile = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8").replace(/\r\n/gu, "\n");
  console.log(`playwright_image=${playwrightImage(lockedPlaywrightVersion(lockfile))}`);
}
