---
title: UI Guide
description: A breakdown of every HUD element in Tear — HP bar, style meter, wave counter, coin display, and more.
gameVersion: v0.1
---

Tear's HUD is intentionally minimal. Every element has a purpose and nothing is decorative. This page explains what each element shows and where to look during a run.

---

## HP Bar

**Location:** Top-left corner.

- Represents your current health out of a **100 HP base**.
- Depletes on contact damage, projectile hits, or environmental hazards.
- **Shield pips** appear beneath the HP bar if you have the **Aegis** ability. Each pip represents one shield charge that absorbs one instance of damage before HP is lost.
- There is no passive regeneration. The only way to restore HP is through specific upgrades (e.g., healing on boss kill) or consumables obtained between waves.

:::caution
Taking a hit not only reduces HP — it also costs **50% of your current style meter**, which can drop you two or three tiers instantly. Protecting your HP means protecting your damage output and passive bonuses simultaneously.
:::

---

## Style Meter

**Location:** Prominently displayed, typically center or upper-center of screen.

The style meter is a gauge that fills as you perform tricks (hits, slams, launches, parries, throws, deflects). It decays when idle and collapses on a hit. The meter is divided into five named tiers:

| Tier | Name | Effect |
|------|------|--------|
| 1 | **NICE** | Baseline |
| 2 | **STYLISH** | +6% swing damage |
| 3 | **BRUTAL** | +12% swing damage, Flow Guard active (−30% damage taken) |
| 4 | **SAVAGE** | +18% swing damage |
| 5 | **TEARING!** | +24% swing damage (stacks with other bonuses for up to +40% total) |

See [Style Meter](/mechanics/style-meter) for decay rates, variety bonuses, and trick types.

---

## Wave Counter

**Location:** Top area, near center or top-right.

Displays the current wave number and, in stages, the total waves per stage (e.g., **Wave 4 / 9**). In Endless mode it shows the wave number only.

An **enemy queue indicator** below (or beside) the wave counter shows:
- How many enemies are remaining in the current wave.
- A small preview of upcoming enemy types (shown as coloured icons matching the enemy's colour code).

This lets you plan — if you see two Armored enemies queued, you may want to hold your blade for the correct angle rather than burning energy on a slam.

---

## Coin Display

**Location:** Near the score or top-right cluster.

Coins are earned per kill. The **amount per kill** is multiplied by:

1. **Wave number** — later waves pay more per kill.
2. **Style combo** — a higher style tier at the moment of the kill multiplies the coin drop.

Coins persist between waves and are spent at the inter-wave shop. They do **not** carry over between runs.

---

## Score Display

**Location:** Top-right.

Score accumulates throughout a run and is used for leaderboards (primarily Endless mode). The base formula is:

```
Score per kill = 6 × wave_number × style_multiplier
```

The style multiplier scales with your current tier at the moment of the kill, making it valuable to maintain a high style tier during fights rather than just surviving.

---

## Blade Reticle

The small crosshair or indicator that orbits the player shows where the blade is currently targeting. It orbits at a fixed **85 px radius** from the player center.

- When you hold left-click, the reticle snaps toward the mouse cursor position within that orbit.
- The reticle is colour-coded to indicate the blade's current status (normal, thrown, embedded, etc.).

---

## HUD Colour Adaptation

Because Tear's visual identity relies on high-contrast colour against the arena background, the HUD automatically switches its colour scheme to maintain readability:

- **Dark biomes** (Depths, Apex): HUD renders in **light-on-dark** — white or bright text and icons.
- **Light biomes** (Ruins, Canopy, Sanctum): HUD renders in **dark-on-light** — black or dark text and icons.

This flip happens automatically at biome transitions and is not player-configurable. The underlying logic checks the background luminance of the current biome palette and inverts the HUD foreground to ensure contrast.

---

## Summary Table

| Element | Location | What it shows |
|---------|----------|---------------|
| HP bar | Top-left | Current HP / 100; Aegis shield pips |
| Style meter | Top-center | Trick gauge, current tier name |
| Wave counter | Top area | Current wave, total waves (stage mode) |
| Enemy queue | Below wave counter | Remaining enemies + next-type preview |
| Coin display | Top-right cluster | Current coin balance |
| Score display | Top-right | Cumulative run score |
| Blade reticle | Around player | Blade aim orbit (85 px radius) |
