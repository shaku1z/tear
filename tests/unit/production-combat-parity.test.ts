import { describe, expect, it } from "vitest";
import { EnvelopeSequencer } from "../../src/domain/envelopes";
import { CONFIG } from "../../src/config/game-config";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import type { BatonSegment } from "../../src/gameplay/combat/held-blade-collision-contracts";
import { createBossArena, type ArenaPlatform } from "../../src/gameplay/training/arena-rules";
import { captureProductionReplayCheckpoint, createProductionCombatSimulation,
  createProductionGhostReplayComposition, createProductionReplayWorld } from "../../src/tearbench";
import { createProductionCombatPhases } from "../../src/tearbench/production-combat-phases";

describe("production TearBench combat parity", () => {
  it("uses a real boss weapon capsule and source-owned area damage", () => {
    const replay = createProductionReplayWorld({ seed: "parity-sword", weaponId: "sword", enemies: [
      { id: "warden", x: 520, y: CONFIG.world.groundY - 60 },
      { id: "charger", x: CONFIG.view.w / 2, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
    ] });
    const phases = createProductionCombatPhases(replay);
    const warden = replay.world.state.enemies()[0] as never as { batonSegment(): BatonSegment };
    const capsule = warden.batonSegment();
    expect(phases.collision.weaponSegmentContact(capsule, capsule.a.x, capsule.a.y, capsule.b.x, capsule.b.y)).toBe(true);
    const player = replay.world.state.player() as never as { x: number; y: number };
    const enemy = replay.world.state.enemies()[1] as never as { hp: number };
    const before = enemy.hp;
    phases.opening.areaDamage(player.x, player.y, 120, 30);
    expect(enemy.hp).toBeLessThan(before);
  });

  it("propagates authoritative primary input into the real Riftlock event drain", () => {
    const sequence = new EnvelopeSequencer();
    const replay = createProductionReplayWorld({ seed: "parity-riftlock", weaponId: "riftlock" });
    const core = createProductionCombatSimulation<Record<string, unknown>>(replay, { snapshot: (tick) => ({ tick }) });
    core.simulationRuntime.reset(0);
    core.simulationRuntime.advanceOne([
      sequence.command(1, { type: "aim", turn: 0, magnitude: 1 } as const),
      sequence.command(1, { type: "weapon", intent: "primary", phase: "pressed" } as const),
    ]);
    const projectiles = replay.world.state.projectiles() as never as { family?: string; weaponId?: string }[];
    expect(projectiles.some((projectile) => projectile.family === "weaponProjectile" && projectile.weaponId === "riftlock")).toBe(true);
  });

  it.each(WEAPON_IDS)("updates the source-owned %s weapon ability runtime", (weaponId) => {
    const replay = createProductionReplayWorld({ seed: `parity-ability-${weaponId}`, weaponId });
    const phases = createProductionCombatPhases(replay);
    expect(() => { phases.opening.updateWeaponAbilities(1 / 60); }).not.toThrow();
  });

  it("applies support aura, world slow, and boss-zone damage through shared resolvers", () => {
    const replay = createProductionReplayWorld({ seed: "parity-support", enemies: [
      { id: "priest", x: 400, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "charger", x: 440, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "warden", x: 760, y: CONFIG.world.groundY - 60 },
    ] });
    const phases = createProductionCombatPhases(replay);
    const ally = replay.world.state.enemies()[1] as never as { auraDmg?: number };
    phases.opening.updateSupports(1 / 60);
    expect(ally.auraDmg).toBeGreaterThan(1);
    const player = replay.world.state.player() as never as { x: number; y: number; slowMult: number; hazardT: number; shield: number };
    replay.world.state.setSlowZones([{ id: "zone:test", x: player.x, y: player.y, r: 200, life: 1 } as never]);
    phases.opening.updateWorldHazards(1 / 60);
    expect(player.slowMult).toBeLessThan(1);
    const warden = replay.world.state.enemies()[2] as never as { x: number; zones: unknown[] };
    warden.zones = [{ x: player.x, w: 200, fullHeight: true, on: true, dmg: 9, tickCd: 0 }];
    player.shield = 0;
    const beforeHp = (player as never as { hp: number }).hp;
    phases.opening.resolveBossZones();
    expect((player as never as { hp: number }).hp).toBeLessThan(beforeHp);
    expect(player.hazardT).toBeGreaterThan(0);
  });

  it("binds the source-owned Hammer Meteor effect to detached world state", () => {
    const replay = createProductionReplayWorld({ seed: "parity-meteor", weaponId: "hammer", enemies: [
      { id: "charger", x: 410, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
    ] });
    const phases = createProductionCombatPhases(replay);
    const blade = replay.world.state.blade() as never as { vx: number; vy: number; throwDmg: number };
    blade.vx = 1200; blade.vy = 900; blade.throwDmg = 80;
    const enemy = replay.world.state.enemies()[0] as never as { hp: number; stun: number };
    const beforeHp = enemy.hp;
    phases.collision.lobExplode(410, CONFIG.world.groundY - CONFIG.enemy.h / 2);
    expect(enemy.hp).toBeLessThan(beforeHp);
    expect(enemy.stun).toBeGreaterThan(0);
  });

  it("advances authored boss-arena fracture and supports real boss adds/clones", () => {
    const replay = createProductionReplayWorld({ seed: "parity-boss-arena", enemies: [
      { id: "warden", x: 800, y: CONFIG.world.groundY - 60 },
    ] });
    const authored = createBossArena("warden", CONFIG.view.w, CONFIG.view.h,
      CONFIG.world.groundY, CONFIG.bossArena.reformWarn);
    if (authored === null) throw new Error("the current Warden arena is unavailable");
    const platforms = authored.map((platform) => ({ ...platform }));
    replay.stage.platforms = platforms;
    const platform = platforms.find((candidate) => candidate.arenaPlatId && !candidate.floor);
    if (platform === undefined) throw new Error("the current Warden arena has no elevated platform");
    platform.arenaFractureRequest = { reason: "current-game-parity", color: CONFIG.colors.boss };
    const phases = createProductionCombatPhases(replay);
    phases.opening.updateBossArenaPlatforms(1 / 60);
    expect(platform.arenaState).toBe("warning");
    phases.opening.updateBossArenaPlatforms(CONFIG.bossArena.crackWarn + 0.01);
    expect(platform.arenaState).toBe("broken");
    expect(replay.stage.platforms).not.toContain(platform);
    expect((replay.run as { _arenaBroken?: ArenaPlatform[] })._arenaBroken).toContain(platform);

    const boss = replay.world.state.enemies()[0];
    if (boss === undefined) throw new Error("the current Warden encounter is unavailable");
    expect(phases.opening.spawnBossAdds(boss)).toHaveLength(2);
    const beforeClone = replay.world.state.enemies().length;
    phases.opening.spawnBossClone(boss);
    expect(replay.world.state.enemies()).toHaveLength(beforeClone + 1);
  });

  it("explicitly refuses Source void descent instead of silently claiming detached parity", () => {
    const replay = createProductionReplayWorld({ seed: "parity-source-void", enemies: [
      { id: "source", x: CONFIG.view.w / 2, y: CONFIG.world.groundY - 120 },
    ] });
    const phases = createProductionCombatPhases(replay);
    const source = replay.world.state.enemies()[0];
    if (source === undefined) throw new Error("the current Source encounter is unavailable");
    expect(() => phases.opening.startVoidDescent(source as never)).toThrow(/Source void.*unsupported/u);
    (replay.run as { voidScroll?: unknown }).voidScroll = {};
    expect(() => { phases.opening.updateVoidScroll(1 / 60); }).toThrow(/Source void.*unsupported/u);
    expect(() => { phases.opening.syncVoidSupport(); }).toThrow(/Source void.*unsupported/u);
  });

  it("refuses hydrated Source void snapshots before an exact-keyframe seek", () => {
    const composition = createProductionGhostReplayComposition({ seed: "parity-source-void-boundary" });
    const composed = composition.create(undefined);
    const captured = captureProductionReplayCheckpoint(
      composed.replay, composed.combat, composed.waveReward, "parity-source-void-boundary",
    );
    expect(() => composition.create(captured.snapshot)).not.toThrow();
    const voidSnapshot = structuredClone(captured.snapshot) as unknown as {
      state: Record<string, Record<string, unknown>>;
    };
    const run = voidSnapshot.state["tear.run.v1"];
    if (run === undefined) throw new Error("production snapshot is missing its run component");
    run.voidScroll = { active: true, frozen: false, speed: 1, speedCap: 1 };
    expect(() => composition.create(voidSnapshot as never)).toThrow(
      /Source void descent\/scroll is unsupported; use the live backend/u,
    );
  });
});
