---
title: Endless Mode
description: How Tear's Endless mode works — wave scaling, HP growth, biome cycling, score strategy, and competitive play.
gameVersion: v0.1
---

Endless mode is the **competitive heart of Tear**. Waves continue indefinitely, scaling harder with each one. Your score is your legacy.

---

## How It Works

Endless begins at wave 1 and continues until you die. There is no campaign structure, no boss gates (unless mini-bosses crash in), and no win condition. The only goal is to last as long as possible while maintaining the highest score.

---

## Enemy Scaling

| Property | Formula |
|----------|---------|
| **HP per wave** | `base_HP × (1.12 ^ wave_number)` |
| **Starting enemies** | 3 on wave 1 |
| **Enemy count growth** | +1.4 enemies per wave |

| Wave | HP Multiplier | Approx. Enemy Count |
|------|--------------|-------------------|
| 1 | ×1.00 | 3 |
| 5 | ×1.76 | 9 |
| 10 | ×3.11 | 17 |
| 20 | ×9.65 | 31 |
| 50 | ×289× | 73 |
| 100 | ×83 753× | 143 |

:::caution
At high wave counts, enemy HP outpaces raw damage output. Status effects (BLEED, BURN, MARK), Power Slam detonations, and burst combos become increasingly important relative to normal swing damage.
:::

---

## Biome Cycling

Biomes cycle every set number of waves in Endless mode:

| Waves | Active Biome |
|-------|-------------|
| 1–10 | Ruins |
| 11–20 | Canopy |
| 21–30 | Depths |
| 31–40 | Sanctum |
| 41–50 | Apex |
| 51+ | Cycles from Ruins |

Each biome cycle brings a reset of the enemy roster to that biome's set, but with **cumulative HP scaling** — so Ruins on cycle 2 (wave 51+) features the same enemy types as cycle 1, but with far higher HP.

---

## Mini-Bosses

Occasionally, a **mini-boss** will crash into Endless outside of a scheduled boss wave. Mini-bosses are scaled versions of campaign bosses with reduced HP and a simpler move set. They are not scheduled — their arrival is semi-random and serves as an escalation pressure valve.

Killing a mini-boss drops a **bonus coin reward** and awards a chunk of style meter.

---

## Score System

Score is the primary metric of Endless performance:

```
Score per kill = 6 × wave_number × style_multiplier
```

| Style Tier | Style Multiplier |
|------------|-----------------|
| NICE | 1.0× |
| STYLISH | 1.2× |
| BRUTAL | 1.4× |
| SAVAGE | 1.6× |
| TEARING! | 2.0× |

The score grows **exponentially** with wave number, meaning reaching wave 50 is worth massively more score than reaching wave 25 twice. Consistent play that keeps pushing waves is more score-efficient than dying and restarting.

The **style multiplier** at the moment of the kill makes TEARING! tier worth 2× the raw kills of NICE. A player at constant TEARING! scoring will accumulate score at double the rate of an equivalent player staying at NICE tier.

---

## Shop in Endless

Endless uses the same inter-wave shop system as Adventure. You earn coins, buy upgrades, and can reroll. There are no stage gates, so:

- Upgrades compound continuously without a boss resetting the equation.
- By wave 20–30, most runs have a full T3 build online.
- Late-game strategy (wave 50+) focuses on staying alive long enough to keep applying escalating modifiers.

---

## Competitive Tips

:::tip
**Prioritise style maintenance over kill speed.** A slightly slower kill rate at TEARING! is worth more score than a rapid kill rate at NICE. Take the time to chain tricks.
:::

:::tip
**Status effects over raw damage at high waves.** BLEED stacks at 48 dmg/s and BURN at 20 dmg/s — these numbers don't scale with enemy HP, but they become proportionally significant as HP gets very high. Rupture + Cinder + Sunder builds extend viability into the 50s+ waves.
:::

:::tip
**Track your best wave, not just your score.** Score is influenced by luck (wave composition, shop rolls). Reaching your personal best wave number is the cleaner measure of skill progress.
:::
