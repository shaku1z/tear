# TearBench / State Forge / TearBot / Ghost 3 Master Continuation Handoff

**Branch:** `codex/ghost3-autonomous-completion-plan`  
**State:** Paused at a deliberate handoff boundary during C27/C27A  
**Purpose:** Enable a succeeding agent to continue the complete TearBench program through C40 without losing requirements, repeating architectural mistakes, or overstating evidence.

This is the program-wide continuation document. It does not replace the original specification, non-lossy requirement registry, completion plan, or checkpoint reports. It records how to use those authorities and the exact implementation boundary inherited in this working tree.

## 1. Actual completion target

The finished program is the integration of:

- **TearBench:** deterministic execution, scenarios, policies, invariants, comparison, minimization, regression discovery, evidence, and certification.
- **State Forge:** production codecs, snapshots, validated restoration, legal history, synthesis, migrations, time travel, and forks.
- **TearBot:** scripted and learned policies, Academy data, Levels 1-9 and Omega, measured evaluation, human calibration, and autonomous Foundry training.
- **Ghost 3:** causal recording/replay, Vault, Theater, practice and forks, comparison, Doctor, libraries, coaching, challenges, Studio, publication, verification, and preservation.

Ghost 3 is additive. Preserve truthful Ghost 2 compatibility; do not silently replace or relabel Ghost 2.

Completion means C40's release criteria pass with real evidence. A contract API, mock, foundation test, or green subset gate is not complete product behavior.

## 2. The non-lossy authority for “everything”

Do not reconstruct the full scope from this handoff. The 13,725-line source was normalized into a queryable requirement registry so future plans and handoffs cannot omit its long tail.

**Execution discipline:** [`TEARBENCH_C40_EXECUTION_GUIDE.md`](TEARBENCH_C40_EXECUTION_GUIDE.md)
defines the slice loop, the evidence law, anti-loop rules, the pause protocol,
and a per-checkpoint entry checklist through C40. Read it before working; it
governs *how* to work, while the documents below define *what* to build.

Mandatory reading order:

1. [`docs/source/TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN.v0.6.md`](../docs/source/TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN.v0.6.md) — complete product intent and rationale.
2. [`docs/TEARBENCH_GHOST3_NON_LOSSY_REQUIREMENTS_ANNEX.md`](../docs/TEARBENCH_GHOST3_NON_LOSSY_REQUIREMENTS_ANNEX.md) — generated human view; never hand-edit it.
3. [`docs/tearbench-ghost3-requirements.json`](../docs/tearbench-ghost3-requirements.json) — authoritative atomic registry.
4. [`plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md`](TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md) — current C21-C40 order, dependencies, deliverables, and gates.
5. [`docs/TEARBENCH_GHOST3_PROGRAM.md`](../docs/TEARBENCH_GHOST3_PROGRAM.md) — authority hierarchy and interpretation.
6. [`docs/TEARBENCH_GHOST3_CAPABILITY_DASHBOARD.md`](../docs/TEARBENCH_GHOST3_CAPABILITY_DASHBOARD.md) and [`docs/tearbench-ghost3-evidence-catalog.json`](../docs/tearbench-ghost3-evidence-catalog.json) — conservative evidence state.
7. The active checkpoint reports and architecture documents listed below.

C27A was added as a blocking architecture correction after the atomic registry
was generated, so the registry currently has no entries labeled `C27A`. An
empty `C27A` query does **not** mean it has no scope. Its direct authorities are
`docs/TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md`, architecture decision D14
in `docs/TEARBENCH_GHOST3_ARCHITECTURE_DECISIONS.md`, and
`docs/checkpoints/C27A_RUNTIME_ARCHITECTURE_FOUNDATION.md`; connect that work
to the affected C22-C27 requirements and evidence.

Source identity:

- Version/date: v0.6, 2026-07-22
- Physical lines: 13,725
- SHA-256: `007BE22193F5369B8450AAB33B95C6D3080176E6B2F91A1D504B545CA7FC7DDE`
- Atomic entries: 8,691
- Normative: 6,885
- Required: 6,722
- Optional: 158
- Reference: 1,806
- Linked duplicates: 1,200
- Last verified unmapped source lines: 0

