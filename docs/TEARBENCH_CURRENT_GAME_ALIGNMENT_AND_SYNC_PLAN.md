# TearBench current-game alignment and permanent synchronization plan

- **Document role:** implementation directive supporting the existing TearBench program charter and completion authorities; this document does not create an eighth governed active plan.
- **Owner:** TearBench and current-game integration owner.
- **Baseline:** protected game `main` at `a8a476c6171d913581c01bb0e4432f53cf44f9e4`, audited 2026-08-25. Re-resolve current `origin/main` before every implementation slice; this historical SHA is not a future target.
- **Scope:** the Tear game repository, its typed game runtime, TearBench, replay/headless execution, game-owned player surfaces, evidence routing, documentation, and existing required checks.
- **Success condition:** TearBench executes and observes the current game truthfully, and every relevant future game change updates or invalidates its corresponding TearBench evidence in the same reviewed change.
- **Post-review status:** The original checklist was marked complete prematurely. Corrective checkpoints `TB-R0` through `TB-R5` have passed their focused proofs; `TB-R6` remains the acceptance authority until independent review and the final clean-source repository gate pass.
- **Non-goals:** a second simulator, engine migration, another repository, external deployment, a new test framework, speculative abstractions, bulk historical rewrites, or long-running tests during ordinary development.

## 1. Read this before touching code

1. Start from current protected `origin/main` in one isolated `codex/*` worktree. Preserve unrelated changes and user-owned files in the canonical checkout.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md), [the program charter](TEARBENCH_GHOST3_PROGRAM.md), [the completion plan](../plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md), [the execution guide](../plans/TEARBENCH_C40_EXECUTION_GUIDE.md), [the terminology registry](../config/terminology-registry.json), and the specific source/test files named by the next checkpoint.
3. Treat the current typed game implementation as behavioral truth. The preserved July 2026 specification remains historical product intent; it cannot override today's roster, mechanics, naming, or runtime contracts.
4. Implement the first incomplete checkpoint below. Do not jump ahead to policy training, publication, or certification while its runtime prerequisites are false.
5. Write or update the smallest permanent test that fails for the real defect, make the smallest coherent production change, then re-run that test.
6. Run only the checkpoint's focused checks while iterating. Use the full repository gate only at the explicitly stated integration boundary.
7. Check a box only when its implementation and stated evidence both exist. Record actual limitations; a fixture, metadata string, or green unrelated test is not product behavior.
8. Update this plan's checkpoint state and the existing authoritative handoff together whenever implementation changes the actual program position.

### Authority and compatibility

- Current gameplay truth: `src/gameplay/`, `src/simulation/`, `src/domain/`, the app composition, and their existing source-owned catalogs.
- Runtime/evidence truth: the actual live, replay, and headless implementations plus evidence produced from the exact executed artifact.
- Current naming truth: `config/terminology-registry.json`.
- Historical intent: the immutable v0.6 source and generated requirement identities; add a narrow current-game interpretation layer instead of silently rewriting history.
- Existing C21-C40 numbering remains authoritative for the larger product program. `TB-S0` through `TB-S12` below are alignment prerequisites and do not close or renumber those checkpoints.
- Never rename TearBench. Keep hash-bound schemas, replay/save readers, intentional internal compatibility IDs, and genuine in-game narrative text intact.
- Do not edit the game-reference export preflight merely to accommodate a dirty checkout; perform implementation in a clean isolated worktree and respect its existing publication boundary.

### Cross-repository synchronization boundaries

- The Tear Wiki consumes an authorized game-reference export from protected, merged game `main`. An unmerged feature-worktree reference is not publishable; wiki edits, publication, and protected integration each require their own explicit authorization.
- The game consumes a reviewed, hash-verified Adaptive Soundtrack release pinned to music commit `7662fc95769d2ed022593c10f308ec10f054edfc`. As checked on 2026-08-25, the local music repository is at `a03c9b9310b3d98d6a46999064dda6d97ee7c831`, five commits newer. This is approved pinned-release provenance, not automatic latest-music-head synchronization.
- Advancing the soundtrack pin requires a separately authorized music release and explicit game re-vendoring with its provenance and audio gates. Current `public/vendor/tear-music/` changes select soundtrack evidence; historical soundtrack-vendor paths remain intentional compatibility, not current product naming.

### Current product vocabulary

Use these exact current player-facing names:

| Surface or product | Canonical name |
| --- | --- |
| Deterministic testing and evidence | TearBench |
| Scenario authoring and controlled state launch | Scenario Console |
| Replay editing | Replay Editor |
| Replay navigation and local tools | Replay Hub |
| Policy and evaluation | Game Agent |
| Live policy monitoring | Run Monitor |
| Training corpus, custody, and consent | Training Archive |
| Scheduling and governed agent training | Training Operations |
| Soundtrack authoring product | Soundtrack Desk |
| Music product and in-game soundtrack | TEAR Music / Adaptive Soundtrack |

The only active weapon IDs are `sword`, `hammer`, `greatsword`, `chainblade`, and `riftlock`. The preserved save/import migrations are `spear -> greatsword` and `ringblade -> riftlock`; retired IDs are not active scenarios or replay outputs.

