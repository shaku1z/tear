# C40 release-evidence manifest verifier

`pnpm tearbench certify` no longer accepts an asserted commit or `--full-check
passed` flag. It accepts only `--manifest <path>` and independently verifies:

- exact `HEAD`, clean-worktree fingerprint, and per-command clean-HEAD binding;
- passed command, timestamp, retained artifact path, and SHA-256 for every
  required proof;
- named arbitrary-state, normal-journey, and full release matrix coverage;
- retained preservation runtime-manifest and preservation-corpus hashes.

The command always writes a certificate when it can determine repository state.
Any absent, stale, forged, mutated, or incomplete proof writes a `rejected`
certificate and exits non-zero. It is a verifier foundation, not C40
certification: this repository does not currently possess the complete release
evidence corpus or a clean final `pnpm check` run.
