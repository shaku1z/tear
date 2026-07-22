import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { ArenaZone, EnemyPlatform, EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import { BOSS_ROSTER, pickMiniBoss, type BossId } from "../../src/gameplay/run/content-director";
import { STAGES } from "../../src/gameplay/stages";
import { createEnemyHarness, type BehaviorActor } from "./enemy-test-harness";
import { createMirrorTestHarness } from "./mirror-test-harness";

type BossActor = BehaviorActor & {
  bossId: string;
  bossName: string;
  presentationId: string;
  phase: number;
  phaseMarker: number;
  phaseTag: string;
  mode: string;
  state: string;
  cinematicRequest: unknown;
  zones: ArenaZone[];
  searchlights: ArenaZone[];
  cages: ArenaZone[];
  trails: ArenaZone[];
  fireZones: ArenaZone[];
  seams: ArenaZone[];
  shielded: boolean;
  spawnClone: boolean;
  freezeVoid: boolean;
  thawVoid: boolean;
  requestVoidCinematic: boolean;
  collapsing: boolean;
  siphon: unknown;
};

function createBoss(id: BossId): ReturnType<typeof createEnemyHarness> & { boss: BossActor } {
  const harness = createEnemyHarness([0.25, 0.75, 0.4]);
  const constructors = {
    warden: harness.types.Warden,
    colossus: harness.types.Colossus,
    aldric: harness.types.Aldric,
    echo: harness.types.Echo,
    source: harness.types.Source,
  } as const;
  const Boss = constructors[id];
  const boss = new Boss(CONFIG.view.w / 2, CONFIG.world.groundY - 180) as unknown as BossActor;
  return { ...harness, boss };
}

function updateBoss(boss: BossActor, platforms: EnemyPlatform[], player: ReturnType<typeof createEnemyHarness>["player"], projectiles: EnemyProjectile[], dt = 1 / 60): void {
  boss.update(dt, platforms, player, projectiles);
}

describe("boss phase conformance", () => {
  it("constructs every canonical boss and keeps the campaign Pantheon ordered before the Source", () => {
    for (const entry of BOSS_ROSTER) {
      if (entry.id === "echo") {
        const { host } = createMirrorTestHarness();
        expect(host.isBoss).toBe(true);
        expect(host.bossName).toBe("THE ECHO");
        continue;
      }
      const { boss } = createBoss(entry.id);
      expect(boss.isBoss, entry.id).toBe(true);
      expect(boss.presentationId, entry.id).toBe(entry.id);
    }
    const campaignOrder = STAGES.map((stage) => stage.boss);
    expect(campaignOrder).toEqual(BOSS_ROSTER.map((boss) => boss.id));
    expect(campaignOrder.at(-1)).toBe("source");
    for (const draw of [0, 0.249, 0.5, 0.999]) expect(pickMiniBoss({ next: () => draw })).not.toBe("source");
  });

  it("preserves Warden thresholds, lockdown zones, final-phase cleanup and arena fracture", () => {
    const { boss, platforms, player } = createBoss("warden");
    const projectiles: EnemyProjectile[] = [];
    boss.hp = boss.maxHp * 0.65;
    expect(boss.phase).toBe(2);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss.phaseMarker).toBe(2);
    expect(boss.searchlights).toHaveLength(CONFIG.warden.zoneCount);
    expect(boss.cages).toHaveLength(2);
    expect(boss.zones.every((zone) => zone.on)).toBe(true);

    boss.cinematicRequest = null;
    boss.hp = boss.maxHp * 0.30;
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ phaseMarker: 3, phaseTag: "NOTHING LEFT", state: "fakedeath" });
    expect(boss.zones).toEqual([]);
    expect(platforms.some((platform) => platform.arenaFractureRequest?.reason === "wardenPhase")).toBe(true);
  });

  it("preserves Colossus breach and deterministic meltdown-panel mutations", () => {
    const { boss, platforms, player } = createBoss("colossus");
    const projectiles: EnemyProjectile[] = [];
    boss.hp = boss.maxHp * 0.60;
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ phase: 2, phaseMarker: 2, shielded: false, phaseTag: "BREACHED" });

    boss.cinematicRequest = null;
    boss.hp = boss.maxHp * 0.25;
    updateBoss(boss, platforms, player, projectiles);
    expect(boss.phaseMarker).toBe(3);
    expect(boss.zones).toHaveLength(CONFIG.colossus.panelCount);
    expect(boss.zones.filter((zone) => zone.arming)).toHaveLength(1);
    boss.cinematicRequest = null;
    updateBoss(boss, platforms, player, projectiles, CONFIG.colossus.panelStep + 0.01);
    expect(boss.zones.filter((zone) => zone.on)).toHaveLength(1);
    expect(boss.zones.filter((zone) => zone.arming)).toHaveLength(1);
  });

  it("preserves Aldric fire, kneel cleanup and witnessed/angered continuation boundary", () => {
    const { boss, platforms, player } = createBoss("aldric");
    const projectiles: EnemyProjectile[] = [];
    boss.hp = boss.maxHp * (CONFIG.aldric.fireTier - 0.01);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss.mode).toBe("fire");
    expect(boss.fireZones.length).toBeGreaterThan(0);

    boss.hp = boss.maxHp * (CONFIG.aldric.fakeTier - 0.01);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ mode: "downed", phaseTag: "THE KNEEL" });
    expect(boss.zones).toEqual([]);
    boss.hit(100_000, 1, 0);
    expect(boss.hp).toBe(1);

    const revive = boss as BossActor & { revive(witnessed: boolean): void; witnessEarned: boolean; anger: boolean };
    revive.revive(false);
    expect(revive).toMatchObject({ mode: "frenzy", witnessEarned: false, anger: true });
  });

  it("preserves the live MirrorHost Echo split, final reflection and clone cleanup", () => {
    const { Mirror, ReflectionEnemy, host } = createMirrorTestHarness();
    expect(Mirror.phase).toBe(1);
    host.hp = host.maxHp * 0.60;
    Mirror._updatePhase();
    expect(Mirror).toMatchObject({ phase: 2, _phaseMark: 2, sync: 0.55, color: "#c94bff" });
    expect(host.spawnClone).toBe(true);
    expect(Mirror.blade.lengthBonus).toBe(65);

    const clone = new ReflectionEnemy(1200, 300);
    host.hp = host.maxHp * 0.25;
    Mirror._updatePhase();
    expect(Mirror).toMatchObject({ phase: 3, _phaseMark: 3, sync: 0.75, color: "#e6d3ff" });
    expect(Mirror.blade.lengthBonus).toBe(100);
    clone.update(1 / 60, [], Mirror.actor, []);
    expect(clone.dead).toBe(true);
  });

  it("preserves Source collapse, frozen kneel, true-form thaw and death cleanup", () => {
    const { boss, platforms, player } = createBoss("source");
    const projectiles: EnemyProjectile[] = [];
    boss.hp = boss.maxHp * (CONFIG.source.voidTier - 0.01);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ phaseMarker: 2, mode: "collapse", collapsing: true, requestVoidCinematic: true });

    boss.cinematicRequest = null;
    boss.hp = boss.maxHp * (CONFIG.source.fakeTier - 0.01);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ phaseMarker: 3, mode: "downed", freezeVoid: true });
    boss.hit(100_000, 1, 0);
    expect(boss.hp).toBe(1);
    const source = boss as BossActor & { revive(): void };
    source.revive();
    expect(source).toMatchObject({ mode: "void", thawVoid: true, phaseTag: "TRUE FORM" });
    source.siphon = { amount: 10 };
    source.hit(100_000, 1, 0);
    expect(source).toMatchObject({ dying: true, freezeVoid: true, siphon: null });
  });

  it("finishes each boss death theater and makes actor-owned hazards collectible", () => {
    for (const entry of BOSS_ROSTER) {
      if (entry.id === "echo") {
        const { host } = createMirrorTestHarness();
        host.hit(100_000, 1, 0);
        expect(host.dying).toBe(true);
        continue;
      }
      const { boss } = createBoss(entry.id);
      boss.phaseMarker = 3;
      boss.mode = entry.id === "source" ? "void" : "frenzy";
      boss.state = "idle";
      boss.hit(100_000, 1, 0);
      expect(boss.dying, entry.id).toBe(true);
      expect(boss.updateDeath(boss.deathDur + 0.01), entry.id).toBe(true);
      expect(boss.dead, entry.id).toBe(true);
      expect([boss].filter((actor) => !actor.dead), `${entry.id} cleanup`).toEqual([]);
    }
  });
});
