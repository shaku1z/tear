import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../presentation/screens/live-screen-renderers";
import type { LegacyAppScreen } from "./legacy-state-controller";
import type { VisualRecordingV2, VisualSpawnEvent } from "../replay/visual-replay";
import type { ReplayPuppet } from "../presentation/replay-world-frame";
import type { ReplayPuppetSource } from "../presentation/replay-puppet-factory";
import type { VariantEnemy } from "../gameplay/variants";
import { createReplayPuppet } from "../presentation/replay-puppet-factory";
import { renderReplayWorldFrame } from "../presentation/replay-world-frame";
import { buildReplayScreenSnapshot } from "../presentation/replay-snapshots";
import { handleReplayTransport } from "./replay-transport-controller";

type Dependencies = Pick<GameRuntimeDependencies, "APP" | "Armored" | "Backdrop" | "Bomber" | "Charger" | "Chimera" |
  "CONFIG" | "FX" | "Flyer" | "GFX" | "GHOST" | "Input" | "Ranged" | "SAFE" | "STAGES" | "Support" | "THEME" |
  "UI" | "UPGRADES" | "VARIANTS" | "Wraith" | "applyVariant" | "stageAt" | "stagePlatforms">;
type Renderers = ReturnType<typeof createLiveScreenRenderers>;
type Platform = ReturnType<GameRuntimeDependencies["stagePlatforms"]>[number];
type VariantPuppet = ReplayPuppetSource & VariantEnemy;

interface ReplayContext {
  readonly data: VisualRecordingV2; readonly from: LegacyAppScreen;
  stage: number; platforms: readonly Platform[]; readonly puppets: Record<string, ReplayPuppet | null | undefined>; info: boolean;
}
export interface ReplayStatus { readonly paused: boolean; readonly speed: number; readonly infoVisible: boolean;
  readonly progress: number; readonly from: LegacyAppScreen }
export interface ReplayScreenServices {
  readonly dependencies: Dependencies; readonly renderers: Renderers; readonly canvas: CanvasRenderingContext2D;
  readonly width: number; readonly height: number; readonly screenRectangle: () => Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly time: () => number; readonly deltaSeconds: () => number; readonly fallbackPlayer: () => unknown;
  readonly bossById: (id: string) => unknown; readonly setScreen: (screen: LegacyAppScreen, context?: Readonly<{ returnTo: LegacyAppScreen }>) => void;
  readonly categories: () => Readonly<Record<string, Readonly<{ name: string; color: string }>>>;
  readonly fallbackCategory: () => Readonly<{ name: string; color: string }>;
  readonly specialColor: () => string; readonly formatTime: (seconds: number) => string; readonly document: Document;
}
export interface ReplayScreenAdapter {
  readonly enter: (data: unknown, from?: LegacyAppScreen) => boolean; readonly exit: () => void; readonly render: () => void;
  readonly togglePause: () => void; readonly seekBy: (delta: number) => void; readonly seekToFraction: (fraction: number) => void;
  readonly jumpChapter: (direction: number) => void; readonly restart: () => void; readonly toggleInfo: () => void;
  readonly setSpeed: (value: number) => void; readonly status: () => ReplayStatus | null;
}

function isVariantPuppet(value: unknown): value is VariantPuppet {
  if (typeof value !== "object" || value === null) return false;
  return "x" in value && typeof value.x === "number" && "y" in value && typeof value.y === "number" &&
    "kind" in value && typeof value.kind === "string" && "hp" in value && typeof value.hp === "number" &&
    "hpDisplay" in value && typeof value.hpDisplay === "number" && "spawnT" in value && typeof value.spawnT === "number" &&
    "behavior" in value && typeof value.behavior === "string" &&
    "contactReach" in value && typeof value.contactReach === "number" &&
    "speedMult" in value && typeof value.speedMult === "number" &&
    "maxHp" in value && typeof value.maxHp === "number";
}

