// ------- stages / biomes -------
// The campaign is a sequence of stages ("worlds"). Each stage is a biome: its own
// background tint, platform colour, and platform LAYOUT, plus a name used for the
// transition banner. Enemy variety still scales with the global wave number, so later
// stages naturally field the nastier variants. Bosses (wave 10, 20, ...) come later.
//
// Backgrounds are kept light-ish on purpose for now so the black player + HUD stay
// readable; dramatic inversions (e.g. a true dark Voidspire) are a later polish pass.

import type { CONFIG as GAME_CONFIG } from "../config/game-config";
import publicationBoundary from "../../config/campaign-publication-boundary.json";
import type { ChapterTransitionId } from "./campaign/chapter-controller";
import type { BossId, EnemyKind } from "./run/content-director";
import { CURRENT_RULESET_VERSION } from "./run/ruleset-version";

/** Stable authored stage identifiers used by the game-reference projection. */
export const STAGE_IDS = Object.freeze([
  "grounds", "undercroft", "crimson-fields", "verdant-sanctum", "pale-traverse", "voidspire", "tear",
] as const);
export type StageId = typeof STAGE_IDS[number];

type PublicationBoundary = {
  readonly status: unknown;
  readonly rulesetVersion: unknown;
  readonly activeStageIds: unknown;
  readonly previewStageIds: unknown;
};

function sameStageOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * The tracked JSON boundary is the only publication input. The authored stage
 * order supplies the cross-check, so a dropped/reordered stage or a Pale
 * promotion fails closed while this module is being loaded.
 */
function readCurrentPublicationBoundary(value: PublicationBoundary) {
  if (value.status !== "public" || value.rulesetVersion !== CURRENT_RULESET_VERSION) {
    throw new Error("current campaign publication boundary is not the public ruleset");
  }
  if (!Array.isArray(value.activeStageIds) || !Array.isArray(value.previewStageIds)
    || value.activeStageIds.some((id): id is string => typeof id !== "string")
    || value.previewStageIds.some((id): id is string => typeof id !== "string")) {
    throw new TypeError("current campaign publication boundary stage IDs are invalid");
  }
  const activeStageIds = value.activeStageIds;
  const previewStageIds = value.previewStageIds;
  const authoredPublishedStageIds = STAGE_IDS.filter((id) => activeStageIds.includes(id));
  if (activeStageIds.length !== 6 || !sameStageOrder(activeStageIds, authoredPublishedStageIds)) {
    throw new Error("current campaign publication boundary must contain the exact six authored stages in order");
  }
  if (previewStageIds.length !== 1 || previewStageIds[0] !== "pale-traverse"
    || activeStageIds.includes("pale-traverse") || new Set(previewStageIds).size !== previewStageIds.length) {
    throw new Error("current campaign publication boundary must reserve Pale as the sole preview");
  }
  const authoredIds = new Set(STAGE_IDS);
  if (activeStageIds.some((id) => !authoredIds.has(id)) || previewStageIds.some((id) => !authoredIds.has(id))) {
    throw new Error("current campaign publication boundary references an unknown authored stage");
  }
  return Object.freeze({ activeStageIds: Object.freeze([...activeStageIds]), previewStageIds: Object.freeze([...previewStageIds]) });
}

const CURRENT_PUBLICATION_BOUNDARY = readCurrentPublicationBoundary(publicationBoundary);

/** Stable identity mapping; reserved identities may precede their runtime STAGES entry. */
export const STAGE_BOSS_HOME = Object.freeze({
  grounds: "warden",
  undercroft: "colossus",
  "crimson-fields": "aldric",
  "verdant-sanctum": "rootbound",
  "pale-traverse": "white-hart",
  voidspire: "echo",
  tear: "source",
} as const satisfies Readonly<Record<StageId, BossId>>);

export interface StagePlatformDefinition {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly oneway: boolean;
}

export interface StageChapterPage {
  readonly label: string;
  readonly text: string;
}

export interface StageChapterDefinition {
  readonly number: string;
  readonly title: string;
  readonly symbol: string;
  readonly intro: string;
  readonly transition: ChapterTransitionId;
  readonly pages: readonly StageChapterPage[];
  readonly bossOutro: Readonly<StageChapterPage>;
}

