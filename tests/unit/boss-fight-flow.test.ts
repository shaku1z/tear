/**
 * The rule over every boss fight (plans/active/CINEMATICS_OVERHAUL.md, "The rule over every boss"):
 * nothing in a boss fight stops the fight.
 *
 * Each boss in the catalog is fought on the production headless environment. The test carries the boss
 * below each of its phase marks by setting its health, then hits it until it dies, and keeps the player
 * alive. On every tick it reads the three ways the game can stop a fight: the cinematic channel (which
 * turns gameplay input into menu input and skips the combat step), and the player's cinematic protection
 * and grace. It also reads, after every phase change, how long the boss refuses damage.
 *
 * Phase changes that still stop the fight are listed in STILL_BLOCKING. The list may only shrink: a boss
 * whose blocking span count drops below its entry fails until the entry is lowered.
 */
import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BOSS_DEFINITIONS, bossPhaseMarks, type BossDefinitionId } from "../../src/gameplay/run/boss-definitions";
import { BOSS_PRESENTATION } from "../../src/gameplay/entities/enemy-types/boss-runtime";
import { CONFIG } from "../../src/config/game-config";
import { bossFightScenario } from "../../src/playtest/boss-fight";
import { readBoss } from "../../src/playtest/boss-view";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../../src/tearbench/simulation-profile";
import { createMirrorTestHarness } from "./mirror-test-harness";

/** The longest a boss may refuse damage, in simulation ticks, from the tick its phase changes. */
const REFUSAL_CAP_TICKS = Math.round(0.8 * TEAR_SIMULATION_TICKS_PER_SECOND);
/** The largest hit-stop any preset may carry, in seconds. */
const HIT_STOP_CAP_SECONDS = 0.1;
/** Ticks the boss is left alone after a phase change before the next mark is crossed. */
const SETTLE_TICKS = 2 * TEAR_SIMULATION_TICKS_PER_SECOND;
/** Ticks between the hits that finish the boss once it is past its last mark. */
const FINISH_EVERY_TICKS = 30;
const FIGHT_LIMIT_TICKS = 90 * TEAR_SIMULATION_TICKS_PER_SECOND;

/**
 * Blocking spans each boss's fight shows today, from its spawn to its death. Each entry is removed by the
 * pull request that turns those phase changes into moves (plan PRs 3-4, and the Verdant rebuild for
 * Rootbound). Plan PR 5 deletes this table.
 */
const STILL_BLOCKING: Readonly<Partial<Record<BossDefinitionId, number>>> = {
  // Phase II and Phase III rituals; the Verdant rebuild owns these.
  rootbound: 2,
  // The Phase II void descent and the true-form ritual (Phase III already changes in the fight).
  source: 2,
};

interface BossActor {
  isBoss?: boolean;
  isMiniBoss?: boolean;
  hp: number;
  maxHp: number;
  hpDisplay?: number;
  dead?: boolean;
  dying?: boolean;
  introT?: number;
  hidden?: boolean;
  blocksDamage?(): boolean;
  damageTakenMult?(): number;
  hit?(damage: number, knockX: number, knockY: number): number;
}

interface PlayerActor {
  hp: number;
  maxHp: number;
  cinematicProtected?: boolean;
  cinematicGraceT?: number;
}

interface FlowRecord {
  readonly boss: BossDefinitionId;
  readonly end: "died" | "time limit" | "no boss";
  readonly ticks: number;
  readonly phasesSeen: readonly number[];
  /** Spans of consecutive ticks in which something stopped the fight. */
  readonly blockingSpans: readonly Readonly<{ startTick: number; ticks: number; phase: number }>[];
  /**
   * For each phase change, the run of ticks from the phase tick in which the boss refused damage. A phase
   * change that stopped the fight is marked blocked: STILL_BLOCKING answers for it, not the cap.
   */
  readonly refusalAfterPhase: readonly Readonly<{ phase: number; ticks: number; blocked: boolean }>[];
  /** Ticks from the start of the boss's death to its removal. */
  readonly deathTicks: number;
}

function refuses(boss: BossActor): boolean {
  return (
    (boss.introT ?? 0) > 0 ||
    boss.hidden === true ||
    boss.blocksDamage?.() === true ||
    (boss.damageTakenMult?.() ?? 1) <= 0
  );
}

