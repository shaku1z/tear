/**
 * The Rootbinder's snare, played out on the real Rootbinder, the real player and the real stage-object layer,
 * one tick at a time. One scenario per way out, and one each for the wave-opening grace, the immunity after a
 * hold and the rule that the mark is aimed at a place. The numbers are ROOT_SNARE_RULES.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { aabbOverlap, clamp, len } from "../../src/domain/geometry";
import { BOSS_TELL_MIN_LEAD_SECONDS } from "../../src/gameplay/entities/boss-tells";
import { createPlayer, type PlayerInputPort, type PlayerPlatformPort } from "../../src/gameplay/entities/player";
import { ROOTBINDER_RULES } from "../../src/gameplay/entities/rootbinder-runtime";
import { OPENING_GRACE_SECONDS } from "../../src/gameplay/run/wave-rules";
import { bindLiveRootbinderActors } from "../../src/gameplay/environment/biome-actors/rootbinder-actors";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import {
  ROOT_SNARE_RULES,
  isRootSnareState,
  rootSnareTell,
  type RootSnareState,
} from "../../src/gameplay/environment/root-snare";
import { createEnemyHarness } from "./enemy-test-harness";

const RULES = ROOT_SNARE_RULES;
const DT = 1 / RULES.ticksPerSecond;
const FLOOR = CONFIG.world.groundY;
const BINDER_X = 400;
/** Far enough that the Rootbinder plants at once, near enough to be marked. */
const PLAYER_X = BINDER_X + 350;
type Key = "left" | "right" | "jump" | "dash";

function scene(options: Readonly<{ binders?: readonly number[]; attackHold?: number }> = {}) {
  const held = new Set<Key>();
  const input: PlayerInputPort = {
    right: () => held.has("right"),
    left: () => held.has("left"),
    up: () => false,
    down: () => false,
    dashPressed: () => held.has("dash"),
    jumpPressed: () => held.has("jump"),
  };
  const Player = createPlayer({
    CONFIG,
    FX: { burst: () => undefined, drip: () => undefined },
    GFX: { low: true },
    Input: input,
    presentation: { draw: () => undefined },
    aabbOverlap,
    clamp,
    len,
  });
  const floor: PlayerPlatformPort = { x: 0, y: FLOOR, w: CONFIG.view.w, h: 100, floor: true };
  const player = new Player(PLAYER_X, FLOOR - CONFIG.player.h / 2);
  const harness = createEnemyHarness([0.5]);
  const binders = (options.binders ?? [BINDER_X]).map((x) => {
    const binder = new harness.types.Rootbinder(x, FLOOR - CONFIG.rootbinder.h / 2);
    binder.spawnT = 0;
    binder.attackHold = options.attackHold ?? 0;
    return binder;
  });
  const ids = new Map(binders.map((binder, index) => [binder as object, `enemy:${String(index)}`]));
  const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "snare" });
  bindLiveRootbinderActors(
    environment,
    () => player,
    () => binders,
    (enemy) => ids.get(enemy) ?? "enemy:unknown",
  );
  let tick = 0;
  /** The furthest the player stood from where they were caught, measured after each stage-object step. */
  let strayed = 0;
  let highest = player.y;
  const snare = (): RootSnareState | undefined =>
    environment
      .combatObjects()
      .filter(isRootSnareState)
      .find((object) => object.state !== "destroyed" && object.state !== "expired");
  const step = (count = 1): void => {
    for (let index = 0; index < count; index += 1) {
      environment.step(tick, DT, () => undefined);
      const live = snare();
      if (live?.snarePhase === "holding") strayed = Math.max(strayed, Math.abs(player.x - live.anchorX));
      highest = Math.min(highest, player.y);
      for (const binder of binders) {
        if (binder.dead) continue;
        if (binder.stun > 0) binder.tickTimers(DT);
        else binder.update(DT, harness.platforms, player);
      }
      player.update(DT, [floor]);
      tick += 1;
    }
  };
  /** Steps until `done` holds, and returns the tick it first held on. */
  const until = (done: () => boolean, limit = 3_000): number => {
    for (let guard = 0; guard < limit && !done(); guard += 1) step();
    if (!done()) throw new Error("the scenario never reached its condition");
    return tick;
  };
  const binder = binders[0];
  if (binder === undefined) throw new Error("a scene needs a Rootbinder");
  return {
    environment,
    binder,
    binders,
    player,
    held,
    step,
    until,
    snare,
    tick: () => tick,
    strayed: () => strayed,
    highest: () => highest,
    cut: (id: string) => environment.damageCombatObject(id, Number.MAX_SAFE_INTEGER, `cut:${String(tick)}`, tick),
  };
}

