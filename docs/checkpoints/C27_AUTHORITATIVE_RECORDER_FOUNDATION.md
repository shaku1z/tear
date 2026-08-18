# C27 — Authoritative Ghost 3.0 Recorder and Capsule Foundation

## Status

In progress as of 2026-07-30. Ghost 3.0 remains separate from the Ghost 2.0
visual recorder and is not yet a completed, player-visible recorder.

## Verified foundation

- The C27 audit began with V3 truth, capsule, Vault, and replay-world modules
  as prototypes. The current production composition now imports the V3
  sidecar, while Ghost 2.0 remains the established player-facing visual
  recorder and is not replaced or relabeled by this work.
- Every real fixed simulation step seals canonical device-mapped actions once,
  after mapping and before gameplay consumption. Ordinary physical input and
  explicit structured authority both enter the same sealed `GameAction` stream;
  the shared runtime applies it through the live input adapter during the
  canonical tick. This preserves Ghost 2.0's behavior while creating the
  required C27 observation seam.
- Production composition opens an independent V3 sidecar at the same run
  boundary as optional Ghost 2 recording, observes the run-owned semantic
  session, records sealed actions and native authoritative gameplay events,
  and asynchronously finalizes it at the terminal boundary. The semantic
  session starts for every run before optional Ghost 2/V3 recording and is
  stopped by the run lifecycle, not the V3 observer. Ghost 2 is an outward
  compatibility adapter on that event port; Ghost 3 receives its own
  causal-event projection without Ghost 2 owning the source shape. It uses the
  browser IndexedDB Vault when available; unavailable storage leaves the game
  and Ghost 2 unchanged.
- `pnpm test:browser:ghost-v3-live-capture` now proves the V3 sidecar against
  the real test-standalone browser build: it begins a normal live run, writes
  to browser IndexedDB, terminates through the runtime lifecycle, and observes
  a completed capsule manifest with independent event and result chunks, then
   reloads and reads that same completed manifest and its decoded result track
   through a newly opened Vault.
  This is Class A test-build evidence: exact advancement shares the canonical
  action and post-step lifecycle, but does not exercise physical device capture.
- `pnpm test:browser:ghost-v3-physical-capture` separately drives the visible
  menu and a live run through the deliberately limited Class-C physical-input
  adapter, then allows the normal requestAnimationFrame loop to advance. It
  proves that a real device-mapped command and a periodic post-step keyframe
  plus named RNG snapshot enter the completed V3 capsule. Its final test-build lifecycle termination
  is not gameplay input and this engineering evidence is not a C25 Class-C
  certification claim.
- A native V3 capture now queues exactly one tick-zero State Forge keyframe
  and named RNG snapshot immediately after its V3 opening event, before
  opening-content RNG use or a legal reward can mutate configuration. Every
  recorded-canonical keyframe cites that opening event through provenance
  `sourceId`. Its version, revision, target, ruleset, and content identity are
  fixed to the immutable replay bootstrap; its configuration hash is derived
  from that particular keyframe because real upgrades legally change
  configuration after tick zero.
- `pnpm test:browser:ghost-v3-dynamic-config` reaches the real live tier-up UI
  and selects its first card through a physical mouse click. It proves the
  initial State Forge anchor agrees with the replay bootstrap, later upgraded
  keyframes retain the same static build identity but a different configuration
  hash, every keyframe cites the sealed opening event, and no valid upgrade
  causes snapshot degradation. This is live reward-controller evidence, not a
  State Forge direct-write substitute.
- V3 finalization now relinquishes the active capture synchronously. A run
  replacement can start its own sidecar while the prior IndexedDB capsule
  flushes independently; a focused unit proof preserves both manifests.
- Browser capture uses a separately bundled Vite module worker for chunk
  serialization, checksum, adaptive gzip compression, and optional thumbnail
  preparation. A versioned allowlisted registry decodes legacy
  `utf8-base64`, current `utf8-base64-v1`, and `gzip-base64-v1`; compression is
  retained only when smaller. The inline identity encoder remains only for
  non-browser and deterministic unit-test construction. The physical browser
  proof requires at least one real worker-compressed chunk and reads the full
  capsule back through the registry. Decoding uses a streaming hard output
  ceiling, and hostile imports must decode successfully within their declared
  uncompressed size before any bytes are committed.
- The declared Compact Public, Coaching, Forensic QA, and Cinematic recording
  profiles are now typed. Production live capture declares Coaching in its
  manifest; pre-profile schema-v1 capsules remain explicitly
  `legacy-unknown` instead of being relabeled.
- The local Vault now atomically commits a newly encoded chunk, its journal
  position, recording manifest, and manifest index in one backend transaction.
  The IndexedDB implementation uses one multi-store transaction; the memory
  backend preserves the same all-or-nothing contract for tests.
- Restart recovery now validates the manifest root and every committed chunk.
  A valid interrupted session becomes `recovered`; invalid evidence becomes
  `quarantined`, records its reason, and clears its terminal journal so startup
  does not repeatedly mutate it. The live sidecar opens that recovered Vault
  before it begins a new capture, so a subsequent run cannot write ahead of an
  interrupted browser session.
