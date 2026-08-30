import { describe, expect, it } from "vitest";

import { STAGES } from "../../src/gameplay/stages";
import { activateStageEnvironment } from "../../src/gameplay/environment/stage-environment-activation";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { createVerdantEnvironmentFeature } from "../../src/gameplay/environment/verdant-environment-feature";
import { createPaleEnvironmentFeature } from "../../src/gameplay/environment/pale-environment-feature";

function runtime() {
  return createEnvironmentRuntime({ stageId: "grounds", worldId: "official-transitions",
    features: [createVerdantEnvironmentFeature(), createPaleEnvironmentFeature()] });
}

function addTransientOwnership(environment: ReturnType<typeof runtime>, ownerId: string): void {
  environment.addCombatObject({ kind: "root-link", ownerId, targetId: "player", geometry: { x: 10, y: 10 },
    integrity: 1, maxIntegrity: 1, counterplayTags: ["cut"], procEligible: false,
    damageDedupeId: `${ownerId}:damage`, state: "active", stateTick: 0, cleanupReason: null });
  environment.addRoute({ kind: "regrowth-link", ownerId, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
    state: "active", stateTick: 0, cleanupReason: null });
}

describe("official six-stage environment transitions", () => {
  it("proves Crimson to Verdant activation, then complete Verdant cleanup into Voidspire", () => {
    const environment = runtime();
    activateStageEnvironment(environment, "crimson-fields", 300, "stage-transition");
    addTransientOwnership(environment, "crimson-fields");
    activateStageEnvironment(environment, "verdant-sanctum", 400, "stage-transition");
    expect(environment.stageId).toBe("verdant-sanctum");
    expect(environment.fields().map((field) => field.kind)).toEqual(["bloom-well", "bloom-well"]);
    expect(environment.combatObjects()).toEqual([]);
    expect(environment.routes()).toEqual([]);

    addTransientOwnership(environment, "enemy:rootbound");
    activateStageEnvironment(environment, "voidspire", 500, "stage-transition");
    expect(environment.snapshot()).toMatchObject({ stageId: "voidspire", fields: [], combatObjects: [], routes: [] });
    expect(environment.lastClearReason).toBe("stage-transition");
  });

  it("proves complete Voidspire cleanup into The Tear", () => {
    const environment = runtime();
    activateStageEnvironment(environment, "voidspire", 500, "stage-transition");
    environment.addField({ kind: "rootline", ownerId: "voidspire", geometry: { x: 0, y: 0, w: 100, h: 100 },
      state: "active", stateTick: 500, timer: 0, schedule: null,
      eligibility: { player: true, enemies: false, bosses: false }, force: null, cleanupReason: null });
    addTransientOwnership(environment, "voidspire");
    activateStageEnvironment(environment, "tear", 600, "stage-transition");
    expect(environment.snapshot()).toMatchObject({ stageId: "tear", fields: [], combatObjects: [], routes: [] });
  });

  it("never materializes Pale environment state while traversing the official campaign", () => {
    const environment = runtime();
    for (const [index, stage] of STAGES.entries()) {
      activateStageEnvironment(environment, stage.id, index * 100, index === 0 ? "new-run" : "stage-transition");
      expect(environment.stageId).not.toBe("pale-traverse");
      expect(environment.fields().some((field) => field.kind === "aurora-track"), stage.id).toBe(false);
      expect(environment.routes().some((route) => route.kind === "ghost-track"), stage.id).toBe(false);
    }
    expect(STAGES.map((stage) => stage.id)).toEqual([
      "grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear",
    ]);
  });
});
