# C34 - Offline RL, Online RL, Self-Play, and Curriculum

**Status:** active. C34 now performs bounded fitted tabular-Q offline training
from a governed immutable source-world receipt and can execute a bounded,
receipt-derived C30 curriculum as non-trainable evidence. It does not expose a
runtime policy artifact, self-play, activate an artifact, or promote a
challenger.

## Proven foundation

- `createTearOfflineRlPlan` admits only the `training` split of one immutable
  C31 dataset. It binds the dataset/manifest root, each selected candidate and
  sequence hash, every source scenario hash, declared lessons, fixed seed,
  source-world execution identity, reward definition, and extraction bounds.
  Validation/calibration/test/hidden data cannot be selected by this plan.
- A C34 reward definition has only named source facts: run completion/defeat,
  wave clears, enemy defeats, and canonical score deltas. Every component has a
  declared weight, source bound, and per-transition cap; the total has a
  declared finite range. Existing Academy `rewardComponents` are retained as
  aligned `RewardRuntime` snapshots, not misrepresented as RL returns.
- `extractTearOfflineRlTrajectories` projects contiguous source-world
  `(state, semantic actions, next state, native events, reward, terminal)`
  records. It requires an exact sealed terminal canonical hash, aligned reward
  snapshots, monotonic bounded commands/events, one terminal per selected
  sequence, and an exact plan/dataset/selection match.
- A duplicate terminal-completed native fact planted in the fixture exceeds the
  frozen completion source limit and aborts extraction. Altered plans, held-out
  data, off-episode actions, duplicate source scenarios, unbounded reward
  sources, and changed source selection also fail closed.
- The result is a content-addressed trajectory receipt with observable reward
  component totals. It is optimizer input only; no policy registry, activation,
  quality result, or Foundry decision is reachable from this module.
- A fixed-Q learner iterates the retained `(state, semantic action batch, next
  state, reward, terminal)` records in deterministic order. Its checkpoint and
  final result bind the exact receipt, plan, reward, and trainer config hashes.
  A one-epoch resume produces exactly the same nonzero Q model and result as a
  one-shot run.
- Trajectory, checkpoint, and final-result Vault records are idempotent and
  quarantine malformed bytes. The Q learner stops before completing a model on
  non-finite/out-of-bound values or a configured consecutive TD-error breach;
  stopped results contain no model. These C34 stores never import or write the
  C32 artifact registry or active-policy pointer.
- `createTearOnlineRlCurriculumPlan` admits only complete source-owned C30
  training scenarios already bound by that same offline plan and their declared
  Academy lessons. It derives (rather than accepts) a normalized, sorted action
  vocabulary from the immutable trajectory receipt; forged source scenarios,
  lesson mismatches, and empty/oversized vocabularies fail closed.
- Curriculum stages execute in supplied deterministic order with per-stage
  episode limits and global episode, tick, decision, reward, and exact
  integer-epsilon-decay bounds. The executor routes each declared episode to a
  fresh existing production-headless C30 world. Its non-exploration branch is a
  fixed governed vocabulary fallback, not Q/model action selection.
- Curriculum receipts are idempotently retained as `trainable: false`.
  Cancellation, timeout, divergence, and budget stops remain terminal evidence
  and cannot be mistaken for a model update, registry entry, activation, or
  promotion.
- Online-Q execution now requires the V2 semantic-action offline model; V1
  envelope-only model bytes fail closed. Its selector admits only canonical
  receipt-derived actions whose types are advertised by the current C30 policy
  observation. It uses exact integer epsilon selection or deterministic
  Q-value/fallback selection; it cannot inject an adapter command.
- Each Q update is calculated only after one valid fresh-C30 transition using
  the frozen source-world reward definition. The online checkpoint binds the
  curriculum, offline plan/receipt/training result, and trainer config; it
  captures a C30 source checkpoint after every nonterminal tick. Interrupted
  advancement resumes from that same production checkpoint and is exactly
  equivalent to the uninterrupted result in the permanent fixture.
- Update, Q-value, C30 tick, action-space, cancellation, timeout, and malformed
  lineage guards fail closed. Terminal stopped results contain no online model;
  completed local custody is still non-promotional and has no C32 registry,
  activation, promotion, or self-play route.
- A paired tournament can now compare two distinct completed online-Q
  checkpoints through the same frozen curriculum cases in deterministic
  challenger-then-defender order. Each contender gets its own fresh C30 world,
  semantic trace, terminal hash, reward total, and cancellation/budget outcome.
  Their commands never share a world or player slot. This is a controlled
  comparison, explicitly not self-play.
