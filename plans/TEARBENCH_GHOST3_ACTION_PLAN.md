# TearBench, State Forge, TearBot, and Ghost 3.0 Action Plan

> **Historical scaffold notice (2026-07-23):** This document's C0-C20
> `complete` labels were based primarily on contract and synthetic unit evidence.
> They do not establish the operational, visible, learned, cloud, or
> release-certified outcomes described here. Completion work now continues in
> [TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md](TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md).

**Status:** Superseded as a completion record; retained as the C0-C20 scaffold plan
**Source:** `TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN(3).md`, version 0.6
**Repository baseline:** Typed Tear runtime as of 2026-07-23
**Purpose:** Convert the complete vision into dependency-ordered work with objective checkpoint gates.

---

## Checkpoint Status

| Checkpoint | Status |
|---|---|
| C0 — Program Lock and Gap Ledger | complete |
| C1 — Shared Contract Kernel | complete |
| C2 — Deterministic Runtime and Test Isolation | complete |
| C3 — TearBench Engineering MVP | complete |
| C4 — Shared State Codec Registry and Transactional Restore | complete |
| C5 — Canonical Progression Ledger and Historical Synthesis | complete |
| C6 — TearSDL, State Classes, Boundaries, and Forking | complete |
| C7 — Scripted Policy Foundation and Agent Hierarchy | complete |
| C8 — Visible Player-Journey Autonomy | complete |
| C9 — Regression Intelligence and Graveyard MVP | complete |
| C10 — Ghost 3.0 Truth Kernel | complete |
| C11 — Ghost Capsule, Recorder, and Local Vault | complete |
| C12 — Replay World, Theater, Practice, and Comparison | complete |
| C13 — Ghost Knowledge Libraries and Bidirectional Scenario Bridge | complete |
| C14 — Headless Simulation and Scale | complete |
| C15 — Agent Academy and Demonstration Corpus | complete |
| C16 — TearBot Ladder and Agent Foundry | complete |
| C17 — Ghost Coach and Replay-to-Practice Learning Loop | complete |
| C18 — Challenges, Studio, and Player Experiences | complete |
| C19 — Cloud Publication, Verification, Privacy, and Moderation | complete |
| C20 — Preservation, CI, and Release Certification | complete |

Repository charter, decisions, and gap status live in:

- `docs/TEARBENCH_GHOST3_PROGRAM.md`
- `docs/TEARBENCH_GHOST3_ARCHITECTURE_DECISIONS.md`
- `docs/TEARBENCH_GHOST3_REQUIREMENT_LEDGER.md`

---

## 1. Program Outcome

This program is complete when Tear can:

1. Execute deterministic gameplay through semantic actions.
2. Launch and validate exact scenarios at any point in a run.
3. Complete visible player journeys from the real menu back to the real menu.
4. Detect, minimize, reproduce, and explain gameplay failures.
5. Record new runs as trustworthy Ghost 3.0 timelines without breaking Ghost 2.0 playback.
6. Turn compatible runs into replay, comparison, practice, coaching, challenges, regression scenarios, and governed learning data.
7. Maintain calibrated human-like TearBot Levels 1-9 plus a clearly superhuman Level Omega.
8. Improve agent policies through audited champion/challenger promotion without allowing agents to redefine their tests.

This is one program with four collaborating products:

- **TearBench:** execution, testing, diagnosis, and certification.
- **Tear State Forge:** state capture, restoration, synthesis, validation, and forking.
- **TearBot:** scripted and learned gameplay policies, calibration, and Agent Foundry.
- **Ghost 3.0:** causal replay, memory, verification, practice, coaching, creation, and preservation.

---

## 2. Repository Baseline: Preserve and Extend

The current repository already contains foundations that the original design document proposed creating:

