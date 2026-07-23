# TearBench and Ghost 3.0 Requirement Ledger

> **Audit warning (2026-07-23):** This ledger predates the operational evidence
> reset. Many `implemented` entries below mean that a contract, pure helper, or
> synthetic unit test exists; they must not be read as integrated, visible, or
> certified capability claims. C21 of the
> [autonomous completion plan](../plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md)
> replaces these binary labels with contract/prototype/integrated/visible/
> certified states and creates subsection-level traceability.

**Status vocabulary**

- `existing` — credible current repository implementation and evidence exist.
- `partial` — a useful seam exists, but the v0.6 contract is incomplete.
- `absent` — implementation has not been identified.
- `deferred:Cx` — intentionally scheduled for checkpoint Cx.
- `blocked` — cannot proceed without an explicit decision or dependency.

This ledger tracks major requirements. Detailed child requirements belong in
checkpoint-specific fixtures and reviews.

## Shared deterministic foundation

| Requirement | Status | Evidence or disposition |
|---|---|---|
| Fixed authoritative simulation step | existing | `src/simulation/fixed-step.ts`, runtime coordinator tests |
| Device-independent semantic actions | existing | `src/input/game-action.ts`, semantic buffer and input tests |
| Monotonic command envelopes | existing | `src/domain/envelopes.ts` |
| Authoritative action -> step -> hash order | existing | `src/gameplay/runtime/authoritative-step.ts` |
| Determinism across render rates | existing | authoritative replay and replay round-trip contracts |
| Seeded gameplay randomness | existing | `RandomSource`, compatibility stream, and named stream manager |
| Named independent RNG streams | existing | `src/simulation/run-random.ts`, composition routing, isolation tests |
| Versioned within-tick causal phases | existing | `src/tearbench/registries.ts` |
| Stable event/entity registries | existing | `src/tearbench/registries.ts` |
| Test-only isolated composition | existing | `src/tearbench/test-environment.ts`, instrumented Vite targets |
| Production absence of test bridge | existing | `check:test-isolation`, separate `dist/test-*` artifacts |

## TearBench

| Requirement | Status | Evidence or disposition |
|---|---|---|
| Browser journey automation | existing | navigation, progression, playground, terminal, input, platform journeys |
| Structured scenario schema and registry | implemented | C1 contract plus C3 versioned registry and seven canonical engineering scenarios |
| Reset/observe/step/action-batch runner | implemented | C3 public runner/session contract supports reset, observe, step, action batches, pause, and resume |
| Structured observation V1 | existing | `src/tearbench/contracts.ts` |
| Invariant registry and severity | implemented | C3 versioned invariant registry, severities, runtime evaluation, and failure artifacts |
| Failure artifact schema | existing | `src/tearbench/contracts.ts` |
| Deterministic scenario CLI | implemented | `pnpm tearbench`; list, focused run, evidence artifact, and artifact-driven rerun |
| Branch-to-branch behavior comparison | implemented | C9 first-divergence trace comparison and C12 event-aligned trajectory comparison |
| Replay/state divergence analysis | implemented | C9 identifies first material semantic divergence separately from downstream ticks |
| Failure minimization | implemented | C9 repeatedly verified timeline/action and record minimizers plus signatures, clustering, attribution, routing, and bisection |
| Diff-aware suite selection | implemented | C20 evidence routes select scenarios, Graveyard cases, journeys, base comparisons, and interaction matrices |
| PR/nightly/endurance/release orchestration | implemented | C20 local/PR/nightly/weekly-endurance/release-candidate profiles and GitHub workflows |
| Reusable Codex playtester Skill | implemented | C20 repository skill selects, runs, interprets, minimizes, and reports canonical evidence |

## State Forge

| Requirement | Status | Evidence or disposition |
|---|---|---|
| Canonical gameplay snapshots | implemented | C4 codec registry covers player, blade, run, world, enemies, bosses, projectiles, platforms, hazards, UI, configuration, and RNG |
| Shared state codec registry | implemented | C4 data-only codecs cover player, blade, run, world, enemies, bosses, projectiles, platforms, hazards, UI, configuration, and RNG |
| Transactional temporary-world restore | implemented | C4 restores into a validated temporary world and atomically commits only after codec and reference resolution succeeds |
| Exact/semantic/visual/progression/environment hashes | implemented | C1 hash-set contract plus C4 exact/semantic codec projections and C5 progression/configuration hashes |
| Canonical progression ledger | implemented | C5 ordered ledger reuses production wave descriptions and reconstructs progression/build/configuration hashes |
| Production-order config rebuild | implemented | C5 ordered progression reconstruction replays authored events and configuration transitions |
| Historical run/build synthesis | implemented | C5 opportunity accounting, policy provenance, coherent statistics, and impossible-build explanations |
| Structural validity report | implemented | C6 TearSDL resolution emits typed structural issues |
| Rule reachability proof | implemented | C6 reachability reasons distinguish legal, unreachable, and adversarial states |
| Population plausibility model | implemented | C6 emits an explicitly provisional plausibility result until consented population samples exist |
| Five state classes | implemented | C6 TearSDL requires recorded, reconstructed, plausible, surgical, or adversarial classification |
| TearSDL and linter | implemented | C6 hostile-input JSON parser, inheritance flattening, linting, constraints, and resolved hashes |
| Exact wave/boss/attack/boundary launch | implemented | C6 exact boss/phase/frame and threshold minus/at/plus factories |
| Time travel, state bank, and counterfactual forks | implemented | C6 checkpoint bank and event-style state-patch forks |
| Canonical Hard Endless wave-99 workflow | implemented | C6 `pnpm tearbench forge wave99` and validated forge package |

