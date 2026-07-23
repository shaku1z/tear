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
