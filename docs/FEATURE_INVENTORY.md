# Tear Feature Preservation Inventory

This is the migration checklist for the architectural redesign. A checked feature has characterization, contract, deterministic, or built-artifact browser coverage in the redesigned runtime and is included in `pnpm check`. Presence in a compatibility bundle alone does not count. A check records the existence of credible automated evidence; release readiness still requires that the complete gate pass from the final clean commit.

## Runtime and releases

- [x] Standalone browser release — `platform-browser-smoke.js` (standalone), `browser-smoke.js`, and the standalone build/reproducibility gates.
- [x] Installable/offline PWA and safe update recovery — `pwa-offline.js` and `pwa-update.test.ts`.
- [x] CrazyGames iframe release and SDK lifecycle — `browser-crazygames-iframe.js`, `platform-crazygames.test.ts`, the CrazyGames platform smoke, and package validation.
- [x] Responsive/overscan Canvas 2D presentation — `browser-responsive-matrix.js` covers four viewport/DPR profiles; the iframe gate also covers portrait resizing.
- [x] Keyboard/mouse, touch and controller input — `browser-smoke.js`, `browser-input-matrix.js`, and the semantic/legacy input unit suites. The built controller matrix proves the west face button starts the selected setup directly without focus-traversing to START; prompts resolve through the active PlayStation/Xbox/generic glyph family and current bindings. One-shot gameplay edges remain buffered across display frames that do not produce a 120 Hz fixed tick, preventing high-refresh input loss.
- [x] Fullscreen, pointer lock, focus loss and controller disconnect behavior — `browser-input-matrix.js` and the focus-release assertion in `browser-smoke.js`.
- [x] Cloud/Firebase and offline/local capability fallbacks — `platform-firebase-cloud.test.ts`, `platform-cloud.test.ts`, `platform-browser.test.ts`, and `platform-legacy-compat.test.ts`.
- [ ] TearBench/Ghost 3.0 operational completion — C0-C20 supplied typed
  contracts and focused prototypes. C27 now has native-event/capsule browser
  foundation evidence, including persisted V3 `run.started`/`run.abandoned`
  causal boundaries from both Class A and physical-input paths, a
  browser-reload recovery proof for a valid interrupted recording, and an
  injected browser quota-failure containment/recovery proof. New V3 capsules
  use a versioned schema-v2 contract/integrity envelope that binds declared
  provenance/track grammar/profile/quality to the verified chunk root, keeps
  V1 readable through a pure migration, preserves supported extensions, and
  rejects future schemas without writes; physical keyframes cite the exact
  UUID-bearing bootstrap event. C27A now routes
  both normal physical frames and exact tooling through one live-consumed
  portable fixed-step core (`check:c27:foundation`,
  `check:c27a:foundation`) and a shared live-world entity-construction catalog
  now keeps State Forge and active gameplay on the same production factory
  choices. A generic per-world state/service context now also centralizes the
  live run, actor collections, configuration, named RNG, clocks, effects,
  Mirror, and boss-feedback seam, while explicitly retaining the current app
  implementations behind its adapter. The combat action path now uses that
  shared collection owner rather than a second collection adapter. Each world
  now also owns exactly one cinematic director used by campaign, combat, and
  presentation. The dedicated `tear.cinematic.v1` State Forge component and
  content-fingerprinted data-only chapter binding capture and transactionally
  restore an active campaign position with input re-armed, including validated
  cross-session reconstruction and next-beat continuation. Legacy active
  chapters without a binding fail closed; generic active scenes remain
  same-session-bound. Detached construction uses explicit gameplay ports, and
  all 13 fixed-tick scenarios now match without a divergence exception. Their
  complete post-origin native semantic streams also match exactly through
  shared spawn, wave, and terminal publishers, including terminal outcome
  controller behavior and stable actor/session identity. The matrix now also
  crosses a naturally earned wave-1 clear, real draft selection, and wave-2
  spawn through the portable reward runtime. This is still not a C27A
  completion claim: render-frame/outward-effect parity and full
  production-world extraction remain.
  The live app's cross-world setup selection, outcome, replay, vault, and
  victory-clock values now have an explicit session owner; the portable world
  sees only its narrow session port. Focused unit and rebuilt campaign-victory
  evidence preserve that handoff, not durable storage or full-world portability.
  Floaters, slow zones, and temporary walls are also now consumed directly from
  world state by State Forge and presentation. This preserves the existing live
  path through focused and rebuilt campaign evidence, but leaves the full
  production world app-bound.
  Boss-intro and boss-beat state also flow directly from world state through
  live music, frame, State Forge, and presentation paths. This preserves the
  existing live path through focused and rebuilt campaign evidence, but leaves
  actor, frame, and combat ownership app-bound.
  Enemy and projectile collections also flow directly from world state through
  the live context, music, frame, State Forge, diagnostics, and TearBench
  bridge. This preserves the existing live path through focused and rebuilt
  campaign evidence, but leaves player, blade, run, frame, and combat ownership
  app-bound.
  The live run also flows directly from world state through session services,
  campaign/training, combat, State Forge, and presentation adapters while
  retaining the existing absent-run menu behavior. This preserves the live path
  through focused and rebuilt campaign evidence, but leaves player, blade,
  frame, and combat ownership app-bound.
  The live blade also flows directly from world state through session, combat,
  input, State Forge, and TearBench bridge paths while retaining the existing
  absent-blade menu behavior. This preserves the live path through focused and
  rebuilt campaign evidence, but leaves player, frame, and combat ownership
  app-bound.
  The live player also flows directly from world state through session,
  campaign/training, combat, input, replay, State Forge, and TearBench bridge
  paths while retaining existing absent-player menu behavior. This preserves the
  live path through focused and rebuilt campaign evidence, but leaves frame and
  combat construction app-bound.
  Shop coin display and purchase-flash feedback now flow through a typed
  frame-presentation owner rather than the live runtime closure. This preserves
  the live path through focused and rebuilt campaign evidence, but does not make
  the complete frame/UI or production-world state portable.
  HUD health smoothing and multiplier-pop feedback now also flow through a typed
  frame-presentation owner rather than live runtime closures. This preserves the
  live path through focused and rebuilt campaign evidence, but does not make the
  complete frame/UI or production-world state portable.
  UI controls, focus, scroll, and hover animation now also flow through a typed
  frame-presentation owner, keeping input routing and rendering on one state
  boundary. This does not complete UI timing or production-world portability.
  UI timing, navigation, entrance state, and zoom now use a typed frame-state
  owner, preserving the existing input zoom handoff. This does not complete
  revive state or production-world portability.
  The rewarded-revive countdown now uses a typed outcome-state owner. This
  preserves its existing timeout path but does not complete outcome persistence
  or production-world portability.
  Music direction is now owned by each live-world composition, so the existing
  run, observation, and frame paths share the world's `MusicDirector` rather
  than a host-local instance. This does not establish portable audio/device
  parity or production-world portability.
  A TearBench-requested live-run seed now flows through the typed world-session
  owner and is consumed once by the actual run-start path. This preserves
  deterministic injection only; it does not complete replay/headless parity or
  production-world portability.
  The live Ghost V3 sidecar now owns its browser recorder, causal-event
  sequence, and replay-bootstrap context through one typed recording-session
  owner. This preserves capture behavior only; it does not establish V3
  playback, player-visible replay, or production-world portability.
  Semantic automation authority now prevents pointer-lock requests and device
  aim capture through one typed browser-input owner. This preserves the current
  safety behavior only; it does not complete physical-input certification or
  device parity.
  Portable world assembly now creates one lifecycle and one transient record
  for every supplied world port. Detached combat reads that exact world-owned
  record, so State Forge restoration cannot update a separate harness-local
  record. This does not make entity selection, live services, presentation, or
  a complete production world portable.
  The live runtime now creates its session and world through one production
  root that requires its runtime configuration reference to match the
  world-owned configuration value. This prevents a torn configuration authority
  but does not isolate remaining app services or enable concurrent full worlds.
  Detached construction now joins its state, entity, service, and cinema ports
  through the portable world core directly, avoiding an unused live music
  director. It still uses narrow app-backed adapters and is not full-world
  portability.
  Production actor factory-ID selection now lives in a gameplay-only catalog
  supplied with concrete constructor ports; the app adapter only binds legacy
  classes. This preserves Echo modifier rebinding but does not make entity
  classes or their outward services portable.
  Real
  full-world portability, durable
  Ghost/Academy storage, genuine learned policies,
  automatic Foundry operation, complete visible experiences, and end-to-end
  certification remain tracked by
  `plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md`.
