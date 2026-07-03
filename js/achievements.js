// ------- achievements: data-driven feats that grant Shards -------
// Each achievement watches a lifetime stat in PROFILE (or a custom check). ACH.check()
// runs after gameplay events, unlocks any newly-met feats, grants their Shards, and
// queues a toast. Most are `stat >= goal`; `check(P)` allows anything bespoke.
// Rarity sets the Shard payout; the Achievements menu (Phase 2) reads these too.
const ACH = {
  RARITY: {
    common:    { name: "COMMON",    color: "#8a93a6", shards: 5 },
    uncommon:  { name: "UNCOMMON",  color: "#2f9e6b", shards: 12 },
    rare:      { name: "RARE",      color: "#2f7bd6", shards: 25 },
    epic:      { name: "EPIC",      color: "#9b53d6", shards: 50 },
    legendary: { name: "LEGENDARY", color: "#e0a326", shards: 100 },
  },
  CATS: {
    combat:   { name: "Combat",      color: "#e23b3b", icon: "⚔" },
    skill:    { name: "Skill",       color: "#13c4d6", icon: "✦" },
    progress: { name: "Progression", color: "#e0a326", icon: "▲" },
    boss:     { name: "Bosses",      color: "#9b53d6", icon: "☠" },
    survival: { name: "Survival",    color: "#2f9e6b", icon: "❤" },
    mastery:  { name: "Mastery",     color: "#c9ccd6", icon: "◆" },
  },

  // goal helper: a stat-threshold achievement (the common case)
  _s(id, cat, rarity, name, desc, stat, goal) {
    return { id, cat, rarity, name, desc, stat, goal };
  },

  list: [],   // filled by _build() below
  _build() {
    const S = this._s.bind(this);
    this.list = [
      // ---- COMBAT: raw kills ----
      S("first_blood", "combat", "common", "First Blood", "Defeat your first enemy.", "kills", 1),
      S("centurion", "combat", "uncommon", "Centurion", "Defeat 100 enemies.", "kills", 100),
      S("thousand_cuts", "combat", "rare", "Death of a Thousand Cuts", "Defeat 1,000 enemies.", "kills", 1000),
      S("reaper", "combat", "epic", "Reaper", "Defeat 5,000 enemies.", "kills", 5000),
      S("annihilation", "combat", "legendary", "Annihilation", "Defeat 20,000 enemies.", "kills", 20000),
      S("cull", "combat", "uncommon", "Cull", "Defeat 20 enemies in a single wave.", "killsOneWave", 20),
      S("massacre", "combat", "rare", "Massacre", "Defeat 40 enemies in a single wave.", "killsOneWave", 40),
      S("bomber_baiter", "combat", "uncommon", "Controlled Demolition", "Set off 25 bombers.", "bomberKills", 25),

      // ---- SKILL: the blade's craft ----
      S("first_parry", "skill", "common", "Turnabout", "Land your first perfect parry.", "parries", 1),
      S("deflector", "skill", "uncommon", "Deflector", "Parry or deflect 100 projectiles.", "deflects", 100),
      S("bulletstorm", "skill", "rare", "Bulletstorm", "Parry or deflect 1,000 projectiles.", "deflects", 1000),
      S("perfect_hand", "skill", "epic", "Perfect Hand", "Land 250 perfect parries.", "parries", 250),
      S("juggler", "skill", "uncommon", "Juggler", "Land 50 airborne hits.", "airHits", 50),
      S("titan_drop", "skill", "rare", "Titan Drop", "Land 25 power slams.", "superslams", 25),
      S("updraft_artist", "skill", "uncommon", "Updraft Artist", "Land 50 updraft launches.", "updrafts", 50),
      S("s_rank", "skill", "rare", "Immaculate", "Reach the top style rank in a run.", "topRank", 1),
      S("velocity", "skill", "epic", "Terminal Velocity", "Land a maximum-momentum strike.", "maxMomentum", 1),
      S("long_shot", "skill", "uncommon", "Long Shot", "Land 50 thrown-blade hits.", "throwHits", 50),

      // ---- PROGRESSION: getting deeper ----
      S("wave_10", "progress", "common", "Getting Warm", "Reach wave 10 in any mode.", "bestWave", 10),
      S("wave_25", "progress", "uncommon", "Seasoned", "Reach wave 25 in any mode.", "bestWave", 25),
      S("wave_50", "progress", "rare", "Unrelenting", "Reach wave 50 in any mode.", "bestWave", 50),
      S("wave_100", "progress", "legendary", "Endless", "Reach wave 100 in any mode.", "bestWave", 100),
      S("stage_clear", "progress", "uncommon", "Threshold", "Clear a full campaign stage.", "stageClears", 1),
      S("campaign", "progress", "epic", "Sealed", "Complete the Adventure campaign.", "campaignClears", 1),
      S("all_biomes", "progress", "rare", "Wayfarer", "Fight in all five biomes.", "biomesSeen", 5),

      // ---- BOSSES ----
      S("first_boss", "boss", "uncommon", "Giant Slayer", "Defeat your first boss.", "bossKills", 1),
      S("boss_5", "boss", "rare", "Warbreaker", "Defeat 5 bosses.", "bossKills", 5),
      S("boss_25", "boss", "epic", "Kingslayer", "Defeat 25 bosses.", "bossKills", 25),
      S("boss_gauntlet", "boss", "legendary", "The Whole Pantheon", "Defeat every boss in one Boss Test run.", "gauntletFull", 1),
      S("boss_nohit", "boss", "epic", "Untouchable", "Defeat a boss without taking a hit.", "bossNoHit", 1),

      // ---- SURVIVAL ----
      S("clean_wave", "survival", "common", "Spotless", "Clear a wave without taking a hit.", "noHitWaves", 1),
      S("clean_stage", "survival", "rare", "Immortal Run", "Clear a full stage without taking a hit.", "noHitStages", 1),
      S("marathon", "survival", "uncommon", "Marathon", "Survive 10 minutes in a single run.", "longestRun", 600),
      S("iron", "survival", "epic", "Iron Will", "Reach wave 5 in One-Hit mode.", "oneHitWave", 5),
      S("comeback", "survival", "uncommon", "Second Wind", "Survive a killing blow with a revive.", "revivesUsed", 1),

      // ---- MASTERY: the meta ----
      S("first_buy", "mastery", "common", "Invested", "Buy your first shop upgrade.", "shopBuys", 1),
      S("collector", "mastery", "rare", "Collector", "Own 6 abilities in a single run.", "abilitiesInRun", 6),
      S("rich", "mastery", "epic", "Coin Baron", "Earn 25,000 coins in total.", "coinsEarned", 25000),
      S("veteran", "mastery", "uncommon", "Veteran", "Finish 25 runs.", "runs", 25),
      S("well_rounded", "mastery", "rare", "Well-Rounded", "Play every game mode.", "modesPlayed", 5),
      S("student", "mastery", "common", "Apprentice", "Complete the tutorial.", "tutorialDone", 1),
    ];
  },

  byId(id) { return this.list.find((a) => a.id === id); },
  shardsFor(a) { return a.shards != null ? a.shards : (this.RARITY[a.rarity] || {}).shards || 5; },
  totalShards() { let s = 0; for (const a of this.list) s += this.shardsFor(a); return s; },

  // 0..1 progress toward an achievement (for the menu's bars)
  progress(a) {
    if (PROFILE.unlocked(a.id)) return 1;
    if (a.check) return a.check(PROFILE) ? 1 : 0;
    const cur = PROFILE.stat(a.stat), goal = a.goal || 1;
    return clamp(cur / goal, 0, 1);
  },
  progressText(a) {
    if (a.check || !a.goal) return PROFILE.unlocked(a.id) ? "Complete" : "Locked";
    const cur = Math.min(PROFILE.stat(a.stat), a.goal);
    return cur + " / " + a.goal;
  },

  pending: [],   // freshly unlocked -> the HUD/menu toast queue

  // evaluate every locked achievement; unlock + reward + queue toasts for newly-met ones
  check() {
    for (const a of this.list) {
      if (PROFILE.unlocked(a.id)) continue;
      const met = a.check ? a.check(PROFILE) : PROFILE.stat(a.stat) >= (a.goal || 1);
      if (met) {
        a.shards = this.shardsFor(a);
        if (PROFILE.unlock(a)) { this.pending.push(a); try { SFX.rankup(); } catch (e) {} }
      }
    }
  },
};
ACH._build();
