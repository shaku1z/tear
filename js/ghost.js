// ------- ghost runs 2.0: multi-track recording + a real replay engine + the local Vault -------
// v1 recorded only the hero at 10 Hz. v2 records everything needed to RECONSTRUCT the run:
//   playerTrack  — hero x/y + blade tip + facing, 10 Hz (flat quantized arrays)
//   enemyTrack   — spawns (kind/variant/boss id), 4 Hz alive samples, deaths
//   stageTrack   — every biome change, so playback shows the RIGHT backdrop at time t
//   waveTrack    — wave start/clear + boss beats (the scrubber's chapter markers)
//   eventTrack   — parries, power slams, updrafts, pickups, revives, the death
//   loadout      — every draft/tier pick in order + the final kit
// A full long run stays ~50-150 KB of JSON — fine for localStorage and a single Firestore doc.
// Playback is time-driven (seek/pause/speed) — GHOST.pose()/enemiesAt()/stageAt() answer
// "what was on screen at t", so the renderer never depends on live game state.
const GHOST = {
  RATE: 0.1,           // player sample interval (10 Hz)
  ERATE: 0.25,         // enemy sample interval (4 Hz)
  rec: null,           // active recording
  play: null,          // active playback

  // ---- recording ----
  startRec() {
    this.rec = {
      t: 0, acc: 0, eacc: 0, gid: 0,
      px: [], py: [], tx: [], ty: [], fc: [],
      stages: [], waves: [], spawns: [], esamp: [], deaths: [],
      events: [], loadout: [],
      thumb: null, thumbPri: -1, thumbAt: -1e9,
    };
  },
  recording() { return !!this.rec; },
  sample(dt, player, blade, enemies) {
    const r = this.rec; if (!r || !player) return;
    r.t += dt; r.acc += dt; r.eacc += dt;
    if (r.acc >= this.RATE) {
      r.acc -= this.RATE;
      r.px.push(Math.round(player.x)); r.py.push(Math.round(player.y));
      r.tx.push(Math.round(blade ? blade.tipX : player.x)); r.ty.push(Math.round(blade ? blade.tipY : player.y));
      r.fc.push(player.facing >= 0 ? 1 : 0);
      if (r.px.length > 9000) this._trim(r);   // ~15 min cap: drop the oldest quarter
    }
    if (r.eacc >= this.ERATE && enemies) {
      r.eacc -= this.ERATE;
      const tick = [Math.round(r.t * 10)];
      for (const e of enemies) { if (!e.dead && e._gid) { tick.push(e._gid, Math.round(e.x), Math.round(e.y)); } }
      r.esamp.push(tick);
    }
  },
  _trim(r) {
    const cut = Math.floor(r.px.length / 4), tCut = cut * this.RATE;
    for (const k of ["px", "py", "tx", "ty", "fc"]) r[k] = r[k].slice(cut);
    const sh = (arr) => arr.filter((x) => x.t >= tCut).map((x) => Object.assign({}, x, { t: +(x.t - tCut).toFixed(1) }));
    r.stages = sh(r.stages); r.waves = sh(r.waves); r.spawns = sh(r.spawns); r.deaths = sh(r.deaths); r.events = sh(r.events); r.loadout = sh(r.loadout);
    r.esamp = r.esamp.filter((tk) => tk[0] / 10 >= tCut).map((tk) => { const c = tk.slice(); c[0] = Math.round(c[0] - tCut * 10); return c; });
    r.t -= tCut;
  },
  _t() { return this.rec ? +this.rec.t.toFixed(1) : 0; },
  stage(i) { if (this.rec) this.rec.stages.push({ t: this._t(), s: i }); },
  wave(w, ev) { if (this.rec) this.rec.waves.push({ t: this._t(), w, e: ev }); },
  spawn(e, kind, extra) {
    if (!this.rec || !e) return;
    e._gid = ++this.rec.gid;
    this.rec.spawns.push(Object.assign({ t: this._t(), id: e._gid, k: kind, x: Math.round(e.x), y: Math.round(e.y) }, extra || {}));
  },
  death(e, cause) { if (this.rec && e && e._gid) this.rec.deaths.push({ t: this._t(), id: e._gid, c: cause || "" }); },
  event(kind, x, y) { if (this.rec) this.rec.events.push({ t: this._t(), k: kind, x: Math.round(x || 0), y: Math.round(y || 0) }); },
  loadoutPick(id, tier, wave) { if (this.rec) this.rec.loadout.push({ t: this._t(), id, tier: tier || 1, w: wave || 0 }); },
  // thumbnail: a tiny canvas grab at the run's biggest moment (highest priority wins; throttled)
  snapshot(canvas, priority) {
    const r = this.rec; if (!r || !canvas) return;
    if (priority <= r.thumbPri || r.t - r.thumbAt < 4) return;
    try {
      const c = document.createElement("canvas"); c.width = 160; c.height = 90;
      c.getContext("2d").drawImage(canvas, 0, 0, 160, 90);
      r.thumb = c.toDataURL("image/jpeg", 0.55);
      r.thumbPri = priority; r.thumbAt = r.t;
    } catch (e) {}
  },
  // finish + package; meta/summary composed by the game. null if too short.
  stopRec(meta) {
    const r = this.rec; this.rec = null;
    if (!r || r.px.length < 20) return null;
    return Object.assign({
      v: 2, dt: this.RATE, edt: this.ERATE,
      px: r.px, py: r.py, tx: r.tx, ty: r.ty, fc: r.fc,
      stages: r.stages, waves: r.waves, spawns: r.spawns, esamp: r.esamp, deaths: r.deaths,
      events: r.events, loadout: r.loadout, thumb: r.thumb,
    }, meta || {});
  },

  // ---- playback ----
  begin(data) {
    if (!data) return null;
    if (data.v !== 2) data = this._fromV1(data);   // legacy #1-ghost packets still play
    if (!data || !data.px || data.px.length < 2) return null;
    this.play = { d: data, t: 0, playing: true, speed: 1, evPtr: 0, dePtr: 0 };
    return this.play;
  },
  _fromV1(d) {
    if (!d || !d.px) return null;
    return { v: 2, dt: d.dt || 0.1, edt: 0.25, px: d.px, py: d.py, tx: d.bx || d.px, ty: d.by || d.py,
      fc: null, stages: [{ t: 0, s: d.stage || 0 }], waves: [], spawns: [], esamp: [], deaths: [], events: [], loadout: [],
      mode: d.mode, diff: d.diff, score: d.score, wave: d.wave, name: d.name, stage: d.stage };
  },
  end() { this.play = null; },
  active() { return !!this.play; },
  duration() { const p = this.play; return p ? (p.d.px.length - 1) * p.d.dt : 0; },
  update(dt) {
    const p = this.play; if (!p || !p.playing) return;
    p.t += dt * p.speed;
    if (p.t >= this.duration()) { p.t = this.duration(); p.playing = false; }   // hold on the final frame
  },
  seek(t) { const p = this.play; if (!p) return; p.t = Math.max(0, Math.min(t, this.duration())); p.evPtr = 0; p.dePtr = 0; p._skipFx = true; },
  toggle() { const p = this.play; if (!p) return; if (!p.playing && p.t >= this.duration()) p.t = 0; p.playing = !p.playing; },
  cycleSpeed() { const p = this.play; if (!p) return; const s = [0.5, 1, 2, 4]; p.speed = s[(s.indexOf(p.speed) + 1) % s.length]; },
  progress() { const p = this.play, d = this.duration(); return p && d ? p.t / d : 0; },
  // interpolated hero pose at playback time
  pose() {
    const p = this.play; if (!p) return null; const d = p.d;
    const n = d.px.length, f = p.t / d.dt;
    let i = Math.floor(f); if (i >= n - 1) i = n - 2; if (i < 0) i = 0;
    const a = Math.max(0, Math.min(1, f - i)), L = (arr) => arr[i] + (arr[i + 1] - arr[i]) * a;
    const face = d.fc ? (d.fc[i] ? 1 : -1) : (d.px[i + 1] >= d.px[i] ? 1 : -1);
    return { x: L(d.px), y: L(d.py), bx: L(d.tx), by: L(d.ty), face };
  },
  // every enemy alive at playback time, with interpolated positions
  enemiesAt() {
    const p = this.play; if (!p) return []; const d = p.d;
    if (!d.esamp.length) return [];
    const tt = p.t * 10;   // ticks are stored as round(t*10)
    // binary search the tick at/just-before tt
    let lo = 0, hi = d.esamp.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (d.esamp[mid][0] <= tt) lo = mid; else hi = mid - 1; }
    const A = d.esamp[lo], B = d.esamp[lo + 1];
    const a = B ? Math.max(0, Math.min(1, (tt - A[0]) / Math.max(1, B[0] - A[0]))) : 0;
    const posB = {};
    if (B) for (let j = 1; j < B.length; j += 3) posB[B[j]] = { x: B[j + 1], y: B[j + 2] };
    const out = [];
    for (let j = 1; j < A.length; j += 3) {
      const id = A[j]; let x = A[j + 1], y = A[j + 2];
      const nb = posB[id];
      if (nb && Math.abs(nb.x - x) < 400 && Math.abs(nb.y - y) < 400) { x += (nb.x - x) * a; y += (nb.y - y) * a; }
      out.push({ id, x, y });
    }
    return out;
  },
  spawnInfo(id) { const p = this.play; if (!p) return null; return p.d.spawns.find((s) => s.id === id) || null; },
  stageAt() {
    const p = this.play; if (!p) return 0; let s = p.d.stage || 0;
    for (const e of p.d.stages) { if (e.t <= p.t) s = e.s; else break; }
    return s;
  },
  waveAt() {
    const p = this.play; if (!p) return 0; let w = 0;
    for (const e of p.d.waves) { if (e.t <= p.t) w = e.w; else break; }
    return w;
  },
  // chapter markers for the scrubber: wave starts + boss beats
  chapters() {
    const p = this.play; if (!p) return [];
    return p.d.waves.filter((e) => e.e === "start" || e.e === "boss").map((e) => ({ t: e.t, label: e.e === "boss" ? "BOSS" : "W" + e.w, boss: e.e === "boss" }));
  },
  jumpChapter(dir) {
    const p = this.play; if (!p) return;
    const ch = this.chapters(); if (!ch.length) return;
    if (dir > 0) { const nx = ch.find((c) => c.t > p.t + 0.2); this.seek(nx ? nx.t : this.duration()); }
    else { const pv = [...ch].reverse().find((c) => c.t < p.t - 0.5); this.seek(pv ? pv.t : 0); }
  },
  // events/deaths whose time was just crossed this frame (for playback FX) — consumed once
  crossed() {
    const p = this.play; if (!p) return { events: [], deaths: [] };
    if (p._skipFx) { // after a seek, fast-forward the pointers without firing FX
      while (p.evPtr < p.d.events.length && p.d.events[p.evPtr].t <= p.t) p.evPtr++;
      while (p.dePtr < p.d.deaths.length && p.d.deaths[p.dePtr].t <= p.t) p.dePtr++;
      p._skipFx = false; return { events: [], deaths: [] };
    }
    const ev = [], de = [];
    while (p.evPtr < p.d.events.length && p.d.events[p.evPtr].t <= p.t) ev.push(p.d.events[p.evPtr++]);
    while (p.dePtr < p.d.deaths.length && p.d.deaths[p.dePtr].t <= p.t) de.push(p.d.deaths[p.dePtr++]);
    return { events: ev, deaths: de };
  },

  // ---- legacy per-board best (kept so old callers don't break; superseded by VAULT) ----
  _key(mode, diff) { return "tear_ghost_" + mode + "_" + diff; },
  saveLocal(data) {
    try {
      const prev = this.loadLocal(data.mode, data.diff);
      if (!prev || (data.score || 0) >= (prev.score || 0)) CG.store.set(this._key(data.mode, data.diff), JSON.stringify(data));
    } catch (e) {}
  },
  loadLocal(mode, diff) { try { return JSON.parse(CG.store.get(this._key(mode, diff)) || "null"); } catch (e) { return null; } },
};

