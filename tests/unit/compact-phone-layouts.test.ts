import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { clamp } from "../../src/domain/geometry";
import { createUi } from "../../src/presentation/ui";
import { densityTokens } from "../../src/presentation/ui-density";
import { createScreenRenderers } from "../../src/presentation/screens";
import type {
  CardView,
  PlaygroundScreenView,
  ReplayView,
  ScreenControl,
  ScreenRenderContext,
} from "../../src/presentation/screens";
import { AUTHORED_BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import {
  createLivePlaygroundPresentation,
  type PlaygroundScreenModel,
} from "../../src/gameplay/training/live-playground-presentation";
import { PLAYGROUND_ALL_KINDS, PLAYGROUND_HOTKEY_KINDS } from "../../src/gameplay/training/playground-controller";
import { PLAYGROUND_STAGES } from "../../src/gameplay/stages";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { catalog, routing } from "../../public/audio/music.json";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import { buildMusicScreenView } from "../../src/presentation/music-snapshots";

/**
 * The phone (compact density) compositions of the shop, codex, profile, leaderboards,
 * achievements and playground: real UI tokens and components, a canvas that records
 * every glyph run, and the controls each screen enqueues. Courier New advances exactly
 * 0.6 em, so measured widths here are the widths the layout used.
 */
const PHONES = [
  { name: "844x390", width: 844, height: 390 },
  { name: "667x375", width: 667, height: 375 },
] as const;

interface Glyphs {
  readonly text: string;
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  readonly right: number;
  readonly size: number;
}
type Clip = Readonly<{ x: number; y: number; w: number; h: number }> | null;

function fontSize(font: unknown): number {
  return Number(/(\d+(?:\.\d+)?)px/u.exec(String(font))?.[1] ?? 10);
}

/** A canvas that records each visible text run (after clipping) with its box. */
function recordingCanvas(texts: Glyphs[]): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  const clips: Clip[] = [];
  let clip: Clip = null,
    pending: Clip = null;
  const width = (text: string): number => text.length * fontSize(values.get("font")) * 0.6;
  const setting = (key: string, fallback: string): string => {
    const value = values.get(key);
    return typeof value === "string" ? value : fallback;
  };
  const methods: Record<string, (...args: never[]) => unknown> = {
    measureText: (text: string) => ({ width: width(text) }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    save: () => {
      clips.push(clip);
    },
    restore: () => {
      clip = clips.pop() ?? null;
    },
    beginPath: () => {
      pending = null;
    },
    rect: (x: number, y: number, w: number, h: number) => {
      pending = { x, y, w, h };
    },
    clip: () => {
      clip = pending;
    },
    fillText: (text: string, x: number, y: number) => {
      if (text.trim() === "") return;
      const size = fontSize(values.get("font")),
        w = width(text),
        align = setting("textAlign", "left");
      const baseline = setting("textBaseline", "alphabetic");
      const left = align === "center" ? x - w / 2 : align === "right" || align === "end" ? x - w : x;
      const top = baseline === "middle" ? y - size * 0.45 : y - size * 0.72,
        bottom = baseline === "middle" ? y + size * 0.45 : y + size * 0.12;
      if (clip && (top < clip.y - 1 || bottom > clip.y + clip.h + 1)) return;
      texts.push({ text, x: left, top, bottom, right: left + w, size });
    },
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, property) =>
      values.has(property) ? values.get(property) : (methods[String(property)] ?? (() => undefined)),
    set: (_target, property, value) => {
      values.set(property, value);
      return true;
    },
  });
}

function phoneUi(width: number, height: number, phoneLayout = true) {
  const scale = Math.min(width / 1600, height / 900),
    overscan = { x: (width / scale - 1600) / 2, y: (height / scale - 900) / 2 };
  const ui = createUi({
    CLOCK: createTearWorldClock(),
    presentation: { view: CONFIG.view, colors: CONFIG.colors, overscan },
    clamp,
    Input: { mode: "touch" },
  });
  ui.setDensity({ touch: true, cssPerLogicalPixel: scale });
  ui.useCompactLayout(false, phoneLayout);
  return { ui, scale, overscan };
}

interface Frame {
  readonly texts: readonly Glyphs[];
  readonly controls: readonly ScreenControl[];
  readonly scroll: number;
  readonly scale: number;
  /** Whether the button draw would cut this control's label with an ellipsis. */
  readonly labelCut: (control: ScreenControl) => boolean;
}

/** Asks the live UI's button draw whether it would cut a control's label with an ellipsis. */
function labelCutter(ui: ReturnType<typeof createUi>): Frame["labelCut"] {
  const canvas = recordingCanvas([]);
  return (control) =>
    ui.buttonLabelFit(canvas, {
      label: control.label,
      w: control.w,
      h: control.h,
      ...(control.size === undefined ? {} : { size: control.size }),
      ...(control.glyph === undefined ? {} : { glyph: control.glyph }),
      ...(control.sub === undefined ? {} : { sub: control.sub }),
    }).truncated;
}

/** Renders one screen at a phone size and scroll; returns what it drew and enqueued, and the scroll it wrote back. */
function render(
  phone: (typeof PHONES)[number],
  draw: (renderers: ReturnType<typeof createScreenRenderers>) => void,
  scroll = 0,
  phoneLayout = true,
): Frame {
  const { ui, scale, overscan } = phoneUi(phone.width, phone.height, phoneLayout);
  const texts: Glyphs[] = [],
    controls: ScreenControl[] = [];
  let written = scroll;
  const context: ScreenRenderContext = {
    canvas: recordingCanvas(texts),
    ui,
    width: 1600,
    height: 900,
    time: 0,
    enterAmount: 1,
    enterSeconds: 1,
    deltaSeconds: 1 / 60,
    mouse: { x: -1, y: -1 },
    scroll,
    focus: -1,
    touch: true,
    reducedMotion: false,
    screenRectangle: { x: -overscan.x, y: -overscan.y, w: 1600 + overscan.x * 2, h: 900 + overscan.y * 2 },
    safeInsets: { l: 0, r: 0, t: 0, b: 0 },
    enqueue(control): void {
      controls.push(control);
    },
    setScroll(value): void {
      written = value;
    },
  };
  draw(createScreenRenderers(context));
  return { texts, controls, scroll: written, scale, labelCut: labelCutter(ui) };
}

