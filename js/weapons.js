// ------- interchangeable weapons (one per run, chosen at setup) -------
// WEAPON CONTRACT (Weapons WA1). A weapon is data + optional behaviour hooks. The
// Blade owns shared physics/state (held | flying | returning | embedded); a weapon
// contributes: base feel (applyPhysics), a damage-quality metric, throw-lifecycle
// hooks, and selection metadata. Every hook is OPTIONAL — the shared Blade path is
// the default, so Sword/Hammer behave exactly as before until a hook overrides.
//
// Hooks the shared systems look for (all optional, called only if present):
//   applyPhysics()                 -> mutate CONFIG.blade for this weapon's feel (was `apply`)
//   qualityMetric(blade)           -> 0..1 hit-quality (default: blade.sliceQuality())
//   onThrowLaunch(ctx)             -> the throw just left the hand
//   onThrowHit(ctx)                -> the thrown weapon hit an enemy (ctx.enemy)
//   onWorldImpact(ctx)             -> the thrown weapon hit terrain (embed / explode / etc.)
//   onReturnHit(ctx)              -> the returning weapon hit an enemy
//   onSecondaryThrowAction(ctx)    -> the throw's second action fired (recall / detonate / yank)
//   onCatch(ctx)                   -> the weapon returned to hand
// Normalized throw CHANNELS (data) let universal upgrades tune every weapon without
// knowing which one is equipped — see `channels` below.
const WEAPONS = [
  {
    id: "sword", name: "Sword", throwType: "pierce", model: "sword",
    blurb: "Balanced all-rounder. Throw pierces foes and embeds in walls.",
    // ---- selection metadata (weapon-select UI) ----
    playstyle: "Control, parries, and consistency.",
    description: "Responsive and precise. Clean cuts and perfect recalls reward technical play.",
    tags: ["Precision", "Parry", "Recall"],
    ratings: { handling: 5, impact: 3, reach: 3, difficulty: 2 },
    // ---- normalized throw channels (universal upgrades scale these) ----
    channels: { throwPower: 1, throwSpeed: 1, remoteRange: 1, secondaryPower: 1, returnSpeed: 1, controlDuration: 1 },
    applyPhysics: () => {},   // default = base config
  },
  {
    id: "hammer", name: "Hammer", throwType: "lob", model: "hammer",
    blurb: "Slow & heavy: massive damage and launches, shorter reach. Throw lobs a shockwave.",
    playstyle: "Impact, control, and destruction.",
    description: "Slow and devastating. Break armor, launch crowds, and turn throws into seismic impacts.",
    tags: ["Break", "Slam", "Crowd"],
    ratings: { handling: 3, impact: 5, reach: 2, difficulty: 3 },
    channels: { throwPower: 1.4, throwSpeed: 0.85, remoteRange: 1, secondaryPower: 1, returnSpeed: 0.85, controlDuration: 1 },
    applyPhysics: () => {
      const B = CONFIG.blade;
      B.springStiffness *= 0.7;   // laggier = heavier
      B.damping *= 1.12;
      B.gravity *= 1.6;           // droops, feels weighty
      B.length += 12;
      B.aimRadius -= 8;
      B.maxReach += 12;
      B.damageScale *= 1.7;       // hits much harder
      B.maxDamage = Math.round(B.maxDamage * 1.7);
      B.minHitSpeed *= 1.2;       // needs a committed swing
      B.slamMultiplier *= 1.25;
      B.launchPower *= 1.4;
      B.throw.speed *= 0.85;
      B.throw.damage *= 1.4;
    },
  },
];

function getWeapon(id) { return WEAPONS.find((x) => x.id === id) || WEAPONS[0]; }

// Equip a weapon: run its physics setup and return the full weapon object so the
// caller can store it (game keeps `run.weapon` / `blade.weapon`) and dispatch hooks.
function applyWeapon(id) {
  const w = getWeapon(id);
  // back-compat: older defs used `apply`; the contract uses `applyPhysics`.
  const phys = w.applyPhysics || w.apply;
  if (phys) phys();
  return w;
}
