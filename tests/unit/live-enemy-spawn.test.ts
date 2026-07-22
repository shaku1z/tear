import { describe, expect, it, vi } from "vitest";
import { completeEnemySpawn, constructLiveEnemy, type LiveSpawnEnemy } from "../../src/gameplay/run/live-enemy-spawn";

function enemy(overrides: Partial<LiveSpawnEnemy> = {}): LiveSpawnEnemy {
  return {
    kind: "charger", x: 0, y: 0, hp: 100, maxHp: 100, hh: 20, radius: 12,
    color: "#f00", contactDmg: 10, ...overrides,
  };
}

function port(overrides: Record<string, unknown> = {}) {
  const installed: LiveSpawnEnemy[] = [];
  const recorded: unknown[] = [];
  const base = {
    random: { next: vi.fn().mockReturnValueOnce(0.5).mockReturnValueOnce(0.75) },
    run: () => ({ mode: "endless" as const, wave: 4, bossesBeaten: 0, diffHp: 1.5, waveKinds: ["ranged"] }),
    campaignStage: () => 0,
    contentWave: () => 4,
    groundSpawn: () => ({ x: 120, y: 500 }),
    applyPreset: vi.fn(), rollVariant: vi.fn(() => ({
      id: "swift", name: "Swift", weight: 1, apply: () => undefined,
    })),
    applyVariant: vi.fn(), rollAffixes: vi.fn(), arrivalEffect: vi.fn(),
    recordSpawn: vi.fn((...args: unknown[]) => { recorded.push(args); }),
    install: vi.fn((value: LiveSpawnEnemy) => { installed.push(value); }),
    ...overrides,
  };
  return { base, installed, recorded };
}

describe("live enemy spawn", () => {
  it("constructs authored ground, air, support, boss and miniboss families", () => {
    const create = (kind: string): LiveSpawnEnemy => enemy({ kind });
    const beginBossPresentation = vi.fn();
    const construction = {
      sideSpawn: () => 42,
      createGround: vi.fn((kind: string) => create(kind)),
      createAir: vi.fn((kind: string, x: number, y: number) => enemy({ kind, x, y })),
      createSupport: vi.fn((kind: string) => create(kind)),
      createBoss: vi.fn((id?: string) => enemy({ kind: "boss", isBoss: true, isMirrorBoss: true,
        ...(id === undefined ? {} : { bossId: id }), bossName: "Echo" })),
      beginBossPresentation,
    };

    expect(constructLiveEnemy({ type: "charger" }, construction).kind).toBe("charger");
    expect(constructLiveEnemy({ type: "flyer" }, construction)).toMatchObject({ kind: "flyer", x: 42, y: 200 });
    expect(constructLiveEnemy({ type: "wraith" }, construction)).toMatchObject({ kind: "wraith", x: 42, y: 220 });
    expect(constructLiveEnemy({ type: "mender" }, construction).kind).toBe("mender");
    const boss = constructLiveEnemy({ type: "boss" }, construction);
    expect(boss._live).toBe(true);
    expect(beginBossPresentation).toHaveBeenCalledWith(boss);
    const mini = constructLiveEnemy({ type: "miniboss", bossId: "echo" }, construction);
    expect(mini).toMatchObject({ hp: 40, maxHp: 40, isMiniBoss: true, bossName: "◇ Echo", _live: true });
    expect(beginBossPresentation).toHaveBeenCalledTimes(1);
  });

  it("applies regular scaling, authored variation, navigation and replay invariants once", () => {
    const target = enemy({ variantName: "Swift" });
    const { base, installed } = port();
    completeEnemySpawn(target, { type: "charger", hpScale: 2, dmgScale: 1.5 }, base);

    expect(target).toMatchObject({ hp: 200, maxHp: 200, hpDisplay: 200, contactDmg: 15,
      dmgScale: 1.5, x: 120, y: 500, canClimb: true, climber: true, climbApt: 0.75, spawnT: 0.35 });
    expect(base.applyVariant).toHaveBeenCalledWith(target, expect.objectContaining({ id: "swift" }));
    expect(base.rollAffixes).toHaveBeenCalledWith(target, 4);
    expect(base.recordSpawn).toHaveBeenCalledWith(target, "charger", { vn: "Swift", b: "" });
    expect(installed).toEqual([target]);
  });

  it("applies structural and difficulty boss scaling without regular affixes", () => {
    const target = enemy({ kind: "boss", hp: 1000, maxHp: 1000, isBoss: true, bossId: "warden", bossName: "Warden" });
    const { base } = port({ run: () => ({ mode: "gauntlet" as const, wave: 8, bossesBeaten: 2, diffHp: 1.5 }) });
    completeEnemySpawn(target, { type: "boss" }, base);

    expect(target.hp).toBeCloseTo(3120);
    expect(target.contactDmg).toBeCloseTo(14);
    expect(base.applyVariant).not.toHaveBeenCalled();
    expect(base.rollAffixes).not.toHaveBeenCalled();
    expect(base.recordSpawn).toHaveBeenCalledWith(target, "boss", { vn: "", b: "warden" });
  });
});
