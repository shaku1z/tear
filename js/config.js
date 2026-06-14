// ============================================================
//  TUNING — everything you'd want to tweak for "feel" lives here.
//  All units are pixels and seconds unless noted.
// ============================================================
const CONFIG = {
  view: { w: 1280, h: 720 },

  world: {
    gravity: 2400,        // downward accel on player/enemies
    groundY: 640,         // top surface of the floor
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
    minHitSpeed: 650,     // tip speed below this deals no damage
    damageScale: 0.012,   // damage per (px/s) of tip speed over the minimum
    maxDamage: 70,
    enemyHitIframe: 0.18, // per-enemy cooldown between blade hits
    deflectMinSpeed: 450, // tip speed needed to deflect a projectile
    deflectBoost: 1.25,   // speed multiplier applied to deflected projectiles
    perfectSpeed: 1600,   // tip speed for a PERFECT parry (homing ricochet, bonus dmg)
    slamMultiplier: 1.8,  // damage multiplier for a downward airborne slam
    slamMinDownSpeed: 1400, // downward tip speed needed to count as a slam
    launchMinUpSpeed: 950, // upward tip speed needed to pop an enemy airborne
    launchPower: 780,     // upward velocity imparted by a launcher swing
    risingSpeedRef: 850,  // player upward speed for a full rising-uppercut bonus
    risingDmgBonus: 0.9,  // up to +90% launch damage while rising fast (jump / up-dash)
    risingLaunchBonus: 0.7, // up to +70% extra pop/knockback on a rising uppercut

    // right-click to throw the blade; right-click near it (within reclaimDistance) to recall
    throw: {
      speed: 1500,        // base launch speed
      speedFromSwing: 0.45, // + this * tip speed at release (flinging adds speed)
      maxSpeed: 4200,
      damage: 34,         // base pierce damage
      damageFromSpeed: 0.012, // + per (px/s) of launch speed
      reclaimDistance: 320, // how close you must be to recall (~tether)
      returnSpeed: 3400,  // speed the blade flies back to your hand (snappy)
      maxLife: 2.5,       // safety: embed after this long in flight
    },
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
    hp: 60,
    contactDmg: 12,
    knockbackTaken: 9,    // knockback per point of damage received
    respawnDelay: 1.4,
  },

  // ranged: keeps its distance, winds up a telegraphed shot, then kites away
  ranged: {
    w: 34, h: 44,
    speed: 175,
    hp: 42,
    contactDmg: 8,
    knockbackTaken: 12,
    preferredDist: 380,   // distance it likes to sit at
    tooClose: 250,        // flee if the player is closer than this
    windup: 0.7,          // telegraph time before firing
    aimInterval: 2.3,     // time between shots while kiting
    projSpeed: 620,
  },

  proj: { r: 9, dmg: 10, speed: 540 },

  hitStop: { threshold: 22, big: 0.07, small: 0.025 }, // freeze-frame on impact

  // ---- run / wave pacing (endless mode) ----
  run: {
    maxConcurrent: 6,     // simultaneous live enemies cap (rest queue up)
    spawnInterval: 0.7,   // seconds between spawns within a wave
    firstWaveCount: 3,    // enemies in wave 1
    countPerWave: 1.0,    // + this many enemies per wave thereafter
    hpScalePerWave: 0.12, // +12% enemy HP per wave
    scorePerKill: 100,    // score per kill (x wave number)
    healEachWave: 20,     // HP restored on wave clear (Normal only)
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
    pts: { hit: 2, throwHit: 4, deflect: 5, launch: 5, slam: 8, uppercut: 10, parry: 12 },
  },

  // ---- difficulties (selectable from the menu) ----
  difficulties: [
    { id: "normal", label: "Normal",        oneHit: false },
    { id: "hard",   label: "Hard — one-hit", oneHit: true },
  ],

  // ---- modes (endless live; others reserved for later) ----
  modes: [
    { id: "endless", label: "Endless",            enabled: true,
      blurb: "Survive escalating waves. Chase your best." },
    { id: "boss",    label: "Waves + Boss",        enabled: false,
      blurb: "A set run ending in a boss. (Coming soon)" },
    { id: "gauntlet", label: "Endless + Bosses",   enabled: false,
      blurb: "Endless, with a boss every few waves. (Coming soon)" },
  ],
};
