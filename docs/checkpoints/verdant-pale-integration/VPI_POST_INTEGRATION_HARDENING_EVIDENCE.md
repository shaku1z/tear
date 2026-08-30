# Verdant/Pale post-integration hardening evidence freeze

## Result

The post-integration hardening contract is complete at implementation commit
`07cc4c35a3ae38da8ffc8b2f0c036ca46d95ec4a`. The protected six-stage,
60-wave campaign remains authoritative; Pale Traverse remains unpublished and
available only through Playground/engineering surfaces. Shared environment
state, runtime, presentation snapshots, replay serialization, State Forge, and
TearBench codecs now expose biome-neutral contracts, while Verdant and Pale own
their concrete extensions independently.

The final adversarial audit has zero open in-scope findings. One initial audit
did find two architecture-policy gaps after the first otherwise-clean full gate:
a neutral-runtime comment still named the biomes, and Pale telemetry composition
lived in a generic telemetry module. Closure ledger 1 moved Pale telemetry to a
Pale-owned adapter, split its regression test, removed the comment, and made the
architecture gate reject plain biome vocabulary in neutral roots. The complete
repository gate was then rerun from the corrected clean implementation commit;
the earlier gate at `159e94a393e2f0797a58a82b9b518088bfbb78c4` is
superseded by the accepted result below.

## Source identity and protected provenance

- Repository: `shaku1z/tear`
- Integration base and protected `origin/main` during this task:
  `81a7facfc3f0ab5aa3b1525af10991682cb7c991`
- Accepted implementation:
  `07cc4c35a3ae38da8ffc8b2f0c036ca46d95ec4a`
- Implementation subject: `Harden Verdant Pale integration architecture`
- Author and committer: `shaku1z <shatheartboy@gmail.com>`
- Source fingerprint:
  `c3377363e88c5e84b028fd822e0c67c0dca34b90fc5838712e430ad988fbe4cf`
- Immutable Verdant freeze, unchanged:
  `25c589844ec2cfe85a8a6deead881ebb3d699198`
- Immutable Pale freeze, unchanged:
  `4ec0ea52642c4c1830a2403a0910ebb3000a72d1`
- Comparison-only oracle, unchanged:
  `ee5e93141d67cc02505b2227b3be0b10d1819e1c`

## Implemented contract

- Published boss, enemy, variant, reference, achievement, and ordinary-mode
  selection derive from source-owned content availability. The official
  campaign remains Grounds, Undercroft, Crimson Fields, Verdant Sanctum,
  Voidspire, and The Tear, ending at Wave 60.
- Pale Traverse, White Hart, Rimehounds, Pale variants, Aurora Tracks, Ghost
  Tracks, presentation, replay, State Forge, and TearBench coverage remain
  executable engineering content without leaking into published modes or
  references.
- Shared environment contracts and codecs contain only generic fields, combat
  objects, routes, authored payloads, ordering, validation, cloning, pruning,
  rebasing, and presentation projection. Concrete environment-kind identity and
  Verdant/Pale extension behavior live outside the neutral kernel.
- Direct and transitive cross-biome imports are rejected. Neutral contract,
  runtime, codec, and telemetry roots reject concrete biome vocabulary; planted
  negative self-tests prove the gate fails when those dependencies are added.
- Rootbound and White Hart definitions are canonical rather than provisional.
  Rootbound phases 1, 2, and 3 are generically available to State Forge from
  canonical boss authority.
- TearBench direct runs now preserve materializer diagnostics on early failure,
  print the underlying invocation output, use the canonical ignored run path,
  and permit non-wave Playground scenarios without weakening wave-owning-mode
  invariants.
- Current architecture and feature documentation distinguish active production
  truth from immutable historical evidence.

## Accepted validation

All commands below ran in
`C:\\Users\\realm\\Desktop\\game\\worktrees\\Tear-post-integration-truth-hardening`.

### Final clean repository gate

`pnpm check` passed from the clean accepted implementation commit. Its major
results included:

- source governance, recovery, workspace, artifact, publication, architecture,
  typecheck, lint, preservation, parity, audio-provenance, PWA, and offline gates;
- 453 Vitest files passed and 4 skipped; 1,928 tests passed and 4 skipped;
- standalone and CrazyGames production/test builds;
- browser smoke, feature, navigation, progression, Playground, boss, cinematic,
  State Forge, input, combat, enemy, player, weapon, runtime, and parity journeys;
- current-game TearBench selection, authority evidence, replay, and Graveyard
  checks; and