const overlaps = (
  a: Readonly<{ x: number; y: number; r: number; b: number }>,
  b: Readonly<{ x: number; y: number; r: number; b: number }>,
): boolean => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
const box = (control: ScreenControl) => ({
  x: control.x,
  y: control.y,
  r: control.x + control.w,
  b: control.y + control.h,
});
const textBox = (text: Glyphs) => ({ x: text.x, y: text.top, r: text.right, b: text.bottom });

/** No default button cuts its label with an ellipsis (chips, rail buttons and hidden boxes draw their own way). */
function expectNoCutLabels(frame: Frame, label: string): void {
  for (const control of frame.controls)
    if (control.label !== "" && control.hiddenBox !== true && control.chip !== true && control.ghost !== true)
      expect(frame.labelCut(control), `${label}: "${control.label}" label cut`).toBe(false);
}

/**
 * The phone contract: text floor, touch targets, nothing off the safe frame, nothing overlapping,
 * and no button label cut with an ellipsis.
 */
function expectPhoneContract(frame: Frame, label: string): void {
  expectNoCutLabels(frame, label);
  for (const text of frame.texts)
    expect(text.size * frame.scale, `${label}: "${text.text}" text size`).toBeGreaterThanOrEqual(11);
  for (const control of frame.controls) {
    expect(control.h * frame.scale, `${label}: ${control.label || control.action.type} height`).toBeGreaterThanOrEqual(
      44,
    );
    expect(
      control.x >= 0 && control.x + control.w <= 1600 && control.y >= 0 && control.y + control.h <= 900,
      `${label}: ${control.label || control.action.type} inside the safe frame`,
    ).toBe(true);
  }
  frame.controls.forEach((control, index) => {
    for (const other of frame.controls.slice(index + 1)) {
      expect(overlaps(box(control), box(other)), `${label}: "${control.label}" overlaps "${other.label}"`).toBe(false);
    }
  });
  frame.texts.forEach((text, index) => {
    for (const other of frame.texts.slice(index + 1)) {
      expect(overlaps(textBox(text), textBox(other)), `${label}: "${text.text}" overlaps "${other.text}"`).toBe(false);
    }
    for (const control of frame.controls.filter((entry) => entry.hiddenBox !== true)) {
      expect(overlaps(textBox(text), box(control)), `${label}: "${text.text}" runs under "${control.label}"`).toBe(
        false,
      );
    }
    expect(
      text.x >= 0 && text.right <= 1600 && text.top >= 0 && text.bottom <= 900,
      `${label}: "${text.text}" inside the safe frame`,
    ).toBe(true);
  });
}

/** Scrolls a screen from top to bottom by half a page and collects every action it offers on the way. */
function sweep(
  phone: (typeof PHONES)[number],
  draw: (renderers: ReturnType<typeof createScreenRenderers>) => void,
  label: string,
): Set<string> {
  const end = render(phone, draw, 1e6).scroll,
    ids = new Set<string>();
  for (let scroll = 0; ; scroll = Math.min(end, scroll + 200)) {
    const frame = render(phone, draw, scroll);
    expect(frame.texts.length, `${label}: draws its copy`).toBeGreaterThan(3);
    expect(frame.controls.length, `${label}: offers controls`).toBeGreaterThan(0);
    expectPhoneContract(frame, `${label} @${String(scroll)}`);
    for (const control of frame.controls) ids.add(JSON.stringify(control.action));
    if (scroll >= end) break;
  }
  return ids;
}

const LONG =
  "Take six percent less floor and environmental hazard damage per level, stacking with every other source of resistance.";
