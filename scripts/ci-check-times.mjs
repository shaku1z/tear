// Writes config/check-times.json, the measured seconds the browser shards are split by, from the
// results files of real Validate runs.
//
//   node scripts/ci-check-times.mjs <run id> [<run id> ...]
//
// For each run it downloads every check-results-* artifact (gh run download), and keeps each
// check's passing times. A check's time is the median over the runs, so one slow runner does not
// move the split. Checks missing from every run keep the time in config/checks.json, and checks no
// longer in config/checks.json are left out.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CHECK_TIMES, loadChecks, selectChecks } from "./run-checks.mjs";

export const FORMAT = "tear-check-times.v1";

/** The median passing seconds per check over the given results files (one or more per run). */
export function medianTimes(resultsFiles) {
  const times = new Map();
  for (const file of resultsFiles)
    for (const result of file.results ?? [])
      if (result.status === "pass" && Number.isFinite(result.seconds))
        times.set(result.check, [...(times.get(result.check) ?? []), result.seconds]);
  const seconds = {};
  for (const check of [...times.keys()].sort()) {
    const sorted = times.get(check).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    // At least 0.1 s: the split reads 0 as "no time", and a check that ran did take some.
    seconds[check] = Math.max(0.1, Math.round(median * 10) / 10);
  }
  return seconds;
}

/** Every results.json under `directory`, parsed. */
function resultsUnder(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true }))
    if (entry.isFile() && entry.name === "results.json")
      found.push(JSON.parse(readFileSync(join(entry.parentPath, entry.name), "utf8")));
  return found;
}

function download(run, directory) {
  const result = spawnSync("gh", ["run", "download", run, "--pattern", "check-results-*", "--dir", directory], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`gh run download ${run} failed: ${result.stderr.trim()}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runs = process.argv.slice(2);
  if (runs.length === 0 || runs.some((run) => !/^\d+$/u.test(run))) {
    console.error("usage: node scripts/ci-check-times.mjs <run id> [<run id> ...]");
    process.exit(2);
  }
  const files = [];
  for (const run of runs) {
    const directory = mkdtempSync(join(tmpdir(), "tear-check-times-"));
    try {
      download(run, directory);
      files.push(...resultsUnder(directory));
    } finally {
      if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
    }
  }
  const listed = new Set(selectChecks(loadChecks()).map((check) => `${check.group}.${check.id}`));
  const seconds = Object.fromEntries(Object.entries(medianTimes(files)).filter(([check]) => listed.has(check)));
  writeFileSync(CHECK_TIMES, `${JSON.stringify({ format: FORMAT, runs, seconds }, null, 2)}\n`);
  console.log(`${String(Object.keys(seconds).length)} check time(s) from ${String(runs.length)} run(s)`);
}
