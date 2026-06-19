// ------- enemy variants: distinct "evolutions" of each base family -------
// The ~35 named foes from the design docs don't need 35 classes. A FAMILY defines
// the verbs (Charger comes at you, Ranged makes you come to it, Flyer owns the air);
// a VARIANT reshapes those verbs into a distinct threat; AFFIXES (affixes.js) then
// tint/scale on top. So "Swift Armed Stalker" late-game reads nothing like a wave-1
// Charger, with no combinatorial class explosion.
//
// Each variant sets e.behavior (the AI branch its family.update() switches on) plus
// light stat tweaks. Variants are weighted and gated by wave so the roster unfolds
// as a run/campaign progresses.

const VARIANTS = {
  charger: [
    { id: "bull",    name: "Charger", weight: 1.0,             apply: (e) => { e.behavior = "bull"; } },
    { id: "brawler", name: "Brawler", weight: 0.8, minWave: 2, apply: (e) => { e.behavior = "brawler"; e.contactReach = Math.max(e.contactReach, 10); } },
    { id: "stalker", name: "Stalker", weight: 0.7, minWave: 4, apply: (e) => { e.behavior = "stalker"; e.speedMult *= 1.3; e.hp *= 0.78; e.maxHp *= 0.78; } },
  ],
  ranged: [
    { id: "sentinel", name: "Sentinel", weight: 1.0,             apply: (e) => { e.behavior = "sentinel"; } },
    { id: "rifleman", name: "Rifleman", weight: 0.8, minWave: 3, apply: (e) => { e.behavior = "rifleman"; } },
    { id: "marksman", name: "Marksman", weight: 0.6, minWave: 5, apply: (e) => { e.behavior = "marksman"; e.hp *= 1.1; e.maxHp *= 1.1; } },
  ],
  flyer: [
    { id: "swooper",    name: "Flyer",       weight: 1.0,             apply: (e) => { e.behavior = "swoop"; } },
    { id: "divebomber", name: "Dive Bomber", weight: 0.8, minWave: 3, apply: (e) => { e.behavior = "divebomb"; } },
    { id: "highdiver",  name: "Swooper",     weight: 0.6, minWave: 5, apply: (e) => { e.behavior = "highdive"; } },
  ],
  // bomber / armored keep their baseline behavior for now (Round 4b reworks hazards);
  // an empty/absent list just means "no variant, use the family default".
};

// weighted pick among the eligible variants for a kind at this wave
function rollVariant(kind, wave) {
  const list = (VARIANTS[kind] || []).filter((v) => !v.minWave || wave >= v.minWave);
  if (!list.length) return null;
  let total = 0; for (const v of list) total += v.weight;
  let r = Math.random() * total;
  for (const v of list) { if ((r -= v.weight) <= 0) return v; }
  return list[0];
}

function applyVariant(e, v) {
  if (!v) return;
  e.variant = v.id;
  e.variantName = v.name;
  v.apply(e);
}
