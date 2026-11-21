/**
 * Rules over every boss, read from boss tells (src/gameplay/entities/boss-tells.ts).
 *
 * Each boss is stepped at 120 Hz in each phase against a player standing still in front of it. A boss
 * that reports tells must satisfy the rules. An older boss is read from its windup state names and is
 * only held to what it does today (STATE_READ_RECORD), so the table is a report that may not get worse.
 * Only strikes the boss lands itself are seen here: projectiles, zones and body contact are not.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  BOSS_TELL_MIN_LEAD_SECONDS,
  bossReportsTells,
  bossTellCovers,
  bossTells,
} from "../../src/gameplay/entities/boss-tells";
import type { EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import { bossPhaseMarks, type BossDefinitionId } from "../../src/gameplay/run/boss-definitions";
import { bindLiveRootboundActors } from "../../src/gameplay/environment/biome-actors/rootbound-actors";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { createBossArena } from "../../src/gameplay/training/arena-rules";
import { createEnemyHarness, createTestPlayer, type BehaviorActor } from "./enemy-test-harness";

const DT = 1 / 120;
const SECONDS = 40;
const MIN_LEAD = BOSS_TELL_MIN_LEAD_SECONDS.normal;
/** Timers count down in float steps, so a 0.45 s warning measures a tick short or long. */
const TICK_SLACK = 2 * DT;
const PHASES = [1, 2, 3] as const;
type Phase = (typeof PHASES)[number];
// The new Rootbound is held to the move rules and tell weight instead (move-visual-lifetime, boss-tell-weight).
type HarnessBossId = Exclude<BossDefinitionId, "echo" | "rootbound-rebuild">;
const HARNESS_BOSSES: readonly HarnessBossId[] = ["warden", "colossus", "aldric", "rootbound", "white-hart", "source"];

type Boss = BehaviorActor & {
  introT: number;
  state: string;
  stateT: number;
  cinematicRequest: unknown;
  cinematicT: number;
};

interface Strike {
  readonly at: number;
  readonly state: string;
  /** Seconds of warning from a tell that covered the player; -1 when no tell did. */
  readonly lead: number;
}

interface Observation {
  readonly reportsTells: boolean;
  readonly strikes: readonly Strike[];
  /** Damaging tells that went active, with the warning each one actually showed. */
  readonly activations: readonly Readonly<{ id: string; authored: number; shown: number }>[];
  readonly longestQuietSeconds: number;
  readonly attackIds: readonly string[];
}

function createBoss(id: HarnessBossId, phase: Phase) {
  const harness = createEnemyHarness([0.25, 0.75, 0.4, 0.6, 0.1, 0.9]);
  const constructors = {
    warden: harness.types.Warden,
    colossus: harness.types.Colossus,
    aldric: harness.types.Aldric,
    rootbound: harness.types.Rootbound,
    "white-hart": harness.types.WhiteHart,
    source: harness.types.Source,
  } as const;
  const boss = new constructors[id](CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as unknown as Boss;
  const player = Object.assign(createTestPlayer({ x: CONFIG.view.w / 2 + 250 }), {
    hazardDmgMult: 1,
    invulnerable: false,
  });
  const projectiles: EnemyProjectile[] = [];
  const marks = bossPhaseMarks(id);
  boss.introT = 0;
  if (phase > 1) boss.hp = boss.maxHp * ((phase === 2 ? marks[0] : marks[1]) - 0.05);
  const settle = () => {
    boss.cinematicRequest = null;
    boss.cinematicT = 0;
  };
  // Cross the thresholds one update at a time, clearing each transformation as the game would.
  for (let step = 0; step < 4; step += 1) {
    boss.update(DT, harness.platforms, player, projectiles);
    settle();
  }
  player.damage.length = 0;
  // The biome bosses run inside their environment, as in play: it owns Grafts,
  // the Root Cage and the Regrowth channel.
  const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: `boss-tell-rules:${id}` });
  const actorId = () => "enemy:boss";
  if (id === "rootbound")
    bindLiveRootboundActors(
      environment,
      () => player,
      () => [boss],
      actorId,
      CONFIG,
    );
  const platforms = createBossArena(id, CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY, 0.5) ?? harness.platforms;
  const update = () => {
    boss.update(DT, platforms, player, projectiles);
  };
  const step =
    id === "rootbound"
      ? (tick: number) => {
          environment.step(tick, DT, update, new Set(["enemy:boss"]));
        }
      : update;
  return { boss, step, player, settle };
}

