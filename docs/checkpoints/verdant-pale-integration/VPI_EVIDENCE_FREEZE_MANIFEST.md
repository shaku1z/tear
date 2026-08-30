# Verdant production + Pale preview integration evidence freeze

Status: **accepted**

Local acceptance date: 2026-08-29 (America/New_York)

Implementation commit: `843e73fbc911c7b95d2387736415f8dd70cda0e3`

This manifest freezes the acceptance evidence for publishing Verdant Sanctum in
the six-stage Adventure while retaining Pale Traverse as complete,
unpublished Playground and engineering content. It supplements
`VPI_TASK_CONTRACT.md`; it does not authorize deployment or a protected-main
merge.

## Provenance and immutable history

| Role | Commit |
| --- | --- |
| Protected integration foundation (`origin/main`) | `91706363b80fb56a18df4d973b424bbce94a279e` |
| Immutable Verdant Revision 3 freeze | `25c589844ec2cfe85a8a6deead881ebb3d699198` |
| Immutable Pale Revision 3 freeze | `4ec0ea52642c4c1830a2403a0910ebb3000a72d1` |
| Integration implementation | `843e73fbc911c7b95d2387736415f8dd70cda0e3` |

The implementation is one two-parent merge whose parents are, in order,
protected main and the Pale freeze:

```text
91706363b80fb56a18df4d973b424bbce94a279e
4ec0ea52642c4c1830a2403a0910ebb3000a72d1
```

No separate Verdant merge was made because Pale contains the complete Verdant
freeze ancestry. The verified historical topology is:

- merge-base(Verdant, Pale) = the Verdant freeze;
- merge-base(main, Verdant) = protected main;
- merge-base(main, Pale) = protected main;
- Verdant is an ancestor of Pale; Pale is not an ancestor of Verdant.

This linear history is accepted as immutable provenance. The product boundary
is architectural siblinghood: neither biome-specific feature imports or
constructs the other.

## Accepted production truth

The source-owned published registry resolves to exactly:

1. Grounds / Warden / waves 1–10
2. Undercroft / Iron Colossus / waves 11–20
3. Crimson Fields / Aldric / waves 21–30
4. Verdant Sanctum / Rootbound / waves 31–40
5. Voidspire / Echo / waves 41–50
6. The Tear / Source / waves 51–60

Published progression, achievements, boss and biome completion, ordinary mode
rosters, campaign references, and generated game-reference data consume the
published-content set. The integration does not alter the legitimate Final
Five weapon set or universally available weapon abilities.

Pale Traverse is retained with this declarative availability:

| Surface | Available |
| --- | --- |
| Adventure | no |
| Endless | no |
| Gauntlet | no |
| Boss Test | no |
| Enemy Test | no |
| Tutorial | no |
| Playground | yes |
| Published/reference progression | no |

Aurora Tracks, Ghost Tracks, Rimehounds, all five Pale variants, White Hart,
Pale presentation, persistence/replay codecs, State Forge factories, and
TearBench scenarios remain implemented and executable through explicit
engineering authorities.

## Architectural-independence proof

The canonical environment foundation owns biome-neutral field, combat-object,
route, lifecycle, event, observation, codec, cleanup, restore, replay, and
State Forge contracts. Verdant and Pale register independent feature modules
over those contracts:

- Bloom Wells and Aurora Tracks are separate field implementations;
- Graft Anchors/root links and Pale track objects consume generic combat-object
  and route contracts;
- Rootbound and White Hart consume generic world/environment ports;
- Pale can be materialized into a fresh world from Playground, State Forge,
  replay, and TearBench without a prior Verdant lifecycle;
- Verdant remains functional when preview content is unavailable;
- source-architecture and `biome-environment-independence` tests reject direct
  cross-biome implementation dependencies.

Permanent tests also cover Pale exclusion from ordinary progression and
rosters, published counts and wave boundaries, explicit White Hart engineering
launches, and complete Crimson→Verdant, Verdant→Voidspire, and
Voidspire→Tear environment cleanup. The six-stage balance boundary additionally
proves every authored difficulty can reach Wave 60 and that Echo at Wave 50 and
Source at Wave 60 retain their authored health multiplied by the canonical
difficulty HP modifier, without a hidden seventh-stage structural multiplier.
The Boss Test result journey waits for the lazy result renderer before clicking
Retry; three consecutive focused browser runs passed after this evidence-race
hardening.
The scripted agent journey likewise clicks the center of Replay's Back control
through the atomic click-and-wait helper; three consecutive focused journeys
passed after replacing the former near-edge click.

## Acceptance commands and results

Product-bearing focused validation and the build-bound performance capture ran
from the clean implementation commit above. Diff-aware TearBench and the final
repository gate ran from the clean evidence-freeze commit directly above that
implementation.