const shopView = {
  id: "shop" as const,
  coins: 12_345,
  ownedLevels: 3,
  totalLevels: 80,
  lifetimeEarned: 98_765,
  sections: ["VITALITY", "BLADE", "TEMPO", "FORTUNE"].map((label, section) => ({
    label,
    items: Array.from({ length: 5 }, (_, index) => ({
      id: `${label}-${String(index)}`,
      label: index === 0 ? "Momentum Transfer" : `Upgrade ${String(section)}${String(index)}`,
      glyph: "◆",
      level: index % 3,
      maxLevel: index === 1 ? 1 : 8,
      description: index % 2 ? LONG : "Now +24 max HP · +12 starting max HP per level.",
      cost: "6,000c",
      enabled: index % 2 === 0,
      flash: 0,
    })),
  })),
};
const abilityCards: CardView[] = Array.from({ length: 23 }, (_, index) => ({
  id: `ability-${String(index)}`,
  label: index === 0 ? "Aerial Superiority Engine" : `Ability ${String(index)}`,
  category: "RESILIENCE",
  badge: index % 3 === 0 ? "✦ SPECIAL" : index % 3 === 1 ? "★ UNIQUE" : "STACKS",
  accent: "#e23b3b",
  tier: index % 3,
  tierCount: index % 3 === 0 ? 3 : 1,
  description: index % 2 ? LONG : "+12% swing damage.",
}));
const bestiaryCards: CardView[] = Array.from({ length: 9 }, (_, index) => ({
  id: `bestiary:${String(index)}`,
  label: index === 0 ? "The Berserker King" : `Foe ${String(index)}`,
  category: "MELEE RUSHER",
  badge: "MELEE",
  description: LONG,
  variants: "Brawler · Stalker · Executioner · Gravedigger · Duelist · Briar Stalker",
  boss: index === 4,
  previewId: `creature:${String(index)}`,
  stats: [
    { label: "HP", value: "86" },
    { label: "DMG", value: "12" },
    { label: "SPD", value: "150" },
  ],
  felled: { label: "FELLED ×12", color: "#2f9e6b" },
  affixes: [
    { id: "tank", color: "#a86a0c" },
    { id: "swift", color: "#13c4d6" },
    { id: "warded", color: "#2f9e6b" },
  ],
}));
const codexBase = {
  id: "codex" as const,
  tabs: [
    { id: "abilities", label: "ABILITIES" },
    { id: "bestiary", label: "BESTIARY" },
    { id: "guide", label: "GUIDE" },
  ],
};
const abilityFilters = ["ALL", "OFFENSE", "THROW", "PARRY", "MOBILITY", "RESILIENCE", "UTILITY"].map((label) => ({
  id: label.toLowerCase(),
  label,
}));
const guide = {
  controls: [
    { keys: ["A", "D"], description: "move" },
    { keys: ["W", "SPACE"], description: "jump" },
    { keys: ["SHIFT"], description: "dash · aim 8-way with WASD · i-frames" },
    { keys: ["RMB"], description: "throw / recall inside the dashed ring" },
  ],
  controller: ["left stick move · right stick swings the blade", "A jump · B dash · X throw · Y tether · ☰ pause"],
  tricks: [
    { glyph: "/", name: "CUT", points: 2, description: "any clean blade hit" },
    { glyph: "⇊", name: "POWER SLAM", points: 11, description: "slam during a fast descent" },
    { glyph: "✦", name: "PARRY", points: 12, description: "swing FAST through a shot — it homes back" },
  ],
  ladder: [
    { name: "NICE", multiplier: 1.5, fraction: 0.2 },
    { name: "SAVAGE", multiplier: 4, fraction: 1 },
  ],
  variety: "VARIETY: repeating the same trick earns fewer points — mix your attacks.",
};
const replays: ReplayView[] = Array.from({ length: 5 }, (_, index) => ({
  id: `replay-${String(index)}`,
  title: "ENDLESS · NORMAL · WAVE 24",
  detail: "Riftlock · 1:42:10 · 123,456 points — a long recorded run with a long detail line",
  timestamp: "12/11/2026",
  available: true,
  local: true,
  pinned: index === 0,
  shared: index === 1,
  canDownloadArchive: true,
  canDownloadLinkedPair: index === 2,
  comparisonSelected: index === 1,
  comparisonSourceCount: 2,
}));
const profileBase = {
  id: "profile" as const,
  name: "A Rather Long Player Name",
  signedIn: true,
  cloudStatus: "Signed in — progress saves to your account everywhere",
  tabs: ["BESTS", "REPLAYS", "VAULT", "CAREER", "STATS"].map((label) => ({ id: label.toLowerCase(), label })),
  passport: {
    coins: 12_345,
    shards: 678,
    achievements: "41 / 99",
    renameLabel: "RENAME (IN 3 DAYS)",
    canRename: false,
    canSignIn: false,
    canSignOut: true,
    showcases: [
      { glyph: "★", color: "#e0a326" },
      { glyph: "☠", color: "#9b53d6" },
    ],
  },
  stats: Array.from({ length: 10 }, (_, index) => ({
    label: index === 0 ? "Blade throws landed" : `Stat ${String(index)}`,
    value: "123,456",
    glyph: "◆",
    accent: "#13c4d6",
  })),
  records: Array.from({ length: 8 }, () => ({
    mode: "Adventure",
    difficulty: "extreme",
    wave: "40",
    time: "1:02:33",
    score: "1,234,567",
    accent: "#e23b3b",
  })),
  finest: { headline: "Wave 40 · Adventure", detail: "EXTREME · RIFTLOCK · 1:02:33" },
};
const achievementCards: CardView[] = Array.from({ length: 13 }, (_, index) => ({
  id: `ach-${String(index)}`,
  label: index === 0 ? "Controlled Demolition" : `Achievement ${String(index)}`,
  description: index % 2 ? LONG : "Defeat your first enemy.",
  badge: "LEGENDARY",
  locked: index % 2 === 0,
  progress: 0.4,
  progressLabel: "12,000 / 20,000",
  rewardPrimary: "◆ 100 SHARDS",
  rewardSecondary: "◆ 2000 COINS",
  accent: "#e0a326",
  glyph: "⚔",
  ...(index % 2 ? { footer: "EARNED" } : {}),
}));
const achievementsView = {
  id: "achievements" as const,
  category: "all",
  unlocked: 41,
  total: 99,
  shards: 678,
  resetsIn: "23h 29m",
  cards: achievementCards,
  nextUp: "First Blood  0 / 1 · Centurion  12 / 100 · Annihilation  0 / 20000",
  categories: [
    "ALL 41/99",
    "COMBAT 0/19",
    "SKILL 0/20",
    "PROGRESSION 0/11",
    "BOSSES 0/18",
    "SURVIVAL 0/15",
    "MASTERY 0/16",
  ].map((label, index) => ({ id: String(index), label, selected: index === 0 })),
  dailies: [
    { label: "Land 10 updraft launches in a single run", current: 3, goal: 10, reward: "◆ +15" },
    { label: "Defeat 2 bosses", current: 2, goal: 2, reward: "◆ +20", done: true },
    { label: "Finish 3 runs", current: 0, goal: 3, reward: "◆ +10" },
  ],
};
const leaderboardBase = {
  id: "leaderboards" as const,
  tabs: [
    { id: "global", label: "GLOBAL", selected: true },
    { id: "feed", label: "FEED" },
  ],
};
const rankedView = {
  ...leaderboardBase,
  tab: "global",
  status: "ready" as const,
  message: "",
  ownRank: "YOUR BEST · #42 · 123,456",
  modes: ["ADVENTURE", "ENDLESS", "GAUNTLET"].map((label, index) => ({
    id: label.toLowerCase(),
    label,
    selected: index === 0,
  })),
  difficulties: ["EASY", "NORMAL", "HARD", "EXTREME", "ONE-HIT"].map((label, index) => ({
    id: label.toLowerCase(),
    label,
    selected: index === 1,
  })),
  podium: [1, 2, 3].map((rank) => ({
    rank,
    name: "Somebody With A Long Name",
    detail: "Riftlock · wave 40 · 1:02:33",
    color: "#e0a326",
    replayId: `pod-${String(rank)}`,
    mine: rank === 2,
  })),
  rows: Array.from({ length: 22 }, (_, index) => ({
    id: `row-${String(index)}`,
    title: "Player With A Very Long Display Name",
    detail: "",
    rank: index + 4,
    wave: "40",
    time: "1:02:33",
    score: "1,234,567",
    available: index % 2 === 0,
    mine: index === 5,
  })),
};
const playgroundMenu = {
  id: "pgmenu" as const,
  title: "PLAYGROUND",
  subtitle: "Q / E switch tabs · TAB / ESC returns to the arena",
  tabs: ["SPAWN", "BOSSES", "ARENA", "WEAPON", "RULES", "ABILITIES"].map((label, index) => ({
    id: `tab:${label.toLowerCase()}`,
    label,
    selected: index === 0,
  })),
  sections: [
    {
      label: "SPAWN ENEMIES",
      choices: [
        ...[
          "charger",
          "ranged",
          "flyer",
          "bomber",
          "armored",
          "priest",
          "mender",
          "herald",
          "anchor",
          "wraith",
          "chimera",
          "rootbinder",
          "rimehound",
        ].map((kind) => ({ id: `spawn:${kind}`, label: kind.toUpperCase(), accent: "#e23b3b" })),
        { id: "dummy", label: "TARGET DUMMY  (passive)" },
      ],
    },
    {
      label: "HP",
      choices: [1, 3, 10].map((value) => ({
        id: `hp:${String(value)}`,
        label: `×${String(value)}`,
        selected: value === 1,
      })),
    },
    { label: "COUNT", choices: [1, 5].map((value) => ({ id: `count:${String(value)}`, label: `×${String(value)}` })) },
    {
      label: "DIFFICULTY",
      choices: ["EASY", "NORMAL", "HARD", "EXTREME", "ONE-HIT"].map((label) => ({ id: `difficulty:${label}`, label })),
    },
    {
      label: "SUMMON A BOSS",
      choices: [
        "THE WARDEN",
        "IRON COLOSSUS",
        "BERSERKER KING",
        "THE ROOTBOUND",
        "THE WHITE HART",
        "THE ECHO",
        "THE SOURCE",
      ].map((label) => ({ id: `boss:${label}`, label, accent: "#c0143c" })),
    },
    { label: "ARENA", choices: [{ id: "arena", label: "NEXT ARENA  ›  now: TRAINING GROUNDS" }] },
    {
      label: "WEAPON",
      choices: ["SWORD", "HAMMER", "GREATSWORD", "CHAINBLADE", "RIFTLOCK"].map((label) => ({
        id: `weapon:${label}`,
        label,
      })),
    },
    {
      label: "MODIFIERS",
      choices: ["GOD MODE", "FREEZE ENEMIES", "SLOW MOTION", "ONE-HIT MODE"].map((label) => ({
        id: `toggle:${label}`,
        label,
      })),
    },
    {
      label: "ACTIONS",
      choices: ["CLEAR ENEMIES", "FULL HEAL", "RESET ALL"].map((label) => ({
        id: `action:${label}`,
        label,
      })),
    },
  ],
};
const playgroundLab = {
  id: "pglab" as const,
  title: "PLAYGROUND",
  subtitle: "Take or evolve any ability · Q / E switch tabs · TAB / ESC returns to the arena",
  tabs: ["SPAWN", "BOSSES", "ARENA", "WEAPON", "RULES", "ABILITIES"].map((label, index) => ({
    id: `tab:${label.toLowerCase()}`,
    label,
    selected: index === 5,
  })),
  sections: [
    {
      label: "FILTERS",
      choices: ["ALL", "OFFENSE", "PARRY", "THROW", "MOBILITY", "RESILIENCE", "UTILITY"].map((label) => ({
        id: `filter:${label}`,
        label,
      })),
    },
    {
      label: "ABILITIES",
      choices: Array.from({ length: 17 }, (_, index) => ({
        id: `ability:${String(index)}`,
        label: `Ability Number ${String(index)} ★`,
        description: LONG,
        sub: "TIER 1 / 3",
        glyph: index % 2 ? "EVOLVE" : "TAKE",
        accent: "#13c4d6",
      })),
    },
  ],
};
const careerEntry = {
  kind: "capsule",
  id: "run-1",
  root: "root",
  manifestHash: "hash",
  date: "2026-11-12T10:00:00Z",
  mode: "endless",
  difficulty: "hard",
  weapon: "riftlock",
  wave: 24,
  result: "defeat",
  score: 123_456,
  seconds: 612,
  loadout: [{ id: "keen-edge", count: 2, tier: 1 }],
  bosses: ["warden"],
  damage: 310,
  style: null,
  nearMiss: null,
  dna: { aggression: 0.6, mobility: 0.4 },
  verified: "receipts",
  unavailable: ["damage timeline"],
  present: true,
};
const careerView = (selected: boolean) =>
  ({
    status: "ready" as const,
    indexing: false,
    message: "",
    confirming: false,
    retained: 12,
    known: 12,
    total: 12,
    page: 0,
    pages: 2,
    query: { text: "", filters: {}, view: "history", sort: "newest", page: 0 },
    rows: Array.from({ length: 6 }, (_, index) => ({
      entry: { ...careerEntry, id: `run-${String(index)}` },
      notes: { revision: 0, tags: ["clean"], retention: "pinned" },
    })),
    selected: selected ? { entry: careerEntry, notes: { revision: 0, tags: [], retention: "recent" } } : undefined,
  }) as unknown as NonNullable<Parameters<ReturnType<typeof createScreenRenderers>["profile"]>[0]["career"]>;