- `src/simulation/fixed-step.ts` owns fixed-step scheduling.
- `src/domain/random.ts` and `src/simulation/run-random.ts` provide seeded run randomness.
- `src/input/game-action.ts` defines semantic game actions.
- `src/replay/envelope.ts` records canonical action envelopes, build metadata, seeds, and final hashes.
- `src/replay/visual-replay.ts` combines canonical actions with visual replay data.
- `src/replay/legacy-compat.ts` preserves legacy Ghost behavior.
- `src/app/state-machine.ts` and screen/action coordinators expose typed application flow.
- Browser journeys already cover navigation, progression, modes, inputs, responsiveness, performance, audio, and platform targets.
- Contract tests already verify replay round trips and deterministic outcomes across render rates.

Therefore:

- Do not reconstruct the former `js/game.js` monolith.
- Do not replace semantic actions with raw keyboard or pointer data.
- Do not add gameplay dependencies on the DOM, cloud, audio, storage, or presentation.
- Do not expose a writable test global in production.
- Do not reinterpret the existing typed replay as disposable work.
- Do not mutate Ghost 2.0 recordings into pretend Ghost 3.0 capsules.

Ghost 3.0 is added beside the legacy reader. Existing V1/V2 recordings remain honestly classified legacy or limited-fidelity recordings.

---

## 3. Global Program Rules

Every checkpoint must obey these rules:

1. **Determinism before intelligence.** No learned policy can certify behavior until the simulator and evidence are reproducible.
2. **Contracts before surfaces.** Define schemas and typed ports before dashboards, editors, or social features.
3. **Local before cloud.** Recording, playback, scenarios, practice, and evidence work offline first.
4. **Scripted before learned.** Scripted policies establish QA value and training teachers before ML begins.
5. **Engineering before black-box, both before release.** Engineering execution finds problems quickly; black-box execution proves the shipped experience.
6. **No silent fidelity claims.** Replay, state, verification, migration, and repair statuses are explicit.
7. **No real-profile mutation.** Test runs use disposable persistence, platform, achievement, analytics, and leaderboard adapters.
8. **Immutable evidence.** Repairs, migrations, forks, clips, and minimizations create lineage-linked derivatives.
9. **Human-like means visible-information-only.** TearBot Levels 1-9 cannot read hidden future or exact internal state unavailable to a player.
10. **Checkpoint gates are blocking.** A failed exit gate prevents work that depends on it from being called complete.

---

## 4. Program Plateaus

| Plateau | Checkpoints | Usable outcome |
|---|---|---|
| P1 — Deterministic Engineering MVP | C0-C3 | TearBench can run focused deterministic scenarios and produce evidence. |
| P2 — Any-Point Simulation | C4-C6 | State Forge can restore, synthesize, validate, and fork exact situations. |
| P3 — Visible Autonomous QA | C7-C9 | Scripted agents complete real journeys and minimize regressions. |
| P4 — Ghost 3.0 Truth MVP | C10-C13 | New causal capsules record, seek, restore, practice, compare, and survive locally. |
| P5 — Calibrated Learning System | C14-C16 | Headless scale, Academy, TearBot Ladder, and Agent Foundry operate safely. |
| P6 — Player and Operational Ecosystem | C17-C20 | Coach, challenges, Studio, cloud verification, preservation, and release operations mature. |

---

## 5. Checkpoint Plan

## C0 — Program Lock and Gap Ledger

**Goal:** Establish one authoritative implementation boundary and prevent parallel incompatible designs.

**Deliverables**

- Add the v0.6 source vision to repository documentation or link it as an immutable source artifact.
- Record architecture decisions for:
  - TearBench package boundaries.
  - Development-only test composition.
  - Ghost 2.0/V1/V2 compatibility policy.
  - Ghost 3.0 naming and version layers.
  - State schema ownership.
  - Event ID and entity ID stability.
  - Execution Classes A, B, and C.
  - Local/cloud/privacy/training-consent boundaries.
- Create a live requirement ledger mapping every v0.6 requirement to:
  - existing,
  - partial,
  - absent,
  - intentionally deferred,
  - rejected with rationale.
- Assign owners for schemas, simulation, replay, browser runner, platform, UI, and ML.
- Freeze initial terminology: tick, action, event, checkpoint, snapshot, scenario, state class, capsule, range, lineage, validation, verification, and certification.