- [x] Test-build State Forge Studio — `tearbench-state-forge-studio.test.ts`
  keeps structural, reachability, and population-plausibility reports
  independent; `browser-state-forge-studio.js` proves the `?stateforge=1` live
  host can launch and capture a disposable runtime, inspect provenance and
  diffs, fork and transactionally watch a checkpoint, import/export TearSDL,
  and fail closed on malformed editor input.

## Game flow and modes

- [x] Main menu, setup/war table and tutorial — `browser-navigation-journeys.js`, `browser-feature-matrix.js`, `browser-tutorial-journey.js`, and `training-controllers.test.ts`; setup preserves the oracle risk pips, weapon identity/rating strip, and hero START treatment through the typed live-renderer boundary while placing all public choices on one aligned row grid. The fourteen-block Cutting Room resets its task arena/state per block and never applies shop/meta upgrades. Read the Charge teaches the defensive read; Field Test then states and validates one two-step route—evade, then punish recovery—before handing off to no-wave practice. Prompts adapt to keyboard/mouse, configured controller glyphs, and touch; the browser journey completes the whole course through real semantic gameplay input.
- [x] Endless, campaign/adventure and every published challenge/training mode — both browser mode matrices start all seven published modes; `run-wave-rules.test.ts` and `run-session.test.ts` characterize their lifecycle classes.
- [x] Run start, wave progression, biome progression and boss transitions — the run lifecycle, wave planner/scheduler/clear, browser smoke, and boss phase suites.
- [x] Upgrade draft, reroll, reserve and boss tier-up flows — `browser-progression-journeys.js`, `gameplay-definitions.test.ts`, and `weapon-ability-conformance.test.ts`.
- [x] Pause, settings, rewarded continue, game-over, victory and finale — the navigation and terminal browser journeys plus the app state-machine suites.
- [x] Shop, codex, profile, achievements, leaderboards and replay feed/viewer — `browser-progression-journeys.js`, progression/replay tests, and platform leaderboard contracts. Authenticated remote I/O remains adapter-contract evidence as documented in `BROWSER_JOURNEY_COVERAGE.md`.
- [x] Attract mode, cinematics and chapter/finale sequences — the Attract navigation journey, `campaign-controllers.test.ts`, `presentation-systems.test.ts`, `boss-ritual-controller.test.ts`, and the terminal finale journey.

