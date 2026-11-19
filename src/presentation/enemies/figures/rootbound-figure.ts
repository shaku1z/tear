import { GRAFT_ANCHOR_TYPES, type GraftAnchorType } from "../../../gameplay/environment/graft-anchor";
import type { BossFigureDefinition, FigureMovePoses, FigurePathCommand, FigurePoint } from "./boss-figure";

/** The flag a living Graft of `type` sets on the figure. */
export function graftFlag(type: GraftAnchorType): string {
  return `graft:${type}`;
}
/** Set late in the death beat: a seedling stands where the keeper fell. */
export const ROOTBOUND_SEEDLING_FLAG = "seedling";
/** Every flag the renderer sets from the keeper's state, beside the ones its poses set. */
export const ROOTBOUND_RENDERER_FLAGS: readonly string[] = [
  ...GRAFT_ANCHOR_TYPES.map(graftFlag),
  ROOTBOUND_SEEDLING_FLAG,
];

/**
 * The Rootbound as a seed pod: one shape split by a gold seam. The seam is where it opens, so every opening (exposed,
 * a burst, the cracked third phase, death) shows the gold heart. One short sprout on top; marks on the far half show
 * which Grafts are feeding it. Feet at the origin, facing +x.
 */
export type RootboundFigureColor =
  "ink" | "near" | "far" | "seam" | "heart" | "eye" | "stem" | "leaf" | "shell" | "mark" | "haste";

/** One half of the pod; `side` -1 is the far half, 1 the near half. `closed` adds the seam edge. */
function podHalf(side: number, closed: boolean): readonly FigurePathCommand[] {
  return [
    ["M", 0, -152],
    ["C", side * 42, -132, side * 60, -84, side * 56, -44],
    ["C", side * 52, -12, side * 30, 0, 0, 0],
    ...(closed ? ([["Z"]] as const) : []),
  ];
}

const POD_EDGE = 4;
const PLANT_EDGE = 1.5;
const MARK_EDGE = 2.5;
const SHELL_EDGE = 14;
const SPROUT_BASE: FigurePoint = [0, -150];
const SPROUT_TIP: FigurePoint = [4, -174];
const SEEDLING_TIP: FigurePoint = [2, -28];

const HASTE_STREAK = { from: -74, to: -122, width: 4, heights: [-120, -76, -32] } as const;

