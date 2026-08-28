import { describe, expect, it } from "vitest";
import {
  GRAFT_ANCHOR_DEFINITIONS,
  GRAFT_ANCHOR_TYPES,
  GRAFT_WARNING_FLOOR_SECONDS,
  MAX_ACTIVE_GRAFT_ANCHORS,
  graftAnchorDefinition,
} from "../../src/gameplay/environment/graft-anchor";
import { ENVIRONMENT_OBJECT_DEFINITIONS } from "../../src/gameplay/environment/environment-definitions";

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
});
