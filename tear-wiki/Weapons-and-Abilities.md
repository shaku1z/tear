# Weapons and abilities

Tear’s five weapons share the same jump, dash, coyote time, gravity, health, collision, and platform rules. They differ through handling, a restrained chassis modifier, a unique hit-quality test, an exclusive mechanic, and a unique throw.

| Weapon | Technique | Exclusive mechanic | Throw | Strength | Weakness |
|---|---|---|---|---|---|
| Sword | Perpendicular, committed cuts | True Edge applies Seam | Crosscut retraces the throw and consumes Seam | Precision, parries, sustained pressure | Burst, armor, wide control |
| Hammer | High-speed committed impacts | Break pressure | Meteor arcs and erupts on first impact | Burst, stagger, armor, crowd interruption | Response, range, reactive defense |
| Spear | Axial thrusts at long range | Drive | Anchor Cast reels a light enemy or pulls the player to terrain/heavy targets | Reach, pursuit, traversal | Broad coverage, close safety, slams |
| Chainblade | Extended, high-speed arcs | Tension and Drag | Bind / Yank relocates targets and causes collision damage | Clustering, repositioning, arena control | Reversals, cramped spaces, boss damage |
| Ringblade | Sustained one-direction rotation | Orbit | Circuit steers, ricochets, loses energy, and returns automatically | Ranged uptime, mobile targets, flow | Single-hit power, armor, knockback |

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

- Spear pulls the player toward bosses instead of moving them.
- Chainblade applies a capped tug and short link to bosses; it cannot immobilize them.
- Hammer Break uses a higher threshold and shorter stagger on bosses.
- Ringblade repeated overlap is rate-limited and diminished.
- Scripted invulnerability and phase boundaries remain owned by the boss damage gates.

## Input support

The shared aim, throw/secondary action, movement, and dash inputs remain unchanged, so mouse, touch, and controller all reach the five weapon state machines through the same input layer.

## Superseded concepts

Glacial Wake and the Discord/Frenzy ability concept are not part of this overhaul. (Aldric’s existing internal `frenzy` boss phase is unrelated.)

## Debugging and QA

Playground mode shows live weapon hit/throw/parry/Break counters. `window.TEAR_WEAPON_DEBUG()` returns the full per-run counter snapshot and the most recent normalized weapon event log.

Automated coverage lives in `tests/weapon-overhaul.test.js` and `tests/browser-smoke.js`.
