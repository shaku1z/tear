#!/usr/bin/env node
// scripts/extract-enemies.mjs
// Generates enemy family pages from game source (config.js, variants.js, affixes.js)
// Run from Tear/wiki root: node scripts/extract-enemies.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../src/content/docs/enemies');
fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Dynamically load live game scripts ---
const gameJsDir = path.resolve(__dirname, '../../js');
const variantsSrc = fs.readFileSync(path.join(gameJsDir, 'variants.js'), 'utf-8');
const configSrc = fs.readFileSync(path.join(gameJsDir, 'config.js'), 'utf-8');

const sandbox = { Math, console };
vm.createContext(sandbox);
vm.runInContext(configSrc + '\n' + variantsSrc + '\n; this.VARIANTS_OUT = VARIANTS; this.CONFIG_OUT = CONFIG;', sandbox);

const LIVE_VARIANTS = sandbox.VARIANTS_OUT;
const LIVE_CONFIG = sandbox.CONFIG_OUT;

// ---- Base data + dynamically merged live variants ----
const FAMILIES = [
  {
    slug: 'charger', name: 'Charger', color: '#e23b3b',
    role: 'Melee rusher that closes distance with a telegraphed bull-charge lunge.',
    hp: 86, speed: 150, contactDmg: 12, knockbackTaken: 9, weight: 1,
    w: 40, h: 40,
    keyStats: { 'Charge Range': '420 px', 'Charge Windup': '0.55s', 'Charge Speed': '760 px/s', 'Charge Duration': '0.5s', 'Whiff Stun': '1.1s', 'Charge Cooldown': '1.2s' },
    stages: ['The Grounds', 'The Crimson Fields', 'The Tear'],
    variants: (LIVE_VARIANTS.charger || []).map(v => ({ name: v.name, minWave: v.minWave || 1, desc: `Base Weight: ${v.weight}. Evolved variant.` })),
    tips: [
      'When a Charger winds up, move perpendicular — it will slam the wall and stun itself.',
      'A Duelist will parry your thrown blade. Wait for the recovery, then throw again.',
      'Gravediggers are safe at point-blank range. Get in close and slam downward.',
    ],
  },
  {
    slug: 'ranged', name: 'Ranged', color: '#2f6df0',
    role: 'Keeps distance, kites away when you close, fires telegraphed shots.',
    hp: 60, speed: 175, contactDmg: 8, knockbackTaken: 12, weight: 1,
    w: 34, h: 44,
    keyStats: { 'Preferred Distance': '380 px', 'Flee Threshold': '250 px', 'Shot Windup': '0.7s', 'Fire Interval': '2.3s', 'Projectile Speed': '800 px/s' },
    stages: ['The Grounds', 'The Undercroft', 'The Voidspire', 'The Tear'],
    variants: (LIVE_VARIANTS.ranged || []).map(v => ({ name: v.name, minWave: v.minWave || 1, desc: `Base Weight: ${v.weight}. Evolved variant.` })),
    tips: [
      'Parrying a Marksman\'s charged shot back deals massive damage and rewards style points.',
      'Chain bolts are easy to parry — watch for the distinctive blue projectile.',
      'Warlock shots curve once. Dodge after the curve commits, not before.',
    ],
  },
  {
    slug: 'flyer', name: 'Flyer', color: '#8b3bd6',
    role: 'Hovers above the ground, swoops down to strike, ignores platforms.',
    hp: 44, speed: 230, contactDmg: 10, knockbackTaken: 14, weight: 0.75,
    w: 36, h: 26,
    keyStats: { 'Hover Height': '150 px', 'Swoop Interval': '3.3s', 'Swoop Speed': '700 px/s' },
    stages: ['The Crimson Fields', 'The Voidspire', 'The Tear'],
    variants: (LIVE_VARIANTS.flyer || []).map(v => ({ name: v.name, minWave: v.minWave || 1, desc: `Base Weight: ${v.weight}. Evolved variant.` })),
    tips: [
      'Flyers have low weight (0.75) — a rising uppercut easily launches them for an aerial juggle.',
      'Use updrafts to pull all Flyers down to the ground level simultaneously.',
      'Flyers are vulnerable immediately after completing a swoop — punish the landing.',
    ],
  },
  {
    slug: 'bomber', name: 'Bomber', color: '#ef8a17',
    role: 'Lobs arcing bombs from a distance. Bombs can be parried back.',
    hp: 40, speed: 165, contactDmg: 8, knockbackTaken: 11, weight: 1,
    w: 34, h: 34,
    keyStats: { 'Standoff Distance': '340 px', 'Lob Interval': '2.4s', 'Bomb Speed': '540 px/s', 'Blast Radius': '150 px', 'Blast Damage': '24', 'Mine Arm Time': '1.3s', 'Mine Trigger Radius': '66 px' },
    stages: ['The Grounds', 'The Undercroft', 'The Crimson Fields', 'The Tear'],
    variants: (LIVE_VARIANTS.bomber || []).map(v => ({ name: v.name, minWave: v.minWave || 1, desc: `Base Weight: ${v.weight}. Evolved variant.` })),
    tips: [
      'Parrying a Bomber\'s bomb back deals 24 blast damage in a 150 px radius — far more than hitting the Bomber directly.',
      'Sludge puddles slow you by 45%. Use dash to escape them.',
      'Geomancer walls expire after 9 seconds. Use them for cover against Ranged enemies.',
    ],
  },
  {
    slug: 'armored', name: 'Armored', color: '#3a4654',
    role: 'Shielded front-liner. Takes reduced damage on the ground — must be launched to kill efficiently.',
    hp: 154, speed: 95, contactDmg: 14, knockbackTaken: 3, weight: 2.2,
    w: 46, h: 46,
    keyStats: { 'Ground Damage Reduction': '50%', 'Air Damage Mult': '×1.15', 'Shield Break Speed': '1500 px/s', 'Stomp Cooldown': '3.2s', 'Stomp Range': '400 px', 'Shock Damage': '16', 'Weight': '2.2 (hard to pop)' },
    stages: ['The Grounds', 'The Undercroft', 'The Tear'],
    variants: [],
    tips: [
      'An Armored enemy takes 50% less damage while grounded. Launch it into the air first.',
      'Once airborne, it takes +15% damage instead. Keep juggling to maximize damage.',
      'A blade tip hitting at ≥1500 px/s shatters the shield — after that it\'s vulnerable even grounded.',
      'The Sunder ability (Mark) + Sunder T2 instantly shatters the shield when applied.',
    ],
  },
  {
    slug: 'support', name: 'Support', color: '#a64dd6',
    role: 'No direct attacks — makes every other enemy far more dangerous. Always the priority target.',
    hp: 44, speed: 125, contactDmg: 6, knockbackTaken: 13, weight: 1,
    w: 32, h: 42,
    keyStats: { 'Aura Range': '240 px', 'Keep-Away Distance': '330 px' },
    stages: ['The Undercroft', 'The Crimson Fields', 'The Voidspire', 'The Tear'],
    variants: (LIVE_VARIANTS.support || []).map(v => ({ name: v.name, minWave: v.minWave || 1, desc: `Base Weight: ${v.weight}. Evolved variant.` })),
    tips: [
      'Support enemies never directly attack — but an Armored enemy with a Herald behind it is almost unstoppable. Kill supports first.',
      'Anchor: the bonded pair shares fate. A thrown blade is ideal for picking off the support from range.',
      'War Priest auras stack — two Priests together make nearby enemies nearly invincible.',
    ],
  },
  {
    slug: 'wraith', name: 'Wraith', color: '#6a6f88',
    role: 'Phantom immune to direct blade hits. Only a thrown blade or a deflected shot can harm it.',
    hp: 64, speed: 170, contactDmg: 12, knockbackTaken: 0, weight: 1.4,
    w: 36, h: 42,
    keyStats: { 'Hover Height': '70 px', 'Knockback Taken': '0 (immune)', 'Direct Blade Hits': 'No damage', 'Thrown Blade': 'Full damage', 'Deflected Shot': 'Full damage' },
    stages: ['The Voidspire', 'The Tear'],
    variants: [],
    tips: [
      'Throw your blade at a Wraith — it\'s the only way to deal direct damage.',
      'Deflecting a projectile through a Wraith also damages it.',
      'A Wraith with a Mender behind it is extremely dangerous — prioritize the Mender first, then throw.',
      'Wraiths hover at 70 px. They can still be hit by ground-level shockwaves from Crater or Backlash.',
    ],
  },
  {
    slug: 'chimera', name: 'Chimera', color: '#444a5c',
    role: 'Adopts attack patterns from other enemy types in its wave, cycling through them. The wind-up telegraphs what\'s coming.',
    hp: 84, speed: 150, contactDmg: 12, knockbackTaken: 9, weight: 1,
    w: 38, h: 48,
    keyStats: { 'Copy Delay': '0.55s', 'HP': '84', 'Speed': '150 px/s', 'Knockback Taken': '9' },
    stages: ['The Crimson Fields', 'The Voidspire', 'The Tear'],
    variants: [],
    tips: [
      'The wind-up animation matches the enemy type it\'s copying — read it like you\'d read that original enemy.',
      'In late stages, a Chimera may copy a Marksman shot — treat it with the same respect.',
      'Chimeras are good style-farming targets since they cycle through several trick opportunities.',
    ],
  },
];

