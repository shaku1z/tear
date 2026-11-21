# UI evidence

| Change | Start with | Add when relevant |
| --- | --- | --- |
| Shared component, token or frame | The UI and presentation unit tests | Every screen that uses it; `pnpm test:browser:responsive` |
| Screen renderer or snapshot | The screen's snapshot and renderer tests | The journey that reaches the screen |
| Screen state, action or return route | State, controller and action-routing tests | `pnpm test:browser:journeys` |
| Focus, back, scroll, shortcut | Navigation and action tests | A journey, and `pnpm test:browser:input` when input modes differ |
| Controller or keyboard mapping | Semantic input unit tests | `pnpm test:browser:input` |
| Viewport, pixel ratio, safe area | Canvas viewport and presentation tests | `pnpm test:browser:responsive` |
| Scene preference or screen transition | Campaign and scene unit tests | `node tests/browser-cinematic-preferences.js` |
| Music screen | `tests/unit/music-screen.test.ts` | `pnpm test:browser:music-screen` |
| Settings and accessibility presentation | Settings snapshot and render tests | The feature, input or responsive check for the behaviour |

Find a screen's unit tests with `git grep -l <screen name> -- tests/unit`.

Before adding a browser case, read
[docs/BROWSER_JOURNEY_COVERAGE.md](../../../../docs/BROWSER_JOURNEY_COVERAGE.md) and reuse its routes and
its rules for debug preparation: a hook may only prepare valid state, and everything after it is real input.

All of these read `dist/test-standalone`, so run `pnpm build:test:standalone` first, and run each through
`pnpm queue -- <command>`. The required check runs the input and responsive checks with `--desktop`; the
`--touch` halves are parked with mobile and run on demand (`pnpm check:mobile`).

Capture only the states and viewports that could show the change. Desktop 16:9 always; add 4:3, HiDPI or
ultrawide when layout is affected.
