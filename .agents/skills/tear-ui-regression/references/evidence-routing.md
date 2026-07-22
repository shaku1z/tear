# UI evidence routing

| Change | Start with | Add when relevant |
|---|---|---|
| UI primitive/token/foundation | UI and presentation-system unit tests | Screens using the changed primitive; responsive browser evidence |
| Screen renderer or snapshot | Matching snapshot/renderer tests | Navigation/progression/playground/terminal journey owning that screen |
| Screen state, action, or return route | State/controller/action-router tests | Real pointer/keyboard journey |
| Focus, back, scroll, shortcut | Navigation/action tests | Journey plus input matrix when device modes differ |
| Touch/controller mapping | Semantic input unit tests | Browser input matrix |
| Viewport, DPR, safe area, overscan | Canvas viewport/presentation tests | Browser responsive matrix |
| Cinematic preference or screen transition | Campaign/cinematic unit tests | Cinematic preference or terminal browser journey |
| Accessibility or settings presentation | Settings/snapshot/render tests | Built feature/input/responsive evidence for affected behavior |

Read `docs/BROWSER_JOURNEY_COVERAGE.md` before adding a browser case. Reuse its real production routes and debug preparation rules. Browser matrices consume `dist/standalone`, so run the canonical standalone build first.

Capture only the states and viewport/input combinations that could reveal the changed contract. Include desktop 16:9 plus any affected portrait, mobile landscape, 4:3/HiDPI, safe-area, touch, or controller profile.
