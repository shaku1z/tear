# C29 - Replay World, Theater, Comparison, and Practice

**Status:** active - production-runtime replay, semantic Theater, player-visible
Practice From Here, and side-by-side semantic comparison are proven; the
durable active-cinematic exit condition is not.

## Scope and evidence rule

C29 turns durable V3 capsules into a replay and practice product without
creating a second simulation, mutating its source capsule, or reusing a live
profile. A checklist item clears only when its named evidence proves the
applicable production boundary.

## Proven foundation

- createProductionReplayWorld is now source-owned. It constructs the C27A
  DOM-free world through the real bootstrap, factories, live entity factory,
  world state/services, named RNG, weapon setup, and State Forge-compatible
  mutable state. Its presentation and outward-device ports are explicit no-ops.
- GhostProductionReplayWorld accepts an already composed TearSimulationRuntime;
  it does not create a scheduler or gameplay runtime. It replays every fixed
  tick through that supplied runtime, including empty action ticks, and exposes
  the exact active runtime for identity evidence.
- createProductionCombatPhases and createProductionCombatSimulation are now
  source-owned C29 adapters. They assemble the real opening/collision hosts,
  combat entities, kill runtime, and one fixed-step scheduler over that
  production world; their outward adapter records semantic intent only.
- tests/unit/ghost-production-replay-world.test.ts constructs that complete
  source-owned production replay composition, supplies its actual simulationRuntime,
  and proves the replay reaches tick 80 through that same object. A repeated
  seek creates a fresh production world and reproduces the semantic hash.
- Live V3 captures now store a validated authoritative-state receipt at the
  tick-zero anchor and each recorded keyframe. The receipt is the exact
  canonical fixed-step state hash, not a pixel/audio/device claim. The rebuilt
  browser live-capture journey reads ticks 0, 120, and 240 from the actual
  completed IndexedDB Vault capsule.
- The browser journey reopens that durable capsule through the normal Vault
  reader, rebuilds each same-tick State Forge keyframe through
  createProductionGhostReplayComposition, restores its held input snapshot,
  and compares all three receipts. Every reconstructed authoritative hash
  equals the captured hash.
- Active campaign cinematics now reconstruct their data-only chapter binding
  in the source replay composition before restoring the director. The focused
  source test proves the restored cinematic completes through the production
  lifecycle and activates its prepared wave; a durable campaign-capsule hash
  comparison is still separate evidence.
- createGhostProductionReplaySession admits only a capsule whose recorded
  authoritative receipts already verify through that source composition. It
  seeks from fresh replay worlds and can fork an exact recorded checkpoint into
  an immutable, unranked, non-persistent practice child; it owns no Vault or
  player/profile writes. The browser capture journey proves the durable source
  capsule is byte-for-byte unchanged after that fork. The player-facing flow
  built below carries that same child into the real live State Forge world.
- The normal Profile -> Vault route now exposes a healthy, complete V3 capsule
  as `THEATER`, never as Ghost 2 `WATCH`. It opens only after the validated
  Vault reader and verified production replay session succeed. Its visible
  transport seeks through fresh source-composition worlds at recorded
  checkpoints and uses the established pointer controls and Escape return path.
  This is semantic Theater: rendered gameplay-pixel/device fidelity remains
  C25/C40 work and is not implied by the Theater chrome.
- At a visible verified checkpoint, Theater now exposes `PRACTICE`. Its normal
  screen action forks the same admitted source session, validates unranked
  custody/lineage, and restores the child into the real live State Forge world.
  A first-world launch has no predecessor to roll back to; restoring over an
  existing world still retains State Forge rollback. The historical Ghost 2
  recorder embedded in the keyframe is cleared before play, and the active
  child disposition blocks scores, currency, profile/finale persistence, cloud
  writes, and replay recording. A normal new run clears that disposition.
- The normal Vault now lets the player select two distinct healthy, complete
  V3 capsules for `COMPARE`. The comparison screen admits both through their
  independent verified production replay sessions, then displays each semantic
  event occurrence in order, including repeated occurrences and a deliberate
  `MISSING` row where a source has no matching occurrence. The player flow
  selects from two through nine healthy sources. Neither it nor the source
  comparator mutates Vault or profile data, and it explicitly compares
  semantic source-simulation results only—not rendered pixels, PCM, haptics,
  or device output.

## Exit-gate ledger

- [x] Replay executes on the C27A production composition with no replay-owned
  second runtime.
- [x] A captured durable capsule reproduces its authoritative hashes through
  the production replay composition — the real test-standalone IndexedDB
  capsule at ticks 0, 120, and 240 matches every captured receipt after
  source-owned State Forge hydration and held-input restoration.
- [x] Seek, fork, and practice run from an admitted replay without mutating
  source custody or the production profile. The rebuilt browser journey reaches
  Theater through Profile -> Vault, seeks tick 120 with visible transport,
  presses `PRACTICE`, and reaches the real `playing` state. Its read-only
  diagnostic confirms the active child is unranked, releases latched input,
  and retains the expected immutable lineage; the source IndexedDB capsule is
  byte-identical before and after. Focused outcome evidence proves the active
  disposition suppresses durable terminal effects.
- [x] Theater is player-visible and passes applicable accessibility/input UI
  evidence â€” a rebuilt browser route records and reloads a real V3 capsule,
  follows the normal Menu -> Profile -> Vault pointer route, opens `THEATER`,
  jumps to its verified tick-120 checkpoint using visible transport, and
  returns to Profile with Escape. The Theater screen is a source-simulation
  semantic view; no pixel, PCM, haptic, or device-output fidelity is claimed.
- [x] Side-by-side comparison supports at least nine verified runs and
  repeated semantic occurrences. The rebuilt browser journey records nine real
  IndexedDB capsules, selects all nine through the normal Profile -> Vault
  `SELECT` controls (including its scrollable rows), opens rendered
  `COMPARE 9`, and advances to a second repeated semantic occurrence. The
  focused unit proof additionally asserts a missing second occurrence is
  represented rather than silently discarded.

## Deliberately not claimed

This foundation does not turn legacy visual replay into V3 replay, admit an
incompatible capsule, or replace Ghost 2 playback. The older parity
harness retains its equivalent helper for its existing C27A suites, but the C29
replay proof no longer imports that test helper. This proves the normal
test-standalone endless capture only; durable active-chapter-cinematic capture
remains unfinished.

## Evidence

pnpm check:c29:production-replay is the named gate. It runs the source
traceability, type/lint/architecture, receipt/production-runtime tests, and a
rebuilt browser V3 capture that reopens the completed IndexedDB capsule and
compares all captured authoritative receipts through source-owned replay. That
browser journey additionally follows the player-visible Profile -> Vault ->
Theater route, seeks tick 120, presses the rendered `PRACTICE` control, and
enters the live playing state. It confirms the active child and unchanged
durable source through read-only test diagnostics. The same journey proves
visible comparison of two durable capsules and a repeated semantic occurrence.
It is not a substitute for pixel/device output fidelity or active-cinematic
capture.
