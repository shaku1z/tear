import { describe, expect, it } from "vitest";
import {
  GRAFT_ANCHOR_DEFINITIONS,
  GRAFT_ANCHOR_MAX_INTEGRITY,
  GRAFT_ANCHOR_TIMING,
  GRAFT_ANCHOR_TYPES,
  GRAFT_WARNING_FLOOR_SECONDS,
  MAX_ACTIVE_GRAFT_ANCHORS,
  advanceGraftAnchor,
  createGraftAnchorState,
  graftAnchorDefinition,
  installGraftAnchor,
} from "../../src/gameplay/environment/graft-anchor";
import { ENVIRONMENT_OBJECT_DEFINITIONS } from "../../src/gameplay/environment/environment-definitions";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { environmentHash, environmentSnapshotToObservation, validateEnvironmentCodecPayload } from "../../src/tearbench/environment-codec";

describe("Rootbound Graft Anchor definitions", () => {
  it("defines the exact bounded Phase II roster without creating another environment kind", () => {
    expect(GRAFT_ANCHOR_TYPES).toEqual(["bastion", "mercy", "haste"]);
    expect(GRAFT_ANCHOR_DEFINITIONS.map((definition) => definition.graftType)).toEqual(GRAFT_ANCHOR_TYPES);
    expect(GRAFT_ANCHOR_DEFINITIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "graft-anchor", factoryId: "graft-anchor", procPolicyId: "boss-combat-object" }),
    ]));
    expect(MAX_ACTIVE_GRAFT_ANCHORS).toBe(3);
  });

  it("keeps Bastion protective without making Rootbound invulnerable", () => {
    const bastion = graftAnchorDefinition("bastion");
    expect(bastion.effect).toBe("incoming-damage-multiplier");
    if (bastion.effect !== "incoming-damage-multiplier") throw new TypeError("expected Bastion definition");
    expect(bastion.incomingDamageMultiplier).toBeGreaterThan(0);
    expect(bastion.incomingDamageMultiplier).toBeLessThan(1);
  });

  it("gives Mercy a finite pulse and a finite total recovery budget", () => {
    const mercy = graftAnchorDefinition("mercy");
    expect(mercy.effect).toBe("bounded-pulse-recovery");
    if (mercy.effect !== "bounded-pulse-recovery") throw new TypeError("expected Mercy definition");
    expect(mercy.pulseIntervalSeconds).toBeGreaterThan(0);
    expect(mercy.pulseHealthFraction).toBeGreaterThan(0);
    expect(mercy.maxRecoveryHealthFraction).toBeGreaterThanOrEqual(mercy.pulseHealthFraction);
    expect(mercy.maxRecoveryHealthFraction).toBeLessThanOrEqual(0.1);
  });

  it("lets Haste accelerate selected attacks without crossing the warning floor", () => {
    const haste = graftAnchorDefinition("haste");
    expect(haste.effect).toBe("selected-attack-cadence-multiplier");
    if (haste.effect !== "selected-attack-cadence-multiplier") throw new TypeError("expected Haste definition");
    expect(haste.cadenceMultiplier).toBeGreaterThan(1);
    expect(haste.cadenceMultiplier).toBeLessThanOrEqual(1.25);
    expect(haste.minimumWarningSeconds).toBeGreaterThanOrEqual(GRAFT_WARNING_FLOOR_SECONDS);
    expect(GRAFT_WARNING_FLOOR_SECONDS).toBe(0.55);
  });

  it("is immutable and retains the canonical combat-object reward/proc policy", () => {
    expect(Object.isFrozen(GRAFT_ANCHOR_TYPES)).toBe(true);
    expect(Object.isFrozen(GRAFT_ANCHOR_DEFINITIONS)).toBe(true);
    expect(GRAFT_ANCHOR_DEFINITIONS.every(Object.isFrozen)).toBe(true);
    expect(ENVIRONMENT_OBJECT_DEFINITIONS["graft-anchor"]).toMatchObject({
      category: "combat-object",
      behavior: "generic-combat-object",
      counterplayTags: ["cut", "break", "projectile-cut"],
      grantsEnemyRewards: false,
      ordinaryEnemyProcEligible: false,
    });
  });

  it("promotes the exact subtype definition into specialized canonical state", () => {
    const bastion = graftAnchorDefinition("bastion");
    if (bastion.effect !== "incoming-damage-multiplier") throw new TypeError("expected Bastion definition");
    const state = createGraftAnchorState({
      ownerId: "enemy:rootbound",
      ownerPosition: { x: 800, y: 520 },
      graftType: "bastion",
      geometry: { x: 280, y: 610, w: 54, h: 90 },
      createdTick: 240,
    });
    expect(state).toMatchObject({
      id: "enemy:rootbound:graft:bastion",
      factoryId: "graft-anchor",
      kind: "graft-anchor",
      ownerId: "enemy:rootbound",
      targetId: "enemy:rootbound",
      graftType: "bastion",
      effect: "incoming-damage-multiplier",
      incomingDamageMultiplier: bastion.incomingDamageMultiplier,
      integrity: GRAFT_ANCHOR_MAX_INTEGRITY,
      maxIntegrity: GRAFT_ANCHOR_MAX_INTEGRITY,
      state: "warning",
      stateTick: 240,
      createdTick: 240,
      procPolicyId: "boss-combat-object",
      procEligible: false,
    });
    expect(state.connectionGeometry.points).toEqual([{ x: 800, y: 520 }, { x: 307, y: 655 }]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.geometry)).toBe(true);
    expect(Object.isFrozen(state.connectionGeometry.points)).toBe(true);
  });

  it("installs through the production environment owner with stable idempotent ownership", () => {
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "graft-production" });
    const base = { ownerId: "enemy:rootbound", ownerPosition: { x: 800, y: 520 }, geometry: { x: 280, y: 610, w: 54, h: 90 }, createdTick: 240 } as const;
    const first = installGraftAnchor(environment, { ...base, graftType: "bastion" });
    const repeated = installGraftAnchor(environment, { ...base, graftType: "bastion", createdTick: 241 });
    installGraftAnchor(environment, { ...base, graftType: "mercy", geometry: { ...base.geometry, x: 773 } });
    installGraftAnchor(environment, { ...base, graftType: "haste", geometry: { ...base.geometry, x: 1253 } });
    expect(repeated).toBe(first);
    expect(environment.combatObjects()).toHaveLength(MAX_ACTIVE_GRAFT_ANCHORS);
    expect(environment.combatObjects().map((object) => object.ownerId)).toEqual([
      "enemy:rootbound", "enemy:rootbound", "enemy:rootbound",
    ]);
    expect(environment.combatObjects().every((object) => object.factoryId === "graft-anchor")).toBe(true);
  });

  it("accepts the specialized source-owned factory in the existing codec and rejects invalid inputs", () => {
    const state = createGraftAnchorState({ ownerId: "enemy:rootbound", ownerPosition: { x: 0, y: 0 }, graftType: "haste", geometry: { x: 10, y: 20, radius: 12 }, createdTick: 1 });
    expect(validateEnvironmentCodecPayload({ slowZones: [], walls: [], fields: [], combatObjects: [state], routes: [] })).toEqual([]);
    expect(() => createGraftAnchorState({ ownerId: "", ownerPosition: { x: 0, y: 0 }, graftType: "haste", geometry: { x: 10, y: 20, radius: 12 }, createdTick: 1 })).toThrow(/owner ID/u);
    expect(() => createGraftAnchorState({ ownerId: "enemy:rootbound", ownerPosition: { x: 0, y: 0 }, graftType: "haste", geometry: { x: 10, y: 20 }, createdTick: 1 })).toThrow(/geometry/u);
    expect(() => createGraftAnchorState({ ownerId: "enemy:rootbound", ownerPosition: { x: 0, y: 0 }, graftType: "haste", geometry: { x: 10, y: 20, radius: 12 }, createdTick: -1 })).toThrow(/tick/u);
  });

  it("advances from visible warning to active on an absolute tick", () => {
    const state = createGraftAnchorState({ ownerId: "enemy:rootbound", ownerPosition: { x: 0, y: 0 }, graftType: "bastion", geometry: { x: 10, y: 20, radius: 12 }, createdTick: 10 });
    expect(advanceGraftAnchor(state, 10 + GRAFT_ANCHOR_TIMING.warningTicks - 1).state).toBe("warning");
    expect(advanceGraftAnchor(state, 10 + GRAFT_ANCHOR_TIMING.warningTicks)).toMatchObject({
      state: "active", stateTick: 10 + GRAFT_ANCHOR_TIMING.warningTicks,
    });
  });

  it("caps Mercy recovery at the exact definition budget even across a large tick jump", () => {
    const state = createGraftAnchorState({ ownerId: "enemy:rootbound", ownerPosition: { x: 0, y: 0 }, graftType: "mercy", geometry: { x: 10, y: 20, radius: 12 }, createdTick: 0 });
    const mercy = graftAnchorDefinition("mercy");
    if (mercy.effect !== "bounded-pulse-recovery") throw new TypeError("expected Mercy definition");
    const after = advanceGraftAnchor(state, GRAFT_ANCHOR_TIMING.warningTicks + 120 * 30, (fraction) => fraction);
    expect(after).toMatchObject({ state: "active", recoverySpentHealthFraction: mercy.maxRecoveryHealthFraction });
    expect(advanceGraftAnchor(after, 120 * 60, (fraction) => fraction)).toBe(after);
  });

  it("carries Graft effect and spent-budget truth through hash and structured observation", () => {
    const state = createGraftAnchorState({ ownerId: "enemy:rootbound", ownerPosition: { x: 0, y: 0 }, graftType: "mercy", geometry: { x: 10, y: 20, radius: 12 }, createdTick: 0 });
    const snapshot = { stageId: "verdant-sanctum", fields: [], combatObjects: [state], routes: [] } as const;
    const spent = { ...snapshot, combatObjects: [{ ...state, recoverySpentHealthFraction: 0.015 }] } as const;
    expect(environmentHash(spent)).not.toBe(environmentHash(snapshot));
    expect(environmentSnapshotToObservation(spent).combatObjects[0]).toMatchObject({
      graftType: "mercy", effect: "bounded-pulse-recovery", recoverySpentHealthFraction: 0.015,
    });
    expect(validateEnvironmentCodecPayload({ slowZones: [], walls: [], ...spent })).toEqual([]);
    const invalid = validateEnvironmentCodecPayload({ slowZones: [], walls: [], ...snapshot,
      combatObjects: [{ ...state, pulseHealthFraction: 0.5 }],
    });
    expect(invalid.some((entry) => entry.path.endsWith(".pulseHealthFraction"))).toBe(true);
  });
});