- A separate source-evaluation plan binds one completed offline-Q baseline,
  one completed online-Q checkpoint, the immutable curriculum, receipt, and
  every paired C30 case before execution. Baseline and challenger run the same
  cases in separately reset source worlds, retaining semantic action provenance,
  native-event hashes, terminal hashes, and reward totals. Its explicit reward
  and completion thresholds produced a failing permanent fixture, which remains
  recorded as `passed: false`; it neither promotes a challenger nor clears C34.

## Exit-gate status

- [x] Offline RL trains from the corpus. A bounded deterministic fitted-Q run
  executes the governed C31/C30 receipt and retains its result/checkpoint
  lineage. This is not an evaluated, deployable, or promoted policy.
- [ ] Online RL / self-play runs on headless episodes. The first bounded
  rollout executor creates a fresh C30 production-headless world per declared
  episode, binds a completed offline result/receipt/reward plan, and retains
  seeded semantic-action traces, terminal hashes, reward totals, and
  cancellation/timeout/divergence outcomes. It is non-trainable and has no
  self-play, registry, activation, promotion, or Q-model action-selection path.
  A separate bounded online-Q checkpoint runner now makes real post-C30-tick
  updates with V2 semantic action selection and exact source-checkpoint resume,
  but self-play is absent, so this combined item remains open.
- [x] Curriculum and exploration controls are configurable and bounded. The
  immutable source curriculum, deterministic ordered stages, integer epsilon
  bounds/decay, governed normalized vocabulary, and C30 execution route now
  exist. This narrow scheduler is not online Q action selection, online model
  updating, self-play, or quality evidence.
- [x] Safeguards stop a diverging offline run. Reward/source extraction fails
  closed and Q/TD guard trips return a stopped result before any model exists.
  Cancellation and online-run safeguards remain future work.

DONE THIS STEP:      C34 trains and retains a bounded fitted-Q result from an
immutable C31/C30 trajectory receipt, with deterministic resume and a real
divergence stop.
PROVEN BY:           `tests/unit/offline-rl-training.test.ts` (7 tests),
`pnpm typecheck`, targeted ESLint, and `pnpm check:architecture`.
REMAINING HERE:      Source-world evaluation/quality for the offline challenger,
online model action selection/update with checkpoint recovery, self-play,
curriculum expansion, and run safeguards.
REMAINING TO C40:    C25/C27/C29/C30/C31/C33 exits and C34-C40 product evidence.
NEXT SLICE:          Evaluate a retained offline-Q challenger through a declared
source-world protocol; do not construct a runtime artifact or activation path.

### C34/C32 canonical learned-runtime compatibility prerequisite

`tear-c34-c32-canonical-source-state.v1` now names the future learned-Q runtime
boundary. C30, C34 training, and a future C32 adapter hash the same production
`CanonicalGameplayState`; normalized semantic vocabulary, availability masking,
and equal-Q tie-break are pure and deterministic. Existing V2 C34 result bytes
have no such declaration and explicitly refuse this path. This is compatibility
infrastructure only: it does not convert a result, create a C32 artifact,
register, activate, promote, or claim a deployable learned policy.

### C34 V3 canonical-compatible offline custody

`tear-offline-rl-v3-plan` freezes an exact governed C31/C30 receipt lineage,
the canonical-source adapter identity, a one-to-sixteen canonical action
vocabulary, and bounded Q configuration. Its separate V3 checkpoint/result
custody updates only one-action decision transitions using the shared source
encoder; empty source transitions are not silently converted into a runtime
action. Resume is deterministic, changed plans/checkpoints/results fail
integrity checks, and divergence yields no model. A completed result contains
only the explicit C34/C32 model envelope and exact adapter/vocabulary/lineage
hashes. It neither changes V2 data nor creates a C32 registry artifact,
activation, promotion, Foundry decision, or UI surface.

### C34 V3 online source-world checkpointing

`tear-online-rl-v3-plan` admits only one completed exact V3 offline result,
its governed reward plan, canonical adapter identity, vocabulary, and bounded
natural C30 scenarios. It advances Q values only after a fresh production
headless C30 transition and retains a source checkpoint after every
nonterminal tick. A bounded interruption resumes from that checkpoint with the
same result as an uninterrupted run. Cancellation, timeout, update-budget and
Q-bound stops are terminal non-promotional evidence. A completed challenger
may be compared with its V3 baseline over freshly reset identical C30 cases,
retaining deterministic rewards and terminal hashes plus a pass/fail fact.

V3 checkpoint and evaluation custody is separate in Ghost Vault `analysis`;
reads parse and quarantine corrupt bytes. Checkpoint/plan/result/evaluation
integrity, duplicate state/action values, and mismatched resume cursor fail
closed. This is not self-play, C32 registry admission, activation, promotion,
Foundry execution, or player-facing runtime wiring.

