import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { AIM_MAGNITUDE_SCALE, AIM_TURN_SCALE } from "../../src/domain/input-scales";
import type { GameAction } from "../../src/input/game-action";
import {
  stepCinematicPlayer,
  type CinematicPlayerRuntimeOptions,
  type CinematicRuntimeBlade,
  type CinematicRuntimePlatform,
} from "../../src/gameplay/campaign/cinematic-player-runtime";
import { bossDefinition } from "../../src/gameplay/run/boss-definitions";
import { bossFightScenario, bossPhaseCount } from "../../src/playtest/boss-fight";
import { REPORT_BOSSES } from "../../src/playtest/boss-report";
import { readBoss } from "../../src/playtest/boss-view";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";

/**
 * A boss phase change may hold the simulation in a cinematic that places the player. Wherever the player stands
 * when it starts, and whatever they press while it plays, it ends, and play resumes with the player standing
 * inside the arena. Found by the playtest: at the Source's Phase II with the player at the right wall, Riftlock
 * shots fired during the descent kept the player below the landing shard, the landing beat waited for ever and
 * the player fell without end.
 */

interface RawBoss {
  readonly isBoss: true;
  hp: number;
  readonly maxHp: number;
}
interface RawPlayer {
  x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly onGround: boolean;
}

const TICKS_PER_SECOND = 120;
/** The boss reaches its next phase within this time of passing the mark. */
const PHASE_LIMIT_TICKS = 5 * TICKS_PER_SECOND;
/** The longest phase change in the game runs about 12 s; this is the most any may take. */
const CINEMATIC_LIMIT_TICKS = 30 * TICKS_PER_SECOND;
/** After the phase change, the player is standing again within this time. */
const STANDING_LIMIT_TICKS = 2 * TICKS_PER_SECOND;
/** The void run carries the player on moving shards, so a wall position may be a fraction of a pixel out. */
const EDGE_TOLERANCE = 1;

/** Every boss the game defines has at least one phase mark (its definition's type says so), so all of them. */
const PHASED_BOSSES = REPORT_BOSSES;
const WALLS = ["left", "right"] as const;

function isRawBoss(value: unknown): value is RawBoss {
  if (typeof value !== "object" || value === null) return false;
  const actor = value as Record<string, unknown>;
  return actor.isBoss === true && typeof actor.hp === "number" && typeof actor.maxHp === "number";
}

/**
 * Hold the wall, aimed at the arena's centre and up, so a shot's recoil pushes down and into the wall. The trigger
 * is pressed only while a cinematic has lifted the player, so Riftlock comes to that moment with every chamber full.
 */
function wallInput(wall: (typeof WALLS)[number], tick: number, firing: boolean): GameAction[] {
  return [
    { type: "move", x: wall === "left" ? -1000 : 1000, y: 0 },
    {
      type: "aim",
      turn: Math.round(AIM_TURN_SCALE * (wall === "left" ? 0.875 : 0.625)),
      magnitude: AIM_MAGNITUDE_SCALE,
    },
    { type: "weapon", intent: "primary", phase: firing && tick % 2 === 0 ? "pressed" : "released" },
  ];
}