**Exit gate**

- Every major requirement has a disposition and dependency.
- No unresolved ownership exists for authoritative time, actions, RNG, state, replay, or persistence.
- Ghost 2.0 compatibility is explicitly protected.

---

## C1 — Shared Contract Kernel

**Goal:** Define the small versioned contracts shared by TearBench, State Forge, Ghost, and TearBot.

**Deliverables**

- Add versioned typed contracts for:
  - `TearActionV1` by reusing or versioning `GameAction`.
  - `TearObservationV1`.
  - `TearEventV1`.
  - `TearScenarioV1`.
  - `TearSnapshotV1`.
  - `TearFailureArtifactV1`.
  - `GhostRangeV1`.
  - provenance and lineage.
- Define stable registries for:
  - event IDs,
  - entity kinds,
  - weapons,
  - abilities and tiers,
  - bosses and phases,
  - stages,
  - statuses,
  - codecs,
  - invariant IDs.
- Define deterministic within-tick phases and sequence ordering.
- Define exact, semantic, visual, progression, and environment hash projections.
- Add schema validation, malformed fixtures, and pure migrations from the immediately previous schema.

**Exit gate**

- All contracts parse untrusted data without executing code.
- Unknown, malformed, oversized, and contradictory values fail explicitly.
- Stable IDs are not derived from array position or display names.
- Contract tests prove round-trip preservation.

---

## C2 — Deterministic Runtime and Test Isolation

**Goal:** Make the live typed runtime controllable and reproducible without weakening production.

**Deliverables**

- Audit all gameplay randomness and route it through injected `RandomSource` instances.
- Split named RNG streams at least into combat, enemy AI, spawn, draft, boss, world, and cosmetic domains.
- Ensure cosmetic RNG cannot alter gameplay stream consumption.
- Extend fixed-step ownership so simulation can advance independently of rendering.
- Add a development/test composition root providing:
  - disposable persistence,
  - unavailable or mocked cloud,
  - disabled achievements and leaderboards,
  - disabled analytics and ads,
  - controlled audio,
  - fixed configuration and Remote Config snapshots.
- Add a development-only test bridge or runner port. If browser-exposed, compile it out of production artifacts.
- Record build revision, ruleset, content/config hashes, scenario version, tick rate, and RNG algorithms in every run artifact.
- Add a production-artifact assertion proving the test bridge is absent.

**Exit gate**

- Same initial state, actions, RNG streams, and configuration produce identical semantic hashes at 30, 60, 144, and uncapped render profiles.
- Test execution produces no real profile, cloud, reward, achievement, analytics, or leaderboard writes.
- A cosmetic-only change cannot perturb gameplay RNG results.
- Production builds contain no writable testing surface.

---

## C3 — TearBench Engineering MVP

**Goal:** Deliver immediate deterministic QA value without machine learning.

**Deliverables**

- Add a TearBench runner with:
  - reset,
  - observe,
  - step,
  - batched actions,
  - pause/resume,
  - termination,
  - metrics,
  - event capture,
  - invariant capture,
  - screenshot and replay artifact hooks.
- Create the initial scenario registry and CLI.
- Implement the first canonical scenarios:
  1. boot and start run,
  2. movement and jump,
  3. dash and one-way platform,
  4. valid blade cut,
  5. projectile deflect/parry,
  6. wave clear into draft,
  7. draft selection back into gameplay.
- Add deterministic invariants for finite values, bounds, health, entity ownership, wave completion, boss phases, UI focus, pause, and softlock timeouts.
- Save resolved scenario, seed, actions, events, hashes, metrics, failures, console output, screenshot, and report.
- Route focused scenarios from changed feature domains.

**Exit gate**

- Every initial scenario reproduces identically for at least 100 repeated executions per seed.
- A planted invariant failure creates a complete developer-readable artifact.
- The CLI can rerun the exact failed seed and action trace.
- P1 is achieved: TearBench is useful before any gameplay bot exists.

---

## C4 — Shared State Codec Registry and Transactional Restore