## 2. Verified starting defects

These are implementation facts from the baseline audit, not assumptions or permission to repeat large investigations:

| Area | Verified defect | Required outcome |
| --- | --- | --- |
| Current-game authority | The historical requirement source and old completion documents omit Greatsword, Chainblade, Riftlock, and the current product names. | Current game definitions and names drive active coverage; preserved historical intent remains readable. |
| Scenario catalog | All 13 catalog entries resolve to the same Sword/campaign opening, use a surgical state class, and include a stage rejected by both natural-opening backends. | Every named scenario launches through its declared backend and exercises its named subject. |
| Scenario tests | Fixture execution ignores its scenario, so repeated passing hashes do not prove actual game behavior. | At least one source-owned backend executes each relevant scenario for real. |
| Detached combat | Gameplay hooks for abilities, hazards, support, boss behavior, blade contact, projectile flushing, and area damage are missing or stubbed. | Claimed gameplay parity is real, or the capability explicitly refuses an unsupported mechanic. |
| Observations | Live and headless disagree on stages, actions, diagnostics, and support/void enemy identity. | Shared source-owned projections agree wherever the execution class claims support. |
| Invariants | Several checks always pass or cannot observe their claimed condition; valid Warden phase 1 currently fails. | Every advertised check can fail a meaningful negative and accepts healthy current gameplay. |
| Causal evidence | Native `run.started` and `enemy.spawned` facts are retained privately but omitted from normal session step results. | Normal sessions retain the actual ordered gameplay events and their honest provenance. |
| Validation | Unknown stages, malformed stages, unknown bosses, and phases without bosses are accepted. | Hostile or obsolete game references fail before execution. |
| Progression | The synthetic ledger awards 1 coin for wave 1 while current gameplay awards 10 before modifiers. | Current production scoring, economy, rewards, and legal progression own all synthesized results. |
| Player surfaces | Game Agent Evidence lacks a report binding; Run Monitor is simultaneously available/unavailable and its route loops. | Normal-player routes and availability match actual behavior. |
| Evidence selection | Listed browser-proof commands are treated as metadata; important current-player journeys are outside the default relevant gate. | Selected evidence runs the actual claimed scenario/journey and records its artifact. |
| Documentation | Handoffs, dashboard, evidence catalog, release status, and terminology counts are stale or incomplete. | Current status is dated, source-bound, accurately named, and never overclaims certification. |
| Build identity | Some local bundles are behind `main`; runtime provenance can say `working-tree` instead of identifying the executed build. | Evidence binds to the actual served artifact, source identity, and clean/dirty state. |

## 3. Delivery rules that prevent over-engineering

- Extend existing typed modules, catalogs, ports, scenario registry, selectors, and package scripts. Do not create a parallel harness, duplicate game catalog, broad plugin layer, daemon, or service.
- Prefer a small pure helper shared by live/headless adapters over a new framework. Prefer an existing game-reference collector over a separately maintained content inventory.
- Keep one gameplay defect, one permanent reproducer, and one coherent fix per implementation slice.
- Usually prove deterministic behavior with the same seed twice. Add a different seed only when the changed behavior depends on randomness.
- Use a short opening or the smallest lawful scenario launch; do not play 50 waves, enumerate 10,000 synthetic states, or repeat every scenario 100 times for a local fix.
- Do not run browser, target, controller, viewport, network, endurance, or cross-version matrices unless that slice changes the corresponding boundary.
- Use one normal-build player journey for a player-surface change and one privileged test-build journey only when inspecting an explicitly privileged capability.
- Existing nightly/weekly endurance remains scheduled coverage. It is not a per-commit development prerequisite and does not replace focused current-game proofs.
- Release checks remain mandatory at the final integration boundary; focused checks never become a release claim.
- Preserve intentional compatibility; remove an alias only after its recorded owner, migration evidence, and retirement condition are actually satisfied.

## 4. Checkpoint TB-S0 - Re-establish truthful baseline

**Purpose:** Every following change starts from the current game, a known worktree, and an honest feature/checkpoint inventory.

**Primary files:** `docs/TEARBENCH_GHOST3_PROGRAM.md`, the existing completion/handoff plans, `docs/checkpoints/`, `package.json`, and the release artifact metadata helpers.

- [x] Resolve current `origin/main`, current worktree `HEAD`, current artifact identity, and existing user-owned changes without deleting or hiding anything.
- [x] Record the actual C28-C40 position: C28 complete against its gate; C29 complete only against its narrow gate; C30/C31 active; C32 closed against its named gate; C33-C35 active; C36 open; C37 partial; C38/C39 bounded partial slices; C40 verifier-only.
- [x] Explicitly identify which existing local builds match the checked-out revision; do not trust a stale `dist` directory.
- [x] Mark the old scenario catalog, player availability, progression model, event pipeline, and detached parity claims as unverified until their alignment checkpoints pass.
- [x] Record the next unfinished `TB-S*` checkpoint in the existing handoff without changing immutable evidence or inventing completion.

**Minimum proof:** Git identity/status, artifact metadata comparison, and a concise checkpoint reconciliation. No application build, browser matrix, or full test suite for this documentation/baseline slice.

