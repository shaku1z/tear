import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { BOSS_TELL_MIN_LEAD_SECONDS } from "../../src/gameplay/entities/boss-tells";
import type { BossAttackRunnerState } from "../../src/gameplay/entities/boss-attack-runner";
import { ROOTBOUND_PHASE_ONE_CADENCE } from "../../src/gameplay/entities/enemy-types/rootbound";
import { ROOTBOUND_MOVES } from "../../src/gameplay/entities/enemy-types/rootbound-moves";
import { DIFFICULTY_CATALOG } from "../../src/gameplay/run/difficulty-catalog";
import { createEnemyHarness } from "./enemy-test-harness";

type Harness = ReturnType<typeof createEnemyHarness>;
type PhaseOneBoss = InstanceType<Harness["types"]["Rootbound"]> & {
  moveState: BossAttackRunnerState;
  moveTick: number;
  hidden: boolean;
  batonStrike: number;
  phaseMarker: number;
  contactDamageEnabled(): boolean;
  parryBaton(strong: boolean): boolean;
  tells(): readonly Readonly<{ attackId: string; stage: string; leadSeconds: number; damaging: boolean }>[];
};

const dt = 1 / 120;
const groundFeet = CONFIG.world.groundY - 36;

function boss(randomValues?: readonly number[]): { harness: Harness; actor: PhaseOneBoss } {
  const harness = createEnemyHarness(randomValues);
  const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2);
  return { harness, actor };
}

/** The stage of the move in progress, read fresh: an update may have ended it. */
function stageOf(actor: PhaseOneBoss): string | null {
  return actor.moveState.run?.stage ?? null;
}

function move(id: string) {
  const found = ROOTBOUND_MOVES.byId.get(id);
  if (found === undefined) throw new Error(`no Rootbound move ${id}`);
  return found;
}

/** The next move must be `id`: every other move is still cooling down, and it may start now. */
function queue(actor: PhaseOneBoss, id: string): void {
  const cooling = Object.fromEntries(
    ROOTBOUND_MOVES.attacks.filter((other) => other.id !== id).map((other) => [other.id, Number.MAX_SAFE_INTEGER]),
  );
  actor.moveState = { run: null, readyTick: actor.moveTick, lastAttackId: null, cooldownUntil: cooling };
}

/** Where the player stands so each move, played straight, lands on them. */
const STAND_FOR: Readonly<Record<string, number>> = {
  "vine-lash": -150,
  "root-glide": -500,
  "canopy-vault": -400,
  "thorn-burst": -90,
  "root-wave": -500,
};

/** Runs `id` from its first tick to its end and reports what the player felt. */
function play(id: string) {
  const { harness, actor } = boss();
  harness.player.x = actor.x + (STAND_FOR[id] ?? -150);
  harness.player.y = groundFeet;
  queue(actor, id);
  let tick = 0,
    firstHit = -1,
    warnedFrom = -1;
  const stages: string[] = [];
  for (; tick < 120 * 4; tick += 1) {
    const before = harness.player.damage.length;
    actor.update(dt, harness.platforms, harness.player);
    const stage = actor.moveState.run?.stage ?? "done";
    if (stages.at(-1) !== stage) stages.push(stage);
    if (warnedFrom < 0 && actor.tells().some((tell) => tell.attackId === id && tell.stage === "warning"))
      warnedFrom = tick;
    if (firstHit < 0 && harness.player.damage.length > before) firstHit = tick;
    if (stage === "done") break;
  }
  return { harness, actor, firstHit, warnedFrom, stages, damage: harness.player.damage.map((hit) => hit.amount) };
}

