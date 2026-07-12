---
title: Parry & Deflect
description: Full guide to deflecting and parrying projectiles in Tear — thresholds, timing windows, damage reduction, and upgrade synergies.
gameVersion: v0.1
---

Tear has no dodge-roll and no block. Your defensive options are the **dash** (with its i-frames) and the **parry/deflect** system — actively redirecting enemy projectiles with the blade. Mastering parries converts the biggest source of incoming damage into a source of style points and counter-damage.

---

## Deflect

A **Deflect** occurs when the blade tip hits an incoming projectile at sufficient speed. The projectile is reflected back toward the enemy that fired it.

| Property | Value |
|----------|-------|
| **Minimum tip speed** | 700 px/s |
| **Deflected shot speed modifier** | ×1.25 (reflected shot is 25% faster than original) |
| **Style gain** | Yes — Deflect is a trick type |

Any swing that contacts a projectile at ≥700 px/s will deflect it. The reflected shot deals the original projectile's damage to whoever it hits (typically the shooter).

:::tip
The deflect threshold (700 px/s) is quite low — even a light batting swing while walking works. You don't need a full committed swing to deflect; you just need the tip moving in the right direction.
:::

---

## Perfect Parry

A **Perfect Parry** is achieved by hitting a projectile with the blade tip moving at **≥2 400 px/s**. This triggers enhanced effects beyond a basic deflect.

| Property | Value |
|----------|-------|
| **Minimum tip speed** | 2 400 px/s |
| **Effect** | Homing ricochet + screen slow-motion |
| **Slow-mo duration** | 0.18 s |
| **Slow-mo timescale** | 0.28× (world slows to 28% speed) |

The **homing ricochet** means the returned shot actively tracks toward the nearest enemy rather than just flying in the reflection angle. Against groups, this is reliably a guaranteed kill.

The **slow-motion window** gives you a brief breathing room to react and continue your combo.

---

## Counter-Parry Factor

You can **lower the perfect parry threshold** by swinging the blade back toward the direction the projectile came from, rather than at any arbitrary angle:

| Condition | Effective Threshold |
|-----------|-------------------|
| Standard swing at projectile | 2 400 px/s |
| Counter-parry (swing back at source) | ~1 320 px/s (0.55× of 2 400) |

`counter-parry factor: 0.55` — swinging directly back at the shooter reduces the perfect parry speed requirement by 45%. This rewards reading where the shot came from and meeting it head-on.

---

## Parry Guard (Riposte Upgrade)

With the **Riposte** upgrade equipped, performing a perfect parry grants a temporary damage reduction window:

| Property | Value |
|----------|-------|
| **Damage reduction** | 60% less damage taken |
| **Duration** | 1.2 s |

This is the primary defensive upgrade in the parry tree and makes aggressive parry play significantly more survivable.

---

## Flow Guard

Separate from the parry system, **Flow Guard** is a passive benefit of maintaining a high style tier:

| Condition | Effect |
|-----------|--------|
| Style tier ≥ 3 (BRUTAL) | −30% damage taken |

This is always-on while at BRUTAL or higher. Combined with Riposte's 60% post-parry window, a skilled player can reduce incoming damage by a significant fraction during peak play.

---

## I-Frames Reference

| Source | Duration |
|--------|----------|
| **Hit invulnerability** | 0.9 s after taking any damage |
| **Dash** | 0.15 s (full duration of the dash) |

The 0.9 s post-hit invulnerability prevents follow-up hits from the same burst of projectiles from stacking, but it is not long enough to safely ignore sustained fire. Use the hit i-frames to reposition and get back into parry range.

---

## Deflect vs. Perfect Parry Comparison

| | Deflect | Perfect Parry |
|-|---------|---------------|
| Tip speed required | 700 px/s | 2 400 px/s (or ~1 320 with counter-parry) |
| Shot returned? | Yes | Yes (homing) |
| Slow-mo? | No | Yes (0.18s at 0.28×) |
| Style gain | Yes | Yes (more) |
| Requires upgrade? | No | No (Riposte extends it) |

---

## Parry Tips & Techniques

:::tip
**Read the shot colour.** Enemy shots are coloured `#e23b3b` (red) by default. A deflected shot turns `#1faf5a` (green); a perfect-parried shot turns `#13c4d6` (cyan) with the homing arc. This colour flip lets you instantly confirm which tier of parry you hit.
:::

:::tip
**Parry clusters by hitting early.** Because reflected shots travel faster (×1.25), hitting the first projectile of a volley with a good sweep can reflect it into the trailing projectiles, daisy-chaining deflects without additional inputs.
:::

:::caution
**Parrying does not prevent the knockback hit.** If you deflect a shot but the blade isn't fully between you and the projectile, it may still graze you. Aim to intercept shots before they reach your hitbox.
:::
