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
candidate; no current C30 bundle is eligible, persisted, or trained on.

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
  through the shared production composition and records its real canonical
  observations/actions/timing; it explicitly names native events,
  reward-components, intents, and build/device/provenance as unavailable. That
  makes the current candidate ineligible rather than fabricating those tracks.
- Provenance must be a structured-state training source with a non-empty
  producer and complete build identity. Personal data may use only
  `private-personalization-only`; pseudonymous data must carry a pseudonymous
  actor ID. The resulting receipt is versioned and content-hashes the exact C30
  candidate coordinate, but makes no mutable corpus write.

## Exit-gate ledger

- [x] Eligibility, consent, and provenance are enforced before C30 candidate
  admission. The permanent proof carries a real two-tick production terminal
  through the bounded C30 intake and rejects it before a corpus action because
  its verified raw bundle still declares unavailable native tracks. It also
  rejects missing synchronized metadata, `no-training`, invalid consent, and
  consent/provenance mismatch.
- [x] Real bounded canonical observation/action/timing tracks are captured from
  the shared production composition. The permanent proof reconstructs a real
  C30 terminal, records ticks zero through terminal plus its exact action
  envelopes, and rejects a tampered terminal hash. Native event, reward,
  intent, build/device/provenance, and capsule-range tracks remain open.
- [ ] Revocation, deletion propagation, privacy retention, pseudonymous
  identity lifecycle, quality scoring, deduplication, outliers, corruption,
  style/skill metadata, and population balance.
- [ ] Review, correction, curation, immutable lineage-bound train/validation/
  calibration/test/hidden-exam splits, durable manifests, and the Academy
  interface.
- [ ] A persisted reviewed sample tied to an exact capsule range; revoked data
  absent from future manifests; hidden exams unreadable by ordinary trainer
  code.

## Deliberately not claimed

This checkpoint does not claim that C30 terminal artifacts contain a complete
learning record, that any candidate has entered `TearDemonstrationCorpus`, or
that a policy has trained. It also does not implement persistence, deletion,
cloud publication, review, C32 artifact loading, C33 behavior cloning, or C36
Foundry automation.

## Evidence

- `pnpm check:c31:foundation` passes: typecheck, full lint, architecture
  checks, and four focused Vitest suites / ten tests.
- `academy-candidate-admission.test.ts` generates a real C30 terminal through
  the bounded production pool and candidate intake. It asserts that the current
  verified-but-incomplete track bundle remains rejected, plus the pre-corpus
  consent/provenance paths.
- `academy-candidate-tracks.test.ts` reconstructs a real C30 terminal through
  the source composition and rejects a tampered terminal hash.
- `agent-academy.test.ts` and
  `production-headless-academy-intake.test.ts` remain green in the same gate.

## Next safe boundary

Wire the native event, reward-component, intent, build/device/provenance, and
capsule-range tracks from the shared C30/C29 composition into that bounded raw
bundle before accepting any candidate into review or a corpus. Do not create
placeholder tracks, and do not weaken the C30 stream's bounded custody.
