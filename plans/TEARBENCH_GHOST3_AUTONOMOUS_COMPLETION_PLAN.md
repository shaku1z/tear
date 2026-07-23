# TearBench, TearBot, State Forge, and Ghost 3.0 Autonomous Completion Plan

**Status:** Proposed recovery and completion program
**Created:** 2026-07-23
**Source authority:** `TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN(3).md`, version 0.6, SHA-256 `007BE22193F5369B8450AAB33B95C6D3080176E6B2F91A1D504B545CA7FC7DDE`
**Supersedes for completion claims:** `plans/TEARBENCH_GHOST3_ACTION_PLAN.md`
**Purpose:** Convert every remaining part of the original vision into executable work, with gates that require real integration and user-visible outcomes.

---

## 1. Why This Plan Exists

The C0-C20 program created a broad typed scaffold: contracts, pure algorithms,
in-memory services, test fixtures, and repository commands. That work is useful,
but its checkpoint reports repeatedly treated synthetic unit tests as proof of
finished gameplay systems.

The clearest example is the TearBot learning path:

- `trainBehaviorClonedPolicy` creates an in-memory majority-vote lookup table.
- `compileTearBotLevel` creates fixed synthetic difficulty presets.
- `TearAgentFoundry.runCycle` evaluates a challenger supplied by its caller.
- No component records real gameplay into a persisted training corpus.
- No trainer creates a model from real episodes.
- No policy artifact is saved, versioned, loaded, or executed by the live game.
- No scheduler autonomously mines weaknesses, trains, evaluates, promotes, and
  rolls back policies.
- No player-facing or developer-facing Foundry screen can start, stop, watch, or
  inspect learning.

Similar integration gaps exist in State Forge, Ghost recording/playback, browser
autonomy, cloud publication, and release certification. This plan preserves the
existing prototypes as foundations while reopening every outcome that lacks
real evidence.

The original v0.6 design remains normative. This plan does not shorten or
replace its product intent. Section 15 maps every one of its 81 top-level
sections to implementation checkpoints.

---

## 2. Completion Vocabulary

Every requirement must be labeled with exactly one of these states:

| State | Meaning |
|---|---|
| `contract` | Types or interfaces exist, but no production implementation is proven. |
| `prototype` | A narrow or in-memory implementation demonstrates an algorithm. |
| `integrated` | The production composition root executes the capability. |
| `visible` | A person can use or watch it through the intended interface. |
| `certified` | Canonical deterministic, browser, preservation, and release evidence passes. |
| `deferred` | Intentionally excluded with owner, reason, dependency, and revisit gate. |
| `rejected` | Intentionally not implemented, with an architectural/product rationale. |

The words `complete`, `implemented`, and `supported` may only be used for a
requirement at the state demanded by its checkpoint exit gate.

### Evidence rules

1. Unit tests prove local contracts only.
2. Synthetic policies do not prove real gameplay competence.
3. A type named `Recorder`, `Vault`, `Trainer`, `Foundry`, `Cloud`, or
   `Certificate` does not prove the corresponding operational system exists.
4. An in-memory adapter does not prove IndexedDB, filesystem, R2, D1, worker, or
   cross-session behavior.
5. Class A training and Class B engineering evidence cannot be reported as
   Class C black-box certification.
6. Headless results cannot substitute for a visible shipped journey.
7. A generated certificate object cannot certify a release unless it consumes
   successful canonical evidence from the exact intended commit.
8. No policy can promote itself by changing rewards, invariants, scenarios,
   hidden exams, thresholds, or game rules.

---

## 3. Non-Negotiable Finished Experience

When the program is genuinely complete, a developer can open Tear and use a
visible Ghost Lab / Agent Foundry experience without orchestrating shell
commands.

They can:

1. Create or select a training program for TearBot Level 1-9 or Omega.
2. Choose allowed data sources, consent scope, curriculum, compute budget, and
   stop conditions.
3. Start, pause, resume, cancel, and recover a training run.
4. Watch live or sampled training episodes at normal speed or accelerated speed.
5. Inspect observations, chosen actions, objectives, rewards, uncertainty,
   failures, and policy lineage.
6. See the system automatically identify weaknesses, generate lessons, choose
   teachers, train a challenger, run holdouts, and compare it with the champion.
7. See a challenger promoted only after deterministic, statistical,
   human-likeness, regression, and hidden-exam gates pass.
8. See automatic rollback when post-promotion monitoring detects degradation.
9. Load the promoted policy in actual gameplay and watch it complete real
   menu-to-menu journeys.
10. Record those runs as genuine Ghost 3.0 capsules, seek them, compare them,
    practice from them, turn failures into scenarios, and retain regressions.

Normal use is UI-driven and automatic. CLI commands and APIs remain available
for CI, debugging, reproducibility, and expert automation.

---

## 4. Audited Starting Point

| Area | Current credible state | Required end state |
|---|---|---|
| Shared contracts | Contract/prototype | Versioned contracts used by live runtime, tools, storage, and migrations |
| Deterministic runner | Prototype runner over supplied transitions | Production simulation adapter with real actions, observations, state, events, and hashes |
| Scenarios | Small JSON registry and pure helpers | Full authored/mutated registry covering gameplay, journeys, devices, platforms, and arbitrary state |
| State Forge | Data-only codecs and synthetic packages | Complete live-world capture, transactional restore, reachability, synthesis, time travel, and Studio |
| Scripted bot | Deterministic decision modules | Real live-game policy with full journey, combat, build, recovery, and device adapters |
| Browser autonomy | Narrow scripted browser journey | Class B full journey plus Class C pixel/physical-input certification |
| Regression intelligence | Pure comparison/minimization helpers | Automated rerun, stability confirmation, minimization, attribution, Graveyard retention, and bisect |
| Ghost truth | V3 types and pure timeline functions | Authoritative recorder connected to simulation boundaries and isolated playback world |
| Ghost Vault | Memory-capable service contracts | Durable IndexedDB storage, worker encoding, crash recovery, quota management, import/export, and Doctor |
| Theater/practice | Transport and comparison helpers | Complete accessible UI with seek, lenses, cameras, comparisons, possession, forks, and playback modes |
| Headless execution | Generic environment abstraction | Real DOM-free Tear environment with parity evidence and scalable worker orchestration |
| Academy | In-memory reviewed samples and lookup BC | Durable consent-aware corpus, real encoders, trainer jobs, corrections, splits, manifests, and recovery lessons |
| TearBot levels | Synthetic formulas | Measured policy distributions calibrated to stable human-like level envelopes |
| Foundry | Caller-supplied score comparison | Autonomous closed loop that actually creates, trains, evaluates, promotes, monitors, and rolls back policies |
| Coach/challenges/Studio | Pure domain helpers | Player-visible experiences driven by verified Ghost evidence |
| Cloud | Contracts, schema, and Worker prototype | Authenticated resumable publication, trusted verification, moderation, privacy, discovery, and deletion |
| Preservation/release | Manifest and certificate helpers | Historical runtimes/corpus plus automated release evidence from the exact commit |

