---
title: Overview
description: What is Tear? An introduction to the core loop, game modes, style system, and design philosophy.
gameVersion: v0.1
---

## What is Tear?

**Tear** is a skill-based 2-D action game where your only weapon is a spring-physics blade. You play as a stark black-on-white silhouette moving through arenas filled with vividly coloured enemies — the game's entire colour budget belongs to your opponents. The contrast is intentional: you are the absence of chaos, carving through it with precision.

Survivability is not handed to you. There is no passive regeneration, no health-on-kill by default, no tank build to hide behind. Staying alive means reading projectiles, landing parries, and moving with intent.

---

## The Core Loop

```
Start wave → fight enemies → earn coins → between waves: buy upgrades from the shop
→ wave 9 complete → face the stage boss → next stage begins
```

Each **wave** is a discrete round of enemies that must be cleared before the next spawns. Between waves a small shop rotates upgrade offers — you pick one (or skip) with coins earned from kills.

After the ninth wave of a stage the **boss** arrives. Defeat it to advance to the next stage and claim an **Ability Tier-Up**, which powers up one of your existing upgrades.

---

## Stages & Biomes

The campaign spans **5 stages**, each set in a distinct **biome**. Each biome has its own visual identity, enemy roster, and environmental colour palette that also changes how the HUD is rendered.

| Stage | Biome |
|-------|-------|
| 1 | Ruins |
| 2 | Canopy |
| 3 | Depths |
| 4 | Sanctum |
| 5 | Apex |

Enemy HP scales **+6% per wave** within a stage and **+34% between stages**, ensuring difficulty rises steadily without artificial spikes.

---

## Game Modes

| Mode | Summary |
|------|---------|
| **Adventure** | The campaign. 5 stages, 9 waves + boss each. Completing it earns the *Sealed* achievement. |
| **Endless** | Infinite waves with escalating HP (+12%/wave). Score-chasing competitive mode. |
| **Gauntlet** | Infinite waves with a full boss every 8 waves, cycling all five in order. |
| **Playground** | Open sandbox — spawn any enemy, grab any ability at any tier. |
| **Tutorial** | Guided skill drills: swings, slams, power slams, launches, throws, parries. |
| **Boss Test** | Fight any boss directly for practice. |
| **Enemy Test** | Spawn isolated enemy types for study. |

See [Modes & Difficulties](/modes/) for the full breakdown including difficulty modifiers.

---

## The Style Meter

At the heart of Tear is the **style meter** — a trick gauge that rewards varied, creative play. Performing actions (hits, slams, launches, parries, throws, deflects) builds the meter through five tiers:

| Tier | Name |
|------|------|
| 1 | NICE |
| 2 | STYLISH |
| 3 | BRUTAL |
| 4 | SAVAGE |
| 5 | TEARING! |

Higher tiers grant **swing damage bonuses** (+6% per tier above 1, up to +40%) and unlock passive benefits like **Flow Guard** (30% damage reduction at tier 3+). The catch: **taking a hit costs 50% of your meter**, so staying in the upper tiers requires genuine evasion skill.

See [Style Meter](/mechanics/style-meter) for full mechanics.

---

## Design Philosophy

- **Reads, not reflexes alone.** Enemies telegraph attacks. Learning those tells is the game.
- **Input fidelity.** The blade reacts to the *quality* of your swing — angle, speed, commitment — not just whether you pressed a button.
- **Colour as information.** Enemy type, affix, status, and boss phase are all communicated through the colour of your opponents since the player character carries none.
- **No floor for skill.** From your first run to wave 100 of Endless, the skill ceiling keeps rising.
