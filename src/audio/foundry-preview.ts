import type { MusicScene } from "./music-contracts";
import type { StemCueManifest, Tier } from "./stems/types";

export interface FoundryPreviewRequest {
  readonly sessionId: string;
  readonly fixedTier: Tier;
  readonly mode?: "fixed" | "adaptive" | "full" | "calm" | "dynamic";
  readonly scenarioScene?: MusicScene;
  readonly bossPhase?: number;
  readonly telemetryUrl?: string;
  readonly telemetryToken?: string;
}

export interface FoundryAudioPreviewProbe {
  readonly format: "tear-foundry-audio-preview-probe";
  readonly version: 1;
  readonly sessionId: string;
  readonly cueId: string;
  readonly tier: Tier;
  readonly previewMode: "fixed" | "adaptive" | "full" | "calm" | "dynamic";
  readonly scenarioScene?: MusicScene;
  readonly bossPhase?: number;
  readonly activeStemIds: readonly string[];
  readonly allStemIds: readonly string[];
  readonly sourceSampleRate: number;
  readonly contextSampleRate: number;
  readonly contextState: AudioContextState;
  readonly contextTime: number;
  readonly loopSeconds: number;
  readonly loopIteration: number;
  readonly sourceFrame: number;
  readonly bar: number;
  readonly beat: number;
  readonly decodedMemoryMiB: number;
  readonly barQuantized: boolean;
  readonly scene: MusicScene;
  readonly paused: boolean;
  readonly updates: number;
  readonly effectiveGainsDb: Readonly<Record<string, number>>;
  readonly gainReason:
    | "foundry-fixed-tier"
    | "foundry-adaptive"
    | "foundry-full"
    | "foundry-calm"
    | "foundry-dynamic"
    | "foundry-pause";
  readonly decodeLoadMs: number;
  readonly scheduledTransition: null;
  readonly activeStingers: readonly string[];
  readonly audioUnderruns: null;
  readonly browserAudioCpu: null;
  readonly warnings: readonly string[];
  readonly startedAt: string;
}

declare global {
  interface Window {
    __TEAR_FOUNDRY_AUDIO_PREVIEW__?: FoundryAudioPreviewProbe;
  }
}