describe("phone compositions (compact density)", () => {
  for (const phone of PHONES) {
    it(`lays out the shop as one scrolling column with every BUY reachable at ${phone.name}`, () => {
      const ids = sweep(
        phone,
        (r) => {
          r.shop(shopView);
        },
        `shop ${phone.name}`,
      );
      for (const section of shopView.sections)
        for (const item of section.items) expect(ids.has(JSON.stringify({ type: "shop.buy", id: item.id }))).toBe(true);
    });

    it(`keeps the codex abilities, bestiary and guide readable and reachable at ${phone.name}`, () => {
      const abilities = sweep(
        phone,
        (r) => {
          r.codex({
            ...codexBase,
            tab: "abilities",
            filter: "all",
            sort: "category",
            filters: abilityFilters,
            cards: abilityCards,
          });
        },
        `codex abilities ${phone.name}`,
      );
      for (const card of abilityCards)
        expect(abilities.has(JSON.stringify({ type: "codex.inspect", id: card.id }))).toBe(true);
      expect(abilities.has(JSON.stringify({ type: "codex.cycleSort" }))).toBe(true);
      sweep(
        phone,
        (r) => {
          r.codex({
            ...codexBase,
            tab: "bestiary",
            filter: "all",
            filters: abilityFilters.slice(0, 6),
            cards: bestiaryCards,
          });
        },
        `bestiary ${phone.name}`,
      );
      sweep(
        phone,
        (r) => {
          r.codex({ ...codexBase, tab: "guide", cards: [], guide });
        },
        `guide ${phone.name}`,
      );
    });

    it(`composes every profile tab, its replay actions and the career archive at ${phone.name}`, () => {
      sweep(
        phone,
        (r) => {
          r.profile({ ...profileBase, tab: "bests" });
        },
        `profile bests ${phone.name}`,
      );
      sweep(
        phone,
        (r) => {
          r.profile({
            ...profileBase,
            tab: "stats",
            journey: {
              biomes: [{ id: "a", label: "The Grounds", selected: true }],
              bosses: [{ id: "b", label: "The Warden" }],
            },
          });
        },
        `profile stats ${phone.name}`,
      );
      const local = sweep(
        phone,
        (r) => {
          r.profile({ ...profileBase, tab: "replays", replays });
        },
        `profile replays ${phone.name}`,
      );
      for (const replay of replays)
        expect(local.has(JSON.stringify({ type: "profile.deleteReplay", id: replay.id }))).toBe(true);
      const vault = sweep(
        phone,
        (r) => {
          r.profile({
            ...profileBase,
            tab: "vault",
            replays: replays.map((replay) => ({ ...replay, local: false })),
            archive: {
              status: "ready",
              detail: "",
              canPick: true,
              jobId: "job",
              revision: 1,
              canRestore: true,
              canCancel: true,
              pairedCapsuleIds: ["a", "b"],
            },
          });
        },
        `profile vault ${phone.name}`,
      );
      for (const replay of replays)
        expect(vault.has(JSON.stringify({ type: "profile.compareGhostCapsule", id: replay.id }))).toBe(true);
      sweep(
        phone,
        (r) => {
          r.profile({
            ...profileBase,
            tab: "replays",
            replays: [],
            emptyMessage: "Every real run lands here automatically.",
          });
        },
        `profile empty ${phone.name}`,
      );
      sweep(
        phone,
        (r) => {
          r.profile({ ...profileBase, tab: "career", career: careerView(false) });
        },
        `career list ${phone.name}`,
      );
      sweep(
        phone,
        (r) => {
          r.profile({ ...profileBase, tab: "career", career: careerView(true) });
        },
        `career run ${phone.name}`,
      );
    });

    it(`fits achievements (dailies, summary, grid) with every card reachable at ${phone.name}`, () => {
      const ids = sweep(
        phone,
        (r) => {
          r.achievements(achievementsView);
        },
        `achievements ${phone.name}`,
      );
      for (const card of achievementCards)
        expect(ids.has(JSON.stringify({ type: "achievements.inspect", id: card.id }))).toBe(true);
    });

    it(`fits the ranked board, the feed and the designed states at ${phone.name}`, () => {
      const ranked = sweep(
        phone,
        (r) => {
          r.leaderboards(rankedView);
        },
        `ranked ${phone.name}`,
      );
      for (const row of rankedView.rows.filter((entry) => entry.available)) {
        expect(ranked.has(JSON.stringify({ type: "leaderboards.watchReplay", id: row.id }))).toBe(true);
      }
      sweep(
        phone,
        (r) => {
          r.leaderboards({ ...leaderboardBase, tab: "feed", status: "ready", rows: replays });
        },
        `feed ${phone.name}`,
      );
      sweep(
        phone,
        (r) => {
          r.leaderboards({ ...rankedView, status: "signin", signInRequired: true, rows: [] });
        },
        `signin ${phone.name}`,
      );
    });

    it(`fits Home, a stage, Songs and Settings of the MUSIC screen at ${phone.name}`, () => {
      const view = (page: string) =>
        buildMusicScreenView({
          settings: {},
          library: { songs: catalog.works, routing: validateMusicRoutingManifest(routing) },
          nowPlaying: { workId: "fillet", title: "Fillet" },
          preview: "spring",
          page,
          bossName: (id) => AUTHORED_BOSS_ROSTER.find((boss) => boss.id === id)?.name ?? "",
        });
      const offered = (page: string) =>
        [
          ...sweep(
            phone,
            (r) => {
              r.music(view(page));
            },
            `music ${page} ${phone.name}`,
          ),
        ].map((json) => JSON.parse(json) as { type: string; id?: string; tab?: string; key?: string; to?: string });
      const home = offered("home");
      for (const stage of view("home").stages)
        expect(
          home.some((action) => action.tab === `collection:${stage.id}`),
          stage.id,
        ).toBe(true);
      expect(home.some((action) => action.type === "navigate" && action.to === "menu")).toBe(true);
      const all = offered("songs");
      for (const song of view("songs").songs.filter((entry) => !entry.previewing))
        expect(
          all.some((action) => action.type === "music.preview" && action.id === song.id),
          song.id,
        ).toBe(true);
      expect(all.some((action) => action.type === "music.stopPreview")).toBe(true);
      expect(offered("collection:stage:the-grounds").some((action) => action.type === "music.preview")).toBe(true);
      // The stage page's one button, PLAY, is offered at the top of the page.
      const top = render(
        phone,
        (r) => {
          r.music(view("collection:stage:the-voidspire"));
        },
        0,
      );
      expect(top.controls.some((control) => control.label === "▶  PLAY")).toBe(true);
      const settings = offered("settings");
      for (const key of ["station", "menuMusic", "musicMode"])
        expect(settings.some((action) => action.key === key)).toBe(true);
    });

    it(`keeps the Playground menu and its ABILITIES tab inside the frame at ${phone.name}`, () => {
      const menu = sweep(
        phone,
        (r) => {
          r.pgmenu(playgroundMenu);
        },
        `pgmenu ${phone.name}`,
      );
      for (const section of playgroundMenu.sections) {
        for (const choice of section.choices)
          expect(menu.has(JSON.stringify({ type: "playground.action", id: choice.id }))).toBe(true);
      }
      expect(menu.has(JSON.stringify({ type: "run.resume" }))).toBe(true);
      const lab = sweep(
        phone,
        (r) => {
          r.pglab(playgroundLab);
        },
        `pglab ${phone.name}`,
      );
      for (const choice of playgroundLab.sections[1]?.choices ?? [])
        expect(lab.has(JSON.stringify({ type: "playground.action", id: choice.id }))).toBe(true);
    });
  }

  it("would reject the desktop composition at phone scale (the contract has teeth)", () => {
    const phone = PHONES[0];
    for (const draw of [
      (r: ReturnType<typeof createScreenRenderers>) => {
        r.shop(shopView);
      },
      (r: ReturnType<typeof createScreenRenderers>) => {
        r.achievements(achievementsView);
      },
      (r: ReturnType<typeof createScreenRenderers>) => {
        r.pgmenu(playgroundMenu);
      },
    ]) {
      expect(() => {
        expectPhoneContract(render(phone, draw, 0, false), "desktop composition");
      }).toThrow();
    }
    // A label too long for its button is caught as cut, on one line beside a sub line or wrapped.
    const frame = render(phone, (r) => {
      r.pgmenu(playgroundMenu);
    });
    const box = { x: 0, y: 0, w: 160, h: 60, action: { type: "run.resume" } as const };
    expect(frame.labelCut({ ...box, label: "SUMMON A VERY LONG BOSS NAME" })).toBe(true);
    expect(frame.labelCut({ ...box, label: "SUMMON A VERY LONG BOSS NAME", glyph: "◆", sub: "KEY M" })).toBe(true);
    expect(frame.labelCut({ ...box, label: "RESUME" })).toBe(false);
  });

  it("clamps an overscrolled page to its measured extent and writes it back", () => {
    const phone = PHONES[0];
    const end = render(
      phone,
      (r) => {
        r.shop(shopView);
      },
      1e6,
    ).scroll;
    expect(end).toBeGreaterThan(0);
    expect(
      render(
        phone,
        (r) => {
          r.shop(shopView);
        },
        end,
      ).scroll,
    ).toBe(end);
    expect(
      render(
        phone,
        (r) => {
          r.shop(shopView);
        },
        -50,
      ).scroll,
    ).toBe(0);
  });

  it("adopts the phone layout only at phone density: desktop and tablet keep their tokens and sheet", () => {
    const create = () =>
      createUi({
        CLOCK: createTearWorldClock(),
        presentation: { view: CONFIG.view, colors: CONFIG.colors, overscan: { x: 0, y: 0 } },
        clamp,
        Input: { mode: "mouse" },
      });
    const desktop = create();
    const authored = { type: { ...desktop.t.type }, metric: { ...desktop.t.metric } };
    desktop.useCompactLayout(false, true);
    expect(desktop.density.compact).toBe(false);
    expect(desktop.sheetRect()).toEqual({ x: 180, y: 44, w: 1240, h: 820 });
    const tablet = create(),
      tabletScale = 1180 / 1600;
    tablet.setDensity({ touch: true, cssPerLogicalPixel: tabletScale });
    tablet.useCompactLayout(false, true);
    expect(tablet.density).toMatchObject({ compact: false, wideSheet: false });
    expect(tablet.sheetRect()).toEqual({ x: 180, y: 44, w: 1240, h: 820 });
    const plain = densityTokens(authored, { touch: true, cssPerLogicalPixel: tabletScale }, false);
    expect({ ...tablet.t.type }).toMatchObject(plain.type);
    expect({ ...tablet.t.metric }).toMatchObject(plain.metric);
    const { ui } = phoneUi(844, 390);
    expect(ui.density).toMatchObject({ compact: true, wideSheet: true });
    expect(ui.sheetRect().w).toBeGreaterThan(1240);
  });
});

