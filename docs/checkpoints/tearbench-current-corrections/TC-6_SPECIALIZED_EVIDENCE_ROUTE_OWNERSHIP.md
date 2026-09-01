# TC-6 — Specialized evidence-route ownership

## Current disposition

TC-6 is green at local implementation commits
`0473e3d85e833474112e81b81715371b29e764ec` and
`244db27` on `codex/tc6-route-scope`, from baseline
`cc0007eaaeab58f846d0f751eb1725b1d2332dfe`. The executable selector now
fails closed when specialized evidence ownership is incomplete while retaining
the conservative shared-runtime union for unmapped changes.

## Route authority

- `scripts/tearbench.mjs` is the executable selection and route-validation
  authority. The TypeScript selector is explicitly a compatibility projection
  and is checked against the CLI for recognized-plus-unmapped and
  documentation-plus-unmapped fixtures.
- Route IDs must be unique; prefixes must be safe and match tracked repository
  paths; specialized routes must name an owner and route required scenarios or
  an explicit reduced disposition.
- Required specialized scenario IDs must exist in the route and materialize
  through the canonical catalog. Missing owner, missing scenario proof,
  missing reduced disposition, invalid prefix, and invalid command ownership
  all reject before execution.
- Shared-runtime remains a conservative fallback. Recognized routes are
  unioned rather than suppressed, and an unmapped file beside a recognized or
  documentation route still adds shared-runtime evidence.
- Protected and scheduled selectors continue to inspect the complete intended
  commit range.

## Replay/headless dispositions

The production combat, replay, and headless composition owners route to one
explicit authority command and serialize seven auditable backend records:

- weapon abilities — supported;
- hazards/support — supported;
- weapon-world contact — supported;
- Source void — unsupported on the detached production backend and directed to
  live evidence;
- boss add/clone paths — supported;
- blade contact — supported;
- area damage — supported.

The selector validates exact seven-family coverage, unique family IDs, known
dispositions, route ownership, and approved command ownership. The records are
included in selected evidence and the canonical diff scope so later receipts
cannot hide or silently change the backend boundary.

## Validation

- The canonical `pnpm test:tearbench-selection` gate passed 32/32 in
  113.4 seconds, including specialized route, mapped/unmapped,
  documentation/unmapped, publication, environment, Rootbound, Pale, scenario
  materialization, and protected-range coverage.
- Corrective focused selector tests passed for the optional-subject fail-closed
  boundary and all seven hook-family disposition records.
- TypeScript release-certification tests passed 7/7, including executable CLI
  to TypeScript projection compatibility.
- TypeScript project typecheck, CLI syntax, route JSON uniqueness, dry
  multi-family inspections, documentation, terminology, and diff checks
  passed.
- An independent first review found the optional-subject vacuity and missing
  auditable hook-family records. Both were corrected and the exact-commit
  re-review passed.

No browser suite was required because no owning gameplay family changed. No
merge, push, protected workflow, deployment, publication, wiki action, or C40
claim was made.
