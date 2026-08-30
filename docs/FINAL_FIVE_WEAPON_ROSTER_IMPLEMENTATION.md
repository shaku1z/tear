# Final Five Weapon Roster — Implemented Contract

## Scope and source of truth

This roster is implemented in the redesigned TypeScript architecture. The
pre-redesign `js/` monolith is an oracle for comparing previously accepted
behavior; it is not an implementation dependency.

The stable roster order is:

1. `sword`
2. `hammer`
3. `greatsword`
4. `chainblade`
5. `riftlock`

Weapon definitions and chassis modifiers live in `src/gameplay/weapons.ts`.
Shared tuning lives in `src/config/game-config.ts`. `Blade` owns deterministic
weapon state and motion; combat runtimes own damage/event resolution; renderers
consume read-only snapshots.

## Shared guarantees

- Held attacks use visible weapon geometry and speed-derived damage.
- Every throw has one stable `throwId`; individual attacks use `attackId`.
- Secondary throw behavior uses the normal universal upgrade channels.
- All routes have bounded duration and a path back to `held`.
- Weapon changes reset from the shared baseline before applying the selected
  weapon's modifiers, preventing cross-weapon stat leakage.
- Removed weapon IDs migrate through the typed selection migration.

## Verdant environment-object conformance

Weapon definitions declare semantic environment capabilities; the live collision
phase resolves those capabilities exactly against serialized object tags through
the existing environment combat-object owner. There is no weapon-ID switch in a
Rootbinder, Graft, or Regrowth implementation and no second object registry.

Canonical Root links, Regrowth combat links, and Grafts expose `cut`, `break`,
and `projectile-cut`. The active roster answers them as follows:

| Weapon | Held answer | Projectile answer | Preserved boundary |
| --- | --- | --- | --- |
| Sword | `cut` | — | Object contacts never prime Reversal or add Threadcut waypoints. |
| Hammer | `break` | — | Meteor flight, terrain resolution, recall, and catch are unchanged. |
| Greatsword | broad `cut` | — | One swing may sever distinct segments once each without consuming enemy momentum/repeat state. |
| Chainblade | head-only `cut` | — | Visible chain links do not duplicate damage; Hook & Sling remains enemy-only. |
| Riftlock | bayonet `cut` | Razor Round `projectile-cut` | Object hits do not Capture; secondary Backblast rounds are excluded. |

Environment contacts use one attack ID per held swing or player-owned projectile.
They do not enter ordinary enemy kill, coin, score, achievement, status, upgrade
`onHit`, or death-chain paths. Combat objects remain non-enemy, non-rewarding,
and proc-ineligible. Universal abilities continue to evolve and execute through
their existing ordinary-enemy paths for every weapon; Verdant adds no per-weapon
ability fork or nerf.

Bloom Wells V1 do not mutate weapon transport. Post-integration headless parity
and the existing five browser/Ghost weapon routes pass without changing C40
certification records.

## Sword

### Chassis

- Spring response: `1.08×`
- Angle correction: `1.10×`
- Deflect and Perfect-Parry speed requirements: `0.90×`
- Thrown-player movement boost: `1.15×`
- Throw channels: shared baseline

### Reversal

A qualifying first held cut records target, direction, `swingId`, position, and
expiry. The blade must leave the larger of the authored exit radius or the
target radius plus padding. A different swing must then cross the same target
with a normalized direction dot product at or below `-0.55`.

Completion applies the visible bonus component, `0.24s` stagger, style, hit-stop,
and clears the prime. Perfect Parry can create the same prime but does not bypass
exit, direction, or separate-swing requirements. The renderer exposes the prime
with a position ring and opposite-direction arrow.

### Threadcut throw

The outbound Sword pierces each valid target once. It records target references
in hit order. Recall visits living targets in reverse order using their current
positions, skips dead/dying targets, visits the throw origin, and then returns
to the player. Normal recall remains valid when no target was hit.

## Hammer

### Chassis

- Spring response: `0.62×`; damping: `1.18×`; gravity: `1.58×`
- Damage scale: `1.28×`; maximum damage: `1.48×`
- Slam: `1.35×`; launch: `1.38×`
- Throw power: `1.35×`; throw speed: `0.82×`
- Secondary power: `1.18×`; return speed: `0.78×`
- Knockback taken while held: `0.75×`

Throw and return speed multipliers are applied once through channels; the
definition no longer mutates shared throw tuning and accidentally double-scales
them.

### Break and Meteor

Held damage scales from weak low-speed contact to full committed impact. Valid
hits emit Break from actual damage and commitment. Meteor uses a ballistic route
with authored gravity, resolves its first impact once, embeds, and produces the
existing direct-hit/shockwave Break, stun, launch, and radial damage behavior.
The return has broad collision, capped targets, and a guaranteed catch route.

## Greatsword

### Chassis

