import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { createUi } from "../../src/presentation/ui";
import type {
  ScreenControl, ScreenRenderContext, ScreenUiPort,
} from "../../src/presentation/screens";
import { createLegacyScreenRenderers } from "../../src/presentation/screens";
import { backControl, tabs, verticalMenu } from "../../src/presentation/screens/screen-primitives";

class TestUi implements ScreenUiPort {
  readonly ink = "#000";
  readonly t = {
    type: { wordmark: 80, display: 52, h1: 40, h2: 30, title: 24, lead: 20, body: 16, label: 14, caption: 13, micro: 11 },
    font: { brand: "'Courier New', monospace", display: "sans-serif", body: "monospace", displayWeight: 600, bodyWeight: 400, bodyMediumWeight: 500 },
    alpha: { full: 1, soft: 0.8, muted: 0.6, faint: 0.3 },
    color: { accent: "#13c4d6", muted: "#888", danger: "#e23b3b" },
    metric: { btnH: 52, btnGap: 10 },
  };
  text(): void { return; }
  wordmark(): void { return; }
  displayText(): void { return; }
  title(): void { return; }
  tag(): void { return; }
  header(): void { return; }
  sectionLabel(...values: Parameters<ScreenUiPort["sectionLabel"]>): number { return values[3] + 24; }
  card(): void { return; }
  panel(): void { return; }
  divider(): void { return; }
  bar(): void { return; }
  dim(): void { return; }
  wrappedText(): void { return; }
  accentStrip(): void { return; }
  font(size: number, bold?: boolean): string { return `${bold ? "bold " : ""}${String(size)}px monospace`; }
  fitTitle(): void { return; }
  spine(): void { return; }
  badge(): number { return 48; }
  avatar(): void { return; }
  seal(): void { return; }
  pips(): void { return; }
  tabs(_context: CanvasRenderingContext2D, _id: string, labels: string[], _active: number, y: number,
    push?: Parameters<ScreenUiPort["tabs"]>[5]): void {
    labels.forEach((label, index) => { push?.({ x: 650 + index * 150, y, w: 150, h: 34, label, _tab: index, _hideBox: true }); });
  }
  keyBadge(): void { return; }
  tierPips(): void { return; }
  scrollHint(): void { return; }
  finalReward(): void { return; }
}

function createControlContext(controls: ScreenControl[]): ScreenRenderContext {
  return {
    canvas: canvasStub(),
    ui: new TestUi(),
    width: 1600, height: 900, time: 0, enterAmount: 1, enterSeconds: 1, deltaSeconds: 1 / 60,
    mouse: { x: -1, y: -1 }, scroll: 0, focus: 0,
    touch: false, reducedMotion: false, screenRectangle: { x: 0, y: 0, w: 1600, h: 900 }, safeInsets: { l: 0, r: 0, t: 0, b: 0 },
    enqueue(control): void { controls.push(control); },
  };
}

function canvasStub(rectangles?: number[][]): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  const gradient: CanvasGradient = { addColorStop(): void { return; } };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      if (property === "measureText") return (text: string): TextMetrics => ({ width: text.length * 8 } as TextMetrics);
      if (property === "createLinearGradient" || property === "createRadialGradient") return (): CanvasGradient => gradient;
      if (property === "fillRect") return (...args: number[]): void => { rectangles?.push(args); };
      return (): void => { return; };
    },
    set(_target, property, value): boolean { values.set(property, value); return true; },
  });
}

function createRenderContext(controls: ScreenControl[]): ScreenRenderContext {
  return {
    canvas: canvasStub(), ui: new TestUi(), width: 1600, height: 900, time: 0, enterAmount: 1,
    enterSeconds: 1, deltaSeconds: 1 / 60, mouse: { x: -1, y: -1 }, scroll: 0, focus: 0, touch: false, reducedMotion: false, screenRectangle: { x: 0, y: 0, w: 1600, h: 900 }, safeInsets: { l: 0, r: 0, t: 0, b: 0 },
    enqueue(control): void { controls.push(control); },
  };
}

