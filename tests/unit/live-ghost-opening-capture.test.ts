import { describe, expect, it } from "vitest";
import { createLiveGhostOpeningCapture } from "../../src/app/replay/ghost-opening-capture";
import type { TearCausalEventV1 } from "../../src/tearbench/contracts";

function fixture() {
  const events: TearCausalEventV1[] = [], failures: unknown[] = [];
  let screen = "setup", tick = 0, runId: string | undefined = "run-n", sequence = 1, failRecord = false;
  const owner = createLiveGhostOpeningCapture({ screen: () => screen, tick: () => tick, replayRunId: () => runId,
    nextSequence: () => ++sequence, record: (event) => { if (failRecord) throw new Error("storage observation failed"); events.push(event); }, failed: (error) => { failures.push(error); } });
  const boundary = { phase: "opening-initialized-before-run-start" as const, runId: "run-n", seed: 23 };
  const context = { runId: "run-n", seed: "23", ticksPerSecond: 120, build: { version: "unit", revision: "unit", target: "test-standalone" }, rulesetVersion: "live" };
  const createContext = (id = context.runId) => owner.createContext({ ...context, runId: id }, { mode: "endless", diff: "normal", weaponId: "chainblade" }, { values: {} }, { gameplay: { algorithm: "mulberry32", seed: 23, state: 23, cursor: 0 } });
  const capture = () => { owner.withCapture(boundary, () => { createContext(); owner.captured(boundary.runId); }); };
  return { owner, boundary, createContext, capture, events, failures,
    play: () => { screen = "playing"; }, wrongTick: () => { tick = 1; }, wrongRun: () => { runId = "another-run"; }, failRecord: () => { failRecord = true; } };
}

describe("source-owned Ghost opening capture", () => {
  it("records actual scoped predecessor and emits completion once after exposure", () => {
    const f = fixture();
    f.owner.withCapture(f.boundary, () => {
      expect(f.createContext().simulation.opening).toEqual({ version: 1, phase: f.boundary.phase, previousScreen: "setup", destination: "playing", runId: f.boundary.runId });
      f.owner.captured(f.boundary.runId);
    });
    expect(f.events).toEqual([]); f.play(); f.owner.exposed(f.boundary.runId); f.owner.exposed(f.boundary.runId);
    expect(f.events).toHaveLength(1); expect(f.events[0]).toMatchObject({ type: "system.checkpoint", tick: 0, sequence: 2, phase: "pre-simulation", payload: { boundary: "recorded-opening-playing-exposed", runId: "run-n", screen: "playing" } });
    expect(f.createContext().simulation).not.toHaveProperty("opening");
  });

  it("never attests generic/debug recording even if captured/exposed are called", () => {
    const f = fixture(); expect(f.createContext().simulation).not.toHaveProperty("opening");
    f.owner.captured("run-n"); f.play(); f.owner.exposed("run-n"); expect(f.events).toEqual([]);
  });

  it("clears an old pending run when the next scoped attempt has no recording observer", () => {
    const f = fixture(); f.capture();
    f.owner.withCapture({ ...f.boundary, runId: "new-run", seed: 24 }, () => undefined);
    f.play(); f.owner.exposed("run-n"); expect(f.events).toEqual([]);
  });

  it.each(["discard", "new recording", "throw"])("clears pending capture on %s and allows a subsequent legitimate run", (kind) => {
    const f = fixture(); f.capture();
    if (kind === "discard") f.owner.discard();
    if (kind === "new recording") f.createContext();
    if (kind === "throw") expect(() => { f.owner.withCapture(f.boundary, () => { f.owner.captured("run-n"); throw new Error("record failed"); }); }).toThrow(/record failed/);
    f.play(); f.owner.exposed("run-n"); expect(f.events).toEqual([]);
    f.capture(); f.owner.exposed("run-n"); expect(f.events).toHaveLength(1);
  });

  it.each(["wrong tick", "wrong run", "not playing"])("refuses %s completion and clears its pending observation", (kind) => {
    const f = fixture(); f.capture();
    if (kind !== "not playing") f.play();
    if (kind === "wrong tick") f.wrongTick();
    if (kind === "wrong run") f.wrongRun();
    f.owner.exposed("run-n"); expect(f.events).toEqual([]); f.play(); f.owner.exposed("run-n"); expect(f.events).toEqual([]);
  });

  it("refuses mismatched/nested boundaries, clears scope on throw, and isolates observation failure", () => {
    const f = fixture();
    expect(() => { f.owner.withCapture(f.boundary, () => { f.createContext("different"); }); }).toThrow(/does not match/);
    expect(() => { f.owner.withCapture(f.boundary, () => { f.owner.withCapture(f.boundary, () => undefined); }); }).toThrow(/nested/);
    expect(f.createContext().simulation).not.toHaveProperty("opening");
    f.capture(); f.play(); f.failRecord(); expect(() => { f.owner.exposed("run-n"); }).not.toThrow();
    expect(f.failures).toHaveLength(1); f.owner.exposed("run-n"); expect(f.failures).toHaveLength(1);
  });
});
