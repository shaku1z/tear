import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  firstProductionC27AHashDivergence,
  replayProductionC27AMatrix,
  validateTearContract,
  type ProductionC27ATrace,
} from "../../src/tearbench";

const ARTIFACT_DIR = resolve("artifacts/tearbench/checkpoints/core/C27A/live-parity");

function traceFromArtifact(value: unknown): ProductionC27ATrace {
  if (typeof value !== "object" || value === null) throw new TypeError("C27A trace artifact must be an object");
  const raw = value as { scenario?: unknown; origin?: unknown };
  const scenario = validateTearContract(raw.scenario);
  const origin = validateTearContract(raw.origin);
  if (!scenario.ok || scenario.value.kind !== "scenario") throw new TypeError("C27A trace scenario is not valid");
  if (!origin.ok || origin.value.kind !== "snapshot") throw new TypeError("C27A trace origin is not valid");
  return { ...(value as Omit<ProductionC27ATrace, "scenario" | "origin">), scenario: scenario.value, origin: origin.value };
}

function readTraces(): readonly ProductionC27ATrace[] {
  if (!existsSync(ARTIFACT_DIR)) return [];
  return readdirSync(ARTIFACT_DIR)
    .filter((name) => name.startsWith("c27a.live-parity-trace") && name.endsWith(".json"))
    .sort()
    .map((name) => traceFromArtifact(JSON.parse(readFileSync(resolve(ARTIFACT_DIR, name), "utf8"))));
}

const traces = readTraces();
const results = traces.length === 0 ? [] : replayProductionC27AMatrix(traces);

describe.skipIf(traces.length === 0)("C30 recorded-origin C27A matrix adapter", () => {
  it("replays every captured origin through the C29 source composition", () => {
    expect(traces).toHaveLength(13);
    expect(results.map((entry) => entry.id)).toEqual(traces.map((trace) => trace.scenario.id));
    expect(results.every((entry) => entry.status === "replayed")).toBe(true);
  });

  for (const [index, trace] of traces.entries()) {
    it(`records the exact live C27A receipts (${trace.scenario.id})`, () => {
      const result = results[index]?.result;
      expect(result).toBeDefined();
      if (result === undefined) throw new Error(`${trace.scenario.id} did not return a source replay receipt`);
      expect(result.hashes).toHaveLength(trace.hashes.length);
      expect(result.hashes.map((receipt) => receipt.tick)).toEqual(trace.hashes.map((receipt) => receipt.tick));
      expect(firstProductionC27AHashDivergence(trace, result)).toBeNull();
      expect(result.engineEvents).toEqual(trace.engineEventProjection.events);
      expect(result.routeBoundaries).toEqual(trace.routeBoundaries ?? []);
    });
  }
});
