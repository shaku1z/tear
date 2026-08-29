# Contributing to Tear

## Setup

Tear uses Node.js 24+, Corepack, and the pinned pnpm version in `package.json`.

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Use `pnpm dev:crazygames` when validating portal composition. Development servers do not install a service worker.

Do not open `index.html` through VS Code Live Server or another plain static server. Vite maps `public/` assets to root URLs, injects the target entrypoint, and generates the standalone web manifest; bypassing it causes expected `/fonts/*` and `/manifest.webmanifest` 404 responses and does not boot the compiled game.

For repository-root static tools such as the co-op experiment or cover
generator, use the canonical helper from the repository root (or invoke its
absolute path from another working directory):

```powershell
python scripts/serve.py
python scripts/serve.py --port 0
```

It serves the repository root on loopback (`127.0.0.1`) and writes generated
cover PNGs under this repository's `branding/` directory. Saves are
create-only by default; an existing file is preserved with HTTP 409. Use
`--allow-overwrite` only when deliberately regenerating those files:

```powershell
python scripts/serve.py --allow-overwrite
```

The helper accepts only loopback `--host` values and never replaces the Vite
development server for game validation.

## Before submitting a change

Run the smallest relevant tests while working, then the complete release gate:

```powershell
pnpm check
```

This includes strict type checking, lint, unit/contract/determinism and weapon tests, TearScore provenance, both production targets, bundle and reproducibility checks, browser flows, performance, audio, platform separation, and standalone offline behavior.

## Design rules

- Preserve deterministic rules: use the injected game random source and simulation ticks, never `Math.random`, `Date.now`, or render timing for gameplay decisions.
- Keep platform SDKs, DOM/canvas, Web Audio, and storage outside domain and simulation code.
- Convert device input to semantic actions before it reaches gameplay.
- Add legal application/run transitions to their state models; do not coordinate them with screen-name strings or render functions.
- Route sound through Master/Music/SFX/Interface and the internal effect buses.
- Version and migrate saved data and replay changes.
- Keep authored modules focused and normally below 500 lines. Large static content tables are the exception, not controllers.
- Add characterization before refactoring behavior and update `docs/FEATURE_INVENTORY.md` with the evidence.

See `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`, `docs/PERFORMANCE_BUDGETS.md`, `docs/RELEASE_MATRIX.md`, and `DEPLOYMENT.md` for subsystem and release guidance.

## Evidence and generated output

Keep source and package roots free of logs, screenshots, traces, reports, and
compiler caches. Follow `docs/ARTIFACTS.md`, use the checkpoint-scoped paths in
`config/artifact-layout.json`, and run `pnpm check:artifacts` after changing an
artifact generator or evidence reference. Raw output under `artifacts/` is
ignored; only deliberately promoted checkpoint manifests and preservation
records are committed.
