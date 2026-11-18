import { describe, expect, it } from "vitest";
import { ROOTBOUND_MOVES } from "../../src/gameplay/entities/enemy-types/rootbound-moves";
import type { BossAttackPose } from "../../src/gameplay/entities/boss-attack-runner";
import {
  bossFigureProblems,
  drawBossFigure,
  movePoseLayer,
  type BossFigureFrame,
  type FigureCanvas,
} from "../../src/presentation/enemies/figures/boss-figure";
import {
  ROOTBOUND_FIGURE,
  ROOTBOUND_MOVE_POSES,
  ROOTBOUND_PHASE_POSES,
  ROOTBOUND_RENDERER_FLAGS,
  graftFlag,
  type RootboundFigureColor,
} from "../../src/presentation/enemies/figures/rootbound-figure";

/** A figure canvas that records the colour of every fill and stroke, in order. */
function recordingCanvas(): FigureCanvas & { fills: string[]; strokes: string[] } {
  const noop = () => undefined;
  const canvas = {
    fills: [] as string[],
    strokes: [] as string[],
    fillStyle: "" as FigureCanvas["fillStyle"],
    strokeStyle: "" as FigureCanvas["strokeStyle"],
    lineWidth: 1,
    lineJoin: "miter" as CanvasLineJoin,
    lineCap: "butt" as CanvasLineCap,
    globalAlpha: 1,
    fill: () => canvas.fills.push(typeof canvas.fillStyle === "string" ? canvas.fillStyle : "not a colour"),
    stroke: () => canvas.strokes.push(typeof canvas.strokeStyle === "string" ? canvas.strokeStyle : "not a colour"),
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    rect: noop,
  };
  return canvas;
}
function frame(overrides: Partial<BossFigureFrame<RootboundFigureColor>> = {}): BossFigureFrame<RootboundFigureColor> {
  return { layers: [], flags: new Set(), palette: "standard", flash: 0, facing: 1, ...overrides };
}

function drawn(overrides: Partial<BossFigureFrame<RootboundFigureColor>> = {}) {
  const canvas = recordingCanvas();
  drawBossFigure(canvas, ROOTBOUND_FIGURE, frame(overrides));
  return canvas;
}

const palette = ROOTBOUND_FIGURE.palettes.standard;

describe("boss figure layer", () => {
  it("has sound Rootbound data: parents, posed parts and every flag a part waits on exist", () => {
    expect(bossFigureProblems(ROOTBOUND_FIGURE, ROOTBOUND_RENDERER_FLAGS)).toEqual([]);
  });

  it("names a pose for every Rootbound move and every stage, and every named pose exists", () => {
    const stages = ["tell", "active", "recover", "punish"] as const;
    for (const attack of ROOTBOUND_MOVES.attacks)
      for (const stage of stages)
        expect(ROOTBOUND_MOVE_POSES[attack.id]?.[stage], `${attack.id} ${stage}`).toBeDefined();
    const named = [
      ...Object.values(ROOTBOUND_MOVE_POSES).flatMap((stagesOf) => Object.values(stagesOf)),
      ...Object.values(ROOTBOUND_PHASE_POSES),
    ];
    for (const pose of named) expect(ROOTBOUND_FIGURE.poses[pose], pose).toBeDefined();
  });

  it("finds a missing parent, an unknown posed part and a flag nothing sets", () => {
    const broken = {
      ...ROOTBOUND_FIGURE,
      parts: [
        ...ROOTBOUND_FIGURE.parts,
        { id: "stray", parent: "nowhere", shape: { kind: "group" }, when: "never" } as const,
      ],
      poses: { ...ROOTBOUND_FIGURE.poses, odd: { parts: { ghost: { rotate: 1 } } } },
    };
    expect(bossFigureProblems(broken, ROOTBOUND_RENDERER_FLAGS)).toEqual([
      "stray: no parent nowhere",
      "stray: nothing sets flag never",
      "pose odd: no part ghost",
    ]);
  });

  it("shows the gold heart only when a pose opens the pod", () => {
    expect(drawn().fills).not.toContain(palette.heart);
    const open = drawn({ layers: [{ pose: "split", weight: 1 }] }).fills;
    expect(open[0]).toBe(palette.heart);
  });

  it("shows the Graft marks and the Bastion shell only while those Grafts live", () => {
    const strokes = (flags: readonly string[]) => drawn({ flags: new Set(flags) }).strokes;
    expect(strokes([])).not.toContain(palette.shell);
    expect(strokes([])).not.toContain(palette.mark);
    expect(strokes([graftFlag("bastion")])).toContain(palette.shell);
    expect(strokes([graftFlag("haste")])).toContain(palette.mark);
    expect(strokes([graftFlag("haste")])).not.toContain(palette.shell);
    expect(strokes([])).not.toContain(palette.haste);
    expect(strokes([graftFlag("haste")])).toContain(palette.haste);
  });

  it("turns only the flash colours white on a hit", () => {
    const hit = drawn({ flash: 1 }).fills;
    expect(hit).not.toContain(palette.near);
    expect(hit).not.toContain(palette.far);
    expect(hit).toContain("rgb(255,255,255)");
    expect(hit).toContain(palette.eye);
    expect(hit).toContain(palette.leaf);
  });

  it("grows a wind-up in, holds the strike and lets the recovery go", () => {
    const pose = (stage: BossAttackPose["stage"], progress: number): BossAttackPose => ({
      attackId: "vine-lash",
      stage,
      progress,
      facing: 1,
      target: { x: 0, y: 0 },
      area: null,
    });
    expect(movePoseLayer(ROOTBOUND_MOVE_POSES, pose("tell", 0.25))).toEqual({ pose: "coil", weight: 0.25 });
    expect(movePoseLayer(ROOTBOUND_MOVE_POSES, pose("active", 0.5))).toEqual({ pose: "lunge", weight: 1 });
    expect(movePoseLayer(ROOTBOUND_MOVE_POSES, pose("recover", 0.75))).toEqual({ pose: "lunge", weight: 0.25 });
    expect(movePoseLayer(ROOTBOUND_MOVE_POSES, null)).toBeNull();
  });
});