## Combat and content

- [x] Sword, hammer, spear, chainblade and ringblade start and throw/recall characterization — `weapon-overhaul.test.js`, `gameplay-definitions.test.ts`, and the five-weapon built-artifact smoke loop.
- [x] Weapon-specific throw identities and completed weapon action safety checks — `weapon-overhaul.test.js` and `gameplay-definitions.test.ts`.
- [x] Player movement, jump, dash, drop-through, tether and trick scoring — `player-locomotion.test.ts` characterizes acceleration/friction, coyote and buffered jumps, dash transitions/charges and one-way drop-through; the semantic input and trick-runtime suites cover tether/actions and scoring.
- [x] Weapon-by-ability conformance across normal, special and unique upgrades — `weapon-ability-conformance.test.ts` exhausts every weapon/upgrade pairing and `gameplay-definitions.test.ts` protects the authored catalogue.
- [x] Projectiles, particles, supports, zones, walls and stage hazards — `combat-entity-conformance.test.ts`, `presentation-systems.test.ts`, `gameplay-definitions.test.ts`, and `training-controllers.test.ts`.
- [x] Every standard enemy, variant and affix — `enemy-catalogue.test.ts`, `enemy-behavior-matrix.test.ts`, and `enemy-factory.test.ts`. The behavior matrix now runs at the live 120 Hz simulation cadence, and Mirror conformance drives its AI through the real player integrator so immobility cannot be hidden by a no-op actor double.
- [x] Every boss, boss phase, arena mutation and Pantheon/Source sequence — `boss-phase-conformance.test.ts`, `boss-ritual-gate.test.ts`, `boss-ritual-controller.test.ts`, `browser-boss-parity.js`, `training-controllers.test.ts`, `campaign-controllers.test.ts`, and run-content/wave conformance. The built journey crosses both Warden/Colossus rituals, Aldric's crownfall and resurrection, Echo's split/final form, and Source's void descent before proving live AI and held-blade damage. Source's authored stolen-blade counter is wired through the typed live enemy/blade coordinator, emits a semantic `stolenBlade` Ghost event, and is covered at the wiring boundary by `enemy-blade-catch-runtime.test.ts`; the C24 natural Boss Test currently records catch/recovery as not observed because the agent dies before the void phase.
- [x] Difficulty, run modifiers, permanent upgrades and economy rewards — the run session/wave suites, `gameplay-definitions.test.ts`, `weapon-ability-conformance.test.ts`, `progression-systems.test.ts`, `coin-awards.test.ts`, and `run-outcome-planner.test.ts`.

## Persistence and online behavior