---

## 5. Program Plateaus

| Plateau | Checkpoints | Outcome |
|---|---|---|
| P7 — Truthful Baseline | C21-C22 | All prior claims are audited; contracts are wired to the real runtime. |
| P8 — Real Autonomous QA | C23-C26 | State Forge, scripted autonomy, and regression intelligence operate on real Tear gameplay. |
| P9 — Operational Ghost 3.0 | C27-C30 | Real runs record, persist, replay, seek, fork, compare, and survive restarts. |
| P10 — Autonomous Learning | C31-C36 | Real data trains real policies; Foundry improves them automatically and visibly. |
| P11 — Player and Cloud Product | C37-C39 | Coach, challenges, Studio, publication, verification, privacy, and operations are usable. |
| P12 — Final Certification | C40 | The entire original vision has traceable evidence and an honest final release certificate. |

No later plateau may be called complete while an earlier dependency is only a
contract or prototype.

---

## 6. Checkpoint Plan

## C21 — Truth Audit, Requirement Recovery, and Evidence Reset

**Goal:** Establish an accurate baseline and prevent prototype code from being
reported as a finished system.

**Deliverables**

- Import every requirement from all 81 top-level source sections into a
  machine-readable requirement registry with stable IDs.
- Link every requirement to its source section and, when applicable, subsection.
- Audit existing files, tests, commands, browser flows, storage adapters,
  workers, screens, and artifacts.
- Replace optimistic `implemented` labels with the completion vocabulary from
  Section 2.
- Mark C0-C20 checkpoint reports as historical scaffold reports, not current
  completion evidence.
- Record the missing owner, dependency, target surface, evidence class, and
  acceptance test for every partial requirement.
- Add a documentation check that rejects:
  - a certified requirement without an artifact,
  - an integrated requirement with no production composition path,
  - a visible requirement with no browser journey,
  - a learned-policy claim backed only by synthetic scores.
- Create a capability dashboard generated from the registry.

**Automation**

- CI regenerates and diff-checks the capability dashboard.
- Changed source paths invalidate affected evidence and move the capability back
  to `integrated` or `visible` until certification reruns.

**Exit gate**

- Every source requirement has a stable ID and disposition.
- Every current completion claim points to evidence at the required layer.
- The known Academy/Foundry misclassification is corrected.
- No requirement is silently dropped because it is expensive, UI-heavy,
  cloud-dependent, or ML-dependent.

---

## C22 — Real Tear Runtime Bridge and Observation/Action Contract

**Goal:** Make TearBench and policies control the actual typed Tear runtime,
instead of caller-authored transition fixtures.

**Deliverables**

- Implement a test-only `TearRuntimeEnvironment` around the real application,
  run lifecycle, simulation, gameplay, input, and event systems.
- Map every `GameAction` to the authoritative gameplay-consumption boundary.
- Produce `TearObservationV1` from a documented observation projection rather
  than fabricated test objects.
- Expose reset, observe, fixed-tick step, action batch, pause, resume, terminate,
  metrics, events, screenshots, and state hashes.
- Implement named gameplay RNG streams and record their algorithms, seeds, and
  cursors.
- Separate Class A privileged, Class B structured, and Class C public
  observations through mechanically enforced adapters.
- Connect disposable persistence, achievements, analytics, leaderboards, ads,
  account, cloud, and Remote Config adapters.
- Compile the bridge into test/developer builds only.
- Prove production bundles expose no writable test surface.

**User-visible outcome**

- Ghost Lab can launch a real disposable run and show live observation, action,
  event, RNG, and invariant panels.

**Exit gate**

- A real run resets and executes deterministically from a clean process.
- Identical initial state, semantic actions, configuration, and RNG produce
  identical semantic hashes across 30, 60, 144, and uncapped render profiles.
- No test execution mutates a real profile or external service.
- Production-artifact inspection proves the bridge is absent.

---

## C23 — Production-Grade State Forge and Progression Truth

**Goal:** Capture, validate, restore, synthesize, and fork actual Tear states at
any supported point.

**Deliverables**

- Replace data-only codecs with codecs for every live player, blade, run,
  enemy, boss, projectile, platform, hazard, reward, UI, configuration, and RNG
  subsystem.
- Use approved factories and stable IDs to rebuild references transactionally.
- Implement canonical progression ledger events using the production scheduler
  and draft/tier rules.
- Reconstruct configuration mutations in production order.
- Implement all five state classes:
  recorded canonical, reconstructed reachable, plausible population, surgical
  valid, and adversarial impossible.
- Implement structural validity, rule reachability, and population plausibility
  as separate reports.
- Add historical build synthesis, exact earned-pick counts, draft histories,
  tiers, coherent health/time/score/economy, archetype policies, low-roll,
  anti-synergy, coverage, and corruption profiles.
- Implement exact wave, enemy composition, boss phase, boss attack frame,
  blade state, ability state, UI state, device state, and one-frame boundary
  factories.
- Implement checkpoints, event deltas, time travel, migration, state banks,
  branch forks, and counterfactual rollouts.
- Build State Forge Studio with scenario editor, validation, provenance,
  timeline, diff, fork, watch, and export.

**Exit gate**

- Capture any supported live combat frame, recreate a clean runtime, restore it,
  and match the next 600 ticks under identical actions.
- Generate 10,000 legal progression targets without opportunity, unique, tier,
  or configuration errors.
- The canonical Hard Endless wave-99 Hammer case launches visibly with a legal
  ledger, exact pick count, validation, snapshot, Ghost, and metrics.
