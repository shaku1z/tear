import { describe, expect, it } from "vitest";
import {
  EVENT_REGISTRY,
  INVARIANT_REGISTRY,
  TEAR_CONTRACT_FORMAT,
  TEAR_CONTRACT_VERSION,
  createStableRegistry,
  validateTearContract,
  withinTickPhaseOrder,
  type GhostRangeV1,
  type TearCausalEventV1,
  type TearScenarioV1,
} from "../../src/tearbench";

const scenario = (): TearScenarioV1 => Object.freeze({
  format: TEAR_CONTRACT_FORMAT,
  kind: "scenario",
  schemaVersion: TEAR_CONTRACT_VERSION,
  id: "parry-basic",
  version: 1,
  description: "Deflect one projectile without player damage.",
  stateClass: "surgical-valid",
  executionClass: "engineering",
  seed: "1001",
  start: Object.freeze({ mode: "campaign", difficulty: "normal", weapon: "sword", stage: "grounds", wave: 1 }),
  maxTicks: 720,
  assertions: Object.freeze(["runtime.finite-state", "player.valid-health"] as const),
  tags: Object.freeze(["parry", "projectile"] as const),
});

describe("TearBench shared contracts", () => {
  it("round-trips a valid scenario through hostile-input validation", () => {
    const parsed = validateTearContract(JSON.stringify(scenario()));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(scenario());
  });

  it("rejects unknown contract kinds and unregistered assertions", () => {
    expect(validateTearContract({ format: TEAR_CONTRACT_FORMAT, schemaVersion: 1, kind: "unknown" }).ok).toBe(false);
    expect(validateTearContract({ ...scenario(), assertions: ["invented.invariant"] }).ok).toBe(false);
  });

  it("rejects invalid and unbounded scenario values", () => {
    expect(validateTearContract({ ...scenario(), start: { ...scenario().start, weapon: "axe" } }).ok).toBe(false);
    expect(validateTearContract({ ...scenario(), maxTicks: 0 }).ok).toBe(false);
    expect(validateTearContract({ ...scenario(), tags: Array.from({ length: 100_001 }, () => "tag") }).ok).toBe(false);
  });

  it("validates event registry identity and causal timing fields", () => {
    const event: TearCausalEventV1 = {
      format: TEAR_CONTRACT_FORMAT, kind: "event", schemaVersion: 1,
      id: "event-1", type: "combat.perfect-parry", tick: 42,
      phase: "collision-and-damage", sequence: 3, source: "engine", payload: {},
    };
    expect(validateTearContract(event).ok).toBe(true);
    expect(validateTearContract({ ...event, type: "combat.imaginary" }).ok).toBe(false);
    expect(EVENT_REGISTRY.has("combat.perfect-parry")).toBe(true);
    expect(withinTickPhaseOrder("input-canonicalized")).toBeLessThan(withinTickPhaseOrder("presentation-only"));
  });

  it("enforces coherent Ghost ranges", () => {
    const range: GhostRangeV1 = {
      format: TEAR_CONTRACT_FORMAT, kind: "ghost-range", schemaVersion: 1,
      ghostId: "ghost-1", fromTick: 100, toTick: 240, preRollTicks: 30, postRollTicks: 60,
    };
    expect(validateTearContract(range).ok).toBe(true);
    expect(validateTearContract({ ...range, toTick: 99 }).ok).toBe(false);
  });

  it("rejects duplicate or unstable registry IDs", () => {
    expect(() => createStableRegistry("fixture", ["ok.id", "ok.id"])).toThrow(/duplicate/u);
    expect(() => createStableRegistry("fixture", ["Bad ID"])).toThrow(/invalid/u);
    expect(INVARIANT_REGISTRY.assert("runtime.no-softlock")).toBe("runtime.no-softlock");
    expect(() => INVARIANT_REGISTRY.assert("runtime.unknown")).toThrow(/unknown/u);
  });
});