Before completing any checkpoint:

1. Query all registry requirements mapped to that checkpoint and prerequisites.
2. Read their original-source context, not only summaries.
3. Classify evidence honestly as `missing`, `contract`, `prototype`, `integrated`, `visible`, `certified`, `deferred`, or `rejected`.
4. Promote catalog evidence only when repository evidence supports it.
5. Run `pnpm requirements:check`.
6. Do not declare completion while required mapped entries lack the checkpoint's demanded evidence.

The generated dashboard is deliberately conservative and may lag newer code until evidence is cataloged. Its current broad totals are:

| Evidence state | Count |
|---|---:|
| Missing | 6,470 |
| Contract | 179 |
| Prototype | 161 |
| Integrated | 58 |
| Visible | 17 |
| Certified | 0 |

These figures do not mean newer work has no value. They mean most original atomic requirements do not yet have completion-grade evidence.

## 3. Architectural and evidence rules

- Build through the redesigned typed architecture; never create a parallel copy of the old `js/` monolith.
- Use oracle commit `ee5e931` for behavior/feel parity where needed, not as architecture to restore.
- C27A is blocking: live, replay, headless, and learning must converge on the same production world composition and simulation core.
- Keep one authoritative scheduler/runtime, time source, RNG path, event path, and state owner per world.
- Never create a second live combat host for replay or headless execution.
- Keep DOM/browser adapters at the app edge. Gameplay/runtime composition stays portable.
- Test seams may observe/drive production behavior but must not become production authority.
- Preserve lazy menu-time construction and startup semantics unless a checkpoint explicitly changes them.
- Keep `src/app/live-game-runtime.ts` within the user-approved 700 physical-line ceiling. It is currently 685 lines.
- Preserve honest execution classes:
  - **A:** privileged in-process deterministic execution.
  - **B:** production runtime through supported bridges.
  - **C:** physical/black-box input and visible-output evidence.
- Never claim Class C from a Class A hook, or certification from a foundation test.
- Record conflicts, deferrals, and rejections explicitly. Never make requirements disappear.

## 4. Program and checkpoint position

| Plateau | Checkpoints | Outcome | State |
|---|---:|---|---|
| P7 — Truthful Baseline | C21-C22 | Truth audit and runtime bridge | Passed |
| P8 — Real Autonomous QA | C23-C26 | State Forge, scripted agent, physical input, regression discovery | C23, C24, C26 passed named gates; C25 exit open |
| P9 — Operational Ghost 3 | C27-C30 + C27A | Recorder, shared architecture, Vault/Doctor, Theater, scalable episodes | C27 foundation active; C27A blocking/in progress |
| P10 — Autonomous Learning | C31-C36 | Academy, policy runtime, imitation/RL, ladder, Foundry | Not complete |
| P11 — Player/Cloud Product | C37-C39 | Coach/Studio UX, cloud/privacy, operations/preservation | Not complete |
| P12 — Final Certification | C40 | Certified end-to-end release | Not started |

Named status:

- **C21:** truth audit passed.
- **C22:** real runtime bridge passed 2026-07-26.
- **C23:** production State Forge passed its named gate 2026-07-26.
- **C24:** full scripted agent completed its named Class A gate 2026-07-26.
- **C25:** physical/black-box foundation verified; exit open.
- **C26:** regression discovery passed `pnpm check:c26` on 2026-07-28.
- **C27:** recorder/capsule foundation only; checkpoint open.
- **C27A:** forty shared-world architecture slices in this tree; blocking and incomplete.
- **C28-C40:** incomplete.

C0-C20 reports contain valuable scaffolds, contracts, and prototypes. They are historical and are not operational completion proof; C21-C40 replaces those broad claims with production evidence.

## 5. Capabilities usable now

Current engineering capabilities, with the qualifications above:

