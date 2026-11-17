# Browser performance regression profile

Tear's runtime regression gate measures the production standalone build through a real Chromium page. It uses the allocation-bounded `PerformanceMonitor` already injected into the game; benchmark code never feeds wall-clock values into simulation state.

## Reference profile

- 1600×900 desktop viewport in headless Chromium or installed stable Chrome.
- Production standalone bundle served from `dist/standalone` over localhost.
- A repeatable playground workload: all eight keyboard spawn commands, sustained movement, primary attacks, blade throws, and normal rendering. Gauges are sampled during spawning so short-lived peaks remain visible.
- The diagnostics ring retains the latest 600 frames for percentiles and separately retains the maximum observed value for the complete post-reset measurement window, so a long soak cannot overwrite an earlier hitch. `outsideFrameWork` records the part of each animation-frame interval not explained by the preceding Tear JS frame. The performance fixture clears timing samples after setup, while preserving long-task and gauge history, then requires at least 500 desktop or 300 constrained active-combat frames. The authored 12-second and 8-second windows are minimum durations rather than substitutes for those sample requirements. Collection remains bounded at a minimum diagnostic cadence of 10 frames/second for desktop and 5 frames/second under intentional 4× CPU throttling; the cadence bound changes only how long the fixture may wait, not the required sample count or timing budgets.
- The constrained profile applies Chromium's 4× CPU throttle to the same authored workload, approximating the low-power Chromebook/mobile CPUs relevant to the portal release. Chromium's throttled scheduler can delay `requestAnimationFrame` independently of measured Tear work, so the constrained profile keeps raw interval tails and their unchanged reference bounds as diagnostic evidence. It continues to hard-fail sample coverage, simulation, render, frame-work, long-task, and representative-workload regressions. Unthrottled active and biome workloads remain the hard pacing authority.
- A bounded Verdant boss workload enters Rootbound phase two through the normal Boss Test route, then composes one Rootbinder and two ordinary targets through the existing live entity factory. A matching Pale workload exercises White Hart, Aurora/Ghost Tracks, and the full eight-enemy biome roster. Both scenarios sample small source-owned environment counts directly rather than serializing full runtime snapshots through the browser automation transport. Their checked ceilings are 8 enemies, 128 projectiles, 320 effects, 6 fields, 12 combat objects, and 4 routes.
- Five additional start/quit cycles verify that run initialization resets enemies and projectiles to zero, bounds authored run-start visual effects, and retains no more than 16 MiB of additional JavaScript heap after forced collection.

The machine-readable source of truth is [`config/browser-performance-budgets.json`](../config/browser-performance-budgets.json). Desktop simulation p95 is at most 4 ms, render p95 at most 14 ms, and measured frame work at most 16.67 ms. The gate also records the real, unclamped `requestAnimationFrame` interval: ordinary and biome workloads require p99 at or below 34 ms and no interval above 50 ms. At 4× CPU throttle, simulation remains at most 10 ms and render remains at most 14 ms; frame work remains at most 20 ms. The unchanged 50 ms p99 and 75 ms maximum interval bounds are retained in the emitted `pacingAssessment`, but are diagnostic under CPU throttling rather than product-work assertions. The 10 ms constrained simulation ceiling reflects the measured final-five/C27 runtime baseline (9.8 ms p95 on the reference host), while retaining a bounded headroom contract. Neither active profile permits a new task above 50 ms. Entity ceilings characterize the authored workload and the existing effect-pool hard cap; they do not remove or reduce any feature.

## Running the gate

```powershell
pnpm check:performance
```