/** The live build-menu model from the real enemy, boss, difficulty and weapon rosters (plus optional extras). */
function liveBuildMenu(
  extraKinds = 0,
  extraBosses = 0,
  tab = "spawn",
  device: "mouse" | "keyboard" | "gamepad" = "mouse",
): PlaygroundScreenView {
  let model: PlaygroundScreenModel | undefined;
  createLivePlaygroundPresentation({
    run: () => ({ diff: "normal", pgArena: 0, pg: {}, mods: { owned: {}, tier: {} } }),
    inputDevice: () => device,
    oneHit: () => false,
    kinds: [...PLAYGROUND_ALL_KINDS, ...Array.from({ length: extraKinds }, (_, index) => `newkind${String(index)}`)],
    difficulties: () => CONFIG.difficulties,
    bosses: [
      ...AUTHORED_BOSS_ROSTER,
      ...Array.from({ length: extraBosses }, (_, index) => ({
        id: `new-boss-${String(index)}`,
        name: `New Boss ${String(index)}`,
      })),
    ],
    weapons: () => WEAPON_IDS.map((id) => ({ id, name: id })),
    colors: () => ({}),
    uiAccent: () => "#13c4d6",
    stageAccent: () => "#13c4d6",
    arenaName: () => "ASHEN COURT",
    arenas: () => PLAYGROUND_STAGES.map((stage) => stage.name),
    tab: () => tab,
    hotkeyKinds: PLAYGROUND_HOTKEY_KINDS,
    selectedWeapon: () => "sword",
    upgrades: () => [],
    abilityColors: () => ({}),
    labFilter: () => "all",
    viewportHeight: 900,
    scroll: () => 0,
    setScroll: () => undefined,
    renderMenu: (value) => {
      model = value;
    },
    renderLab: () => undefined,
  }).renderMenu();
  if (model?.id !== "pgmenu") throw new Error("the live presentation did not build the menu");
  return model;
}

