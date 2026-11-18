import { describe, expect, it } from "vitest";

import { SeededRandom } from "../../src/domain/random";
import {
  BOSS_ATTACK_TICKS_PER_SECOND,
  bossAttackSecondsToTicks,
  buildBossAttackTable,
  type BossAttackDefinition,
  type BossAttackTableDefinition,
  type BossHitShape,
} from "../../src/gameplay/entities/boss-attacks";
import {
  advanceBossAttack,
  bossAttackDamageTaken,
  bossAttackHit,
  bossAttackMotion,
  bossAttackParryable,
  bossAttackStatus,
  bossAttackTells,
  bossAttackThreatens,
  bossHitTouches,
  chooseBossAttack,
  createBossAttackRunnerState,
  exposeBossAttack,
  markBossAttackLanded,
  openBossPhase,
  parryBossAttack,
  placeBossHitShape,
  type BossAttackContext,
  type BossAttackEvent,
  type BossAttackRunnerState,
} from "../../src/gameplay/entities/boss-attack-runner";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../../src/tearbench/simulation-profile";

/** A two-phase boss: its phase ids are its own, not 1 | 2 | 3. */
type Phase = "rooted" | "wild";
type Place = Readonly<{ kind: "thorn"; x: number }>;

function move(
  id: string,
  overrides: Partial<BossAttackDefinition<Phase, Place>> = {},
): BossAttackDefinition<Phase, Place> {
  return {
    id,
    phases: ["rooted", "wild"],
    timing: { tell: 0.5, active: 0.25, recover: 0.25 },
    choose: { range: [0, 2000], weight: 1, cooldown: 0 },
    hit: { shape: { kind: "lane", length: 200, dy: 0, hh: 30 }, damage: 20, parryable: true },
    tell: { mark: "lane" },
    ...overrides,
  };
}

function definition(
  attacks: readonly BossAttackDefinition<Phase, Place>[],
  overrides: Partial<BossAttackTableDefinition<Phase, Place>> = {},
): BossAttackTableDefinition<Phase, Place> {
  return {
    bossId: "test-boss",
    phases: ["rooted", "wild"],
    gap: 0.4,
    exposedDamageTaken: 1.5,
    parryLead: 0.125,
    parryExposed: 0.9,
    attacks,
    ...overrides,
  };
}

function context(tick: number, overrides: Partial<BossAttackContext<Phase>> = {}): BossAttackContext<Phase> {
  return {
    tick,
    phase: "rooted",
    boss: { x: 600, y: 500, hw: 40, hh: 60 },
    target: { x: 900, y: 500, hw: 18, hh: 36 },
    arena: { width: 1600, groundY: 560 },
    random: new SeededRandom("boss-attacks"),
    ...overrides,
  };
}

/** Runs the runner tick by tick, collecting events, until `until` returns true or the tick limit. */
function run(
  table: ReturnType<typeof buildBossAttackTable<Phase, Place>>,
  start: BossAttackRunnerState,
  ticks: number,
  base: Partial<BossAttackContext<Phase>> = {},
): Readonly<{ state: BossAttackRunnerState; events: (BossAttackEvent<Place> & { tick: number })[] }> {
  const random = base.random ?? new SeededRandom("run");
  let state = start;
  const events: (BossAttackEvent<Place> & { tick: number })[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    const result = advanceBossAttack(table, state, context(tick, { ...base, random }));
    state = result.state;
    for (const event of result.events) events.push({ ...event, tick });
  }
  return { state, events };
}