**Goal:** Capture and restore complete simulation state safely.

**Deliverables**

- Create a shared State Forge/Ghost codec registry.
- Add explicit codecs for player, blade, run, enemies, bosses, projectiles, platforms, hazards, UI/run state, configuration, and RNG cursors.
- Require each codec to own capture, validation, restoration, reference resolution, migration, hash projection, and presentation fallback.
- Restore into a temporary world through approved constructors/factories.
- Resolve stable ownership, target, summon, platform, projectile, and stolen-blade references.
- Validate before atomically replacing the active test/replay world.
- Preserve the previous world when restoration fails.
- Add exact and semantic state diff tooling.

**Exit gate**

- Capture any supported combat frame, recreate a fresh runtime, restore it, and reproduce the next 600 ticks under the same actions.
- Failed restoration never leaves a partially rebuilt live world.
- Snapshot payloads cannot select arbitrary constructors or execute supplied code.

---

## C5 — Canonical Progression Ledger and Historical Synthesis

**Goal:** Construct late-game state by replaying real progression intent instead of assigning guessed final values.

**Deliverables**

- Extract or expose the production progression scheduler as a deterministic typed service.
- Record ordered events for run setup, weapon, difficulty, meta effects, stages, waves, drafts, bosses, tiers, rewards, revives, and completion.
- Restore pristine configuration, then reapply mutations in canonical production order.
- Enumerate exact earned draft and tier opportunities for any target.
- Add build synthesis policies:
  - exact ledger,
  - replay-derived,
  - human/agent population hooks,
  - archetype,
  - optimized,
  - low-roll,
  - anti-synergy,
  - coverage-seeking,
  - corruption.
- Add coherent HP, time, score, style, kill, economy, and resource-history models.
- Keep population-derived values explicitly provisional until real consented data exists.

**Exit gate**

- Recorded and ledger-reconstructed runs match build, progression, and configuration hashes at the same target.
- Generate 10,000 legal target-wave states without opportunity-count, unique, tier, or configuration errors.
- An impossible requested build returns a constraint explanation and nearest reachable alternatives.

---

## C6 — TearSDL, State Classes, Boundaries, and Forking

**Goal:** Make arbitrary situations declarative, reviewable, and repeatable.

**Deliverables**

- Implement TearSDL parsing, flattening, inheritance, constraints, linting, and resolved artifacts.
- Require every scenario to declare one state class:
  - recorded canonical,
  - reconstructed reachable,
  - plausible population,
  - surgical valid,
  - adversarial impossible.
- Add separate structural validity, rule reachability, and population plausibility reports.
- Add exact boss phase, attack frame, wave composition, blade state, ability state, UI state, device state, and environment factories.
- Generate threshold-minus/at/plus boundary scenarios.
- Implement checkpoint banks, event-sourced deltas, state migration, and deterministic forks.
- Implement the canonical Hard Endless wave-99 Hammer scenario.

**Exit gate**

- The wave-99 command produces a legal ledger, exact opportunity counts, configuration trace, validation report, visible episode, snapshot, replay, and metrics.
- Every boss phase and declared ability boundary launches from a clean process.
- One checkpoint forks into 1,000 variants while unchanged semantic fields remain equal.
- P2 is achieved: any-point simulation is credible.

---

## C7 — Scripted Policy Foundation and Agent Hierarchy

**Goal:** Produce a deterministic real-game player before neural training.

**Deliverables**

- Implement explicit orchestrator, journey, menu, run strategy, tactical combat, blade motor, movement, draft, recovery, critic, and invariant-sentinel boundaries.
- Generalize existing `player.aiInput` and `blade.aimOverride` seams through typed ports.
- Port attract-mode competence into real combat scenarios.
- Add target selection, threat ranking, navigation, blade arcs, throw/recall, parry, recovery, draft heuristics, and boss modules.
- Add initial profiles:
  - smoke,
  - competent,
  - style,
  - survival,
  - chaos,
  - menu,
  - transition hunter.
- Record structured objectives, targets, maneuver intent, confidence, recovery, and observation class.

