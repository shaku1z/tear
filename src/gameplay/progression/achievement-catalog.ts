import type { AchievementCategory, AchievementRarity } from "./achievements";

export type AchievementCatalogRule =
  | Readonly<{ kind: "stat-threshold"; stat: string; goal: number }>
  | Readonly<{ kind: "manual" }>
  | Readonly<{ kind: "all-shop-items" }>
  | Readonly<{ kind: "category-complete"; category: AchievementCategory }>
  | Readonly<{ kind: "all-achievements" }>;

export interface AchievementCatalogEntry {
  readonly id: string;
  readonly cat: AchievementCategory;
  readonly rarity: AchievementRarity;
  readonly name: string;
  readonly desc: string;
  readonly hidden: boolean;
  readonly manual: boolean;
  readonly master: boolean;
  readonly rule: AchievementCatalogRule;
}

function stat(id: string, cat: AchievementCategory, rarity: AchievementRarity, name: string, desc: string, metric: string, goal: number): AchievementCatalogEntry {
  return Object.freeze({ id, cat, rarity, name, desc, hidden: false, manual: false, master: false, rule: Object.freeze({ kind: "stat-threshold" as const, stat: metric, goal }) });
}

function manual(id: string, cat: AchievementCategory, rarity: AchievementRarity, name: string, desc: string): AchievementCatalogEntry {
  return Object.freeze({ id, cat, rarity, name, desc, hidden: true, manual: true, master: false, rule: Object.freeze({ kind: "manual" as const }) });
}

function allShopItems(id: string, cat: AchievementCategory, rarity: AchievementRarity, name: string, desc: string): AchievementCatalogEntry {
  return Object.freeze({ id, cat, rarity, name, desc, hidden: false, manual: false, master: false, rule: Object.freeze({ kind: "all-shop-items" as const }) });
}

function categoryComplete(id: string, cat: AchievementCategory, name: string, desc: string): AchievementCatalogEntry {
  return Object.freeze({ id, cat, rarity: "epic" as const, name, desc, hidden: false, manual: false, master: true, rule: Object.freeze({ kind: "category-complete" as const, category: cat }) });
}

function allAchievements(id: string, cat: AchievementCategory, rarity: AchievementRarity, name: string, desc: string): AchievementCatalogEntry {
  return Object.freeze({ id, cat, rarity, name, desc, hidden: false, manual: false, master: true, rule: Object.freeze({ kind: "all-achievements" as const }) });
}