export const ROOTBOUND_FIGURE: BossFigureDefinition<RootboundFigureColor> = {
  parts: [
    // A Haste Graft trails speed streaks behind the pod: it pauses less between moves.
    ...HASTE_STREAK.heights.map((y) => ({
      id: `haste-streak-${String(-y)}`,
      shape: { kind: "stroke" as const, from: [HASTE_STREAK.from, y] as const, to: [HASTE_STREAK.to, y] as const },
      line: { color: "haste" as const, width: HASTE_STREAK.width },
      when: graftFlag("haste"),
    })),
    {
      id: "heart",
      pivot: [0, -76],
      shape: { kind: "disc", center: [0, -76], radius: 21 },
      fill: "heart",
      line: { color: "ink", width: POD_EDGE },
      when: "open",
    },
    // A Bastion Graft wraps the pod in a stone shell, drawn as a wide rim behind each half.
    {
      id: "far-shell",
      parent: "far",
      shape: { kind: "path", commands: podHalf(-1, false) },
      line: { color: "shell", width: SHELL_EDGE },
      when: graftFlag("bastion"),
    },
    {
      id: "near-shell",
      parent: "near",
      shape: { kind: "path", commands: podHalf(1, false) },
      line: { color: "shell", width: SHELL_EDGE },
      when: graftFlag("bastion"),
    },
    {
      id: "far",
      pivot: [0, 0],
      shape: { kind: "path", commands: podHalf(-1, true) },
      fill: "far",
      line: { color: "ink", width: POD_EDGE },
    },
    {
      id: "near",
      pivot: [0, 0],
      shape: { kind: "path", commands: podHalf(1, true) },
      fill: "near",
      line: { color: "ink", width: POD_EDGE },
    },
    {
      id: "seam",
      shape: { kind: "stroke", from: [0, -146], to: [0, -6] },
      line: { color: "seam", width: 3 },
      unless: "split",
    },
    // Each living Graft shows its own mark on the far half, the same mark its stage object carries.
    {
      id: "mark-bastion",
      parent: "far",
      shape: { kind: "rect", at: [-40, -118], size: [12, 12] },
      line: { color: "mark", width: MARK_EDGE },
      when: graftFlag("bastion"),
    },
    {
      id: "mark-haste",
      parent: "far",
      shape: {
        kind: "path",
        commands: [
          ["M", -36, -94],
          ["L", -29, -86],
          ["L", -36, -82],
          ["L", -29, -74],
        ],
      },
      line: { color: "mark", width: MARK_EDGE },
      when: graftFlag("haste"),
    },
    {
      id: "mark-mercy",
      parent: "far",
      shape: { kind: "disc", center: [-33, -50], radius: 6 },
      line: { color: "mark", width: MARK_EDGE },
      when: graftFlag("mercy"),
    },
    {
      id: "eye",
      parent: "near",
      shape: { kind: "rect", at: [14, -104], size: [22, 11] },
      fill: "eye",
      unless: "eye-closed",
    },
    {
      id: "eye-shut",
      parent: "near",
      shape: { kind: "rect", at: [14, -100], size: [22, 3] },
      fill: "eye",
      when: "eye-closed",
    },
    { id: "sprout", parent: "near", pivot: SPROUT_BASE, shape: { kind: "group" } },
    {
      id: "sprout-stem",
      parent: "sprout",
      shape: { kind: "stem", from: SPROUT_BASE, control: [1, -164], to: SPROUT_TIP, width: [4, 2.4] },
      fill: "stem",
      line: { color: "ink", width: PLANT_EDGE },
    },
    {
      id: "sprout-leaf-back",
      parent: "sprout",
      shape: { kind: "leaf", at: SPROUT_TIP, angle: -2.4, length: 17, width: 6 },
      fill: "leaf",
      line: { color: "ink", width: PLANT_EDGE },
    },
    {
      id: "sprout-leaf-front",
      parent: "sprout",
      shape: { kind: "leaf", at: SPROUT_TIP, angle: -0.7, length: 17, width: 6 },
      fill: "leaf",
      line: { color: "ink", width: PLANT_EDGE },
    },
    {
      id: "sprout-bud",
      parent: "sprout",
      shape: { kind: "disc", center: [4, -180], radius: 5 },
      fill: "seam",
      line: { color: "ink", width: PLANT_EDGE },
      when: "bud",
    },
    // Where it falls, a seedling: nothing here dies.
    {
      id: "seedling-stem",
      shape: { kind: "stem", from: [0, 0], control: [-1, -14], to: SEEDLING_TIP, width: [3.5, 1.8] },
      fill: "stem",
      line: { color: "ink", width: PLANT_EDGE },
      when: ROOTBOUND_SEEDLING_FLAG,
    },
    {
      id: "seedling-leaf-back",
      shape: { kind: "leaf", at: SEEDLING_TIP, angle: -2.5, length: 15, width: 5 },
      fill: "leaf",
      line: { color: "ink", width: PLANT_EDGE },
      when: ROOTBOUND_SEEDLING_FLAG,
    },
    {
      id: "seedling-leaf-front",
      shape: { kind: "leaf", at: SEEDLING_TIP, angle: -0.6, length: 15, width: 5 },
      fill: "leaf",
      line: { color: "ink", width: PLANT_EDGE },
      when: ROOTBOUND_SEEDLING_FLAG,
    },
  ],
  poses: {
    "phase-2": { parts: { sprout: { scaleX: 1.25, scaleY: 1.25 } } },
    // Phase III: the pod has cracked along its seam and the heart shows; the sprout carries a bud.
    "phase-3": {
      parts: { far: { rotate: -0.05 }, near: { rotate: 0.05 }, sprout: { scaleX: 1.3, scaleY: 1.3 } },
      flags: ["open", "split", "bud"],
    },
    split: {
      figure: { scaleY: 0.94 },
      parts: { far: { dx: -6, rotate: -0.24 }, near: { dx: 6, rotate: 0.24 }, sprout: { rotate: 1 } },
      flags: ["open", "split", "eye-closed"],
    },
    coil: { figure: { rotate: -0.1, scaleX: 0.96, scaleY: 1.04 }, parts: { sprout: { rotate: -0.5 } } },
    lunge: { figure: { rotate: 0.12, scaleX: 1.06, scaleY: 0.96 }, parts: { sprout: { rotate: 0.4 } } },
    sink: { figure: { dy: 24, scaleX: 1.12, scaleY: 0.72 } },
    crouch: { figure: { scaleX: 1.1, scaleY: 0.82 } },
    stretch: { figure: { scaleX: 0.92, scaleY: 1.12 } },
    swell: { figure: { scaleX: 1.08, scaleY: 1.08 } },
    burst: { parts: { far: { rotate: -0.14 }, near: { rotate: 0.14 } }, flags: ["open", "split"] },
    slam: { figure: { rotate: 0.06, scaleX: 1.08, scaleY: 0.86 } },
    // Kneeling to plant or to channel Regrowth: low and wide, held until the move lets go.
    kneel: { figure: { scaleX: 1.12, scaleY: 0.66 } },
    bloom: { parts: { sprout: { scaleX: 1.7, scaleY: 1.7 } }, flags: ["bud"] },
    // Channelling Regrowth: still kneeling, the seam eased open and the sprout raised.
    channel: {
      figure: { scaleX: 1.12, scaleY: 0.66 },
      parts: { far: { rotate: -0.08 }, near: { rotate: 0.08 }, sprout: { scaleX: 1.5, scaleY: 1.5 } },
      flags: ["open", "split", "bud"],
    },
    // Gathering for the next Regrowth wave: the kneel lifts a little and the sprout rises again.
    gather: { figure: { scaleX: 0.96, scaleY: 1.14 }, parts: { sprout: { scaleX: 1.3, scaleY: 1.3 } } },
    // Last Spring wakes: swollen, the sprout in bloom.
    spring: { figure: { scaleX: 1.08, scaleY: 1.08 }, parts: { sprout: { scaleX: 1.7, scaleY: 1.7 } }, flags: ["bud"] },
    death: {
      parts: {
        far: { dx: -26, rotate: -1.3 },
        near: { dx: 26, rotate: 1.3 },
        heart: { dy: 40, alpha: 0 },
        sprout: { alpha: 0 },
      },
      flags: ["open", "split", "eye-closed"],
    },
    rise: { figure: { scaleX: 0.9, scaleY: 0.72 } },
  },
  palettes: {
    standard: {
      ink: "#0a0a0a",
      near: "#4f9440",
      far: "#3f7834",
      seam: "#d7b84c",
      heart: "#d7b84c",
      eye: "#ffffff",
      stem: "#6aa64a",
      leaf: "#9ccc52",
      shell: "#6f8f78",
      mark: "#e4c95a",
      haste: "#cfe9a0",
    },
    highContrast: {
      ink: "#000000",
      near: "#2e8b2e",
      far: "#1d5c1d",
      seam: "#fff36b",
      heart: "#fff36b",
      eye: "#ffffff",
      stem: "#ffffff",
      leaf: "#ffffff",
      shell: "#ffffff",
      mark: "#fff36b",
      haste: "#fff36b",
    },
  },
  flashKeys: ["near", "far", "shell"],
};