## Autonomous agents and TearBot

| Requirement | Status | Evidence or disposition |
|---|---|---|
| Synthetic player and blade control seams | existing | `player.aiInput`, `blade.aimOverride`, attract and mirror runtimes |
| Scripted attract-mode policy | existing | presentation attract runtime |
| Real-combat modular scripted policy | implemented | C7 deterministic semantic-action policy covers navigation, targeting, blade mechanics, parry, recovery, draft, and UI |
| Hierarchical agent boundaries | implemented | C7 orchestrator, journey, menu, strategy, tactical, blade, movement, draft, recovery, critic, and sentinel modules |
| Journey Director and watchdog | implemented | C8 typed menu-to-menu director, transition history, watchdog, mode contracts, and visible engineering journey |
| Real menu-to-menu autonomous Adventure | implemented | C8 instrumented shipped build completes the real UI lifecycle as explicitly labeled Class B engineering evidence |
| Class A/B/C reporting | implemented | C8 execution/observation classes and statistical certification evaluator prevent relabeling |
| Pixel-only black-box observation | partial | C8 physical adapters, UI parity, and certification thresholds exist; no Normal Adventure Class C certification claim has been made |
| Agent decision trace | implemented | C7 records objective, target, maneuver, confidence, recovery, and observation class |
| Headless parallel environments | implemented | C14 DOM-free runner, isolated environment pool, batched transport, bounded sampling, parity, and benchmarks |
| Demonstration and recovery corpus | implemented | C15 synchronized governed samples, reviews, corrections, takeover/recovery segments, immutable split manifests, and BC export |
| Behavior cloning and correction loop | implemented | C15 deterministic behavior-cloning trainer consumes reviewed training split and preserves correction lineage |
| Astuteness Vector and information firewall | implemented | C16 multidimensional compiler, bounded rationality, and public human-like field/reaction limits |
| Calibrated Levels 1-9 and Level Omega | implemented | C16 provisional synthetic ordered ladder, IRT reports, and explicitly privileged Omega |
| Item-response ratings and hidden exams | implemented | C16 item-response probabilities, multidimensional reports, and immutable hidden-release-exam split |
| Agent Foundry with rollback | implemented | C16 weakness curriculum, teacher/challenger evaluation, frozen trust inputs, promotion/archive, monitoring, and rollback |

## Ghost compatibility and truth

| Requirement | Status | Evidence or disposition |
|---|---|---|
| Ghost 2.0 visual recording/playback | existing | legacy engine, visual packet, replay UI/tests |
| V1/V2 parsing and migration | existing | replay and persistence envelope migrations |
| Canonical action recording | existing | `ReplayEnvelopeV2` |
| Build, seed, ruleset, final hash | existing | replay envelope |
| Replay Trident capability map | implemented | C10 independent Command, State, and Visual truth declarations with precedence/degradation |
| Universal Ghost timeline | implemented | C10 integer ticks, within-tick phases, typed ontology validation, ranges, ancestors, and children |
| Quality Card | implemented | C10 ten independent scored dimensions with reasons |
| Canonical event ontology and causal graph | implemented | C10 stable event registry plus typed payload schemas and causal integrity checks |
| Round-trip invariants beyond current record/final hash | implemented | C10 verifies serialization, command, state, visual, seek, zero-modification fork, practice, export/import, and migration declarations |
| Recording-profile negotiation | implemented | C10 composable recording profiles negotiate required/optional tracks and honest degradation |
| Binary chunk capsule and integrity chain | implemented | C11 manifest, chunk index, independent checksums, root integrity, export, and debug view |
| Worker encoding and backpressure | implemented | C11 worker port, bounded recorder, pressure measurement, and declared presentation downgrade |
| Crash-safe journal | implemented | C11 commits per-session journal sequence and recovers incomplete manifests after refresh |
| IndexedDB Vault and quota tiers | implemented | C11 IndexedDB/memory adapters, ten stores, journaling, recovery, quota retention, and hostile import limits |
| Ghost Doctor | implemented | C11 scan, health report, quarantine, repair-child lineage, and index rebuild |
| Isolated replay world | implemented | C12 shared-codec isolated world, deterministic seek/warmup, disclosed correction, and presentation fallback |
| Deterministic seek and correction disclosure | implemented | C12 keyframe warmup seek returns semantic hash and explicit before/after correction evidence |
| Modular visibility-gated Lenses | implemented | C12 public/ranked/developer registry with required-track gates |
| Practice From Here | implemented | C12 transactional cloned snapshot, input-latch policy, immutable lineage, and eligibility firewall |
| Event-aligned/N-way comparison | implemented | C12 semantic occurrence alignment and trajectory diff verified across nine runs |

