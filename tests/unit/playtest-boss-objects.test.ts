import { describe, expect, it } from "vitest";

import { bossFightScenario, playBossFight, type BossFightRequest } from "../../src/playtest/boss-fight";
import {
  aimAtObject,
  createObjectChoice,
  OBJECT_CUTTING,
  createObjectCounter,
  readCuttableObjects,
  type CuttableObject,
  type ObjectCount,
} from "../../src/playtest/boss-objects";
import { BOSS_PLAYER_IDS } from "../../src/playtest/boss-player";
import { formatBossReport } from "../../src/playtest/boss-report";
import type { TearObservationV1, TearObservedEnvironmentCombatObjectV1 } from "../../src/tearbench/contracts";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";

/** Phase II of the Rootbound, where the game plants a Mercy Graft before the fight starts. */
const PHASE_TWO = {
  boss: "rootbound",
  difficulty: "normal",
  weapon: "sword",
  seed: "1",
  phase: 2,
  maxTicks: 3600,
} as const satisfies Omit<BossFightRequest, "player">;

function standing(id: string, state: string, x = 100): TearObservedEnvironmentCombatObjectV1 {
  return {
    id,
    kind: "graft-anchor",
    ownerId: "enemy:1",
    bounds: { minX: x, maxX: x + 40, minY: 500, maxY: 600 },
    integrityRatio: state === "destroyed" ? 0 : 0.5,
    state,
    counterplayTags: ["cut"],
    procEligible: false,
  };
}

/** A real observation of a fight's first tick, with these objects on the stage. */
function observed(objects: readonly TearObservedEnvironmentCombatObjectV1[]): TearObservationV1 {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(
      bossFightScenario({
        boss: "rootbound",
        difficulty: "normal",
        weapon: "sword",
        seed: "1",
        player: "scripted",
        maxTicks: 600,
      }),
    );
    // The boss walks in during the first ticks; an observation without an enemy has nobody to stand in for.
    while (environment.policyObservation().entities.length === 0) environment.step([]);
    const state = environment.policyObservation();
    return { ...state, environment: { fields: [], combatObjects: objects, routes: [] } };
  } finally {
    environment.dispose();
  }
}

