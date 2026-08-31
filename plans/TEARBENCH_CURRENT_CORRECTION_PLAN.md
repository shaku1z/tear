# TearBench current correction execution plan

- **Document role:** Temporary active execution authority for the post-Verdant/Pale TearBench correction sequence. It blocks broader TearBench development only where a listed correction is a prerequisite.
- **Owner:** TearBench current correction owner
- **Status:** Active
- **Baseline:** Protected game `main` at `9e7d6a701ca0b992c8d78cccc2af329d698778c0`, audited 2026-08-30.
- **Closure condition:** TC-1 through TC-10 satisfy their exact exit gates on one clean protected source identity, the final post-review finds no unresolved correction-scope defect, and C40 truthfully records either a valid release certificate or its remaining blockers without overstating completion.
- **Retirement:** After closure is reconciled into the master handoff, program charter, alignment plan, and plan indexes, move this document to completed history in a separate atomic documentation change. Do not leave two active sequencing authorities for the same corrections.
- **Scope:** TearBench contracts, scenarios, invariants, live/headless evidence, diff routing, capability reporting, current terminology, Verdant/Pale publication truth, and the documents that govern those surfaces.

This plan is intentionally temporary and narrow. It does not replace the C21-C40
completion plan, the C40 execution guide, immutable v0.6 requirements, or historical
checkpoint evidence. It defines the blocking corrections required before those
authorities can be followed safely against the current game.

## 1. Current facts that may not drift

| Fact | Current authority |
| --- | --- |
| Published campaign | Six stages and 60 waves: Grounds, Undercroft, Crimson Fields, Verdant Sanctum, Voidspire, The Tear |
| Authored preview | Pale Traverse is Playground/Scenario Console/replay/TearBench engineering content and is not published progression |
| Published bosses | Warden, Colossus, Aldric, Rootbound, Echo, Source |
| Preview boss | White Hart is canonically implemented but publication-gated; it is not a provisional implementation |
| Current ruleset | `tear-rules-six-biome-verdant-r3-pale-preview-v1` |
| Final stage | Stable ID `tear`, display name `The Tear`, boss `source` |
| Product name | TearBench is unchanged and must not be renamed |
| Release state | Protected Validate and production deployment passed at baseline HEAD; C40 remains incomplete |

Source implementation and `config/campaign-publication-boundary.json` own current
publication truth. Older plan and checkpoint statements that prohibit a public
six-stage campaign are historical decisions superseded by the explicit protected
publication policy; preserve them as history rather than treating them as current
runtime authority.

## 2. Goals

1. Make every TearBench backend, invariant, scenario, and capability claim executable and honest.
2. Make current content vocabulary and published/preview ownership derive from game-owned authorities rather than agent memory.
3. Ensure a relevant Tear change selects the specialized evidence that can disprove it in the same reviewed change.
4. Reconcile program documents and generated reports so old baselines or narrow artifacts cannot masquerade as current completion.
5. Finish with an exact-commit adversarial review that reopens failed checkpoints instead of declaring completion early.

## 3. Execution rules

- Work in checkpoint order. TC-1 is the first implementation checkpoint.
- Start each checkpoint from current protected `origin/main` in one isolated `codex/*` worktree.
- Add or tighten the smallest permanent fail-first evidence before changing the claim it guards.
- Use source-owned catalogs and typed projections. Do not create a second stage, boss, mechanic, roster, or terminology registry.
- A declared backend requires subject-specific execution on that backend. Generic reset/tick coverage is not mechanic parity.
- A browser helper, fixture, screenshot, metadata string, or passing unrelated unit suite is not canonical scenario evidence.
- Run focused tests while iterating. Run `pnpm check` once at the final integration boundary, not after every small edit.
- Check a box only when the implementation, focused evidence, and exit condition all exist at the recorded source identity.
- Preserve immutable source requirements and checkpoint history. Add current overlays; do not rewrite historical facts.
- Do not merge, deploy, publish Pale, update another repository, re-vendor music, or claim C40 without separate authority and the named gate.

## 4. Required correction order

