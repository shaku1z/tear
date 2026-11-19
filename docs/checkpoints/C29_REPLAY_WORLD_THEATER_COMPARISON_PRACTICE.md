# C29 - Replay World, Theater, Comparison, and Practice

The replay Coach, the knowledge libraries and `tests/browser-ghost-v3-live-capture.js` named in this note were removed in shaku1z/tear#227.

**Status:** complete - production-runtime replay, semantic Theater,
player-visible Practice From Here, side-by-side semantic comparison, and
durable active-campaign-cinematic restoration are proven by the named gate.

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
- C29's complete production composition now owns
  `ProductionWaveRewardRuntime`: the real wave-plan, spawn, clear, and reward
  routing executes with the source world and scheduler, and a non-hydrated
  natural opening starts through that lifecycle. Hydrated capsule worlds retain
  their captured lifecycle. C30 constructs through this same C29 composition,
  while the C27A detached host delegates to it; C27A retention evidence does
  not certify C29's separate active-cinematic durable-capsule gap.
- The same composition now owns a portable terminal outcome runtime. It uses
  the live outcome controller and native terminal-fact publisher while leaving
  presentation, persistence, cloud, and device work as semantic requests. The
  fresh C30 matrix matches the real terminal `run.defeated` fact; that does not
  make any durable output or active-cinematic claim.
- A fresh non-hydrated composition follows the live deterministic run-seed and
  run-start difficulty plan, including its centered ground-relative player
  spawn. C30's unmodified one-hit opening now reaches the same tick-222 browser
  defeat through that source root; it is a terminal-rerun boundary, not C29
  durable-capsule or cinematic evidence.
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
- Theater admission is now a typed, bounded `opened` or `refused` result. A
  recorded-canonical keyframe that fails isolated codec preflight is refused
  before a production session or transport exists. The normal Vault remains on
  the Profile screen, visibly reports `THEATER UNAVAILABLE`, and disables that
  source's Theater eligibility in memory. The refusal carries only a stable
  category, player-safe detail, tick, and root identity; it never exposes a
  decoder exception or mutates the durable capsule.
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
- [x] A durable active campaign cinematic restores through production replay.
  Live run start now opens the V3 recorder only after the synchronous opening
  transaction has installed the campaign chapter binding; the explicit
  `opening-initialized` tick-zero context and State Forge anchor therefore
  describe the same RNG/world boundary. The rebuilt browser journey captures a
  real campaign capsule whose `tear.cinematic.v1` director is active and whose
  tick-zero authoritative receipt matches after fresh production-composition
  restoration.

## Deliberately not claimed

This foundation does not turn legacy visual replay into V3 replay, admit an
incompatible capsule, or replace Ghost 2 playback. The older parity harness
retains its equivalent helper for its existing C27A suites, but the C29 replay
proof no longer imports that test helper. It establishes semantic simulation
restoration only; rendered pixels, PCM, haptics, and device-output fidelity
remain C25/C39/C40 work.

## Evidence

pnpm checkpoint check:c29:production-replay is the named gate. It runs the source
traceability, type/lint/architecture, receipt/production-runtime tests, and a
rebuilt browser V3 capture that reopens the completed IndexedDB capsule and
compares all captured authoritative receipts through source-owned replay. That
browser journey additionally follows the player-visible Profile -> Vault ->
Theater route, seeks tick 120, presses the rendered `PRACTICE` control, and
enters the live playing state. It confirms the active child and unchanged
durable source through read-only test diagnostics. The same journey proves
visible comparison of two durable capsules and a repeated semantic occurrence.
`test:browser:c29-active-campaign-cinematic` adds the settled-boundary campaign
capture and same-tick production replay comparison. Neither is a substitute
for pixel/device-output fidelity.

Recorded openings now retain their captured UI/focus at seek zero. A capsule-linked
permit admits the source start transaction only for supported Endless or prepared
Campaign openings: the explicit versioned descriptor, native start fact and a
separate checkpoint recorded after playing exposure must agree with the exact
anchor. Legacy inference requires a later canonical playing anchor and aligned
receipt; missing completion is unavailable, never invented. This proves linkage,
not authenticity. Raw Campaign restoration alone grants no playback transition.
Native start currently describes the initial session at wave zero, while its
opening-initialized installed world is wave one; publication order is preserved.
A tick-zero native terminal may follow that sealed playing completion without
invalidating the original anchor: it must identify the same run and follow the
completion in both native terminal phase and strict event sequence. Without a
sealed completion, legacy inference does not admit a tick-zero terminal. This
same-anchor comparison does not prove later continuation or endurance.
Public verified sessions capture the recorded tick range and reject out-of-range
or noninteger seeks before constructing a replay world.

Fresh authoritative receipts explicitly record held aim magnitude, including
full scale, while canonical full-scale state hashes keep their existing shape.
The v1 reader preserves historical absence. Same-tick receipt-assisted restore
does not prove a missing magnitude: the verifier folds admitted original actions
through the shared input owner with source-bound bootstrap linkage. An original
aim assignment can establish full magnitude from that point; the current v1
seeded-state declaration does not witness an actual initial input reset.
Unknown or established nonfull legacy omission is unavailable.
Later commands never establish earlier input. Only validated explicit full
magnitude is removed for canonical input comparison; other fields remain.
Original receipt/archive bytes and hashes are not rewritten or promoted.

