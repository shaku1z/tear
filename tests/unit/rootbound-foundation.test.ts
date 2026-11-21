import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  BOSS_DEFINITIONS,
  BOSS_IDENTITY_IDS,
  bossPhaseAttackAvailable,
  ROOTBOUND_DEFINITION,
} from "../../src/gameplay/run/boss-definitions";
import {
  beginBossEncounter,
  cleanupBossEncounterActors,
  type BossEncounterCleanupReason,
} from "../../src/gameplay/run/boss-encounter";
import { STAGE_BOSS_HOME } from "../../src/gameplay/stages";
import { planBossPlacement } from "../../src/gameplay/run/boss-placement";
import { BossArenaRules, createBossArena, type ArenaPlatform } from "../../src/gameplay/training/arena-rules";
import { createEnemyHarness } from "./enemy-test-harness";
import { createEnemyPresentation } from "../../src/presentation/enemies/enemy-presentation";
import { clamp, len, lerp } from "../../src/domain/geometry";
import {
  createBossAttackRunnerState,
  type BossAttackRunnerState,
} from "../../src/gameplay/entities/boss-attack-runner";
import { ROOTBOUND_MOVES } from "../../src/gameplay/entities/enemy-types/rootbound-moves";
import type { BossTell } from "../../src/gameplay/entities/boss-tells";
import { bossTellLayer, setBossTellSkin } from "../../src/presentation/enemies/renderers/boss-tell-renderer";

/** The drawing call each move's wind-up is built from: a curled vine, an earth mound, legs, thorns, a spike. */
const MOVE_WIND_UP_CALL: Readonly<Record<string, string>> = {
  "vine-lash": "quadraticCurveTo",
  "root-glide": "ellipse",
  "canopy-vault": "lineTo",
  "thorn-burst": "lineTo",
  "root-wave": "closePath",
  "plant-graft": "ellipse",
  "root-cage": "ellipse",
  "bloom-shift": "arc",
  regrowth: "ellipse",
  "last-spring": "closePath",
};
const ALL_MOVES = [
  "vine-lash",
  "root-glide",
  "canopy-vault",
  "thorn-burst",
  "root-wave",
  "plant-graft",
  "root-cage",
  "bloom-shift",
  "regrowth",
  "last-spring",
];

/** Records each drawing call's name in `calls` and, when given, its name and arguments in `log`. */
function recordingCanvas(calls: string[], log?: { name: string; args: unknown[] }[]): CanvasRenderingContext2D {
  // A real canvas starts fully opaque; the figure layer multiplies into it.
  const values = new Map<PropertyKey, unknown>([["globalAlpha", 1]]);
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      return (...args: unknown[]): void => {
        calls.push(String(property));
        log?.push({ name: String(property), args });
      };
    },
    set(_target, property, value): boolean {
      values.set(property, value);
      return true;
    },
  });
}