- Every boss phase and declared one-frame boundary launches from a clean process.
- Failed restoration never partially mutates the active world.

---

## C24 — Full Scripted Agent and Hierarchical Journey Autonomy

**Goal:** Deliver a competent deterministic player that operates the real game
before learned policies are trusted.

**Deliverables**

- Wire orchestrator, Journey Director, menu navigator, run strategist, tactical
  combat, blade motor, movement, draft, recovery, critic, invariant sentinel,
  and long-horizon memory to live observations and actions.
- Implement target selection, threat ranking, navigation, platforms, dash,
  jumps, every blade mechanic, throw/recall, parry, stolen-blade recovery,
  projectiles, enemy families, bosses, build selection, tier evolution, and
  run-result handling.
- Encode existing special cases and mode contracts for Tutorial, Adventure,
  Endless, Gauntlet, Playground, Boss Test, and Enemy Test.
- Add smoke, competent, style, survival, chaos, transition-hunter, menu,
  hardware, performance, behavioral, and QA-adversary personas.
- Record structured intent, objective, target, maneuver, confidence, recovery,
  critic feedback, and visible-information class.
- Add watchdogs for transitions, no-progress, softlocks, repeated inputs,
  loading, pause, focus, disconnects, and terminal states.

**User-visible outcome**

- A Watch Agent control starts the selected policy from the actual menu, with
  optional intent and observation overlays.

**Exit gate**

- The competent scripted agent completes Easy Adventure menu-to-menu through
  real UI transitions.
- It exercises every weapon and core blade mechanic in real simulation.
- Mode-by-difficulty journey contracts produce artifacts and honest failures.
- The run is repeatable under the same seed and engineering observation class.

---

## C25 — Physical Input and Black-Box Certification

**Goal:** Prove Tear can be played through the same visible information and
physical controls available to a person.

**Deliverables**

- Implement keyboard/mouse, controller, and touch emitters against production
  device adapters.
- Build a pixel observation pipeline with viewport calibration, UI detection,
  world perception, confidence, temporal tracking, and occlusion handling.
- Keep pixel, semantic UI, structured state, and event channels independently
  switchable and labeled.
- Add observation-parity cases that detect test-only advantages.
- Cover focus, remapping, gamepad disconnect/reconnect, touch geometry,
  responsive layouts, reduced motion, pause, lifecycle interruptions, iframe,
  PWA, and CrazyGames.
- Define statistically meaningful Class C pass rates, confidence intervals, and
  retry/flakiness rules.

**Exit gate**

- A Class C agent starts from a clean shipped build, navigates real menus,
  plays, drafts, reaches a terminal result, and returns using only pixels and
  physical player-valid input.
- Normal Adventure certification meets its declared success distribution.
- Reports never merge Class A, B, and C evidence.

---

## C26 — Real Regression Discovery, Reproduction, and Graveyard

**Goal:** Turn autonomous gameplay failures into minimized permanent evidence.

**Deliverables**

- Execute base and candidate commits with identical build inputs, state,
  scenario, seed, actions/policy artifact, and observation class.
- Detect the first material semantic divergence before downstream effects.
- Reproduce repeatedly before minimization.
- Minimize timeline, actions, state, entities, build, RNG, and presentation.
- Cluster stable signatures and retain occurrence histories.
- Use multiple policies and invariant evidence to distinguish product, policy,
  instrumentation, infrastructure, and inconclusive failures.
- Generate root-cause hints from ownership, event causality, state diff, and
  changed paths.
- Add guarded automatic git bisection for stable local reproductions.
- Persist original failure, minimal child, fix commit, invariant, ownership,
  reopen history, and runnable scenario in the Ghost Graveyard.

**Exit gate**

- A deliberately planted gameplay regression is autonomously discovered,
  reproduced, minimized, attributed, fixed, and retained.
- The minimized case reruns from its artifact in a clean process.
- The corresponding future change selection automatically includes the
  Graveyard case.

---

## C27 — Authoritative Ghost 3.0 Recorder and Capsule

**Goal:** Record real runs as durable causal truth without altering Ghost 2.0.

**Deliverables**

- Connect action recording after device mapping and before gameplay consumption.
- Record integer simulation ticks, within-tick phases, monotonic sequences,
  stable entity/event IDs, RNG streams, results, configuration, and provenance.
- Implement Replay Trident tracks: Command truth, State truth, and Visual truth.
- Implement canonical event ontology, typed payloads, causal graph, quality
  dimensions, and recording-profile negotiation.
- Implement explicit codec registry keyframes and adaptive keyframe cadence.
- Build binary chunk encoding in a real worker with independent checksums,
  integrity root, chunk indexes, compression limits, and random access.
- Add backpressure, bounded memory, adaptive fidelity, circular instant-replay
  buffer, lifecycle flush, crash-safe journaling, and run-resume policy.
- Define Compact Public, Coaching, Forensic QA, and Cinematic profiles.
- Preserve Ghost V1/V2 adapters and honest fidelity/degradation labels.

**Exit gate**

- A real full run records with measured overhead inside declared CPU, memory,
  and storage budgets.
- Refresh/crash recovery yields either a valid recoverable capsule or an
  explicitly quarantined incomplete record.
- Record-to-replay, seek, fork, practice, export/import, and migration
  round-trip invariants pass on real capsules.
- V1/V2 playback remains unchanged and is never relabeled as exact V3 truth.

---

## C28 — Durable Ghost Vault, Doctor, and Knowledge Libraries

**Goal:** Make Ghost memory durable, inspectable, repairable, governed, and
safe across sessions.

**Deliverables**

- Implement IndexedDB stores for manifests, chunks, assets, indexes, journals,
  upload jobs, analysis, lineage, settings, and quarantine.
- Add retention tiers, quota forecasting, eviction rules, pinning, deduplication,
  content addressing, and atomic deletion.
- Implement hostile import limits, schema validation, checksums, expansion
  limits, quarantine, and non-mutating repair children.
- Add Ghost Doctor scanning, health reports, index rebuild, missing-chunk
  diagnosis, migration, repair, export, and support bundle generation.
- Implement durable Canon, Graveyard, Frontier, and Corpus governance.
- Implement complete lineage nodes/edges for migration, repair, clip, fork,
  practice, challenge, correction, scenario, minimization, training, and
  promotion.
