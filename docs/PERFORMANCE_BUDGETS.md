# Browser performance regression profile

Tear's runtime regression gate measures the production standalone build through a real Chromium page. It uses the allocation-bounded `PerformanceMonitor` already injected into the game; benchmark code never feeds wall-clock values into simulation state.

## Reference profile

- 1600×900 desktop viewport in headless Chromium or installed stable Chrome.
- Production standalone bundle served from `dist/standalone` over localhost.
- A repeatable playground workload: all eight keyboard spawn commands, sustained movement, primary attacks, blade throws, and normal rendering. Gauges are sampled during spawning so short-lived peaks remain visible.
- The diagnostics ring retains the latest 600 frames. The performance fixture clears its timing samples after setup, while preserving long-task and gauge history, then requires at least 500 desktop or 300 constrained active-combat frames. The authored 12-second and 8-second windows are minimum durations rather than substitutes for those sample requirements.
- The constrained profile applies Chromium's 4× CPU throttle to the same authored workload, approximating the low-power Chromebook/mobile CPUs relevant to the portal release.
- Five additional start/quit cycles verify that run initialization resets enemies and projectiles to zero, bounds authored run-start visual effects, and retains no more than 16 MiB of additional JavaScript heap after forced collection.

The machine-readable source of truth is [`config/browser-performance-budgets.json`](../config/browser-performance-budgets.json). Desktop simulation p95 is at most 4 ms, render p95 at most 14 ms, and measured frame work at most 16.67 ms. At 4× CPU throttle, simulation remains at most 10 ms and render remains at most 14 ms; the diagnostic frame-work allowance is 20 ms. The 10 ms constrained simulation ceiling reflects the measured final-five/C27 runtime baseline (9.8 ms p95 on the reference host), while retaining a bounded headroom contract. Neither active profile permits a new task above 50 ms. Entity ceilings characterize the authored workload and the existing effect-pool hard cap; they do not remove or reduce any feature.

## Running the gate

```powershell
pnpm build:standalone
pnpm test:browser:performance
```

The test writes its measured profile to `test-results/browser-performance.json` and exits non-zero on a regression. Override only the localhost port with `TEAR_PERF_PORT`; budgets stay checked in so CI and local runs evaluate the same contract.

Pull requests and `main` run this contract once in a separate `performance` job on the pinned `ubuntu-24.04` image. The job selects the image's installed stable Google Chrome, matching the stable-Chrome reference used on Windows, and records the exact executable and browser version in its report. The functional `check` job does not repeat it. Both jobs are required release evidence: isolating the measurement prevents the preceding browser suite from contaminating its host while leaving every numeric budget unchanged.

When hardware-independent changes deliberately alter the representative workload, capture several clean runs, document why the contract changed, and update the workload and budget together. Do not raise a threshold solely to silence one overloaded or contended machine.
