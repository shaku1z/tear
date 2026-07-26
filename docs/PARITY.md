# Legacy parity contract

Tear's behavior and visual oracle is commit
`ee5e93141d67cc02505b2227b3be0b10d1819e1c`, the last version before the
typed architectural redesign. Refactoring is not permission to change how the
game feels, plays, or presents an established screen.

## What must remain equivalent

- Player movement, blade handling, combat resolution, enemy and boss behavior,
  rewards, drafts, replays, and transition timing.
- The 120 Hz gameplay cadence and the oracle's tuned constants.
- Screen hierarchy, information density, typography roles, hit targets, and
  authored presentation for established menu and in-run surfaces.
- Save, score, leaderboard, and replay compatibility unless a versioned
  migration explicitly replaces an old format.

Random encounter order and render-frame timing do not need identical bytes when
the same rules and deterministic recording contract are preserved.

## Intentional differences

- The redesigned typed modules, ports, adapters, build pipeline, tests, and
  Cloudflare/CrazyGames packaging are architectural improvements.
- Tear exclusively owns the visible cursor over the game canvas. The hardware
  cursor stays hidden so it cannot overlap the authored menu pointer or blade
  reticle.
- Audio now has separate master, music, sound-effect, and interface channels.
- New weapons, platform integrations, accessibility options, and other
  explicitly approved features extend the oracle rather than being removed for
  pixel identity.

## Verification policy

For a suspected regression, compare the current build with the pinned oracle at
the same logical viewport and state. Prefer matched-tick traces for gameplay and
paired screenshots plus input journeys for UI. A difference is acceptable only
when it is required by an approved feature, fixes a demonstrated defect, or is
recorded above. Otherwise the oracle wins.

The local oracle worktree convention is `../Tear-oracle`. Debug snapshots expose
simulation time, 120 Hz tick, player, blade, and enemy traces so parity checks do
not depend on visual estimation alone.

## Parity microscope

`pnpm parity:blade`, `pnpm parity:player`, `pnpm parity:enemy`, and
`pnpm parity:combat` serve the pinned oracle and the current test build on
separate local origins. They replay the blade lifecycle, player locomotion,
authored Charger fixture, or held-strike resolution through both pages and
write paired traces plus a report under `artifacts/parity/`.

The blade fixture writes:

- `blade-pointer-lifecycle.oracle.json`
- `blade-pointer-lifecycle.current.json`
- `blade-pointer-lifecycle.report.json`

The oracle server injects a read-only runtime probe inside the legacy
`game.js` closure. It does not edit the oracle worktree. The command refuses to
run if `../Tear-oracle` is not exactly at `ee5e931`.

Each named checkpoint records the screen, input owner, pointer-lock lifecycle,
authored cursor visibility, simulation time, player body, blade hilt and tip,
aim/reticle, throw state, and tether state. `scripts/parity-diff.mjs` aligns
checkpoints by label and reports the first differing field as well as every
later divergence. Run it directly with:

```text
pnpm parity:diff <oracle-trace.json> <current-trace.json> [report.json]
```

The twin run is diagnostic by default, so it produces a report without failing
the command while parity restoration is active. Set `TEAR_PARITY_STRICT=1` to
turn any reported difference into a failing gate. The permanent current-build
contract is `pnpm test:browser:blade-lifecycle`; it verifies capture, relative
aim, tether hold, throw, pause/release, and fresh-run reset without requiring
the external oracle worktree.

The player fixture is `tests/parity/player-locomotion.json`. It dispatches
keyboard edges immediately before named 120 Hz simulation steps and covers
grounded acceleration, jump and release, airborne steering, directional dash,
opposite-direction reversal, landing, and friction. Its permanent current-build
contract is `pnpm test:browser:player-locomotion`.

The enemy fixture is `tests/parity/enemy-charge-cycle.json`. A test-only action
authors the same live Charger immediately before tick one in both builds,
removing spawn and affix randomness while retaining the production enemy step.
It covers windup, charge commit, arena locomotion, recovery, cooldown ownership,
and the enemy AI clock. Its permanent current-build contract is
`pnpm test:browser:enemy-charge`.

The combat fixture is `tests/parity/combat-resolution.json`. After a shared
mouse-input tick, its test-only action places two real Chargers directly on the
live held-blade segment and gives the blade one authored velocity impulse. The
production blade update, strike planner, enemy damage method, kill runtime, and
collision tail remain untouched. It covers damage, impulse, post-hit immunity,
lethal credit, dead-actor collection cleanup, and timer recovery. Its permanent
current-build contract is `pnpm test:browser:combat-resolution`.

The Ranged fixture is `tests/parity/ranged-fire-cycle.json`. It authors one
ordinary Ranged actor just before its aim timer expires, then leaves movement,
telegraph timing, projectile construction, and cooldown reset to production.
Its permanent current-build contract is `pnpm test:browser:ranged-cycle`.

### Phase 0 blade baseline

The parity adapter queues each event before a run segment starts, applies it
immediately before a named authoritative step, and captures immediately after a
later named step. This avoids render-frame and catch-up-batch timing noise.

The first complete 16-checkpoint capture reached zero active-play differences:
the oracle and current build consumed all eight mouse events on the same ticks,
then matched player state, blade hilt/tip position and velocity, aim/reticle,
tension, tether, throw state, cursor visibility, pause/release, and fresh-run
reset. Paused screens may stop their clocks on different tick numbers because
the browser delivers pointer-lock loss asynchronously; the differ still
compares their frozen gameplay and lifecycle state but does not treat the
inactive clock value itself as a physics divergence.

### Phase 4 player baseline

The first complete player capture reached zero differences across 15
checkpoints. Both builds consumed every keyboard edge on the same authoritative
tick and matched position, velocity, grounded state, coyote and jump-buffer
timers, dash duration/cooldown, and the attached blade state throughout the
scripted movement arc.

### Phase 4 regular-enemy baseline

The first authored Charger capture reached zero differences across six
checkpoints. Both builds transition from windup to commit and recovery on the
same authoritative ticks, and match attack direction, charge power, position,
velocity, grounded state, cooldowns, and alive time. Enemy kind, behavior,
attack phase, and grounded state are strict parity fields; continuous motion
and timers retain narrow tolerances for future cross-browser trace evidence.

### Phase 4 held-strike baseline

The first combat-resolution capture reached zero differences across three
checkpoints. Both builds consume the same authored aim tick, place the targets
relative to their live blade geometry, damage both targets on the same
authoritative step, remove and credit the lethal target, retain the survivor's
hit immunity and stun, then expire both timers. The fixture deliberately enters
through the real held-blade collision phase rather than calling `Enemy.hit`
directly, so it protects the full blade-to-kill pipeline.

### Phase 4 Ranged baseline

The first Ranged capture reached zero differences across three checkpoints.
Both builds enter `windup`, count down the same telegraph, plant while aiming,
emit the same two ordinary hostile projectiles, reset the aim cooldown, and
return to `kite` on the same authoritative ticks.
