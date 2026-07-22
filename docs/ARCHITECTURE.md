# Tear Runtime Architecture

Tear is one deterministic game runtime composed for multiple distribution targets. The standalone/PWA and CrazyGames releases share domain, simulation, gameplay, presentation, input, audio, persistence, and application code. Target entrypoints select adapters; game rules never branch on a host SDK.

## Dependency direction

```text
entrypoints -> app composition -> gameplay use cases -> simulation/domain
entrypoints -> platform adapters
app -> input, presentation, audio, persistence ports
presentation -> immutable render state
```

Dependencies point inward. Code in `domain`, `simulation`, and gameplay rules must not import browser, presentation, persistence, audio, or platform modules. Browser APIs belong in presentation, device input, audio backends, persistence adapters, and platform adapters.

## Runtime ownership

- The application state controller owns screens and legal transitions.
- The run lifecycle owns run, wave, boss, reward, and termination phases.
- The fixed-step scheduler owns authoritative 60 Hz simulation ticks. Rendering may interpolate but cannot advance game rules.
- `RandomSource` and the simulation tick are the only gameplay randomness and time sources.
- Input adapters normalize keyboard, pointer, touch, and controllers into semantic game actions.
- Domain events fan completed facts out to presentation, audio, achievements, replay recording, and platform services.
- `AudioSystem` owns the only audio context and the Master/Music/SFX/Interface hierarchy. TearScore and legacy music are mutually exclusive music backends.
- Versioned persistence envelopes own validation and migration. Storage and cloud conflict behavior stays in adapters.

## Composition and targets

`src/entrypoints/standalone.ts` and `src/entrypoints/crazygames.ts` are deliberately small. They compose platform capabilities and start the shared application. A future Steam web shell should add another entrypoint and adapter set without changing gameplay. A future native or console client may replace render, device input, audio, and platform adapters while retaining deterministic rules and application commands.

The standalone build alone contains the generated web manifest and service worker. The CrazyGames artifact contains neither. Cloudflare deploys only `dist/standalone`; repository source is never a deploy asset.

## Adding features safely

### Gameplay rules or content

Add immutable definitions and deterministic logic under `src/gameplay`, `src/simulation`, or `src/domain`. Accept required services as typed ports. Emit typed events for effects outside the rule. Add unit characterization and determinism tests, then update `docs/FEATURE_INVENTORY.md`.

### Screens and interface

Add state and transitions to the application state model before adding rendering. A screen reads state and dispatches semantic commands; it must not coordinate waves, rewards, persistence, or host SDKs. Reuse `src/presentation/ui.ts` for canvas chrome.

### Input

Map a device gesture or button to a `GameAction` in the relevant adapter. Gameplay consumes actions, never key codes, pointer events, touch identifiers, or gamepad indices. Preserve focus, disconnect, remapping, and accessibility behavior in browser tests.

### Audio

Publish a semantic music event or route an effect through an audio category. Do not create an `AudioContext` or connect directly to the destination outside the audio backend. New saved audio choices require a schema migration and mixer test.

### Platform integration

Extend the typed platform capability contract and implement target adapters. Unsupported capabilities must return an explicit unavailable result and retain a playable path. Do not probe browser globals or portal SDK objects from gameplay or screens.

### Persistence or replay data

Bump the relevant envelope version, validate untrusted data, and add a pure migration plus fixtures for the previous version and malformed records. Replays record stable actions/events, versions, seed, and verification hash—not presentation frames or PCM audio.

## Invariants enforced by release gates

- Strict TypeScript and ESLint pass without suppression-based migrations.
- The same seed and semantic action stream verify identically across render rates and serialization.
- All five weapons and their action safety checks pass.
- Standalone, CrazyGames, PWA, platform lifecycle, audio, and performance browser gates pass.
- Build outputs are content-hashed, reproducible, budgeted, and contain no source/test/repository files.
- No handwritten cache version, script-order dependency, writable production debug global, or direct domain dependency on external services is permitted.
