# Tear Architectural Redesign

Status: approved for execution

Baseline: `ee5e931` (`codex/weapons-abilities-overhaul`)

Target branch: `codex/architectural-redesign`

## Outcome

Tear will become a build-driven, strictly typed, deterministic browser game with one source tree and explicit platform targets for the standalone/PWA release and CrazyGames. The same application and domain boundaries must support a later Steam shell and permit a future native audio/render/input backend for consoles without rewriting game rules.

The redesign must preserve every current feature and completed weapon behavior. Migration is incremental: every phase must build, pass automated checks, and remain playable before the next phase begins.

## Non-negotiable properties

- No gameplay feature, mode, screen, enemy, boss, weapon, ability, profile, replay, leaderboard, accessibility option, controller path, or portal behavior is removed.
- Production code has no load-order dependence on classic scripts or writable shared globals.
- Domain and simulation code does not read the DOM, canvas, Web Audio, Firebase, CrazyGames, Steam, wall-clock time, or browser storage directly.
- Gameplay decisions use an injected deterministic random source and clock. Rendering may interpolate; it may not change simulation results.
- A fixed simulation step drives gameplay. Pauses and UI states are explicit state-machine transitions.
- Platform services are capabilities behind typed ports. Unsupported capabilities degrade intentionally.
- Standalone and CrazyGames builds come from the same source and differ only through build target and platform composition.
- Production output is generated into `dist/`, content-hashed, reproducible, and the only directory deployed to Cloudflare.
- Cache versions and script query strings are never manually maintained.
- TearScore is a versioned external engine/library behind Tear's music contract; Tone/Web Audio is one backend, not a game-domain dependency.
- Saved data and replay formats are versioned and migrated. Old compatible records remain readable.

## Target dependency direction

```text
entrypoints (standalone | crazygames | future steam)
  -> app composition and state machines
    -> game session / use cases
      -> deterministic domain + simulation

entrypoints -> platform adapters -> browser/portal/cloud APIs
app -> renderer adapter -> Canvas 2D
app -> audio system -> SFX backend + TearScore music backend
app -> persistence ports -> local/CrazyGames/Firebase adapters
```

Imports may point inward or sideways through declared public APIs. Domain packages never import application, presentation, or platform packages.

## Target source layout

```text
src/
  entrypoints/       standalone.ts, crazygames.ts
  app/               composition root, app state machine, commands/events
  domain/            rules, entities, value objects, stable IDs
  simulation/        fixed-step world, systems, deterministic clock/RNG
  gameplay/          runs, waves, drafts, bosses, weapons, abilities
  presentation/      render snapshots, camera, Canvas 2D renderer, screens
  input/             normalized actions and device adapters
  audio/             mixer, lifecycle, music bridge, SFX routing
  persistence/       settings/profile/save/replay schemas and migrations
  platform/          capability contracts and platform implementations
  diagnostics/       debug facade, telemetry and replay verification
public/               static icons, fonts, manifest and platform artifacts
tests/                unit, contract, determinism, integration and browser
```

Large subsystems may use subdirectories, but files should normally stay under 500 lines. Generated files and exceptional authored data tables are documented exceptions.

## Runtime contracts

### Commands and events

- Inputs become semantic `GameAction` values before reaching gameplay.
- Commands express intent and carry stable action IDs when exactly-once behavior matters.
- Domain events describe completed facts and are the integration boundary for presentation, audio, achievements, replay recording, and platform services.
- Critical transitions such as weapon impacts, boss phases, run completion, rewards, and score publication are idempotent.

### Simulation

- Default tick: 60 Hz fixed step, using an accumulator with a bounded catch-up limit.
- The simulation clock is monotonic integer ticks. Display time derives from ticks.
- A seeded PRNG service replaces gameplay-relevant `Math.random()` calls.
- Mutable tuning is converted into immutable base definitions plus per-run/per-actor derived configuration.
- Rendering consumes immutable/interpolated snapshots and cannot mutate simulation state.

### Game and UI state

- The application state machine owns menus, setup, gameplay, pause, drafts, tier-ups, continues, game-over, victory, replays, and settings.
- The run state machine owns run creation, wave lifecycle, boss lifecycle, rewards, and termination.
- Weapon controllers own weapon action/state transitions and publish typed weapon events.
- Screens render state and dispatch commands; they do not coordinate game rules.

### Replay and save data

- Each replay envelope records schema version, ruleset version, build version, run seed, platform-independent input/event data, and final verification hash.
- TearScore metadata records engine version, score-content version, musical seed, semantic event timeline, and optional journal hash—not PCM audio.
- Settings and profile records have explicit schemas, validation, defaults, and migration functions.
- Cloud or portal persistence conflicts are resolved in adapters, outside domain logic.

