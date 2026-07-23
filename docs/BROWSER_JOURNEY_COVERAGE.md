# Built-artifact browser journey coverage

These gates run the production standalone artifact with `?test=1&bossdebug=1`. Debug hooks may only prepare valid canonical state; all navigation and screen actions after preparation use real pointer or keyboard input.

Run all four route/progression/playground/result journeys with `pnpm test:browser:journeys`. The full `pnpm check` also runs `browser-input-matrix.js`, which uses real touch events and an emulated standard gamepad to verify touch movement/release and controller movement/jump/disconnect-to-pause behavior in the same built artifact.

| Gate | Real journeys |
| --- | --- |
| `browser-navigation-journeys.js` | Every menu hub route and BACK; War Table mode/difficulty/weapon/boss choices and return; all seven modes through BEGIN; pause/resume/confirm-quit/menu; required Attract entry/exit snapshot |
| `browser-progression-journeys.js` | Draft keyboard reroll; pointer choice; reserve choose and skip; tier-up choice; Shop/Codex/Profile/Achievement/Leaderboard routes, tabs, cards and scrolling; both replay feeds; replay chapter/pause/speed/restart/info/back; rename DOM validation and Escape return |
| `browser-playground-journeys.js` | In-world Build Menu entry; enemy spawn; Ability Lab entry, TAKE and scroll; Build Menu return; pointer resume; keyboard Tab resume |
| `browser-terminal-journeys.js` | Game-over retry and menu; rewarded-continue give-up; non-campaign win replay/menu; campaign result/menu; deterministic final-cut advance/cut through restoration/results |

## Required debug preparation hooks

The progression/terminal gates intentionally fail when a required hook is absent rather than silently skipping coverage:

- `openTierUp()` prepares a valid run with evolvable owned abilities, then uses the canonical tier-up transition.
- `openTerminal(kind)` prepares canonical result state for `gameover`, `continue`, `win`, or `campaignWin`.
- `openReplay()` enters a small ee5e931-compatible replay fixture through the production replay loader, including the oracle's `{ id, tier, n }` final-loadout summary shape.
- `openRename()` prepares the real DOM text-entry overlay and rename context without performing a cloud write.

`state()` exposes read-only Attract, War Table selection, draft/reserve, replay, and rename summaries so the journeys can assert that real input reached the intended production action. These hooks are allowed only behind `PANTHEON_DEBUG` and may not bypass the production screen renderer or action handlers.

## External blockers that remain real

- A successful cloud rename cannot be asserted without an authenticated provider session. The journey covers the real input overlay, validation surface and cancel/return path; provider write behavior remains in cloud contract/browser platform tests.
- A successful shop purchase needs seeded persistent currency. The navigation gate covers the real Shop route and disabled/available controls; purchase mutation remains unit-tested until a canonical test-profile seed API exists.
- Remote leaderboard fetching and linked replay downloads require a provider backend. The journey covers local route/tab behavior and a valid local replay fixture; provider I/O remains in platform contract tests.
