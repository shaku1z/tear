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
    boss: "warden",
    lore: "The Warden's badge lies in pieces. Etched inside, worn almost smooth: \"Appointed by the Council of First Light. Directive: none shall reach the Undercroft.\" Below it, scratched by hand: \"I never asked what was down there.\"",
    bg: "#ffffff", plat: "#111111", accent: "#e23b3b",
    // disciplined guards: melee front line, a few archers; heavy units only later
    pool: [["charger", 1.0, 1], ["ranged", 0.5, 2], ["bomber", 0.3, 4], ["armored", 0.3, 5]],
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
    boss: "colossus",
    lore: "In the deepest wall of the Undercroft, beneath the mechanism that is now still, words are carved into the original stone — older than the machine: \"Built to contain the Tide of Crimson. Should the Colossus fall, know this — we tried to stop it before it reached the Fields. We failed then too.\"",
    bg: "#dbe0e6", plat: "#2a2f37", accent: "#15c2c2",
    // industrial: heavy plating + ordnance, with anchors that pin you down
    pool: [["armored", 0.8, 1], ["bomber", 0.7, 1], ["charger", 0.6, 1], ["ranged", 0.5, 2], ["anchor", 0.25, 4]],
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
    boss: "aldric",
    lore: "Among Aldric's belongings, tucked inside the wrapping of his broken cleaver's handle: a small painted portrait, almost worn through. Two children, laughing. On the back, in handwriting read so many times the ink is barely there: \"Elan and Mira — before the first Tear opened.\" And, in another hand: \"Aldric. Come home.\" He never did.",
    bg: "#f7e3e3", plat: "#5a1320", accent: "#e23b3b",
    // old rage: relentless melee + flyers, heralds whipping them into a frenzy
    pool: [["charger", 1.0, 1], ["flyer", 0.6, 1], ["bomber", 0.3, 2], ["herald", 0.3, 3], ["chimera", 0.35, 5]],
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
    boss: "echo",
    lore: "The Voidspire is quiet for the first time. On the wall behind where The Echo stood, scratched deep over what must have been years: your name. Over and over — hundreds of times. Below them all, fresher, still sharp: \"I remember what it was like to be going somewhere.\" And at the very bottom: \"Go finish it. One of us should.\"",
    bg: "#e7e3f3", plat: "#382c54", accent: "#8b3bd6",
    // where the rules thin: wraiths, shifting casters, and support that warps the fight
    pool: [["wraith", 0.7, 1], ["flyer", 0.5, 1], ["ranged", 0.4, 1], ["priest", 0.3, 2], ["chimera", 0.5, 3], ["mender", 0.25, 4]],
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
    dark: true,   // the void at the end of everything — HUD + player flip to light here
    boss: "source",
    lore: "There is nothing left to carve the words into — only the quiet where the Tear used to be. You understand it now: the Source was never an enemy, only the wound the world kept reopening, wearing the shape of everyone who ever tried to close it. It wore your shape last. The blade is lighter than it has ever been. Somewhere, far above, something that has not been able to for a very long time begins, tentatively, to heal.",
    bg: "#0e0b1a", plat: "#c9c4e0", accent: "#13c4d6",
    // everything you have faced, together
    pool: [["charger", 1.0, 1], ["ranged", 0.6, 1], ["flyer", 0.5, 1], ["bomber", 0.4, 1], ["armored", 0.4, 1], ["wraith", 0.4, 1], ["chimera", 0.4, 1], ["herald", 0.2, 1], ["anchor", 0.2, 1], ["priest", 0.2, 1], ["mender", 0.18, 1]],
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
