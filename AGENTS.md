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
  `pnpm check:architecture` enforces it: rules over module roles
  (`config/architecture-roles.json`), allowed directory edges
  (`config/architecture-layers.json`), a ratcheted allowlist of today's
  violating edges and import cycles (`config/architecture-baseline.json`) and a
  700-line limit per module (two data tables are exempt), counted in
  formatting-independent line equivalents (the code budget's character measure).
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
6. `pnpm format` (Prettier), `pnpm typecheck` (about 2 minutes), then
   `pnpm check:quick` before handing off when the change crosses modules.

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
make it pass. Prettier owns formatting: run `pnpm format` before handing off;
`pnpm format:check` is in `check:quick` and CI (`static.format-check`). Settings
are in `.prettierrc.json`, targets in `scripts/format.mjs` and exclusions (JSON
data, Markdown, generated files) in `.prettierignore`; ESLint has no formatting
rules. Do not widen `.prettierignore` or add `// prettier-ignore` to pass the
check. `pnpm check:code-budget` ratchets file size, line length, packed lines
and function size (see docs/ARCHITECTURE.md); never raise its baseline to pass.
`pnpm check:architecture` fails closed: moving or renaming a module that the role
map names fails until the map is updated in the same change, and the layer
allowlist and cycle baseline may only shrink (`--update` lowers them; growth needs
a reviewed `--allow-increase <file>`). `--explain <file>` lists the rules, roles
and allowlisted edges that apply to a file; `pnpm test:architecture` covers the gate.
`pnpm test:determinism` must stay green for any refactor that claims no behaviour change.
Docs-only changes: `pnpm check:docs`, `pnpm test:docs`,
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
- Standing delegation (owner, 2026-11-12; the parent `AGENTS.md` has the full
  text): you may commit, push your `codex/<scope>` branch, open and update pull
  requests, merge through `owner-safe-pr-merge.mjs` once every required check
  is green, and start the deploy workflows from a green Validate run on `main`,
  then tell the owner what you merged or deployed. Credentials, rulesets and
  branch protection, force pushes, history rewriting and bypassing a failing
  check still need the owner.
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
  It hashes the code of the tutorial roots listed there (player, blade, combat
  phases, tutorial runtime and controller, and others) and of every module they
  import for values. Comments, whitespace, line breaks and import paths do not
  count, so moving, renaming or reformatting those files is safe; changing their
  code makes builds fail with "Tutorial gold references are stale". One
  exception: Prettier drops redundant parentheses in same-operator chains
  (`a ?? (b ?? c)` becomes `a ?? b ?? c`), which regroups the syntax tree, so
  the first `pnpm format` after writing such code needs a refresh; the gold
  output itself does not change. Moving a
  root file also needs its new path in `TUTORIAL_GOLD_ROOTS`. Regenerate, then
  commit every file it rewrites: always
  `src/gameplay/training/tutorial-gold-binding.json`, and also
  `src/gameplay/training/tutorial-gold-reference-data.json` and
  `tests/fixtures/tutorial-gold-reference-proof.json` when the gold output
  itself changed:
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
