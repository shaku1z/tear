import { migrateAudioSettings } from "../persistence/audio-settings";
import type { MusicContextSnapshot, MusicEvent, MusicRunSessionMetadata } from "./music-contracts";
import type { SFX as RuntimeSfxValue } from "./legacy-synth-runtime";
import type { TearScoreReplayMetadata } from "../replay/envelope";
import { captureAudioContextFromUserGesture, capturedAudioContext, disposeCapturedAudioContext } from "./audio-context-handoff";
import {
  createAudioDispatchJournal,
  type AudioDispatchExecutionResult,
  type AudioDispatchReceiptObserver,
  type AudioDispatchRequest,
} from "./audio-dispatch-receipts";

type RuntimeSfx = typeof RuntimeSfxValue;
type RuntimeAction = (runtime: RuntimeSfx) => void;
type DispatchEntry = ReturnType<ReturnType<typeof createAudioDispatchJournal>["request"]>;
interface QueuedRuntimeAction { readonly action: RuntimeAction; readonly dispatch?: DispatchEntry }

export interface LegacySynthFacadeOptions {
  /** Audio settings are browser-backed even when a test composition uses an isolated general store. */
  readonly readPersistedSettings?: () => Record<string, unknown>;
}

function readBrowserAudioSettings(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem("tear_settings") ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function containsAudioSettings(source: Record<string, unknown>): boolean {
  return ["audio", "vol", "masterVolume", "music", "musicVolume", "sfxVolume", "interfaceVolume"]
    .some((key) => Object.hasOwn(source, key));
}

/**
 * One composition-owned first-gesture facade. The concrete browser audio runtime
 * remains shared intentionally until its own lifecycle is extracted; this
 * factory only prevents queue, receipt, and activation-facade state from being
 * silently shared by multiple application compositions.
 */
export function createLegacySynthFacade(options: LegacySynthFacadeOptions = {}) {
const readPersistedSettings = options.readPersistedSettings ?? readBrowserAudioSettings;
let runtime: RuntimeSfx | undefined;
let loading: Promise<RuntimeSfx | undefined> | undefined;
let initialized = false;
let loadState: "idle" | "loading" | "failed" = "idle";
let pendingSettings: Record<string, unknown> | undefined;
let pendingMusicRun: MusicRunSessionMetadata | undefined;
let pendingMusicContext: MusicContextSnapshot | undefined;
let pendingMusicEnd = false;
const pendingMusicEvents: MusicEvent[] = [];
const queued: QueuedRuntimeAction[] = [];
const dispatchJournal = createAudioDispatchJournal();
let removeActivationBridge: (() => void) | undefined;

function installActivationBridge(): void {
  if (removeActivationBridge !== undefined) return;
  const activate = (): void => { captureAudioContextFromUserGesture(); };
  const pagehide = (event: PageTransitionEvent): void => { if (!event.persisted) disposeCapturedAudioContext(); };
  removeActivationBridge = () => {
    window.removeEventListener("pointerdown", activate);
    window.removeEventListener("keydown", activate);
    window.removeEventListener("pagehide", pagehide);
    removeActivationBridge = undefined;
  };
  window.addEventListener("pointerdown", activate);
  window.addEventListener("keydown", activate);
  window.addEventListener("pagehide", pagehide);
}

function loadRuntime(): Promise<RuntimeSfx | undefined> {
  loadState = "loading";
  loading ??= import("./legacy-synth-runtime").then((module) => {
    runtime = module.SFX;
    runtime.init();
    removeActivationBridge?.();
    if (capturedAudioContext() !== null) runtime.resume();
    if (pendingSettings !== undefined) runtime.applySettings(pendingSettings);
    if (pendingMusicRun !== undefined) runtime.beginMusicRun(pendingMusicRun);
    if (pendingMusicContext !== undefined) runtime.updateMusicContext(pendingMusicContext);
    for (const event of pendingMusicEvents.splice(0)) runtime.emitMusicEvent(event);
    if (pendingMusicEnd) runtime.endMusicRun();
    pendingMusicRun = undefined;
    pendingMusicContext = undefined;
    pendingMusicEnd = false;
    for (const entry of queued.splice(0)) entry.action(runtime);
    return runtime;
  }).catch((error: unknown) => {
    loadState = "failed";
    removeActivationBridge?.();
    disposeCapturedAudioContext();
    for (const entry of queued.splice(0)) if (entry.dispatch !== undefined) dispatchJournal.loadFailed(entry.dispatch);
    console.warn("Tear audio runtime failed to load", error);
    return undefined;
  });
  return loading;
}

function invoke(action: RuntimeAction): void {
  if (runtime) action(runtime);
  else if (loadState !== "failed") {
    if (queued.length >= 64) {
      const evicted = queued.shift();
      if (evicted?.dispatch !== undefined) dispatchJournal.evicted(evicted.dispatch, queued.length);
    }
    queued.push({ action });
  }
}

function invokeObserved(
  request: AudioDispatchRequest,
  action: (audio: RuntimeSfx) => AudioDispatchExecutionResult,
): void {
  const dispatch = dispatchJournal.request(request);
  const execute: RuntimeAction = (audio) => {
    dispatchJournal.executing(dispatch);
    try { dispatchJournal.completed(dispatch, action(audio)); }
    catch (error) { dispatchJournal.executionFailed(dispatch, error); }
  };
  if (runtime) execute(runtime);
  else if (loadState === "failed") dispatchJournal.loadFailed(dispatch);
  else {
    if (queued.length >= 64) {
      const evicted = queued.shift();
      if (evicted?.dispatch !== undefined) dispatchJournal.evicted(evicted.dispatch, queued.length);
    }
    queued.push({ action: execute, dispatch });
    dispatchJournal.queued(dispatch, queued.length);
  }
}

function initialize(): void {
  if (initialized) return;
  initialized = true;
  installActivationBridge();
  void loadRuntime();
}

function migrate(settings: Record<string, unknown>, audioSource: Record<string, unknown> = settings): Record<string, unknown> {
  const candidate: unknown = audioSource === settings ? settings : audioSource.audio;
  const provided = typeof candidate === "object" && candidate !== null
    ? candidate as Record<string, unknown>
    : audioSource;
  const source = containsAudioSettings(provided) ? provided : readPersistedSettings();
  const audio = migrateAudioSettings(source);
  return Object.assign(settings, audio, { vol: audio.masterVolume, music: !audio.musicMuted });
}

function apply(settings: Record<string, unknown>): void {
  pendingSettings = migrate(settings);
  if (runtime) runtime.applySettings(pendingSettings);
}

function cue(action: RuntimeAction): void { invoke(action); }

/** Lightweight first-gesture facade for the concrete synthesized audio runtime. */
return Object.freeze({
  get ctx(): AudioContext | null { return runtime?.ctx ?? null; },
  get musicFilter(): BiquadFilterNode | null { return runtime?.musicFilter ?? null; },
  get _musicDuck(): number { return runtime?._musicDuck ?? 1; },
  get _voidMix(): number { return runtime?._voidMix ?? 0; },
  observeDispatchReceipts(observer: AudioDispatchReceiptObserver) { return dispatchJournal.observe(observer); },
  init() { initialize(); }, resume() { if (runtime) runtime.resume(); else void loadRuntime(); },
  migrateSettings(settings: Record<string, unknown>, audioSource?: Record<string, unknown>) { return migrate(settings, audioSource); },
  applySettings(settings: Record<string, unknown>) { apply(settings); },
  debugSnapshot() {
    if (runtime) return runtime.debugSnapshot();
    const settings = migrateAudioSettings(pendingSettings ?? readPersistedSettings());
    return { state: loadState === "failed" ? "failed" : "awaiting-user-activation", backend: null, settings, runtimeLoadState: loadState,
      score: { scoreVersion: "built-in-scores@0.1.0-alpha.2", run: null, contextSequence: 0, eventSequence: 0 },
      resources: { activeVoices: 0, activeVoiceGraphNodes: 0, voiceCap: 24, noiseBuffers: 0,
        cueRoutes: Object.freeze({}), routeDispatches: Object.freeze({ weapons: 0, enemies: 0, player: 0, environment: 0 }),
        lifecycleInstalled: false, lifecycleListeners: 0 } };
  },
  musicScoreVersion() { return "built-in-scores@0.1.0-alpha.2"; },
  musicReplayMetadata(): TearScoreReplayMetadata { return runtime?.musicReplayMetadata() ?? { enabled: false, reason: "not-recorded" }; },
  beginMusicRun(metadata: MusicRunSessionMetadata) {
    if (runtime) runtime.beginMusicRun(metadata);
    else { pendingMusicRun = metadata; pendingMusicContext = undefined; pendingMusicEnd = false; pendingMusicEvents.splice(0); }
  },
  updateMusicContext(snapshot: MusicContextSnapshot) { if (runtime) runtime.updateMusicContext(snapshot); else pendingMusicContext = snapshot; },
  emitMusicEvent(event: MusicEvent) {
    if (runtime) runtime.emitMusicEvent(event);
    else { if (pendingMusicEvents.length >= 32) pendingMusicEvents.shift(); pendingMusicEvents.push(event); }
  },
  endMusicRun() { if (runtime) runtime.endMusicRun(); else pendingMusicEnd = true; },
  setVol(value: number) { invoke((audio) => { audio.setVol(value); }); },
  setMasterVol(value: number) { invoke((audio) => { audio.setMasterVol(value); }); },
  setMusicVol(value: number) { invoke((audio) => { audio.setMusicVol(value); }); },
  setSfxVol(value: number) { invoke((audio) => { audio.setSfxVol(value); }); },
  setInterfaceVol(value: number) { invoke((audio) => { audio.setInterfaceVol(value); }); },
  setMasterMuted(on: boolean) { invoke((audio) => { audio.setMasterMuted(on); }); },
  setSfxMuted(on: boolean) { invoke((audio) => { audio.setSfxMuted(on); }); },
  setInterfaceMuted(on: boolean) { invoke((audio) => { audio.setInterfaceMuted(on); }); },
  setMusic(on: boolean) { invoke((audio) => { audio.setMusic(on); }); },
  setMusicDuck(amount: number | null | undefined, seconds?: number) {
    invokeObserved({ operation: "music-duck", arguments: [amount ?? 1, seconds ?? 0.18] },
      (audio) => audio.setMusicDuckForReceipt(amount, seconds));
  },
  setVoidDescent(amount: number, seconds?: number) {
    invokeObserved({ operation: "void-mix", arguments: [amount, seconds ?? 0.22] },
      (audio) => audio.setVoidDescentForReceipt(amount, seconds));
  },
  mute(on: boolean, reason?: string) { invoke((audio) => { audio.mute(on, reason); }); },
  setMusicTheme(name: string, boss: boolean) { invoke((audio) => { audio.setMusicTheme(name, boss); }); },
  swing(speed: number) { cue((audio) => { audio.swing(speed); }); },
  hit(big?: boolean) { cue((audio) => { audio.hit(big); }); }, slam() { cue((audio) => { audio.slam(); }); },
  boom() { cue((audio) => { audio.boom(); }); }, launch() { cue((audio) => { audio.launch(); }); },
  updraft() { cue((audio) => { audio.updraft(); }); }, parry() { cue((audio) => { audio.parry(); }); },
  counter() { cue((audio) => { audio.counter(); }); }, deflect() { cue((audio) => { audio.deflect(); }); },
  sourceCross() { cue((audio) => { audio.sourceCross(); }); }, sourceRepel() { cue((audio) => { audio.sourceRepel(); }); },
  aldricFireWarn(step: number) { cue((audio) => { audio.aldricFireWarn(step); }); }, aldricIgnite() { cue((audio) => { audio.aldricIgnite(); }); },
  wardenStaffScrape() { cue((audio) => { audio.wardenStaffScrape(); }); }, wardenStaffWhoosh() { cue((audio) => { audio.wardenStaffWhoosh(); }); },
  wardenLockClang() { cue((audio) => { audio.wardenLockClang(); }); }, wardenGuardBreak() { cue((audio) => { audio.wardenGuardBreak(); }); },
  aldricCleaverWhoosh() { cue((audio) => { audio.aldricCleaverWhoosh(); }); }, aldricCleaverBury() { cue((audio) => { audio.aldricCleaverBury(); }); },
  sweeperClang(style: string, finalHit: boolean) { cue((audio) => { audio.sweeperClang(style, finalHit); }); },
  sweeperBat(perfect: boolean, style: string) { cue((audio) => { audio.sweeperBat(perfect, style); }); },
  sweeperBounce(style: string, embedded: boolean) { cue((audio) => { audio.sweeperBounce(style, embedded); }); },
  wardenClash() { cue((audio) => { audio.wardenClash(); }); }, wardenLockdown() { cue((audio) => { audio.wardenLockdown(); }); },
  wardenMortarLaunch() { cue((audio) => { audio.wardenMortarLaunch(); }); },
  wardenMortarWhistle(descending: boolean) { cue((audio) => { audio.wardenMortarWhistle(descending); }); },
  colossusServo() { cue((audio) => { audio.colossusServo(); }); }, colossusPlate() { cue((audio) => { audio.colossusPlate(); }); },
  colossusStagger() { cue((audio) => { audio.colossusStagger(); }); }, sawBounce() { cue((audio) => { audio.sawBounce(); }); },
  sweeperCounter() { cue((audio) => { audio.sweeperCounter(); }); }, aldricCleaver() { cue((audio) => { audio.aldricCleaver(); }); },
  sourceFracture() { cue((audio) => { audio.sourceFracture(); }); },
  dialogueTone(identity: string | null | undefined) { cue((audio) => { audio.dialogueTone(identity); }); },
  voidGroundTear() { cue((audio) => { audio.voidGroundTear(); }); },
  sourceDepthPrepare(kind: string) { cue((audio) => { audio.sourceDepthPrepare(kind); }); }, sourceDepthSnap(kind: string) { cue((audio) => { audio.sourceDepthSnap(kind); }); },
  aldricCrownFall() { cue((audio) => { audio.aldricCrownFall(); }); },
  finalSilence() { invokeObserved({ operation: "final-silence", arguments: [] },
    (audio) => audio.dispatchFinaleCueForReceipt("final-silence")); },
  finalRelic(step: number) { invokeObserved({ operation: "final-relic", arguments: [step] },
    (audio) => audio.dispatchFinaleCueForReceipt("final-relic", step)); },
  finalCut(step: number) { invokeObserved({ operation: "final-cut", arguments: [step] },
    (audio) => audio.dispatchFinaleCueForReceipt("final-cut", step)); },
  finalRestore() { invokeObserved({ operation: "final-restore", arguments: [] },
    (audio) => audio.dispatchFinaleCueForReceipt("final-restore")); },
  voidTransfer() { cue((audio) => { audio.voidTransfer(); }); },
  echoResonance() { cue((audio) => { audio.echoResonance(); }); }, platformRebuild() { cue((audio) => { audio.platformRebuild(); }); },
  bossDeathWarden() { cue((audio) => { audio.bossDeathWarden(); }); }, bossDeathColossus() { cue((audio) => { audio.bossDeathColossus(); }); },
  bossDeathAldric() { cue((audio) => { audio.bossDeathAldric(); }); }, bossDeathEcho() { cue((audio) => { audio.bossDeathEcho(); }); },
  bossDeathSource() { cue((audio) => { audio.bossDeathSource(); }); }, throwBlade() { cue((audio) => { audio.throwBlade(); }); },
  recall() { cue((audio) => { audio.recall(); }); }, death() { cue((audio) => { audio.death(); }); },
  hurt() { cue((audio) => { audio.hurt(); }); }, dash() { cue((audio) => { audio.dash(); }); },
  land() { cue((audio) => { audio.land(); }); }, jump() { cue((audio) => { audio.jump(); }); },
  ui() { cue((audio) => { audio.ui(); }); }, rankup() { cue((audio) => { audio.rankup(); }); },
  saberLock() { cue((audio) => { audio.saberLock(); }); }, saberSizzle() { cue((audio) => { audio.saberSizzle(); }); },
  saberBreak(win: boolean) { cue((audio) => { audio.saberBreak(win); }); }, crescent() { cue((audio) => { audio.crescent(); }); },
  wave() { cue((audio) => { audio.wave(); }); }, gameover() { cue((audio) => { audio.gameover(); }); },
});
}

export type LegacySynthFacade = ReturnType<typeof createLegacySynthFacade>;
