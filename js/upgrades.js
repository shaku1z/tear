// ------- draft upgrades -------
// Two categories:
//   UPGRADES (unique:false) — stackable numeric/heal boosts, can be drafted repeatedly.
//   UNIQUE ABILITIES (unique:true) — qualitative mechanics, offered/owned only once.
// Stat upgrades mutate CONFIG / the live player. Ability upgrades set flags on `mods`
// (read by the combat loop) or push handlers into hook arrays.

function newMods() {
  return {
    onHit: [], onKill: [], onParry: [], onSlam: [],
    // normalized combat-event hooks (Weapons WA1) — abilities subscribe here; weapons
    // and the combat loop emit. Kept as arrays so `fire()` works uniformly.
    onThrowLaunch: [], onThrowResolve: [], onReturnHit: [], onWeaponCatch: [],
    onEnemyFirstDamaged: [], onReflectedHit: [],
    owned: {}, ownedList: [],
    // unique-ability flags, read by the combat loop:
    throwRamp: 0,         // per-pierce damage/speed ramp on a thrown blade
    deflectPierce: false, // deflected shots pass through enemies
    deflectSplit: false,  // deflected shots split into 3 bouncing shards
    airBonus: 0,          // +damage fraction while airborne (Air Superiority)
    tempest: false,       // empowered updraft launches nearby enemies too
    stormRecall: false,   // the returning blade deals heavy damage
    phantomDash: 0,       // dash damages enemies you pass through (dmg amount)
    berserk: false,       // +25% damage while below half HP
    // ---- resilience (healing rework): survivability earned through skill ----
    lifesteal: 0,         // Vampiric Edge: HP per swing (capped per-swing in the loop)
    parryGuard: false,    // Riposte: damage-reduction window after a perfect parry
    flowGuard: false,     // Flow Guard: damage reduction while the trick rank is high
    slamShield: false,    // Aegis: slam kills grant a one-hit absorb pip
    bloodrite: false,     // Bloodrite: skill kills heal a little HP
    // ---- skill-expression abilities ----
    phaseStep: false,     // Phase Step: dashing through a shot deflects it
    crater: false,        // Crater: empowered Power Slams erupt in a scaling shockwave
    aerialRave: 0,        // Aerial Rave: swing damage grows the longer you stay airborne
    // ---- reworked throw / dash kit ----
    ricochet: false,      // Ricochet: thrown blade redirects to a new target after each pierce
    vortexRecall: false,  // Vortex Recall: the returning blade drags pierced enemies toward you
    slipstream: false,    // Slipstream: +damage briefly after a dash ends
    // ---- ability tiers (evolved on boss kills) ----
    tier: {},             // id -> current tier (1 when acquired, up to 3)
    stormMult: 1.85,      // Storm Recall multiplier (raised by its tiers)
    killHeal: 0,          // Bloodrite T3: heal on any kill
    bloodGuard: false,    // Bloodrite T2: skill kills also grant a brief DR window
    flowRegen: false,     // Flow Guard T3: regenerate HP while the trick rank is high
    aegisParry: false,    // Aegis T2: perfect-parry kills also grant a shield
    shieldBurst: false,   // Aegis T3: an absorbed hit erupts in a shockwave
    razorStun: false,     // Razor Momentum T3: each pierce briefly stuns
    stormBurst: false,    // Storm Recall T3: catching the returning blade releases a shockwave
    phantomRefund: false, // Phantom Dash T3: a phantom-dash kill refreshes your dash
    // ---- new Special abilities (status-effect kit) ----
    bleedHit: 0,          // Rupture: bleed stacks applied per cut
    bleedDetonate: false, // Rupture T2: a Power Slam detonates nearby bleed for a burst
    bleedNova: false,     // Rupture T3: a bleeding enemy's death spreads bleed
    sunderHit: false,     // Sunder: your hits MARK enemies (+30% damage taken)
    sunderShatter: false, // Sunder T2: marking an armored foe shatters its guard
    sunderSpread: false,  // Sunder T3: hitting a marked enemy spreads the mark
    impale: 0,            // Impale: bleed stacks on a thrown-blade hit (+ pins the target)
    impaleAll: false,     // Impale T2: pins every enemy the blade pierces
    impaleRecall: false,  // Impale T3: the returning blade detonates bleed it passes through
    tempo: 0,             // Tempo: +damage per stack during the post-parry window
    tempoMax: 1,          // Tempo T2: max stacks
    tempoSurge: false,    // Tempo T3: a perfect parry also heals + extends slow-mo
    backlash: 0,          // Backlash: counter-shock damage on a perfect parry (0 = off)
    backlashMark: false,  // Backlash T2: the shock also MARKS
    backlashSurge: false, // Backlash T3: bigger shock + brief invulnerability
    cinder: false,        // Cinder Trail: dashing ignites enemies you pass (BURN)
    cinderSlow: false,    // Cinder T2: hotter burn that also slows
    cinderNova: false,    // Cinder T3: a burning enemy's death erupts in fire
    concussive: 0,        // Concussive Dash: shockwave damage when a dash ends (0 = off)
    concStun: false,      // Concussive T2: the shockwave stuns
    concRefund: false,    // Concussive T3: a dash that catches 2+ enemies refunds itself
    parryStun: false,     // Backfire (parry unique): reflected shots stun what they strike
    waveHeal: 0,          // Bulwark (resilience stack): extra HP healed on each wave clear
    reservePick: false,   // shop: reserve an unchosen card for the next normal draft
    draftRerolls: 0,      // shop: limited rerolls shared across the whole run
    expandedDraft: false, // shop: normal drafts contain four cards
  };
}

