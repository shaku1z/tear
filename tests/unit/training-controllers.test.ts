import { describe, expect, it } from "vitest";

import { BossArenaRules, SourceVoidController, createBossArena } from "../../src/gameplay/training/arena-rules";
import { PlaygroundController, trainingPlatforms } from "../../src/gameplay/training/playground-controller";
import { TUTORIAL_LESSONS, TutorialController } from "../../src/gameplay/training/tutorial-controller";

describe("tutorial controller", () => {
  it("preserves lesson order, thresholds, and delayed progression", () => {
    const controller = new TutorialController(); controller.start(1600);
    expect(TUTORIAL_LESSONS.map((lesson) => lesson.title)).toEqual([
      "MOVE", "JUMP", "DASH", "CUT", "LAUNCH", "JUGGLE", "SLAM", "POWER SLAM", "UPDRAFT", "THROW", "PARRY", "READY",
    ]);
    controller.counters.moveL = 26; controller.counters.moveR = 26;
    const snapshot = { dt: 0.1, skipPressed: false, movingLeft: false, movingRight: false, viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 }, bladeState: "held", enemies: [] };
    expect(controller.update(snapshot)).toContainEqual({ type: "sound", cue: "rankup" });
    expect(controller.completionDelay).toBe(1.1);
    controller.update({ ...snapshot, dt: 1.11 });
    expect(controller.step().title).toBe("JUMP");
  });

  it("produces a deterministic renderer-neutral ghost snapshot", () => {
    const left = new TutorialController(), right = new TutorialController(); left.start(1600); right.start(1600);
    left.ghostTime = 1.25; right.ghostTime = 1.25;
    expect(left.ghostSnapshot(800)).toEqual(right.ghostSnapshot(800));
    expect(left.ghostSnapshot(800)).toMatchObject({ visible: true, lesson: "MOVE", actor: { y: 775 } });
  });
});

describe("playground controller", () => {
  it("cycles training and five campaign arenas exactly", () => {
    const controller = new PlaygroundController();
    expect(controller.nextArena(5)).toEqual([{ type: "wipe" }, { type: "select-arena", arena: 0 }]);
    for (let index = 0; index < 4; index++) controller.nextArena(5);
    expect(controller.nextArena(5)).toEqual([{ type: "wipe" }, { type: "select-arena", arena: -1 }]);
    expect(trainingPlatforms(1600, 900, 800)).toHaveLength(3);
  });

  it("emits hotkey spawn intents in the legacy order", () => {
    const controller = new PlaygroundController({ hpMultiplier: 3, count: 5 });
    const intents = controller.update({ pressed: new Set(["Digit1", "KeyH"]), viewportWidth: 1600,
      player: { x: 800, y: 700, facing: 1, hp: 5, maxHp: 100, oneHit: false },
      run: { difficulty: "normal", difficultyDamage: 1, bossIndex: 0, bossOrder: ["warden"] }, enemies: [] }, { charger: "red", perfect: "cyan" });
    expect(intents[0]).toEqual({ type: "spawn", kind: "charger", count: 5, hpScale: 3 });
    expect(intents).toContainEqual({ type: "heal-player" });
    expect(controller.labAction({ id: "dash", owned: 1, tier: 1, tierCount: 2 })).toEqual({ type: "tier-up", upgradeId: "dash" });
    expect(controller.labAction({ id: "unique", owned: 1, tier: 0, unique: true })).toBeNull();
  });
});