- Implement Ghost range-to-TearSDL and TearSDL execution-to-Ghost bridges with
  causal-history closure and privacy sanitization.
- Build the Vault health dashboard and search/filter experience.

**Exit gate**

- Records survive browser restart, version migration, quota pressure, and
  interrupted writes.
- Corrupt imports cannot execute code, exhaust configured limits, or overwrite
  originals.
- Doctor repairs create lineage-linked children and preserve originals.
- Canon/Graveyard/Frontier/Corpus policies are enforced by durable storage.

---

## C29 — Ghost Replay World, Theater, Comparison, and Practice

**Goal:** Turn capsules into a complete, accessible replay and practice product.

**Deliverables**

- Build an isolated replay world using shared production codecs and simulation.
- Implement deterministic keyframe seek, warmup, correction disclosure,
  backwards stepping, reverse playback support, and presentation fallback.
- Implement speed, pause, frame/tick step, event jump, bookmarks, ranges,
  camera control, HUD/layer visibility, and mobile controls.
- Implement public/ranked/developer Ghost Lenses with required-track and privacy
  gates.
- Add overlay, split screen, event-aligned comparison, difference view, N-way
  comparison, and trajectory diff.
- Implement instant replay, Possess the Ghost, branching timelines, Practice
  From Here, safe input-latch clearing, and competitive eligibility changes.
- Add automatic highlights, captions, commentary hooks, clips, accessibility,
  and non-destructive edit lineage.

**Exit gate**

- A player can open a real capsule, seek repeatedly to the same semantic hash,
  compare runs, create a range, practice from it, and return without mutating
  the source capsule or production profile.
- Comparison supports at least nine runs and repeated semantic occurrences.
- UI passes keyboard, controller, touch, responsive, reduced-motion, and screen
  reader checks applicable to the canvas/shell architecture.

---

## C30 — Real Headless Tear and Scalable Episode Fabric

**Goal:** Run the production gameplay core at training and fuzzing scale without
the DOM.

**Deliverables**

- Extract or adapt the real deterministic simulation behind a DOM-free
  environment factory.
- Match browser-fast semantic transitions, event order, rewards, terminal
  conditions, state hashes, and action cadence.
- Implement isolated worker processes/threads, batching, cancellation, timeout,
  retries, seeding, checkpoint restore, and bounded artifact sampling.
- Prevent shared RNG, state, action buffers, persistence, configuration, or
  global caches across environments.
- Add throughput, latency, memory, leak, long-run, and deterministic-replay
  benchmarks.
- Provide episode streaming to Academy and Foundry with backpressure.

**Exit gate**

- The golden parity corpus matches the browser runtime semantically.
- Parallel episodes are isolation-tested under stress.
- Throughput supports the declared initial BC/DAgger/RL budgets on target
  developer hardware.
- Every sampled failure can be rerun visibly in the browser from its artifact.

---

## C31 — Durable Academy Corpus and Consent Pipeline

**Goal:** Automatically turn eligible real play into governed, reviewable
training data.

**Deliverables**

- Record synchronized observation, action, event, reward-component, intent,
  build, device, timing, provenance, and capsule-range tracks.
- Define feature schemas and action vocabularies with versioned encoders.
- Implement consent states separately for local recording, cloud publication,
  analytics, and model training.
- Add opt-in/out, revocation, deletion propagation, privacy classification, and
  pseudonymous identity.
- Implement quality scoring, deduplication, outlier detection, corruption
  checks, style/skill metadata, human/bot/hybrid provenance, and population
  balance.
- Capture deliberate success, failure, recovery, intervention, human takeover,
  and policy-correction segments.
- Enforce immutable train, validation, calibration, test, and hidden-exam splits
  at player/session/seed lineage boundaries.
- Build an Academy interface for lesson status, recordings, review, corrections,
  consent, split manifests, and storage.

**Automation**

- Eligible sessions are ingested after recording finalization.
- Invalid, revoked, duplicated, or low-quality segments are excluded without
  destroying their audit history.
- Corpus updates create immutable versioned manifests.

**Exit gate**

- A real human or scripted session becomes a persisted reviewed sample tied to
  an exact capsule range.
- Encode/decode round trips preserve observations and actions.
- Revoked data is absent from all future training manifests.
- Hidden exams cannot be read by ordinary trainer code.

---

## C32 — Versioned Policy Runtime and Artifact Registry

**Goal:** Define what actually learns and make trained policies loadable by the
real game.

**Deliverables**

- Define `TearPolicyArtifactV1` with model format, architecture, encoder,
  action schema, observation class, recurrent state, normalization, training
  manifest, reward version, code/build identity, metrics, level target, lineage,
  integrity, signature, and compatibility.
- Define runtime `reset`, `observe/encode`, `decide`, recurrent-memory,
  action-decode, timeout, fallback, and disposal contracts.
- Select and integrate an initial inference backend suitable for local
  development and shipped targets.
- Add artifact storage, content addressing, version migration, compatibility
  checks, quarantine, activation, rollback pointer, and retention.
- Enforce inference budgets and deterministic mode where supported.
- Add safe fallback to scripted policy on load failure, timeout, invalid output,
  NaN, unavailable backend, or unsupported artifact.
- Wire active policies into real Class A/B execution and the Watch Agent UI.

**Exit gate**

- A persisted policy artifact survives restart, loads in a clean process,
  executes real gameplay observations, produces legal actions, and creates a
  Ghost decision trace.
- Corrupt or incompatible artifacts are rejected without breaking gameplay.
- Switching active policies is atomic and rollback-safe.

---

## C33 — Behavior Cloning and DAgger Training

**Goal:** Train the first genuine real-game policy from demonstrations and
automatically correct its failure distribution.

**Deliverables**

- Replace lookup-table BC with a reproducible trainable sequence policy.
- Implement dataset loading, shuffling, batching, normalization, weighting,
  checkpoints, resume, early stopping, metrics, deterministic seeds, and
  hardware/backend metadata.
- Train continuous blade aim/motion and discrete movement, defense, menu, and
  draft actions with legal-action masking.
- Support difficulty, weapon, mode, lesson, persona, and style conditioning.
- Implement recurrent/temporal context for partial observability.
- Implement DAgger:
  - run challenger,
  - detect uncertainty/failure states,
  - request scripted or human correction,
  - retain pre/post intervention context,
  - review and ingest,
  - retrain,
  - compare against previous policy.
