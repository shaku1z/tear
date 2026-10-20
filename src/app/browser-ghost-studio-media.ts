import { isDrawableEnemy, projectPresentationEnemy, projectSceneBoss } from "./live-world-presentation-adapters";
import { A11Y, GFX, THEME } from "../config/game-config";
import { stageAt } from "../gameplay/stages";
import { clamp, len, lerp } from "../domain/geometry";
import { createBackdrop } from "../presentation/backdrop";
import { createProductionReplayFrame } from "../presentation/world/production-replay-frame";
import { buildEntityLayerSnapshot, buildSceneEffectsSnapshot } from "../presentation/world/runtime-snapshots";
import { formatEnemyLabel } from "../presentation/world/entity-layer";
import { buildEnvironmentPresentationSnapshot } from "../gameplay/environment/presentation-snapshot";
import { renderVerdantEnvironmentPresentation } from "../presentation/environment/verdant-environment-presentation";
import { renderPaleEnvironmentPresentation } from "../presentation/environment/pale-environment-presentation";
import { projectBloomWellPresentation } from "../gameplay/environment/bloom-well-presentation-facts";
import { renderBloomWellPresentation } from "../presentation/environment/bloom-well-presentation";
import { createLiveWorldSimulationPresentationAdapter, type LiveWorldSimulationPresentationAdapterOptions } from "./live-world-simulation-factories";
import type { ProductionReplayPresentationContext } from "../tearbench/production-world-factory";
import type { ProductionGhostReplayCompositionOptions } from "../tearbench/production-replay-composition";
import type { GhostReadCapsule } from "../ghost/capsule-reader";
import type { GhostVerifiedProductionReplaySession } from "../ghost/production-replay-session";
import { createStudioEdl, renderStudioMediaLocally, type GhostStudioEditDecisionList } from "../ghost/player-experiences";
import { parseGhostApplicationClockEvent } from "../ghost/application-frame-events";
import { mapGhostCapsuleToReplayEnvelope } from "../ghost/capsule-replay-envelope";
import { stableVerificationHash } from "../replay/hash";

