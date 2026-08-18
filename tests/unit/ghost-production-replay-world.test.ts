import { describe, expect, it } from "vitest";

import { GhostProductionReplayWorld, createGhostV3, type GhostReplayTrident } from "../../src/ghost";
import { CONFIG } from "../../src/config/game-config";
import { createProductionCombatSimulation, createProductionReplayWorld } from "../../src/tearbench";

const trident: GhostReplayTrident = {
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "C29 test" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "C29 test" },
  visual: { kind: "visual", status: "absent", available: false, resumable: false, seekable: false, reason: "C29 test" },
};

function productionComposition(created: unknown[]) {
  return {
    create(snapshot: undefined) {
      expect(snapshot).toBeUndefined();
      const detached = createProductionReplayWorld({
        seed: "c29-production-replay",
        enemies: [{ id: "charger", x: 760, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 }],
      });
      const core = createProductionCombatSimulation<Record<string, unknown>>(detached, {
        snapshot: (tick) => {
          const player = detached.world.state.player() as never as { x: number; y: number; vx: number; vy: number; hp: number };
          const run = detached.world.state.run() as never as { wave: number; runTime: number };
          return Object.freeze({ tick, player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, hp: player.hp },
            run: { wave: run.wave, runTime: run.runTime } });
        },
      });
      core.simulationRuntime.reset(0);
      created.push(core.simulationRuntime);
      return Object.freeze({
        simulation: core.simulationRuntime,
        semanticProjection: () => core.simulationRuntime.lastResult?.state ?? Object.freeze({ tick: 0 }),
      });
    },
  };
}

describe("Ghost production replay world", () => {
  it("drives the C27A production combat composition through its one supplied runtime", () => {
    const ghost = createGhostV3({
      id: "c29-production-replay", rulesetVersion: "tear-rules-2026.07", sourceClassification: "native-v3", trident,
      actions: [
        { kind: "command", id: 1, tick: 2, command: { type: "move", x: 1_000, y: 0 } },
        { kind: "command", id: 2, tick: 20, command: { type: "jump", phase: "pressed" } },
        { kind: "command", id: 3, tick: 40, command: { type: "dash", x: 1_000, y: 0 } },
      ],
      snapshots: [], events: [],
    });
    const created: unknown[] = [];
    const replay = new GhostProductionReplayWorld(ghost, productionComposition(created));

    const first = replay.seek(80);
    const firstRuntime = replay.simulation();
    expect(firstRuntime).toBe(created[0]);
    expect(firstRuntime?.scheduler.tick).toBe(80);
    expect(first.semanticHash).not.toBe("");

    const repeated = replay.seek(80);
    expect(repeated.semanticHash).toBe(first.semanticHash);
    expect(replay.simulation()).toBe(created[1]);
    expect(created).toHaveLength(2);
  });
});
