import { readFileSync } from "node:fs";

/**
 * Classifies a materialized run without conflating a bounded surgical horizon
 * with an unfinished natural run.
 */
export function materializedRunStatus({ failures, finalTick, maxTicks, fixedTicks, surgical, terminated }) {
  if (failures.length > 0) return "failed";
  if (surgical) return finalTick === maxTicks && fixedTicks === maxTicks ? "passed" : "truncated";
  return terminated ? "passed" : "truncated";
}

/** A CLI run is successful only when its materialized artifact says so. */
export function isPassedTearBenchRunArtifact(path) {
  try {
    const artifact = JSON.parse(readFileSync(path, "utf8"));
    return artifact?.format === "tearbench-run" && artifact.status === "passed";
  } catch {
    return false;
  }
}