| Order | Checkpoint | Status | Dependency |
| ---: | --- | --- | --- |
| 1 | TC-1 — Publication authority | Complete | Plan activation |
| 2 | TC-2 — Bloom backend honesty | Complete | TC-1 |
| 3 | TC-3 — Environment invariant binding | Complete | TC-2 |
| 4 | TC-4 — Rootbound repeated-poll regression | Complete | TC-3 |
| 5 | TC-5 — Source-derived content terminology | Complete | TC-1 |
| 6 | TC-6 — Specialized evidence-route ownership | Complete | TC-2 through TC-5 |
| 7 | TC-7 — Diff-scoped capability reporting | Complete | TC-6 |
| 8 | TC-8 — Program-document reconciliation | Complete | TC-1 through TC-7 |
| 9 | TC-9 — Canonical Pale preview scenarios | Complete | TC-3, TC-5, TC-6 |
| 10 | TC-10 — Exact-commit post-review and C40 truth | Not started | TC-1 through TC-9 |

### Known audit inputs that must not be dropped

These are already-observed defects or truthfulness gaps, not extra checkpoints.
Resolve them under the named owner below, or record them as explicit C40 blockers.

| Audited input | Owning checkpoint | Required disposition |
| --- | --- | --- |
| Several registered invariants are missing, vacuous, tautological, or compare the wrong projection fields (`test.production-isolation`, `replay.branch-equivalence`, owner, wave, softlock, boss phase, focus, and finite-state coverage). | TC-3 | Repair or explicitly refuse the unsupported invariant; add one discriminating negative per affected family. |
| The ordinary TearBench session can omit native causal events, while unknown wave/effect values are coerced into unrelated registered events and synthetic provenance can be labeled `engine`. | TC-3 | Preserve native facts, fail closed on unknown mappings, and report bridge-derived provenance honestly. |
| C29/C30 replay/headless composition still contains gameplay-relevant reduced/no-op hooks for abilities, hazards/support, weapon-world contact, void/boss/add/clone paths, blade contact, and area damage. | TC-2 and TC-6 | Either wire current behavior with subject-specific scenarios/routes or label the backend reduced and prevent parity/certification claims. |
| The generated evidence catalog/dashboard can retain stale C32/C37 descriptions, and generated requirement/evidence JSON can escape current terminology checks. | TC-5 and TC-8 | Add the current translation/provenance boundary, preserve immutable source wording, and correct current mutable reporting without promoting partial work. |
| G7 deployment identity and the C38-C40 umbrella lack one consistently current roll-up despite bounded slice evidence. | TC-8 and TC-10 | Reconcile current receipts and remaining umbrella obligations; never treat a slice or deploy as C40 completion. |

The owner checkpoint may split one item into small sub-checkpoints if necessary,
but the TC-1 through TC-10 order and final review state machine remain unchanged.

## 5. TC-1 — Reconcile publication authority

**Goal:** All current authorities agree that Verdant is published in a six-stage,
60-wave campaign and Pale remains an unpublished preview.

**Non-goals:** No campaign redesign, Pale publication, deployment, wiki update,
or historical checkpoint rewrite.

**Primary files:** `config/campaign-publication-boundary.json`,
`src/gameplay/stages.ts`, `src/gameplay/run/ruleset-version.ts`,
`plans/TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md`,
`plans/TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN_REVISION_3.md`, their two checkpoint
ledgers, `plans/README.md`, `docs/README.md`,
`tests/campaign-publication-boundary.test.mjs`,
`tests/release-preflight.test.mjs`, and
`tests/unit/verdant-publication-boundary.test.ts`.

### Checklist

- [x] Add a current authority overlay to the active Verdant and Pale plans without rewriting historical checkpoint evidence.
- [x] Make the plan indexes route publication questions to the tracked publication boundary and current source.
- [x] Prove the two-view authority matrix: seven authored stages, exactly six published stages, and Pale as the one preview derive from the source-owned availability policy.
- [x] Add small negative tests for a dropped/reordered published stage, accidental Pale publication, and restoration of the obsolete “joint publication only” policy.
- [x] Confirm release preflight and game-reference publication use the same current policy.
- [x] Record implementation commit `83c0a0c306aa1adf00175118c18c357f2af6b872`; protected integration remains separately gated.

**Focused gate:** Run the existing campaign-publication, release-preflight,
game-reference publication, content-availability, and documentation-authority
tests. Do not deploy.

**Exit:** No active authority can instruct an agent to revert the current
six-stage policy, and Pale cannot enter published progression accidentally.

**Reopen when:** Published or preview stage membership, stage order, wave count,
ruleset identity, or release policy changes.

## 6. TC-2 — Correct Bloom backend honesty

**Goal:** `verdant-bloom-well-cycle` advertises only backends that execute Bloom
behavior specifically.

