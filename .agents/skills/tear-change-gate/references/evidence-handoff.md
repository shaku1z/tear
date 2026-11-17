# Evidence Handoff

A specialist skill (playtester, combat scenarios, feature wiring, UI regression, oracle
parity, save and cloud) hands its result to `tear-change-gate` in this form. The gate skill
uses it to decide which repository checks still need to run. It does not replace any of
them.

## What to hand over

- **Source:** branch, exact revision, and whether the worktree was clean or dirty when the
  evidence ran.
- **Claims:** what the change is said to do, in one line each.
- **Commands:** every command run, with its result (passed, failed, skipped) and why any
  was skipped. Name the build each browser command ran against.
- **Evidence:** paths to the artifacts the commands wrote (run JSON, selections,
  screenshots), under `artifacts/` or the scratch directory.
- **Gaps:** claims no command established, checks that could not run, and anything only a
  person can confirm (feel, device or controller checks).

## Rules

- Evidence belongs to the source it ran on. If the source changed afterwards, rerun the
  affected command; do not relabel an old result.
- A local pass does not replace a required CI check, and targeted checks do not replace
  `pnpm check` for a release candidate.
- A failure stays reported after a passing rerun; a recovered flake is not a first-time
  pass.
- Missing evidence is a gap, not permission to approve the claim by hand.
