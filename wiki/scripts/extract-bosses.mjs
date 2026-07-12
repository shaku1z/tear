#!/usr/bin/env node
// scripts/extract-bosses.mjs
// Generates boss pages from game source (config.js boss sections)
// Run: node scripts/extract-bosses.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../src/content/docs/bosses');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BOSSES = [
  {
    slug: 'warden', name: 'The Warden', stage: 1, stageName: 'The Grounds', color: '#e23b3b',
    hp: 1, realHp: 'Unlisted (Stage 1 Boss)', speed: 'Moderate', contactDmg: 20, weight: 6,
    blurb: 'A methodical guard who weaponizes the arena across 3 phases.',
    phases: [
      {
        name: 'Phase 1 — The Patrol',
        desc: 'Standard combat. Baton strikes with a 2.1s cooldown and 0.5s telegraph. Fires 3-round mortar bursts (760 px/s, 14 dmg). Bashes with knockback (620 px/s) at melee range.',
        tip: 'The mortar arc is predictable. Parry the first shot of a burst to get ahead of the rhythm.',
      },
      {
        name: 'Phase 2 — Prohibited Zones',
        desc: '3 danger zones (each 200 px wide) appear on the arena. Each zone shifts 7 times and ticks damage every 0.4s if you stand in it. Zone placement forces you to keep moving.',
        tip: 'Treat the zones like hot coals — glance at the floor, not the Warden, to track them.',
      },
      {
        name: 'Phase 3 — Ceiling Lock',
        desc: 'The ceiling drops to y=150 px, severely limiting jump height. The Warden gains a lunging ceiling-dive (1500 px/s, 7.5s cooldown, 0.55s telegraph). Dodge perpendicular to the dive axis.',
        tip: 'The ceiling drop makes updrafts difficult. Switch to ground-based slams and throws.',
      },
    ],
    lore: "The Warden's badge lies in pieces. Etched inside, worn almost smooth: \"Appointed by the Council of First Light. Directive: none shall reach the Undercroft.\" Below it, scratched by hand: \"I never asked what was down there.\"",
    keyStats: { 'Baton Cooldown': '2.1s', 'Baton Telegraph': '0.5s', 'Mortar Shots': '3 per burst', 'Mortar Speed': '760 px/s', 'Mortar Damage': '14', 'Bash Knockback': '620 px/s', 'Phase 2 Zones': '3 × 200 px wide', 'Phase 3 Lunge Speed': '1500 px/s' },
  },
  {
    slug: 'iron-colossus', name: 'The Iron Colossus', stage: 2, stageName: 'The Undercroft', color: '#15c2c2',
    hp: 2900, speed: '58 px/s', contactDmg: 24, weight: 9,
    blurb: 'A massive tank with a front shield, a sweeping thrown arm, and an exposed core.',
    phases: [
      {
        name: 'Phase 1 — Shield Wall',
        desc: 'The Colossus faces you and moves slowly. Its front shield absorbs direct hits. Attack from behind or launch it into the air to bypass the shield. Fires a 4-panel cross (14 dmg, 640 px/s, 2.2s CD).',
        tip: 'Use a launch to pop it airborne — once in the air its shield is useless.',
      },
      {
        name: 'Phase 2 — Sweeping Arm',
        desc: 'Detaches an arm and hurls it as a sweeper (16 dmg, 540 px/s, sweeps at y=540). After the sweep, the arm is embedded in the arena. Throw your blade at it before it returns.',
        tip: 'The sweeper hugs the ground at y=540. Jump over it.',
      },
      {
        name: 'Phase 3 — Exposed Core',
        desc: 'Shield broken, moves faster and hits harder. Shockwave on charge whiff. Cross-fire pattern becomes more aggressive. Full damage from all angles.',
        tip: 'This is your damage window. Use your best abilities — the Colossus is finally fully exposed.',
      },
    ],
    lore: "In the deepest wall of the Undercroft, beneath the mechanism that is now still, words are carved into the original stone — older than the machine: \"Built to contain the Tide of Crimson. Should the Colossus fall, know this — we tried to stop it before it reached the Fields. We failed then too.\"",
    keyStats: { 'HP': 2900, 'Speed': '58 px/s', 'Contact Damage': 24, 'Weight': 9, 'Shock Damage': 20, 'Shock Speed': '720 px/s', 'Sweeper Damage': 16, 'Cross Damage': 14, 'Cross Cooldown': '2.2s', 'Panel Count': 4 },
  },
  {
    slug: 'aldric', name: 'Aldric, Berserker King', stage: 3, stageName: 'The Crimson Fields', color: '#e23b3b',
    hp: 3400, speed: '130 px/s', contactDmg: 22, weight: 7,
    blurb: 'A duel that becomes a throne of fire, then a fake death, then a frenzy.',
    phases: [
      {
        name: 'Phase 1 — The Duel',
        desc: 'Aldric lunges (1150 px/s, 0.45s windup, 1.7s AtkCD) and fires shockwaves (18 dmg, 740 px/s, 20 px radius). Standard duel — read the windup, punish the recovery.',
        tip: 'Aldric\'s lunge is his most dangerous attack. The windup is obvious — dash perpendicular, not back.',
      },
      {
        name: 'Phase 2 — Fire Throne (≤65% HP)',
        desc: 'A checkerboard of fire pillars erupts on the arena, pulsing every 3s (8 columns). You must pick safe tiles and attack from them. Aldric becomes much more aggressive.',
        tip: 'The fire pattern is fixed per pulse — memorize the safe columns quickly.',
      },
      {
        name: 'Phase 3 — Fake Death & Frenzy (≤20% HP)',
        desc: 'Aldric collapses — but regenerates at 5% max HP per second back to 50% HP. Once revived, he enters a frenzy: +35% damage taken BY you, but HE takes 30% less damage. Plus a massive charge (1550 px/s, 13s CD).',
        tip: 'The fake death is a trap. Don\'t let up — keep attacking the "downed" Aldric with throws.',
      },
    ],
    lore: "Among Aldric's belongings, tucked inside the wrapping of his broken cleaver's handle: a small painted portrait, almost worn through. Two children, laughing. On the back, in handwriting read so many times the ink is barely there: \"Elan and Mira — before the first Tear opened.\" And, in another hand: \"Aldric. Come home.\" He never did.",
    keyStats: { 'HP': 3400, 'Speed': '130 px/s', 'Contact Damage': 22, 'Weight': 7, 'Attack Cooldown': '1.7s', 'Lunge Speed': '1150 px/s', 'Shock Damage': 18, 'Fire Columns': 8, 'Fire Cycle': '3s', 'Regen Rate (Fake Death)': '5%/s to 50%', 'Frenzy Damage Taken': '+35%', 'Frenzy Charge Speed': '1550 px/s' },
  },
  {
    slug: 'the-echo', name: 'The Echo', stage: 4, stageName: 'The Voidspire', color: '#8b3bd6',
    hp: 3000, speed: '280 px/s', contactDmg: 18, weight: 4,
    blurb: 'Your own silhouette — mirrors your tricks, then splits, then turns invisible.',
    phases: [
      {
        name: 'Phase 1 — The Mirror',
        desc: 'The Echo copies your last trick with a 0.55s delay. It uses your own style against you — a slam will be followed by a mirrored slam. Fires projectiles (14 dmg, 820 px/s) and a shockwave (16 dmg).',
        tip: 'Switch tricks constantly. The Echo can\'t copy a trick it hasn\'t seen from you yet.',
      },
      {
        name: 'Phase 2 — Split',
        desc: 'At ~50% HP, The Echo splits into two copies. Only one is real — the other mirrors your hits for zero damage. The real Echo is slightly brighter.',
        tip: 'Throw your blade at both. The real one reacts differently when hit — it staggers. The fake does not.',
      },
      {
        name: 'Phase 3 — Invisible',
        desc: 'Cycles between visible (10s) and invisible (3.5s). During invisibility it still attacks — watch for shockwave particles to locate it. Lunge speed increases to 1500 px/s.',
        tip: 'During invisibility, keep moving and listen for audio cues. The shockwave particles give its position away.',
      },
    ],
    lore: "The Voidspire is quiet for the first time. On the wall behind where The Echo stood, scratched deep over what must have been years: your name. Over and over — hundreds of times. Below them all, fresher, still sharp: \"I remember what it was like to be going somewhere.\" And at the very bottom: \"Go finish it. One of us should.\"",
    keyStats: { 'HP': 3000, 'Speed': '280 px/s', 'Contact Damage': 18, 'Weight': 4, 'Copy Delay': '0.55s', 'Shock Damage': 16, 'Projectile Damage': 14, 'Invis Cycle': '10s visible / 3.5s invisible', 'Lunge Speed': '1500 px/s' },
  },
  {
    slug: 'the-source', name: 'The Source', stage: 5, stageName: 'The Tear', color: '#13c4d6',
    hp: 4200, speed: '125 px/s', contactDmg: 22, weight: 7,
    blurb: 'A floating rift that cycles every fallen boss\'s signature mechanic, collapses the floor, fakes its death, then erupts into a true form.',
    phases: [
      {
        name: 'Phase 1 — The Cycle',
        desc: 'Cycles through mechanics from all four previous bosses every 2.5s — shockwaves, sweepers, cross-fire, copy attacks. Each mechanic is familiar but the pacing is relentless.',
        tip: 'You\'ve seen all of these before. Treat each cycle cast as a test of everything you\'ve learned.',
      },
      {
        name: 'Phase 2 — Floor Collapse (≤62% HP)',
        desc: 'Tears platforms out of the arena, one every 1.3s. Eventually only the floor remains. No safe platforms to land on — you must stay mobile.',
        tip: 'The floor stays. Aerial Rave users thrive here — stay airborne as long as possible.',
      },
      {
        name: 'Phase 3 — Fake Death & Regen (≤34% HP)',
        desc: 'Collapses and regenerates at 5%/s back to 46% HP. Same as Aldric\'s fake. Keep the pressure up with throws — don\'t stop attacking.',
        tip: 'You know this trick — you\'ve seen Aldric do it. Slam it while it regenerates.',
      },
      {
        name: 'Phase 4 — True Form (after regen)',
        desc: 'Returns at 46% HP with all mechanics active simultaneously. Full aggression. The final test.',
        tip: 'Use every ability you have. This is what the whole run was building toward.',
      },
    ],
    lore: "There is nothing left to carve the words into — only the quiet where the Tear used to be. You understand it now: the Source was never an enemy, only the wound the world kept reopening, wearing the shape of everyone who ever tried to close it. It wore your shape last. The blade is lighter than it has ever been. Somewhere, far above, something that has not been able to for a very long time begins, tentatively, to heal.",
    keyStats: { 'HP': 4200, 'Speed': '125 px/s', 'Contact Damage': 22, 'Weight': 7, 'Mechanic Cycle CD': '2.5s', 'Floor Collapse CD': '1.3s (Phase 2)', 'Fake Death Threshold': '34% HP', 'Regen Rate': '5%/s to 46%', 'Shock Damage': 18, 'Sweeper Damage': 18, 'Cross Damage': 16 },
  },
];