**Non-goals:** No second environment simulator, speculative headless feature, or
long lifecycle/endurance suite merely to preserve a metadata claim.

**Primary files:** `src/tearbench/canonical-scenarios.json`,
`src/tearbench/live-runtime-environment.ts`,
`src/tearbench/evidence-routes.json`,
`tests/browser-tearbench-live-materialize.js`,
`tests/browser-current-gameplay-scenarios.js`, and
`tests/unit/current-headless-gameplay-scenarios.test.ts`.

**Default correction:** Remove the unsupported `headless` declaration unless a
real product requirement justifies implementing subject-specific headless Bloom
execution now. Do not build a second environment simulator merely to retain a
metadata claim.

### Checklist

- [x] Add a fail-first test showing that generic headless reset/move/tick behavior cannot satisfy a Bloom backend declaration.
- [x] Choose and record the `live-only` disposition; genuine headless Bloom is unsupported and was not invented.
- [x] Remove only Bloom's false `headless` claim and preserve its live State Forge behavior.
- [x] Record the headless comparison item as not applicable to the chosen live-only disposition; the negative proves generic headless cannot substitute.
- [x] Bind the scenario and materializers to the source lifecycle horizon of 744 ticks so neither the former 760 overclaim nor 720 truncation can pass.
- [x] Make TearBench selected-evidence reporting identify the declared backend and reject empty, duplicated, unsupported, or ambiguous declarations.
- [x] Update the Bloom route and current diff-capability evidence to the live-only boundary.

**Focused gate:** Bloom runtime, current-game authority, and TearBench selection
tests. If the disposition is live-only, run the metadata negative and the one
Bloom browser journey; do not run the broader headless gameplay suite. Run the
focused headless scenario tests only if Bloom retains a headless claim.

**Exit:** A green Bloom result proves the declared backend behavior; no generic
headless smoke can produce a false parity claim.

**Reopen when:** Bloom behavior, environment codec, detached/headless composition,
or scenario backend metadata changes.

## 7. TC-3 — Attach environment invariants automatically

**Goal:** Every environment-field, environment-combat-object, and future
environment-route scenario runs the applicable structured environment invariants.

**Non-goals:** No exhaustive corruption matrix, duplicate invariant framework,
or new environment runtime.

**Primary files:** `src/tearbench/invariants.ts`,
`src/tearbench/runner.ts`, `src/tearbench/live-runtime-environment.ts`,
`src/tearbench/gameplay-causal-events.ts`,
`src/tearbench/canonical-scenarios.ts`,
`src/tearbench/canonical-scenarios.json`,
`tests/unit/tearbench-invariants.test.ts`,
`tests/unit/gameplay-causal-events.test.ts`, and the one selected browser
materializer at `tests/browser-tearbench-live-materialize.js`.

### Checklist

- [x] Define the source-owned subject-kind → invariant-set rule in one TearBench location.
- [x] Materialize canonical environment scenarios with finite-state, unique-ID, valid-reference, no-orphan-link, legal-transition, and boundedness checks.
- [x] Make browser/current-game execution consume the canonical materialized assertions instead of rebuilding a weaker scenario.
- [x] Add one small negative case each for duplicate ID, missing owner/target, illegal transition, and population bound.
- [x] Add a negative binding test proving that removing automatic environment-invariant attachment fails.
- [x] Confirm non-environment scenarios are unchanged and privileged invariants still fail closed when observations are missing.
- [x] Require every invariant used by a canonical scenario to have an executable checker; reject silent skipping of a registered-but-unimplemented invariant.
- [x] Replace the audited vacuous or tautological owner, isolation, branch-equivalence, wave, softlock, boss-phase, focus, and finite-state checks with source-backed discriminators or explicit unsupported dispositions.
- [x] Preserve native causal events through the ordinary TearBench session, fail closed on unknown event mappings, and distinguish engine-native from bridge-derived provenance.
- [x] Avoid a large corruption matrix; one minimal discriminator per invariant family is sufficient.

**Focused gate:** TearBench invariant, canonical-scenario, validation,
current-game authority, and current gameplay browser tests after rebuilding the
test standalone target.

**Exit:** Removing or bypassing any required environment invariant makes the
focused gate fail.

**Reopen when:** A new environment subject kind, state, reference, or transition
is added.

## 8. TC-4 — Extend the Rootbound live regression

