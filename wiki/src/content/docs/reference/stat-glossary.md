---
title: Stat Glossary
description: Plain-English definitions of every important stat, mechanic term, and config value used in Tear.
gameVersion: v0.1
---

A reference for every stat, term, and mechanic concept used throughout this wiki and in Tear's game systems.

---

## Enemy Stats

| Term | Definition |
|------|-----------|
| **HP** | Total health. Enemies die when this reaches 0. Shown as a health bar above the enemy. |
| **Speed** | Movement speed in pixels per second. A standard Charger moves at around 260–320 px/s. Elites and Swift-affix enemies move significantly faster. |
| **ContactDmg** | Damage dealt to the player when the enemy's body collides with the player hitbox. Triggered on physical overlap, not projectiles. |
| **KnockbackTaken** | A multiplier controlling how far the enemy is flung per damage point received. Higher = easier to send flying. Relevant for launch-based builds. |
| **Weight** | Resistance to being launched airborne. High weight enemies (Tank affix: ×1.7 weight) require more upward tip speed to achieve the same launch height. The Tank affix specifically applies ×1.7 to base weight. |
| **groundDR** | Damage Reduction while the enemy is on the ground. Used by the Armored enemy type to resist normal melee hits — most effective against swings, less effective against thrown blade and status effects. |
| **airDR** | A damage multiplier applied while the enemy is airborne. Some enemies take extra damage in the air (airDR > 1.0); this is what makes launching enemies and then juggling them so powerful. |

---

## Player Blade Stats

| Term | Definition |
|------|-----------|
| **tipSpeed** | The speed of the blade tip in pixels per second. This is the **primary damage driver** for all melee hits. Calculated from the spring velocity at the moment of impact. Max: 7 000 px/s. |
| **damageScale** | Conversion factor from tip speed to damage. Formula: `(tipSpeed - minHitSpeed) × damageScale`. Value: 0.0092. |
| **minHitSpeed** | Minimum tip speed needed to deal any damage at all. Value: 950 px/s. Swings below this threshold register a hit sound but deal zero damage. |
| **angleModifier** | How the angle of the blade's strike affects damage. 1.0 for a perpendicular slash; 0.4 for a straight poke (pokeFloor). |
| **commitModifier** | How player body motion affects damage. 1.0 for a fully committed arm swing (hilt speed ≥ 620 px/s); 0.5 for a tip-flick with a still body (commitFloor). |
| **springStiffness** | How aggressively the spring pulls the blade toward the target. Value: 150. Higher = snappier response. |
| **damping** | Resistance to oscillation in the spring. Value: 7.5. Prevents the blade from bouncing indefinitely after a swing. |
| **aimRadius** | Radius of the reticle orbit around the player. Value: 85 px. The reticle and blade operate within this circle when held. |
| **maxReach** | Maximum elastic stretch of the blade beyond the aim radius. Value: 120 px. The blade can briefly extend here during fast swings before the leash pulls it back. |
| **leadAmount** | How much the tip leads ahead of the aim angle at high speed. Value: 0.45. Gives fast swings a whipping, arc-extending quality. |
| **angleSmooth** | How quickly the blade angle tracks the target position. Value: 35. Higher = snappier tracking. |

---

## Movement Stats

| Term | Definition |
|------|-----------|
| **Dash speed** | Burst velocity during a dash. Value: 1 500 px/s. |
| **Dash duration** | How long the dash lasts. Value: 0.15 s. |
| **Dash cooldown** | Time before the next dash is available after a dash ends. Value: 0.55 s. |
| **Coyote time** | A **0.10 s** grace window after walking off a ledge during which you can still jump as if on solid ground. Prevents frustrating missed jumps from slightly-late inputs. |
| **Jump buffer** | A **0.10 s** grace window where a jump pressed slightly *before* landing will still register on touchdown. Allows pre-emptive jump inputs to feel responsive. |

---

## Progression & Meta Terms

| Term | Definition |
|------|-----------|
| **Shard** | The meta currency earned from achievements and daily challenges. Spent in the Meta Shop for permanent upgrades. |
| **Wave** | One discrete round of enemies. All enemies must be defeated to advance. A stage has 9 waves plus 1 boss wave. |
| **Stage** | A group of 9 waves + 1 boss, set within a specific biome. The campaign has 5 stages. |
| **Ability Tier-Up** | A free upgrade to one existing ability granted on boss defeat in Adventure mode. Promotes T1 → T2 or T2 → T3. |
| **i-frames** | **Invincibility frames.** Brief windows of immunity to damage. In Tear: 0.9 s after taking any hit; 0.15 s during a dash. During i-frames, no additional damage is received regardless of collisions or projectiles. |
| **Trick / Style** | Any qualifying combat action that builds the style meter: Hit, Slam, Power Slam, Launch, Throw, Deflect, Perfect Parry, Recall Hit, Juggle, Aerial Hit. |
| **Variety Bonus** | The ×1.5 style point multiplier awarded when the current trick type differs from the previous one. Encourages trick diversity. |

---

## Status Effect Terms

| Term | Definition |
|------|-----------|
| **BLEED** | Damage-over-time status. 6 dmg/s per stack, max 8 stacks, 3.2 s duration refreshing on reapplication. |
| **BURN** | Damage-over-time status. 20 dmg/s, 2.6 s duration, no stacking (duration refreshes). |
| **MARK** | Damage amplification debuff. +30% damage taken from all sources, 4 s duration. |
| **Stack** | A single instance of a stackable status (BLEED). Multiple stacks add their damage values together. |
| **Detonate** | An upgrade effect (Rupture T2) that instantly expends all BLEED stacks as burst damage on a single hit. |

---

## UI / HUD Terms

| Term | Definition |
|------|-----------|
| **Style tier** | Your current named rank on the style meter: NICE, STYLISH, BRUTAL, SAVAGE, or TEARING!. |
| **Style multiplier** | The score and coin multiplier associated with your current style tier at the moment of a kill. |
| **Reticle** | The visual indicator that orbits the player at 85 px radius, showing current blade aim direction. |
| **Wave queue** | The indicator showing which enemy types are queued to spawn in the current wave. |