| Command | Result |
| --- | --- |
| `pnpm requirements:check` | PASS; 6,885 normative requirements and 0 unmapped source lines |
| `pnpm check` | PASS; complete functional and unchanged performance gates |
| `pnpm tearbench ci --files-from artifacts/tearbench/generated/vpi-final-changed-files.txt --artifact artifacts/tearbench/generated/vpi-final-diff-evidence.json` | PASS; exact 402-path integration diff selected 30 routes, 25 scenarios, and 52 successful executions |
| `git diff --cached --check` | PASS before the implementation commit |

The full gate included documentation/workspace/artifact governance,
typechecking, lint, source architecture, the preservation corpus, serialized
unit and parity tests, current weapon and gameplay authorities, soundtrack and
TearScore provenance, clean reference generation, production/test builds,
bundle/package/reproducibility checks, Cloudflare and Ghost dry-runs, browser
gameplay and journey suites, State Forge, input and responsive matrices,
platform isolation, CrazyGames iframe lifecycle, PWA offline behavior, and the
performance regression suite.

One pre-final gate attempt and the first diff-aware retry exposed the same
Boss Test journey race: state reached `gameover` before its lazy result renderer
had registered the Retry button. The journey now uses the shared screen-ready
contract. Three consecutive focused runs and the definitive 52-execution
diff-aware bundle passed after that correction.

Key receipts:

- unit corpus: 452 files passed, 4 skipped; 1,926 tests passed, 4 skipped;
- final diff-aware TearBench selection: 36 selected unit files and 227 tests
  passed; all 52 build, scenario, journey, and authority executions passed with
  no failed or skipped execution;
- selected Pale routes included Aurora/Rimehound, variant selection,
  wave/reference authority, and White Hart; selected Verdant routes included
  the environment kernel/codec, Bloom Wells, Rootbinder networks, Rootbound,
  wave balance, variants, and presentation;
- current live gameplay: 13 source-owned browser scenarios passed;
- State Forge: 600-tick restore plus 39 clean-runtime launch cases passed;
- standalone reproducibility: 116 byte-identical generated files;
- CrazyGames reproducibility: 111 byte-identical generated files;
- CrazyGames package SHA-256:
  `65f3d01a8d3bc13235eae4172ef0c0ca40ffbee8d7c05618414604d49c3eedad`;
- standalone artifact SHA-256:
  `5e41895b6e233dbf05b487ee5a287382625021f8f4909bd8729942e6046f4b44`;
- CrazyGames artifact SHA-256:
  `13697d7c2ef5b73dd2ff150a927bd290e7c6c2a0717c3533cbf69daff6bd57b8`;
- requirements source SHA-256:
  `007BE22193F5369B8450AAB33B95C6D3080176E6B2F91A1D504B545CA7FC7DDE`.

## Performance boundary

Chrome `151.0.7922.170`, headless 1600×900, 600 samples per workload:

| Workload | Simulation p95 | Render p95 | Frame p95 | New long tasks |
| --- | ---: | ---: | ---: | ---: |
| active gameplay | 1.0 ms | 1.1 ms | 1.9 ms | 0 |
| constrained gameplay | 3.9 ms | 4.4 ms | 7.5 ms | 0 |
| Verdant | 1.2 ms | 1.2 ms | 2.2 ms | 0 |
| Pale preview | 1.3 ms | 1.2 ms | 2.1 ms | 0 |

The Pale workload exercised four Aurora fields, three Ghost routes, two
Rimehounds, five variants, and White Hart. Five reset/run/quit cycles remained
within the existing heap-growth budget (`1,282,412` bytes). No performance
budget was relaxed. The report is now fail-closed on the build-info schema and
records the exact served build. This accepted run used clean implementation
`843e73fbc911c7b95d2387736415f8dd70cda0e3`, test-standalone artifact SHA-256
`aa092ae156c18f3a8f259feacb623d181e0638eff958a4ede6291e2b7aaeaa3c`,
and 116 attributed files.

## Evidence disposition

This manifest and the task contract are the canonical committed evidence for
the integration checkpoint. Regenerable raw output remains under the
repository artifact policy, primarily `artifacts/tearbench/generated/`, and is
ignored unless deliberately promoted. The final performance report was
generated at `artifacts/tearbench/generated/browser-performance.json`; current
weapon selection evidence was generated at
`artifacts/tearbench/generated/current-weapon-parity.json`. Build products
remain under `dist/` and are regenerable rather than committed evidence.

Frozen Verdant and Pale checkpoint evidence remains in its original immutable
history. Pale's historical wave-41–50 campaign evidence describes its authored
feature-line state; this integration's source-owned publication policy
supersedes only its production exposure.

## Limitations and remaining authorization boundaries

The following were intentionally not performed:

- merge or push to protected main, PR creation, deployment, or publication;
- game-reference/wiki dispatch;
- final soundtrack re-vendoring;
- C40 certification;
- deletion, rewriting, or further implementation in either frozen feature
  worktree;
- publication of Pale Traverse into ordinary modes.

Those actions require separate owner authorization. Within the authorized
integration scope, no implementation, validation, or evidence-freeze work
remains.
