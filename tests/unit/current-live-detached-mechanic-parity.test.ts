import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { replayProductionC27ATrace, type ProductionC27ATrace } from "../../src/tearbench/production-c27a-matrix";
import { validateTearContract } from "../../src/tearbench";

const SELECTED_SCENARIO_ID = "c27a.live-parity-trace";
const defaultArtifact = resolve("artifacts/tearbench/c27a", `${SELECTED_SCENARIO_ID}.json`);
const requestedArtifact = process.env.TEAR_C27A_PARITY_ARTIFACT;
const artifactPath = resolve(requestedArtifact ?? defaultArtifact);
const parityRequired = requestedArtifact !== undefined || process.env.TEAR_C27A_PARITY_REQUIRED === "1";

interface MechanicalState {
  readonly player: Readonly<{ x: number; y: number }> | null;
  readonly blade: Readonly<{ state: string; x: number; y: number }> | null;
}

function readTrace(): ProductionC27ATrace {
  const value: unknown = JSON.parse(readFileSync(artifactPath, "utf8"));
  if (typeof value !== "object" || value === null) throw new TypeError("C27A parity artifact must be an object");
  const raw = value as { scenario?: unknown; origin?: unknown };
  const scenario = validateTearContract(raw.scenario);
  const origin = validateTearContract(raw.origin);
  if (!scenario.ok || scenario.value.kind !== "scenario") throw new TypeError("C27A parity scenario is invalid");
  if (!origin.ok || origin.value.kind !== "snapshot") throw new TypeError("C27A parity origin is invalid");
  return { ...(value as Omit<ProductionC27ATrace, "scenario" | "origin">), scenario: scenario.value, origin: origin.value };
}

describe("current live/detached mechanic parity", () => {
  it("matches the selected live trace through the production detached composition", () => {
    if (!existsSync(artifactPath)) {
      if (parityRequired) throw new Error(`required C27A parity artifact is missing: ${artifactPath}`);
      return;
    }
    const trace = readTrace();
    expect(trace.scenario.id).toBe(SELECTED_SCENARIO_ID);
    expect(trace.scenario.start.weapon).toBe("sword");
    expect(trace.hashes.length).toBeGreaterThanOrEqual(40);
    expect(trace.engineEventProjection.events.every((event) => event.tick > trace.origin.tick)).toBe(true);
    const replay = replayProductionC27ATrace(trace);
    expect(replay.hashes.map(({ tick }) => tick)).toEqual(trace.hashes.map(({ tick }) => tick));
    expect(replay.hashes.map(({ canonical }) => canonical)).toEqual(trace.hashes.map(({ canonical }) => canonical));
    expect(replay.engineEvents).toEqual(trace.engineEventProjection.events);

    const states = trace.hashes.map(({ state }) => state as unknown as MechanicalState);
    const players = states.map(({ player }) => player).filter((player) => player !== null);
    expect(players.length).toBe(trace.hashes.length);
    expect(new Set(players.map((player) => `${String(player.x)}:${String(player.y)}`)).size).toBeGreaterThan(1);
    const blades = states.map(({ blade }) => blade).filter((blade) => blade !== null);
    expect(blades.length).toBe(trace.hashes.length);
    expect(new Set(blades.map((blade) => `${blade.state}:${String(blade.x)}:${String(blade.y)}`)).size).toBeGreaterThan(1);
    expect(Object.values(trace.schedule).flat().some((entry) => entry.command.type === "weapon")).toBe(true);
    const nativeMechanicEvents = trace.engineEventProjection.events.filter((event) => [
      "wave.started", "wave.cleared", "enemy.spawned", "blade.thrown", "blade.caught",
      "blade.throw-resolved", "player.dash-started",
    ].includes(event.type));
    expect(nativeMechanicEvents.length).toBeGreaterThan(0);
  });
});
