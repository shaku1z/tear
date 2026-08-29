import { describe, expect, it } from "vitest";

import { activateStageEnvironment } from "../../src/gameplay/environment/stage-environment-activation";
import { stageEnvironmentDefinition } from "../../src/gameplay/environment/stage-environment-definitions";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { stagePresentationDefinition } from "../../src/presentation/stage-presentation-definitions";

describe("Pale typed stage environment", () => {
  it("routes the stable Pale identity to its bounded presentation policies", () => {
    expect(stagePresentationDefinition("pale-traverse")).toEqual({
      backdropId: "pale-traverse",
      platformMaterialId: "pale-ice",
      environmentPresentationId: "pale-traverse",
      reflectionPolicy: "frozen-lower-field",
      particlePolicy: "sparse-snow",
      lowGraphicsPolicy: "silhouette-and-telegraph-only",
    });
  });

  it("installs bounded directional Aurora Tracks and clears them on exit", () => {
    expect(stageEnvironmentDefinition("pale-traverse")).toMatchObject({
      id: "pale-traverse-environment", maximumFields: 4, maximumCombatObjects: 8, maximumRoutes: 3,
      cleanup: "stage-owned",
    });
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "pale-stage-test" });
    activateStageEnvironment(environment, "pale-traverse", 4_800, "stage-transition");
    expect(environment.stageId).toBe("pale-traverse");
    expect(environment.fields()).toHaveLength(3);
    expect(environment.fields().map((field) => ({ id: field.id, kind: field.kind,
      direction: (field as { direction?: number }).direction, state: field.state }))).toEqual([
      { id: "pale-traverse:aurora-track:lower-east", kind: "aurora-track", direction: 1, state: "warning" },
      { id: "pale-traverse:aurora-track:crossing-west", kind: "aurora-track", direction: -1, state: "warning" },
      { id: "pale-traverse:aurora-track:upper-east", kind: "aurora-track", direction: 1, state: "warning" },
    ]);
    activateStageEnvironment(environment, "voidspire", 6_000, "stage-transition");
    expect(environment.fields()).toEqual([]);
    expect(environment.lastClearReason).toBe("stage-transition");
  });
});
