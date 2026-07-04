// ------- player profile: shards, achievements, lifetime stats -------
// Persisted through CG.store, which already mirrors CrazyGames cloud-save <-> localStorage,
// so progress follows the player across the CrazyGames and standalone builds for free.
// Phase 3 layers accounts/Firebase on top of this same schema via the Cloud façade.
const PROFILE = {
  KEY: "tear_profile",
  data: null,
  _fresh() {
    return {
      v: 1,
      shards: 0,              // earned from achievements; future cosmetics currency
      ach: {},               // id -> unlock timestamp (ms)
      stats: {},             // lifetime counters + maxes (see PROFILE.stat)
      seen: {},              // id -> true once its unlock toast has been shown
      modes: {},             // mode id -> true (which modes have been played)
      created: Date.now(),
    };
  },
  load() {
    try { this.data = Object.assign(this._fresh(), JSON.parse(CG.store.get(this.KEY) || "{}")); }
    catch (e) { this.data = this._fresh(); }
    // defensive: nested objects may be missing on an old/partial save
    for (const k of ["ach", "stats", "seen", "modes"]) if (!this.data[k] || typeof this.data[k] !== "object") this.data[k] = {};
    return this.data;
  },
  save() { try { CG.store.set(this.KEY, JSON.stringify(this.data)); } catch (e) {} },

  // ---- shards (achievement currency) ----
  shards() { return this.data.shards || 0; },
  addShards(n) { this.data.shards = (this.data.shards || 0) + n; this.save(); },

  // ---- stats: `add` accumulates, `max` keeps the highest ever seen ----
  stat(k) { return this.data.stats[k] || 0; },
  addStat(k, n) { this.data.stats[k] = (this.data.stats[k] || 0) + (n == null ? 1 : n); },
  maxStat(k, v) { if (v > (this.data.stats[k] || 0)) this.data.stats[k] = v; },
  markMode(id) { if (!this.data.modes[id]) { this.data.modes[id] = true; this.addStat("modesPlayed", 1); } },
  modesPlayed() { return Object.keys(this.data.modes).length; },

  // ---- achievements ----
  unlocked(id) { return !!this.data.ach[id]; },
  // record an unlock + grant its shards; returns true if it was newly unlocked
  unlock(a) {
    if (this.data.ach[a.id]) return false;
    this.data.ach[a.id] = Date.now();
    this.data.shards = (this.data.shards || 0) + (a.shards || 0);
    this.save();
    return true;
  },
  unlockedCount() { return Object.keys(this.data.ach).length; },

  // non-destructive merge of a remote profile (cloud sync): take the BETTER of each side
  // so signing in never loses guest progress and never double-counts across devices.
  merge(r) {
    if (!r) return;
    this.data.shards = Math.max(this.data.shards || 0, r.shards || 0);
    if (r.stats) for (const k in r.stats) {
      if (k[0] === "_" && typeof r.stats[k] === "object") this.data.stats[k] = Object.assign(this.data.stats[k] || {}, r.stats[k]);   // nested trackers (e.g. _biomes)
      else this.data.stats[k] = Math.max(this.data.stats[k] || 0, r.stats[k] || 0);
    }
    if (r.ach) for (const id in r.ach) { if (!this.data.ach[id] || r.ach[id] < this.data.ach[id]) this.data.ach[id] = r.ach[id]; }
    if (r.modes) for (const m in r.modes) this.data.modes[m] = true;
    if (r.seen) for (const s in r.seen) this.data.seen[s] = true;
    // achievement set-trackers: union weapons won + Adventure difficulties cleared
    if (r.weaponsWon) { this.data.weaponsWon = this.data.weaponsWon || {}; for (const k in r.weaponsWon) this.data.weaponsWon[k] = 1; }
    if (r.advDiffs) { this.data.advDiffs = this.data.advDiffs || {}; for (const k in r.advDiffs) this.data.advDiffs[k] = 1; }
    // re-derive counts that depend on nested trackers
    this.data.stats.biomesSeen = Math.max(this.data.stats.biomesSeen || 0, Object.keys(this.data.stats._biomes || {}).length);
    this.data.stats.modesPlayed = Math.max(this.data.stats.modesPlayed || 0, Object.keys(this.data.modes).length);
    if (this.data.weaponsWon) this.data.stats.distinctWeaponsWon = Math.max(this.data.stats.distinctWeaponsWon || 0, Object.keys(this.data.weaponsWon).length);
    if (this.data.advDiffs) this.data.stats.clearAdvAll = Math.max(this.data.stats.clearAdvAll || 0, Object.keys(this.data.advDiffs).length);
  },
};