- Requirement traceability, generated annex checks, capability dashboard, and evidence catalog.
- Real runtime bridge and deterministic in-process TearBench execution.
- State Forge foundations for state construction/restoration and browser proof.
- Scripted deterministic policy foundations for C24's named Class A scope.
- Physical browser harness foundations and diagnostics; the full C25 exit is pending.
- C26 regression investigation, minimization, bisect, and graveyard workflows.
- C27 V3 recording/capsule foundations: manifests, chunks, journals, recovery, budgets, interruption/terminal tests, and browser proof in the tested scope.
- C27A foundations: DOM-free world context, shared construction and combat assembly, reconstructible campaign bindings, and 13/13 exact fixed-tick plus post-origin native-event parity. Live and detached use shared spawn/wave/terminal publishers, the gameplay outcome controller, and portable reward/finale runtimes; the matrix includes a natural wave clear, real draft selection, wave-2 spawn, and a real Source victory from a certified reconstructed wave-49 frontier plus explicit one-hit State Forge child. The finale's seven intent batches, 22 accepted outward-adapter calls, six concrete particle-admission receipts, eight logical feel receipts, and the 42-entry terminal external-decision transcript match exactly. Slice 40 adds a factory module with no app/presentation/browser imports; Slice 41 adds per-world simulation tuning ownership for State Forge, rules, combat, cinematic timing, and tutorial ghost physics; Slice 42 makes particle budgets and preference/entropy adapters explicit at the composition boundary; Slice 43 centralizes per-world configuration, clock, and named RNG construction; Slice 44 makes Backdrop controller state and visual policy explicit. The browser additionally observes audio dispatch, but the real run's seven mixes are logical-target-only and every finale cue is voice-cap-rejected. Cinematic renderer/UI, browser input, audio, persistence/cloud/replay/analytics, pixels, device output, headless/full-world portability, and concurrent complete live worlds remain open.

Current `scripts/tearbench.mjs` command families:

```text
list
run <scenario-id> ...
rerun --artifact ...
investigate --base ... --candidate ...
failure ...
minimize ...
bisect ...
graveyard register|list|reopen|run ...
forge wave99
select
ci
certify --commit ... --full-check passed
```

Inspect CLI help/implementation for exact flags. These are engineering interfaces, not the complete no-command training product.

## 6. Capabilities not yet delivered

Do not claim TearBot automatically learns merely because scripted policies, training contracts, or commands exist. Still required:

- Ghost Lab, Foundry, Academy, Bot Ladder, and Watch Agent surfaces.
- Automatic collection, curation, training, evaluation, rejection/promotion, scheduling, recovery, and progress presentation.
- Production policy registry, compatibility, rollback, and reproducible evaluation.
- Behavior cloning and DAgger.
- Offline/online RL, self-play, curriculum, and safety controls.
- Levels 1-9/Omega with robust human-calibrated measurements.
- Full Vault/Doctor/Theater/practice/comparison/Studio/publication experience.
- Cloud verification, privacy, moderation, preservation, and operations.
- C40 end-to-end certification.

## 7. Exact inherited C27A boundary

Read [`TEARBENCH_C27A_HANDOFF.md`](TEARBENCH_C27A_HANDOFF.md) before editing.

C27A foundation slices currently establish entity-construction separation, per-world entity-factory construction, generic per-world DOM-free context, shared combat/outcome/reward/finale execution, exact state/native-event parity through a natural wave boundary, world-owned cinema, versioned State Forge restoration, data-only campaign reconstruction, a certified real Source-victory route, exact finale-intent and adapter-dispatch parity, exact particle-admission and logical-feel receipts, bounded software-audio receipts, exact terminal external-decision transcript parity, an architecture-fenced portable simulation-factory seam, stable simulation tuning ownership, factory-owned first-gesture/concrete audio-runtime state, and composition-owned browser context/navigator/document capabilities, plus focused tests and physical browser diagnostics.

Important files:

