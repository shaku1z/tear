---
title: Slams & Launches
description: Complete guide to Slams, Power Slams, Updraft Launches, Aerial Raves, and their damage thresholds in Tear.
gameVersion: v0.1
---

Slams and Launches are the aerial combat expressions of the blade system. They require precise directional control over the blade tip but reward you with the highest single-hit damage values in the game and strong style meter gains.

---

## Slams

A **Slam** occurs when the blade tip is moving **downward** fast enough to trigger the slam condition. It deals bonus damage and creates a visual shockwave on impact.

| Property | Value |
|----------|-------|
| **Slam damage multiplier** | ×1.8 |
| **Minimum downward tip speed** | 1 750 px/s |

To slam, you need the blade tip moving downward at ≥1 750 px/s. This is typically achieved by:
- Swinging down while positioned *above* an enemy.
- Combining a downward mouse arc with horizontal movement to direct the spring outward and down.

:::tip
Jump over an enemy, hold left-click, and sweep the mouse straight down just before releasing. The spring-loaded tension plus gravity gives the tip excellent downward velocity.
:::

---

## Power Slams

A **Power Slam** is a slam performed while **the player is also descending at speed**. The player's own falling velocity adds momentum to the tip, dramatically increasing damage.

| Property | Value |
|----------|-------|
| **Player descent speed threshold** | ≥ 1 700 px/s |
| **Empowerment fraction** | 0.5 (above this fraction of descent speed, the bonus scales) |
| **Maximum extra damage from descent** | +70% |
| **Visual indicator** | "POWER SLAM ⇊" on-screen |

The bonus is continuous — the faster you're falling within the slam arc, the more bonus you receive, up to +70% on top of the base ×1.8 slam multiplier.

**Combined maximum:** 1.8 × 1.7 = **×3.06 base damage** for a maximum-descent Power Slam.

:::tip
**Jump, wait for peak descent, then slam.** Jumping off a high ledge and slamming just before landing can one-shot many mid-tier enemies.
:::

---

## Launches (Updraft)

A **Launch** is the upward counterpart to the slam. When the blade tip strikes an enemy with sufficient **upward** velocity, it launches (pops) the enemy airborne.

| Property | Value |
|----------|-------|
| **Minimum upward tip speed** | 1 250 px/s |
| **Launch imparted velocity** | 780 px/s upward (on the enemy) |

To launch, sweep the blade tip **upward** through an enemy — typically from below, directing the mouse upward in an arc. Launched enemies become airborne and vulnerable to aerial follow-up attacks.

---

## Rising Launch Bonus

If the *player* is also **rising** (ascending) at the moment of the launch, two bonuses apply:

| Bonus | Effect |
|-------|--------|
| **Rising damage bonus** | Up to +90% extra launch damage (vs. `risingSpeedRef` of 850 px/s) |
| **Rising pop bonus** | Up to +70% extra knockback on the launched enemy |

These are both proportional to how fast the player is rising relative to 850 px/s. A maximum-speed upward dash or jump followed immediately by an upward swing can trigger near-maximum values.

**Combined:** A fully committed rising launch can deal roughly **2× base damage** and send enemies flying dramatically high, enabling extended aerial combos.

---

## Aerial Rave

While airborne, consecutive hits receive a growing damage multiplier:

| Property | Value |
|----------|-------|
| **Maximum aerial bonus** | +50% |
| **Trigger** | Staying airborne and landing hits |
| **How it scales** | Grows progressively the longer you stay airborne and keep hitting |

The Aerial Rave stacks alongside slam, style, and commitment bonuses. An airborne combo — launch → aerial swing → aerial swing → Power Slam landing — can produce some of the game's highest burst windows.

---

## Slam vs. Launch Comparison

| | Slam | Launch |
|-|------|--------|
| Tip direction | Downward (↓) | Upward (↑) |
| Min tip speed | 1 750 px/s | 1 250 px/s |
| Base multiplier | ×1.8 | × — (no universal mult, but rising bonus up to +90%) |
| Player state bonus | Power Slam at descent ≥1 700 px/s | Rising bonus at ascent speed |
| Enemy result | Shockwave / knockdown | Launches enemy airborne |
| Follow-up | Ground pound repeat, or retreat | Juggle, aerial rave, or throw |

---

## Trick Chaining

Both slams and launches are **trick types** that build the style meter. Performing one immediately after the other gets the **variety bonus** (×1.5 style points) since the trick type differs.

Optimal style chain example:

```
Launch (enemy airborne) → Aerial Swing → Aerial Swing → Slam (enemy comes back down)
→ Launch again (variety!) → Throw (variety!) → Recall (variety!)
```

This chain can sustain TEARING! for extended periods and maximises coin drops per enemy.
