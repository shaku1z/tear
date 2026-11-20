import { describe, expect, it } from "vitest";
import { stableVerificationHash } from "../../src/domain/hash";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import type { GameAction } from "../../src/input/game-action";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import { DEFAULT_COSMETIC_LOOKS } from "../../src/presentation/cosmetic-defaults";
import {
  COSMETIC_DRAW_HOOKS,
  createCosmeticWardrobe,
  type CosmeticLooks,
} from "../../src/presentation/cosmetic-styles";
import type { TearObservationV1, TearScenarioV1 } from "../../src/tearbench/contracts";

/**
 * Cosmetics are presentation only: a fixed fight with every ready slot equipped must produce the same
 * authoritative state, tick for tick, as the same fight with nothing equipped.
 */
const TICKS = 1_200;
const AXIS = 1_000;

const SCENARIO: TearScenarioV1 = {
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: "cosmetics-simulation-hash",
  version: 1,
  description: "Cosmetics never change the simulation",
  stateClass: "recorded-canonical",
  executionClass: "training",
  seed: "cosmetics-hash-1",
  start: { mode: "endless", difficulty: "easy", weapon: "sword" },
  maxTicks: TICKS,
  assertions: ["runtime.finite-state"],
  tags: ["determinism"],
};

/** Walks to the nearest enemy and keeps the blade spinning, so it lands held hits. */
function actions(observation: TearObservationV1, tick: number): GameAction[] {
  const target = observation.entities.find((entity) => entity.kind !== "projectile");
  const offset = target === undefined ? 0 : target.x - observation.player.x;
  const output: GameAction[] = [
    { type: "move", x: Math.abs(offset) > 120 ? Math.sign(offset) * AXIS : 0, y: 0 },
    { type: "aim", turn: (tick * 30_000) % 1_000_000, magnitude: AXIS },
  ];
  if (tick % 120 === 0) output.push({ type: "jump", phase: "pressed" });
  if (tick % 120 === 12) output.push({ type: "jump", phase: "released" });
  return output;
}

function hashes(looks: CosmeticLooks): string[] {
  const environment = createProductionHeadlessEnvironment({ looks });
  const output: string[] = [];
  try {
    environment.reset(SCENARIO);
    for (let tick = 1; tick <= TICKS; tick += 1) {
      const transition = environment.step(actions(environment.policyObservation(), tick));
      output.push(stableVerificationHash(transition.observation));
      if (transition.terminated) break;
    }
  } finally {
    environment.dispose();
  }
  return output;
}

describe("cosmetics and the simulation", () => {
  it("leaves every tick's authoritative hash unchanged with every ready slot equipped", () => {
    const wardrobe = createCosmeticWardrobe(COSMETIC_CATALOG, () => false);
    const everything = Object.fromEntries(
      Object.keys(COSMETIC_DRAW_HOOKS).flatMap((slot) => {
        const item = COSMETIC_CATALOG.items.find((entry) => entry.slot === slot);
        return item ? [[slot, item.id]] : [];
      }),
    );
    expect(Object.keys(everything).sort()).toEqual(Object.keys(COSMETIC_DRAW_HOOKS).sort());
    wardrobe.wear({}, everything);
    let wornSparks = 0;
    const counting: CosmeticLooks = {
      defaults: wardrobe.defaults,
      of: (owner) => wardrobe.of(owner),
      worn: () => {
        wornSparks += 1;
        return wardrobe.worn();
      },
    };
    const dressed = hashes(counting);
    expect(wornSparks, "the fight must land blade hits that wear the spark").toBeGreaterThan(0);
    expect(dressed).toEqual(hashes(DEFAULT_COSMETIC_LOOKS));
  });
});