describe("Rootbound production foundation", () => {
  it("locks canonical identity, authored name, phase marks, and Verdant home stage", () => {
    expect(BOSS_IDENTITY_IDS).toContain("rootbound");
    expect(ROOTBOUND_DEFINITION).toEqual({
      id: "rootbound",
      name: "The Rootbound",
      phaseMarks: [0.65, 0.28],
      spawn: { factoryId: "rootbound", lift: "boss" },
    });
    expect(STAGE_BOSS_HOME["verdant-sanctum"]).toBe("rootbound");
    expect(BOSS_DEFINITIONS.find(({ id }) => id === "rootbound")).toBe(ROOTBOUND_DEFINITION);
    expect(Object.isFrozen(ROOTBOUND_DEFINITION)).toBe(true);
    expect(Object.isFrozen(ROOTBOUND_DEFINITION.phaseMarks)).toBe(true);
  });

  it("constructs through the approved enemy family with only implemented attacks declared", () => {
    const harness = createEnemyHarness();
    const placement = planBossPlacement("rootbound", CONFIG.view.w, CONFIG, CONFIG.view.w / 2);
    const boss = new harness.types.Rootbound(placement.x, placement.y);

    expect(placement.factoryId).toBe("rootbound");
    expect([1, 2, 3].map((phase) => bossPhaseAttackAvailable("rootbound", phase))).toEqual([true, true, true]);
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
      availableAttacks: ALL_MOVES,
      phaseMarks: [0.65, 0.28],
    });
  });

  it("installs a distinct root-throne silhouette with an authored intro pose", () => {
    const harness = createEnemyHarness();
    createEnemyPresentation({
      A11Y: { highContrast: false, reducedMotion: false },
      CLOCK: { sim: 0 },
      policy: CONFIG,
      GFX: { low: false },
      THEME: { dark: false, ink: "#171219", rim: "#fff" },
      UI: { font: (size) => `${String(size)}px sans-serif`, tag: () => undefined, t: { type: { caption: 13 } } },
      clamp,
      len,
      lerp,
    }).install(harness.types);
    const boss = new harness.types.Rootbound(
      CONFIG.view.w / 2,
      CONFIG.world.groundY - CONFIG.boss.h / 2,
    ) as InstanceType<typeof harness.types.Rootbound> & {
      draw(canvas: CanvasRenderingContext2D, player: unknown): void;
    };
    const drawing = (introT: number) => {
      const calls: string[] = [];
      const log: { name: string; args: unknown[] }[] = [];
      boss.introT = introT;
      boss.draw(recordingCanvas(calls, log), harness.player);
      return { calls, scales: log.filter((call) => call.name === "scale").map((call) => call.args) };
    };
    const rising = drawing(CONFIG.bossTheater.introDur / 2);
    const risen = drawing(0);

    // The seed pod: two curved halves, each drawn as a filled and inked shape.
    expect(rising.calls.filter((name) => name === "bezierCurveTo").length).toBeGreaterThanOrEqual(4);
    expect(rising.calls).toEqual(expect.arrayContaining(["save", "translate", "scale", "fill", "stroke", "restore"]));
    // The intro pose squashes the pod while it rises, and lets go once it has risen.
    expect(rising.scales).not.toEqual(risen.scales);
  });

  it("hands every mark to the biome's skin, and puts a landing strike in front of the body", () => {
    const harness = createEnemyHarness();
    createEnemyPresentation({
      A11Y: { highContrast: false, reducedMotion: false },
      CLOCK: { sim: 2 },
      policy: CONFIG,
      GFX: { low: false },
      THEME: { dark: false, ink: "#171219", rim: "#fff" },
      UI: { font: (size) => `${String(size)}px sans-serif`, tag: () => undefined, t: { type: { caption: 13 } } },
      clamp,
      len,
      lerp,
    }).install(harness.types);
    const draw = (stage: "tell" | "active", skinned: boolean): { skinned: string[]; calls: string[] } => {
      const seen: string[] = [];
      setBossTellSkin("verdant-sanctum", (_ctx, tell: BossTell, state) => {
        seen.push(`${tell.attackId}:${tell.mark}:${tell.stage}:${bossTellLayer(tell)}:${typeof state.progress}`);
        return skinned;
      });
      const boss = new harness.types.Rootbound(800, CONFIG.world.groundY - CONFIG.boss.h / 2) as unknown as {
        moveState: BossAttackRunnerState;
        draw(canvas: CanvasRenderingContext2D, player: unknown): void;
      };
      boss.moveState = {
        ...createBossAttackRunnerState(0),
        run: {
          attackId: "root-glide",
          stage,
          stageTick: 0,
          facing: -1,
          origin: { x: 800, y: 0 },
          target: { x: 500, y: CONFIG.world.groundY - 36 },
          landed: false,
          parried: false,
        },
      };
      const calls: string[] = [];
      boss.draw(recordingCanvas(calls), harness.player);
      setBossTellSkin("verdant-sanctum", null);
      return { skinned: seen, calls };
    };
    expect(draw("tell", true).skinned).toEqual(["root-glide:box:warning:behind:number"]);
    expect(draw("active", true).skinned).toEqual(["root-glide:box:active:front:number"]);
    // A skin that draws the mark replaces the default plate; one that declines leaves it in place.
    const plates = (calls: readonly string[]): number => calls.filter((call) => call === "strokeRect").length;
    expect(plates(draw("tell", true).calls)).toBeLessThan(plates(draw("tell", false).calls));
  });

  it("draws every move's wind-up and its shared danger mark in every accessibility profile", () => {
    for (const profile of [
      { highContrast: false, reducedMotion: false, low: false },
      { highContrast: true, reducedMotion: false, low: false },
      { highContrast: false, reducedMotion: true, low: true },
      { highContrast: true, reducedMotion: true, low: true },
    ]) {
      const harness = createEnemyHarness();
      createEnemyPresentation({
        A11Y: { highContrast: profile.highContrast, reducedMotion: profile.reducedMotion },
        CLOCK: { sim: 2 },
        policy: CONFIG,
        GFX: { low: profile.low },
        THEME: { dark: false, ink: "#171219", rim: "#fff" },
        UI: { font: (size) => `${String(size)}px sans-serif`, tag: () => undefined, t: { type: { caption: 13 } } },
        clamp,
        len,
        lerp,
      }).install(harness.types);
      for (const move of ROOTBOUND_MOVES.attacks) {
        const boss = new harness.types.Rootbound(800, CONFIG.world.groundY - CONFIG.boss.h / 2) as unknown as {
          moveState: BossAttackRunnerState;
          tells(): readonly { attackId: string; stage: string }[];
          draw(canvas: CanvasRenderingContext2D, player: unknown): void;
        };
        const target = { x: 500, y: CONFIG.world.groundY - 30 };
        boss.moveState = {
          ...createBossAttackRunnerState(0),
          run: {
            attackId: move.id,
            stage: "tell",
            stageTick: -30,
            facing: -1,
            origin: { x: 800, y: 0 },
            target,
            landed: false,
            parried: false,
          },
        };
        const label = `${JSON.stringify(profile)} ${move.id}`;
        expect(
          boss.tells().map((tell) => [tell.attackId, tell.stage]),
          label,
        ).toContainEqual([move.id, "warning"]);
        const calls: string[] = [];
        boss.draw(recordingCanvas(calls), harness.player);
        expect(calls, label).toEqual(expect.arrayContaining([MOVE_WIND_UP_CALL[move.id], "stroke", "fill"]));
      }
    }
  });

  it("draws a root from the keeper to each planted Graft in low-graphics reduced-motion rendering", () => {
    const harness = createEnemyHarness();
    createEnemyPresentation({
      A11Y: { highContrast: true, reducedMotion: true },
      CLOCK: { sim: 2 },
      policy: CONFIG,
      GFX: { low: true },
      THEME: { dark: false, ink: "#171219", rim: "#fff" },
      UI: { font: (size) => `${String(size)}px sans-serif`, tag: () => undefined, t: { type: { caption: 13 } } },
      clamp,
      len,
      lerp,
    }).install(harness.types);
    const boss = new harness.types.Rootbound(800, CONFIG.world.groundY - CONFIG.boss.h / 2) as InstanceType<
      typeof harness.types.Rootbound
    > & { draw(canvas: CanvasRenderingContext2D, player: unknown): void };
    boss.hp = boss.maxHp * 0.5;
    boss.update(1 / 120, harness.platforms, harness.player);
    boss.cinematicRequest = null;
    boss.cinematicT = 0;
    // A root is a curve from the keeper's feet that ends at the foot of a Graft.
    const roots = (): number => {
      const log: { name: string; args: unknown[] }[] = [];
      boss.draw(recordingCanvas([], log), harness.player);
      const graftFeet = boss
        .graftAnchorPlacements()
        .map(
          (graft) =>
            `${String(graft.geometry.x + (graft.geometry.w ?? 0) / 2)},${String(graft.geometry.y + (graft.geometry.h ?? 0))}`,
        );
      return log.filter((call) => call.name === "quadraticCurveTo" && graftFeet.includes(call.args.slice(2).join(",")))
        .length;
    };
    const unrooted = roots();
    Object.assign(boss, {
      graftRequests: [
        { graftType: "mercy", geometry: { x: 300, y: 620, w: 54, h: 90 } },
        { graftType: "bastion", geometry: { x: 780, y: 430, w: 54, h: 90 } },
        { graftType: "haste", geometry: { x: 1250, y: 620, w: 54, h: 90 } },
      ],
      plantedGraftTypes: ["mercy", "bastion"],
    });
    // One root per planted Graft; the requested but unplanted one has none yet.
    expect(roots() - unrooted).toBe(2);
  });

  it("places the grounded Rootbound body through the shared boss placement authority", () => {
    const placement = planBossPlacement("rootbound", CONFIG.view.w, CONFIG, CONFIG.view.w / 2);

    expect(placement).toEqual({
      factoryId: "rootbound",
      x: CONFIG.view.w / 2,
      y: CONFIG.world.groundY - CONFIG.boss.h / 2,
    });
    expect(Object.isFrozen(placement)).toBe(true);
    expect(planBossPlacement("rootbound", CONFIG.view.w, CONFIG, CONFIG.view.w / 2)).toEqual(placement);
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
      setPlatforms: (next) => {
        platforms = next;
      },
      arenaFor: (id) =>
        createBossArena(id, CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY, CONFIG.bossArena.reformWarn)?.map(
          (platform) => ({ ...platform }),
        ) ?? null,
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
    rules.update(
      { platforms, broken: run._arenaBroken },
      CONFIG.bossArena.brokenDuration + CONFIG.bossArena.reformWarn,
      null,
      [],
      true,
    );
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
      availableAttacks: ALL_MOVES,
    });

    boss.introT = 0.5;
    const introHp = boss.hp;
    expect(boss.hit(100, 1, 0)).toBe(0);
    expect(boss.hp).toBe(introHp);
    expect(boss.contactDamageEnabled()).toBe(false);
    boss.update(1 / 120, harness.platforms, harness.player);
    expect(boss.state).toBe("intro");

    boss.introT = 0;
    boss.update(1 / 120, harness.platforms, harness.player);
    expect(boss.state).toBe("recover");
    expect(boss.hit(100, 1, 0)).toBe(100);
    expect(boss.hp).toBe(introHp - 100);

    boss.hp = boss.maxHp * boss.phaseMarks[0];
    boss.update(1 / 120, harness.platforms, harness.player);
    expect(boss).toMatchObject({ phase: 2, phaseMarker: 2, phaseTag: "THE GARDEN REMEMBERS" });
    expect(boss.cinematicRequest).toMatchObject({ id: "rootbound-garden-remembers", pose: "rootboundGraft" });
    boss.cinematicRequest = null;
    boss.cinematicT = 0;
    boss.hp = boss.maxHp;
    expect(boss.phase).toBe(2);

    // Its body never deals touch damage, so a spawn that overlaps the player costs nothing; it blocks instead.
    boss.update(1, harness.platforms, harness.player);
    expect(boss.state).toBe("idle");
    boss.update(0.25, harness.platforms, harness.player);
    expect(boss).toMatchObject({
      state: "idle",
      atk: "unavailable",
      availableAttacks: ALL_MOVES,
    });
    expect(boss.contactDamageEnabled()).toBe(false);
    expect(boss.bodyBlocks()).toBe(true);
  });

  it("cleans Rootbound idempotently at every encounter replacement boundary", () => {
    const reasons: readonly BossEncounterCleanupReason[] = ["death", "reset", "retry", "exit", "restore"];
    for (const reason of reasons) {
      const harness = createEnemyHarness();
      const boss = new harness.types.Rootbound(800, CONFIG.world.groundY - CONFIG.boss.h / 2);
      boss.introT = 0.8;
      boss.state = "idle";
      boss.stateT = 0.7;
      boss.vx = 40;
      boss.vy = -20;
      boss.cinematicPose = "test";
      boss.cinematicT = 0.5;
      cleanupBossEncounterActors([boss], reason);
      cleanupBossEncounterActors([boss], reason === "death" ? "reset" : "death");
      expect(boss).toMatchObject({
        cleanupReason: reason,
        introT: 0,
        state: "recover",
        stateT: 0,
        vx: 0,
        vy: 0,
        atk: "unavailable",
        cinematicPose: "",
        cinematicT: 0,
        cinematicRequest: null,
      });
    }
  });
});
