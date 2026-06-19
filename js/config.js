// ============================================================
//  TUNING — everything you'd want to tweak for "feel" lives here.
//  All units are pixels and seconds unless noted.
// ============================================================
const CONFIG = {
  view: { w: 1600, h: 900 },

  world: {
    gravity: 2400,        // downward accel on player/enemies
    groundY: 800,         // top surface of the floor
  },

  player: {
    w: 32, h: 50,
    moveSpeed: 430,       // top horizontal run speed
    thrownMoveBoost: 1.15, // +15% move speed while the blade is thrown (no weapon)
    groundAccel: 5000,    // how fast you reach moveSpeed on ground
    airAccel: 2800,       // air control
    friction: 6000,       // ground stopping power when no input
    jumpSpeed: 920,       // initial upward velocity on jump
    coyoteTime: 0.10,     // grace window to jump after leaving ground
    jumpBuffer: 0.10,     // grace window to register early jump press
    maxFall: 1800,
    hp: 100,
    hitIframe: 0.9,       // invuln window after taking a hit
    dmgTakenMult: 1,      // scaled down by the "Tough Hide" upgrade
  },

  dash: {
    speed: 1500,          // burst speed
    duration: 0.15,       // how long the burst lasts
    cooldown: 0.55,       // time before you can dash again
    iframe: 0.15,         // invuln during the dash
    endSpeedKeep: 0.35,   // fraction of dash speed retained when it ends
  },

  blade: {
    length: 95,           // hilt -> tip distance
    handOffsetX: 0,       // hand anchor relative to player center
    handOffsetY: -6,
    aimRadius: 85,        // reticle orbits the player within this radius (= resting tether length)
    minTether: 0.45,      // hold left-click -> tether eases down to this fraction of aimRadius
    aimSensitivity: 0.9,  // mouse-movement -> reticle movement (pointer-lock mode)
    springStiffness: 150, // pull of the blade toward the reticle (lag/momentum source)
    damping: 7.5,         // velocity damping (higher = less floaty)
    gravity: 900,         // weight of the blade itself (droops when idle)
    maxReach: 120,        // elastic leash: max hilt distance from hand (momentum overshoot)
    leashStiffness: 55,   // how hard the leash pulls back past maxReach
    maxSpeed: 7000,       // hard clamp so it never explodes
    angleSmooth: 35,      // how quickly the blade angle settles (higher = snappier)
    leadAmount: 0.45,     // how much a fast swing whips the tip ahead of the aim line
    leadSpeedRef: 2600,   // swing speed at which the lead is fully applied
    minHitSpeed: 950,     // tip speed below this deals no damage
    damageScale: 0.0092,  // damage per (px/s) of tip speed over the minimum (lower base)
    maxDamage: 58,
    enemyHitIframe: 0.18, // per-enemy cooldown between blade hits
    deflectMinSpeed: 700, // tip speed needed to deflect a projectile
    deflectBoost: 1.25,   // speed multiplier applied to deflected projectiles
    perfectSpeed: 2400,   // tip speed for a PERFECT parry (homing ricochet, bonus dmg)
    counterParryFactor: 0.55, // perfect-parry threshold multiplier when swinging straight back at the shot
    slamMultiplier: 1.8,  // damage multiplier for a downward airborne slam
    slamMinDownSpeed: 1750, // downward tip speed needed to count as a slam
    slamPowerSpeed: 1700,   // player descent speed for a full committed "power slam"
    slamPowerBonus: 0.7,    // up to +70% slam damage from a fast committed descent
    slamEmpowerAt: 0.5,     // descent fraction above which a slam becomes a POWER SLAM (⇊)
    launchMinUpSpeed: 1250, // upward tip speed needed to pop an enemy airborne
    launchPower: 780,     // upward velocity imparted by a launcher swing
    risingSpeedRef: 850,  // player upward speed for a full rising-uppercut bonus
    risingDmgBonus: 0.9,  // up to +90% launch damage while rising fast (jump / up-dash)
    risingLaunchBonus: 0.7, // up to +70% extra pop/knockback on a rising uppercut

    // right-click to throw the blade; right-click near it (within reclaimDistance) to recall
    throw: {
      speed: 1900,        // base launch speed (faster than before)
      speedFromSwing: 0.45, // + this * tip speed at release (flinging adds speed)
      maxSpeed: 4600,
      damage: 22,         // base pierce damage (lower than before)
      damageFromSpeed: 0.008, // + per (px/s) of launch speed
      hiMult: 1.4,        // throw (outgoing) hits enemies ABOVE half HP harder
      loMult: 0.65,       // ...and below-half HP softer (recall is the reverse: a finisher)
      lobRadius: 160,     // hammer "lob" throw: shockwave radius on impact
      lobStun: 0.8,       // hammer "lob" throw: stun applied to caught enemies
      reclaimDistance: 384, // how close you must be to recall (~tether)
      returnSpeed: 3400,  // speed the blade flies back to your hand (snappy)
      maxLife: 2.5,       // safety: embed after this long in flight
    },
  },

  // ---- skill shaping: rewards clean, committed, stylish swings over flailing ----
  skill: {
    pokeFloor: 0.4,       // a pure straight thrust deals 40% of a clean perpendicular cut
    commitRef: 620,       // hilt speed (px/s) for full "committed arm swing" credit
    commitFloor: 0.5,     // a tip-flick with a still hand deals 50%
    styleDamage: 0.06,    // +6% swing damage per trick tier above 1 (NICE..TEARING)
    styleDamageMax: 0.4,  // hard cap on the style->damage bonus
    aerialRaveCap: 0.5,   // Aerial Rave airborne-damage cap (raised by its tiers)
  },

  // ---- resilience: survivability is EARNED through skill, never a heal button ----
  resilience: {
    parryGuardTime: 1.2,    // Riposte: seconds of damage reduction after a perfect parry
    parryGuardMult: 0.4,    // ...damage taken during that window (-60%)
    flowGuardTier: 3,       // Flow Guard: trick multiplier (x3 = BRUTAL) needed to be protected
    flowGuardMult: 0.7,     // ...damage taken while above that rank (-30%)
    maxShield: 2,           // Aegis: max stored one-hit absorb pips
    bloodriteHeal: 8,       // Bloodrite: HP restored per SKILL kill (slam/spike/perfect-parry)
    lifestealPerSwing: 1.5, // Vampiric Edge: HP per swing...
    lifestealCd: 0.5,       // ...but at most once per this many seconds (capped per-swing, not per-hit)
  },

  juice: {
    trailSamples: 14,     // length of the blade swoosh trail
    trailMinStep: 6,      // min tip travel between samples to draw an arc segment
    trailAlpha: 0.22,     // max opacity of the swoosh
    shakeBig: 11,         // screen-shake magnitude on big / slam / perfect hits
    shakeSmall: 4,
    shakeDecay: 45,       // how fast shake settles
    sparkCount: 9,        // sparks per blade hit
    deathShards: 12,      // shards on an enemy death
    bannerTime: 1.3,      // wave-start banner duration
    parrySlowmo: 0.18,    // seconds of slow-mo on a perfect parry
    parrySlowScale: 0.28, // time scale during parry slow-mo
    zoomBig: 0.05,        // camera zoom-punch on big hits
    zoomParry: 0.10,      // camera zoom-punch on perfect parry
    flashParry: 0.55,     // invert-flash strength on perfect parry
    dashGhostInterval: 0.028, // seconds between dash afterimages
  },

  // charger: melee rusher that closes distance
  enemy: {
    w: 40, h: 40,
    speed: 150,
    hp: 78,
    contactDmg: 12,
    knockbackTaken: 9,    // knockback per point of damage received
    weight: 1,            // resists launches/flings (higher = harder to pop airborne)
    respawnDelay: 1.4,
    // bull-charge (baseline melee): watch -> wind up -> commit a fast lunge; whiff = stun
    chargeRange: 420,     // distance at which it commits to a charge
    chargeWindup: 0.55,   // telegraph before the lunge
    chargeSpeed: 760,     // lunge burst speed
    chargeTime: 0.5,      // how long the lunge lasts
    chargeStun: 1.1,      // stun if the lunge slams a wall/platform (the punish window)
    chargeCd: 1.2,        // recovery before it can charge again
  },

  // ranged: keeps its distance, winds up a telegraphed shot, then kites away
  ranged: {
    w: 34, h: 44,
    speed: 175,
    hp: 54,
    contactDmg: 8,
    knockbackTaken: 12,
    preferredDist: 380,   // distance it likes to sit at
    tooClose: 250,        // flee if the player is closer than this
    windup: 0.7,          // telegraph time before firing
    aimInterval: 2.3,     // time between shots while kiting
    projSpeed: 800,       // shooters fire fast now (deadlier, demands real dodging/parry)
    weight: 1,
  },

  // flyer: hovers and swoops, ignores gravity/platforms
  flyer: { w: 36, h: 26, hp: 40, speed: 230, contactDmg: 10, knockbackTaken: 14, weight: 0.75, swoopInterval: 3.3, swoopSpeed: 700, hoverY: 150 },
  // bomber: lobs arcing, deflectable bombs from a distance (parry one back to blow it
  // up in their face). Trapper variant plants mines; Juggler throws 3 in a burst.
  bomber: { w: 34, h: 34, hp: 36, speed: 165, contactDmg: 8, knockbackTaken: 11, weight: 1,
    standoff: 340, lobInterval: 2.4, bombSpeed: 540, bombArc: 540, bombGravity: 1150,
    blastRadius: 150, blastDmg: 24, mineArm: 1.3, mineTrigger: 66, mineInterval: 2.2 },
  // armored: shielded on the side it faces; takes reduced damage on the ground,
  // normal/extra in the air -> you must launch ("updraft") it to kill efficiently
  armored: { w: 46, h: 46, hp: 140, speed: 95, contactDmg: 14, knockbackTaken: 3, weight: 2.2, breakSpeed: 1500, groundDR: 0.5, airDR: 1.15,
    stompCd: 3.2, stompWindup: 0.55, stompRange: 400, shockSpeed: 560, shockDmg: 16, shockR: 15 },
  // boss: large, multi-phase (very heavy -> barely flinchable)
  boss: { w: 118, h: 118, hp: 1900, speed: 70, contactDmg: 20, knockbackTaken: 0.6, weight: 6, fireBase: 2.0 },
  // The Warden (Stage 1 boss): a methodical guard who weaponizes the arena across 3 phases
  warden: {
    batonCd: 2.1, batonWindup: 0.5, mortarShots: 3, mortarSpeed: 760, mortarGravity: 900, mortarDmg: 14,
    bashRange: 150, bashKnock: 620,
    zoneCount: 3, zoneW: 200, zoneShift: 7, zoneTick: 7, zoneTickCd: 0.4,   // phase-2 prohibited zones
    shockDmg: 18, shockSpeed: 700, shockR: 18,
    ceilingY: 150, ceilDropCd: 1.6, lungeCd: 7.5, lungeSpeed: 1500,         // phase-3 ceiling + lunge
  },

  // support: no real attack — they make every OTHER enemy worse, so they're priority kills
  support: { w: 32, h: 42, hp: 44, speed: 125, contactDmg: 6, knockbackTaken: 13, weight: 1,
    range: 240, keepAway: 330, menderRate: 11,
    drMult: 0.5, dmgBuff: 1.35,        // War Priest: protects AND empowers nearby enemies
    speedBuff: 1.45, hasteBuff: 1.5,   // Herald: faster movement AND faster attacks
    anchorDR: 0.4, anchorRegen: 9 },   // Anchor: shields + regens + immobilizes its bonded ally (shared fate)
  // wraith: immune to direct blade hits — only your thrown blade or a deflected shot kills it
  wraith: { w: 36, h: 42, hp: 64, speed: 170, contactDmg: 12, knockbackTaken: 0, weight: 1.4, hoverY: 70 },
  // chimera: a beast that adopts the attacks of the enemy types in its wave (often several),
  // cycling through them — the wind-up tells you which one is coming
  chimera: { w: 38, h: 48, hp: 84, speed: 150, contactDmg: 12, knockbackTaken: 9, weight: 1, copyDelay: 0.55 },

  // elite variants of basic enemies
  elite: { hpMult: 2.2, speedMult: 1.3, dmgMult: 1.5, sizeMult: 1.2, chancePerWave: 0.06, chanceMax: 0.35 },

  proj: { r: 9, dmg: 10, speed: 640 },
  // Marksman's charged shot: a long telegraphed charge, then a DEADLY long-range snap bolt —
  // the fastest, hardest-hitting shot in the game. Parrying it back is hugely rewarding.
  chargedShot: { r: 11, dmg: 30, speed: 1900, windup: 1.4 },

  // exotic variants (Round 4c)
  exotic: {
    exWindup: 1.3, exShockDmg: 24, exShockSpeed: 640, exShockR: 19,        // Executioner: long overhead -> heavy shocks both sides
    gravWindup: 0.9, gravReach: 120, gravDmg: 22, gravShockR: 24, gravShockSpeed: 420,  // Gravedigger: wide swing starting at mid-range (safe point-blank)
    duelCd: 2.4,                                                            // Duelist: parries a thrown blade, then must recover
    warlockSpeed: 430, warlockDmg: 12, warlockCurveAt: 0.42,               // Warlock: slow shot that curves once toward you
    chainSpeed: 560, chainRoot: 1.4, chainDmg: 8, chainR: 12,              // Chain: roots you in place on hit
    sludgeSpeed: 360, sludgeArc: 480, sludgeGravity: 1150, sludgeR: 12,    // Sludge: lobs mud that...
    sludgeZoneR: 72, sludgeZoneLife: 5, sludgeSlow: 0.45, sludgeInterval: 2.6,  // ...makes a slowing puddle
    geoChannel: 1.8, geoWallW: 26, geoWallH: 155, geoWallLife: 9, geoInterval: 5, geoRange: 540,  // Geomancer: raises a temporary wall
  },

  // accent palette — player stays black on white; enemies/shots/FX carry the color
  colors: {
    charger: "#e23b3b",        // red
    ranged: "#2f6df0",         // blue
    flyer: "#8b3bd6",          // purple
    bomber: "#ef8a17",         // orange
    armored: "#3a4654",        // slate
    armoredShield: "#15c2c2",  // cyan
    boss: "#b01030",           // crimson
    priest: "#a64dd6",         // support: damage-reduction aura
    herald: "#e0902f",         // support: speed buff
    mender: "#1faf5a",         // support: heals allies
    anchor: "#1597c2",         // support: shields a tethered ally
    wraith: "#6a6f88",         // special: blade-immune phantom
    chimera: "#444a5c",        // special: adopts other enemies' attacks
    sludge: "#6f7a35",         // hazard: slowing mud puddle
    enemyShot: "#e23b3b",      // incoming projectile
    deflected: "#1faf5a",      // your reflected projectile (green)
    perfect: "#13c4d6",        // perfect parry / counter (cyan)
    slam: "#ef8a17",           // slam impact (orange)
    scarf: "#d8324a",          // player's flowing scarf
    bladeTrail: "#13c4d6",     // sword swoosh trail
    bladeGlow: "#13c4d6",      // charged tip glow (fast swing)
    eye: "#13c4d6",            // player visor
  },

  hitStop: { threshold: 22, big: 0.07, small: 0.025 }, // freeze-frame on impact

  // ---- run / wave pacing (endless mode) ----
  run: {
    maxConcurrent: 6,     // simultaneous live enemies cap (rest queue up)
    spawnInterval: 0.7,   // seconds between spawns within a wave
    firstWaveCount: 3,    // enemies in wave 1
    countPerWave: 1.0,    // + this many enemies per wave thereafter
    hpScalePerWave: 0.12, // +12% enemy HP per wave
    scorePerKill: 100,    // score per kill (x wave number)
    scoreMult: 1,         // raised by the "Bounty Hunter" upgrade
    healEachWave: 12,     // HP restored on wave clear (Normal only) — modest; sustain is earned
    startDelay: 0.8,      // beat before the first spawn of a wave
    waveClearPause: 0.8,  // delay after the last enemy dies before the draft appears
  },

  // ---- "Attack Trick" style meter ----
  trick: {
    decay: 2.6,         // seconds without a trick before the meter starts draining
    drainRate: 26,      // gauge points lost per second once draining
    hitLoss: 0.5,       // fraction of the gauge lost when you take a hit
    variety: 1.5,       // points multiplier when the trick differs from the last one
    // gauge thresholds -> score multiplier + rank name
    tiers: [
      { at: 0,   mult: 1, name: "" },
      { at: 14,  mult: 1.5, name: "NICE" },
      { at: 34,  mult: 2,   name: "STYLISH" },
      { at: 64,  mult: 3,   name: "BRUTAL" },
      { at: 110, mult: 4,   name: "SAVAGE" },
      { at: 175, mult: 5,   name: "TEARING!" },
    ],
    pts: { hit: 2, throwHit: 4, deflect: 5, launch: 5, slam: 8, superslam: 11, updraft: 10, parry: 12 },
  },

  // ---- difficulties (selectable from the menu) ----
  difficulties: [
    { id: "normal", label: "Normal",        oneHit: false },
    { id: "hard",   label: "Hard — one-hit", oneHit: true },
  ],

  // ---- modes (endless live; others reserved for later) ----
  modes: [
    { id: "campaign", label: "Adventure",          enabled: true,
      blurb: "Journey through biomes — 9 waves then a boss, stage after stage, ever deeper." },
    { id: "endless", label: "Endless",            enabled: true,
      blurb: "Survive escalating waves. Chase your best." },
    { id: "boss",    label: "Waves + Boss",        enabled: true, waves: 8,
      blurb: "Clear 8 waves, then face the boss." },
    { id: "gauntlet", label: "Endless + Bosses",   enabled: false,
      blurb: "Endless, with a boss every few waves. (Coming soon)" },
    { id: "bossonly", label: "Boss Test",          enabled: true, bossOnly: true,
      blurb: "Fight the boss right away (testing)." },
    { id: "sandbox",  label: "Enemy Test",          enabled: true, sandbox: true,
      blurb: "Sandbox: every enemy variant spawns from wave 1 — try the full roster." },
  ],
};
