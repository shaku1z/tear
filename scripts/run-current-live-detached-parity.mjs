import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const scenarioId = "c27a.live-parity-trace";
const artifact = resolve("artifacts", "tearbench", "checkpoints", "core", "C27A", "live-parity", `focused-${scenarioId}.json`);
const environment = {
  ...process.env,
  TEAR_C27A_SCENARIO_ID: scenarioId,
  TEAR_C27A_MAX_TICKS: "180",
  TEAR_C27A_PARITY_ARTIFACT: artifact,
  TEAR_C27A_PARITY_REQUIRED: "1",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: resolve("."), env: environment, stdio: "inherit", ...options });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["tests/browser-c27a-live-parity-trace.js"]);
const parityArgs = ["exec", "vitest", "run", "tests/unit/current-live-detached-mechanic-parity.test.ts"];
if (process.platform === "win32") {
  run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `pnpm ${parityArgs.join(" ")}`]);
} else run("pnpm", parityArgs);
