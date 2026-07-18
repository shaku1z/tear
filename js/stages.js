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
    chapter: { number: "I", title: "THE FIRST DESCENT", symbol: "⌑", intro: "ORDER ENDS AT THE EDGE.", transition: "ash",
      pages: [
        { label: "THE COMMISSION", text: "The Council built the Grounds around a single command: nothing below was ever to reach the light." },
        { label: "THE KEEPER", text: "One Warden remained after the orders stopped coming. Duty outlived everyone who might have released him." },
      ],
      bossOutro: { label: "BROKEN BADGE", text: "Inside the badge: ‘Directive: none shall reach the Undercroft.’ Beneath it, scratched by hand: ‘I never asked what was down there.’" } },
    // living-biome chapter: text lives in the empty left sky over a pale ink-wash
    chapterArt: { composition: "left", wash: "light" },
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
    chapter: { number: "II", title: "THE MACHINE BELOW", symbol: "▦", intro: "THE FOUNDRY STILL EXPECTS A SHIFT.", transition: "steel",
      pages: [
        { label: "THE UNDERCROFT", text: "Industry continued beneath the abandoned city. No workers remained, but every machine remembered its quota." },
        { label: "THE CONTAINMENT", text: "The Colossus was not built to conquer. It was built to stand between the Crimson Tide and everything above." },
      ],
      bossOutro: { label: "ORIGINAL STONE", text: "Older than the machine: ‘Should the Colossus fall, know this—we tried to stop the Tide before it reached the Fields.’" } },
    // industrial annotation reads in from the right
    chapterArt: { composition: "right", wash: "light" },
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
    chapter: { number: "III", title: "THE KING WITHOUT HOME", symbol: "♜", intro: "THE FIELDS REMEMBER EVERY FIRE.", transition: "ember",
      pages: [
        { label: "THE CRIMSON FIELDS", text: "A kingdom burned so long that flame became weather. Its last king still patrols the borders of a country that is gone." },
        { label: "THE CROWN", text: "Aldric calls it a throne. The ruins call it a grave. Neither word has persuaded him to leave." },
      ],
      bossOutro: { label: "PAINTED PORTRAIT", text: "Two children, laughing. On the back: ‘Elan and Mira—before the first Tear.’ In another hand: ‘Aldric. Come home.’" } },
    chapterArt: { composition: "left", wash: "light" },
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
    chapter: { number: "IV", title: "THE NAME IN THE WALL", symbol: "◇", intro: "THE RULES THIN. THE MEMORY DOES NOT.", transition: "mirror",
      pages: [
        { label: "THE VOIDSPIRE", text: "Here distance repeats itself and every motion leaves behind a version that believes it moved first." },
        { label: "THE REFLECTION", text: "Something in the Spire has practiced your shape for years. It remembers a journey you have only just begun." },
      ],
      bossOutro: { label: "HUNDREDS OF NAMES", text: "Your name, cut into the wall again and again. At the bottom: ‘Go finish it. One of us should.’" } },
    // the reflection speaks from the right, mirrored
    chapterArt: { composition: "right", wash: "light" },
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
    chapter: { number: "V", title: "THE WOUND THAT WATCHES", symbol: "◉", intro: "THE ABYSS LOOKS BACK.", transition: "void",
      pages: [
        { label: "THE TEAR", text: "There is no fortress at the bottom of the world—only the wound every fortress was built to misunderstand." },
        { label: "THE SOURCE", text: "It has worn every guardian sent to close it. Now it waits to learn whether your blade is another memory or an ending." },
      ],
      bossOutro: { label: "THE QUIET", text: "The Source was never an enemy. It was the wound the world kept reopening, wearing the shape of everyone who tried to close it." } },
    // the wound is near-black negative space; text is exposed by the dark wash
    chapterArt: { composition: "left", wash: "dark" },
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
  const DW = CONFIG.view.designW || 1600, DH = CONFIG.view.designH || 900;
  const vw = CONFIG.view.w, vh = CONFIG.view.h;
  // Floor spans the full dynamic viewport
  const floor = { x: 0, y: CONFIG.world.groundY, w: vw, h: vh - CONFIG.world.groundY, floor: true };
  // Platforms are authored for 1600×900 — center them in the dynamic viewport
  const ox = (vw - DW) / 2;
  const oy = (vh - DH) / 2;
  return [floor, ...s.layout.map((p) => ({ ...p, x: p.x + ox, y: p.y + oy }))];
}
function stageAt(i) { return STAGES[((i % STAGES.length) + STAGES.length) % STAGES.length]; }
