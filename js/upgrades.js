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
    // ---- ability tiers (evolved on boss kills) ----
    tier: {},             // id -> current tier (1 when acquired, up to 3)
    stormMult: 1.85,      // Storm Recall multiplier (raised by its tiers)
    killHeal: 0,          // Bloodrite T3: heal on any kill
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
  { id: "quick_recovery", name: "Quick Recovery", unique: false, cat: "mobility", desc: "-18% dash cooldown.",
    apply: () => { CONFIG.dash.cooldown *= 0.82; } },
  { id: "long_reach", name: "Long Reach", unique: false, cat: "utility", desc: "+ blade reach and length.",
    apply: () => { CONFIG.blade.aimRadius += 18; CONFIG.blade.length += 8; CONFIG.blade.maxReach += 18; } },
  { id: "heavy_swing", name: "Heavy Swing", unique: false, cat: "offense", desc: "+25% knockback, stronger launches.",
    apply: () => { CONFIG.enemy.knockbackTaken *= 1.25; CONFIG.ranged.knockbackTaken *= 1.25; CONFIG.blade.launchPower *= 1.10; } },
  { id: "deadly_throw", name: "Deadly Throw", unique: false, cat: "throw", desc: "+10% thrown-blade damage.",
    apply: () => { CONFIG.blade.throw.damage *= 1.10; CONFIG.blade.throw.damageFromSpeed *= 1.08; } },
  { id: "vampiric", name: "Vampiric Edge", unique: false, cat: "resilience", desc: "Swings trickle back a sliver of HP (once per swing).",
    apply: ({ mods }) => { mods.lifesteal += CONFIG.resilience.lifestealPerSwing; } },
  { id: "air_superiority", name: "Air Superiority", unique: false, cat: "offense", desc: "+15% damage while airborne.",
    apply: ({ mods }) => { mods.airBonus += 0.15; } },
  { id: "tough_hide", name: "Tough Hide", unique: false, cat: "resilience", desc: "Take 12% less damage.",
    apply: () => { CONFIG.player.dmgTakenMult *= 0.88; } },
  { id: "burst_dash", name: "Burst Dash", unique: false, cat: "mobility", desc: "Dash is faster and travels farther.",
    apply: () => { CONFIG.dash.speed *= 1.1; CONFIG.dash.duration *= 1.04; } },
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
    apply: ({ mods }) => { mods.bloodrite = true; mods.onKill.push((ev) => { if (ev.cause === "skill") ev.player.heal(CONFIG.resilience.bloodriteHeal); }); },
    tiers: [
      { desc: "Skill kills restore much more HP.", apply: () => { CONFIG.resilience.bloodriteHeal = 14; } },
      { desc: "Even more — and EVERY kill trickles HP back.", apply: ({ mods }) => { CONFIG.resilience.bloodriteHeal = 20; mods.killHeal = 3; mods.onKill.push((ev) => { if (ev.cause !== "skill") ev.player.heal(mods.killHeal); }); } },
    ] },
  { id: "riposte", name: "Riposte", unique: true, cat: "parry",
    desc: "After a perfect parry, take 60% less damage for 1.2s.",
    apply: ({ mods }) => { mods.parryGuard = true; },
    tiers: [
      { desc: "The guard lasts longer and cuts 75% of damage.", apply: () => { CONFIG.resilience.parryGuardTime = 1.8; CONFIG.resilience.parryGuardMult = 0.25; } },
      { desc: "A perfect parry makes you briefly INVINCIBLE.", apply: () => { CONFIG.resilience.parryGuardTime = 2.2; CONFIG.resilience.parryGuardMult = 0.0; } },
    ] },
  { id: "flow_guard", name: "Flow Guard", unique: true, cat: "resilience",
    desc: "Take 30% less damage while your trick rank is BRUTAL or higher.",
    apply: ({ mods }) => { mods.flowGuard = true; },
    tiers: [
      { desc: "45% less damage while BRUTAL+.", apply: () => { CONFIG.resilience.flowGuardMult = 0.55; } },
      { desc: "Protection starts at STYLISH, and is stronger.", apply: () => { CONFIG.resilience.flowGuardMult = 0.5; CONFIG.resilience.flowGuardTier = 2; } },
    ] },
  { id: "aegis", name: "Aegis", unique: true, cat: "resilience",
    desc: "Slam kills grant a one-hit shield that fully blocks the next hit (max 2).",
    apply: ({ player, mods }) => { mods.slamShield = true; player.maxShield = CONFIG.resilience.maxShield; },
    tiers: [
      { desc: "Hold up to 3 shields.", apply: ({ player }) => { CONFIG.resilience.maxShield = 3; player.maxShield = 3; } },
      { desc: "Hold up to 4 shields.", apply: ({ player }) => { CONFIG.resilience.maxShield = 4; player.maxShield = 4; } },
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
      { desc: "Ramps faster, up to +70%.", apply: ({ mods }) => { mods.aerialRave = 0.4; CONFIG.skill.aerialRaveCap = 0.7; } },
      { desc: "Even faster, up to +100% airborne.", apply: ({ mods }) => { mods.aerialRave = 0.55; CONFIG.skill.aerialRaveCap = 1.0; } },
    ] },

  { id: "seismic_slam", name: "Seismic Slam", unique: true, cat: "offense", desc: "Slams blast nearby enemies for 22.",
    apply: ({ mods }) => { mods.onSlam.push((ev) => { ev.dealAoE(ev.x, ev.y, 130, 22); ev.fx.ring(ev.x, ev.y, 10); }); } },
  { id: "detonate", name: "Detonate", unique: true, cat: "offense", desc: "Kills explode for 18 to nearby foes.",
    apply: ({ mods }) => { mods.onKill.push((ev) => { ev.dealAoE(ev.x, ev.y, 120, 18); ev.fx.ring(ev.x, ev.y, 8); }); } },
  { id: "adrenaline", name: "Adrenaline", unique: true, cat: "mobility", desc: "Kills instantly refresh your dash.",
    apply: ({ mods }) => { mods.onKill.push((ev) => { ev.player.dashCd = 0; }); } },

  // (Razor Momentum) per-pierce ramp, capped in the combat loop so it can't snowball
  { id: "throw_momentum", name: "Razor Momentum", unique: true, cat: "throw",
    desc: "A thrown blade grows faster & stronger with every enemy it pierces.",
    apply: ({ mods }) => { mods.throwRamp = 0.1; },
    tiers: [
      { desc: "Ramps harder with every pierce.", apply: ({ mods }) => { mods.throwRamp = 0.16; } },
      { desc: "A relentless snowball.", apply: ({ mods }) => { mods.throwRamp = 0.22; } },
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
      { desc: "The returning blade hits for +130%.", apply: ({ mods }) => { mods.stormMult = 2.3; } },
      { desc: "A devastating +180% on the way home.", apply: ({ mods }) => { mods.stormMult = 2.8; } },
    ] },
  { id: "phantom_dash", name: "Phantom Dash", unique: true, cat: "mobility",
    desc: "Dashing slices enemies you pass through (great while unarmed).",
    apply: ({ mods }) => { mods.phantomDash = 26; },
    tiers: [
      { desc: "The phase-slice cuts much deeper.", apply: ({ mods }) => { mods.phantomDash = 42; } },
      { desc: "A devastating phase-slice.", apply: ({ mods }) => { mods.phantomDash = 60; } },
    ] },
  { id: "boomerang", name: "Boomerang", unique: true, cat: "throw",
    desc: "Recall the thrown blade from any distance.",
    apply: ({ blade }) => { blade.freeRecall = true; } },
  { id: "berserk", name: "Berserker", unique: true, cat: "offense",
    desc: "+25% damage while below half HP.",
    apply: ({ mods }) => { mods.berserk = true; } },
];

// roll N distinct choices; owned unique abilities are excluded, and uniques are
// weighted to appear less often than stackable upgrades.
function rollUpgrades(n, mods) {
  const pool = UPGRADES
    .filter((u) => !(u.unique && mods && mods.owned[u.id]))
    .map((u) => ({ u, w: u.rare ? 0.18 : (u.unique ? 0.4 : 1) }));
  const out = [];
  while (out.length < n && pool.length) {
    let total = 0; for (const e of pool) total += e.w;
    let r = Math.random() * total, idx = 0;
    for (let i = 0; i < pool.length; i++) { if ((r -= pool[i].w) <= 0) { idx = i; break; } }
    out.push(pool.splice(idx, 1)[0].u);
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