describe("legacy screen renderer registry", () => {
  it("is exhaustive for every canonical application screen", () => {
    expectTypeOf<ReturnType<typeof createUi>>().toExtend<ScreenUiPort>();
    const registry = createLegacyScreenRenderers(createControlContext([]));
    expect(Object.keys(registry).sort()).toEqual([
      "academy", "achievements", "botevidence", "codex", "confirmquit", "continue", "draft", "foundry", "gameover", "ghostlab", "ghostpublication", "ghostsupport", "leaderboards",
      "menu", "paused", "pglab", "pgmenu", "playing", "profile", "rename", "replay", "reserve",
      "settings", "setup", "shop", "tierup", "win",
    ]);
    expect(() => { registry.playing({ id: "playing" }); }).not.toThrow();
  });

  it("records semantic navigation and menu actions without coordinating state", () => {
    const controls: ScreenControl[] = [];
    const context = createControlContext(controls);
    backControl(context, { type: "navigate", to: "paused" });
    verticalMenu(context, [
      { label: "RESUME", action: { type: "run.resume" } },
      { label: "MAIN MENU", action: { type: "navigate", to: "confirmquit" } },
    ], 220, 210);
    tabs(context, [
      { id: "audio", label: "AUDIO", selected: true },
      { id: "accessibility", label: "ACCESSIBILITY" },
    ], (id) => ({ type: "settings.selectTab", id }));

    expect(controls.map((control) => control.action)).toEqual([
      { type: "navigate", to: "paused" },
      { type: "run.resume" },
      { type: "navigate", to: "confirmquit" },
      { type: "settings.selectTab", id: "audio" },
      { type: "settings.selectTab", id: "accessibility" },
    ]);
  });

  it("paints menu chrome through the true viewport overscan while keeping controls in the safe composition", () => {
    const rectangles: number[][] = [];
    const controls: ScreenControl[] = [];
    const base = createRenderContext(controls);
    const renderer = createLegacyScreenRenderers({ ...base, canvas: canvasStub(rectangles),
      screenRectangle: { x: -120, y: -40, w: 1840, h: 980 } });
    renderer.menu({ id: "menu", playerName: "Guest", signedIn: false, coins: 0, shards: 0, unlocked: 0,
      modeLabel: "Endless", difficultyLabel: "Normal", biome: "The Grounds" });
    expect(rectangles[0]).toEqual([-120, -40, 920, 980]);
    expect(rectangles).toHaveLength(1);
    expect(controls.find((control) => control.action.type === "navigate" && control.action.to === "setup"))
      .toMatchObject({ x: 100, y: 318, w: 320, h: 86 });
    expect(controls[0]).toMatchObject({ dot: "#8a93a6", ghost: true });
  });

  it("preserves critical legacy labels and the independent audio-control contract", () => {
    const screenFiles = ["menu-setup.ts", "settings-rename.ts", "draft-reserve-tierup.ts", "pause-results.ts", "codex-shop.ts", "profile-achievements.ts"];
    const source = [
      ...screenFiles.map((file) => readFileSync(fileURLToPath(new URL(`../../src/presentation/screens/${file}`, import.meta.url)), "utf8")),
      readFileSync(fileURLToPath(new URL("../../src/presentation/ui-menu.ts", import.meta.url)), "utf8"),
    ].join("\n");
    for (const label of [
      "T E A R", "PLAY", "SHOP", "ACHIEVEMENTS", "LEADERBOARDS", "CODEX", "SETTINGS",
      "START", "MASTER", "MUSIC", "SOUND EFFECTS", "RESERVE A CARD", "THE WAY OPENS",
      "click to step through tiers", "DAILY CHALLENGES",
      "PAUSED", "QUIT RUN?", "YOU FELL", "DEFEATED", "VICTORY", "THE WORLD, RESTORED",
    ]) expect(source).toContain(label);
    expect(source).toContain("ui.avatar");
    expect(source).toContain("ui.seal");
    expect(source).toContain("ui.pips");
    expect(source).not.toMatch(/localStorage|Cloud\.|CG\.|PROFILE\.|META\.|saveSettings|startRun\(/);
  });

  it("preserves setup hit geometry, Boss Test selection, bounties, and the legacy start target", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.setup({ id: "setup",
      modes: ["endless", "rush", "daily", "boss"].map((id) => ({ id, label: id })),
      difficulties: ["easy", "normal", "hard", "tear"].map((id) => ({ id, label: id })),
      weapons: ["sword", "chainblade", "ringblade", "scythe"].map((id) => ({ id, label: id })), showDifficulty: true,
      startGlyph: "▢", startSummary: "ENDLESS · NORMAL · SWORD",
      bossChoices: [{ id: "shuffle", label: "SHUFFLE" }, { id: "warden", label: "WARDEN" }] });
    const sharedGrid = [
      { y: 168, h: 56 }, { y: 228, h: 56 }, { y: 288, h: 56 }, { y: 348, h: 56 },
    ];
    for (const action of ["setup.selectMode", "setup.selectDifficulty", "setup.selectWeapon"]) {
      expect(controls.filter((control) => control.action.type === action).map(({ y, h }) => ({ y, h }))).toEqual(sharedGrid);
    }
    expect(controls.find((control) => control.action.type === "setup.start")).toMatchObject({ y: 726, h: 62, label: "START", glyph: "▢" });
    expect(controls.filter((control) => control.action.type === "setup.selectBoss")).toHaveLength(2);
  });

  it("flows shop categories by their real contents instead of fixed-height slots", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    const item = (id: string) => ({ id, label: id.toUpperCase(), level: 0, maxLevel: 3, cost: "10c", enabled: true });
    renderer.shop({ id: "shop", coins: 100, ownedLevels: 0, totalLevels: 18, lifetimeEarned: 100,
      sections: [
        { label: "VITALITY", items: [item("v1"), item("v2"), item("v3")] },
        { label: "BLADE", items: [item("b1")] },
        { label: "TEMPO", items: [item("t1")] },
        { label: "FORTUNE", items: [item("f1"), item("f2")] },
      ] });
    const buys = controls.filter((control) => control.action.type === "shop.buy");
    expect(buys.find((control) => control.action.type === "shop.buy" && control.action.id === "v1")?.y).toBe(217);
    expect(buys.find((control) => control.action.type === "shop.buy" && control.action.id === "b1")?.y).toBe(481);
    expect(buys.find((control) => control.action.type === "shop.buy" && control.action.id === "t1")?.y).toBe(217);
    expect(buys.find((control) => control.action.type === "shop.buy" && control.action.id === "f1")?.y).toBe(333);
  });

  it("models Codex guide details and rich profile/achievement surfaces without gameplay callbacks", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.codex({ id: "codex", tab: "guide", tabs: [{ id: "guide", label: "GUIDE", selected: true }], cards: [],
      guide: { controls: [{ keys: ["A", "D"], description: "move" }], controller: ["left stick move"],
        tricks: [{ glyph: "✦", name: "PARRY", points: 15, description: "swing fast" }],
        ladder: [{ name: "S", multiplier: 4, fraction: 1 }], variety: "vary your tricks" } });
    renderer.profile({ id: "profile", tab: "bests", tabs: [{ id: "bests", label: "BESTS" }], name: "Guest", signedIn: false, stats: [],
      passport: { coins: 10, shards: 2, achievements: "3 / 40", canRename: false, canSignIn: true, canSignOut: false, showcases: [] },
      finest: { headline: "WAVE 12 · 9000 PTS", detail: "YOUR FINEST" }, records: [{ mode: "Endless", difficulty: "Hard", wave: "12", time: "03:20", score: "9,000" }] });
    renderer.achievements({ id: "achievements", category: "all", categories: [{ id: "all", label: "ALL 1/2" }], unlocked: 1, total: 2, cards: [],
      shards: 4, resetsIn: "2h", nextUp: "Sharp Start 80%", dailies: [{ label: "PARRY 3", current: 2, goal: 3, reward: "◆ +2", done: false }] });
    expect(controls.map((control) => control.action.type)).toEqual(expect.arrayContaining([
      "codex.selectTab", "profile.selectTab", "profile.openAchievements", "profile.signIn", "achievements.selectCategory",
    ]));
  });

  it("preserves leaderboard podium/replay theatre controls and settings cycle rows", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.leaderboards({ id: "leaderboards", tab: "global", tabs: [{ id: "global", label: "GLOBAL" }],
      modes: [{ id: "endless", label: "ENDLESS" }], difficulties: [{ id: "hard", label: "HARD" }], rows: [],
      podium: [{ rank: 1, name: "Player", detail: "wave 20", color: "#e0a326", replayId: "r1" }], ownRank: "#12 YOU" });
    renderer.replay({ id: "replay", title: "Player · Endless", detail: "wave 20", paused: false, speed: 1,
      elapsed: "01:00", duration: "02:00", progress: 0.5, chapters: [{ fraction: 0.25, boss: true }], infoVisible: true,
      infoRows: [{ label: "SCORE", value: "9000" }], loadout: [{ id: "reach", label: "LONG ARM", footer: "×2" }] });
    renderer.replay({ id: "replay", title: "GHOST 3 THEATER", detail: "verified", paused: true, speed: 1,
      elapsed: "TICK 120", duration: "TICK 240", progress: 0.5, theater: true, practiceAvailable: true });
    renderer.settings({ id: "settings", tab: "controls", tabs: [{ id: "controls", label: "CONTROLS" }], returnTo: "menu",
      sections: [{ label: "CONTROLS", rows: [{ key: "padPreset", label: "Controller preset", value: "STANDARD · RECOMMENDED", kind: "cycle", note: "Balanced shoulders" }] }] });
    expect(controls.map((control) => control.action.type)).toEqual(expect.arrayContaining([
      "leaderboards.selectBoard", "leaderboards.watchReplay", "replay.jumpChapter", "replay.togglePause",
      "replay.restart", "replay.practice", "replay.runDna.toggle", "replay.toggleInfo", "replay.exit", "settings.activate",
    ]));
    expect(controls.find((control) => control.action.type === "leaderboards.selectTab"))
      .toMatchObject({ y: 124, h: 34, hiddenBox: true });
    expect(controls.find((control) => control.action.type === "leaderboards.selectBoard" && control.action.id === "mode:endless"))
      .toMatchObject({ y: 224, w: 190, h: 34, chip: true });
    expect(controls.find((control) => control.action.type === "leaderboards.watchReplay"))
      .toMatchObject({ x: 872, y: 408, w: 48, h: 30 });
    expect(controls.find((control) => control.action.type === "replay.togglePause"))
      .toMatchObject({ x: 292, y: 834, w: 96, h: 44 });
    expect(controls.find((control) => control.action.type === "replay.practice"))
      .toMatchObject({ x: 644, y: 834, w: 180, h: 44, enabled: true });
  });

  it("renders durable Academy custody through a typed view with a semantic return", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    expect(() => { renderer.academy({ id: "academy", status: "ready", subtitle: "durable training custody", rows: [
      { label: "HELD", value: "3" }, { label: "REVIEWED", value: "2" },
      { label: "CURATED", value: "1" }, { label: "TRAINING SPLIT", value: "1" },
    ], records: [{ id: "A1B2C3D4", state: "held · reviewed · training", detail: "anonymous-improvement · indefinite retention · curation-approved" }],
    manifests: [{ id: "RELEASE V2", detail: "1 governed entry · root BEEFCAFE" }] }); }).not.toThrow();
    expect(controls.find((control) => control.action.type === "navigate" && control.action.to === "menu"))
      .toMatchObject({ label: "‹  BACK" });
  });

  it("renders Ghost Lab as safe local routes and explicit unavailable operations", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.ghostlab({ id: "ghostlab", subtitle: "local routes", routes: [
      { id: "academy", label: "ACADEMY", detail: "local custody" },
      { id: "foundry", label: "FOUNDRY STATUS", detail: "local recovery" },
      { id: "vault", label: "GHOST VAULT", detail: "capsule gated Theater" },
      { id: "botevidence", label: "BOT EVIDENCE", detail: "exact retained report" },
      { id: "watch", label: "WATCH", detail: "canonical V3 locally available" },
    ], unavailable: [
      { label: "WATCH", detail: "not player-safe" }, { label: "STATE FORGE", detail: "engineering only" },
    ], watch: { status: "ready", detail: "canonical V3 locally available", decisions: 0 } });
    expect(controls.filter((control) => control.action.type === "ghostlab.open").map((control) => control.action))
      .toEqual([{ type: "ghostlab.open", destination: "academy" }, { type: "ghostlab.open", destination: "foundry" }, { type: "ghostlab.open", destination: "vault" }, { type: "ghostlab.open", destination: "botevidence" }, { type: "ghostlab.open", destination: "watch" }]);
    expect(controls.find((control) => control.action.type === "ghostlab.watch"))
      .toMatchObject({ label: "START WATCH", action: { type: "ghostlab.watch", command: "start" } });
    expect(controls.some((control) => control.action.type === "navigate" && control.action.to === "menu")).toBe(true);
  });

  it("renders Bot Evidence as a read-only unavailable or exact-report projection", () => {
    const controls: ScreenControl[] = [], renderer = createLegacyScreenRenderers(createRenderContext(controls));
    expect(() => { renderer.botevidence({ id: "botevidence", status: "unavailable", subtitle: "exact local evidence", detail: "missing or stale" }); }).not.toThrow();
    expect(controls.find((control) => control.action.type === "navigate" && control.action.to === "menu")).toMatchObject({ label: "‹  BACK" });
  });

  it("projects a running Player Watch into the paused screen with semantic pause and stop controls", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.paused({ id: "paused", abilities: [], progress: [],
      playerWatch: { status: "running", decisions: 7 } });
    expect(controls.filter((control) => control.action.type === "ghostlab.watch").map((control) => control.action))
      .toEqual([
        { type: "ghostlab.watch", command: "pause" },
        { type: "ghostlab.watch", command: "stop" },
      ]);
    expect(controls.find((control) => control.action.type === "ghostlab.watch" && control.action.command === "pause"))
      .toMatchObject({ label: "PAUSE PLAYER WATCH", x: 80, y: 426, w: 280, h: 42 });
  });

  it("offers a semantic retry with storage guidance when Academy inspection is unavailable", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.academy({ id: "academy", status: "unavailable", subtitle: "Academy storage is unavailable", rows: [], records: [], manifests: [] });
    expect(controls.find((control) => control.action.type === "academy.retry"))
      .toMatchObject({ label: "TRY AGAIN", x: 690, w: 220, h: 46 });
  });

  it("renders opaque Foundry launch eligibility and only an eligible semantic bootstrap", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.foundry({ id: "foundry", status: "ready", subtitle: "local recovery", automation: "unavailable", launchProfiles: [
      { profileId: "eligible-local-cycle", disposition: "eligible" }, { profileId: "blocked-local-cycle", disposition: "blocked" },
    ], jobs: [{
      jobHash: "a".repeat(16), phase: "collecting", nextManualPhase: "curating", resumable: true, eventCount: 2,
      lastEventHash: "b".repeat(16), projectionHash: "c".repeat(16),
    }], schedules: [] });
    expect(controls.find((control) => control.action.type === "foundry.bootstrap"))
      .toMatchObject({ label: "START LOCAL CYCLE", action: { profileId: "eligible-local-cycle" }, enabled: true });
    expect(controls.find((control) => control.action.type === "foundry.bootstrap" && control.action.profileId === "blocked-local-cycle"))
      .toMatchObject({ label: "BLOCKED", enabled: false });
    expect(JSON.stringify(controls)).not.toContain("artifactHash");
    expect(JSON.stringify(controls)).not.toContain("custody");
  });

  it("renders durable DAgger status and exposes only a persisted-plan advance action", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    expect(() => { renderer.academy({ id: "academy", status: "ready", subtitle: "durable training custody", rows: [], records: [{ id: "A1", state: "HELD", detail: "anonymous improvement", candidateHash: "a".repeat(16), canWithdrawModelTraining: true }], manifests: [],
      daggerPrograms: [
        { id: "DAGGER ALPHA", state: "REVIEW REQUIRED", detail: "round 1 · awaiting an authorized review" },
        { id: "CORRECTION 12345678", programId: "dagger-alpha", state: "AWAITING DECISION", detail: "tick 3 - challenger: primary - teacher: guard", correctionHash: "a".repeat(16), canReview: true },
        { id: "DAGGER BETA", programId: "dagger-beta", state: "COMPLETED", detail: "fit retained; not activated or promoted", canAdvance: true },
      ],
    }); }).not.toThrow();
    expect(controls.find((control) => control.action.type === "academy.dagger.advance"))
      .toMatchObject({ label: "ADVANCE PLAN", action: { id: "dagger-beta" } });
    expect(controls.find((control) => control.action.type === "academy.dagger.review"))
      .toMatchObject({ label: "ACCEPT", action: { id: "dagger-alpha", disposition: "accepted" } });
    expect(controls.find((control) => control.action.type === "academy.record.withdrawModelTraining"))
      .toMatchObject({ label: "WITHDRAW TRAINING CONSENT", action: { candidateHash: "a".repeat(16) } });
  });

  it("projects only an explicit human-calibration consent control", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.academy({ id: "academy", status: "ready", subtitle: "durable training custody", rows: [], records: [], manifests: [],
      humanCalibrationConsent: { state: "not-enrolled", detail: "no recorded consent", canOptIn: true, canRevoke: false } });
    expect(controls.find((control) => control.action.type === "academy.humanCalibration.optIn"))
      .toMatchObject({ label: "ALLOW ANONYMOUS CALIBRATION", action: { consent: "anonymous-improvement" } });
    expect(controls.some((control) => control.action.type === "academy.humanCalibration.revoke")).toBe(false);
  });

  it("pages complete privacy-safe Academy records and manifests through screen scroll", () => {
    const controls: ScreenControl[] = [];
    const context = createRenderContext(controls);
    const renderer = createLegacyScreenRenderers({ ...context, scroll: 52 });
    expect(() => { renderer.academy({ id: "academy", status: "ready", subtitle: "durable training custody", rows: [],
      records: Array.from({ length: 5 }, (_, index) => ({ id: `RECORD-${String(index + 1)}`, state: "held", detail: "anonymous" })),
      manifests: Array.from({ length: 4 }, (_, index) => ({ id: `MANIFEST V${String(index + 1)}`, detail: "governed" })),
    }); }).not.toThrow();
    expect(controls.some((control) => control.action.type === "navigate" && control.action.to === "menu")).toBe(true);
  });

  it("uses the oracle replay-vault row geometry and a profile-specific watch intent", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.profile({ id: "profile", tab: "replays", tabs: [{ id: "replays", label: "REPLAYS", selected: true }],
      name: "Guest", signedIn: false, stats: [], replays: [{ id: "local-1", title: "You — Endless · normal",
        detail: "wave 4 · 900 pts", available: true, local: true, pinned: false, shared: false }] });
    expect(controls.find((control) => control.action.type === "profile.watchReplay"))
      .toMatchObject({ x: 968, y: 342, w: 110, h: 40 });
    expect(controls.find((control) => control.action.type === "profile.pinReplay"))
      .toMatchObject({ x: 1086, y: 342, w: 78, h: 40 });
  });

  it("renders Ghost Vault custody rows without exposing legacy replay mutations", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.profile({ id: "profile", tab: "vault", tabs: [{ id: "vault", label: "VAULT", selected: true }],
      name: "Guest", signedIn: false, stats: [], replays: [{ id: "capsule:run-1", title: "Ghost V3 - COACHING",
        detail: "COMPLETE - 3 CHUNKS", available: false, badge: "DURABLE CAPSULE" }] });
    expect(controls.find((control) => control.action.type === "profile.watchGhostCapsule"))
      .toMatchObject({ enabled: false, label: "◆ THEATER", action: { type: "profile.watchGhostCapsule", id: "capsule:run-1" } });
    expect(controls.some((control) => control.action.type === "profile.pinReplay")).toBe(false);
    expect(controls.some((control) => control.action.type === "profile.deleteReplay")).toBe(false);
  });

  it("routes a healthy Ghost Vault capsule to Theater through a distinct semantic action", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.profile({ id: "profile", tab: "vault", tabs: [{ id: "vault", label: "VAULT", selected: true }],
      name: "Guest", signedIn: false, stats: [], replays: [{ id: "verified-capsule", title: "Ghost V3 - COACHING",
        detail: "COMPLETE - 3 CHUNKS - HEALTHY", available: true, badge: "DURABLE CAPSULE" }] });
    expect(controls.find((control) => control.action.type === "profile.watchGhostCapsule"))
      .toMatchObject({ enabled: true, label: "◆ THEATER", action: { type: "profile.watchGhostCapsule", id: "verified-capsule" } });
  });

  it("renders a refused Ghost Theater route as disabled without exposing decoder detail", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.profile({ id: "profile", tab: "vault", tabs: [{ id: "vault", label: "VAULT", selected: true }],
      name: "Guest", signedIn: false, stats: [], replays: [{ id: "refused-capsule", title: "Ghost V3 - COACHING",
        detail: "COMPLETE - 3 CHUNKS - HEALTHY", available: false, theaterUnavailable: true, badge: "DURABLE CAPSULE" }] });
    expect(controls.find((control) => control.action.type === "profile.watchGhostCapsule"))
      .toMatchObject({ label: "THEATER UNAVAILABLE", enabled: false });
    expect(JSON.stringify(controls)).not.toContain("codec restore rejected");
  });

  it("offers a semantic repair action only for an unhealthy Vault capsule", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.profile({ id: "profile", tab: "vault", tabs: [{ id: "vault", label: "VAULT", selected: true }],
      name: "Guest", signedIn: false, stats: [], replays: [{ id: "damaged-capsule", title: "Ghost V3 - COACHING",
        detail: "COMPLETE - 3 CHUNKS - NEEDS REPAIR", available: false, repairable: true, badge: "DURABLE CAPSULE" }] });
    expect(controls.find((control) => control.action.type === "profile.repairGhostCapsule"))
      .toMatchObject({ label: "REPAIR", x: 968, y: 342, w: 110, h: 40, action: { type: "profile.repairGhostCapsule", id: "damaged-capsule" } });
    expect(controls.some((control) => control.action.type === "profile.watchReplay")).toBe(false);
  });

  it("declares every legacy-only parity field needed before old screen ranges can be deleted", () => {
    const contracts = readFileSync(fileURLToPath(new URL("../../src/presentation/screens/contracts.ts", import.meta.url)), "utf8");
    for (const field of [
      "bossChoices", "bounties", "guide", "tierCount", "previewId", "passport", "finest", "records", "journey",
      "dailies", "resetsIn", "nextUp", "podium", "ownRank", "chapters", "infoRows", "loadout", '"cycle"',
    ]) expect(contracts).toContain(field);
  });
});
