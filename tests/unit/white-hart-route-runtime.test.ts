import { describe, expect, it } from "vitest";

import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import type { WhiteHartEnvironmentActor } from "../../src/gameplay/environment/pale-environment-feature";
import { bindPaleEnvironmentActors } from "./environment-feature-fixture";
import type { WhiteHartEnvironmentRequest } from "../../src/gameplay/environment/white-hart-route-runtime";
import { environmentHash } from "../../src/tearbench/environment-codec";

function request(sequence: number, threatening = true): WhiteHartEnvironmentRequest {
  return Object.freeze({ sequence, phase: 2, kind: "ghost-track", direction: 1, width: 54, damage: 16,
    threatening, points: Object.freeze([{ x: 0, y: 100 }, { x: 800, y: 100 }]) });
}

describe("White Hart shared route runtime", () => {
  it("caps Ghost Tracks at three, advances warning/active/expiry, and persists damage dedupe in the hash", () => {
    const runtime = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "white-hart-routes" });
    let requests: readonly WhiteHartEnvironmentRequest[] = [request(1), request(2), request(3), request(4)];
    const damage: number[] = [];
    const actor: WhiteHartEnvironmentActor = {
      id: "hart", source: { kind: "white-hart" },
      state: { phase: 2, get requests() { return requests; } },
      acknowledgeRequests: (through) => { requests = requests.filter((entry) => entry.sequence > through); },
      player: { id: "player", x: 400, y: 100, hw: 18, hh: 36, invulnerable: false,
        hazardDamageMultiplier: 1, takeDamage: (amount: number) => { damage.push(amount); } },
    };
    bindPaleEnvironmentActors(runtime, "white-hart", () => [actor]);
    runtime.step(0, 1 / 120, () => undefined, new Set(["hart", "player"]));
    expect(runtime.routes().filter((route) => route.state !== "expired")).toHaveLength(3);
    expect(requests).toHaveLength(0);
    for (let tick = 1; tick <= 72; tick += 1) runtime.step(tick, 1 / 120, () => undefined, new Set(["hart", "player"]));
    expect(runtime.routes().every((route) => route.state === "active")).toBe(true);
    expect(damage).toEqual([16, 16, 16]);
    const hitHash = environmentHash(runtime.snapshot());
    runtime.step(73, 1 / 120, () => undefined, new Set(["hart", "player"]));
    expect(damage).toHaveLength(3);
    expect(environmentHash(runtime.snapshot())).not.toBe(environmentHash({
      ...runtime.snapshot(), routes: runtime.routes().map((route) => ({ ...route, hitActorIds: [] })),
    }));
    expect(environmentHash(runtime.snapshot())).toBe(hitHash);
    for (let tick = 74; tick <= 132; tick += 1) runtime.step(tick, 1 / 120, () => undefined, new Set(["hart", "player"]));
    expect(runtime.routes().every((route) => route.state === "expired")).toBe(true);
  });

  it("keeps decoys harmless, respects invulnerability, and expires prior-phase routes", () => {
    const runtime = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "white-hart-decoy" });
    let phase: 1 | 2 | 3 = 2, requests: readonly WhiteHartEnvironmentRequest[] = [request(1, false)];
    const damage: number[] = [];
    bindPaleEnvironmentActors(runtime, "white-hart", () => [{
      id: "hart", source: {}, state: { phase, requests },
      acknowledgeRequests: () => { requests = []; },
      player: { id: "player", x: 400, y: 100, hw: 18, hh: 36, invulnerable: false,
        hazardDamageMultiplier: 1, takeDamage: (amount: number) => { damage.push(amount); } },
    }]);
    for (let tick = 0; tick <= 72; tick += 1) runtime.step(tick, 1 / 120, () => undefined, new Set(["hart", "player"]));
    expect(damage).toEqual([]);
    phase = 3; runtime.step(73, 1 / 120, () => undefined, new Set(["hart", "player"]));
    expect(runtime.routes()[0]).toMatchObject({ state: "expired", cleanupReason: "natural-expiry" });
  });

  it("installs a boss wake through the same field collection and preserves two-world isolation", () => {
    const make = (worldId: string) => {
      const runtime = createEnvironmentRuntime({ stageId: "pale-traverse", worldId });
      let requests: readonly WhiteHartEnvironmentRequest[] = [Object.freeze({ sequence: 1, phase: 2,
        kind: "boss-wake", direction: 1, geometry: Object.freeze({ x: 80, y: 620, w: 900, h: 72 }),
        patternId: "white-hart-frozen-wake" })];
      bindPaleEnvironmentActors(runtime, "white-hart", () => [{ id: "hart", source: {}, state: { phase: 2, requests },
        acknowledgeRequests: () => { requests = []; } }]);
      runtime.step(0, 1 / 120, () => undefined, new Set(["hart"]));
      return runtime;
    };
    const first = make("wake-a"), second = make("wake-b");
    expect(first.fields()[0]).toMatchObject({ kind: "aurora-track", variant: "boss-wake",
      patternId: "white-hart-frozen-wake", maximumConcurrent: 3 });
    first.clear("stage-transition");
    expect(first.fields()).toHaveLength(0); expect(second.fields()).toHaveLength(1);
  });
});