- [x] Legacy settings migrate without losing choices — `persistence-envelopes.test.ts`, `settings-controller.test.ts`, `audio-settings.test.ts`, and `audio-live-legacy.test.ts`.
- [x] Profile, currency, upgrades, achievements and challenge progress persist — `progression-persistence-round-trip.test.ts` rehydrates currency, a purchased shop level, achievements, shards, profile stats/modes and completed daily-challenge progress from one shared store, alongside the envelope and corruption-recovery suites.
- [x] Leaderboard submission, identity and failure/offline behavior — `platform-shared-cloud.test.ts`, `platform-cloud.test.ts`, `platform-browser.test.ts`, and `platform-firebase-cloud.test.ts`.
- [x] Replay recording, vault, publication, loading and legacy migration — replay visual/vault/envelope suites, `replay-round-trip.test.ts`, platform publication contracts, and the replay browser journey.
- [x] Deterministic replay verification across render rates — `authoritative-replay.test.ts` verifies JSON-round-tripped actions at 30/60/144 Hz; replay hash/envelope/round-trip suites cover verification and serialization.
- [ ] Ghost 3.0 durable Vault and governed cloud publication — C28's named
  gate now proves real IndexedDB Vault storage across browser restart,
  version-1-to-version-2 migration, interrupted-write recovery, hostile
  imports, Doctor repair children, governed knowledge libraries, and a
  browser-enforced physical quota rejection after retaining a source capsule.
  C27 also includes a real IndexedDB live-capture sidecar plus a persisted V1
  replay bootstrap, keyframe-aligned canonical authoritative-hash receipts,
  and fail-closed admission check. C29 now reopens one normal test-standalone
  durable capsule and reproduces all three captured keyframe hashes through
  source-owned State Forge hydration and production combat composition. A
  verified source replay can now seek and create a non-persistent, unranked
  practice child at a verified checkpoint without mutating its durable capsule;
  a healthy completed capsule is also playable through the normal Profile ->
  Vault `GHOST THEATER` route, where its visible semantic transport reaches
  verified checkpoints and returns with Escape. At a verified checkpoint its
  visible `PRACTICE` control restores a real unranked child into live play;
  source custody stays byte-identical and the child blocks durable outcome,
  profile, economy, cloud, and recording effects. A dedicated built-browser
  campaign capture now preserves an active chapter director at the explicit
  `opening-initialized` tick-zero boundary and reproduces its receipt through
  production replay. Pixel/device output fidelity remains C25/C40 work. C29
  also now exposes
  player-visible semantic comparison: from Profile -> Vault, select two
  through nine healthy completed V3 capsules and use `COMPARE N` to
   reconstruct and inspect each repeated semantic event occurrence side by
   side. It is intentionally a semantic source-simulation comparison, not a
   pixel, PCM, haptic, or device output claim;
   C29/C30 source replay and headless composition now own the same portable live
   wave, spawn, clear, and reward runtime (including semantic draft routing)
   used by the C27A detached host, plus the portable terminal-outcome runtime.
   C30's ordered gate rebuilds the 13 live browser traces and matches all 5,732
   source-composition hashes, native streams, the natural route, and terminal
   fact. An untouched one-hit source opening also reaches a real tick-222
   failure, retained as an immutable terminal artifact and visibly rerun at the
   same terminal tick/disposition in the Class-A browser; it is not durable or
   training-stream output. An active, non-draft C30 episode can also carry an
   in-memory State Forge source keyframe, held-input state, accepted command
   envelopes, and canonical hash into a fresh C29 production composition. The
   tick-60 movement/jump/dash proof restores that exact source state and reaches
   an exactly equal tick-120 terminal artifact; malformed traces, surgical state,
   and snapshot/scenario mismatches fail closed. This is not persistence,
   worker-job recovery, or a draft/reward-route checkpoint claim. C30 also has
   a versioned, forced-GC five-cycle developer-host observation: 160 natural
   600-tick episodes / 96,000 fixed steps completed with identical repeat hashes,
   2.4 MiB retained heap, and 610.4 episodes/minute on the declared local host.
   A bounded C30 Academy-candidate intake also receives those real terminal
   artifacts: each cycle retains eight, explicitly reports pressure for the
   remaining 24 (40 accepted / 120 backpressured across the run), and never
   stops an episode. It is neither a target-hardware capacity pass nor a
   consent, corpus, or training claim. C30 also exercises its existing
   serialized dispatcher with 32 independent source episodes across exactly
   eight operating-system workers, then reuses that bounded pool; it is not an
   unbounded fleet or target-throughput certification. A parent can also cancel
   one active source worker only after its first fixed tick; that child is
   terminated and the next episode gets a fresh PID, with no checkpoint,
   restoration, retry, or durable job claim;
   C31 now places a fail-closed Academy admission decision in front of that
   candidate stream. It separately checks local/cloud/analytics/model consent,
   privacy, structured-training provenance, build identity, and a verified raw
   track bundle against a real C30 terminal before any corpus action. That
   bundle now reconstructs actual canonical observations/actions/timing plus
   native facts, reward snapshots, and ordered planner intents through the
   shared composition. It accurately identifies the semantic source device. A
   separate C31 Vault reader can bind an integrity-checked C27 capsule only
   when its replay bootstrap, commands, terminal range, and C30 terminal anchor
   all agree. A C31-only, explicit post-intake materializer now writes that
   exact source capsule and reads back its attestation; the synchronous C30
   stream itself remains storage-free, and an unmaterialized intake item still
   refuses build/provenance and capsule-range tracks by default. This is source
   custody only: an eligible materialized source may now enter a durable,
   hash-chained C31 pre-corpus ledger with explicit retention and consent
   decisions. Revoked or expired records are excluded from future held-candidate
   queries without erasing their audit history. An authorized C31 deletion
   removes the exact attested source capsule atomically with a non-training
   tombstone. Each custody record also persists a privacy-class-matched,
   versioned local authority policy; undeclared actors cannot revoke, expire, or
   delete it. Held sources can now receive a durable, fail-closed quality
   assessment derived from their verified raw tracks: transparent coverage and
   density components, source metadata, explicit outlier flags, and a content
   hash that recognizes equivalent captures as duplicates. That assessment is
   still only `review-required` or `duplicate`, never trainer input. An
   authorized human can record one immutable curation decision or correction
   request against an exact held assessment; a future active-candidate view
   removes it after custody revocation/expiry. An approved source can then enter
   a lineage-bound durable pre-corpus split/manifest and materialize a reviewed
   sample retaining its exact Vault range and verified tracks. Trainer manifests
   omit hidden exams. The normal main-menu `ACADEMY` screen presents a read-only
   runtime-owned aggregate plus a bounded privacy-safe record/manifest inspection
   of durable held, reviewed, curated, consent, retention, split, and revision
   state, including an explicit storage-unavailable state with a retry that
   refreshes the existing inspection controller after the player checks browser
   storage permissions. Its lesson labels
   report only active governed corpus coverage (`unrepresented`, `governed`, or
   `recovery-evidenced`), never a lesson pass or policy quality; it is not a
   trainer input or full Academy workspace. A reviewed governed source can now become a durable Academy corpus entry with
   a versioned reader-scoped manifest; trainer views exclude hidden exams and
   revocation removes entries from future manifests. In the normal Academy, a
   signed-in ID named by a held record can withdraw only model-training consent;
   the action is re-authorized at execution and preserves the local audit
   history. It is not cloud-account deletion or cross-device authority. C32 now has a local,
   Vault-backed versioned policy-artifact registry: it validates content hashes
   and runtime compatibility, quarantines corrupt/incompatible bytes, and makes
   activation plus rollback pointer history atomic. It does not execute model
   payloads, train from Academy data, or expose a Watch Agent policy. A
   browser-seeded IndexedDB artifact now survives reload into the normal Class-A
   Watch Agent route and its validated canonical action is submitted through
   semantic input with an inspectable receipt. That normal route also writes a
   bounded integrity-checked Ghost Vault analysis decision journal containing
   the real canonical action batch, observation hash, artifact receipt, and
   Class-A hierarchy trace; it is explicitly separate from causal capsule
   recording. A bounded frozen structured suite now also produces a reproducible
   active-artifact decision-conformance report, but does not establish real-game
   performance or promotion safety. The data-only table runtime has static
   payload/work/action limits and elapsed fallback containment, but no external
   inference backend. Only unactivated leaf artifacts may be evicted, with
   receipt-backed preservation of active/rollback lineage. Player-facing policy
   controls remain absent. The active table artifact can also run against the
   C29/C30 source-owned production world and return repeatable in-memory
   terminal evidence; bounded hash-checked reports now have local Vault custody
   with corrupt-byte quarantine. A fixed, bounded multi-scenario production
   suite also records only observed terminal/truncation and artifact/fallback
   execution facts; it defines no quality score, training result, or promotion
   threshold. Those suite reports now have idempotent, corruption-safe local
   Vault custody and bounded auditable retention by deterministic content-hash
   order, never an outcome-derived ranking. C33 now loads bounded immutable
   track sequences only through a named C31 trainer manifest, rechecking every
   custody/curation/split/track hash and excluding hidden exams; it does not yet
   train or produce a policy artifact. Its fixed 17-feature normalization fits
   only the training split and batches held-out splits separately. It now also
   deterministically fits a bounded linear artifact and executes it through the
   C32 runtime against a source-owned production observation. A separately
   governed validation split can produce a reproducible offline exact-action-
   conformance report only from a persisted fit; it rejects the training split
   and provides no quality threshold or promotion path. Those reports have
   idempotent corruption-safe local custody only.
   C33 also captures bounded active-artifact versus scripted-teacher action
   disagreements from the shared production headless world, preserving
   artifact/scenario/context lineage while applying only challenger actions.
   Named local reviewers can make immutable accept/reject decisions on those
   proposals; neither unreviewed nor rejected proposals are corpus input or
   promotion. Each proposal retains only the shared bounded training feature
   vector needed for later approved-only retraining.
   C33 now also fits a bounded causal temporal-window perceptron from those
   governed tracks and executes its data-only artifact through the same C32
   source-world runtime; it has no future frames and clears its bounded history
   on reset. It is not a GRU/LSTM, quality result, baseline comparison, or
   promotion path. New temporal fits retain governed training-scenario hashes;
   a source-world temporal-versus-scripted comparison fails closed on overlap
   and records observed deltas only. Approved temporal DAgger corrections now
   retain causal frames and run condition before they can become normalized,
   hash-bound temporal augmentation. The governed lesson fixture now has
    separate 60-tick production-world training and validation episodes, a
    61-example held-out split, and a distinct 60-tick eight-proposal correction
    capture. Temporal correction-source identity now joins the retraining
    lineage and is refused from held-out evaluation; paired parent/corrected
    three-scenario source-world reports and baseline comparisons have bounded,
    corruption-safe local custody. This remains observed measurement, not a
    quality result, activation, or promotion. Meaningful held-out quality and an
   automated repeated DAgger loop,
   and promotion remain absent. C33 now has an immutable Vault-backed program
   plan that binds a governed trainer manifest, temporal configuration, named
   reviewer authority, and distinct source-world rounds; its explicit process
   owner resumes accepted corrections only from those durable inputs and stops
   at human review. Academy now exposes that persisted plan as an explicit
   start/resume control and projects action-divergence decisions only to a
   signed-in session whose exact ID is named in the immutable plan. It never
   infers an actor from the renderer, accepts a guest/local/unauthorized
   session, activates, promotes, or declares a quality result. This is local
   plan authority, not account/cloud authorization. A second immutable Academy
   evaluation plan now freezes canonical unseen seeds and lesson thresholds,
   recovery coverage, an explicit scripted baseline/margin, and full
   dataset/DAgger exclusions before execution. Its executor runs candidate and
   baseline through the same fresh source-world case runner; recovery accepts
   only an exact lineage-bound State Forge frontier, and its local hash-bound
   pass/fail custody has no registry activation or promotion route. The
   permanent short fixture fails, so a meaningful held-out pass still remains.
   C34 now has a hash-bound, training-split-only offline-RL trajectory plan
   over those governed C31/C30 source tracks and a deterministic bounded
   fitted-Q trainer over that receipt. It exposes only declared, capped
   source-fact reward components and rejects altered plans, held-out data,
   trace misalignment, off-episode actions, and a planted duplicate terminal
   reward fact. Checkpoint/result custody is idempotent and quarantines corrupt
   bytes; Q/TD divergence stops before a model is emitted. Its retained Q model
   is not a C32 runtime artifact, activation, promotion, online exploration,
   or self-play result. C34 also has a narrow ordered curriculum scheduler that
   accepts only the already-governed full C30 training scenarios/lessons,
   derives its normalized semantic vocabulary from that receipt, and retains
   bounded fresh-headless rollout evidence with integer epsilon decay. The
   fallback action is fixed and governed, not a Q-model decision; those results
   are non-trainable and cannot update, register, activate, promote, or prove
   online RL/self-play quality. A V2-only online-Q runner now selects from that
   governed vocabulary, applies TD updates only after valid fresh C30 ticks,
   and preserves a source-world checkpoint after each nonterminal transition.
   Cancellation, timeout, budget, malformed-lineage, and Q-value guards retain
   non-promotional stopped custody; the resume fixture equals one uninterrupted
   source-world update run. This remains local online-Q work, not self-play or
   evaluated/published policy quality. C34 can also retain a deterministic
   challenger/defender paired tournament over the same frozen C30 cases, but it
   deliberately creates independent worlds and never co-mingles actions; it is
   comparison evidence, not simultaneous self-play or quality certification. A
   separate immutable source-evaluation receipt pairs the retained online-Q
   checkpoint against its frozen offline baseline on those same fresh C30 cases;
   the permanent thresholded fixture fails and is retained without promotion.
   Account/
   cloud identity and deletion, authenticated publication, deployed verification, moderation operations,
   and cloud/player lifecycle flows remain later completion work.