/** The pose each stage of each move shows. Every heavy move leaves it split open while it can be punished. */
export const ROOTBOUND_MOVE_POSES: FigureMovePoses = {
  "vine-lash": { tell: "coil", active: "lunge", recover: "lunge", punish: "split" },
  "root-glide": { tell: "sink", active: "sink", recover: "stretch", punish: "split" },
  "canopy-vault": { tell: "crouch", active: "stretch", recover: "stretch", punish: "split" },
  "thorn-burst": { tell: "swell", active: "burst", recover: "burst", punish: "split" },
  "root-wave": { tell: "stretch", active: "slam", recover: "slam", punish: "split" },
  "plant-graft": { tell: "kneel", active: "kneel", recover: "kneel", punish: "split" },
  "root-cage": { tell: "stretch", active: "slam", recover: "slam", punish: "split" },
  "bloom-shift": { tell: "bloom", active: "bloom", recover: "bloom", punish: "split" },
  regrowth: { tell: "kneel", active: "channel", recover: "channel", punish: "split", repeatWarning: "gather" },
  "last-spring": { tell: "spring", active: "slam", recover: "slam", punish: "split" },
};

export const ROOTBOUND_PHASE_POSES: Readonly<Record<number, string>> = { 2: "phase-2", 3: "phase-3" };

/** Sizes the renderer needs around the figure: the exposed ring, the death beat and the lash vine. */
export const ROOTBOUND_FIGURE_LAYOUT = {
  ring: { center: [0, -76] as FigurePoint, radius: 104, width: 7, standard: "#7fe3ff", highContrast: "#ffffff" },
  /** How far through the death beat the seedling appears. */
  seedlingAt: 0.55,
  vine: {
    shoulder: { x: 0.5, y: 0.3 },
    tellWidth: 4,
    tellGrowth: 3,
    activeWidth: 8,
    recoverWidth: 6,
    tipWidth: 1.6,
    lift: 60,
    coilLift: 40,
    coilBack: 90,
    coilRise: 70,
    defaultReach: 260,
    thorn: { forward: 12, back: 10, spread: 9 },
  },
} as const;