export function requestedFoundryPreview(
  search = window.location.search,
): FoundryPreviewRequest | null {
  try {
    const query = new URLSearchParams(search);
    const sessionId = query.get("foundryPreview");
    const tier = Number(query.get("foundryTier") ?? 4);
    if (!sessionId || !/^[a-f0-9]{32}$/u.test(sessionId)) return null;
    if (![0, 1, 2, 3, 4].includes(tier)) return null;
    const rawMode = query.get("foundryPreviewMode");
    if (
      rawMode !== null &&
      !["fixed", "adaptive", "full", "calm", "dynamic"].includes(rawMode)
    )
      return null;
    const rawScene = query.get("foundryPreviewScene");
    if (
      rawScene !== null &&
      ![
        "main-menu",
        "preparation",
        "combat",
        "boss",
        "draft",
        "paused",
        "victory",
        "defeat",
      ].includes(rawScene)
    )
      return null;
    const rawBossPhase = query.get("foundryBossPhase");
    const bossPhase = rawBossPhase === null ? undefined : Number(rawBossPhase);
    if (
      bossPhase !== undefined &&
      (!Number.isInteger(bossPhase) || bossPhase < 1 || bossPhase > 9)
    )
      return null;
    const telemetryUrl = query.get("foundryTelemetry");
    const telemetryToken = query.get("foundryTelemetryToken");
    let safeTelemetryUrl: string | undefined;
    if (telemetryUrl && telemetryToken && telemetryToken.length >= 20) {
      const parsed = new URL(telemetryUrl);
      if (
        parsed.protocol === "http:" &&
        (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
      )
        safeTelemetryUrl = parsed.href;
    }
    return {
      sessionId,
      fixedTier: tier as Tier,
      ...(rawMode
        ? {
            mode: rawMode as
              | "fixed"
              | "adaptive"
              | "full"
              | "calm"
              | "dynamic",
          }
        : {}),
      ...(rawScene
        ? { scenarioScene: rawScene as MusicScene }
        : {}),
      ...(bossPhase === undefined ? {} : { bossPhase }),
      ...(safeTelemetryUrl && telemetryToken
        ? { telemetryUrl: safeTelemetryUrl, telemetryToken }
        : {}),
    };
  } catch {
    return null;
  }
}

export function createFoundryPreviewProbe(
  request: FoundryPreviewRequest,
  cue: StemCueManifest,
  context: Pick<AudioContext, "sampleRate" | "currentTime" | "state">,
  decodeLoadMs = 0,
): (
  scene: MusicScene,
  tier?: Tier,
  gainReason?: FoundryAudioPreviewProbe["gainReason"],
) => void {
  const loopFrames = cue.loop.endFrame - cue.loop.startFrame;
  const channels = cue.stems.reduce((sum, stem) => sum + stem.channels, 0);
  const startedAt = new Date().toISOString();
  const startedAtContext = context.currentTime;
  let updates = 0;
  let lastPostedAt = 0;
  let lastScene: MusicScene | null = null;
  return (
    scene: MusicScene,
    tier = request.fixedTier,
    gainReason = "foundry-fixed-tier",
  ): void => {
    updates += 1;
    const elapsed = Math.max(0, context.currentTime - startedAtContext);
    const loopSeconds = loopFrames / cue.sourceSampleRate;
    const loopPosition = loopSeconds > 0 ? elapsed % loopSeconds : 0;
    const sourceFrame =
      cue.loop.startFrame +
      Math.min(loopFrames - 1, Math.floor(loopPosition * cue.sourceSampleRate));
    const secondsPerBar =
      cue.grid.barsPerLoop > 0 ? loopSeconds / cue.grid.barsPerLoop : loopSeconds;
    const barPosition = secondsPerBar > 0 ? loopPosition / secondsPerBar : 0;
    const duplicateIds =
      new Set(cue.stems.map((stem) => stem.id)).size !== cue.stems.length;
    const probe: FoundryAudioPreviewProbe = {
      format: "tear-foundry-audio-preview-probe",
      version: 1,
      sessionId: request.sessionId,
      cueId: cue.id,
      tier,
      previewMode: request.mode ?? "fixed",
      ...(request.scenarioScene
        ? { scenarioScene: request.scenarioScene }
        : {}),
      ...(request.bossPhase === undefined
        ? {}
        : { bossPhase: request.bossPhase }),
      activeStemIds: Object.keys(cue.tiers[tier]),
      allStemIds: cue.stems.map((stem) => stem.id),
      sourceSampleRate: cue.sourceSampleRate,
      contextSampleRate: context.sampleRate,
      contextState: context.state,
      contextTime: +context.currentTime.toFixed(4),
      loopSeconds,
      loopIteration: loopSeconds > 0 ? Math.floor(elapsed / loopSeconds) : 0,
      sourceFrame,
      bar: Math.floor(barPosition) + 1,
      beat:
        Math.floor(
          (barPosition - Math.floor(barPosition)) * cue.grid.beatsPerBar,
        ) + 1,
      decodedMemoryMiB: +(
        (loopFrames * channels * 4) /
        1024 ** 2
      ).toFixed(2),
      barQuantized: cue.grid.barQuantizedCompatible !== false,
      scene,
      paused: scene === "paused",
      updates,
      effectiveGainsDb: cue.tiers[tier],
      gainReason,
      decodeLoadMs: +decodeLoadMs.toFixed(2),
      scheduledTransition: null,
      activeStingers: [],
      audioUnderruns: null,
      browserAudioCpu: null,
      warnings: duplicateIds ? ["duplicate-stem-id"] : [],
      startedAt,
    };
    window.__TEAR_FOUNDRY_AUDIO_PREVIEW__ = probe;
    const now = Date.now();
    if (
      request.telemetryUrl &&
      request.telemetryToken &&
      (scene !== lastScene || now - lastPostedAt >= 1_000)
    ) {
      lastPostedAt = now;
      lastScene = scene;
      void fetch(request.telemetryUrl, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          "X-Foundry-Preview-Token": request.telemetryToken,
        },
        body: JSON.stringify(probe),
      }).catch(() => undefined);
    }
  };
}

export function clearFoundryPreviewProbe(): void {
  delete window.__TEAR_FOUNDRY_AUDIO_PREVIEW__;
}
