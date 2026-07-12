---
title: Adventure Mode
description: Deep-dive into Tear's campaign — 5 stages, wave structure, enemy HP scaling, boss rewards, and campaign completion.
gameVersion: v0.1
---

Adventure mode is Tear's primary campaign and the recommended starting point. It teaches you every mechanic organically through progressively harder waves and biome-specific enemy rosters.

---

## Structure

```
Stage 1 (Ruins)     → 9 Waves + Boss 1
Stage 2 (Canopy)    → 9 Waves + Boss 2
Stage 3 (Depths)    → 9 Waves + Boss 3
Stage 4 (Sanctum)   → 9 Waves + Boss 4
Stage 5 (Apex)      → 9 Waves + Boss 5 (Final)
```

Each stage:
- Has 9 combat waves followed by a boss encounter.
- Introduces new enemy types suited to the biome.
- Has its own visual palette that affects HUD colour rendering.

---

## Wave Structure

| Element | Detail |
|---------|--------|
| **Waves per stage** | 9 (+ 1 boss) |
| **Enemy count** | Starts small, increases through the stage |
| **Shop access** | Between each wave |
| **Boss wave** | Wave 10 — no shop before the boss |

During each wave you must eliminate all enemies to proceed. There is no time limit, but the style meter decays after 2.6 s of inactivity, so prolonged idling will cost your tier.

---

## HP Scaling

Enemy HP scales at two levels:

### Within a Stage
Each wave in a stage, enemy base HP is multiplied:

```
wave_HP = base_HP × (1.06 ^ wave_index)
```

| Wave | HP Multiplier |
|------|--------------|
| 1 | ×1.00 |
| 2 | ×1.06 |
| 3 | ×1.12 |
| 4 | ×1.19 |
| 5 | ×1.26 |
| 6 | ×1.34 |
| 7 | ×1.42 |
| 8 | ×1.50 |
| 9 | ×1.59 |

### Between Stages
Each stage transition applies a **+34% HP multiplier** on top of all prior scaling:

```
stage_HP_base = previous_stage_base × 1.34
```

| Stage | Cumulative Stage Multiplier |
|-------|---------------------------|
| 1 | ×1.00 |
| 2 | ×1.34 |
| 3 | ×1.80 |
| 4 | ×2.41 |
| 5 | ×3.23 |

Combined with wave-within-stage scaling, a Stage 5 Wave 9 enemy has roughly **5.1× the HP** of a Stage 1 Wave 1 enemy. Build your run to scale accordingly.

---

## Shop & Upgrades

After every wave (waves 1–9), you visit the inter-wave shop. The shop offers a rotating selection of upgrade options. You may:

- **Buy one upgrade** with your current coins.
- **Skip** (free — no cost).
- **Reroll** the shop (costs a small coin fee, increases with each reroll).

Upgrades are tiered (T1, T2, T3). Higher tiers cost more coins but have significantly stronger effects. You can only purchase T2 of an upgrade if you already own T1, and similarly for T3.

---

## Boss Encounters

After wave 9 of each stage, the **Boss** arrives. This is a unique, scripted enemy with phases, visual tells, and significantly more HP than standard enemies.

**On boss defeat:**
- You receive an **Ability Tier-Up** — this upgrades one of your current abilities to the next tier for free, without spending coins.
- The next stage's wave 1 begins.

Boss encounters do not have a shop before them — enter with whatever you have from the preceding 9 waves.

---

## Campaign Completion

Defeating the Stage 5 Boss completes the campaign. Doing so awards the **Sealed** achievement (Epic, 50 shards).

| Run Outcome | Reward |
|------------|--------|
| Complete all 5 stages | **Sealed** achievement (Epic) |
| Each boss defeated | Ability Tier-Up |
| Full no-hit stage | **Immortal Run** achievement (Rare) |

:::note
Your upgrades, coins, and style tier **do not** persist between runs. Each Adventure run starts from scratch. The strategic decisions you make in the shop are the primary expression of run-to-run variety.
:::

---

## Progression Tips

:::tip
**Draft for the stage, not the run.** If you're entering Stage 3 (Depths), the enemy roster shifts toward Flyers and Armored types. Prioritise upgrades that handle airborne targets (Launch enhancers, throw damage) before spending on ground-attack skills.
:::

:::tip
**Hold coins for Stage bosses.** By wave 7–8, you should have a clear picture of what your build needs. Saving coins for a single big upgrade on wave 8 or 9 is often better than buying marginal upgrades every wave.
:::
