// A biome's look for boss tells (src/presentation/enemies/renderers/boss-tell-skin.ts): the table is
// data on the stage's presentation definition, and a skin never draws outside the tell's own area.
import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { clamp, len, lerp } from "../../src/domain/geometry";
import type { BossTell, BossTellMark, BossTellStage } from "../../src/gameplay/entities/boss-tells";
import { STAGE_IDS } from "../../src/gameplay/stages";
import { createEnemyPresentation } from "../../src/presentation/enemies/enemy-presentation";
import { drawBossTells } from "../../src/presentation/enemies/renderers/boss-tell-renderer";
import {
  bossTellSkinProblems,
  createBossTellSkin,
  type BossTellSkinTable,
} from "../../src/presentation/enemies/renderers/boss-tell-skin";
import { createEnemyRendererRuntime } from "../../src/presentation/enemies/renderers/enemy-renderer-runtime";
import type { EnemyPresentationDependencies } from "../../src/presentation/enemies/renderers/enemy-renderer-types";
import { stagePresentationDefinition } from "../../src/presentation/stage-presentation-definitions";
import { createEnemyHarness } from "./enemy-test-harness";

type Call = Readonly<{ name: string; args: readonly number[] }>;

function recordingCanvas(calls: Call[]): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      return (...args: number[]): void => {
        calls.push({ name: String(property), args });
      };
    },
    set(_target, property, value): boolean {
      values.set(property, value);
      return true;
    },
  });
}

function tell(mark: BossTellMark, stage: BossTellStage, remainingSeconds = 0.25): BossTell {
  return {
    id: mark,
    attackId: mark,
    mark,
    stage,
    x: 800,
    y: 700,
    hw: mark === "reticle" ? 150 : 130,
    hh: mark === "reticle" ? 150 : 46,
    dir: -1,
    leadSeconds: 0.5,
    remainingSeconds: stage === "warning" ? remainingSeconds : 0,
    damaging: stage !== "exposed",
  };
}

const dependencies = (highContrast: boolean): EnemyPresentationDependencies => ({
  A11Y: { highContrast, reducedMotion: false },
  CLOCK: { sim: 2 },
  policy: CONFIG,
  GFX: { low: false },
  THEME: { dark: false, ink: "#171219", rim: "#fff" },
  UI: { font: (size) => `${String(size)}px sans-serif`, tag: () => undefined, t: { type: { caption: 13 } } },
  clamp,
  len,
  lerp,
});

const table: BossTellSkinTable = {
  body: "#101010",
  marks: {
    lane: { shape: "risers", spacing: 40, width: 26, lean: 0.3, start: 0.3, spurs: true },
    reticle: { shape: "ring", count: 16, length: 30 },
  },
};

/** Every x and y a path call was given: the points and the control points. */
function points(calls: readonly Call[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const call of calls) {
    if (!["moveTo", "lineTo", "quadraticCurveTo"].includes(call.name)) continue;
    for (let index = 0; index + 1 < call.args.length; index += 2)
      out.push({ x: call.args[index] ?? 0, y: call.args[index + 1] ?? 0 });
  }
  return out;
}

describe("stage tables", () => {
  it("every stage's table for boss tells is sound", () => {
    const withTable = STAGE_IDS.filter((id) => stagePresentationDefinition(id)?.bossTellSkin !== undefined);
    expect(withTable).toContain("verdant-sanctum");
    for (const id of withTable) {
      const skin = stagePresentationDefinition(id)?.bossTellSkin;
      if (skin === undefined) throw new Error("no table");
      expect(bossTellSkinProblems(skin), id).toEqual([]);
    }
  });

  it("names what is wrong with a table", () => {
    expect(
      bossTellSkinProblems({
        body: "green",
        marks: {
          lane: { shape: "risers", spacing: 10, width: 60, lean: 0.9, start: 0.8, spurs: false },
          reticle: { shape: "ring", count: 3, length: 4 },
        },
      }),
    ).toEqual([
      expect.stringMatching(/body green/u),
      expect.stringMatching(/lane: spacing 10/u),
      expect.stringMatching(/lane: width 60/u),
      expect.stringMatching(/lane: lean 0\.9/u),
      expect.stringMatching(/lane: start 0\.8/u),
      expect.stringMatching(/reticle: count 3/u),
      expect.stringMatching(/reticle: length 4/u),
    ]);
  });
});