Evidence: `tests/unit/online-rl-v3-training.test.ts` proves fresh C30 source
worlds, one-shot/resume equality, cancellation/timeout/budget stops,
non-promotional paired evaluation, Vault readback, corrupt evaluation
quarantine, and resume provenance refusal.

### C34 V3 candidate-only C32 adapter

Only a completed V3 offline model, completed V3 online checkpoint, and passed
exact V3 source-world evaluation can form the explicit
`c34-v3-c32-tabular-q-policy-v1` candidate payload. It freezes shared canonical
state/action/protocol identities and all offline/online/evaluation hashes. Its
runtime receives the exact C30/C32 canonical source state, masks unavailable
actions, and uses the shared deterministic tie-break. Malformed, legacy,
tampered, unpassed, or incompatible candidates refuse before runtime fallback.
The candidate registry is inactive-only and quarantines corrupt reads; it never
writes C32's active pointer.

The separately authorized C32 execution adapter can now consume a strict V3
active pointer only from the exact production C30/C27A canonical post-step
state and live advertised action kinds. This does not make C34 training,
evaluation, candidate creation, or Foundry evidence a promotion authority:
only a pre-existing active pointer can select it, and malformed V3 provenance
is refused/quarantined rather than routed through legacy inference.

### C36 V3 monitoring eligibility bridge

An explicit C36 boundary can now cite a completed/passed V3 offline, online,
and source evaluation lineage only while retaining a separate immutable
monitoring bridge to an already-inactive C32 candidate. It never converts V2
learning evidence into V3, changes a V3 result, or makes a quality/promotion
claim. Mismatched adapter, vocabulary, plan, checkpoint, evaluation, candidate,
V2 decision/monitoring, current-head, or custody identity refuses.

The resulting V3 candidate may be named by a C36 approval package only after
the exact completed/passed evidence and candidate-only registry bytes still
match. The package is non-promotional custody, not a C34 quality result or
runtime rollout.

### C33 projection repair is separate from C34 learning evidence

C33's shared V2 structured feature projection corrects training/execution units
and semantics for the existing linear and temporal-window perceptrons. Its
lossless bounded weight delivery and exact natural-checkpoint evaluation do not
change the C34 V3 canonical state/Q adapter, manufacture a native V3 receipt,
or establish RL/self-play or held-out quality. The engineering fitted models and
source episodes remain explicitly separate from consented human evidence and
from the native promotion/Watch fixtures. C33's strict completion metric still
requires a genuinely completable source task; Endless truncation is no success.


### Explicit native return-subskill adapters and measured limits

The local resumption implementation adds opt-in `return-exact.v2` and
`return-features.v2` adapters, then additive `return-exact.v3` and
`return-features.v3` adapters. The exact variants encode the complete canonical
state and declared action mask. The feature variants share the declared
quantized player/blade/threat projection; they exclude seed, absolute tick,
score and actor IDs. Their offline playing mask is a curriculum declaration,
not a reconstructed historical observation mask. Runtime selection uses the
actual available action types.

These adapters admit a genuine empty batch plus at most fifteen canonical
commands. Reward schema 2 can credit an actual native Sword catch. Empty
transitions remain empty in the source trace. Entry-present zero values,
missing defaults, supported decisions and scripted fallbacks retain separate
receipts. V3 prefers a present entry over a missing entry only at equal Q;
higher Q still wins, and remaining ties use semantic batch hashes. V1 and both
return-V2 descriptor hashes, selection behavior and candidate identities remain
unchanged. Distinct V3 adapter and candidate-protocol hashes bind the new rule;
the unchanged model/payload/encoder containers retain schema versions 1/2/2.

Constructors now prepare detached immutable models, normalized vocabulary and
a private Q index once. Public unknown-input parsing remains strict, and each
decision still validates its source state, legal mask and 8 ms budget. On the
retained training/validation component measurement at `b50149e0`, median
candidate decision time was 0.087 ms for the 2,100-entry exact model and
0.073 ms for the 1,051-entry feature model. The unchanged public selection plus
source-hash path measured 5.23 ms and 2.71 ms respectively. Forty-eight
selection/support comparisons matched on twenty-four retained states; 576
measured runtime calls produced no budget fallback. This measures that host and
process, without claiming universal timing or learned-policy quality.

The original governed return-V2 comparison at `e56c5ae9` completed 168 fixed
cases and retained its primary held-out result of zero successes out of eight.
After the explicit V3 rule at `3d9f0da4`, a separate experiment reused the six
original governed sources without rewriting their capture build, consent,
custody or bytes. Both final models were frozen before external validation.
Its 24 training/validation cases completed with no unavailable cases or scripted
fallbacks. The feature model succeeded in one of two training paths (recovery
only), while the exact model succeeded in both. Each model scored zero out of
four validation paths. All horizon endpoints remained censored at tick 300.
The predeclared continuation criteria therefore failed, and all 32 planned
fresh held-out cases remained unopened. Internal train-only qualification is
not held-out quality evidence.

