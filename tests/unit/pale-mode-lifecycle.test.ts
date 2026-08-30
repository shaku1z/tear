import { describe, expect, it } from "vitest";
import { PRESETS } from "../../src/gameplay/affixes";
import { CONFIG } from "../../src/config/game-config";
import { SeededRandom, type RandomSource } from "../../src/domain/random";
import { ACHIEVEMENT_CATALOG } from "../../src/gameplay/progression/achievement-catalog";
import { AUTHORED_BOSS_ROSTER, BOSS_ROSTER, ENEMY_IDENTITY_IDS, PUBLISHED_ENEMY_IDENTITY_IDS, type EnemyKind } from "../../src/gameplay/run/content-director";
import { planNextWave, type PlanNextWaveOptions, type WavePlanningState, type WaveStage } from "../../src/gameplay/run/wave-planner";
import { STAGES } from "../../src/gameplay/stages";
import { PLAYGROUND_ALL_KINDS } from "../../src/gameplay/training/playground-controller";
import { TUTORIAL_LESSONS, TutorialController } from "../../src/gameplay/training/tutorial-controller";
import { activateStageEnvironment } from "../../src/gameplay/environment/stage-environment-activation";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { installWhiteHartEnvironmentRequest } from "../../src/gameplay/environment/white-hart-route-runtime";
import type { EnvironmentClearReason } from "../../src/gameplay/environment/environment-contracts";
import { cleanupBossEncounterActors, type BossEncounterCleanupReason } from "../../src/gameplay/run/boss-encounter";
import { createEnemyHarness } from "./enemy-test-harness";

class ConstantRandom implements RandomSource {
  constructor(private readonly value: number) {}
  next(): number { return this.value; }
}

const stages: readonly WaveStage[] = STAGES.map((stage) => ({
  id: stage.id,
  name: stage.name,
  boss: stage.boss,
  pool: stage.pool.map(([kind, weight, unlockWave]) => {
    if (typeof weight !== "number" || typeof unlockWave !== "number") throw new TypeError("invalid stage pool tuple");
    return { kind, weight, unlockWave };
  }),
}));

function state(overrides: Partial<WavePlanningState>): WavePlanningState {
  return {
    mode: "campaign", wave: 0, diffHp: 1, diffCount: 1,
    bossOrder: BOSS_ROSTER.map((boss) => boss.id), bossIdx: 0, bossesBeaten: 0,
    curBoss: null, currentStageIndex: 0, biomeIdx: null, pendingBossOutro: null,
    ...overrides,
  };
}

function plan(overrides: Partial<PlanNextWaveOptions> & { state: WavePlanningState }) {
  return planNextWave({
    tuning: CONFIG.run, stages, presets: PRESETS, random: new ConstantRandom(0.999),
    startDelay: CONFIG.run.startDelay, currentMultiplier: 1, ...overrides,
  });
}

