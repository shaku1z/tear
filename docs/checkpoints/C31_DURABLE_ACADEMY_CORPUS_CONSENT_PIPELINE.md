# C31 - Durable Academy Corpus and Consent Pipeline

**Status:** active - C31 now has a real C30-candidate admission decision before
any corpus or curriculum action. It is a fail-closed foundation, not yet a
durable corpus, encoder, trainer, or Foundry loop.

## Scope and evidence rule

C31 may not turn a terminal artifact into training data merely because it
exists. A candidate must first carry separately declared local-recording,
cloud-publication, analytics, and model-training consent, compatible training
provenance, privacy classification, and synchronized-track evidence. An
eligible decision would authorize only later C31 review/curation to consider the
candidate. A materialized candidate can now enter durable *pre-corpus custody*
only after that decision; no current C30 bundle is a reviewed corpus sample or
is trained on.

## Verified foundation

- `assessAcademyCandidateEligibility` consumes the actual, versioned C30
  terminal item emitted by `ProductionHeadlessAcademyIntake`. It validates the
  immutable source coordinate, training execution class, terminal tick/hash,
  action count, and the candidate's C30 identity before considering any caller
  metadata.
- `TearAcademyConsentRecordV1` records local recording, cloud publication, and
  analytics dispositions independently from model-training consent. A local
  recording grant plus `no-training`, missing, invalid, or provenance-mismatched
  model consent all fail closed; a revoked local/cloud/analytics record is also
  invalid for admission. Publication and analytics grants cannot be
  substituted for training permission.
- The admission gate requires both a synchronized-track declaration and a
  content-verified raw bundle tied to the same candidate. A declaration alone
  never qualifies. The current bundle reconstructs the sealed C30 terminal
  through an opt-in instrumented shared production composition, terminal-checks
  it against the source artifact, and records real canonical observations,
  actions, native gameplay facts, reward snapshots, and wave planner intents.
  It records the source device accurately as semantic. The C30 terminal still
  carries no embedded build/provenance coordinate or Ghost-capsule range. C31
  can now add those only through `attestAcademyCandidateSource`: it reads a
  complete schema-v2 C27 Vault capsule, requires its sealed replay bootstrap,
  every canonical command envelope, exact zero-to-terminal range, and a copied
  C30 terminal anchor to agree, then binds its build fingerprint and capsule
  integrity root into the raw bundle. `materializeAcademyCandidateCapsule`
  now performs that C31 custody step only after a bounded candidate has been
  pulled from the C30 intake: it writes the actual command trace, reconstructed
  native facts, sealed run-start bootstrap, and copied terminal anchor to a
  complete C27 Vault capsule, then reads it back through the attestation
  contract. The synchronous C30 worker callback remains storage-free, and an
  unmaterialized default intake item remains explicitly unavailable and
  ineligible rather than fabricating either coordinate.
- Provenance must be a structured-state training source with a non-empty
  producer and complete build identity. Personal data may use only
  `private-personalization-only`; pseudonymous data must carry a pseudonymous
  actor ID. The resulting receipt is versioned and content-hashes the exact C30
  candidate coordinate, but makes no mutable corpus write.
- `TearAcademyCandidateCustodyStore` durably holds only an already eligible,
  source-attested candidate in the C28 Vault's namespaced analysis records. It
  snapshots the independent consent decision and retention policy, hash-chains
  acceptance/revocation/expiry events, rejects malformed persisted bytes, and
  exposes only `held` records to later consumers. A model-training revocation
  or retention expiry therefore excludes that candidate from every future held
  query without erasing its audit history. `delete()` verifies that the exact
  attested source capsule shares the custody Vault, refuses a still-shared
  source, then atomically removes its manifest, chunks, indexes, journal, and
  owned assets while committing a non-training `deleted` tombstone. Account or
  cloud deletion propagation remains separate work.
- Every custody record now also carries a versioned privacy-retention policy
  that must match the candidate's declared anonymous, pseudonymous, or personal
  classification. Non-anonymous records require a declared data-subject ID;
  every policy carries its local authorized-actor set. Revocation, expiry, and
  deletion reject an undeclared actor. This is a local declared-authority check,
  not account authentication or cloud identity.
- `TearAcademyCandidateQualityStore` now assesses only the exact declaration
  behind an unexpired `held` custody record. It independently repeats the
  admission verification, binds custody/declaration/track-bundle hashes, and
  persists derived source metadata, transparent track-density score components,
  and explicit short/truncated/dense-action outlier flags. Its content hash
  deliberately excludes episode labels so equivalent captured content is
  recorded as a duplicate. Malformed assessment bytes are excluded from both
  inventory and deduplication. An assessment is `review-required` or
  `duplicate`, never an approval, corpus sample, manifest, or trainer input.