export function createLiveReplayScreenAdapterRuntime(services: ReplayScreenServices): ReplayScreenAdapter {
  const d = services.dependencies;
  let context: ReplayContext | null = null;
  const supportKind = (kind: string): "anchor" | "priest" | "herald" | "mender" =>
    kind === "anchor" || kind === "herald" || kind === "mender" ? kind : "priest";
  const puppetFor = (spawn: VisualSpawnEvent): ReplayPuppet | null => createReplayPuppet<VariantPuppet, GameRuntimeDependencies["VARIANTS"][string][number]>(spawn, {
    boss: (id) => {
      const candidate = services.bossById(id);
      return isVariantPuppet(candidate) ? candidate : new d.Charger(0, 0);
    }, charger: () => new d.Charger(0, 0), ranged: () => new d.Ranged(0, 0),
    flyer: () => new d.Flyer(0, 200), bomber: () => new d.Bomber(0, 0), armored: () => new d.Armored(0, 0),
    support: (kind) => new d.Support(0, 0, supportKind(kind)), wraith: () => new d.Wraith(0, 220), chimera: () => new d.Chimera(0, 0),
  }, d.VARIANTS, d.applyVariant);
  const enter = (data: unknown, from: LegacyAppScreen = "menu"): boolean => {
    const playback = d.GHOST.begin(data); if (playback === null) return false;
    context = { data: playback.d, from, stage: -1, platforms: [], puppets: {}, info: false };
    services.setScreen("replay", { returnTo: from }); services.document.exitPointerLock(); return true;
  };
  const exit = (): void => { d.GHOST.end(); const destination = context?.from ?? d.APP.replayReturn; context = null; services.setScreen(destination); };
  const render = (): void => {
    if (context === null) { services.setScreen(d.APP.replayReturn); return; }
    const replay = context, data = replay.data;
    d.GHOST.update(services.deltaSeconds());
    const stageIndex = (d.GHOST.stageAt() % d.STAGES.length + d.STAGES.length) % d.STAGES.length;
    if (stageIndex !== replay.stage) { replay.stage = stageIndex; replay.platforms = d.stagePlatforms(stageIndex); }
    const stage = d.stageAt(stageIndex), pose = d.GHOST.pose(); d.THEME.set(stage.bg); d.UI.ink = d.THEME.ink;
    renderReplayWorldFrame({ canvas: services.canvas, screen: services.screenRectangle(), width: services.width, stage,
      platforms: replay.platforms, platformIsFloor: (platform) => "floor" in platform && platform.floor, backdrop: d.Backdrop, effects: d.FX,
      ghost: d.GHOST, ...(pose === null ? {} : { pose }), puppets: replay.puppets, createPuppet: puppetFor,
      fallbackPlayer: services.fallbackPlayer(), themeInk: d.THEME.ink, perfectColor: d.CONFIG.colors.perfect,
      slamColor: d.CONFIG.colors.slam, lowGraphics: d.GFX.low, time: services.time(), deltaSeconds: services.deltaSeconds() });
    const modeId = String(data.mode), mode = d.CONFIG.modes.find((entry) => entry.id === modeId)?.label ?? modeId;
    const playback = d.GHOST.play, duration = d.GHOST.duration(); if (playback === null) return;
    const scrubY = services.height - 96 - d.SAFE.b, scrubX = 220 + d.SAFE.l;
    handleReplayTransport({ controls: d.Input, currentTime: playback.t, duration,
      scrub: { x: scrubX, y: scrubY, width: services.width - 440 - d.SAFE.l - d.SAFE.r },
      seek: (seconds) => { d.GHOST.seek(seconds); }, toggle: () => { d.GHOST.toggle(); } });
    services.renderers.replay(buildReplayScreenSnapshot({ data, modeLabel: mode, playback, duration,
      progress: d.GHOST.progress(), stageName: stage.name, wave: d.GHOST.waveAt(), chapters: d.GHOST.chapters(),
      infoVisible: replay.info, upgrades: d.UPGRADES, categories: services.categories(), fallbackCategory: services.fallbackCategory(),
      specialColor: services.specialColor(), formatTime: services.formatTime }));
  };
  const adapter: ReplayScreenAdapter = { enter, exit, render, togglePause: () => { d.GHOST.toggle(); },
    seekBy: (delta) => { d.GHOST.seek((d.GHOST.play?.t ?? 0) + delta); }, seekToFraction: (fraction) => { d.GHOST.seek(d.GHOST.duration() * fraction); },
    jumpChapter: (direction) => { d.GHOST.jumpChapter(direction); }, restart: () => { d.GHOST.seek(0); if (d.GHOST.play !== null) d.GHOST.play.playing = true; },
    toggleInfo: () => { if (context !== null) context.info = !context.info; }, setSpeed: (value) => { if (d.GHOST.play !== null) d.GHOST.play.speed = value; },
    status: () => context === null || d.GHOST.play === null ? null : { paused: !d.GHOST.play.playing, speed: d.GHOST.play.speed,
      infoVisible: context.info, progress: d.GHOST.progress(), from: context.from },
  };
  return Object.freeze(adapter);
}