- Build training progress, loss, validation, confusion/error, curriculum, and
  sample-browser views.

**Automation**

- A training program can proceed from corpus selection through repeated DAgger
  rounds without shell orchestration.
- Pause, resume, cancellation, crash recovery, and compute/storage budgets are
  enforced.

**Exit gate**

- A real trained policy beats the scripted/lookup baseline on unseen lesson
  seeds and mandatory recovery cases.
- The artifact reproduces from its immutable training manifest.
- Validation/test/hidden splits remain uncontaminated.
- The policy runs visibly in the real game.

---

## C34 — Offline RL, Online RL, Self-Play, and Curriculum Expansion

**Goal:** Improve beyond demonstration quality while preventing reward hacking
and catastrophic forgetting.

**Deliverables**

- Keep every reward component observable, versioned, bounded, and externally
  frozen for a training run.
- Implement offline RL on the governed corpus before online exploration.
- Implement checkpoint-reset online RL using real headless Tear.
- Add curricula from movement and blade control through enemies, bosses,
  drafting, stages, modes, and full journeys.
- Add hierarchical policies, recurrent/transformer memory experiments,
  population-based training, quality-diversity archives, self-play/tournaments,
  adversarial Scenario Forge, and world-model acceleration only after their
  prerequisite gates.
- Maintain specialist policies for mechanics, weapons, bosses, modes, builds,
  QA adversaries, inputs, hardware, performance, and human-likeness.
- Detect reward hacking through invariants, behavioral metrics, causal events,
  critic policies, and visual sampling.
- Retain training checkpoints, optimizer state, metrics, samples, environment
  identity, and lineage.

**Exit gate**

- An RL-fine-tuned challenger improves declared gameplay outcomes over BC while
  preserving recovery, journey, invariant, human-likeness, and holdout bands.
- Reward-ablation and adversarial tests expose planted reward hacks.
- Any headless improvement can be replayed visibly from sampled episodes.

---

## C35 — Measured TearBot Ladder and Human-Likeness Calibration

**Goal:** Turn Levels 1-9 from formulas into stable measured ability envelopes,
with Omega kept explicitly privileged.

**Deliverables**

- Keep game difficulty, policy skill, strategic astuteness, QA aggression, and
  persona as orthogonal controls.
- Implement the complete Astuteness Vector across perception, decision,
  mechanics, strategy, recovery, QA, and persona dimensions.
- Compile coherent bounded rationality: observation noise, reaction delay,
  action error, planning depth, memory, target persistence, and recovery.
- Enforce a visible-information firewall for public levels.
- Define level identities, target bands, permitted mistakes, performance
  distributions, and continuous interpolation.
- Build mechanics, combat, boss, draft, journey, robustness, and QA benchmark
  families.
- Fit scenario item-response/rating models from executed policy results.
- Implement monotonicity, adjacent-level discrimination, per-domain,
  per-weapon, per-mode, per-difficulty, fairness, drift, and identity reports.
- Bootstrap provisionally from scripted/learned policies, then anchor only with
  separately consented human populations.
- Build Skill Cards and a Bot Ladder dashboard showing confidence and
  provisional/anchored status.

**Exit gate**

- Each public level is backed by executed policy distributions, not generated
  score dictionaries.
- Adjacent levels are measurably separable while mistakes remain coherent.
- Level 9 obeys human-like information/reaction limits.
- Omega is unmistakably non-human and excluded from human-facing comparisons.
- Level drift after game or policy changes automatically invalidates
  certification.

---

## C36 — Fully Autonomous Agent Foundry

**Goal:** Implement the automatic closed loop the original plan promised.

**Deliverables**

- Implement a durable Foundry job/state machine:
  observe champion, mine weakness, generate curriculum, select teacher and
  algorithm, allocate compute, train challenger, evaluate, promote/reject,
  archive, monitor, and roll back.
- Mine weaknesses from real exams, journeys, Ghosts, Graveyard, Frontier,
  player-consented data, regressions, uncertainty, and level drift.
- Generate targeted TearSDL curricula and adversarial mutations.
- Choose scripted, human, stronger-level, specialist, self-play, or previous
  champion teachers.
- Distill stronger policies into lower-level bounded envelopes without copying
  privileged information.
- Maintain champion, challenger, specialists, novel quality-diversity policies,
  and rejected/archive lineages.
- Freeze game rules, rewards, invariants, benchmark definitions, hidden exams,
  thresholds, and release gates outside the modifiable policy boundary.
- Require deterministic exams, statistical confidence, regression budgets,
  level-band compliance, human-likeness, real journeys, and hidden holdouts.
- Monitor promoted policies and automatically roll back on regression or drift.
- Produce iteration reports with weakness, data, curriculum, compute, metrics,
  uncertainty, failures, decision, and lineage.

**User-visible automation**

- Foundry can be enabled from Ghost Lab with target level, data permissions,
  compute/storage budget, schedule, and stop conditions.
- It runs without manual commands, survives restart, and surfaces notifications
  for intervention, promotion, rejection, and rollback.
- Users can watch sampled champion/challenger episodes and compare their Ghosts.

**Exit gate**

- Starting with only a champion and an authorized corpus, Foundry independently
  creates and trains a challenger.
- It discovers a real weakness, builds a curriculum, improves it, passes all
  frozen gates, promotes, detects a planted post-promotion regression, and
  rolls back.
- The cycle is reproducible from artifacts and no manually supplied challenger
  score dictionary is involved.
- P10 is achieved: bot intelligence improves automatically and visibly.

---

## C37 — Ghost Coach, Challenges, Studio, and Player Experiences

**Goal:** Turn verified Ghost evidence and trained policies into complete
player-facing value.

**Deliverables**

- Implement evidence-first Run Autopsy with movement, blade, defense, targeting,
  draft, and run-management findings.
- Compare personal, peer-band, same-build, TearBot, and expert baselines with
  uncertainty and minimum sample sizes.
- Detect opportunities and draft regret through real counterfactual rollouts.
- Select one actionable fix and compile exact/repetition/counterfactual/race/
  coach-assisted practice drills.
- Track longitudinal skill graphs and require measured improvement.
- Implement Chase Your Best, seed-locked Ghost Race, Beat This Run, Boss Memory,
  Daily Echo, Learning Ghost, Nemesis Ghost, TearBot references, Ghost Relay,
  Hall of Echoes, Run DNA, and career archive.