/** Runs until the player stands held, and returns the scene. */
function caught(options?: Parameters<typeof scene>[0]) {
  const setup = scene(options);
  setup.until(() => setup.snare()?.snarePhase === "holding");
  return setup;
}

describe("the snare's warning", () => {
  it("marks the ground where the player stands, in the shared tell format, long enough to read", () => {
    const setup = scene();
    const start = setup.until(() => setup.snare() !== undefined);
    const mark = setup.snare();
    if (mark === undefined) throw new Error("no mark");
    const tell = rootSnareTell(mark);
    expect(tell).toMatchObject({
      mark: "reticle",
      stage: "warning",
      damaging: false,
      x: PLAYER_X,
      hw: RULES.ringHalfWidth,
    });
    expect(tell?.leadSeconds).toBe(RULES.warningTicks / RULES.ticksPerSecond);
    expect(tell?.leadSeconds).toBeGreaterThanOrEqual(BOSS_TELL_MIN_LEAD_SECONDS.normal);
    expect(mark.ringY).toBe(FLOOR);
    const closes = setup.until(() => setup.snare()?.snarePhase !== "warning");
    expect(closes - start).toBe(RULES.warningTicks);
  });

  it("comes only after the Rootbinder has stood planted for its first delay", () => {
    const setup = scene();
    const planted = setup.until(() => setup.binder.rootPhase === "planted");
    const marked = setup.until(() => setup.snare() !== undefined);
    expect((marked - planted) * DT).toBeGreaterThanOrEqual(RULES.firstDelaySeconds - 2 * DT);
  });

  it("does not mark a player out of reach or in the air", () => {
    const far = scene();
    far.player.x = BINDER_X + RULES.reach + 60;
    far.step(600);
    expect(far.snare()).toBeUndefined();
    expect(far.binder.rootPhase).not.toBe("uprooted");
  });
});

describe("way out 1: leave the mark before it closes", () => {
  it("stays where it was placed, catches nobody, and the player is never held or hurt", () => {
    const setup = scene();
    setup.until(() => setup.snare() !== undefined);
    const id = setup.snare()?.id;
    setup.held.add("right");
    setup.until(() => setup.snare()?.id !== id);
    expect(setup.player.x).toBeGreaterThan(PLAYER_X + RULES.ringHalfWidth);
    expect(setup.strayed()).toBe(0);
    expect(setup.player.hp).toBe(setup.player.maxHp);
    const ended = setup.environment.combatObjects().find((object) => object.id === id);
    if (ended === undefined || !isRootSnareState(ended)) throw new Error("the mark left no trace");
    expect(ended).toMatchObject({ state: "expired", ringX: PLAYER_X, snarePhase: "erupting" });
  });

  it("is jumped over: a player in the air above the mark when it closes is not caught", () => {
    const setup = scene();
    setup.until(() => setup.snare()?.warningProgress !== undefined && (setup.snare()?.warningProgress ?? 0) > 0.8);
    setup.held.add("jump");
    setup.until(() => setup.snare() === undefined);
    expect(setup.strayed()).toBe(0);
    expect(setup.highest()).toBeLessThan(FLOOR - CONFIG.player.h / 2 - RULES.catchHeight);
  });
});

describe("caught: what the hold does", () => {
  it("holds a player who stood in the mark within the hold radius, walking, dashing and jumping", () => {
    const setup = caught();
    const anchor = setup.snare()?.anchorX;
    expect(anchor).toBe(PLAYER_X);
    setup.held.add("right");
    setup.step(40);
    setup.held.add("dash");
    setup.step(20);
    setup.held.delete("dash");
    setup.held.add("jump");
    setup.step(60);
    expect(setup.snare()?.snarePhase).toBe("holding");
    expect(setup.strayed()).toBeLessThanOrEqual(RULES.holdRadius);
    expect(setup.strayed()).toBeGreaterThan(RULES.holdRadius - 1);
    // The jump is theirs: they left the ground while held.
    expect(setup.highest()).toBeLessThan(FLOOR - CONFIG.player.h / 2 - 30);
    expect(setup.player.hp).toBe(setup.player.maxHp);
  });

  it("keeps the Rootbinder planted while it holds", () => {
    const setup = caught();
    setup.step(RULES.holdTicks - 2);
    expect(setup.binder.rootPhase).toBe("planted");
  });
});

