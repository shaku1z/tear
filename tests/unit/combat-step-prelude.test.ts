import { describe, expect, it } from "vitest";

import { stepCombatPrelude, type CombatPreludeBlade, type CombatPreludePlayer, type CombatPreludeRun } from "../../src/gameplay/combat/combat-step-prelude";
import { applyCombatFeedback } from "../../src/gameplay/combat/combat-feedback-runtime";
import { advancePlatformLifecycle, type BrokenPlatform } from "../../src/gameplay/combat/platform-lifecycle-runtime";
import { stepBossRuntime } from "../../src/gameplay/combat/boss-step-runtime";
import { handleWeaponTransport } from "../../src/gameplay/combat/weapon-transport-runtime";

function fixtures() {
  const order: string[] = [];
    const player: CombatPreludePlayer = {
      x: 0, y: 0, facing: 1,
    cinematicProtected: false, cinematicGraceT: 0, flowDR: 1, hazardT: 0.2, moveBoost: 1,
    tempoT: 0, afterimageT: 0, afterimageSpeedMult: 1, supportPlatform: null, voidLane: null,
    voidMajorWindow: false, vx: 3, vy: 4,
    heal() { order.push("heal"); }, update() { order.push("player"); },
  };
  const blade: CombatPreludeBlade = {
    state: "returning", secondaryStartedNew: true, linkBrokenNew: "range", orbit: 0,
    update() { order.push("blade"); this.state = "held"; },
  };
  const run: CombatPreludeRun = { mods: { flowGuard: true, flowRegen: true }, mult: 3, lifestealCd: 1,
    weaponStats: { distanceMoved: 0 }, voidScroll: {} };
  return { order, player, blade, run };
}

describe("combat step prelude", () => {
  it("keeps a blocking cinematic exclusive", () => {
    const { order, player, blade, run } = fixtures();
    const result = stepCombatPrelude({ dt: 0.1, blocking: true, playerMode: "landing", player, blade, run,
      platforms: [], protection: { active: false, lastMode: null }, timers: { throwCooldown: 1 },
      tuning: { flowGuardTier: 3, flowGuardMultiplier: 0.7, thrownMoveBoost: 1.1, orbitMove: 0.1 }, overrunMovementMultiplier: 1,
      stepCinematic() { order.push("cinematic"); }, flushClosingInput() { order.push("flush"); },
      updateWeaponAbilities() { order.push("weapon"); }, updateZonesAndWalls() { order.push("zones"); },
      syncVoidSupport() { order.push("support"); }, activateThrowSecondary() { order.push("secondary"); },
    });
    expect(result.blocked).toBe(true); expect(order).toEqual(["cinematic"]); expect(player.cinematicProtected).toBe(true);
  });

  it("preserves update order and transition snapshots", () => {
    const { order, player, blade, run } = fixtures();
    const protection = { active: true, lastMode: "landing" as string | null }, timers = { throwCooldown: 0.5 };
    const result = stepCombatPrelude({ dt: 0.1, blocking: false, playerMode: "", player, blade, run, platforms: [], protection, timers,
      tuning: { flowGuardTier: 3, flowGuardMultiplier: 0.7, thrownMoveBoost: 1.1, orbitMove: 0.1 }, overrunMovementMultiplier: 1,
      stepCinematic() { order.push("cinematic"); }, flushClosingInput() { order.push("flush"); },
      updateWeaponAbilities() { order.push("weapon"); }, updateZonesAndWalls() { order.push("zones"); },
      syncVoidSupport() { order.push("support"); }, activateThrowSecondary() { order.push("secondary"); },
    });
    expect(order).toEqual(["flush", "heal", "weapon", "zones", "player", "support", "blade", "secondary"]);
    expect(result).toEqual({ blocked: false, previousBladeState: "returning", wasReturning: true, linkBreakReason: "range" });
    expect(player.cinematicGraceT).toBe(0.7); expect(timers.throwCooldown).toBeCloseTo(0.4);
    expect(run.weaponStats.distanceMoved).toBeCloseTo(0.5);
  });
});