- Implement immutable challenge proof manifests, fairness, eligibility, and
  reward philosophy.
- Build Ghost Studio with non-destructive EDLs, cameras, captions, formats,
  thumbnails, local media export, and lineage.
- Implement safe bounded Personal Nemesis / Echo distillation.

**Exit gate**

- Every coaching claim links to exact evidence and uncertainty.
- A replay finding compiles into a valid drill and measured repetitions update
  the skill graph.
- Every named player experience is usable through real UI or explicitly remains
  uncompleted.
- Studio exports playable local media without changing the source capsule.

---

## C38 — Cloud Publication, Verification, Privacy, and Moderation

**Goal:** Make Ghost sharing trustworthy, recoverable, privacy-preserving, and
operational.

**Deliverables**

- Implement authenticated metadata/object split using D1 and R2.
- Add content-addressed chunks, resumable multipart upload, offline queue,
  retry/backoff, idempotency, finalization, cross-device synchronization,
  import/export, deletion, and ownership.
- Keep objects non-public until validation, verification, privacy, and
  moderation complete.
- Implement private, unlisted, and public visibility; share/deep links; cards;
  feed/discovery; annotations; blocking; reporting; appeals; and lineage.
- Re-simulate eligible runs using trusted versioned historical runtimes.
- Sign immutable versioned verdicts and record suspicious indicators and
  competitive eligibility.
- Harden parsers, sanitize metadata, pseudonymize identity, classify fields,
  separate training consent, and enforce rate/cost limits.
- Implement delayed immutable past-only Ghost Relay after ordinary recording is
  reliable.
- Add operational dashboards for recorder, storage, upload, verification,
  moderation, cost, drift, playback, practice, and policies.

**Exit gate**

- Interrupted uploads resume and publish atomically.
- Unsupported historical runtimes remain unsupported.
- Tampered, oversized, malformed, privacy-violating, or moderated capsules do
  not become public.
- Account deletion removes or tombstones data according to documented ownership
  and retention rules.
- Local gameplay and recording remain usable during cloud failure.

---

## C39 — Scheduling, Tooling, Developer Operations, and Preservation

**Goal:** Operationalize the entire system for development, support, live ops,
and long-term replay survival.

**Deliverables**

- Complete API, CLI, and Codex Skill surfaces for journeys, gameplay, State
  Forge, drafts, recording, replay, Academy, Foundry, calibration, certification,
  failures, analytics, Doctor, and comparison.
- UI remains the normal operator experience; commands reproduce and automate it.
- Implement local, pull-request, nightly, weekly endurance, and release-candidate
  schedules with explicit budgets and statistical confidence.
- Add flake quarantine policy that cannot hide deterministic failures.
- Implement diff-aware scenario, Graveyard, journey, base comparison,
  arbitrary-state, and interaction-matrix selection.
- Add support bundles, crash/softlock diagnosis, balance observatory, patch
  impact, content validation, Remote Config safety, tournament/live-event
  operations, replay analytics, Developer Ghost Lab, and human breakpoints.
- Preserve runtime packages, schema migrations, aliases, tombstones, codecs,
  verification rules, golden Ghosts, and visual-only fallbacks.
- Run cross-version determinism, migration, playback, seek, repair, and
  degradation suites.

**Exit gate**

- A gameplay pull request automatically receives focused real evidence.
- Nightly/weekly jobs exercise long-run, fuzz, Foundry, preservation, and
  interaction budgets.
- A support engineer can turn a player-approved Ghost into a sanitized
  reproduction package.
- Historical supported capsules retain honest playback/verification status.

---

## C40 — Full End-to-End Release Certification

**Goal:** Prove the complete original vision from one immutable commit and close
the program honestly.

**Required evidence**

- Full `pnpm check` from the intended commit.
- Contract/schema/migration/malformed-input suites.
- Deterministic scenarios across gameplay, progression, arbitrary states,
  devices, platforms, lifecycle, and performance.
- Graveyard regressions and base/candidate comparisons.
- Class A training, Class B engineering, and Class C black-box reports.
- Full menu-to-menu journeys for all supported modes and required difficulty
  bands.
- State capture/restore/fork/time-travel and wave-99 evidence.
- Real Ghost record/seek/replay/practice/comparison/import/export evidence.
- Durable Vault restart, quota, corruption, recovery, and Doctor evidence.
- Real Academy, BC, DAgger, RL, ladder, and autonomous Foundry cycle evidence.
- Coach, challenges, Studio, and player-experience journeys.
- Cloud publication, verification, privacy, moderation, deletion, and outage
  recovery in approved non-production test environments.
- Cross-version preservation corpus and historical runtime results.
- Browser, input, platform, viewport, frame-rate, network, interruption,
  accessibility, performance, and long-run matrices.

**Exit gate**

- Every requirement registry entry is `certified`, or is explicitly `deferred`
  or `rejected` with accepted rationale and no contradiction of the Definition
  of Done.
- Every certificate input exists, matches the exact commit, and passes.
- A new user can start automatic training, watch learning, see a promotion,
  load the promoted TearBot, and replay its Ghost without using a terminal.
- The final report names limitations and unsupported historical cases honestly.

---

## 7. Automatic Training State Machine

The Foundry must be a durable workflow, not a helper method:

```text
disabled
  -> preparing
  -> ingesting-authorized-data
  -> mining-weaknesses
  -> building-curriculum
  -> training
  -> validating
  -> calibration
  -> hidden-exams
  -> browser-journey
  -> awaiting-promotion-policy
  -> promoted | rejected
  -> monitoring
  -> healthy | rollback
```

Every transition records:

- job and policy lineage IDs;
- source and target policy;
- target TearBot level/persona;
- dataset/curriculum/reward/environment versions;
- build and source revision;
- compute and storage budgets;
- checkpoint and resume location;
- metrics, confidence, and failures;
- actor: automatic system or named human approval;
- timestamps and immutable evidence hashes.

Training must remain local-first. Cloud compute may later implement the same job
contract, but a cloud outage cannot invalidate local policies, recordings, or
the active champion.

---

## 8. UI Surfaces Required for “No Commands”

### Ghost Lab home

