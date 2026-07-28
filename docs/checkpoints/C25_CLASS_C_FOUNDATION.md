# C25 — Physical Input and Black-Box Certification Foundation

## Status

In progress as of 2026-07-28. The implementation foundation has passed its
named gate, but C25 has not passed its exit gate and is not a Class C
certification.

## What is verified

- The external production policy receives only PNG screenshots, decodes only
  RGBA pixels, tracks the temporal frame stream, and emits normal browser
  keyboard/mouse or CDP touch gestures. Its browser control surface deliberately
  has no DOM evaluation, locator, game-state, semantic-action, URL-query, or
  test-global access.
- The pixel pipeline provides transparent-surface viewport calibration,
  contrast-region detection, generic menu/setup/play classification, confidence,
  frame-difference stability, coarse connected moving-world regions, temporal
  history, and occlusion refusal. Its separate visual-QA comparator uses
  brightness-normalized perceptual, chroma, structural, and region-specific
  image measures rather than byte-for-byte full-image matching. When a moving
  playfield region is available, the bootstrap policy derives its mouse aim from
  that image-space region rather than a hidden entity or state ID.
- `TearObservationSession` makes pixel, semantic UI, structured state, and event
  channels independently labelled. A black-box session rejects every channel
  except pixels and records every permitted read. Test-only parity comparisons
  happen after the policy decision and detect stale semantic/structured reports;
  they cannot repair a Class C decision.
- The certification contract permits only `black-box` / `pixel-only` evidence,
  freezes copied attempt evidence, keeps diagnostic retries outside the primary
  denominator, and uses a declared one-sided 95% Wilson bound. Normal Adventure
  is declared as 50 primary attempts with a 90% lower-bound requirement; 49/50
  would pass and 48/50 would fail.
- Clean shipped standalone coverage proves a visible menu-to-setup-to-play
  keyboard/mouse path. A separate pixel-guided touch path proves real CDP touch
  input. Clean CrazyGames iframe coverage proves the physical menu path with a
  local SDK façade and is explicitly engineering-only. A separate production
  input-edge check covers physical Enter, browser focus recovery, high-DPR
  touch in landscape and portrait phone viewports, and a `prefers-reduced-motion` surface without test globals. A clean
  standalone PWA browser session reloads
  offline, takes its post-reload pixels, and uses the pixel-guided physical menu
  policy; this is likewise engineering evidence rather than a campaign result.
  The standalone keyboard/mouse path also visually proves physical pause and
  resume in real play. Test-only pixel characterisation fixtures additionally
  establish generic image-only draft and terminal recognition and a physical
  terminal-to-menu click. Separate engineering visual-flow exercises prepare
  visible states, then permit the policy only screenshots and trusted physical
  input: keyboard/mouse reaches draft, terminal, and menu return; touch reaches
  terminal and menu return. They are not counted as clean certification attempts.
- The artifact adapter accepts only integrity-bound, pixel-only, black-box
  Normal Adventure menu-to-menu attempt artifacts. It counts a success only
  for a complete terminal victory; partial smokes and incomplete journeys stay
  explicitly incomplete, and malformed or tampered evidence is rejected.
- The controller evidence protocol copies browser Gamepad API observations,
  rejects identifiers that declare virtual or synthetic provenance, requires
  connected/disconnected/reconnected/remapped chronology and hashed traces, and
  requires named human review. It never treats a browser gamepad snapshot or
  synthetic controller as hardware certification.

The full verified foundation command is:

```text
pnpm check:c25:foundation
```

It includes requirements reconciliation, types, lint, the 700-line architecture
gate, eight focused C25 unit suites, standalone and CrazyGames production builds,
production-runtime isolation, and the five browser evidence checks above.

## Evidence boundary

All generated C25 browser artifacts state `certified: false`. The iframe SDK
façade and all input-edge coverage are engineering evidence; they are not
substitutes for a real hosted platform launch or hardware controller evidence.
No virtual gamepad is counted as a physical controller.

## Remaining C25 exit work

1. Extend the pixel-only policy from the bounded bootstrap to a robust visual
   policy that recognizes and operates real drafts, pause/recovery, terminal
   screens, and the menu return flow from unprivileged frames.
2. Obtain genuine controller hardware/connect/reconnect/remapping evidence
   through the new protocol and retain its required human review; a
   browser-synthesized gamepad is deliberately insufficient.
3. Run the resulting clean normal Adventure policy as its declared 50-primary
   attempt distribution, retain every input/observation/final-frame artifact,
   and meet the one-sided Wilson target without replacing failures by retries.
4. Complete the remaining interruption/platform matrix: lifecycle recovery,
   broader responsive-device coverage, and hosted CrazyGames evidence.

Until all four items are complete, this checkpoint must remain in progress and
must not be recorded as C25 passed.
