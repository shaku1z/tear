# Browser performance regression profile

Tear's runtime regression gate measures the production standalone build through a real Chromium page. It uses the allocation-bounded `PerformanceMonitor` already injected into the game; benchmark code never feeds wall-clock values into simulation state.

## Reference profile

- 1600×900 desktop viewport in headless Chromium or installed stable Chrome.
- Production standalone bundle served from `dist/standalone` over localhost.
- A repeatable playground workload: all eight keyboard spawn commands, sustained movement, primary attacks, blade throws, and normal rendering. Gauges are sampled during spawning so short-lived peaks remain visible.
- The diagnostics ring retains the latest 600 frames. The performance fixture clears its timing samples after setup, while preserving long-task and gauge history, then requires at least 500 desktop or 300 constrained active-combat frames. The authored 12-second and 8-second windows are minimum durations rather than substitutes for those sample requirements. Collection remains bounded at a minimum diagnostic cadence of 10 frames/second for desktop and 5 frames/second under intentional 4× CPU throttling; the cadence bound changes only how long the fixture may wait, not the required sample count or timing budgets.
- The constrained profile applies Chromium's 4× CPU throttle to the same authored workload, approximating the low-power Chromebook/mobile CPUs relevant to the portal release.
- A bounded Verdant boss workload enters Rootbound phase two through the normal Boss Test route, then composes one Rootbinder and two ordinary targets through the existing live entity factory. The world-owned environment must simultaneously expose Bloom Wells, all three Grafts, and at least one Rootbinder link while real combat and rendering continue. Its checked ceilings are 8 enemies, 128 projectiles, 320 effects, 6 fields, 12 combat objects, and 4 routes.
- Five additional start/quit cycles verify that run initialization resets enemies and projectiles to zero, bounds authored run-start visual effects, and retains no more than 16 MiB of additional JavaScript heap after forced collection.

The machine-readable source of truth is [`config/browser-performance-budgets.json`](../config/browser-performance-budgets.json). Desktop simulation p95 is at most 4 ms, render p95 at most 14 ms, and measured frame work at most 16.67 ms. At 4× CPU throttle, simulation remains at most 10 ms and render remains at most 14 ms; the diagnostic frame-work allowance is 20 ms. The 10 ms constrained simulation ceiling reflects the measured final-five/C27 runtime baseline (9.8 ms p95 on the reference host), while retaining a bounded headroom contract. Neither active profile permits a new task above 50 ms. Entity ceilings characterize the authored workload and the existing effect-pool hard cap; they do not remove or reduce any feature.

## Running the gate

```powershell
pnpm build:standalone
pnpm test:browser:performance
```

The test writes its measured profile to `artifacts/tearbench/generated/browser-performance.json` and exits non-zero on a regression. A checkpoint run may set `TEAR_PERF_OUTPUT` to a canonical ignored checkpoint path. Override only that output or the localhost port with `TEAR_PERF_PORT`; budgets stay checked in so CI and local runs evaluate the same contract.

Pull requests and `main` run the deterministic functional contract in the required `check` job. The machine-sensitive performance contract runs once for the final release candidate on a controlled host through `pnpm check`; its report records the exact browser executable and version. Keeping performance evidence off a variable shared runner avoids turning host contention into a gameplay budget change while preserving every numeric threshold.

When hardware-independent changes deliberately alter the representative workload, capture several clean runs, document why the contract changed, and update the workload and budget together. Do not raise a threshold solely to silence one overloaded or contended machine.