## Accessibility and settings

- [x] Mouse/controller sensitivity, controller presets, deadzones and glyphs — `blade-mouse-sensitivity.test.ts`, `settings-controller.test.ts`, and `legacy-input-adapters.test.ts` cover persisted mouse sensitivity through real relative-aim scaling plus preset/deadzone tuning and explicit PlayStation/generic glyph families.
- [x] Reduced motion, flash strength, high-contrast tells and screen shake — settings/controller, Tear wipe, world renderer, boss ritual, and built-artifact feature-matrix coverage.
- [x] Effects quality and automatic low-end policy — `settings-controller.test.ts`, `presentation-systems.test.ts`, `tear-wipe.test.ts`, and `browser-feature-matrix.js`.
- [x] Master, music, sound-effects and interface volume/mute controls — audio settings/mixer tests, screen renderer parity, and the built-artifact feature/audio matrices.
- [x] Independent saved audio sliders plus temporary ad/portal/system mute reasons — `audio-live-legacy.test.ts`, `audio-mixer.test.ts`, `audio-system.test.ts`, and CrazyGames adapter contracts.
- [x] Cinematic preference and automatic pause behavior — `cinematic-preference.test.ts` and `settings-controller.test.ts` cover policy, sanitization and persistence; `browser-cinematic-preferences.js` proves full/brief/off campaign behavior and direct wave activation when scenes are off; the input matrix covers controller-disconnect auto-pause.

