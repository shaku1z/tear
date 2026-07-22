# Tear Feature Preservation Inventory

This is the migration checklist for the architectural redesign. A checked feature has characterization, contract, deterministic, or built-artifact browser coverage in the redesigned runtime and is included in `pnpm check`. Presence in a compatibility bundle alone does not count. A check records the existence of credible automated evidence; release readiness still requires that the complete gate pass from the final clean commit.

## Runtime and releases

- [x] Standalone browser release — `platform-browser-smoke.js` (standalone), `browser-smoke.js`, and the standalone build/reproducibility gates.
- [x] Installable/offline PWA and safe update recovery — `pwa-offline.js` and `pwa-update.test.ts`.
- [x] CrazyGames iframe release and SDK lifecycle — `browser-crazygames-iframe.js`, `platform-crazygames.test.ts`, the CrazyGames platform smoke, and package validation.
- [x] Responsive/overscan Canvas 2D presentation — `browser-responsive-matrix.js` covers four viewport/DPR profiles; the iframe gate also covers portrait resizing.
- [x] Keyboard/mouse, touch and controller input — `browser-smoke.js`, `browser-input-matrix.js`, and the semantic/legacy input unit suites.
- [x] Fullscreen, pointer lock, focus loss and controller disconnect behavior — `browser-input-matrix.js` and the focus-release assertion in `browser-smoke.js`.
- [x] Cloud/Firebase and offline/local capability fallbacks — `platform-firebase-cloud.test.ts`, `platform-cloud.test.ts`, `platform-browser.test.ts`, and `platform-legacy-compat.test.ts`.

## Game flow and modes

- [x] Main menu, setup/war table and tutorial — `browser-navigation-journeys.js`, `browser-feature-matrix.js`, and `training-controllers.test.ts`.
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
- [x] Every standard enemy, variant and affix — `enemy-catalogue.test.ts`, `enemy-behavior-matrix.test.ts`, and `enemy-factory.test.ts`.
- [x] Every boss, boss phase, arena mutation and Pantheon/Source sequence — `boss-phase-conformance.test.ts`, `boss-ritual-controller.test.ts`, `training-controllers.test.ts`, `campaign-controllers.test.ts`, and run-content/wave conformance.
- [x] Difficulty, run modifiers, permanent upgrades and economy rewards — the run session/wave suites, `gameplay-definitions.test.ts`, `weapon-ability-conformance.test.ts`, `progression-systems.test.ts`, `coin-awards.test.ts`, and `run-outcome-planner.test.ts`.

## Persistence and online behavior

- [x] Legacy settings migrate without losing choices — `persistence-envelopes.test.ts`, `settings-controller.test.ts`, `audio-settings.test.ts`, and `audio-live-legacy.test.ts`.
- [x] Profile, currency, upgrades, achievements and challenge progress persist — `progression-persistence-round-trip.test.ts` rehydrates currency, a purchased shop level, achievements, shards, profile stats/modes and completed daily-challenge progress from one shared store, alongside the envelope and corruption-recovery suites.
- [x] Leaderboard submission, identity and failure/offline behavior — `platform-shared-cloud.test.ts`, `platform-cloud.test.ts`, `platform-browser.test.ts`, and `platform-firebase-cloud.test.ts`.
- [x] Replay recording, vault, publication, loading and legacy migration — replay visual/vault/envelope suites, `replay-round-trip.test.ts`, platform publication contracts, and the replay browser journey.
- [x] Deterministic replay verification across render rates — `authoritative-replay.test.ts` verifies JSON-round-tripped actions at 30/60/144 Hz; replay hash/envelope/round-trip suites cover verification and serialization.

## Accessibility and settings

- [x] Mouse/controller sensitivity, controller presets, deadzones and glyphs — `blade-mouse-sensitivity.test.ts`, `settings-controller.test.ts`, and `legacy-input-adapters.test.ts` cover persisted mouse sensitivity through real relative-aim scaling plus preset/deadzone tuning and explicit PlayStation/generic glyph families.
- [x] Reduced motion, flash strength, high-contrast tells and screen shake — settings/controller, Tear wipe, world renderer, boss ritual, and built-artifact feature-matrix coverage.
- [x] Effects quality and automatic low-end policy — `settings-controller.test.ts`, `presentation-systems.test.ts`, `tear-wipe.test.ts`, and `browser-feature-matrix.js`.
- [x] Master, music, sound-effects and interface volume/mute controls — audio settings/mixer tests, screen renderer parity, and the built-artifact feature/audio matrices.
- [x] Independent saved audio sliders plus temporary ad/portal/system mute reasons — `audio-live-legacy.test.ts`, `audio-mixer.test.ts`, `audio-system.test.ts`, and CrazyGames adapter contracts.
- [x] Cinematic preference and automatic pause behavior — `cinematic-preference.test.ts` and `settings-controller.test.ts` cover policy, sanitization and persistence; `browser-cinematic-preferences.js` proves full/brief/off campaign behavior and direct wave activation when scenes are off; the input matrix covers controller-disconnect auto-pause.

## Audio

- [x] Shared host-owned AudioContext lifecycle — `audio-system.test.ts` and `browser-audio.js` prove single creation/activation across repeated runs.
- [x] Hierarchical Master/Music/SFX/Interface mixer and internal SFX buses — `audio-mixer.test.ts` verifies graph routing, hierarchical mutes, persistence, and gain ramps.
- [x] Existing synthesized SFX and UI feedback routed by category — `synth-cue-routing.test.ts` locks all 64 authored cues to player/weapon/enemy/environment routes; `browser-audio.js` exercises every route through distinct conditioned backend chains while UI remains on Interface.
- [x] TearScore ESM music backend with run session, semantic events and provenance — `tear-score-module.test.ts`, `music-director.test.ts`, `audio-system.test.ts`, `scripts/verify-tear-score-provenance.mjs`.
- [x] Legacy music as exclusive initialization/runtime fallback — `audio-system.test.ts` and the blocked-TearScore branch in `browser-audio.js` prove disposal and exclusive `legacy-synth` selection.
- [x] Ad, portal, visibility, suspension and repeated-run leak tests — `audio-system.test.ts` and `browser-audio.js` account for contexts, mixer/backend/voice nodes, lifecycle listeners and fallback timers through repeated runs and disposal; CI runs a real headed hidden/visible tab transition under Xvfb while local headless runs retain an explicitly labeled simulation.

## Remaining proof gaps

No feature-preservation evidence gaps remain in this inventory. Release readiness still requires the full clean-commit gate described above.

The inventory is reviewed at every phase gate. New features added during the redesign must be appended here and implemented through the target boundaries; they may not add new shared globals or direct platform dependencies to domain code.