// Index page
const indexContent = `---
title: Enemy System
description: How Tear's enemy system works — families, variants, affixes, elites, and threat priority.
gameVersion: v0.1
---

## How Enemies Work

Tear's enemy roster is built from **three stacking layers**:

1. **Family** — defines the enemy's core verb (Charger rushes, Ranged kites, Flyer swoops).
2. **Variant** — reshapes the verb into a distinct threat, gated by wave number.
3. **Affix** — stat/behaviour mutations rolled randomly per enemy; 0–3 per instance.

On top of these, **Elite** versions can appear (see [Affixes & Elites](/enemies/affixes)).

## Enemy Families

| Family | HP | Speed | Contact Dmg | Knockback Taken | Weight |
|---|---|---|---|---|---|
${FAMILIES.map(f => `| [${f.name}](/enemies/${f.slug}) | ${f.hp} | ${f.speed} | ${f.contactDmg} | ${f.knockbackTaken} | ${f.weight} |`).join('\n')}

## Priority Order

In general, prioritize targets this way:
1. **Support enemies** (War Priest, Herald, Mender, Anchor) — they multiply every other threat.
2. **Wraiths** — immune to direct hits, require a throw or deflect to kill.
3. **High-damage variants** — Marksmen, Executioners, Anchor targets.
4. **Standard enemies** — Chargers and Ranged enemies last.

## Enemy HP Scaling

In **Endless** mode: +12% HP per wave.
In **Adventure**: +6% per wave within a stage, +34% between stages.
All values are also modified by the selected [difficulty](/modes/index).
`;