**Goal:** Browser evidence proves the actual post-destruction Phase-II polling
path that `9e7d6a7` fixed.

**Non-goals:** No full Rootbound campaign, long boss endurance run, phase redesign,
or unrelated boss refactor.

**Primary files:** `src/gameplay/environment/graft-anchor.ts`,
`src/gameplay/entities/enemy-types/rootbound.ts`,
`src/app/live-rootbound-wiring.ts`,
`tests/unit/graft-anchor.test.ts`,
`tests/unit/rootbound-phase-two.test.ts`, and
`tests/browser-current-gameplay-scenarios.js`.

### Checklist

- [x] Add the repeated-poll browser step first and prove it fails against a temporary local regression that permits a terminal Graft to be reinstalled or mutated.
- [x] Keep Rootbound active in Phase II after the Mercy Graft is destroyed.
- [x] Advance at least two bounded live production polls after destruction; do not manually clean the Graft before these assertions.
- [x] Assert no exception and exactly one stable Graft ID.
- [x] Assert terminal state/tick remain stable and no replacement Graft appears.
- [x] Assert no duplicate create/effect/score/enemy-defeated facts.
- [x] Retain the later terminal cleanup assertion as a separate lifecycle fact.

**Focused gate:** Graft Anchor and Rootbound Phase-II unit tests, followed by the
single selected current-game browser journey.

**Exit:** The browser proof fails if repeated live polling reinstalls or mutates
a terminal Graft.

**Reopen when:** Rootbound Phase II, Graft installation/discovery, environment
cleanup, or boss polling changes.

## 9. TC-5 — Add source-derived content terminology authority

**Goal:** TearBench automatically agrees with current game vocabulary and
ownership without duplicating it in a hand-maintained glossary.

**Non-goals:** No historical wording rewrite, second content registry, narrative
rename, or removal of required compatibility aliases.

**Primary files:** `src/gameplay/stages.ts`,
`src/gameplay/run/boss-definitions.ts`,
`src/gameplay/environment/environment-definitions.ts`,
`src/gameplay/environment/stage-environment-definitions.ts`,
`config/campaign-publication-boundary.json`,
`config/terminology-registry.json`, `scripts/check-terminology.mjs`,
`src/tearbench/canonical-scenarios.ts`,
`src/tearbench/canonical-scenarios.json`,
`tests/terminology-checkers.test.mjs`,
`tests/unit/current-boss-observation-authority.test.ts`, and
`tests/unit/content-availability.test.ts`.

### Checklist

- [x] Derive stage IDs/display names, boss IDs/home stages, published/preview state, environment mechanic identities, and canonical scenario subjects from their production owners.
- [x] Preserve the existing product rename registry for compatibility aliases; do not overload it with a duplicate gameplay catalog.
- [x] Apply the current translation layer to mutable generated requirement/evidence descriptions, while keeping the immutable v0.6 source and hash-bound historical records unchanged.
- [x] Add one minimal source-owner mutation for stage/display, boss/home, environment mechanic, publication state, and scenario subject coverage.
- [x] Prove `tear` → `The Tear` → `source`, Verdant → Rootbound, and Pale → White Hart through source-derived assertions.
- [x] Prove preview/canonical implementation language is distinct: White Hart is canonical while Pale publication remains gated.
- [x] Reject stale provisional definition symbols and stale current-facing checkpoint comments.
- [x] Scan current mutable documentation and TearBench descriptions while excluding immutable source/checkpoint history through explicit policy.

**Focused gate:** Terminology checker/tests, current-game authority tests, boss
observation authority, content availability, and documentation authority.

**Exit:** A production rename or ownership change fails until TearBench
projections, descriptions, routes, and mutable documentation change together.

**Reopen when:** A stage, boss, mechanic, publication label, product surface, or
canonical scenario subject is renamed or moved.

## 10. TC-6 — Add explicit specialized route ownership

**Goal:** Shared runtime/composition changes that can affect Verdant or Pale
select the specialized evidence capable of detecting that impact.

**Non-goals:** No every-suite fallback, blanket all-browser execution, duplicated
route registry, or weakening of conservative shared-runtime fallback.

**Primary files:** `src/tearbench/evidence-routes.json`,
`scripts/tearbench.mjs`, `tests/tearbench-evidence-selection.test.mjs`,
`src/tearbench/production-combat-phases.ts`,
`src/tearbench/production-replay-composition.ts`, and
`src/tearbench/production-headless-environment.ts`.

