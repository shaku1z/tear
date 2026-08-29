import { describe, expect, it } from "vitest";
import {
  ROOTBINDER_TIMING,
  activateElasticLeash,
  advanceRootbinder,
  applyElasticLeashForce,
  breakElasticLeash,
  createElasticLeash,
  createRootNetwork,
  createRootbinderState,
  isElasticLeashValid,
  redistributeRootNetworkKnockback,
  type RootbinderCandidate,
} from "../../src/gameplay/entities/rootbinder-runtime";

const rootbinder = createRootbinderState({ id: "rb-1", worldId: "world-a", stageId: "stage-1", x: 400, y: 420 });

describe("Rootbinder runtime", () => {
  it("owns the deterministic reposition through recover state machine", () => {
    expect(rootbinder.state).toBe("reposition");
    expect(rootbinder.transitionTick).toBe(ROOTBINDER_TIMING.repositionTicks);
    const planted = advanceRootbinder(rootbinder, ROOTBINDER_TIMING.repositionTicks + ROOTBINDER_TIMING.plantWindupTicks + ROOTBINDER_TIMING.plantedTicks);
    expect(planted.state).toBe("link-warning");
    expect(planted.transitionTick).toBe(planted.stateTick + ROOTBINDER_TIMING.linkWarningTicks);
    const linked = advanceRootbinder(planted, ROOTBINDER_TIMING.linkWarningTicks);
    expect(linked.state).toBe("linked");
    expect(linked.transitionTick).toBe(linked.stateTick + ROOTBINDER_TIMING.linkedTicks);
    expect(advanceRootbinder(linked, ROOTBINDER_TIMING.linkedTicks).state).toBe("broken");
  });

  it("accumulates incremental authoritative fixed steps between render frames", () => {
    let current = rootbinder;
    for (let tick = 0; tick < ROOTBINDER_TIMING.repositionTicks; tick += 1) current = advanceRootbinder(current, 1);
    expect(current.state).toBe("plant-windup");
    expect(current.simulationTick).toBe(ROOTBINDER_TIMING.repositionTicks);
    expect(current.transitionTick).toBe(ROOTBINDER_TIMING.repositionTicks + ROOTBINDER_TIMING.plantWindupTicks);
  });

  it("warns with geometry first and applies finite bounded pull without stealing controls", () => {
    const leash = createElasticLeash({ id: "leash-1", worldId: "world-a", stageId: "stage-1", sourceId: "rb-1", playerId: "player", sourceX: 100, sourceY: 200, playerX: 300, playerY: 200, radius: 120 });
    expect(leash.state).toBe("warning");
    expect(leash.geometry).toMatchObject({ x: 100, y: 200, radius: 120 });
    const player = { x: 300, y: 200, vx: 11, vy: -8, jumpEnabled: true, dashEnabled: true };
    expect(applyElasticLeashForce(leash, player)).toEqual(player);
    const moved = applyElasticLeashForce(activateElasticLeash(leash, 48), player);
    expect(Number.isFinite(moved.vx) && Number.isFinite(moved.vy)).toBe(true);
    expect(Math.abs(moved.vx - player.vx)).toBeLessThanOrEqual(leash.force.magnitude);
    expect(moved.jumpEnabled).toBe(true);
    expect(moved.dashEnabled).toBe(true);
    expect(moved.vx).not.toBe(0);
    const fixedStep = applyElasticLeashForce(activateElasticLeash(leash, 48), player, 1 / ROOTBINDER_TIMING.ticksPerSecond);
    expect(Math.abs(fixedStep.vx - player.vx)).toBeLessThanOrEqual(leash.force.magnitude / ROOTBINDER_TIMING.ticksPerSecond);
  });

  it("rejects invalid leash references and builds a bounded partial network", () => {
    expect(() => createElasticLeash({ id: "bad", worldId: "world-a", stageId: "stage-1", sourceId: "rb-1", playerId: "player", sourceX: 0, sourceY: 0, playerX: 0, playerY: 0, radius: 0 })).toThrow();
    const candidate = (id: string, overrides: Partial<RootbinderCandidate> = {}): RootbinderCandidate => ({ id, worldId: "world-a", stageId: "stage-1", kind: "ordinary", x: 100, y: 100, dead: false, dying: false, ...overrides });
    const segments = createRootNetwork({ id: "network-1", worldId: "world-a", stageId: "stage-1", ownerId: "rb-1", sourceX: 0, sourceY: 0 }, [candidate("a"), candidate("b"), candidate("rb", { kind: "rootbinder" }), candidate("boss", { kind: "boss" }), candidate("dead", { dead: true })]);
    expect(segments).toHaveLength(2);
    expect(segments.every((segment) => !segment.procEligible && segment.ownerId === "rb-1")).toBe(true);
    expect(new Set(segments.map((segment) => segment.targetId)).size).toBe(2);
  });

  it("breaks links on sever, death, stage mismatch, invalidity, or natural expiry", () => {
    const leash = createElasticLeash({ id: "leash-2", worldId: "world-a", stageId: "stage-1", sourceId: "rb-1", playerId: "player", sourceX: 0, sourceY: 0, playerX: 150, playerY: 0, radius: 100 });
    const valid = { worldId: "world-a", stageId: "stage-1", currentTick: 10, expiryTick: 100, sourceAlive: true, playerAlive: true, severed: false };
    expect(isElasticLeashValid(activateElasticLeash(leash, 1), valid)).toBe(true);
    expect(isElasticLeashValid(leash, { ...valid, stageId: "stage-2" })).toBe(false);
    expect(isElasticLeashValid({ ...leash, state: "expired" }, valid)).toBe(false);
    expect(breakElasticLeash(leash, "sever")).toMatchObject({ state: "destroyed", integrity: 0, cleanupReason: "disposal" });
    expect(breakElasticLeash(leash, "death").cleanupReason).toBe("defeat");
    expect(breakElasticLeash(leash, "natural-expiry").cleanupReason).toBe("natural-expiry");
  });

  it("redistributes only bounded partial knockback and never anchors allies", () => {
    const result = redistributeRootNetworkKnockback({ x: 0, y: 0, vx: 120, vy: -240, weight: 1, maxRedistribution: 80, edgeDistance: 20 });
    expect(Math.abs(result.vx)).toBeLessThanOrEqual(200);
    expect(Math.abs(result.vy)).toBeLessThanOrEqual(320);
    expect(result.vx !== 0 || result.vy !== 0).toBe(true);
    expect(result.anchored).toBe(false);
    expect(result.damageReduction).toBe(1);
    expect(result.preventDeath).toBe(false);
  });
});