The test writes its measured profile to `artifacts/tearbench/generated/browser-performance.json` and exits non-zero on a regression. Each active workload includes a structured pacing assessment; CPU-throttled assessment failures stay visible in the artifact while only unthrottled pacing failures on a controlled host terminate the gate. A checkpoint run may set `TEAR_PERF_OUTPUT` to a canonical ignored checkpoint path. Diagnostic soaks may increase `TEAR_PERF_DURATION_MULTIPLIER`, select one scenario with `TEAR_PERF_SCENARIO`, exercise `TEAR_PERF_GFX` and `TEAR_PERF_DEVICE_SCALE_FACTOR`, select installed stable Chrome or Playwright's bundled Chromium with `TEAR_PERF_BROWSER=stable|bundled`, capture the first threshold-crossing Chrome trace with `TEAR_PERF_TRACE_PATH` and `TEAR_PERF_TRACE_HITCH_MS`, or write a selected scenario's sampled allocation profile with `TEAR_PERF_ALLOC_PROFILE_PATH`. Trace and allocation profiling each require one explicitly selected scenario so an earlier instrumented page cannot remain alive and contaminate a later workload. Allocation sampling adds profiler overhead and is diagnostic evidence, not a timing-budget run. These controls do not change checked budgets.

Pull requests and `main` run the deterministic functional contract in the required `check` job. The performance test is in the `nightly` group of `config/checks.json`, which the daily Nightly checks workflow runs on a hosted runner. For a release candidate, run `pnpm check:performance` on the controlled release host; its report records the exact browser executable and version.

The test knows two host classes, recorded as `referenceProfile.host` and in each `pacingAssessment`:

- **`controlled`** (the default outside CI): every budget above is required, including the frame-interval p99 and maximum.
- **`shared`** (the default under CI, as on a hosted runner): the frame-interval budgets are recorded as `diagnostic-on-shared-host`. Exceeded ones are printed and kept in the report, but they do not fail the run.
  - The frame interval is the time between `requestAnimationFrame` callbacks, so it includes the host's scheduler. It moves in whole vsyncs (16.7, 33.4, 50.1 ms), and on a shared runner one late vsync crosses the 50 ms maximum while the game's own work stays small. The first nightly run measured a 50.1 ms worst interval with a worst frame work of 6.4 ms.
  - The game's own cost is still required on every host: simulation, render and frame-work p95, and no frame whose work exceeds 50 ms.

`TEAR_PERF_HOST=controlled|shared` overrides the default. CPU-throttled pacing stays diagnostic on both classes.

When hardware-independent changes deliberately alter the representative workload, capture several clean runs, document why the contract changed, and update the workload and budget together. Do not raise a threshold solely to silence one overloaded or contended machine.

## Runtime cost profile (reported, not yet a budget)

`node tests/browser-runtime-cost-profile.js` measures a test build (`dist/test-standalone` by default, or `TEAR_PROFILE_BUILD`) in eight scenes: the menu attract scene, Adventure wave 1, an Endless wave 9 composition, the Verdant Rootbinder/Bloom workload, White Hart phase two, a tutorial lesson, the Shop sheet and the draft overlay. Each scene runs on a fresh page in three separate passes so instrumentation never touches the timing numbers:

- **timing**: simulation and render per frame and the canonical tick, from the test-build `PerformanceMonitor`, plus its test-only cost counters (authoritative captures, canonical projections and their cost, environment cleanup actor sets, ticks). Counting call sites are guarded by `__TEAR_TEST_BUILD__`, so release bundles neither count nor contain the counter names.
- **counters**: an init script counts Canvas `measureText`, gradient and pattern creation, font and shadow assignments, `fillText`, `Object.freeze`, `structuredClone` and DOM writes (inline style through an `element.style` proxy, attributes, classes, text) per frame. `TEAR_PROFILE_CALLSITES=1` also attributes each count to its source line.
- **allocation**: Chrome's sampling heap profiler with objects collected by minor and major GC included, so the summed sample sizes estimate every byte allocated in the window rather than what survived it; a CPU profile runs alongside for attribution. With a source-mapped build (`vite build --mode test-standalone --sourcemap`) both are attributed to source files; `TEAR_PROFILE_RAW_DIR` keeps the raw profiles.

