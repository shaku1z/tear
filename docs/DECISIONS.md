# Tear decisions

One entry per decision that shapes how Tear is built, released or worked on. A decision
is changed by amending its entry in place: add a dated **Amended** line that says what
changed and why, and keep the earlier text. Do not delete entries; mark a reversed one
**Superseded by D-NNN**.

Each entry gives the trigger (with the owner's words where they are on record), the
decision, the alternatives that were considered, and the consequences. **Source** says
where the decision is recorded. An entry marked **Inferred** was reconstructed from code,
plans or pull requests rather than from a recorded decision; confirm it before relying on
it, and remove the mark once it is confirmed.

Where each workstream stands now is in [POSITION.md](POSITION.md), not here.

| ID | Date | Decision | Status |
| --- | --- | --- | --- |
| [D-001](#d-001) | 2026-08 | One owner identity; no AI or co-author attribution in history | Active |
| [D-002](#d-002) | 2026-08 | The oracle `ee5e931` is comparison-only and locked | Active |
| [D-003](#d-003) | 2026-08 | Production is one validated `main` commit, deployed by a manual workflow | Active |
| [D-004](#d-004) | 2026-08 | The weapon roster is the Final Five | Active |
| [D-005](#d-005) | 2026-11-11 | One surface policy hides engineering tools from release builds | Active |
| [D-006](#d-006) | 2026-11-12 | Standing delegation for the game repository | Active |
| [D-007](#d-007) | 2026-11-12 | Pale Traverse stays a Playground preview | Active |
| [D-008](#d-008) | 2026-11-12 | Hold production deploys of visual work until the owner has played it | Active |
| [D-009](#d-009) | 2026-11-12 | Historical checkpoint gates move to one registry | Active |
| [D-010](#d-010) | 2026-11-13 | Prettier owns formatting; size gates measure non-whitespace characters | Active |
| [D-011](#d-011) | 2026-11-13 | A lead session runs Tear work through side sessions | Active |
| [D-012](#d-012) | 2026-11-13 | Program status is generated from one curated file | Active |
| [D-013](#d-013) | 2026-11-13 | Production deploy of `84761549` after the owner played it | Active |
| [D-014](#d-014) | 2026-11-13 | The game and wiki repositories are private | Superseded by D-018 for the game repository; active for the wiki repository |
| [D-015](#d-015) | 2026-11-13 | Remove the over-built developer systems; plain names for what stays | Active |
| [D-016](#d-016) | 2026-11-16 | Tutorial gold is checked by regeneration, not by a committed source hash | Active |
| [D-017](#d-017) | 2026-11-13 | Pull requests no longer have to be up to date with `main` to merge | Active |
| [D-018](#d-018) | 2026-11-16 | The game repository is public again | Active |

<a id="d-001"></a>

## D-001 — One owner identity; no AI or co-author attribution in history

- **Date:** in force before 2026-08-23. **Inferred** date (the governance skill and its hooks predate the G5 work).
- **Trigger:** the owner's standing preference, recorded in their global agent instructions:
  "Do not add AI contribution credits or attribution to commits, pull requests, patches, or
  other authored artifacts." An audit found 183 historical attribution trailers in the game
  history.
- **Decision:** every commit is authored and committed as the owner's configured Git identity.
  Commit messages and pull request bodies carry no `Co-authored-by`, `Signed-off-by`,
  generated-by or similar trailers. The hooks in `scripts/governance/` (formerly shared from the
  governance skill) enforce this at commit time and, for every new commit object, at push time. Published history is never rewritten to remove old trailers.
- **Alternatives:** rewriting history to remove the 183 old trailers (rejected: it would break
  every clone and published reference).
- **Consequences:** `--no-verify`, plumbing commits and alternate identities are forbidden; the
  pre-push hook also rejects pushes from non-`codex/<scope>` branches, detached HEADs and force
  updates. GitHub's squash committer `GitHub <noreply@github.com>` is the one documented
  exception.
- **Source:** the governance skill (`~/.codex/skills/tear-program-governance/SKILL.md`), the
  parent `AGENTS.md`, [AGENTS.md](../AGENTS.md) "Hard rules".

<a id="d-002"></a>

## D-002 — The oracle `ee5e931` is comparison-only and locked

- **Date:** in force before 2026-08-23. **Inferred** date.
- **Trigger:** the redesign replaced the JavaScript monolith with the typed `src/` architecture;
  feel and behaviour regressions needed a fixed reference.
- **Decision:** `C:\Users\realm\Desktop\game\Tear-oracle`, checked out at `ee5e931`, is a locked
  comparison copy. Nothing is implemented, committed, merged or built there. Legacy JavaScript is
  read for comparison only; the typed architecture is authoritative.
- **Alternatives:** none recorded.
- **Consequences:** parity work compares against the oracle and records approved divergences
  ([PARITY.md](PARITY.md)); the `tear-oracle-parity` skill owns the method.
- **Source:** the parent `AGENTS.md`, the governance skill, [AGENTS.md](../AGENTS.md).

<a id="d-003"></a>

## D-003 — Production is one validated `main` commit, deployed by a manual workflow

- **Date:** 2026-08 (G6/G7 release work). **Inferred** date.
- **Trigger:** not recorded.
- **Decision:** production is exactly one green `main` commit. `Validate` builds the targets once
  and uploads them with a deterministic artifact hash; `Deploy Cloudflare Production` is started
  by hand with that run ID, downloads rather than rebuilds the artifact, proves the checkout is
  clean `main`, and only then publishes. `pnpm deploy` is a build plus Wrangler dry run and cannot
  publish.
- **Alternatives:** none recorded.
- **Consequences:** a green check is necessary but never sufficient to deploy; rollback is the
  previous Cloudflare version plus a reviewed revert.
- **Source:** [RELEASE_AUTHORITY.md](RELEASE_AUTHORITY.md), [DEPLOYMENT.md](../DEPLOYMENT.md).

<a id="d-004"></a>

## D-004 — The weapon roster is the Final Five

- **Date:** before 2026-08-30. **Inferred** date.
- **Trigger:** the weapon redesign.
- **Decision:** the playable roster is Sword, Hammer, Greatsword, Chainblade and Riftlock. Spear
  and Ringblade are historical; saved state that names them maps to Greatsword and Riftlock and
  their old usage statistics are kept under their old IDs.
- **Alternatives:** recorded in the plan.
- **Consequences:** `pnpm check:active-roster` and `pnpm test:weapons` hold the roster.
- **Source:** [FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md](../plans/active/FINAL_FIVE_WEAPON_ROSTER_REDESIGN_IMPLEMENTATION_PLAN.md),
  the parent `AGENTS.md`.

<a id="d-005"></a>

## D-005 — One surface policy hides engineering tools from release builds

- **Date:** 2026-11-11 (release-readiness phase 1).
- **Trigger:** the 2026-11-11 audit found players could reach three research screens, a DEV
  section (Boss Test, Enemy Test) and the `?test=1`, `?stemcue=` and `?foundryPreview=` switches.
- **Decision:** one policy, `src/domain/surface-availability.ts`, decides which surfaces a build
  shows. Release builds hide research screens, Boss Test, Enemy Test, engineering URL switches,
  debug globals and unfinished features (seed race, beat codes, boss memory, coach, replay
  editor, cloud vault). The research code stays in the repository but out of release bundles.
- **Alternatives:** deleting the research code (rejected under D-006 as a reversible default:
  it is kept, out of the bundles).
- **Consequences:** release-only behaviour must be checked in a build, not on the dev server.
- **Source:** [RELEASE_READINESS_PLAN.md](../plans/active/RELEASE_READINESS_PLAN.md) phase 1;
  [pull request 85](https://github.com/shaku1z/tear/pull/85).

<a id="d-006"></a>

## D-006 — Standing delegation for the game repository

- **Date:** 2026-11-12.
- **Trigger:** the owner: "You can handle all the things waiting for me" and "I don't want to have
  to be a middle man for progress and commits".
- **Decision:** for `shaku1z/tear` only, an agent may commit, push its `codex/<scope>` branch, open
  and update pull requests, merge through `owner-safe-pr-merge.mjs` with the exact head OID once
  every required check is green, and start the preview and production deploy workflows from a
  green Validate run on `main`, telling the owner afterwards. The owner removed the required
  reviewers from the GitHub `Production` and `Preview` environments.
- **Alternatives:** keep every merge and deploy behind the owner (the earlier practice).
- **Consequences:** not covered: the music and wiki repositories, credentials, rulesets and branch
  protection, history rewriting, force pushes, bypassing a failing check.
- **Source:** the parent `AGENTS.md`; [AGENTS.md](../AGENTS.md) "Hard rules".

<a id="d-007"></a>

## D-007 — Pale Traverse stays a Playground preview

- **Date:** 2026-11-12, taken by the release lead under D-006 as a reversible default.
- **Trigger:** owner decision 4 in the release-readiness plan (keep it as a preview, or commit to
  the seven-stage migration held on `codex/pale-traverse-r4`) was waiting on the owner.
- **Decision:** Pale Traverse is not published; it stays a Playground preview. On 2026-11-13 the
  owner said Pale Traverse is "even worse" than Verdant and should be reworked after Verdant.
- **Alternatives:** the seven-stage migration on `codex/pale-traverse-r4` (23 unmerged commits).
- **Consequences:** the published campaign keeps its six-stage boundary.
- **Source:** the release lead's record of decisions taken under the delegation; the Verdant and
  Pale Revision 3 plans.

<a id="d-008"></a>

## D-008 — Hold production deploys of visual work until the owner has played it

- **Date:** 2026-11-12. The release lead's own choice, not an owner instruction.
- **Trigger:** the owner's taste is authoritative on visuals, and the merged release-readiness
  line rebuilt the menus and UI.
- **Decision:** preview deploys go ahead under D-006; a production deploy of unreviewed visual
  changes waits for the owner's playtest.
- **Alternatives:** deploy as soon as `main` is green, as D-006 allows.
- **Consequences:** production still runs `9e7d6a70` (see [POSITION.md](POSITION.md)).
- **Amended 2026-11-13:** the owner played `main` and production moved to `84761549`
  ([D-013](#d-013)). The hold still applies to later visual work.
- **Source:** the release lead's record of decisions taken under the delegation.

<a id="d-009"></a>

## D-009 — Historical checkpoint gates move to one registry

- **Date:** 2026-11-12 (release-readiness phase 9).
- **Trigger:** `package.json` carried 88 one-off `check:c*` milestone scripts.
- **Decision:** the replays live in `config/checkpoints.json` and run with
  `pnpm checkpoint <name>`; `pnpm checkpoint --list` lists them.
- **Alternatives:** deleting them (rejected: they reproduce historical evidence).
- **Consequences:** `pnpm test:checkpoints` keeps the registry runnable.
- **Superseded 2026-11-16:** the registry, its runner and the browser tests only it named were
  deleted under [D-015](#d-015); git history keeps them.
- **Source:** [README.md](../README.md); [pull request 85](https://github.com/shaku1z/tear/pull/85).

<a id="d-010"></a>

## D-010 — Prettier owns formatting; size gates measure non-whitespace characters

- **Date:** 2026-11-13.
- **Trigger:** hand formatting had produced 6,559 packed multi-statement lines, and the code-budget
  limits counted raw characters, so any reformat moved them.
- **Decision:** Prettier 3.10.1 with print width 120 formats code and root configs
  (`pnpm format`, `pnpm format:check` in `check:quick` and CI). The code budget and the architecture
  module size rule count non-whitespace characters (ceiling 25,300, re-derived from the old 28,000).
  ESLint has no formatting rules. The format commit is listed in `.git-blame-ignore-revs`.
- **Alternatives:** none recorded.
- **Consequences:** `.prettierignore` must not be widened to pass the check; same-operator chains
  lose redundant parentheses, which needs one tutorial-gold binding refresh.
- **Source:** [pull request 91](https://github.com/shaku1z/tear/pull/91),
  [pull request 92](https://github.com/shaku1z/tear/pull/92), [AGENTS.md](../AGENTS.md) "Gates".

<a id="d-011"></a>

## D-011 — A lead session runs Tear work through side sessions

- **Date:** 2026-11-13.
- **Trigger:** the owner: "You are able to start your own new sessions to handle task. You are
  considered the 'lead' for Tear related work, able to communicate to other sessions and lead them
  when needed."
- **Decision:** one lead session starts a session per task; each works in its own worktree and
  `codex/<scope>` branch, opens a pull request and reports to the lead, which reviews and merges
  under D-006.
- **Alternatives:** the owner relaying between sessions (what the owner wanted to stop).
- **Consequences:** several writers work in parallel, so branches avoid overlapping files.
- **Source:** the lead's record of the owner's instruction.

<a id="d-012"></a>

## D-012 — Program status is generated from one curated file

- **Date:** 2026-11-13.
- **Trigger:** the comparison with the owner's OFFSLCT project: Tear's status was spread over a
  103 KB handoff plan, a program-state file pinned to 2026-08-30 and plan phase tables that went
  stale when pull request 85 merged.
- **Decision:** `config/position.json` is the curated source and [POSITION.md](POSITION.md) is
  rendered from it; `check:docs` fails on a stale or hand-edited render. Decisions live here,
  traps and their guards in [PITFALLS.md](PITFALLS.md).
- **Alternatives:** keep status in the plans (rejected: the phase tables did not follow the merges).
- **Consequences:** a pull request that changes an area's state edits `config/position.json`.
- **Source:** this repository-structure work.

<a id="d-013"></a>

## D-013 — Production deploy of `84761549` after the owner played it

- **Date:** 2026-11-13.
- **Trigger:** D-008 held the deploy of the rebuilt menus and UI until the owner had played them.
  The owner's verdict: "build is good".
- **Decision:** deploy `main` commit `847615494f3b511b4e845da373a90a5277b807b7` to tearblade.com
  through the protected production workflow. The next production deploy follows the Verdant,
  Tutorial and music work.
- **Alternatives:** keep holding until those workstreams land (not taken: the owner approved this
  build).
- **Consequences:** the 2026-08-30 build `9e7d6a70` becomes the previous release; the release
  compatibility fixtures treat it as such. `https://tearblade.com/build-info.json` reports the
  deployed commit. D-008 still applies to later visual work.
- **Source:** the release lead's record of the owner's approval.

<a id="d-014"></a>

## D-014 — The game and wiki repositories are private

- **Date:** 2026-11-13.
- **Trigger:** the owner's instruction: "private repos".
- **Decision:** `shaku1z/tear` and `shaku1z/tear-wiki` are private repositories.
- **Alternatives:** stay public (the repositories were public until 2026-11-13).
- **Consequences:** everything pushed before 2026-11-13, including history, was public and may
  have been copied; anything secret-like found in history is still treated as exposed. The
  branch ruleset on `main` stays enforced (pull requests block on the required `check`).
  GitHub Actions minutes are now metered against the account's allowance, so the cost of the
  `check` job matters.
- **Source:** the release lead's record of the owner's instruction.
- **Superseded by D-018** for `shaku1z/tear`, which is public again from 2026-11-16. The wiki repository
  stays private.

<a id="d-015"></a>

## D-015 — Remove the over-built developer systems; plain names for what stays

- **Date:** 2026-11-13.
- **Trigger:** the owner: "I don't want anything like 'lab, foundry, studio, etc' all those types
  of names, and tbh anything with those names could probably be simplified and removed completely
  perhaps, just nonsense codex created that doesn't need to be, over complicating things. Want to
  make sure all that's good and taken care of. Everything needs to be highly organized, optimized,
  efficient and still with high quality now. and that's a standard." The earlier terminology work
  (G4) had put new names on facades over the old modules instead of renaming or removing anything.
- **Decision:** developer-only systems that nothing shipped or verified depends on are deleted, not
  renamed: the agent training pipelines (Foundry, Academy), the replay hub and bot evidence screens,
  the historical checkpoint registry, and the G4 facades and alias vocabularies. What stays gets one plain name. Player
  storage identifiers (the `tear-ghost-v3` database, `tear_vault_*` keys, replay file formats) are
  identifiers, not names, and never change. In-world game writing that happens to use such a word
  stays. Git history is the archive for deleted code and its documents.
- **Alternatives:** rename everything in place (rejected: it keeps systems nobody uses); move the
  code to an archive folder (rejected: git history already keeps it).
- **Consequences:** each removal lands as its own pull request; names introduced from now on are
  plain words for what a thing does. The cloud publication and support stack is the owner's call
  and is not part of this decision.
- **Source:** the owner's request relayed by the lead session on 2026-11-13.

<a id="d-016"></a>

## D-016 — Tutorial gold is checked by regeneration, not by a committed source hash

- **Date:** 2026-11-16.
- **Trigger:** `src/gameplay/training/tutorial-gold-binding.json` held a hash of the tutorial
  source, so every pull request that changed a tutorial root rewrote the same line; batched
  gameplay pull requests conflicted with each other and each needed a manual refresh.
- **Decision:** the binding records only the gold output's content hash. Whether the committed gold
  still matches the code is proven by regenerating it and comparing
  (`tests/unit/tutorial-production-ghost.test.ts`). Builds run that test unless it passed locally
  for the same tutorial code fingerprint and corpus; the fingerprint is never committed.
- **Alternatives:** keep a committed fingerprint split one line per root (rejected: two changes
  to the same root still conflict, and every change still needs a refresh); compare a build-time
  fingerprint with a committed one (rejected: that is the old conflict).
- **Consequences:** a code change that keeps the gold output needs no regenerated file. The first
  build after a tutorial code change runs the gold test, about a minute; a CI job pays it once.
  Builds now simulate, where before they only compared hashes.
- **Source:** the lead session's task on 2026-11-16.

<a id="d-017"></a>

## D-017 — Pull requests no longer have to be up to date with `main` to merge

- **Date:** 2026-11-13. Recorded 2026-11-17.
- **Trigger:** with several sessions merging in a day, every merge made every other open pull request unmergeable
  until it was rebuilt and its check re-run. The owner's words: "you can remove it, and put something in place to
  ensure nothing wrong happens".
- **Decision:** the "Canonical branch authority" ruleset no longer requires branches to be up to date before
  merging. Each pull request still needs its own green `check`.
- **Alternatives:** keep the strict rule and accept the re-runs (rejected: on 2026-11-13 the repository was
  private and Actions minutes were metered, see [D-014](#d-014), and every merge multiplied the re-runs; the
  repository has been public since 2026-11-16, [D-018](#d-018)).
- **Consequences:** two rules replace it, applied by `pnpm merge:ready <pr>` (`scripts/merge-ready.mjs`), which the
  owner-safe merge helper calls before merging: a red `main` stops merges, and a stale pass is not a pass. The
  rules are in [RELEASE_AUTHORITY.md](RELEASE_AUTHORITY.md#merging).
- **Source:** the release lead's record of the owner's instruction.

<a id="d-018"></a>

## D-018 — The game repository is public again

- **Date:** 2026-11-16. Recorded 2026-11-17.
- **Trigger:** the owner's decision, for free GitHub Actions minutes. No quote was recorded.
- **Decision:** `shaku1z/tear` is public. `tear-music` and the wiki repository stay private.
- **Alternatives:** stay private and pay for metered minutes (the state under [D-014](#d-014)).
- **Consequences:**
  - Everything in the repository and its history is public again.
  - Secrets stay out of the repository, as before.
  - Actions minutes for this repository are not metered.
- **Source:** the release lead's record of the owner's decision.
