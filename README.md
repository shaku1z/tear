# TEAR

TEAR (sold as "TEAR: BLADE") is a single-player 2D action game that runs in the
browser. You fight with a thrown and recalled blade, using one of five weapons
(Sword, Hammer, Greatsword, Chainblade, Riftlock), through campaign stages and
boss fights. It is written in TypeScript, draws on a Canvas 2D element, and
runs its game rules in a deterministic fixed-step simulation (120 ticks per
second). Vite builds two targets from the same code: the **standalone** web
app (an installable PWA hosted on Cloudflare) and a **CrazyGames** build for
that web portal.

## Prerequisites

- Node.js 24 (`.node-version`; `package.json` requires `>=24`).
- pnpm 11.15.0, the version pinned in `package.json`. Run `corepack enable`
  once and Corepack provides it.
- Chrome or Playwright's Chromium for the browser tests. CI runs
  `pnpm exec playwright install --with-deps chromium`.

## Commands

Run everything from the repository root. "Slow" means minutes, not seconds.

| Command | What it does |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install exactly the locked dependencies. |
| `pnpm dev` | Dev server for the standalone target at http://localhost:5173. |
| `pnpm dev:crazygames` | Dev server for the CrazyGames target (adds the SDK wrapper). |
| `pnpm typecheck` | Strict TypeScript check of all projects (`tsc -b`). Slow: about 2 minutes on Windows. |
| `pnpm lint` | ESLint with type-aware rules. Slow: several minutes on Windows. |
| `pnpm exec vitest run tests/unit/<name>.test.ts` | Run one unit test file. |
| `pnpm test:watch` | Vitest in watch mode; reruns affected tests when you save. |
| `pnpm test:related src/<path>.ts` | Run only the tests that import the given source files. Vitest scans the whole test import graph first, so expect about a minute. |
| `pnpm test:weapons` | The five-weapon roster tests. |
| `pnpm check:quick` | The cheap static gates: typecheck, lint, architecture, docs. Slow because of typecheck and lint. |
| `pnpm build` | Build both production targets into `dist/standalone` and `dist/crazygames`. Slow. |
| `pnpm preview` | Serve the last `dist/standalone` build (Vite's default port is 4173). |
| `pnpm build:test:standalone` | Build the test variant into `dist/test-standalone`. Most browser tests load this build. Slow. |
| `pnpm test:browser` | Browser smoke test against `dist/test-standalone`. Build it first. |
| `pnpm package:crazygames` | Build the CrazyGames target and zip it for upload (see [CRAZYGAMES.md](CRAZYGAMES.md)). Slow. |
| `pnpm test` | Every unit test. Slow. |

`package.json` has more than 160 scripts, mostly CI gates; the table above
covers routine work. Replays of old milestone verification checkpoints (such as
`check:c27a:foundation`) live in `config/checkpoints.json`: list them with
`pnpm checkpoint --list` and run one with `pnpm checkpoint <name>`. Do not run
`pnpm deploy` expecting a deployment: it only builds and runs a Wrangler dry run
(see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Where things live

| Path | Contents |
| --- | --- |
| `src/entrypoints/` | The two small startup files, one per target. |
| `src/app/` | Application composition, screens and their state, run flow, and the live runtime that ties everything together, by folder: `shell/` (composition root, runtime, frame loop), `world/` (world composition, content and stage hosts; `world/biomes/` actor wiring), `combat/`, `run/` (run start, waves, outcomes, shop), `campaign/` (campaign, finale, cinematics, boss practice), `training/` (tutorial and training hosts), `interface/` (screen state, UI coordination, presentation hosts), `screens/` (menu, settings, rename), `library/` (Codex, Ghost Vault, Theater and Career screens), `progress/` (profile persistence ports), `replay/` (Ghost recording, practice, chase and publication), `engineering/` (research and diagnostic surfaces, the Scenario Console runtime, debug harness). |
| `src/gameplay/` | Game rules and content: player, blade, weapons, enemies, bosses, stages, upgrades, tutorial. |
| `src/simulation/`, `src/domain/` | The fixed-step clock, seeded randomness, and pure shared types and rules. |
| `src/presentation/` | Canvas drawing: world, HUD, menus, screens, shared UI components (`ui.ts`). |
| `src/input/` | Keyboard, mouse, touch and gamepad turned into game actions. |
| `src/audio/` | Sound effects, music and the mixer. |
| `src/persistence/`, `src/platform/` | Saved data formats and migrations; storage, cloud, CrazyGames, PWA and other host adapters. |
| `src/replay/`, `src/ghost/` | Run recording and replay. `ghost/` also holds the replay vault and several unfinished replay-based features. |
| `src/agents/` | Research code: AI players and their training. |
| `src/tearbench/` | TearBench, the game's verification system (scenarios, headless runs, CI evidence selection). |
| `src/config/`, `src/game-reference/` | Tuning values, and the exported game data the wiki consumes. |
| `tests/` | Vitest tests in `tests/unit/` and `tests/contract/`; browser tests are `tests/*.js`; Node tests for scripts are `tests/*.mjs`. |
| `scripts/` | Build, gate and release scripts called from `package.json` and CI. |
| `docs/`, `plans/` | Documentation (index: [docs/README.md](docs/README.md)) and plans. |
| `public/` | Static files copied into builds: audio, fonts, branding images, and the vendored music engine. |

## Release builds and engineering builds

Players get **release** builds: `pnpm build`, `pnpm build:standalone`,
`pnpm build:crazygames`. The **engineering** channel is the Vite dev server
(`pnpm dev`) and the test builds (`pnpm build:test:*`). Engineering builds also
show research screens, Boss Test, unfinished features, and engineering URL
switches. `src/domain/surface-availability.ts` is the single list of what each
channel shows; change a surface's channel there.

Test builds additionally read `?test=1` (isolated test storage and debug hooks
for browser tests) and `?bossdebug=1` (a boss debug overlay). The dev server
does not seed test storage or load those hooks, so use a test build for them.

## How a change reaches players

1. Open a pull request against `main`. `main` is protected.
2. The **Validate** workflow (`.github/workflows/ci.yml`) runs
   `pnpm check:functional`, the full functional gate (about 15 minutes in CI).
   Pull requests that change only documentation run the documentation gates
   instead.
3. After merge, Validate runs again on `main` and stores the built targets as a
   workflow artifact for 14 days.
4. A maintainer starts the manual **Deploy Cloudflare Production** workflow with
   that Validate run ID, and the `Production` environment requires approval.
   The workflow deploys the stored artifact; it does not rebuild.

The complete rules are in [docs/RELEASE_AUTHORITY.md](docs/RELEASE_AUTHORITY.md).
The CrazyGames build is uploaded by hand ([CRAZYGAMES.md](CRAZYGAMES.md)).

## Read next

- [AGENTS.md](AGENTS.md): working rules and inner loops for AI agents.
- [CONTRIBUTING.md](CONTRIBUTING.md): setup details and design rules.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): module boundaries and dependency direction.
- [docs/RELEASE_AUTHORITY.md](docs/RELEASE_AUTHORITY.md) and [DEPLOYMENT.md](DEPLOYMENT.md): release and deployment.
- [docs/README.md](docs/README.md): index of the other documents.