describe("Pale mode and lifecycle coverage", () => {
  it("keeps authored enemies in Playground while Enemy Test uses the published set", () => {
    expect(PLAYGROUND_ALL_KINDS).toEqual(ENEMY_IDENTITY_IDS);
    const seen = new Set<EnemyKind>();
    for (let seed = 0; seed < 600; seed += 1) {
      const wave = plan({ state: state({ mode: "sandbox" }), random: new SeededRandom(`pale-sandbox-${String(seed)}`) });
      for (const spawn of wave.state.spawnQueue) if (spawn.type !== "boss" && spawn.type !== "miniboss") seen.add(spawn.type);
    }
    expect(seen).toEqual(new Set(PUBLISHED_ENEMY_IDENTITY_IDS));
    expect(seen.has("rimehound")).toBe(false);
  });

  it.each(["endless", "gauntlet"] as const)("transitions from Verdant to published Voidspire in %s", (mode) => {
    const wave = plan({ state: state({ mode, wave: 21, currentStageIndex: 4, biomeIdx: 4 }) });
    expect(wave.state).toMatchObject({ wave: 22, stage: 4, currentStageIndex: 4, biomeIdx: 4 });
    expect(wave.state.spawnQueue.every((spawn) => stages[4]?.pool.some((entry) => entry.kind === spawn.type))).toBe(true);
    expect(stages[4]?.id).toBe("voidspire");
  });

  it("excludes Pale and White Hart from Adventure and Boss Test while preserving authored preview identity", () => {
    const campaign = plan({ state: state({ mode: "campaign", wave: 40, currentStageIndex: 4, biomeIdx: 4 }) });
    expect(campaign.state).toMatchObject({ wave: 41, stage: 4, currentStageIndex: 4, biomeIdx: 4 });
    expect(campaign.state.spawnQueue.every((spawn) => stages[4]?.pool.some((entry) => entry.kind === spawn.type))).toBe(true);
    expect(stages[4]?.id).toBe("voidspire");
    expect(BOSS_ROSTER.map(({ id }) => id)).not.toContain("white-hart");
    expect(AUTHORED_BOSS_ROSTER.map(({ id }) => id)).toContain("white-hart");
  });

  it("keeps Tutorial on its authored Charger/Ranged teaching surface", () => {
    const controller = new TutorialController(CONFIG);
    controller.start(1600);
    const spawnKinds = new Set<string>();
    for (let index = 0; index < TUTORIAL_LESSONS.length; index += 1) {
      controller.lessonIndex = index;
      const intents = controller.update({
        dt: 0, skipPressed: false, movingLeft: false, movingRight: false,
        player: { onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 },
        bladeState: "held", enemies: [], viewportWidth: 1600,
      });
      for (const intent of intents) if (intent.type === "spawn") spawnKinds.add(intent.kind);
    }
    expect(spawnKinds).toEqual(new Set(["charger", "ranged"]));
    expect(spawnKinds.has("rimehound")).toBe(false);
  });

  it("keeps bespoke White Hart achievements deferred while source-derived global boss rules cover it", () => {
    expect(ACHIEVEMENT_CATALOG.filter(({ id }) => id.includes("white_hart") || id.includes("white-hart"))).toEqual([]);
    expect(ACHIEVEMENT_CATALOG.find(({ id }) => id === "first_boss")?.rule).toEqual({ kind: "stat-threshold", stat: "bossKills", goal: 1 });
    expect(ACHIEVEMENT_CATALOG.find(({ id }) => id === "boss_nohit")?.rule).toEqual({ kind: "stat-threshold", stat: "bossNoHit", goal: 1 });
  });

  it("cleans Pale and White Hart ownership at every supported replacement boundary", () => {
    const boundaries: readonly Readonly<{
      label: "reset" | "retry" | "quit" | "defeat" | "victory" | "stage-transition" | "mode-change" | "restore-failure" | "disposal";
      boss: BossEncounterCleanupReason;
      environment: EnvironmentClearReason;
    }>[] = [
      { label: "reset", boss: "reset", environment: "new-run" },
      { label: "retry", boss: "retry", environment: "retry" },
      { label: "quit", boss: "exit", environment: "abandon" },
      { label: "defeat", boss: "death", environment: "defeat" },
      { label: "victory", boss: "death", environment: "boss-terminal" },
      { label: "stage-transition", boss: "stage-transition", environment: "stage-transition" },
      { label: "mode-change", boss: "reset", environment: "new-run" },
      { label: "restore-failure", boss: "restore", environment: "restore" },
      { label: "disposal", boss: "exit", environment: "disposal" },
    ];
    for (const boundary of boundaries) {
      const harness = createEnemyHarness();
      const boss = new harness.types.WhiteHart(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.whiteHart.h / 2);
      const environment = createEnvironmentRuntime({ stageId: "grounds", worldId: `pale-lifecycle:${boundary.label}` });
      activateStageEnvironment(environment, "pale-traverse", 100, "stage-transition");
      installWhiteHartEnvironmentRequest(environment, "enemy:white-hart", {
        sequence: 1, phase: 2, kind: "ghost-track", direction: 1, width: 54, damage: 16,
        threatening: true, points: [{ x: 100, y: 700 }, { x: 900, y: 700 }],
      }, 100);

      cleanupBossEncounterActors([boss], boundary.boss);
      environment.clear(boundary.environment);

      expect(environment.snapshot(), boundary.label).toMatchObject({ fields: [], combatObjects: [], routes: [] });
      expect(environment.lastClearReason, boundary.label).toBe(boundary.environment);
      expect(boss, boundary.label).toMatchObject({ cleanupReason: boundary.boss });
    }
  });
});
