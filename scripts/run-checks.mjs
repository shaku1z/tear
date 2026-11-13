// Runs one part of the `check.functional` task list so CI can spread it across parallel jobs.
//
//   node scripts/run-checks.mjs <static|unit|build|browser|all> [--shard i/n] [--list]
//
// The tasks and their commands still come from src/tearbench/task-registry.json; this script only
// decides which job runs which task. Every task of the profile lands in exactly one group (and one
// shard), so the parallel jobs together run the same commands as `pnpm check:functional`.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { dependencyOrderedTaskIds, registryTaskEnvironment } from "./tearbench-task-profile.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PROFILE = "check.functional";
export const GROUPS = Object.freeze(["static", "unit", "build", "browser"]);

// Typical seconds on a GitHub runner (median of recent Validate runs). Used only to balance
// shards; a task missing here counts as 10 s in the browser group and 1 s elsewhere.
const SECONDS = Object.freeze({
  "unit.test-unit-without-preservation-corpus": 285,
  "static.lint": 115,
  "static.typecheck": 35,
  "unit.test-architecture": 28,
  "static.format-check": 24,
  "unit.test-tearbench-selection": 18,
  "unit.tearbench-evidence-clients": 16,
  "unit.test-tutorial-gold-fingerprint": 11,
  "unit.tearbench-resource-leases": 9,
  "static.check-terminology": 6,
  "unit.test-parent-layout": 4,
  "unit.test-remaining-workspace-inventory": 4,
  "unit.test-serve": 3,
  "static.check-ghost-types": 3,
  "static.check-architecture": 3,
  "unit.test-workspace-preservation-quarantine": 3,
  "browser.test-browser-state-forge": 100,
  "browser.test-browser-current-weapon-parity": 71,
  "browser.test-browser-bosses": 62,
  "browser.test-browser-release-adventure": 55,
  "browser.test-browser-tear-runtime": 51,
  "browser.test-browser-journeys": 49,
  "browser.test-browser-state-forge.3": 25,
  "browser.test-browser-current-gameplay-scenarios": 25,
  "browser.test-pwa": 18,
  "browser.test-browser": 18,
  "browser.test-browser-input": 17,
  "browser.test-browser-journeys.2": 15,
  "browser.test-browser-current-live-detached-parity": 14,
  "browser.test-browser-journeys.5": 14,
  "browser.test-browser-audio": 13,
  "browser.test-browser-features": 13,
  "browser.test-browser-journeys.4": 11,
  "browser.test-browser-responsive": 11,
  "browser.test-browser-journeys.3": 10,
  "browser.test-browser-production-isolation": 8,
  "browser.test-browser-player-locomotion": 8,
  "browser.test-browser-agent-journey": 8,
  "browser.test-browser-blade-lifecycle": 7,
  "browser.test-browser-state-forge.2": 5,
  "browser.test-browser-enemy-charge": 4,
  "browser.test-browser-mirror-pursuit": 3,
  "browser.test-browser-ranged-cycle": 3,
  "browser.test-browser-crazygames-iframe": 3,
  "browser.test-browser-combat-resolution": 3,
  "browser.test-browser-platform": 2,
  "browser.test-browser-projectile-parry": 2,
  "browser.test-browser-platform.2": 2,
  "browser.test-browser-fresh-run-meta": 2,
});

export function loadTasks(registryPath = resolve(root, "src/tearbench/task-registry.json")) {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const byId = new Map(registry.tasks.map((task) => [task.taskId, task]));
  const ordered = dependencyOrderedTaskIds(registry.profiles[PROFILE], registry.tasks);
  return ordered.map((taskId) => byId.get(taskId));
}

/** Which parallel job runs a task. */
export function groupOf(task) {
  if (task.resourceClass === "browser") return "browser";
  if (task.resourceClass === "build" || task.dependencies.length > 0) return "build";
  if (task.runner.kind === "vitest") return "unit";
  return "static";
}

const estimate = (task) => SECONDS[task.taskId] ?? (task.resourceClass === "browser" ? 10 : 1);

/** Splits tasks into n shards with similar total time, keeping the original order inside each. */
export function shardTasks(tasks, count) {
  const totals = Array.from({ length: count }, () => 0);
  const owner = new Map();
  const bySize = [...tasks].sort((a, b) => estimate(b) - estimate(a));
  for (const task of bySize) {
    const smallest = totals.indexOf(Math.min(...totals));
    owner.set(task.taskId, smallest);
    totals[smallest] += estimate(task);
  }
  return Array.from({ length: count }, (_, index) => tasks.filter((task) => owner.get(task.taskId) === index));
}

/** The vitest suite is split with vitest's own --shard instead of by task. */
function commandFor(task, shard) {
  const args = [...task.runner.args];
  if (shard !== undefined && task.taskId === "unit.test-unit-without-preservation-corpus") {
    args.push(`--shard=${String(shard.index)}/${String(shard.count)}`);
  }
  if (task.runner.kind === "node" && task.runner.executable === "node") return args;
  return [resolve(root, task.runner.executable), ...args];
}

export function selectTasks(tasks, group, shard) {
  const inGroup = group === "all" ? tasks : tasks.filter((task) => groupOf(task) === group);
  if (shard === undefined) return inGroup;
  if (group === "unit") {
    // Every unit shard runs its slice of the vitest suite; the small vitest tasks go to shard 1.
    return inGroup.filter((task) => task.taskId === "unit.test-unit-without-preservation-corpus" || shard.index === 1);
  }
  return shardTasks(inGroup, shard.count)[shard.index - 1];
}

function parseShard(text) {
  const match = /^(\d+)\/(\d+)$/u.exec(text ?? "");
  if (match === null) throw new TypeError(`--shard expects i/n, got ${String(text)}`);
  const shard = { index: Number(match[1]), count: Number(match[2]) };
  if (shard.index < 1 || shard.index > shard.count) throw new RangeError(`--shard ${text} is out of range`);
  return shard;
}

function main(argv) {
  const group = argv[0];
  if (![...GROUPS, "all"].includes(group)) {
    throw new TypeError("usage: node scripts/run-checks.mjs <static|unit|build|browser|all> [--shard i/n] [--list]");
  }
  const shardIndex = argv.indexOf("--shard");
  const shard = shardIndex >= 0 ? parseShard(argv[shardIndex + 1]) : undefined;
  const tasks = selectTasks(loadTasks(), group, shard);
  if (argv.includes("--list")) {
    for (const task of tasks) console.log(task.taskId);
    return 0;
  }
  const started = Date.now();
  for (const [index, task] of tasks.entries()) {
    const taskStarted = Date.now();
    console.log(`TASK ${String(index + 1)}/${String(tasks.length)} ${task.taskId}`);
    const result = spawnSync(process.execPath, commandFor(task, shard), {
      cwd: root,
      stdio: "inherit",
      // The registry's timeoutMs values are not enforced by `pnpm check:functional` either (the unit
      // suite declares 120 s and takes about 285 s); each CI job has its own time limit instead.
      env: registryTaskEnvironment(task),
    });
    const seconds = ((Date.now() - taskStarted) / 1000).toFixed(1);
    if (result.error !== undefined || result.status !== 0) {
      const reason = result.error?.message ?? `exit ${String(result.status ?? result.signal)}`;
      console.error(`FAIL ${task.taskId} after ${seconds} s (${reason})`);
      return result.status || 1;
    }
    console.log(`PASS ${task.taskId} ${seconds} s`);
  }
  console.log(`PASS ${String(tasks.length)} task(s) in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