**Exit gate**

- Scripted policies exercise every core blade mechanic.
- The competent policy clears representative early waves without privileged state mutation.
- Scripted results are deterministic under fixed engineering observations.

---

## C8 — Visible Player-Journey Autonomy

**Goal:** Prove the real shipped interface and run lifecycle work from menu to menu.

**Deliverables**

- Implement the Journey Director state machine and transition watchdogs.
- Support real UI selection of mode, difficulty, weapon, draft, tier, continue, result, replay, and return.
- Preserve three labeled execution classes:
  - Class A training,
  - Class B engineering,
  - Class C black-box player certification.
- Add visible watch mode with optional intent overlay.
- Add physical keyboard/mouse, controller, and touch adapters for Class C.
- Add structured/pixel/semantic UI observation parity checks.
- Implement mode-specific contracts for Tutorial, Adventure, Endless, Gauntlet, Playground, Boss Test, and Enemy Test.

**Exit gate**

- Agent starts from the real menu, starts Adventure, clears a wave, selects a real draft, clears the next wave, defeats a stage boss, processes evolution, and returns through valid UI states.
- Easy Adventure completes visibly from menu to menu.
- Normal Adventure reaches statistically reliable completion before being called certified.
- Engineering and black-box results are reported separately.

---

## C9 — Regression Intelligence and Graveyard MVP

**Goal:** Convert autonomous discoveries into minimal permanent evidence.

**Deliverables**

- Compare base and candidate builds with identical scenarios, seeds, policies, and starting hashes.
- Identify first material semantic divergence separately from downstream effects.
- Add timeline, action, state, entity, build, and RNG minimizers.
- Add stable failure signatures and clustering.
- Add multi-policy adjudication to distinguish product, policy, instrumentation, and infrastructure failures.
- Add changed-file ownership routing and root-cause hints.
- Add optional commit bisection for stable reproductions.
- Create Ghost Graveyard storage for original failure, minimal child, fix commit, invariant, ownership, and reopen history.

**Exit gate**

- A planted gameplay regression is found, reproduced, minimized, attributed, fixed, and retained as a permanent regression test.
- Minimization verifies the failure repeatedly rather than accepting a one-off result.
- P3 is achieved: visible autonomous QA produces engineering-grade evidence.

---

## C10 — Ghost 3.0 Truth Kernel

**Goal:** Add the new causal format beside Ghost 2.0 without breaking legacy playback.

**Deliverables**

- Define Replay Trident capability declarations:
  - Command truth,
  - State truth,
  - Visual truth.
- Define Trident precedence and degradation rules.
- Define the universal integer-tick `GhostTimeline`.
- Add canonical event ontology and typed payload schemas.
- Add causal parent/child relationships and queries.
- Define Ghost Quality Card dimensions independently.
- Add composable recording-profile negotiation and track-survival priority.
- Preserve V1/V2 adapters with honest Legacy Visual classification.
- Add automated record, seek, zero-modification fork, practice, export/import, and migration round-trip invariants.

**Exit gate**

- Existing legacy fixtures remain watchable and cannot receive invented verification.
- A supported V3 fixture passes all declared round-trip invariants.
- Fidelity, integrity, compatibility, completeness, seekability, resumability, eligibility, coaching richness, creator richness, and privacy are separate outputs.

---

## C11 — Ghost Capsule, Recorder, and Local Vault

**Goal:** Record long causal runs safely and offline without unbounded memory.

**Deliverables**

- Implement the `.tearghost` manifest, chunk index, independent checksums, root integrity, and debug JSON view.
- Record canonical actions at the semantic input boundary.
- Record RNG streams, authoritative events, result ledger, keyframes, and optional presentation tracks.
- Add worker-based encoding, compression, hashing, and thumbnail preparation.
- Add backpressure measurement and declared fidelity downgrade behavior.
- Add IndexedDB stores for manifests, chunks, assets, indexes, upload jobs, analysis, lineage, and settings.
- Add crash-safe journaling, incomplete-session recovery, quota management, retention tiers, export, and hostile import validation.
- Add Ghost Doctor scan, health report, repair-child creation, quarantine, and index rebuild.