- `src/gameplay/runtime/tear-world-context.ts`
- `src/gameplay/runtime/tear-world-configuration.ts`
- `src/gameplay/runtime/tear-world-transient-state.ts`
- `src/app/live-world-simulation-factories.ts`
- `src/gameplay/runtime/tear-world-clock.ts`
- `src/app/live-world-composition.ts`
- `src/app/live-world-context.ts`
- `src/app/live-combat-world-state.ts`
- `src/gameplay/runtime/tear-world-entity-construction.ts`
- `src/app/live-world-entity-factory.ts`
- `src/gameplay/runtime/tear-simulation-runtime.ts`
- `src/tearbench/detached-world-hydrator.ts`
- `src/tearbench/detached-world-runtime.ts`
- `src/gameplay/runtime/tear-world-simulation-factories.ts`
- `src/audio/audio-dispatch-receipts.ts`
- `src/gameplay/run/outcome-chronology-journal.ts`

### Exact next slice

Slice 69 completes the bounded outcome defeat-progress profile-stat step. The
composition-owned adapter retains the existing `runs` increment followed by
the floored `longestRun` maximum; source architecture rejects direct profile
stat access in the outcome composition. `pnpm check:c27a:slice69` passed (5
files / 10 tests plus architecture), including adapter ordering and proof that
Daily, achievement, cloud, and recording behavior remains intact, and rebuilt
campaign-victory browser proof passes. This does not establish durable profile
state, migration, quota, crash recovery, cross-device sync, or full-world
concurrency. Next, isolate setup-shop purchase profile-stat updates.

All thirteen captured fixed-tick parity scenarios match the live authoritative hash and complete post-origin native semantic stream: 5,732 ticks and 33 native facts, including the three natural-trace enemy defeats now published independently of Ghost 2 sampling. The timeline is gameplay-owned, one director belongs to each world, and a content-fingerprinted data-only chapter binding reconstructs an active brief. Ghost V3 and TearBench share the semantic adapter; live and detached use the same combat assembly, spawn/wave/terminal publishers, outcome/reward/finale controllers, scheduler shape, event bus, and restored actor identity. The natural matrix route clears wave 1, selects a real offered draft card without advancing the fixed scheduler, and reaches a wave-2 spawn. A separate certified route reconstructs the wave-49 frontier, starts production wave 50, applies an explicit Source one-hit State Forge child, and executes real victory; live and detached match all seven finale intent batches and all 22 outward calls after their concrete adapters return, in exact order and with exact arguments. They also match six immutable ring/burst particle-admission receipts, eight logical feel receipts after restoration of the captured pre-finale transient, and the complete 42-entry terminal external-decision transcript (13 initial synchronization terminal decision/request, 22 finale-outward, and 7 cache/terminal). The refreshed browser route explicitly activates audio, then observes 12 executing plus 12 completed dispatch receipts: all seven mixes are logical-target-only and all cues are voice-cap-rejected, so no output is claimed. Slice 40 adds portable `tear-world-simulation-factories.ts` with no app/presentation/browser imports; the app renderer supplies real Canvas ports and detached supplies explicit no-op ports under architecture fences. Next: generic world bootstrap, then configuration isolation, which still blocks truly simultaneous full worlds. This evidence does not claim a naturally played 50-wave campaign, randomized particle parity, rendered-pixel parity, headless/full-world portability, configuration isolation, durable profile/local-storage survival, cloud/replay/analytics completion, successful PCM/audibility or audio graph/device parity, or device vibration.

Preserve:

- exactly one live `TearSimulationRuntime` and scheduler;
- lazy menu-time creation;
- the single combat host;
- focused unit/architecture proof;
- alignment and checkpoint documentation in the same slice.

Then migrate app-backed configuration, RNG, effects, clocks, Mirror/boss feedback, and remaining frame/combat closures into explicit per-world ports/state. Complete replay/headless only by consuming that same full production composition—not by copying the live host.

### Other known C27A boundary debt

Earlier read-only architecture audits also identified portability work that must
not be lost after the world-ownership slices:

- Split DOM-bound Ghost Lab/State Forge Studio/browser helpers out of the
  portable `src/tearbench` public barrel into an explicit browser adapter area.
- Split the mixed live runtime bridge so structured projection does not
  statically pull developer UI/browser code.
- Move `ScreenAction`/legacy screen control contracts out of presentation
  ownership into a neutral input/control contract.
- Replace ambient `Gamepad` dependence in portable certification logic with a
  TearBench-owned structural controller port.