describe("combat feedback runtime", () => {
  it("applies queue effects in authored order and keeps maxima", () => {
    const calls: string[] = [], state = { hitStop: 0.2, slowMotion: 0.1 };
    applyCombatFeedback([{ shake: 9, flash: 0.4, hitstop: 0.1, slowmo: 0.6, banner: "BREAK", txt: "HIT", big: true }], state,
      { x: 4, y: 5, color: "red" }, {
        shake() { calls.push("shake"); }, flash() { calls.push("flash"); }, zoom() { calls.push("zoom"); },
        banner() { calls.push("banner"); }, floater() { calls.push("floater"); }, sound() { calls.push("sound"); }, slam() { calls.push("slam"); },
      }, true);
    expect(calls).toEqual(["shake", "flash", "banner", "floater", "slam"]);
    expect(state).toEqual({ hitStop: 0.2, slowMotion: 0.6 });
  });
});

describe("platform lifecycle runtime", () => {
  it("breaks then reforms non-arena platforms without touching arena identities", () => {
    const arena = { x: 0, y: 20, w: 20, h: 4, oneway: true, crackT: 0.1, arenaPlatId: "boss:1" };
    const cracked = { x: 30, y: 40, w: 50, h: 4, oneway: true, crackT: 0.1, respawnIn: 0.2, crackColor: "red" };
    const platforms = [arena, cracked], broken: BrokenPlatform[] = [];
    expect(advancePlatformLifecycle(platforms, broken, 0.11)).toEqual([{ type: "break", platform: { x: 30, y: 40, w: 50, h: 4, oneway: true }, color: "red" }]);
    expect(platforms).toEqual([arena]); expect(broken).toHaveLength(1);
    expect(advancePlatformLifecycle(platforms, broken, 0.21)[0]?.type).toBe("reform"); expect(platforms).toHaveLength(2);
  });
});

describe("boss step runtime", () => {
  it("preserves void freeze/thaw order and ground-spike consumption", () => {
    const boss = { x: 800, y: 700, hw: 40, hh: 60, facing: 1, isBoss: true, freezeVoid: true, thawVoid: true };
    const spiked = { x: 200, y: 760, hw: 20, hh: 40, facing: 1, spiked: true, onGround: true };
    const voidScroll = { active: true, frozen: false, speed: 10, speedCap: 20 }, calls: string[] = [];
    stepBossRuntime({ dt: 0.1, player: { x: 800, y: 700, hw: 15, hh: 30, onGround: true }, platforms: [], enemies: [boss, spiked],
      run: { voidScroll }, thawMultiplier: 1.5, maximumScrollSpeed: 30,
      unlockWitness() { calls.push("witness"); }, startVoidDescent() { calls.push("void"); }, spawnAdds() { return []; },
      spawnClone() { calls.push("clone"); }, floater() { calls.push("text"); }, dramaticBeat() { calls.push("beat"); },
      removeClone() { calls.push("remove"); }, spikeImpact() { calls.push("spike"); },
    });
    expect(voidScroll).toEqual({ active: true, frozen: false, speed: 15, speedCap: 45 });
    expect(spiked.spiked).toBe(false); expect(calls).toEqual(["spike"]);
  });
});

describe("weapon transport runtime", () => {
  it("commits a throw once and returns the authored cooldown", () => {
    const calls: number[] = [];
    const result = handleWeaponTransport({ requested: true, player: {}, cooldown: 0,
      blade: { state: "held", throwId: 7, throwCooldownMult: 1.4, x: 0, y: 0, vx: 0, vy: 0,
        throwBlade() { return true; }, tryRecall() { return "recalled"; }, handPos() { return { x: 0, y: 0 }; } },
      onThrow(id) { calls.push(id); }, onRecall() { calls.push(-1); }, onQueued() { calls.push(-2); }, onTooFar() { calls.push(-3); },
    });
    expect(calls).toEqual([7]); expect(result).toEqual({ cooldown: 0.7, threw: true });
  });
});