## Audio

- [x] Data-driven recorded-cue routing — `public/audio/music-routing.json` is
  schema-validated and resolved through `src/audio/signal/music-routing-*`;
  `music-routing.test.ts` preserves the five accepted biome choices, Echo's
  Reflection override, terminal/boss fallback, and malformed-manifest rejection.

- [x] Built-in TearScore musical identity and adaptive arrangements — all six themes preserve the oracle tempo, tonic and two-bar drum, bass and lead identity across five intensity tiers; evidence: sibling `tear-score/packages/testing/test/themes.test.ts` plus Tear's vendored-module contract.

- [x] Shared host-owned AudioContext lifecycle — `audio-system.test.ts` and `browser-audio.js` prove single creation/activation across repeated runs.
- [x] Hierarchical Master/Music/SFX/Interface mixer and internal SFX buses — `audio-mixer.test.ts` verifies graph routing, hierarchical mutes, persistence, and gain ramps.
- [x] Existing synthesized SFX and UI feedback routed by category — `synth-cue-routing.test.ts` locks all 64 authored cues to player/weapon/enemy/environment routes; `browser-audio.js` exercises every route through distinct conditioned backend chains while UI remains on Interface.
- [x] TearScore ESM music backend with run session, semantic events and provenance — `tear-score-module.test.ts`, `music-director.test.ts`, `audio-system.test.ts`, `scripts/verify-tear-score-provenance.mjs`. Shell ownership requires both the main-menu scene and menu biome, so in-run Settings preserves the current run cue; perfect-parry events remain journaled without injecting unrelated arrangement layers while cue-matched stingers are disabled.
- [ ] C35 executed TearBot ladder foundation — hash-bound benchmark plans now execute declared scripted or C33-artifact adapters through fresh C30 worlds and retain action/event/terminal traces plus derived distributions. It is not a certified level population or human calibration.
- [ ] C35 human calibration source boundary — separately consented signed-in players can explicitly record or revoke a local calibration decision. Only a completed Ghost V3 capture with browser-trusted physical input, unchanged actor/revision, and exact root/range/command custody creates a local pending attestation. Explicit local admission rechecks consent; a reproducible, participant-balanced (30+ pseudonymous participants) trace/cadence distribution is source evidence only, never automatic training, upload, or level certification.
- [ ] C36 durable Foundry job foundation — a content-addressed local job ledger fixes champion, held-corpus, evaluation, reward, invariant, budget, and stop-condition identities; it records only legal workflow transitions and safely resumes the current phase after restart. Its action-time integrations admit exact held C31 custody and a matching published trainer manifest, then retain at most one hash-bound C34 offline-Q checkpoint from that exact dataset. It does not curate, publish manifests, finalize a model, evaluate quality, activate, promote, schedule, or present a policy.
- [x] Legacy music as exclusive initialization/runtime fallback — `audio-system.test.ts` and the blocked-TearScore branch in `browser-audio.js` prove disposal and exclusive `legacy-synth` selection.
- [x] Ad, portal, visibility, suspension and repeated-run leak tests — `audio-system.test.ts` and `browser-audio.js` account for contexts, mixer/backend/voice nodes, lifecycle listeners and fallback timers through repeated runs and disposal; CI runs a real headed hidden/visible tab transition under Xvfb while local headless runs retain an explicitly labeled simulation.

