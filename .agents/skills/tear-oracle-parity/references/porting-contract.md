# Porting Contract

How oracle behavior enters the redesign: verbatim behavior, redesigned plumbing.

## Do port verbatim

- Constants, thresholds, timing windows, easing curves, spring math, guarantee math (e.g. draft `specialsOffered` / `specialBlock` windows), layout geometry, strings, colors, animation timings.
- Frame-order semantics: what is read/written before vs after physics, per-frame vs latched state, exact transition side effects.
- Renderer craft: the Phase-2 card renderer was re-ported *verbatim* from oracle `choiceCard` (deal-in, hover lift/scale, fitTitle, tier pips, normalRow) into a screen renderer — that is the model. Extend `ScreenRenderContext` (it already carries `enterSeconds`/`deltaSeconds`/`mouse`) rather than dumbing the effect down.

## Do NOT port

- Writable shared globals, classic-script load order, global discovery.
- Direct DOM / canvas / Web Audio / Firebase / CrazyGames / storage / wall-clock reads inside domain or simulation code — route through the existing typed ports.
- `Math.random()` — use the injected seeded RandomSource.
- `?v=` query strings, handwritten cache versions, manual service-worker shell lists.
- Device key codes in gameplay — oracle key handling maps to semantic `GameAction`s at the input layer.

## Placement map (oracle → redesign)

| Oracle | Redesign home |
| --- | --- |
| `js/game.js` state machine + transitions | `src/app/` state machine, screen controllers |
| `js/game.js` screen drawing | `src/presentation/screens/` renderers (pure, snapshot-driven) |
| `js/ui.js` UI.t + components | `src/presentation/ui*.ts` |
| `js/input.js` pointer-lock / mode / delta | `src/input/` adapters + cursor-contract + live-frame-runtime |
| `js/config.js` tuning | `src/config/*` immutable definitions |
| `js/player.js` / `js/enemy.js` / `js/mirror.js` | `src/gameplay/**` (deterministic, port-fed) |
| oracle side effects at transitions | the ONE owning adapter/controller — enumerate oracle call sites and match 1:1 |

## Evidence expectations

- Behavior parity → oracle-conformance fixture: seed + initial state + semantic actions + tick count, expected values generated from the oracle build (via `$tear-combat-scenarios`).
- Screen parity → deterministic journey screenshot compared against the oracle capture (via `$tear-ui-regression`); no pixel-perfect baselines unless the user adopts that contract.
- Feel parity → twin-serve A/B plus trace differ where available; explicitly report any feel check owed to the user (e.g. blade aim playtests) as unverified.
- Always finish with `$tear-change-gate`.
