import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  BOSS_DEFINITIONS,
  BOSS_IDENTITY_IDS,
  bossPhaseAttackAvailable,
  ROOTBOUND_PROVISIONAL_DEFINITION,
} from "../../src/gameplay/run/boss-definitions";
import { beginBossEncounter, cleanupBossEncounterActors, type BossEncounterCleanupReason } from "../../src/gameplay/run/boss-encounter";
import { STAGE_BOSS_HOME } from "../../src/gameplay/stages";
import { planBossPlacement } from "../../src/gameplay/run/boss-placement";
import { BossArenaRules, createBossArena, type ArenaPlatform } from "../../src/gameplay/training/arena-rules";
import { createEnemyHarness } from "./enemy-test-harness";
import { createLegacyEnemyPresentation } from "../../src/presentation/enemies/legacy-enemy-renderers";
import { clamp, len, lerp } from "../../src/domain/geometry";

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

describe("Rootbound production foundation", () => {
  it("locks identity, authored name, provisional phase marks, and Verdant home stage before factory promotion", () => {
    expect(BOSS_IDENTITY_IDS).toContain("rootbound");
    expect(ROOTBOUND_PROVISIONAL_DEFINITION).toEqual({
      id: "rootbound",
      name: "The Rootbound",
      phaseMarks: [0.65, 0.28],
    });
    expect(STAGE_BOSS_HOME["verdant-sanctum"]).toBe("rootbound");
    expect(BOSS_DEFINITIONS.find(({ id }) => id === "rootbound")).toBe(ROOTBOUND_PROVISIONAL_DEFINITION);
    expect(Object.isFrozen(ROOTBOUND_PROVISIONAL_DEFINITION)).toBe(true);
    expect(Object.isFrozen(ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks)).toBe(true);
  });

  it("constructs through the approved enemy family with only implemented attacks declared", () => {
    const harness = createEnemyHarness();
    const placement = planBossPlacement("rootbound", CONFIG.view.w, CONFIG);
    const boss = new harness.types.Rootbound(placement.x, placement.y);

    expect(placement.factoryId).toBe("rootbound");
    expect([1, 2, 3].map((phase) => bossPhaseAttackAvailable("rootbound", phase))).toEqual([true, false, false]);
    expect(bossPhaseAttackAvailable("warden", 1)).toBe(true);
    expect(boss).toMatchObject({
      kind: "rootbound",
      bossId: "rootbound",
      bossName: "THE ROOTBOUND",
      epithet: "KEEPER OF THE LAST MERCY",
      openingLine: "YOU DO NOT HAVE TO DIE HERE.",
      presentationId: "rootbound",
      isBoss: true,
      atk: "unavailable",
      availableAttacks: ["vine-sweep", "seed-arc", "rootline", "canopy-step"],
      phaseMarks: [0.65, 0.28],
    });
  });

  it("installs a distinct root-throne silhouette with an authored intro pose", () => {
    const harness = createEnemyHarness();
    createLegacyEnemyPresentation({
      A11Y: { highContrast: false, reducedMotion: false }, CLOCK: { sim: 0 }, policy: CONFIG,
      GFX: { low: false }, THEME: { dark: false, ink: "#171219", rim: "#fff" },
      UI: { font: (size) => `${String(size)}px sans-serif`, tag: () => undefined, t: { type: { caption: 13 } } },
      clamp, len, lerp,
    }).install(harness.types);
    const boss = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as
      InstanceType<typeof harness.types.Rootbound> & { draw(canvas: CanvasRenderingContext2D, player: unknown): void };
    const calls: string[] = [];
    boss.introT = CONFIG.bossTheater.introDur / 2;
    boss.draw(recordingCanvas(calls), harness.player);

    expect(calls.filter((name) => name === "lineTo").length).toBeGreaterThanOrEqual(14);
    expect(calls.filter((name) => name === "arc").length).toBeGreaterThanOrEqual(7);
    expect(calls).toEqual(expect.arrayContaining(["save", "translate", "scale", "fill", "stroke", "restore"]));
  });

  it("places the grounded Rootbound body through the shared boss placement authority", () => {
    const placement = planBossPlacement("rootbound", CONFIG.view.w, CONFIG);

    expect(placement).toEqual({
      factoryId: "rootbound",
      x: CONFIG.view.w / 2,
      y: CONFIG.world.groundY - CONFIG.boss.h / 2,
    });
    expect(Object.isFrozen(placement)).toBe(true);
    expect(planBossPlacement("rootbound", CONFIG.view.w, CONFIG)).toEqual(placement);
  });

  it("starts Rootbound through the shared encounter and living-arena lifecycle", () => {
    const stagePlatforms: ArenaPlatform[] = [{ x: 0, y: 700, w: 100, h: 20 }];
    let platforms = stagePlatforms;
    const run = {
      runTime: 14,
      bossAdds: [{}],
      _brokenPlats: [{}],
      _arenaBroken: [{ x: 1, y: 1, w: 1, h: 1 }],
    };
    const boss = { bossId: "rootbound", introT: 0 };

    beginBossEncounter(run, boss, CONFIG.bossTheater.introDur, {
      platforms: () => platforms,
      setPlatforms: (next) => { platforms = next; },
      arenaFor: (id) => createBossArena(
        id,
        CONFIG.view.w,
        CONFIG.view.h,
        CONFIG.world.groundY,
        CONFIG.bossArena.reformWarn,
      )?.map((platform) => ({ ...platform })) ?? null,
    });

    expect(run).toMatchObject({
      _bossFightT: 14,
      bossAdds: null,
      _preBossPlatforms: stagePlatforms,
      _brokenPlats: null,
      _arenaBroken: [],
    });
    expect(boss.introT).toBe(CONFIG.bossTheater.introDur);
    expect(platforms.length).toBeGreaterThan(2);
    expect(platforms.every((platform) => platform.arenaBoss === "rootbound")).toBe(true);
    expect(platforms.every((platform) => platform.arenaMaterial === "verdant-rootstone")).toBe(true);

    const route = platforms.find((platform) => platform.oneway);
    if (route === undefined) throw new Error("Rootbound arena must provide an elevated living route");
    route.arenaFractureRequest = { reason: "rootbound-test", color: "#e4c95a" };
    const rules = new BossArenaRules(CONFIG.bossArena, CONFIG.colors);
    rules.update({ platforms, broken: run._arenaBroken }, 0, null, [], true);
    expect(route.arenaState).toBe("warning");
    rules.update({ platforms, broken: run._arenaBroken }, CONFIG.bossArena.crackWarn, null, [], true);
    expect(route.arenaState).toBe("broken");
    expect(run._arenaBroken).toContain(route);
    rules.update({ platforms, broken: run._arenaBroken }, CONFIG.bossArena.brokenDuration + CONFIG.bossArena.reformWarn, null, [], true);
    expect(route.arenaState).toBe("stable");
    expect(platforms).toContain(route);
    expect(run._arenaBroken).toEqual([]);
  });

  it("owns a damageable base body, monotonic phase ordinal, and bounded idle/recovery loop", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2);
    const boss = actor as typeof actor & {
      introT: number;
      phaseMarker: number;
      phaseTag: string;
      state: "intro" | "idle" | "recover";
      stateT: number;
      contactDamageEnabled(): boolean;
    };

    expect(boss).toMatchObject({
      hw: CONFIG.boss.w / 2,
      hh: CONFIG.boss.h / 2,
      hp: CONFIG.boss.hp,
      maxHp: CONFIG.boss.hp,
      phase: 1,
      phaseMarker: 1,
      phaseTag: "KEEPER OF SPRING",
      state: "idle",
      availableAttacks: ["vine-sweep", "seed-arc", "rootline", "canopy-step"],
    });

    boss.introT = 0.5;
    const introHp = boss.hp;
    expect(boss.hit(100, 1, 0)).toBe(0);
    expect(boss.hp).toBe(introHp);
    expect(boss.contactDamageEnabled()).toBe(false);
    boss.update(1 / 120, harness.platforms, harness.player, []);
    expect(boss.state).toBe("intro");

    boss.introT = 0;
    boss.update(1 / 120, harness.platforms, harness.player, []);
    expect(boss.state).toBe("recover");
    expect(boss.hit(100, 1, 0)).toBe(100);
    expect(boss.hp).toBe(introHp - 100);

    boss.hp = boss.maxHp * boss.phaseMarks[0];
    boss.update(1 / 120, harness.platforms, harness.player, []);
    expect(boss).toMatchObject({ phase: 2, phaseMarker: 2, phaseTag: "THE GARDEN REMEMBERS" });
    boss.hp = boss.maxHp;
    expect(boss.phase).toBe(2);

    boss.update(1, harness.platforms, harness.player, []);
    expect(boss).toMatchObject({ state: "idle", atk: "unavailable", availableAttacks: ["vine-sweep", "seed-arc", "rootline", "canopy-step"] });
    expect(boss.contactDamageEnabled()).toBe(true);
  });

  it("cleans Rootbound idempotently at every encounter replacement boundary", () => {
    const reasons: readonly BossEncounterCleanupReason[] = ["death", "reset", "retry", "exit", "restore"];
    for (const reason of reasons) {
      const harness = createEnemyHarness();
      const boss = new harness.types.Rootbound(800, CONFIG.world.groundY - CONFIG.boss.h / 2);
      boss.introT = 0.8; boss.state = "idle"; boss.stateT = 0.7; boss.vx = 40; boss.vy = -20;
      boss.cinematicPose = "test"; boss.cinematicT = 0.5;
      cleanupBossEncounterActors([boss], reason);
      cleanupBossEncounterActors([boss], reason === "death" ? "reset" : "death");
      expect(boss).toMatchObject({ cleanupReason: reason, introT: 0, state: "recover", stateT: 0,
        vx: 0, vy: 0, atk: "unavailable", cinematicPose: "", cinematicT: 0, cinematicRequest: null });
    }
  });
});