## Ghost knowledge, coaching, and product

| Requirement | Status | Evidence or disposition |
|---|---|---|
| Canon, Graveyard, Frontier, Corpus | implemented | C13 separate governed stores with explicit promotion, triage, and corpus ingestion |
| Full lineage graph | implemented | C13 migration, repair, clip, fork, challenge, correction, scenario, minimization, training, and promotion edges |
| Ghost range -> TearSDL | implemented | C13 causal-history closure and private-data-sanitized scenario compilation |
| TearSDL execution -> Ghost | implemented | C13 watchable child V3 with complete state-class and branch provenance |
| Evidence-first Run Autopsy | implemented | C17 deterministic analyzers bind ranges, events, metrics, baseline, confidence, impact, evidence hash, and drill |
| Replay-to-drill compiler | implemented | C17 seven deterministic analyzers, baselines, counterfactual regret, one-fix priority, legal drills, and skill graph |
| Draft regret counterfactuals | implemented | C17 rollout means, standard errors, 95% uncertainty, sample floors, and supported-regret decision |
| Player-best and seed-locked Ghost races | implemented | C18 challenge catalog and proof manifests cover Chase Your Best and seed-locked races |
| Challenge proof manifests | implemented | C18 eight challenge kinds, locked seed/rules/conditions, attempt capsule, lineage, and proof hash |
| Studio non-destructive editing | implemented | C18 immutable EDL, cameras, captions, aspect ratios, thumbnails, and local renderer export |
| Safe Personal Nemesis distillation | implemented | C18 bounded authored move grammar with human-like reaction and branch limits |
| Run DNA and career archive | implemented | C18 transparent formula/source metrics plus deterministic immutable career ordering, bests, wins, and DNA rollups |

## Cloud, trust, and preservation

| Requirement | Status | Evidence or disposition |
|---|---|---|
| Current replay publication and loading | existing | cloud adapters and replay library controller |
| Local/offline fallback | existing | platform contracts and browser evidence |
| Metadata/object-storage split | implemented | C19 D1 metadata schema and R2 binary Worker binding |
| Resumable atomic upload | implemented | C19 R2 multipart transport keeps uploads non-public until finalization |
| Trusted re-simulation and signed verdict | implemented | C19 historical-runtime registry, staged validation, and versioned signer port |
| Eligibility record | implemented | C19 records resumed, modded, coached, Ghost-assisted, bot, debug, and State Forge provenance |
| Hostile capsule parser limits | implemented | C11 byte, chunk-count, per-chunk, expansion-ratio, checksum, and root-integrity limits |
| Privacy classification and separate training consent | implemented | C19 sanitization, privacy class, pseudonyms, visibility, and independent consent mutation |
| Moderation and exploit quarantine | implemented | C19 moderation stage, reporting, blocking, audit, rate policy, and appeals |
| Delayed near-live relay | implemented | C19 immutable past-only delayed frames remain optional and recording-independent |
| Historical runtime packages | implemented | C20 preservation manifest retains V1 visual, V2 semantic, and V3 exact runtime/migration entrypoints |
| Golden cross-version capsule corpus | implemented | C20 manifest pins authoritative, migration, and visual-degradation golden replay evidence |
| Stable aliases and tombstones | implemented | C20 rejects alias cycles and ID reuse while resolving supported, retired, tombstoned, and unknown builds honestly |
| Operational health dashboards | implemented | C20 recorder, storage, drift, verification, seek, practice, scenario, and policy cards expose healthy/warning/missing state |
| Full TearBench release certification | implemented | C20 certificate requires full gate, deterministic scenarios, Graveyard, journeys, base comparison, historical corpus, matrices, and affected arbitrary states |

## C0 Exit Review

| Gate | Result |
|---|---|
| Every major requirement has a disposition and dependency | pass |
| Authoritative time, actions, RNG, state, replay, and persistence ownership recorded | pass |
| Ghost 2.0 compatibility explicitly protected | pass |
| Unresolved architecture ownership | none identified |

Checkpoint C0 is complete when these documents and the execution plan pass the
repository documentation integrity check.