- Blade length: base `+30px`; aim radius: `+14px`; reach: `+24px`
- Spring response: `0.76×`; damping: `1.15×`; gravity: `1.20×`
- Angle correction: `0.72×`
- Damage scale: `1.18×`; maximum damage: `1.22×`
- Throw power: `1.14×`; throw speed: `0.92×`; return speed: `0.94×`

The renderer supplies a broad blade, point, guard, and two-handed grip; collision
uses that broad weapon segment rather than Hammer geometry.

### Cleaving Momentum

Greatsword no longer receives a hidden damage bonus for cleaving. Instead, each
target is deduped per `swingId`, normal edge damage resolves, and blade momentum
is retained according to resistance:

- light: `0.92`
- medium: `0.78`
- heavy/anchored: `0.55`
- boss: `0.35`

Contact near the hilt remains weaker than edge contact.

### Wheel Cut

Outbound flight rotates end over end and uses swept broad-blade collision to
prevent obstacle teleporting. It clamps to the last safe position before an
impact and then embeds. Recall stops the spin, progressively aligns the blade
across its velocity, performs one broad return cut per target, and catches.

## Chainblade

### Chassis

- Compact length: base `-20px`
- Aim radius: `+18px`; maximum reach: `+40px`
- Spring response: `0.64×`; damping: `0.82×`
- Maximum speed: `1.06×`
- Remote range: `1.35×`; control duration: `1.20×`
- Secondary power: `1.15×`

### Compact Lash and visible chain

The hooked head is the only full-damage held segment. Fourteen visible chain
segments are produced by a deterministic fifteen-node constrained simulation.
Chain links can lightly shove but do not duplicate head damage.

### Hook and Sling

The first valid outbound target enters `hooked`. Aim supplies bounded angular
acceleration; tether tightening shortens radius and conserves tangential
momentum within caps. Target mass and knockback response scale orbit and release.
Recall samples the tangent, applies a bounded release, clears the link, and
returns the head.

Heavy enemies and bosses act as anchors: the target moves less while the player
is pulled toward it. Hooked targets collide with enemies and arena/platform
geometry using player-owned damage, cooldown dedupe, mass-aware knockback, and
shared first-damage/kill ownership.

## Riftlock

### Chassis and chambers

- Slightly longer blade: base `+8px`
- Spring response: `1.12×`; damping: `1.04×`; gravity: `0.82×`
- Angle correction: `1.16×`
- Throw speed: `1.06×`; remote range: `1.35×`
- Return speed: `1.15×`; control duration: `1.10×`
- Four offensive chambers
- Passive single-chamber reform: `1.35s`
- Chamber Cut refill: one per `swingId`
- Perfect-Parry refill: two; catch refill: one

Run, wave, boss, retry, tutorial, and other weapon-reset paths call the weapon
reset hook so the chamber state starts full.

### Razor Round and Recoil Cut

A fresh tether press fires one visible `weaponProjectile`; holding does not
auto-fire. The projectile is player-owned, narrow, finite-lived, non-hitscan,
and hits one target. It emits shared `onHit`; remote hits additionally resolve
the current throw interaction.

Held fire applies bounded recoil to both weapon and player. If the physically
moving bayonet crosses a target during the `0.20s` recoil window, that ordinary
bayonet contact is classified once as Recoil Cut. There is no hidden radial
damage.

### Loose Cannon, Capture, and Backblast

Throwing enters Loose Cannon for the authored `4.2s` control duration. Remote
aim sets barrel direction; fresh shots consume chambers and change the weapon's
route through recoil.

A direct outbound bayonet/body hit enters bounded `captured` state. The weapon
follows the lodged target, transfers remote recoil using target mass, sharply
caps boss transfer, and safely releases when the target or state expires.

Backblast works with zero offensive chambers. It emits a separate outward
secondary Razor Round, clears Capture, drives a minimum `4200px/s` return,
aligns the weapon into its return path, resolves return hits through secondary
upgrade channels, and catches.

## Permanent evidence

- `tests/unit/final-five-weapon-roster.test.ts` — definitions, state transitions,
  Reversal, Threadcut, Meteor, Wheel Cut, Chainblade physics, chambers, recoil,
  Capture, Loose Cannon, and Backblast.
- `tests/unit/thrown-collision-runtime.test.ts` — thrown collision authority,
  stopping impacts, Capture, redirect, and duelist ordering.
- `tests/unit/weapon-secondary-runtime.test.ts` — hooked target arena/platform
  collisions and cooldown behavior.
- `tests/unit/weapon-projectile-runtime.test.ts` — player-owned Razor Round
  collision classification.
- `tests/unit/weapon-ability-conformance.test.ts` — every weapon/upgrade pairing.
- `tests/unit/environment-weapon-contact-runtime.test.ts` — exact Sword, Hammer,
  Greatsword, Chainblade, and Riftlock object geometry/capability boundaries plus
  their preserved route/catch behavior.
- `tests/unit/verdant-final-five-conformance.test.ts` — source-derived five-weapon
  object dedupe/policy/status isolation and Bloom transport exclusion.
- TearBench selection and CI artifacts under `artifacts/tearbench/`.
