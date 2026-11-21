import { describe, expect, it } from "vitest";

import type { TearObservedActorV1, TearObservationV1 } from "../../src/tearbench/contracts";
import { TearProgressMeter } from "../../src/tearbench/progress-meter";

const enemy = (id: string, hpRatio = 1): TearObservedActorV1 => ({
  id,
  kind: "flyer",
  x: 18,
  y: 40,
  vx: 0,
  vy: 0,
  hpRatio,
});
const shot = (id: string, x: number): TearObservedActorV1 => ({ id, kind: "projectile", x, y: 300, vx: -1400, vy: 0 });

function observed(
  entities: readonly TearObservedActorV1[],
  patch: Partial<{ hp: number; wave: number; score: number; x: number }> = {},
): TearObservationV1 {
  return {
    format: "tear-contract",
    kind: "observation",
    schemaVersion: 1,
    tick: 0,
    observationClass: "structured-state",
    player: {
      x: patch.x ?? 1300,
      y: 775,
      vx: 0,
      vy: 0,
      hp: patch.hp ?? 145,
      maxHp: 160,
      facing: -1,
      grounded: true,
      dashCharges: 1,
    },
    blade: { handX: 0, handY: 0, tipX: 0, tipY: 0, vx: 0, vy: 0, tipSpeed: 0, state: "held" },
    entities,
    run: {
      mode: "campaign",
      difficulty: "easy",
      weapon: "riftlock",
      stage: "crimson-fields",
      wave: patch.wave ?? 24,
      score: patch.score ?? 42_440,
      elapsedTicks: 0,
    },
    availableActions: ["move"],
  };
}

describe("the progress meter", () => {
  it("counts the first observation, then only what moves a run toward its end", () => {
    const meter = new TearProgressMeter();
    const stuck = [enemy("enemy:1548", 0.79)];
    expect(meter.observe(observed(stuck), "playing")).toBe(true);
    expect(meter.observe(observed(stuck), "playing")).toBe(false);

    expect(meter.observe(observed(stuck, { hp: 140 }), "playing"), "the player is hurt").toBe(true);
    expect(meter.observe(observed(stuck, { hp: 140, score: 42_500 }), "playing"), "the score rises").toBe(true);
    const rest = { hp: 140, score: 42_500, wave: 25 };
    expect(meter.observe(observed(stuck, rest), "playing"), "the wave advances").toBe(true);
    expect(meter.observe(observed(stuck, rest), "draft"), "the screen changes").toBe(true);
    expect(meter.observe(observed(stuck, rest), "draft")).toBe(false);
    expect(meter.observe(observed([enemy("enemy:1548", 0.7)], rest), "draft"), "an enemy is hurt").toBe(true);
    expect(meter.observe(observed([], rest), "draft"), "an enemy is gone").toBe(true);
    expect(meter.observe(observed([], rest), "draft")).toBe(false);
  });

  it("does not count movement, shots in flight, an enemy arriving or an enemy healing", () => {
    const meter = new TearProgressMeter();
    meter.observe(observed([enemy("enemy:1548", 0.79)]), "playing");
    const quiet = [
      observed([enemy("enemy:1548", 0.79)], { x: 900 }),
      observed([enemy("enemy:1548", 0.79), shot("shot:1", 1200)]),
      observed([enemy("enemy:1548", 0.79), shot("shot:1", 600), shot("shot:2", 1200)]),
      observed([enemy("enemy:1548", 0.79)]),
      observed([enemy("enemy:1548", 0.79), enemy("enemy:1549")]),
      observed([enemy("enemy:1548", 0.9), enemy("enemy:1549")]),
    ];
    expect(quiet.map((observation) => meter.observe(observation, "playing"))).toEqual(quiet.map(() => false));
  });

  it("sees no progress in a stuck run, however long the player keeps throwing", () => {
    // The run found on 2026-11-20 (easy, seed 117, wave 24): one flyer out of reach, the player throwing at it and
    // missing. Every throw changed how many things were in the arena, and the Watch Agent's watchdog, which read
    // that count, stayed quiet for 45 minutes. Its limit is 14,400 decisions without progress.
    const meter = new TearProgressMeter();
    let quiet = 0;
    let longestQuiet = 0;
    for (let decision = 0; decision < 20_000; decision += 1) {
      const inFlight = decision % 40 < 25 ? [shot("shot:" + String(Math.floor(decision / 40)), 1300 - decision)] : [];
      const progressed = meter.observe(
        observed([enemy("enemy:1548", 0.79), ...inFlight], { x: 1300 - (decision % 90) }),
        "playing",
      );
      quiet = progressed ? 0 : quiet + 1;
      longestQuiet = Math.max(longestQuiet, quiet);
    }
    expect(longestQuiet).toBe(19_999);
  });

  it("counts health only as a net loss, so healing and being hit again in a loop is not progress", () => {
    const meter = new TearProgressMeter();
    const at = (hp: number, enemyHealth: number) =>
      meter.observe(observed([enemy("enemy:1", enemyHealth)], { hp }), "playing");
    at(100, 1);
    // A player who regenerates against a hazard: down once, then up and down between the same two values.
    expect([90, 95, 90, 95, 90].map((hp) => at(hp, 1))).toEqual([true, false, false, false, false]);
    expect(at(89, 1), "worn down further").toBe(true);
    // An enemy that heals back what it loses.
    expect([0.8, 0.9, 0.8, 0.9, 0.8].map((health) => at(89, health))).toEqual([true, false, false, false, false]);
    expect(at(89, 0.79), "worn down further").toBe(true);
    // Health the player won back counts again once the run has progressed some other way.
    at(120, 0.79);
    expect(at(120, 0.7)).toBe(true);
    expect(at(110, 0.7)).toBe(true);
  });

  it("starts over after a reset", () => {
    const meter = new TearProgressMeter();
    meter.observe(observed([enemy("enemy:1")]), "playing");
    meter.reset();
    expect(meter.observe(observed([enemy("enemy:1")]), "playing")).toBe(true);
  });
});