describe("a boss phase change with the player at a wall", () => {
  const cases = PHASED_BOSSES.flatMap((boss) => WALLS.map((wall) => [boss, wall] as const));

  it("covers every boss that has phases", () => {
    expect(PHASED_BOSSES).toContain("source");
    for (const boss of PHASED_BOSSES) expect(bossPhaseCount(boss), boss).toBeGreaterThan(1);
  });

  it.each(cases)("%s at the %s wall: every phase change ends with the player standing in the arena", (boss, wall) => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(
        bossFightScenario({
          boss,
          difficulty: "normal",
          weapon: "riftlock",
          seed: "1",
          player: "scripted",
          maxTicks: 60_000,
        }),
      );
      const actor = (): RawBoss | undefined => {
        const found: unknown = environment
          .world()
          .enemies()
          .find((enemy) => isRawBoss(enemy));
        return isRawBoss(found) ? found : undefined;
      };
      const phase = (): number | undefined => readBoss(environment.world())?.phase;
      const player = () => environment.world().player() as RawPlayer;
      let tick = 0;
      let cinematicTicks = 0;
      const step = (): void => {
        const cinematic = environment.cinematicActive();
        if (cinematic) cinematicTicks += 1;
        environment.step(wallInput(wall, tick++, cinematic && !player().onGround));
      };
      for (let waited = 0; actor() === undefined && waited < 600; waited += 1) step();
      for (const [index, mark] of bossDefinition(boss).phaseMarks.entries()) {
        const where = `${boss}, ${wall} wall, phase change ${String(index + 1)}`;
        const found = actor();
        expect(phase(), `${where}: the phase before`).toBe(index + 1);
        if (found === undefined) return;
        // Test-only: the player at the wall, and the boss just past its next phase mark.
        const body = player();
        body.x = wall === "left" ? body.hw : CONFIG.view.w - body.hw;
        found.hp = found.maxHp * mark * 0.98;
        for (let waited = 0; phase() === index + 1 && waited < PHASE_LIMIT_TICKS; waited += 1) step();
        for (let held = 0; environment.cinematicActive() && held < CINEMATIC_LIMIT_TICKS; held += 1) step();
        expect(phase(), `${where}: the phase after`).toBe(index + 2);
        expect(environment.cinematicActive(), `${where}: the cinematic ended`).toBe(false);
        for (let waited = 0; !player().onGround && waited < STANDING_LIMIT_TICKS; waited += 1) step();
        const after = player();
        expect(after.onGround, `${where}: standing (x ${after.x.toFixed(0)}, y ${after.y.toFixed(0)})`).toBe(true);
        expect(after.x, where).toBeGreaterThanOrEqual(after.hw - EDGE_TOLERANCE);
        expect(after.x, where).toBeLessThanOrEqual(CONFIG.view.w - after.hw + EDGE_TOLERANCE);
        expect(after.y + after.hh, where).toBeLessThanOrEqual(CONFIG.world.groundY);
      }
      // The Source's descent is the cinematic this guards; a boss whose change plays none still lands its player.
      if (boss === "source") expect(cinematicTicks).toBeGreaterThan(0);
    } finally {
      environment.dispose();
    }
  });
});

describe("the cinematic step", () => {
  const shard: CinematicRuntimePlatform = { x: 1000, y: 700, w: 300, h: 20, oneway: true, void: true };
  const body = (x: number, y: number) => ({
    x,
    y,
    vx: 0,
    vy: 0,
    hw: 16,
    hh: 25,
    onGround: false,
    facing: 1,
    updateSafetyTimers: () => undefined,
  });
  const stepOnce = (
    player: ReturnType<typeof body>,
    mode: string,
    blade: CinematicRuntimeBlade | null = null,
  ): void => {
    const options: CinematicPlayerRuntimeOptions = {
      dt: 1 / TICKS_PER_SECOND,
      mode,
      player,
      blade,
      platforms: [shard],
      gravity: 2400,
      maxFall: 1500,
      descentLiftVelocity: -310,
      viewportWidth: 1600,
      finale: null,
      lerp: (from, to, amount) => from + (to - from) * amount,
      clamp: (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum),
      onFinaleLanded: () => undefined,
      onFinaleBladeCut: () => undefined,
      onLanding: () => undefined,
    };
    stepCinematicPlayer(options);
  };

  it("lands a player who falls onto the shard", () => {
    const player = body(1100, 600);
    for (let tick = 0; tick < 120 && !player.onGround; tick += 1) stepOnce(player, "landing");
    expect(player).toMatchObject({ x: 1100, y: 675, onGround: true });
  });

  it("sets a player already below every shard on the nearest one", () => {
    const player = body(1584, 760);
    stepOnce(player, "landing");
    expect(player).toMatchObject({ x: 1284, y: 675, vy: 0, onGround: true });
  });

  it("brings a player beside every shard over the nearest one, to fall onto it", () => {
    const player = body(400, 500);
    stepOnce(player, "landing");
    expect(player.x).toBe(1016);
    expect(player.onGround).toBe(false);
    for (let tick = 0; tick < 120 && !player.onGround; tick += 1) stepOnce(player, "landing");
    expect(player).toMatchObject({ x: 1016, y: 675, onGround: true });
  });

  it("hands the blade the trigger only in the finale's blade cut", () => {
    const seen: (boolean | undefined)[] = [];
    const blade: CinematicRuntimeBlade = {
      lmbOverride: true,
      prevTipX: 0,
      prevTipY: 0,
      tipX: 0,
      tipY: 0,
      tipSpeed: 0,
      update() {
        seen.push(this.lmbOverride);
      },
    };
    for (const mode of ["locked", "float", "landing", "finalBlade"]) stepOnce(body(800, 500), mode, blade);
    expect(seen).toEqual([false, false, false, true]);
    expect(blade.lmbOverride).toBe(true);
  });
});
