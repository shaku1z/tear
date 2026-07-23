# C11 — Ghost Capsule, Recorder, and Local Vault

## Outcome

Complete. Long causal recordings stream into integrity-checked local capsules without retaining the full run in memory.

## Delivered

- `.tearghost`-style manifest, chunk index, independent checksums, root integrity, and debug JSON.
- Bounded streaming recorder for commands, RNG, events, results, keyframes, and presentation.
- Worker port for encoding, hashing, compression metadata, and thumbnails.
- Backpressure metrics with declared presentation-track downgrade.
- IndexedDB and in-memory adapters for manifests, chunks, assets, indexes, upload jobs, analysis, lineage, settings, journals, and quarantine.
- Crash-safe journaling, recovery, quota tiers, export, and hostile import validation.
- Ghost Doctor scan, repair-child, quarantine, and index rebuild.

## Evidence

- A 20,000-tick run produced more than 300 chunks while never buffering over 64 entries.
- A fresh Vault instance recovered the last committed crashed session.
- A corrupt chunk was isolated and quarantined while both the original manifest and repaired child remained accessible.
- Encoded-size and decompression-bomb imports were rejected.

## Gate Results

- Focused Ghost Vitest: 9 tests passed.
- TypeScript: passed.
- Focused ESLint: passed.
- Source architecture: passed.

## Decision

Promote C11. Begin C12 replay world, Theater, practice, and comparison.