describe("what a weapon can cut", () => {
  it("names an object without its owner or its counters, and gives its centre and half size", () => {
    const [graft, wall, root] = readCuttableObjects(
      observed([
        standing("enemy:1:graft:mercy", "active"),
        standing("enemy:1:root-cage:g2:left", "warning"),
        standing("enemy:1:regrowth:g1:3", "destroyed"),
      ]),
    );
    expect(graft).toMatchObject({ name: "graft mercy", x: 120, y: 550, hw: 20, hh: 50, standing: true, cut: false });
    expect(wall).toMatchObject({ name: "root-cage left", standing: true });
    expect(root).toMatchObject({ name: "regrowth", standing: false, cut: true });
  });

  it("counts what was planted, how long it stood, and only what the player cut as cut", () => {
    const count = createObjectCounter();
    const counts: Record<string, ObjectCount> = {};
    const at = (...objects: TearObservedEnvironmentCombatObjectV1[]): readonly CuttableObject[] =>
      readCuttableObjects(observed(objects));
    const both = at(standing("enemy:1:graft:mercy", "active"), standing("enemy:1:graft:haste", "warning"));
    count(counts, both);
    count(counts, both);
    count(counts, at(standing("enemy:1:graft:mercy", "destroyed"), standing("enemy:1:graft:haste", "active")));
    // Haste leaves without being cut; Mercy stays listed as cut and is not counted twice.
    count(counts, at(standing("enemy:1:graft:mercy", "destroyed"), standing("enemy:1:graft:haste", "expired")));
    // Mercy is planted again under the same id.
    count(counts, at(standing("enemy:1:graft:mercy", "warning")));
    expect(counts).toEqual({
      "graft mercy": { placed: 2, cut: 1, standingTicks: 3 },
      "graft haste": { placed: 1, cut: 0, standingTicks: 3 },
    });
  });

  it("shows the scripted player the chosen object in place of the enemies", () => {
    const state = observed([standing("enemy:1:graft:near", "active", 400)]);
    const [near] = readCuttableObjects(state);
    if (near === undefined) throw new Error("no object was read");
    const shown = aimAtObject({ state }, near).state.entities;
    const enemies = shown.filter((entity) => !["platform", "hazard", "projectile"].includes(entity.kind));
    expect(enemies).toEqual([expect.objectContaining({ id: "enemy:1:graft:near", x: 420, y: 550, hpRatio: 0.5 })]);
  });

  it("chooses the nearest standing object and keeps it while it stands", () => {
    const choose = createObjectChoice();
    const far = standing("enemy:1:graft:far", "active", 5000);
    const near = standing("enemy:1:graft:near", "active", 400);
    const state = observed([far, near, standing("enemy:1:graft:nearest-but-cut", "destroyed", 300)]);
    expect(choose(state)?.id).toBe("enemy:1:graft:near");
    // The player has gone next to the far one; the choice stays.
    const moved: TearObservationV1 = { ...state, tick: state.tick + 1, player: { ...state.player, x: 5000 } };
    expect(choose(moved)?.id).toBe("enemy:1:graft:near");
    const cut: TearObservationV1 = {
      ...observed([far, standing("enemy:1:graft:near", "destroyed", 400)]),
      tick: state.tick + 2,
    };
    expect(choose(cut)?.id).toBe("enemy:1:graft:far");
    expect(choose({ ...observed([]), tick: state.tick + 3 })).toBeUndefined();
  });

  it("leaves an object it cannot damage for as long as it stands, and tries it again when it is planted again", () => {
    const choose = createObjectChoice();
    const high = standing("enemy:1:graft:high", "active", 400);
    const state = observed([high]);
    const at = (ticks: number, objects = [high]): TearObservationV1 => ({
      ...observed(objects),
      tick: state.tick + ticks,
    });
    expect(choose(state)?.id).toBe("enemy:1:graft:high");
    expect(choose(at(OBJECT_CUTTING.giveUpTicks - 1))?.id).toBe("enemy:1:graft:high");
    expect(choose(at(OBJECT_CUTTING.giveUpTicks))).toBeUndefined();
    expect(choose(at(OBJECT_CUTTING.giveUpTicks + 500))).toBeUndefined();
    expect(choose(at(OBJECT_CUTTING.giveUpTicks + 501, []))).toBeUndefined();
    expect(choose(at(OBJECT_CUTTING.giveUpTicks + 502))?.id).toBe("enemy:1:graft:high");
  });

  it("keeps trying an object while its swings are damaging it", () => {
    const choose = createObjectChoice();
    const whole = { ...standing("enemy:1:graft:mercy", "active"), integrityRatio: 1 };
    const state = observed([whole]);
    choose(state);
    const hurt = { ...whole, integrityRatio: 0.4 };
    choose({ ...observed([hurt]), tick: state.tick + OBJECT_CUTTING.giveUpTicks - 1 });
    const later = { ...observed([hurt]), tick: state.tick + 2 * OBJECT_CUTTING.giveUpTicks - 2 };
    expect(choose(later)?.id).toBe("enemy:1:graft:mercy");
  });
});

describe("the player that cuts what stands on the stage", () => {
  it("cuts the Rootbound's Graft, which the other players leave standing", () => {
    // Four seconds of the phase: the cutter has the Graft down in under three. One fight, because the game takes
    // ten seconds to bring the boss to the phase; without the cutter's steering this Graft is still standing.
    const cuts = playBossFight({ ...PHASE_TWO, player: "cuts-objects", maxTicks: 480 });
    expect(cuts.phases[0]?.objects["graft mercy"]).toMatchObject({ placed: 1, cut: 1 });
    expect(cuts.end).not.toBe("broken");
    expect(formatBossReport([cuts])).toContain("to cut in phase II: graft mercy cut 1 of 1");
  });

  it("gives a fight at a chosen phase its whole time limit, not what the game left of it after bringing the boss there", () => {
    const fight = playBossFight({ ...PHASE_TWO, player: "avoids-tells", maxTicks: 120 });
    expect(fight.setupTicks).toBeGreaterThan(120);
    expect(fight).toMatchObject({ end: "time limit", ticks: 120 });
  });

  it("refuses a player it does not have, by name, before any fight", () => {
    const request = { ...PHASE_TWO, player: "cuts-graft" } as unknown as BossFightRequest;
    expect(() => bossFightScenario(request)).toThrow(`the players are ${BOSS_PLAYER_IDS.join(", ")}`);
  });
});
