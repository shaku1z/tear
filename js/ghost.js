// ------- ghost runs: record the hero's path, replay it as a translucent ghost -------
// Records ONLY the player + blade tip at 10 Hz (quantized ints), so a packet is a few tens
// of KB — tiny enough for localStorage and a single Firestore doc. Enemies are procedural
// and would be huge to capture, so (like a racing game's time-trial ghost) we replay just
// the hero moving + slashing over the biome: you watch a top player's route + rhythm.
const GHOST = {
  RATE: 0.1,          // sample interval (seconds) -> 10 Hz
  rec: null,          // active recording
  play: null,         // active playback

  // ---- recording ----
  startRec() { this.rec = { px: [], py: [], bx: [], by: [], acc: 0 }; },
  sample(dt, player, blade) {
    const r = this.rec; if (!r || !player) return;
    r.acc += dt;
    if (r.acc < this.RATE) return;
    r.acc -= this.RATE;
    r.px.push(Math.round(player.x)); r.py.push(Math.round(player.y));
    r.bx.push(Math.round(blade ? blade.tipX : player.x)); r.by.push(Math.round(blade ? blade.tipY : player.y));
    if (r.px.length > 6000) { r.px.shift(); r.py.shift(); r.bx.shift(); r.by.shift(); }   // cap ~10 min
  },
  // finish + package (meta = { mode, diff, score, wave, name, stage }); null if too short
  stopRec(meta) {
    const r = this.rec; this.rec = null;
    if (!r || r.px.length < 10) return null;
    return Object.assign({ v: 1, dt: this.RATE, px: r.px, py: r.py, bx: r.bx, by: r.by }, meta);
  },

  // ---- local storage: keep your best-scoring ghost per board ----
  _key(mode, diff) { return "tear_ghost_" + mode + "_" + diff; },
  saveLocal(data) {
    try {
      const prev = this.loadLocal(data.mode, data.diff);
      if (!prev || (data.score || 0) >= (prev.score || 0)) CG.store.set(this._key(data.mode, data.diff), JSON.stringify(data));
    } catch (e) {}
  },
  loadLocal(mode, diff) { try { return JSON.parse(CG.store.get(this._key(mode, diff)) || "null"); } catch (e) { return null; } },

  // ---- playback ----
  begin(data) { this.play = data && data.px && data.px.length ? { data, t: 0 } : null; return !!this.play; },
  end() { this.play = null; },
  active() { return !!this.play; },
  duration() { const p = this.play; return p ? (p.data.px.length - 1) * p.data.dt : 0; },
  update(dt) { const p = this.play; if (!p) return; p.t += dt; const d = this.duration(); if (p.t > d) p.t -= d; },   // loop
  progress() { const p = this.play, d = this.duration(); return p && d ? p.t / d : 0; },
  // interpolated pose at the current playback time
  pose() {
    const p = this.play; if (!p) return null; const d = p.data;
    const n = d.px.length, f = p.t / d.dt;
    let i = Math.floor(f); if (i >= n - 1) i = n - 2; if (i < 0) i = 0;
    const a = f - i, L = (arr) => arr[i] + (arr[i + 1] - arr[i]) * a;
    const face = d.px[i + 1] >= d.px[i] ? 1 : -1;
    return { x: L(d.px), y: L(d.py), bx: L(d.bx), by: L(d.by), face };
  },
};
