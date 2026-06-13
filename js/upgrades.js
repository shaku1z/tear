// ------- draft upgrades: stat boosts + on-action effects -------
// Stat upgrades mutate CONFIG (read live by gameplay) and/or the live player.
// Effect upgrades push handlers into `mods` hook arrays, fired by the game loop
// with an `ev` object: { player, x, y, enemy, enemies, fx, dealAoE(x,y,r,dmg), addFloater }.

function newMods() {
  return {
    onHit: [], onKill: [], onParry: [], onSlam: [],
    owned: {},      // id -> count
    ownedList: [],  // order picked (for display)
  };
}

const UPGRADES = [
  // ---- stat boosts ----
  {
    id: "vitality", name: "Vitality", kind: "stat",
    desc: "+30 max HP, and heal 30.",
    apply: ({ player }) => { player.maxHp += 30; player.heal(30); },
  },
  {
    id: "keen_edge", name: "Keen Edge", kind: "stat",
    desc: "+18% swing damage.",
    apply: () => { CONFIG.blade.damageScale *= 1.18; CONFIG.blade.maxDamage = Math.round(CONFIG.blade.maxDamage * 1.12); },
  },
  {
    id: "fleet", name: "Fleet Foot", kind: "stat",
    desc: "+8% move speed, higher jump.",
    apply: () => { CONFIG.player.moveSpeed *= 1.08; CONFIG.player.jumpSpeed *= 1.03; },
  },
  {
    id: "quick_recovery", name: "Quick Recovery", kind: "stat",
    desc: "-18% dash cooldown.",
    apply: () => { CONFIG.dash.cooldown *= 0.82; },
  },
  {
    id: "long_reach", name: "Long Reach", kind: "stat",
    desc: "+ blade reach and length.",
    apply: () => { CONFIG.blade.aimRadius += 18; CONFIG.blade.length += 8; CONFIG.blade.maxReach += 18; },
  },
  {
    id: "heavy_swing", name: "Heavy Swing", kind: "stat",
    desc: "+25% knockback, stronger launches.",
    apply: () => { CONFIG.enemy.knockbackTaken *= 1.25; CONFIG.ranged.knockbackTaken *= 1.25; CONFIG.blade.launchPower *= 1.12; },
  },
  {
    id: "deadly_throw", name: "Deadly Throw", kind: "stat",
    desc: "+25% thrown-blade damage.",
    apply: () => { CONFIG.blade.throw.damage *= 1.25; CONFIG.blade.throw.damageFromSpeed *= 1.2; },
  },

  // ---- on-action effects ----
  {
    id: "parry_leech", name: "Riposte", kind: "effect",
    desc: "Perfect parry heals 12 HP.",
    apply: ({ mods }) => { mods.onParry.push((ev) => ev.player.heal(12)); },
  },
  {
    id: "harvest", name: "Harvest", kind: "effect",
    desc: "Each kill heals 6 HP.",
    apply: ({ mods }) => { mods.onKill.push((ev) => ev.player.heal(6)); },
  },
  {
    id: "vampiric", name: "Vampiric Edge", kind: "effect",
    desc: "Swing hits heal 1 HP.",
    apply: ({ mods }) => { mods.onHit.push((ev) => ev.player.heal(1)); },
  },
  {
    id: "seismic_slam", name: "Seismic Slam", kind: "effect",
    desc: "Slams blast nearby enemies for 22.",
    apply: ({ mods }) => {
      mods.onSlam.push((ev) => { ev.dealAoE(ev.x, ev.y, 130, 22); ev.fx.ring(ev.x, ev.y, 10); });
    },
  },
  {
    id: "detonate", name: "Detonate", kind: "effect",
    desc: "Kills explode for 18 to nearby foes.",
    apply: ({ mods }) => {
      mods.onKill.push((ev) => { ev.dealAoE(ev.x, ev.y, 120, 18); ev.fx.ring(ev.x, ev.y, 8); });
    },
  },
  {
    id: "adrenaline", name: "Adrenaline", kind: "effect",
    desc: "Kills instantly refresh your dash.",
    apply: ({ mods }) => { mods.onKill.push((ev) => { ev.player.dashCd = 0; ev.player.dashTimer = Math.min(ev.player.dashTimer, 0); }); },
  },
];

// roll N distinct upgrade choices for a draft
function rollUpgrades(n) {
  const pool = UPGRADES.slice();
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

function applyUpgrade(up, ctx) {
  ctx.mods.owned[up.id] = (ctx.mods.owned[up.id] || 0) + 1;
  ctx.mods.ownedList.push(up.id);
  up.apply(ctx);
}
