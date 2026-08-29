import { describe, expect, it } from "vitest";

import { stageEnvironmentDefinition } from "../../src/gameplay/environment/stage-environment-definitions";
import { activateStageEnvironment } from "../../src/gameplay/environment/stage-environment-activation";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { stagePresentationDefinition } from "../../src/presentation/stage-presentation-definitions";

describe("Verdant typed stage registries", () => {
  it("owns bounded stage environment setup without renderer discovery", () => {
    expect(stageEnvironmentDefinition("verdant-sanctum")).toEqual({
      id: "verdant-sanctum-environment",
      stageId: "verdant-sanctum",
      initialFields: [
        { kind: "bloom-well", slot: "left-rise", geometry: { x: 480, y: 285, w: 170, h: 470 } },
        { kind: "bloom-well", slot: "right-rise", geometry: { x: 950, y: 285, w: 170, h: 470 } },
      ],
      maximumFields: 3,
      maximumCombatObjects: 8,
      maximumRoutes: 0,
      cleanup: "stage-owned",
    });
    expect(stageEnvironmentDefinition("grounds")).toBeNull();
  });

  it("loads stage-owned wells at the activation tick and clears them on exit", () => {
    const environment = createEnvironmentRuntime({ stageId: "crimson-fields", worldId: "verdant-stage-test" });
    activateStageEnvironment(environment, "verdant-sanctum", 3_600, "stage-transition");

    expect(environment.stageId).toBe("verdant-sanctum");
    expect(environment.fields()).toHaveLength(2);
    expect(environment.fields()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "verdant-sanctum:bloom-well:left-rise", stageOwnerId: "verdant-sanctum", startTick: 3_600 }),
      expect.objectContaining({ id: "verdant-sanctum:bloom-well:right-rise", stageOwnerId: "verdant-sanctum", startTick: 3_600 }),
    ]));

    activateStageEnvironment(environment, "voidspire", 4_800, "stage-transition");
    expect(environment.stageId).toBe("voidspire");
    expect(environment.fields()).toEqual([]);
    expect(environment.lastClearReason).toBe("stage-transition");
  });

  it("dispatches presentation by stable stage identity", () => {
    expect(stagePresentationDefinition("verdant-sanctum")).toEqual({
      backdropId: "verdant-sanctum",
      platformMaterialId: "verdant-rootstone",
      environmentPresentationId: "verdant-sanctum",
      reflectionPolicy: "lower-field-restrained",
      particlePolicy: "sparse-petals-pollen",
      lowGraphicsPolicy: "silhouette-and-telegraph-only",
    });
    expect(stagePresentationDefinition("grounds")).toBeNull();
  });
});