describe("Rootbound Phase I moves", () => {
  it("waits out the opening, then plays table moves with no move twice running, the same way every time", () => {
    const sequence = (randomValues: readonly number[]): readonly string[] => {
      const { harness, actor } = boss(randomValues);
      const started: string[] = [];
      let firstStart = -1;
      for (let tick = 0; tick < 120 * 30; tick += 1) {
        // Every 3 s the player either crowds the keeper or steps across the arena, so moves of every range come up.
        if (tick % 720 === 0) harness.player.x = actor.x < CONFIG.view.w / 2 ? CONFIG.view.w - 160 : 160;
        else if (tick % 720 === 360) harness.player.x = actor.x + (actor.x < CONFIG.view.w / 2 ? 90 : -90);
        actor.update(dt, harness.platforms, harness.player);
        const run = actor.moveState.run;
        if (
          run !== null &&
          run.stage === "tell" &&
          actor.atk === `${run.attackId}:tell` &&
          started.at(-1) !== run.attackId
        ) {
          started.push(run.attackId);
          if (firstStart < 0) firstStart = tick;
        }
      }
      expect(firstStart / 120).toBeGreaterThanOrEqual(ROOTBOUND_PHASE_ONE_CADENCE.openingDelay - dt);
      return started;
    };
    const values = [0.13, 0.71, 0.42, 0.95, 0.06, 0.58];
    const first = sequence(values);
    expect(first.length).toBeGreaterThan(12);
    expect(first.every((id, index) => index === 0 || first[index - 1] !== id)).toBe(true);
    expect(new Set(first)).toEqual(new Set(ROOTBOUND_MOVES.attacks.map((attack) => attack.id)));
    expect(sequence(values)).toEqual(first);
  });

  for (const attack of ROOTBOUND_MOVES.attacks) {
    it(`warns ${attack.id} for its authored tell, then lands it once for its authored damage`, () => {
      const { firstHit, warnedFrom, stages, damage } = play(attack.id);
      expect(warnedFrom).toBe(0);
      expect(attack.timing.tell / 120).toBeGreaterThanOrEqual(BOSS_TELL_MIN_LEAD_SECONDS.normal);
      expect(firstHit).toBeGreaterThanOrEqual(attack.timing.tell);
      expect(damage).toEqual([attack.hit?.damage]);
      expect(stages).toEqual(
        attack.timing.punish > 0
          ? ["tell", "active", "recover", "punish", "done"]
          : ["tell", "active", "recover", "done"],
      );
    });
  }

  it("strikes where the player stood at the wind-up, so moving away from a target move dodges it", () => {
    for (const id of ["root-glide", "canopy-vault"]) {
      const { harness, actor } = boss();
      harness.player.x = actor.x - 450;
      queue(actor, id);
      actor.update(dt, harness.platforms, harness.player);
      const locked = harness.player.x;
      harness.player.x = locked + 320;
      let surfacedAt = Number.NaN;
      for (let tick = 0; tick < 120 * 3 && stageOf(actor) !== null; tick += 1) {
        actor.update(dt, harness.platforms, harness.player);
        if (stageOf(actor) === "active") surfacedAt = actor.x;
      }
      expect(harness.player.damage, id).toEqual([]);
      expect(Math.abs(surfacedAt - locked), id).toBeLessThan(1);
    }
  });

  it("cannot be hit and deals no contact damage while burrowed for Root Glide", () => {
    const { harness, actor } = boss();
    harness.player.x = actor.x - 600;
    queue(actor, "root-glide");
    for (let tick = 0; tick < move("root-glide").timing.tell / 2; tick += 1)
      actor.update(dt, harness.platforms, harness.player);
    expect(actor.hidden).toBe(true);
    expect(actor.contactDamageEnabled()).toBe(false);
    expect(actor.blocksDamage()).toBe(true);
  });

  it("is open after its heavy moves: an exposed tell, and hits count for more until it recovers", () => {
    for (const id of ["root-glide", "canopy-vault"]) {
      const { harness, actor } = boss();
      harness.player.x = actor.x - 500;
      queue(actor, id);
      for (let tick = 0; tick < 120 * 3 && actor.moveState.run?.stage !== "punish"; tick += 1)
        actor.update(dt, harness.platforms, harness.player);
      expect(
        actor.tells().map((tell) => [tell.attackId, tell.stage, tell.damaging]),
        id,
      ).toContainEqual([id, "exposed", false]);
      actor.hitCd = 0;
      expect(actor.hit(100, 1, 0), id).toBeCloseTo(100 * ROOTBOUND_MOVES.exposedDamageTaken);
      while (actor.moveState.run !== null) actor.update(dt, harness.platforms, harness.player);
      actor.hitCd = 0;
      expect(actor.hit(100, 1, 0), id).toBe(100);
    }
  });

  it("can be parried only in Vine Lash's window; a parry spares the player and opens the keeper", () => {
    const { harness, actor } = boss();
    harness.player.x = actor.x - 150;
    queue(actor, "vine-lash");
    actor.update(dt, harness.platforms, harness.player);
    expect(actor.batonStrike).toBe(0);
    expect(actor.parryBaton(false)).toBe(false);
    let opened = -1;
    for (let tick = 1; tick < 120 && opened < 0; tick += 1) {
      actor.update(dt, harness.platforms, harness.player);
      if (actor.batonStrike > 0) opened = tick;
    }
    const lash = move("vine-lash");
    expect(opened).toBe(lash.timing.tell - ROOTBOUND_MOVES.parryLead);
    expect(actor.parryBaton(true)).toBe(true);
    expect(actor.batonStrike).toBe(0);
    let exposedTicks = 0;
    while (actor.moveState.run !== null) {
      actor.update(dt, harness.platforms, harness.player);
      if (actor.tells().some((tell) => tell.stage === "exposed")) exposedTicks += 1;
    }
    expect(harness.player.damage).toEqual([]);
    expect(Math.abs(exposedTicks - ROOTBOUND_MOVES.parryExposed)).toBeLessThanOrEqual(1);
  });

  it("freezes moves through the intro and a cinematic, then resumes", () => {
    const { harness, actor } = boss();
    queue(actor, "vine-lash");
    actor.introT = 0.4;
    actor.update(dt, harness.platforms, harness.player);
    expect(actor).toMatchObject({ state: "intro", atk: "unavailable" });
    expect(actor.moveState.run).toBeNull();
    actor.introT = 0;
    actor.cinematicT = 0.4;
    actor.update(dt, harness.platforms, harness.player);
    expect(actor.atk).toBe("unavailable");
    expect(actor.moveState.run).toBeNull();
    actor.cinematicT = 0;
    for (let tick = 0; tick < 120 && actor.moveState.run === null; tick += 1)
      actor.update(dt, harness.platforms, harness.player);
    expect(actor.moveState.run?.attackId).toBe("vine-lash");
  });

  it("drops the move in progress, unhurt, when Phase II begins", () => {
    const { harness, actor } = boss();
    harness.player.x = actor.x - 600;
    queue(actor, "root-glide");
    for (let tick = 0; tick < 10; tick += 1) actor.update(dt, harness.platforms, harness.player);
    expect(actor.hidden).toBe(true);
    actor.hp = actor.maxHp * actor.phaseMarks[0];
    actor.update(dt, harness.platforms, harness.player);
    expect(actor).toMatchObject({ phase: 2, phaseMarker: 2, hidden: false, batonStrike: 0, atk: "unavailable" });
    expect(actor.moveState.run).toBeNull();
    expect(actor.tells().filter((tell) => ROOTBOUND_MOVES.byId.has(tell.attackId))).toEqual([]);
    expect(harness.player.damage).toEqual([]);
  });

  it("scales move damage once through the difficulty table", () => {
    const scaled = (damage: number, multiplier: number): number => Math.round(damage * multiplier * 10) / 10;
    expect(
      DIFFICULTY_CATALOG.map((difficulty) => [
        difficulty.id,
        ...ROOTBOUND_MOVES.attacks.map((attack) =>
          difficulty.oneHit ? "fatal" : scaled(attack.hit?.damage ?? 0, difficulty.modifiers.playerDamageTaken),
        ),
      ]),
    ).toEqual([
      ["easy", 11.7, 13, 14.3, 10.4, 10.4],
      ["normal", 18, 20, 22, 16, 16],
      ["hard", 24.3, 27, 29.7, 21.6, 21.6],
      ["extreme", 32.4, 36, 39.6, 28.8, 28.8],
      ["onehit", "fatal", "fatal", "fatal", "fatal", "fatal"],
    ]);
  });
});
