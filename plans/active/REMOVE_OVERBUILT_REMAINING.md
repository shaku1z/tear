# Over-built systems clean-up: what is left

## Authority metadata

- **Owner:** Repository clean-up owner (remove-overbuilt session)
- **Status:** Active
- **Closure condition:** Every "done when" line below holds or is dropped by the lead or the owner in writing, and `pnpm check:quick` passes from the pull request that closes the last one.

## Why

The owner's standard (2026-11, `docs/ENGINEERING_STANDARD.md`) rules out names such as "lab", "foundry", "studio",
"academy" and "forge" and the over-built systems behind them. Pull requests 186, 190, 204, 227, 240, 243, 248, 260,
270, 276, 294, 303, 311, 319 and 328 removed or renamed almost all of it. This card lists what is left, so that the
next session can pick an item up without the history. It was written on 2026-11-21 when the session stopped; nothing
below has been started.

Stored values keep the old words on purpose and are **not** on this list: snapshot fields and tags such as
`"state-forge"` and `stateForgeEvidence`, seeds, scenario ids such as `c27a.live-parity-trace`, and the format name
`"tearbench-forge-package"`. Changing them changes saved snapshots or the hash stream. They go when the replay
overhaul replaces the snapshot format. "FOUNDRY" in the Colossus stage is a place in the game and stays.

## Failure modes (write these first)

1. An item is done while something still reads what it deletes. Caught by the search in each item's steps, run
   before the deletion, and by `pnpm check:docs` and the named tests after it.
2. A rename reaches a stored value and changes the hash stream. Caught by `pnpm test:determinism`, which must pass
   unchanged on any pull request that says it changes no behaviour.
3. A removed check was the only guard for something. Each item says what, if anything, it guarded.

## Items

Each item is one small pull request from `main`. They are independent unless "Depends on" says otherwise.

### 1. Delete the four pinned TearBench documents

- **Depends on:** replay overhaul PR 5c on `main` (`plans/active/REPLAY_OVERHAUL_PLAN.md`). Its `tests/unit/c40-*.test.ts`
  files read these documents, and PR 5c deletes those tests. PRs 5b-1, 5b-2 and 5b-3 come first. Do not start before.
