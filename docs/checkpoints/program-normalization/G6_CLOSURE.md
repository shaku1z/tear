# G6 Closure Record — Typed game-reference synchronization

**Status:** G6 CLOSED on the operational evidence below. The production game,
production wiki Worker, and G7 release remain frozen; G7 is eligible/open for
its own independent certification.

**Scope:** Complete and verify the modern typed game-reference handoff from
protected game `main` to the protected wiki consumer, including exact artifact
provenance, transactional snapshot promotion, protected wiki validation, and a
non-production preview. This closure changes no game behavior, source catalog,
workflow, Cloudflare production Worker, DNS, or production data. The closure
PR itself is documentation-only.

**Closure approval:** [x] The G6 close conditions are satisfied by the exact
dispatch, promotion, post-merge, and preview evidence below. [x] G7 is
eligible/open. [x] Production remains frozen.

## Canonical evidence

| Boundary | Exact evidence |
| --- | --- |
| Game source | Protected game `main` at `71df06260b9ee2b41f729048dce3f910130ea234` (`71df062`). |
| Game validation | Exact-main `Validate` run `32802505041` succeeded for the game source used by the dispatch. |
| Published artifact | Artifact ID `9547220942`; digest `sha256:bcc7559804ccccd807552746aca2de6b0723da476c2df3b00297fdda09118de0`. |
| First E2E failure | Game proof run `32803255301` reached wiki receiver run `32803270229`; the receiver safely exposed stale hardcoded test pins during its snapshot gate. No production surface was changed. |
| Test-fixture repair | Wiki PR #19 removed the retired source/run/hash pins from the active test modules, preserved fail-closed validation and complete rollback-byte assertions, and merged to protected wiki `main` at `b25faa376f4313be9cff8531ff94a234015562dc`. |
| Successful dispatch | Game manual proof run `32803707546` dispatched the exact four-field payload; wiki Sync run `32803721699` independently verified the public artifact and completed transactional promotion. |
| Synchronization PR | Wiki PR #20 contained exactly `src/data/game-reference.v1.json`, `src/data/game-reference.v1.receipt.json`, and `src/data/wiki-terminology.json`; its head was `62a0a80a2e25c4379c833da9666b8a8f308d63c6`. |
| Wiki validation | The explicit exact-head `workflow_dispatch` Validate run `32803747300` passed. The automatic PR `Validate` run `32803748601` first entered `action_required`, was then approved through the GitHub Actions approval endpoint, and passed. Post-merge exact-main `Validate` run `32803865687` passed on wiki `main`. |
| Wiki source | Protected wiki `main` is `ecec8c9aeba189fe7b254329010571dd71f7cc3d` (`ecec8c9`). The promoted manifest SHA-256 is `afc4eb0e7b051c76eb583be852b00a80f4c2b7632744e1a7f4199faffbba7254`. |
| Preview | `https://tear-wiki-preview.shatheartboy.workers.dev`, preview version `eb30480a-8c6a-48f6-8dc1-81bf2054cb6f`. The Final Five roster, Greatsword, Chainblade, Riftlock, and terminology pages returned `200`; retired Spear and Ringblade identifiers were absent from active roster/content. |
| Production boundary | Production was not changed: the game remains at the 2026-08-18 version prefix `5f1d5e2d…`, and the wiki remains at the 2026-07-28 version prefix `b72b4f0e…`. |

## Contract and authority resolution

- The wiki consumes the validated schema-2 typed `game-reference.v1`
  manifest. It does not import the game runtime, the retired JS snapshot, or
  the legacy weapon roster.
- The active roster is exactly **Sword, Hammer, Greatsword, Chainblade,
  Riftlock**. Spear and Ringblade are retired identifiers and remain absent
  from active roster/content; governed historical migration references remain
  distinct from the current roster.
- The sender independently verifies the protected game Validate run, exact
  source SHA, artifact identity, storage redirect, archive size, and SHA-256
  digest before dispatch. The receiver independently verifies the public
  artifact and promotes only the manifest/receipt/terminology triplet.
- A synchronization attempt cannot silently fall back to an older snapshot.
  The stale-fixture E2E attempt failed closed at the snapshot gate and led to
  the focused PR #19 repair before the successful PR #20 promotion.
- The game-repository handoff exception remains comparison/handoff-only and is
  unchanged: `tear-wiki/Weapons-and-Abilities.md`, 3,935 bytes, SHA-256
  `62ab2687f2202538ef2afa90e999c893b4f81b51e9fcd34bad5c7ad65fd4106d`.
  Modern wiki content derives from the typed manifest, not this file.

## G6-A and close-condition resolution

- [x] The wiki build and generated provenance identify the exact game SHA
  `71df06260b9ee2b41f729048dce3f910130ea234`.
- [x] Wrong repository/SHA, malformed or stale schema, malformed manifest,
  duplicate/retired active roster data, and invalid artifact provenance fail
  closed in the sender, receiver, and snapshot gates.
- [x] The generated synchronization diff was restricted to the exact three
  reference files listed above.
- [x] One manual dispatch for the exact merged game SHA succeeded and created
  the exact-triplet wiki PR.
- [x] The automatic PR `Validate` run `32803748601` passed after its required
  approval, and post-merge `Validate` run `32803865687` passed on wiki `main`.
  The separate exact-head dispatch run `32803747300` also passed, but was not
  used as the required PR check.
- [x] The non-production preview exposed the permanent terminology and
  canonical Final Five while production remained untouched.
- [x] The one GitHub bot/PR approval requirement was handled explicitly: the
  automatic pull-request `Validate` attempt entered `action_required` without
  a job, then was approved through the GitHub Actions approval endpoint and
  passed as run `32803748601`. The separate exact-head `workflow_dispatch` run
  `32803747300` had already passed, but was not recognized as the required PR
  check. This is an approval boundary, not a source or artifact failure.

## Post-closure SHA boundary and G7 handoff

This record is based on the synchronized game SHA `71df062`. Merging this
documentation-only closure PR into game `main` will necessarily create a new
game commit. That future commit is **not** the SHA represented by the current
artifact, wiki `main`, or preview version above.

Therefore G7 must begin from the new protected game `main` SHA and repeat the
independent chain:

1. exact-main game `Validate` and game-reference artifact publication;
2. digest-pinned dispatch to the wiki receiver;
3. exact-triplet wiki promotion through a protected PR and post-merge
   `Validate`;
4. a new non-production preview with provenance and Final Five/terminology
   probes; and
5. only after those fresh facts, the separately gated production release
   decision.

No later game documentation commit should be made merely to rewrite this
record's source SHA. The existing `71df062` evidence remains immutable
historical G6 evidence, while the next game SHA becomes the G7 candidate and
must be re-synchronized before it can be used for release.

## Scoped checks and external actions

- `pnpm check:docs` passed on the closure worktree.
- `git diff --check` passed; Git emitted only normal line-ending
  normalization warnings.
- No full game gate was rerun for this documentation-only change.
- No source, workflow, manifest, generated wiki data, Cloudflare, DNS,
  production Worker, merge, deployment, or dispatch action is part of this
  closure PR.

## Rollback and remaining boundaries

The closure PR contains only this record and the corresponding master-plan
status/checklist updates. Rollback is the normal protected PR revert; it does
not alter the already-validated game-reference artifact, the merged wiki
snapshot, or production. G7 retains authority for final release checks,
Cloudflare production deployment, live smoke testing, and final provenance
recording. G8 remains locked until G7 closes.