describe("way out 2: cut the root", () => {
  it("frees the player at once, and with no other root left the Rootbinder is uprooted", () => {
    const setup = caught();
    const id = setup.snare()?.id ?? "";
    expect(setup.cut(id)).toMatchObject({ accepted: true, destroyed: true });
    setup.held.add("right");
    setup.step(2);
    expect(setup.binder.rootPhase).toBe("uprooted");
    setup.step(120);
    expect(setup.player.x).toBeGreaterThan(PLAYER_X + RULES.holdRadius + 50);
  });
});

describe("way out 3: it lets go by itself", () => {
  it("releases the player when the hold has run its length", () => {
    const setup = caught();
    const caughtAt = setup.tick();
    setup.held.add("right");
    const released = setup.until(() => setup.snare() === undefined);
    expect(released - caughtAt).toBe(RULES.holdTicks);
    setup.step(60);
    expect(setup.player.x).toBeGreaterThan(PLAYER_X + RULES.holdRadius + 50);
    expect(setup.binder.rootPhase).toBe("planted");
  });
});

describe("way out 4: uproot or kill the Rootbinder", () => {
  it("frees the player when one heavy hit uproots it", () => {
    const setup = caught();
    setup.binder.hit(CONFIG.rootbinder.hp * ROOTBINDER_RULES.uprootHitShare, 0, 0);
    expect(setup.binder.rootPhase).toBe("uprooted");
    setup.step(2);
    expect(setup.snare()).toBeUndefined();
  });

  it("frees the player when it dies", () => {
    const setup = caught();
    setup.binder.dead = true;
    setup.held.add("right");
    setup.step(2);
    expect(setup.snare()).toBeUndefined();
    setup.step(120);
    expect(setup.player.x).toBeGreaterThan(PLAYER_X + RULES.holdRadius + 50);
  });
});

describe("the wave-opening grace", () => {
  it("places no mark while the Rootbinder's attacks are held, and marks once the hold is over", () => {
    const grace = OPENING_GRACE_SECONDS;
    const free = scene();
    const freeMark = free.until(() => free.snare() !== undefined);
    expect(freeMark * DT).toBeLessThan(grace);
    const held = scene({ attackHold: grace });
    for (let tick = 0; tick < grace * RULES.ticksPerSecond; tick += 1) {
      held.step();
      expect(held.snare(), `tick ${String(tick)}`).toBeUndefined();
    }
    expect(held.binder.rootPhase).toBe("planted");
    const heldMark = held.until(() => held.snare() !== undefined);
    expect(heldMark * DT).toBeGreaterThanOrEqual(grace);
    expect(heldMark * DT).toBeLessThan(grace + 0.1);
  });
});

describe("immunity after a hold", () => {
  it("lets no Rootbinder mark the player again until the immunity has run out", () => {
    const setup = caught({ binders: [BINDER_X, BINDER_X + 700] });
    const first = setup.snare();
    expect(setup.binders.every((binder) => binder.rootPhase === "planted")).toBe(true);
    const released = setup.until(() => setup.snare() === undefined);
    // While the immunity runs, a Rootbinder stands ready with the player in reach, and still places no mark.
    let readyTicks = 0;
    for (let tick = 0; tick < RULES.immunityTicks - 1; tick += 1) {
      setup.step();
      if (setup.binders.some((binder) => binder.snareReady)) readyTicks += 1;
      expect(setup.snare(), `tick ${String(tick)}`).toBeUndefined();
    }
    expect(readyTicks).toBeGreaterThan(0);
    const next = setup.until(() => setup.snare() !== undefined);
    expect(next - released).toBeGreaterThanOrEqual(RULES.immunityTicks);
    expect(first).toBeDefined();
  });

  it("gives no immunity for a mark that caught nobody", () => {
    const setup = scene({ binders: [BINDER_X, BINDER_X + 700] });
    setup.until(() => setup.snare() !== undefined);
    const id = setup.snare()?.id;
    setup.held.add("right");
    setup.step(60);
    setup.held.clear();
    const gone = setup.until(() => setup.snare()?.id !== id);
    const next = setup.until(() => setup.snare() !== undefined);
    expect(next - gone).toBeLessThan(RULES.immunityTicks);
  });

  it("never has two snares on the player at once", () => {
    const setup = scene({ binders: [BINDER_X, BINDER_X + 700] });
    for (let tick = 0; tick < 3_000; tick += 1) {
      setup.step();
      const live = setup.environment
        .combatObjects()
        .filter(isRootSnareState)
        .filter((object) => object.state !== "destroyed" && object.state !== "expired");
      expect(live.length).toBeLessThanOrEqual(1);
    }
  });
});