// ------- the Replay Vault: every run saved locally, pin the keepers -------
// Index (small) + one blob per entry, all through CG.store so it rides the same
// persistence as everything else (CG Data module on-platform, localStorage off).
const VAULT = {
  MAX_UNPINNED: 12, MAX_PINNED: 10,
  _index: null,
  index() {
    if (this._index) return this._index;
    try { this._index = JSON.parse(CG.store.get("tear_vault_index") || "[]"); } catch (e) { this._index = []; }
    return this._index;
  },
  _saveIndex() { try { CG.store.set("tear_vault_index", JSON.stringify(this._index)); } catch (e) {} },
  // save a finished run; `summary` is the small card object (mode/diff/wave/score/thumb/…)
  add(recording, summary) {
    if (!recording) return null;
    const id = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { CG.store.set("tear_vault_" + id, JSON.stringify(recording)); } catch (e) { return null; }   // storage full -> skip silently
    const idx = this.index();
    idx.unshift({ id, ts: Date.now(), pin: false, shareId: null, sum: summary || {} });
    // eviction: oldest unpinned beyond the cap
    const unpinned = idx.filter((e) => !e.pin);
    for (let i = unpinned.length - 1; i >= this.MAX_UNPINNED; i--) this._drop(unpinned[i].id);
    this._saveIndex();
    return id;
  },
  _drop(id) {
    this._index = this.index().filter((e) => e.id !== id);
    try { CG.store.set("tear_vault_" + id, ""); } catch (e) {}
  },
  get(id) { try { return JSON.parse(CG.store.get("tear_vault_" + id) || "null"); } catch (e) { return null; } },
  remove(id) { this._drop(id); this._saveIndex(); },
  pin(id, on) {
    const e = this.index().find((x) => x.id === id); if (!e) return false;
    if (on && this.index().filter((x) => x.pin).length >= this.MAX_PINNED) return false;
    e.pin = !!on; this._saveIndex(); return true;
  },
  setShareId(id, shareId) { const e = this.index().find((x) => x.id === id); if (e) { e.shareId = shareId; this._saveIndex(); } },
};
