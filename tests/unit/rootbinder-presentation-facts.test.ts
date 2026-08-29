import { describe, expect, it } from "vitest";
import { projectRootbinderPresentation } from "../../src/gameplay/environment/rootbinder-presentation-facts";
import { createRootbinderState } from "../../src/gameplay/entities/rootbinder-runtime";
import type { EnvironmentCombatObjectState } from "../../src/gameplay/environment/environment-contracts";

const segment = (id: string, state: EnvironmentCombatObjectState["state"]): EnvironmentCombatObjectState => ({
  id, factoryId: "root-link", kind: "root-link", ownerId: "rootbinder-1", targetId: `ally-${id}`,
  geometry: { x: 0, y: 0, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }, integrity: state === "destroyed" ? 0 : 1,
  maxIntegrity: 1, counterplayTags: ["cut", "break"], procEligible: false, damageDedupeId: `${id}:damage`,
  state, stateTick: 0, cleanupReason: state === "expired" ? "defeat" : null,
});

describe("Rootbinder presentation facts", () => {
  it("keeps warning geometry, gold source node, and sever feedback data-only", () => {
    const root = createRootbinderState({ id: "rootbinder-1", worldId: "world-a", stageId: "stage-1", x: 4, y: 8 });
    const facts = projectRootbinderPresentation(root, [segment("warning", "warning"), segment("active", "active"), segment("severed", "destroyed")], {
      highContrast: true, reducedMotion: true, lowGraphics: true, audioEnabled: false,
    });
    expect(facts.sourceNode).toEqual({ x: 4, y: 8, color: "gold" });
    expect(facts.warningGeometry).toHaveLength(1);
    expect(facts.activeSegments).toHaveLength(1);
    expect(facts.severFeedback).toEqual(["severed"]);
    expect(facts.boundaryVisible).toBe(true);
    expect(facts.motionScale).toBe(0);
    expect(facts.audioIndependent).toBe(true);
  });
});
