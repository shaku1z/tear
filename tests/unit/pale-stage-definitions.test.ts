import { describe, expect, it } from "vitest";

import { activateStageEnvironment } from "../../src/gameplay/environment/stage-environment-activation";
import { stageEnvironmentDefinition } from "../../src/gameplay/environment/stage-environment-definitions";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { stagePresentationDefinition } from "../../src/presentation/stage-presentation-definitions";

describe("Pale typed stage environment", () => {
  it("routes the stable Pale identity to its bounded presentation policies", () => {
    expect(stagePresentationDefinition("pale-traverse")).toEqual({
      platformMaterialId: "pale-ice",
    });
  });

  it("installs its Aurora Tracks on their surfaces, waking in turn, and clears them on exit", () => {
    expect(stageEnvironmentDefinition("pale-traverse")).toMatchObject({
      id: "pale-traverse-environment",
      maximumFields: 4,
      maximumCombatObjects: 8,
      maximumRoutes: 3,
      cleanup: "stage-owned",
    });
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "pale-stage-test" });
    activateStageEnvironment(environment, "pale-traverse", 4_800, "stage-transition", 800);
    expect(environment.stageId).toBe("pale-traverse");
    expect(environment.fields()).toHaveLength(3);
    expect(
      environment.fields().map((field) => ({
        id: field.id,
        kind: field.kind,
        direction: (field as { direction?: number }).direction,
        startTick: (field as { startTick?: number }).startTick,
        geometry: field.geometry,
      })),
    ).toEqual([
      {
        id: "pale-traverse:aurora-track:floor-east",
        kind: "aurora-track",
        direction: 1,
        startTick: 4_800,
        geometry: { x: 200, y: 730, w: 1_200, h: 70 },
      },
      {
        id: "pale-traverse:aurora-track:crossing-west",
        kind: "aurora-track",
        direction: -1,
        startTick: 5_104,
        geometry: { x: 560, y: 440, w: 480, h: 70 },
      },
      {
        id: "pale-traverse:aurora-track:low-west-east",
        kind: "aurora-track",
        direction: 1,
        startTick: 5_408,
        geometry: { x: 140, y: 570, w: 400, h: 70 },
      },
    ]);
    activateStageEnvironment(environment, "voidspire", 6_000, "stage-transition", 800);
    expect(environment.fields()).toEqual([]);
    expect(environment.lastClearReason).toBe("stage-transition");
  });
});
