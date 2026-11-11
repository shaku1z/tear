# Tear release-readiness plan

## Authority metadata

- **Owner:** Release-readiness owner
- **Status:** Active
- **Closure condition:** Every phase in the plan is done or explicitly dropped by the owner, `pnpm check` passes from the final commit, and the owner has authorised the merge and deployment.
- **Branch policy:** Work happens on `codex/release-readiness`; nothing is pushed, merged or deployed without the owner saying so.

Started 2026-11-11. Goal: a build that can be put in front of players — no developer surfaces,
a UI that fits and reads at every supported size, a first five minutes a newcomer survives, green
gates, and a repository and workflow that one person or one agent can pick up cold.

The branch starts from the 179-commit `codex/resume-runtime-recovery` line (tip `37cb7fa2`)
because that is where the unfinished work lived.

## Where things stood (verified 2026-11-11)

- Production (tearblade.com) ran `9e7d6a70` from 2026-08-30. Nothing was failing: the newer work
  was never pushed and no deploy was triggered.
- Players could reach developer tools: three research screens on the main menu, a DEV section
  (Boss Test, Enemy Test) on run select, and `?test=1`, `?stemcue=`, `?foundryPreview=` URL switches.
- Menu audit: 39 defects (3 broken, 18 visible to most players). In-run audit: 35 (0 broken, 18
  that hurt most players). No crashes in about 35 play sessions; frame p95 under 5 ms.
- Gates on this line: typecheck, architecture, docs and roster passed. Lint crashed. 38 of 2,855
  unit tests failed: about 25 stale, about 9 real or uncertain, about 4 timeouts.
- First load preloaded 4.1 MB of JavaScript, including about 1 MB of research agents and 1.5 MB of
  tutorial reference data; the service worker precached 14.7 MB, including about 4.5 MB of
  test-only images.
- 43 worktrees and 62 local branches existed; 12 worktrees held uncommitted work.

## Phases

Each phase ends with its own evidence (commands run, screenshots looked at) and a commit.

| # | Phase | Scope | State |
|---|---|---|---|
| 0 | Audit | Six parallel read-only audits of dev surfaces, menus, in-run play, unfinished work, branches, and workflow | done |
| 1 | Gate the game | One release/engineering surface policy (`src/domain/surface-availability.ts`): hides research screens, Boss Test and Enemy Test, engineering URL switches, debug globals, and unfinished features (seed race, beat codes, boss memory, coach, replay editor, cloud vault) from release builds | done |
| 2 | Green gates | Fix the stale detached-world test harness (16 tests, one cause) and the other stale tests and terminology failures; investigate the replay sequence mismatch, headless scenarios that no longer move the player, and replay seek | next |
| 3 | Input and first run | Arm confirm on draft and results so a held Space cannot auto-pick or auto-retry; Escape goes back on menus; P and Esc resume; number keys on tier-up; skip the chapter cinematic on retry; offer the tutorial to a new profile; a real loading state | next |
| 4 | UI system | Minimum text size and a menu size step for small viewports; buttons fit or shorten their labels; one scrolling page component; solid panels and theme-safe dimming; rebuild the rename dialog; move fullscreen, control hint and pointer-lock hint into the canvas UI; toast placement | planned |
| 5 | Screens | Setup, shop, codex (Rootbound and Source are missing), leaderboard empty states, profile, career and vault copy, settings alignment, replay controls | planned |
| 6 | In-run | HUD label size and contrast, cap the ability list, boss name plate, win-screen layout, phone and tablet layouts and touch targets, tutorial card, reserve screen | planned |
| 7 | Payload | Strip engineering code from production bundles, lazy-load tutorial reference data, drop test-only images from the precache, add a bundle budget for the agents chunk | planned |
| 8 | Repository | Archive and remove merged worktrees and branches; fast-forward `main`; one worktree location | done |
| 9 | Workflow | In-repo README, AGENTS.md and CLAUDE.md with run, test and ship commands; a working dev-server launch config; fix stale docs; a quick test loop; show the build version to players | planned |
| 10 | Release | Full `pnpm check` from the final commit, protected pull request, owner-authorised merge and deploy | blocked on owner |

## Decisions that belong to the owner

1. Push `codex/release-readiness` and open a pull request. The branch exists only on one machine plus a local bundle.
2. Merge and deploy once the gate is green.
3. Verdant Sanctum is a published stage that still plays the `fillet` fallback track: pick its final cue.
4. Pale Traverse: keep it as a Playground preview, or commit to the seven-stage migration (`codex/pale-traverse-r4` holds 23 unmerged commits).
5. Early difficulty: an idle player dies in 11 seconds on wave 1 of the default mode. Phase 3 changes onboarding, not balance numbers; softening waves 1–3 for new profiles needs a playtest and a yes.
6. Pull request #84 (`codex/vap6-five-run-qualification`): its commits are already in this line — land it separately or close it.
7. Whether to keep about 19.5 GB of archived capture evidence.
8. Workflow changes proposed by the audit: push a draft pull request by default, one-click deploy of the latest green `main`, crash reporting, and retiring checkpoint ledgers.

## Not in scope

Online co-op (experiment only), new content, balance retuning, final music selection, and changes
to the music or wiki repositories.