Every pass repeats `TEAR_PROFILE_REPEATS` times (default 3) over a `TEAR_PROFILE_WINDOW_MS` window (default 4,000 ms) after a warm-up, and the report (`TEAR_PROFILE_OUTPUT`) keeps each run with the median, minimum and maximum. Sampled allocation is an estimate with a few per cent of sampling noise; counters are close to deterministic for a given workload.

Findings fixed from this profile (allocation per canonical tick, median of three runs on a shared host; timings did not move outside noise):

- **Environment entries are copied once.** `EnvironmentState` deep-copies and freezes what a caller admits, and remembers the graphs it produced; an update copies only the values it brings in and shares the unchanged, already frozen rest, and the presentation view shares those graphs instead of cloning them (`isEnvironmentOwnedData`). A snapshot assembled outside a state is still cloned. Verdant Rootbinder: environment freezes 26.5 to 10.6 per tick, presentation `structuredClone` 22.4 to 0 per tick, about 96 to 89 KB per tick; White Hart: 113.6 to 109.3 KB per tick.
- **The tutorial coach reads a narrow selection.** The per-tick coach sync and the coach-frame gate used to build the whole session view and checkpoint to read five fields; they now use `TutorialController.coachSelection()`, as do the per-frame coach view and ghost display. Tutorial lesson: 59.9 to 37.4 KB per tick; the rest of the controller cost is the HUD reading the session view once per frame.
- **The Chase arena hash is derived on demand.** It is compared only while a reference frame is selected, so a run without a Chase reference no longer hashes the platforms on every tick and frame. Platforms can change in place (Scenario Console restores, moving chunks), so there is no invalidation point that would allow caching it across ticks during a Chase.

Remaining measured costs, not yet addressed: Pale track wiring (`src/gameplay/environment/biome-actors/aurora-track-actors.ts`, about 39 KB per frame in White Hart), the Scenario Console state adapter encoding (`src/app/engineering/state-forge-adapter.ts`, 8 to 14 KB per frame in every combat scene), Verdant pattern and graft placement re-derivation each tick (`bloom-well.ts`, `rootbound.ts`), and the backdrop. Particles are 2 to 4% of allocated bytes in combat scenes, so pooling them is not worth the risk.

Path to budgets: once several clean runs on the controlled release host agree, promote the deterministic metrics first (canonical projections per second outside recording, `measureText`, gradient and DOM writes per frame per scene) as ceilings about 10% above the measured median in `config/browser-performance-budgets.json`, then allocation bytes per frame. Wall-clock scene timings stay reported until the controlled host shows a stable spread.

## Download and startup budgets

`pnpm check:bundles` (`scripts/check-bundle-budget.mjs`, budgets in [`config/bundle-budgets.json`](../config/bundle-budgets.json)) measures both release builds, `dist/standalone` and `dist/crazygames`:

- **Startup scripts.** The bytes of the entry script plus every `modulepreload` that `index.html` references are at most `startupScriptBytes` (2,300,000 bytes uncompressed; about 2.09 MB measured). The on-demand tutorial corpus may never be among them.
- **Main chunk.** The largest application JavaScript chunk, excluding worker bundles and the on-demand tutorial corpus, stays within `standaloneMainGzipBytes` / `crazygamesMainGzipBytes` gzip bytes.
- **Workers.** The largest worker bundle (Career Archive, coach history, Chase Your Best reference, capsule encoder) is at most `workerGzipBytes` gzip bytes.
- **Tutorial corpus.** The tutorial demonstration corpus is a separate chunk of at most `tutorialGoldGzipBytes` gzip bytes. Training preflight fetches it before a tutorial or practice run; the service worker runtime-caches it on first use, so it then works offline, rather than precaching it for every player.
- **Precache.** The standalone service worker precaches at most `precacheEntries` files and `precacheBytes` bytes (33 entries and about 2.70 MB measured; the three large workers are cached on first use instead), and never the tutorial corpus.