**Exit:** A successor can identify today's game, truthful checkpoint state, next task, and known limitations without interpreting historical prose as current behavior.

## 5. Checkpoint TB-S1 - One current-game source of truth

**Purpose:** TearBench derives current content from the same typed sources as the game.

**Primary files:** `src/gameplay/weapon-selection.ts`, `src/gameplay/stages.ts`, `src/gameplay/run/boss-definitions.ts`, `src/gameplay/run/mode-catalog.ts`, `src/gameplay/run/difficulty-catalog.ts`, `src/gameplay/upgrades.ts`, `src/tearbench/registries.ts`, and the existing game-reference source collectors.

- [x] Identify the existing production owners of weapon, stage, boss, mode, difficulty, upgrade, enemy, and supported action definitions.
- [x] Replace duplicated TearBench content assumptions with direct imports, existing typed adapters, or a small shared pure projection from those owners.
- [x] Require every active game weapon to have a registered TearBench coverage mapping; derive the expected IDs from `WEAPON_IDS`, not a second handwritten list.
- [x] Derive valid current stages, bosses, modes, difficulties, and supported enemy identity from production definitions.
- [x] Preserve the existing save/import migration map without allowing retired weapons in canonical scenarios or replay writes.
- [x] Add a compact current-game overlay for historical requirements only where current terminology/content changes how an old requirement must be implemented; do not duplicate 8,691 entries.
- [x] Make an added production weapon, boss, stage, or relevant event fail its focused source-to-TearBench contract until coverage is explicitly supplied.

**Minimum proof:** `pnpm check:active-roster` plus one targeted Vitest file proving current source IDs are covered and an injected missing ID is rejected.

**Exit:** TearBench cannot silently retain an old roster or accept removed/unknown content as current truth.

## 6. Checkpoint TB-S2 - Make canonical scenarios actually executable

**Purpose:** A scenario's name, state, backend, actions, and assertions describe the real thing that runs.

**Primary files:** `src/tearbench/canonical-scenarios.json`, `src/tearbench/canonical-scenarios.ts`, `src/tearbench/scenario-registry.ts`, `src/tearbench/live-runtime-environment.ts`, `src/tearbench/production-headless-environment.ts`, `src/tearbench/runner.ts`, and `tests/unit/tearbench-runner.test.ts`.

- [x] Give each scenario its own explicit typed subject, compatible start state, expected weapon, and execution capability.
- [x] Use `recorded-canonical` without an explicit stage for a natural live/headless opening.
- [x] Route an exact stage, wave, boss phase, or other surgical state through the existing Scenario Console state-launch boundary rather than ordinary natural reset.
- [x] Ensure boss scenarios select a valid boss in a compatible mode and weapon scenarios select the weapon named by their scenario ID.
- [x] Prove every canonical scenario validates and at least one allowed real backend can reset it; remove the current 0/13 executable condition.
- [x] Replace scenario-ignoring fixture coverage with focused source-owned backend execution; retain fixtures only for isolated runner mechanics.
- [x] Assert one meaningful subject-specific outcome: projectile spawned, contact resolved, ability transition, boss transition, draft return, or the relevant visible route.
- [x] Keep each scenario's fixed-tick horizon close to its first meaningful result; do not introduce long full-run defaults.

**Minimum proof:** `pnpm exec vitest run tests/unit/tearbench-runner.test.ts tests/unit/production-headless-environment.test.ts`, plus one selected short real-runtime scenario for the changed family.

**Exit:** All current scenarios have honest subjects and legal launch routes; adding a catalog entry that cannot execute fails immediately.

## 7. Checkpoint TB-S3 - Validate current content and unify observations

**Purpose:** Invalid states fail early and live/headless observations speak the same current-game language.

**Primary files:** `src/tearbench/validation.ts`, `src/tearbench/live-runtime-environment.ts`, `src/tearbench/production-headless-environment.ts`, `src/tearbench/live-observation-actors.ts`, current boss/stage catalogs, and `tests/unit/tearbench-contracts.test.ts`.

- [x] Reject nonexistent stages, non-string stage IDs, nonexistent bosses, invalid boss phases, phase-without-boss, and incompatible mode/boss combinations.
- [x] Source legal boss phase ordinals from production encounter behavior; never compare them with health-threshold fractions.
- [x] Reuse a small shared observation projection for stage identity, supported semantic actions, enemy kind, ownership, and available diagnostics.
- [x] Translate support subtypes and void wisps to their actual canonical game identities in both backends.
- [x] Expose truthful wave lifecycle, UI focus, progress, and entity ownership fields only when the execution class actually supports them.
- [x] Mark unsupported observations explicitly; never manufacture placeholder values that cause an invariant to pass.
- [x] Preserve capability boundaries: structured access is not pixel-only certification.

**Minimum proof:** `pnpm exec vitest run tests/unit/tearbench-contracts.test.ts tests/unit/production-headless-environment.test.ts`, including one malformed-stage case, one invalid-boss case, one support enemy, and one void-wisp translation.