const UPGRADES = [
  // ===== stackable upgrades =====
  { id: "vitality", name: "Vitality", unique: false, cat: "resilience", desc: "+30 max HP, and heal 30.",
    apply: ({ player }) => { player.maxHp += 30; player.heal(30); } },
  { id: "keen_edge", name: "Keen Edge", unique: false, cat: "offense", desc: "+12% swing damage.",
    apply: () => { CONFIG.blade.damageScale *= 1.12; CONFIG.blade.maxDamage = Math.round(CONFIG.blade.maxDamage * 1.06); } },
  { id: "fleet", name: "Fleet Foot", unique: false, cat: "mobility", desc: "+8% move speed, higher jump.",
    apply: () => { CONFIG.player.moveSpeed *= 1.08; CONFIG.player.jumpSpeed *= 1.03; } },
  { id: "quick_recovery", name: "Quick Recovery", unique: false, cat: "mobility", desc: "-25% dash cooldown.",
    apply: () => { CONFIG.dash.cooldown *= 0.75; } },
  { id: "long_reach", name: "Long Reach", unique: false, cat: "utility", desc: "+ blade reach and length.",
    apply: () => { CONFIG.blade.aimRadius += 18; CONFIG.blade.length += 8; CONFIG.blade.maxReach += 18; } },
  { id: "heavy_swing", name: "Heavy Swing", unique: false, cat: "offense", desc: "+25% knockback, stronger launches.",
    apply: () => { CONFIG.enemy.knockbackTaken *= 1.25; CONFIG.ranged.knockbackTaken *= 1.25; CONFIG.blade.launchPower *= 1.10; } },
  { id: "deadly_throw", name: "Deadly Throw", unique: false, cat: "throw", desc: "+20% thrown-blade damage, and it flies faster.",
    apply: () => { CONFIG.blade.throw.damage *= 1.20; CONFIG.blade.throw.damageFromSpeed *= 1.15; CONFIG.blade.throw.speed *= 1.08; } },
  { id: "vampiric", name: "Vampiric Edge", unique: false, cat: "resilience", desc: "Swings trickle back a sliver of HP (once per swing).",
    apply: ({ mods }) => { mods.lifesteal += CONFIG.resilience.lifestealPerSwing; } },
  { id: "air_superiority", name: "Air Superiority", unique: false, cat: "offense", desc: "+15% damage while airborne.",
    apply: ({ mods }) => { mods.airBonus += 0.15; } },
  { id: "tough_hide", name: "Tough Hide", unique: false, cat: "resilience", desc: "Take 12% less damage.",
    apply: () => { CONFIG.player.dmgTakenMult *= 0.88; } },
  { id: "air_dash", name: "Air Dash", unique: true, cat: "mobility",
    desc: "Gain a second dash you can use in mid-air. Charges refill when you land.",
    // additive so it STACKS with Aether Step (meta shop) instead of both flat-capping at 2.
    // Safe as +=: unique (picked once per run) and applied to a fresh player (base 1).
    apply: ({ player }) => { player.maxDashCharges += 1; player.dashCharges = player.maxDashCharges; } },
  { id: "afterimage", name: "Afterimage", unique: true, cat: "mobility",
    desc: "After a dash ends, gain +25% movement speed for 1 second.",
    apply: ({ player }) => { player.afterimageDuration = 1; player.afterimageSpeedMult = 1.25; } },
  { id: "hard_turn", name: "Hard Turn", unique: false, cat: "mobility",
    desc: "+10% steering authority during the final third of a dash.",
    apply: ({ player }) => { player.hardTurnStacks += 1; } },
  { id: "bounty", name: "Bounty Hunter", unique: false, cat: "utility", desc: "+15% score from kills.",
    apply: () => { CONFIG.run.scoreMult *= 1.15; } },
  { id: "glass_cannon", name: "Glass Cannon", unique: false, cat: "offense", desc: "+30% ALL damage (swing + throw), but you take +25% more.",
    apply: () => {
      CONFIG.blade.damageScale *= 1.30; CONFIG.blade.maxDamage = Math.round(CONFIG.blade.maxDamage * 1.20);
      CONFIG.blade.throw.damage *= 1.30; CONFIG.blade.throw.damageFromSpeed *= 1.30;
      CONFIG.player.dmgTakenMult *= 1.25;
    } },

  // ===== unique abilities =====
  // ---- resilience: the healing rework's "earned survivability" set ----
  { id: "bloodrite", name: "Bloodrite", unique: true, rare: true, cat: "resilience",
    desc: "Skill kills (slam, spike, perfect-parry) restore HP.",
    apply: ({ mods }) => { mods.bloodrite = true; mods.onKill.push((ev) => { if (ev.cause === "skill") { ev.player.heal(CONFIG.resilience.bloodriteHeal); if (mods.bloodGuard) ev.player.guardT = Math.max(ev.player.guardT, 1.0); } else if (mods.killHeal) ev.player.heal(mods.killHeal); }); },
    tiers: [
      { desc: "Skill kills (slam, spike, perfect-parry) restore much more HP and grant 1s of invincibility.", apply: ({ mods }) => { CONFIG.resilience.bloodriteHeal = 16; mods.bloodGuard = true; } },
      { desc: "Skill kills (slam, spike, perfect-parry) restore massive HP and grant 1s of invincibility. Plus, EVERY normal kill now trickles HP back.", apply: ({ mods }) => { CONFIG.resilience.bloodriteHeal = 22; mods.killHeal = 4; } },
    ] },
  { id: "riposte", name: "Riposte", unique: true, cat: "parry",
    desc: "After a perfect parry, take 60% less damage for 1.2s.",
    apply: ({ mods }) => { mods.parryGuard = true; },
    tiers: [
      { desc: "After a perfect parry, restore HP and take 75% less damage for 1.8s.", apply: ({ mods }) => { CONFIG.resilience.parryGuardTime = 1.8; CONFIG.resilience.parryGuardMult = 0.25; mods.onParry.push((ev) => ev.player.heal(6)); } },
      { desc: "After a perfect parry, restore HP and become completely INVINCIBLE for 2.3s.", apply: () => { CONFIG.resilience.parryGuardTime = 2.3; CONFIG.resilience.parryGuardMult = 0.0; } },
    ] },
  { id: "flow_guard", name: "Flow Guard", unique: true, cat: "resilience",
    desc: "Take 30% less damage while your trick rank is BRUTAL (x3) or higher.",
    apply: ({ mods }) => { mods.flowGuard = true; },
    tiers: [
      { desc: "Take 50% less damage while your trick rank is BRUTAL (x3) or higher.", apply: () => { CONFIG.resilience.flowGuardMult = 0.5; } },
      { desc: "Take 50% less damage starting at STYLISH (x2). At BRUTAL (x3) or higher, you also rapidly REGENERATE HP.", apply: ({ mods }) => { CONFIG.resilience.flowGuardMult = 0.5; CONFIG.resilience.flowGuardTier = 2; mods.flowRegen = true; } },
    ] },
  { id: "aegis", name: "Aegis", unique: true, cat: "resilience",
    desc: "Slam kills grant a shield that blocks the next hit (max 2 shields).",
    apply: ({ player, mods }) => { mods.slamShield = true; player.maxShield = CONFIG.resilience.maxShield; },
    tiers: [
      { desc: "Slam and Perfect-Parry kills grant a shield that blocks the next hit (max 3).", apply: ({ player, mods }) => { CONFIG.resilience.maxShield = 3; player.maxShield = 3; mods.aegisParry = true; } },
      { desc: "Slam and Perfect-Parry kills grant a blocking shield (max 4). When a shield breaks, it erupts in a damaging shockwave.", apply: ({ player, mods }) => { CONFIG.resilience.maxShield = 4; player.maxShield = 4; mods.shieldBurst = true; } },
    ] },

  // ---- skill-expression abilities ----
  { id: "phase_step", name: "Phase Step", unique: true, cat: "parry",
    desc: "Dash through an enemy shot to deflect it — turn defense into offense.",
    apply: ({ mods }) => { mods.phaseStep = true; } },
  { id: "backfire", name: "Backfire", unique: true, cat: "parry", desc: "Your reflected shots STUN the enemies they strike.",
    apply: ({ mods }) => { mods.parryStun = true; } },
  { id: "crater", name: "Crater", unique: true, cat: "offense",
    desc: "Power Slams erupt in a shockwave that grows with your descent speed.",
    apply: ({ mods }) => { mods.crater = true; } },
  { id: "aerial_rave", name: "Aerial Rave", unique: true, cat: "offense",
    desc: "Staying airborne ramps up your swing damage over time (up to +50%).",
    apply: ({ mods }) => { mods.aerialRave = 0.25; },
    tiers: [
      { desc: "Staying airborne ramps up your swing damage much faster (up to +80%).", apply: ({ mods }) => { mods.aerialRave = 0.42; CONFIG.skill.aerialRaveCap = 0.8; } },
      { desc: "Staying airborne ramps up your swing damage incredibly fast (up to +130%).", apply: ({ mods }) => { mods.aerialRave = 0.6; CONFIG.skill.aerialRaveCap = 1.3; } },
    ] },

  { id: "seismic_slam", name: "Seismic Slam", unique: true, cat: "offense", desc: "Slams blast nearby enemies for 22.",
    apply: ({ mods }) => { mods.onSlam.push((ev) => { ev.dealAoE(ev.x, ev.y, 130, 22); ev.fx.explode(ev.x, ev.y, CONFIG.colors.slam, 0.9); }); } },
  { id: "detonate", name: "Detonate", unique: true, cat: "offense", desc: "Kills explode for 18 to nearby foes.",
    apply: ({ mods }) => { mods.onKill.push((ev) => { ev.dealAoE(ev.x, ev.y, 120, 18); ev.fx.explode(ev.x, ev.y, CONFIG.colors.bomber, 0.7); }); } },
  { id: "adrenaline", name: "Adrenaline", unique: true, cat: "mobility", desc: "Kills instantly refresh your dash.",
    apply: ({ mods }) => { mods.onKill.push((ev) => { ev.player.dashCd = 0; }); } },

  // (Razor Momentum) per-pierce ramp, capped in the combat loop so it can't snowball
  { id: "throw_momentum", name: "Razor Momentum", unique: true, cat: "throw",
    desc: "A thrown blade grows faster and stronger for every enemy it pierces.",
    apply: ({ mods }) => { mods.throwRamp = 0.1; },
    tiers: [
      { desc: "A thrown blade ramps up speed and damage much harder for every pierce.", apply: ({ mods }) => { mods.throwRamp = 0.18; } },
      { desc: "A thrown blade heavily ramps up speed and damage. Each pierce also briefly STUNS the target.", apply: ({ mods }) => { mods.throwRamp = 0.26; mods.razorStun = true; } },
    ] },
  { id: "throw_giant", name: "Greatblade", unique: true, cat: "throw",
    desc: "The blade becomes huge while thrown (normal size in hand).",
    apply: ({ blade }) => { blade.throwSizeMult = 1.7; } },
  { id: "parry_pierce", name: "Piercing Parry", unique: true, cat: "parry",
    desc: "Parried projectiles pierce through every enemy.",
    apply: ({ mods }) => { mods.deflectPierce = true; } },
  { id: "parry_split", name: "Scatter Parry", unique: true, cat: "parry",
    desc: "Parried projectiles split into 3 that ricochet up to 3 times.",
    apply: ({ mods }) => { mods.deflectSplit = true; } },

  { id: "tempest", name: "Tempest", unique: true, cat: "offense",
    desc: "Rising updrafts also launch all nearby enemies skyward.",
    apply: ({ mods }) => { mods.tempest = true; } },
  { id: "storm_recall", name: "Storm Recall", unique: true, cat: "throw",
    desc: "Recalling the blade tears through enemies for +85% damage.",
    apply: ({ mods }) => { mods.stormRecall = true; },
    tiers: [
      { desc: "Recalling the blade tears through enemies for +140% damage.", apply: ({ mods }) => { mods.stormMult = 2.4; } },
      { desc: "Recalling the blade tears through enemies for +200% damage. Catching it unleashes a shockwave.", apply: ({ mods }) => { mods.stormMult = 3.0; mods.stormBurst = true; } },
    ] },
  { id: "phantom_dash", name: "Phantom Dash", unique: true, cat: "mobility",
    desc: "Dashing directly through enemies unleashes a damaging phase-slice.",
    apply: ({ mods }) => { mods.phantomDash = 26; },
    tiers: [
      { desc: "Dashing directly through enemies unleashes a much heavier phase-slice.", apply: ({ mods }) => { mods.phantomDash = 44; } },
      { desc: "Dashing directly through enemies unleashes a devastating phase-slice. If the slice kills, your dash instantly REFUNDS.", apply: ({ mods }) => { mods.phantomDash = 64; mods.phantomRefund = true; } },
    ] },
  { id: "boomerang", name: "Boomerang", unique: true, cat: "throw",
    desc: "Recall the thrown blade from any distance.",
    apply: ({ blade }) => { blade.freeRecall = true; } },
  { id: "ricochet", name: "Ricochet", unique: true, cat: "throw",
    desc: "A thrown blade curves to a new target after each enemy it pierces — chain a whole crowd.",
    apply: ({ mods }) => { mods.ricochet = true; } },
  { id: "vortex_recall", name: "Vortex Recall", unique: true, cat: "throw",
    desc: "The returning blade drags every enemy it passes toward you — cluster them, then punish.",
    apply: ({ mods }) => { mods.vortexRecall = true; } },
  { id: "slipstream", name: "Slipstream", unique: true, cat: "mobility",
    desc: "For a moment after a dash, your hits land for +35% — dash in, strike hard.",
    apply: ({ mods }) => { mods.slipstream = true; } },
  { id: "berserk", name: "Berserker", unique: true, cat: "offense",
    desc: "+25% damage while below half HP.",
    apply: ({ mods }) => { mods.berserk = true; } },
  { id: "last_stand", name: "Last Stand", unique: true, rare: true, cat: "resilience",
    desc: "Once per run, refuse to fall — rise from a killing blow with 40% HP.",
    apply: ({ player }) => { player.abilityRevives += 1; } },

  // ===== more stackable upgrades — keep every category at 4+ =====
  { id: "whetstone", name: "Whetstone", unique: false, cat: "throw", desc: "The RETURNING blade (recall) cuts +25% harder — make the catch a finisher.",
    apply: () => { CONFIG.blade.throw.recallMult *= 1.25; } },
  { id: "gyroblade", name: "Gyroblade", unique: false, cat: "throw", desc: "The thrown blade flies and returns 12% faster.",
    apply: () => { CONFIG.blade.throw.speed *= 1.12; CONFIG.blade.throw.returnSpeed *= 1.12; } },
  { id: "quickdraw", name: "Quickdraw", unique: false, cat: "throw", desc: "+ recall range, and the blade snaps back faster.",
    apply: () => { CONFIG.blade.throw.reclaimDistance += 80; CONFIG.blade.throw.returnSpeed *= 1.10; } },
  { id: "steady_hand", name: "Steady Hand", unique: false, cat: "parry", desc: "Perfect parries land more easily — a more forgiving window.",
    apply: () => { CONFIG.blade.perfectSpeed *= 0.93; } },
  { id: "wide_guard", name: "Wide Guard", unique: false, cat: "parry", desc: "Deflect shots even with slower swings.",
    apply: () => { CONFIG.blade.deflectMinSpeed *= 0.87; } },
  { id: "counterforce", name: "Counterforce", unique: false, cat: "parry", desc: "Reflected shots fly faster and hit +18% harder.",
    apply: () => { CONFIG.blade.deflectBoost *= 1.10; CONFIG.blade.deflectDmgMult *= 1.18; } },
  { id: "tailwind", name: "Tailwind", unique: false, cat: "mobility", desc: "Higher jump and sharper air control.",
    apply: () => { CONFIG.player.jumpSpeed *= 1.05; CONFIG.player.airAccel *= 1.16; } },
  { id: "kinetic", name: "Kinetic Charge", unique: false, cat: "mobility", desc: "+9% dash distance, and longer dash i-frames.",
    apply: () => { CONFIG.dash.speed *= 1.09; CONFIG.dash.iframe *= 1.16; } },
  { id: "bulwark", name: "Bulwark", unique: false, cat: "resilience", desc: "Recover an extra 10 HP each time you clear a wave.",
    apply: ({ mods }) => { mods.waveHeal += 10; } },
  { id: "showtime", name: "Showtime", unique: false, cat: "utility", desc: "Your trick meter lingers — it drains 25% slower.",
    apply: () => { CONFIG.trick.decay *= 1.3; CONFIG.trick.drainRate *= 0.8; } },
  { id: "fortune", name: "Fortune", unique: false, maxStacks: 5, cat: "utility", desc: "+12% final coins. Milestone bonuses unlock at stacks 3 and 5.",
    apply: () => {} },

  // ===== more SPECIAL abilities (tiered; keep every combat category at 3+) =====
  // --- OFFENSE ---
  { id: "rupture", name: "Rupture", unique: true, cat: "offense",
    desc: "Cuts inflict BLEED—a stacking wound that damages over time.",
    apply: ({ mods }) => { mods.bleedHit = 1; mods.onHit.push((ev) => { if (mods.bleedHit && ev.enemy && ev.enemy.applyBleed) ev.enemy.applyBleed(mods.bleedHit); }); },
    tiers: [
      { desc: "Cuts inflict 2 BLEED stacks. Power Slams instantly DETONATE nearby bleed for a burst of damage.", apply: ({ mods }) => { mods.bleedHit = 2; mods.bleedDetonate = true; } },
      { desc: "Cuts inflict 3 BLEED stacks. Slams DETONATE bleed, and dying bleeding enemies splash their stacks onto the nearby crowd.", apply: ({ mods }) => { mods.bleedHit = 3; mods.bleedNova = true; } },
    ] },
  { id: "sunder", name: "Sunder", unique: true, cat: "offense",
    desc: "Hits MARK enemies, making them take +30% damage from all sources for 4s.",
    apply: ({ mods }) => { mods.sunderHit = true; mods.onHit.push((ev) => {
      const e = ev.enemy; if (!mods.sunderHit || !e || !e.applyMark) return;
      if (mods.sunderSpread && e.markT > 0) for (const o of ev.enemies) { if (o !== e && !o.dead && o.applyMark && len(o.x - e.x, o.y - e.y) < 150) o.applyMark(); }
      e.applyMark();
      if (mods.sunderShatter && e.cfg && e.cfg.breakSpeed && !e.enraged) { e.enraged = true; e.stun = Math.max(e.stun, 0.5); }
    }); },
    tiers: [
      { desc: "MARKED enemies take +40% damage. Marking armored or shielded foes instantly SHATTERS their guard.", apply: ({ mods }) => { CONFIG.status.markMult = 1.40; mods.sunderShatter = true; } },
      { desc: "MARKED enemies take +50% damage. Marks SHATTER guards, and striking a marked foe SPREADS the mark to nearby enemies.", apply: ({ mods }) => { CONFIG.status.markMult = 1.50; mods.sunderSpread = true; } },
    ] },
  // --- THROW ---
  { id: "impale", name: "Impale", unique: true, cat: "throw",
    desc: "A thrown blade PINS the first enemy hit in place, applying deep BLEED.",
    apply: ({ mods }) => { mods.impale = 3; },
    tiers: [
      { desc: "A thrown blade PINS EVERY enemy it pierces in place, applying heavier BLEED.", apply: ({ mods }) => { mods.impale = 4; mods.impaleAll = true; } },
      { desc: "A thrown blade PINS EVERY enemy pierced with massive BLEED. The returning blade RIPS the wounds open, detonating the bleed.", apply: ({ mods }) => { mods.impale = 5; mods.impaleRecall = true; } },
    ] },
  // --- PARRY ---
  { id: "tempo", name: "Tempo", unique: true, cat: "parry",
    desc: "Perfect parries grant TEMPO (+25% damage, faster speed, refreshes dash) for 4s.",
    apply: ({ mods }) => { mods.tempo = 0.25; mods.onParry.push((ev) => { const p = ev.player; p.tempoStk = Math.min(mods.tempoMax, (p.tempoT > 0 ? p.tempoStk : 0) + 1); p.tempoT = 4; p.dashCd = 0; p.dashCharges = p.maxDashCharges; }); },
    tiers: [
      { desc: "Perfect parries grant TEMPO (+30% damage, faster speed, refreshes dash) for 6s. Stacks up to 2 times.", apply: ({ mods }) => { mods.tempo = 0.3; mods.tempoMax = 2; } },
      { desc: "Perfect parries plunge the room into deep slow-mo and grant TEMPO (+34% damage per stack, max 2, faster speed, refreshes dash).", apply: ({ mods }) => { mods.tempo = 0.34; mods.tempoSurge = true; } },
    ] },
  { id: "backlash", name: "Backlash", unique: true, cat: "parry",
    desc: "A perfect parry erupts a COUNTER-SHOCK, damaging and stunning nearby enemies.",
    apply: ({ mods }) => { mods.backlash = 26; mods.onParry.push((ev) => {
      if (!mods.backlash) return;
      const r = mods.backlashSurge ? 250 : 175;
      ev.dealAoE(ev.x, ev.y, r, mods.backlash);
      for (const e of ev.enemies) { if (!e.dead && len(e.x - ev.x, e.y - ev.y) < r) { if (!e.isBoss) e.stun = Math.max(e.stun, mods.backlashSurge ? 1.1 : 0.55); if (mods.backlashMark && e.applyMark) e.applyMark(); } }
      ev.fx.ring(ev.x, ev.y, mods.backlashSurge ? 16 : 11, CONFIG.colors.perfect);
      if (mods.backlashSurge) ev.player.iframe = Math.max(ev.player.iframe, 1.0);
    }); },
    tiers: [
      { desc: "A perfect parry erupts a larger COUNTER-SHOCK, damaging, stunning, and MARKING nearby enemies.", apply: ({ mods }) => { mods.backlash = 44; mods.backlashMark = true; } },
      { desc: "A perfect parry erupts a massive COUNTER-SHOCK (damages, stuns, marks), and leaves you completely INVINCIBLE for a beat.", apply: ({ mods }) => { mods.backlash = 70; mods.backlashSurge = true; } },
    ] },
  // --- MOBILITY ---
  { id: "cinder", name: "Cinder Trail", unique: true, cat: "mobility",
    desc: "Dashing ignites enemies passed through, inflicting BURN damage over time.",
    apply: ({ mods }) => { mods.cinder = true; },
    tiers: [
      { desc: "Dashing inflicts a hotter BURN that damages and SLOWS enemies over time.", apply: ({ mods }) => { CONFIG.status.burnDps = 30; CONFIG.status.burnDur = 3.4; mods.cinderSlow = true; } },
      { desc: "Dashing inflicts a massive, slowing BURN. Dying burned enemies erupt, igniting everything nearby.", apply: ({ mods }) => { CONFIG.status.burnDps = 34; mods.cinderNova = true; } },
    ] },
  { id: "concussive", name: "Concussive Dash", unique: true, cat: "mobility",
    desc: "Ending a dash erupts a shockwave that deals damage and knockback.",
    apply: ({ mods }) => { mods.concussive = 24; },
    tiers: [
      { desc: "Ending a dash erupts a heavier shockwave that deals damage, knockback, and STUNS.", apply: ({ mods }) => { mods.concussive = 42; mods.concStun = true; } },
      { desc: "Ending a dash erupts a massive stunning shockwave. Hitting 2+ enemies instantly REFUNDS your dash.", apply: ({ mods }) => { mods.concussive = 60; mods.concRefund = true; } },
    ] },
];

