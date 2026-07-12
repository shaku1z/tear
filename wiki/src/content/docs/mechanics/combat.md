---
title: Combat & Damage
description: Detailed combat damage formulas, hit detection, style bonuses, throw damage, i-frames, and hitstop values for Tear.
gameVersion: v0.1
---

Every number in Tear's combat system is deterministic and derivable. This page documents the exact formulas and config values so you can understand precisely how damage is calculated.

---

## Melee Damage Formula

```
damage = (tipSpeed − minHitSpeed) × damageScale × angleModifier × commitModifier × styleMod
```

| Variable | Value | Description |
|----------|-------|-------------|
| `tipSpeed` | varies (max 7 000 px/s) | Speed of the blade tip at impact |
| `minHitSpeed` | 950 px/s | Minimum tip speed to register a hit at all |
| `damageScale` | 0.0092 | Damage per px/s above the minimum |
| `angleModifier` | 0.4 – 1.0 | See Poke vs. Cut below |
| `commitModifier` | 0.5 – 1.0 | See Commitment below |
| `styleMod` | 1.0 – 1.40 | See Style Bonus below |

**Max raw damage per swing: 58** (before style and other bonuses).

---

## Poke vs. Cut (Angle Modifier)

The angle at which the blade tip strikes the enemy surface determines the `angleModifier`:

| Strike Type | Modifier | Description |
|-------------|----------|-------------|
| Pure perpendicular slash | 1.0 | Blade crosses the enemy at 90° — maximum |
| Pure straight poke | 0.4 (`pokeFloor`) | Blade tip drives straight into the target |
| Diagonal / angled | Between 0.4 and 1.0 | Interpolated by the sine of the attack angle |

This means the **geometry of your swing matters**. Swinging *across* an enemy's body deals full damage; prodding it from the front deals only 40%.

:::tip
To maximise damage, think of each swing as a slashing motion — the tip should travel *perpendicular* to the line between you and the target, not toward it.
:::

---

## Commitment Modifier

Even at the same tip speed, a swing from a stationary player body is penalised compared to one where the player is also moving:

| Condition | Modifier |
|-----------|----------|
| Still hand (hilt speed ≈ 0) | 0.5 (`commitFloor`) |
| Full committed arm swing (hilt ≥ 620 px/s) | 1.0 |
| Intermediate | Linearly interpolated |

`commitRef` = 620 px/s (the hilt speed at which you get full commitment).

A "tip-flick with a still hand" — e.g., twitching the cursor rapidly while standing still — gets 50% commitment. Walking, dashing, or physically moving your body into the swing pushes this toward 1.0.

---

## Style Damage Bonus

Your current style tier at the moment of the hit adds a multiplicative damage bonus:

| Style Tier | Tier Number | Bonus |
|------------|-------------|-------|
| NICE | 1 | +0% |
| STYLISH | 2 | +6% |
| BRUTAL | 3 | +12% |
| SAVAGE | 4 | +18% |
| TEARING! | 5 | +24% |

Each tier above 1 adds 6%, capped at **+40%** total (accounting for upgrade synergies that can push this higher than the raw tier math).

---

## Per-Enemy Hit Cooldown (i-frames)

After the blade hits an enemy, that specific enemy has a **0.18 s** invincibility window (`enemyHitIframe`) before it can be hit again. This prevents a single stationary blade from dealing infinite damage to a standing target.

- The cooldown is **per-enemy** — you can hit three different enemies in the same swing without any cooldown penalty.
- The blade tip passing through an enemy at high speed hits once; slowing the blade on the enemy by holding it there after the strike won't land additional hits until the iframe expires.

---

## Hitstop

Strong hits briefly **freeze** the game to communicate impact:

| Threshold | Duration | Type |
|-----------|----------|------|
| Damage > 22 | 0.07 s | Heavy hitstop |
| Damage ≤ 22 | 0.025 s | Light hitstop |

Hitstop freezes all entity movement briefly — it is a feel/juice feature and does not affect damage calculation. It also helps the player confirm that a strong hit landed.

---

## Thrown Blade Damage

The thrown blade uses a separate damage formula:

```
throwDamage = 22 + (0.008 × launchSpeed)
```

Where `launchSpeed` is the speed at which the blade was thrown (base 1 900 px/s + tip speed bonus).

| Launch Speed | Throw Damage |
|-------------|-------------|
| 1 900 px/s (minimum) | 37.2 |
| 3 000 px/s | 46.0 |
| 4 600 px/s (maximum) | 58.8 |

### Throw Health Modifier

The throw damage is also modified by your current HP fraction:

| Condition | Throw Modifier |
|-----------|---------------|
| Above 50% max HP | ×1.4 |
| Below 50% max HP | ×0.65 |

This creates an interesting risk/reward: a healthy player's throw is much stronger, while a near-death throw is weaker — but the recall path (returning through enemies on the way back) gets the reverse logic, making desperation recalls a potential comeback tool.

---

## Damage Summary Quick-Reference

| Source | Typical Damage |
|--------|---------------|
| Light swing (low speed, poke) | 5–12 |
| Standard swing (clean cut) | 25–40 |
| Max-speed perpendicular slash | ~55–58 (pre-modifiers) |
| Throw (base speed) | ~37 |
| Throw (max speed) | ~59 |
| Power Slam (×1.8 mod) | 45–100+ |
| Launch hit | 30–70+ |
