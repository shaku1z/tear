// ------- interchangeable weapons (one per run, chosen at setup) -------
// Each weapon: apply() mutates CONFIG.blade for its swing feel/damage, and a
// throwType the combat loop branches on. Applied at run start (after the config
// reset, before shop/upgrade bonuses stack on top).
const WEAPONS = [
  {
    id: "sword", name: "Sword", throwType: "pierce",
    blurb: "Balanced all-rounder. Throw pierces foes and embeds in walls.",
    apply: () => {},   // default = base config
  },
  {
    id: "hammer", name: "Hammer", throwType: "lob",
    blurb: "Slow & heavy: massive damage and launches, shorter reach. Throw lobs a shockwave.",
    apply: () => {
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

function applyWeapon(id) {
  const w = WEAPONS.find((x) => x.id === id) || WEAPONS[0];
  w.apply();
  return w;
}
