#!/usr/bin/env node
// scripts/extract-stages.mjs
// Reads stages.js from the game source and generates Starlight markdown stubs
// for each stage. Run from the tear-wiki root: node scripts/extract-stages.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = path.resolve(__dirname, '../../Tear/js');
const OUT_DIR   = path.resolve(__dirname, '../src/content/docs/stages');

// ---- Data (sourced from stages.js) ----
const STAGES = [
  {
    slug: 'the-grounds', name: 'The Grounds', blurb: 'Where order is kept.',
    boss: 'warden', bossName: 'The Warden',
    bg: '#ffffff', plat: '#111111', accent: '#e23b3b',
    waveCount: 9,
    pool: [
      { type: 'Charger', chance: '100%', fromWave: 1 },
      { type: 'Ranged',  chance: '50%',  fromWave: 2 },
      { type: 'Bomber',  chance: '30%',  fromWave: 4 },
      { type: 'Armored', chance: '30%',  fromWave: 5 },
    ],
    platforms: 5,
    lore: "The Warden's badge lies in pieces. Etched inside, worn almost smooth: \"Appointed by the Council of First Light. Directive: none shall reach the Undercroft.\" Below it, scratched by hand: \"I never asked what was down there.\"",
  },
  {
    slug: 'the-undercroft', name: 'The Undercroft', blurb: 'Gray industry, deep below.',
    boss: 'colossus', bossName: 'The Iron Colossus',
    bg: '#dbe0e6', plat: '#2a2f37', accent: '#15c2c2',
    waveCount: 9,
    pool: [
      { type: 'Armored', chance: '80%',  fromWave: 1 },
      { type: 'Bomber',  chance: '70%',  fromWave: 1 },
      { type: 'Charger', chance: '60%',  fromWave: 1 },
      { type: 'Ranged',  chance: '50%',  fromWave: 2 },
      { type: 'Anchor',  chance: '25%',  fromWave: 4 },
    ],
    platforms: 6,
    lore: "In the deepest wall of the Undercroft, beneath the mechanism that is now still, words are carved into the original stone — older than the machine: \"Built to contain the Tide of Crimson. Should the Colossus fall, know this — we tried to stop it before it reached the Fields. We failed then too.\"",
  },
  {
    slug: 'the-crimson-fields', name: 'The Crimson Fields', blurb: 'Red and gold, and old rage.',
    boss: 'aldric', bossName: 'Aldric (Berserker King)',
    bg: '#f7e3e3', plat: '#5a1320', accent: '#e23b3b',
    waveCount: 9,
    pool: [
      { type: 'Charger', chance: '100%', fromWave: 1 },
      { type: 'Flyer',   chance: '60%',  fromWave: 1 },
      { type: 'Bomber',  chance: '30%',  fromWave: 2 },
      { type: 'Herald',  chance: '30%',  fromWave: 3 },
      { type: 'Chimera', chance: '35%',  fromWave: 5 },
    ],
    platforms: 5,
    lore: "Among Aldric's belongings, tucked inside the wrapping of his broken cleaver's handle: a small painted portrait, almost worn through. Two children, laughing. On the back, in handwriting read so many times the ink is barely there: \"Elan and Mira — before the first Tear opened.\" And, in another hand: \"Aldric. Come home.\" He never did.",
  },
  {
    slug: 'the-voidspire', name: 'The Voidspire', blurb: 'Where the rules thin out.',
    boss: 'echo', bossName: 'The Echo',
    bg: '#e7e3f3', plat: '#382c54', accent: '#8b3bd6',
    waveCount: 9,
    pool: [
      { type: 'Wraith',  chance: '70%',  fromWave: 1 },
      { type: 'Flyer',   chance: '50%',  fromWave: 1 },
      { type: 'Ranged',  chance: '40%',  fromWave: 1 },
      { type: 'Priest',  chance: '30%',  fromWave: 2 },
      { type: 'Chimera', chance: '50%',  fromWave: 3 },
      { type: 'Mender',  chance: '25%',  fromWave: 4 },
    ],
    platforms: 6,
    lore: "The Voidspire is quiet for the first time. On the wall behind where The Echo stood, scratched deep over what must have been years: your name. Over and over — hundreds of times. Below them all, fresher, still sharp: \"I remember what it was like to be going somewhere.\" And at the very bottom: \"Go finish it. One of us should.\"",
  },
  {
    slug: 'the-tear', name: 'The Tear', blurb: 'Everything, all at once.',
    boss: 'source', bossName: 'The Source',
    bg: '#0e0b1a', plat: '#c9c4e0', accent: '#13c4d6',
    waveCount: 9,
    dark: true,
    pool: [
      { type: 'Charger', chance: '100%', fromWave: 1 },
      { type: 'Ranged',  chance: '60%',  fromWave: 1 },
      { type: 'Flyer',   chance: '50%',  fromWave: 1 },
      { type: 'Bomber',  chance: '40%',  fromWave: 1 },
      { type: 'Armored', chance: '40%',  fromWave: 1 },
      { type: 'Wraith',  chance: '40%',  fromWave: 1 },
      { type: 'Chimera', chance: '40%',  fromWave: 1 },
      { type: 'Herald',  chance: '20%',  fromWave: 1 },
      { type: 'Anchor',  chance: '20%',  fromWave: 1 },
      { type: 'Priest',  chance: '20%',  fromWave: 1 },
      { type: 'Mender',  chance: '18%',  fromWave: 1 },
    ],
    platforms: 5,
    lore: "There is nothing left to carve the words into — only the quiet where the Tear used to be. You understand it now: the Source was never an enemy, only the wound the world kept reopening, wearing the shape of everyone who ever tried to close it. It wore your shape last. The blade is lighter than it has ever been. Somewhere, far above, something that has not been able to for a very long time begins, tentatively, to heal.",
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

// Index page
const indexContent = `---
title: Campaign Stages
description: All five stages in the Tear campaign, their biomes, enemy pools, and bosses.
gameVersion: v0.1
---

import BiomeBadge from '../../../components/BiomeBadge.astro';

The **Adventure** campaign unfolds across five distinct biomes, each with 9 waves of enemies followed by a boss encounter.
Enemy difficulty scales across stages: each new stage adds **+34% enemy HP**, **+14% enemy damage**, and **+2 more enemies per wave**.

## Stage Overview

| # | Stage | Blurb | Boss |
|---|---|---|---|
${STAGES.map((s, i) => `| ${i+1} | [${s.name}](/stages/${s.slug}) | *${s.blurb}* | [${s.bossName}](/bosses/${s.boss}) |`).join('\n')}

## Wave Scaling (Campaign)

| Modifier | Per Stage | Per Wave Within Stage |
|---|---|---|
| Enemy HP | +34% | +6% |
| Enemy Damage | +14% | +2% |
| Enemy Count | +2 per wave | — |
| Concurrent Cap | +1 | — |

The concurrent cap never exceeds 10 enemies on screen at once.
`;

fs.writeFileSync(path.join(OUT_DIR, 'index.mdx'), indexContent);
console.log('✔ stages/index.mdx');

// Individual stage pages
for (const [i, s] of STAGES.entries()) {
  const poolTable = s.pool.map(p =>
    `| ${p.type} | ${p.chance} | Wave ${p.fromWave}+ |`
  ).join('\n');

  const content = `---
title: "${s.name}"
description: "${s.blurb} — Stage ${i+1} of the Tear campaign."
gameVersion: v0.1
---

import StatBlock from '../../../components/StatBlock.astro';
import BiomeBadge from '../../../components/BiomeBadge.astro';

<BiomeBadge stages={["${s.name}"]} />

> *${s.blurb}*

**Stage ${i+1} of 5.** ${s.waveCount} waves, then [**${s.bossName}**](/bosses/${s.boss}).

${s.dark ? ':::caution[Dark Biome]\nThe HUD and player silhouette flip to light colours here — the only stage where the arena itself is dark.\n:::' : ''}

## Environment

| Property | Value |
|---|---|
| Background | \`${s.bg}\` |
| Platform Colour | \`${s.plat}\` |
| Accent | \`${s.accent}\` |
| Platform Count | ${s.platforms} one-way platforms |

## Enemy Pool

| Enemy Type | Spawn Chance | Available From |
|---|---|---|
${poolTable}

Enemy HP and damage increase by **+6%** and **+2%** per wave within this stage.

## Boss

When the 9th wave is cleared, [**${s.bossName}**](/bosses/${s.boss}) enters the arena.
Defeating it unlocks an **Ability Tier-Up** — evolve one of your owned tiered abilities to its next level.

## Lore

> ${s.lore}
`;

  fs.writeFileSync(path.join(OUT_DIR, `${s.slug}.mdx`), content);
  console.log(`✔ stages/${s.slug}.mdx`);
}

console.log('\n✅ Stage stubs generated successfully.');
