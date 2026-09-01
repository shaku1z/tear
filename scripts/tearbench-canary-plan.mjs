import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { receiptSha256 } from "./tearbench-task-receipts.mjs";

function checkedPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 16) throw new TypeError(`${label} must be between 1 and 16`);
  return value;
}
function validatePlan(plan) {
  const { planDigest, ...payload } = plan ?? {};
  if (plan?.format !== "tearbench-shadow-plan" || plan.schemaVersion !== 1 || receiptSha256(payload) !== planDigest
    || !Array.isArray(plan.requiredTaskIds) || !Array.isArray(plan.taskNodes)) throw new TypeError("canary requires an exact valid TearBench plan");
}
function estimate(task, history) {
  const sample = history.tasks?.[task.taskId], statistic = history.statistic;
  const historical = sample?.samples >= history.minimumSamples ? sample?.[`${statistic}Ms`] : undefined;
  const value = historical ?? history.fallbackMs?.[task.resourceClass];
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`duration history has no valid estimate for ${task.taskId}`);
  return { estimatedMs: value, estimateKind: historical === undefined ? "resource-fallback" : `historical-${statistic}`,
    samples: historical === undefined ? 0 : sample.samples };
}
function topologicalOrder(tasks) {
  const byId = new Map(tasks.map((task) => [task.taskId, task])), ordered = [], visited = new Set(), visiting = new Set();
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new RangeError(`canary task dependency cycle includes ${id}`);
    const task = byId.get(id); if (task === undefined) throw new RangeError(`canary dependency is absent from the plan: ${id}`);
    visiting.add(id); for (const dependency of task.dependencies ?? []) visit(dependency.taskId);
    visiting.delete(id); visited.add(id); ordered.push(id);
  };
  for (const task of [...tasks].sort((left, right) => left.taskId.localeCompare(right.taskId))) visit(task.taskId);
  return ordered;
}
function pack(group, count, prefix) {
  const shards = Array.from({ length: Math.min(count, Math.max(group.length, 1)) }, (_, index) => ({
    shardId: `${prefix}-${String(index + 1)}`, estimatedMs: 0, taskIds: [], estimates: [],
  }));
  for (const task of [...group].sort((left, right) => right.estimatedMs - left.estimatedMs || left.taskId.localeCompare(right.taskId))) {
    const shard = [...shards].sort((left, right) => left.estimatedMs - right.estimatedMs || left.shardId.localeCompare(right.shardId))[0];
    shard.taskIds.push(task.taskId); shard.estimates.push({ taskId: task.taskId, estimatedMs: task.estimatedMs,
      estimateKind: task.estimateKind, samples: task.samples }); shard.estimatedMs += task.estimatedMs;
  }
  return shards;
}

