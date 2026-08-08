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
