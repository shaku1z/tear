---
title: Controls
description: Full controls reference for Tear — mouse, keyboard, and touch inputs explained.
gameVersion: v0.1
---

Tear uses a **mouse + keyboard** control scheme on PC. A touch control layout is also available for mobile. All bindings are summarised below, followed by deeper explanations of the less obvious inputs.

---

## Keyboard & Mouse

### Blade Controls

| Input | Action |
|-------|--------|
| **Left-click (hold)** | Tether / aim the blade toward the cursor |
| **Left-click (release)** | Execute the swing — release speed and angle determine the strike |
| **Right-click** | Throw the blade toward the cursor at high speed |
| **Right-click (near thrown blade)** | Recall — pulls the blade back toward you |

### Movement

| Input | Action |
|-------|--------|
| **A / D** | Move left / right |
| **W** or **Space** | Jump |
| **S** | Crouch; hold **S** while on a one-way platform to fall through |
| **Shift** | Dash (in the direction you are moving) |
| **Double-tap A or D** | Dash in that direction (alternative) |

---

## How the Blade Aims

The blade does **not** simply point at the cursor. It orbits the player via a **spring physics system** — holding left-click tethers the blade toward the mouse position, but the spring has stiffness, damping, and gravity properties that give it weight and momentum.

The **reticle** (the small indicator showing where the blade is targeting) orbits within an **85 px radius** of the player. When you hold left-click, the blade is pulled inward to a minimum tether of roughly 38 px; releasing lets the spring snap outward and whip the blade through the target.

**Lead amount:** Fast swings cause the blade tip to *lead ahead* of the aim line (factor: 0.45), giving committed swings extra reach and rewarding full-arm motions over timid flicks.

:::tip
Move your mouse **through** the target rather than stopping at it. The blade tracks momentum — a full sweep deals more damage than a click-and-release.
:::

---

## Throw & Recall

- **Throw:** Press right-click to launch the blade as a projectile. Its speed is 1 900 px/s base, plus 45% of the tip speed at the moment of release. The blade embeds in the first enemy it hits, dealing damage and potentially causing status effects depending on your upgrades.
- **Recall:** Press right-click again (while the blade is thrown) to call it back at 3 400 px/s. The recall can hit enemies as it returns. If the blade is within **384 px** of you, the recall also triggers a shorter, punchier return arc.
- **Max flight time:** The blade auto-returns after **2.5 seconds** if not recalled.

:::note
The throw speed receives a bonus from blade tip speed at release. Winding up a fast swing before throwing makes the projectile significantly faster.
:::

---

## Dash

- **Shift** or **double-tap direction** triggers a burst dash at **1 500 px/s** for **0.15 s**.
- Dashing has a **0.55 s cooldown** between uses.
- You have **invincibility frames for the full duration** of the dash (0.15 s).
- Hold a direction while dashing to subtly **steer** the dash arc mid-motion.
- Certain upgrades (Air Dash, Phantom Dash, Cinder Trail, Phase Step) extend or modify dash behaviour.

See [Dash](/mechanics/dash) for the complete upgrade interactions.

---

## Pointer Lock & Aim Sensitivity

On PC, the game supports **pointer lock mode**, which confines the cursor to the game window and gives you raw mouse delta for aim. This is recommended for precision play — it eliminates cursor boundary issues at screen edges and gives consistent feel regardless of cursor speed settings.

Sensitivity can be adjusted in the Settings menu.

---

## Touch Controls (Mobile)

On mobile devices the game switches to a virtual touch layout:

| Zone | Control |
|------|---------|
| **Left joystick** (bottom-left) | Move left/right, jump (flick up), crouch/fall-through (flick down) |
| **Right area — tap** | Aim and swing the blade (tap and hold = tether, release = swing) |
| **Right area — swipe** | Throw / throw direction |
| **Dash button** | Dedicated dash button appears bottom-right |
| **Recall button** | Appears when blade is thrown |

Touch controls use a larger hit-radius for the blade's swing gesture to compensate for less precise input. Pointer lock does not apply on mobile.
