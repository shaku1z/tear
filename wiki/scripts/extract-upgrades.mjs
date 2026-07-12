#!/usr/bin/env node
// scripts/extract-upgrades.mjs
// Generates all upgrade category pages from upgrades.js data
// Run: node scripts/extract-upgrades.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../src/content/docs/upgrades');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Full upgrade data from upgrades.js
const STACKABLE = [
  { id: 'vitality',       name: 'Vitality',        cat: 'resilience', desc: '+30 max HP, and heal 30.' },
  { id: 'keen_edge',      name: 'Keen Edge',        cat: 'offense',   desc: '+12% swing damage.' },
  { id: 'fleet',          name: 'Fleet Foot',       cat: 'mobility',  desc: '+8% move speed, higher jump.' },
  { id: 'quick_recovery', name: 'Quick Recovery',   cat: 'mobility',  desc: '−25% dash cooldown.' },
  { id: 'long_reach',     name: 'Long Reach',       cat: 'utility',   desc: '+ blade reach and length.' },
  { id: 'heavy_swing',    name: 'Heavy Swing',      cat: 'offense',   desc: '+25% knockback, stronger launches.' },
  { id: 'deadly_throw',   name: 'Deadly Throw',     cat: 'throw',     desc: '+20% thrown-blade damage, and it flies faster.' },
  { id: 'vampiric',       name: 'Vampiric Edge',    cat: 'resilience', desc: 'Swings trickle back a sliver of HP (once per swing).' },
  { id: 'air_superiority',name: 'Air Superiority',  cat: 'offense',   desc: '+15% damage while airborne.' },
  { id: 'tough_hide',     name: 'Tough Hide',       cat: 'resilience', desc: 'Take 12% less damage.' },
  { id: 'bounty',         name: 'Bounty Hunter',    cat: 'utility',   desc: '+20% score from kills.' },
  { id: 'glass_cannon',   name: 'Glass Cannon',     cat: 'offense',   desc: '+30% ALL damage (swing + throw), but you take +25% more.' },
  { id: 'whetstone',      name: 'Whetstone',        cat: 'throw',     desc: 'The RETURNING blade (recall) cuts +25% harder.' },
  { id: 'gyroblade',      name: 'Gyroblade',        cat: 'throw',     desc: 'The thrown blade flies and returns 12% faster.' },
  { id: 'quickdraw',      name: 'Quickdraw',        cat: 'throw',     desc: '+ recall range, and the blade snaps back faster.' },
  { id: 'steady_hand',    name: 'Steady Hand',      cat: 'parry',     desc: 'Perfect parries land more easily — more forgiving window.' },
  { id: 'wide_guard',     name: 'Wide Guard',       cat: 'parry',     desc: 'Deflect shots even with slower swings.' },
  { id: 'counterforce',   name: 'Counterforce',     cat: 'parry',     desc: 'Reflected shots fly faster and hit +18% harder.' },
  { id: 'tailwind',       name: 'Tailwind',         cat: 'mobility',  desc: 'Higher jump and sharper air control.' },
  { id: 'kinetic',        name: 'Kinetic Charge',   cat: 'mobility',  desc: '+9% dash distance, and longer dash i-frames.' },
  { id: 'bulwark',        name: 'Bulwark',          cat: 'resilience', desc: 'Recover an extra 10 HP each time you clear a wave.' },
  { id: 'showtime',       name: 'Showtime',         cat: 'utility',   desc: 'Trick meter lingers — drains 25% slower.' },
  { id: 'fortune',        name: 'Fortune',          cat: 'utility',   desc: '+18% coins earned this run.' },
];

