# C34 - Offline RL, Online RL, Self-Play, and Curriculum

**Status:** active. C34 now has a governed, immutable source-world offline-RL
input boundary. It does not yet train a policy, explore online, self-play,
activate an artifact, or promote a challenger.

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

## Exit-gate status

- [ ] Offline RL trains from the corpus. This slice establishes the only
  admissible corpus/reward input; a bounded offline optimizer plus retained
  checkpoints/results is still required.
- [ ] Online RL / self-play runs on headless episodes. C30 remains the required
  production-headless executor; no online exploration or second simulator was
  added.
- [ ] Curriculum and exploration controls are configurable and bounded. The
  immutable source curriculum and fixed extraction/reward bounds exist; online
  exploration controls remain absent.
- [ ] Safeguards stop a diverging run. Input reward/source violations fail
  closed; trainer cancellation/divergence controls remain future work.

DONE THIS STEP:      C34 has an immutable training-only trajectory and reward
boundary derived from C31/C30 source-world evidence.
PROVEN BY:           `tests/unit/offline-rl-training.test.ts` (4 tests),
`pnpm typecheck`, targeted ESLint, and `pnpm check:architecture`.
REMAINING HERE:      Bounded offline optimization/checkpoint custody, then
headless online RL, self-play, curriculum expansion, and run safeguards.
REMAINING TO C40:    C25/C27/C29/C30/C31/C33 exits and C34-C40 product evidence.
NEXT SLICE:          Fit a bounded offline learner only from a retained C34
trajectory receipt, with immutable plan/reward lineage and resumable custody.
