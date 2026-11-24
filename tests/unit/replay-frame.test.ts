/**
 * A replay is framed as play frames the run: play's camera (centred on the arena, at the world's zoom), the whole
 * arena fitted into the rectangle the replay is shown in, and the rectangle around it filled. The world inside is
 * drawn by the live world builder (src/app/replay/replay-frame.ts).
 */
import { describe, expect, it, vi } from "vitest";

import type { WorldFrameLayer } from "../../src/app/world/world-presentation-adapters";
import { createProductionGhostReplayComposition } from "../../src/app/world/detached/replay-composition";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";
import { recordingCanvas, replayPresentation } from "../support/replay-presentation";

type Rectangle = Readonly<{ x: number; y: number; w: number; h: number }>;
type Bounds = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/** The world without its parts: only the frame's camera, fit and fill are read here. */
const EVERYTHING: ReadonlySet<WorldFrameLayer> = new Set([
  "platforms",
  "hazards",
  "environment",
  "enemies",
  "projectiles",
  "player",
  "blade",
  "effects",
  "indicators",
]);

function framed() {
  const calls: string[] = [];
  const session = createProductionGhostReplayComposition({
    runSeed: scenarioRunSeed("replay-frame"),
    ...replayPresentation(calls, { hidden: () => EVERYTHING }),
  }).create(undefined);
  const visible = vi.spyOn(session.replay.effects, "setViewRect");
  const draw = (rectangle: Rectangle) => {
    const view = session.renderView?.();
    if (view === undefined) throw new Error("replay renders no view");
    calls.length = 0;
    view.draw(recordingCanvas(calls, undefined, { width: 5000, height: 2000 }).getContext(), rectangle);
    return { view, calls: [...calls], bounds: visible.mock.lastCall?.[0] as Bounds };
  };
  return { session, draw };
}

describe("a replay's frame", () => {
  it("fits the whole arena into a wider rectangle and fills the sides", () => {
    const { draw } = framed();
    const { calls, bounds } = draw({ x: 10, y: 20, w: 4800, h: 900 });
    expect(calls.filter((call) => call.startsWith("clip"))).toHaveLength(1);
    expect(calls).toContain("rect:10,20,4800,900");
    expect(calls).toContain("fillRect:10,20,4800,900");
    expect(bounds).toEqual({ left: -1600, top: 0, right: 3200, bottom: 900 });
  });

  it("keeps play's camera wherever the player is, and never crops the arena", () => {
    const { session, draw } = framed();
    const player = session.replay.world.state.player();
    if (player === undefined) throw new Error("replay has no player");
    for (const x of [80, 800, 1520]) {
      player.x = x;
      // The replay screen's world rectangle between its bars.
      const { view, bounds } = draw({ x: 0, y: 56, w: 1600, h: 728 });
      expect(view.camera).toEqual({ policy: "arena", x: 800, y: 450, scale: 1 });
      expect(bounds.top).toBeCloseTo(0);
      expect(bounds.bottom).toBeCloseTo(900);
      expect(bounds.left).toBeLessThanOrEqual(0);
      expect(bounds.right).toBeGreaterThanOrEqual(1600);
    }
  });

  it("shows more of the world when a scene zooms it out, as play does", () => {
    const { session, draw } = framed();
    session.replay.world.context.transient.feel.worldZoom = 0.8;
    expect(draw({ x: 0, y: 0, w: 1600, h: 900 }).bounds).toEqual({
      left: -200,
      top: -112.5,
      right: 1800,
      bottom: 1012.5,
    });
  });
});
