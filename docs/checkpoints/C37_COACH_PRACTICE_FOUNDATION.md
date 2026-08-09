# C37 - Coach to Practice Verified Projection Foundation

**Status:** partial foundation - no normal-build Coach screen or browser journey yet.

`projectGhostCoachPractice` accepts an explicitly selected target and a distinct
explicitly selected baseline only after both pass the production V3 replay
session boundary. It refuses a mixed build fingerprint and derives the small
set of scalar observations from the selected capsules' verified causal bytes.
The returned provenance hash binds both source IDs, verified source roots,
build coordinate, and the exact observed metrics. Draft and run-management are
shown as unavailable because no verified aggregate/counterfactual metric exists.

This does not enumerate a latest capsule, choose peers, consult TearBot or an
expert source, launch practice, add a screen/action, or establish a browser
journey. Those remain required C37 work.

Evidence: `tests/unit/ghost-coach-practice.test.ts` covers distinct-source
rejection and selected same-build provenance projection.
