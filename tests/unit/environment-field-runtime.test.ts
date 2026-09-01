import { describe, expect, it } from "vitest";
import { advanceEnvironmentField, environmentFieldContainsPoint } from "../../src/gameplay/environment/field-runtime";
import type { EnvironmentFieldState } from "../../src/gameplay/environment/environment-contracts";
import { forgeEnvironmentFieldState } from "../../src/tearbench/state-forge-factories";
import { buildEnvironmentPresentationSnapshot } from "../../src/gameplay/environment/presentation-snapshot";
import type { TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import { resolveTearSdl } from "../../src/tearbench/tearsdl";
import { compileResolvedTearSdlSnapshot } from "../../src/tearbench/state-forge-live-compiler";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";

const field: EnvironmentFieldState = {
  id: "field-test", kind: "bloom-well", geometry: { x: 10, y: 20, radius: 5 }, state: "scheduled", stateTick: 0,
  timer: 0, ownerId: null, schedule: { startTick: 3, endTick: 5 }, eligibility: { player: true, enemies: false, bosses: false }, force: null, cleanupReason: null,
};

describe("generic environment field kernel", () => {
  it("reuses presentation projections for one immutable environment snapshot", () => {
    const runtime = createEnvironmentRuntime({ stageId: "stage", worldId: "presentation-cache" });
    const source = runtime.snapshot();
    expect(buildEnvironmentPresentationSnapshot(source)).toBe(buildEnvironmentPresentationSnapshot(source));
  });

  it("advances bounded lifecycle and answers active geometry queries", () => {
    const active = advanceEnvironmentField(field, 3, 1 / 60);
    expect(active.transition).toMatchObject({ previousState: "scheduled", nextState: "active" });
    expect(environmentFieldContainsPoint(active.field, 10, 20)).toBe(true);
    expect(environmentFieldContainsPoint(active.field, 20, 20)).toBe(false);
    const expired = advanceEnvironmentField(active.field, 5, 1 / 60);
    expect(expired.field.state).toBe("expired");
    expect(expired.field.cleanupReason).toBe("natural-expiry");
  });

  it("publishes lifecycle transitions at the supplied authoritative tick", () => {
    const events = new TearGameplayEventBus(() => 99);
    const received: number[] = [];
    events.subscribe((event) => received.push(event.tick));
    advanceEnvironmentField(field, 3, 1 / 60, "stage-transition", events);
    expect(received).toEqual([3]);
  });

  it("does not mutate terminal fields or accept invalid timing", () => {
    expect(advanceEnvironmentField({ ...field, state: "destroyed" }, 3, 1 / 60)).toEqual({ field: { ...field, state: "destroyed" } });
    expect(() => advanceEnvironmentField(field, -1, 1 / 60)).toThrow(/tick/u);
    expect(() => advanceEnvironmentField(field, 1, 0)).toThrow(/duration/u);
  });

  it("is State Forge-approved and produces data-only presentation facts", () => {
    const base: TearSdlDocumentV1 = {
      format: "tearsdl", schemaVersion: 1, id: "field-forge", stateClass: "surgical-valid", seed: "field-forge",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" },
    };
    const forged = forgeEnvironmentFieldState(base, field);
    const entry = (forged.state?.environment as { fields: readonly Record<string, unknown>[] }).fields[0];
    expect(entry?.factoryId).toBe("environment-field");
    const view = buildEnvironmentPresentationSnapshot({ stageId: "stage", fields: [field], combatObjects: [], routes: [] });
    expect(view.fields[0]).toMatchObject({ id: "field-test", active: false });
    expect("draw" in view).toBe(false);
  });

  it("keeps forged environment payload through the live compiler", () => {
    const base: TearSdlDocumentV1 = {
      format: "tearsdl", schemaVersion: 1, id: "field-forge", stateClass: "surgical-valid", seed: "field-forge",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" },
    };
    const resolved = resolveTearSdl(forgeEnvironmentFieldState(base, field));
    expect(resolved.document.state?.environment).toBeDefined();
    const source = { state: {
      "tear.hazard.v1": { slowZones: [], walls: [], fields: [], combatObjects: [], routes: [] },
      "tear.run.v1": {}, "tear.player.v1": {}, "tear.blade.v1": {}, "tear.ui.v1": {}, "tear.world.v1": {},
    } } as unknown as Parameters<typeof compileResolvedTearSdlSnapshot>[0];
    const compiled = compileResolvedTearSdlSnapshot(source, resolved);
    expect((compiled.state["tear.hazard.v1"] as { fields: unknown[] }).fields).toHaveLength(1);
  });
});
