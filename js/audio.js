// ------- synthesized audio: crisp SFX + layered music (Web Audio, no files) -------
const SFX = {
  ctx: null, master: null, musicGain: null,
  vol: 0.6, musicVol: 0.5, musicOn: true, muted: false,
  _m: { timer: null, step: 0, next: 0 },

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
      this._startMusic();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  setVol(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },
  setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.value = (this.muted || !on) ? 0 : this.musicVol; },
  mute(on) { this.muted = !!on; if (this.master) this.master.gain.value = this.muted ? 0 : this.vol; if (this.musicGain) this.musicGain.gain.value = (this.muted || !this.musicOn) ? 0 : this.musicVol; },

  // ---- primitives (absolute-time scheduled) ----
  _osc(freq, dur, t, o) {
    o = o || {};
    const osc = this.ctx.createOscillator();
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
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
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
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
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
  _startMusic() {
    this._m.step = 0;
    this._m.next = this.ctx.currentTime + 0.15;
    this._m.timer = setInterval(() => this._schedule(), 25);
  },
  _schedule() {
    if (!this.ctx) return;
    const step = 0.25;                       // eighth notes (~120 BPM)
    while (this._m.next < this.ctx.currentTime + 0.13) {
      this._beat(this._m.step % 16, this._m.next);
      this._m.step++; this._m.next += step;
    }
  },
  _beat(i, t) {
    const G = this.musicGain, root = 110;     // A
    const semis = (n) => root * Math.pow(2, n / 12);
    if (i % 4 === 0) this._kick(t);
    if (i % 2 === 1) this._hat(t, i % 4 === 3 ? 0.05 : 0.03);
    const bass = [0, 0, 7, 0, 5, 5, 3, 5, 0, 0, 7, 0, 8, 8, 7, 5][i];
    this._osc(semis(bass) / 2, 0.26, t, { type: "triangle", vol: 0.16, dest: G });
    const lead = [12, -1, -1, -1, 15, -1, -1, 12, -1, -1, 19, -1, 17, -1, 15, -1][i];
    if (lead >= 0) this._osc(semis(lead), 0.42, t, { type: "sine", vol: 0.06, attack: 0.02, dest: G });
  },
  _kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.16);
    o.connect(g).connect(this.musicGain); o.start(t); o.stop(t + 0.18);
  },
  _hat(t, v) { this._noise(0.04, t, { type: "highpass", freq: 8000, q: 0.6, vol: v, dest: this.musicGain }); },
};
