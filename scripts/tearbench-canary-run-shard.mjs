import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { executePlanTask } from "./tearbench-task-execution.mjs";
import { receiptSha256 } from "./tearbench-task-receipts.mjs";

const usage = "usage: node scripts/tearbench-canary-run-shard.mjs --plan path --shard-plan path --shard id --mission id --timing path --run-created iso --ready-at iso --job-start iso --plant-failure task|none";
const names = ["--plan", "--shard-plan", "--shard", "--mission", "--timing", "--run-created", "--ready-at", "--job-start", "--plant-failure"];
const args = process.argv.slice(2), values = {};
if (args.length !== names.length * 2) throw new TypeError(usage);
for (let index = 0; index < args.length; index += 2) {
  if (!names.includes(args[index]) || values[args[index]] !== undefined || args[index + 1] === undefined) throw new TypeError(usage);
  values[args[index]] = args[index + 1];
}
const plan = JSON.parse(await readFile(resolve(values["--plan"]), "utf8"));
const shardPlan = JSON.parse(await readFile(resolve(values["--shard-plan"]), "utf8"));
const { shardPlanDigest, ...shardPayload } = shardPlan;
if (receiptSha256(shardPayload) !== shardPlanDigest || shardPlan.planDigest !== plan.planDigest) throw new TypeError("canary shard plan is stale or malformed");
const shards = [shardPlan.buildShard, ...shardPlan.browserShards, ...shardPlan.coreShards, shardPlan.serialShard];
const shard = shards.find((entry) => entry.shardId === values["--shard"]);
if (shard === undefined) throw new RangeError(`unknown canary shard ${values["--shard"]}`);
const runCreatedAt = new Date(values["--run-created"]), readyAt = new Date(values["--ready-at"]),
  jobStartedAt = new Date(values["--job-start"]), tasksStartedAt = new Date();
if ([runCreatedAt, readyAt, jobStartedAt].some((value) => Number.isNaN(value.valueOf()))) throw new TypeError("canary timing origins are invalid");
const taskResults = [], planted = values["--plant-failure"] === "none" ? undefined : values["--plant-failure"];
let failed = false;
for (const taskId of shard.taskIds) {
  const started = Date.now();
  try {
    const attempts = [];
    let result = await executePlanTask({ planPath: values["--plan"], taskId, missionId: values["--mission"],
      attemptNumber: 1, plantedFailureTaskId: planted });
    attempts.push({ attemptNumber: 1, status: result.receipt.result.status,
      durationMs: result.receipt.result.durationMs, receiptPath: result.receipt.immutablePath });
    if (result.receipt.result.status !== "passed") {
      const priorRetryAuthorization = process.env.TEARBENCH_RETRY_AUTHORIZATION;
      process.env.TEARBENCH_RETRY_AUTHORIZATION = `bounded-canary-single-retry:${values["--mission"]}:${taskId}`;
      try {
        result = await executePlanTask({ planPath: values["--plan"], taskId, missionId: values["--mission"],
          attemptNumber: 2, plantedFailureTaskId: planted });
      } finally {
        if (priorRetryAuthorization === undefined) delete process.env.TEARBENCH_RETRY_AUTHORIZATION;
        else process.env.TEARBENCH_RETRY_AUTHORIZATION = priorRetryAuthorization;
      }
      attempts.push({ attemptNumber: 2, status: result.receipt.result.status,
        durationMs: result.receipt.result.durationMs, receiptPath: result.receipt.immutablePath });
    }
    const status = result.receipt.result.status;
    taskResults.push({ taskId, status, durationMs: attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0),
      receiptPath: result.receipt.immutablePath, attempts });
    failed ||= status !== "passed";
  } catch (error) {
    failed = true;
    const failureUnsigned = { format: "tearbench-canary-infrastructure-failure", schemaVersion: 1,
      planDigest: plan.planDigest, shardPlanDigest, missionId: values["--mission"], shardId: shard.shardId, taskId,
      occurredAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
    const failure = { ...failureUnsigned, failureDigest: receiptSha256(failureUnsigned) };
    const failurePath = resolve("artifacts", "tearbench", "canary", "infrastructure", values["--mission"],
      shard.shardId, `${taskId}.json`);
    await mkdir(dirname(failurePath), { recursive: true }); await writeFile(failurePath, `${JSON.stringify(failure, null, 2)}\n`, { flag: "wx" });
    taskResults.push({ taskId, status: "infrastructure-error", durationMs: Date.now() - started,
      error: failure.error, failurePath: failurePath.replaceAll("\\", "/") });
  }
}
const finishedAt = new Date();
const unsigned = { format: "tearbench-canary-shard-timing", schemaVersion: 1, planDigest: plan.planDigest,
  shardPlanDigest, missionId: values["--mission"], shardId: shard.shardId, estimatedMs: shard.estimatedMs,
  runCreatedAt: runCreatedAt.toISOString(), readyAt: readyAt.toISOString(), jobStartedAt: jobStartedAt.toISOString(),
  tasksStartedAt: tasksStartedAt.toISOString(), finishedAt: finishedAt.toISOString(),
  queueMs: Math.max(0, jobStartedAt - readyAt), workflowWaitMs: Math.max(0, jobStartedAt - runCreatedAt),
  setupMs: Math.max(0, tasksStartedAt - jobStartedAt), taskWallMs: Math.max(0, finishedAt - tasksStartedAt),
  jobWallMs: Math.max(0, finishedAt - jobStartedAt), status: failed ? "failed" : "passed", taskResults };
const timing = { ...unsigned, timingDigest: receiptSha256(unsigned) }, output = resolve(values["--timing"]);
await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(timing, null, 2)}\n`, "utf8");
console.log(`${timing.status.toUpperCase()} ${shard.shardId}: ${String(taskResults.length)} tasks, ${String(timing.taskWallMs)}ms`);
if (failed) process.exitCode = 1;
