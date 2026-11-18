// `pnpm design-check:report`: a read-only replay of the design-check gate over merged pull requests,
// so the lead can review false refusals before switching config/design-check.json to enforce. It
// lists every pull request merged since a date (default: the config's observingSince) that the gate
// would have refused, and every one accepted through a "not applicable" line. Like merge:ready, it
// reads the setting from origin/main (fetch first for a current answer). It changes nothing.
//
//   node scripts/design-check-report.mjs [--since YYYY-MM-DD[THH:MM:SSZ]] [--limit N] [--json]
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { designCheckVerdict, OBSERVING_SINCE, readDesignCheckConfig } from "./design-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The gate's verdict, as enforce mode would give it, for each merged pull request.
 * @param {{ number: number, title: string, mergedAt: string, body: string }[]} pullRequests
 * @returns {{ refused: object[], notApplicable: object[], answered: number }}
 */
export function replay(pullRequests) {
  const refused = [];
  const notApplicable = [];
  let answered = 0;
  for (const pr of [...pullRequests].sort((a, b) => a.number - b.number)) {
    const verdict = designCheckVerdict(pr.body, "enforce");
    const row = { number: pr.number, title: pr.title, mergedAt: pr.mergedAt };
    if (verdict.refuse !== undefined) refused.push({ ...row, reason: verdict.refuse });
    else if (verdict.note !== undefined) notApplicable.push({ ...row, reason: verdict.note });
    else answered += 1;
  }
  return { refused, notApplicable, answered };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function main(args) {
  const since = option(args, "--since") ?? readDesignCheckConfig(root).observingSince;
  const limit = Number(option(args, "--limit") ?? 200);
  if (!OBSERVING_SINCE.test(since) || !Number.isInteger(limit) || limit <= 0) {
    console.error("usage: node scripts/design-check-report.mjs [--since YYYY-MM-DD[THH:MM:SSZ]] [--limit N] [--json]");
    return 2;
  }
  const listed = spawnSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "merged",
      "--search",
      `merged:>=${since}`,
      "--limit",
      String(limit),
      "--json",
      "number,title,mergedAt,body",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (listed.status !== 0) {
    console.error(`gh pr list failed: ${String(listed.stderr).trim()}`);
    return 1;
  }
  const result = replay(JSON.parse(listed.stdout));
  if (args.includes("--json")) {
    console.log(JSON.stringify({ since, ...result }, null, 2));
    return 0;
  }
  console.log(
    `Merged since ${since}: ${String(result.refused.length)} would be refused, ${String(result.notApplicable.length)} not applicable, ${String(result.answered)} answered.`,
  );
  for (const row of result.refused) console.log(`  would refuse #${String(row.number)} ${row.title}: ${row.reason}`);
  for (const row of result.notApplicable) console.log(`  accepted #${String(row.number)} ${row.title}: ${row.reason}`);
  console.log("Nothing was changed.");
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