- **Steps:**
  1. Confirm nothing reads them:
     `git grep -l -E "TEARBENCH_GHOST3_CAPABILITY_DASHBOARD|tearbench-ghost3-evidence-catalog|TEARBENCH_WEAPON_ROSTER_EVIDENCE_INDEX|tearbench-weapon-roster-evidence-index" -- . ":!docs/checkpoints" ":!plans/completed"`.
     On 2026-11-21 the readers were seven `tests/unit/c40-*` files (replay's), `scripts/check-docs.mjs`,
     `scripts/check-terminology.mjs` and its test, `config/terminology-registry.json`, `.gitattributes` and
     `docs/REPOSITORY_MAP.md`. Only the last six may remain when you start.
  2. `git rm docs/TEARBENCH_GHOST3_CAPABILITY_DASHBOARD.md docs/tearbench-ghost3-evidence-catalog.json docs/TEARBENCH_WEAPON_ROSTER_EVIDENCE_INDEX.md docs/tearbench-weapon-roster-evidence-index.json`.
  3. In `scripts/check-docs.mjs`, remove their four entries from `PATH_BOUND_TEARBENCH_ARTIFACTS`. Two entries stay
     (`src/tearbench/canonical-scenarios.json`, `src/tearbench/evidence-routes.json`): keep the list for them, and
     change `pathBoundArtifacts` from 6 to 2 in `tests/docs-authority-checker.test.mjs`.
  4. Remove their mentions from `scripts/check-terminology.mjs`, `tests/terminology-checkers.test.mjs`,
     `config/terminology-registry.json`, `.gitattributes` and the `docs/` row of `docs/REPOSITORY_MAP.md`.
  5. `scripts/check-docs.mjs` and `scripts/check-terminology.mjs` are gate files: tell the lead. If the registry
     changes, say in the pull request what the wiki exporter sees differently.
- **Done when:**
  - [ ] The search in step 1 returns nothing outside history.
  - [ ] `pnpm check:docs`, `pnpm test:docs`, `pnpm check:terminology` and `node --test tests/terminology-checkers.test.mjs` pass.

### 2. The State Editor compares a fork with the wrong checkpoint

- **Depends on:** nothing. `src/tearbench/browser/state-editor.ts` and `src/tearbench/tearsdl.ts` are not replay-owned,
  but check that the replay overhaul has no open pull request touching them first.
- **What is wrong:** `TearCheckpointBank.list` in `src/tearbench/tearsdl.ts` sorts by tick and then by id, and the
  editor compares the selection with the first entry. A fork whose id sorts before its source checkpoint is compared
  with itself and shows "No state differences". Found in pull request 328, where the test's fork id had to be
  `test-low-health` to keep the old order.
- **Steps:** compare a fork with its parent checkpoint (the fork's delta records `parentId`), not with the first list entry. Then
  rename the fork id in `tests/browser-state-editor.js` to one that sorts first (for example `a-low-health`) so the
  test fails on today's code and passes after.
- **Done when:**
  - [ ] `pnpm build:test:standalone` then `node tests/browser-state-editor.js` passes with a fork id that sorts before
        `state-forge.live-sandbox`, and fails on `main` with that id.
  - [ ] `pnpm exec vitest run tests/unit/tearbench-state-editor.test.ts` passes.

### 3. `mutableProjectionPolicy` in the terminology registry

- **Depends on:** a word from the wiki session that the wiki exporter does not read the field.
- **What is wrong:** `scripts/check-terminology.mjs` still validates `mutableProjectionPolicy` in
  `config/terminology-registry.json` (about 35 lines of validation), but the function that used its field lists,
  `translateMutableGeneratedDescriptions`, was deleted in pull request 328.
- **Steps:** search `wiki/generator/` and the music and wiki repositories' use of the registry for
  `mutableProjectionPolicy`. If nothing reads it, delete the field, its validation and its test cases. If something
  does, write here what, and close the item.
- **Done when:**
  - [ ] `git grep mutableProjectionPolicy` returns nothing, or this item names the reader that keeps it.
  - [ ] `pnpm check:terminology` and `node --test tests/terminology-checkers.test.mjs` pass.

### 4. The `.artifact-quarantine/` ignore rule

- **Depends on:** no checkout still having the folder. `pnpm leftovers` lists leftover folders in every worktree.
- **Steps:** when no worktree has `.artifact-quarantine/`, remove the line from `.gitignore`. The tooling that wrote
  the folder was deleted in pull request 319.
- **Done when:**
  - [ ] `grep artifact-quarantine .gitignore` returns nothing and `pnpm check:quick` passes.

### 5. `experiments/coop-lab.html`

- **Depends on:** the owner. It is his co-op proof page, and "lab" is one of the banned names.
- **Steps:** ask the owner: delete it, or rename it to `experiments/coop-proof.html`. A rename also changes the four
  files that name it (`git grep coop-lab`: `.gitattributes`, `CRAZYGAMES.md`, `docs/REPOSITORY_MAP.md`,
  `tests/serve-contract.test.mjs`).
- **Done when:**
  - [ ] `git grep coop-lab` returns nothing outside history.

### 6. Old names kept for the music repository

- **Depends on:** the music repository dropping the old host names. That repository is not this task's to change.
- **What is left:** the deprecated aliases "Foundry Studio (audio)", `foundry-studio` and "Ghost Studio" in
  `config/terminology-registry.json` (13 lines), and the `?foundryPreview=` switch named in two documents.
- **Steps:** when the music session says the old names are gone there, remove the aliases and rename the switch in
  one pull request, and say what the wiki exporter sees differently.
- **Done when:**
  - [ ] `git grep -i -E "foundry.studio|foundryPreview"` returns only the Colossus stage's fiction.

## Given to other sessions (listed so nobody does them twice)

| Item | Session |
| --- | --- |
| Rename `.github/workflows/tearbench-program.yml` ("TearBench Evidence Program") and fold it into the nightly workflow | ci-simplify |
| Practice mode's internal kind `"lab"` becomes `"practice"` (`runtime-bridge.ts`, `tutorial-ghost-coach.ts`, `pause-results.ts` and their tests) | training-ux |
| One short document saying what a TearBench scenario is, how to add one and how to run one | playtest-tool |
| The `tests/browser-c40-*`, `tests/unit/c40-*` and `tests/browser-c39-*` files, and "C27A" in comments under `src/ghost` and the replay parts of `src/tearbench` | replay-overhaul (its PR 5) |

## After the replay overhaul

Re-measure `src/tearbench/` (76 files and 21,405 lines on 2026-11-20). The snapshot codecs and the replay world move
out with the replay work; what remains is the scenario language, the headless runner and State Setup. Split it by
what it does only then, because the files overlap with replay's until its PR 5 lands. Keep the name TearBench for the
scenario runner: it is a registered product term and uses no banned word.

## Scope

- **Changes:** the files each item names.
- **Does not change:** `src/ghost/` and the replay parts of `src/tearbench/` (replay overhaul), `docs/checkpoints/`
  (history; the owner decides), the music and wiki repositories, stored values listed under "Why".

## Checks

- **While iterating:** the commands in each item's "done when".
- **Before handing off:** `pnpm format`, `pnpm check:quick`; `pnpm test:determinism` for item 2.
