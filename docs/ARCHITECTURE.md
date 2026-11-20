# Tear Runtime Architecture

Tear is one deterministic game runtime composed for multiple distribution targets. The standalone/PWA and CrazyGames releases share domain, simulation, gameplay, presentation, input, audio, persistence, and application code. Target entrypoints select adapters; game rules never branch on a host SDK.

## Dependency direction

```text
entrypoints -> app composition -> gameplay use cases -> simulation/domain
entrypoints -> platform adapters
app -> input, presentation, audio, persistence ports
presentation -> immutable render state
```

Dependencies point inward. Code in `domain`, `simulation`, and gameplay rules must not import browser, presentation, persistence, audio, or platform modules. Browser APIs belong in presentation, device input, audio backends, persistence adapters, and platform adapters. Research code (`agents`, `tearbench`) is not a dependency of game rules or player-facing layers.

### Direction as enforced

`config/architecture-layers.json` declares one layer per top-level `src` directory and the cross-layer edges each may use; edges inside a layer are always allowed, and "type" means `import type` only. Every `src` file must belong to exactly one layer, so a new top-level directory fails the gate until it is placed.

```text
entrypoints    -> app, platform, presentation, audio, persistence, input, config, domain
app            -> every layer except entrypoints (composition)
agents         -> tearbench, ghost, replay, presentation, gameplay, input, simulation, config, domain
tearbench      -> ghost, replay, presentation, audio, persistence, platform, game-reference, diagnostics, gameplay, input, simulation, config, domain
presentation   -> gameplay, audio, simulation, domain; type-only: input, replay, ghost
ghost          -> replay, gameplay, persistence, input, simulation, domain; type-only: audio, platform
replay         -> gameplay, input, simulation, domain; type-only: config
game-reference -> gameplay, simulation, domain
platform       -> persistence, config, domain
audio          -> persistence, domain
gameplay       -> simulation, domain; type-only: config, input
input          -> simulation, domain
simulation, config, persistence, diagnostics -> domain
```

The edges that break this today (76: 51 value, 25 type-only, for example `gameplay -> tearbench`, `tearbench -> app`, `ghost -> tearbench`) are recorded file by file in `config/architecture-baseline.json`. The gate fails on any new one, on a type-only allowance that becomes a value import, and on an entry whose file no longer exists. The baseline also records file-level import cycles over static value imports (type-only imports are erased and dynamic imports are lazy): today one 16-file cycle (15 `ghost` files and `tearbench/production-replay-composition.ts`). A new cycle, or a recorded one that absorbs another file, fails. The gate summary also lists directory pairs that import each other with value edges (six today).

## Runtime ownership

- The screen catalog (`src/domain/screen-catalog.ts`) defines the screens and their legal transitions; the application state controller owns the current screen and enforces those transitions and the surface policy.
- The run lifecycle owns run, wave, boss, reward, and termination phases.
- The fixed-step scheduler owns authoritative 120 Hz simulation ticks, matching the pre-redesign gameplay cadence. Rendering may interpolate but cannot advance game rules.
- Each production world composition owns exactly one data-only environment runtime. Its bounded collections (fields, combat objects, and routes) use caller-owned world-scoped deterministic IDs. The authoritative fixed-step owner invokes one environment step that encloses gameplay in `pre-step -> active-fields -> collision-resolution -> post-commit`; production reset seams and detached replacement use the same lifecycle port, while presentation receives only a detached-safe view. Every entry ends: one that becomes expired or destroyed fades for `ENVIRONMENT_FADE_TICKS` (0.25 s), counted from the step it ended in, and the runtime removes it at the start of a later step. No biome keeps ended entries or removes them itself, and every kind in `environment-definitions.ts` declares how it ends (`endsWhen`); `tests/unit/stage-object-lifetime-rules.test.ts` holds every biome fight and every kind to this rule. Damage a stage object deals by touch is declared on the object (`damage`, `threatening`, `hitActorIds`, optional `hazardScaled`) and applied only by the runtime's contact damage step (`environment-contact-damage.ts`), once per target, after the biome features step; biome bindings supply the player through `setContactTargets`. An actor that places objects keeps its own record of what it asked for and the feature acknowledges it (the White Hart's requests, the Rootbound's Grafts and Bloom Well pattern), so nothing depends on ended objects staying in the collections. The v2 hazard envelope, shared state owner, hash projection, observation codec, replay codec, and State Setup state codec understand only generic data-only extensions and reference-shaped keys. Biome modules own their concrete schemas and behavior: Bloom Wells, Root Links, Grafts, and Rootbound remain Verdant-owned; Aurora Tracks, Ghost Tracks, Pale routes, and White Hart remain Pale-owned. The architecture gate rejects direct or transitive cross-biome imports and biome-owned schema vocabulary in the neutral layer. Boss moves are data: a boss authors `BossAttackDefinition`s (`boss-attacks.ts`), built once into ticks, and runs them through the shared runner (`boss-attack-runner.ts`). [HOW_TO_ADD_A_BIOME.md](HOW_TO_ADD_A_BIOME.md) walks through a new stage, its stage objects, enemies and boss on these rules.
- `RandomSource` and the simulation tick are the only gameplay randomness and time sources.
- Input adapters normalize keyboard, pointer, touch, and controllers into semantic game actions.
- Domain events fan completed facts out to presentation, audio, achievements, replay recording, and platform services.
- `AudioSystem` owns the only audio context and the Master/Music/SFX/Interface hierarchy. TearScore and legacy music are mutually exclusive music backends.
- Versioned persistence envelopes own validation and migration. Storage and cloud conflict behavior stays in adapters.

