# Porting oracle behaviour

The behaviour is kept exactly. The plumbing is the redesign's.

## Port exactly

- Constants, thresholds, timing windows, easing curves, spring math, layout geometry, strings, colours and
  animation timings.
- Frame order: what is read or written before and after physics, what is per-frame and what is held, and
  the side effects of each transition.
- Renderer craft. Extend `ScreenRenderContext` (`src/presentation/screens/contracts.ts`) when an effect
  needs time or pointer position; do not flatten the effect.

## Do not port

- Writable shared globals, script load order, global discovery.
- DOM, canvas, Web Audio, Firebase, CrazyGames, storage or wall-clock reads inside rules code. Use the
  typed ports.
- `Math.random()`. Use the injected random source.
- `?v=` query strings, hand-written cache versions, hand-kept service-worker lists.
- Key codes in gameplay. Oracle key handling maps to a `GameAction` at the input layer.

## Where it goes

| Oracle | Now |
| --- | --- |
| `js/game.js` state machine and transitions | `src/app/` |
| `js/game.js` screen drawing | `src/presentation/screens/`, drawn from snapshots |
| `js/ui.js` tokens and components | `src/presentation/ui.ts`, `src/presentation/ui-tokens.ts` |
| `js/input.js` pointer lock, mode, movement | `src/input/`, `src/presentation/cursor-contract.ts` |
| `js/config.js` tuning | `src/config/` |
| `js/player.js`, `js/enemy.js`, `js/mirror.js` | `src/gameplay/` |
| A side effect at a transition | The one controller or adapter that owns it |

A ported value gets one home. If the same number already exists elsewhere in `src/`, import it.

## Evidence

- **Behaviour:** a test with a seed, start state, actions and tick count whose expected values came from
  the oracle, or a parity fixture under `tests/parity/`.
- **Screen:** a journey screenshot compared with the oracle capture. No pixel-exact baselines.
- **Feel:** a side-by-side session and a paired trace. Report any feel check owed to a person as
  unverified.