export function createCanaryShardPlan({ plan, durationHistory, browserShardCount = 4, coreShardCount = 4 }) {
  validatePlan(plan); checkedPositiveInteger(browserShardCount, "browser shard count"); checkedPositiveInteger(coreShardCount, "core shard count");
  if (durationHistory?.schemaVersion !== 1 || !["p50", "p95"].includes(durationHistory.statistic)
    || !Number.isSafeInteger(durationHistory.minimumSamples) || durationHistory.minimumSamples < 1) {
    throw new TypeError("canary duration history is malformed");
  }
  const order = topologicalOrder(plan.taskNodes), position = new Map(order.map((id, index) => [id, index]));
  const unsupportedNodes = plan.taskNodes.filter((task) => !["build", "browser", "static", "unit", "headless"].includes(task.resourceClass));
  if (unsupportedNodes.length > 0) throw new TypeError(`release canary has unsupported task classes: ${unsupportedNodes.map((task) => task.taskId).join(", ")}`);
  const estimated = plan.taskNodes.map((task) => ({ ...task, ...estimate(task, durationHistory) }));
  const builds = estimated.filter((task) => task.resourceClass === "build").sort((a, b) => position.get(a.taskId) - position.get(b.taskId));
  const browsers = estimated.filter((task) => task.resourceClass === "browser");
  const core = estimated.filter((task) => ["static", "unit", "headless"].includes(task.resourceClass));
  const normalize = (shards) => shards.map((shard) => ({ ...shard,
    taskIds: shard.taskIds.sort((a, b) => position.get(a) - position.get(b)),
    estimates: shard.estimates.sort((a, b) => position.get(a.taskId) - position.get(b.taskId)) }));
  const buildShard = { shardId: "build-1", estimatedMs: builds.reduce((sum, task) => sum + task.estimatedMs, 0),
    taskIds: builds.map((task) => task.taskId), estimates: builds.map((task) => ({ taskId: task.taskId, estimatedMs: task.estimatedMs,
      estimateKind: task.estimateKind, samples: task.samples })) };
  const browserShards = normalize(pack(browsers, browserShardCount, "browser"));
  const coreShards = normalize(pack(core, coreShardCount, "core"));
  const serialShard = { shardId: "serial-1", estimatedMs: estimated.reduce((sum, task) => sum + task.estimatedMs, 0),
    taskIds: order, estimates: order.map((taskId) => { const task = estimated.find((entry) => entry.taskId === taskId);
      return { taskId, estimatedMs: task.estimatedMs, estimateKind: task.estimateKind, samples: task.samples }; }) };
  const scheduled = [buildShard, ...browserShards, ...coreShards].flatMap((shard) => shard.taskIds);
  const missing = plan.requiredTaskIds.filter((id) => !scheduled.includes(id));
  const extra = scheduled.filter((id) => !plan.requiredTaskIds.includes(id));
  const duplicates = [...new Set(scheduled.filter((id, index) => scheduled.indexOf(id) !== index))].sort();
  if (missing.length > 0 || extra.length > 0 || duplicates.length > 0) throw new Error("canary shard plan does not exactly cover its source plan");
  const historyPayload = { ...durationHistory };
  const payload = { format: "tearbench-canary-shard-plan", schemaVersion: 1, planDigest: plan.planDigest,
    source: plan.source, profileId: plan.profileId, durationPolicy: { statistic: durationHistory.statistic,
      minimumSamples: durationHistory.minimumSamples, source: durationHistory.source, digest: receiptSha256(historyPayload) },
    constraints: { browserShardCount: browserShards.length, coreShardCount: coreShards.length,
      failFast: false, separateRunnerJobs: true, nativePlaywrightSharding: false },
    buildShard, browserShards, coreShards, serialShard, exactTaskIds: [...plan.requiredTaskIds],
    estimates: { serialTaskMs: estimated.reduce((sum, task) => sum + task.estimatedMs, 0),
      parallelCriticalPathMs: buildShard.estimatedMs + Math.max(0, ...browserShards.map((shard) => shard.estimatedMs),
        ...coreShards.map((shard) => shard.estimatedMs)) },
    parity: { missing, extra, duplicates, status: "exact" } };
  return Object.freeze({ ...payload, shardPlanDigest: receiptSha256(payload) });
}

const invoked = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  const values = {}, allowed = new Set(["--plan", "--history", "--artifact"]), args = process.argv.slice(2);
  if (args.length !== 6) throw new TypeError("usage: node scripts/tearbench-canary-plan.mjs --plan path --history path --artifact path");
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || values[args[index]] !== undefined) throw new TypeError("invalid canary plan arguments");
    values[args[index]] = args[index + 1];
  }
  const plan = JSON.parse(await readFile(resolve(values["--plan"]), "utf8"));
  const history = JSON.parse(await readFile(resolve(values["--history"]), "utf8"));
  const result = createCanaryShardPlan({ plan, durationHistory: history });
  const output = resolve(values["--artifact"]); await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ build: result.buildShard, browser: result.browserShards, core: result.coreShards,
    serial: result.serialShard }));
}
