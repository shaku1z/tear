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

## What exists

Built during the mobile overhaul ("Pocket") and the 2026-11 device audit. Paths are as of 2026-11-19.

| Piece | What it does | Where |
| --- | --- | --- |
| Touch controls | Left movement stick, JUMP, DASH, THROW and the right aim area, with hit areas sized for thumbs. | `src/input/browser-input.ts` (touch handlers), `src/input/touch-control-layout.ts` |
| Touch aim, stick or drag | The "Touch aim" setting: stick (push from where the thumb lands) or drag (relative). | `src/input/browser-input.ts`, `src/gameplay/entities/blade-core.ts` (`captureDeviceAim`), `src/app/screens/settings-controller.ts` |
| Touch overlay and first-run coaching | The drawn controls, the aim ring and the coaching that fades after the first runs. | `src/presentation/world/training-touch.ts`, `src/app/training/touch-onboarding-controller.ts`, `src/presentation/world/overlay-snapshots.ts` |
| Touch ownership | A coarse primary pointer starts on touch: no cursor, touch layouts from the first frame. | `src/domain/pointer-ownership.ts`, `index.html`, [docs/CURSOR_INPUT_CONTRACT.md](../docs/CURSOR_INPUT_CONTRACT.md) |
| Rotate gate | Asks a phone held upright to turn sideways, and pauses a run while it is shown. | `src/presentation/render-pipeline.ts` (`rotateGateShown`), `src/presentation/ui-ledger.ts` (`rotateGate`), `src/app/shell/runtime-frame-coordinator.ts` (pause) |
| Phone layouts and touch density | Compact pages and profile, larger menu text and targets on small screens, enlarged overlays. | `src/presentation/screens/compact-page.ts`, `src/presentation/screens/compact-profile.ts`, `src/presentation/ui-density.ts`, `src/presentation/canvas-viewport.ts` |
| Haptics | Short vibrations on hits and actions where the browser supports them. | `src/input/browser-input.ts` (`navigator.vibrate`) |
| PWA and offline | Install, offline cache and update prompt. Desktop uses these too, so they are not mobile-only. | `src/platform/pwa-update.ts`, `vite.config.ts` |
| Browser tests | Responsive layouts, touch input and the rotate gate. | `tests/browser-responsive-matrix.js`, the touch scenarios in `tests/browser-input-matrix.js` |

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