// Index
const indexContent = `---
title: Boss Overview
description: All five bosses in Tear — their phases, stat data, and strategies.
gameVersion: v0.1
---

Tear features **five unique bosses**, one at the end of each campaign stage. Defeating a boss always grants an **Ability Tier-Up**, letting you evolve one of your owned tiered abilities.

## Boss Roster

| Stage | Boss | HP | Phases | Difficulty |
|---|---|---|---|---|
${BOSSES.map(b => `| ${b.stage} — ${b.stageName} | [${b.name}](/bosses/${b.slug}) | ${b.hp} | ${b.phases.length} | ${b.stage === 5 ? '★★★★★' : '★'.repeat(b.stage) + '☆'.repeat(5-b.stage)} |`).join('\n')}

## Boss Scaling

Bosses also scale with the game mode and difficulty multipliers. In **Gauntlet** mode, all five bosses cycle every 8 waves, growing progressively stronger each cycle.

Tip: **Tiered abilities** (Bloodrite, Storm Recall, Backlash, etc.) gain their most powerful upgrades from boss kills — these are the abilities to invest in during a full campaign run.
`;

fs.writeFileSync(path.join(OUT_DIR, 'index.mdx'), indexContent);
console.log('✔ bosses/index.mdx');

for (const b of BOSSES) {
  const phaseBlocks = b.phases.map((p, i) => `### ${p.name}

${p.desc}

:::tip[Strategy]
${p.tip}
:::`).join('\n\n');

  const content = `---
title: "${b.name}"
description: "${b.blurb} — Stage ${b.stage} boss."
gameVersion: v0.1
---

import StatBlock from '../../../components/StatBlock.astro';
import BiomeBadge from '../../../components/BiomeBadge.astro';

<BiomeBadge stages={["${b.stageName}"]} />

> *${b.blurb}*

**Stage ${b.stage} Boss.** Found at the end of [${b.stageName}](/stages/${b.slug.replace('the-', 'the-').replace('iron-colossus','the-undercroft').replace('aldric','the-crimson-fields').replace('warden','the-grounds')}).
Defeating ${b.name} grants an **Ability Tier-Up**.

<StatBlock
  name="${b.name}"
  color="${b.color}"
  stats={{
${Object.entries(b.keyStats).map(([k, v]) => `    '${k}': '${v}',`).join('\n')}
  }}
/>

## Phases

${b.phases.length} phases total. Phase transitions are triggered by HP thresholds.

${phaseBlocks}

## Lore

> ${b.lore}
`;

  fs.writeFileSync(path.join(OUT_DIR, `${b.slug}.mdx`), content);
  console.log(`✔ bosses/${b.slug}.mdx`);
}

console.log('\n✅ Boss stubs generated successfully.');