describe("boss attack definitions", () => {
  it("converts seconds to ticks in one place, at the simulation rate", () => {
    expect(BOSS_ATTACK_TICKS_PER_SECOND).toBe(TEAR_SIMULATION_TICKS_PER_SECOND);
    expect(bossAttackSecondsToTicks(0.45)).toBe(54);
    expect(bossAttackSecondsToTicks(1 / 120)).toBe(1);
    expect(bossAttackSecondsToTicks(0)).toBe(0);
    expect(() => bossAttackSecondsToTicks(-0.1)).toThrow(RangeError);
    const table = buildBossAttackTable(
      definition([
        move("lash", { timing: { tell: 0.5, active: 0.25, recover: 0.1, punish: 1 } }),
        move("bolt", {
          choose: { range: [0, 900], weight: 2, cooldown: 3 },
          hit: { shape: { kind: "travel", dy: 0, hw: 20, hh: 20, speed: 240 }, damage: 15, parryable: false },
        }),
      ]),
    );
    expect(table.gap).toBe(48);
    expect(table.byId.get("lash")?.timing).toEqual({ tell: 60, active: 30, recover: 12, punish: 120 });
    expect(table.byId.get("bolt")?.choose.cooldown).toBe(360);
    expect(table.byId.get("bolt")?.hit?.shape).toMatchObject({ kind: "travel", speed: 2 });
  });

  it("rejects a table a runner could not play fairly", () => {
    expect(() => buildBossAttackTable(definition([move("only")]))).toThrow(/two moves chosen by weight/u);
    expect(() =>
      buildBossAttackTable(definition([move("a"), move("b", { timing: { tell: 0.3, active: 0.2, recover: 0 } })])),
    ).toThrow(/tell shorter/u);
    expect(() => buildBossAttackTable(definition([move("a"), move("a")]))).toThrow(/duplicate/u);
    expect(() =>
      buildBossAttackTable(definition([move("a"), move("b", { phases: ["rooted", "berserk" as Phase] })])),
    ).toThrow(/unknown phase/u);
    expect(() => buildBossAttackTable(definition([move("a"), move("b")], { exposedDamageTaken: 0.5 }))).toThrow(
      /exposed/u,
    );
    // A move that only moves the boss may have a short tell: it never hurts.
    const moveOnly = move("hop", { timing: { tell: 0.2, active: 0.3, recover: 0 } });
    delete (moveOnly as { hit?: unknown }).hit;
    expect(() => buildBossAttackTable(definition([move("a"), moveOnly]))).not.toThrow();
  });

  it("takes phase ids from each boss, so a four-phase boss needs no change to the shared type", () => {
    type FourPhase = 1 | 2 | 3 | 4;
    const four = buildBossAttackTable<FourPhase>({
      bossId: "four",
      phases: [1, 2, 3, 4],
      gap: 0.4,
      exposedDamageTaken: 1,
      parryLead: 0,
      parryExposed: 0,
      attacks: [
        { ...move("a"), phases: [1, 2, 3, 4], places: [] },
        { ...move("b"), phases: [1, 2, 3, 4], places: [] },
      ],
    });
    expect(four.phases).toEqual([1, 2, 3, 4]);
  });
});

