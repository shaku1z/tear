// The verdict of Validate's final job, named `check`: the one status the ruleset requires.
//
//   NEEDS='${{ toJSON(needs) }}' node scripts/ci-verdict.mjs
//
// It passes only when the scope job passed and then either the change is documents only and the
// docs job passed, or every gate group of config/checks.json passed as a job. Anything else fails
// closed: a job that failed, was cancelled, timed out, was skipped when it had to run, or is missing.
import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadChecks } from "./run-checks.mjs";

/** The jobs `check` must see, besides the gate groups: the scope decision and the document checks. */
export const FIXED_JOBS = Object.freeze(["scope", "docs"]);

/**
 * `needs` is GitHub's `toJSON(needs)`: { job: { result, outputs } }. `result` is success, failure,
 * cancelled or skipped; a job that timed out reports failure. Returns the problems; none means pass.
 */
export function verdictProblems(needs, gate) {
  const problems = [];
  const expected = [...FIXED_JOBS, ...gate];
  for (const job of expected) if (needs?.[job] === undefined) problems.push(`${job}: not among the needed jobs`);
  for (const job of Object.keys(needs ?? {}))
    if (!expected.includes(job)) problems.push(`${job}: needed but not a gate group, scope or docs`);
  if (problems.length > 0) return problems;
  const result = (job) => needs[job].result;
  if (result("scope") !== "success") return [`scope: ${String(result("scope"))}`];
  const docsOnly = needs.scope.outputs?.docs_only;
  if (docsOnly !== "true" && docsOnly !== "false") return [`scope: docs_only is ${String(docsOnly)}`];
  const mustPass = docsOnly === "true" ? ["docs"] : gate;
  const mustSkip = docsOnly === "true" ? gate : ["docs"];
  for (const job of mustPass) if (result(job) !== "success") problems.push(`${job}: ${String(result(job))}`);
  for (const job of mustSkip)
    if (result(job) !== "skipped") problems.push(`${job}: ${String(result(job))} where it should not run`);
  return problems;
}

/** What the `check` job runs: reads `NEEDS`, prints each job and any problem, returns the exit code. */
export function main(env = process.env, log = console.log) {
  const needs = JSON.parse(env.NEEDS ?? "null");
  const problems = verdictProblems(needs, loadChecks().gate);
  for (const job of Object.keys(needs ?? {})) log(`${job}: ${String(needs[job].result)}`);
  if (problems.length === 0) {
    log("every needed job passed");
    return 0;
  }
  for (const problem of problems) log(`::error title=check::${problem}`);
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