### Checklist

- [x] Inventory only source files that can materially affect environment, biome wiring, boss ownership, scenario materialization, or publication policy.
- [x] Map each such owner to an explicit route; retain `shared-runtime` as conservative fallback, not specialized proof.
- [x] Route gameplay-relevant replay/headless composition hooks—abilities, hazards/support, weapon-world contact, void/boss/add/clone paths, blade contact, and area damage—to subject-specific evidence or an explicit reduced-backend disposition.
- [x] Add representative negative selector fixtures for environment composition, Rootbound wiring, Pale route wiring, stage availability, and scenario materialization.
- [x] Preserve mixed recognized/unmapped and documentation-plus-unmapped diff regressions so unknown files cannot disappear beside a recognized route.
- [x] Fail closed when a file matches a specialized owner but the specialized route/scenario is absent.
- [x] Keep route commands deduplicated and focused; do not select every browser suite for every shared file.
- [x] Ensure protected-history selection still uses the complete intended change range.

**Focused gate:** `pnpm test:tearbench-selection` plus one dry selected-evidence
inspection for each new route family. Execute browser commands only when their
owning family changed.

**Exit:** Representative mutations cannot fall through to generic evidence alone.

**Reopen when:** A shared composition owner moves, a new biome/runtime owner is
added, or selector fallback behavior changes.

## 11. TC-7 — Make capability reporting explicitly diff-scoped

**Goal:** A narrow selected-evidence run cannot be read as a cumulative statement
that all TearBench or Ghost 3 capabilities are current.

**Non-goals:** No cumulative capability dashboard, C40 substitute, artifact
backfill, or reuse of stale evidence under a new name.

**Primary files:** `scripts/tearbench.mjs`,
`tests/tearbench-evidence-selection.test.mjs`,
`src/tearbench/release-certification.ts`,
`tests/unit/tearbench-release-certification.test.ts`,
`scripts/validate-artifact-disposition.mjs`,
`tests/artifact-disposition.test.mjs`,
`docs/TEARBENCH_GHOST3_PROGRAM.md`, and
`docs/TEARBENCH_CURRENT_GAME_ALIGNMENT_AND_SYNC_PLAN.md`.

### Checklist

- [x] Rename or version the generated report so “diff capability” is explicit in filename, format, scope, and documentation.
- [x] Preserve exact source revision, clean/dirty state, source fingerprint, changed files, routes, scenarios, builds, and executions.
- [x] State that the report is last-run/last-writer evidence and is not cumulative certification.
- [x] Migrate existing consumers atomically or provide a narrow compatibility read; never reinterpret an old artifact as a new schema.
- [x] Keep cumulative release truth exclusively in release certification/C40 artifacts.
- [x] Add a negative test where a narrow passing run cannot satisfy a broader requested scope.
- [x] Add a same-source/different-diff-scope negative so revision/fingerprint equality cannot authorize wrong-scope reuse.

**Focused gate:** TearBench selection/current capability tests, artifact
disposition tests, docs checks, and release-certificate verifier tests.

**Exit:** The narrow report is impossible to mistake programmatically or in
current documentation for whole-product completion.

**Reopen when:** Capability schema, artifact path, scope semantics, or release
certificate consumption changes.

## 12. TC-8 — Reconcile current program documentation

**Goal:** The master handoff, program charter, alignment plan, plan indexes,
deployment identity, and C40 status describe the same current state.

**Non-goals:** No runtime fix by prose, external repository edit, deployment,
music re-vendoring, wiki publication, or optimistic dashboard promotion.

**Primary files:** `plans/TEARBENCH_MASTER_HANDOFF.md`,
`docs/TEARBENCH_GHOST3_PROGRAM.md`,
`docs/TEARBENCH_CURRENT_GAME_ALIGNMENT_AND_SYNC_PLAN.md`,
`plans/README.md`, `docs/README.md`,
`plans/TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md`,
`docs/TEARBENCH_GHOST3_CAPABILITY_DASHBOARD.md`,
`docs/tearbench-ghost3-evidence-catalog.json`,
`scripts/check-docs.mjs`, and `tests/docs-authority-checker.test.mjs`.

### Checklist

