# Agent guide for the Tear game repository

This is the short version of how to work here. The governing rules are in
`C:\Users\realm\Desktop\game\AGENTS.md` and the governance skill
`C:\Users\realm\.codex\skills\tear-program-governance\SKILL.md`. They stay
authoritative: load them as they require. This file restates a few of their
rules briefly and never relaxes them; where it disagrees with them, they win.

Read [README.md](README.md) first for the commands and the map of `src/`.

## Repository map

- Game code is in `src/`. Dependencies point inward: entrypoints, then app,
  then gameplay, then simulation and domain. Read
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before structural changes;
  `pnpm check:architecture` enforces it, including a 700-line limit per module
  (two data tables are exempt; see `scripts/check-source-architecture.mjs`).
- `src/agents/` (AI player research) and `src/tearbench/` (TearBench, the
  verification system) are tooling, not game features. `src/ghost/` mixes the
  player's replay system with unfinished replay features.
- Repository skills live in `.agents/skills/<name>/SKILL.md`. Use the smallest
  set whose description matches the task.
- `docs/` holds authority documents (index: [docs/README.md](docs/README.md));
  `plans/` holds plans; the current one is
  [plans/active/RELEASE_READINESS_PLAN.md](plans/active/RELEASE_READINESS_PLAN.md).

## Inner loop: gameplay change

1. Read `.agents/skills/tear-feature-wiring` and, for combat or timing,
   `.agents/skills/tear-combat-scenarios`.
2. Change rules under `src/gameplay`, `src/simulation` or `src/domain`. Use the
   injected random source and simulation ticks; ESLint rejects `Math.random`,
   `Date.now` and browser globals there.
3. Run the closest tests: `pnpm exec vitest run tests/unit/<area>.test.ts`, or
   `pnpm test:related <changed src files>`; add `pnpm test:weapons` for weapon
   or ability changes.
4. Add the smallest permanent test or scenario that fails without your change.
5. If you changed a file covered by the tutorial reference fingerprint, refresh
   it before any build (see "Known traps").
6. `pnpm typecheck` (about 2 minutes), then `pnpm check:quick` before handing
   off when the change crosses modules.

## Inner loop: UI change

1. Read `.agents/skills/tear-ui-regression`.
2. Canvas UI is in `src/presentation` (shared components in
   `src/presentation/ui.ts`); screen state and actions are in `src/app`.