**Exit gate**

- A long run streams to local storage without full-run serialization or unbounded memory.
- Refresh recovers the last committed session.
- Corrupt chunks are detected and isolated without preventing Vault startup.
- Import limits stop malformed, oversized, and decompression-bomb fixtures.

---

## C12 — Replay World, Theater, Practice, and Comparison

**Goal:** Make causal timelines useful to players and developers.

**Deliverables**

- Build isolated replay-world playback using shared state codecs.
- Implement deterministic seek, keyframe warmup, disclosed correction, and presentation fallback.
- Add Theater transport, layered timeline, semantic event navigation, cameras, accessibility, and mobile layouts.
- Add modular Ghost Lens registry with public/ranked/developer visibility gates.
- Implement Practice From Here with transactional restore, input-latch policy, immutable lineage, and eligibility firewall.
- Add exact practice, repetition drill, counterfactual sandbox, race practice, and coach-assisted modes.
- Add event-aligned two-run and N-way comparison plus trajectory diff.

**Exit gate**

- Full replay and seek-to-tick produce equal semantic hashes.
- Practice From Here creates a safe unranked child and never mutates the source.
- Public Theater cannot enable a privileged developer Lens.
- Nine runs can be aligned by semantic event without relying only on wall time.

---

## C13 — Ghost Knowledge Libraries and Bidirectional Scenario Bridge

**Goal:** Turn run history into governed compounding engineering knowledge.

**Deliverables**

- Implement separate governance and storage for:
  - Ghost Canon,
  - Ghost Graveyard,
  - Ghost Frontier,
  - Ghost Corpus.
- Add lineage graph nodes and edges for migration, repair, clip, fork, challenge, correction, scenario, minimization, training, and promotion.
- Compile compatible Ghost ranges into TearSDL with sanitized private data and required causal history.
- Record TearSDL executions back into child Ghost capsules.
- Promote reviewed reference runs into Canon.
- Triage novel rare states into Frontier.
- Enforce consent, provenance, deduplication, split assignment, and hidden-holdout protection in Corpus.

**Exit gate**

- A human or agent failure becomes both a minimal deterministic TearSDL scenario and a watchable child Ghost.
- Scenario execution produces a capsule with complete state-class and branch provenance.
- Canon, Graveyard, Frontier, and Corpus cannot be silently mixed.
- P4 is achieved: Ghost 3.0 has trustworthy local product and engineering value.

---

## C14 — Headless Simulation and Scale

**Goal:** Execute large scenario and policy populations without browser rendering.

**Deliverables**

- Extract remaining deterministic simulation ownership behind DOM-free ports.
- Add Node or worker headless runner and parallel environment pool.
- Preserve the browser runtime as the authority for presentation and Class C certification.
- Add browser/headless parity corpus.
- Add batched observation/action transport and bounded artifact sampling.
- Add throughput, memory, and determinism benchmarks.

**Exit gate**

- Headless and browser-fast runs match semantic outcomes for the golden parity suite.
- Parallel episodes do not share RNG, state, persistence, or action buffers.
- Episode throughput supports practical fuzzing and initial training.

---

## C15 — Agent Academy and Demonstration Corpus

**Goal:** Create a measurable teaching and correction pipeline.

**Deliverables**

- Add canonical lessons for movement, blade, defense, enemies, bosses, strategy, and interface.
- Record synchronized observation, action, event, reward-component, build, device, and provenance tracks.
- Add demonstration review, tags, deduplication, quality scoring, and consent propagation.
- Deliberately collect recovery demonstrations.
- Add human takeover and policy-correction segments.
- Add behavior-cloning dataset export and immutable manifests.
- Keep training, validation, calibration, and hidden release exams separate.

**Exit gate**

- Every recorded training sample resolves to a valid capsule interval and consent state.
- Demonstrations survive encode/decode without action/observation drift.
- A first behavior-cloned policy passes unseen lesson seeds and defined recovery cases.