- `TearAcademyCandidateCurationStore` now records one immutable, locally
  authorized human decision over an exact held `review-required` assessment.
  A decision can approve only later curation consideration, reject, or request
  immutable metadata/label/quality corrections; it cannot rewrite source
  evidence. Its `active()` view rechecks custody, so revoked or expired sources
  disappear before a later manifest consumer can see them. It neither creates a
  corpus sample nor assigns a split or exposes anything to trainer code.
- `TearAcademyCandidateSplitStore` now binds one durable pre-corpus assignment
  to the exact active custody, quality assessment, and curation hashes. It
  prevents a verified session/seed lineage from crossing split partitions and
  derives its coordinate from the retained source evidence. Trainer manifests
  exclude hidden-release-exam assignments; only the separate examiner manifest
  view can enumerate them. This remains a partial split/manifests foundation:
  it is not a reviewed corpus sample, versioned corpus manifest, or C32 trainer
  integration.
- The same split store now persists immutable versioned *pre-corpus* manifests
  in the shared Vault analysis namespace. A revision must name the exact prior
  manifest hash; a deleted or revoked custody source is omitted whenever a new
  manifest is rebuilt. The stored manifest is integrity-hashed, but this is
  still not a corpus manifest or trainer-consumable sample.
- `TearAcademyReviewedSampleStore` now materializes a durable reviewed sample
  only from the exact eligible declaration behind held custody, a
  `review-required` quality assessment, `curation-approved` decision, and split
  assignment. It persists the full verified track bundle and exact C27 capsule
  range with every governing hash. It is not yet exposed as a trainer corpus.
- `inspectAcademy` now provides the runtime-owned immutable read model for the
  eventual Academy surface. It aggregates durable custody, quality, curation,
  split, and reviewed-sample state without giving presentation access to Vault
  stores; audit-retained revoked samples remain visible as revoked, not usable.
- `TearAcademyInspectionController` supplies the asynchronous persistence
  boundary for that read model. Presentation receives an immutable `loading`,
  `ready`, or explicit `unavailable` snapshot, never an IndexedDB or Vault
  handle.

## Exit-gate ledger

- [x] Eligibility, consent, and provenance are enforced before C30 candidate
  admission. The permanent proof carries a real two-tick production terminal
  through the bounded C30 intake and rejects it before a corpus action because
  its verified raw bundle still declares unavailable build/provenance and
  capsule-range tracks. A separate permanent C30/C27 Vault proof can now bind
  a complete capsule's exact source range and build to that same terminal and
  reach only an `eligible` pre-corpus receipt. The permanent materializer proof
  drains a real bounded C30 item into that exact source capsule before reaching
  the same receipt. It also rejects missing
  synchronized metadata, `no-training`, invalid consent, provenance mismatch,
  malformed source bootstrap, non-matching commands, and a missing terminal
  anchor.
- [x] Real bounded canonical observation/action/timing tracks are captured from
  the shared production composition. The permanent proof reconstructs a real
  C30 terminal, records ticks zero through terminal plus its exact action
  envelopes, native facts, one reward snapshot per observation, and ordered
  wave-plan/clear intents, then rejects a tampered terminal hash. The source
  device is semantic. Build/provenance and an exact capsule range can be
  captured only through the Vault-bound source-attestation contract; the
  explicit post-intake C31 materializer is the verified custody path, while
  automatic storage in the C30 callback remains deliberately excluded.
- [x] An eligible materialized source can enter a durable, pre-corpus custody
  ledger with explicit retention and consent decisions. Reloaded records retain
  their hash-chained history; model-training revocation and retention expiry are
  excluded from `held()` before any Academy consumer can use them. Malformed
  custody bytes remain rejected and untouched. This is a local Vault custody
  gate, not a reviewed sample or a manifest.
- [x] Privacy/retention ownership is bound to durable pre-corpus custody. The
  stored policy must match the declaration's privacy class, requires a subject
  for personal/pseudonymous records, is preserved across reload, and rejects an
  undeclared actor from revocation, expiry, or deletion. It is intentionally not
  a claim of authenticated accounts, cross-device identity, or cloud authority.
- [x] A C31 deletion decision removes only its exact attested C27 source capsule
  and writes its `deleted` custody tombstone in the same Vault commit. Foreign
  Vaults, root mismatches, retained repair children, and a source still held by
  another non-deleted custody record fail closed. The tombstone is audit-only
  and cannot appear in future held-candidate queries.
- [x] Held-custody quality, duplicate, corruption, outlier, and source-metadata
  assessment is durable and fail-closed. It derives the assessment from the
  verified raw tracks, not caller-provided quality declarations, and does not
  promote any candidate to a corpus path.
- [ ] Account/cloud revocation and deletion propagation, cross-device identity
  lifecycle, style/skill interpretation, and population balance.
- [x] Durable human review/correction/curation decisions remain bound to the
  exact held custody record and assessed source. An undeclared reviewer,
  duplicate assessment, malformed decision, or revoked source cannot enter the
  active curation view. A curation approval is deliberately not a sample,
  manifest, split assignment, or trainer-visible artifact.
