---
title: Status Effects
description: All status effects in Tear — BLEED, BURN, and MARK — with durations, damage values, stacking rules, and upgrade interactions.
gameVersion: v0.1
---

Status effects are persistent damage-over-time or debuff conditions applied to enemies by specific upgrades. They are colour-coded on the afflicted enemy and interact with higher-tier upgrades in complex ways.

---

## BLEED

**Colour:** Red tint on enemy.

BLEED deals consistent damage over time and stacks to very high levels with the right upgrades.

| Property | Value |
|----------|-------|
| **Damage per second** | 6 dmg/s per stack |
| **Maximum stacks** | 8 |
| **Duration** | 3.2 s per stack (refreshes on re-application) |
| **Applied by** | Rupture, Impale upgrades |

**Maximum BLEED output:** 8 stacks × 6 dmg/s = **48 dmg/s**.

Duration refreshes each time a new stack is applied, so continuous pressure with bleed-applying upgrades can maintain maximum stacks indefinitely.

### BLEED Upgrade Tree Interactions

| Upgrade Tier | Effect |
|--------------|--------|
| **Rupture T1** | Applies BLEED on hit |
| **Rupture T2** | Power Slams **detonate** all BLEED stacks on the target — each stack deals its remaining damage as a burst |
| **Rupture T3** | On enemy death, **spreads** all current BLEED stacks to nearby enemies |

Rupture T2 makes the Power Slam + BLEED combo one of the game's highest burst windows. Build stacks on a group, then Power Slam one to detonate the stacks as a nuke, then — if T3 is active — the enemy's death spreads the stacks before they can expire.

---

## BURN

**Colour:** Orange glow on enemy.

BURN is a single-stack damage-over-time effect applied primarily by the Cinder Trail upgrade (dashing through enemies).

| Property | Value |
|----------|-------|
| **Damage per second** | 20 dmg/s |
| **Duration** | 2.6 s |
| **Applied by** | Cinder Trail (dash through), certain boss abilities |
| **Stacks?** | No — refreshes duration on re-application |

**Total BURN damage:** 20 × 2.6 = **52 damage** over full duration.

BURN has no stack limit — refreshing the timer on an already-burning enemy simply resets it to 2.6 s without multiplying the damage.

### BURN Upgrade Tree Interactions

| Upgrade Tier | Effect |
|--------------|--------|
| **Cinder T1** | Applies BURN on dash-through |
| **Cinder T2** | BURN spreads to nearby enemies when a burning enemy is hit |
| **Cinder T3** | When a burning enemy dies, it creates a **fire-nova** that deals burst AoE damage around it |

Cinder T3 enables a chain-reaction strategy: dash through one enemy, get it burning, knock it into a cluster, and let the fire-nova on death spread to the group. Pairs strongly with Phantom Dash (which enables consistent dash-through damage) and any launching/throwing skill that can drive a burning enemy into a crowd.

---

## MARK

**Colour:** Purple/magenta tint on enemy.

MARK is a debuff rather than a damage-over-time effect. It amplifies all damage the target receives from any source, making it a force-multiplier for burst combos.

| Property | Value |
|----------|-------|
| **Damage amplification** | +30% from all sources |
| **Duration** | 4 s |
| **Applied by** | Sunder, Backlash T2 upgrades |

MARK stacks multiplicatively with all other damage modifiers. A Power Slam against a MARKed, BLEEDing enemy at TEARING! style can produce enormous one-shot bursts.

### MARK Upgrade Tree Interactions

| Upgrade Tier | Effect |
|--------------|--------|
| **Sunder T1** | Applies MARK on hit |
| **Sunder T2** | **Shatters Armored guards** — MARKed Armored enemies lose their ground DR (damage reduction) for the duration |
| **Backlash T2** | Applies MARK on successful perfect parry |

Sunder T2 is particularly valuable in mid-to-late stages where Armored enemies and Sentinel presets (Armored + Warded + Tank) become common. Applying MARK removes the `groundDR` advantage that makes Armored enemies so tough to chip down with normal swings.

---

## Status Effect Interaction Matrix

| Status | Interacts with | Result |
|--------|---------------|--------|
| BLEED + Power Slam | Rupture T2 | Detonates stacks → burst damage |
| BLEED + Enemy Death | Rupture T3 | Spreads stacks to nearby enemies |
| BURN + Enemy Death | Cinder T3 | Fire-nova AoE |
| MARK + Armored enemy | Sunder T2 | Removes ground DR |
| MARK + BLEED | Any | BLEED ticks deal +30% more damage |
| MARK + BURN | Any | BURN ticks deal +30% more damage |

---

## Applying Multiple Effects

There is no rule preventing multiple statuses on a single enemy. A fully built status run can leave an enemy simultaneously:
- BLEEDing (8 stacks)
- BURNing (after a dash-through)
- MARKed (after a Sunder hit)

Total passive damage against such a target: 48 dmg/s (BLEED) + 20 dmg/s (BURN) + 30% amplification on all active ticks and incoming melee hits.

:::tip
Apply MARK first, then layer BLEED and BURN on top. Since MARK amplifies all damage from all sources, getting it on early maximises the value of every subsequent tick.
:::
