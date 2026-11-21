import { describe, expect, it } from "vitest";
import {
  COACH_FADE_SECONDS,
  COACH_PLATE_MIN_CONTRAST,
  CoachQueue,
  coachMarkAlpha,
  coachPlateContrast,
  inflate,
  intersection,
  placeCoachMark,
  type CoachMark,
  type CoachRect,
} from "../../src/presentation/coach/coach-marks";
import { CONFIG } from "../../src/config/game-config";
import { PLAYGROUND_STAGES } from "../../src/gameplay/stages";
import { createTrainingCoachPresentation } from "../../src/app/world/training-coach-presentation";

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

describe("plated call-outs on every Playground palette", () => {
  it("covers the six Playground palettes", () => {
    expect(PLAYGROUND_STAGES.length).toBeGreaterThanOrEqual(6);
  });

  for (const stage of PLAYGROUND_STAGES) {
    it(`${stage.name}: the call-out ink meets the contrast rule over the sky, platforms and accent`, () => {
      // White bounds every lightened sky stop from above; the stage's own colours are what sits behind.
      for (const sky of [stage.bg, stage.plat, stage.accent, "#ffffff"])
        expect(coachPlateContrast(sky), sky).toBeGreaterThanOrEqual(COACH_PLATE_MIN_CONTRAST);
    });

    it(`${stage.name}: a call-out, named or not, covers no enemy, the player or the blade`, () => {
      const groundY = CONFIG.world.groundY,
        reach = CONFIG.blade.aimRadius + CONFIG.blade.length;
      const player = {
        x: CONFIG.view.w / 2,
        y: groundY - CONFIG.player.h / 2,
        hw: CONFIG.player.w / 2,
        hh: CONFIG.player.h / 2,
      };
      const box = (x: number, surface: number) => ({ x, y: surface - 18, hw: 18, hh: 18 });
      // An enemy on every platform of the stage and on the ground on both sides of the player.
      const enemies = [
        ...stage.layout.map((platform) => box(platform.x + platform.w / 2, platform.y)),
        ...[-420, -200, -60, 60, 200, 420].map((offset) => box(player.x + offset, groundY)),
      ];
      const camera = { cx: CONFIG.view.w / 2, cy: CONFIG.view.h / 2, ox: 0, oy: 0, scale: 1 };
      const bounds: CoachRect = { x: 24, y: 24, w: CONFIG.view.w - 48, h: CONFIG.view.h - 70 };
      const screen = (b: { x: number; y: number; hw: number; hh: number }): CoachRect => ({
        x: b.x - b.hw,
        y: b.y - b.hh,
        w: b.hw * 2,
        h: b.hh * 2,
      });
      const body = screen(player),
        blade = { x: body.x - reach, y: body.y - reach, w: body.w + reach * 2, h: body.h + reach };
      // Each enemy named in turn, then a call-out that names nothing (HEALED, at the player).
      for (const target of [...enemies, undefined]) {
        const { marks, avoid } = createTrainingCoachPresentation().frame({
          mode: "playground",
          run: {},
          deltaSeconds: 1 / 60,
          reducedMotion: true,
          inputMode: "mouse",
          padLabel: (binding) => binding,
          camera,
          player,
          enemies,
          bladeReach: reach,
          lessonCard: undefined,
          touchLayout: undefined,
          callouts: [target ? { text: "CHARGER", tone: "info", target } : { text: "HEALED", tone: "info" }],
        });
        const mark = marks.find((entry) => entry.mark.channel === "callout")?.mark;
        expect(mark?.backing).toBe("plate");
        const rect = placeCoachMark({
          size: { w: 150, h: 34 },
          anchor: mark?.anchor ?? { x: 800, y: 100 },
          bounds,
          avoid,
          gap: 16,
          ...(mark?.target ? { target: mark.target } : {}),
        });
        const where = target ? `naming the enemy at ${String(target.x)},${String(target.y)}` : "naming nothing";
        for (const enemy of enemies) expect(intersection(rect, screen(enemy)), where).toBe(0);
        expect(intersection(rect, body), where).toBe(0);
        expect(intersection(rect, blade), where).toBe(0);
      }
    });
  }

  it("tries beside the named enemy before above it", () => {
    const target = { x: 700, y: 400, w: 36, h: 36 };
    const rect = placeCoachMark({
      size: { w: 150, h: 34 },
      anchor: { x: 718, y: 400 },
      bounds: { x: 0, y: 0, w: 1600, h: 900 },
      avoid: [],
      gap: 16,
      target,
    });
    expect(rect).toMatchObject({ x: 752, y: 401, overlap: 0 });
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

  it("starts a re-offered mark again, with its new content, when it names a new occasion", () => {
    const queue = new CoachQueue();
    queue.offer(mark({ id: "a", text: "Grounds", occasion: "1" }));
    queue.step(5);
    queue.offer(mark({ id: "a", text: "Voidspire", occasion: "2" }));
    expect(queue.visible()).toHaveLength(1);
    expect(queue.visible()[0]).toMatchObject({ age: 0, mark: { text: "Voidspire" } });
  });

  it("keeps the clock for a re-offer on the same occasion or with none", () => {
    const queue = new CoachQueue();
    queue.offer(mark({ id: "a", occasion: "1" }));
    queue.step(2);
    queue.offer(mark({ id: "a", text: "same", occasion: "1" }));
    expect(queue.visible()[0]).toMatchObject({ age: 2, mark: { text: "same" } });
    queue.step(1);
    queue.offer(mark({ id: "a", text: "none" }));
    expect(queue.visible()[0]).toMatchObject({ age: 3, mark: { text: "none" } });
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
