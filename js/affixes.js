// ------- enemy affixes / variants (color-tinted) -------
// Base enemies roll 0-3 affixes (frequent & chaotic, scaling with the wave). Each
// affix mutates the instance's stats/behavior; the enemy's color is tinted toward
// the affixes it carries so you can read the threat.

function blendHex(a, b, t) {
  const pa = parseInt(a.replace("#", ""), 16), pb = parseInt(b.replace("#", ""), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t) & 255;
  const g = Math.round(ag + (bg - ag) * t) & 255;
  const bl = Math.round(ab + (bb - ab) * t) & 255;
  return "#" + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0");
}

const AFFIXES = [
  // tankier / heavier
  { id: "tank",  color: "#6b4a2a", appliesTo: () => true,
    apply: (e) => { e.hp *= 1.8; e.maxHp *= 1.8; e.weight *= 1.7; } },
  { id: "swift", color: "#2fa0f0", appliesTo: (e) => e.kind !== "armored",
    apply: (e) => { e.speedMult *= 1.45; } },
  // more / faster shooting (ranged only)
  { id: "rapid", color: "#ef5520", appliesTo: (e) => e.kind === "ranged",
    apply: (e) => { e.fireRateMult *= 0.5; } },
  { id: "volley", color: "#d65bd6", appliesTo: (e) => e.kind === "ranged",
    apply: (e) => { e.volley = 3; } },
  // armed & shielded
  { id: "armed",  color: "#cc2030", appliesTo: (e) => e.kind === "charger",
    apply: (e) => { e.contactReach = 24; e.contactDmg *= 1.3; e.hw *= 1.12; } },
  { id: "warded", color: "#13c4d6", appliesTo: () => true,
    apply: (e) => { e.shield = e.maxHp * 0.6; e.maxShield = e.shield; } },
];

function applyAffix(e, id) {
  const a = AFFIXES.find((x) => x.id === id);
  if (!a || e.affixes.includes(id) || !a.appliesTo(e)) return false;
  a.apply(e);
  e.affixes.push(id);
  return true;
}

function finalizeAffixes(e) {
  e.affixCount = e.affixes.length;
  for (const id of e.affixes) {
    const a = AFFIXES.find((x) => x.id === id);
    if (a) e.color = blendHex(e.color, a.color, 0.42);   // tint toward each affix
  }
}

// frequent & chaotic: up to 3, chance per slot scales with wave
function rollAffixes(e, wave) {
  const base = clamp(0.12 + wave * 0.06, 0, 0.85);
  const chances = [base, base * 0.55, base * 0.3];
  for (let s = 0; s < 3; s++) {
    if (Math.random() >= chances[s]) continue;
    const pool = AFFIXES.filter((a) => a.appliesTo(e) && !e.affixes.includes(a.id));
    if (!pool.length) break;
    applyAffix(e, pool[Math.floor(Math.random() * pool.length)].id);
  }
  finalizeAffixes(e);
}

// authored sub-types: a base type + a fixed, coherent affix combo
const PRESETS = [
  { type: "ranged",  affixes: ["rapid", "volley"] },   // Gunner
  { type: "charger", affixes: ["tank", "armed"] },      // Brute
  { type: "armored", affixes: ["warded", "tank"] },     // Sentinel
];
function applyPreset(e, preset) {
  for (const id of preset.affixes) applyAffix(e, id);
  finalizeAffixes(e);
}