fs.writeFileSync(path.join(OUT_DIR, 'index.mdx'), indexContent);
console.log('✔ enemies/index.mdx');

for (const f of FAMILIES) {
  const variantTable = f.variants.length
    ? `## Variants\n\n| Name | Available | Description |\n|---|---|---|\n${f.variants.map(v => `| **${v.name}** | Wave ${v.minWave}+ | ${v.desc} |`).join('\n')}`
    : '*(No named variants — uses the base family only.)*';

  const tipsBlock = f.tips.length
    ? `## Tips\n\n${f.tips.map(t => `- ${t}`).join('\n')}`
    : '';

  const content = `---
title: "${f.name}"
description: "${f.role}"
gameVersion: v0.1
---

import StatBlock from '../../../components/StatBlock.astro';
import BiomeBadge from '../../../components/BiomeBadge.astro';

<BiomeBadge stages={[${f.stages.map(s=>`"${s}"`).join(', ')}]} />

> ${f.role}

<StatBlock
  name="${f.name}"
  color="${f.color}"
  stats={{
    'HP': ${f.hp},
    'Speed': '${f.speed} px/s',
    'Contact Damage': ${f.contactDmg},
    'Knockback Taken': ${f.knockbackTaken},
    'Weight': ${f.weight},
    'Size': '${f.w}×${f.h} px',
${Object.entries(f.keyStats).map(([k, v]) => `    '${k}': '${v}',`).join('\n')}
  }}
/>

${variantTable}

${tipsBlock}
`;

  fs.writeFileSync(path.join(OUT_DIR, `${f.slug}.mdx`), content);
  console.log(`✔ enemies/${f.slug}.mdx`);
}

console.log('\n✅ Enemy stubs generated successfully.');
