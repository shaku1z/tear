// ------- draft upgrades -------
// Two categories:
//   UPGRADES (unique:false) — stackable numeric/heal boosts, can be drafted repeatedly.
//   UNIQUE ABILITIES (unique:true) — qualitative mechanics, offered/owned only once.
// Stat upgrades mutate CONFIG / the live player. Ability upgrades set flags on `mods`
// (read by the combat loop) or push handlers into hook arrays.

function newMods() {
  return {
    onHit: [], onKill: [], onParry: [], onSlam: [],
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
    parryStun: false,     // Backfire (parry stack): reflected shots stun what they strike
    waveHeal: 0,          // Bulwark (resilience stack): extra HP healed on each wave clear
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
    apply: ({ player }) => { player.maxDashCharges = Math.max(player.maxDashCharges, 2); player.dashCharges = player.maxDashCharges; } },
  { id: "bounty", name: "Bounty Hunter", unique: false, cat: "utility", desc: "+20% score from kills.",
    apply: () => { CONFIG.run.scoreMult *= 1.2; } },
  { id: "glass_cannon", name: "Glass Cannon", unique: false, cat: "offense", desc: "+30% ALL damage (swing + throw), but you take +25% more.",
    apply: () => {
      CONFIG.blade.damageScale *= 1.30; CONFIG.blade.maxDamage = Math.round(CONFIG.blade.maxDamage * 1.20);
      CONFIG.blade.throw.damage *= 1.30; CONFIG.blade.throw.damageFromSpeed *= 1.30;
      CONFIG.player.dmgTakenMult *= 1.25;
    } },

  // ===== unique abilities =====
  // ---- resilience: the healing rework's "earned survivability" set ----
  { id: "bloodrite", name: "Bloodrite", unique: true, rare: true, cat: "resilience",
    desc: "Skill kills (slam, spike, or perfect-parry) restore HP.",
    apply: ({ mods }) => { mods.bloodrite = true; mods.onKill.push((ev) => { if (ev.cause === "skill") { ev.player.heal(CONFIG.resilience.bloodriteHeal); if (mods.bloodGuard) ev.player.guardT = 1.0; } else if (mods.killHeal) ev.player.heal(mods.killHeal); }); },
    tiers: [
      { desc: "Heal much more per skill kill, AND a skill kill grants 1s of damage reduction.", apply: ({ mods }) => { CONFIG.resilience.bloodriteHeal = 16; mods.bloodGuard = true; } },
      { desc: "Heal even more — and EVERY kill now trickles HP back.", apply: ({ mods }) => { CONFIG.resilience.bloodriteHeal = 22; mods.killHeal = 4; } },
    ] },
  { id: "riposte", name: "Riposte", unique: true, cat: "parry",
    desc: "After a perfect parry, take 60% less damage for 1.2s.",
    apply: ({ mods }) => { mods.parryGuard = true; },
    tiers: [
      { desc: "The guard lasts longer, cuts 75% of damage, and a perfect parry heals you.", apply: ({ mods }) => { CONFIG.resilience.parryGuardTime = 1.8; CONFIG.resilience.parryGuardMult = 0.25; mods.onParry.push((ev) => ev.player.heal(6)); } },
      { desc: "A perfect parry makes you briefly INVINCIBLE.", apply: () => { CONFIG.resilience.parryGuardTime = 2.3; CONFIG.resilience.parryGuardMult = 0.0; } },
    ] },
  { id: "flow_guard", name: "Flow Guard", unique: true, cat: "resilience",
    desc: "Take 30% less damage while your trick rank is BRUTAL or higher.",
    apply: ({ mods }) => { mods.flowGuard = true; },
    tiers: [
      { desc: "Cut 50% of damage while BRUTAL+.", apply: () => { CONFIG.resilience.flowGuardMult = 0.5; } },
      { desc: "Protection starts at STYLISH — and you REGENERATE HP while BRUTAL+.", apply: ({ mods }) => { CONFIG.resilience.flowGuardMult = 0.5; CONFIG.resilience.flowGuardTier = 2; mods.flowRegen = true; } },
    ] },
  { id: "aegis", name: "Aegis", unique: true, cat: "resilience",
    desc: "Slam kills grant a one-hit shield that fully blocks the next hit (max 2).",
    apply: ({ player, mods }) => { mods.slamShield = true; player.maxShield = CONFIG.resilience.maxShield; },
    tiers: [
      { desc: "Hold up to 3 shields, and perfect-parry kills grant them too.", apply: ({ player, mods }) => { CONFIG.resilience.maxShield = 3; player.maxShield = 3; mods.aegisParry = true; } },
      { desc: "Hold up to 4 — and a shield erupts in a shockwave when it breaks.", apply: ({ player, mods }) => { CONFIG.resilience.maxShield = 4; player.maxShield = 4; mods.shieldBurst = true; } },
    ] },

  // ---- skill-expression abilities ----
  { id: "phase_step", name: "Phase Step", unique: true, cat: "parry",
    desc: "Dash through an enemy shot to deflect it — turn defense into offense.",
    apply: ({ mods }) => { mods.phaseStep = true; } },
  { id: "crater", name: "Crater", unique: true, cat: "offense",
    desc: "Power Slams erupt in a shockwave that grows with your descent speed.",
    apply: ({ mods }) => { mods.crater = true; } },
  { id: "aerial_rave", name: "Aerial Rave", unique: true, cat: "offense",
    desc: "The longer you stay airborne, the harder your swings hit (up to +50%).",
    apply: ({ mods }) => { mods.aerialRave = 0.25; },
    tiers: [
      { desc: "Ramps faster, up to +80% airborne.", apply: ({ mods }) => { mods.aerialRave = 0.42; CONFIG.skill.aerialRaveCap = 0.8; } },
      { desc: "A storm in the air — ramps to +130%.", apply: ({ mods }) => { mods.aerialRave = 0.6; CONFIG.skill.aerialRaveCap = 1.3; } },
    ] },

  { id: "seismic_slam", name: "Seismic Slam", unique: true, cat: "offense", desc: "Slams blast nearby enemies for 22.",
    apply: ({ mods }) => { mods.onSlam.push((ev) => { ev.dealAoE(ev.x, ev.y, 130, 22); ev.fx.explode(ev.x, ev.y, CONFIG.colors.slam, 0.9); }); } },
  { id: "detonate", name: "Detonate", unique: true, cat: "offense", desc: "Kills explode for 18 to nearby foes.",
    apply: ({ mods }) => { mods.onKill.push((ev) => { ev.dealAoE(ev.x, ev.y, 120, 18); ev.fx.explode(ev.x, ev.y, CONFIG.colors.bomber, 0.7); }); } },
  { id: "adrenaline", name: "Adrenaline", unique: true, cat: "mobility", desc: "Kills instantly refresh your dash.",
    apply: ({ mods }) => { mods.onKill.push((ev) => { ev.player.dashCd = 0; }); } },

  // (Razor Momentum) per-pierce ramp, capped in the combat loop so it can't snowball
  { id: "throw_momentum", name: "Razor Momentum", unique: true, cat: "throw",
    desc: "A thrown blade grows faster & stronger with every enemy it pierces.",
    apply: ({ mods }) => { mods.throwRamp = 0.1; },
    tiers: [
      { desc: "Ramps harder with every pierce.", apply: ({ mods }) => { mods.throwRamp = 0.18; } },
      { desc: "A relentless snowball — and each pierce briefly STUNS its target.", apply: ({ mods }) => { mods.throwRamp = 0.26; mods.razorStun = true; } },
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
    desc: "The returning blade tears through enemies for +85% damage.",
    apply: ({ mods }) => { mods.stormRecall = true; },
    tiers: [
      { desc: "The returning blade hits for +140%.", apply: ({ mods }) => { mods.stormMult = 2.4; } },
      { desc: "+200% on the way home — and catching it releases a shockwave.", apply: ({ mods }) => { mods.stormMult = 3.0; mods.stormBurst = true; } },
    ] },
  { id: "phantom_dash", name: "Phantom Dash", unique: true, cat: "mobility",
    desc: "Dashing slices enemies you pass through (great while unarmed).",
    apply: ({ mods }) => { mods.phantomDash = 26; },
    tiers: [
      { desc: "The phase-slice cuts much deeper.", apply: ({ mods }) => { mods.phantomDash = 44; } },
      { desc: "A killing phase-slice instantly refreshes your dash — chain through a crowd.", apply: ({ mods }) => { mods.phantomDash = 64; mods.phantomRefund = true; } },
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
  { id: "backfire", name: "Backfire", unique: false, cat: "parry", desc: "Your reflected shots STUN the enemies they strike.",
    apply: ({ mods }) => { mods.parryStun = true; } },
  { id: "tailwind", name: "Tailwind", unique: false, cat: "mobility", desc: "Higher jump and sharper air control.",
    apply: () => { CONFIG.player.jumpSpeed *= 1.05; CONFIG.player.airAccel *= 1.16; } },
  { id: "kinetic", name: "Kinetic Charge", unique: false, cat: "mobility", desc: "+9% dash distance, and longer dash i-frames.",
    apply: () => { CONFIG.dash.speed *= 1.09; CONFIG.dash.iframe *= 1.16; } },
  { id: "bulwark", name: "Bulwark", unique: false, cat: "resilience", desc: "Recover an extra 10 HP each time you clear a wave.",
    apply: ({ mods }) => { mods.waveHeal += 10; } },
  { id: "showtime", name: "Showtime", unique: false, cat: "utility", desc: "Your trick meter lingers — it drains 25% slower.",
    apply: () => { CONFIG.trick.decay *= 1.3; CONFIG.trick.drainRate *= 0.8; } },
  { id: "fortune", name: "Fortune", unique: false, cat: "utility", desc: "+18% coins earned this run.",
    apply: () => { CONFIG.run.coinMult *= 1.18; } },

  // ===== more SPECIAL abilities (tiered; keep every combat category at 3+) =====
  // --- OFFENSE ---
  { id: "rupture", name: "Rupture", unique: true, cat: "offense",
    desc: "Your cuts inflict BLEED — a stacking wound that drains enemies over time.",
    apply: ({ mods }) => { mods.bleedHit = 1; mods.onHit.push((ev) => { if (mods.bleedHit && ev.enemy && ev.enemy.applyBleed) ev.enemy.applyBleed(mods.bleedHit); }); },
    tiers: [
      { desc: "Cuts apply 2 stacks, and a Power Slam DETONATES all nearby bleed at once — a wet burst.", apply: ({ mods }) => { mods.bleedHit = 2; mods.bleedDetonate = true; } },
      { desc: "RUPTURE — an enemy that dies while bleeding bursts, splashing its bleed onto everything near it.", apply: ({ mods }) => { mods.bleedHit = 3; mods.bleedNova = true; } },
    ] },
  { id: "sunder", name: "Sunder", unique: true, cat: "offense",
    desc: "Your hits MARK enemies — a marked foe takes +30% damage from EVERYTHING for 4s.",
    apply: ({ mods }) => { mods.sunderHit = true; mods.onHit.push((ev) => {
      const e = ev.enemy; if (!mods.sunderHit || !e || !e.applyMark) return;
      if (mods.sunderSpread && e.markT > 0) for (const o of ev.enemies) { if (o !== e && !o.dead && o.applyMark && len(o.x - e.x, o.y - e.y) < 150) o.applyMark(); }
      e.applyMark();
      if (mods.sunderShatter && e.cfg && e.cfg.breakSpeed && !e.enraged) { e.enraged = true; e.stun = Math.max(e.stun, 0.5); }
    }); },
    tiers: [
      { desc: "The weakness bites deeper (+40%), and marking an armored foe instantly SHATTERS its guard.", apply: ({ mods }) => { CONFIG.status.markMult = 1.40; mods.sunderShatter = true; } },
      { desc: "Strike a marked enemy and the mark SPREADS to all nearby — unravel the whole crowd.", apply: ({ mods }) => { CONFIG.status.markMult = 1.50; mods.sunderSpread = true; } },
    ] },
  // --- THROW ---
  { id: "impale", name: "Impale", unique: true, cat: "throw",
    desc: "A thrown blade PINS the enemy it strikes in place and buries deep BLEED in the wound.",
    apply: ({ mods }) => { mods.impale = 3; },
    tiers: [
      { desc: "It now pins EVERY enemy it pierces — skewer a whole line in place.", apply: ({ mods }) => { mods.impale = 4; mods.impaleAll = true; } },
      { desc: "The returning blade RIPS the wounds open, detonating all bleed it tears back through.", apply: ({ mods }) => { mods.impale = 5; mods.impaleRecall = true; } },
    ] },
  // --- PARRY ---
  { id: "tempo", name: "Tempo", unique: true, cat: "parry",
    desc: "A perfect parry grants TEMPO: +25% damage and faster movement for 4s, and refreshes your dash.",
    apply: ({ mods }) => { mods.tempo = 0.25; mods.onParry.push((ev) => { const p = ev.player; p.tempoStk = Math.min(mods.tempoMax, (p.tempoT > 0 ? p.tempoStk : 0) + 1); p.tempoT = 4; p.dashCd = 0; p.dashCharges = p.maxDashCharges; }); },
    tiers: [
      { desc: "Tempo lasts 6s and STACKS up to 2 — chain parries into a storm of speed and force.", apply: ({ mods }) => { mods.tempo = 0.3; mods.tempoMax = 2; } },
      { desc: "A perfect parry now plunges the room into a deep, lingering slow-mo — bullet-time the kill.", apply: ({ mods }) => { mods.tempo = 0.34; mods.tempoSurge = true; } },
    ] },
  { id: "backlash", name: "Backlash", unique: true, cat: "parry",
    desc: "A perfect parry erupts in a COUNTER-SHOCK — damage + stun to everything around you.",
    apply: ({ mods }) => { mods.backlash = 26; mods.onParry.push((ev) => {
      if (!mods.backlash) return;
      const r = mods.backlashSurge ? 250 : 175;
      ev.dealAoE(ev.x, ev.y, r, mods.backlash);
      for (const e of ev.enemies) { if (!e.dead && len(e.x - ev.x, e.y - ev.y) < r) { if (!e.isBoss) e.stun = Math.max(e.stun, mods.backlashSurge ? 1.1 : 0.55); if (mods.backlashMark && e.applyMark) e.applyMark(); } }
      ev.fx.ring(ev.x, ev.y, mods.backlashSurge ? 16 : 11, CONFIG.colors.perfect);
      if (mods.backlashSurge) ev.player.iframe = Math.max(ev.player.iframe, 1.0);
    }); },
    tiers: [
      { desc: "A bigger shock (44) that also MARKS everyone it catches — soften the crowd for the kill.", apply: ({ mods }) => { mods.backlash = 44; mods.backlashMark = true; } },
      { desc: "A devastating blast (70), and the parry leaves you INVULNERABLE for a beat.", apply: ({ mods }) => { mods.backlash = 70; mods.backlashSurge = true; } },
    ] },
  // --- MOBILITY ---
  { id: "cinder", name: "Cinder Trail", unique: true, cat: "mobility",
    desc: "Dashing ignites every enemy you pass through — they BURN for damage over time.",
    apply: ({ mods }) => { mods.cinder = true; },
    tiers: [
      { desc: "The flames burn hotter and longer, and the burn now also SLOWS what it scorches.", apply: ({ mods }) => { CONFIG.status.burnDps = 30; CONFIG.status.burnDur = 3.4; mods.cinderSlow = true; } },
      { desc: "PYRE — a burning enemy that dies erupts, igniting everything nearby. Chain the inferno.", apply: ({ mods }) => { CONFIG.status.burnDps = 34; mods.cinderNova = true; } },
    ] },
  { id: "concussive", name: "Concussive Dash", unique: true, cat: "mobility",
    desc: "When a dash ends it slams out a shockwave — damage + knockback to everything close.",
    apply: ({ mods }) => { mods.concussive = 24; },
    tiers: [
      { desc: "A heavier shock (42) that briefly STUNS — dash in, lock them down, swing.", apply: ({ mods }) => { mods.concussive = 42; mods.concStun = true; } },
      { desc: "A dash whose shock catches 2+ enemies REFUNDS itself — blink through the horde.", apply: ({ mods }) => { mods.concussive = 60; mods.concRefund = true; } },
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
  const pool = UPGRADES
    .filter((u) => !(u.unique && owned[u.id]))
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
    const specials = UPGRADES.filter((u) => u.tiers && !owned[u.id] && !out.includes(u));
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