## Composition and targets

`src/entrypoints/standalone.ts` and `src/entrypoints/crazygames.ts` are deliberately small. They compose platform capabilities and start the shared application. A future Steam web shell should add another entrypoint and adapter set without changing gameplay. A future native or console client may replace render, device input, audio, and platform adapters while retaining deterministic rules and application commands.

`src/app/shell/game-runtime.ts` (`startLiveGame`) is the live composition root. It constructs each owner once, in a fixed order, and passes collaborators built later as lazy ports, so construction order and side effects are explicit in one short file. The owners live in their areas: screen navigation and the interface assembly in `app/interface/`, the Ghost V3 sidecar (recording, authoritative capture, chase, practice challenge) in `app/replay/`, gameplay-event fan-out, run abandonment and run orchestration in `app/run/`, campaign and training in `app/campaign/`, combat action and frame ports in `app/combat/`, and State Setup and the test-build TearBench and debug installers in `app/engineering/`. Biome actor bindings are not app code: `bindBiomeActors` in `gameplay/environment/biome-actors/bind-biome-actors.ts` is the one registration path, called by the live composition root and by the TearBench replay simulation alike, so a biome added there is bound in live play, replay and headless runs together. Every production world is built by one constructor, `createLiveWorldComposition` in `app/world/world-composition.ts`: the live world through `app/shell/production-world.ts`, and the detached TearBench replay world in `src/tearbench/production-world-factory.ts`, which passes explicit options (its environment does not publish on the gameplay event bus and it has no music director). Both are listed in the `app.world-construction-owners` role.