describe("a skin built from a table", () => {
  const skin = createBossTellSkin(table);
  const state = { progress: 0.5, color: "#ffd24a", highContrast: false };

  it("draws no plate: no filled or stroked rectangle", () => {
    for (const stage of ["warning", "active"] as const) {
      const calls: Call[] = [];
      expect(skin(recordingCanvas(calls), tell("lane", stage), state)).toBe(true);
      expect(calls.map((call) => call.name)).not.toEqual(expect.arrayContaining(["fillRect"]));
      expect(calls.map((call) => call.name)).not.toEqual(expect.arrayContaining(["strokeRect"]));
      expect(calls.filter((call) => call.name === "fill").length).toBe(2);
    }
  });

  it("keeps every growth inside the tell's area, at any point of the warning", () => {
    for (const progress of [0, 0.3, 1]) {
      const calls: Call[] = [];
      const lane = tell("lane", "warning");
      skin(recordingCanvas(calls), lane, { ...state, progress });
      for (const point of points(calls)) {
        expect(point.x).toBeGreaterThanOrEqual(lane.x - lane.hw);
        expect(point.x).toBeLessThanOrEqual(lane.x + lane.hw);
        expect(point.y).toBeGreaterThanOrEqual(lane.y - lane.hh);
        // The floor line may dip three pixels under the area.
        expect(point.y).toBeLessThanOrEqual(lane.y + lane.hh + 3);
      }
    }
  });

  it("shows the whole area from the first frame and reaches its top at the strike", () => {
    const top = (progress: number, stage: BossTellStage): number => {
      const calls: Call[] = [];
      skin(recordingCanvas(calls), tell("lane", stage), { ...state, progress });
      // Skip the frame (the first path): only the growths.
      const growths = calls.slice(calls.findIndex((call) => call.name === "stroke") + 2);
      return Math.min(...points(growths).map((point) => point.y));
    };
    const lane = tell("lane", "warning");
    const frameCalls: Call[] = [];
    skin(recordingCanvas(frameCalls), lane, { ...state, progress: 0 });
    const frame = points(
      frameCalls.slice(
        0,
        frameCalls.findIndex((call) => call.name === "stroke"),
      ),
    );
    expect(Math.min(...frame.map((point) => point.y))).toBe(lane.y - lane.hh);
    expect(Math.min(...frame.map((point) => point.x))).toBe(lane.x - lane.hw);
    expect(Math.max(...frame.map((point) => point.x))).toBe(lane.x + lane.hw);
    expect(top(0, "warning")).toBeGreaterThan(top(0.5, "warning"));
    expect(top(1, "warning")).toBeCloseTo(lane.y - lane.hh, 6);
    expect(top(0, "active")).toBeCloseTo(lane.y - lane.hh, 6);
  });

  it("rings a round area at its real radius", () => {
    const calls: Call[] = [];
    const round = tell("reticle", "warning");
    expect(skin(recordingCanvas(calls), round, state)).toBe(true);
    expect(calls.find((call) => call.name === "arc")?.args.slice(0, 3)).toEqual([round.x, round.y, 150]);
    for (const point of points(calls)) {
      const distance = Math.hypot(point.x - round.x, point.y - round.y);
      expect(distance).toBeGreaterThanOrEqual(150 - 1e-6);
      expect(distance).toBeLessThanOrEqual(150 + 30 + 1e-6);
    }
  });

  it("leaves the exposed mark, unlisted marks and high contrast to the shared marks", () => {
    const calls: Call[] = [];
    const canvas = recordingCanvas(calls);
    expect(skin(canvas, tell("self", "exposed"), state)).toBe(false);
    expect(skin(canvas, tell("lane", "exposed"), state)).toBe(false);
    expect(skin(canvas, tell("column", "warning"), state)).toBe(false);
    expect(skin(canvas, tell("lane", "warning"), { ...state, highContrast: true })).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("the shared tell renderer", () => {
  it("draws Verdant's tells from the stage's table once the presentation is installed", () => {
    const draw = (stageId: string, highContrast: boolean): string[] => {
      createEnemyPresentation(dependencies(highContrast)).install(createEnemyHarness().types);
      const calls: Call[] = [];
      const runtime = createEnemyRendererRuntime(dependencies(highContrast));
      const tells = (["lane", "box", "column", "band", "reticle"] as const).map((mark) => tell(mark, "warning"));
      drawBossTells(runtime, recordingCanvas(calls), tells, { skinId: stageId });
      return calls.map((call) => call.name);
    };
    expect(draw("verdant-sanctum", false)).not.toEqual(expect.arrayContaining(["fillRect"]));
    expect(draw("verdant-sanctum", false)).not.toEqual(expect.arrayContaining(["strokeRect"]));
    // A stage with no table, and high contrast on any stage, keep the shared marks.
    expect(draw("pale-traverse", false)).toEqual(expect.arrayContaining(["fillRect", "strokeRect"]));
    expect(draw("verdant-sanctum", true)).toEqual(expect.arrayContaining(["fillRect"]));
  });
});
