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
  injected browser quota-failure containment/recovery proof; C27A now routes
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
- [ ] Ghost 3.0 durable Vault and governed cloud publication — current
  capsule/Vault, Doctor, Theater, knowledge, coaching, player-experience, and
  cloud-publication code proves contracts and pure behavior. C27 now includes
  a real IndexedDB live-capture sidecar plus a persisted V1 replay bootstrap
  and fail-closed admission check; a physical browser run proves that context
  is durable while correctly reporting no compatible detached runtime. It is
  not yet V3 playback, verification, or a player-facing Theater. Durable
  cross-session storage, authenticated publication, deployed verification,
  moderation operations, and player-visible flows remain completion work.

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
- [x] Legacy music as exclusive initialization/runtime fallback — `audio-system.test.ts` and the blocked-TearScore branch in `browser-audio.js` prove disposal and exclusive `legacy-synth` selection.
- [x] Ad, portal, visibility, suspension and repeated-run leak tests — `audio-system.test.ts` and `browser-audio.js` account for contexts, mixer/backend/voice nodes, lifecycle listeners and fallback timers through repeated runs and disposal; CI runs a real headed hidden/visible tab transition under Xvfb while local headless runs retain an explicitly labeled simulation.

## Remaining proof gaps

No feature-preservation evidence gaps remain in this inventory. Release readiness still requires the full clean-commit gate described above.

The inventory is reviewed at every phase gate. New features added during the redesign must be appended here and implemented through the target boundaries; they may not add new shared globals or direct platform dependencies to domain code.
