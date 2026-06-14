// ------- synthesized audio (Web Audio API, no external files) -------
const SFX = {
  ctx: null, master: null, musicGain: null,
  vol: 0.6, musicVol: 0.5, musicOn: true, muted: false,
  _m: { timer: null, step: 0 },

  // create/resume the audio context on the first user gesture (autoplay policy)
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
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.vol;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = (this.muted || !this.musicOn) ? 0 : this.musicVol;
      this.musicGain.connect(this.master);
      this._startMusic();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  setVol(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },
  setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.value = (this.muted || !on) ? 0 : this.musicVol; },

  // ---- primitives ----
  _tone(freq, dur, o) {
    if (!this.ctx) return;
    o = o || {};
    const t = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t + dur);
    const g = this.ctx.createGain();
    const vol = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(o.dest || this.master);
    osc.start(t); osc.stop(t + dur + 0.03);
  },
  _noise(dur, o) {
    if (!this.ctx) return;
    o = o || {};
    const t = this.ctx.currentTime + (o.delay || 0);
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type || "bandpass"; f.frequency.value = o.freq || 1000; f.Q.value = o.q || 1;
    const g = this.ctx.createGain();
    const vol = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },

  // ---- events ----
  swing(speed) {
    const v = clamp((speed - 700) / 2400, 0, 1);
    if (v <= 0) return;
    this._noise(0.16, { vol: 0.04 + v * 0.1, freq: 600 + v * 1300, q: 0.7 });
  },
  hit(big) {
    this._noise(0.08, { vol: big ? 0.32 : 0.18, freq: big ? 320 : 520, q: 0.8, type: "lowpass" });
    this._tone(big ? 150 : 240, 0.1, { type: "square", vol: big ? 0.16 : 0.09, slideTo: big ? 70 : 120 });
  },
  slam() {
    this._noise(0.24, { vol: 0.38, freq: 200, q: 0.6, type: "lowpass" });
    this._tone(120, 0.26, { type: "sawtooth", vol: 0.22, slideTo: 48 });
  },
  launch() { this._tone(300, 0.18, { type: "triangle", vol: 0.18, slideTo: 900 }); },
  uppercut() {
    this._tone(260, 0.3, { type: "sawtooth", vol: 0.26, slideTo: 1150 });
    this._noise(0.12, { vol: 0.14, freq: 1500, q: 0.8 });
  },
  parry() {
    this._tone(1500, 0.12, { type: "square", vol: 0.22, slideTo: 2600 });
    this._tone(950, 0.2, { type: "sine", vol: 0.16, slideTo: 1900 });
  },
  deflect() { this._tone(1000, 0.07, { type: "square", vol: 0.13, slideTo: 1500 }); },
  throwBlade() {
    this._noise(0.2, { vol: 0.16, freq: 900, q: 0.5 });
    this._tone(520, 0.18, { type: "triangle", vol: 0.1, slideTo: 200 });
  },
  recall() { this._tone(300, 0.18, { type: "triangle", vol: 0.12, slideTo: 820 }); },
  death() {
    this._noise(0.3, { vol: 0.26, freq: 420, q: 0.4, type: "lowpass" });
    this._tone(200, 0.3, { type: "sawtooth", vol: 0.13, slideTo: 40 });
  },
  hurt() {
    this._tone(220, 0.2, { type: "square", vol: 0.22, slideTo: 80 });
    this._noise(0.12, { vol: 0.18, freq: 300, q: 0.5, type: "lowpass" });
  },
  dash() { this._noise(0.14, { vol: 0.16, freq: 1300, q: 0.6, type: "highpass" }); },
  jump() { this._tone(360, 0.1, { type: "triangle", vol: 0.1, slideTo: 620 }); },
  ui() { this._tone(660, 0.05, { type: "square", vol: 0.1 }); },
  wave() {
    this._tone(440, 0.14, { type: "triangle", vol: 0.16, slideTo: 660 });
    this._tone(660, 0.2, { type: "triangle", vol: 0.16, slideTo: 880, delay: 0.13 });
  },
  gameover() {
    this._tone(440, 0.25, { type: "sawtooth", vol: 0.18, slideTo: 330 });
    this._tone(330, 0.35, { type: "sawtooth", vol: 0.18, slideTo: 165, delay: 0.22 });
  },

  // ---- sparse ambient music loop ----
  _startMusic() {
    const notes = [0, 3, 7, 10, 12, 10, 7, 3];   // A natural-minor-ish
    const root = 110, stepDur = 0.5;
    this._m.step = 0;
    const tick = () => {
      if (!this.ctx) return;
      const i = this._m.step % notes.length;
      const f = root * Math.pow(2, notes[i] / 12);
      this._tone(f / 2, 0.42, { type: "triangle", vol: 0.16, dest: this.musicGain });
      if (i % 4 === 0) this._tone(f * 2, 0.6, { type: "sine", vol: 0.07, dest: this.musicGain });
      this._m.step++;
    };
    tick();
    this._m.timer = setInterval(tick, stepDur * 1000);
  },
};
