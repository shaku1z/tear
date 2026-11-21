# Mobile, later

The one place for mobile follow-ups while mobile is paused. When work on desktop, input, layout or the
build touches something a phone or tablet will need, add one line under "Notes from other work" instead of
building it now.

## Status

Paused by the owner on 2026-11-19:

> "I want to pause everything mobile related ... I want to remove all mobile stuff from official
> production builds. Mobile right now just isn't a priority at all, and isn't needed until further notice."

And: "if sessions are working on something that mobile will eventually need, they should make note of
that, have like a md file". This is that file.

While mobile is paused:

- No session schedules phone, tablet or touch work.
- Performance numbers are taken on desktop. Phone measurements are paused
  ([docs/ENGINEERING_STANDARD.md](../docs/ENGINEERING_STANDARD.md), section 5).
- The source stays in the repository and dev and test builds keep it, so it stays buildable for later.
- The release builds (standalone, CrazyGames, itch) carry none of it: see "Out of the release builds".

## What exists

Built during the mobile overhaul ("Pocket") and the 2026-11 device audit. Paths are as of 2026-11-19.

| Piece | What it does | Where |
| --- | --- | --- |
| Touch controls | Left movement stick, JUMP, DASH, THROW and the right aim area, with hit areas sized for thumbs. | `src/input/browser-touch.ts` (touch handlers), `src/input/touch-control-layout.ts` |
| Touch aim, stick or drag | The "Touch aim" setting: stick (push from where the thumb lands) or drag (relative). | `src/input/browser-touch.ts`, `src/gameplay/entities/blade-core.ts` (`captureDeviceAim`), `src/app/screens/settings-controller.ts` |
| Touch overlay and first-run coaching | The drawn controls, the aim ring and the coaching that fades after the first runs. | `src/presentation/world/touch-controls.ts`, `src/app/training/touch-onboarding-controller.ts`, `src/presentation/world/overlay-snapshots.ts` |
| Touch ownership | A coarse primary pointer starts on touch: no cursor, touch layouts from the first frame. | `src/domain/pointer-ownership.ts`, `index.html`, [docs/CURSOR_INPUT_CONTRACT.md](../docs/CURSOR_INPUT_CONTRACT.md) |
| Rotate gate | Asks a phone held upright to turn sideways, and pauses a run while it is shown. | `src/presentation/rotate-gate.ts`, `src/app/shell/runtime-frame-coordinator.ts` (pause) |
| Phone layouts and touch density | Compact pages and profile, larger menu text and targets on small screens, enlarged overlays. | `src/presentation/screens/compact-page.ts`, `src/presentation/screens/compact-profile.ts`, `src/presentation/ui-density.ts`, `src/presentation/canvas-viewport.ts` |
| Haptics | Short vibrations on hits and actions where the browser supports them. | `src/input/browser-touch.ts` (`navigator.vibrate`) |
| PWA and offline | Install, offline cache and update prompt. Desktop uses these too, so they are not mobile-only. | `src/platform/pwa-update.ts`, `vite.config.ts` |
| Browser tests | Responsive layouts, touch input and the rotate gate. Parked: see below. | `tests/browser-responsive-matrix.js`, the touch scenarios in `tests/browser-input-matrix.js` |

## Out of the release builds

Since 2026-11-19 the release targets have `"mobile": false` in `config/build-targets.json`. That one
switch sets `__TEAR_MOBILE__` (`vite.config.ts`; dev and test builds always have it on), and every
mobile-only module is reached only behind it, so the release bundles drop the touch controls and their
drawing, the touch coaching, the rotate gate, the phone profile layout and haptics. The Settings row
"Control mode" (touch or desktop) is gone from builds without touch.

- **Which modules.** The role `@release.mobile-only` in `config/architecture-roles.json` lists them.
  The source rule `mobile.build-guarded` (`pnpm check:architecture`) lets only the modules in
  `@release.mobile-guarded-importers` import them, and those import them behind `__TEAR_MOBILE__`.
- **The build check.** A build without mobile fails if any of those modules contributes code to a
  bundle (the `tear-release-mobile-only-boundary` plugin in `vite.config.ts`). A top-level call such as
  `Object.freeze` keeps a module in the bundle even when nothing uses it: mark it `/* @__PURE__ */`.
- **A phone.** On a touch-only device (`(any-pointer: coarse)` and no `(any-pointer: fine)`) a release
  build shows one line on the boot screen, "TEAR is played on a computer for now, with a keyboard and
  mouse or a controller.", and never loads the game (`src/entrypoints/computer-only.ts`). If a mouse is
  plugged in or a controller connects, the game starts. A touchscreen laptop has a fine pointer and
  plays normally. Gamepad, the PWA and offline mode, fullscreen and auto-pause are unchanged.
- **The CrazyGames listing** should say desktop only. That is the owner's to change.

What a release build still carries: the phone branches inside shared screens (`ui.density.compact`
in about ten screen renderers, `src/presentation/ui-density.ts`) and `compact-page.ts`, whose scroll,
grid and list kit desktop pages use too. They are unreachable there, because `Input.touchActive()`
is always false without touch controls. `runtime-frame-coordinator.ts` keeps its own copy of the
portrait-gate condition (`touch && clientHeight > clientWidth`); it should call `rotateGateShown` when
mobile resumes.

### Parked browser checks

Run them with `pnpm check:mobile` (the `mobile` group of `config/checks.json`, outside the gate),
against a test build, which keeps the touch controls. Each one, and what is not checked while parked:

