import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { clamp, len, lerp } from "../../src/domain/geometry";
import { createEnemyHarness } from "./enemy-test-harness";
import {
  BOSS_DEFINITIONS,
  bossPhaseAttackAvailable,
  WHITE_HART_PROVISIONAL_DEFINITION,
} from "../../src/gameplay/run/boss-definitions";
import { BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import { planBossPlacement } from "../../src/gameplay/run/boss-placement";
import {
  beginBossEncounter,
  cleanupBossEncounterActors,
  type BossEncounterCleanupReason,
} from "../../src/gameplay/run/boss-encounter";
import { STAGE_BOSS_HOME } from "../../src/gameplay/stages";
import { createBossArena, type ArenaPlatform } from "../../src/gameplay/training/arena-rules";
import { createLegacyEnemyPresentation } from "../../src/presentation/enemies/legacy-enemy-renderers";
import { buildSetupSnapshot } from "../../src/presentation/menu-setup-snapshots";
import { projectLiveBossObservation } from "../../src/tearbench/live-observation-actors";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";

function recordingCanvas(calls: string[]): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      return (): void => { calls.push(String(property)); };
    },
    set(_target, property, value): boolean { values.set(property, value); return true; },
  });
}

describe("White Hart production foundation", () => {
  it("promotes one source definition into the canonical roster and Pale home stage", () => {
    expect(BOSS_DEFINITIONS.find(({ id }) => id === "white-hart")).toBe(WHITE_HART_PROVISIONAL_DEFINITION);
    expect(BOSS_ROSTER.find(({ id }) => id === "white-hart")).toEqual({ id: "white-hart", name: "The White Hart" });
    expect(STAGE_BOSS_HOME["pale-traverse"]).toBe("white-hart");
    expect([1, 2, 3].map((phase) => bossPhaseAttackAvailable("white-hart", phase))).toEqual([false, false, false]);
  });

  it("constructs a damageable low body with monotonic phases and no placeholder attacks", () => {
    const harness = createEnemyHarness();
    const placement = planBossPlacement("white-hart", CONFIG.view.w, CONFIG);
    const boss = new harness.types.WhiteHart(placement.x, placement.y);

    expect(placement).toEqual({
      factoryId: "white-hart",
      x: CONFIG.view.w / 2,
      y: CONFIG.world.groundY - CONFIG.whiteHart.h / 2,
    });
    expect(boss).toMatchObject({
      kind: "white-hart", bossId: "white-hart", bossName: "THE WHITE HART",
      epithet: "KEEPER OF THE LAST ROAD", openingLine: "TAKE THEM HOME.",
      presentationId: "white-hart", isBoss: true, hw: CONFIG.whiteHart.w / 2,
      hh: CONFIG.whiteHart.h / 2, hp: CONFIG.whiteHart.hp, maxHp: CONFIG.whiteHart.hp,
      contactDmg: CONFIG.whiteHart.contactDmg, phase: 1, phaseMarker: 1,
      phaseTag: "KEEPER OF THE PASS", state: "idle", atk: "unavailable", availableAttacks: [],
    });

    boss.introT = 0.5;
    expect(boss.contactDamageEnabled()).toBe(false);
    expect(boss.hit(100, 1, 0)).toBe(0);
    boss.update(1 / 120, harness.platforms, harness.player, []);
    expect(boss.state).toBe("intro");

    boss.introT = 0;
    boss.update(1 / 120, harness.platforms, harness.player, []);
    expect(boss.hit(100, 1, 0)).toBe(100);
    expect(boss.atk).toBe("unavailable");
    boss.hp = boss.maxHp * boss.phaseMarks[0];
    boss.update(1 / 120, harness.platforms, harness.player, []);
    expect(boss).toMatchObject({ phase: 2, phaseMarker: 2, phaseTag: "THE ROAD REMEMBERS", state: "recover" });
    boss.hp = boss.maxHp;
    expect(boss.phase).toBe(2);
    boss.hp = boss.maxHp * boss.phaseMarks[1];
    boss.update(1 / 120, harness.platforms, harness.player, []);
    expect(boss).toMatchObject({ phase: 3, phaseMarker: 3, phaseTag: "DAWN WILL NOT COME", atk: "unavailable" });
  });

  it("starts through the shared encounter and Pale living-arena path", () => {
    const stagePlatforms: ArenaPlatform[] = [{ x: 0, y: 700, w: 100, h: 20 }];
    let platforms = stagePlatforms;
    const run = { runTime: 41, bossAdds: [{}], _brokenPlats: [{}], _arenaBroken: [{} as ArenaPlatform] };
    const boss = { bossId: "white-hart", introT: 0 };
    beginBossEncounter(run, boss, CONFIG.bossTheater.introDur, {
      platforms: () => platforms,
      setPlatforms: (next) => { platforms = next; },
      arenaFor: (id) => createBossArena(id, CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY,
        CONFIG.bossArena.reformWarn)?.map((platform) => ({ ...platform })) ?? null,
    });

    expect(run).toMatchObject({ _bossFightT: 41, bossAdds: null, _preBossPlatforms: stagePlatforms, _brokenPlats: null, _arenaBroken: [] });
    expect(boss.introT).toBe(CONFIG.bossTheater.introDur);
    expect(platforms.length).toBeGreaterThan(2);
    expect(platforms.every((platform) => platform.arenaBoss === "white-hart")).toBe(true);
    expect(platforms.every((platform) => platform.arenaMaterial === "pale-ice")).toBe(true);
  });

  it("installs a readable non-humanoid silhouette in normal and accessible rendering", () => {
    for (const profile of [
      { highContrast: false, reducedMotion: false, low: false },
      { highContrast: true, reducedMotion: true, low: true },
    ]) {
      const harness = createEnemyHarness();
      createLegacyEnemyPresentation({
        A11Y: { highContrast: profile.highContrast, reducedMotion: profile.reducedMotion },
        CLOCK: { sim: 2 }, policy: CONFIG, GFX: { low: profile.low },
        THEME: { dark: false, ink: "#171219", rim: "#fff" },
        UI: { font: (size) => `${String(size)}px sans-serif`, tag: () => undefined, t: { type: { caption: 13 } } },
        clamp, len, lerp,
      }).install(harness.types);
      const boss = new harness.types.WhiteHart(800, CONFIG.world.groundY - CONFIG.whiteHart.h / 2) as
        InstanceType<typeof harness.types.WhiteHart> & { draw(canvas: CanvasRenderingContext2D): void };
      boss.hp = boss.maxHp * 0.2;
      const calls: string[] = [];
      boss.draw(recordingCanvas(calls));
      expect(calls.filter((name) => name === "lineTo").length).toBeGreaterThanOrEqual(20);
      expect(calls).toEqual(expect.arrayContaining(["save", "translate", "scale", "arc", "fill", "stroke", "restore"]));
    }
  });

  it("projects current phase/home facts and appears in Boss Test selection", () => {
    const harness = createEnemyHarness();
    const boss = new harness.types.WhiteHart(800, CONFIG.world.groundY - CONFIG.whiteHart.h / 2);
    expect(projectLiveBossObservation(boss)).toEqual({
      id: "white-hart", phase: "1", validPhases: ["1", "2", "3"], homeStage: "pale-traverse",
    });
    boss.hp = boss.maxHp * 0.2;
    expect(projectLiveBossObservation(boss)?.phase).toBe("3");

    const setup = buildSetupSnapshot({
      selectedMode: "bossonly", selectedDifficulty: "normal", selectedWeapon: "sword", selectedBoss: "white-hart",
      startGlyph: "▶", modes: [{ id: "bossonly", label: "Boss Test", blurb: "bosses" }],
      difficulties: [{ id: "normal", label: "Normal", desc: "normal", mods: { score: 1, coin: 1 } }],
      weapons: [{ id: "sword", name: "Sword", blurb: "blade", tags: ["melee"], throwIdentity: "returning" }],
      bosses: BOSS_ROSTER, livePlatform: false, best: { wave: 0, score: 0 }, formatTime: () => "0:00",
    });
    expect(setup.bossChoices?.find(({ id }) => id === "white-hart")).toEqual({
      id: "white-hart", label: "THE WHITE HART", selected: true,
    });
  });

  it("constructs the same White Hart family in an isolated detached production world", () => {
    const replay = createProductionReplayWorld({
      seed: "pt3-c6-white-hart-detached", mode: "bossonly",
      enemies: [{ id: "white-hart", x: 800, y: CONFIG.world.groundY - CONFIG.whiteHart.h / 2 }],
    });
    const actor = replay.world.state.enemies()[0] as unknown as {
      kind: string; bossId: string; presentationId: string; hp: number; maxHp: number; availableAttacks: readonly string[];
    } | undefined;
    expect(actor).toMatchObject({
      kind: "white-hart", bossId: "white-hart", presentationId: "white-hart",
      hp: CONFIG.whiteHart.hp, maxHp: CONFIG.whiteHart.hp, availableAttacks: [],
    });

    const second = createProductionReplayWorld({
      seed: "pt3-c6-white-hart-detached-second", mode: "bossonly",
      enemies: [{ id: "white-hart", x: 800, y: CONFIG.world.groundY - CONFIG.whiteHart.h / 2 }],
    });
    const firstActor = replay.world.state.enemies()[0];
    const secondActor = second.world.state.enemies()[0];
    if (firstActor === undefined || secondActor === undefined) throw new Error("detached White Hart fixture is missing");
    firstActor.hp = 1;
    expect(secondActor.hp).toBe(CONFIG.whiteHart.hp);
    expect(firstActor).not.toBe(secondActor);
    expect(replay.world.context.environment).not.toBe(second.world.context.environment);
  });

  it("cleans the foundation idempotently at every encounter replacement boundary", () => {
    const reasons: readonly BossEncounterCleanupReason[] = ["death", "reset", "retry", "exit", "stage-transition", "restore"];
    for (const reason of reasons) {
      const harness = createEnemyHarness();
      const boss = new harness.types.WhiteHart(800, CONFIG.world.groundY - CONFIG.whiteHart.h / 2);
      boss.introT = 0.8; boss.state = "idle"; boss.stateT = 0.7; boss.vx = 80; boss.vy = -30;
      boss.cinematicPose = "test"; boss.cinematicT = 0.5;
      cleanupBossEncounterActors([boss], reason);
      cleanupBossEncounterActors([boss], reason === "death" ? "reset" : "death");
      expect(boss).toMatchObject({ cleanupReason: reason, introT: 0, state: "recover", stateT: 0,
        vx: 0, vy: 0, atk: "unavailable", cinematicPose: "", cinematicT: 0, cinematicRequest: null });
      expect(boss.contactDamageEnabled()).toBe(false);
    }
  });
});