- Keep test environment/platform helpers out of the portable production barrel.
- Separate remaining `LegacyGhostRuntimeState` handling into a Ghost 2 outward
  compatibility adapter rather than the generic world-construction path.
- Extend `check:architecture` with planted violations for forbidden
  app/presentation/platform/browser/legacy imports and DOM/Canvas globals in
  portable core; also forbid browser/test-support re-exports from the portable
  barrel.

The tree has already improved beyond some historical direct-app-import findings,
so re-audit actual imports before editing. The required outcome remains a
portable core with explicit outward browser, live-app, test-support, and Ghost 2
compatibility adapters.

## 8. Remaining C27 completion groups

C27 has 1,166 mapped normative requirements. Its registry evidence remains overwhelmingly `missing`; the foundation gate does not close it.

Remaining completion groups include:

1. Versioned durable V3 capsule contract with provenance, compatibility, integrity, and truthful recovery.
2. Measured real codecs, profiles, and enforced storage/performance budgets.
3. Complete terminal, interruption, crash, recovery, and partial-write lifecycle coverage.
4. Real quota/device/storage-pressure evidence, not only simulated branches.
5. Compatible replay execution with seek, fork, practice, export/import, migration, and budgets.
6. C27A's same-core full-world runtime across live, replay, headless, and training.

Re-query the registry before each slice because foundations may already carry partial evidence.

## 9. Route from here through complete TearBench

The checkpoint descriptions below are routing aids. Read every checkpoint's full section in the completion plan before implementation.

| Checkpoint | Required outcome |
|---:|---|
| C25 | Finish real physical-input/black-box and visible-output validation with honest privilege boundaries. |
| C27/C27A | Complete causal recording/capsules and shared redesigned production-world architecture. |
| C28 | Durable Vault, Doctor, and knowledge systems with indexing, diagnosis, retention, and integrity. |
| C29 | Replay world, Theater, comparison, seek, forks, and practice on the production simulation composition. |
| C30 | Headless/scalable episodes with parity, resource controls, and measured throughput. |
| C31 | Academy corpus, consent, provenance, eligibility, curation, retention, and governance. |
| C32 | Production policy runtime/artifact registry with compatibility, evaluation, promotion, rollback, and safety. |
| C33 | Reproducible behavior-cloning and DAgger pipelines. |
| C34 | Offline/online RL, self-play, curriculum, controlled exploration, and safeguards. |
| C35 | Measured Levels 1-9/Omega ladder, robust evaluation, and human calibration. |
| C36 | Autonomous Foundry: collect, train, evaluate, reject/promote, recover, schedule, and report progress. |
| C37 | Coach, challenges, Studio, Ghost Lab, Foundry, Academy, Bot Ladder, and Watch Agent UX. |
| C38 | Cloud sync/publication/verification, identity/privacy, consent, moderation, and abuse resistance. |
| C39 | Scheduling, tooling, observability, operational recovery, lifecycle management, and preservation. |
| C40 | Full release validation, certification, docs, migration, performance, accessibility, security, and evidence closure. |

Do not build learned-policy or replay worlds on a second simplified simulator while C27A is incomplete.

## 10. Required automatic training experience

The user expects training through the product, not hand-entered commands:

```text
Eligible gameplay/curriculum episodes
  -> consent and provenance validation
  -> Academy ingestion and curation
  -> candidate training
  -> deterministic/adversarial evaluation
  -> regression/safety rejection or measured promotion
  -> versioned policy artifact
  -> ladder placement and human calibration
  -> Watch Agent / Ghost Lab presentation
  -> continued Foundry scheduling
```

Commands remain appropriate for development, CI, reproduction, and expert control. They do not replace the automatic Foundry state machine or UI.

The product must expose what is running, eligible data, candidate pass/fail reasons, active artifact, prior/human comparison, and safe pause/resume/opt-out/rollback controls.

## 11. Per-slice validation and progress protocol

For every coherent slice:

