# C37 - Coach to Practice Verified Projection Foundation

**Status:** partial normal-build Coach slice - selected-pair Theater projection and
finding-gated practice are player-visible; broader Coach measurement remains open.

`projectGhostCoachPractice` accepts an explicitly selected target and a distinct
explicitly selected baseline only after both pass the production V3 replay
session boundary. It refuses a mixed build fingerprint and derives the small
set of scalar observations from the selected capsules' verified causal bytes.
The returned provenance hash binds both source IDs, verified source roots,
build coordinate, and the exact observed metrics. Draft and run-management are
shown as unavailable because no verified aggregate/counterfactual metric exists.

The normal C29 Theater now has a `COACH` action. It first opens an empty Coach
panel, then shows locally readable complete V3 capsules as explicit baseline
buttons. It never selects a peer. Selecting one calls this projection and
fails closed for same-source, mixed-build, or invalid sources. The panel shows
target/baseline IDs, build and provenance hash, rendered findings, and the
unavailable draft/run-management domains. A rendered finding may launch only a
`coach-assisted` unranked child from the Theater's *current verified
checkpoint*; no finding means no Coach practice control. The source capsule
remains immutable through the existing C29 child-launch boundary.

This does not claim aggregate/peer/TearBot/expert coaching, counterfactual
draft or run-management evidence, ranking, persistence, cloud work, or C38.

### Verified Run DNA Theater panel

The normal Theater now has a `RUN DNA` control with a read-only capsule
projection. It calculates `run-dna-v1` only when the verified durable capsule
contains exactly one complete declared `run-dna-metrics-v1` result. The panel
shows that formula version, the capsule custody label, every source metric,
and the five derived dimensions. Missing fields, no declaration, and duplicate
declarations remain visibly unavailable; Theater never substitutes hidden
events, profile/career state, challenge history, exports, or inferred values.

This is a single-run transparent projection, not a career archive, ranking,
recommendation, clustering, challenge, export, persistence, or player-behavior
claim. `tests/unit/ghost-run-dna-theater.test.ts` proves complete-only and
ambiguous/absent refusal; the screen renderer contract retains the semantic
toggle without renderer-owned side effects.

Evidence: `tests/unit/ghost-coach-practice.test.ts` covers distinct-source
rejection and selected same-build provenance projection. The C27/C29 browser
journey now creates durable local V3 capsules, opens the ordinary Theater,
uses its visible Coach control, explicitly chooses a rendered baseline, and
asserts visible selected source IDs before exercising the existing immutable
practice child path.

### Normal Ghost Lab home

The normal standalone main menu now exposes `GHOST LAB` as a bounded local
home. Its only enabled routes are Academy, Foundry Status, and Ghost Vault;
the Vault remains the existing capsule-gated path to Theater and Coach. Watch,
State Forge, Bot Ladder, and Studio render as explicit unavailable/not-yet-
player-safe declarations. This creates no cloud, traffic, promotion, rollout,
or test-query route and does not claim a forensic developer Ghost Lab.