- [x] Add a semantic documentation negative that mutates one governed baseline, publication, deployment, diff-scope, or C40 statement and proves the authority check fails.
- [x] Update the reconciled baseline to the exact protected commit actually reviewed.
- [x] Record the current successful Validate and production deployment receipts without converting them into C40 evidence.
- [x] Mark prior “integration/deployment unperformed” statements as historical to their checkpoint rather than present truth.
- [x] Route current correction work to this temporary plan before broader C21-C40 development.
- [x] Describe generated current capability evidence as diff-scoped after TC-7.
- [x] Keep C25/C27/C30-C40 status conservative and source-backed.
- [x] Reconcile C32 catalog treatment, the partial normal-build C37 surface, and one C38-C40 umbrella roll-up without turning slice evidence into milestone completion.
- [x] Reconcile the G7/current-production receipt in `plans/TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md` and quarantine or regenerate any stale local build identity rather than citing it as current.
- [x] Reconcile the capability dashboard/evidence catalog only where current evidence supports a state change; do not regenerate immutable source intent casually.
- [x] Update this plan and the handoff together after each correction checkpoint.

**Focused gate:** `pnpm check:docs`, `pnpm test:docs`,
`pnpm requirements:check`, and `pnpm check:terminology`.

**Exit:** No current authority cites `a8a476c` as the present protected baseline,
calls the verified deployment unperformed, treats diff evidence as cumulative,
or claims C40 completion.

**Reopen when:** Protected main, deployment identity, checkpoint state, active
plan set, or release evidence changes.

## 13. TC-9 — Promote Pale preview journeys to canonical scenarios

**Goal:** Before Pale publication, its essential mechanics run through canonical,
seeded TearBench scenarios with structured observations.

**Non-goals:** No Pale publication, campaign insertion, second Pale runtime,
unsupported headless claim, or replacement of complementary presentation journeys.

**Primary files:** `src/tearbench/pale-state-forge-scenarios.ts`,
`src/tearbench/pale-stage-engineering-scenario.ts`,
`src/tearbench/canonical-scenarios.ts`,
`src/tearbench/canonical-scenarios.json`,
`src/tearbench/evidence-routes.json`,
`tests/unit/pale-state-forge-scenarios.test.ts`,
`tests/unit/pale-variant-selection.test.ts`,
`tests/browser-pale-rimehound.js`, `tests/browser-pale-variants.js`, and
`tests/browser-pale-white-hart-phases.js`.

### Checklist

- [x] Add a negative catalog/selector case proving an ad hoc test-hook journey without a canonical seeded scenario cannot satisfy Pale coverage, and reject false backend or publication tags.
- [x] Add canonical Scenario Console scenarios for Aurora/Rimehound behavior and explicit Pale variant selection.
- [x] Reuse current production definitions and Pale State Forge factories; do not create a second Pale runtime.
- [x] Record explicit seed, state class, subject, start contract, backends, assertions, and preview/engineering tags.
- [x] Make `pnpm tearbench run` execute each scenario without relying solely on ad hoc Playground preparation.
- [x] Keep White Hart canonical and explicitly unpublished; remove ambiguous “provisional implementation” language without publishing it.
- [x] Claim live, headless, replay, or seek only where that backend executes the subject specifically.
- [x] Preserve focused browser presentation journeys as complementary visual evidence, not the canonical scenario itself.

**Focused gate:** Pale State Forge, Aurora, Rimehound, variant, White Hart,
canonical scenario, selector, and the newly selected narrow browser journeys.

**Exit:** Every Pale mechanic required for future publication has deterministic
canonical execution, or publication remains mechanically blocked with the missing
scenario named.

**Reopen when:** Pale availability, Aurora routes, Rimehound/variant behavior,
White Hart phases, or intended publication scope changes.

## 14. TC-10 — Exact-commit post-review and C40 truth

**Goal:** Detect remaining gaps before any completion statement and record the
real C40 result only after TC-1 through TC-9 are complete.

**Non-goals:** No waiver of an unresolved finding, no certification from a
focused subset, no deployment, and no C40 completion claim without a passing
full certificate.

**Primary files:** `plans/TEARBENCH_C40_EXECUTION_GUIDE.md`,
`docs/checkpoints/C40_RELEASE_EVIDENCE_MANIFEST.md`,
`scripts/tearbench-release-evidence-verifier.mjs`,
`tests/tearbench-release-evidence-verifier.test.mjs`,
`src/tearbench/release-certification.ts`,
`docs/checkpoints/tearbench-current-corrections/` for TC-1 through TC-10 evidence,
and this plan's no-drift table.

### Checklist