**Exit:** Current supported backends agree on the meaning of their shared observations, and malformed content is rejected before simulation.

## 8. Checkpoint TB-S4 - Make every invariant capable of failing

**Purpose:** An advertised protection detects a real defect and accepts a healthy current run.

**Primary files:** `src/tearbench/invariants.ts`, `src/tearbench/registries.ts`, the shared observation projection, and `tests/unit/tearbench-runner.test.ts`.

- [x] Replace unconditional success for production isolation with an actual applicable check or remove it from scenario assertions and rely on the dedicated isolation gate.
- [x] Fail closed when a scenario requests an invariant with no registered implementation.
- [x] Implement or explicitly reject branch-equivalence assertions where the required comparison inputs are absent.
- [x] Compare boss phase ordinals against actual valid ordinals; retain a healthy Warden phase-1 reproducer.
- [x] Track real last-progress state so a stalled runtime fails and a progressing run passes.
- [x] Obtain independent authoritative wave completion and living-wave ownership instead of deriving both from the same enemy list.
- [x] Evaluate real UI focus and entity ownership when those fields exist; otherwise reject an incompatible assertion for that execution class.
- [x] Cover relevant finite entity/projectile numerics where the observation actually exposes them.
- [x] Add one positive and one negative example per changed invariant; no exhaustive synthetic mutation framework.

**Minimum proof:** One compact invariant-focused Vitest file and the existing runner test; include the Warden phase-1 healthy case and a deliberately unsupported invariant.

**Exit:** No registered current scenario depends on an unconditional pass, impossible predicate, absent field, or silently skipped checker.

## 9. Checkpoint TB-S5 - Preserve actual causal gameplay events

**Purpose:** A normal TearBench session records the current game facts it claims to observe.

**Primary files:** `src/gameplay/runtime/gameplay-events.ts`, `src/tearbench/gameplay-causal-events.ts`, `src/tearbench/live-runtime-environment.ts`, `src/tearbench/runner.ts`, `src/tearbench/registries.ts`, and `tests/unit/gameplay-causal-events.test.ts`.

- [x] Return newly emitted native events through the same transition consumed by the standard session; do not require a special browser materializer to recover them.
- [x] Preserve deterministic ordering, event IDs, tick identity, subject identity, and exact provenance without duplicating events across steps.
- [x] Prove `run.started` and `enemy.spawned` appear in an ordinary source-owned boss/session run.
- [x] Identify bridge-synthesized facts as synthetic; do not label them engine-native.
- [x] Reject unknown wave/effect variants rather than silently converting them into an unrelated registered event.
- [x] Map current weapon, boss, status, hazard, and reward facts that are needed by the selected current scenarios.
- [x] Remove unsupported event claims from the active ontology or mark them explicitly unavailable until the game emits them.
- [x] Add a compile-time exhaustive mapping or one small reachability check so adding a relevant production event cannot silently disappear.

**Minimum proof:** `pnpm exec vitest run tests/unit/gameplay-causal-events.test.ts tests/unit/tearbench-runner.test.ts` and one short source-owned run showing both retained startup/spawn facts.

**Exit:** Normal session artifacts contain the actual events necessary to explain the exercised gameplay and reject unknown semantics.

## 10. Checkpoint TB-S6 - Restore current five-weapon detached parity

**Purpose:** Replay/headless execution performs actual current weapon gameplay rather than simulating only Sword movement.

**Primary files:** `src/tearbench/production-combat-phases.ts`, `src/tearbench/production-combat-simulation.ts`, `src/tearbench/production-replay-composition.ts`, `src/app/live-combat-actions.ts`, and existing current-weapon runtime tests/browser proofs.

- [x] Replace gameplay no-ops with the existing source-owned weapon behavior; preserve legitimate presentation/audio/device-only no-ops.
- [x] Wire weapon ability updates and semantic weapon-action flushing into detached execution.
- [x] Ensure Riftlock action events create the same applicable authoritative projectile facts as live gameplay.
- [x] Restore real held-blade contact and applicable area damage; do not hardcode contact false or damage zero.
- [x] Add one short representative mechanic proof per active weapon: Sword Reversal/Threadcut, Hammer Meteor, Greatsword Wheel Cut, Chainblade Hook & Sling, and Riftlock projectile/capture/recall.
- [x] Compare the meaningful state transition and causal event between live and detached execution for the same seed/actions.
- [x] Refuse a mechanic explicitly when the execution class cannot support it; never certify omitted gameplay as matching.

**Minimum proof:** `pnpm test:weapons`, the directly affected weapon-runtime tests, and one short targeted live-versus-detached mechanic proof for the weapon being changed. Run the five-weapon set once at checkpoint close, not after every edit.

**Exit:** Every current weapon has one real, deterministic, relevant detached proof; matching hashes are accepted only after the corresponding gameplay actually ran.

## 11. Checkpoint TB-S7 - Restore encounter, hazard, support, and boss parity

**Purpose:** Current non-weapon gameplay is not silently removed from detached execution.

**Primary files:** `src/tearbench/production-combat-phases.ts`, `src/gameplay/combat/live-opening-phase.ts`, `src/gameplay/combat/live-collision-phase.ts`, `src/app/live-combat-actions.ts`, production enemy/boss modules, and the existing replay/headless tests.