## Audio architecture

One `AudioSystem` owns the shared audio context, activation gate, lifecycle and hierarchical mixer:

```text
Master
  Music
    TearScore or LegacyMusicBackend
  Sound Effects
    Player
    Weapons
    Enemies
    Environment
  Interface
```

User settings expose master, music, sound-effects and interface volumes plus category mute toggles. Internal SFX buses remain separately balanceable. Effective gain is hierarchical; muting never destroys saved slider values. Ad, portal, visibility and platform suspension are temporary mute reasons rather than user settings. Gain changes ramp to avoid clicks.

TearScore receives only a host-owned running audio context and the music bus. Application lifetime and musical run lifetime are separate. The bridge sends stable semantic `MusicContextSnapshot` values at a controlled rate and immediate `MusicEvent` values for important transitions. It supplies an explicit clock, run seed, ruleset version and score version.

The current IIFE integration is a temporary legacy compatibility reference. The final Vite build consumes a pinned ESM/release artifact, declares the Tone compatibility contract, verifies provenance/checksum, and fails production validation if dependency metadata is unknown. Legacy music implements the same contract and is mutually exclusive with TearScore.

Browser standalone, CrazyGames and an initial Steam web shell can share the Tone/Web Audio implementation. TearScore's director/composer remains backend-neutral so a future console port can replace DSP without changing game semantics.

## Platform architecture

`PlatformServices` is capability based:

- lifecycle and focus
- user identity
- key/value save storage
- cloud save
- leaderboards and replay publication
- ads and rewarded continues
- achievements
- analytics
- overlay/fullscreen

Standalone composes browser/local/Firebase implementations. CrazyGames composes SDK-backed implementations and its policy gates. Missing capabilities return explicit availability values and UI copy; gameplay does not probe global SDK objects.

Future Steam support supplies another composition root and adapters for identity, achievements, cloud saves and overlay lifecycle. Console work may replace presentation, input and audio backends while retaining domain/application packages.

## Build, cache and deployment

- Vite is the canonical dev/build system and TypeScript is strict.
- ESLint enforces layer boundaries, unsafe globals, determinism rules and code quality.
- Vitest covers unit/contract/determinism tests; Playwright covers real-browser smoke and lifecycle tests.
- Separate `build:standalone` and `build:crazygames` commands generate target directories from shared source.
- Asset URLs and JavaScript chunks are content hashed.
- PWA assets and service worker are generated from the standalone build manifest. CrazyGames never registers a service worker.
- Cloudflare Workers Static Assets serves only `dist/standalone`; deployment configuration never points at the repository root.
- `_headers` sets security policy and immutable caching for hashed assets while HTML remains revalidatable.
- Vercel configuration and Vercel deployment documentation are removed after Cloudflare preview validation.
- CI runs formatting, linting, strict type checking, unit tests, deterministic replay tests, both production builds, bundle budgets and browser smoke tests before deployment.

## Performance budgets

- Gameplay simulation: p95 below 4 ms/tick on the reference desktop profile and below 8 ms/tick on the reference constrained profile.
- Rendering: p95 total frame work below 14 ms at 60 Hz on reference desktop; quality scaling must be explicit and measurable.
- Main-thread long tasks above 50 ms during active gameplay fail performance regression checks unless allowlisted with evidence.
- No unbounded entity, particle, audio-node, listener, timer or cache growth across repeated runs.
- Initial compressed JavaScript and each large optional subsystem receive recorded budgets in CI; TearScore retains its own compressed-size budget.
- Startup, memory, audio voices and frame-time telemetry are available through a stable development-only diagnostics API.

Budgets will be baselined before subsystem extraction and tightened when measurements show a safer bound. A budget is not met by deleting features; work is optimized, scheduled, pooled, streamed or split.

## Execution phases and gates

### Phase 0 — Safety baseline and characterization

1. Record branch ancestry, feature inventory and architectural decisions.
2. Establish package manager, pinned toolchain and reproducible commands.
3. Make existing weapon tests and browser smoke tests part of the standard check.
4. Add characterization tests for settings, run startup, weapon actions, state transitions, replay compatibility and platform fallbacks.
5. Capture initial bundle, startup and representative frame/simulation measurements.

Gate: clean install, existing behavior tests pass, baseline artifacts recorded.

### Phase 1 — Build and deployment foundation

1. Introduce Vite, strict TypeScript configuration, ESLint, Vitest and Playwright.
2. Move static assets to `public/` and create target-aware entrypoints.
3. Produce content-hashed standalone and CrazyGames builds while behavior remains unchanged.
4. Replace the handwritten service worker with generated standalone-only PWA caching.
5. Configure Cloudflare Workers Static Assets for generated standalone output and canonicalize deployment documentation.

