import { describe, expect, it } from "vitest";
import type { BossTell } from "../../src/gameplay/entities/boss-tells";
import type { TearAgentObservation } from "../../src/agents/contracts";
import {
  attributeHit,
  BODY_HIT,
  bossFightScenario,
  bossPhaseCount,
  playBossFight,
  UNMARKED_HIT,
  type BossFightRequest,
} from "../../src/playtest/boss-fight";
import { createTellAvoidingBossPlayer, TELL_AVOIDANCE } from "../../src/playtest/boss-player";
import { formatBossReport, noTellTotals, PRACTICE_REPORT_BOSSES, REPORT_BOSSES } from "../../src/playtest/boss-report";
import { isPracticeBossId } from "../../src/gameplay/training/boss-phase-practice-runtime";
import { playerWasReset, readBoss, type BossView, type PlayerBox } from "../../src/playtest/boss-view";
import type { TearScenarioV1 } from "../../src/tearbench/contracts";
import { createProductionHeadlessEnvironment } from "../../src/tearbench/production-headless-environment";
import { requireProductionHeadlessScenario } from "../../src/tearbench/production-headless-scenario";

function bossOnly(boss: BossFightRequest["boss"]): TearScenarioV1 {
  return bossFightScenario({
    boss,
    difficulty: "normal",
    weapon: "sword",
    seed: "7",
    player: "scripted",
    maxTicks: 600,
  });
}

interface RawBoss {
  readonly isBoss: true;
  hp: number;
  readonly maxHp: number;
  readonly phase: number;
  readonly updates: number;
}

