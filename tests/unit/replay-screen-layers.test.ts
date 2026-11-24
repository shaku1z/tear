/**
 * Every layer play draws against the view declares who it is for and where it is drawn
 * (src/app/world/overlay-audience.ts), and a replay draws the ones it keeps to its own rectangle. The owner saw
 * the red low-health screen in a replay, squeezed into the arena's box in the middle of the window: the replay
 * drew its overlay against the arena, not against the rectangle it is shown in.
 */
import { describe, expect, it } from "vitest";

import { OVERLAY_LAYERS, shownTo, type OverlayLayer } from "../../src/app/world/overlay-audience";
import type { WorldFrameLayer } from "../../src/app/world/world-presentation-adapters";
import { createProductionGhostReplayComposition } from "../../src/app/world/detached/replay-composition";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";
import { recordingCanvas, replayPresentation, type RecordedPoint } from "../support/replay-presentation";

type Rectangle = Readonly<{ x: number; y: number; w: number; h: number }>;

/** Every world layer of a replay frame, so what is left is what play draws over the world. */
const WORLD_LAYERS: ReadonlySet<WorldFrameLayer> = new Set([
  "backdrop",
  "platforms",
  "hazards",
  "environment",
  "enemies",
  "projectiles",
  "player",
  "blade",
  "effects",
]);

/**
 * A replay of a fresh run drawn into `rectangle` on a canvas of `size`; the points its overlay reached. With
 * `hidden`, the frame leaves out those world layers instead of all of them.
 */
function overlayPoints(
  rectangle: Rectangle,
  size: Readonly<{ width: number; height: number }>,
  prepare?: (session: ReturnType<ReturnType<typeof createProductionGhostReplayComposition>["create"]>) => void,
  hidden: ReadonlySet<WorldFrameLayer> = WORLD_LAYERS,
) {
  const calls: string[] = [],
    points: RecordedPoint[] = [];
  const session = createProductionGhostReplayComposition({
    runSeed: scenarioRunSeed("replay-screen-layers"),
    ...replayPresentation(calls, { hidden: () => hidden }),
  }).create(undefined);
  prepare?.(session);
  const view = session.renderView?.();
  if (view === undefined) throw new Error("replay renders no view");
  view.draw(recordingCanvas(calls, points, size).getContext(), rectangle);
  // The frame's first path is its clip, the rectangle itself.
  const [clipStart, clipEnd, ...overlay] = points;
  expect([clipStart, clipEnd]).toEqual([
    { call: "rect", x: rectangle.x, y: rectangle.y },
    { call: "rect", x: rectangle.x + rectangle.w, y: rectangle.y + rectangle.h },
  ]);
  return overlay;
}

const inside = (point: RecordedPoint, rectangle: Rectangle) =>
  point.x >= rectangle.x - 0.5 &&
  point.x <= rectangle.x + rectangle.w + 0.5 &&
  point.y >= rectangle.y - 0.5 &&
  point.y <= rectangle.y + rectangle.h + 0.5;

describe("screen layers in a replay", () => {
  it("declares who every layer is for and where it is drawn", () => {
    for (const [layer, rule] of Object.entries(OVERLAY_LAYERS)) {
      expect(["everyone", "player"], layer).toContain(rule.audience);
      expect(["world", "screen"], layer).toContain(rule.framing);
      expect(shownTo(layer as OverlayLayer, "watcher"), layer).toBe(rule.audience === "everyone");
    }
    // The owner's case and the lead's list: the player's alarms, flashes and shake stay out of a replay.
    for (const layer of ["lowHealthScreen", "parryFlash", "screenShake", "runOverlay", "coachMarks"] as const)
      expect(OVERLAY_LAYERS[layer]).toEqual({ audience: "player", framing: "screen" });
  });

  // A window wider than the arena: the fit leaves a margin left and right of the arena's box.
  const wide = { x: 150, y: 60, w: 2700, h: 900 };
  // A window taller than the arena: the margin is above and below.
  const tall = { x: 40, y: 20, w: 1600, h: 1500 };

  it("draws every kept layer inside the replay's rectangle, in a wide and a tall window", () => {
    for (const [rectangle, size] of [
      [wide, { width: 3000, height: 1100 }],
      [tall, { width: 1700, height: 1600 }],
    ] as const) {
      const points = overlayPoints(rectangle, size);
      expect(points.length).toBeGreaterThan(10);
      const outside = points.filter((point) => !inside(point, rectangle));
      expect(outside, `drawn outside ${JSON.stringify(rectangle)}`).toEqual([]);
    }
  });

  it("anchors the HUD to the replay's rectangle, not to the arena's box in its middle", () => {
    const across = overlayPoints(wide, { width: 3000, height: 1100 }).map((point) => point.x);
    // The arena's box spans 700 to 2300 here. The HUD's health bar sits in the rectangle's left corner, within
    // a tenth of its edge, and the run group (wave, score, time) on the rectangle's centre line.
    expect(Math.min(...across)).toBeLessThan(wide.x + wide.w * 0.1);
    expect(across).toContain(wide.x + wide.w / 2);
    const down = overlayPoints(tall, { width: 1700, height: 1600 }).map((point) => point.y);
    // The arena's box starts 300 below the rectangle's top; the HUD starts at the rectangle's top.
    expect(Math.min(...down)).toBeLessThan(tall.y + tall.h * 0.1);
  });

  it("lays the stage's vignette over the whole rectangle, not over the arena's box in its middle", () => {
    // The vignette is the one image the stage draws after the world; the backdrop is the only world layer drawn.
    const withBackdrop = new Set([...WORLD_LAYERS].filter((layer) => layer !== "backdrop"));
    for (const [rectangle, size] of [
      [wide, { width: 3000, height: 1100 }],
      [tall, { width: 1700, height: 1600 }],
    ] as const) {
      const images = overlayPoints(rectangle, size, undefined, withBackdrop).filter(
        (point) => point.call === "drawImage",
      );
      // A drawImage with a destination box records its two corners one after the other.
      const corners = images.map((point, index) => [point, images[index + 1]] as const);
      const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
      const covers = corners.some(
        ([start, end]) =>
          end !== undefined &&
          close(start.x, rectangle.x) &&
          close(start.y, rectangle.y) &&
          close(end.x, rectangle.x + rectangle.w) &&
          close(end.y, rectangle.y + rectangle.h),
      );
      expect(covers, `no image covers ${JSON.stringify(rectangle)}`).toBe(true);
    }
  });

  it("does not shake a replay: the camera's shake is the player's", () => {
    const still = overlayPoints(wide, { width: 3000, height: 1100 });
    const shaken = overlayPoints(wide, { width: 3000, height: 1100 }, (session) => {
      session.replay.world.context.transient.impact.shake = 40;
    });
    expect(shaken).toEqual(still);
  });
});