The separate opening-continuation verifier derives an explicitly disclosed
in-memory envelope containing only the original opening anchor, executes exactly
180 existing-runtime steps, and compares source state and held input at 60/120/180.
It leaves archive bytes unchanged and never injects later receipt input. Normal
browser input is neutral in the reset tick-zero receipt; keyboard movement held
before start is queued for tick one. A unit fixture also injects nonneutral tick-zero
input to test restoration, without claiming that fixture is normal device evidence.
The optional `TEAR_C29_OPENING_JOURNEY=1` consumer requires a unique empty
`TEAR_OPENING_ARTIFACT_DIR` and uses rendered menu/setup controls, browser keyboard/
pointer input, held/released/repressed movement and edge actions, and natural
One-Hit Endless/Chainblade defeat and results retry in the forensic-QA test build.
Fresh execution is required before claiming this browser acceptance. Its test-only
inspector mode is `verify(id, "opening-continuation")`; unknown modes refuse.
This bounded source/input proof does not verify the entire causal event track,
native output, or a natural full Campaign/finale.


### Reconstructed world and local media implementation (2026-10-19)

Verified V3 seeks expose only settled render metadata and narrow draw capability,
bound to capsule/source roots, tick and semantic hash. Optional per-world native
presentation uses the same actor/platform/world renderers; headless defaults stay
unchanged. Cosmetics, player-follow camera and letterboxing are reconstructed,
not historical pixels. Draw does not step simulation or consume gameplay RNG.
Coach View Moment exposes the scene and a return-to-Coach action.

Studio now supports ordered appended verified ranges, existing clip speeds and
native browser WebM from a dedicated replay canvas, bounded to 1800 frames/60s
and 64 MiB. It validates source/EDL bindings, local decode, dimensions and duration;
the first accepted rendered frame supplies the PNG thumbnail. Download is a
separate explicit action. Source identity is rechecked before export publication
and download. Cancel/source replacement aborts work and stops tracks/encoders.
Source-time cinema/intro intervals, historical cameras and GIF remain unavailable;
no browser-frame time is inferred from 120Hz ticks. The existing engineered
240-tick browser journey is authored to save two world-only PNGs and decode its
actual one-second120→240 WebM; parent execution passed at `56a49044`.

Practice outward disposition now blocks profile/daily/achievement/biome writes
while retaining original mode and style/combat mathematics. An integrated existing
host/runtime control failed with eight outward calls before the repair and passes
with zero practice writes and ordinary calls restored after practice ends. This
is a bounded local implementation, not full Campaign or population acceptance.


The local WebM encoder now uses native WebCodecs VP8 with explicit 30fps
microsecond frame timestamps/durations and quality latency mode, rather than
MediaRecorder wall time. A bounded WebM mux preserves native payload/key flags,
1ms TimestampScale, exact duration, SeekHead and keyframe Cues. Reconstruction
speed cannot retime the clip. Queued frames/encoder close on cancellation and
unsupported native configuration refuses. The existing browser journey waits
for actual UI frames and decodes separated video times (0.1s/0.8s) to PNGs.
Native browser acceptance passed on clean `56a490449bf7917b03c31bd4f6097b74d34108f9`:
`test-standalone` build and `tests/browser-ghost-v3-live-capture.js` both exited0.
Build identity `a80b60188df9c4d19cd6944d7c59b3d301a472ccfbd16fb20fcde76fbe462237`;
artifact hash `d597f31309cef277abb9d22b2efb47709fdb53ea2b8c9a67f76a4579fdf48dfa`.
The downloaded 92,317-byte WebM decoded at640×360 for exactly1s, and native
video seeks at0.1/0.8s produced different PNGs. Nine-source comparison, actual
world frames120/240 and unchanged source custody passed in that same journey.
Retained local evidence: `.codex/tmp/tear-resumption-20261018/studio-56a49044`
under the owner's home, with adjacent build/browser logs. This is an engineered
240-tick source; full-run, device and historical-pixel acceptance remain open.

Recorded local challenge children now have a separately versioned fork origin.
Theater opens such children at their admitted absolute checkpoint tick F and
refuses seeks before F. Parent root/checkpoint/input/configuration/RNG custody is
required again on reopen; ordinary tick-zero and v1 replay meanings are unchanged.
Only explicit challenge launch enables a local child recording. Its native result
is reexecuted from the origin before a guarded local result is retained; it never
uses score/publication finish. See C37 for the supported rules and evidence limits.

### Linked scored-run/finale portable files

Normal Profile > Vault keeps the single-capsule DOWNLOAD and adds an explicit
DOWNLOAD LINKED PAIR for an available scored-run/finale relationship. The new
`tearghost-linked-archive` version 1 envelope holds exactly two existing archive
JSON strings, parent then companion. Their encoded chunk strings, manifest roots,
input/receipt/event bytes and fidelity declarations are retained. Existing single
archives, forensic exports and version-1 restore jobs keep their contracts.

Selection validates both bounded members and the existing exact finale-parent
linkage before preview names the scored run and finale. RESTORE BOTH is explicit.
One version-2 restore job adopts both members with one epoch-fenced transaction,
including shared chunk deduplication and its completion result. Exact existing
members are accepted independently; conflicting/missing existing custody is not
healed. Cancellation, exact-file reselection, non-evicting quota and uncertain
commit resolution cover the joint custody. Existing local protection owners are
guarded and preserved; no source-local holds, consent, training, publication or
Career authority travels in the file. No new dependency retention owner is added.

Focused controls cover this file/transaction/UI boundary. The optional external
source control validates retained original captures without rewriting them; it
is separate from portable generated fixtures. Archive import does not certify
independent scored-prefix or finale playback. Fresh normal download > fresh
profile > RESTORE BOTH > linked Theater acceptance remains a separate browser
gate, including any source snapshot reconstruction limitations.