export interface StageChapterArtDefinition {
  readonly composition: string;
  readonly wash: string;
}

export interface StageDefinition {
  readonly id: StageId;
  readonly name: string;
  readonly blurb: string;
  readonly musicId: string;
  readonly boss: BossId;
  readonly chapter: StageChapterDefinition;
  readonly chapterArt: StageChapterArtDefinition;
  readonly bg: string;
  readonly plat: string;
  readonly accent: string;
  readonly dark?: boolean;
  readonly pool: readonly (readonly [EnemyKind, number, number?])[];
  readonly layout: readonly StagePlatformDefinition[];
}

const enemyPool = (...entries: readonly (readonly [EnemyKind, number, number?])[]) => entries;

const AUTHORED_STAGES: readonly StageDefinition[] = [
  {
    id: "grounds",
    name: "The Grounds", blurb: "Where order is kept.",
    musicId: "grounds",
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
    pool: enemyPool(["charger", 1.0, 1], ["ranged", 0.5, 2], ["bomber", 0.3, 4], ["armored", 0.3, 5]),
    layout: [
      { x: 230, y: 650, w: 280, h: 24, oneway: true },
      { x: 1090, y: 650, w: 280, h: 24, oneway: true },
      { x: 640, y: 500, w: 320, h: 24, oneway: true },
      { x: 150, y: 360, w: 250, h: 24, oneway: true },
      { x: 1200, y: 360, w: 250, h: 24, oneway: true },
    ],
  },
  {
    id: "undercroft",
    name: "The Undercroft", blurb: "Gray industry, deep below.",
    musicId: "undercroft",
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
    pool: enemyPool(["armored", 0.8, 1], ["bomber", 0.7, 1], ["charger", 0.6, 1], ["ranged", 0.5, 2], ["anchor", 0.25, 4]),
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
    id: "crimson-fields",
    name: "The Crimson Fields", blurb: "Red and gold, and old rage.",
    musicId: "crimson-fields",
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
    pool: enemyPool(["charger", 1.0, 1], ["flyer", 0.6, 1], ["bomber", 0.3, 2], ["herald", 0.3, 3], ["chimera", 0.35, 5]),
    layout: [
      { x: 180, y: 560, w: 300, h: 24, oneway: true },
      { x: 1120, y: 560, w: 300, h: 24, oneway: true },
      { x: 640, y: 660, w: 340, h: 24, oneway: true },
      { x: 430, y: 390, w: 260, h: 24, oneway: true },
      { x: 910, y: 390, w: 260, h: 24, oneway: true },
    ],
  },
  {
    id: "verdant-sanctum",
    name: "The Verdant Sanctum", blurb: "Where nothing is allowed to die.",
    musicId: "verdant-sanctum",
    boss: "rootbound",
    chapter: { number: "IV", title: "THE MERCY THAT WOULD NOT END", symbol: "✣", intro: "MERCY TOOK ROOT AND FORGOT TO LET GO.", transition: "bloom",
      pages: [
        { label: "THE SANCTUARY", text: "After the Fields burned, the wounded were carried here. The tree healed flesh first, then memory, then whatever remained." },
        { label: "THE PRESERVATION", text: "The keeper refused the final loss. One by one, the sanctuary joined the roots until mercy and captivity became the same command." },
      ],
      bossOutro: { label: "THE NAMEPLATES", text: "Healers. Soldiers. Children. Every name marks the day they entered the garden. None records the day they left. At the center: ‘I kept every promise except the one that mattered. I did not let them go.’" } },
    chapterArt: { composition: "right", wash: "light" },
    bg: "#dff2d6", plat: "#234a36", accent: "#e4c95a",
    pool: enemyPool(
      ["flyer", 0.75, 1], ["ranged", 0.70, 1], ["charger", 0.55, 1], ["rootbinder", 0.50, 2],
      ["mender", 0.32, 3], ["anchor", 0.28, 4], ["armored", 0.35, 4], ["chimera", 0.25, 6],
    ),
    layout: [
      { x: 150, y: 645, w: 330, h: 24, oneway: true },
      { x: 1120, y: 645, w: 330, h: 24, oneway: true },
      { x: 350, y: 485, w: 280, h: 24, oneway: true },
      { x: 970, y: 485, w: 280, h: 24, oneway: true },
      { x: 655, y: 335, w: 290, h: 24, oneway: true },
      { x: 1030, y: 250, w: 180, h: 24, oneway: true },
    ],
  },
  {
    id: "pale-traverse",
    name: "The Pale Traverse", blurb: "Where every road returns.",
    musicId: "pale-traverse",
    boss: "white-hart",
    chapter: { number: "V", title: "THE ROAD THAT RETURNED", symbol: "♢", intro: "EVERY ROAD RETURNS. NONE ARRIVE.", transition: "aurora",
      pages: [
        { label: "THE TRAVERSE", text: "The Council marked one safe passage through the mountains. When the Spire bent the road, every marker began pointing home." },
        { label: "THE LAST CARAVAN", text: "A guide kept ringing the route bell. The White Hart kept leading them from danger. The same frozen evening received them every time." },
      ],
      bossOutro: { label: "THE ROUTE LEDGER", text: "Thirty-seven travelers. Every name marked ‘Returned.’ The final line, in a child’s hand: ‘If the road disappears, ring twice. He knows the way home.’ Beyond the marker, the snow has no tracks." } },
    chapterArt: { composition: "left", wash: "light" },
    bg: "#dfe8f7", plat: "#1f3557", accent: "#ef8da8",
    pool: enemyPool(
      ["rimehound", 0.85, 1], ["ranged", 0.75, 1], ["charger", 0.65, 1], ["flyer", 0.60, 1], ["armored", 0.55, 1],
      ["bomber", 0.40, 2], ["wraith", 0.35, 3], ["anchor", 0.22, 4], ["chimera", 0.30, 6],
    ),
    layout: [
      { x: 140, y: 640, w: 400, h: 24, oneway: true },
      { x: 1060, y: 640, w: 400, h: 24, oneway: true },
      { x: 560, y: 510, w: 480, h: 24, oneway: true },
      { x: 190, y: 350, w: 300, h: 24, oneway: true },
      { x: 1110, y: 350, w: 300, h: 24, oneway: true },
      { x: 700, y: 255, w: 200, h: 24, oneway: true },
    ],
  },
  {
    id: "voidspire",
    name: "The Voidspire", blurb: "Where the rules thin out.",
    musicId: "voidspire",
    boss: "echo",
    chapter: { number: "V", title: "THE NAME IN THE WALL", symbol: "◇", intro: "THE RULES THIN. THE MEMORY DOES NOT.", transition: "mirror",
      pages: [
        { label: "THE VOIDSPIRE", text: "Here distance repeats itself and every motion leaves behind a version that believes it moved first." },
        { label: "THE REFLECTION", text: "Something in the Spire has practiced your shape for years. It remembers a journey you have only just begun." },
      ],
      bossOutro: { label: "HUNDREDS OF NAMES", text: "Your name, cut into the wall again and again. At the bottom: ‘Go finish it. One of us should.’" } },
    // the reflection speaks from the right, mirrored
    chapterArt: { composition: "right", wash: "light" },
    bg: "#e7e3f3", plat: "#382c54", accent: "#8b3bd6",
    // where the rules thin: wraiths, shifting casters, and support that warps the fight
    pool: enemyPool(["wraith", 0.7, 1], ["flyer", 0.5, 1], ["ranged", 0.4, 1], ["priest", 0.3, 2], ["chimera", 0.5, 3], ["mender", 0.25, 4]),
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
    id: "tear",
    name: "The Tear", blurb: "Everything, all at once.",
    musicId: "tear",
    dark: true,   // the void at the end of everything — HUD + player flip to light here
    boss: "source",
    chapter: { number: "VI", title: "THE WOUND THAT WATCHES", symbol: "◉", intro: "THE ABYSS LOOKS BACK.", transition: "void",
      pages: [
        { label: "THE TEAR", text: "There is no fortress at the bottom of the world—only the wound every fortress was built to misunderstand." },
        { label: "THE SOURCE", text: "It has worn every guardian sent to close it. Now it waits to learn whether your blade is another memory or an ending." },
      ],
      bossOutro: { label: "THE QUIET", text: "The Source was never an enemy. It was the wound the world kept reopening, wearing the shape of everyone who tried to close it." } },
    // the wound is near-black negative space; text is exposed by the dark wash
    chapterArt: { composition: "left", wash: "dark" },
    bg: "#0e0b1a", plat: "#c9c4e0", accent: "#13c4d6",
    // everything you have faced, together
    pool: enemyPool(["charger", 1.0, 1], ["ranged", 0.6, 1], ["flyer", 0.5, 1], ["bomber", 0.4, 1], ["armored", 0.4, 1], ["wraith", 0.4, 1], ["chimera", 0.4, 1], ["herald", 0.2, 1], ["anchor", 0.2, 1], ["priest", 0.2, 1], ["mender", 0.18, 1]),
    layout: [
      { x: 230, y: 650, w: 280, h: 24, oneway: true },
      { x: 1090, y: 650, w: 280, h: 24, oneway: true },
      { x: 640, y: 500, w: 320, h: 24, oneway: true },
      { x: 150, y: 360, w: 250, h: 24, oneway: true },
      { x: 1200, y: 360, w: 250, h: 24, oneway: true },
    ],
  },
];