- [x] Wire production world hazards and their authoritative damage or state transitions.
- [x] Wire support auras/healing and canonical support subtype identity.
- [x] Wire boss zones, arena platforms, legal boss phases, and the supported boss add/clone lifecycle.
- [x] Wire supported void support, scrolling, and descent behavior or explicitly refuse an unsupported current scenario.
- [x] Assert one real short hazard case, one support case, one boss phase case, and one applicable add/clone or void case.
- [x] Keep visual rendering, device output, and externally persisted side effects outside detached parity unless that capability is explicitly implemented.
- [x] Revise any broad C29/C30 parity wording to describe exactly which current gameplay families the proofs cover.

**Minimum proof:** The targeted boss/enemy/replay Vitest files and one short current encounter comparison per changed family. No campaign completion or long endurance run.

**Exit:** Detached runtime either executes each claimed current encounter family or fails closed with a truthful unsupported result.

## 12. Checkpoint TB-S8 - Use production progression and economy

**Purpose:** Scenario Console synthesis and replay/headless evidence use the game's actual progression rules.

**Primary files:** `src/gameplay/scoring/coin-awards.ts`, current reward/upgrades modules, `src/tearbench/progression-ledger.ts`, `src/tearbench/production-wave-reward-runtime.ts`, and their existing tests.

- [x] Replace hardcoded coin synthesis with the production coin-award function and its current difficulty/modifier inputs.
- [x] Preserve the exact current baseline: wave 1, normal settings, zero score/modifiers produces 10 coins rather than 1.
- [x] Derive health, kills, score, elapsed ticks, draft choices, upgrades, and reward history from existing production-owned rules or explicitly classify them as unavailable.
- [x] Cover one modified-economy case and one boss or difficulty case; do not recreate the whole progression system in TearBench.
- [x] Ensure progression coverage includes all five current weapons through source-driven parameterization rather than a separate roster.
- [x] Make exact-wave launch rely on a lawful, validated production-compatible state frontier.
- [x] Make CLI outputs include actual generated ledger/snapshot/replay/metrics references before claiming that they exist.

**Minimum proof:** `pnpm exec vitest run tests/unit/coin-awards.test.ts tests/unit/tearbench-progression-ledger.test.ts` with a direct live-rule-versus-ledger comparison for the baseline and one modifier.

**Exit:** Scenario synthesis cannot silently drift from current rewards, economy, upgrade legality, or weapon availability.

## 13. Checkpoint TB-S9 - Make player-facing surfaces honest and reachable

**Purpose:** Normal players see current names and only capabilities that actually work.

**Primary files:** `src/app/live-ghost-lab-home.ts`, `src/app/live-game-runtime.ts`, `src/app/live-bot-evidence-controller.ts`, `src/presentation/screens/ghost-lab.ts`, the current canonical screen facades, and existing player browser journeys.

- [x] Keep Replay Hub, Training Archive, and Training Operations correctly named and truthful about their local-only limits.
- [x] Bind Game Agent Evidence to a valid, trusted selected report hash or display an honest unavailable state with no dead route.
- [x] Show Run Monitor as available only when an installed valid policy actually enables it; never list it as both available and unavailable.
- [x] Provide a real distinct monitor destination or clearly present it as an embedded Replay Hub control; remove the misleading self-loop.
- [x] Keep Scenario Console unavailable to normal players unless a real safe product boundary is intentionally implemented.
- [x] Describe the existing replay sub-editor accurately; do not advertise a complete standalone Replay Editor before its real normal-build route exists.
- [x] Preserve old persisted/internal navigation IDs where compatibility requires them; write current player-facing labels and actions canonically.
- [x] Add the affected normal-player browser journey to the relevant change-selected path; a privileged global is not proof of player access.

**Minimum proof:** Relevant controller/renderer tests, `pnpm build:test:standalone` once after a runtime/UI change, then the one applicable existing journey such as `pnpm test:browser:ghost-lab-home` or `pnpm test:browser:c37-player-watch`.

**Exit:** A normal-player route, label, availability state, and selected evidence source agree with the feature that actually exists.

## 14. Checkpoint TB-S10 - Bind evidence to the executed build

**Purpose:** A test result can never silently claim the identity of a different game build.

**Primary files:** `scripts/build-target.mjs`, `scripts/release-artifact.mjs`, `scripts/verify-release-artifact.mjs`, `src/app/composition.ts`, `src/tearbench/live-runtime-snapshots.ts`, `src/tearbench/production-replay-composition.ts`, and the browser journey/materialization harnesses.

- [x] Read the actual served build's `build-info.json` before accepting browser evidence.
- [x] Carry artifact SHA, artifact hash, target, runtime/ruleset identity, seed, scenario ID, and execution class through emitted evidence.
- [x] Reject a stale local build when its declared SHA/hash does not match the intended clean source/artifact.
- [x] For ordinary uncommitted development, record the worktree as dirty and bind a truthful source fingerprint instead of pretending the artifact exactly represents clean `HEAD`.
- [x] Replace ambiguous internal provenance values with the actual injected identity or an explicit unsupported/dirty status.
- [x] Ensure protected integration/certification requires clean exact-commit attribution and the existing release verifier.
- [x] Rebuild only the affected target when a browser slice needs a current artifact; do not rebuild every target for documentation or a pure contract fix.

