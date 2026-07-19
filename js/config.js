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
    knockbackMult: 1,     // weapon chassis: how far enemy hits displace the player
  },

  dash: {
    speed: 1500,          // burst speed
    duration: 0.15,       // how long the burst lasts
    cooldown: 0.55,       // time before you can dash again
    iframe: 0.15,         // invuln during the dash
    endSpeedKeep: 0.35,   // fraction of dash speed retained when it ends
    steer: 15,            // mid-dash steering rate: hold W/S/A/D to bend the dash that way
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
    deflectDmgMult: 1,    // Counterforce: bonus damage on reflected shots
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
      recallMult: 1,      // Whetstone: bonus damage on the returning (recall) blade
      hiMult: 1.4,        // throw (outgoing) hits enemies ABOVE half HP harder
      loMult: 0.65,       // ...and below-half HP softer (recall is the reverse: a finisher)
      lobRadius: 160,     // hammer "lob" throw: shockwave radius on impact
      lobStun: 0.8,       // hammer "lob" throw: stun applied to caught enemies
      reclaimDistance: 384, // how close you must be to recall (~tether)
      returnSpeed: 3400,  // speed the blade flies back to your hand (snappy)
      maxLife: 2.5,       // safety: embed after this long in flight
    },
  },

  // ---- five weapon identities (exclusive mechanics live here, not in the draft pool) ----
  weapons: {
    sword: {
      trueCutThreshold: 0.82, trueCutMult: 1.24, trueCutHitIframe: 0.13,
      seamDuration: 2.4, crosscutMult: 1.75,
    },
    hammer: {
      weakFloor: 0.28, commitmentRef: 760, fullCommitMult: 1.32,
      breakPerDamage: 1.15, breakThreshold: 82, bossBreakThreshold: 190,
      meteorGravity: 1850, meteorRadius: 170, meteorStun: 0.85,
      meteorBreak: 75, recallTargetCap: 2,
    },
    spear: {
      axialFloor: 0.22, maxReachBonus: 0.22, driveForce: 820,
      wallPinDuration: 0.55, reelSpeed: 1220, linkDuration: 3.2,
      heavyWeight: 2.2,
    },
    chainblade: {
      tensionFloor: 0.18, fullTensionAt: 0.72, dragForce: 720,
      bindDuration: 2.8, yankSpeed: 1450, collisionDamage: 24,
      bossTug: 0.22,
    },
    ringblade: {
      orbitBuild: 1.15, orbitDecay: 0.78, orbitReverseLoss: 0.48,
      orbitDamage: 0.42, orbitMove: 0.03, repeatWindow: 0.34,
      repeatFloor: 0.38, circuitEnergy: 4.2, bounceCost: 0.68,
      enemyCost: 0.48, steer: 2.3,
    },
  },

  // New accepted Specials. Tier-specific caps/multipliers are resolved by the
  // ability event handlers, while these values remain the single tuning source.
  stormbank: {
    maxCharges: [5, 8, 10], primaryPerCharge: [0.08, 0.06, 0.065],
    maxPrimary: [0.40, 0.48, 0.65], maxTargets: [3, 5, 6],
    radius: 260, chainDamage: 22, stun: 0.4, echoDuration: 2, echoInterval: 0.5,
  },
  overrun: {
    cleanWindow: 1.25, maxStacks: [4, 6, 6], damagePerStack: 0.05,
    movePerStack: 0.03, hold: 4.0, decayStep: 1.0, redline: 4.0,
  },
  sever: {
    normalMult: [0.70, 0.55, 0.40], bossMult: [0.85, 0.75, 0.65],
    normalDuration: 4.0, bossDuration: 3.0, pulseRadius: 155,
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

  // ---- status effects (applied by Special abilities; ticked on enemies) ----
  status: {
    bleedDps: 6,     // damage per second PER bleed stack
    bleedDur: 3.2,   // bleed duration in seconds (refreshed when re-stacked)
    bleedMax: 8,     // max bleed stacks on one enemy
    burnDps: 20,     // burn damage per second
    burnDur: 2.6,    // burn duration
    markMult: 1.30,  // a MARKED enemy takes +30% damage from everything
    markDur: 4.0,    // mark duration
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
    hp: 86,
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
    hp: 60,
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
  flyer: { w: 36, h: 26, hp: 44, speed: 230, contactDmg: 10, knockbackTaken: 14, weight: 0.75, swoopInterval: 3.3, swoopSpeed: 700, hoverY: 150 },
  // bomber: lobs arcing, deflectable bombs from a distance (parry one back to blow it
  // up in their face). Trapper variant plants mines; Juggler throws 3 in a burst.
  bomber: { w: 34, h: 34, hp: 40, speed: 165, contactDmg: 8, knockbackTaken: 11, weight: 1,
    standoff: 340, lobInterval: 2.4, bombSpeed: 540, bombArc: 540, bombGravity: 1150,
    blastRadius: 150, blastDmg: 24, mineArm: 1.3, mineTrigger: 66, mineInterval: 2.2 },
  // armored: shielded on the side it faces; takes reduced damage on the ground,
  // normal/extra in the air -> you must launch ("updraft") it to kill efficiently
  armored: { w: 46, h: 46, hp: 154, speed: 95, contactDmg: 14, knockbackTaken: 3, weight: 2.2, breakSpeed: 1500, groundDR: 0.5, airDR: 1.15,
    stompCd: 3.2, stompWindup: 0.55, stompRange: 400, shockSpeed: 560, shockDmg: 16, shockR: 15 },
  // boss: large, multi-phase (very heavy -> barely flinchable)
  boss: { w: 118, h: 118, hp: 2500, speed: 70, contactDmg: 20, knockbackTaken: 0.6, weight: 6, fireBase: 2.0 },

  // LIVING ARENAS: elevated boss terrain is temporary movement opportunity,
  // never permanent shelter. Collision is removed while broken/reforming and
  // returns only after the player clears the authored footprint.
  bossArena: {
    standBeforeWarn: 1.6, crackWarn: 0.75, brokenDuration: 4.5, reformWarn: 0.6,
    stressDrainDelay: 0.22, stressDrainRate: 2.4, reformClearMargin: 18,
    minElevatedActive: 1,
  },
  // shared boss ceremony timing. Individual fights supply the poses and attack grammar;
  // the theater layer owns only the real-time pacing.
  bossTheater: { introDur: 1.4, introScale: 0.25, deathDur: 0.9 },
  // THE FINAL CUT: a no-fail blade epilogue. These timings are presentation
  // knobs only; completion is persisted before the first beat begins.
  finale: {
    silence: 0.55, wound: 1.45, relics: 2.0, cutAutoAt: 13.0, cutAutoStep: 1.15,
    anchorRadius: 58, cutSpeed: 900, restorationMin: 2.4, epilogueReveal: 2.8,
    rewardHold: 2.4, worldZoom: 0.84, fragmentCap: 18,
  },
  presentation: {
    dialogueDuck: 0.45, biomeRevealDuck: 0.72,
    voidUnmakeMix: 0.45, voidReleaseMix: 1.0, voidRevealMix: 0.72,
    dialogueReveal: 0.48,   // legacy fallback only (reveal is now char-rate driven)
    // ---- READING CONTRACT (Pantheon VI P1) ----
    // reading-aware timing: a boss line reveals at a human rate, then must stay
    // fully visible before it can time out; lore pages never auto-expire.
    revealCharsPerSec: 30,       // boss dialogue character reveal rate
    revealCommaPause: 0.12, revealStopPause: 0.22, revealNewlinePause: 0.16,   // natural pauses
    minFullyVisible: 1.10,       // a line must be fully readable this long before advancing
    bossAutoBase: 2.8, bossAutoPerWord: 0.3125, bossAutoMin: 4.0, bossAutoMax: 7.0,   // Full-mode fallback = clamp(base+words/3.2, 4..7)
    briefHoldMin: 2.2, briefHoldMax: 3.2, briefHoldPerWord: 0.14,   // Brief holds a fully-shown line this long
    // input latch: a new scene cannot inherit a gameplay-held control
    armAfterRelease: 0.18,       // every confirm source must be released this long before input arms
    skipHold: 0.80,              // a NEW hold (begun after arming) of this length skips
    autoGlyphLead: 1.0,          // show the AUTO glyph only in a confirm-or-timeout beat's final second
  },
  // The Echo (Stage 4 boss): your own silhouette — mirrors your tricks -> splits -> turns invisible
  echo: {
    w: 32, h: 50, hp: 3000, speed: 280, contactDmg: 18, knockbackTaken: 0.5, weight: 4,
    copyDelay: 0.55, shockDmg: 16, shockSpeed: 700, projSpeed: 820, projDmg: 14,
    invisCycle: 10, invisDur: 3.5, lungeSpeed: 1500, jumpCd: 1.15, jumpV: 1250,
  },
  // The Source (Stage 5 FINAL boss): a floating rift that cycles every fallen boss's
  // signature mechanic, collapses the floor, fakes its death, then erupts into a true form
  source: {
    w: 116, h: 128, hp: 6400, speed: 125, contactDmg: 22, knockbackTaken: 0.35, weight: 7,
    // the VOID RUN is the fight's centerpiece: it begins at voidTier and runs to
    // the death; the kneel (fake death) happens ON the frozen conveyor
    voidTier: 0.58, fakeTier: 0.28, kneelDur: 3.6, thawSpeedMult: 1.35,
    voidDamageTaken: 0.92, voidFormScale: 1.28, voidDamageMult: 1.12, voidWeightMult: 1.35,
    phaseOverflowCarry: 0.45, phaseOverflowCap: 0.04,
    // DEPTH COMBAT: the Source withdraws behind the route, attacks through
    // foreground manifestations, then breaches back into a punish window.
    depthRearScale: 2.15, depthRearAlpha: 0.44,
    depthFirstDelay: 1.35, depthCycleMin: 1.35, depthCycleMax: 2.05,
    depthTell: 0.74, depthStrike: 0.34, depthExpose: 1.55,
    depthHandW: 154, depthHandDmg: 20, depthMawW: 330, depthMawDmg: 22,
    depthSpearSpeed: 980, depthSpearDmg: 18, depthSpearR: 15,
    // Falling feeds the abyss, but only through a visible, blade-severable
    // channel. Repeats diminish and the encounter-wide heal has a hard ceiling.
    siphonImmediateFrac: 0.01, siphonChannelFrac: 0.025, siphonDuration: 1.05,
    siphonTotalCap: 0.12, siphonCutSpeed: 1250, siphonCutRadius: 14,
    siphonDiminish1: 1.0, siphonDiminish2: 0.7, siphonDiminish3: 0.45, siphonDiminish4: 0.25,
    voidDelay: 4.8,   // complete authored descent window; the cinematic director owns its beats
    // THE VOID DESCENT — the cinematic that opens the void run
    voidCamZoom: 0.80,        // camera pulls this far OUT during the void (wider frame = plan your route)
    descentChallenge: 0.65, descentDeclaration: 0.95,
    descentDissolve: 0.80, descentLift: 0.72, descentReveal: 0.82, descentArrival: 0.85,
    descentLiftV: -310, descentIngressBelow: 190,
    cycleCd: 2.5,           // seconds between mechanic casts (phase 1)
    shockDmg: 18, shockSpeed: 720, shockR: 16,
    sweeperDmg: 18, sweeperSpeed: 600, sweeperCrossings: 2, sweeperIntegrity: 4, sweeperMaxLife: 5.0, sweeperEmbedDur: 0.8,
    crossDmg: 16, crossSpeed: 740,
    copyDelay: 0.5,
    platformCollapseCd: 1.3, crackWarn: 0.8,
    // SOFT BREACH: ordinary pursuit occasionally commits through the player's
    // captured position. This is blade-repelled locomotion, not RIFT DASH.
    breachIntervalMin: 2.4, breachIntervalMax: 3.7, breachStartRange: 740,
    breachTellMin: 0.34, breachTellMax: 0.44,
    breachPassMin: 190, breachPassMax: 280,
    breachSpeedMin: 570, breachSpeedMax: 700, breachMaxDur: 1.25, breachDmg: 14,
    breachRepelMinSpeed: 1500, breachRepelVMin: 760, breachRepelVMax: 1180,
    breachSteerLockMin: 0.28, breachSteerLockMax: 0.40,
    breachRepelGrace: 0.65, breachRecoilDrag: 7.5,
    breachWeakNudge: 150, breachWeakNudgeCap: 220,
    predatorDecisionMin: 0.72, predatorDecisionMax: 1.18,
    predatorCloseMin: 118, predatorCloseMax: 158,
    predatorStalkMin: 170, predatorStalkMax: 218,
    predatorYMin: -82, predatorYMax: 58, predatorForceBreach: 1.8,
    // the rift LEARNS TO LUNGE — physical moves woven between the ranged casts
    dashCd: 5.5, dashWindup: 0.55, dashSpeed: 2050, dashDmg: 22,   // RIFT DASH: a telegraphed flash-charge along a locked line
    riftCollapseCd: 8.0, collapseWindup: 0.7, collapseDmg: 18, collapseSpeed: 900,   // RIFT COLLAPSE: teleport above, drop a converging shard ring
    scrollSpeed: 170, scrollRamp: 4, scrollSpeedMax: 260,   // the run tightens as it goes
    voidFallDmg: 18, voidSlowMult: 0.58, voidSlowDur: 0.7,
    // TWO-STOREY VOID: whole paired chunks, authored lane bands, and stable
    // hazard clocks. Route geometry is consumed by VoidGen and the live stream.
    voidChunkWidthMin: 580, voidChunkWidthMax: 720,
    voidPlatformWidthMin: 150, voidPlatformWidthMax: 285,
    voidLowerMin: 550, voidLowerMax: 700, voidUpperMin: 350, voidUpperMax: 510,
    voidLaneClearance: 76, voidTransferMin: 145, voidTransferMax: 165,
    voidSpawnBehind: 360, voidSpawnAhead: 680, voidRecycleMargin: 150,
    voidCrumbleStand: 0.8, voidFirePeriod: 3.0, voidFireArm: 0.65, voidFireHot: 1.05,
    voidCageH: 170, voidCageHalfW: 22, voidTransferGrace: 0.55,
    voidWispCd: 4.8, voidWispDmg: 10, voidWispTell: 0.42, voidWispPassSpeed: 620, voidWispPassTime: 1.35,
    beamCd: 8.5, beamWarn: 0.9, beamSweep: 1.15, beamW: 52, beamDmg: 20,
    stolenBladeSpeed: 1750, stolenBladeDmg: 18,
  },
  // The Berserker King / Aldric (Stage 3 boss): a duel -> a throne of fire -> a fake death & frenzy
  aldric: {
    w: 116, h: 132, hp: 4300, speed: 130, contactDmg: 22, knockbackTaken: 0.3, weight: 7,
    atkCd: 1.7, windup: 0.45, lungeSpeed: 1150, shockDmg: 18, shockSpeed: 740, shockR: 20,
    fireTier: 0.65, fakeTier: 0.20, regenRate: 0.05, reviveFrac: 0.5,   // regen 5%/s up to 50% during the fake
    fireCols: 8, fireCycle: 3.0, fireWarn: 0.8,                         // 2.2s stable + 0.8s authored lane warning
    frenzyDmgTaken: 1.35, downedDmgTaken: 0.3, chargeCd: 9.5, chargeWindup: 0.5, chargeSpeed: 1550,
    rallyWindow: 1.5, recoverableFrac: 0.65, rallyHealPerDamage: 0.55,
    kneelDur: 6.0, witnessReviveFrac: 0.32, angerReviveFrac: 0.55, angerRegenMult: 2.4,
    angerDamageMult: 1.25, seamLife: 2.6, crownfireCd: 7.2, crownfireWindup: 0.85,
    emberDmg: 14, emberSpeed: 560,
    cleaverRear: 44, cleaverShaft: 78, cleaverBlade: 56, cleaverHalfW: 32, overheadRecover: 0.72,
    pounceAfter: 1.0,   // NO SHELTER: hover above him this long and the pounce comes, every time
    // VERTICAL HUNTER: authored platform pursuit, never the generic random climb.
    verticalResponse: 0.82, verticalCdDuel: 4.6, verticalCdFire: 3.35, verticalCdFrenzy: 2.45,
    vaultWindup: 0.42, vaultFlight: 0.68, vaultArc: 175, vaultAdjust: 105,
    vaultDmg: 18, vaultRange: 145, vaultStress: 0.72, vaultRecover: 0.46,
    ascendWindup: 0.38, ascendFlight: 0.54, ascendDmg: 19, ascendHalfW: 72, ascendRecover: 0.38,
    thronefallWindup: 0.68, thronefallRise: 255, thronefallSpeed: 2050,
    thronefallDmg: 28, thronefallRange: 175, thronefallRecover: 0.82,
    arcDmg: 16, arcSpeed: 620, arcRise: 210, arcGravity: 480,   // CLEAVER ARCS: fire crescents — parry food (rally)
    overheadCd: 6.5, overheadWindup: 0.6, overheadDmg: 26, overheadRange: 150,   // OVERHEAD CLEAVER: a committed high-to-low slam + lingering fire seam
  },
  // The Iron Colossus (Stage 2 boss): a tank with a front shield -> a thrown sweeping arm -> an exposed core
  colossus: {
    w: 152, h: 150, hp: 3700, speed: 58, contactDmg: 24, knockbackTaken: 0, weight: 9,
    atkCd: 2.5, windup: 0.6, shockDmg: 20, shockSpeed: 720, shockR: 24,
    quakeSpeedMult: 0.78, quakeRMult: 1.25,   // his waves are QUAKES: taller, slower, his alone
    chargeWindup: 0.7, chargeSpeed: 1350,
    sweeperDmg: 16, sweeperSpeed: 540, sweeperY: 540, sweeperIntegrity: 5, sweeperMaxLife: 6.5,
    panelCount: 4, panelStep: 0.72, crossDmg: 14, crossSpeed: 640, crossCd: 2.2,
    ventDur: 2.2, ventW: 150, ventLift: 2600,
    staggerDur: 1.1, coreOpenDur: 2.5, coreOpenMult: 1.65,
    shieldCrossings: 3, shieldEmbedDur: 2.2,
    debrisDmg: 16, debrisGravity: 1750, meltdownCd: 8.5, meltdownWindup: 0.9,
    campAfter: 1.15, pillarCd: 7.0,   // NO SHELTER: the fortress accelerates a perch's shared fracture cycle
    // the BRUISER kit — heavy, telegraphed, punishable
    chargeStopShort: 0.55,   // fraction of charges that halt short with a shoulder-check (no free self-stagger)
    smashWindup: 0.7, smashDmg: 24, smashRange: 200,   // OVERHEAD SMASH: raise a fist, then a vertical kill-column at the player's x
    grabRange: 130, grabWindup: 0.28, grabDmg: 20, grabKnock: 900,   // SEISMIC BACKHAND: punish point-blank camping
  },
  // The Warden (Stage 1 boss): a methodical guard who weaponizes the arena across 3 phases
  warden: {
    batonCd: 2.1, batonWindup: 0.5, mortarShots: 3, mortarSpeed: 760, mortarGravity: 900, mortarDmg: 14,
    staffRear: 36, staffFront: 104, staffHead: 24, staffParryR: 14,   // 167px counterweight-to-fork silhouette
    bashKnock: 620,   // the string finisher's shove
    // BATON STRINGS (his kit is MELEE now — no ground waves): each beat opens a
    // deflect window first, then lands; the P2 finisher beat is unparryable (peril)
    stringRange: 270, stringDmg: 16, stringWind: 0.30, parryWin: 0.16,
    lungeRange: 620, lungeWind: 0.42, lungeSpeed: 1350, lungeDmg: 18,   // SHIELD-BATON LUNGE: a mid-range gap-closer at a kiting player
    zoneCount: 3, zoneW: 200, zoneShift: 7, zoneTick: 7, zoneTickCd: 0.4,   // phase-2 prohibited zones
    ceilingY: 150, ceilDropCd: 1.6, lungeCd: 7.5, lungeWindup: 0.55, lungeSpeed: 1500,   // phase-3 ceiling: lock + telegraph, then dive
    guardParry: 0.24, guardPerfect: 0.36, guardDecay: 0.08, guardDecayDelay: 1.8,
    guardBreakDur: 2.5, guardBreakMult: 1.65,
    lockdownDur: 5.0, lockdownCd: 10.0, cageW: 125,
    debrisDmg: 15, debrisGravity: 1650, trailLife: 2.5,
    campAfter: 1.15, volleyCd: 6.0, vaultCd: 2.4, vaultPerchAfter: 0.78,   // targeted vaulting remains active before the ceiling form
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
    countPerWave: 1.4,    // + this many enemies per wave thereafter
    hpScalePerWave: 0.12, // +12% enemy HP per wave
    scorePerKill: 6,      // score per kill (x wave x combo) — tuned so a strong run reads in the low thousands, not the hundred-thousands
    scoreMult: 1,         // raised by the "Bounty Hunter" upgrade
    coinMult: 1,          // raised by the "Fortune" upgrade
    healEachWave: 12,     // HP restored on wave clear (Normal only) — modest; sustain is earned
    startDelay: 0.8,      // beat before the first spawn of a wave
    waveClearPause: 0.8,  // delay after the last enemy dies before the draft appears
    // ---- campaign curve: gentle within a stage, a clear step UP between stages ----
    // (endless keeps the flat per-wave ramp above; campaign uses these instead)
    stageHpStep: 0.34,    // +34% enemy HP per stage entered
    inStageHp: 0.06,      // +6% enemy HP per wave WITHIN a stage
    stageDmgStep: 0.14,   // +14% enemy contact damage per stage
    inStageDmg: 0.02,     // +2% damage per wave within a stage
    stageCountStep: 2,    // +2 enemies per wave per stage — later stages field real hordes
    concurrentPerStage: 1, // +1 on-screen enemy cap per stage in campaign (more pressure deeper in)
    maxConcurrentCap: 10,  // ...but never more than this many at once
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
    pts: { hit: 2, trueCut: 6, break: 8, drive: 5, drag: 5, throwHit: 4, crosscut: 8, circuit: 5, deflect: 5, launch: 5, slam: 8, superslam: 11, updraft: 10, parry: 12 },
  },

  // ---- difficulties (selectable from the menu) ----
  // mods scale enemy HP / your damage-taken / spawn count + the coin & score rewards
  // (risk = reward). Normal is the baseline (all 1.0). One-Hit keeps the deadly flag.
  difficulties: [
    { id: "easy",    label: "Easy",    desc: "Gentler enemies, lighter hits.",      mods: { hp: 0.80, dmg: 0.65, count: 0.85, coin: 0.80, score: 0.70 } },
    { id: "normal",  label: "Normal",  desc: "The intended balance.",                mods: { hp: 1.00, dmg: 1.00, count: 1.00, coin: 1.00, score: 1.00 } },
    { id: "hard",    label: "Hard",    desc: "Tougher, hungrier, more of them.",     mods: { hp: 1.30, dmg: 1.35, count: 1.15, coin: 1.10, score: 1.40 } },
    { id: "extreme", label: "Extreme", desc: "Brutal — but fair. Big rewards.",      mods: { hp: 1.70, dmg: 1.80, count: 1.30, coin: 1.15, score: 2.00 } },
    { id: "onehit",  label: "One-Hit", desc: "One touch and you fall. Rewards surge after wave 8.", oneHit: true, mods: { hp: 0.90, dmg: 1.00, count: 1.00, coin: 0.70, score: 2.20 } },
  ],

  // ---- modes (endless live; others reserved for later) ----
  modes: [
    { id: "campaign", label: "Adventure",          enabled: true,
      blurb: "Journey through biomes — 9 waves then a boss, stage after stage, ever deeper." },
    { id: "endless", label: "Endless",            enabled: true,
      blurb: "Survive forever — biomes cycle, hordes swell, mini-bosses crash in. Chase your best." },
    { id: "gauntlet", label: "Gauntlet",           enabled: true,
      blurb: "Endless, but a full boss storms in every 8 waves — cycling all five, ever tougher." },
    { id: "playground", label: "Playground",       enabled: true, training: true,
      blurb: "An open arena — spawn any enemy, grab any ability at any tier, test everything." },
    { id: "tutorial", label: "Tutorial",            enabled: true, training: true,
      blurb: "Learn the blade: swings, slams, power slams, launches, juggles, updrafts, throws, parries." },
    { id: "bossonly", label: "Boss Test",          enabled: true, bossOnly: true, debug: true,
      blurb: "Boss gauntlet — fight every boss in a row, evolving an ability after each." },
    { id: "sandbox",  label: "Enemy Test",          enabled: true, sandbox: true, debug: true,
      blurb: "Sandbox: every enemy variant spawns from wave 1 — try the full roster." },
  ],
};

// live theme: foreground "ink" colour + a separating "rim" halo, derived from the
// CURRENT background's luminance each frame so the HUD, player, blade, and enemies
// stay readable on ANY backdrop — light biome, dark void, or anything in between.
// THEME.set(bg) is called once per frame with the colour actually being painted.
function _relLum(hex) {
  hex = (hex || "#fff").replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;   // 0 (black) .. 1 (white)
}
// graphics quality — when low, the costly per-frame effects (rim/blade/rift glow
// shadowBlur, ambient motes) are skipped so the CrazyGames embed / low-end mobile
// stays smooth. Resolved from the user's setting (auto/high/low) in applySettings.
const GFX = { low: false };
// Accessibility state is resolved from persisted settings. Combat timing never
// reads these values; only screen flash, camera/particle displacement, and the
// geometry-first telegraph renderer do.
const A11Y = { flashScale: 1, motionScale: 1, reducedMotion: false, highContrast: false };
// Physical animation time advances only with fixed simulation steps, so hit-stop
// freezes tells, weapons, projectiles, and world dressing. UI retains wall time.
const CLOCK = { sim: 0 };
CONFIG.effects = { highBudget: 320, lowBudget: 110, cullMargin: 180, voidArrivalFxStep: 0.07 };

// fullscreen overscan (logical px of scene BLEED per side). The gameplay arena is a
// fixed 1600x900 for every player; on displays that aren't 16:9 the backing store fills
// the whole screen and the SCENE (sky, backdrop, floor, dims) extends into the extra
// space — true fullscreen with no letterbox bars and no distortion. game.js computes
// this in resizeCanvas; the renderers + input read it. 0/0 in windowed and on 16:9.
const OVERSCAN = { x: 0, y: 0 };

// mobile hardware safe-area insets (notches, dynamic islands, rounded corners), in
// LOGICAL px per side — measured from CSS env(safe-area-inset-*) by resizeCanvas.
// HUD anchors and touch controls stay inside these.
const SAFE = { l: 0, r: 0, t: 0, b: 0 };

// touch tuning: thumb-on-glass has more friction than a mouse on a mat, so touch aim
// deltas get a boost — max blade momentum from shorter, sharper flicks.
// touch feel knobs (Tuning these is a one-liner — see the mobile overhaul plan)
CONFIG.touch = {
  aimBoost: 1.5,     // drag-aim: thumb px -> reticle px multiplier (×1.6 base)
  stickRadius: 130,  // stick-aim: thumb px (client) for full deflection
  stickDead: 10,     // stick-aim: deadzone in thumb px
  joyFollow: 96,     // joystick: re-anchor once the thumb passes this (logical px)
};

// live balance knobs, overridable via Firebase Remote Config (standalone build) WITHOUT
// a redeploy. All default to 1.0 (no change); applied to per-run values at run start, so
// tweaking them can never destabilize the config-restore system. Set matching numeric
// parameters in the Firebase console (Remote Config) to tune the live game.
const REMOTE = { coinMult: 1, enemyHpMult: 1, enemyDensityMult: 1, scoreMult: 1 };

const THEME = {
  ink: "#0a0a0a", rim: "rgba(0,0,0,0.35)", paper: "#ffffff", dark: false,
  set(bg) {
    const L = _relLum(bg);
    this.dark = L < 0.5;
    this.paper = bg;
    this.ink = this.dark ? "#ecebf6" : "#0a0a0a";              // light ink on dark, near-black on light
    // a soft halo around models so the silhouette separates from the bg on either polarity:
    // a luminous glow on dark stages, a drop-shadow on light ones.
    this.rim = this.dark ? "rgba(150,180,255,0.55)" : "rgba(0,0,0,0.32)";
  },
};