- [ ] Re-resolve current protected `origin/main`; record source SHA, clean state, fingerprint, and intended diff.
- [ ] Verify every prior checkpoint checkbox against implementation and fresh evidence rather than prose.
- [ ] Run the focused correction gates first and fix any owner-specific failure.
- [ ] Run `pnpm check` once on the exact final intended clean commit.
- [ ] Run the current C40 release-certificate command from the C40 execution guide only after the repository gate passes.
- [ ] Verify certificate source/build/artifact identity and every required current-game correction input.
- [ ] Treat any unresolved reduced C29/C30 gameplay path, invariant/event-provenance defect, stale dashboard claim, or umbrella-status gap listed above as a named blocker rather than silently excluding it.
- [ ] If broader C40 requirements remain incomplete, record the exact blockers and keep C40 incomplete; this correction plan cannot waive them.
- [ ] Perform an independent adversarial post-review of the final diff, artifacts, claims, and plan states.
- [ ] Reopen the owning checkpoint for every finding; create a numbered corrective sub-checkpoint only when the finding does not fit an existing owner.
- [ ] After every corrective change, treat the prior SHA, full gate, artifact identity, and certificate as invalid; re-resolve the exact clean source, rerun focused evidence, rerun `pnpm check`, rerun the C40 certificate command, and repeat post-review.

**Exit:** All correction-scope findings are closed on the exact reviewed source.
C40 is marked complete only if the actual end-to-end certificate passes every
program requirement; otherwise its truthful remaining delta is recorded.

### Final review state machine

1. `OPEN` → checkpoint implementation and focused evidence may proceed.
2. `IN REVIEW` → every checklist item is rechecked against current source and fresh evidence.
3. Any unresolved in-scope finding at any severity → `REOPENED`; return to its owning checkpoint, remove any completion claim, and invalidate the prior exact-source gate and certificate.
4. After the correction, restart at source identity capture, then rerun focused evidence, `pnpm check`, the C40 certificate command, artifact-identity validation, and independent post-review on the new exact commit.
5. An out-of-scope C40 requirement is recorded separately with its owner and evidence; it cannot be silently accepted or used to fail a completed correction that did not claim it.
6. Zero unresolved in-scope findings plus the exact clean gate → `CORRECTION COMPLETE`.
7. `C40 CERTIFIED` is a separate state available only when the full certificate passes all program requirements.

## 15. No-drift checkpoint record

Update this table in the same change that closes a checkpoint. A checkbox or
commit alone is insufficient.