// draft weighting:
//   STACKS  (w 1)    — the frequent baseline; repeat them freely
//   UNIQUE  (w 0.6)  — slightly rarer than stacks, but still common (each only once)
//   SPECIAL (w 0.28) — the prized tiered abilities; deliberately uncommon, but the
//                      game GUARANTEES at least 2 are offered per stage (see opts.forceSpecial)
function upWeight(u) {
  if (u.tiers) return u.rare ? 0.16 : 0.28;
  if (u.unique) return 0.6;
  return 1;
}
// roll N distinct choices; owned unique/special abilities are excluded.
function rollUpgrades(n, mods, opts) {
  opts = opts || {};
  const owned = (mods && mods.owned) || {};
  const excluded = new Set(opts.excludeIds || []);
  const pool = UPGRADES
    .filter((u) => !excluded.has(u.id))
    .filter((u) => !(u.unique && owned[u.id]))
    .filter((u) => !(u.maxStacks && (owned[u.id] || 0) >= u.maxStacks))
    .map((u) => ({ u, w: upWeight(u) }));
  const out = [];
  while (out.length < n && pool.length) {
    let total = 0; for (const e of pool) total += e.w;
    let r = Math.random() * total, idx = 0;
    for (let i = 0; i < pool.length; i++) { if ((r -= pool[i].w) <= 0) { idx = i; break; } }
    out.push(pool.splice(idx, 1)[0].u);
  }
  // per-stage guarantee: if asked to force a Special and none rolled, swap one in
  if (opts.forceSpecial && !out.some((u) => u.tiers)) {
    const specials = UPGRADES.filter((u) => u.tiers && !owned[u.id] && !excluded.has(u.id) && !out.includes(u));
    if (specials.length) {
      let ri = out.findIndex((u) => !u.tiers && !u.unique);   // replace a stack if possible
      if (ri < 0) ri = out.findIndex((u) => !u.tiers);
      if (ri < 0) ri = out.length - 1;
      out[ri] = specials[Math.floor(Math.random() * specials.length)];
    }
  }
  return out;
}