export const CONTENT_AVAILABILITY_SURFACES = Object.freeze([
  "adventure", "endless", "gauntlet", "boss-test", "enemy-test", "tutorial", "playground", "published",
] as const);
export type ContentAvailabilitySurface = typeof CONTENT_AVAILABILITY_SURFACES[number];

export interface StageContentAvailability {
  readonly adventure: boolean;
  readonly endless: boolean;
  readonly gauntlet: boolean;
  readonly "boss-test": boolean;
  readonly "enemy-test": boolean;
  readonly tutorial: boolean;
  readonly playground: boolean;
  readonly published: boolean;
}

const PUBLISHED_AVAILABILITY: StageContentAvailability = Object.freeze({
  adventure: true, endless: true, gauntlet: true, "boss-test": true,
  "enemy-test": true, tutorial: true, playground: true, published: true,
});

const PREVIEW_AVAILABILITY: StageContentAvailability = Object.freeze({
  adventure: false, endless: false, gauntlet: false, "boss-test": false,
  "enemy-test": false, tutorial: false, playground: true, published: false,
});

/** Source-owned policy: every surface derives from the tracked boundary. */
export const STAGE_CONTENT_AVAILABILITY = Object.freeze(Object.fromEntries(
  STAGE_IDS.map((id) => [
    id,
    CURRENT_PUBLICATION_BOUNDARY.previewStageIds.includes(id)
      ? PREVIEW_AVAILABILITY
      : CURRENT_PUBLICATION_BOUNDARY.activeStageIds.includes(id)
        ? PUBLISHED_AVAILABILITY
        : (() => { throw new Error(`stage ${id} is absent from the current publication boundary`); })(),
  ]),
) as Readonly<Record<StageId, StageContentAvailability>>);

