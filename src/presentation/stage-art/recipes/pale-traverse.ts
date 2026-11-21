/**
 * The Pale Traverse: a frozen lake under stepped mountain ranges at coral dusk,
 * a ruined marker settlement on the far shore and slow aurora overhead. The
 * owner's pick is board D of round 2 (docs/BACKGROUND_WORKFLOW.md).
 */
import type { SplinePoint } from "../paint-kit";
import type { StageArtRecipe, StageArtStroke } from "../stage-art-contract";

/** Every range and the far shore end here, where the ice begins. */
const SHORE = 640;
const WATER_TOP = 618;

/** One mountain range: its haze, crest row, relief, span, sharpness and named summit. */
const range = (
  seed: number,
  haze: number,
  crest: number,
  relief: number,
  span: number,
  sharp: number,
  summit: readonly [number, number, number],
): StageArtStroke => ({
  kind: "ridge",
  seed,
  ramp: "rock",
  haze,
  crest,
  base: SHORE,
  relief,
  span,
  sharp,
  peaks: [summit],
});

const curtain = (seed: number, alpha: number, rays: number, path: readonly SplinePoint[]): StageArtStroke => ({
  kind: "ribbon",
  seed,
  ramp: "aurora",
  alpha,
  rays,
  path,
});

export const PALE_TRAVERSE_ART: StageArtRecipe = {
  stageId: "pale-traverse",
  seed: 5404,
  light: { x: 1180, y: 520, reach: 1250, core: "#fff3ea", glow: "#f3b6b4" },
  atmosphere: { haze: "#d9dbf0", warmth: 0.55 },
  camera: { playerShift: 48, zoomMin: 1, zoomMax: 1.2, shake: 24 },
  ramps: {
    snow: ["#8fa1c6", "#b1bfdc", "#d2dcee", "#ecf1f9", "#ffffff"],
    rock: ["#7584b2", "#97a6cc", "#bcc7e2", "#e0e7f5", "#fcfdff"],
    fir: ["#52698f", "#6781a6", "#8399b9", "#a9bad1"],
    ice: ["#eef3fb", "#d3dff2", "#bccdea"],
    aurora: ["#7fecc8", "#98e8dc", "#f2a5bf", "#f9cddb"],
    stone: ["#7f8ab0", "#a4adca", "#c8cee1", "#e7eaf4"],
  },
  edge: "#c4cde8",
  layers: [
    {
      id: "far",
      depth: 0.8,
      plane: "back",
      scale: 0.5,
      strokes: [
        { kind: "sky", top: "#93a6d8", middle: "#cdc5e7", bottom: "#f7d6d2" },
        { kind: "glow", radius: 480, alpha: 0.3 },
        range(41, 0.7, 520, 36, 560, 0.8, [520, 460, 170]),
        { kind: "haze", top: 440, bottom: 620, alpha: 0.3 },
        range(42, 0.45, 560, 30, 400, 0.7, [150, 480, 300]),
        { kind: "haze", top: 500, bottom: 630, alpha: 0.28 },
        range(43, 0.22, 610, 14, 300, 0.45, [-130, 400, 330]),
      ],
    },
    {
      id: "middle",
      depth: 0.93,
      plane: "back",
      scale: 0.8,
      strokes: [
        {
          kind: "ridge",
          seed: 44,
          ramp: "fir",
          haze: 0.4,
          crest: 600,
          base: WATER_TOP + 8,
          relief: 8,
          span: 240,
          sharp: 0.2,
          teeth: { spacing: 13, height: 32 },
          peaks: [
            [-120, 380, 150],
            [1720, 420, 230],
          ],
        },
        {
          kind: "arcade",
          seed: 45,
          x: 330,
          y: WATER_TOP + 6,
          bays: 4,
          bayWidth: 58,
          height: 62,
          levels: 1,
          ramp: "stone",
          mossRamp: "snow",
          haze: 0.5,
          ruin: 0.5,
          columns: 0.5,
          reveal: 0.25,
          ivy: 0.3,
        },
        { kind: "water", seed: 46, top: WATER_TOP, ramp: "ice", reflection: 0.62, ripples: 0.5 },
      ],
    },
    {
      id: "frame",
      depth: 1.05,
      plane: "back",
      scale: 0.7,
      strokes: [
        {
          kind: "mass",
          seed: 71,
          ramp: "snow",
          haze: 0,
          size: 9,
          density: 70,
          lightBias: 0.25,
          shape: {
            blobs: [
              [-70, 790, 250, 70],
              [1670, 790, 250, 70],
            ],
            rough: 0.3,
            lobes: 4,
          },
        },
      ],
    },
  ],
  live: [
    {
      kind: "part",
      layer: "far",
      id: "aurora",
      area: [-100, -120, 1800, 560],
      scale: 0.4,
      strokes: [
        curtain(47, 0.55, 64, [
          [60, 250, 190],
          [420, 300, 240],
          [800, 200, 260],
          [1180, 250, 230],
          [1560, 150, 210],
        ]),
        curtain(48, 0.26, 36, [
          [500, 400, 110],
          [900, 370, 130],
          [1400, 400, 110],
        ]),
      ],
      sway: { pivot: "bottom", slices: 24, reach: 6, period: 17, travel: 1.2 },
      breathe: { low: 0.7, period: 13 },
    },
    {
      kind: "motes",
      layer: "middle",
      seed: 49,
      area: [0, 120, 1600, 300],
      count: 40,
      size: [0.9, 2],
      color: "#ffffff",
      alpha: 0.42,
      drift: [-5, 9],
      wobble: 8,
      period: 7,
    },
  ],
};
