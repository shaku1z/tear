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

import type { RandomSource } from "../domain/random";

export interface VariantEnemy {
  behavior: string;
  contactReach: number;
  speedMult: number;
  hp: number;
  maxHp: number;
  duelReady?: boolean;
  variant?: string;
  variantName?: string;
}

export interface EnemyVariant {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly minWave?: number;
  readonly apply: (enemy: VariantEnemy) => void;
}

const VARIANTS: Readonly<Record<string, readonly EnemyVariant[]>> = {
  charger: [
    { id: "bull",        name: "Charger",     weight: 1.0,             apply: (e) => { e.behavior = "bull"; } },
    { id: "brawler",     name: "Brawler",     weight: 0.8, minWave: 2, apply: (e) => { e.behavior = "brawler"; e.contactReach = Math.max(e.contactReach, 10); } },
    { id: "stalker",     name: "Stalker",     weight: 0.7, minWave: 4, apply: (e) => { e.behavior = "stalker"; e.speedMult *= 1.3; e.hp *= 0.78; e.maxHp *= 0.78; } },
    { id: "executioner", name: "Executioner", weight: 0.5, minWave: 6, apply: (e) => { e.behavior = "executioner"; e.hp *= 1.3; e.maxHp *= 1.3; e.speedMult *= 0.7; } },
    { id: "gravedigger", name: "Gravedigger", weight: 0.5, minWave: 5, apply: (e) => { e.behavior = "gravedigger"; e.hp *= 1.4; e.maxHp *= 1.4; e.speedMult *= 0.6; } },
    { id: "duelist",     name: "Duelist",     weight: 0.5, minWave: 6, apply: (e) => { e.behavior = "duelist"; e.contactReach = Math.max(e.contactReach, 12); e.duelReady = true; } },
  ],
  ranged: [
    { id: "sentinel", name: "Sentinel", weight: 1.0,             apply: (e) => { e.behavior = "sentinel"; } },
    { id: "rifleman", name: "Rifleman", weight: 0.8, minWave: 3, apply: (e) => { e.behavior = "rifleman"; } },
    { id: "marksman", name: "Marksman", weight: 0.6, minWave: 5, apply: (e) => { e.behavior = "marksman"; e.hp *= 1.1; e.maxHp *= 1.1; } },
    { id: "warlock",  name: "Warlock",  weight: 0.55, minWave: 6, apply: (e) => { e.behavior = "warlock"; } },
    { id: "chain",    name: "Chain Caster", weight: 0.5, minWave: 7, apply: (e) => { e.behavior = "chain"; } },
  ],
  flyer: [
    { id: "swooper",    name: "Flyer",       weight: 1.0,             apply: (e) => { e.behavior = "swoop"; } },
    { id: "divebomber", name: "Dive Bomber", weight: 0.8, minWave: 3, apply: (e) => { e.behavior = "divebomb"; } },
    { id: "highdiver",  name: "Swooper",     weight: 0.6, minWave: 5, apply: (e) => { e.behavior = "highdive"; } },
  ],
  bomber: [
    { id: "lobber",    name: "Bomber",    weight: 1.0,             apply: (e) => { e.behavior = "lob"; } },
    { id: "juggler",   name: "Juggler",   weight: 0.7, minWave: 4, apply: (e) => { e.behavior = "juggle"; } },
    { id: "trapper",   name: "Trapper",   weight: 0.6, minWave: 3, apply: (e) => { e.behavior = "trap"; } },
    { id: "sludge",    name: "Sludge",    weight: 0.5, minWave: 5, apply: (e) => { e.behavior = "sludge"; } },
    { id: "geomancer", name: "Geomancer", weight: 0.45, minWave: 7, apply: (e) => { e.behavior = "geo"; e.hp *= 1.2; e.maxHp *= 1.2; } },
  ],
  // armored keeps its baseline (turn-to-face + enrage on shield break); an absent
  // list just means "no variant, use the family default".
};

// weighted pick among the eligible variants for a kind at this wave
function rollVariant(kind: string, wave: number, random: RandomSource): EnemyVariant | null {
  const list = (VARIANTS[kind] ?? []).filter((v) => v.minWave === undefined || wave >= v.minWave);
  if (!list.length) return null;
  let total = 0; for (const v of list) total += v.weight;
  let r = random.next() * total;
  for (const v of list) { if ((r -= v.weight) <= 0) return v; }
  return list[0] ?? null;
}

function applyVariant(e: VariantEnemy, v: EnemyVariant | null | undefined): void {
  if (!v) return;
  e.variant = v.id;
  e.variantName = v.name;
  v.apply(e);
}

export { VARIANTS, applyVariant, rollVariant };
