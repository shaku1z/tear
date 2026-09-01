import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { receiptSha256 } from "./tearbench-task-receipts.mjs";

const args = process.argv.slice(2), values = {};
if (args.length !== 4 || !["--artifact", "--results"].includes(args[0]) || !["--artifact", "--results"].includes(args[2]) || args[0] === args[2]) {
  throw new TypeError("usage: node scripts/tearbench-canary-incomplete-report.mjs --artifact path --results json");
}
values[args[0]] = args[1]; values[args[2]] = args[3];
const results = JSON.parse(values["--results"]), payload = { format: "tearbench-canary-parity-report", schemaVersion: 1,
  generatedAt: new Date().toISOString(), status: "incomplete", planDigest: null, shardPlanDigest: null,
  source: null, plantedFailureTaskId: null, taskParity: null, claimParity: null, metrics: null,
  errors: ["canary control, task, certificate, or comparison evidence is incomplete"], workflowResults: results };
const report = { ...payload, reportDigest: receiptSha256(payload) }, output = resolve(values["--artifact"]);
await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`INCOMPLETE ${report.reportDigest}`);