function fightFlow(id: BossDefinitionId): FlowRecord {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(
      bossFightScenario({
        boss: id,
        difficulty: "normal",
        weapon: "sword",
        seed: "boss-fight-flow",
        player: "scripted",
        maxTicks: FIGHT_LIMIT_TICKS,
      }),
    );
    const marks = bossPhaseMarks(id);
    const phasesSeen: number[] = [];
    const blockingSpans: { startTick: number; ticks: number; phase: number }[] = [];
    const refusalAfterPhase: { phase: number; ticks: number; blocked: boolean }[] = [];
    let openRefusal: { phase: number; ticks: number; blocked: boolean } | null = null;
    let sincePhase = 0;
    let seen = false;
    let deathTicks = 0;
    const record = (end: FlowRecord["end"], ticks: number): FlowRecord => ({
      boss: id,
      end,
      ticks,
      phasesSeen,
      blockingSpans,
      refusalAfterPhase,
      deathTicks,
    });
    for (let tick = 0; tick < FIGHT_LIMIT_TICKS; tick += 1) {
      const world = environment.world();
      const actor = (world.enemies() as readonly BossActor[]).find((enemy) => enemy.isBoss === true);
      const view = readBoss(world);
      const player = world.player() as PlayerActor | undefined;
      if (player !== undefined) player.hp = player.maxHp;
      if (actor !== undefined && view !== null) {
        seen = true;
        if (actor.dead === true) return record("died", tick);
        const dying = actor.dying === true || view.dead;
        if (dying) deathTicks += 1;
        if (!dying && phasesSeen.at(-1) !== view.phase) {
          phasesSeen.push(view.phase);
          sincePhase = 0;
          if (phasesSeen.length > 1) {
            openRefusal = { phase: view.phase, ticks: 0, blocked: false };
            refusalAfterPhase.push(openRefusal);
          }
        }
        const blocked =
          environment.cinematicActive() || player?.cinematicProtected === true || (player?.cinematicGraceT ?? 0) > 0;
        if (blocked) {
          const last = blockingSpans.at(-1);
          if (last !== undefined && last.startTick + last.ticks === tick) last.ticks += 1;
          else blockingSpans.push({ startTick: tick, ticks: 1, phase: view.phase });
          if (openRefusal !== null) openRefusal.blocked = true;
          openRefusal = null;
        } else if (!dying) {
          if (openRefusal !== null) {
            if (refuses(actor)) openRefusal.ticks += 1;
            else openRefusal = null;
          }
          sincePhase += 1;
          if (sincePhase >= SETTLE_TICKS) {
            const nextMark = marks[view.phase - 1];
            if (nextMark !== undefined && actor.hp > actor.maxHp * nextMark) {
              actor.hp = Math.max(1, Math.floor(actor.maxHp * nextMark) - 1);
              actor.hpDisplay = actor.hp;
            } else if (nextMark === undefined && sincePhase % FINISH_EVERY_TICKS === 0) {
              actor.hit?.(actor.maxHp, 0, 0);
            }
          }
        }
      } else if (seen) {
        return record("died", tick);
      }
      environment.step([]);
    }
    return record(seen ? "time limit" : "no boss", FIGHT_LIMIT_TICKS);
  } finally {
    environment.dispose();
  }
}

const BOSS_IDS = BOSS_DEFINITIONS.map((definition) => definition.id);

describe("boss fight flow: nothing in a boss fight stops the fight", { timeout: 180_000 }, () => {
  const records = new Map<BossDefinitionId, FlowRecord>();
  const flow = (id: BossDefinitionId) => {
    const found = records.get(id) ?? fightFlow(id);
    records.set(id, found);
    return found;
  };

  // No boss-side event slows time. The boss and Echo feedback types have no slow-motion field, so a boss
  // push that asks for it does not compile; these checks hold the data and Echo's queue to the same rule.
  it("no boss preset slows time, and no preset holds a hit-stop above the cap", () => {
    for (const [boss, presets] of Object.entries(BOSS_PRESENTATION)) {
      for (const [event, preset] of Object.entries(presets)) {
        expect(preset.hitstop ?? 0, `${boss}.${event} hit-stop`).toBeLessThanOrEqual(HIT_STOP_CAP_SECONDS);
        expect(Object.keys(preset), `${boss}.${event}`).not.toContain("slowmo");
      }
    }
    expect(CONFIG.hitStop.big).toBeLessThanOrEqual(HIT_STOP_CAP_SECONDS);
  });

  it("Echo's own phase changes never slow time and keep the hit-stop under the cap", () => {
    const { Mirror, host } = createMirrorTestHarness();
    const feedback: { readonly hitstop?: number }[] = [];
    for (const mark of bossPhaseMarks("echo")) {
      host.hp = Math.floor(host.maxHp * mark) - 1;
      Mirror.fxq.length = 0;
      Mirror._updatePhase();
      feedback.push(...Mirror.fxq);
    }
    expect(Mirror.phase).toBe(3);
    expect(feedback.length).toBeGreaterThan(0);
    for (const event of feedback) {
      expect(Object.keys(event)).not.toContain("slowmo");
      expect(event.hitstop ?? 0).toBeLessThanOrEqual(HIT_STOP_CAP_SECONDS);
    }
  });

  it("every boss in the catalog has presentation presets", () => {
    for (const id of BOSS_IDS) expect(Object.keys(BOSS_PRESENTATION), id).toContain(id);
  });

  describe.each(BOSS_IDS)("%s", (id) => {
    it("is fought from its spawn through every phase to its death", () => {
      const record = flow(id);
      expect(record.end, JSON.stringify(record)).toBe("died");
      expect(record.phasesSeen, JSON.stringify(record)).toEqual(
        Array.from({ length: bossPhaseMarks(id).length + 1 }, (_, index) => index + 1),
      );
    });

    it("stops the fight no more often than its still-blocking entry, and exactly that often while listed", () => {
      expect(flow(id).blockingSpans.length).toBe(STILL_BLOCKING[id] ?? 0);
    });

    it(`refuses damage for at most ${String(REFUSAL_CAP_TICKS)} ticks after each phase change`, () => {
      for (const refusal of flow(id).refusalAfterPhase.filter((entry) => !entry.blocked))
        expect(refusal.ticks, `phase ${String(refusal.phase)}`).toBeLessThanOrEqual(REFUSAL_CAP_TICKS);
    });
  });

  it("writes the flow report to the file TEAR_BOSS_FLOW_REPORT names", () => {
    const file = process.env.TEAR_BOSS_FLOW_REPORT;
    if (file === undefined || file === "") return;
    writeFileSync(
      file,
      `${JSON.stringify(
        BOSS_IDS.map((id) => flow(id)),
        null,
        1,
      )}
`,
    );
  });
});