- [ ] Immutable lineage-bound train/validation/calibration/test/hidden-exam
  splits, durable manifests, and the Academy interface.
- [x] A persisted reviewed sample is tied to its exact capsule range and full
  verified tracks. When its model-training consent is revoked, a new chained
  manifest omits it; ordinary trainer manifests cannot enumerate hidden-exam
  entries while the separate examiner view can.

## Deliberately not claimed

This checkpoint does not claim that C30 terminal artifacts contain a complete
learning record, that any candidate has entered `TearDemonstrationCorpus`, or
that a policy has trained. It does not implement a reviewed *sample*,
account/cloud deletion, cloud publication, immutable manifests/splits, C32
artifact loading, C33 behavior cloning, or C36 Foundry automation.

## Evidence

- `pnpm check:c31:foundation` passes: typecheck, full lint, architecture
  checks, and ten focused Vitest suites / twenty-four tests.
- `academy-candidate-admission.test.ts` generates a real C30 terminal through
  the bounded production pool and candidate intake. It asserts that the current
  verified-but-incomplete track bundle remains rejected, plus the pre-corpus
  consent/provenance paths.
- `academy-candidate-tracks.test.ts` reconstructs a real C30 terminal through
  the source composition, proves aligned native/reward/intent streams, and
  rejects a tampered terminal hash.
- `academy-candidate-source-attestation.test.ts` records a C27-style source
  capsule into a real memory Vault, reads it back through `GhostCapsuleReader`,
  and proves that only a matching replay context, complete command range, and
  exact C30 terminal anchor unlock a pre-corpus receipt. It rejects a capsule
  without that anchor.
- `academy-candidate-capsule-materializer.test.ts` pulls a real bounded C30
  candidate, materializes its actual commands/native facts/bootstrap/terminal
  anchor into a complete memory-Vault capsule, reads it back, and proves the
  resulting source bundle has no unavailable custody tracks. A legacy terminal
  without its immutable bootstrap is rejected.
- `academy-candidate-custody.test.ts` accepts only an eligible materialized
  source into a durable C28 Vault record and proves it reloads exactly. It
  proves model-training revocation and retention expiry disappear from the
  future held-candidate view while their decision history remains, and excludes
  malformed stored custody bytes without rewriting them. It also rejects a
  privacy policy that does not match the declared classification and an actor
  outside the durable policy's local authority set.
- `academy-candidate-quality.test.ts` assesses only held, verified declarations,
  reloads the durable result, records the same content under a distinct C30
  coordinate as a duplicate, and rejects both non-held and tampered source
  declarations. Malformed assessment bytes remain quarantined rather than
  influencing deduplication.
- `academy-candidate-curation.test.ts` records an authorized human curation
  decision over a held assessment without creating a corpus key, rejects an
  undeclared reviewer and repeat decision, retains immutable correction
  requests, and proves a later model-training revocation removes that decision
  from the active curation view.
- That same curation proof assigns only an active approved source to one
  immutable hidden-exam split, rejects a second assignment, and proves the
  trainer manifest cannot enumerate the hidden assignment while the separate
  examiner view can. It also persists manifest version 1, rejects version 2
  without version 1's exact manifest hash, and persists the valid chained
  version 2. It then materializes a durable reviewed sample and reloads it,
  proving its exact capsule range, hidden-exam split, and verified actions are
  retained. After model-training revocation, a new chained examiner manifest
  contains no entry for that still-auditable sample. The Academy inspection
  snapshot reports that real custody as revoked while retaining its reviewed
  sample count for audit visibility.
- `academy-inspection-controller.test.ts` proves an unsupported runtime reports
  an explicit, stable unavailable state rather than a misleading empty Academy.
- That same custody proof rejects a foreign Vault for deletion, atomically
  removes the actual materialized source capsule only from its matching Vault,
  and retains the durable `deleted` tombstone outside future held queries.
- `pnpm check:c28:vault-reachable` passes after the shared Vault removal
  primitive: six focused suites / thirty-eight tests; browser library,
  migration, interrupted-recovery, and physical-quota journeys. The physical
  bucket is a test-only 256 KiB quota because the current browser's IndexedDB
  metadata exceeds the former 50 KiB before the required control source can be
  retained; the 1,200-tick pressure run still receives a real quota rejection.
- `agent-academy.test.ts` and
  `production-headless-academy-intake.test.ts` remain green in the same gate.
- `pnpm check:c30:foundation` also passes after the opt-in observer addition:
  seven focused Vitest files / eighteen tests, six bounded worker proofs, both
  browser terminal reruns, and the 13-scenario C27A parity capture.

## Next safe boundary

Implement the inspectable Academy interface over the durable C31 stores—lesson
status, recordings, review/corrections, consent, split manifests, and storage—
rather than treating the legacy in-memory corpus as the product surface.