Gate: both targets build, standalone installs/works offline, CrazyGames omits PWA behavior, Cloudflare preview serves no source/repository files.

### Phase 2 — Module and composition boundary

1. Convert classic scripts to ES modules in dependency order.
2. Replace implicit globals with imports/exports and typed public APIs.
3. Establish standalone and CrazyGames composition roots.
4. Add import-boundary lint rules and remove manual script ordering/query versions.

Gate: no application script uses classic-script loading; no source module relies on another module's global declarations.

### Phase 3 — Persistence, settings and platform services

1. Add versioned schemas/migrations for settings, profile and replay envelopes.
2. Extract browser storage, Firebase and CrazyGames integrations behind capability ports.
3. Centralize settings state and add master/music/SFX/interface audio settings.
4. Move ad/focus/lifecycle behavior into platform adapters.

Gate: local and portal contract tests pass; old saves/settings migrate; offline capability degradation remains playable.

### Phase 4 — Input and application state machines

1. Normalize keyboard, pointer, touch and controller input into semantic actions.
2. Replace string-coordinated screens with an explicit app state machine.
3. Separate UI rendering/action dispatch from transition logic.
4. Preserve controller focus/navigation and accessibility behavior.

Gate: state transition model tests and cross-device browser tests pass.

### Phase 5 — Deterministic simulation core

1. Add fixed-step scheduler, deterministic clock and seeded PRNG.
2. Extract run/wave/boss/session state from the frame/render coordinator.
3. Replace gameplay wall-clock/random dependencies and global tuning mutation.
4. Introduce immutable render snapshots and deterministic verification hashes.

Gate: identical seed plus action stream produces identical hashes at multiple frame rates and after replay serialization.

### Phase 6 — Gameplay subsystem extraction

1. Extract weapons/abilities, player, enemies/bosses, projectiles, upgrades/drafts, scoring/achievements and replay systems behind typed APIs.
2. Preserve the completed weapon action/state-machine semantics and add the weapon-by-ability conformance suite.
3. Use typed commands/events and exactly-once action IDs at subsystem boundaries.
4. Reduce `game.js` to no central coordinator; delete it once all responsibilities are owned elsewhere.

Gate: feature inventory and golden/characterization tests pass; no production file remains an architectural god object.

### Phase 7 — Presentation and performance architecture

1. Separate Canvas 2D rendering, camera, effects and screen presentation from simulation.
2. Add interpolation, quality policy, object pooling and spatial indexing where measurements justify them.
3. Make render paths allocation-aware and remove unbounded listener/timer/entity growth.
4. Publish diagnostics and automated performance scenarios.

Gate: performance budgets and visual/browser regression scenarios pass without feature loss.

### Phase 8 — Audio and TearScore integration

1. Implement the hierarchical audio mixer and persisted category settings.
2. Make the AudioSystem the sole lifecycle/context owner.
3. Integrate the pinned TearScore ESM artifact through the typed music bridge.
4. Add musical run sessions, semantic events, deterministic time/seed/version metadata, mute reasons and diagnostics.
5. Keep legacy music as an exclusive fallback backend.

Gate: audio lifecycle/leak/setting/fallback tests pass across standalone and CrazyGames; TearScore provenance is complete.

### Phase 9 — Multi-target hardening and release

1. Run full desktop/mobile/controller/browser and CrazyGames lifecycle matrices.
2. Validate PWA update/offline recovery and Cloudflare preview/production headers.
3. Verify replay/save migrations and dependency/bundle provenance.
4. Remove transitional global bridges, dead legacy build paths, Vercel files and obsolete cache/version tooling.
5. Update contributor and deployment documentation.

Gate: fresh clone passes the full check, both release artifacts are reproducible, deploy preview is healthy, and the repository is clean.

## Completion definition

The redesign goal is complete only when all phase gates pass and:

- `npm run check` (or the selected locked package-manager equivalent) succeeds from a clean install.
- Standalone and CrazyGames production artifacts build from the same commit.
- Browser smoke tests cover boot, run start, weapon use, pause/settings, audio settings and return to menu.
- Determinism tests cover multiple render rates and replay round trips.
- No manual script or service-worker cache version exists.
- Cloudflare serves generated standalone files only; Vercel is no longer described or configured.
- TearScore is integrated through the AudioSystem with complete pinned provenance and safe fallback.
- The feature inventory has no missing behavior and performance budgets pass.
- Architecture records and developer instructions describe how to add gameplay, UI, platform and audio features without restoring shared-global coupling.

## Rollback and commit discipline

Each phase lands as one or more focused commits after its gate passes. Migration adapters may exist only while their removal phase is still open and are labeled with the owning phase. When a gate fails, fix or revert the focused phase commit; never repair by discarding unrelated completed feature work.
