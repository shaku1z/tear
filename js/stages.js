// ------- stages / biomes -------
// The campaign is a sequence of stages ("worlds"). Each stage is a biome: its own
// background tint, platform colour, and platform LAYOUT, plus a name used for the
// transition banner. Enemy variety still scales with the global wave number, so later
// stages naturally field the nastier variants. Bosses (wave 10, 20, ...) come later.
//
// Backgrounds are kept light-ish on purpose for now so the black player + HUD stay
// readable; dramatic inversions (e.g. a true dark Voidspire) are a later polish pass.

const STAGES = [
  {
    name: "The Grounds", blurb: "Where order is kept.",
    bg: "#ffffff", plat: "#111111", accent: "#e23b3b",
    layout: [
      { x: 230, y: 650, w: 280, h: 24, oneway: true },
      { x: 1090, y: 650, w: 280, h: 24, oneway: true },
      { x: 640, y: 500, w: 320, h: 24, oneway: true },
      { x: 150, y: 360, w: 250, h: 24, oneway: true },
      { x: 1200, y: 360, w: 250, h: 24, oneway: true },
    ],
  },
  {
    name: "The Undercroft", blurb: "Gray industry, deep below.",
    bg: "#dbe0e6", plat: "#2a2f37", accent: "#15c2c2",
    layout: [
      { x: 120, y: 600, w: 250, h: 24, oneway: true },
      { x: 1230, y: 600, w: 250, h: 24, oneway: true },
      { x: 600, y: 620, w: 400, h: 24, oneway: true },
      { x: 330, y: 430, w: 240, h: 24, oneway: true },
      { x: 1030, y: 430, w: 240, h: 24, oneway: true },
      { x: 700, y: 300, w: 200, h: 24, oneway: true },
    ],
  },
  {
    name: "The Crimson Fields", blurb: "Red and gold, and old rage.",
    bg: "#f7e3e3", plat: "#5a1320", accent: "#e23b3b",
    layout: [
      { x: 180, y: 560, w: 300, h: 24, oneway: true },
      { x: 1120, y: 560, w: 300, h: 24, oneway: true },
      { x: 640, y: 660, w: 340, h: 24, oneway: true },
      { x: 430, y: 390, w: 260, h: 24, oneway: true },
      { x: 910, y: 390, w: 260, h: 24, oneway: true },
    ],
  },
  {
    name: "The Voidspire", blurb: "Where the rules thin out.",
    bg: "#e7e3f3", plat: "#382c54", accent: "#8b3bd6",
    layout: [
      { x: 280, y: 630, w: 220, h: 24, oneway: true },
      { x: 1100, y: 630, w: 220, h: 24, oneway: true },
      { x: 690, y: 540, w: 220, h: 24, oneway: true },
      { x: 170, y: 410, w: 220, h: 24, oneway: true },
      { x: 1210, y: 410, w: 220, h: 24, oneway: true },
      { x: 690, y: 320, w: 220, h: 24, oneway: true },
    ],
  },
  {
    name: "The Tear", blurb: "Everything, all at once.",
    bg: "#fbfbff", plat: "#000000", accent: "#13c4d6",
    layout: [
      { x: 230, y: 650, w: 280, h: 24, oneway: true },
      { x: 1090, y: 650, w: 280, h: 24, oneway: true },
      { x: 640, y: 500, w: 320, h: 24, oneway: true },
      { x: 150, y: 360, w: 250, h: 24, oneway: true },
      { x: 1200, y: 360, w: 250, h: 24, oneway: true },
    ],
  },
];

// build a fresh platforms array (floor + the stage's one-way platforms, cloned so
// temporary Geomancer walls never pollute the source layout)
function stagePlatforms(i) {
  const s = STAGES[((i % STAGES.length) + STAGES.length) % STAGES.length];
  const floor = { x: 0, y: CONFIG.world.groundY, w: CONFIG.view.w, h: CONFIG.view.h - CONFIG.world.groundY, floor: true };
  return [floor, ...s.layout.map((p) => ({ ...p }))];
}
function stageAt(i) { return STAGES[((i % STAGES.length) + STAGES.length) % STAGES.length]; }