- System health and capability truth.
- Start Watch, State Forge, Academy, Foundry, Theater, Coach, Studio, and Vault.
- Active jobs, failures, storage, and recent evidence.

### Agent Foundry

- Enable/disable automatic training.
- Target level, persona, weapon/mode scope, compute budget, disk budget,
  schedule, data sources, consent boundaries, and stop conditions.
- Champion/challenger cards and lineage.
- Weakness map and generated curriculum.
- Live progress, reward components, loss, evaluation, confidence, and ETA.
- Watch sampled episode; compare champion/challenger Ghosts.
- Pause, resume, cancel, archive, approve where policy requires, or roll back.

### Academy

- Lesson tree and graduation status.
- Recording and intervention controls.
- Review queue, corrections, recovery segments, dataset quality, consent,
  splits, and immutable manifests.

### Bot Ladder

- Levels 1-9 and Omega.
- Fixed/adaptive mode.
- Skill Cards, level bands, uncertainty, human anchors, drift, domain/weapon/
  mode/difficulty breakdowns, and human-likeness status.

### Watch Agent

- Real game view.
- Policy identity and target level.
- Observation class, intent, objective, target, confidence, reaction delay,
  bounded-rationality effects, action, rewards, critic, and invariant state.
- Normal speed, accelerated sampling, pause, and open resulting Ghost.

All controls must be accessible, responsive, controller-aware where sensible,
and explicit about whether they affect local development data or real player
data.

---

## 9. Policy and Data Safety Boundaries

The automatic system may modify:

- policy weights and recurrent state format through versioned artifacts;
- curriculum instances derived from approved generators;
- sample weighting within declared bounds;
- optimizer, schedule, and permitted hyperparameters;
- quality-diversity membership;
- champion pointer after gates pass.

It may not modify:

- production game rules or content;
- semantic action and observation truth without schema review;
- rewards during a running experiment;
- invariants;
- scenario definitions used as frozen exams;
- hidden exam membership;
- pass thresholds;
- human-likeness or information-firewall limits;
- privacy, consent, eligibility, moderation, or publication rules;
- release gates or evidence.

Training data must carry human, bot, hybrid, synthetic, corrected, and recovered
provenance. Synthetic data cannot silently count as human calibration data.

---

## 10. Minimum Artifact Set

Every training/promotion cycle must retain:

- `training-program.json`
- `dataset-manifest.json`
- `curriculum-manifest.json`
- `reward-definition.json`
- `environment-manifest.json`
- `trainer-config.json`
- periodic checkpoints and final `policy.tearbot`
- training/validation metric streams
- sampled success, failure, recovery, and uncertainty Ghosts
- calibration report and Skill Card
- hidden-exam attestation without exposed exam contents
- deterministic scenario results
- Graveyard results
- browser journey results
- champion comparison
- promotion/rejection decision
- monitoring and rollback record
- complete lineage and integrity hashes

Retention policies may compact intermediate checkpoints, but cannot delete the
evidence needed to reproduce the promoted artifact.

---

## 11. Checkpoint Execution Template

Before starting a checkpoint:

1. Mark its requirement IDs `in progress`.
2. Record dependency evidence.
3. List exact intended source, test, UI, migration, and documentation files.
4. Define target evidence and artifact paths.
5. Plant at least one failure the new gate must detect.

While implementing:

1. Run the smallest canonical targeted checks.
2. Exercise real composition as soon as a vertical slice exists.
3. Keep synthetic fixtures labeled.
4. Preserve failed evidence and causal artifacts.
5. Update the requirement registry with code and test links.

Before promotion:

1. Run deterministic scenario evidence.
2. Rerun selected Graveyard and base comparisons.
3. Run required visible journey and interaction matrices.
4. Verify persistence/restart behavior when applicable.
5. Produce a checkpoint report containing commands, artifacts, failures,
   limitations, and disposition.
6. Do not promote when a blocking exit-gate item is missing.

---

## 12. Recommended Delivery Order Inside the Learning Plateau

The first useful vertical slice is:

1. Real runtime bridge.
2. One durable Ghost recording profile.
3. Real headless parity for a small movement/blade lesson.
4. Durable Academy samples from scripted and consented human runs.
5. Versioned policy artifact and real inference adapter.
6. Trainable BC policy.
7. Watch the policy in the real game.
8. One DAgger correction round.
9. One measured provisional level.
10. One Foundry cycle that creates its own challenger.

Only after this slice works should the program expand to online RL, transformer
memory, world models, population-based training, quality diversity, large
cloud training, or every public level.

---

## 13. Branch and Commit Strategy

Use bounded commits so contracts cannot be mistaken for operational completion:

1. `docs: reset Ghost 3 completion claims and add recovery plan`
2. `feat: integrate TearBench with real runtime`
3. `feat: complete State Forge live restoration`
4. `feat: add real scripted and black-box autonomy`
5. `feat: record and persist Ghost 3 capsules`
6. `feat: ship Theater and practice workflows`
7. `feat: add real headless training environments`
8. `feat: add governed Academy corpus`
9. `feat: add versioned policy runtime and BC`
10. `feat: automate DAgger and RL curricula`
11. `feat: calibrate TearBot ladder from executed policies`
12. `feat: automate Agent Foundry lifecycle`
13. `feat: ship Coach, challenges, and Studio`
14. `feat: complete cloud trust and preservation`
15. `test: certify Ghost 3 end to end`

Each commit must preserve unrelated user work and state whether its evidence is
contract, prototype, integrated, visible, or certified.

---

## 14. Final Definition of Done

The program is not done because there are files with the expected names. It is
done when:

- TearBench drives actual Tear gameplay deterministically.
- State Forge recreates actual arbitrary states transactionally.
- scripted and learned agents complete real journeys;
- Class C proves the shipped experience with pixels and physical input;
- Ghost 3 records real causal runs and preserves Ghost 2 compatibility;
- Vault, Theater, practice, comparisons, Doctor, libraries, and Studio work
  across restarts;
- Academy creates governed real datasets;
- a trainable policy improves through BC, DAgger, and gated RL;
- Levels 1-9 are measured stable human-like bands and Omega is clearly
  privileged;
- Foundry automatically creates, trains, evaluates, promotes, monitors, and
  rolls back challengers;