- browser performance regression checks with no relaxed budget.

Build receipts from that gate:

| Target | SHA-256 artifact hash |
| --- | --- |
| production standalone | `4cfb81ea91dc9c57ff7f704dbca8cdfed30b88c4022b45f75dd732dbb259b636` |
| production CrazyGames | `be97aefe6ca27375dbdce7e89feea78869df811b60e8bb8cc9bfd33166476f25` |
| reproducible package ZIP | `e4f3ba07d0e98792a1cc197f6820b20ae89717a31157e54c9325cc0cbd5e92f6` |
| test standalone | `c82cdaee59b21d338e3c79dfd2d8659914834a972fa3f51f9a45e812f4b30c9d` |
| test CrazyGames | `4e9d2b9ade39b7aa3815a345256ae1b7048dc441d46b73ab5b35c3ddb4de52dc` |

Final browser performance samples used Chrome `151.0.7922.170` at 1600x900
with 600 samples per profile. Active gameplay p95 frame time was 1.90 ms;
constrained gameplay 14.00 ms; Verdant 3.90 ms; and Pale 3.00 ms. No profile
reported a new long task. The retained generated report is
`artifacts/tearbench/generated/browser-performance.json`.

### Focused and adversarial proof

- `pnpm check:architecture` passed after the closure and again after the full
  gate. Its direct, transitive, neutral-vocabulary, and planted-negative checks
  all passed.
- Focused publication, reference, campaign, achievement, environment, codec,
  replay, State Forge, boss, variant, Rimehound, presentation, and audio tests
  passed before the final gate.
- Diff-aware TearBench validation selected 25 scenarios and 36 source/test files;
  227 selected tests plus browser and authority evidence passed.
- `pnpm tearbench run verdant-variant-selection --seed 1001 --repeat 1` passed
  and wrote
  `artifacts/tearbench/runs/verdant-variant-selection-1001.json`.
- `pnpm tearbench rerun --artifact artifacts/tearbench/runs/verdant-variant-selection-1001.json`
  passed with the same scenario, seed, and repeat count.
- A forced missing-actions run exited nonzero as intended and retained a
  `tearbench-run-materialization-diagnostic` containing the materializer's
  `ENOENT` stderr instead of naming a nonexistent run artifact.
- Semantic searches found no concrete biome vocabulary in the neutral contract,
  runtime, snapshot, telemetry, or TearBench codec roots. The remaining “five”
  matches are an explicitly historical TearBench statement and legitimate
  cumulative 5/25 boss-kill achievements, not campaign-count assumptions.
- Protected main remained clean at the integration base. The Verdant and Pale
  worktrees remained at their exact immutable freeze heads.

## Evidence routing and reproducibility

Durable task authority is the adjacent
`VPI_POST_INTEGRATION_HARDENING_CONTRACT.md`; this file is the compact canonical
result. Raw, reproducible outputs remain under the repository's ignored artifact
policy rather than being committed:

- `artifacts/tearbench/runs/` — direct run and deterministic rerun material;
- `artifacts/tearbench/generated/` — selection, diagnostics, performance, and
  other regenerated gate output;
- `dist/` and package-output paths — reproducible build products.

The exact implementation commit is the source authority. Re-run `pnpm check`
from that commit to regenerate the complete local evidence set.

## Intentional boundaries and remaining owner-authorized work

These are not unresolved defects in this hardening goal:

- Verdant and Pale continue to use the approved `fillet` engineering music
  fallback. Final replacement cues remain separate soundtrack-owner work.
- Pale remains unpublished Playground-only preview content by policy.
- No push, PR, merge to protected main, deployment, wiki/reference dispatch,
  soundtrack re-vendoring, or frozen-worktree deletion was performed.
- C40 release certification remains unclaimed. C40 is the final evidence
  certificate for one exact clean source commit: it verifies a complete retained
  schema-2 release corpus covering arbitrary-state tests, normal journeys,
  device/input/output matrices, replay/preservation, and the full repository
  gate. Certification binds proof to a commit; it does not change gameplay,
  publish reference data, replace music, or deploy the site.

## Final post-audit disposition

Closure ledger 1 is fully resolved, the corrected full gate passed, the original
TearBench failure was reproduced as a passing materialized run and rerun, source
and documentation were re-searched, protected histories were rechecked, and no
in-scope issue remains open. The branch is ready for owner-authorized protected
PR/integration; those external mutations remain outside this evidence freeze.
