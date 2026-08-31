# VAP-3 deterministic shadow planner

## Slice contract

```text
CHECKPOINT:       VAP-3 — Add deterministic shadow planning and explanation
SOURCE:           Tear; isolated worktree Tear-verification-acceleration-plan;
                  branch codex/verification-acceleration-plan
OBJECTIVE:        Explain the complete verification graph for six execution
                  profiles without executing it or changing release authority.
NOT CLAIMED:      VAP-4 receipts/certification, build reuse, parallel CI,
                  protected integration, deployment, or wiki publication.
REQUIRED PROOF:   Golden/hostile planner tests, complete route corpus, five
                  consecutive protected-history canaries, typecheck, and lint.
STOP CONDITION:   Zero missing or unexplained-extra obligations across the
                  route corpus and five protected gameplay validations.
```

## Implemented planner

`scripts/tearbench-shadow-plan.mjs` is a pure deterministic planner. `pnpm
tearbench plan` writes its canonical plan and `pnpm tearbench explain` also
prints each task's selection reasons and the claims or obligations that would
be unproved without it. Both commands are explicitly `shadow-only`; they never
invoke a task and leave the current gate authoritative.

Plans bind the exact planning source, changed-file scope and digest, route
definition, task registry, evidence policy, planner policy, and optional
historical commit/parent basis. They materialize selected route matrices,
capabilities, canonical scenarios, every declared live/headless backend,
effective common and environment invariants, structured assertions, build
targets, comparisons, journey checkpoints, backend-family dispositions,
current-weapon parity, and exact graveyard cases.

The graph preserves dependency output IDs and reports dependency critical path,
resource-class totals, resource-class/key contention upper bounds, the current
authoritative serial timeout budget, profile occurrence duplicates, deduplicable
task reuse, intentional replicas, supported/missing/unsupported obligations,
and explained selection expansions. Unsupported registered invariants remain
visible and cannot masquerade as proved coverage.

The task registry now exposes six planning profiles plus the documentation-only
PR specialization. Pull-request and protected-main profiles exactly project the
workflow's functional chain rather than accidentally adding performance work.
Seven graveyard cases have individually executable typed bindings. The game
reference validation/publication bindings point to their real checked-in files.

## Route corpus proof

`node --test tests/tearbench-shadow-plan.test.mjs` passed five tests. The corpus
covers deterministic ordering, source/registry/policy/route digest drift, all
six profiles, every route family, documentation-only, mapped-plus-unmapped,
central fan-out, common/environment invariants, live/headless backend expansion,
missing matrix/backend failures, duplicate/reuse/replica classification,
resource contention, typed graveyard selection, and a hostile executable marker
proving planning does not run tasks.

## Five-run protected-history canary

Each canary used the exact changed files of the named successful Validate run
and records its commit and first parent in the generated ignored artifact.
Every plan retained 81 unique protected profile occurrences: 78 functional
tasks plus release-preflight, game-reference artifact validation, and
game-reference publication. Selected TearBench evidence expands separately
from the exact diff and is fully explained.

| Validate run | Historical commit | Shadow unique | Missing | Unsupported | Unexplained extra | Profile duplicates |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 33316839231 | `9e7d6a701ca0b992c8d78cccc2af329d698778c0` | 91 | 0 | 0 | 0 | 0 |
| 33314448473 | `7a2d87999f79560ff2da8ac5ae78497f448d6751` | 134 | 0 | 5 | 0 | 0 |
| 33292065009 | `81a7facfc3f0ab5aa3b1525af10991682cb7c991` | 140 | 0 | 7 | 0 | 0 |
| 32957141293 | `91706363b80fb56a18df4d973b424bbce94a279e` | 134 | 0 | 6 | 0 | 0 |
| 32821064971 | `a8a476c6171d913581c01bb0e4432f53cf44f9e4` | 101 | 0 | 0 | 0 | 0 |

Unsupported counts are explicit selected backend/invariant dispositions owned
by current source contracts; they are not missing task bindings and do not
claim coverage.

## Focused proof

- Shadow planner suite: 5 passed.
- Atomic task registry suite: 5 passed.
- Evidence selection/route regression suite: 41 passed.
- Game-reference artifact and wiki-dispatch contract suites: 11 passed.
- Five historical protected plans: complete; zero missing, unexplained extra,
  or profile duplicates.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed after the one reported duplicate object-key defect was
  corrected and the gate rerun.
- `git diff --check`: passed.

## Checkpoint disposition

Complete locally. VAP-3 can explain every current release obligation and the
selected evidence expansion without changing or invoking the gate. No protected
check, workflow authority, branch rule, PR, push, merge, deployment, production
approval, wiki repository, or publication was changed or claimed.
