# C34 - Offline RL, Online RL, Self-Play, and Curriculum

**Status:** active. C34 now performs bounded fitted tabular-Q offline training
from a governed immutable source-world receipt. It does not expose a runtime
policy artifact, explore online, self-play, activate an artifact, or promote a
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
- [ ] Curriculum and exploration controls are configurable and bounded. The
  immutable source curriculum and fixed extraction/reward bounds exist; online
  exploration controls remain absent.
- [x] Safeguards stop a diverging offline run. Reward/source extraction fails
  closed and Q/TD guard trips return a stopped result before any model exists.
  Cancellation and online-run safeguards remain future work.

DONE THIS STEP:      C34 trains and retains a bounded fitted-Q result from an
immutable C31/C30 trajectory receipt, with deterministic resume and a real
divergence stop.
PROVEN BY:           `tests/unit/offline-rl-training.test.ts` (7 tests),
`pnpm typecheck`, targeted ESLint, and `pnpm check:architecture`.
REMAINING HERE:      Source-world evaluation/quality for the offline challenger,
then headless online RL, self-play, curriculum expansion, and run safeguards.
REMAINING TO C40:    C25/C27/C29/C30/C31/C33 exits and C34-C40 product evidence.
NEXT SLICE:          Evaluate a retained offline-Q challenger through a declared
source-world protocol; do not construct a runtime artifact or activation path.