const UNIQUE_BY_CAT = {
  offense: [
    { name: 'Air Dash',      rare: false, desc: 'Gain a second dash in mid-air. Charges refill on landing.', tiers: [] },
    { name: 'Crater',        rare: false, desc: 'Power Slams erupt in a shockwave that grows with descent speed.', tiers: [] },
    { name: 'Aerial Rave',   rare: false, desc: 'Staying airborne ramps up swing damage over time (up to +50%).', tiers: [
      { level: 2, desc: 'Ramps much faster (up to +80%).' },
      { level: 3, desc: 'Ramps incredibly fast (up to +130%).' },
    ]},
    { name: 'Seismic Slam',  rare: false, desc: 'Slams blast nearby enemies for 22 damage.', tiers: [] },
    { name: 'Detonate',      rare: false, desc: 'Kills explode for 18 to nearby foes.', tiers: [] },
    { name: 'Tempest',       rare: false, desc: 'Rising updrafts also launch all nearby enemies skyward.', tiers: [] },
    { name: 'Berserker',     rare: false, desc: '+25% damage while below half HP.', tiers: [] },
    { name: 'Rupture',       rare: false, desc: 'Cuts inflict BLEED — a stacking wound (6 dmg/s per stack, max 8).', tiers: [
      { level: 2, desc: '2 stacks per cut. Power Slams DETONATE nearby bleed.' },
      { level: 3, desc: '3 stacks per cut. Slams detonate. Dying bleeding enemies splash stacks nearby.' },
    ]},
    { name: 'Sunder',        rare: false, desc: 'Hits MARK enemies: +30% damage taken from all sources for 4s.', tiers: [
      { level: 2, desc: '+40% damage. Marking armored foes instantly SHATTERS their guard.' },
      { level: 3, desc: '+50% damage. Marks shatter guards. Hitting a marked foe SPREADS the mark nearby.' },
    ]},
  ],
  resilience: [
    { name: 'Bloodrite',  rare: true,  desc: 'Skill kills (slam, spike, perfect-parry) restore HP.', tiers: [
      { level: 2, desc: 'Much more HP restored. Skill kills grant 1s invincibility.' },
      { level: 3, desc: 'Massive HP restored + invincibility. Every normal kill trickles HP back.' },
    ]},
    { name: 'Flow Guard', rare: false, desc: 'Take 30% less damage while trick rank is BRUTAL (×3) or higher.', tiers: [
      { level: 2, desc: '50% less damage at BRUTAL.' },
      { level: 3, desc: '50% less at STYLISH (×2). At BRUTAL: also rapidly REGENERATE HP.' },
    ]},
    { name: 'Aegis',      rare: false, desc: 'Slam kills grant a shield that blocks the next hit (max 2).', tiers: [
      { level: 2, desc: 'Slam AND perfect-parry kills grant shields (max 3).' },
      { level: 3, desc: 'Max 4 shields. An absorbed hit erupts a damaging shockwave.' },
    ]},
    { name: 'Riposte',    rare: false, desc: 'After a perfect parry, take 60% less damage for 1.2s.', tiers: [
      { level: 2, desc: 'Restore HP + 75% less damage for 1.8s.' },
      { level: 3, desc: 'Restore HP + complete INVINCIBILITY for 2.3s.' },
    ]},
    { name: 'Last Stand', rare: true,  desc: 'Once per run, refuse to fall — rise from a killing blow with 40% HP.', tiers: [] },
  ],
  mobility: [
    { name: 'Phantom Dash',    rare: false, desc: 'Dashing directly through enemies unleashes a damaging phase-slice (26 dmg).', tiers: [
      { level: 2, desc: 'Heavier phase-slice (44 dmg).' },
      { level: 3, desc: 'Devastating phase-slice (64 dmg). If the slice kills, dash REFUNDS instantly.' },
    ]},
    { name: 'Slipstream',     rare: false, desc: 'For a moment after a dash, hits land for +35%.', tiers: [] },
    { name: 'Adrenaline',     rare: false, desc: 'Kills instantly refresh your dash.', tiers: [] },
    { name: 'Cinder Trail',   rare: false, desc: 'Dashing ignites enemies passed through (BURN: 20 dps, 2.6s).', tiers: [
      { level: 2, desc: 'Hotter burn (30 dps, 3.4s) that also SLOWS.' },
      { level: 3, desc: 'Massive slowing burn. Dying burned enemies ERUPT, igniting nearby foes.' },
    ]},
    { name: 'Concussive Dash', rare: false, desc: 'Ending a dash erupts a shockwave (24 dmg + knockback).', tiers: [
      { level: 2, desc: 'Heavier shockwave (42 dmg) + STUNS.' },
      { level: 3, desc: 'Massive stunning shockwave (60 dmg). Hitting 2+ enemies instantly REFUNDS the dash.' },
    ]},
  ],
  parry: [
    { name: 'Phase Step',       rare: false, desc: 'Dash through an enemy shot to deflect it.', tiers: [] },
    { name: 'Backfire',         rare: false, desc: 'Your reflected shots STUN the enemies they strike.', tiers: [] },
    { name: 'Piercing Parry',   rare: false, desc: 'Parried projectiles pierce through every enemy.', tiers: [] },
    { name: 'Scatter Parry',    rare: false, desc: 'Parried projectiles split into 3 that ricochet up to 3 times.', tiers: [] },
    { name: 'Tempo',            rare: false, desc: 'Perfect parries grant TEMPO (+25% dmg, faster speed, refreshes dash) for 4s.', tiers: [
      { level: 2, desc: '+30% dmg for 6s. Stacks up to 2 times.' },
      { level: 3, desc: 'Plunges room into slow-mo. +34% dmg per stack (max 2).' },
    ]},
    { name: 'Backlash',         rare: false, desc: 'Perfect parry erupts a COUNTER-SHOCK (26 dmg, 175 px, stuns nearby enemies).', tiers: [
      { level: 2, desc: 'Larger shock (44 dmg) + MARKS enemies.' },
      { level: 3, desc: 'Massive shock (70 dmg, 250 px) + marks + brief INVINCIBILITY.' },
    ]},
  ],
  throw: [
    { name: 'Razor Momentum',  rare: false, desc: 'A thrown blade grows faster and stronger per enemy it pierces (+10%/pierce).', tiers: [
      { level: 2, desc: '+18% per pierce.' },
      { level: 3, desc: '+26% per pierce. Each pierce briefly STUNS the target.' },
    ]},
    { name: 'Greatblade',      rare: false, desc: 'The blade becomes huge while thrown (1.7× size).', tiers: [] },
    { name: 'Boomerang',       rare: false, desc: 'Recall the thrown blade from any distance.', tiers: [] },
    { name: 'Ricochet',        rare: false, desc: 'A thrown blade curves to a new target after each pierce.', tiers: [] },
    { name: 'Storm Recall',    rare: false, desc: 'Recalling the blade tears through enemies for +85% damage.', tiers: [
      { level: 2, desc: '+140% damage on recall.' },
      { level: 3, desc: '+200% damage on recall. Catching the blade releases a shockwave.' },
    ]},
    { name: 'Vortex Recall',   rare: false, desc: 'The returning blade drags every enemy it passes toward you.', tiers: [] },
    { name: 'Impale',          rare: false, desc: 'A thrown blade PINS the first enemy hit in place, applying 3 BLEED stacks.', tiers: [
      { level: 2, desc: 'Pins EVERY pierced enemy with 4 BLEED stacks.' },
      { level: 3, desc: 'Pins every enemy with 5 BLEED. Returning blade DETONATES the bleed.' },
    ]},
  ],
};

