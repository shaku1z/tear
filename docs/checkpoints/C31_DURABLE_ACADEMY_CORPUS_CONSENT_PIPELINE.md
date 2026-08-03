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
  query without erasing its audit history. This is not deletion propagation:
  the source capsule and its eventual physical deletion remain separate work.

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
  gate, not physical capsule deletion, a reviewed sample, or a manifest.
- [ ] Revocation, deletion propagation, privacy retention, pseudonymous
  identity lifecycle, quality scoring, deduplication, outliers, source/capsule
  deletion, style/skill metadata, and population balance.
- [ ] Review, correction, curation, immutable lineage-bound train/validation/
  calibration/test/hidden-exam splits, durable manifests, and the Academy
  interface.
- [ ] A persisted reviewed sample tied to an exact capsule range; revoked data
  absent from future manifests; hidden exams unreadable by ordinary trainer
  code.

## Deliberately not claimed

This checkpoint does not claim that C30 terminal artifacts contain a complete
learning record, that any candidate has entered `TearDemonstrationCorpus`, or
that a policy has trained. It does not implement a reviewed sample, source or
cloud deletion, cloud publication, review, C32 artifact loading, C33 behavior
cloning, or C36 Foundry automation.

## Evidence

- `pnpm check:c31:foundation` passes: typecheck, full lint, architecture
  checks, and seven focused Vitest suites / seventeen tests.
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
  malformed stored custody bytes without rewriting them.
- `agent-academy.test.ts` and
  `production-headless-academy-intake.test.ts` remain green in the same gate.
- `pnpm check:c30:foundation` also passes after the opt-in observer addition:
  seven focused Vitest files / eighteen tests, six bounded worker proofs, both
  browser terminal reruns, and the 13-scenario C27A parity capture.

## Next safe boundary

Define C31 source-capsule deletion propagation and identity/retention policy
around the custody ledger, then add quality, deduplication, and review without
allowing any non-held candidate into a corpus manifest. Do not move Vault writes
into the C30 worker callback, replace verified custody tracks with caller
declarations, or promote a source capsule into a corpus sample without the
separate governance and review gates.