Retained training decisions 139 and 140 also demonstrate an unresolved feature
alias: different demonstrated actions share one quantized state. V3 neither
adds time/seed/tick features nor changes bins or reward to hide this limit.
Further changes require a concrete training/validation diagnosis. These results
do not close C33 DAgger, C34 online/self-play/curriculum quality, C35 population
calibration, C36 unattended operation or C40 release acceptance.

Local evidence: `C:/tmp/tear-r14-runtime-selector-measurement-20261020/parent-verification.json`
and `C:/tmp/tear-r14-return-v3-comparison-20261020/parent-train-validation-verification.json`.

## Factorized return V4 implementation boundary

V4 is a new protocol, not a reinterpretation of `return-features.v2` or
`return-features.v3`. `c34-causal-action-features.ts` projects continuous
player/blade geometry, real held input, an independent nearest-threat vector
and ordered past control/effect context. Seed, actor/run identity, absolute
tick, run time, mentor schedule, future outcomes and initial held-age do not
enter the numeric features. Tick/run/frontier identities are ordering and
checkpoint witnesses only. Historical absent aim magnitude retains its
existing full-scale input meaning; unavailable native readiness/cooldowns
remain unavailable. A requested throw/recall is distinct from an accepted
native launch/catch or observed blade-phase change.
Equal-distance threat ties use the complete emitted nonidentity vector,
including known attack-phase semantics, so roster order cannot choose a feature.

`c34-factorized-action-q.ts` fits bounded per-action value heads over independent
motor/threat Gaussian bases and continuous terms. Normalization, centers and
bandwidths come only from training transitions. The declared configuration
bounds centers to 512 per block, weights to 24,000, serialized model bytes to
1 MiB and runtime decisions to 8 ms. Basis selection, regularization and
support rules are fixed before fitting. A basis motor match is labelled
`observed-motor`; other positive responses are explicitly generalized or
unknown. Neither is a tabular entry, probability of success or quality verdict.
Only legal literal empty-or-one-command batches are scored. No scripted,
timeout or unsupported-action fallback is introduced.

The offline and online paths use the same projector, context updater and TD
scorer. A recovery prefix is declared before execution and replayed through
the real production environment; both each source state and its native effects
must match. Online resume stores the exact world checkpoint with causal
context and retains its frozen basis/configuration/vocabulary. Runtime context
checkpoints bind model, actual run and committed frontier; their expected hash
must come from the accepted enclosing authority. A self-supplied hash is not
authentication. Nonzero activation without such a checkpoint or prefix refuses.
Online resume also joins the exact declared case/cursor, source scenario and
bootstrap, origin frontier and retained prefix commands before world adoption.
It neither switches to a valid foreign source nor steps/relearns a prefix.

The optional browser route recognizes V4 separately, stays inactive unless
explicitly activated by an outside authority, and never claims the V3 promotion
monitor. Watch obtains the actual tick-zero canonical projection and forwards
real consumed commands/native effects after one 120 Hz commit. Zero-commit
application frames retain the already queued action without resubmitting it;
context capture refuses while that commit is pending. Older Watch cadence and
model behavior are unchanged. A native next-run start discards the old causal
context and pending batch; it does not authorize cold recovery at a nonzero tick.
The journal retains versioned factor support
and explicit empty-action budget refusals, including measured over-budget
latency. No canonical world/receipt schema or gameplay timer is changed.

Four focused implementation cases pass: the native held-pose alias separates
while a changed threat does not erase learned motor terms; ordering/prefix
refusals hold; a diagnostic conformance model produces a genuine native launch,
pressed recall causing flying-to-returning, and matching catch from fresh and
actual tick-145 origins; and a three-tick native reward fixture preserves
offline/online resume, inactive candidate/browser routing and journal boundaries.
The diagnostic model uses declared unit label targets, not governed reward
training. An additional Watch lifecycle regression fails before the native-start
reset and verifies that a second run binds its own tick-zero context afterward.
These controls establish executable wiring, not learned competence.
The paired evaluator retains native return-goal evidence separately from its
declared scalar reward-gain criterion; the latter alone is not R14 acceptance.

No governed fitting, source enrichment or validation/held-out rollout was run
for this implementation. The six original source bytes/splits and all prior
V2/V3 verdicts remain historical. All 32 fresh V3 held-out cases remain unopened.
The exact native runtime must first incorporate the separately reviewed combat
binding corrections. Only then may an owner-approved frozen protocol run the
original 24 train/validation cases with their unchanged 300-native-tick budgets,
fresh and recovery paths, baselines and accepted-recall matcher. No recovery-only
success or conformance fixture closes the original C33/C34 quality goal.
