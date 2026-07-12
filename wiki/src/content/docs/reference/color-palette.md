---
title: Colour Palette
description: The complete colour palette used in Tear — enemy types, visual effects, blade trails, and UI elements.
gameVersion: v0.1
---

Tear's entire visual design communicates through colour. The player character is a black-on-white silhouette — colourless — while enemies, projectiles, effects, and status indicators each have a distinct, carefully chosen colour. This page documents every colour from `CONFIG.colors`.

---

## Enemy Type Colours

These are the base colours for each enemy type at default affix state. Affixes tint or shift the colour.

| Enemy | Colour | Hex | Notes |
|-------|--------|-----|-------|
| **Charger** | Red | `#e23b3b` | Ground rusher; red at all affix levels unless Tank overrides |
| **Ranged** | Blue | `#2f6df0` | Projectile shooter |
| **Flyer** | Purple | `#8b3bd6` | Airborne; often first to appear in Canopy stage |
| **Bomber** | Orange | `#ef8a17` | Explosive; also the colour of slam effects |
| **Armored** | Slate | `#3a4654` | Heavily armoured; dark and desaturated to suggest solidity |
| **Armored Shield** | Cyan | `#15c2c2` | The shield bar on Armored enemies; matches the Warded affix |
| **Boss** | Crimson | `#b01030` | Shared boss base colour; individual bosses shift from this |

---

## Support / Special Enemy Colours

Support-type enemies (Priest, Herald, etc.) use distinct palettes to signal their non-standard threat roles:

| Enemy | Role | Hex |
|-------|------|-----|
| **Priest** | Support — heals/buffs allies | `#a64dd6` (support purple) |
| **Herald** | Support — announces/empowers | `#e0902f` (support orange) |
| **Mender** | Support — repairs shields | `#1faf5a` (support green) |
| **Anchor** | Support — pulls/tethers player | `#1597c2` (support teal) |
| **Wraith** | Evasive / spectral | `#6a6f88` (grey-blue) |
| **Chimera** | Mixed-type hybrid | `#444a5c` (dark slate) |
| **Sludge** | Area-denial | `#6f7a35` (olive) |

---

## Projectile & Effect Colours

These colours are used for visual feedback on blade interactions and status effects:

| Effect | Hex | Description |
|--------|-----|-------------|
| **Enemy Shot** | `#e23b3b` | Standard enemy projectile — the same red as Charger base |
| **Deflected Shot** | `#1faf5a` | A deflected projectile turns green, indicating safe/redirected |
| **Perfect Parry Shot** | `#13c4d6` | A perfect-parried shot turns cyan — homing, tracked |
| **Slam Effect** | `#ef8a17` | Shockwave / impact ring on slam — matches Bomber orange |

---

## Player & Blade Colours

| Element | Hex | Description |
|---------|-----|-------------|
| **Scarf** | `#d8324a` | The player character's scarf — the only colour on the player |
| **Blade Trail** | `#13c4d6` | The motion trail left by the blade mid-swing |
| **Blade Glow** | `#13c4d6` | Ambient glow around the blade during power-up states |
| **Eye** | `#13c4d6` | The player's eye (a cyan dot) — the one readable facial feature |

The cyan trio (Blade Trail, Blade Glow, Eye) all share `#13c4d6`, visually linking the blade and the player as one system. The scarf (`#d8324a`) is the player's only non-neutral colour, marking identity and providing a subtle warm-on-cold contrast against the cyan blade.

---

## Affix Tint Colours

| Affix | Hex |
|-------|-----|
| Tank | `#6b4a2a` (brown) |
| Swift | `#2fa0f0` (blue) |
| Rapid | `#ef5520` (orange) |
| Volley | `#d65bd6` (purple) |
| Armed | `#cc2030` (red) |
| Warded | `#13c4d6` (cyan) |

---

## Colour Swatches

| Swatch | Hex | Name |
|--------|-----|------|
| 🟥 | `#e23b3b` | Charger Red |
| 🟦 | `#2f6df0` | Ranged Blue |
| 🟣 | `#8b3bd6` | Flyer Purple |
| 🟧 | `#ef8a17` | Bomber Orange |
| ⬛ | `#3a4654` | Armored Slate |
| 🔵 | `#15c2c2` | Shield Cyan |
| 🔴 | `#b01030` | Boss Crimson |
| 🟢 | `#1faf5a` | Deflect Green |
| 🔵 | `#13c4d6` | Perfect Cyan |
| 🔴 | `#d8324a` | Scarf Crimson-Pink |

---

## Design Intent

The palette follows a deliberate logic:

- **Warm reds and oranges** signal aggression (Charger, Bomber, Boss, Armed affix).
- **Cool blues and purples** signal projectile or evasive threats (Ranged, Flyer, Volley affix).
- **Cyan (`#13c4d6`)** is the player's colour language — blade trail, eye, perfect parry — threading a consistent identity through all feedback.
- **Green (`#1faf5a`)** signals redirection and safety (deflected shots, Mender support).
- **The player's scarf (`#d8324a`)** is a warm desaturated crimson — visually distinct from both enemy reds and the blade cyans.
