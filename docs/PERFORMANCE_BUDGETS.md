# Browser performance regression profile

Tear's runtime regression gate measures the production standalone build through a real Chromium page. It uses the allocation-bounded `PerformanceMonitor` already injected into the game; benchmark code never feeds wall-clock values into simulation state.

## Reference profile

- 1600×900 desktop viewport in headless Chromium or installed stable Chrome.
- Production standalone bundle served from `dist/standalone` over localhost.
- A repeatable playground workload: all eight keyboard spawn commands, sustained movement, primary attacks, blade throws, and normal rendering. Gauges are sampled during spawning so short-lived peaks remain visible.
- The diagnostics ring retains the latest 600 frames. The 12-second desktop and 8-second constrained active windows replace boot/menu samples before their percentile assertions.
- The constrained profile applies Chromium's 4× CPU throttle to the same authored workload, approximating the low-power Chromebook/mobile CPUs relevant to the portal release.
- Five additional start/quit cycles verify that run initialization resets enemies and projectiles to zero, bounds authored run-start visual effects, and retains no more than 16 MiB of additional JavaScript heap after forced collection.

The machine-readable source of truth is [`config/browser-performance-budgets.json`](../config/browser-performance-budgets.json). Desktop simulation p95 is at most 4 ms, render p95 at most 14 ms, and measured frame work at most 16.67 ms. At 4× CPU throttle, simulation remains at most 8 ms and render remains at most 14 ms; the diagnostic frame-work allowance is 20 ms. Neither active profile permits a new task above 50 ms. Entity ceilings characterize the authored workload and the existing effect-pool hard cap; they do not remove or reduce any feature.

## Running the gate

```powershell
pnpm build:standalone
pnpm test:browser:performance
```

The test writes its measured profile to `test-results/browser-performance.json` and exits non-zero on a regression. Override only the localhost port with `TEAR_PERF_PORT`; budgets stay checked in so CI and local runs evaluate the same contract.

When hardware-independent changes deliberately alter the representative workload, capture several clean runs, document why the contract changed, and update the workload and budget together. Do not raise a threshold solely to silence one overloaded or contended machine.
