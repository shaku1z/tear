import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { replayProductionC27ATrace, type ProductionC27ATrace } from "../../src/tearbench/production-c27a-matrix";
import { validateTearContract } from "../../src/tearbench";
import { readSourceIdentitySync } from "../../scripts/release-artifact.mjs";

const SELECTED_SCENARIO_ID = "c27a.live-parity-trace";
const focusedArtifact = resolve("artifacts/tearbench/c27a-focused", `${SELECTED_SCENARIO_ID}.json`);
const matrixArtifact = resolve("artifacts/tearbench/c27a", `${SELECTED_SCENARIO_ID}.json`);
const defaultArtifact = existsSync(focusedArtifact) ? focusedArtifact : matrixArtifact;
const requestedArtifact = process.env.TEAR_C27A_PARITY_ARTIFACT;
const artifactPath = resolve(requestedArtifact ?? defaultArtifact);
const parityRequired = requestedArtifact !== undefined || process.env.TEAR_C27A_PARITY_REQUIRED === "1";

interface TraceIdentity {
  readonly sourceIdentity?: Readonly<{ revision?: unknown; state?: unknown; fingerprint?: unknown }>;
  readonly buildIdentity?: Readonly<{ sha?: unknown; target?: unknown; artifactHash?: unknown }>;
}

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
  const identity = value as TraceIdentity;
  const current = readSourceIdentitySync(resolve("."));
  if (identity.sourceIdentity?.revision !== current.revision
    || identity.sourceIdentity.state !== "clean"
    || identity.sourceIdentity.fingerprint !== current.fingerprint) {
    throw new Error("C27A parity artifact source identity is stale or not clean");
  }
  if (identity.buildIdentity?.sha !== current.revision
    || identity.buildIdentity.target !== "standalone"
    || typeof identity.buildIdentity.artifactHash !== "string"
    || identity.buildIdentity.artifactHash.length !== 64) {
    throw new Error("C27A parity artifact build identity is stale or invalid");
  }
  return { ...(value as Omit<ProductionC27ATrace, "scenario" | "origin">), scenario: scenario.value, origin: origin.value };
}

describe.skipIf(!parityRequired)("current live/detached mechanic parity", () => {
  it("matches the selected live trace through the production detached composition", () => {
    if (!existsSync(artifactPath)) {
      throw new Error(`required C27A parity artifact is missing: ${artifactPath}`);
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
    const bladeStates = new Set(blades.map(({ state }) => state));
    expect(bladeStates.has("held")).toBe(true);
    expect(bladeStates.has("flying")).toBe(true);
    const commands = Object.values(trace.schedule).flat().map((entry) => entry.command);
    expect(commands.some((command) => command.type === "weapon" && command.intent === "throw")).toBe(true);
    expect(commands.some((command) => command.type === "weapon" && command.intent === "recall")).toBe(true);
    const swordTransport = trace.engineEventProjection.events.filter((event) =>
      event.type === "blade.thrown" || event.type === "blade.caught");
    expect(swordTransport.map(({ type }) => type)).toEqual(["blade.thrown", "blade.caught"]);
    expect(swordTransport.every((event) => event.payload.weaponId === "sword")).toBe(true);
  });
});