3. Look at it with `pnpm dev` (http://localhost:5173). The dev server shows the
   engineering surfaces, so release-only behavior must be checked in a build.
4. Run the renderer and controller unit tests for the screen.
5. For browser evidence, build first: `pnpm build:test:standalone`, then the
   matching script, for example `pnpm test:browser:journeys`,
   `pnpm test:browser:responsive` or `pnpm test:browser:input`. Browser tests
   read built files in `dist/`, never the dev server.

## Seeing the game

- **Dev server:** `pnpm dev` serves http://localhost:5173. A headless
  screenshot of it can show an empty canvas while modules are still compiling.
- **Production build:** `pnpm build:standalone`, then `pnpm preview`
  (http://localhost:4173). This is what players get.
- **Test build hooks:** after `pnpm build:test:standalone`, serve
  `dist/test-standalone` and open `index.html?test=1` (isolated storage plus
  debug globals such as `window.__TEAR_CATALOG_DEBUG__`) or add `&bossdebug=1`
  (boss debug overlay). `tests/browser-smoke.js` shows a complete harness.
- **Screenshot recipe.** Save this as `shot.mjs` in your scratch directory, not
  in the repository, and run
  `node shot.mjs <repo root> http://localhost:4173/ <out.png>`:

```js
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
const [repo, url, out] = process.argv.slice(2);
const { chromium } = createRequire(join(repo, "package.json"))("@playwright/test");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (error) => console.error("pageerror:", error.message));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3000);
await page.screenshot({ path: out });
await browser.close();
```

Stop every server you start, and check that no `node` process is left behind.

## Gates

`.agents/skills/tear-change-gate` decides which checks a change needs; follow
its `references/gate-routing.md` instead of guessing. In short: targeted tests
while iterating; `pnpm check:quick` for cheap static confidence;
`pnpm check:functional` is what CI requires on every pull request;
`pnpm check` is the full release gate and runs once for a release candidate
([docs/RELEASE_AUTHORITY.md](docs/RELEASE_AUTHORITY.md)). Never weaken a gate to
make it pass. Docs-only changes: `pnpm check:docs`, `pnpm test:docs`,
`pnpm check:terminology`. Use the product names in
`config/terminology-registry.json` in anything players or docs see.

## Hard rules

- One writing agent owns one worktree and one branch named `codex/<scope>`,
  created from `origin/main` under `C:\Users\realm\Desktop\game\worktrees\`.
  Never share a worktree with another writing agent.
- The canonical checkout `C:\Users\realm\Desktop\game\Tear` stays on `main`;
  do not edit there. Preserve untracked and user-owned files everywhere.
- Never edit, commit in, or build from `C:\Users\realm\Desktop\game\Tear-oracle`.
  It is a locked comparison copy.
- Commits use only the owner identity already configured for this repository
  (`git config user.name` and `git config user.email`; do not change them), with
  no `Co-authored-by`, `Signed-off-by`, "generated by" or other attribution
  trailers. Installed Git hooks enforce this; never use `--no-verify` or other
  ways around them, and never rewrite published history.
- No push, pull request, merge, deployment, publication, credential or
  ruleset change unless the owner explicitly authorizes that exact action.
- A game task does not authorize touching the music or wiki repositories,
  Cloudflare, or any other service; the owner must name each one.
- Keep scratch files, logs and screenshots outside the repository.

## Known traps

- **`pnpm deploy --help` runs the script.** pnpm 11 ignores `--help` after a
  script name and runs `deploy` (a build plus Wrangler dry run). Read
  `package.json` instead of passing `--help` to a script.
- **PowerShell 5.1 corrupts redirected binary output.** `>` and pipes treat a
  native program's output as text and re-encode it, so images, archives and
  other binary files come out broken. Have the tool write the file itself
  (Playwright's `path`, `--outFile`, `tar -f`) or use the Bash tool.
- **Tutorial reference fingerprint.** Every build runs
  `assertTutorialGoldFresh()` from `scripts/tutorial-gold-compatibility.mjs`.
  It hashes the tutorial roots listed there (player, blade, combat phases,
  tutorial runtime and controller, and others) and everything they import. If
  you edit any of those files, builds fail with "Tutorial gold references are
  stale". Regenerate the data, then commit both rewritten files
  (`src/gameplay/training/tutorial-gold-reference-data.json` and
  `tests/fixtures/tutorial-gold-reference-proof.json`) with your change:
  - PowerShell: `$env:TEAR_TUTORIAL_GOLD_WRITE = "1"; pnpm exec vitest run tests/unit/tutorial-production-ghost.test.ts; Remove-Item Env:TEAR_TUTORIAL_GOLD_WRITE`
  - Bash: `TEAR_TUTORIAL_GOLD_WRITE=1 pnpm exec vitest run tests/unit/tutorial-production-ghost.test.ts`
- **`node_modules` junctions.** Some older worktrees use a Windows junction for
  `node_modules` that points into another worktree or the canonical checkout.
  A recursive delete follows the junction and destroys the target. Remove the
  link alone first (`cmd /c rmdir <path>\node_modules`), then the worktree.
- **One dev server per port.** Plain `pnpm dev` moves to 5174 and up when 5173
  is busy, possibly serving a different worktree than you think; check its URL.
- **`git rebase` stops half-way.** HEAD is detached during a rebase, and the
  commit guard refuses to commit on a detached HEAD. Abort it
  (`git rebase --abort`) and bring commits across with `git cherry-pick` onto
  the checked-out branch instead.

## Finishing

Hand off with the governance skill's handoff block, listing commands and
results. Remove your worktree (`git worktree remove`) and branch
(`git branch -d`) only after the work is merged into `main` or the owner has
archived it, and after checking the worktree for uncommitted work and junctions.
