// ------- achievements: data-driven feats that grant Shards -------
// Each achievement watches a lifetime stat in PROFILE (or a custom check). ACH.check()
// runs after gameplay events, unlocks any newly-met feats, grants their Shards, and
// queues a toast. Most are `stat >= goal`; `check(P)` allows anything bespoke.
// Rarity sets the Shard payout; the Achievements menu (Phase 2) reads these too.
const ACH = {
  RARITY: {
    common:    { name: "COMMON",    color: "#8a93a6", shards: 5, coins: 100 },
    uncommon:  { name: "UNCOMMON",  color: "#2f9e6b", shards: 12, coins: 300 },
    rare:      { name: "RARE",      color: "#2f7bd6", shards: 25, coins: 700 },
    epic:      { name: "EPIC",      color: "#9b53d6", shards: 50, coins: 1500 },
    legendary: { name: "LEGENDARY", color: "#e0a326", shards: 100, coins: 4000 },
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

      // ---- THE BOSS PANTHEON: fell each named boss ----
      S("boss_warden", "boss", "uncommon", "Jailbreak", "Defeat The Warden.", "killWarden", 1),
      S("boss_colossus", "boss", "rare", "Scrap Metal", "Defeat The Iron Colossus.", "killColossus", 1),
      S("boss_aldric", "boss", "rare", "Regicide", "Defeat The Berserker King, Aldric.", "killAldric", 1),
      S("boss_echo", "boss", "epic", "Shattered Mirror", "Defeat The Echo.", "killEcho", 1),
      S("boss_source", "boss", "legendary", "The Wound Closes", "Defeat The Source.", "killSource", 1),

      // ---- ENDLESS MILESTONES (Endless mode only) ----
      S("endless_25", "survival", "uncommon", "Endless: Initiation", "Reach Wave 25 in Endless.", "bestWaveEndless", 25),
      S("endless_50", "survival", "rare", "Endless: Midway", "Reach Wave 50 in Endless.", "bestWaveEndless", 50),
      S("endless_75", "survival", "epic", "Endless: Deep Dive", "Reach Wave 75 in Endless.", "bestWaveEndless", 75),
      S("endless_100", "survival", "legendary", "Beyond", "Reach Wave 100 in Endless.", "bestWaveEndless", 100),

      // ---- DIFFICULTY MASTERY ----
      S("adv_hard", "progress", "rare", "Hardened", "Clear Adventure on Hard difficulty.", "clearAdvHard", 1),
      S("adv_extreme", "progress", "epic", "Masochist", "Clear Adventure on Extreme difficulty.", "clearAdvExtreme", 1),
      S("adv_all", "progress", "legendary", "Omnipotent", "Clear Adventure on all 5 difficulties.", "clearAdvAll", 5),
      S("endless_50_hard", "survival", "epic", "Endurance", "Reach Wave 50 in Endless on Hard.", "wave50Hard", 1),
      S("endless_100_extreme", "survival", "legendary", "Beyond Human", "Reach Wave 100 in Endless on Extreme.", "wave100Extreme", 1),
      S("adv_flawless", "survival", "legendary", "Flawless Victory", "Clear the whole Adventure campaign without taking a single hit.", "clearAdvNoHit", 1),

      // ---- COMBAT POLISH ----
      S("overkill", "combat", "uncommon", "Overkill", "Deal over 3,000 damage in a single strike.", "maxDamageHit", 3000),
      S("collateral", "skill", "uncommon", "Collateral Damage", "Defeat an enemy by throwing the blade through another enemy.", "throwPierceKills", 1),
      S("surgeon", "combat", "rare", "Surgeon", "Stack 20 Bleed on a single enemy.", "maxBleedStacks", 20),
      S("inferno", "combat", "rare", "Inferno", "Have 10 enemies burning at once.", "maxConcurrentBurn", 10),
      S("floor_is_lava", "skill", "epic", "Air Superiority", "Stay airborne for 15 straight seconds.", "maxAirTime", 15),
      S("gravity_defied", "skill", "rare", "Gravity Defied", "Chain 3 Updraft launches without landing.", "consecutiveUpdrafts", 3),
      S("friendly_fire", "combat", "rare", "Friendly Fire", "Have a Bomber blast kill 3 other enemies.", "bomberBetrayal", 3),

      // ---- MASTERY & META ----
      S("weapon_master", "mastery", "rare", "Armory", "Win a run with each weapon.", "distinctWeaponsWon", 2),
      S("arsenal", "mastery", "legendary", "Arsenal", "Max out every item in the meta shop.", "shopMaxed", 13),
      S("speedrunner", "mastery", "epic", "Speedrunner", "Clear the Adventure campaign in under 15 minutes.", "speedrunUnder15", 1),
      S("close_call", "survival", "rare", "By a Thread", "Defeat a boss while at 10% HP or lower.", "bossKillsLowHP", 1),

      // ---- BOSS DISRESPECT: humiliation tactics ----
      S("warden_deflect", "boss", "epic", "Stop Hitting Yourself", "Defeat The Warden using ONLY their deflected projectiles.", "wardenDeflectOnly", 1),
      S("colossus_throw", "boss", "rare", "David and Goliath", "Defeat The Iron Colossus without a single melee swing (throws only).", "colossusThrowOnly", 1),
      S("aldric_interrupt", "boss", "epic", "Silence, King", "Interrupt Aldric with a Power Slam 3 times in one fight.", "aldricSlams", 3),
      S("echo_parry", "boss", "legendary", "I Am Rubber", "Land the killing blow on The Echo with a deflected projectile.", "echoReflectKill", 1),
      S("source_speed", "boss", "epic", "Pulling the Plug", "Defeat The Source in under 60 seconds.", "sourceSpeedrun", 1),

      // ---- THE SADIST: physics & sandbox shenanigans ----
      S("space_program", "skill", "rare", "Space Program", "Launch an enemy clean off the top of the screen.", "launchOffScreen", 1),
      S("pinball", "skill", "epic", "Pinball Wizard", "Hit 4 different enemies with a single thrown blade.", "bladeBounces", 4),
      S("rainbow_pain", "combat", "epic", "Taste the Rainbow", "Have Bleed, Burn and Mark on one enemy at once.", "tripleStatus", 1),
      S("surgical", "combat", "rare", "Surgical Extraction", "Kill an Armored enemy with status effects — armor never broken.", "armorBypassKills", 1),
      S("air_assassination", "skill", "epic", "Death from Above", "Kill 3 enemies in one airborne combo without landing.", "airComboKills", 3),

      // ---- THE MASOCHIST: self-imposed restrictions ----
      S("no_takebacks", "mastery", "epic", "No Takebacks", "Clear an Adventure stage without ever throwing your blade.", "stageNoThrow", 1),
      S("butterfingers", "mastery", "epic", "Butterfingers", "Clear an Adventure stage without a single melee swing.", "stageThrowOnly", 1),
      S("glass_cannon", "mastery", "rare", "Glass Cannon", "Clear a stage with damage upgrades but no Thick Skin or Warding.", "stageGlassCannon", 1),
      S("deflector_shield", "skill", "epic", "Immovable Object", "Perfect-parry 10 in a row without moving, dashing or being hit.", "staticParryStreak", 10),
      S("heavy_boots", "mastery", "epic", "Heavy Boots", "Clear a 10-wave stage without jumping once.", "stageNoJump", 1),

      // ---- ANOMALIES & ECONOMY ----
      S("the_setup", "skill", "rare", "The Setup", "Updraft an Armored enemy, then spike it into the ground.", "spikeArmored", 1),
      S("return_to_sender", "combat", "uncommon", "Return to Sender", "Kill a Bomber with its own deflected bomb.", "bombDeflectKills", 1),
      S("chain_reaction", "combat", "rare", "Chain Reaction", "Kill 5 enemies with a single deflected bomb.", "bombMultikill", 5),
      S("matador", "skill", "rare", "Matador", "I-frame dash through 15 projectiles in one run.", "projectileDashes", 15),
      S("cinematic_kill", "combat", "uncommon", "Stylishly Late", "Land a kill during the stage-clear transition.", "transitionKills", 1),
      S("phoenix_full", "survival", "epic", "From the Ashes", "Revive from a killing blow, then heal back to full HP.", "reviveToFull", 1),
      S("horde_breaker", "combat", "rare", "Horde Breaker", "Clear an Endless horde wave in under 15 seconds.", "fastHordeClear", 1),
      S("exodia", "mastery", "legendary", "The Forbidden Technique", "Own Long Arm, Throwing Arm, Aether Step and Lifeline at once.", "exodiaBuild", 1),
    ];

    // ---- CATEGORY MASTERY: unlock every OTHER achievement in a category ----
    const CAT_MASTERY = [
      { id: "master_combat", cat: "combat", name: "Warmaster", desc: "Complete all other Combat achievements." },
      { id: "master_skill", cat: "skill", name: "Virtuoso", desc: "Complete all other Skill achievements." },
      { id: "master_progress", cat: "progress", name: "The Journey", desc: "Complete all other Progression achievements." },
      { id: "master_boss", cat: "boss", name: "Godslayer", desc: "Complete all other Boss achievements." },
      { id: "master_survival", cat: "survival", name: "Indomitable", desc: "Complete all other Survival achievements." },
      { id: "master_mastery", cat: "mastery", name: "The Apex", desc: "Complete all other Mastery achievements." },
    ];
    for (const m of CAT_MASTERY) {
      const ach = S(m.id, m.cat, "epic", m.name, m.desc);
      ach.check = () => this.list.filter((a) => a.cat === m.cat && a.id !== m.id && !a.master).every((a) => PROFILE.unlocked(a.id));
      ach.master = true;   // excluded from other masters' checks so they don't wait on each other
      this.list.push(ach);
    }
    // ---- THE PLATINUM: unlock literally everything else ----
    const platinum = S("completionist", "mastery", "legendary", "The Momentum Blade", "Unlock every other achievement in Tear.");
    platinum.check = () => this.list.filter((a) => a.id !== "completionist").every((a) => PROFILE.unlocked(a.id));
    platinum.master = true;
    this.list.push(platinum);
  },

  byId(id) { return this.list.find((a) => a.id === id); },
  shardsFor(a) { return a.shards != null ? a.shards : (this.RARITY[a.rarity] || {}).shards || 5; },
  coinsFor(a) { return a.coins != null ? a.coins : (this.RARITY[a.rarity] || {}).coins || 0; },
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
        a.coins = this.coinsFor(a);
        if (PROFILE.unlock(a)) { this.pending.push(a); try { SFX.rankup(); } catch (e) {} }
      }
    }
  },
};
ACH._build();
