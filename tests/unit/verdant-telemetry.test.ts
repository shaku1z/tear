import { describe, expect, it, vi } from "vitest";
import { verdantTelemetryIntents } from "../../src/gameplay/progression/verdant-telemetry";
import { executeEnvironmentTelemetryIntents } from "../../src/gameplay/progression/environment-telemetry";
import type { TearGameplayEvent, UntickedTearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";

const event = (value: UntickedTearGameplayEvent): TearGameplayEvent => ({ ...value, tick: 12 });

describe("Verdant telemetry", () => {
  it("maps stable stage and environment facts to exact profile statistics", () => {
    expect(verdantTelemetryIntents(event({ kind: "stage", stage: 3, stageId: "verdant-sanctum", transition: "entered" })))
      .toEqual([{ type: "profile-max", stat: "verdantEntered", value: 1 }]);
    expect(verdantTelemetryIntents(event({ kind: "environment", event: "field-started", objectId: "well:1", category: "field", objectKind: "bloom-well" })))
      .toEqual([{ type: "profile-add", stat: "bloomWellsActivated", amount: 1 }]);
    expect(verdantTelemetryIntents(event({ kind: "environment", event: "combat-object-destroyed", objectId: "link:1", category: "combat-object", objectKind: "root-link" })))
      .toEqual([{ type: "profile-add", stat: "rootLinksSevered", amount: 1 }]);
    expect(verdantTelemetryIntents(event({ kind: "environment", event: "combat-object-destroyed", objectId: "graft:1", category: "combat-object", objectKind: "graft-anchor" })))
      .toEqual([{ type: "profile-add", stat: "graftsDestroyed", amount: 1 }]);
  });

  it("ignores presentation-ambiguous facts and executes through the profile port", () => {
    expect(verdantTelemetryIntents(event({ kind: "environment", event: "combat-object-damaged", objectId: "link:1", category: "combat-object", objectKind: "root-link", integrity: 1 }))).toEqual([]);
    expect(verdantTelemetryIntents(event({ kind: "stage", stage: 3, stageId: "verdant-sanctum", transition: "exited" }))).toEqual([]);
    const add = vi.fn(), max = vi.fn();
    executeEnvironmentTelemetryIntents([
      { type: "profile-add", stat: "rootLinksSevered", amount: 1 },
      { type: "profile-add", stat: "auroraTracksActivated", amount: 1 },
      { type: "profile-max", stat: "verdantEntered", value: 1 },
      { type: "profile-max", stat: "paleEntered", value: 1 },
    ], { add, max });
    expect(add).toHaveBeenCalledWith("rootLinksSevered", 1);
    expect(add).toHaveBeenCalledWith("auroraTracksActivated", 1);
    expect(max).toHaveBeenCalledWith("verdantEntered", 1);
    expect(max).toHaveBeenCalledWith("paleEntered", 1);
  });
});