function isRawBoss(value: unknown): value is RawBoss {
  if (typeof value !== "object" || value === null) return false;
  const actor = value as Record<string, unknown>;
  return (
    actor.isBoss === true &&
    typeof actor.hp === "number" &&
    typeof actor.maxHp === "number" &&
    typeof actor.phase === "number" &&
    typeof actor.updates === "number"
  );
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
  it.each(REPORT_BOSSES)("starts the fight with %s", (id) => {
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

  it("still refuses a chosen boss outside boss-only mode, and an unknown id, by name", () => {
    const raw = { ...bossOnly("rootbound"), start: { mode: "endless", difficulty: "normal", weapon: "sword" } };
    expect(() => requireProductionHeadlessScenario({ ...raw, start: { ...raw.start, boss: "rootbound" } })).toThrow(
      "natural boss selection requires bossonly mode",
    );
    expect(() =>
      requireProductionHeadlessScenario({
        ...bossOnly("rootbound"),
        start: { ...raw.start, mode: "bossonly", boss: "nobody" },
      }),
    ).toThrow("start.boss is not a registered current-game boss");
  });

  it("passes through a boss phase change: the cinematic that holds the simulation ends and the boss goes on", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset({ ...bossOnly("rootbound"), maxTicks: 6000 });
      const boss = (): RawBoss | undefined => {
        for (const enemy of environment.world().enemies()) if (isRawBoss(enemy)) return enemy;
        return undefined;
      };
      for (let tick = 0; tick < 600; tick += 1) environment.step([]);
      const actor = boss();
      expect(actor?.phase).toBe(1);
      if (actor === undefined) return;
      // Test-only: bring the boss to its Phase II threshold without playing the whole of Phase I.
      actor.hp = actor.maxHp * 0.5;
      let held = 0;
      for (let tick = 0; tick < 1800 && (held === 0 || environment.cinematicActive()); tick += 1) {
        environment.step([]);
        if (environment.cinematicActive()) held += 1;
      }
      expect(held).toBeGreaterThan(0);
      expect(environment.cinematicActive()).toBe(false);
      expect(boss()?.phase).toBe(2);
      const updates = boss()?.updates ?? 0;
      for (let tick = 0; tick < 60; tick += 1) environment.step([]);
      expect(boss()?.updates).toBeGreaterThan(updates);
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

describe("start at a chosen phase through the game's boss practice", () => {
  const practice = (boss: BossFightRequest["boss"], phase: number): BossFightRequest => ({
    boss,
    difficulty: "normal",
    weapon: "sword",
    seed: "5",
    player: "scripted",
    phase,
    maxTicks: 600,
  });

  // Every boss the game's practice accepts, at every later phase its definition has: no boss has its own path.
  const entries = PRACTICE_REPORT_BOSSES.flatMap((boss) =>
    Array.from({ length: bossPhaseCount(boss) - 1 }, (_, index) => [boss, index + 2] as const),
  );
  it.each(entries)("brings %s to phase %i by its own transitions, the player untouched", (boss, phase) => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(bossFightScenario(practice(boss, phase)));
      if (!isPracticeBossId(boss) || (phase !== 2 && phase !== 3)) throw new Error("not a practice entry");
      const lifecycle = environment.practiceBoss(boss, phase);
      let ticks = 0;
      for (; ticks < 7200 && lifecycle() !== "active"; ticks += 1) environment.step([]);
      expect(lifecycle()).toBe("active");
      expect(ticks).toBeGreaterThan(0);
      const seen = readBoss(environment.world());
      expect(seen?.id).toBe(boss);
      expect(seen?.phase).toBe(phase);
      expect(environment.policyObservation().player.hp).toBe(environment.policyObservation().player.maxHp);
    } finally {
      environment.dispose();
    }
  });

  it("takes the default bosses from the game's definitions", () => {
    expect(REPORT_BOSSES).toContain("white-hart");
    expect(PRACTICE_REPORT_BOSSES).toEqual(REPORT_BOSSES.filter(isPracticeBossId));
    expect(PRACTICE_REPORT_BOSSES).not.toContain("white-hart");
  });

  it("starts the measured fight in the chosen phase and reports the setup time apart", () => {
    const fight = playBossFight(practice("rootbound", 2));
    expect(fight.end).not.toBe("broken");
    expect(fight.setupTicks).toBeGreaterThan(0);
    expect(fight.phases[0]?.phase).toBe(2);
    expect(formatBossReport([fight])).toContain("start: phase II through the game's boss practice");
  });

  it("counts the Playground's reset of a defeated player as the defeat, and stops the fight there", () => {
    const fight = playBossFight({ ...practice("aldric", 3), maxTicks: 21_600 });
    expect(fight.end).toBe("player defeated");
    expect(fight.reason).toContain("the Playground restored the player");
    const taken = fight.phases.reduce((total, phase) => total + phase.damageTaken, 0);
    expect(taken).toBeLessThanOrEqual(100);
    expect(fight.killingHit).toBeDefined();
  });

  it("tells a reset from a hit or a dash by its fresh invulnerability", () => {
    const world = (iframe: number) => ({ enemies: () => [], player: () => ({ iframe }) });
    expect(playerWasReset(world(2), 12, 100, 100)).toBe(true);
    expect(playerWasReset(world(0.9), 12, 100, 100)).toBe(false);
    expect(playerWasReset(world(2), 100, 100, 100)).toBe(false);
  });

  it("refuses, by name, a boss without phase practice and a weapon or difficulty the practice does not run", () => {
    expect(() => bossFightScenario(practice("white-hart", 2))).toThrow("white-hart has no phase practice in the game");
    expect(() => bossFightScenario(practice("rootbound", 4))).toThrow("rootbound has phases 1 to 3, not 4");
    expect(() => bossFightScenario({ ...practice("rootbound", 2), weapon: "hammer" })).toThrow(
      "runs only with Sword on Normal",
    );
    expect(() => bossFightScenario({ ...practice("rootbound", 2), difficulty: "hard" })).toThrow(
      "runs only with Sword on Normal",
    );
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(bossOnly("rootbound"));
      expect(() => environment.practiceBoss("rootbound", 2)).toThrow("starts only a fresh tutorial episode");
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
      setupTicks: 0,
      cinematicTicks: 0,
      phases: [phase],
    } as const;
    expect(noTellTotals([fight])).toEqual({ taken: 40, noTell: 10 });
    expect(formatBossReport([fight])).toContain("damage with no tell 10 of 40 taken (25%)");
    expect(formatBossReport([fight])).toContain("limited tell data");
  });
});

describe("the player that avoids tells", () => {
  const observation = (x: number): TearAgentObservation => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(bossOnly("rootbound"));
      const state = environment.policyObservation();
      return {
        state: { ...state, player: { ...state.player, x, y: 716, grounded: true, dashCharges: 1 } },
        ui: { screen: "playing", choices: [] },
      };
    } finally {
      environment.dispose();
    }
  };

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