// Helper
function upgradeCardMdx(u, cat) {
  const tiersStr = u.tiers.length
    ? `tiers={[${u.tiers.map(t => `{ level: ${t.level}, desc: ${JSON.stringify(t.desc)} }`).join(', ')}]}`
    : '';
  return `<UpgradeCard\n  name="${u.name}"\n  cat="${cat}"\n  ${u.rare ? 'rare ' : ''}${u.tiers.length ? 'unique ' : ''}desc={${JSON.stringify(u.desc)}}\n  ${tiersStr}\n/>`;
}

// Index page
const indexContent = `---
title: Upgrades & Abilities Overview
description: How the draft system, upgrade categories, tiers, and draft weighting work in Tear.
gameVersion: v0.1
---

import UpgradeCard from '../../../components/UpgradeCard.astro';

## The Draft System

After each wave you are presented with **3 upgrade choices** randomly drawn from the pool.
The draft has three upgrade types with different rarity weights:

| Type | Weight | Description |
|---|---|---|
| **Stackable Upgrades** | 1.0 | Common numeric boosts. Can be picked multiple times. |
| **Unique Abilities** | 0.6 | Qualitative mechanics. Each can only be owned once per run. |
| **Special Abilities** | 0.28 | Tiered mechanics (the best abilities). Deliberately rare. |
| **Rare Special** | 0.16 | The rarest — Bloodrite, Last Stand. |

A **per-stage guarantee** ensures at least one Special ability appears in the draft every stage.

## Ability Tiers

Special abilities (those with tiers) start at **Tier 1** when first acquired.
Each time you **defeat a boss**, you earn an **Ability Tier-Up** — choose one of your owned tiered abilities to evolve to its next tier (max Tier 3).

Tiers are permanent for the rest of the run and dramatically change how an ability plays.

## Categories

| Category | Focus |
|---|---|
| [Offense](/upgrades/offense) | Raw damage, area explosions, airborne power |
| [Resilience](/upgrades/resilience) | HP, shields, damage reduction, life-on-kill |
| [Mobility](/upgrades/mobility) | Dash power, speed, positioning |
| [Parry](/upgrades/parry) | Parry rewards, counter-attacks, projectile manipulation |
| [Throw](/upgrades/throw) | Thrown blade power, recall, chaining |
| Utility | Score, coins, trick meter — see [Stackable Upgrades](/upgrades/stackable) |
`;

