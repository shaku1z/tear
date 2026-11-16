import { describe, expect, it } from "vitest";
import {
  COACH_FADE_SECONDS,
  CoachQueue,
  coachMarkAlpha,
  inflate,
  intersection,
  placeCoachMark,
  type CoachMark,
  type CoachRect,
} from "../../src/presentation/coach/coach-marks";

const mark = (overrides: Partial<CoachMark> = {}): CoachMark => ({
  id: "a",
  channel: "lesson",
  tone: "prompt",
  text: "Swing faster to hit harder.",
  keys: [],
  priority: 1,
  seconds: 6,
  ...overrides,
});

/**
 * Logical screens for the shipped sizes: the 1600-wide layout grows taller on 4:3
 * (1024×768) and shorter on wide phones (844×390, 667×375).
 */
const VIEWPORTS = [
  { name: "1600x900", w: 1600, h: 900 },
  { name: "1280x720", w: 1600, h: 900 },
  { name: "1024x768", w: 1600, h: 1200 },
  { name: "844x390", w: 1600, h: 739 },
  { name: "667x375", w: 1600, h: 900 },
] as const;

describe("coach mark placement", () => {
  it("never covers the player, the HUD groups or the touch controls when a clear slot exists", () => {
    for (const viewport of VIEWPORTS) {
      const bounds: CoachRect = { x: 24, y: 24, w: viewport.w - 48, h: viewport.h - 48 };
      const hud: CoachRect[] = [
        { x: 24, y: 24, w: 360, h: 130 },
        { x: viewport.w / 2 - 170, y: 24, w: 340, h: 130 },
      ];
      const touch: CoachRect[] = [
        { x: viewport.w - 260, y: viewport.h - 220, w: 180, h: 180 },
        { x: 80, y: viewport.h - 260, w: 184, h: 184 },
        { x: viewport.w - 120, y: 40, w: 80, h: 80 },
      ];
      for (const px of [120, 400, viewport.w / 2, viewport.w - 300, viewport.w - 80])
        for (const py of [200, viewport.h / 2, viewport.h - 120]) {
          const player: CoachRect = { x: px - 24, y: py - 64, w: 48, h: 128 };
          const avoid = [...hud, ...touch, player];
          const placed = placeCoachMark({
            size: { w: 420, h: 96 },
            anchor: { x: px, y: py - 64 },
            bounds,
            avoid,
            gap: 16,
          });
          expect(placed.overlap, `${viewport.name} at ${String(px)},${String(py)}`).toBe(0);
          for (const rect of avoid) expect(intersection(placed, rect)).toBe(0);
          expect(placed.x).toBeGreaterThanOrEqual(bounds.x);
          expect(placed.y).toBeGreaterThanOrEqual(bounds.y);
          expect(placed.x + placed.w).toBeLessThanOrEqual(bounds.x + bounds.w);
          expect(placed.y + placed.h).toBeLessThanOrEqual(bounds.y + bounds.h);
        }
    }
  });

  it("prefers the slot above the anchor and keeps the gap", () => {
    const placed = placeCoachMark({
      size: { w: 200, h: 60 },
      anchor: { x: 800, y: 500 },
      bounds: { x: 0, y: 0, w: 1600, h: 900 },
      avoid: [{ x: 780, y: 500, w: 40, h: 100 }],
      gap: 16,
    });
    expect(placed).toMatchObject({ x: 700, y: 424, overlap: 0 });
  });

  it("stacks a second mark clear of the first", () => {
    const input = {
      size: { w: 300, h: 60 },
      anchor: { x: 800, y: 600 },
      bounds: { x: 0, y: 0, w: 1600, h: 900 },
      gap: 16,
    };
    const first = placeCoachMark({ ...input, avoid: [] });
    const second = placeCoachMark({ ...input, avoid: [first] });
    expect(intersection(second, inflate(first, 7))).toBe(0);
  });

  it("returns the least-covered slot inside the bounds when nothing is clear", () => {
    const bounds = { x: 0, y: 0, w: 400, h: 200 };
    const placed = placeCoachMark({
      size: { w: 300, h: 100 },
      anchor: { x: 200, y: 100 },
      bounds,
      avoid: [bounds],
      gap: 8,
    });
    expect(placed.overlap).toBeGreaterThan(0);
    expect(placed.x).toBeGreaterThanOrEqual(0);
    expect(placed.x + placed.w).toBeLessThanOrEqual(400);
  });
});

describe("coach mark timing", () => {
  it("fades in and out, and is instant under reduced motion", () => {
    expect(coachMarkAlpha(0, 6, false)).toBe(0);
    expect(coachMarkAlpha(COACH_FADE_SECONDS, 6, false)).toBe(1);
    expect(coachMarkAlpha(6 - COACH_FADE_SECONDS / 2, 6, false)).toBeCloseTo(0.5);
    expect(coachMarkAlpha(6, 6, false)).toBe(0);
    expect(coachMarkAlpha(0, 6, true)).toBe(1);
    expect(coachMarkAlpha(5.99, 6, true)).toBe(1);
    expect(coachMarkAlpha(100, Infinity, false)).toBe(1);
  });
});

describe("coach queue", () => {
  it("shows one mark per channel and lets a stronger offer replace a weaker one", () => {
    const queue = new CoachQueue();
    queue.offer(mark({ id: "prompt", priority: 1 }));
    queue.offer(mark({ id: "help", channel: "help", priority: 0 }));
    queue.offer(mark({ id: "stuck", priority: 2 }));
    expect(
      queue
        .visible()
        .map((entry) => entry.mark.id)
        .sort(),
    ).toEqual(["help", "stuck"]);
  });

  it("holds a weaker offer until the stronger mark expires", () => {
    const queue = new CoachQueue();
    queue.offer(mark({ id: "strong", priority: 2, seconds: 1 }));
    queue.offer(mark({ id: "weak", priority: 1 }));
    expect(queue.has("weak")).toBe(false);
    queue.step(1);
    expect(queue.has("strong")).toBe(false);
    expect(queue.has("weak")).toBe(true);
  });

  it("refreshes a re-offered mark without restarting its clock", () => {
    const queue = new CoachQueue();
    queue.offer(mark({ id: "a", text: "one" }));
    queue.step(2);
    queue.offer(mark({ id: "a", text: "two" }));
    expect(queue.visible()[0]).toMatchObject({ age: 2, mark: { text: "two" } });
  });

  it("dismisses, clears and never repeats a once mark", () => {
    const queue = new CoachQueue();
    queue.offer(mark({ id: "intro" }), { once: true });
    queue.dismiss("intro");
    queue.offer(mark({ id: "intro" }), { once: true });
    expect(queue.visible()).toHaveLength(0);
    queue.offer(mark({ id: "x" }));
    queue.offer(mark({ id: "y", channel: "help" }));
    queue.clear("lesson");
    expect(queue.visible().map((entry) => entry.mark.id)).toEqual(["y"]);
    queue.clear();
    expect(queue.visible()).toHaveLength(0);
  });
});
