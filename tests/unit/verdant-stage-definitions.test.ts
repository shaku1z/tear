import { describe, expect, it } from "vitest";

import { stageEnvironmentDefinition } from "../../src/gameplay/environment/stage-environment-definitions";
import { stagePresentationDefinition } from "../../src/presentation/stage-presentation-definitions";

describe("Verdant typed stage registries", () => {
  it("owns bounded stage environment setup without renderer discovery", () => {
    expect(stageEnvironmentDefinition("verdant-sanctum")).toEqual({
      id: "verdant-sanctum-environment",
      stageId: "verdant-sanctum",
      initialFields: [
        { kind: "bloom-well", slot: "left-rise" },
        { kind: "bloom-well", slot: "right-rise" },
      ],
      maximumFields: 3,
      maximumCombatObjects: 8,
      maximumRoutes: 0,
      cleanup: "stage-owned",
    });
    expect(stageEnvironmentDefinition("grounds")).toBeNull();
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
