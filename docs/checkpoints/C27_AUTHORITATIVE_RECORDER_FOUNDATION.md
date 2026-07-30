# C27 — Authoritative Ghost 3.0 Recorder and Capsule Foundation

## Status

In progress as of 2026-07-28. Ghost 3.0 remains separate from the Ghost 2.0
visual recorder and is not yet a completed, player-visible recorder.

## Verified foundation

- The C27 audit established that the existing V3 truth, capsule, Vault, and
  replay-world modules are prototypes: no production runtime imports them.
  Ghost 2.0 remains the only recorder used by a shipped run.
- Every real fixed simulation step now seals canonical device-mapped actions
  once, after mapping and before gameplay consumption. In an ordinary player
  run those actions remain passive observation; only the existing explicit
  automation authority can consume them as gameplay input. This preserves
  Ghost 2.0's behavior while creating the required C27 observation seam.
- Production composition now opens an independent V3 sidecar at the same run
  boundary as Ghost 2.0, starts semantic observation, records sealed actions
  and existing stable engine events, and asynchronously finalizes it at the
  same terminal boundary. The legacy observer feed is adapted into independent
  V3 causal-event contracts at that boundary; Ghost 2's source event shape is
  not changed. It uses the browser IndexedDB Vault when available; unavailable
  storage leaves the game and Ghost 2 unchanged.
- `pnpm test:browser:ghost-v3-live-capture` now proves the V3 sidecar against
  the real test-standalone browser build: it begins a normal live run, writes
  to browser IndexedDB, terminates through the runtime lifecycle, and observes
  a completed capsule manifest with independent event and result chunks, then
   reloads and reads that same completed manifest and its decoded result track
   through a newly opened Vault.
  This is Class A test-build evidence only; its direct fixed-tick bridge does
  not exercise the normal physical-input/post-step keyframe path.
- `pnpm test:browser:ghost-v3-physical-capture` separately drives the visible
  menu and a live run through the deliberately limited Class-C physical-input
  adapter, then allows the normal requestAnimationFrame loop to advance. It
  proves that a real device-mapped command and a periodic post-step keyframe
  plus named RNG snapshot enter the completed V3 capsule. Its final test-build lifecycle termination
  is not gameplay input and this engineering evidence is not a C25 Class-C
  certification claim.
- V3 finalization now relinquishes the active capture synchronously. A run
  replacement can start its own sidecar while the prior IndexedDB capsule
  flushes independently; a focused unit proof preserves both manifests.
- Browser capture now uses a separately bundled Vite module worker for chunk
  serialization, checksum, and optional thumbnail preparation. Its first codec
  writes explicit binary UTF-8 payloads as base64 for durable storage, and the
  browser proofs exercise that worker. The inline encoder remains only for
  non-browser and deterministic unit-test construction. Compressed codecs and
  a full versioned codec registry are still required before C27 can close.
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
- `tests/unit/live-frame-runtime.test.ts` and
  `tests/unit/ghost-capsule-vault.test.ts` pass with strict type and lint
  checks. These are foundation tests, not live C27 certification.

## Remaining C27 implementation

1. Define one durable V3 capsule contract joining provenance, Command/State/
   Visual tracks, keyframe codecs, result, named RNG state, integrity chain,
   quality/degradation, and recording profiles.
2. Add compressed codecs and a full versioned decoder registry to the current
   binary UTF-8 capsule codec, retaining the inline encoder only as a test
   double.
3. Complete the independent V3 session around all live run start/stop,
   interruption, recovery, and terminal paths, with full stable event/RNG
   coverage. Ghost 2.0 must remain unchanged.
4. Extend the production IndexedDB Vault with browser reload,
   worker-pressure, and fault-injection evidence.
5. Run mapped capsule snapshots and commands through a compatible live
   replay-world runtime, then provide seek, fork, practice, export/import,
   compatible migration paths, and measured CPU, memory, and storage budgets
   on a real full run.

This is not a C27 completion claim.
