import { describe, expect, it } from "vitest";

import { createLiveGhostBootstrapEvent, createLiveGhostCausalEvent } from "../../src/ghost";
import { validateTearContract } from "../../src/tearbench";

describe("Ghost V3 causal event adapter", () => {
  it("adapts the Ghost 2 observer feed without mutating its event shape", () => {
    const event = createLiveGhostCausalEvent({
      kind: "spawn", tick: 12, actorId: "enemy:7", actorKind: "charger", x: 32, y: 48,
    }, 3);
    expect(event).toMatchObject({ id: "ghost-live-3", type: "enemy.spawned", tick: 12, sequence: 3, actorId: "enemy:7" });
    expect(validateTearContract(event)).toMatchObject({ ok: true });
  });

  it("records a valid sidecar opening boundary without inventing a complete run.started event", () => {
    const event = createLiveGhostBootstrapEvent("ghost-v3/run", { seed: "7" });
    expect(event).toMatchObject({ type: "system.checkpoint", tick: 0, sequence: 0, payload: { boundary: "v3-sidecar-opened" } });
    expect(validateTearContract(event)).toMatchObject({ ok: true });
  });

  it("maps authoritative native run transitions to their stable causal event IDs", () => {
    const transitions = [
      ["started", "run.started"], ["paused", "run.paused"], ["resumed", "run.resumed"], ["completed", "run.completed"],
      ["defeated", "run.defeated"], ["abandoned", "run.abandoned"],
    ] as const;
    for (const [transition, type] of transitions) {
      const event = createLiveGhostCausalEvent({
        kind: "run", tick: 42, transition, runId: "run-42", mode: "endless", difficulty: "normal",
        weaponId: "sword", wave: 3, score: 900, runTimeSeconds: 12.5,
      }, 42);
      expect(event).toMatchObject({ type, tick: 42, payload: { runId: "run-42", wave: 3, score: 900 } });
      expect(validateTearContract(event)).toMatchObject({ ok: true });
    }
  });
});