- coaching and player experiences use evidence rather than invented narratives;
- cloud sharing is verified, moderated, privacy-preserving, and optional;
- preservation and release evidence cover the exact intended commit;
- the complete normal workflow is visible and usable without terminal commands.

---

## 15. Non-Lossy Source Traceability

Every top-level section from the original v0.6 source remains in scope:

| Source section | Primary checkpoints |
|---|---|
| 1. Executive Summary | C21, C40 |
| 2. Gameplay Policy vs. Agent Skill | C24, C32-C36, C39 |
| 3. Why Tear Is Already Well Positioned | C21-C24 |
| 4. Target System: TearBench | C22-C26, C39-C40 |
| 5. Deterministic Tear Test API | C22 |
| 6. Observation Space | C22, C25, C32 |
| 7. Action Space | C22, C25, C32 |
| 8. Deterministic Simulation | C22, C30 |
| 9. Scenario System | C23, C26, C39 |
| 10. Scripted Agents First | C24 |
| 11. Human Demonstration Capture | C27, C31 |
| 12. Imitation Learning | C31-C33 |
| 13. Reinforcement-Learning Fine-Tuning | C34 |
| 14. Agent Fleet | C24, C34-C36 |
| 15. Invariant Testing | C22-C26, C34, C40 |
| 16. Automatic Failure Reproduction | C26 |
| 17. Branch-to-Branch Behavioral Comparison | C26, C39 |
| 18. Scenario Mutation and Fuzzing | C23, C26, C34, C39 |
| 19. Visual QA | C25, C29, C39-C40 |
| 20. Performance Testing | C22, C27, C30, C39-C40 |
| 21. Tear Autonomous Playtester Skill | C39 |
| 22. Recommended Repository Structure | C21-C39 |
| 23. Training and Deployment Stack | C30-C36 |
| 24. Phased Implementation Roadmap | C21-C40 |
| 25. Risks and Direct Recommendations | All checkpoints |
| 26. Immediate Recommended Next Steps | C21-C24 |
| 27. Definition of Success | C40 |
| 28. Non-Negotiable End-to-End Autonomy Target | C24-C25, C40 |
| 29. Repository-Grounded Tear Coverage Inventory | C21, C24-C25, C39 |
| 30. Autonomous Competency Ladder | C24-C25, C35-C36 |
| 31. Full Player-Journey State Machine | C24-C25 |
| 32. Hierarchical Agent Architecture | C24, C32-C36 |
| 33. Dual Observation and Control System | C22, C25, C32 |
| 34. Difficulty Intelligence and Certification | C24, C35-C36 |
| 35. Mode-Specific Completion Contracts | C24-C25, C35, C40 |
| 36. Draft, Build, and Evolution Intelligence | C23-C24, C34-C36 |
| 37. Agent Academy | C31-C34 |
| 38. Advanced Training Strategy | C33-C36 |
| 39. Complete Agent Fleet and Player Personas | C24, C34-C36 |
| 40. Scenario Generation, Mutation, and Coverage | C23, C26, C34, C39 |
| 41. Perfect QA Domain Matrix | C22-C30, C37-C40 |
| 42. Spectator, Explainability, and Agent Evolution UI | C24, C29, C33-C36 |
| 43. Autonomous Diagnosis and Developer Assistance | C26, C37, C39 |
| 44. Test Scheduling and Release Gates | C39-C40 |
| 45. Expanded TearBench Tool and Skill Surface | C39 |
| 46. Expanded Repository Architecture | C21-C39 |
| 47. Revised Implementation Roadmap for Full Autonomy | C22-C26, C39-C40 |
| 48. Expanded Definition of Perfect Autonomous Playtesting | C25-C26, C39-C40 |
| 49. Any-Point Simulation | C23 |
| 50. Tear State Forge | C23 |
| 51. State Reachability, Legality, and Plausibility | C23, C31 |
| 52. Canonical Progression Ledger | C23 |
| 53. Historical Run and Build Synthesis | C23, C28, C39 |
| 54. Exact Mid-Combat and Boss Situation Injection | C23 |
| 55. Scenario Definition Language and Natural-Language Compiler | C23, C39 |
| 56. Snapshots, Time Travel, Forking, and Counterfactuals | C23, C29, C37 |
| 57. Combinatorial Interaction Testing | C25-C26, C39-C40 |
| 58. TearBot Difficulty and Astuteness System | C35-C36 |
| 59. Bot Astuteness Vector and Bounded Rationality | C32, C35-C36 |
| 60. Self-Calibrating Bot Levels | C35 |
| 61. Self-Improving Agent Foundry | C34-C36 |
| 62. Determining Performance for Every Bot Number | C35-C36 |
| 63. Expanded API, CLI, Skill, and UI Surface | C23, C35-C39 |
| 64. Expanded Roadmap and Acceptance Gates | C21-C40 |
| 65. Ghost 3.0 Platform Vision | C27-C30, C37-C40 |
| 66. Current Ghost 2.0 Baseline and Gap | C21, C27-C30 |
| 67. Replay Truth Model and Fidelity Classes | C27, C29, C39 |
| 68. `.tearghost` Capsule and Track Schema | C27-C28 |
| 69. Recorder Architecture, Budgets, and Failure Safety | C27-C28 |
| 70. Playback Engine and Ghost Theater 3.0 | C29 |
| 71. Player-Facing Ghost Experiences | C37 |
| 72. Ghost Coach and Replay-to-Practice | C29, C37 |
| 73. Vault, Cloud, Sharing, and Discovery | C28, C38 |
| 74. Verification, Security, Fair Play, Privacy, and Moderation | C27-C28, C31, C36, C38 |
| 75. Compatibility, Migration, Recovery, and Preservation | C27-C29, C38-C40 |
| 76. Developer, Support, Live-Ops, and Product Value | C26, C37-C39 |
| 77. Ghost Intelligence, TearBot, and Dataset Governance | C31-C38 |
| 78. Ghost API, Architecture, Roadmap, and Acceptance | C27-C40 |
| 79. Replay Trident, Timeline, Lenses, Studio, Doctor, Canon, and Memory | C27-C30, C37-C40 |
| 80. Living Document Rules | C21, C39-C40 |
| 81. Changelog | C21, C39-C40 |

Subsection-level requirement IDs created in C21 are the authoritative detailed
trace. This table is the top-level completeness check; it is not permission to
collapse or omit requirements within a source section.