| Checkpoint | Source commit | Focused evidence | Browser/backend evidence | Post-review | State |
| --- | --- | --- | --- | --- | --- |
| TC-1 | `83c0a0c306aa1adf00175118c18c357f2af6b872` (implementation; local, not protected integration) | `docs/checkpoints/tearbench-current-corrections/TC-1_PUBLICATION_AUTHORITY.md`; focused publication, release-preflight, game-reference, content-availability, Verdant, docs, and terminology checks | N/A | Final focused review green; historical evidence preserved; no protected integration claimed | Complete |
| TC-2 | `29a2460be71003416a8a73ad4e36b4ad2e617309` (implementation; local, not protected integration) | `docs/checkpoints/tearbench-current-corrections/TC-2_BLOOM_BACKEND_HONESTY.md`; 36 focused typed tests, 28 selector tests, typecheck, docs, and terminology gates | Clean-commit Class-A journey passed all 13 source-owned scenarios at build fingerprint `9d9bffd9b423d3a5d3cb4e11b34f328a9aa1d7daf45d0c333d9ce37d1585d2c4` | Final focused review green; no headless Bloom or protected integration claimed | Complete |
| TC-3 | `1bb873e1cecdf1682d71a3134b7f8d5adc4683af` + `7a0c3e700c74cd2652822c62c9778c6daf043bd3` (implementation; local, not protected integration) | `docs/checkpoints/tearbench-current-corrections/TC-3_ENVIRONMENT_INVARIANT_BINDING.md`; 65 focused tests, typecheck, syntax, and diff gates | Clean-commit Class-A journey passed 13 source-owned scenarios at build fingerprint `0c124bdceb1710d2f41173836fed7772354b463a8eab6236e74dd8ae57225294`; full 744-tick Bloom materialization passed | Independent review found three blockers; all were corrected and the re-review passed; no protected integration claimed | Complete |
| TC-4 | `ddc5a23f2b09249659dc62882410384927d4634d` (implementation; local, not protected integration) | `docs/checkpoints/tearbench-current-corrections/TC-4_ROOTBOUND_REPEATED_POLL.md`; 25 focused tests, typecheck, syntax, and diff gates | Clean-commit Class-A journey passed all 13 source-owned scenarios at build fingerprint `fd9cbb18e770994cbb566c4e5ad37c5f4d7a280d6772642e08330886fbbbb470` | Temporary terminal-reinstall mutation failed on the first poll; lead acceptance review green; no protected integration claimed | Complete |
| TC-5 | `86041ed71c593bfee2a232a93a7f2d44874c7df7` + `60d1e58b92ad3258e9327830870b81486ebf1f18` (implementation; local, not protected integration) | `docs/checkpoints/tearbench-current-corrections/TC-5_SOURCE_DERIVED_CONTENT_TERMINOLOGY.md`; requirements generation/check, 14 terminology tests, 23 content/authority tests, 13 docs tests, typecheck, syntax, and diff gates | N/A | Initial independent review found four blockers; corrected exact-commit re-review passed; generated immutable identities retained; no protected integration claimed | Complete |
| TC-6 | `0473e3d85e833474112e81b81715371b29e764ec` + `244db27` (implementation; local, not protected integration) | `docs/checkpoints/tearbench-current-corrections/TC-6_SPECIALIZED_EVIDENCE_ROUTE_OWNERSHIP.md`; 32 selector tests, 7 TypeScript projection/certification tests, focused hook-family negatives, typecheck, syntax, docs, terminology, and diff gates | Selected/dry route-family inspection only; no owning gameplay family changed | Initial review found fail-closed and hook-family audit gaps; corrected exact-commit re-review passed; no protected integration claimed | Complete |
| TC-7 | `7ec9509e6427c1498abc99d543306f0959ff12dc` + `244db27` + `96ad620` (implementation; local, not protected integration) | `docs/checkpoints/tearbench-current-corrections/TC-7_DIFF_SCOPED_CAPABILITY_REPORTING.md`; selector/report/reuse negatives, 7 TypeScript projection/certification tests, typecheck, syntax, docs, terminology, and diff gates | N/A | Narrow-versus-broad, worktree, route-digest, legacy-format, and same-source/different-scope reuse negatives passed; exact-commit re-review passed; no protected integration claimed | Complete |
| TC-8 | `52cb587d1ac2266f0e5549fcea3fa1d1dcac0fdf` (implementation; local, not protected integration) | `docs/checkpoints/tearbench-current-corrections/TC-8_PROGRAM_DOCUMENT_RECONCILIATION.md`; 15 docs authority tests, docs, requirements, terminology, syntax, and diff gates | N/A | Exact receipt chain and conservative current-state semantics independently reviewed green; production attributable, G7 open, C40 incomplete; no protected integration claimed | Complete |
| TC-9 | `3f5787047892a1df48cfdbbed36919ca6e4c546f` (implementation; local, not protected integration) | `docs/checkpoints/tearbench-current-corrections/TC-9_CANONICAL_PALE_PREVIEW_SCENARIOS.md`; 46 Pale unit tests, 14 runner tests, 35 selector tests, 5 snapshot tests, typecheck, syntax, and diff gates | Ten canonical per-ID live State Forge runs passed with exact horizons and zero failures; Rimehound, variant, and White Hart browser journeys passed as complementary evidence | Multiple fail-closed and provenance blockers were corrected; final exact-commit re-review passed; Pale remains unpublished and no protected integration is claimed | Complete |
| TC-10 | — | `pnpm check` | Required by certificate | — | Not started |

## 16. Agent handoff contract

Every implementation handoff must state:

- checkpoint and exact objective;
- source/worktree/branch and owned paths;
- fail-first evidence and why it discriminates the defect;
- changed files and compatibility decisions;
- commands run with passed/failed/skipped status;
- backend and execution class actually proved;
- remaining risks and reopen triggers;
- merge, deployment, publication, wiki, music, and C40 status.

Use Luna subagents only for distinct, independently useful work. Each child needs
one purpose, one owner, an explicit scope, and required evidence. Use fewer agents
when fewer are efficient; never create duplicate reviews or multiple writers for
the same path merely because capacity exists.

## 17. Immediate next action

Begin TC-1 in a new isolated worktree. Do not start TC-2 or broader Ghost 3
development until the active publication authorities can no longer contradict
the protected six-stage game.