1. Inspect mapped requirements and original-source context.
2. State the narrow production boundary.
3. Add/update the smallest credible tests.
4. Run the smallest canonical gate during iteration.
5. Run prerequisite/checkpoint gates before claiming they remain green.
6. Capture browser evidence for visible/Class C behavior.
7. Update checkpoint and architecture/alignment docs.
8. Promote evidence only to the demonstrated level.
9. Run `pnpm requirements:check` and `git diff --check`.
10. Pause periodically and record:
    - completed in the current slice;
    - remaining in the current checkpoint;
    - remaining beyond it through C40;
    - the exact next safe boundary.

Use `.agents/skills/tear-change-gate/SKILL.md` to select gates. Relevant commands include:

```powershell
pnpm requirements:check
pnpm check:c23
pnpm check:c25:foundation
pnpm check:c26
pnpm check:c27:foundation
pnpm check:c27a:foundation
pnpm typecheck
pnpm lint
pnpm check:architecture
pnpm test
pnpm build
pnpm check
git diff --check
```

Do not run `pnpm requirements:generate` casually; inspect any generated diff carefully.

### Evidence last verified at this pause

DONE THIS STEP:      Slice 69 routes outcome defeat-progress profile-stat updates through a composition-owned typed operation while retaining adjacent Daily, achievement, cloud, and recording behavior.
PROVEN BY:           `pnpm check:c27a:slice69` passed: 5 focused files / 10 tests and architecture, including adapter ordering and the retained outcome behavior; rebuilt campaign-victory browser proof passed. The previous fresh foundation and campaign-victory evidence remains recorded above; C27A remains blocking.
REMAINING HERE:      Isolate setup-shop purchase profile-stat updates, then continue remaining persistence dependencies and real-world extraction. Those boundaries still prevent concurrent complete worlds and C27A remains blocking.
REMAINING TO C40:    C27 completion, C25 exit, and C28-C40 remain after C27A closes.
NEXT SLICE:          Isolate setup-shop purchase profile-stat updates without changing purchase, visual feedback, or achievement-check behavior. Do not claim durability/device parity or full live-world concurrency.

All of the following were run from this worktree through C27A slice 36:

- `pnpm check:c27a` passed after the certified Source-victory slice: foundation
  36 files / 127 tests, a fresh 13-scenario / 5,732-tick / 33-native-fact
  browser corpus, all 40 detached comparator tests, and a campaign-victory
  subgate covering 10 files / 35 tests, the 1,176-transition real browser
  route, and one dedicated detached finale-parity test. The C22 live-runtime
  browser proof and C23 through C27 package gates also passed in this worktree.

- `pnpm requirements:check` and `pnpm check:c27a:foundation` passed after the
  natural reward boundary: zero unmapped source lines, 33 focused files / 112
  tests, architecture, standalone build, physical browser proof, fresh
  13-scenario / 5,732-tick capture, and all 40 exact detached comparisons.

- `pnpm check:c27a:foundation` passed after detached shared-core adoption:
  31 focused files / 104 tests, architecture, standalone build, physical
  browser proof, fresh 12-scenario capture, and 37 exact detached comparisons.

- `pnpm check:c27a:foundation` passed after slice 31's shared combat
  extraction: 31 focused files / 103 tests, architecture, standalone build,
  physical browser proof, fresh 12-scenario capture, and 37 detached parity
  tests.

- `pnpm check:c27a:foundation` passed after the shared semantic event adapter:
  29 focused files / 101 tests, standalone test build, physical browser proof,
  fresh 12-scenario capture, and 37 detached parity tests.

- `pnpm check:c27a:foundation` passed:
  - typecheck, lint, architecture;
  - 28 test files / 96 tests;
  - standalone build;
  - physical C27A browser proof and 12-scenario parity capture;
  - 37 detached parity tests with all 12 scenarios exact and no exception.
- `pnpm check:c27:foundation` passed:
  - requirements, typecheck, lint, architecture;
  - 14 test files / 69 tests;
  - build and 7 browser proofs.
- `pnpm check:c26` passed: 5 test files / 24 tests plus the planted live regression.
- `pnpm check:c23` passed:
  - requirements, typecheck, lint, architecture;
  - 13 test files / 62 tests;
  - build and the State Forge active-cinema restore/studio/exit matrix.