/** Source-derived display projection; IDs and names remain owned by AUTHORED_STAGES. */
export const STAGE_DISPLAY_NAMES = Object.freeze(Object.fromEntries(
  AUTHORED_STAGES.map(({ id, name }) => [id, name]),
) as Readonly<Record<StageId, string>>);

export type StagePublicationState = "published" | "preview";

/** Source-derived publication projection; the tracked boundary remains authoritative. */
export const STAGE_PUBLICATION_STATE = Object.freeze(Object.fromEntries(
  STAGE_IDS.map((id) => [id, STAGE_CONTENT_AVAILABILITY[id].published ? "published" : "preview"]),
) as Readonly<Record<StageId, StagePublicationState>>);

export function stagePublicationState(stageId: StageId): StagePublicationState {
  return STAGE_PUBLICATION_STATE[stageId];
}

export interface StageAuthorityProjection {
  readonly displayNames: Readonly<Record<string, string>>;
  readonly bossHomes: Readonly<Record<string, string>>;
  readonly publication: Readonly<Record<string, StagePublicationState>>;
}

/** Validate an injected content projection against the authored stage owner. */
export function assertStageAuthorityProjection(projection: StageAuthorityProjection): void {
  for (const stage of AUTHORED_STAGES) {
    if (projection.displayNames[stage.id] !== stage.name) throw new Error(`stage display drift for ${stage.id}`);
    if (projection.bossHomes[stage.id] !== STAGE_BOSS_HOME[stage.id]) throw new Error(`boss home drift for ${stage.id}`);
    const expectedPublication = STAGE_CONTENT_AVAILABILITY[stage.id].published ? "published" : "preview";
    if (projection.publication[stage.id] !== expectedPublication) throw new Error(`publication drift for ${stage.id}`);
  }
}

