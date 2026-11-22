import { describe, expect, it } from "vitest";

import { createProductionCombatPhases } from "../../src/app/world/detached/combat-phases";
import { createProductionReplayWorld } from "../../src/app/world/detached/world-factory";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";
import { liveActions } from "./live-combat-actions-harness";

// A replay re-runs play in the detached world, so its opening host must test contact exactly as the
// live one does. The Cinder dash ignites an enemy within 6 px of the player's box; a detached host
// that dropped that padding left a grazed enemy unburnt and the replay a few points of damage short.
const player = { x: 800, y: 740, hw: 13, hh: 24 };
const enemy = (gap: number) => ({ x: player.x + player.hw + 15 + gap, y: 740, hw: 15, hh: 23 });

describe("live and detached contact", () => {
  it.each([
    [-1, 0],
    [3, 0],
    [3, 6],
    [5.9, 6],
    [6.1, 6],
  ])("agree for an enemy %s px clear of the player with padding %s", (gap, padding) => {
    const seed = scenarioRunSeed("contact-padding");
    const live = liveActions(createProductionReplayWorld({ runSeed: seed })).opening;
    const detached = createProductionCombatPhases(createProductionReplayWorld({ runSeed: seed })).opening;
    const expected = gap < padding;
    expect(live.overlap(player as never, enemy(gap) as never, padding)).toBe(expected);
    expect(detached.overlap(player as never, enemy(gap) as never, padding)).toBe(expected);
  });
});