- `pnpm test` passed: 224 test files / 903 tests.
- `pnpm requirements:check` and `git diff --check` passed.
- TearBench changed-file CI passed 15 files / 83 tests plus its Graveyard rerun.
- `src/app/live-game-runtime.ts` measures 698 physical lines including its final line boundary.
- The production build, browser feature matrix, boss parity, navigation/progression/playground/terminal journeys, and the blade/mirror/combat parity fixtures passed after the composition-root change.
- Full `pnpm check` has not been run for a release claim.
- The existing bundle warning above 500 kB is nonfatal; no bundle-performance release claim exists.

## 12. Durable progress documents

Maintain these throughout implementation:

- `docs/checkpoints/C21_NON_LOSSY_REQUIREMENTS_AUDIT.md`
- `docs/checkpoints/C22_REAL_TEAR_RUNTIME_BRIDGE.md`
- `docs/checkpoints/C23_PRODUCTION_GRADE_STATE_FORGE.md`
- `docs/checkpoints/C24_FULL_SCRIPTED_AGENT_AUTONOMY.md`
- `docs/checkpoints/C25_CLASS_C_FOUNDATION.md`
- `docs/checkpoints/C26_REGRESSION_DISCOVERY_FOUNDATION.md`
- `docs/checkpoints/C27_AUTHORITATIVE_RECORDER_FOUNDATION.md`
- `docs/checkpoints/C27A_RUNTIME_ARCHITECTURE_FOUNDATION.md`
- `docs/TEARBENCH_RUNTIME_ARCHITECTURE_ALIGNMENT.md`
- `docs/TEARBENCH_GHOST3_CAPABILITY_DASHBOARD.md`
- this master handoff and the active checkpoint appendix.

After each slice, record exact commands/results, test counts, browser artifacts, warnings, assumptions, what is done, what remains locally, and what remains program-wide.

## 13. Working-tree and Git safety

- Current branch: `codex/ghost3-autonomous-completion-plan`.
- Slice 31 is the last pushed coherent green boundary. Slice 32 moves detached
  parity onto that assembly and is the current validation/commit boundary. After that
  boundary, the only expected unrelated working-tree item is the rendering
  plan named below.
- `plans/EXTREME_RENDERING_IMPLEMENTATION_PLAN.md` is unrelated untracked user work. Never stage, edit, delete, or include it in a TearBench commit.
- Preserve existing changes; do not use destructive reset/checkout.
- Before committing, inspect status, diff/stat, and staged diff; stage only related files.
- Keep later slices on the active branch and publish only after their own
  canonical gates and documentation are green.

## 14. Succeeding agent's first-turn checklist

1. Read this file and the full C27A appendix.
2. Read the program charter and completion plan through C40.
3. Read the current C27/C27A reports, runtime architecture alignment, and D14
   in `docs/TEARBENCH_GHOST3_ARCHITECTURE_DECISIONS.md`.
4. Inspect `git status`, changed-file diff, and current source boundaries.
5. Run requirement validation and minimal targeted health checks.
6. Query C27 and other affected mapped requirements and original context;
   follow the explicit C27A authorities above because no atomic entries are
   presently labeled `C27A`.
7. Implement only the exact next C27A ownership slice above.
8. Validate and update progress documents.
9. Reassess current-checkpoint and program-wide remaining work.
10. Continue checkpoint-by-checkpoint only when the user resumes implementation.

## 15. Final definition of done

TearBench is complete only when:

- C21-C40 gates pass in dependency order.
- Required source requirements have completion-grade evidence or explicit authorized disposition.
- Live, replay, headless, and training share the redesigned production simulation composition.
- State Forge, TearBench, TearBot, and Ghost 3 operate together as a visible product.
- Automatic training works without terminal commands while expert/CI commands remain available.
- Determinism, compatibility, migration, storage, performance, security, privacy, accessibility, moderation, and operational recovery have credible evidence.
- Player UI truthfully exposes state, progress, provenance, controls, and failures.
- The final full canonical `pnpm check` passes.
- Dashboard/catalog/checkpoint reports match repository reality.
- Final Git state is clean, intentional, and documented.