Engineering-channel code (research and diagnostic screen controllers, human-calibration capture, the agent training modules behind them, and the test-only Verdant calibration scene) is loaded only by `src/app/shell/composition.ts` through a dynamic import guarded by a build constant and injected into the runtime; release builds use inert stand-ins and their bundles contain none of it. The developer-only modules are one role, `release.developer-only` in `config/architecture-roles.json`: `pnpm check:architecture` rejects a static import of one from other code (`engineering.lazy-channel`), and every release build fails when one contributes code to a bundle (`scripts/release-developer-code.mjs`, read from the bundler's module list). A new developer-only module is covered by adding it to that role, or by placing it under a directory the role already names.

The standalone build alone contains the generated web manifest and service worker. The CrazyGames artifact contains neither. Cloudflare deploys only `dist/standalone`; repository source is never a deploy asset.

## Adding features safely

### Gameplay rules or content

Add immutable definitions and deterministic logic under `src/gameplay`, `src/simulation`, or `src/domain`. Accept required services as typed ports. Emit typed events for effects outside the rule. Add unit characterization and determinism tests, then update `docs/FEATURE_INVENTORY.md`.

### Screens and interface

Add the screen to the screen catalog (`src/domain/screen-catalog.ts`) before adding rendering. Its one entry gives the screen's channel (release or engineering, which is also its surface classification), legal transitions, frame (menu backdrop, live world or neither), touch density and confirm/pointer settle rules; the application screen type, `isAppScreen`, the state controller's transitions and every per-screen list are derived from it, and the compiler then asks for the screen's renderer. A screen reads state and dispatches semantic commands; it must not coordinate waves, rewards, persistence, or host SDKs. Reuse `src/presentation/ui.ts` for canvas chrome.

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

## Architecture gate

`pnpm check:architecture` (`scripts/check-source-architecture.mjs`, modules in `scripts/architecture/`, tests in `pnpm test:architecture`) reads every `src` module with the TypeScript parser, so `import type`, inline `type` specifiers, re-exports, dynamic `import()` and `import("...")` type queries are told apart, and comments never count as imports. It runs in about 3 seconds and checks, in order:

1. **Fail-closed configuration.** Rules in `scripts/architecture/rules.mjs` name directory globs or `@roles`, never single files; roles live in `config/architecture-roles.json`. Every role pattern and every glob a rule or layer names must match an existing file, every role must be used, and every relative import must reach a file. Only patterns under a role's `anticipate` list (guards for files that do not exist yet, such as remote adapters) are exempt.
2. **Planted fixtures.** Each rule carries reject and accept fixtures that are re-planted in a current member of its scope on every run; a rule that can no longer fire fails the gate.
3. **Rule findings** (56 rules). The families are: biome isolation (Pale and Verdant may not reach each other's implementation, directly or transitively; the neutral environment foundation imports neither and carries no biome vocabulary); portability (game-reference, the portable gameplay core, detached, headless and live TearBench modules and the TearBench barrel stay free of app, presentation, service, browser and Ghost 2 compatibility code); per-world instances (no shared clock, random, particle, SFX, backdrop or cinematics instance; presentation receives configuration and cosmetic entropy through ports; core layers never value-import `config/game-config`); composition-owned capabilities (in `src/app`, only the declared owner roles touch `navigator`, `document`, `window` or browser storage; only the Ghost inspector adapter names its global; only the declared direct writers call `PROFILE` writes; only the world composition constructs the music director and only the production-world root constructs the world); the live runtime root owns no world, interface or session state; engineering-channel modules are reached only by dynamic import; structure (TypeScript only, the module size rule stated under [Code budget](#code-budget-and-refactor-safety-nets), with two data-table exemptions, no `@ts-ignore`, `@ts-nocheck` or `eslint-disable`).
4. **Layer edges and cycles** against `config/architecture-baseline.json`, as described above.

`node scripts/check-source-architecture.mjs --explain <file>` prints a file's layer and permitted edges, its roles, every rule that applies to it or exempts it, the rules that protect it as an import target, its allowlisted edges, cycle membership and current findings.

The baselines only shrink. `--update` rewrites `config/architecture-baseline.json` from the current graph and refuses any new edge, stronger kind, or new or grown cycle unless one of its files is named with `--allow-increase <file>`, which prints a loud notice and must be justified in review. `--update` refuses to run while any configuration error or rule finding remains. Every planted case of the pre-role gate, and each deliberate strengthening, is kept in `tests/fixtures/architecture-legacy-cases.json`; the tests require the same verdict.

### Moving or renaming a file

1. Move the file and rewrite its importers with a TypeScript-aware codemod; `tsc` must pass.
2. Run `pnpm check:architecture`. Every role pattern that named the old path fails with `role <name>.include: "<old path>" matches no file`; replace it with the new path in `config/architecture-roles.json`, or widen the role to a directory glob if that is the real invariant.
3. Allowlisted edges and recorded cycles that name the old path fail as stale. Run `node scripts/check-source-architecture.mjs --update --move <old>=<new>` (repeatable; a trailing `/` moves a directory prefix) or `--moves-file <json>` with an `{ "old": "new" }` map. The moved entries are carried across, so the update needs no `--allow-increase`.
4. Do the same for the code budget (`node scripts/check-code-budget.mjs --update --move <old>=<new>`). Its character count ignores import and re-export declarations and dynamic module specifiers, so a move never raises the recorded size of the moved file or its importers. Then update path strings outside `src` that name the file, for example in `tests/fixtures/architecture-legacy-cases.json`, `src/tearbench/evidence-routes.json`, `scripts/check-production-test-isolation.mjs` and `config/terminology-registry.json`. `scripts/application-chunks.mjs` (the chunk rule `vite.config.ts` uses) assigns `src/app` modules to chunks by folder (`APPLICATION_FOLDER_CHUNKS`); a new folder goes to `runtime-app-core` unless it is listed there. `src/gameplay` folders get a `gameplay-<folder>` chunk each unless `GAMEPLAY_FOLDER_CHUNKS` folds one into another folder's chunk; every startup chunk is a precache entry, so a small new folder is listed there.

## One plain-object guard

`src/domain/records.ts` is the only file that compares `typeof` with `"object"`. Everything else asks it: `isRecord` (a plain JSON object, never an array or null), `asRecord` (that record or `undefined`; a caller that needs a default writes `asRecord(value) ?? {}`), `requireRecord` (the record, or a `TypeError` with the caller's message) or `isObject` (any non-null object, arrays included). Readers of untrusted data use the first three, so a stored array reads as empty rather than as a record of its indexes. ESLint's `tear/one-record-guard` (`scripts/eslint-rules/one-record-guard.mjs`) rejects every spelling of the comparison in `src/**/*.ts`: `===`, `==`, `!==`, `!=`, either operand order, a template literal and `switch (typeof x) { case "object": }`.

The rule has no exceptions and no suppressions file, in keeping with the rule above that ESLint passes without suppression-based migrations.

## Code budget and refactor safety nets

**The module size rule.** A `src/**/*.ts` file may hold at most 25,300 non-whitespace characters, not counting import and re-export wiring. Physical lines are not limited, so reformatting never counts. A file already over the limit and recorded in `config/code-budget-baseline.json` passes while it does not grow; it may shrink. `src/config/game-config.ts` and `src/gameplay/upgrades.ts` are exempt. Both `pnpm check:code-budget` and `pnpm check:architecture` apply this rule; the architecture check reports it as 700 "line equivalents", which is the same 25,300 characters. The baseline is never raised to make a check pass, and files are not split only to satisfy the rule. This is the only statement of the rule; other documents link here.

`pnpm check:code-budget` (`scripts/check-code-budget.mjs`) measures every `src/**/*.ts` file with the TypeScript parser. A file without an entry in `config/code-budget-baseline.json` must stay within all four ceilings: 25,300 non-whitespace characters (so indenting, re-spacing, splitting or joining lines never counts; the former 28,000 trimmed characters re-derived on this basis), excluding import and re-export declarations and the module specifiers of `import()` calls and `import("...")` types (wiring, not code: a pure move must not register as growth), a longest line of 160 characters not counting string, template or regex literal text and ignoring import declarations, no line on which two statements or class members begin (a one-line guard such as `if (done) return;` is one statement), and at most 80 statements owned by any function, nested functions excluded. A baselined file is ratcheted: each recorded value may fall but never rise. `--update` lowers recorded values, drops files that are back within every ceiling, and carries a moved file's entry with `--move <old>=<new>`. It rebuilds only the entries of files changed against the merge base with origin/main, both ends of each move and entries whose file is gone, and keeps every other entry as recorded, so a branch never records a size for a file it did not touch; `--update --all` rebuilds every entry; it refuses any increase unless the file is named with `--allow-increase <file>`, which prints a loud notice and must be justified in review. When the check passes it counts the improved metrics a plain `--update` would lock in and those in other files that only `--update --all` would. Lines are reported but not ratcheted, so splitting packed lines or reformatting is never blocked. `pnpm check:architecture` applies the same ceiling with the same measure (`lineEquivalents`), and a module over it passes only while this baseline records its character debt and it has not grown past it. The budget supersedes that rule once the recorded debt reaches zero; until then both apply.

`pnpm test:determinism` (`tests/unit/canonical-hash-stream.test.ts`) drives every weapon through scripted endless and boss runs in the production headless environment and compares the canonical state hash every 60 ticks with `tests/fixtures/canonical-hash-stream.json`. A refactor that claims no behaviour change must leave it green; a failure names the first diverging stream and tick. Regenerate only for an intended gameplay change, with `TEAR_HASH_STREAM_WRITE=1`.

Tutorial gold staleness is proven by regeneration: `tests/unit/tutorial-production-ghost.test.ts` regenerates the gold through production physics and compares it with the committed corpus and proof, and every build runs that test unless it already passed locally for the same tutorial code and corpus. The committed `src/gameplay/training/tutorial-gold-binding.json` holds only the corpus content hash, never a source hash, so changes to tutorial code that keep the gold output do not conflict. The tutorial code fingerprint (`scripts/tutorial-gold-compatibility.mjs`) keys only that local record (`node_modules/.cache/tear-tutorial-gold/`). It hashes the value-import closure of the tutorial roots after normalising each module's syntax tree: comments, whitespace, grouping parentheses, separators, quote style of property names and numeric spelling are ignored, and import paths are replaced by the hashes of the modules they resolve to. Moving, renaming or reformatting covered files therefore keeps it stable, while any change to code does not. The tree is not re-associated, so a formatter dropping redundant parentheses in a same-operator chain (`a ?? (b ?? c)` to `a ?? b ?? c`) changes it; the next build then simply runs the gold test once more.