fs.writeFileSync(path.join(OUT_DIR, 'index.mdx'), indexContent);
console.log('✔ upgrades/index.mdx');

// Stackable page
const stackableContent = `---
title: Stackable Upgrades
description: All 23 stackable upgrades in Tear — numeric boosts that can be picked multiple times.
gameVersion: v0.1
---

import UpgradeCard from '../../../components/UpgradeCard.astro';

Stackable upgrades are the most common draft picks. They have a weight of **1.0** (baseline) and can be picked multiple times in a run — each additional pick stacks the effect.

${STACKABLE.map(u => `<UpgradeCard name="${u.name}" cat="${u.cat}" desc={${JSON.stringify(u.desc)}} />`).join('\n\n')}
`;

fs.writeFileSync(path.join(OUT_DIR, 'stackable.mdx'), stackableContent);
console.log('✔ upgrades/stackable.mdx');

// Category pages
const catDescs = {
  offense: 'Offense abilities deal raw damage, create explosions, and reward aggressive airborne play.',
  resilience: 'Resilience abilities earn survivability through skill — no passive regen buttons.',
  mobility: 'Mobility abilities make your dash a weapon, not just an escape tool.',
  parry: 'Parry abilities turn defense into offense. Master perfect parries to unlock their full potential.',
  throw: 'Throw abilities transform the thrown blade into a multi-target weapon.',
};

for (const [cat, upgrades] of Object.entries(UNIQUE_BY_CAT)) {
  const content = `---
title: "${cat.charAt(0).toUpperCase() + cat.slice(1)} Abilities"
description: "All unique ${cat} abilities in Tear, with tier progressions."
gameVersion: v0.1
---

import UpgradeCard from '../../../components/UpgradeCard.astro';

${catDescs[cat] || ''}

${upgrades.map(u => upgradeCardMdx(u, cat)).join('\n\n')}
`;
  fs.writeFileSync(path.join(OUT_DIR, `${cat}.mdx`), content);
  console.log(`✔ upgrades/${cat}.mdx`);
}

console.log('\n✅ Upgrade stubs generated successfully.');