**Minimum proof:** One stale-build rejection, one current-build acceptance, and the existing targeted release-artifact/preflight tests. Avoid invoking deployment or live services.

**Exit:** Evidence identifies the game that actually ran, and stale or falsely attributed builds fail before their results can be trusted.

## 15. Checkpoint TB-S11 - Enforce permanent game-to-TearBench synchronization

**Purpose:** Any relevant future gameplay change carries its TearBench update and focused evidence in the same PR.

**Primary files:** `src/tearbench/evidence-routes.json`, `src/tearbench/canonical-scenarios.json`, `src/tearbench/release-certification.ts`, `scripts/tearbench.mjs`, `package.json`, `.github/workflows/ci.yml`, and existing selection/registry tests.

- [x] Extend the existing diff-aware selector; do not add a separate watcher, daemon, duplicate scanner, or parallel CI framework.
- [x] Map current game ownership paths to the smallest honest affected scenario, event contract, invariant, runtime projection, regression case, and player journey.
- [x] Derive scenario roster completeness from current production catalogs every time the focused guard runs.
- [x] Fail closed when a new current weapon, boss, stage, relevant enemy, gameplay event, or player surface lacks its required TearBench mapping.
- [x] Fail closed when a selected scenario is unlaunchable, references retired content, selects the wrong subject, or has no real backend/proof.
- [x] Execute the selected scenario's actual evidence command when its change route claims browser/gameplay proof; asserting that the command string exists is insufficient.
- [x] Verify each selected artifact is fresh and bound to the exact executed source/build identity.
- [x] Send unclassified shared-runtime changes through the existing conservative shared-runtime route; never return an empty evidence selection.
- [x] Keep ordinary documentation-only changes on documentation checks; require no gameplay build for a text-only edit.
- [x] Add one negative test per important drift family using a tiny mutated in-memory fixture; do not synthesize entire repositories or large content matrices.
- [x] Preserve existing scheduled nightly/weekly coverage and reserve expensive endurance for those existing schedules or an explicitly relevant release gate.

### Change-trigger contract

| Production change | Mandatory same-PR TearBench response | Minimum relevant proof |
| --- | --- | --- |
| Add/remove/rename a weapon or ability | Source-derived registry, migrated selections if applicable, executable weapon scenario, causal fact, live/detached support declaration. | One short real scenario for the changed weapon. |
| Change a boss, phase, arena, or add | Current validation, observation, legal-phase invariant, scenario selection, and supported detached hook. | One short real boss transition. |
| Change a stage, hazard, or support enemy | Source-derived identity, legal scenario launch, shared observation, hazard/support behavior, and selected route. | One short affected encounter. |
| Change scoring, rewards, upgrades, or progression | Reused production ledger/economy rules, legal state generation, and changed-path selection. | One direct live-rule-versus-TearBench comparison. |
| Add/change a gameplay event | Exhaustive mapper, truthful source/provenance, standard session delivery, and relevant scenario assertion. | One emitted event observed in a normal session. |
| Change actions, movement, collision, or simulation | Shared semantic contract, affected invariant, executable scenario, and deterministic first meaningful transition. | One short source-owned scenario, repeated once with the same seed. |
| Change replay/headless runtime | Declared capability map, shared observation, affected gameplay hook, and exact execution identity. | One live-versus-detached comparison for the changed behavior. |
| Change a player-facing agent/replay surface | Canonical name, route/action, availability, safe persistence binding, and normal-player journey selection. | One relevant real browser journey. |
| Change terminology or compatibility | Current registry, user-facing copy, migration owner/expiry, generated current-facing evidence text. | Terminology check plus one relevant migration/copy test. |
| Change build/release metadata | Source SHA, artifact hash, clean/dirty provenance, served-build validation, release rejection semantics. | One valid and one stale/mismatched artifact case. |
| Change documentation only | Relevant authority/index/links and accurate checkpoint/evidence wording. | Documentation authority and terminology checks only. |

### Required enforcement levels

1. **Source-owned contract:** Production catalogs and types are the single source; static duplicate inventories are forbidden.
2. **Focused change selection:** The existing selector maps touched files to actual affected proof; missing current-content coverage fails.
3. **Protected PR validation:** The current CI workflow executes the selected actual proof and its artifact identity check before the existing functional gate.
4. **Scheduled broader coverage:** Existing nightly/weekly jobs run bounded wider combinations; they do not excuse a missing same-PR focused proof.
5. **Release certification:** A clean protected commit, current artifact, complete required evidence groups, and honest unresolved limitations are mandatory.

**Minimum proof:** One focused selector/coverage test with a newly introduced unmapped current weapon/event, one wrong-subject/unlaunchable scenario rejection, and one selected actual proof execution.

**Exit:** A game change that makes TearBench stale cannot pass the relevant current PR gate without updating its mapping, behavior, and evidence.