describe("boss attack runner", () => {
  const table = buildBossAttackTable(
    definition([
      move("lash", {
        timing: { tell: 0.5, active: 0.25, recover: 0.25, punish: 1 },
        places: [
          { at: "tell", object: { kind: "thorn", x: 1 } },
          { at: "active", object: { kind: "thorn", x: 2 } },
        ],
      }),
      move("near", { choose: { range: [0, 150], weight: 1, cooldown: 0 } }),
      move("far", { choose: { range: [700, 2000], weight: 1, cooldown: 0 } }),
    ]),
  );

  it("never plays the same move twice running, and replays the same choices from the same seed", () => {
    const sequence = (seed: string) =>
      run(table, createBossAttackRunnerState(), 6000, { random: new SeededRandom(seed) })
        .events.filter((event) => event.type === "stage" && event.stage === "tell")
        .map((event) => event.attackId);
    const first = sequence("seed-a");
    expect(first.length).toBeGreaterThan(20);
    for (let index = 1; index < first.length; index += 1) expect(first[index]).not.toBe(first[index - 1]);
    expect(sequence("seed-a")).toEqual(first);
  });

  it("weights moves by distance and height to the target", () => {
    const count = (target: BossAttackContext<Phase>["target"]) => {
      const tally: Record<string, number> = {};
      const random = new SeededRandom("weights");
      for (let draw = 0; draw < 400; draw += 1) {
        const chosen = chooseBossAttack(table, createBossAttackRunnerState(), context(0, { target, random }));
        if (chosen !== null) tally[chosen.id] = (tally[chosen.id] ?? 0) + 1;
      }
      return tally;
    };
    const close = count({ x: 660, y: 500, hw: 18, hh: 36 });
    expect(close.near ?? 0).toBeGreaterThan(close.far ?? 0);
    const distant = count({ x: 1500, y: 500, hw: 18, hh: 36 });
    expect(distant.far ?? 0).toBeGreaterThan(distant.near ?? 0);
    const heights = buildBossAttackTable(
      definition([
        move("ground", { choose: { range: [0, 2000], height: "level", weight: 1, cooldown: 0 } }),
        move("anti-air", { choose: { range: [0, 2000], height: "above", weight: 1, cooldown: 0 } }),
      ]),
    );
    const random = new SeededRandom("heights");
    let antiAir = 0;
    for (let draw = 0; draw < 200; draw += 1)
      if (
        chooseBossAttack(
          heights,
          createBossAttackRunnerState(),
          context(0, { target: { x: 700, y: 300, hw: 18, hh: 36 }, random }),
        )?.id === "anti-air"
      )
        antiAir += 1;
    expect(antiAir).toBeGreaterThan(150);
  });

  it("steps tell, active, recover and an exposed punish on the tick, places objects, then waits the gap", () => {
    // A random source that always draws 0 picks the first eligible move: "lash".
    const only = table;
    let state = createBossAttackRunnerState();
    const seen: string[] = [];
    let exposedAt = -1;
    for (let tick = 0; tick < 400 && !seen.includes("finished:lash"); tick += 1) {
      const ctx = context(tick, { random: { next: () => 0 } });
      const result = advanceBossAttack(only, state, ctx);
      state = result.state;
      for (const event of result.events)
        seen.push(
          event.type === "stage"
            ? `${String(tick)}:${event.stage}`
            : event.type === "place"
              ? `${String(tick)}:place:${String(event.object.x)}`
              : `finished:${event.attackId}`,
        );
      if (exposedAt < 0 && bossAttackTells(only, state, ctx)[0]?.stage === "exposed") {
        exposedAt = tick;
        expect(bossAttackDamageTaken(only, state, tick)).toBe(1.5);
        expect(bossAttackTells(only, state, ctx)[0]).toMatchObject({ mark: "self", damaging: false });
      }
    }
    expect(seen).toEqual([
      "0:tell",
      "0:place:1",
      "60:active",
      "60:place:2",
      "90:recover",
      "120:punish",
      "finished:lash",
    ]);
    expect(exposedAt).toBe(120);
    expect(bossAttackDamageTaken(only, state, 240)).toBe(1);
    expect(state.readyTick).toBe(240 + 48);
  });

  it("hits once while active, where the shape says, and a travelling strike moves at its speed", () => {
    const bolt = buildBossAttackTable(
      definition([
        move("bolt", {
          hit: { shape: { kind: "travel", dy: 0, hw: 20, hh: 20, speed: 1200 }, damage: 15, parryable: false },
          choose: { range: [0, 2000], weight: 1, cooldown: 0 },
        }),
        move("ring", {
          hit: { shape: { kind: "ring", radius: 100 }, damage: 10, parryable: true },
          choose: { range: [0, 1], weight: 1e-9, cooldown: 0 },
        }),
      ]),
    );
    let state = advanceBossAttack(bolt, createBossAttackRunnerState(), context(0, { random: { next: () => 0 } })).state;
    expect(bossAttackHit(bolt, state, context(10))).toBeNull();
    state = advanceBossAttack(bolt, state, context(60)).state;
    const start = bossAttackHit(bolt, state, context(60));
    const later = bossAttackHit(bolt, state, context(70));
    expect(start?.area).toMatchObject({ kind: "box", x: 600 + 40 + 20, y: 500 });
    expect(later?.area).toMatchObject({ x: 600 + 40 + 20 + 100 });
    expect(start).toMatchObject({ damage: 15, parryable: false });
    expect(bossAttackHit(bolt, markBossAttackLanded(state), context(70))).toBeNull();
    const tell = bossAttackTells(
      bolt,
      advanceBossAttack(bolt, createBossAttackRunnerState(), context(0, { random: { next: () => 0 } })).state,
      context(0),
    )[0];
    expect(tell).toMatchObject({ stage: "warning", mark: "lane", damaging: true, leadSeconds: 0.5, dir: 1 });
    // The tell covers the whole path: from the front edge to where the strike ends.
    expect((tell?.x ?? 0) + (tell?.hw ?? 0)).toBeCloseTo(600 + 40 + 1200 * 0.25 + 40);
    expect(bossHitTouches({ kind: "circle", x: 0, y: 0, r: 100 }, { x: 110, y: 0, hw: 18, hh: 18 })).toBe(true);
    expect(bossHitTouches({ kind: "circle", x: 0, y: 0, r: 100 }, { x: 100, y: 100, hw: 18, hh: 18 })).toBe(false);
  });

  it("opens a parry window before the strike, and a parried move never lands and leaves the boss exposed", () => {
    // "lash" is first; a random source that always draws 0 starts it. Tell 60 ticks, parry lead 15 ticks.
    const started = advanceBossAttack(
      table,
      createBossAttackRunnerState(),
      context(0, { random: { next: () => 0 } }),
    ).state;
    expect(bossAttackParryable(table, started, 44)).toBe(false);
    expect(bossAttackParryable(table, started, 45)).toBe(true);
    const parried = parryBossAttack(table, started, 50);
    expect(parried.run).toMatchObject({ stage: "punish", stageTick: 50, landed: true, parried: true });
    expect(bossAttackHit(table, parried, context(60))).toBeNull();
    expect(bossAttackParryable(table, parried, 51)).toBe(false);
    expect(bossAttackTells(table, parried, context(50))[0]).toMatchObject({ stage: "exposed", leadSeconds: 0.9 });
    expect(bossAttackDamageTaken(table, parried, 51)).toBe(1.5);
    let state = parried;
    for (let tick = 51; tick <= 50 + 108; tick += 1) state = advanceBossAttack(table, state, context(tick)).state;
    expect(state.run).toBeNull();
    // A move that cannot be parried is never parried.
    const unparryable = buildBossAttackTable(
      definition([
        move("smash", { hit: { shape: { kind: "ring", radius: 80 }, damage: 20, parryable: false } }),
        move("other"),
      ]),
    );
    const smash = advanceBossAttack(
      unparryable,
      createBossAttackRunnerState(),
      context(0, { random: { next: () => 0 } }),
    ).state;
    expect(parryBossAttack(unparryable, smash, 59)).toBe(smash);
  });

  it("places every shape kind", () => {
    const shapes: readonly BossHitShape[] = [
      { kind: "box", anchor: "boss", dx: 50, dy: -10, hw: 30, hh: 30 },
      { kind: "box", anchor: "target", dx: 0, dy: 0, hw: 30, hh: 30 },
      { kind: "box", anchor: "arena", dx: 800, dy: -20, hw: 30, hh: 20 },
      { kind: "lane", length: 300, dy: 0, hh: 25 },
      { kind: "column", anchor: "target", hw: 40, height: 400 },
      { kind: "ring", radius: 90 },
      { kind: "travel", dy: 0, hw: 20, hh: 20, speed: 2 },
    ];
    const runState = {
      attackId: "x",
      stage: "active" as const,
      stageTick: 0,
      facing: -1 as const,
      origin: { x: 600, y: 500 },
      target: { x: 300, y: 520 },
      landed: false,
      parried: false,
    };
    const boss = { x: 600, y: 500, hw: 40, hh: 60 };
    expect(shapes.map((shape) => placeBossHitShape(shape, runState, boss, 560, 0))).toEqual([
      { kind: "box", x: 550, y: 490, hw: 30, hh: 30 },
      { kind: "box", x: 300, y: 520, hw: 30, hh: 30 },
      { kind: "box", x: 800, y: 540, hw: 30, hh: 20 },
      { kind: "box", x: 410, y: 500, hw: 150, hh: 25 },
      { kind: "box", x: 300, y: 360, hw: 40, hh: 200 },
      { kind: "circle", x: 600, y: 500, r: 90 },
      { kind: "box", x: 540, y: 500, hw: 20, hh: 20 },
    ]);
  });

  it("moves the boss through dash, leap and burrow, inside the arena", () => {
    const motions = buildBossAttackTable(
      definition([
        move("dash", { motion: { kind: "dash", stage: "active", distance: 5000 } }),
        move("leap", {
          motion: { kind: "leap", stage: "tell", height: 200 },
          choose: { range: [0, 1], weight: 1e-9, cooldown: 0 },
        }),
        move("burrow", {
          motion: { kind: "burrow", stage: "tell" },
          choose: { range: [0, 1], weight: 1e-9, cooldown: 0 },
        }),
      ]),
    );
    const startWith = (id: string) => {
      // Every other move is cooling down, so the runner can only start `id`.
      const cooling = Object.fromEntries(motions.attacks.filter((a) => a.id !== id).map((a) => [a.id, 1e9]));
      const state = { ...createBossAttackRunnerState(), cooldownUntil: cooling };
      return advanceBossAttack(motions, state, context(0)).state;
    };
    const dash = advanceBossAttack(motions, startWith("dash"), context(60)).state;
    expect(bossAttackMotion(motions, dash, context(90))).toEqual({ x: 1600 - 40, y: 500, hidden: false });
    const leap = startWith("leap");
    expect(leap.run?.attackId).toBe("leap");
    // Tick 29 is the 30th of a 60-tick tell: half way, at the top of the arc.
    expect(bossAttackMotion(motions, leap, context(29))).toEqual({ x: 750, y: 300, hidden: false });
    const burrow = startWith("burrow");
    expect(burrow.run?.attackId).toBe("burrow");
    expect(bossAttackMotion(motions, burrow, context(30))).toMatchObject({ x: 600, hidden: true });
    expect(bossAttackMotion(motions, burrow, context(58))).toMatchObject({ x: 600, hidden: true });
    // The tell's last tick surfaces the boss at the target, before the strike.
    expect(bossAttackMotion(motions, burrow, context(59))).toMatchObject({ x: 900, hidden: false });
  });

  it("never chooses a blocked move", () => {
    const table = buildBossAttackTable(definition([move("lash"), move("bolt"), move("slam")]));
    const blocked = new Set(["lash", "slam"]);
    for (const seed of ["a", "b", "c", "d"])
      expect(
        chooseBossAttack(table, createBossAttackRunnerState(), context(0, { random: new SeededRandom(seed), blocked }))
          ?.id,
      ).toBe("bolt");
    const all = new Set(["lash", "bolt", "slam"]);
    expect(chooseBossAttack(table, createBossAttackRunnerState(), context(0, { blocked: all }))).toBeNull();
  });

  it("a forced exposure ends the move without a strike, scales hits and delays the next move", () => {
    const table = buildBossAttackTable(definition([move("lash"), move("bolt")]));
    const winding = advanceBossAttack(table, createBossAttackRunnerState(), context(0)).state;
    expect(winding.run?.stage).toBe("tell");
    const open = exposeBossAttack(table, winding, 30, 120);
    expect(open.run).toBeNull();
    expect(open.lastAttackId).toBe(winding.run?.attackId);
    expect(bossAttackHit(table, open, context(70))).toBeNull();
    expect(bossAttackDamageTaken(table, open, 30)).toBe(1.5);
    expect(bossAttackDamageTaken(table, open, 149)).toBe(1.5);
    expect(bossAttackDamageTaken(table, open, 150)).toBe(1);
    expect(bossAttackTells(table, open, context(90))).toEqual([
      expect.objectContaining({
        id: "exposed",
        mark: "self",
        stage: "exposed",
        damaging: false,
        leadSeconds: 1,
        remainingSeconds: 0.5,
      }),
    ]);
    expect(bossAttackTells(table, open, context(150))).toEqual([]);
    // Nothing starts until the exposure and the table's gap have passed.
    let state = open;
    for (let tick = 31; tick < 150 + 48; tick += 1) state = advanceBossAttack(table, state, context(tick)).state;
    expect(state.run).toBeNull();
    state = advanceBossAttack(table, state, context(150 + 48)).state;
    expect(state.run?.stage).toBe("tell");
    expect(state.exposed).toBeNull();
    // A second cut while open never shortens the opening.
    expect(exposeBossAttack(table, open, 40, 10).exposed?.until).toBe(150);
    expect(() => exposeBossAttack(table, open, 40, 0)).toThrow(RangeError);
  });
});

