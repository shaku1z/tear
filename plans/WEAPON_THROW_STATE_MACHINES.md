# Weapon Throw State Machines

This document is the implementation contract for thrown weapons. A throw is a bounded state machine, not a reusable collision mode.

## Shared invariants

1. A throw has one `throwId` from launch through catch.
2. A terminal first-impact effect can be claimed only once per route.
3. Secondary input can start only one secondary action per throw. Repeated input while that action is active is ignored.
4. Outgoing-only effects never run on a return, reel, or yank collision.
5. Each non-Circuit pass can hit a target at most once. Circuit uses an explicit repeat cooldown and diminishing damage.
6. Every return route terminates in `held`; the catch check accounts for the distance traveled during the current frame.
7. Embedded, latched, and reeling weapons do not deal passive contact damage.
8. Reclaim distance remains a deliberate constraint. Remote Link is the rule that removes or extends it.

## Weapon routes

| Weapon | Launch and first impact | Secondary action | Return safety |
| --- | --- | --- | --- |
| Sword | `held -> flying`; pierces enemies, applies Seam, embeds on world contact | `flying/embedded -> returning`; retraces the outgoing line | Crosscut consumes Seam once per target, then catches |
| Hammer | `held -> flying`; ballistic; first enemy/world collision claims one Meteor shockwave and embeds | `embedded/flying -> returning` when in reclaim range | Return hits never trigger Meteor or embed; wider collision body; two-target cap |
| Spear | `held -> flying`; first enemy/world collision claims Anchor and embeds | `embedded -> reeling -> returning`; pulls light enemies or pulls the player toward terrain/heavy targets | Return contact cannot create a new Anchor; timeout/dead targets fall through to return |
| Chainblade | `held -> flying`; first enemy claims Bind, terrain is ignored, misses auto-return | `latched -> yanking -> returning` | Yank contact cannot re-Bind; each dragged-target collision resolves once |
| Ringblade | `held -> circuiting`; inherits release tangent, ricochets, and spends energy | `circuiting -> returning`; reverses early and preserves part of Orbit | Never embeds; same-target cooldown plus diminishing damage; return does not redirect outward again |

## Regression requirements

- Hammer: one outgoing Meteor event maximum; twenty recall presses cannot create another shockwave or prevent catch.
- Spear: return/reel collisions cannot re-enter `embedded`.
- Chainblade: Yank cannot re-enter `latched` and secondary spam cannot restart Yank.
- Ringblade: a repeated target receives reduced damage inside the repeat window.
- All five: launch enters the weapon-owned state, secondary spam is idempotent, and the route reaches `held` within a bounded simulation.

The deterministic checks live in `tests/weapon-overhaul.test.js`; the browser launch/state smoke pass lives in `tests/browser-smoke.js`.
