// Concrete Web Audio runtime loaded by the first-gesture facade.
import { createLegacyAudioCompatibility } from "./legacy-live-audio";
import { clamp } from "../domain/geometry";
import { LegacyMusicSequencer } from "./legacy-music-sequencer";
import type {
  LegacyEffectsGraph,
  LegacyMusicGraph,
  LegacyNoiseOptions,
  LegacyOscillatorOptions,
} from "./legacy-synth-contracts";
import type { MusicContextSnapshot, MusicEvent, MusicRunSessionMetadata } from "./music-contracts";
import type { SfxRoute } from "./mixer";
import { SYNTHESIZED_SFX_CUE_ROUTES, synthesizedSfxRoute } from "./synth-cue-routing";
import { installLegacyAudioLifecycle, type LegacyAudioLifecycle } from "./legacy-audio-lifecycle";
import { ScheduledAudioResourceTracker } from "./scheduled-audio-resources";
import { dialogueVoice, legacyMuteReason, legacyNumberDefault } from "./legacy-synth-utilities";

const sequencer = new LegacyMusicSequencer({
  context: () => SFX.ctx,
  output: () => SFX.musicGain,
  voidMix: () => SFX._voidMix,
  oscillator: (frequency, duration, time, options) => { SFX._osc(frequency, duration, time, options); },
  noise: (duration, time, options) => { SFX._noise(duration, time, options); },
  trackSource: (source, connectedNodes) => SFX._takeVoice(source, connectedNodes),
});

