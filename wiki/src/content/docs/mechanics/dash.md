---
title: Dash
description: Complete dash mechanics for Tear — speed, duration, cooldown, i-frames, steering, and all dash upgrades.
gameVersion: v0.1
---

The dash is your primary mobility and evasion tool. Used well, it provides brief invincibility, repositioning, and synergises with a range of upgrades that turn it into an offensive or defensive tool.

---

## Base Dash Stats

| Property | Value |
|----------|-------|
| **Burst speed** | 1 500 px/s |
| **Duration** | 0.15 s |
| **Cooldown** | 0.55 s |
| **I-frames** | 0.15 s (entire dash duration) |
| **End speed retention** | 35% of dash speed carried into normal movement |
| **Charges (base)** | 1 |

---

## How to Dash

- **Shift** key while moving — dashes in your current movement direction.
- **Double-tap A or D** — dashes in that direction.
- In the air, dashes behave identically unless modified by the Air Dash upgrade.

The 35% speed retention means you exit a dash with a short burst of speed (525 px/s) that blends into your normal movement, giving dashes a smooth, fluid feel rather than an abrupt stop.

---

## Mid-Dash Steering

While dashing, you can subtly bend the trajectory by holding a movement direction different from the initial dash angle. The steering factor is **15** — relatively low, meaning you can curve the dash arc slightly but cannot do a full U-turn mid-dash.

This is useful for threading through tight enemy formations or curving around a projectile that shifted trajectory.

---

## I-Frames

Invincibility frames are active for the **entire 0.15 s duration** of the dash. During this window:
- All contact damage is ignored.
- All projectile hits are ignored.
- Status effects cannot be applied.

The i-frames end the moment the dash ends. This means **timing a dash against a projectile** — rather than a reflexive button-tap — is the correct use. Dashing too early or too late around a shot wastes the window.

:::caution
The cooldown begins when the dash *ends*, not when it starts. Net time between available dashes is: 0.15 s duration + 0.55 s cooldown = **0.7 s turnaround**. Plan accordingly during dense projectile barrages.
:::

---

## Dash Upgrades

### Air Dash
- Grants a **second dash charge**.
- The extra charge **refills on landing** (touching the ground).
- In the air, having two charges allows a double-dash: dash once horizontally, then dash again to cover more ground or dodge a second shot.

### Phantom Dash
- While dashing, you **pass through enemies and deal damage** to any enemy your body passes through.
- Damage is proportional to base dash speed.
- Primarily offensive — converts the dash from pure evasion into a brief combo extender.

### Cinder Trail
- Dashing through or past an enemy **ignites them** (applies BURN status).
- BURN: 20 dmg/s for 2.6 s.
- Combined with Phantom Dash, every dash through an enemy damages and burns them simultaneously.

### Phase Step
- **Dashing through a projectile deflects it** — as if you had hit it with the blade.
- The deflect obeys the same deflect rules (700 px/s minimum; the dash speed of 1 500 px/s easily meets this).
- This makes Phase Step a powerful defensive-offensive upgrade: dash through a shot, it bounces back at the shooter.

---

## Upgrade Interaction Table

| Upgrade | Primary Effect | Synergy Notes |
|---------|---------------|---------------|
| **Air Dash** | +1 charge, refills on land | Stack with Phantom Dash for multi-hit aerial passes |
| **Phantom Dash** | Damages enemies on pass-through | Combine with Cinder Trail to apply BURN |
| **Cinder Trail** | Burns enemies on pass-through | With Phantom: damage + burn in one dash |
| **Phase Step** | Dash deflects projectiles | Every dodge is also a parry opportunity |

---

## Timing & Rhythm

In high-wave play, the dash rhythm looks like this:

```
See shot incoming → identify direction → dash → i-frames absorb the shot → 
land and deal → cooldown (0.55s) → ready for next
```

The ~0.7 s full cycle means you can dash roughly **1.4 times per second** at maximum efficiency. Against rapid-fire enemies, this requires careful prioritisation of which shots to dodge versus which to parry with the blade.

:::tip
If you have both Phase Step and a reliable parry, dash through the hardest shot to deflect (fast, curving) and parry the slower shots manually. This division of labour lets you handle mixed projectile types without being overwhelmed.
:::