/** One desktop (mouse, full density) frame of a screen at a window size. */
function renderDesktop(
  size: Readonly<{ width: number; height: number }>,
  draw: (renderers: ReturnType<typeof createScreenRenderers>) => void,
  scroll = 0,
): Frame {
  const scale = Math.min(size.width / 1600, size.height / 900),
    overscan = { x: (size.width / scale - 1600) / 2, y: (size.height / scale - 900) / 2 };
  const ui = createUi({
    CLOCK: createTearWorldClock(),
    presentation: { view: CONFIG.view, colors: CONFIG.colors, overscan },
    clamp,
    Input: { mode: "mouse" },
  });
  ui.setDensity({ touch: false, cssPerLogicalPixel: scale });
  ui.useCompactLayout(false, true);
  const texts: Glyphs[] = [],
    controls: ScreenControl[] = [];
  draw(
    createScreenRenderers({
      canvas: recordingCanvas(texts),
      ui,
      width: 1600,
      height: 900,
      time: 0,
      enterAmount: 1,
      enterSeconds: 1,
      deltaSeconds: 1 / 60,
      mouse: { x: -1, y: -1 },
      scroll,
      focus: -1,
      touch: false,
      reducedMotion: false,
      screenRectangle: { x: -overscan.x, y: -overscan.y, w: 1600 + overscan.x * 2, h: 900 + overscan.y * 2 },
      safeInsets: { l: 0, r: 0, t: 0, b: 0 },
      enqueue(control): void {
        controls.push(control);
      },
      setScroll: () => undefined,
    }),
  );
  return { texts, controls, scroll, scale, labelCut: labelCutter(ui) };
}