type Ui = LiveWorldSimulationPresentationAdapterOptions["ui"];
/** Each reconstructed world gets its own theme, backdrop caches, FX and renderer constructors. */
export function createBrowserGhostReplayPresentation(document: Document, ui: Ui): Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView"> {
  const owners = new WeakMap<object, Readonly<{ theme: typeof THEME; backdrop: ReturnType<typeof createBackdrop>; graphics: typeof GFX; accessibility: typeof A11Y }>>();
  return {
    presentation(context: ProductionReplayPresentationContext) {
      const theme = { ...THEME }, graphics = { ...GFX }, accessibility = { ...A11Y };
      const backdrop = createBackdrop({ clock: context.clock, config: context.config, graphics, accessibility, theme,
        overscan: { x: 0, y: 0 }, createCanvas: () => document.createElement("canvas"), performance });
      owners.set(context.clock, { theme, backdrop, graphics, accessibility });
      return createLiveWorldSimulationPresentationAdapter({ clock: context.clock, effects: context.effects, ui,
        configuration: { config: context.config, theme, graphics, accessibility }, geometry: { clamp, len, lerp }, cosmeticRandom: context.cosmeticRandom });
    },
    renderView(replay, tick, screen) {
      const owner = owners.get(replay.clock); if (owner === undefined) throw new Error("replay renderer is unavailable");
      const { theme, backdrop, graphics, accessibility } = owner, config = replay.configuration.value;
      const state = replay.world.state, run = state.run(), player = state.player(), blade = state.blade(), stage = stageAt(replay.stage.index);
      if (run === null || player === undefined || blade === undefined) throw new TypeError("replay world has no drawable actors");
      theme.set(stage.bg);
      const width = config.view.w, height = config.view.h, zoom = 1.15;
      const enemies = state.enemies(), environment = replay.world.context.environment.snapshot();
      const presentationOptions = { highContrast: accessibility.highContrast, reducedMotion: accessibility.reducedMotion,
        lowGraphics: graphics.low, flashScale: accessibility.flashScale, timeSeconds: replay.clock.sim };
      const platforms = replay.stage.platforms.map((value) => {
        if (value === null || typeof value !== "object") throw new TypeError("replay platform is malformed");
        const number = (key: string) => { const field: unknown = Reflect.get(value, key); if (typeof field !== "number" || !Number.isFinite(field)) throw new TypeError(`replay platform ${key} is invalid`); return field; };
        const crack: unknown = Reflect.get(value, "crackT");
        return { ...value, x: number("x"), y: number("y"), w: number("w"), h: number("h"), crackT: typeof crack === "number" ? crack : 0 };
      });
      const drawableEnemies = enemies.map((enemy) => {
        if (!isDrawableEnemy(enemy)) throw new TypeError("replay enemy renderer is unavailable");
        return projectPresentationEnemy(enemy);
      });
      const sceneEffects = buildSceneEffectsSnapshot({ voidActive: Boolean(run.voidScroll?.active),
        enemies: enemies.map(projectSceneBoss),
        platforms,
        walls: state.temporaryWalls(), slowZones: state.slowZones(), width, height, groundY: config.world.groundY,
        timeMilliseconds: replay.clock.sim * 1000, lowGraphics: graphics.low, highContrast: accessibility.highContrast,
        darkTheme: theme.dark, ink: theme.ink, defaultZoneWidth: config.warden.zoneW, colors: config.colors,
        seamLife: config.aldric.seamLife, trailLife: config.warden.trailLife });
      let activeCanvas: CanvasRenderingContext2D | undefined;
      const frame = createProductionReplayFrame({ tick, clockSeconds: replay.clock.sim, screen,
        clockBlocked: state.bossIntro() !== null || replay.world.context.cinema.active,
        cameraX: clamp(player.x, width / (2 * zoom), width - width / (2 * zoom)), cameraY: height / 2,
        ports: { width, height, zoom, shake: 0, playing: false, random: () => 0.5, biome: true, debug: false,
          timeSeconds: replay.clock.sim, reducedMotion: accessibility.reducedMotion, stage, playerX: player.x, sceneEffects,
          enemies: buildEntityLayerSnapshot({ enemies: drawableEnemies, sandbox: run.mode === "sandbox", player, formatLabel: formatEnemyLabel, drawStatus: () => undefined }),
          player: { x: player.x, y: player.y, halfWidth: player.hw, halfHeight: player.hh },
          entityOptions: { darkTheme: theme.dark, sandbox: run.mode === "sandbox", buffColors: config.colors, font: (size, bold) => ui.font(size, bold) },
          floaters: state.floaters().map((floater) => ({ x: floater.x, y: floater.y, text: floater.text, color: floater.col, life: floater.life, big: floater.big })),
          brokenPlatforms: run._arenaBroken ?? [], platforms, projectiles: state.projectiles(),
          setEffectView: (bounds) => { replay.effects.setViewRect(bounds); },
          drawBackdrop: (_stage, seconds, x, bounds) => { backdrop.draw(replayCanvas(), stage, seconds, x, bounds); },
          drawPlatform: (platform, _stage, floor, bounds) => { backdrop.platform(replayCanvas(), platform, stage, floor, bounds); },
          drawFinale: () => undefined, drawTutorialGhost: () => undefined, tutorialActive: false,
          drawPlayer: () => { player.draw(replayCanvas()); }, drawBlade: () => { blade.draw(replayCanvas(), player); },
          drawEffects: () => { replay.effects.draw(replayCanvas()); }, drawDebug: () => undefined,
          drawEnvironment: () => {
            const canvas = replayCanvas(), projection = buildEnvironmentPresentationSnapshot(environment);
            renderVerdantEnvironmentPresentation(canvas, projection, presentationOptions); renderPaleEnvironmentPresentation(canvas, projection, presentationOptions);
            for (const field of environment.fields) if (field.kind === "bloom-well") renderBloomWellPresentation(canvas,
              projectBloomWellPresentation(field, { ...presentationOptions, audioEnabled: false }), replay.clock.sim);
          },
        } });
      return Object.freeze({ ...frame, draw(canvas: CanvasRenderingContext2D, rectangle: Parameters<typeof frame.draw>[1]) {
        if (activeCanvas !== undefined) throw new Error("replay draw is reentrant");
        activeCanvas = canvas; try { frame.draw(canvas, rectangle); } finally { activeCanvas = undefined; }
      } });
      function replayCanvas(): CanvasRenderingContext2D { if (activeCanvas === undefined) throw new Error("replay draw has no target"); return activeCanvas; }
    },
  };
}

