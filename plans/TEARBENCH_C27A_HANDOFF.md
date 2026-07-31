# TearBench C27A Handoff

> **Program-wide continuation:** Read
> [`TEARBENCH_MASTER_HANDOFF.md`](TEARBENCH_MASTER_HANDOFF.md) first. This file
> is the detailed appendix for the current C27A boundary, not the complete
> TearBench roadmap.

**Status:** tenth C27A foundation slice complete (per-world entity-factory
construction). This is not a C27A completion or release claim.

## Resume protocol (mandatory)

Before coding, read this file, then:

1. Read `docs/TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md` and
   `docs/checkpoints/C27A_RUNTIME_ARCHITECTURE_FOUNDATION.md` in full.
2. Treat `plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md` as the
   checkpoint authority and keep C27A blocking C29-C36 completion claims.
3. At the start of each logical slice, state its narrow boundary and its
   non-claim. After every slice, update the C27A checkpoint, architecture
   alignment document, feature inventory when capability wording changes, and
   this handoff with evidence/remaining work. Do not defer documentation until
   an arbitrary end of a long migration.
4. Do not introduce a second combat host, scheduler, replay runtime, or
   headless simulator. Replay/headless work may use the production composition
   only after that same composition is genuinely portable.
5. Keep `src/app/live-game-runtime.ts` at or below 700 lines. The current file
   has 690 physical lines; the architecture gate is the authoritative limit.

## Completed in this handoff

- C27 Ghost V3 foundation was strengthened with a browser corrupt-journal
  recovery test that identifies the scenario's own persisted recording rather
  than racing the application boot recording. The test corrupts a real durable
  chunk, reloads, and proves quarantine/recovery behavior.
- C27A now has a DOM-free generic `tear-world-context` and a live adapter.
  Run start, State Forge, content, and wave composition reach configuration,
  named RNG, clocks, effects, Mirror, and boss feedback through that one seam.
  The services are still app-backed singleton adapters.
- C27A now has `src/app/live-combat-world-state.ts`. It routes combat's
  replaceable enemy, projectile, floater, slow-zone, and temporary-wall arrays
  through `LiveGameHostState`; it deliberately keeps player/blade/run lazy
  because the application constructs combat while still on the menu. The
  remaining opening/collision transient state is explicit at that boundary.
- `tests/unit/live-combat-world-state.test.ts` locks the collection replacement
  behavior, and `package.json` includes it in `check:c27a:foundation`.
- `tests/browser-journey-harness.js` now includes captured page errors when
  bootstrap readiness times out. This made the pre-run lazy-access regression
  diagnosable without weakening browser evidence.
- The eighth slice moved the transient combat state into the world. The new
  DOM-free `src/gameplay/runtime/tear-world-transient-state.ts` owns opening
  protection, `LiveOpeningState`'s carry-over fields, and
  `LiveCollisionPhaseState`'s non-collection impact fields.
  `TearWorldContext` gained a fifth `transient` capability;
  `live-world-context.ts` creates one record set per world. Ten closure
  variables (`hitStop`, `shake`, `slowmo`, `dashGhostT`, `throwCd`,
  `wasSwinging`, `wasDashing`, `wasOnGround`, `landVy`, `openingProtection`)
  were removed from `live-game-runtime.ts`; combat, the frame prelude, run
  reset, State Forge runtime capture/restore, the campaign/training
  composition, the interface world state, and the test-only time-effects hook
  now use the owned records. Protection is handed to combat by reference
  because `combat-step-prelude` writes its fields in place; opening and impact
  are copied per read exactly as the previous closure literals were. State
  Forge runtime-state snapshot keys are unchanged.
- The ninth slice extended the same record set to the per-world frame-feel
  values. `timeScale`, `zoom`, `flash`, `bannerT`, `worldZoom`,
  `worldZoomTarget`, `rankPopT`, and `rankPopText` are gone from
  `live-game-runtime.ts`; the frame prelude read/write pair, campaign/training
  composition, wave banners, the void-run camera release, State Forge runtime
  capture/restore, the interface frame/world state, and the test-only
  time-effects hook use `transient.feel`. `resetFeel()` restores dilation and
  framing on run reset and deliberately leaves the rank popup alone, matching
  the previous `finishWorldReset` boundary exactly.
- The tenth slice extracted one world's entity constructors from the
  composition root into `src/app/live-world-simulation-factories.ts`. The
  factory takes clock, effects, sound, input, UI, and the named `enemy-ai` /
  `boss` RNG streams explicitly, and returns `Blade`, `Player`, `Projectile`,
  the enemy presentation, enemy types (with their own `BOSSFX`), and mirror
  types. `composition.ts` calls it once. Two worlds are now constructible
  without a second composition root; the test proves per-world clock capture
  and per-world boss feedback through the production path.

## Latest evidence

All of the following were run from this worktree after the factory slice:

- `pnpm check:c27a:foundation` passed: typecheck, lint, architecture gate,
  15 test files / 47 tests, standalone test build, and
  `browser-c27a-physical-canonical-input`.
- Because the factory slice touched the composition root, the production
  build, `test:browser:features`, `test:browser:bosses`,
  `test:browser:journeys`, and the blade-lifecycle, mirror-pursuit, and
  combat-resolution parity fixtures were also rerun and passed.
- `pnpm check:c27:foundation` passed: requirements, typecheck, lint,
  architecture, 14 test files / 69 tests, standalone build, and all seven C27
  browser proofs.
- `pnpm check:c23` passed: requirements, typecheck, lint, architecture, 9 test
  files / 39 tests, standalone build, 600-tick live restore, State Forge
  Studio, and the exit matrix.
- `pnpm test` passed: 219 test files / 886 tests.
- `pnpm requirements:check` and `git diff --check` passed.
- `src/app/live-game-runtime.ts` measures 690 physical lines.
- The standalone build emits the existing non-fatal >500 kB chunk warning.
  It is not a passed bundle-budget/release claim.
- Full `pnpm check` has not been run for a release claim.

## Exact next C27A boundary

Entity construction is now per-world, so the remaining shared services are the
ones the *live world composition* still reads as module singletons rather than
receiving: `CLOCK` (still `src/config/game-config.ts`'s exported object, which
`src/presentation/backdrop.ts` also imports directly), `GAME_RANDOM` /
`GAME_RANDOM_STREAMS`, and `FX`. Give the composition root an explicit
world-services bundle it creates and passes to both the entity factories and
`createLiveWorldContext`, then remove the direct global imports from the
remaining consumers (backdrop first — it is the only presentation module
reading the sim clock as a global). Each step gets a focused isolation test
proving two bundles do not share state. Preserve menu-time lazy construction
and the one existing
`TearSimulationRuntime`/scheduler, and extend the context only where real
ownership moves; do not add cosmetic ports merely to make the architecture
diagram look complete.

After that, extract the closure-owned run/world construction from
`live-game-runtime.ts`. A
detached full production world, replay-world execution, headless execution,
or learning portability remains blocked until all execute the same real
composition with parity evidence.

## Working-tree safety

- Do not discard unrelated dirty work. In particular,
  `plans/EXTREME_RENDERING_IMPLEMENTATION_PLAN.md` was already untracked and
  is outside this C27A handoff scope.
- No commit or push was made as part of this pause. Inspect the actual branch
  and `git status --short` before staging; stage only intentional TearBench
  work when the user authorizes a commit.
- Do not claim C27, C27A, replay, headless, learning, or release completion
  from the foundation gates listed above.
