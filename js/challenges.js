// ------- daily challenges: rotating bounties that grant Shards -------
// Three tasks per day, chosen DETERMINISTICALLY from the calendar date so every player
// gets the same daily set (a shared "bounty" feel + trivial to implement, no backend).
// Progress is tracked in per-day counters on PROFILE (reset when the date rolls over),
// reusing the same gameplay event hooks the achievements use. Completing one grants Shards.
const DAILY = {
  // the pool. key = a per-day counter; mode "add" accumulates, "max" keeps the best in one run.
  POOL: [
    { id: "d_kills",     key: "kills",     mode: "add", goal: 150, shards: 15, txt: (g) => "Defeat " + g + " enemies" },
    { id: "d_parry",     key: "parries",   mode: "add", goal: 15,  shards: 15, txt: (g) => "Land " + g + " perfect parries" },
    { id: "d_boss",      key: "boss",      mode: "add", goal: 2,   shards: 20, txt: (g) => "Defeat " + g + " bosses" },
    { id: "d_nohit",     key: "nohit",     mode: "add", goal: 5,   shards: 15, txt: (g) => "Clear " + g + " waves without being hit" },
    { id: "d_wave",      key: "wave",      mode: "max", goal: 15,  shards: 20, txt: (g) => "Reach wave " + g + " in one run" },
    { id: "d_superslam", key: "superslam", mode: "add", goal: 8,   shards: 15, txt: (g) => "Land " + g + " power slams" },
    { id: "d_updraft",   key: "updraft",   mode: "add", goal: 10,  shards: 15, txt: (g) => "Land " + g + " updraft launches" },
    { id: "d_runs",      key: "runs",      mode: "add", goal: 3,   shards: 10, txt: (g) => "Finish " + g + " runs" },
    { id: "d_deflect",   key: "deflect",   mode: "add", goal: 40,  shards: 12, txt: (g) => "Deflect " + g + " projectiles" },
    { id: "d_air",       key: "air",       mode: "add", goal: 25,  shards: 12, txt: (g) => "Land " + g + " airborne hits" },
  ],

  todayKey() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); },
  // ms until local midnight (for the "resets in" label)
  msToReset() { const d = new Date(), n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); return n - d; },
  resetsInText() {
    const ms = this.msToReset(), h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
    return h > 0 ? (h + "h " + m + "m") : (m + "m");
  },

  // roll over the day if needed: fresh counters + a fresh set
  _ensure() {
    const key = this.todayKey();
    if (!PROFILE.data.daily || PROFILE.data.daily.date !== key) {
      PROFILE.data.daily = { date: key, prog: {}, done: {} };
      PROFILE.save();
    }
    return PROFILE.data.daily;
  },
  // deterministic pick of 3 from the date (a tiny seeded shuffle)
  today() {
    this._ensure();
    let seed = 0; const s = this.todayKey(); for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
    const idx = this.POOL.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    return idx.slice(0, 3).map((i) => this.POOL[i]);
  },

  progress(ch) { const d = this._ensure(); return Math.min(d.prog[ch.key] || 0, ch.goal); },
  isDone(ch) { const d = this._ensure(); return !!d.done[ch.id]; },

  // called from the same gameplay hooks as achievements
  bump(key, v, mode) {
    const set = this.today();                       // ensures the day + gives today's 3
    if (!set.some((c) => c.key === key)) return;    // only track keys that are in today's set
    const d = PROFILE.data.daily;
    if (mode === "max") d.prog[key] = Math.max(d.prog[key] || 0, v);
    else d.prog[key] = (d.prog[key] || 0) + (v == null ? 1 : v);
    this.check();
  },
  // award any newly-completed challenge (once per day), queue an achievement-style toast
  check() {
    const set = this.today(), d = PROFILE.data.daily;
    for (const ch of set) {
      if (d.done[ch.id]) continue;
      if ((d.prog[ch.key] || 0) >= ch.goal) {
        d.done[ch.id] = 1;
        PROFILE.addShards(ch.shards);
        // reuse the achievement toast pipeline for a consistent "unlocked" moment
        if (typeof ACH !== "undefined") ACH.pending.push({ id: "daily_" + ch.id, name: "Daily Complete", desc: ch.txt(ch.goal), rarity: "uncommon", cat: "mastery", shards: ch.shards });
        PROFILE.save();
      }
    }
  },
  // how many of today's three are done (for the menu badge)
  doneCount() { const set = this.today(); return set.filter((c) => this.isDone(c)).length; },
};
