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

- Node.js 24 (`.node-version` names the exact version CI installs; `package.json` requires `>=24`).
- pnpm 11.15.0, the version pinned in `package.json`. Run `corepack enable`
  once and Corepack provides it.
- Chrome or Playwright's Chromium for the browser tests: `pnpm exec playwright install --with-deps chromium`.
  CI's browser jobs run in Playwright's image for the lockfile's version instead, so they install nothing.

## Commands

Run everything from the repository root. "Slow" means minutes, not seconds.

| Command | What it does |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install exactly the locked dependencies. |
| `pnpm dev` | Dev server for the standalone target at http://localhost:5173. |
| `pnpm dev:crazygames` | Dev server for the CrazyGames target (adds the SDK wrapper). |
| `pnpm typecheck` | Strict TypeScript check of all projects (`tsc -b`). Slow: about 2 minutes on Windows. |
| `pnpm lint` | ESLint with type-aware rules. Slow: several minutes on Windows. |
| `pnpm format` | Format code and root configs with Prettier (rewrites files). Settings in `.prettierrc.json`, targets in `scripts/format.mjs`, exclusions in `.prettierignore`. About 15 seconds. |
| `pnpm format:check` | Fail if any formatted file differs from Prettier's output; CI runs it. About 15 seconds. |
| `pnpm exec vitest run tests/unit/<name>.test.ts` | Run one unit test file. |
| `pnpm test:watch` | Vitest in watch mode; reruns affected tests when you save. |
| `pnpm test:related [files]` | The tests a change can break: those whose imports reach the files (`vitest related`), those that name a file or a folder holding it as text, those that read the tree with git, and the `node --test` files the checks run among them. With no files it takes the branch's change from `origin/main`, uncommitted and deleted files included. `--list` prints the picks and why without running them. A one-file `src` change took about 3 minutes, most of it the `node --test` files of the architecture and code-budget gates. |
| `pnpm test:weapons` | The five-weapon roster tests. |
| `pnpm check:quick` | The cheap static gates: format check, typecheck, lint, architecture, code budget, docs. Slow because of typecheck and lint. |
| `pnpm build` | Build both production targets into `dist/standalone` and `dist/crazygames`. Slow. |
| `pnpm preview` | Serve the last `dist/standalone` build (Vite's default port is 4173). |
| `pnpm build:test:standalone` | Build the test variant into `dist/test-standalone`. Most browser tests load this build. Slow. |
| `pnpm test:browser` | Browser smoke test against `dist/test-standalone`. Build it first. |
| `pnpm package:crazygames` | Build the CrazyGames target and zip it for upload (see [CRAZYGAMES.md](CRAZYGAMES.md)). Slow. |
| `pnpm test` | Every unit test. Slow. |

`package.json` has more than 160 scripts, mostly CI gates; the table above
covers routine work. Do not run
`pnpm deploy` expecting a deployment: it only builds and runs a Wrangler dry run
(see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Property tests

A property test states a rule that must hold for every input ("a saved profile loads back the same") and lets
[fast-check](https://fast-check.dev) try many generated inputs. On a failure it shrinks the input to a small one that
still fails.

- **Where:** `tests/unit/<area>.property.test.ts`. The normal unit run, the CI shards and `pnpm test:related` pick
  them up like any other unit test.
- **How:** import `checkProperty` (or `checkAsyncProperty`) and `fc` from `tests/unit/property-harness.ts`; never call
  `fc.assert` or import `fast-check` yourself (`tests/unit/property-harness.test.ts` fails if you do). Shared input
  generators (any JSON, stored text, game actions) are in `tests/unit/property-arbitraries.ts`; add yours there when a
  second file needs it.
- **Seed:** fixed, so CI and every machine try the same inputs. A failure prints the seed, the shrunk input, the
  reason and the exact command that replays that one input.
- **Budget:** `checkProperty(property)` tries 200 inputs, for rules over plain data; `checkProperty(property,
  "simulation")` tries 12, for rules that run the game. Keep a property file within a few seconds.
- **Deeper search before a pull request:** `TEAR_PROPERTY_SCALE=50` multiplies every budget and `TEAR_PROPERTY_SEED=7`
  tries other inputs; add `--testTimeout=0`, because a deep run is longer than the 5 s test limit.

```ts
import { checkProperty, fc } from "./property-harness";

it("sorting twice changes nothing", () => {
  checkProperty(
    fc.property(fc.array(fc.integer()), (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      expect([...sorted].sort((a, b) => a - b)).toEqual(sorted);
    }),
  );
});
```

Four things that go wrong:

- **Do not change a generated input.** fast-check prints the input after the run, so a changed one hides what failed.
  Copy it first.
- **Take lists and ranges from the game** (`WEAPON_IDS`, `RUN_MODE_IDS`, the input scales), so the next weapon or
  mode is covered without editing the test.
- **Compare a stored copy as text.** JSON writes `-0` as `0`, so `toEqual` on a value read back from storage fails on
  a difference no game rule can see.
- **Keep long inputs cheap to shrink.** Build a long string by repeating a short generated piece; shrinking a
  16,000-character generated string takes minutes.

A property that finds a bug lands with the fix, in its own pull request that names the bug.

## Where things live

| Path | Contents |
| --- | --- |
| `src/entrypoints/` | The two small startup files, one per target. |
| `src/app/` | Application composition, screens and their state, run flow, and the live runtime that ties everything together, by folder: `shell/` (composition root, the live runtime root `game-runtime.ts` that wires the owners below in order, production world, frame loop), `world/` (the one world constructor, also used by the detached TearBench world, content and stage hosts; `world/biomes/` actor wiring), `combat/`, `run/` (run start, waves, outcomes, shop), `campaign/` (campaign, finale, cinematics, boss practice), `training/` (tutorial and training hosts), `interface/` (screen state, UI coordination, presentation hosts), `screens/` (menu, settings, rename), `library/` (Codex, Ghost Vault, Theater and Career screens), `progress/` (profile persistence ports), `replay/` (Ghost recording, practice, chase and publication), `engineering/` (research and diagnostic surfaces, the Scenario Console runtime, debug harness). |
| `src/gameplay/` | Game rules and content: player, blade, weapons, enemies, bosses, stages, upgrades, tutorial. |
| `src/simulation/`, `src/domain/` | The fixed-step clock, seeded randomness, and pure shared types and rules, including the screen catalog (`screen-catalog.ts`). |
| `src/presentation/` | Canvas drawing: world, HUD, menus, screens, shared UI components (`ui.ts`). |
| `src/input/` | Keyboard, mouse, touch and gamepad turned into game actions. |
| `src/audio/` | Sound effects, music and the mixer. |
| `src/persistence/`, `src/platform/` | Saved data formats and migrations; storage, cloud, CrazyGames, PWA and other host adapters. |
| `src/replay/`, `src/ghost/` | Run recording and replay. `ghost/` also holds the replay vault and several unfinished replay-based features. |
| `src/agents/` | The scripted test player: a bot that plays the real game in test builds and headless runs. |
| `src/playtest/` | The playtest tool: plays boss fights headless with scripted players and measures them. Run it with `pnpm playtest bosses`, or `pnpm playtest sweep` for every weapon on Easy and Normal. |
| `src/tearbench/` | TearBench, the scenario runner: named situations with their proof, and the selection of proofs a change needs. [docs/TEARBENCH.md](docs/TEARBENCH.md) says what a scenario is and how to run or add one. |
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
channel shows; change a surface's channel there. A screen's channel, like every
other per-screen fact, is its entry in the screen catalog
`src/domain/screen-catalog.ts`.

Test builds additionally read `?test=1` (isolated test storage and debug hooks
for browser tests) and `?bossdebug=1` (a boss debug overlay). The dev server
does not seed test storage or load those hooks, so use a test build for them.

## How a change reaches players

1. Open a pull request against `main`. `main` is protected.
2. The **Validate** workflow (`.github/workflows/ci.yml`) runs the checks of
   `pnpm check:functional` as parallel jobs: static, unit, one build, and the
   browser checks in four shards that test that build. The required check
   `check` passes only when every one of them passed. Pull requests that change
   only documentation run the documentation gates instead.
3. After merge, Validate runs again on `main` and stores the built targets as a
   workflow artifact for 7 days.
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