/**
 * Immutable authored achievement metadata. Runtime predicates and economy
 * ports are joined by `createAchievements`; they are deliberately absent here.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementCatalogEntry[] = Object.freeze([
  // ---- COMBAT: raw kills ----
  stat("first_blood", "combat", "common", "First Blood", "Defeat your first enemy.", "kills", 1),
  stat("centurion", "combat", "uncommon", "Centurion", "Defeat 100 enemies.", "kills", 100),
  stat("thousand_cuts", "combat", "rare", "Death of a Thousand Cuts", "Defeat 1,000 enemies.", "kills", 1000),
  stat("reaper", "combat", "epic", "Reaper", "Defeat 5,000 enemies.", "kills", 5000),
  stat("annihilation", "combat", "legendary", "Annihilation", "Defeat 20,000 enemies.", "kills", 20000),
  stat("cull", "combat", "uncommon", "Cull", "Defeat 20 enemies in a single wave.", "killsOneWave", 20),
  stat("massacre", "combat", "rare", "Massacre", "Defeat 40 enemies in a single wave.", "killsOneWave", 40),
  stat("bomber_baiter", "combat", "uncommon", "Controlled Demolition", "Set off 25 bombers.", "bomberKills", 25),

  // ---- SKILL: the blade's craft ----
  stat("first_parry", "skill", "common", "Turnabout", "Land your first perfect parry.", "parries", 1),
  stat("deflector", "skill", "uncommon", "Deflector", "Parry or deflect 100 projectiles.", "deflects", 100),
  stat("bulletstorm", "skill", "rare", "Bulletstorm", "Parry or deflect 1,000 projectiles.", "deflects", 1000),
  stat("perfect_hand", "skill", "epic", "Perfect Hand", "Land 250 perfect parries.", "parries", 250),
  stat("juggler", "skill", "uncommon", "Juggler", "Land 50 airborne hits.", "airHits", 50),
  stat("titan_drop", "skill", "rare", "Titan Drop", "Land 25 power slams.", "superslams", 25),
  stat("updraft_artist", "skill", "uncommon", "Updraft Artist", "Land 50 updraft launches.", "updrafts", 50),
  stat("s_rank", "skill", "rare", "Immaculate", "Reach the top style rank in a run.", "topRank", 1),
  stat("velocity", "skill", "epic", "Terminal Velocity", "Land a maximum-momentum strike.", "maxMomentum", 1),
  stat("long_shot", "skill", "uncommon", "Long Shot", "Land 50 thrown-blade hits.", "throwHits", 50),

  // ---- PROGRESSION: getting deeper ----
  stat("wave_10", "progress", "common", "Getting Warm", "Reach wave 10 in any mode.", "bestWave", 10),
  stat("wave_25", "progress", "uncommon", "Seasoned", "Reach wave 25 in any mode.", "bestWave", 25),
  stat("wave_50", "progress", "rare", "Unrelenting", "Reach wave 50 in any mode.", "bestWave", 50),
  stat("wave_100", "progress", "legendary", "Endless", "Reach wave 100 in any mode.", "bestWave", 100),
  stat("stage_clear", "progress", "uncommon", "Threshold", "Clear a full campaign stage.", "stageClears", 1),
  stat("campaign", "progress", "epic", "Sealed", "Complete the Adventure campaign.", "campaignClears", 1),
  stat("all_biomes", "progress", "rare", "Wayfarer", "Fight in all five biomes.", "biomesSeen", 5),

  // ---- BOSSES ----
  stat("first_boss", "boss", "uncommon", "Giant Slayer", "Defeat your first boss.", "bossKills", 1),
  stat("boss_5", "boss", "rare", "Warbreaker", "Defeat 5 bosses.", "bossKills", 5),
  stat("boss_25", "boss", "epic", "Kingslayer", "Defeat 25 bosses.", "bossKills", 25),
  stat("boss_gauntlet", "boss", "legendary", "The Whole Pantheon", "Defeat every boss in one Boss Test run.", "gauntletFull", 1),
  stat("boss_nohit", "boss", "epic", "Untouchable", "Defeat a boss without taking a hit.", "bossNoHit", 1),

  // ---- SURVIVAL ----
  stat("clean_wave", "survival", "common", "Spotless", "Clear a wave without taking a hit.", "noHitWaves", 1),
  stat("clean_stage", "survival", "rare", "Immortal Run", "Clear a full stage without taking a hit.", "noHitStages", 1),
  stat("marathon", "survival", "uncommon", "Marathon", "Survive 10 minutes in a single run.", "longestRun", 600),
  stat("iron", "survival", "epic", "Iron Will", "Reach wave 5 in One-Hit mode.", "oneHitWave", 5),
  stat("comeback", "survival", "uncommon", "Second Wind", "Survive a killing blow with a revive.", "revivesUsed", 1),

  // ---- MASTERY: the meta ----
  stat("first_buy", "mastery", "common", "Invested", "Buy your first shop upgrade.", "shopBuys", 1),
  stat("collector", "mastery", "rare", "Collector", "Own 6 abilities in a single run.", "abilitiesInRun", 6),
  stat("rich", "mastery", "epic", "Coin Baron", "Earn 25,000 coins in total.", "coinsEarned", 25000),
  stat("veteran", "mastery", "uncommon", "Veteran", "Finish 25 runs.", "runs", 25),
  stat("well_rounded", "mastery", "rare", "Well-Rounded", "Play every game mode.", "modesPlayed", 5),
  stat("student", "mastery", "common", "Apprentice", "Complete the tutorial.", "tutorialDone", 1),

  // ---- THE BOSS PANTHEON ----
  stat("boss_warden", "boss", "uncommon", "Jailbreak", "Defeat The Warden.", "killWarden", 1),
  stat("boss_colossus", "boss", "rare", "Scrap Metal", "Defeat The Iron Colossus.", "killColossus", 1),
  stat("boss_aldric", "boss", "rare", "Regicide", "Defeat The Berserker King, Aldric.", "killAldric", 1),
  stat("boss_rootbound", "boss", "epic", "The Rootbound", "Defeat The Rootbound.", "killRootbound", 1),
  stat("rootbound_regrowth", "boss", "legendary", "Regrowth Interrupted", "Defeat The Rootbound after fully interrupting Regrowth.", "rootboundRegrowthFullInterrupt", 1),
  stat("boss_echo", "boss", "epic", "Shattered Mirror", "Defeat The Echo.", "killEcho", 1),
  stat("boss_source", "boss", "legendary", "The Wound Closes", "Defeat The Source.", "killSource", 1),
  manual("witness", "boss", "epic", "Witness", "Stand witness through Aldric's kneel without striking him."),

  // ---- ENDLESS MILESTONES ----
  stat("endless_25", "survival", "uncommon", "Endless: Initiation", "Reach Wave 25 in Endless.", "bestWaveEndless", 25),
  stat("endless_50", "survival", "rare", "Endless: Midway", "Reach Wave 50 in Endless.", "bestWaveEndless", 50),
  stat("endless_75", "survival", "epic", "Endless: Deep Dive", "Reach Wave 75 in Endless.", "bestWaveEndless", 75),
  stat("endless_100", "survival", "legendary", "Beyond", "Reach Wave 100 in Endless.", "bestWaveEndless", 100),

  // ---- DIFFICULTY MASTERY ----
  stat("adv_hard", "progress", "rare", "Hardened", "Clear Adventure on Hard difficulty.", "clearAdvHard", 1),
  stat("adv_extreme", "progress", "epic", "Masochist", "Clear Adventure on Extreme difficulty.", "clearAdvExtreme", 1),
  stat("adv_all", "progress", "legendary", "Omnipotent", "Clear Adventure on all 5 difficulties.", "clearAdvAll", 5),
  stat("endless_50_hard", "survival", "epic", "Endurance", "Reach Wave 50 in Endless on Hard.", "wave50Hard", 1),
  stat("endless_100_extreme", "survival", "legendary", "Beyond Human", "Reach Wave 100 in Endless on Extreme.", "wave100Extreme", 1),
  stat("adv_flawless", "survival", "legendary", "Flawless Victory", "Clear the whole Adventure campaign without taking a single hit.", "clearAdvNoHit", 1),

  // ---- COMBAT POLISH ----
  stat("overkill", "combat", "uncommon", "Overkill", "Deal over 3,000 damage in a single strike.", "maxDamageHit", 3000),
  stat("collateral", "skill", "uncommon", "Collateral Damage", "Defeat an enemy by throwing the blade through another enemy.", "throwPierceKills", 1),
  stat("surgeon", "combat", "rare", "Surgeon", "Stack 20 Bleed on a single enemy.", "maxBleedStacks", 20),
  stat("inferno", "combat", "rare", "Inferno", "Have 10 enemies burning at once.", "maxConcurrentBurn", 10),
  stat("floor_is_lava", "skill", "epic", "Air Superiority", "Stay airborne for 15 straight seconds.", "maxAirTime", 15),
  stat("gravity_defied", "skill", "rare", "Gravity Defied", "Chain 3 Updraft launches without landing.", "consecutiveUpdrafts", 3),
  stat("friendly_fire", "combat", "rare", "Friendly Fire", "Have a Bomber blast kill 3 other enemies.", "bomberBetrayal", 3),

  // ---- MASTERY & META ----
  stat("weapon_master", "mastery", "rare", "Armory", "Win a run with each weapon.", "distinctWeaponsWon", 5),
  allShopItems("arsenal", "mastery", "legendary", "Arsenal", "Max out every item in the meta shop."),
  stat("speedrunner", "mastery", "epic", "Speedrunner", "Clear the Adventure campaign in under 15 minutes.", "speedrunUnder15", 1),
  stat("close_call", "survival", "rare", "By a Thread", "Defeat a boss while at 10% HP or lower.", "bossKillsLowHP", 1),

  // ---- BOSS DISRESPECT ----
  stat("warden_deflect", "boss", "epic", "Stop Hitting Yourself", "Defeat The Warden using ONLY their deflected projectiles.", "wardenDeflectOnly", 1),
  stat("colossus_throw", "boss", "rare", "David and Goliath", "Defeat The Iron Colossus without a single melee swing (throws only).", "colossusThrowOnly", 1),
  stat("aldric_interrupt", "boss", "epic", "Silence, King", "Interrupt Aldric with a Power Slam 3 times in one fight.", "aldricSlams", 3),
  stat("echo_parry", "boss", "legendary", "I Am Rubber", "Land the killing blow on The Echo with a deflected projectile.", "echoReflectKill", 1),
  stat("source_speed", "boss", "epic", "Pulling the Plug", "Defeat The Source in under 60 seconds.", "sourceSpeedrun", 1),

  // ---- THE SADIST ----
  stat("space_program", "skill", "rare", "Space Program", "Launch an enemy clean off the top of the screen.", "launchOffScreen", 1),
  stat("pinball", "skill", "epic", "Pinball Wizard", "Hit 4 different enemies with a single thrown blade.", "bladeBounces", 4),
  stat("rainbow_pain", "combat", "epic", "Taste the Rainbow", "Have Bleed, Burn and Mark on one enemy at once.", "tripleStatus", 1),
  stat("surgical", "combat", "rare", "Surgical Extraction", "Kill an Armored enemy with status effects — armor never broken.", "armorBypassKills", 1),
  stat("air_assassination", "skill", "epic", "Death from Above", "Kill 3 enemies in one airborne combo without landing.", "airComboKills", 3),

  // ---- THE MASOCHIST ----
  stat("no_takebacks", "mastery", "epic", "No Takebacks", "Clear an Adventure stage without ever throwing your blade.", "stageNoThrow", 1),
  stat("butterfingers", "mastery", "epic", "Butterfingers", "Clear an Adventure stage without a single melee swing.", "stageThrowOnly", 1),
  stat("glass_cannon", "mastery", "rare", "Glass Cannon", "Clear a stage with damage upgrades but no Thick Skin or Warding.", "stageGlassCannon", 1),
  stat("deflector_shield", "skill", "epic", "Immovable Object", "Perfect-parry 10 in a row without moving, dashing or being hit.", "staticParryStreak", 10),
  stat("heavy_boots", "mastery", "epic", "Heavy Boots", "Clear a 10-wave stage without jumping once.", "stageNoJump", 1),

  // ---- ANOMALIES & ECONOMY ----
  stat("the_setup", "skill", "rare", "The Setup", "Updraft an Armored enemy, then spike it into the ground.", "spikeArmored", 1),
  stat("return_to_sender", "combat", "uncommon", "Return to Sender", "Kill a Bomber with its own deflected bomb.", "bombDeflectKills", 1),
  stat("chain_reaction", "combat", "rare", "Chain Reaction", "Kill 5 enemies with a single deflected bomb.", "bombMultikill", 5),
  stat("matador", "skill", "rare", "Matador", "I-frame dash through 15 projectiles in one run.", "projectileDashes", 15),
  stat("cinematic_kill", "combat", "uncommon", "Stylishly Late", "Land a kill during the stage-clear transition.", "transitionKills", 1),
  stat("phoenix_full", "survival", "epic", "From the Ashes", "Revive from a killing blow, then heal back to full HP.", "reviveToFull", 1),
  stat("horde_breaker", "combat", "rare", "Horde Breaker", "Clear an Endless horde wave in under 15 seconds.", "fastHordeClear", 1),
  stat("exodia", "mastery", "legendary", "The Forbidden Technique", "Own Long Arm, Throwing Arm, Aether Step and Lifeline at once.", "exodiaBuild", 1),

  categoryComplete("master_combat", "combat", "Warmaster", "Complete all other Combat achievements."),
  categoryComplete("master_skill", "skill", "Virtuoso", "Complete all other Skill achievements."),
  categoryComplete("master_progress", "progress", "The Journey", "Complete all other Progression achievements."),
  categoryComplete("master_boss", "boss", "Godslayer", "Complete all other Boss achievements."),
  categoryComplete("master_survival", "survival", "Indomitable", "Complete all other Survival achievements."),
  categoryComplete("master_mastery", "mastery", "The Apex", "Complete all other Mastery achievements."),
  allAchievements("completionist", "mastery", "legendary", "The Momentum Blade", "Unlock every other achievement in Tear."),
]);

export const CANONICAL_ACHIEVEMENT_IDS = Object.freeze(ACHIEVEMENT_CATALOG.map((achievement) => achievement.id));
