import { describe, expect, it } from "vitest";
import { PRESETS } from "../../src/gameplay/affixes";
import { CONFIG } from "../../src/config/game-config";
import { SeededRandom, type RandomSource } from "../../src/domain/random";
import { BOSS_ROSTER, ENEMY_IDENTITY_IDS, PUBLISHED_ENEMY_IDENTITY_IDS, type EnemyKind } from "../../src/gameplay/run/content-director";
import { planNextWave, type PlanNextWaveOptions, type WavePlanningState, type WaveStage } from "../../src/gameplay/run/wave-planner";
import { STAGES } from "../../src/gameplay/stages";
import { PLAYGROUND_ALL_KINDS } from "../../src/gameplay/training/playground-controller";
import { TUTORIAL_LESSONS, TutorialController } from "../../src/gameplay/training/tutorial-controller";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
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

describe("Verdant mode coverage", () => {
  it("projects authored identities into Playground and published identities into Enemy Test", () => {
    expect(PLAYGROUND_ALL_KINDS).toEqual(ENEMY_IDENTITY_IDS);

    const seen = new Set<EnemyKind>();
    for (let seed = 0; seed < 600; seed += 1) {
      const wave = plan({ state: state({ mode: "sandbox" }), random: new SeededRandom(`verdant-sandbox-${String(seed)}`) });
      for (const spawn of wave.state.spawnQueue) {
        if (spawn.type !== "boss" && spawn.type !== "miniboss") seen.add(spawn.type);
      }
    }
    expect(seen).toEqual(new Set(PUBLISHED_ENEMY_IDENTITY_IDS));
  });

  it.each(["endless", "gauntlet"] as const)("uses the authored Verdant pool when %s rotates into the biome", (mode) => {
    const wave = plan({ state: state({ mode, wave: 16, currentStageIndex: 3, biomeIdx: 3 }) });
    expect(wave.state).toMatchObject({ wave: 17, stage: 3, currentStageIndex: 3, biomeIdx: 3 });
    expect(wave.state.spawnQueue.some((spawn) => spawn.type === "rootbinder")).toBe(true);
    expect(wave.state.spawnQueue.every((spawn) => stages[3]?.pool.some((entry) => entry.kind === spawn.type))).toBe(true);
  });

  it("keeps Campaign and Boss Test on the same Verdant and Rootbound authorities", () => {
    const campaign = plan({ state: state({ mode: "campaign", wave: 31, currentStageIndex: 3, biomeIdx: 3 }) });
    expect(campaign.state.spawnQueue.some((spawn) => spawn.type === "rootbinder")).toBe(true);

    const rootboundIndex = BOSS_ROSTER.findIndex((boss) => boss.id === "rootbound");
    const bossTest = plan({
      state: state({ mode: "bossonly", wave: rootboundIndex, bossIdx: rootboundIndex }),
      bossOnly: true,
    });
    expect(bossTest.state).toMatchObject({ curBoss: "rootbound", stage: 3, currentStageIndex: 3 });
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
    expect(spawnKinds.has("rootbinder")).toBe(false);
  });

  it("cleans Verdant environment and Rootbound ownership at every supported lifecycle boundary", () => {
    const boundaries: readonly Readonly<{
      label: "reset" | "retry" | "quit" | "defeat" | "victory" | "stage-transition" | "mode-change";
      boss: BossEncounterCleanupReason;
      environment: EnvironmentClearReason;
    }>[] = [
      { label: "reset", boss: "reset", environment: "new-run" },
      { label: "retry", boss: "retry", environment: "retry" },
      { label: "quit", boss: "exit", environment: "abandon" },
      { label: "defeat", boss: "death", environment: "defeat" },
      { label: "victory", boss: "death", environment: "boss-terminal" },
      { label: "stage-transition", boss: "exit", environment: "stage-transition" },
      { label: "mode-change", boss: "reset", environment: "new-run" },
    ];
    for (const boundary of boundaries) {
      const harness = createEnemyHarness();
      const boss = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2);
      const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: `lifecycle:${boundary.label}` });
      environment.addField({ kind: "bloom-well", geometry: { x: 800, y: 700, radius: 120 }, state: "active",
        stateTick: 0, timer: 0, ownerId: "enemy:rootbound", schedule: null,
        eligibility: { player: true, enemies: true, bosses: true }, force: null, cleanupReason: null });
      environment.addRoute({ kind: "regrowth-link", points: [{ x: 800, y: 700 }], state: "active",
        stateTick: 0, ownerId: "enemy:rootbound", cleanupReason: null });

      cleanupBossEncounterActors([boss], boundary.boss);
      environment.clear(boundary.environment);

      expect(environment.snapshot(), boundary.label).toMatchObject({ fields: [], combatObjects: [], routes: [] });
      expect(environment.lastClearReason, boundary.label).toBe(boundary.environment);
      expect(boss, boundary.label).toMatchObject({ cleanupReason: boundary.boss });
    }
  });
});
