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
9. The range shown around the player is the effective range after weapon channels, Quickdraw, and Recall Window—not an obsolete shared radius.
10. Collision follows visible geometry: the Chainblade uses its hand-to-head chain, while the Ringblade uses its visible center and radius with no invisible shaft.
11. Spear and Chainblade accept one buffered secondary input during flight; it activates only after a valid in-range Anchor or Bind forms.

## Range contracts

| Weapon | Limiting resource | Out-of-range behavior | Remote Link |
| --- | --- | --- | --- |
| Sword | Reclaim distance | Remains embedded until the player approaches | Recall from any distance |
| Hammer | Reclaim distance | Remains embedded until the player approaches | Recall from any distance and return faster |
| Spear | Anchor-link distance and link time | Cast auto-returns at maximum link range; an expired Anchor returns | Anchor distance becomes unbounded and link time increases |
| Chainblade | Head extension, latch distance, and link time | Misses auto-return; stretched latches break and return | Bind/Yank range and duration increase, but do not become infinite |
| Ringblade | Circuit energy and maximum life | Automatically returns when energy or life expires | Circuit lasts longer and steers more strongly |

Quickdraw expands the same effective boundary. For Ringblade, its range component becomes additional Circuit duration because Circuit has no spatial recall boundary.

## Weapon routes

| Weapon | Launch and first impact | Secondary action | Return safety |
| --- | --- | --- | --- |
| Sword | `held -> flying`; pierces enemies, applies Seam, embeds on world contact | `flying/embedded -> returning`; retraces the outgoing line | Crosscut consumes Seam once per target, then catches |
| Hammer | `held -> flying`; ballistic; first enemy/world collision claims one Meteor shockwave and embeds | `embedded/flying -> returning` when in reclaim range | Return hits never trigger Meteor or embed; wider collision body; two-target cap |
| Spear | `held -> flying`; first enemy/world collision claims Anchor and embeds | `embedded -> reeling -> returning`; pulls light enemies or pulls the player toward terrain/heavy targets | Return contact cannot create a new Anchor; timeout/dead targets fall through to return |
| Chainblade | `held -> flying`; first enemy claims Bind, terrain is ignored, misses auto-return | `latched -> yanking -> returning` | Yank contact cannot re-Bind; each dragged-target collision resolves once |
| Ringblade | `held -> circuiting`; inherits release tangent, ricochets, and spends energy | `circuiting -> returning`; reverses early and preserves part of Orbit | Never embeds; same-target cooldown plus diminishing damage; return does not redirect outward again |

## Feel contracts

- Spear remains the longest rigid weapon, but corrects quickly, has a forgiving axial damage floor, and uses a readable head-sized Anchor collision.
- Chainblade retains weight without delayed-input sluggishness. Its visible chain is its held collision route, the head sits on a latched target, and a completed light-target Yank briefly controls on arrival.
- Ringblade physics, wall bounce, drawing, and collision all use the same center. Low-commitment releases favor aim; high-Orbit committed releases favor tangent momentum. Steering is strong enough to correct a route before crossing the arena.

## Regression requirements

- Hammer: one outgoing Meteor event maximum; twenty recall presses cannot create another shockwave or prevent catch.
- Spear: return/reel collisions cannot re-enter `embedded`.
- Chainblade: Yank cannot re-enter `latched` and secondary spam cannot restart Yank.
- Ringblade: a repeated target receives reduced damage inside the repeat window.
- Range boundaries: one pixel inside succeeds, one pixel outside fails, and each range upgrade changes the real boundary/resource.
- Geometry: Chainblade collision spans the visible chain; Ringblade collision is a circle without an invisible shaft.
- Handling: Spear, Chainblade, and Ringblade cross their response threshold within their weapon-specific latency budget.
- Input buffering: early Anchor/Yank input activates once after a valid latch and cannot be spammed into repeated secondary events.
- All five: launch enters the weapon-owned state, secondary spam is idempotent, and the route reaches `held` within a bounded simulation.

The deterministic checks live in `tests/weapon-overhaul.test.js`; the browser launch/state smoke pass lives in `tests/browser-smoke.js`.
