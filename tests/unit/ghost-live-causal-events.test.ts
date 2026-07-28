import { describe, expect, it } from "vitest";

import { createLiveGhostBootstrapEvent, createLiveGhostCausalEvent } from "../../src/ghost";
import { validateTearContract } from "../../src/tearbench";

describe("Ghost V3 causal event adapter", () => {
  it("adapts the Ghost 2 observer feed without mutating its event shape", () => {
    const event = createLiveGhostCausalEvent({ kind: "spawn", tick: 12, actorId: 7, actorKind: "charger" }, 3);
    expect(event).toMatchObject({ id: "ghost-live-3", type: "enemy.spawned", tick: 12, sequence: 3, actorId: "enemy-7" });
    expect(validateTearContract(event)).toMatchObject({ ok: true });
  });

  it("records a valid sidecar opening boundary without inventing a complete run.started event", () => {
    const event = createLiveGhostBootstrapEvent("ghost-v3/run", { seed: "7" });
    expect(event).toMatchObject({ type: "system.checkpoint", tick: 0, sequence: 0, payload: { boundary: "v3-sidecar-opened" } });
    expect(validateTearContract(event)).toMatchObject({ ok: true });
  });
});