describe("arena rules", () => {
  it("preserves authored boss layouts and the minimum-route invariant", () => {
    const platforms = [...(createBossArena("warden", 1600, 900, 800, 0.4) ?? [])];
    expect(platforms.map((platform) => [platform.x, platform.y, platform.w])).toEqual([
      [0, 800, 1600], [150, 430, 240], [1210, 430, 240], [680, 555, 240],
    ]);
    const elevated = platforms[1]; if (!elevated) throw new Error("Missing Warden platform");
    elevated.arenaFractureRequest = { reason: "impact", color: "red" };
    const state = { platforms, broken: [] };
    const rules = new BossArenaRules({ reformWarn: 0.4, reformClearMargin: 20, minElevatedActive: 1, crackWarn: 0.2,
      standBeforeWarn: 1, stressDrainDelay: 0.3, stressDrainRate: 1, brokenDuration: 1 }, { boss: "black", armoredShield: "blue" });
    rules.update(state, 0.01, null, [], false);
    expect(elevated.arenaState).toBe("warning");
    rules.update(state, 0.21, null, [], false);
    expect(elevated.arenaState).toBe("broken");
    expect(state.platforms.filter((platform) => platform.oneway)).toHaveLength(2);
  });

  it("creates identical Source streams for the same seed", () => {
    const config = { voidSpawnBehind: 200, voidSpawnAhead: 400, voidChunkWidthMin: 500, voidChunkWidthMax: 620,
      voidPlatformWidthMin: 170, voidPlatformWidthMax: 260, voidLowerMin: 560, voidLowerMax: 680, voidUpperMin: 300,
      voidUpperMax: 450, voidLaneClearance: 90, voidTransferMin: 120, voidTransferMax: 260, scrollSpeed: 120,
      scrollSpeedMax: 260, thawSpeedMult: 1.35, voidFirePeriod: 3, voidFireArm: 0.8, voidFireHot: 1,
      voidCageH: 120, voidCageHalfW: 55, descentArrival: 0.8, descentIngressBelow: 180, voidTransferGrace: 0.4,
      voidCamZoom: 0.82, voidRecycleMargin: 120, scrollRamp: 4, voidWispCooldown: 4, arrivalFxStep: 0.07,
      crackWarn: 0.6, descentDissolve: 1, descentLift: 1, descentReveal: 1,
      voidCrumbleStand: 0.5, voidFallDamage: 20, voidSlowDuration: 1 };
    const controller = new SourceVoidController(config, { width: 1600, height: 900, groundY: 800 },
      { jumpSpeed: 900, gravity: 2400, moveSpeed: 500, dashSpeed: 1100, dashDuration: 0.18 },
      { dialogueDuck: 0.4, unmakeMix: 0.3, releaseMix: 0.5, revealMix: 0.8 });
    const player = () => ({ x: 800, y: 300, vx: 0, vy: 0, hw: 20, hh: 30, onGround: true, iframe: 0,
      voidSlowT: 0, voidTransferT: 0, voidLane: null, supportPlatform: null, voidMajorWindow: false });
    const first = controller.start({ id: "source", x: 900, y: 300, color: "purple" }, "fixed-seed", player(), true).state;
    const second = controller.start({ id: "source", x: 900, y: 300, color: "purple" }, "fixed-seed", player(), true).state;
    expect(first.chunks.map((chunk) => [chunk.id, chunk.motif, chunk.platforms.map((platform) => platform.y)])).toEqual(
      second.chunks.map((chunk) => [chunk.id, chunk.motif, chunk.platforms.map((platform) => platform.y)]));

    const hazardPlayer = { ...player(), hazardT: 0, hazardDmgMult: 1 };
    const collapsing = first.platforms[0]; if (!collapsing) throw new Error("Missing void platform");
    collapsing.voidType = "crumble"; collapsing.touchT = 0.01;
    hazardPlayer.x = collapsing.x + collapsing.w / 2; hazardPlayer.y = collapsing.y - hazardPlayer.hh;
    const collapseIntents = controller.updateHazards(first, 0.02, hazardPlayer, 0);
    expect(collapseIntents).toContainEqual({ type: "remove-surface-projectiles", platformId: collapsing.platformId });
    expect(first.platforms).not.toContain(collapsing);

    hazardPlayer.y = 1000;
    first.rescueCooldown = 0;
    const rescueIntents = controller.updateHazards(first, 0, hazardPlayer, 0);
    expect(rescueIntents.some((intent) => intent.type === "rescue-player" && intent.damage === 20)).toBe(true);
    expect(first.rescueCooldown).toBe(0.8);
  });
});
