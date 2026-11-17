import { describe, expect, it } from "vitest";
import {
  GRAFT_ANCHOR_DEFINITIONS,
  GRAFT_ANCHOR_MAX_INTEGRITY,
  GRAFT_ANCHOR_TIMING,
  GRAFT_ANCHOR_TYPES,
  MAX_ACTIVE_GRAFT_ANCHORS,
  ROOTBOUND_NO_GRAFT_EFFECTS,
  advanceGraftAnchor,
  createGraftAnchorState,
  graftAnchorDefinition,
  installGraftAnchor,
  resolveRootboundGraftEffects,
} from "../../src/gameplay/environment/graft-anchor";
import { ENVIRONMENT_OBJECT_DEFINITIONS } from "../../src/gameplay/environment/environment-definitions";
import { ENVIRONMENT_FADE_TICKS } from "../../src/gameplay/environment/environment-contracts";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { environmentSnapshotToObservation } from "../../src/tearbench/environment-codec";
import { validateAuthoredEnvironmentCodecPayload as validateEnvironmentCodecPayload } from "../../src/tearbench/authored-environment-codec-validation";
import { forgeRootboundGraftAnchorState } from "../../src/tearbench/state-forge-factories";
import type { TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";

const GEOMETRY = { x: 773, y: 610, w: 54, h: 90 } as const;

describe("Graft definitions", () => {
  it("lists the three Grafts in planting order, on the existing graft-anchor kind", () => {
    expect(GRAFT_ANCHOR_TYPES).toEqual(["mercy", "bastion", "haste"]);
    expect(GRAFT_ANCHOR_DEFINITIONS.map((definition) => definition.graftType)).toEqual(GRAFT_ANCHOR_TYPES);
    for (const definition of GRAFT_ANCHOR_DEFINITIONS)
      expect(definition).toMatchObject({
        kind: "graft-anchor",
        factoryId: "graft-anchor",
        procPolicyId: "boss-combat-object",
      });
    expect(MAX_ACTIVE_GRAFT_ANCHORS).toBe(3);
    expect(ENVIRONMENT_OBJECT_DEFINITIONS["graft-anchor"]).toMatchObject({
      category: "combat-object",
      grantsEnemyRewards: false,
      ordinaryEnemyProcEligible: false,
    });
  });

  it("Bastion protects without making the boss invulnerable; Haste shortens the gap without removing it", () => {
    const bastion = graftAnchorDefinition("bastion");
    if (bastion.effect !== "incoming-damage-multiplier") throw new TypeError("expected Bastion");
    expect(bastion.incomingDamageMultiplier).toBeGreaterThan(0);
    expect(bastion.incomingDamageMultiplier).toBeLessThan(1);
    const haste = graftAnchorDefinition("haste");
    if (haste.effect !== "move-gap-multiplier") throw new TypeError("expected Haste");
    expect(haste.gapMultiplier).toBeGreaterThan(0);
    expect(haste.gapMultiplier).toBeLessThan(1);
  });

  it("Mercy carries no healing numbers of its own: they live in ROOTBOUND_HEALING", () => {
    expect(Object.keys(graftAnchorDefinition("mercy")).sort()).toEqual(
      ["effect", "factoryId", "graftType", "kind", "procPolicyId"].sort(),
    );
  });
});

describe("Graft state", () => {
  it("is built frozen, owned by its boss, warning first, cuttable by blade and thrown blade", () => {
    const state = createGraftAnchorState({
      ownerId: "enemy:1",
      graftType: "mercy",
      geometry: GEOMETRY,
      createdTick: 40,
    });
    expect(state).toMatchObject({
      id: "enemy:1:graft:mercy",
      ownerId: "enemy:1",
      targetId: "enemy:1",
      state: "warning",
      createdTick: 40,
      activationTick: 40 + GRAFT_ANCHOR_TIMING.warningTicks,
      integrity: GRAFT_ANCHOR_MAX_INTEGRITY,
      maxIntegrity: GRAFT_ANCHOR_MAX_INTEGRITY,
      procEligible: false,
      geometry: GEOMETRY,
    });
    expect(state.counterplayTags).toEqual(expect.arrayContaining(["cut", "break"]));
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("rejects an ownerless Graft, empty geometry and a bad tick", () => {
    const input = { ownerId: "enemy:1", graftType: "haste", geometry: GEOMETRY, createdTick: 1 } as const;
    expect(() => createGraftAnchorState({ ...input, ownerId: "" })).toThrow(/owner ID/u);
    expect(() => createGraftAnchorState({ ...input, geometry: { x: 10, y: 20 } })).toThrow(/geometry/u);
    expect(() => createGraftAnchorState({ ...input, createdTick: -1 })).toThrow(/tick/u);
    expect(() => createGraftAnchorState({ ...input, maxIntegrity: 0 })).toThrow(/integrity/u);
  });

  it("takes hold when its warning has run, on an absolute tick", () => {
    const state = createGraftAnchorState({
      ownerId: "enemy:1",
      graftType: "bastion",
      geometry: GEOMETRY,
      createdTick: 10,
    });
    expect(advanceGraftAnchor(state, state.activationTick - 1)).toBe(state);
    const active = advanceGraftAnchor(state, state.activationTick + 30);
    expect(active).toMatchObject({ state: "active", stateTick: state.activationTick });
    expect(advanceGraftAnchor(active, state.activationTick + 60)).toBe(active);
    expect(() => advanceGraftAnchor(state, -1)).toThrow(RangeError);
  });

  it("passes the authored-environment codec check, and a Graft with a changed effect does not", () => {
    const state = createGraftAnchorState({
      ownerId: "enemy:1",
      graftType: "haste",
      geometry: GEOMETRY,
      createdTick: 1,
    });
    const payload = (combatObjects: readonly unknown[]) => ({
      slowZones: [],
      walls: [],
      fields: [],
      combatObjects,
      routes: [],
    });
    expect(validateEnvironmentCodecPayload(payload([state]))).toEqual([]);
    const invalid = validateEnvironmentCodecPayload(payload([{ ...state, gapMultiplier: 0.1 }]));
    expect(invalid.some((entry) => entry.path.endsWith(".gapMultiplier"))).toBe(true);
  });
});

describe("Grafts on the stage", () => {
  const input = { ownerId: "enemy:rootbound", geometry: GEOMETRY, createdTick: 240 } as const;

  it("plants each type once for its owner", () => {
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "graft-install" });
    const first = installGraftAnchor(environment, { ...input, graftType: "bastion" });
    expect(installGraftAnchor(environment, { ...input, graftType: "bastion", createdTick: 241 })).toBe(first);
    installGraftAnchor(environment, { ...input, graftType: "mercy" });
    installGraftAnchor(environment, { ...input, graftType: "haste" });
    expect(environment.combatObjects()).toHaveLength(MAX_ACTIVE_GRAFT_ANCHORS);
    expect(environment.combatObjects().every((object) => object.ownerId === "enemy:rootbound")).toBe(true);
  });

  it("does not plant over a cut Graft that is still fading, and plants again once it has left", () => {
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "graft-replant" });
    const planted = installGraftAnchor(environment, { ...input, graftType: "mercy" });
    if (planted === null) throw new Error("expected a planted Graft");
    expect(environment.damageCombatObject(planted.id, planted.integrity, "cut", 360).destroyed).toBe(true);
    expect(installGraftAnchor(environment, { ...input, graftType: "mercy", createdTick: 361 })).toBeNull();
    for (let tick = 361; tick <= 362 + ENVIRONMENT_FADE_TICKS; tick += 1)
      environment.step(tick, 1 / 120, () => undefined, new Set(["enemy:rootbound"]));
    const again = installGraftAnchor(environment, { ...input, graftType: "mercy", createdTick: 700 });
    expect(again).toMatchObject({ id: planted.id, state: "warning", createdTick: 700 });
  });

  it("only active Grafts help the boss", () => {
    const warning = createGraftAnchorState({ ...input, graftType: "bastion" });
    const active = (graftType: "mercy" | "bastion" | "haste") =>
      Object.freeze({ ...createGraftAnchorState({ ...input, graftType }), state: "active" as const });
    expect(resolveRootboundGraftEffects([warning], "enemy:rootbound")).toBe(ROOTBOUND_NO_GRAFT_EFFECTS);
    expect(resolveRootboundGraftEffects([active("mercy")], "enemy:other")).toBe(ROOTBOUND_NO_GRAFT_EFFECTS);
    expect(resolveRootboundGraftEffects([active("mercy")], "enemy:rootbound")).toEqual({
      activeTypes: ["mercy"],
      incomingDamageMultiplier: 1,
      gapMultiplier: 1,
      heals: true,
    });
    expect(resolveRootboundGraftEffects([active("bastion"), active("haste"), warning], "enemy:rootbound")).toEqual({
      activeTypes: ["bastion", "haste"],
      incomingDamageMultiplier: 0.65,
      gapMultiplier: 0.6,
      heals: false,
    });
  });

  it("builds the TearBench Graft fixture and shows its type in the structured observation", () => {
    const base: TearSdlDocumentV1 = {
      format: "tearsdl",
      schemaVersion: 1,
      id: "rootbound-graft-anchor-destruction",
      stateClass: "surgical-valid",
      seed: "rootbound-graft-anchor-destruction",
      start: { mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "rootbound" },
    };
    const forged = forgeRootboundGraftAnchorState(base);
    expect(forged.id).toBe("rootbound-graft-anchor-destruction-graft-mercy");
    expect(forged.state?.environment).toMatchObject({
      combatObjects: [
        expect.objectContaining({
          id: "enemy:1:graft:mercy",
          kind: "graft-anchor",
          ownerId: "enemy:1",
          graftType: "mercy",
          state: "active",
        }),
      ],
    });
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "graft-observation" });
    installGraftAnchor(environment, { ...input, graftType: "mercy" });
    const observation = environmentSnapshotToObservation(environment.snapshot());
    expect(JSON.stringify(observation)).toContain("mercy");
  });
});