## C36 Foundry status

- [ ] C36 restart recovery projection — validated Foundry jobs can be projected
  as hashes-only current phase and legal manual restart state; corrupt/missing
  custody is refused through local Vault quarantine. The normal standalone
  `FOUNDRY STATUS` route visibly renders only those hashes/counts, phase, legal
  next manual phase, and explicit unavailable/not-running automation state;
  refresh/back have built navigation evidence. This remains read-only and does
  not execute, schedule, activate, promote, or contact cloud.

- [ ] C36 controlled local schedule intent â€” a content-addressed local record
  can enable or disable a pre-existing job's fixed-cadence due discovery and
  binds compute/storage/stop identities. Due discovery is restart-safe and
  blocks corrupt, stale, terminal, stop-mismatched, or revoked-custody records.
  Its explicit rebind advances only an exact, nonterminal immutable successor
  together with the schedule under conditional current schedule/job-head and
  action-time held-custody checks; retry is idempotent and concurrency has one
  winner. It is not a worker or action executor.
  No timer, worker, workflow execution, cloud call, activation, or promotion
  exists; the visible status calls this configuration only.

- [ ] C36 lease-bound collection and manifest dispatch — an explicit local
  caller can claim a due schedule with a sixty-second conditional Vault lease,
  collect only held C31 custody, or advance one `collecting` job through an
  already-published exact trainer manifest. The manifest claim pins the current
  schedule, job, every named custody byte, and prior lease; stale, early,
  concurrent, revoked, mismatched, absent, and budget-invalid work fails
  closed. Receipts make exact retries idempotent. No timer, C31 mutation,
  dataset load, training, evaluation, activation, promotion, or cloud work is
  introduced.