| Check | What it proves | Gap while parked |
| --- | --- | --- |
| `mobile.input-touch`: `tests/browser-input-matrix.js --touch` | The thumb stick moves the live player; a phone without pointer lock opens the draft; the first tap lands on the controls the player saw; the chapter opening on a touch phone; a phone that loses the screen pauses and lets the finger go. | Touch input in the test build can regress unseen. |
| `mobile.responsive-phones`: `tests/browser-responsive-matrix.js --touch` | Phone landscape and portrait (800x360 and 390x844 at 3x): the compact screens, the shop and the build menu scroll and return; the portrait rotate gate. | Phone layouts and the rotate gate can regress unseen. |
| `mobile.music-screen-phone`: `tests/browser-music-screen.js --touch` | The MUSIC screen's compact layout lists every song and plays a preview at phone size. | The compact music layout can regress unseen. |
| Release journey touch leg: `TEAR_RELEASE_ADVENTURE_LEGS=touch node tests/browser-release-adventure-journey.js` | A phone taps through the release menus to wave 1 and moves with the thumb. | Needs a release build with touch, which no target has; it returns with mobile. |
| `tests/browser-production-input-edge-smoke.js --touch` | High-DPR touch taps reach the release menu, landscape and portrait. | Same: needs a release build with touch. |
| Load profile `phone`: `TEAR_LOAD_PROFILES=phone node tests/browser-load-profile.js` | Cold load and START on a throttled phone. | Same; phone load times are not measured. |

The required checks keep their desktop halves (`--desktop`), and the release journey's
`computer-only` leg checks the line on a phone and a touchscreen laptop starting the game.

### When mobile resumes

1. Set `"mobile": true` on the targets that should ship it.
2. Move the `mobile` group's checks back into `browser` (drop `--desktop` and `--touch`), and turn the
   release journey's touch leg and the `phone` load profile back on by default.
3. Remove the computer-only gate from `bootstrap.ts`, or keep it for targets without mobile.

## Parked work

| Item | State | Where |
| --- | --- | --- |
| Touch aim keeps its aim when the thumb lands again; the ring is drawn where the stick is; coaching says PUSH or DRAG by mode | Draft, parked 2026-11-17. Code done; builds and browser tests not run. | [#191](https://github.com/shaku1z/tear/pull/191), branch `codex/touch-aim-fixes` |
| A third "Touch aim" mode, as one table of mode definitions read by input and drawing | Approved by the lead, not started. Conditions are in the lead's notes (`touch-aim-proposal.md`). | — |
| Phone tutorial clutter: too many prompts and panels on a phone screen | Found in the 2026-11-19 QoL playtest. | — |
| The tutorial says LEFT STICK on touch, where the control is the on-screen movement stick | Found in the 2026-11-19 QoL playtest. | — |
| THROW is drawn above the movement stick, where the thumb covers it | Found in the 2026-11-19 QoL playtest. | — |
| RESET DEFAULTS overlaps other Settings controls at phone size | Found in the 2026-11-19 QoL playtest. | — |
| Select Run text is cut off at phone size | Found in the 2026-11-19 QoL playtest. | — |
| From the device audit, in order: control placement and a haptics setting, PWA resume check and install guidance on phones, the one-tap first draft card | Not started. The audit's controller items are not mobile and are not parked here. | — |

## Notes from other work

One line per item: `date · session · what mobile will need · path or PR`.

- 2026-11-19 · mobile-input · Mobile resumes from this file and #191; the owner's device checks (real phone, real tablet) have never been run · [#191](https://github.com/shaku1z/tear/pull/191)
- 2026-11-19 · verdant-drawn · Drawn stage backgrounds are measured for readability at 1600x900 only (`config/stage-readability.json`); phone shapes are covered by the layer coverage maths alone, so a readability measurement and captures of each drawn stage at phone sizes are owed · [docs/BACKGROUND_WORKFLOW.md](../docs/BACKGROUND_WORKFLOW.md)
- 2026-11-20 · verdant-drawn · A drawn stage's motion (water rows, motes, swaying parts) is redrawn every frame and its cost is measured on desktop only; on a phone it needs a frame-time measurement, and low graphics already shows the stage at rest · [docs/BACKGROUND_WORKFLOW.md](../docs/BACKGROUND_WORKFLOW.md#what-moves)
- 2026-11-19 · training-ux · Tutorial-first PLAY: on a phone, skipping the tutorial on purpose is reached only through the drawn PAUSE, the pause's MAIN MENU and the quit confirm's SKIP TUTORIAL; check all three stay reachable at phone sizes, and the release journey touch leg walks them (`tests/browser-release-adventure-journey.js`) · `src/presentation/screens/pause-results.ts`
- 2026-11-20 · shards · Worn blade cosmetics (a trail up to 1.2x wide with a held fade, sparks up to 1.5x the count) are measured on desktop only; measure their draw cost on a phone, where the trail glow was already dropped for going over budget on desktop · `src/presentation/entities/blade-renderer.ts`, `src/presentation/particles.ts`
- 2026-11-20 · shards · The compact (phone) profile does not draw a worn title or banner, and the SHARDS tab's loadout row (eleven slots across the desktop column) and collection strips have no phone layout; both need one, and the name-entry screen for a loadout name needs checking at phone sizes · `src/presentation/screens/compact-profile.ts`, `src/presentation/screens/shard-shelves.ts`