- `pnpm test:browser:ghost-v3-interrupted-recovery` now proves that recovery
  path in a real test-standalone browser: it leaves a V3 recording in
  IndexedDB, refreshes before finalization, and starts a distinct subsequent
  run. The prior manifest is then observably `recovered`, rather than being
  reported as complete or being overwritten.
- `pnpm test:browser:ghost-v3-corrupt-recovery` now proves the corresponding
  corrupt-interruption journey in a real test-standalone browser. It tampers
  with an actual committed IndexedDB chunk before refresh, triggers recovery
  only by beginning a later normal capture, and verifies that the interrupted
  manifest becomes `quarantined`, its `recovery:<capsuleId>` audit entry names
  the checksum/decode failure, and its terminal journal is gone. A pair of
  later healthy recordings complete without mutating that quarantine evidence.
  This is deterministic persisted-corruption evidence, not a claim that every
  physical storage-corruption mode has been reproduced.
- `pnpm test:browser:ghost-v3-storage-fault` now runs a test-build-only
  one-shot `QuotaExceededError` injection immediately before a real browser
  IndexedDB chunk transaction. It proves the active live run advances past the
  sidecar failure, the incomplete manifest remains `recording` rather than
  becoming complete, and a clean subsequent browser launch recovers it. This
  is deterministic fault-injection evidence, not a claim that a physical
  device has exhausted its actual quota or sustained long-run pressure.
- `pnpm check:c27:foundation` is green from this worktree after the corrupt
  recovery addition: requirements traceability, types, lint, source
  architecture, 69 focused unit tests, the standalone build, and all seven V3
  recorder/physical/recovery browser journeys pass. This is a C27 foundation
  gate, not the final C27 exit gate.
- `GhostCapsuleReader` now reopens completed capsules through verified chunk
  indexes and returns independently named Command, RNG, Event, Result,
  Keyframe, and Presentation tracks. Its first round-trip test uses the real
  Vault codec rather than an in-memory envelope.
- `mapGhostCapsuleToReplayEnvelope` converts those verified bytes into a native
  V3 envelope without inventing truth: it accepts only aligned canonical
  commands, contract-valid recorded-canonical snapshots, and valid causal
  events. Invalid track entries degrade the corresponding capability; command
  and state tracks remain explicitly `declared-unverified` until a compatible
  runtime replay proves them. The physical browser capture now proves a real
  device command and State Forge keyframe survive this mapping after IndexedDB
  persistence.
- Live run provenance is now stored immutably on the durable manifest rather
  than existing only in the bootstrap event. Older schema-v1 manifests remain
  readable with absent provenance instead of receiving invented metadata.
- New V3 captures now write the schema-v2 capsule envelope. Its versioned V1
  contract declares the Command/RNG/Event/Result/State/Presentation grammars,
  replay-context compatibility disposition, recording profile, and
  quality/degradation; a manifest hash binds all of those declarations to the
  independently verified chunk-root chain. Schema-v1 capsules remain readable,
  have a pure V1-to-V2 migration path, and do not receive invented provenance;
  supported V2 extension namespaces round-trip while future schemas reject
  before any Vault write. This is integrity linkage, not authenticity or a
  promotion of declared tracks to verified truth.
- The live recorder now exposes its active durable session ID to the snapshot
  seam. Every physical and exact keyframe cites the bootstrap event made from
  that UUID-bearing ID, rather than a run-ID approximation, so a real reopened
  physical capture reaches the intended `unavailable` compatibility result
  until a matching detached runtime is registered. `pnpm check:c27:foundation`
  passes its requirements/type/lint/architecture checks, 14 focused suites / 74
  tests, test-standalone build, and seven V3 recorder/recovery browser paths.
- A normal live V3 capture now additionally persists a versioned
  `replayContext` bootstrap declaration: resolved Ghost 2 run/build/ruleset
  provenance, run mode/difficulty/weapon, fixed 120 Hz clock, the named RNG
  state before opening content consumes it, the State Forge configuration
  projection hash, and the current content registry hash. Bootstrap creation
  is contained: malformed optional metadata produces an explicit
  `replayContextFailure` provenance field rather than interrupting Ghost 2 or
  live play.
- `GhostReplayRuntimeRegistry` and `assessGhostReplayAdmission` provide a
  deliberately fail-closed boundary. A reopened, complete capsule must carry
  a root-index-matching manifest and a valid V1 context before it can be
  considered; an exact detached-runtime descriptor is then required. The
  production registry deliberately contains no live closure-world runtime, so
  browser evidence proves a real persisted capsule returns `unavailable`, not
  replayable or verified. Before resolving a descriptor, admission now compares
  the manifest context with the chunk-integrity-covered opening event, requires
  exactly one matching tick-zero State Forge/RNG anchor, validates every
  keyframe's cited source, static build fields, and own configuration hash, and
  rejects duplicate or mismatched anchors. Manifest provenance is still a
  compatibility declaration rather than authenticity proof; this linkage does
  not promote any truth track or authorize publication.