## 16. Checkpoint TB-S12 - Reconcile terminology, documentation, and completion evidence

**Purpose:** Agents and owners can see the real current product state without reading obsolete claims as authority.

**Primary files:** `config/terminology-registry.json`, `scripts/check-terminology.mjs`, `tests/terminology-checkers.test.mjs`, `docs/TEARBENCH_GHOST3_PROGRAM.md`, the existing master handoff/completion plan, the evidence catalog/dashboard generator, and release/governance checkpoint documents.

- [x] Update current-facing program descriptions and evidence text to the exact canonical names listed in section 1.
- [x] Preserve immutable specification wording, recorded evidence, hash-bound schemas, compatibility reads, and historical decision records.
- [x] Report every actual deprecated-copy occurrence rather than the first match per whole document; keep immutable history and valid compatibility separately classified.
- [x] Include active current-facing generated JSON and relevant active documentation in truthful terminology coverage.
- [x] Evaluate compatibility retirement against its actual owner/checkpoint condition; never treat a nonempty expiry string as proof of expiry.
- [x] Record current checkpoint statuses, partial capabilities, and actual normal-player visibility in the existing handoff/evidence catalog/dashboard.
- [x] Reconcile closed C32 and partial C37 evidence without promoting a local foundation to a finished player product.
- [x] Record current release/deployment identity truthfully; remove present-tense frozen/no-public-SHA claims once contradicted by protected release evidence.
- [x] Add source commit, evidence timestamp, artifact identity, and scope to generated current-capability reporting where existing generators already own those outputs.
- [x] Keep the governed seven-plan index stable unless a separately authorized change intentionally updates its checker and metadata contracts.
- [x] Treat C40 as incomplete until a real clean-commit release certificate passes every named current-game requirement.

**Minimum proof:** `pnpm check:terminology`, `pnpm test:terminology`, `pnpm check:docs`, `pnpm test:docs`, and `pnpm requirements:check`; regenerate only the specific generated artifact whose generator/input was intentionally changed.

**Exit:** Current-facing documentation, terminology counts, checkpoint status, evidence freshness, and release identity are accurate without damaging historical or compatibility material.

## 17. Final integration and completion checklist

The alignment program is complete only when every item is true:

- [x] Every `TB-S0` through `TB-S12` exit condition is met with its stated minimum evidence.
- [x] Current production catalogs automatically determine TearBench content coverage.
- [x] All active weapons have real executable current-game mechanic scenarios.
- [x] Every canonical scenario is valid and executable through its explicitly declared supported backend.
- [x] Live, replay, and headless claims agree with the real implemented gameplay capabilities.
- [x] Standard session evidence contains truthful ordered native gameplay facts.
- [x] Every advertised invariant has a real positive/negative proof and an appropriate observation class.
- [x] Current boss phases, stages, hazards, support enemies, status effects, actions, and progression are validated or explicitly marked unsupported.
- [x] Wave-1 economy and other covered rewards match the current production scoring functions.
- [x] Player surfaces use canonical names and correctly expose only supported normal-build functionality.
- [x] Current source/build/artifact identity is recorded, and stale evidence is rejected.
- [x] Relevant production changes cannot pass protected PR validation with missing or stale TearBench coverage.
- [x] Current requirements, handoff, dashboard, and certification language describe what is actually implemented.
- [x] Existing save/replay migration, historical evidence, locked legacy oracle, and production/test-isolation boundaries remain intact.
- [x] `pnpm check` passes from the final clean intended worktree/commit before any release-readiness claim.
- [x] No merge, deploy, publication, cross-repository change, ruleset change, or live-service mutation occurs without its own explicit authorization.

The full clean-source `pnpm check` has passed on the owner-authored feature
branch, including source-bound builds, production/test isolation, all current
weapons, soundtrack and game-reference provenance, real browser journeys, and
performance evidence. The final checkpoint commit must repeat that exact gate
from its own clean source. Protected integration, deployment, publication, and
C40 release certification remain unperformed and require separate authorization.
The original checked items above describe the first implementation pass; the
post-review checkpoints below supersede any completion claim contradicted by
their unchecked work.

## 18. Post-review corrective checkpoints and anti-drift checklist

The original alignment is not complete while any item below is unchecked. Keep
all changes inside the existing game worktree, reuse production definitions,
and preserve separately governed music, wiki, merge, publication, and C40
release boundaries.

### TB-R0 - Reopen the truthful baseline

- [x] Create one explicit persistent completion goal with independently verifiable corrective checkpoints.
- [x] Confirm the current owner-authored feature head, protected baseline, clean feature worktree, and pre-existing user-owned changes in other worktrees.
- [x] Record that the original 118 checked items do not override the post-review defects or complete the broader C21-C40 program.
- [x] Keep this checklist and both authoritative handoff headers synchronized with actual corrective progress.

**Exit:** The next owner can identify the precise remaining defect, allowed write scope, current source identity, and non-goals without mistaking the first pass for acceptance.

### TB-R1 - Preserve runtime scenario authority and source-derived coverage