export interface GhostStudioWebmArtifact {
  readonly fileName: string; readonly mimeType: "video/webm"; readonly bytes: Uint8Array; readonly thumbnail: string;
  readonly sourceId: string; readonly sourceRootHash: string; readonly sourceCapsuleRootIntegrity: string; readonly edlHash: string;
  readonly width: number; readonly height: number; readonly durationSeconds: number; readonly frameCount: number;
  readonly clock: "simulation-time-120hz"; readonly camera: "reconstructed-player-follow"; readonly frameScheduleHash: string;
}
export interface GhostStudioBrowserMediaPort {
  available(): boolean;
  render(capsule: GhostReadCapsule, session: GhostVerifiedProductionReplaySession, edl: GhostStudioEditDecisionList, signal: AbortSignal): Promise<GhostStudioWebmArtifact>;
  download(artifact: GhostStudioWebmArtifact, signal: AbortSignal): Promise<void>;
  drawThumbnail?(canvas: CanvasRenderingContext2D, rectangle: Readonly<{ x: number; y: number; w: number; h: number }>): void;
  dispose(): void;
}
const MAX_FRAMES = 1800, MAX_BYTES = 64 * 1024 * 1024, FPS = 30;
function mediaWait(target: EventTarget, event: string, signal: AbortSignal, milliseconds = 10000, activate?: () => void): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown): void => { clearTimeout(timer); target.removeEventListener(event, done); signal.removeEventListener("abort", aborted); if (error === undefined) resolve(); else reject(error instanceof Error ? error : new Error("Media operation failed", { cause: error })); };
    const done = (): void => { finish(); }, aborted = (): void => { finish(signal.reason); };
    const timer = setTimeout(() => { finish(new Error(`WebM ${event} timed out`)); }, milliseconds);
    target.addEventListener(event, done, { once: true }); signal.addEventListener("abort", aborted, { once: true });
    try { activate?.(); } catch (error) { finish(error); }
  });
}
function mediaPaint(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error): void => { cancelAnimationFrame(frame); clearTimeout(timer); signal.removeEventListener("abort", abort); if (error === undefined) resolve(); else reject(error); };
    const abort = (): void => { finish(new Error("Studio paint cancelled", { cause: signal.reason })); };
    const timer = setTimeout(() => { finish(new Error("Studio paint timed out")); }, 5000);
    const frame = requestAnimationFrame(() => { finish(); }); signal.addEventListener("abort", abort, { once: true });
  });
}
/** Browser-native local encoding of the dedicated reconstructed replay canvas, never the live game surface. */
export function createBrowserGhostStudioMedia(document: Document, current: (id: string, manifestHash: string) => Promise<boolean>): GhostStudioBrowserMediaPort {
  const urls = new Set<string>(), timers = new Set<ReturnType<typeof setTimeout>>();
  const release = (url: string): void => { URL.revokeObjectURL(url); urls.delete(url); };
  const mime = (): string | undefined => typeof MediaRecorder === "undefined" ? undefined
    : ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
  let last: Readonly<{ artifact: GhostStudioWebmArtifact; manifestHash: string; image: HTMLImageElement }> | undefined;
  const check = async (id: string, hash: string, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted(); if (!(await current(id, hash))) throw new Error("Studio source custody changed"); signal.throwIfAborted();
  };
  return {
    available: () => mime() !== undefined && typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function",
    async render(capsule, session, edl, signal) {
      const type = mime(); if (type === undefined) throw new Error("This browser has no supported WebM encoder. GIF is unavailable.");
      if (session.renderFrame === undefined || capsule.manifest.id !== session.sourceId || capsule.manifest.rootIntegrity !== session.sourceCapsuleRootIntegrity
        || edl.sourceGhostId !== session.sourceId || edl.sourceRootHash !== session.sourceRootHash || createStudioEdl(edl).edlHash !== edl.edlHash) throw new TypeError("Studio source/EDL binding is invalid");
      const ratios: Readonly<Partial<Record<string, number>>> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:3": 4 / 3 }, ratio = ratios[edl.aspectRatio];
      if (ratio === undefined || edl.clips.length === 0 || new Set(edl.clips.map((clip) => clip.outputOrder)).size !== edl.clips.length) throw new TypeError("Studio output layout/order is invalid");
      const clips = [...edl.clips].sort((a, b) => a.outputOrder - b.outputOrder);
      const plan: number[] = [];
      for (const clip of clips) {
        if (clip.camera !== "player-follow" || ![.25, .5, 1, 2, 4].includes(clip.speed) || !Number.isSafeInteger(clip.sourceFromTick)
          || !Number.isSafeInteger(clip.sourceToTick) || clip.sourceFromTick < 0 || clip.sourceToTick <= clip.sourceFromTick || clip.sourceToTick > capsule.maxTick
          || !Number.isSafeInteger(clip.outputOrder)) throw new TypeError("Studio clip is unsupported or outside its source");
        // Only simulation-time gameplay is offered. Never collapse recorded zero-tick cinema/intro frames into inferred physics time.
        if (capsule.tracks.events.some((entry) => {
          const value = parseGhostApplicationClockEvent(entry.value)?.payload;
          return value?.format === "tearghost-application-frame" && value.kind === "begin"
            && value.beforeTick >= clip.sourceFromTick && value.beforeTick < clip.sourceToTick;
        })) throw new TypeError("Source-time cinema/intro media is unavailable; choose a gameplay-only range");
        const count = Math.ceil((clip.sourceToTick - clip.sourceFromTick) * FPS / (120 * clip.speed));
        if (count + plan.length > MAX_FRAMES) throw new RangeError("Studio output exceeds 1800 frames / 60 seconds");
        for (let index = 0; index < count; index++) plan.push(Math.min(clip.sourceToTick - 1, clip.sourceFromTick + Math.floor(index * 120 * clip.speed / FPS)));
      }
      const width = Math.round(Math.min(640, 640 * ratio) / 2) * 2, height = Math.round(width / ratio / 2) * 2;
      const manifestHash = stableVerificationHash(capsule.manifest); await check(session.sourceId, manifestHash, signal);
      last = undefined;
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false }); if (context === null) throw new Error("Studio canvas is unavailable");
      let scheduleHash = stableVerificationHash({ edlHash: edl.edlHash, width, height, fps: FPS, clock: "simulation-time-120hz", camera: "reconstructed-player-follow" });
      const draw = (index: number): void => {
        signal.throwIfAborted(); const tick = plan[index]; if (tick === undefined) throw new Error("Studio frame plan is incomplete");
        const view = session.renderFrame?.(tick);
        if (view?.sourceRootHash !== edl.sourceRootHash || view.sourceCapsuleRootIntegrity !== capsule.manifest.rootIntegrity
          || view.clockBlocked || view.screen !== "playing") throw new TypeError("This frame is not supported gameplay-time media");
        view.draw(context, { x: 0, y: 0, w: width, h: height });
        scheduleHash = stableVerificationHash({ prior: scheduleHash, tick, stateHash: view.semanticHash });
      };
      draw(0); const thumbnail = canvas.toDataURL("image/png");
      const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      if (track === undefined || typeof track.requestFrame !== "function") { stream.getTracks().forEach((item) => { item.stop(); }); throw new Error("Manual replay canvas capture is unavailable"); }
      let recorder: MediaRecorder;
      try { recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2000000 }); }
      catch (error) { stream.getTracks().forEach((item) => { item.stop(); }); throw error; }
      const chunks: Blob[] = []; let bytes = 0, encodingError: Error | undefined;
      recorder.addEventListener("dataavailable", (event) => { bytes += event.data.size; if (bytes > MAX_BYTES) { encodingError = new RangeError("Studio media exceeds 64 MiB"); if (recorder.state !== "inactive") recorder.stop(); } else if (event.data.size > 0) chunks.push(event.data); });
      recorder.addEventListener("error", () => { encodingError = new Error("Browser WebM encoding failed"); });
      const abort = (): void => { if (recorder.state !== "inactive") recorder.stop(); };
      signal.addEventListener("abort", abort, { once: true });
      try {
        // Native encoder startup is asynchronous. Its acknowledged start owns output time,
        // not the preceding replay reconstruction or MediaRecorder.start() call.
        await mediaWait(recorder, "start", signal, 10000, () => {
          recorder.start(250);
          // Canvas capture can require a first frame to acknowledge native startup.
          // Prime only the accepted opening image; no subsequent source time is consumed.
          track.requestFrame(); draw(0);
        });
        const started = performance.now();
        for (let index = 0; index < plan.length; index++) {
          signal.throwIfAborted(); if (encodingError !== undefined) throw encodingError;
          // Capture is requested before a fresh canvas update, then allowed to reach paint.
          // This also redraws the first frame after the encoder has actually started.
          track.requestFrame(); draw(index); await mediaPaint(signal);
          const delay = Math.max(0, started + (index + 1) * 1000 / FPS - performance.now());
          await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
          if (performance.now() - started > 90000) throw new Error("Studio encoding exceeded its 90 second work budget");
        }
        const stopped = mediaWait(recorder, "stop", signal); recorder.stop(); await stopped; signal.throwIfAborted();
        if (encodingError !== undefined) throw encodingError;
        const blob = new Blob(chunks, { type: "video/webm" }); if (blob.size === 0 || blob.size > MAX_BYTES) throw new Error("WebM encoder returned invalid output size");
        const url = URL.createObjectURL(blob); urls.add(url); const video = document.createElement("video"); video.muted = true; video.preload = "auto";
        let durationSeconds: number;
        try {
          const loaded = mediaWait(video, "loadedmetadata", signal); video.src = url; await loaded;
          if (!Number.isFinite(video.duration)) { const sought = mediaWait(video, "seeked", signal); video.currentTime = 1000000; await sought; }
          durationSeconds = Number.isFinite(video.duration) ? video.duration : video.currentTime + 1 / FPS;
          if (video.videoWidth !== width || video.videoHeight !== height || !Number.isFinite(durationSeconds)
            || Math.abs(durationSeconds - plan.length / FPS) > Math.max(.35, plan.length / FPS * .05)) throw new Error("Decoded WebM dimensions/duration do not match the requested output");
        } finally { video.removeAttribute("src"); video.load(); release(url); }
        await check(session.sourceId, manifestHash, signal);
        const exported = await renderStudioMediaLocally(mapGhostCapsuleToReplayEnvelope(capsule).ghost, edl, {
          render: async () => ({ mimeType: "video/webm", bytes: new Uint8Array(await blob.arrayBuffer()), thumbnail }),
        });
        const artifact = Object.freeze({ ...exported, mimeType: "video/webm" as const,
          sourceId: session.sourceId, sourceRootHash: session.sourceRootHash, sourceCapsuleRootIntegrity: capsule.manifest.rootIntegrity, edlHash: edl.edlHash,
          width, height, durationSeconds, frameCount: plan.length, clock: "simulation-time-120hz" as const, camera: "reconstructed-player-follow" as const, frameScheduleHash: scheduleHash });
        const image = document.createElement("img"), loadedImage = mediaWait(image, "load", signal); image.src = thumbnail; await loadedImage;
        await check(session.sourceId, manifestHash, signal); last = { artifact, manifestHash, image }; return artifact;
      } finally { signal.removeEventListener("abort", abort); if (recorder.state !== "inactive") recorder.stop(); stream.getTracks().forEach((item) => { item.stop(); }); }
    },
    async download(artifact, signal) {
      const captured = last; if (captured?.artifact !== artifact) throw new Error("Studio output is stale");
      await check(artifact.sourceId, captured.manifestHash, signal); if (last !== captured) throw new Error("Studio output was replaced");
      const url = URL.createObjectURL(new Blob([Uint8Array.from(artifact.bytes).buffer], { type: artifact.mimeType })); urls.add(url);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = artifact.fileName.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 120);
      try { document.body.append(anchor); anchor.click(); } finally { anchor.remove(); const timer = setTimeout(() => { timers.delete(timer); release(url); }, 1000); timers.add(timer); }
    },
    drawThumbnail(canvas, rectangle) { if (last !== undefined) canvas.drawImage(last.image, rectangle.x, rectangle.y, rectangle.w, rectangle.h); },
    dispose() { last = undefined; for (const timer of timers) clearTimeout(timer); timers.clear(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); },
  };
}