describe("the runner owns the pause after a move and the body's flags", () => {
  const table = buildBossAttackTable(
    definition([
      move("burrow", {
        timing: { tell: 0.5, active: 0.25, recover: 0.25, punish: 0.25 },
        motion: { kind: "burrow", stage: "active" },
      }),
      // Never in range: the table needs two moves, the test plays one.
      move("never", { choose: { range: [5000, 6000], weight: 1, cooldown: 0 } }),
    ]),
  );
  const at = (tick: number, gapMultiplier?: number) =>
    context(tick, gapMultiplier === undefined ? {} : { gapMultiplier });
  /** Runs one whole move from tick 0 and returns the state on the tick it finished. */
  const finishOne = (gapMultiplier?: number) => {
    let state = createBossAttackRunnerState(0);
    for (let tick = 0; tick < 1000; tick += 1) {
      const result = advanceBossAttack(table, state, at(tick, gapMultiplier));
      state = result.state;
      if (result.events.some((event) => event.type === "finished")) return { state, tick };
    }
    throw new Error("the move never finished");
  };

  it("scales the pause after a move by the context's gap multiplier, and by nothing when there is none", () => {
    const plain = finishOne();
    expect(plain.state.readyTick - plain.tick).toBe(table.gap);
    const hastened = finishOne(0.6);
    expect(hastened.state.readyTick - hastened.tick).toBe(Math.round(table.gap * 0.6));
    expect(() => finishOne(Number.NaN)).toThrow(RangeError);
    expect(() => finishOne(-1)).toThrow(RangeError);
  });

  it("reports the body's flags from the state alone, so a move ended early leaves none behind", () => {
    let state = createBossAttackRunnerState(0);
    expect(bossAttackStatus(table, state, at(0))).toEqual({
      label: null,
      exposed: false,
      carries: false,
      hidden: false,
      parryable: false,
    });
    let tick = 0;
    for (; state.run?.stage !== "active"; tick += 1) state = advanceBossAttack(table, state, at(tick)).state;
    // Burrowed in its active stage: carried by the move, out of sight, and the strike can be parried.
    expect(bossAttackStatus(table, state, at(tick))).toEqual({
      label: "burrow:active",
      exposed: false,
      carries: true,
      hidden: true,
      parryable: true,
    });
    // A forced exposure in the middle of the burrow: nothing of the burrow is left on the body.
    const cut = exposeBossAttack(table, state, tick, 30);
    expect(bossAttackStatus(table, cut, at(tick))).toEqual({
      label: null,
      exposed: true,
      carries: false,
      hidden: false,
      parryable: false,
    });
    // A parry in the middle of it: the body is out and open, no longer carried or hidden.
    const parried = parryBossAttack(table, state, tick);
    expect(bossAttackStatus(table, parried, at(tick))).toEqual({
      label: "burrow:punish",
      exposed: true,
      carries: false,
      hidden: false,
      parryable: false,
    });
  });
});

