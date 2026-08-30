import { describe, expect, it } from "vitest";
import type { TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { paleTelemetryIntents } from "../../src/gameplay/progression/pale-telemetry";

const event = (value: TearGameplayEvent): TearGameplayEvent => value;

describe("Pale telemetry ownership", () => {
  it("maps only Pale stage entry and Aurora activation facts", () => {
    expect(paleTelemetryIntents(event({ kind: "stage", tick: 1, stage: 6,
      stageId: "pale-traverse", transition: "entered" })))
      .toEqual([{ type: "profile-max", stat: "paleEntered", value: 1 }]);
    expect(paleTelemetryIntents(event({ kind: "environment", tick: 2,
      event: "field-started", objectId: "track:1", category: "field", objectKind: "aurora-track" })))
      .toEqual([{ type: "profile-add", stat: "auroraTracksActivated", amount: 1 }]);
    expect(paleTelemetryIntents(event({ kind: "stage", tick: 3, stage: 3,
      stageId: "verdant-sanctum", transition: "entered" }))).toEqual([]);
  });
});
