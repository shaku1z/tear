# Weapons and abilities

Tear’s five weapons share the same jump, dash, coyote time, gravity, health, collision, and platform rules. They differ through handling, a restrained chassis modifier, a unique hit-quality test, an exclusive mechanic, and a unique throw.

| Weapon | Technique | Exclusive mechanic | Throw | Strength | Weakness |
|---|---|---|---|---|---|
| Sword | Perpendicular, committed cuts | True Edge applies Seam | Crosscut retraces the throw and consumes Seam | Precision, parries, sustained pressure | Burst, armor, wide control |
| Hammer | High-speed committed impacts | Break pressure | Meteor arcs and erupts on first impact | Burst, stagger, armor, crowd interruption | Response, range, reactive defense |
| Greatsword | Broad, committed edge arcs | Cleaving Momentum | Wheel Cut spins around its center and returns edge-first | Reach, formation cleaves, momentum | Slow, weak near hilt, commitment |
| Chainblade | Extended, high-speed arcs | Tension and Drag | Bind / Yank relocates targets and causes collision damage | Clustering, repositioning, arena control | Reversals, cramped spaces, boss damage |
| Riftlock | Precise ranged sidearm fire | Recoil Cut and chambered Bayonet | Loose Cannon captures a target; Backblast fires while recalling | Ranged pressure, recoil routes, resource control | Four chambers, precise fire, narrow control |

## Universal throw abilities

- **Overdrive:** successful interactions ramp the active throw’s damage and speed.
- **Second Pass:** strengthens the weapon’s secondary throw action.
- **Remote Link:** extends range, control duration, and recall authority.
- **Redirect:** grants an extra route change or destination.
- **Capture:** direct hits apply the weapon’s control expression.
- **Collapse:** secondary actions pull nearby enemies toward their path.

The persistent upgrade IDs are unchanged so existing saves remain compatible; their displayed names and behavior use the universal definitions above.

## Special abilities

- **Stormbank (Throw):** skill kills bank up to 5/8/10 charges. The first enemy affected by the next throw consumes them, adds primary damage, and chains to a capped number of nearby targets. Misses and terrain-only anchors do not spend charge.
- **Overrun (Offense):** an enemy killed within 1.25 seconds of its first player-owned damage is a Clean Elimination. Clean Eliminations build damage stacks; tier two adds earned movement speed, and tier three locks full stacks during Redline.
- **Sever (Parry):** a Perfect Parry reduces its source enemy’s outgoing damage. Higher tiers Sever reflected-hit targets and pulse a non-recursive Tier 1 Sever when a Severed enemy dies.

## Control and boss rules

- Greatsword carries momentum through light foes while retaining reduced transfer against heavy targets and bosses.
- Chainblade applies a capped tug and short link to bosses; it cannot immobilize them.
- Hammer Break uses a higher threshold and shorter stagger on bosses.
- Riftlock capture applies mass-scaled recoil and does not immobilize bosses.
- Scripted invulnerability and phase boundaries remain owned by the boss damage gates.

## Input support

The shared aim, throw/secondary action, movement, and dash inputs remain unchanged, so mouse, touch, and controller all reach the five weapon state machines through the same input layer.

## Superseded concepts

Glacial Wake and the Discord/Frenzy ability concept are not part of this overhaul. (Aldric’s existing internal `frenzy` boss phase is unrelated.)

## Debugging and QA

Playground mode shows live weapon hit/throw/parry/Break counters. `window.TEAR_WEAPON_DEBUG()` returns the full per-run counter snapshot and the most recent normalized weapon event log.

Automated coverage lives in `tests/unit/final-five-weapon-roster.test.ts`, the weapon conformance suites, and the canonical browser journeys.