- [ ] C36 lease-bound bounded offline-Q launch — a due `curating` job may call
  the existing one-epoch C34 offline executor only after immutable
  manifest/root/dataset/plan/configuration/reward identities, schedule/job,
  and every named C31 custody byte revalidate. Its conditional lease supports
  exact retry and rejects stale, concurrent, revoked, early, budget-invalid,
  or changed-lineage work. It emits no online run, final result, artifact,
  evaluation, activation, promotion, timer, or cloud operation.

- [ ] V2 Foundry source-evaluation derivation — V2 requests freeze an
  identifier/threshold protocol before a challenger exists, retain its content
  hash, and can derive (but not execute) one C34 paired source-evaluation plan
  only after current job, completed lineage, C31 dataset, and action-time held
  custody revalidate. Historical V1 jobs remain recoverable but are expressly
  ineligible for source evaluation. No scoring, artifact creation, activation,
  promotion, scheduling, or UI occurs here.

- [ ] V2 Foundry source-evaluation execution — only a persisted V2 derivation
  with unchanged live C31/C34 lineage can run the existing C34 evaluator and
  move from evaluating to deciding. Its Foundry receipt retains a result hash,
  not a score or winner; failed/invalid runs reject without metrics. No artifact,
  registry, activation, promotion, scheduler, or UI path exists.

- [ ] V2 Foundry frozen decision boundary — the predeclared C34 result is
  revalidated and yields only a monitoring-ready challenger or rejection.
  Monitoring-ready is not activation or promotion, and produces no C32 artifact
  or player-visible change.

- [ ] C36 lease-bound bounded offline-Q resume — only a due schedule bound to
  the current V2 `training` head may resume exactly one existing C34 offline
  checkpoint after rechecking launch/plan/configuration, trainer manifest,
  dataset, receipt/checkpoint, current schedule/job, every named C31 custody
  byte, budgets, stop identity, and lease. Old schedules, V1 launches,
  altered/revoked/early/budget-invalid lineage, and competing claims fail
  closed; exact retry returns its receipt. It remains `training → training`
  only, with no terminalization, evaluation, artifact, activation, promotion,
  timer, or cloud behavior.

## Remaining proof gaps

No feature-preservation evidence gaps remain in this inventory. Release readiness still requires the full clean-commit gate described above.

The inventory is reviewed at every phase gate. New features added during the redesign must be appended here and implemented through the target boundaries; they may not add new shared globals or direct platform dependencies to domain code.