---

## C16 — TearBot Ladder and Agent Foundry

**Goal:** Produce measured human-like levels and a safe improvement loop.

**Deliverables**

- Implement multidimensional Astuteness Vector and bounded-rationality compiler.
- Enforce the human-like information firewall for Levels 1-9.
- Keep game difficulty, mechanical skill, strategic astuteness, and QA aggression orthogonal.
- Add provisional synthetic Levels 1-9 and explicit Level Omega.
- Fit multidimensional scenario item-response ratings.
- Add monotonicity, adjacent-level separation, human-likeness, per-domain, per-weapon, per-mode, and per-difficulty reports.
- Add human anchoring only from separately consented population data.
- Implement Agent Foundry weakness mining, curriculum generation, teacher selection, challenger training, holdout evaluation, promotion, archive, monitoring, and rollback.
- Freeze reward definitions, invariants, and release exams outside automatic policy modification.

**Exit gate**

- Nine public levels are statistically ordered and visibly distinguishable on hidden holdouts.
- Level 9 remains within declared human-like information and reaction limits.
- Level Omega is unmistakably labeled privileged.
- One Foundry cycle identifies a weakness, trains a challenger, evaluates regressions, and promotes or rejects it with reproducible evidence.
- P5 is achieved: policy intelligence can improve without weakening trust.

---

## C17 — Ghost Coach and Replay-to-Practice Learning Loop

**Goal:** Turn structured replay evidence into targeted player improvement.

**Deliverables**

- Implement deterministic analyzers for movement, blade, defense, targeting, draft, boss, and run-management findings.
- Require each finding to reference range, events, metrics, confidence, baseline, and suggested drill.
- Add personal, peer-band, same-build, TearBot, and expert baselines.
- Add draft regret through State Forge counterfactual rollouts with uncertainty.
- Add one-fix priority and longitudinal skill graph.
- Use language models only to explain structured findings, never to invent them.
- Compile high-confidence findings into legal repeatable drills.

**Exit gate**

- Every numerical coaching claim is reproducible from tracks.
- Every suggested drill restores a legal state and available action set.
- Cosmetic-only replay changes cannot alter coaching conclusions.
- Repeated drills change the measured target skill in the expected direction before improvement claims are made.

---

## C18 — Challenges, Studio, and Player Experiences

**Goal:** Build player-facing value on top of trusted local truth.

**Deliverables**

- Add Chase Your Best, seed-locked races, Beat This Run, Boss Memory, Daily Echo, Learning Ghosts, Nemesis Ghosts, and TearBot reference ghosts.
- Add challenge proof manifests and attempt lineage.
- Add safe, noninteractive live Ghost overlay fairness rules.
- Add non-destructive Studio edit decision lists, cameras, captions, aspect ratios, thumbnails, and local media export.
- Add Run DNA from transparent metrics.
- Add Personal Nemesis/The Echo behavior distillation through bounded authored move grammars.

**Exit gate**

- A challenge attempt proves its source, rules, seed policy, conditions, and attempt capsule.
- Studio edits never rewrite the parent timeline.
- A polished clip can be generated locally without screen recording.
- Live Ghost overlays cannot reveal future or hidden information.

---

## C19 — Cloud Publication, Verification, Privacy, and Moderation

**Goal:** Share and verify capsules without making local recording cloud-dependent.

**Deliverables**

- Split searchable metadata from binary object storage.
- Add resumable chunk uploads, atomic finalization, partial download, deletion, visibility, and cross-device metadata sync.
- Add structural, integrity, compatibility, simulation, result, anomaly, and moderation validation stages.
- Add trusted historical-runtime verification and signed versioned verdicts.
- Add explicit eligibility records for resumed, modded, coached, Ghost-assisted, bot, debug, and State Forge runs.
- Add privacy classification, sanitization, pseudonymous identity, separate training consent, rate limits, reporting, blocking, audit, and appeals.
- Add delayed immutable Ghost Relay only after ordinary recording is reliable.

**Exit gate**