export function stageIdsAvailableOn(surface: ContentAvailabilitySurface): readonly StageId[] {
  return Object.freeze(STAGE_IDS.filter((id) => STAGE_CONTENT_AVAILABILITY[id][surface]));
}

export function bossIdsAvailableOn(surface: ContentAvailabilitySurface): readonly BossId[] {
  return Object.freeze(stageIdsAvailableOn(surface).map((id) => STAGE_BOSS_HOME[id]));
}

export function stageDefinition(stageId: StageId): StageDefinition {
  const stage = AUTHORED_STAGES.find(({ id }) => id === stageId);
  if (stage === undefined) throw new RangeError(`unknown authored stage ${stageId}`);
  return stage;
}

export const PUBLISHED_STAGE_IDS = stageIdsAvailableOn("published");
export const PLAYGROUND_STAGE_IDS = stageIdsAvailableOn("playground");
export const CAMPAIGN_STAGE_IDS = stageIdsAvailableOn("adventure");

/** Compatibility campaign roster. Preview content requires an explicit authored lookup. */
const STAGES: readonly StageDefinition[] = Object.freeze(CAMPAIGN_STAGE_IDS.map(stageDefinition));
export const PREVIEW_STAGE_IDS = Object.freeze(PLAYGROUND_STAGE_IDS.filter((id) => !PUBLISHED_STAGE_IDS.includes(id)));
export const PLAYGROUND_RUNTIME_STAGE_IDS = Object.freeze([...PUBLISHED_STAGE_IDS, ...PREVIEW_STAGE_IDS]);
export const PLAYGROUND_STAGES: readonly StageDefinition[] = Object.freeze(PLAYGROUND_RUNTIME_STAGE_IDS.map(stageDefinition));

/**
 * Published stages retain their production indices. Preview stages live after
 * that range so an engineering snapshot cannot masquerade as campaign state.
 */
export function stageRuntimeIndexForSurface(stageId: StageId, surface: ContentAvailabilitySurface): number {
  if (!STAGE_CONTENT_AVAILABILITY[stageId][surface]) return -1;
  const publishedIndex = PUBLISHED_STAGE_IDS.indexOf(stageId);
  if (publishedIndex >= 0) return publishedIndex;
  const previewIndex = PREVIEW_STAGE_IDS.indexOf(stageId);
  return previewIndex < 0 ? -1 : STAGES.length + previewIndex;
}

export function stageIdAtRuntimeIndex(index: number): StageId | null {
  if (!Number.isSafeInteger(index) || index < 0) return null;
  return PLAYGROUND_RUNTIME_STAGE_IDS[index] ?? null;
}

// build a fresh platforms array (floor + the stage's one-way platforms, cloned so
// temporary Geomancer walls never pollute the source layout)
function stagePlatforms(i: number, config: typeof GAME_CONFIG) {
  const s = stageAt(i);
  const authoredView = config.view as typeof config.view & { designW?: number; designH?: number };
  const DW = authoredView.designW ?? 1600, DH = authoredView.designH ?? 900;
  const vw = config.view.w, vh = config.view.h;
  // Floor spans the full dynamic viewport
  const floor = { x: 0, y: config.world.groundY, w: vw, h: vh - config.world.groundY, floor: true };
  // Platforms are authored for 1600×900 — center them in the dynamic viewport
  const ox = (vw - DW) / 2;
  const oy = (vh - DH) / 2;
  return [floor, ...s.layout.map((p) => ({ ...p, x: p.x + ox, y: p.y + oy }))];
}
function stageAt(i: number) {
  const preview = PREVIEW_STAGE_IDS[i - STAGES.length];
  if (preview !== undefined) return stageDefinition(preview);
  const stage = STAGES[((i % STAGES.length) + STAGES.length) % STAGES.length];
  if (stage === undefined) throw new RangeError("No stages are configured");
  return stage;
}

export { AUTHORED_STAGES, STAGES, stageAt, stagePlatforms };
