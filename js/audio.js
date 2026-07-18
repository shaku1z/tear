// ------- synthesized audio: crisp SFX + layered music (Web Audio, no files) -------
const SFX = {
  ctx: null, master: null, musicGain: null,
  vol: 0.6, musicVol: 0.5, musicOn: true, muted: false,
  _muteR: {},   // active mute reasons (e.g. "cg" portal mute, "ad" ad break) — muted if any are set
  _m: { timer: null, step: 0, next: 0 },
  _noiseCache: {}, _voiceN: 0, _voiceMax: 24,

  init() {
    const start = () => this.resume();
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
  },
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // master chain: gain -> compressor -> high-shelf "air" -> out  (punchy + crisp)
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.vol;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.12;
      const air = this.ctx.createBiquadFilter();
      air.type = "highshelf"; air.frequency.value = 3800; air.gain.value = 5;
      this.master.connect(comp); comp.connect(air); air.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = (this.muted || !this.musicOn) ? 0 : this.musicVol;
      this.musicGain.connect(this.master);
      for (const d of [0.03, 0.05, 0.07, 0.1, 0.12, 0.16, 0.18, 0.22, 0.3, 0.36]) this._noiseBuffer(d);
      this._startMusic();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  setVol(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },
  setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.value = (this.muted || !on) ? 0 : this.musicVol; },
  setMusicDuck(mult, seconds) {
    if (!this.musicGain || !this.ctx) return;
    const target = (this.muted || !this.musicOn) ? 0 : this.musicVol * clamp(mult == null ? 1 : mult, 0, 1);
    const now = this.ctx.currentTime, dur = Math.max(0.01, seconds || 0.18);
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicGain.gain.value), now);
    this.musicGain.gain.linearRampToValueAtTime(target, now + dur);
  },
  // mute by reason — any active reason silences everything. Backward compatible:
  // mute(true)/mute(false) use the "default" reason. CrazyGames passes "cg"/"ad".
  mute(on, reason) {
    reason = reason || "default";
    if (on) this._muteR[reason] = true; else delete this._muteR[reason];
    this.muted = Object.keys(this._muteR).length > 0;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.vol;
    if (this.musicGain) this.musicGain.gain.value = (this.muted || !this.musicOn) ? 0 : this.musicVol;
  },

  // ---- primitives (absolute-time scheduled) ----
  _noiseBuffer(dur) {
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur)), key = String(n);
    if (this._noiseCache[key]) return this._noiseCache[key];
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._noiseCache[key] = buf; return buf;
  },
  _takeVoice(node) {
    if (this._voiceN >= this._voiceMax) return false;
    this._voiceN++;
    const done = () => { this._voiceN = Math.max(0, this._voiceN - 1); };
    if (node.addEventListener) node.addEventListener("ended", done, { once: true }); else node.onended = done;
    return true;
  },
  _osc(freq, dur, t, o) {
    o = o || {};
    const osc = this.ctx.createOscillator();
    if (!this._takeVoice(osc)) return;
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t + dur);
    const g = this.ctx.createGain();
    const v = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    osc.connect(g).connect(o.dest || this.master);
    osc.start(t); osc.stop(t + dur + 0.03);
  },
  _noise(dur, t, o) {
    o = o || {};
    const buf = this._noiseBuffer(dur);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    if (!this._takeVoice(src)) return;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type || "highpass"; f.frequency.value = o.freq || 4000; f.Q.value = o.q || 0.8;
    const g = this.ctx.createGain();
    const v = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    src.connect(f).connect(g).connect(o.dest || this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  _click(t, vol) { this._noise(0.03, t, { type: "highpass", freq: 6500, q: 0.7, vol: vol == null ? 0.2 : vol }); },

  // ---- events (crisp: sharp transient click + body) ----
  // a crisp air "swish": white noise through a bandpass that sweeps high->low
  swing(speed) {
    if (!this.ctx) return;
    const v = clamp((speed - 1100) / 2600, 0, 1); if (v <= 0) return;
    const t = this.ctx.currentTime, dur = 0.19;
    const buf = this._noiseBuffer(dur);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    if (!this._takeVoice(src)) return;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = 1.1;
    f.frequency.setValueAtTime(2600 + v * 1400, t);
    f.frequency.exponentialRampToValueAtTime(650, t + dur);
    const g = this.ctx.createGain();
    const vol = 0.07 + v * 0.13;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  hit(big) {
    const t = this.ctx.currentTime;
    this._click(t, big ? 0.26 : 0.15);
    this._noise(0.07, t, { type: "lowpass", freq: big ? 430 : 650, vol: big ? 0.3 : 0.17 });
    this._osc(big ? 160 : 240, 0.09, t, { type: "square", vol: big ? 0.13 : 0.07, slideTo: big ? 70 : 120, attack: 0.001 });
  },
  slam() {
    const t = this.ctx.currentTime;
    this._click(t, 0.3);
    this._noise(0.22, t, { type: "lowpass", freq: 240, vol: 0.4 });
    this._osc(120, 0.26, t, { type: "sawtooth", vol: 0.22, slideTo: 46, attack: 0.001 });
  },
  boom() {
    const t = this.ctx.currentTime;
    this._click(t, 0.32);
    this._noise(0.36, t, { type: "lowpass", freq: 320, vol: 0.46 });
    this._osc(90, 0.4, t, { type: "sawtooth", vol: 0.26, slideTo: 34, attack: 0.001 });
  },
  launch() { const t = this.ctx.currentTime; this._click(t, 0.1); this._osc(320, 0.16, t, { type: "triangle", vol: 0.15, slideTo: 950 }); },
  updraft() {
    const t = this.ctx.currentTime;
    this._click(t, 0.16);
    this._osc(260, 0.3, t, { type: "sawtooth", vol: 0.24, slideTo: 1200, attack: 0.001 });
    this._noise(0.12, t, { type: "highpass", freq: 2000, vol: 0.1 });
  },
  parry() {
    const t = this.ctx.currentTime;
    this._click(t, 0.22);
    this._osc(1850, 0.12, t, { type: "square", vol: 0.16, slideTo: 2900, attack: 0.001 });
    this._osc(2600, 0.1, t, { type: "sine", vol: 0.1, slideTo: 3700 });
  },
  counter() {
    const t = this.ctx.currentTime;
    this._click(t, 0.3);
    this._osc(2000, 0.14, t, { type: "square", vol: 0.18, slideTo: 3200, attack: 0.001 });
    this._osc(3200, 0.18, t, { type: "sawtooth", vol: 0.12, slideTo: 1100 });
    this._osc(1300, 0.2, t + 0.04, { type: "sine", vol: 0.1, slideTo: 2200 });
  },
  deflect() { const t = this.ctx.currentTime; this._click(t, 0.1); this._osc(1100, 0.06, t, { type: "square", vol: 0.11, slideTo: 1600 }); },
  sourceCross() {   // restrained rising void pressure: readable, below RIFT DASH's peril cue
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._osc(240, 0.34, t, { type: "triangle", vol: 0.045, slideTo: 760, attack: 0.025 });
    this._osc(370, 0.26, t + 0.04, { type: "sine", vol: 0.025, slideTo: 980, attack: 0.02 });
  },
  sourceRepel() {   // local membrane snap; intentionally no boom or global flash
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._click(t, 0.11);
    this._osc(1250, 0.12, t, { type: "square", vol: 0.08, slideTo: 480, attack: 0.001 });
    this._osc(520, 0.16, t + 0.015, { type: "triangle", vol: 0.06, slideTo: 1040 });
  },
  aldricFireWarn(step) {   // restrained three-count: the floor is the primary tell
    if (!this.ctx) return; const t = this.ctx.currentTime, i = clamp(step | 0, 0, 2);
    this._click(t, 0.035 + i * 0.012);
    this._osc(330 + i * 105, 0.09, t, { type: "triangle", vol: 0.035 + i * 0.008, slideTo: 420 + i * 135, attack: 0.004 });
  },
  aldricIgnite() {   // dry ignition crack + a brief royal-gold body, never a global boom
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.075, t, { type: "bandpass", freq: 2200, q: 0.8, vol: 0.075 });
    this._osc(170, 0.13, t, { type: "sawtooth", vol: 0.055, slideTo: 95, attack: 0.002 });
  },
  wardenStaffScrape() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.11, t, { type: "bandpass", freq: 1450, q: 5, vol: 0.055 });
    this._osc(290, 0.12, t, { type: "square", vol: 0.035, slideTo: 210, attack: 0.003 });
  },
  wardenStaffWhoosh() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.12, t, { type: "bandpass", freq: 1900, q: 0.9, vol: 0.075 });
  },
  wardenLockClang() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._click(t, 0.16); [720, 1170, 1810].forEach((f, i) => this._osc(f, 0.13 - i * 0.02, t, { type: "square", vol: 0.055 - i * 0.012, attack: 0.0005 }));
  },
  wardenGuardBreak() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._click(t, 0.24); this._noise(0.16, t, { type: "lowpass", freq: 520, vol: 0.17 });
    this._osc(150, 0.22, t, { type: "sawtooth", vol: 0.12, slideTo: 58, attack: 0.001 });
  },
  aldricCleaverWhoosh() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.17, t, { type: "bandpass", freq: 930, q: 0.65, vol: 0.12 });
    this._osc(180, 0.16, t, { type: "triangle", vol: 0.055, slideTo: 95, attack: 0.002 });
  },
  aldricCleaverBury() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._click(t, 0.18); this._noise(0.18, t, { type: "lowpass", freq: 360, vol: 0.15 });
  },
  sweeperClang(sourceStyle, finalHit) {
    if (!this.ctx) return; const t = this.ctx.currentTime, source = sourceStyle === "shard";
    this._click(t, finalHit ? 0.18 : 0.10);
    this._osc(source ? 920 : 360, finalHit ? 0.18 : 0.11, t, { type: source ? "triangle" : "square", vol: finalHit ? 0.10 : 0.055,
      slideTo: source ? (finalHit ? 340 : 610) : (finalHit ? 95 : 220), attack: 0.001 });
  },
  sweeperBat(perfect, sourceStyle) {
    if (!this.ctx) return; const t = this.ctx.currentTime, source = sourceStyle === "shard";
    this._click(t, perfect ? 0.20 : 0.12);
    this._osc(source ? 760 : 520, 0.16, t, { type: source ? "sine" : "square", vol: perfect ? 0.11 : 0.07,
      slideTo: perfect ? (source ? 1480 : 980) : (source ? 420 : 260), attack: 0.001 });
  },
  sweeperBounce(sourceStyle, embedded) {
    if (!this.ctx) return; const t = this.ctx.currentTime, source = sourceStyle === "shard";
    this._click(t, embedded ? 0.15 : 0.065);
    // Source tails fall in reverse pitch; Colossus contacts stay low and mechanical.
    this._osc(source ? 1120 : 230, embedded ? 0.19 : 0.10, t, { type: source ? "sine" : "square", vol: embedded ? 0.085 : 0.04,
      slideTo: source ? 430 : (embedded ? 82 : 160), attack: 0.001 });
  },
  // Semantic boss vocabulary. These cues are intentionally material-specific;
  // BOSSFX coalesces same-frame requests and plays at most one of them.
  wardenClash() { if (!this.ctx) return; const t = this.ctx.currentTime; this._click(t, 0.16); this._osc(1480, 0.11, t, { type: "square", vol: 0.08, slideTo: 930 }); },
  wardenLockdown() { if (!this.ctx) return; const t = this.ctx.currentTime; [440, 660].forEach((f, i) => this._osc(f, 0.1, t + i * 0.055, { type: "square", vol: 0.045, slideTo: f * 0.92 })); },
  wardenMortarLaunch() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(0.08, t, { type: "bandpass", freq: 760, q: 1.8, vol: 0.08 }); this._osc(190, 0.14, t, { type: "square", vol: 0.07, slideTo: 330 }); },
  wardenMortarWhistle(descending) { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc(descending ? 1350 : 520, 0.16, t, { type: "sine", vol: 0.035, slideTo: descending ? 2100 : 1180, attack: 0.012 }); },
  colossusServo() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc(105, 0.18, t, { type: "sawtooth", vol: 0.07, slideTo: 72, attack: 0.02 }); this._noise(0.09, t, { type: "lowpass", freq: 300, vol: 0.045 }); },
  colossusPlate() { if (!this.ctx) return; const t = this.ctx.currentTime; this._click(t, 0.13); this._osc(275, 0.18, t, { type: "square", vol: 0.08, slideTo: 118 }); },
  colossusStagger() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(0.24, t, { type: "lowpass", freq: 260, vol: 0.17 }); [180, 132, 91].forEach((f, i) => this._osc(f, 0.19, t + i * 0.045, { type: "square", vol: 0.07, slideTo: f * 0.54 })); },
  sawBounce() { this.sweeperBounce("saw", false); },
  sweeperCounter() { if (!this.ctx) return; const t = this.ctx.currentTime; this._click(t, 0.19); this._osc(420, 0.16, t, { type: "square", vol: 0.09, slideTo: 1120 }); },
  aldricCleaver() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(0.15, t, { type: "bandpass", freq: 820, q: 0.75, vol: 0.1 }); this._osc(165, 0.15, t, { type: "triangle", vol: 0.05, slideTo: 88 }); },
  sourceFracture() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc(1180, 0.14, t, { type: "triangle", vol: 0.065, slideTo: 310 }); this._osc(390, 0.12, t + 0.02, { type: "sine", vol: 0.04, slideTo: 920 }); },
  finalSilence() {
    if (!this.ctx) return; this.setMusicDuck(0.03, 0.16);
    const t = this.ctx.currentTime; this._osc(74, 0.42, t, { type: "sine", vol: 0.055, slideTo: 48, attack: 0.025 });
  },
  finalRelic(step) {
    if (!this.ctx) return; const t = this.ctx.currentTime, i = clamp(step | 0, 0, 3);
    this._osc(520 + i * 145, 0.24, t, { type: "sine", vol: 0.055, slideTo: 760 + i * 180, attack: 0.018 });
  },
  finalCut(step) {
    if (!this.ctx) return; const t = this.ctx.currentTime, i = clamp(step | 0, 0, 2);
    this._click(t, 0.15 + i * 0.035); this._noise(0.18, t, { type: "bandpass", freq: 1450 + i * 420, q: 0.7, vol: 0.10 });
    this._osc(310 + i * 170, 0.32, t, { type: "triangle", vol: 0.09, slideTo: 920 + i * 330, attack: 0.002 });
  },
  finalRestore() {
    if (!this.ctx) return; this.setMusicDuck(1, 1.8); const t = this.ctx.currentTime;
    [392, 523.25, 659.25, 783.99].forEach((f, i) => this._osc(f, 0.7, t + i * 0.11, { type: "sine", vol: 0.055, attack: 0.035 }));
  },
  voidTransfer() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc(360, 0.18, t, { type: "sine", vol: 0.045, slideTo: 980, attack: 0.018 }); },
  echoResonance() { if (!this.ctx) return; const t = this.ctx.currentTime; [660, 990, 1320].forEach((f, i) => this._osc(f, 0.16, t + i * 0.018, { type: "sine", vol: 0.026, slideTo: f * 1.06, attack: 0.015 })); },
  platformRebuild() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc(240, 0.14, t, { type: "triangle", vol: 0.035, slideTo: 410, attack: 0.02 }); },
  bossDeathWarden() { this.wardenGuardBreak(); },
  bossDeathColossus() { this.colossusStagger(); },
  bossDeathAldric() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc(210, 0.34, t, { type: "triangle", vol: 0.11, slideTo: 52 }); },
  bossDeathEcho() { if (!this.ctx) return; const t = this.ctx.currentTime; this._osc(1320, 0.32, t, { type: "sine", vol: 0.08, slideTo: 110 }); },
  bossDeathSource() { if (!this.ctx) return; const t = this.ctx.currentTime; [980, 620, 330].forEach((f, i) => this._osc(f, 0.34, t + i * 0.035, { type: "triangle", vol: 0.065, slideTo: 72 })); },
  throwBlade() {
    const t = this.ctx.currentTime;
    this._noise(0.2, t, { type: "bandpass", freq: 1100, q: 0.6, vol: 0.16 });
    this._osc(520, 0.18, t, { type: "triangle", vol: 0.1, slideTo: 200 });
  },
  recall() { this._osc(300, 0.18, this.ctx.currentTime, { type: "triangle", vol: 0.12, slideTo: 840 }); },
  death() {
    const t = this.ctx.currentTime;
    this._click(t, 0.18);
    this._noise(0.3, t, { type: "lowpass", freq: 520, vol: 0.24 });
    this._osc(200, 0.3, t, { type: "sawtooth", vol: 0.12, slideTo: 40 });
  },
  hurt() {
    const t = this.ctx.currentTime;
    this._osc(220, 0.2, t, { type: "square", vol: 0.22, slideTo: 80 });
    this._noise(0.12, t, { type: "lowpass", freq: 320, vol: 0.16 });
  },
  dash() { this._noise(0.16, this.ctx.currentTime, { type: "highpass", freq: 1500, q: 0.7, vol: 0.16 }); },
  land() { const t = this.ctx.currentTime; this._click(t, 0.08); this._noise(0.1, t, { type: "lowpass", freq: 300, vol: 0.15 }); },
  jump() { this._osc(360, 0.1, this.ctx.currentTime, { type: "triangle", vol: 0.1, slideTo: 640 }); },
  ui() { this._osc(680, 0.05, this.ctx.currentTime, { type: "square", vol: 0.09 }); },
  rankup() {
    const t = this.ctx.currentTime;
    [523, 659, 784].forEach((f, i) => this._osc(f, 0.16, t + i * 0.05, { type: "triangle", vol: 0.13 }));
  },
  // ---- THE ECHO boss ----
  saberLock() {   // a metallic CLANG — a hard transient + inharmonic bell partials, fast decay
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._click(t, 0.2);
    [1, 2.76, 5.18, 8.4].forEach((mult, i) => this._osc(1050 * mult, 0.14 - i * 0.02, t, { type: "square", vol: 0.07 - i * 0.014, attack: 0.0004 }));
    this._noise(0.05, t, { type: "bandpass", freq: 5400, q: 7, vol: 0.06 });
  },
  saberSizzle() {   // the strain, while bound — a bright metallic scrape
    if (!this.ctx) return;
    this._noise(0.04, this.ctx.currentTime, { type: "bandpass", freq: 4200 + Math.random() * 2200, q: 8, vol: 0.035 });
  },
  saberBreak(win) {   // the release CLANG — a hard transient + an inharmonic ring, brighter on a win
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._click(t, 0.22);
    const base = win ? 1300 : 900;
    [1, 2.76, 5.18].forEach((mult, i) => this._osc(base * mult, 0.18 - i * 0.03, t, { type: "square", vol: 0.09 - i * 0.02, attack: 0.0004 }));
    this._noise(0.06, t, { type: "bandpass", freq: win ? 6000 : 4000, q: 6, vol: 0.07 });
  },
  crescent() {   // a tear ripped through the air
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(0.24, t, { type: "bandpass", freq: 950, q: 0.5, vol: 0.15 });
    this._osc(700, 0.26, t, { type: "sawtooth", vol: 0.12, slideTo: 150, attack: 0.002 });
    this._osc(1500, 0.1, t, { type: "sine", vol: 0.07, slideTo: 520 });
  },
  wave() {
    const t = this.ctx.currentTime;
    this._osc(440, 0.14, t, { type: "triangle", vol: 0.15, slideTo: 660 });
    this._osc(660, 0.2, t + 0.13, { type: "triangle", vol: 0.15, slideTo: 880 });
  },
  gameover() {
    const t = this.ctx.currentTime;
    this._osc(440, 0.25, t, { type: "sawtooth", vol: 0.17, slideTo: 330 });
    this._osc(330, 0.4, t + 0.22, { type: "sawtooth", vol: 0.17, slideTo: 160 });
  },

  // ---- layered music: lookahead-scheduled kick / hat / bass / lead ----
  // Every biome has its OWN theme (tempo, root, scale, drum pattern, voices), and each
  // theme has an intensified BOSS arrangement of the same identity: +10 BPM, a driving
  // double-time kick, hats on every off-beat, a rest-less low end with octave stabs,
  // and an insistent lead. Switches land on bar boundaries so they stay musical.
  themes: (() => {
    const K = (...idx) => { const a = new Array(16).fill(0); for (const i of idx) a[i] = 1; return a; };
    return {
      // the wandering Am figure — menus fall back here
      menu: { bpm: 118, root: 110, kick: K(0, 4, 8, 12), hat: K(1, 3, 5, 7, 9, 11, 13, 15), hatFreq: 8000,
        bass: [0, 0, 7, 0, 5, 5, 3, 5, 0, 0, 7, 0, 8, 8, 7, 5], bassType: "triangle", bassVol: 0.16,
        lead: [12, -1, -1, -1, 15, -1, -1, 12, -1, -1, 19, -1, 17, -1, 15, -1], leadType: "sine", leadVol: 0.06 },
      // dawn discipline: bright C-major bells over a steady patrol pulse
      "The Grounds": { bpm: 112, root: 130.81, kick: K(0, 4, 8, 12), hat: K(3, 7, 11, 15), hatFreq: 9000,
        bass: [0, 0, 4, 0, 5, 5, 7, 5, 0, 0, 4, 0, 2, 2, 5, 7], bassType: "triangle", bassVol: 0.15,
        lead: [12, -1, -1, 16, -1, -1, 19, -1, -1, -1, 16, -1, 12, -1, -1, -1], leadType: "sine", leadVol: 0.055 },
      // deep industry: a slow phrygian grind, metallic ticks, sparse square blips
      "The Undercroft": { bpm: 100, root: 98, kick: K(0, 6, 8, 14), hat: K(2, 5, 10, 13), hatFreq: 10500,
        bass: [0, -1, 1, 0, -1, 3, -1, 0, 0, -1, 1, 0, 7, -1, 5, 3], bassType: "sawtooth", bassVol: 0.12,
        lead: [-1, -1, 12, -1, -1, -1, -1, -1, -1, 13, -1, -1, -1, -1, 12, -1], leadType: "square", leadVol: 0.035 },
      // war march: a driving A-minor pulse with a horn-like call
      "The Crimson Fields": { bpm: 126, root: 110, kick: K(0, 4, 8, 10, 12), hat: K(2, 6, 10, 14), hatFreq: 7500,
        bass: [0, 0, 7, 7, 0, 0, 8, 8, 0, 0, 7, 7, 10, 10, 8, 7], bassType: "triangle", bassVol: 0.17,
        lead: [12, -1, 15, -1, 12, -1, 10, -1, 12, -1, 15, 17, 15, -1, 12, -1], leadType: "sawtooth", leadVol: 0.04 },
      // dream logic: a dorian arpeggio that never quite lands
      "The Voidspire": { bpm: 108, root: 146.83, kick: K(0, 8), hat: K(1, 5, 9, 13), hatFreq: 8600,
        bass: [0, -1, -1, 0, -1, -1, 5, -1, 3, -1, -1, 3, -1, -1, 7, -1], bassType: "triangle", bassVol: 0.14,
        lead: [12, 16, 19, 22, 24, 22, 19, 16, 12, 15, 19, 21, 24, 21, 19, 15], leadType: "sine", leadVol: 0.045 },
      // the void: an almost-still low drone; a single far bell
      "The Tear": { bpm: 88, root: 82.41, kick: K(0, 8), hat: K(7, 15), hatFreq: 11000,
        bass: [0, -1, -1, 0, -1, -1, 0, -1, -2, -1, -1, -2, -1, -1, 0, -1], bassType: "triangle", bassVol: 0.18,
        lead: [-1, -1, -1, -1, 12, -1, -1, -1, -1, -1, -1, -1, 19, -1, -1, -1], leadType: "sine", leadVol: 0.05 },
    };
  })(),
  _themeName: "menu", _boss: false, _pending: null,
  _activeTheme() { return this.themes[this._themeName] || this.themes.menu; },
  // request a theme; the change lands on the next bar so it stays musical
  setMusicTheme(name, boss) {
    const key = this.themes[name] ? name : "menu";
    if (key === this._themeName && !!boss === this._boss && !this._pending) return;
    if (this._pending && this._pending.key === key && this._pending.boss === !!boss) return;
    if (key === this._themeName && !!boss === this._boss) { this._pending = null; return; }
    this._pending = { key, boss: !!boss };
  },
  _startMusic() {
    this._m.step = 0;
    this._m.next = this.ctx.currentTime + 0.15;
    this._m.timer = setInterval(() => this._schedule(), 25);
  },
  _schedule() {
    if (!this.ctx) return;
    while (this._m.next < this.ctx.currentTime + 0.13) {
      const s = this._m.step % 16;
      if (s === 0 && this._pending) { this._themeName = this._pending.key; this._boss = this._pending.boss; this._pending = null; }
      this._beat(s, this._m.next);
      const th = this._activeTheme();
      this._m.step++;
      this._m.next += 30 / (th.bpm + (this._boss ? 10 : 0));   // eighth-note duration
    }
  },
  _beat(i, t) {
    const th = this._activeTheme(), G = this.musicGain, boss = this._boss;
    const semis = (n) => th.root * Math.pow(2, n / 12);
    // drums: the boss arrangement drives double-time
    if (th.kick[i]) this._kick(t, 0.22);
    else if (boss && i % 4 === 2) this._kick(t, 0.13);
    if (th.hat[i] || (boss && i % 2 === 1)) this._hat(t, (i % 4 === 3 ? 0.05 : 0.03) * (boss ? 1.3 : 1), th.hatFreq);
    // bass (rest = exactly -1; other negatives are real notes below the root):
    // bosses fill the rests and stab the octave
    let b = th.bass[i];
    if (b === -1 && boss) { const alt = th.bass[(i + 8) % 16]; b = alt === -1 ? 0 : alt; }
    if (b !== -1) {
      this._osc(semis(b) / 2, 0.26, t, { type: th.bassType, vol: th.bassVol * (boss ? 1.25 : 1), dest: G });
      if (boss && i % 4 === 2) this._osc(semis(b + 12) / 2, 0.13, t, { type: th.bassType, vol: th.bassVol * 0.5, dest: G });
    }
    // lead: bosses echo into the gaps
    let l = th.lead[i];
    if (l < 0 && boss && i % 2 === 0) { const prev = th.lead[(i + 14) % 16]; if (prev >= 0) l = prev; }
    if (l >= 0) this._osc(semis(l), 0.42, t, { type: th.leadType, vol: th.leadVol * (boss ? 1.35 : 1), attack: 0.02, dest: G });
  },
  _kick(t, v) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(v == null ? 0.22 : v, t); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.16);
    o.connect(g).connect(this.musicGain); o.start(t); o.stop(t + 0.18);
  },
  _hat(t, v, freq) { this._noise(0.04, t, { type: "highpass", freq: freq || 8000, q: 0.6, vol: v, dest: this.musicGain }); },
};
