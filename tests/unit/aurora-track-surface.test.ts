import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { EnvelopeSequencer } from "../../src/domain/envelopes";
import { AURORA_TRACK_HEIGHT, AURORA_TRACK_TRAVEL } from "../../src/gameplay/environment/aurora-track";
import {
  activateStageEnvironment,
  stageFieldGeometry,
  stageFieldSurface,
} from "../../src/gameplay/environment/stage-environment-activation";
import { STAGE_ENVIRONMENT_DEFINITIONS } from "../../src/gameplay/environment/stage-environment-definitions";
import { RIMEHOUND_TUNING } from "../../src/gameplay/entities/enemy-types/rimehound";
import { AUTHORED_STAGES, type StageId } from "../../src/gameplay/stages";
import { createProductionCombatSimulation, createProductionReplayWorld } from "../../src/tearbench";

const GROUND = CONFIG.world.groundY;

/**
 * Every body in the game's configuration a road can carry: anything with a size and a speed, except the
 * bosses (weight 5 and up), whose row in the road's targets is 0.
 */
function bodyHeights(): readonly Readonly<{ name: string; h: number }>[] {
  const found: { name: string; h: number }[] = [{ name: "rimehound", h: RIMEHOUND_TUNING.body.h }];
  const visit = (value: unknown, name: string): void => {
    if (typeof value !== "object" || value === null) return;
    const entry = value as Record<string, unknown>;
    const boss = typeof entry.weight === "number" && entry.weight >= 5;
    if (typeof entry.w === "number" && typeof entry.h === "number" && typeof entry.speed === "number" && !boss)
      found.push({ name, h: entry.h });
    for (const [key, child] of Object.entries(entry)) visit(child, `${name}.${key}`);
  };
  visit(CONFIG, "CONFIG");
  found.push({ name: "player", h: CONFIG.player.h });
  return found;
}

function roads() {
  return Object.values(STAGE_ENVIRONMENT_DEFINITIONS).flatMap((definition) =>
    definition.initialFields.flatMap((field) =>
      field.kind === "aurora-track" ? [{ stageId: definition.stageId, field }] : [],
    ),
  );
}

describe("an Aurora Track lies on its surface", () => {
  it("has at least one stage with roads to check", () => {
    expect(roads().length).toBeGreaterThan(0);
    expect(bodyHeights().length).toBeGreaterThan(10);
  });

  it("puts everyone who stands on the surface inside the road, on every stage that has roads", () => {
    for (const { stageId, field } of roads()) {
      const surface = stageFieldSurface(stageId, field.surface, GROUND);
      const box = stageFieldGeometry(stageId, field, GROUND);
      expect(box, `${stageId} ${field.slot}`).toEqual({
        x: surface.x,
        y: surface.y - AURORA_TRACK_HEIGHT,
        w: surface.w,
        h: AURORA_TRACK_HEIGHT,
      });
      for (const body of bodyHeights()) {
        const centre = surface.y - body.h / 2;
        expect(centre, `${body.name} on ${stageId} ${field.slot}`).toBeGreaterThanOrEqual(box.y);
        expect(centre, `${body.name} on ${stageId} ${field.slot}`).toBeLessThanOrEqual(box.y + (box.h ?? 0));
      }
    }
  });

  it("names a real surface: a platform of its own stage, or floor inside the arena", () => {
    for (const { stageId, field } of roads()) {
      const stage = AUTHORED_STAGES.find((entry) => entry.id === stageId);
      const surface = stageFieldSurface(stageId, field.surface, GROUND);
      if ("platform" in field.surface)
        expect(stage?.layout[field.surface.platform], `${stageId} ${field.slot}`).toMatchObject({
          x: surface.x,
          y: surface.y,
          w: surface.w,
        });
      else expect(surface.y).toBe(GROUND);
      expect(surface.x).toBeGreaterThanOrEqual(0);
      expect(surface.x + surface.w).toBeLessThanOrEqual(CONFIG.view.w);
    }
    expect(() => stageFieldSurface("pale-traverse", { platform: 99 }, GROUND)).toThrow(/no platform 99/u);
  });
});

/**
 * The production player, stood on Pale's floor road and told to run for one second while the road is awake
 * (ticks 72 to 432 of its first cycle), through the same combat step live play uses.
 */
function run(input: Readonly<{ stage: StageId; direction: -1 | 0 | 1 }>): number {
  const replay = createProductionReplayWorld({ seed: "aurora-road-distance" });
  const core = createProductionCombatSimulation<{ tick: number }>(replay, { snapshot: (tick) => ({ tick }) });
  activateStageEnvironment(replay.world.context.environment, input.stage, 0, "new-run", GROUND);
  core.simulationRuntime.reset(0);
  const player = replay.world.state.player() as never as { x: number; y: number; vx: number; vy: number };
  const sequence = new EnvelopeSequencer();
  const step = (tick: number, direction: number) =>
    core.simulationRuntime.advanceOne(
      direction === 0 ? [] : [sequence.command(tick, { type: "move", x: direction * 1_000, y: 0 })],
    );
  let tick = 1;
  for (; tick <= 100; tick += 1) {
    player.x = 800;
    player.y = GROUND - CONFIG.player.h / 2;
    player.vx = 0;
    player.vy = 0;
    step(tick, 0);
  }
  const from = player.x;
  for (; tick <= 220; tick += 1) step(tick, input.direction);
  return Math.abs(player.x - from);
}

describe("an Aurora Track is faster to travel", () => {
  it("carries the player at least 1.3 times as far in a second as running without it", () => {
    const beside = run({ stage: "voidspire", direction: 1 });
    const along = run({ stage: "pale-traverse", direction: 1 });
    expect(beside).toBeGreaterThan(300);
    expect(along / beside).toBeGreaterThanOrEqual(1.3);
    expect(along / beside).toBeLessThanOrEqual(AURORA_TRACK_TRAVEL.topSpeed);
  });

  it("changes nothing for a player standing on it or running against it", () => {
    expect(run({ stage: "pale-traverse", direction: 0 })).toBe(run({ stage: "voidspire", direction: 0 }));
    expect(run({ stage: "pale-traverse", direction: -1 })).toBe(run({ stage: "voidspire", direction: -1 }));
  });
});
