import { describe, expect, it, vi } from "vitest";
import { createLiveTutorialRuntime } from "../../src/gameplay/training/live-tutorial-runtime";

describe("live tutorial runtime", () => {
  it("owns tutorial state, spawning, stabilization and ghost presentation", () => {
    const enemies = [{ kind: "charger", dead: false, tutDummy: true, hp: 10, maxHp: 100,
      stun: 0, x: 0, y: 0, hh: 20, contactDmg: 5 }];
    const tutorialEnemy = enemies[0];
    if (tutorialEnemy === undefined) throw new Error("tutorial fixture missing enemy");
    const drawGhost = vi.fn();
    const runtime = createLiveTutorialRuntime({
      viewportWidth: 1600, groundY: () => 700, skipPressed: () => false,
      movingLeft: () => false, movingRight: () => false,
      player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 }),
      bladeState: () => "held", enemies: () => enemies, playSound: vi.fn(),
      spawn: vi.fn(() => tutorialEnemy), installArena: vi.fn(), resetTrainingSpace: vi.fn(),
      terminateRun: vi.fn(), navigate: vi.fn(), releasePointer: vi.fn(),
      addProfileStat: vi.fn(), checkAchievements: vi.fn(), drawGhost,
    });
    runtime.start();
    runtime.mark("moveL");
    runtime.update(1 / 60);
    runtime.drawGhost();

    expect(runtime.active).toBe(true);
    expect(runtime.idx).toBe(0);
    expect(runtime.n.moveL).toBe(1);
    expect(enemies[0]).toMatchObject({ stun: 1, hp: 100 });
    expect(drawGhost).toHaveBeenCalledOnce();
    expect(runtime.step().t).toBe("MOVE");
    expect(typeof runtime.step().d).toBe("string");
  });

  it("spawns and configures a missing tutorial dummy", () => {
    const enemies: { kind: string; dead: boolean; tutDummy: boolean; hp: number; maxHp: number;
      stun: number; x: number; y: number; hh: number; affixCount?: number; contactDmg: number }[] = [];
    const spawned = { kind: "charger", dead: false, tutDummy: false, hp: 100, maxHp: 100,
      stun: 0, x: 0, y: 0, hh: 20, contactDmg: 5 };
    const spawn = vi.fn(() => { enemies.push(spawned); return spawned; });
    const runtime = createLiveTutorialRuntime({
      viewportWidth: 1600, groundY: () => 700, skipPressed: () => false,
      movingLeft: () => false, movingRight: () => false,
      player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 }),
      bladeState: () => "held", enemies: () => enemies, playSound: vi.fn(), spawn,
      installArena: vi.fn(), resetTrainingSpace: vi.fn(), terminateRun: vi.fn(), navigate: vi.fn(), releasePointer: vi.fn(), addProfileStat: vi.fn(),
      checkAchievements: vi.fn(), drawGhost: vi.fn(),
    });
    runtime.start();
    for (let index = 0; index < 60; index++) { runtime.mark("moveL"); runtime.mark("moveR"); }
    runtime.update(0); runtime.update(1.2);
    runtime.mark("jump"); runtime.mark("jump"); runtime.mark("jump"); runtime.update(0); runtime.update(1.2);
    runtime.mark("dash"); runtime.mark("dash"); runtime.mark("dash"); runtime.update(0); runtime.update(1.2);
    runtime.update(0);
    expect(runtime.step().t).toBe("CUT");
    expect(spawn).toHaveBeenCalledWith("charger", 8);
    expect(spawned).toMatchObject({ tutDummy: true, affixCount: 0, contactDmg: 0, y: 680 });
  });

  it("grounds and recenters a carried dummy at combat lesson boundaries", () => {
    const enemy = { kind: "charger", dead: false, tutDummy: true, hp: 20, maxHp: 100,
      stun: 0, x: 900, y: 300, vx: 80, vy: -600, onGround: false, hitCd: 1, hh: 20,
      affixCount: 0, contactDmg: 0 };
    const runtime = createLiveTutorialRuntime({
      viewportWidth: 1600, groundY: () => 700, skipPressed: () => false,
      movingLeft: () => false, movingRight: () => false,
      player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 }),
      bladeState: () => "held", enemies: () => [enemy], playSound: vi.fn(),
      spawn: vi.fn(() => enemy), installArena: vi.fn(), resetTrainingSpace: vi.fn(), terminateRun: vi.fn(), navigate: vi.fn(), releasePointer: vi.fn(),
      addProfileStat: vi.fn(), checkAchievements: vi.fn(), drawGhost: vi.fn(),
    });
    const advance = () => { runtime.update(0); runtime.update(1.2); };
    runtime.start();
    for (let index = 0; index < 60; index += 1) { runtime.mark("moveL"); runtime.mark("moveR"); }
    advance();
    runtime.mark("jump"); runtime.mark("jump"); runtime.mark("jump"); advance();
    runtime.mark("dash"); runtime.mark("dash"); runtime.mark("dash"); advance();
    Object.assign(enemy, { x: 900, y: 300, vx: 80, vy: -600, onGround: false, hitCd: 1, hp: 20 });
    for (let index = 0; index < 6; index += 1) runtime.mark("strike"); advance();

    expect(runtime.step().t).toBe("LAUNCH");
    expect(enemy).toMatchObject({ x: 580, y: 680, vx: 0, vy: 0, onGround: true, hitCd: 0, hp: 100 });
  });
});
