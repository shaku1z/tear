import { describe, expect, it } from "vitest";
import type { BossTell } from "../../src/gameplay/entities/boss-tells";
import { attributeHit, BODY_HIT, playBossFight, UNMARKED_HIT } from "../../src/playtest/boss-fight";
import { createTellAvoidingBossPlayer, TELL_AVOIDANCE } from "../../src/playtest/boss-player";
import { formatBossReport, noTellTotals } from "../../src/playtest/boss-report";
import { readBoss, type BossView, type PlayerBox } from "../../src/playtest/boss-view";
import type { TearScenarioV1 } from "../../src/tearbench/contracts";
import { createProductionHeadlessEnvironment } from "../../src/tearbench/production-headless-environment";

function bossOnly(boss: string | undefined, mode = "bossonly"): TearScenarioV1 {
  return {
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    id: `playtest-test-${boss ?? "roster"}-${mode}`,
    version: 1,
    description: "playtest test",
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    seed: "7",
    start: { mode, difficulty: "normal", weapon: "sword", ...(boss === undefined ? {} : { boss }) },
    maxTicks: 600,
    assertions: ["runtime.finite-state"],
    tags: ["playtest"],
  } as unknown as TearScenarioV1;
}

function tell(overrides: Partial<BossTell>): BossTell {
  return {
    id: "sweep",
    attackId: "sweep",
    mark: "box",
    stage: "warning",
    x: 500,
    y: 700,
    hw: 100,
    hh: 40,
    leadSeconds: 0.5,
    remainingSeconds: 0.2,
    damaging: true,
    ...overrides,
  };
}

function boss(tells: readonly BossTell[]): BossView {
  return {
    id: "rootbound",
    phase: 1,
    hp: 100,
    maxHp: 100,
    x: 900,
    y: 700,
    hw: 50,
    hh: 50,
    dead: false,
    tells,
    doing: "idle",
    limitedTellData: false,
  };
}

const PLAYER: PlayerBox = { x: 520, y: 716, hw: 14, hh: 24 };

describe("chosen boss in a headless boss-only run", () => {
  it.each(["rootbound", "aldric", "white-hart"])("starts the fight with %s", (id) => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(bossOnly(id));
      let seen: BossView | null = null;
      for (let tick = 0; tick < 600 && seen === null; tick += 1) {
        environment.step([]);
        seen = readBoss(environment.world());
      }
      expect(seen?.id).toBe(id);
    } finally {
      environment.dispose();
    }
  });

  it("still refuses a chosen boss outside boss-only mode", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      expect(() => environment.reset(bossOnly("rootbound", "endless"))).toThrow();
    } finally {
      environment.dispose();
    }
  });

  it("exposes the running world, which follows the simulation", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(bossOnly("rootbound"));
      const world = environment.world();
      expect(world.enemies()).toHaveLength(0);
      for (let tick = 0; tick < 600 && world.enemies().length === 0; tick += 1) environment.step([]);
      expect(environment.world().enemies().length).toBeGreaterThan(0);
    } finally {
      environment.dispose();
    }
  });
});

describe("boss fight measurement", () => {
  it("gives the same table for the same seed", () => {
    const request = {
      boss: "rootbound",
      difficulty: "normal",
      weapon: "sword",
      seed: "3",
      player: "avoids-tells",
      maxTicks: 1800,
    } as const;
    const first = playBossFight(request);
    const second = playBossFight(request);
    expect(second).toEqual(first);
    expect(formatBossReport([second])).toBe(formatBossReport([first]));
    expect(first.end).not.toBe("broken");
    expect(first.phases[0]?.phase).toBe(1);
    expect(formatBossReport([first])).toContain("difficulty normal  weapon sword  seed 3  player avoids-tells");
  });

  it("attributes a hit to the active tell on the player, then to the boss body, then to unmarked", () => {
    const active = boss([tell({ stage: "active", remainingSeconds: 0 })]);
    expect(attributeHit(PLAYER, active, active)).toBe("sweep");
    expect(attributeHit(PLAYER, boss([tell({})]), boss([]))).toBe(UNMARKED_HIT);
    expect(attributeHit({ ...PLAYER, x: 900, y: 700 }, boss([]), boss([]))).toBe(BODY_HIT);
    expect(attributeHit(PLAYER, null, null)).toBe(UNMARKED_HIT);
  });

  it("reports the unmarked share of the damage taken", () => {
    const phase = {
      phase: 1,
      ticks: 10,
      damageDealt: 0,
      bossHealed: 0,
      damageTaken: 40,
      hitsTaken: 2,
      exposedTicks: 0,
      hitsBy: { sweep: { hits: 1, damage: 30 }, [UNMARKED_HIT]: { hits: 1, damage: 10 } },
    };
    const fight = {
      boss: "rootbound",
      difficulty: "normal",
      weapon: "sword",
      seed: "1",
      player: "scripted",
      maxTicks: 10,
      end: "time limit",
      ticks: 10,
      bossMaxHp: 100,
      bossHpLeft: 100,
      limitedTellData: true,
      cinematicTicks: 0,
      phases: [phase],
    } as const;
    expect(noTellTotals([fight])).toEqual({ taken: 40, noTell: 10 });
    expect(formatBossReport([fight])).toContain("damage with no tell 10 of 40 taken (25%)");
    expect(formatBossReport([fight])).toContain("limited tell data");
  });
});

describe("the player that avoids tells", () => {
  const observation = (x: number) =>
    ({
      state: {
        tick: 1,
        observationClass: "structured-state",
        player: { x, y: 716, vx: 0, vy: 0, hp: 100, maxHp: 100, facing: 1, grounded: true, dashCharges: 1 },
        blade: { handX: x, handY: 700, tipX: x + 40, tipY: 700, vx: 0, vy: 0, tipSpeed: 0, state: "held" },
        entities: [],
        run: { mode: "bossonly", difficulty: "normal", weapon: "sword", stage: "verdant", wave: 1, score: 0 },
        availableActions: ["move"],
      },
      ui: { screen: "playing", choices: [] },
    }) as never;

  it("leaves a warned area by the nearer edge once it is about to land, and dashes when it is late", () => {
    const player = createTellAvoidingBossPlayer();
    const late = (TELL_AVOIDANCE.dashTicks - 1) / 120;
    const actions = player.decide(observation(PLAYER.x), boss([tell({ remainingSeconds: late })]), PLAYER);
    expect(actions.find((action) => action.type === "move")).toMatchObject({ x: 1000 });
    expect(actions.some((action) => action.type === "dash")).toBe(true);
  });

  it("ignores a warning that is still far off, an area it is not in, and a tell that does not hurt", () => {
    const early = (TELL_AVOIDANCE.reactTicks + 12) / 120;
    for (const tells of [
      [tell({ remainingSeconds: early })],
      [tell({ x: 1200 })],
      [tell({ damaging: false })],
      [tell({ stage: "exposed" })],
    ]) {
      const plain = createTellAvoidingBossPlayer().decide(observation(PLAYER.x), boss([]), PLAYER);
      const actions = createTellAvoidingBossPlayer().decide(observation(PLAYER.x), boss(tells), PLAYER);
      expect(actions.filter((action) => action.type === "dash")).toEqual(
        plain.filter((action) => action.type === "dash"),
      );
    }
  });
});
