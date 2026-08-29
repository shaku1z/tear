# VS3-C9 presentation evidence

## Claim

Verdant Sanctum's presentation route renders coherently at the supported
desktop, high-density, laptop, and touch-landscape viewports.

- Generator: `tests/browser-verdant-presentation.js`
- Command: `pnpm build:test:standalone && pnpm test:browser:verdant-presentation`
- Expected/observed result: all four viewport captures complete and the browser
  assertions pass.
- Raw evidence: `artifacts/tearbench/checkpoints/verdant-sanctum/VS3-C9/presentation/`
- Principal sources: `src/presentation/`, the Verdant presentation debug route,
  and the canonical Verdant content definitions.

The raw screenshots and `evidence.json` are regenerable and intentionally
ignored. This manifest is the durable index.
