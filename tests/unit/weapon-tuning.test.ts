import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { createTearWorldConfiguration } from "../../src/gameplay/runtime/tear-world-configuration";
import { FINAL_FIVE_WEAPON_TUNING, createFinalFiveWeaponTuning } from "../../src/gameplay/weapon-tuning";
import { canonicalStringify, stableVerificationHash } from "../../src/replay/hash";

describe("Final Five authored weapon tuning", () => {
  it("is the exact ordered pure source, including greatsword cleave tuning", () => {
    expect(Object.keys(FINAL_FIVE_WEAPON_TUNING)).toEqual([...WEAPON_IDS]);
    expect(Object.keys(FINAL_FIVE_WEAPON_TUNING.sword)).toEqual([
      "reversalWindow", "reversalExitRadius", "reversalOppositeDot", "reversalExitPadding",
      "reversalDamageMult", "reversalStun", "threadcutDamageMult",
    ]);
    expect(Object.keys(FINAL_FIVE_WEAPON_TUNING.hammer)).toEqual([
      "weakFloor", "commitmentRef", "fullCommitMult", "breakPerDamage", "breakThreshold",
      "bossBreakThreshold", "meteorGravity", "meteorRadius", "meteorStun", "meteorBreak", "recallTargetCap",
    ]);
    expect(Object.keys(FINAL_FIVE_WEAPON_TUNING.greatsword)).toEqual([
      "weakNearHilt", "cleaveThreshold", "cleaveDamageMult", "lightMomentumRetention",
      "mediumMomentumRetention", "heavyMomentumRetention", "bossMomentumRetention", "wheelSpin",
      "wheelReturnAlign", "wheelReturnMult",
    ]);
    expect(Object.keys(FINAL_FIVE_WEAPON_TUNING.chainblade)).toEqual([
      "lashForce", "hookDuration", "slingSpeed", "collisionDamage", "releaseStun", "heavyBreak",
      "bossTug", "minRadius", "maxRadius", "tightenRate", "linkSegments", "angularAcceleration",
      "angularDamping", "maxAngularSpeed", "orbitSpring", "orbitFollow", "releaseOrbitMult",
      "releaseMomentumCarry", "maxReleaseSpeed", "knockbackReference", "anchorPull", "anchorMaxSpeed",
      "worldCollisionCooldown",
    ]);
    expect(Object.keys(FINAL_FIVE_WEAPON_TUNING.riftlock)).toEqual([
      "chambers", "chamberReform", "razorCooldown", "razorDamage", "razorSpeed", "razorRadius",
      "razorLife", "recoil", "recoilCutWindow", "bayonetRefill", "perfectParryRefill", "catchRefill",
      "looseCannonDuration", "remoteShotCooldown", "backblastSpeed", "captureDuration",
      "captureRecoilTransfer", "captureBossTransfer",
    ]);
    expect(FINAL_FIVE_WEAPON_TUNING.greatsword.cleaveDamageMult).toBe(1);
    expect(FINAL_FIVE_WEAPON_TUNING).toEqual(CONFIG.weapons);
    expect(canonicalStringify(FINAL_FIVE_WEAPON_TUNING)).toBe(canonicalStringify(CONFIG.weapons));
    expect(stableVerificationHash(FINAL_FIVE_WEAPON_TUNING)).toBe(stableVerificationHash(CONFIG.weapons));
    expect(stableVerificationHash(FINAL_FIVE_WEAPON_TUNING)).toBe("e58b943ffea9c1de");
  });

  it("deep-freezes authored values and returns independent mutable copies", () => {
    expect(Object.isFrozen(FINAL_FIVE_WEAPON_TUNING)).toBe(true);
    for (const tuning of Object.values(FINAL_FIVE_WEAPON_TUNING)) expect(Object.isFrozen(tuning)).toBe(true);

    const first = createFinalFiveWeaponTuning();
    const second = createFinalFiveWeaponTuning();
    expect(first).not.toBe(second);
    expect(first.greatsword).not.toBe(second.greatsword);
    first.greatsword.cleaveDamageMult = 9;
    first.chainblade.linkSegments = 99;
    expect(second.greatsword.cleaveDamageMult).toBe(FINAL_FIVE_WEAPON_TUNING.greatsword.cleaveDamageMult);
    expect(second.chainblade.linkSegments).toBe(FINAL_FIVE_WEAPON_TUNING.chainblade.linkSegments);
    expect(FINAL_FIVE_WEAPON_TUNING.greatsword.cleaveDamageMult).toBe(1);
  });

  it("keeps weapon tuning isolated when two world configurations are created", () => {
    const first = createTearWorldConfiguration({ weapons: createFinalFiveWeaponTuning() });
    const second = createTearWorldConfiguration({ weapons: createFinalFiveWeaponTuning() });
    first.value.weapons.greatsword.cleaveDamageMult = 7;
    expect(second.value.weapons.greatsword.cleaveDamageMult).toBe(1);
    expect(first.value.weapons).not.toBe(second.value.weapons);
  });
});