function observe(id: HarnessBossId, phase: Phase): Observation {
  const { boss, step, player, settle } = createBoss(id, phase);
  const firstSeen = new Map<string, number>();
  const strikes: Strike[] = [];
  const activations: { id: string; authored: number; shown: number }[] = [];
  const activeSince = new Set<string>();
  const attackIds = new Set<string>();
  // A state-read boss leaves its windup state before it strikes, so its warning is timed from the
  // start of the last windup since it rested.
  let windupStart: number | null = null;
  let quiet = 0,
    longestQuiet = 0;
  for (let tick = 0; tick < SECONDS / DT; tick += 1) {
    const now = tick * DT;
    const tells = bossTells(boss).filter((tell) => tell.damaging);
    const present = new Set(tells.map((tell) => tell.id));
    for (const seen of [...firstSeen.keys()]) if (!present.has(seen)) firstSeen.delete(seen);
    for (const seen of [...activeSince]) if (!present.has(seen)) activeSince.delete(seen);
    for (const tell of tells) {
      attackIds.add(tell.attackId);
      if (!firstSeen.has(tell.id)) firstSeen.set(tell.id, now);
      if (tell.stage === "active" && !activeSince.has(tell.id)) {
        activeSince.add(tell.id);
        activations.push({ id: tell.id, authored: tell.leadSeconds, shown: now - (firstSeen.get(tell.id) ?? now) });
      }
    }
    if (boss.state === "idle" || boss.state === "recover") windupStart = null;
    else if (tells.length > 0) windupStart ??= now;
    quiet = tells.length > 0 ? 0 : quiet + DT;
    longestQuiet = Math.max(longestQuiet, quiet);
    const before = player.damage.length;
    step(tick + 8);
    settle();
    if (player.damage.length === before) continue;
    const leads = bossReportsTells(boss)
      ? tells.filter((tell) => bossTellCovers(tell, player)).map((tell) => now - (firstSeen.get(tell.id) ?? now))
      : windupStart === null
        ? []
        : [now - windupStart];
    strikes.push({ at: now, state: boss.state, lead: leads.length > 0 ? Math.max(...leads) : -1 });
  }
  return {
    reportsTells: bossReportsTells(boss),
    strikes,
    activations,
    longestQuietSeconds: longestQuiet,
    attackIds: [...attackIds],
  };
}

const unwarned = (observation: Observation) =>
  observation.strikes.filter((strike) => strike.lead < MIN_LEAD - TICK_SLACK).length;

/**
 * What the state-read bosses do today, as unwarned strikes per phase against a player standing still.
 * These numbers may only go down. A boss leaves this table when it reports its own tells.
 */
const STATE_READ_RECORD: Readonly<Record<Exclude<HarnessBossId, "rootbound">, readonly [number, number, number]>> = {
  // Warden, Colossus and Aldric land most strikes from their "idle" state (strings, backhands,
  // combos), where no windup state exists to read. Whether the player is warned there is not known
  // from this table; it needs the boss to report tells.
  warden: [25, 39, 0],
  colossus: [9, 9, 6],
  aldric: [0, 21, 37],
  "white-hart": [0, 0, 0],
  source: [3, 0, 0],
};

describe("boss tell rules", { timeout: 60_000 }, () => {
  const observations = new Map<string, Observation>();
  const observed = (id: HarnessBossId, phase: Phase) => {
    const key = `${id}:${String(phase)}`;
    const found = observations.get(key) ?? observe(id, phase);
    observations.set(key, found);
    return found;
  };

  it("keeps the minimum warning in one place for every difficulty", () => {
    expect(Object.keys(BOSS_TELL_MIN_LEAD_SECONDS).sort()).toEqual(["easy", "extreme", "hard", "normal"]);
    expect(MIN_LEAD).toBe(0.45);
  });

  describe.each(HARNESS_BOSSES.filter((id) => id === "rootbound"))("%s reports its own tells", (id) => {
    it.each(PHASES)("phase %i: every damaging tell is authored and shown for the minimum warning", (phase) => {
      const { reportsTells, activations } = observed(id, phase);
      expect(reportsTells).toBe(true);
      expect(activations.length).toBeGreaterThan(0);
      for (const activation of activations) {
        expect(activation.authored, activation.id).toBeGreaterThanOrEqual(MIN_LEAD);
        expect(activation.shown, activation.id).toBeGreaterThanOrEqual(MIN_LEAD - TICK_SLACK);
      }
    });

    it.each(PHASES)("phase %i: every strike it lands was warned where the player stood", (phase) => {
      expect(observed(id, phase).strikes.filter((strike) => strike.lead < MIN_LEAD - TICK_SLACK)).toEqual([]);
    });

    it.each(PHASES)("phase %i: it never goes ten seconds without an attack", (phase) => {
      const observation = observed(id, phase);
      expect(observation.attackIds.length).toBeGreaterThan(0);
      expect(observation.longestQuietSeconds).toBeLessThan(10);
    });
  });

  describe.each(Object.keys(STATE_READ_RECORD) as (keyof typeof STATE_READ_RECORD)[])(
    "%s, read from its states",
    (id) => {
      it.each(PHASES)("phase %i: unwarned strikes do not exceed the recorded number", (phase) => {
        const observation = observed(id, phase);
        expect(observation.reportsTells).toBe(false);
        expect(unwarned(observation)).toBeLessThanOrEqual(STATE_READ_RECORD[id][phase - 1] ?? 0);
      });
    },
  );

  it("prints the report when TEAR_BOSS_TELL_REPORT is set", () => {
    if (process.env.TEAR_BOSS_TELL_REPORT !== "1") return;
    const rows = HARNESS_BOSSES.flatMap((id) =>
      PHASES.map((phase) => {
        const o = observed(id, phase);
        const leads = o.strikes.map((strike) => strike.lead).filter((lead) => lead >= 0);
        return {
          boss: id,
          phase,
          source: o.reportsTells ? "tells" : "states",
          attacks: o.attackIds.join(" "),
          strikes: o.strikes.length,
          unwarned: unwarned(o),
          unwarnedStates: [
            ...new Set(o.strikes.filter((s) => s.lead < MIN_LEAD - TICK_SLACK).map((s) => s.state)),
          ].join(" "),
          shortestLead: leads.length > 0 ? Number(Math.min(...leads).toFixed(2)) : null,
          longestQuiet: Number(o.longestQuietSeconds.toFixed(1)),
        };
      }),
    );
    console.log(`BOSS_TELL_REPORT ${JSON.stringify(rows)}`);
  });
});