/**
 * No control, heading or label may overlap another, everything stays on the 1600x900 stage, and no
 * button label is cut.
 */
function expectNoDesktopOverlap(frame: Frame, label: string): void {
  expectNoCutLabels(frame, label);
  frame.controls.forEach((control, index) => {
    expect(
      control.x >= 0 && control.x + control.w <= 1600 && control.y >= 0 && control.y + control.h <= 900,
      `${label}: "${control.label}" on stage`,
    ).toBe(true);
    for (const other of frame.controls.slice(index + 1)) {
      expect(overlaps(box(control), box(other)), `${label}: "${control.label}" overlaps "${other.label}"`).toBe(false);
    }
  });
  frame.texts.forEach((text, index) => {
    for (const other of frame.texts.slice(index + 1)) {
      expect(overlaps(textBox(text), textBox(other)), `${label}: "${text.text}" overlaps "${other.text}"`).toBe(false);
    }
    // A tab's hit area is an invisible control over its own label.
    for (const control of frame.controls.filter((entry) => entry.hiddenBox !== true))
      expect(overlaps(textBox(text), box(control)), `${label}: "${text.text}" runs under "${control.label}"`).toBe(
        false,
      );
  });
}

describe("desktop playground build menu", () => {
  const headings: Readonly<Record<string, readonly string[]>> = {
    spawn: ["ENEMIES", "HEALTH", "HOW MANY", "DIFFICULTY"],
    bosses: ["SUMMON A BOSS"],
    arena: ["ARENA"],
    weapon: ["WEAPON · CHANGING IT RESTARTS THE ARENA"],
    rules: ["RULES", "ARENA ACTIONS"],
  };
  for (const size of [
    { width: 1600, height: 900 },
    { width: 1280, height: 720 },
  ])
    for (const [tab, labels] of Object.entries(headings))
      for (const device of ["mouse", "keyboard", "gamepad"] as const)
        it(`lays out the ${tab} tab without overlap at ${String(size.width)}x${String(size.height)} (${device})`, () => {
          const view = liveBuildMenu(0, 0, tab, device);
          const frame = renderDesktop(size, (r) => {
            r.pgmenu(view);
          });
          expectNoDesktopOverlap(frame, `pgmenu ${tab} ${String(size.width)}x${String(size.height)}`);
          const offered = new Set(frame.controls.map((control) => JSON.stringify(control.action)));
          for (const choice of [...(view.tabs ?? []), ...view.sections.flatMap((section) => section.choices)]) {
            expect(
              offered.has(JSON.stringify({ type: "playground.action", id: choice.id })),
              `${choice.label} offered`,
            ).toBe(true);
          }
          expect(offered.has(JSON.stringify({ type: "run.resume" }))).toBe(true);
          for (const heading of labels)
            expect(
              frame.texts.some((text) => text.text === heading),
              `${heading} drawn`,
            ).toBe(true);
        });

  it("derives the grid from the item count, so added enemies and bosses push the next group down", () => {
    for (const [kinds, bosses] of [
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
    ] as const) {
      for (const tab of ["spawn", "bosses"])
        expectNoDesktopOverlap(
          renderDesktop({ width: 1600, height: 900 }, (r) => {
            r.pgmenu(liveBuildMenu(kinds, bosses, tab));
          }),
          `${tab} +${String(kinds)} kinds +${String(bosses)} bosses`,
        );
    }
  });
});