`pnpm check:test-isolation` proves the engineering channel stays out of both release builds. The Watch Agent and the snapshot editor load only through dynamic imports guarded by the test-build constants, and the Verdant calibration scene only through one guarded by `__TEAR_TEST_BUILD__`. The gate fails if a release file contains one of their distinctive markers (storage keys, format identifiers and diagnostic sentences listed in the script) or a calibration image, and it fails if a marker disappears from its source module, so a renamed string cannot make the check pass vacuously.

Set a new ceiling about 10% above a deliberate, measured change and record why here; never raise one to absorb an unexplained increase.

## Load budgets

`pnpm check:load-budgets` (`tests/browser-load-profile.js --check`, ceilings in [`config/load-budgets.json`](../config/load-budgets.json)) loads each release build the way its host serves it and fails when a player would download more before playing. Text is served brotli-compressed (quality 5, close to an edge compressing on the fly) and the standalone build gets its own `_headers` over Cloudflare's default revalidation; the CrazyGames build runs in an iframe below a portal-style path with an SDK stub. The game records three User Timing marks for this (`src/platform/startup-milestones.ts`): `tear:first-frame`, `tear:loading-finished` (the menu accepts input) and `tear:gameplay-start`. The harness clicks PLAY, ENDLESS and START on the drawn labels like a player.

Only byte and request counts are checked. They are identical from run to run for a given build; load times are not, so they are reported, never enforced. Checked on the desktop profile, cold (fresh browser) and warm (reload; on standalone the service worker controls it):

| Ceiling | standalone | CrazyGames | Measured (main e48ca8d5) | Why this number |
|---|---:|---:|---|---|
| Cold bytes to first frame | 730,000 | 730,000 | 687,330 / 688,931 | About 6% above the measured download (main e48ca8d5), so a new startup dependency of a few tens of KB fails. |
| Cold requests to first frame | 28 | 28 | 25 / 25 | Each extra request costs a round trip on phones (150 ms in the phone profile). |
| Cold bytes to playing, music stems excluded | 735,000 | 730,000 | 693,481 / 688,931 | Everything a first run needs besides music; stems are excluded because how many arrive while the player clicks through the menu depends on timing. |
| Warm network requests to first frame | 3 | 26 | 0 / 23 | Requests a returning player waits for. Standalone serves everything from the service worker; CrazyGames has no service worker. |

`pnpm report:load` runs every device profile and reports milestone times, bytes per category and every request (`TEAR_LOAD_PROFILES`, `TEAR_LOAD_TARGETS`, `TEAR_LOAD_REPEATS`, `TEAR_LOAD_OUTPUT`). The profiles use Chromium network and CPU throttling: desktop (40 Mbps, 20 ms, no CPU throttle), laptop (10 Mbps, 40 ms, 4x) and phone (844x390 at 3x, 1.6 Mbps, 150 ms, 4x, touch). Service-worker traffic (the precache install) is not throttled by Chromium's page emulation, so its competition with first-session downloads is invisible here; the precache size budget above covers it. Medians of three runs when the budgets were set (cold first frame / START to playing / menu music ready / warm first frame):

| Target | desktop | laptop | phone |
|---|---|---|---|
| standalone | 0.52 / 0.33 / 1.9 / 0.31 s | 1.31 / 0.46 / 4.0 / 0.52 s | 5.0 / 0.17 / 13.9 / 0.93 s |
| CrazyGames | 0.57 / 0.33 / 1.9 / 0.45 s | 1.28 / 0.44 / 3.6 / 0.69 s | 5.0 / 0.18 / 13.3 / 1.8 s |

The check measures the desktop profile only and does not wait for music stems, so it stays cheap enough for `check.functional` (under a minute once both release builds exist). The three-profile report with times is for the nightly run. Lower a ceiling after a deliberate reduction; raise one only with the measured reason recorded here.
