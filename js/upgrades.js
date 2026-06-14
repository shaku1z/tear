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
    tempest: false,       // empowered uppercut launches nearby enemies too
    stormRecall: false,   // the returning blade deals heavy damage
    phantomDash: 0,       // dash damages enemies you pass through (dmg amount)
    berserk: false,       // +30% damage while below half HP
  };
}

const UPGRADES = [
  // ===== stackable upgrades =====
  { id: "vitality", name: "Vitality", unique: false, desc: "+30 max HP, and heal 30.",
    apply: ({ player }) => { player.maxHp += 30; player.heal(30); } },
  { id: "keen_edge", name: "Keen Edge", unique: false, desc: "+18% swing damage.",
    apply: () => { CONFIG.blade.damageScale *= 1.18; CONFIG.blade.maxDamage = Math.round(CONFIG.blade.maxDamage * 1.12); } },
  { id: "fleet", name: "Fleet Foot", unique: false, desc: "+8% move speed, higher jump.",
    apply: () => { CONFIG.player.moveSpeed *= 1.08; CONFIG.player.jumpSpeed *= 1.03; } },
  { id: "quick_recovery", name: "Quick Recovery", unique: false, desc: "-18% dash cooldown.",
    apply: () => { CONFIG.dash.cooldown *= 0.82; } },
  { id: "long_reach", name: "Long Reach", unique: false, desc: "+ blade reach and length.",
    apply: () => { CONFIG.blade.aimRadius += 18; CONFIG.blade.length += 8; CONFIG.blade.maxReach += 18; } },
  { id: "heavy_swing", name: "Heavy Swing", unique: false, desc: "+25% knockback, stronger launches.",
    apply: () => { CONFIG.enemy.knockbackTaken *= 1.25; CONFIG.ranged.knockbackTaken *= 1.25; CONFIG.blade.launchPower *= 1.12; } },
  { id: "deadly_throw", name: "Deadly Throw", unique: false, desc: "+25% thrown-blade damage.",
    apply: () => { CONFIG.blade.throw.damage *= 1.25; CONFIG.blade.throw.damageFromSpeed *= 1.2; } },
  { id: "harvest", name: "Harvest", unique: false, desc: "Each kill heals 6 HP.",
    apply: ({ mods }) => { mods.onKill.push((ev) => ev.player.heal(6)); } },
  { id: "vampiric", name: "Vampiric Edge", unique: false, desc: "Swing hits heal 1 HP.",
    apply: ({ mods }) => { mods.onHit.push((ev) => ev.player.heal(1)); } },
  { id: "riposte", name: "Riposte", unique: false, desc: "Perfect parry heals 12 HP.",
    apply: ({ mods }) => { mods.onParry.push((ev) => ev.player.heal(12)); } },
  { id: "featherblade", name: "Featherblade", unique: false, desc: "Swings deal damage at lower speeds.",
    apply: () => { CONFIG.blade.minHitSpeed *= 0.85; } },
  { id: "tough_hide", name: "Tough Hide", unique: false, desc: "Take 15% less damage.",
    apply: () => { CONFIG.player.dmgTakenMult *= 0.85; } },
  { id: "burst_dash", name: "Burst Dash", unique: false, desc: "Dash is faster and travels farther.",
    apply: () => { CONFIG.dash.speed *= 1.1; CONFIG.dash.duration *= 1.04; } },
  { id: "bounty", name: "Bounty Hunter", unique: false, desc: "+20% score from kills.",
    apply: () => { CONFIG.run.scoreMult *= 1.2; } },
  { id: "glass_cannon", name: "Glass Cannon", unique: false, desc: "+25% swing damage, but -12 max HP.",
    apply: ({ player }) => {
      CONFIG.blade.damageScale *= 1.25; CONFIG.blade.maxDamage = Math.round(CONFIG.blade.maxDamage * 1.25);
      player.maxHp = Math.max(20, player.maxHp - 12); player.hp = Math.min(player.hp, player.maxHp);
    } },

  // ===== unique abilities =====
  { id: "seismic_slam", name: "Seismic Slam", unique: true, desc: "Slams blast nearby enemies for 22.",
    apply: ({ mods }) => { mods.onSlam.push((ev) => { ev.dealAoE(ev.x, ev.y, 130, 22); ev.fx.ring(ev.x, ev.y, 10); }); } },
  { id: "detonate", name: "Detonate", unique: true, desc: "Kills explode for 18 to nearby foes.",
    apply: ({ mods }) => { mods.onKill.push((ev) => { ev.dealAoE(ev.x, ev.y, 120, 18); ev.fx.ring(ev.x, ev.y, 8); }); } },
  { id: "adrenaline", name: "Adrenaline", unique: true, desc: "Kills instantly refresh your dash.",
    apply: ({ mods }) => { mods.onKill.push((ev) => { ev.player.dashCd = 0; }); } },

  { id: "throw_momentum", name: "Razor Momentum", unique: true,
    desc: "A thrown blade grows faster & stronger with every enemy it pierces.",
    apply: ({ mods }) => { mods.throwRamp = 0.18; } },
  { id: "throw_giant", name: "Greatblade", unique: true,
    desc: "The blade becomes huge while thrown (normal size in hand).",
    apply: ({ blade }) => { blade.throwSizeMult = 1.7; } },
  { id: "parry_pierce", name: "Piercing Parry", unique: true,
    desc: "Parried projectiles pierce through every enemy.",
    apply: ({ mods }) => { mods.deflectPierce = true; } },
  { id: "parry_split", name: "Scatter Parry", unique: true,
    desc: "Parried projectiles split into 3 that ricochet up to 3 times.",
    apply: ({ mods }) => { mods.deflectSplit = true; } },

  { id: "tempest", name: "Tempest", unique: true,
    desc: "Rising uppercuts also launch all nearby enemies skyward.",
    apply: ({ mods }) => { mods.tempest = true; } },
  { id: "storm_recall", name: "Storm Recall", unique: true,
    desc: "The returning blade tears through enemies for double damage.",
    apply: ({ mods }) => { mods.stormRecall = true; } },
  { id: "phantom_dash", name: "Phantom Dash", unique: true,
    desc: "Dashing slices enemies you pass through (great while unarmed).",
    apply: ({ mods }) => { mods.phantomDash = 26; } },
  { id: "boomerang", name: "Boomerang", unique: true,
    desc: "Recall the thrown blade from any distance.",
    apply: ({ blade }) => { blade.freeRecall = true; } },
  { id: "berserk", name: "Berserker", unique: true,
    desc: "+30% damage while below half HP.",
    apply: ({ mods }) => { mods.berserk = true; } },
];

// roll N distinct choices; unique abilities already owned are excluded
function rollUpgrades(n, mods) {
  const pool = UPGRADES.filter((u) => !(u.unique && mods && mods.owned[u.id]));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

function applyUpgrade(up, ctx) {
  ctx.mods.owned[up.id] = (ctx.mods.owned[up.id] || 0) + 1;
  ctx.mods.ownedList.push(up.id);
  up.apply(ctx);
}
