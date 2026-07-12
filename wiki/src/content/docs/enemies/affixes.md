---
title: Affixes & Elites
description: All enemy affixes in Tear — what they do, who they affect, their colours, and how the Elite system works.
gameVersion: v0.1
---

Affixes are modifiers randomly rolled onto enemies that change their stats or behaviour. Elites are a separate escalation that makes a single enemy dramatically more powerful. Both systems ensure that no two waves feel identical, even with the same enemy roster.

---

## Affix Overview

Each enemy can have **0 to 3 affixes**, rolled randomly. The chance of receiving at least one affix increases with the wave number and difficulty setting.

Affixes are visually communicated through the enemy's colour — a purple-tinted Ranged enemy is almost certainly Volley; a brown-tinted Charger is Tank. Learning the colour codes lets you instantly read an enemy's threat level.

---

## Affix Table

| Affix | Colour | Applicable Enemies | Effect |
|-------|--------|--------------------|--------|
| **Tank** | Brown `#6b4a2a` | All enemies | ×1.8 HP, ×1.7 weight (harder to knock airborne) |
| **Swift** | Blue `#2fa0f0` | All except Armored | ×1.45 movement speed |
| **Rapid** | Orange `#ef5520` | Ranged only | ×0.5 fire rate (shoots twice as fast) |
| **Volley** | Purple `#d65bd6` | Ranged only | Fires 3 shots per burst instead of 1 |
| **Armed** | Red `#cc2030` | Charger only | Larger contact reach, ×1.3 contact damage, bigger hitbox |
| **Warded** | Cyan `#13c4d6` | All enemies | Adds a shield equal to 60% of max HP |

### Affix Stacking

Affixes stack freely. A Ranged enemy can roll Tank + Rapid + Volley, making it a slow-to-kill rapid-fire burst shooter. Enemy types that cannot roll certain affixes (e.g., Armored cannot be Swift) are prevented only by the restriction column above.

---

## Affix Detail Notes

### Tank
The weight increase (×1.7) is particularly relevant for launch-based builds. A Tank enemy requires approximately 70% more upward tip velocity to achieve the same launch height. Consider whether Power Slam detonations (via Rupture T2) are more efficient than trying to launch Tanked enemies.

### Warded
The shield (60% of max HP) acts as a separate health bar that must be depleted before the enemy's actual HP takes damage. Warded enemies effectively have 1.6× total health unless you have an upgrade that bypasses shields. The shield is represented by a cyan outline around the enemy's silhouette.

### Rapid + Volley (Gunner Preset)
Together on a Ranged enemy, Rapid and Volley produce a burst-fire pattern — three shots at double rate. This is the most dangerous projectile configuration in the base game and demands active deflect play.

---

## Elite System

Elites are a separate roll from affixes. Any enemy can become an Elite, regardless of whether it also has affixes.

| Property | Value |
|----------|-------|
| **Base elite chance** | 6% per wave |
| **Maximum elite chance** | 35% (scales with wave number) |
| **Elite HP multiplier** | ×2.2 |
| **Elite speed multiplier** | ×1.3 |
| **Elite damage multiplier** | ×1.5 |
| **Elite size multiplier** | ×1.2 |

Elites are distinguished by a bright aura or colour shift distinct from their affix colours. They drop bonus coins on kill.

---

## Preset Enemies

Presets are hand-authored sub-types with fixed affix combinations, representing named enemy variants rather than random rolls. They appear at specific wave thresholds and stage compositions.

| Preset Name | Base Enemy | Fixed Affixes | Threat Profile |
|------------|-----------|--------------|----------------|
| **Gunner** | Ranged | Rapid + Volley | High-frequency burst shooter |
| **Brute** | Charger | Tank + Armed | High-HP, high-contact damage, large hitbox |
| **Sentinel** | Armored | Warded + Tank | Extreme durability; requires sustained or burst damage |

### Gunner
The Gunner fires 3-shot bursts at double the standard fire rate. Against a Gunner, you must either maintain active deflect chains (blade sweeping through the shots) or use your dash i-frames to absorb the burst while repositioning. Leaving a Gunner alive while focusing other enemies is rarely advisable.

### Brute
The Brute's combination of Tank HP and Armed melee range makes it a dangerous ground threat. Its hitbox is larger than a standard Charger, meaning it contacts you from further away. Prioritise airborne techniques (launch → juggle → slam) to keep it off the ground where its contact damage is applied.

### Sentinel
The Sentinel (Armored + Warded + Tank) is the toughest standard preset. It has a shield (Warded, 60% of max HP), extreme HP (Tank, ×1.8), and the Armored enemy's ground damage reduction. Efficient strategies:
- Apply MARK (Sunder T2) to strip ground DR.
- Power Slam detonate BLEED stacks (Rupture T2) for burst damage.
- Throw blade to bypass ground DR (thrown damage is not affected by `groundDR`).

---

## Affix Colour Quick-Reference

| Colour | Hex | Affix |
|--------|-----|-------|
| Brown | `#6b4a2a` | Tank |
| Blue | `#2fa0f0` | Swift |
| Orange | `#ef5520` | Rapid |
| Purple | `#d65bd6` | Volley |
| Red | `#cc2030` | Armed |
| Cyan | `#13c4d6` | Warded |
