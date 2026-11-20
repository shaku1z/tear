import { describe, expect, it, vi } from "vitest";
import { applyWeapon } from "../../src/gameplay/weapons";
import { CONFIG } from "../../src/config/game-config";
import { createLiveTutorialRuntime } from "../../src/gameplay/training/live-tutorial-runtime";
import {
  loadShippingTutorialGold,
  shippingTutorialGoldStatus,
} from "../../src/gameplay/training/tutorial-gold-shipping";

// This file never loads the corpus before a lesson: the game does not either (training-host.ts).
describe("the coach's demonstrations arriving after the lesson starts", () => {
  it("plays the lesson without them, then shows them mid-lesson once they arrive", async () => {
    const config = structuredClone(CONFIG);
    applyWeapon(config, "sword");
    const enemy = { kind: "charger", dead: false, tutDummy: true, hp: 10, maxHp: 100, stun: 0, x: 0, y: 0, hh: 20 };
    const drawGhost = vi.fn();
    const runtime = createLiveTutorialRuntime({
      config,
      viewportWidth: 1600,
      groundY: () => 700,
      skipPressed: () => false,
      movingLeft: () => false,
      movingRight: () => false,
      player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 }),
      bladeState: () => "held",
      enemies: () => [{ ...enemy, contactDmg: 5 }],
      playSound: vi.fn(),
      spawn: vi.fn(() => ({ ...enemy, contactDmg: 5 })),
      installArena: vi.fn(),
      resetTrainingSpace: vi.fn(),
      beginPractice: vi.fn(),
      terminateRun: vi.fn(),
      navigate: vi.fn(),
      releasePointer: vi.fn(),
      addProfileStat: vi.fn(),
      checkAchievements: vi.fn(),
      drawGhost,
    });

    expect(shippingTutorialGoldStatus()).toBe("idle");
    runtime.start();
    runtime.mark("moveL");
    runtime.update(1 / 60);
    expect(runtime.active).toBe(true);
    expect(runtime.n.moveL).toBe(1);
    expect(runtime.session().coach?.available).toBe(false);
    expect(runtime.demonstrate()).toBe(false);
    runtime.drawGhost();
    expect(drawGhost).not.toHaveBeenCalled();

    expect(await loadShippingTutorialGold()).toBeDefined();
    runtime.update(1 / 60);
    // Still the same lesson, its progress kept: the corpus arrived mid-lesson.
    expect([runtime.active, runtime.idx, runtime.n.moveL]).toEqual([true, 0, 1]);
    expect(runtime.session().coach?.available).toBe(true);
    expect(runtime.demonstrate()).toBe(true);
    runtime.drawGhost();
    expect(drawGhost).toHaveBeenCalledOnce();
  });
});