function applyUpgrade(up, ctx) {
  ctx.mods.owned[up.id] = (ctx.mods.owned[up.id] || 0) + 1;
  ctx.mods.ownedList.push(up.id);
  if (!ctx.mods.tier[up.id]) ctx.mods.tier[up.id] = 1;   // acquired at tier 1
  up.apply(ctx);
}

// ---- ability tiers (evolved on boss kills) ----
// owned abilities that define a next tier and haven't maxed out yet
function availableTierUps(mods) {
  const out = [];
  for (const id in mods.owned) {
    const up = UPGRADES.find((u) => u.id === id);
    if (!up || !up.tiers) continue;
    const cur = mods.tier[id] || 1;       // current tier (1..3)
    if (cur - 1 < up.tiers.length) out.push(up);   // a further tier exists
  }
  return out;
}
function nextTierDesc(up, mods) {
  const cur = mods.tier[up.id] || 1;
  const t = up.tiers && up.tiers[cur - 1];
  return t ? t.desc : "";
}
function tierUp(id, ctx) {
  const up = UPGRADES.find((u) => u.id === id);
  if (!up || !up.tiers) return;
  const cur = ctx.mods.tier[id] || 1;
  const t = up.tiers[cur - 1];
  if (!t) return;
  t.apply(ctx);
  ctx.mods.tier[id] = cur + 1;
}