- [x] Preserve typed scenario subject and supported backend authority through the actual runtime contract without breaking existing versioned replay/save readers.
- [x] Prove canonical scenario materialization cannot drop, mismatch, or silently widen its declared subject and supported backend.
- [x] Derive upgrade, boss, stage, relevant event, and player-surface synchronization from existing production owners; avoid a parallel handwritten game catalog.
- [x] Add focused negative fixtures proving newly introduced production identities fail until their TearBench mapping/evidence exists.

**Exit:** Every covered production content family is source-owned, and downstream execution can verify the same authority validated by scenario authoring.

### TB-R2 - Make observations, invariants, and headless events truthful

- [x] Count only wave-owned living enemies in the wave-completion diagnostic.
- [x] Add positive and negative wave-ownership proofs that distinguish unrelated living entities from actual wave participants.
- [x] Deliver ordered source-owned causal gameplay facts from ordinary headless execution when its scenario claims causal evidence; explicitly refuse unsupported delivery.
- [x] Preserve live-session native event delivery, provenance, deterministic ordering, and existing replay/headless consumers.

**Exit:** Wave invariants operate on real ownership, and live/headless causal claims are backed by the event stream actually delivered to the caller.

### TB-R3 - Require current five-weapon live-versus-detached parity

- [x] Produce one short, meaningful, deterministic live-versus-detached mechanic proof for each current production weapon.
- [x] Bind parity evidence to the actual scenario subject, supported backend, current source/build identity, and exercised gameplay transition.
- [x] Make the relevant focused/CI parity gate fail closed when required current evidence is missing, stale, ignored, or mismatched.
- [x] Keep unsupported Source void descent/scroll explicitly live-only; do not misrepresent unit fixtures or legacy traces as current parity.
- [x] Keep routine proofs bounded; do not require a long historical 13-scenario matrix for every unrelated change.

**Exit:** Sword, Hammer, Greatsword, Chainblade, and Riftlock each have an actual current cross-backend proof that the relevant clean-checkout gate cannot silently skip.

### TB-R4 - Close permanent synchronization escape paths

- [x] Route every unmatched gameplay/runtime change conservatively even when the same diff also contains a recognized route.
- [x] Add a regression proving a mixed recognized/unrecognized diff cannot silently omit the unknown change.
- [x] Preserve documentation-only checks without forcing gameplay builds for a genuinely documentation-only diff.
- [x] Make nightly and weekly evidence selection include the complete intended protected change range rather than only `HEAD^..HEAD`.
- [x] Prove stale or missing production-content, scenario, source identity, and required parity coverage fails the relevant focused gate.

**Exit:** Relevant current-game changes fail their existing protected validation path until TearBench mappings, behavior, and source-bound evidence are updated together.

### TB-R5 - Reconcile handoffs, terminology, and cross-repository truth

- [x] Remove stale assertions that the committed feature slice is uncommitted or that the first-pass checklist alone establishes completion.
- [x] Record corrective checkpoint progress, intentionally unsupported mechanics, partial player surfaces, and unresolved C21-C40 milestones accurately.
- [x] Describe game-to-wiki synchronization as protected and merge-dependent; do not edit the wiki or publish an unmerged game reference.
- [x] Describe soundtrack provenance as an approved pinned release, not automatic latest-music-head synchronization; preserve intentional historical compatibility identities.
- [x] Keep terminology, documentation, requirement, and seven-plan governance checks passing without rewriting immutable history.

**Exit:** Current-facing documents state what is implemented, what is proven, which repositories actually changed, and which external actions remain unauthorized.

### TB-R6 - Final evidence and acceptance

- [x] Complete every `TB-R0` through `TB-R5` checkbox with its corresponding focused proof.
- [x] Run relevant scenario/content contracts, selector negative tests, wave/event tests, current five-weapon parity, terminology/documentation checks, and source-identity validation.
- [ ] Run the final canonical `pnpm check` from the final intended clean owner-authored feature commit before asserting repository-wide readiness.
- [x] Perform an independent adversarial review of the exact final diff and resolve every acceptance-blocking issue.
- [x] Preserve the existing canonical checkout, dirty auxiliary worktrees, unrelated user files, music repository, wiki repository, and locked legacy oracle.
- [x] Report protected PR/merge, publication, deployment, music re-vendoring, wiki update, and C40 release certification as not performed unless separately authorized.

**Exit:** No corrective item remains unchecked, every required proof is current and honest, and the persistent goal closes only after actual acceptance.

## 19. Agent handoff template

Keep each handoff brief, concrete, and reproducible:

```text
Current protected source / worktree:
Completed checkpoint and exact checklist items:
Files changed:
Current-game behavior actually exercised:
Focused commands and pass/fail results:
Scenario, seed, execution class, and first meaningful result:
Build/source/artifact identity:
Compatibility preserved:
What remains unsupported or unverified:
Exact next incomplete checkpoint:
Full release gate: not run / failed / passed from exact clean commit:
Merge / deploy / publication: not performed unless explicitly authorized:
```

If a short reproducer fails, stop at the first material divergence, fix the owning game/TearBench boundary, and repeat only the relevant proof. Do not compensate with more scaffolding, broader loops, optimistic checklist marks, or an unrelated green test suite.