- `tests/unit/live-frame-runtime.test.ts` and
  `tests/unit/ghost-capsule-vault.test.ts` pass with strict type and lint
  checks. These are foundation tests, not live C27 certification.
- The architecture audit is now recorded as binding checkpoint C27A in
  `docs/TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md`. Gameplay event ownership
  has moved to `src/gameplay/runtime/gameplay-events.ts`: the composition root
  injects one native event bus, while Ghost 2, Ghost 3, TearBench, and the live
  agent subscribe as independent consumers. Stage, wave, effect, loadout,
  spawn, and death publishers now emit through that native port. Spawn/death
  use stable combat-runtime actor IDs; Ghost 2 projects those IDs to its
  private numeric visual IDs while Ghost 3 retains the original facts. The
  regression test proves the projection does not change the V3-facing ID.
- TearBench live observation contracts no longer import concrete
  `src/app/game-runtime-state.ts` actor types. They consume structural
  capabilities from `src/simulation/runtime-world-port.ts`, and the source
  architecture gate contains planted dependency edges proving it rejects both
  Ghost 2 event coupling and concrete app-world coupling.
- C27A now has an executable portable-simulation foundation. The live combat
  host consumes `TearSimulationRuntime`; normal physical browser frames route
  through `advance`, and exact TearBench tooling routes through `advanceExact`.
  Both use the same canonical action and post-step lifecycle, while legacy
  player/blade overrides remain confined to a live app adapter. Its render-rate
  and exact-tick parity tests pass, but full live/replay/headless world parity
  remains open.
- A live sidecar now contains asynchronous worker and storage-quota failures
  instead of allowing a background flush rejection to escape or a failed run to
  look complete. The active run remains unaffected, `finish()` returns no
  completion, the failure is surfaced through the recorder, and the durable
  recording journal remains available for the existing recovery/quarantine
  pass. Focused fault-injection tests cover both encoder and chunk-commit
  failure paths.
- The live recorder's pre-IndexedDB and in-flight-flush staging queue is now
  explicitly bounded. Its profile-derived cap can be overridden for controlled
  tests; exhaustion surfaces the sidecar failure immediately, clears later
  staging, and leaves only an explicitly recoverable incomplete journal rather
  than allowing unbounded memory growth or a false completion. The focused test
  holds storage closed, exhausts the cap, then verifies recovery through the
  normal Vault path.
- The native event stream now carries authoritative run-lifecycle truth in
  addition to world facts. For V3-recorded runs, `run.started` is emitted after
  recorder startup and includes the required mode, difficulty, and weapon
  payload; independently, every live run owns the canonical input session.
  `run.defeated` is emitted after lifecycle termination but before defeat
  recording closes; `run.completed` is emitted at the scored progression
  boundary before victory recording closes; `run.abandoned` is emitted before
  explicit quit, TearBench termination, or run-replacement recorder shutdown.
  Ghost 2 deliberately ignores these V3-only lifecycle facts, preserving its
  visual packet format.
- `pnpm test:browser:ghost-v3-live-capture` (Class A test-build lifecycle
  termination) and `pnpm test:browser:ghost-v3-physical-capture` (Class C
  physical input followed by test-only lifecycle cleanup) now require persisted
  `run.started` and `run.abandoned` causal events. The physical capture also
  maps captured causal events through the V3 replay envelope; a missing
  required causal payload fails the browser gate.

## Remaining C27 implementation

1. Extend the completed versioned identity/gzip registry with any additional
   profile-specific codecs only when measured full-run budgets justify them;
   retain the inline encoder only as a test double.
2. Complete the independent V3 session around the remaining live interruption
   and terminal paths (including pending-finale claim/resume and unsupported
   storage), with full stable event/RNG coverage. The normal start, defeat,
   completion, explicit quit, test termination, and replacement boundaries are
   now typed and covered at the appropriate unit or browser level, but this is
   not yet exhaustive all-path or full-run evidence. V3 must remain
   behavior-preserving through the Ghost 2 outward adapter.
3. Extend the production IndexedDB Vault with browser worker-pressure and
   fault-injection evidence. Valid interrupted-recording reload recovery,
   deterministic browser-persisted corrupt/quarantine recovery,
   browser-injected chunk-quota containment, and unit worker/quota containment
   now exist; actual device-quota and sustained-pressure evidence remain open.
4. Supply a compatible detached replay-world runtime, then run mapped capsule
   snapshots and commands through it and provide seek, fork, practice,
   export/import, compatible migration paths, and measured CPU, memory, and
   storage budgets on a real full run. The current admission layer is only a
   safe discovery gate: it must remain `unavailable` for live capsules until
   C27A exposes a real isolated factory and execution proves the recorded
   tracks.
5. C27A is closed: retain C27's use of its one shared production composition
   while finishing the remaining replay-world, migration, full-run budget, and
   device-pressure evidence. Do not reopen C27A for durable-output or device
   fidelity claims owned by C39/C40.

This is not a C27 completion claim.
