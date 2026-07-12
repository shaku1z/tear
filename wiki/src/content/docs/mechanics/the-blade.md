---
title: The Blade
description: Full technical breakdown of the Tear blade — spring physics, dimensions, aim system, throw mechanics, and all config values.
gameVersion: v0.1
---

The blade is Tear's only weapon and its most complex system. Understanding *how* it moves is the foundation of high-level play.

---

## Physical Properties

| Property | Value | Notes |
|----------|-------|-------|
| **Length** | 95 px | Hilt-to-tip |
| **Aim radius** | 85 px | The reticle orbits the player within this circle |
| **Min tether** | ~38 px (0.45 × 85) | How close the blade is pulled in while held |
| **maxReach** | 120 px | Elastic leash — the blade can stretch up to this before being snapped back |
| **maxSpeed** | 7 000 px/s | Hard cap on blade tip velocity |
| **Lead amount** | 0.45 | Fraction by which the tip leads ahead of the aim line at high speed |
| **angleSmooth** | 35 | How quickly the blade angle tracks the target — higher = snappier |

---

## Spring Physics System

The blade does not simply teleport to where you aim. It is attached to the player via a **spring**, and the spring has three parameters that govern its behaviour:

| Parameter | Value | Effect |
|-----------|-------|--------|
| **springStiffness** | 150 | How aggressively the spring pulls the blade toward the target |
| **damping** | 7.5 | Resistance to oscillation — prevents the blade from bouncing indefinitely |
| **gravity** | 900 px/s² | Downward pull on the blade when not held, giving it a natural droop |

When you hold left-click:
1. The blade is *tethered* and pulled toward the cursor within the aim radius.
2. The spring tension builds as the cursor moves.
3. On release, the spring snaps the blade outward — the tip whips through the target arc at high velocity.

The **elastic leash** (maxReach: 120 px) means the blade can stretch slightly beyond the aim radius during fast swings before being pulled back. This gives swings a satisfying elastic snap.

:::tip
A larger mouse movement (winding up from one side to the other) produces a higher spring velocity on release, resulting in more damage. Short, timid flicks don't build enough tension.
:::

---

## Aim Geometry

```
     Player
       │ ← 85px aim radius
       │
   [reticle] ← orbits this circle, tracking cursor
       │
     blade
```

- The **reticle** always stays within 85 px of the player.
- The **blade tip** can extend beyond this during swings (up to the leash limit of 120 px).
- The `lead amount` of 0.45 means: at maximum tip speed, the tip is 45% ahead of the nominal aim angle. This causes fast swings to *whip* through a wider arc.

---

## Throw

When you press right-click, the blade is launched as a **projectile** toward the cursor.

| Property | Value |
|----------|-------|
| **Base throw speed** | 1 900 px/s |
| **Release bonus** | +0.45 × tip speed at moment of throw |
| **Max throw speed** | 4 600 px/s |
| **Recall speed** | 3 400 px/s |
| **Recall activation distance** | 384 px |
| **Max flight time** | 2.5 s (auto-returns) |

### Tip-Speed Synergy

Because throw speed includes a bonus from tip speed at release, you can significantly increase throw speed by performing a fast swing immediately before right-clicking. A blade tip moving at 3 000 px/s adds 0.45 × 3 000 = **1 350 px/s** to the base 1 900, launching the throw at **3 250 px/s** — nearly the maximum.

:::note
The recall (return arc) also deals damage to enemies it passes through. Landing a throw, letting the target take embedded-blade damage from follow-up hits, then recalling through clustered enemies is a core high-damage technique.
:::

---

## Recall & Embedding

- Pressing right-click while the blade is in flight **recalls** it toward the player at 3 400 px/s.
- If an enemy is in the recall path, it is hit again.
- The blade auto-recalls after **2.5 seconds** of flight if not manually recalled — this prevents infinite flying blades.
- When the thrown blade hits an enemy, it **embeds** and stays with them until recalled, dealing damage on recall impact.

---

## Speed & Damage Relationship

Blade tip speed is the **primary damage driver** for all melee swings. The formula is:

```
damage = (tipSpeed - minHitSpeed) × damageScale
```

Where `minHitSpeed = 950 px/s` and `damageScale = 0.0092`. This means:
- Swings below 950 px/s deal no damage.
- Maximum tip speed of 7 000 px/s yields approximately **55.7 damage** before any modifiers.

See [Combat](/mechanics/combat) for the full damage breakdown including angle penalties, commitment, and style bonuses.

---

## Angle & Commitment Modifiers

Not all swings are equal, even at the same tip speed. The blade system evaluates:

1. **Poke vs. Cut** — a straight stab into the target deals only 40% of what a perpendicular slash deals at the same speed.
2. **Commitment** — if your hand (the player body) is barely moving while the tip zips, the damage is scaled toward 50%. A full committed arm swing (hilt moving at ≥620 px/s) gets the full value.

These modifiers multiply together and reward decisive, full-body swings over passive wrist flicks.