// ------- synthesized audio: crisp SFX + layered music (Web Audio, no files) -------
const SYNTH = {
  ctx: null as AudioContext | null,
  effectsGains: {} as Partial<Record<SfxRoute, AudioNode>>,
  interfaceGain: null as AudioNode | null,
  musicGain: null as GainNode | null,
  musicFilter: null as BiquadFilterNode | null,
  vol: 0.6, musicVol: 0.5, musicOn: true, muted: false,
  _musicDuck: 1, _voidMix: 0,
  _muteR: {} as Record<string, true>,
  _noiseCache: {} as Record<string, AudioBuffer>,
  _voices: new ScheduledAudioResourceTracker(24),
  _lifecycle: null as LegacyAudioLifecycle | null,
  _activeSfxRoute: "environment" as SfxRoute,
  _routeDispatches: { weapons: 0, enemies: 0, player: 0, environment: 0 } as Record<SfxRoute, number>,

  _context(): AudioContext {
    if (this.ctx === null) throw new Error("Legacy audio context is not bound");
    return this.ctx;
  },
  _effectsOutput(): AudioNode {
    const output = this.effectsGains[this._activeSfxRoute];
    if (output === undefined) throw new Error(`Legacy ${this._activeSfxRoute} output is not bound`);
    return output;
  },
  _interfaceOutput(): AudioNode {
    if (this.interfaceGain === null) throw new Error("Legacy interface output is not bound");
    return this.interfaceGain;
  },

  init() {
    if (this._lifecycle !== null) return;
    this._lifecycle = installLegacyAudioLifecycle({
      resume: () => { this.resume(); },
      setVisibilityMuted: (muted) => { this.mute(muted, "visibility"); },
      disposeAudio: () => { LIVE_AUDIO.dispose(); },
      onUninstalled: () => { this._lifecycle = null; },
    });
  },
  resume() {
    LIVE_AUDIO.activate();
  },
  migrateSettings(settings: Record<string, unknown>, audioSource?: Record<string, unknown>) { return LIVE_AUDIO.migrateSettings(settings, audioSource); },
  applySettings(settings: Record<string, unknown>) { LIVE_AUDIO.applySettings(settings); },
  debugSnapshot() {
    return { state: LIVE_AUDIO.system.state, backend: LIVE_AUDIO.system.activeMusicBackendId,
      settings: Object.assign({}, LIVE_AUDIO.system.settings),
      score: {
        ...LIVE_AUDIO.musicReplayMetadata(),
        run: LIVE_AUDIO.activeMusicRun(),
      },
      resources: Object.freeze({
        activeVoices: this._voices.activeVoices,
        activeVoiceGraphNodes: this._voices.activeGraphNodes,
        voiceCap: this._voices.voiceCap,
        noiseBuffers: Object.keys(this._noiseCache).length,
        cueRoutes: SYNTHESIZED_SFX_CUE_ROUTES,
        routeDispatches: Object.freeze({ ...this._routeDispatches }),
        lifecycleListeners: this._lifecycle?.listenerCount ?? 0,
        visibilityTransitions: Object.freeze({
          hidden: this._lifecycle?.visibilityTransitions.hidden ?? 0,
          visible: this._lifecycle?.visibilityTransitions.visible ?? 0,
        }),
        legacySequencer: sequencer.debugSnapshot(),
        lifecycleInstalled: this._lifecycle !== null,
        system: LIVE_AUDIO.system.debugResourceSnapshot(),
      }) };
  },
  musicScoreVersion() { return "0.1.0-alpha.1"; },
  musicReplayMetadata() { return LIVE_AUDIO.musicReplayMetadata(); },
  beginMusicRun(metadata: MusicRunSessionMetadata) { LIVE_AUDIO.beginMusicRun(metadata); },
  updateMusicContext(snapshot: MusicContextSnapshot) { LIVE_AUDIO.updateMusicContext(snapshot); },
  emitMusicEvent(event: MusicEvent) { LIVE_AUDIO.emitMusicEvent(event); },
  endMusicRun() { LIVE_AUDIO.endMusicRun(); },
  setVol(value: number) { LIVE_AUDIO.setVolume("master", value); },
  setMasterVol(value: number) { LIVE_AUDIO.setVolume("master", value); },
  setMusicVol(value: number) { LIVE_AUDIO.setVolume("music", value); },
  setSfxVol(value: number) { LIVE_AUDIO.setVolume("sfx", value); },
  setInterfaceVol(value: number) { LIVE_AUDIO.setVolume("interface", value); },
  setMasterMuted(on: boolean) { LIVE_AUDIO.setMuted("master", on); },
  setSfxMuted(on: boolean) { LIVE_AUDIO.setMuted("sfx", on); },
  setInterfaceMuted(on: boolean) { LIVE_AUDIO.setMuted("interface", on); },
  _musicTarget() { return this._musicDuck; },
  setMusic(on: boolean) { LIVE_AUDIO.setMuted("music", !on); },
  setMusicDuck(mult: number | null | undefined, seconds?: number) {
    this._musicDuck = clamp(mult ?? 1, 0, 1);
    if (this.musicGain === null || this.ctx === null) return;
    const target = this._musicTarget();
    const now = this._context().currentTime, dur = Math.max(0.01, legacyNumberDefault(seconds, 0.18));
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicGain.gain.value), now);
    this.musicGain.gain.linearRampToValueAtTime(target, now + dur);
  },
  setVoidDescent(amount: number, seconds?: number) {
    this._voidMix = clamp(legacyNumberDefault(amount, 0), 0, 1);
    if (this.musicFilter === null || this.ctx === null) return;
    const now = this._context().currentTime, dur = Math.max(0.01, legacyNumberDefault(seconds, 0.22));
    const target = 16000 * Math.pow(850 / 16000, this._voidMix);
    this.musicFilter.frequency.cancelScheduledValues(now);
    this.musicFilter.frequency.setValueAtTime(Math.max(850, this.musicFilter.frequency.value), now);
    this.musicFilter.frequency.exponentialRampToValueAtTime(target, now + dur);
  },
  // mute by reason — any active reason silences everything. Backward compatible:
  // mute(true)/mute(false) use the "default" reason. CrazyGames passes "cg"/"ad".
  mute(on: boolean, reason?: string) {
    reason = legacyMuteReason(reason);
    if (on) this._muteR[reason] = true; else Reflect.deleteProperty(this._muteR, reason);
    this.muted = Object.keys(this._muteR).length > 0;
    const active = (names: readonly string[]) => names.some((name) => !!this._muteR[name]);
    LIVE_AUDIO.setTemporaryMute("ad", active(["ad"]));
    LIVE_AUDIO.setTemporaryMute("portal", active(["cg", "portal"]));
    LIVE_AUDIO.setTemporaryMute("visibility", active(["visibility"]));
    LIVE_AUDIO.setTemporaryMute("platform-suspend", active(["platform-suspend"]));
    LIVE_AUDIO.setTemporaryMute("system", active(["default", "system"]));
  },

  _bindEffects(graph: LegacyEffectsGraph) {
    this.ctx = graph.context;
    this.effectsGains = { ...graph.effectsInputs };
    this.interfaceGain = graph.interfaceInput;
    for (const d of [0.03, 0.05, 0.07, 0.1, 0.12, 0.16, 0.18, 0.22, 0.3, 0.36]) this._noiseBuffer(d);
  },
  _bindLegacyMusic(graph: LegacyMusicGraph) {
    this.musicGain = graph.gain;
    this.musicFilter = graph.filter;
    this.musicGain.gain.value = this._musicTarget();
  },
  _stopMusic() {
    sequencer.stop();
  },
  _disposeEffects() {
    this._voices.dispose();
    this.effectsGains = {};
    this.interfaceGain = null;
    this.ctx = null;
  },

  _withSfxRoute<T>(route: SfxRoute, operation: () => T): T {
    const previous = this._activeSfxRoute;
    this._activeSfxRoute = route;
    this._routeDispatches[route]++;
    try {
      return operation();
    } finally {
      this._activeSfxRoute = previous;
    }
  },

  // ---- primitives (absolute-time scheduled) ----
  _noiseBuffer(dur: number) {
    const context = this._context();
    const n = Math.max(1, Math.floor(context.sampleRate * dur)), key = String(n);
    if (this._noiseCache[key]) return this._noiseCache[key];
    const buf = context.createBuffer(1, n, context.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._noiseCache[key] = buf; return buf;
  },
  _takeVoice(node: AudioScheduledSourceNode, connectedNodes: readonly AudioNode[] = []) {
    return this._voices.track(node, connectedNodes);
  },
  _osc(freq: number, dur: number, t: number, o: LegacyOscillatorOptions = {}) {
    const context = this._context();
    const osc = context.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t + dur);
    const g = context.createGain();
    if (!this._takeVoice(osc, [g])) {
      osc.disconnect();
      g.disconnect();
      return;
    }
    const v = o.vol ?? 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + legacyNumberDefault(o.attack, 0.002));
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    osc.connect(g).connect(o.dest ?? this._effectsOutput());
    osc.start(t); osc.stop(t + dur + 0.03);
  },
  _noise(dur: number, t: number, o: LegacyNoiseOptions = {}) {
    const context = this._context();
    const buf = this._noiseBuffer(dur);
    const src = context.createBufferSource(); src.buffer = buf;
    const f = context.createBiquadFilter();
    f.type = o.type ?? "highpass"; f.frequency.value = legacyNumberDefault(o.freq, 4000); f.Q.value = legacyNumberDefault(o.q, 0.8);
    const g = context.createGain();
    if (!this._takeVoice(src, [f, g])) {
      src.disconnect();
      f.disconnect();
      g.disconnect();
      return;
    }
    const v = o.vol ?? 0.25;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    src.connect(f).connect(g).connect(o.dest ?? this._effectsOutput());
    src.start(t); src.stop(t + dur + 0.02);
  },
  _click(t: number, vol?: number) { this._noise(0.03, t, { type: "highpass", freq: 6500, q: 0.7, vol: vol ?? 0.2 }); },

  // ---- events (crisp: sharp transient click + body) ----
  // a crisp air "swish": white noise through a bandpass that sweeps high->low
  swing(speed: number) {
    if (!this.ctx) return;
    const v = clamp((speed - 1100) / 2600, 0, 1); if (v <= 0) return;
    const t = this._context().currentTime, dur = 0.19;
    const buf = this._noiseBuffer(dur);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = 1.1;
    f.frequency.setValueAtTime(2600 + v * 1400, t);
    f.frequency.exponentialRampToValueAtTime(650, t + dur);
    const g = this.ctx.createGain();
    if (!this._takeVoice(src, [f, g])) {
      src.disconnect();
      f.disconnect();
      g.disconnect();
      return;
    }
    const vol = 0.07 + v * 0.13;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    src.connect(f).connect(g).connect(this._effectsOutput());
    src.start(t); src.stop(t + dur + 0.02);
  },
  hit(big?: boolean) {
    const t = this._context().currentTime;
    this._click(t, big ? 0.26 : 0.15);
    this._noise(0.07, t, { type: "lowpass", freq: big ? 430 : 650, vol: big ? 0.3 : 0.17 });
    this._osc(big ? 160 : 240, 0.09, t, { type: "square", vol: big ? 0.13 : 0.07, slideTo: big ? 70 : 120, attack: 0.001 });
  },
  slam() {
    const t = this._context().currentTime;
    this._click(t, 0.3);
    this._noise(0.22, t, { type: "lowpass", freq: 240, vol: 0.4 });
    this._osc(120, 0.26, t, { type: "sawtooth", vol: 0.22, slideTo: 46, attack: 0.001 });
  },
  boom() {
    const t = this._context().currentTime;
    this._click(t, 0.32);
    this._noise(0.36, t, { type: "lowpass", freq: 320, vol: 0.46 });
    this._osc(90, 0.4, t, { type: "sawtooth", vol: 0.26, slideTo: 34, attack: 0.001 });
  },
  launch() { const t = this._context().currentTime; this._click(t, 0.1); this._osc(320, 0.16, t, { type: "triangle", vol: 0.15, slideTo: 950 }); },
  updraft() {
    const t = this._context().currentTime;
    this._click(t, 0.16);
    this._osc(260, 0.3, t, { type: "sawtooth", vol: 0.24, slideTo: 1200, attack: 0.001 });
    this._noise(0.12, t, { type: "highpass", freq: 2000, vol: 0.1 });
  },
  parry() {
    const t = this._context().currentTime;
    this._click(t, 0.22);
    this._osc(1850, 0.12, t, { type: "square", vol: 0.16, slideTo: 2900, attack: 0.001 });
    this._osc(2600, 0.1, t, { type: "sine", vol: 0.1, slideTo: 3700 });
  },
  counter() {
    const t = this._context().currentTime;
    this._click(t, 0.3);
    this._osc(2000, 0.14, t, { type: "square", vol: 0.18, slideTo: 3200, attack: 0.001 });
    this._osc(3200, 0.18, t, { type: "sawtooth", vol: 0.12, slideTo: 1100 });
    this._osc(1300, 0.2, t + 0.04, { type: "sine", vol: 0.1, slideTo: 2200 });
  },
  deflect() { const t = this._context().currentTime; this._click(t, 0.1); this._osc(1100, 0.06, t, { type: "square", vol: 0.11, slideTo: 1600 }); },
  sourceCross() {   // restrained rising void pressure: readable, below RIFT DASH's peril cue
    if (!this.ctx) return; const t = this._context().currentTime;
    this._osc(240, 0.34, t, { type: "triangle", vol: 0.045, slideTo: 760, attack: 0.025 });
    this._osc(370, 0.26, t + 0.04, { type: "sine", vol: 0.025, slideTo: 980, attack: 0.02 });
  },
  sourceRepel() {   // local membrane snap; intentionally no boom or global flash
    if (!this.ctx) return; const t = this._context().currentTime;
    this._click(t, 0.11);
    this._osc(1250, 0.12, t, { type: "square", vol: 0.08, slideTo: 480, attack: 0.001 });
    this._osc(520, 0.16, t + 0.015, { type: "triangle", vol: 0.06, slideTo: 1040 });
  },
  aldricFireWarn(step: number) {   // restrained three-count: the floor is the primary tell
    if (!this.ctx) return; const t = this._context().currentTime, i = clamp(step | 0, 0, 2);
    this._click(t, 0.035 + i * 0.012);
    this._osc(330 + i * 105, 0.09, t, { type: "triangle", vol: 0.035 + i * 0.008, slideTo: 420 + i * 135, attack: 0.004 });
  },
  aldricIgnite() {   // dry ignition crack + a brief royal-gold body, never a global boom
    if (!this.ctx) return; const t = this._context().currentTime;
    this._noise(0.075, t, { type: "bandpass", freq: 2200, q: 0.8, vol: 0.075 });
    this._osc(170, 0.13, t, { type: "sawtooth", vol: 0.055, slideTo: 95, attack: 0.002 });
  },
  wardenStaffScrape() {
    if (!this.ctx) return; const t = this._context().currentTime;
    this._noise(0.11, t, { type: "bandpass", freq: 1450, q: 5, vol: 0.055 });
    this._osc(290, 0.12, t, { type: "square", vol: 0.035, slideTo: 210, attack: 0.003 });
  },
  wardenStaffWhoosh() {
    if (!this.ctx) return; const t = this._context().currentTime;
    this._noise(0.12, t, { type: "bandpass", freq: 1900, q: 0.9, vol: 0.075 });
  },
  wardenLockClang() {
    if (!this.ctx) return; const t = this._context().currentTime;
    this._click(t, 0.16); [720, 1170, 1810].forEach((f, i) => { this._osc(f, 0.13 - i * 0.02, t, { type: "square", vol: 0.055 - i * 0.012, attack: 0.0005 }); });
  },
  wardenGuardBreak() {
    if (!this.ctx) return; const t = this._context().currentTime;
    this._click(t, 0.24); this._noise(0.16, t, { type: "lowpass", freq: 520, vol: 0.17 });
    this._osc(150, 0.22, t, { type: "sawtooth", vol: 0.12, slideTo: 58, attack: 0.001 });
  },
  aldricCleaverWhoosh() {
    if (!this.ctx) return; const t = this._context().currentTime;
    this._noise(0.17, t, { type: "bandpass", freq: 930, q: 0.65, vol: 0.12 });
    this._osc(180, 0.16, t, { type: "triangle", vol: 0.055, slideTo: 95, attack: 0.002 });
  },
  aldricCleaverBury() {
    if (!this.ctx) return; const t = this._context().currentTime;
    this._click(t, 0.18); this._noise(0.18, t, { type: "lowpass", freq: 360, vol: 0.15 });
  },
  sweeperClang(sourceStyle: string, finalHit: boolean) {
    if (!this.ctx) return; const t = this._context().currentTime, source = sourceStyle === "shard";
    this._click(t, finalHit ? 0.18 : 0.10);
    this._osc(source ? 920 : 360, finalHit ? 0.18 : 0.11, t, { type: source ? "triangle" : "square", vol: finalHit ? 0.10 : 0.055,
      slideTo: source ? (finalHit ? 340 : 610) : (finalHit ? 95 : 220), attack: 0.001 });
  },
  sweeperBat(perfect: boolean, sourceStyle: string) {
    if (!this.ctx) return; const t = this._context().currentTime, source = sourceStyle === "shard";
    this._click(t, perfect ? 0.20 : 0.12);
    this._osc(source ? 760 : 520, 0.16, t, { type: source ? "sine" : "square", vol: perfect ? 0.11 : 0.07,
      slideTo: perfect ? (source ? 1480 : 980) : (source ? 420 : 260), attack: 0.001 });
  },
  sweeperBounce(sourceStyle: string, embedded: boolean) {
    if (!this.ctx) return; const t = this._context().currentTime, source = sourceStyle === "shard";
    this._click(t, embedded ? 0.15 : 0.065);
    // Source tails fall in reverse pitch; Colossus contacts stay low and mechanical.
    this._osc(source ? 1120 : 230, embedded ? 0.19 : 0.10, t, { type: source ? "sine" : "square", vol: embedded ? 0.085 : 0.04,
      slideTo: source ? 430 : (embedded ? 82 : 160), attack: 0.001 });
  },
  // Semantic boss vocabulary. These cues are intentionally material-specific;
  // BOSSFX coalesces same-frame requests and plays at most one of them.
  wardenClash() { if (!this.ctx) return; const t = this._context().currentTime; this._click(t, 0.16); this._osc(1480, 0.11, t, { type: "square", vol: 0.08, slideTo: 930 }); },
  wardenLockdown() { if (!this.ctx) return; const t = this._context().currentTime; [440, 660].forEach((f, i) => { this._osc(f, 0.1, t + i * 0.055, { type: "square", vol: 0.045, slideTo: f * 0.92 }); }); },
  wardenMortarLaunch() { if (!this.ctx) return; const t = this._context().currentTime; this._noise(0.08, t, { type: "bandpass", freq: 760, q: 1.8, vol: 0.08 }); this._osc(190, 0.14, t, { type: "square", vol: 0.07, slideTo: 330 }); },
  wardenMortarWhistle(descending: boolean) { if (!this.ctx) return; const t = this._context().currentTime; this._osc(descending ? 1350 : 520, 0.16, t, { type: "sine", vol: 0.035, slideTo: descending ? 2100 : 1180, attack: 0.012 }); },
  colossusServo() { if (!this.ctx) return; const t = this._context().currentTime; this._osc(105, 0.18, t, { type: "sawtooth", vol: 0.07, slideTo: 72, attack: 0.02 }); this._noise(0.09, t, { type: "lowpass", freq: 300, vol: 0.045 }); },
  colossusPlate() { if (!this.ctx) return; const t = this._context().currentTime; this._click(t, 0.13); this._osc(275, 0.18, t, { type: "square", vol: 0.08, slideTo: 118 }); },
  colossusStagger() { if (!this.ctx) return; const t = this._context().currentTime; this._noise(0.24, t, { type: "lowpass", freq: 260, vol: 0.17 }); [180, 132, 91].forEach((f, i) => { this._osc(f, 0.19, t + i * 0.045, { type: "square", vol: 0.07, slideTo: f * 0.54 }); }); },
  sawBounce() { this.sweeperBounce("saw", false); },
  sweeperCounter() { if (!this.ctx) return; const t = this._context().currentTime; this._click(t, 0.19); this._osc(420, 0.16, t, { type: "square", vol: 0.09, slideTo: 1120 }); },
  aldricCleaver() { if (!this.ctx) return; const t = this._context().currentTime; this._noise(0.15, t, { type: "bandpass", freq: 820, q: 0.75, vol: 0.1 }); this._osc(165, 0.15, t, { type: "triangle", vol: 0.05, slideTo: 88 }); },
  sourceFracture() { if (!this.ctx) return; const t = this._context().currentTime; this._osc(1180, 0.14, t, { type: "triangle", vol: 0.065, slideTo: 310 }); this._osc(390, 0.12, t + 0.02, { type: "sine", vol: 0.04, slideTo: 920 }); },
  dialogueTone(identity: string | null | undefined) {
    if (!this.ctx) return; const t = this._context().currentTime;
    const identityKey = (identity ?? "").toLowerCase();
    const v = dialogueVoice(identityKey);
    this._osc(v[0], 0.18, t, { type: v[1], vol: v[2], slideTo: v[0] * 1.18, attack: 0.018 });
    if (identityKey === "source") this._osc(139, 0.22, t + 0.025, { type: "sine", vol: 0.025, slideTo: 73, attack: 0.025 });
  },
  voidGroundTear() {
    if (!this.ctx) return; const t = this._context().currentTime;
    this._noise(0.42, t, { type: "lowpass", freq: 260, vol: 0.17 });
    this._osc(96, 0.48, t, { type: "sawtooth", vol: 0.11, slideTo: 31, attack: 0.012 });
  },
  sourceDepthPrepare(kind: string) {
    if (!this.ctx) return; const t = this._context().currentTime, f = kind === "spear" ? 430 : (kind === "maw" ? 82 : 126);
    this._osc(f, 0.34, t, { type: "sine", vol: 0.026, slideTo: f * 0.72, attack: 0.06 });
  },
  sourceDepthSnap(kind: string) {
    if (!this.ctx) return; const t = this._context().currentTime, f = kind === "spear" ? 1260 : (kind === "maw" ? 190 : 420);
    this._click(t, 0.12); this._osc(f, 0.15, t, { type: "square", vol: 0.075, slideTo: Math.max(70, f * 0.42), attack: 0.001 });
  },
  aldricCrownFall() {
    if (!this.ctx) return; const t = this._context().currentTime; this._click(t, 0.18);
    [540, 810, 1295].forEach((f, i) => { this._osc(f, 0.34 - i * 0.045, t, { type: "square", vol: 0.065 - i * 0.012, slideTo: f * 0.72, attack: 0.0008 }); });
  },
  finalSilence() {
    if (!this.ctx) return; this.setMusicDuck(0.03, 0.16);
    const t = this._context().currentTime; this._osc(74, 0.42, t, { type: "sine", vol: 0.055, slideTo: 48, attack: 0.025 });
  },
  finalRelic(step: number) {
    if (!this.ctx) return; const t = this._context().currentTime, i = clamp(step | 0, 0, 3);
    this._osc(520 + i * 145, 0.24, t, { type: "sine", vol: 0.055, slideTo: 760 + i * 180, attack: 0.018 });
  },
  finalCut(step: number) {
    if (!this.ctx) return; const t = this._context().currentTime, i = clamp(step | 0, 0, 2);
    this._click(t, 0.15 + i * 0.035); this._noise(0.18, t, { type: "bandpass", freq: 1450 + i * 420, q: 0.7, vol: 0.10 });
    this._osc(310 + i * 170, 0.32, t, { type: "triangle", vol: 0.09, slideTo: 920 + i * 330, attack: 0.002 });
  },
  finalRestore() {
    if (!this.ctx) return; this.setMusicDuck(1, 1.8); const t = this._context().currentTime;
    [392, 523.25, 659.25, 783.99].forEach((f, i) => { this._osc(f, 0.7, t + i * 0.11, { type: "sine", vol: 0.055, attack: 0.035 }); });
  },
  voidTransfer() { if (!this.ctx) return; const t = this._context().currentTime; this._osc(360, 0.18, t, { type: "sine", vol: 0.045, slideTo: 980, attack: 0.018 }); },
  echoResonance() { if (!this.ctx) return; const t = this._context().currentTime; [660, 990, 1320].forEach((f, i) => { this._osc(f, 0.16, t + i * 0.018, { type: "sine", vol: 0.026, slideTo: f * 1.06, attack: 0.015 }); }); },
  platformRebuild() { if (!this.ctx) return; const t = this._context().currentTime; this._osc(240, 0.14, t, { type: "triangle", vol: 0.035, slideTo: 410, attack: 0.02 }); },
  bossDeathWarden() { this.wardenGuardBreak(); },
  bossDeathColossus() { this.colossusStagger(); },
  bossDeathAldric() { if (!this.ctx) return; const t = this._context().currentTime; this._osc(210, 0.34, t, { type: "triangle", vol: 0.11, slideTo: 52 }); },
  bossDeathEcho() { if (!this.ctx) return; const t = this._context().currentTime; this._osc(1320, 0.32, t, { type: "sine", vol: 0.08, slideTo: 110 }); },
  bossDeathSource() { if (!this.ctx) return; const t = this._context().currentTime; [980, 620, 330].forEach((f, i) => { this._osc(f, 0.34, t + i * 0.035, { type: "triangle", vol: 0.065, slideTo: 72 }); }); },
  throwBlade() {
    const t = this._context().currentTime;
    this._noise(0.2, t, { type: "bandpass", freq: 1100, q: 0.6, vol: 0.16 });
    this._osc(520, 0.18, t, { type: "triangle", vol: 0.1, slideTo: 200 });
  },
  recall() { this._osc(300, 0.18, this._context().currentTime, { type: "triangle", vol: 0.12, slideTo: 840 }); },
  death() {
    const t = this._context().currentTime;
    this._click(t, 0.18);
    this._noise(0.3, t, { type: "lowpass", freq: 520, vol: 0.24 });
    this._osc(200, 0.3, t, { type: "sawtooth", vol: 0.12, slideTo: 40 });
  },
  hurt() {
    const t = this._context().currentTime;
    this._osc(220, 0.2, t, { type: "square", vol: 0.22, slideTo: 80 });
    this._noise(0.12, t, { type: "lowpass", freq: 320, vol: 0.16 });
  },
  dash() { this._noise(0.16, this._context().currentTime, { type: "highpass", freq: 1500, q: 0.7, vol: 0.16 }); },
  land() { const t = this._context().currentTime; this._click(t, 0.08); this._noise(0.1, t, { type: "lowpass", freq: 300, vol: 0.15 }); },
  jump() { this._osc(360, 0.1, this._context().currentTime, { type: "triangle", vol: 0.1, slideTo: 640 }); },
  ui() { this._osc(680, 0.05, this._context().currentTime, { type: "square", vol: 0.09, dest: this._interfaceOutput() }); },
  rankup() {
    const t = this._context().currentTime;
    [523, 659, 784].forEach((f, i) => { this._osc(f, 0.16, t + i * 0.05, { type: "triangle", vol: 0.13 }); });
  },
  // ---- THE ECHO boss ----
  saberLock() {   // a metallic CLANG — a hard transient + inharmonic bell partials, fast decay
    if (!this.ctx) return; const t = this._context().currentTime;
    this._click(t, 0.2);
    [1, 2.76, 5.18, 8.4].forEach((mult, i) => { this._osc(1050 * mult, 0.14 - i * 0.02, t, { type: "square", vol: 0.07 - i * 0.014, attack: 0.0004 }); });
    this._noise(0.05, t, { type: "bandpass", freq: 5400, q: 7, vol: 0.06 });
  },
  saberSizzle() {   // the strain, while bound — a bright metallic scrape
    if (!this.ctx) return;
    this._noise(0.04, this._context().currentTime, { type: "bandpass", freq: 4200 + Math.random() * 2200, q: 8, vol: 0.035 });
  },
  saberBreak(win: boolean) {   // the release CLANG — a hard transient + an inharmonic ring, brighter on a win
    if (!this.ctx) return; const t = this._context().currentTime;
    this._click(t, 0.22);
    const base = win ? 1300 : 900;
    [1, 2.76, 5.18].forEach((mult, i) => { this._osc(base * mult, 0.18 - i * 0.03, t, { type: "square", vol: 0.09 - i * 0.02, attack: 0.0004 }); });
    this._noise(0.06, t, { type: "bandpass", freq: win ? 6000 : 4000, q: 6, vol: 0.07 });
  },
  crescent() {   // a tear ripped through the air
    if (!this.ctx) return; const t = this._context().currentTime;
    this._noise(0.24, t, { type: "bandpass", freq: 950, q: 0.5, vol: 0.15 });
    this._osc(700, 0.26, t, { type: "sawtooth", vol: 0.12, slideTo: 150, attack: 0.002 });
    this._osc(1500, 0.1, t, { type: "sine", vol: 0.07, slideTo: 520 });
  },
  wave() {
    const t = this._context().currentTime;
    this._osc(440, 0.14, t, { type: "triangle", vol: 0.15, slideTo: 660 });
    this._osc(660, 0.2, t + 0.13, { type: "triangle", vol: 0.15, slideTo: 880 });
  },
  gameover() {
    const t = this._context().currentTime;
    this._osc(440, 0.25, t, { type: "sawtooth", vol: 0.17, slideTo: 330 });
    this._osc(330, 0.4, t + 0.22, { type: "sawtooth", vol: 0.17, slideTo: 160 });
  },

  setMusicTheme(name: string, boss: boolean) { sequencer.setTheme(name, boss); },
  _startMusic() { sequencer.start(); },
};

export const SFX: typeof SYNTH = new Proxy(SYNTH, {
  get(target, property, receiver) {
    const value: unknown = Reflect.get(target, property, receiver);
    const route = synthesizedSfxRoute(property);
    if (route === undefined || typeof value !== "function") return value;
    return (...args: unknown[]) => target._withSfxRoute(
      route,
      () => Reflect.apply(value, target, args) as unknown,
    );
  },
});

const LIVE_AUDIO = createLegacyAudioCompatibility(SFX);