describe("leaderboards: one screen definition at both densities", () => {
  /** Every action the desktop page offers for a view, over its whole scroll (the app owns the desktop extent). */
  function desktopActions(draw: (renderers: ReturnType<typeof createScreenRenderers>) => void, extent: number) {
    const ids = new Set<string>();
    for (let scroll = 0; scroll <= extent; scroll += 34)
      for (const control of renderDesktop({ width: 1600, height: 900 }, draw, scroll).controls)
        ids.add(JSON.stringify(control.action));
    return ids;
  }

  it("offers the same actions on the desktop page and the phone page for every board state", () => {
    const phone = PHONES[0];
    const cases = [
      { label: "ranked", view: rankedView, extent: rankedView.rows.length * 34 },
      {
        label: "feed",
        view: { ...leaderboardBase, tab: "feed", status: "ready" as const, rows: replays },
        extent: replays.length * 96,
      },
      {
        label: "signin",
        view: { ...rankedView, status: "signin" as const, signInRequired: true, rows: [] },
        extent: 0,
      },
      { label: "empty feed", view: { ...leaderboardBase, tab: "feed", status: "empty" as const, rows: [] }, extent: 0 },
    ];
    for (const { label, view, extent } of cases) {
      const draw = (r: ReturnType<typeof createScreenRenderers>): void => {
        r.leaderboards(view);
      };
      expect([...sweep(phone, draw, `${label} phone`)].sort(), label).toEqual([...desktopActions(draw, extent)].sort());
    }
  });
});

describe("career archive: one screen definition at both densities", () => {
  it("offers the same actions on the desktop page and the phone page for the list, a run and the delete question", () => {
    const phone = PHONES[0];
    const cases = [
      { label: "career list", career: careerView(false) },
      { label: "career run", career: careerView(true) },
      { label: "career delete", career: { ...careerView(true), confirming: true, message: "ignored" } },
      { label: "career empty", career: { ...careerView(false), rows: [], total: 0 } },
    ];
    for (const { label, career } of cases) {
      const draw = (r: ReturnType<typeof createScreenRenderers>): void => {
        r.profile({ ...profileBase, tab: "career", career });
      };
      const desktop = renderDesktop({ width: 1600, height: 900 }, draw).controls.map((control) =>
        JSON.stringify(control.action),
      );
      expect([...sweep(phone, draw, `${label} phone`)].sort(), label).toEqual([...new Set(desktop)].sort());
    }
  });
});

describe("codex and shop: one screen definition at both densities", () => {
  it("offers the same actions on the desktop page and the phone page for the shop and every codex tab", () => {
    const phone = PHONES[0];
    type Draw = (renderers: ReturnType<typeof createScreenRenderers>) => void;
    // Desktop card grids move by whole rows (170 and 184 px), so the sweep steps a row at a time.
    const cases: readonly Readonly<{ label: string; draw: Draw; extent: number; step: number }>[] = [
      {
        label: "shop",
        draw: (r) => {
          r.shop(shopView);
        },
        extent: 0,
        step: 1,
      },
      {
        label: "abilities",
        draw: (r) => {
          r.codex({
            ...codexBase,
            tab: "abilities",
            filter: "all",
            sort: "category",
            filters: abilityFilters,
            cards: abilityCards,
          });
        },
        extent: 510,
        step: 170,
      },
      {
        label: "bestiary",
        draw: (r) => {
          r.codex({
            ...codexBase,
            tab: "bestiary",
            filter: "all",
            filters: abilityFilters.slice(0, 6),
            cards: bestiaryCards,
          });
        },
        extent: 368,
        step: 184,
      },
      {
        label: "guide",
        draw: (r) => {
          r.codex({ ...codexBase, tab: "guide", cards: [], guide });
        },
        extent: 0,
        step: 1,
      },
    ];
    for (const { label, draw, extent, step } of cases) {
      const desktop = new Set<string>();
      for (let scroll = 0; scroll <= extent; scroll += step)
        for (const control of renderDesktop({ width: 1600, height: 900 }, draw, scroll).controls)
          desktop.add(JSON.stringify(control.action));
      expect([...sweep(phone, draw, `${label} phone`)].sort(), label).toEqual([...desktop].sort());
    }
  });
});

describe("shop BUY state at both densities", () => {
  it("draws every BUY enabled exactly when its upgrade can be bought, on desktop and on the phone", () => {
    const enabled = new Map(
      shopView.sections.flatMap((section) => section.items.map((item) => [item.id, item.enabled])),
    );
    const draw = (r: ReturnType<typeof createScreenRenderers>): void => {
      r.shop(shopView);
    };
    const check = (controls: readonly ScreenControl[], label: string): number => {
      const buys = controls.filter((control) => control.action.type === "shop.buy" && control.hiddenBox !== true);
      for (const control of buys) {
        const id = control.action.type === "shop.buy" ? control.action.id : "";
        expect(control.enabled !== false, `${label}: ${id}`).toBe(enabled.get(id));
      }
      return buys.length;
    };
    expect(check(renderDesktop({ width: 1600, height: 900 }, draw).controls, "desktop")).toBeGreaterThan(0);
    const phone = PHONES[0],
      end = render(phone, draw, 1e6).scroll;
    let seen = 0;
    for (let scroll = 0; scroll <= end; scroll += 100) seen += check(render(phone, draw, scroll).controls, "phone");
    expect(seen).toBeGreaterThan(0);
  });
});

describe("playground: one screen definition at both densities", () => {
  it("offers the same actions on the desktop and phone menu tabs, and in ABILITIES", () => {
    const menu = (r: ReturnType<typeof createScreenRenderers>): void => {
      r.pgmenu(playgroundMenu);
    };
    const lab = (r: ReturnType<typeof createScreenRenderers>): void => {
      r.pglab(playgroundLab);
    };
    const actions = (controls: readonly ScreenControl[]): string[] =>
      controls.map((control) => JSON.stringify(control.action));
    const phone = PHONES[0];
    const desktopMenu = new Set(actions(renderDesktop({ width: 1600, height: 900 }, menu).controls));
    expect([...sweep(phone, menu, "pgmenu phone")].sort()).toEqual([...desktopMenu].sort());
    // The desktop lab offers a row's button only while the row is fully in view: sweep a row at a time.
    const rows = Math.ceil((playgroundLab.sections[1]?.choices.length ?? 0) / 2),
      desktopLab = new Set<string>();
    for (let scroll = 0; scroll <= rows * 92; scroll += 92)
      for (const action of actions(renderDesktop({ width: 1600, height: 900 }, lab, scroll).controls))
        desktopLab.add(action);
    expect([...sweep(phone, lab, "pglab phone")].sort()).toEqual([...desktopLab].sort());
  });
});