- Incomplete uploads never appear as valid public runs.
- Tampering changes integrity status.
- Unsupported builds fail honestly rather than receiving false verification.
- Imported or State Forge runs cannot masquerade as eligible human records.
- Deletion, visibility, and consent changes follow documented policy.

---

## C20 — Preservation, CI, and Release Certification

**Goal:** Make the program a durable part of how Tear is built and operated.

**Deliverables**

- Preserve historical runtime packages, stable aliases, tombstones, migration fixtures, and golden replay corpus.
- Add operational dashboards for recorder health, storage, drift, verification, seek, practice, scenario compilation, and policy calibration.
- Add local, PR, nightly, weekly endurance, and release-candidate suites.
- Add diff-aware scenario, Canon, Graveyard, and interaction-matrix selection.
- Add browser, input, platform, viewport, frame-rate, network, interruption, performance, and long-run matrices.
- Create the `tear-autonomous-playtester` Codex Skill only after stable CLI/tool contracts exist.
- Update `docs/FEATURE_INVENTORY.md` as each credible capability gains evidence.
- Preserve earlier architectural decisions and mark superseded decisions explicitly.

**Exit gate**

- A gameplay PR automatically receives focused deterministic scenarios, relevant Graveyard cases, a journey checkpoint, and a base comparison.
- Release certification covers full journeys and directly affected arbitrary states.
- Historical supported capsules retain honest playback and verification status.
- A coding agent can select, run, interpret, minimize, and report the correct evidence without pretending unrelated unit tests constitute gameplay validation.
- P6 is achieved: TearBench and Ghost are trusted development and player infrastructure.

---

## 6. Immediate Implementation Queue

Only the following work should begin before C0-C1 are approved:

1. Add the source vision to repository documentation.
2. Create the requirement/gap ledger.
3. Inventory current replay, action, RNG, fixed-step, state, UI, browser-journey, persistence, and legacy Ghost contracts.
4. Decide whether current `ReplayEnvelopeV2` evolves into the Command-truth arm or is wrapped by a new Ghost 3.0 manifest.
5. Define `TearObservationV1`, `TearEventV1`, `TearScenarioV1`, `TearSnapshotV1`, and `TearFailureArtifactV1`.
6. Define stable event/entity registries and within-tick phase ordering.
7. Audit gameplay randomness for unowned or cosmetic-coupled calls.
8. Design the development-only composition root and production-absence check.
9. Select the first seven canonical engineering scenarios from C3.
10. Create the first checkpoint review report.

Do not begin neural training, cloud publication redesign, social discovery, coaching narrative, cinematic Studio work, or Agent Foundry automation before their dependency gates pass.

---

## 7. Checkpoint Review Template

Every checkpoint review should use this format:

```markdown
# Checkpoint Cx Review

## Outcome
- achieved | partial | blocked

## Delivered
- contract or capability

## Evidence
- deterministic tests
- contract tests
- browser journeys
- artifact links
- benchmark results

## Gate Results
- gate: pass/fail with exact evidence

## Regressions and Compatibility
- Ghost 2.0
- production isolation
- platform targets
- persistence
- performance

## Known Gaps
- explicit unresolved issue

## Decision
- proceed
- remediate before proceeding
- revise architecture with recorded rationale
```

---

## 8. Definition of Progress

Progress is not measured by module count, policy reward, UI screenshots, or roadmap percentage alone.

Progress is measured by new trustworthy claims such as:

- “This scenario reproduces from the same seed and action stream.”
- “This snapshot restores and produces the same next 600 ticks.”
- “This wave-99 build consumed exactly the legal earned opportunities.”
- “This agent completed the real visible journey.”
- “This failure was minimized and now lives in Graveyard.”
- “This replay declares and proves the truth layers it contains.”
- “This practice fork is state-correct and permanently ineligible for ranked submission.”
- “These TearBot levels are statistically separated on hidden exams.”
- “This challenger improved the target weakness without regressing frozen gates.”

The program should advance only when its evidence becomes stronger, not merely when its surface area becomes larger.