describe("the move schedule: openings, once and every few moves", () => {
  /** The order moves begin in, from a fresh runner, with the phase switched at `switchAt`. */
  function order(
    table: ReturnType<typeof buildBossAttackTable<Phase, Place>>,
    ticks: number,
    options: Readonly<{ switchAt?: number; seed?: string }> = {},
  ): string[] {
    const random = new SeededRandom(options.seed ?? "schedule");
    let state = createBossAttackRunnerState();
    const begun: string[] = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      const phase: Phase = tick >= (options.switchAt ?? Infinity) ? "wild" : "rooted";
      const result = advanceBossAttack(table, state, context(tick, { random, phase }));
      state = result.state;
      for (const event of result.events)
        if (event.type === "stage" && event.stage === "tell") begun.push(event.attackId);
    }
    return begun;
  }
  const ordinary = [move("lash"), move("bolt"), move("slam")];
  const opener = move("plant", { phases: ["wild"], choose: { range: [0, 2000], weight: 1, cooldown: 0, opens: true } });

  it("plays an opening move first whenever a phase it belongs to starts, then chooses it by weight", () => {
    const table = buildBossAttackTable(definition([...ordinary, opener]));
    for (const seed of ["a", "b", "c"]) {
      const begun = order(table, 6000, { switchAt: 600, seed });
      const before = order(table, 600, { seed });
      expect(before).not.toContain("plant");
      expect(begun[before.length]).toBe("plant");
      expect(begun.filter((id) => id === "plant").length).toBeGreaterThan(1);
    }
    // A fresh runner in the wild phase opens with it at once.
    const fresh = advanceBossAttack(table, createBossAttackRunnerState(), context(0, { phase: "wild" }));
    expect(fresh.state.run?.attackId).toBe("plant");
    expect(fresh.state.openedPhase).toBe("wild");
  });

  it("opens with an ordinary move when the opening move cannot start, and then owes it no longer", () => {
    const table = buildBossAttackTable(definition([...ordinary, opener]));
    const blocked = new Set(["plant"]);
    const first = advanceBossAttack(table, createBossAttackRunnerState(), context(0, { phase: "wild", blocked }));
    expect(first.state.run?.attackId).not.toBe("plant");
    expect(first.state.openedPhase).toBe("wild");
    // A fight restored part-way through the phase owes no opening either.
    const restored = openBossPhase(createBossAttackRunnerState(), "wild");
    const picks = ["a", "b", "c", "d", "e", "f"].map(
      (seed) => chooseBossAttack(table, restored, context(0, { phase: "wild", random: new SeededRandom(seed) }))?.id,
    );
    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it("plays a move marked once at most once, and a move on a count after that many others and only then", () => {
    const table = buildBossAttackTable(
      definition([
        ...ordinary,
        move("ritual", {
          phases: ["wild"],
          choose: { range: [0, 2000], weight: 1, cooldown: 0, opens: true, once: true },
        }),
        move("spring", { phases: ["wild"], choose: { range: [0, 2000], weight: 1, cooldown: 0, afterMoves: 2 } }),
      ]),
    );
    const begun = order(table, 6000, { switchAt: 0, seed: "count" });
    expect(begun.length).toBeGreaterThan(20);
    expect(begun[0]).toBe("ritual");
    expect(begun.filter((id) => id === "ritual")).toHaveLength(1);
    // Owed at once after the opening, then after every two other moves.
    expect(begun.slice(1).map((id) => id === "spring")).toEqual(begun.slice(1).map((_, index) => index % 3 === 0));
  });

  it("counts a move that was cut short: the count is kept from when it began", () => {
    const table = buildBossAttackTable(
      definition([
        ...ordinary,
        move("spring", { choose: { range: [0, 2000], weight: 1, cooldown: 0, afterMoves: 1 } }),
      ]),
    );
    const started = advanceBossAttack(table, createBossAttackRunnerState(), context(0)).state;
    expect(started.run?.attackId).toBe("spring");
    const cut = exposeBossAttack(table, started, 10, 30);
    expect(cut).toMatchObject({ begun: 1, begunAt: { spring: 0 } });
    expect(chooseBossAttack(table, cut, context(200))?.id).not.toBe("spring");
  });

  it("rejects a schedule the runner could not keep", () => {
    const counted = (afterMoves: number, once?: boolean) =>
      move("spring", {
        choose: { range: [0, 2000], weight: 1, cooldown: 0, afterMoves, ...(once === undefined ? {} : { once }) },
      });
    expect(() => buildBossAttackTable(definition([...ordinary, counted(0)]))).toThrow(/whole number/u);
    expect(() => buildBossAttackTable(definition([...ordinary, counted(1.5)]))).toThrow(/whole number/u);
    expect(() => buildBossAttackTable(definition([...ordinary, counted(2, true)]))).toThrow(/once/u);
    // A phase left with fewer than two moves chosen by weight could stall the no-repeat rule.
    expect(() => buildBossAttackTable(definition([move("lash"), counted(2)]))).toThrow(/chosen by weight/u);
  });

  it("says a strike is on its way only in a hitting move's tell and active stage", () => {
    const quiet = move("hop", { timing: { tell: 0.2, active: 0.3, recover: 0.2 } });
    delete (quiet as { hit?: unknown }).hit;
    const table = buildBossAttackTable(definition([move("lash"), quiet]));
    let state = createBossAttackRunnerState();
    expect(bossAttackThreatens(table, state)).toBe(false);
    const seen = new Map<string, boolean>();
    for (let tick = 0; tick < 1200; tick += 1) {
      state = advanceBossAttack(table, state, context(tick)).state;
      if (state.run !== null) seen.set(`${state.run.attackId}:${state.run.stage}`, bossAttackThreatens(table, state));
    }
    expect(seen.get("lash:tell")).toBe(true);
    expect(seen.get("lash:active")).toBe(true);
    expect(seen.get("lash:recover")).toBe(false);
    expect(seen.get("hop:tell")).toBe(false);
    expect(seen.get("hop:active")).toBe(false);
  });
});
