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
};
