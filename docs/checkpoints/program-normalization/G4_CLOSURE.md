# G4 Closure — Permanent terminology and compatibility (approved for PR)

- Baseline SHA(s): protected game `main` at
  `0a4cda8b269c690bebb038aa3a422e1e74902c65` (`0a4cda8`), with the merged
  G4 implementation slices already present.
- Final SHA(s): closure PR head on `codex/g4-closure`; the exact commit SHA is
  recorded by the protected PR receipt and is intentionally not represented
  as the current protected-main implementation base `0a4cda8`.
- Authorized scope: refresh current canonical repository truth, add the
  missing `Soundtrack Desk` governance term, and record the bounded G4
  closure evidence while preserving the protected-merge/post-merge gate,
  keeping G5 locked, and without changing vendor bytes or touching production.
- Files/refs/services changed: `config/terminology-registry.json`,
  `plans/TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md`, and this new closure
  record. Local branch: `codex/g4-closure`. No service, deployment, DNS,
  Access, Tunnel, or published artifact changed; the only authorized external
  handoff is the protected PR for this closure record.
- Backups and hashes: the accepted canonical vendor files remain byte-exact
  and independently verified:

  | Canonical artifact | Bytes | SHA-256 |
  | --- | ---: | --- |
  | `adaptive-soundtrack.esm.js` | 67,717 | `9b88e9597657c44ae5830c67666d089730c156e4b17a993596e9d0c0ab3a5eb7` |
  | `adaptive-soundtrack.manifest.json` | 1,898 | `e6d9a62ebadfdea26a98a1371ba7e084bc8878f7623ad510deafe12d6a945c2a` |
  | `adaptive-soundtrack.provenance.json` | 1,655 | `8932d757212f13845f86906b6c396adca905dcc4e1b9fafd30f5a6f5dc4751da` |
  | `tone-host-14.9.17.esm.js` | 337,361 | `5dd8825c21f50486eea7353b0abdf06119dd76409e4271e3fa54fe8545463446` |
  | `TONE-LICENSE.md` | 1,072 | `391ed5af60b7b5d1f74b31040c5fa645e6e238f3d9b4c971941a262a675bbdcd` |

  The module source is `shaku1z/tear-music` commit
  `7662fc95769d2ed022593c10f308ec10f054edfc`, release schema `2`, version
  `0.1.0-alpha.1`, and Tone `14.9.17`. The paired Tone host and license
  hashes match the trusted legacy copies. Every file under
  `public/vendor/tear-score/` remains preserved and its legacy verifier is
  retained.
- Targeted checks:
  - Protected game post-merge `Validate` run `32628402314` passed on exact
    head `0a4cda8`; local `pnpm check:performance` passed on that same clean
    head.
  - Music protected `main` is now
    `7e443d9d75089b80bb641ba654eee46615b1abd6` (`7e443d9`). The full music
    `pnpm check` passed on PR #13 head `1577f5c`, including 140 CLI tests;
    post-merge `Validate` run `32629490375` is green (job `97169930931`,
    1m57s).
  - Wiki protected `main` is `33a7f86f8f12ce7c98d1805d169142c832afdcf1`
    (`33a7f86`); post-merge `Validate` run `32626685362` passed.
  - This record's scoped checks are `pnpm check:terminology`,
    `pnpm check:active-roster`, `node --test tests/terminology-checkers.test.mjs`,
    `pnpm test:weapons`, JSON parsing of the registry, and `git diff --check`.
    All passed: terminology reported 12 terms and 181 files, active-roster
    reported the exact Final Five, the terminology harness passed 6 tests,
    and the weapon roster passed 19 tests. JSON validation confirmed the
    Soundtrack Desk owner/expiry contract. `git diff --check` reported no
    whitespace errors; Git emitted only its normal LF-to-CRLF working-copy
    normalization warning.
- Full checks:
  - Game hosted Validate and the requested local performance gate are green;
    the broader game full gate is not redundantly rerun for this docs-only
    slice.
  - Music full `pnpm check` is green on PR #13 head `1577f5c` (including 140
    CLI tests), and its post-merge `Validate` observation `32629490375` is
    green.
  - Wiki post-merge Validate is green; synchronization remains disabled and
    fail-closed pending G6.
- External actions: protected PR handoff is authorized after the local commit;
  no deployment or production mutation is authorized or claimed. Protected
  merge and post-merge `Validate`/ref observation remain the canonical G4
  integration gate; G5 stays locked until then.
- Deployment/version IDs, if applicable: none. Production remains frozen;
  no Cloudflare, DNS, Access, Tunnel, or published-artifact change is part of
  G4 closure preparation.
- Assumptions re-audited:
  - The game head and hosted run are exact-head matched, and the local
    performance result was obtained from a clean `main` at that head.
  - The music repository has completed its protected rename to
    `shaku1z/tear-music`; its full check and exact protected-main post-merge
    Validate observation are green.
  - The wiki `main` head and post-merge Validate receipt are current; its
    Worker and sync boundary remain frozen.
  - Earlier G4-A through G4-H checkpoint receipts and the G4-E vendor receipt
    remain immutable historical evidence. This record supersedes only their
    stale aggregate pending/merge wording; it does not rewrite those files or
    their hashes.

## Merged G4 slices

The protected game slices are recorded by PR and merge commit. PR #20 is the
canonical vendor merge; PR #16 is the preceding canonical-first loader slice.

| Slice | Protected PR(s) | Merge commit(s) |
| --- | --- | --- |
| G4-A terminology governance | #11 | `d39da608ef26d1ede618247a93c03b33736ffb7b` |
| G4-B Music surface | #12 | `224e02f216bf7d6a529ae4f49068888ee2047e6d` |
| G4-C Scenario Console | #13, #14 | `9240cda07e58944258655583064529014b123f93`, `d39745c7b2f5df66ecbd0ea492f4f99bf78b2e0b` |
| G4-D Replay Editor/Replay Hub | #15 | `075dfa80bde3262ca7eca56eb5d3d35de97e7c8f` |
| G4-E Adaptive Soundtrack loader | #16 | `a67c8725dabd397c03177da467c9369c617e7aa8` |
| G4-F Game Agent/Run Monitor | #17 | `309335ed7f959de0592b5e458cf88139235e0dc9` |
| G4-G Training Archive | #18 | `2a87abb046b525f37ceddeb8762e71f2bdc483a8` |
| G4-H Training Operations | #19 | `8cd58ac9c9937b3fde1a30389b1a6e45189453cd` |
| G4-E canonical TEAR Music vendor | #20 | `0a4cda8b269c690bebb038aa3a422e1e74902c65` |

## Permanent terms, retained aliases, and expiry owners

The registry now has twelve permanent terms. The new term is `Soundtrack Desk`,
with the explicit cross-repository removal checkpoint
`G7-SOUNDTRACK-DESK-HOST-AND-ALIAS-RETIREMENT`. Alias removal remains gated;
this closure does not retire any compatibility path.

| Permanent term | Retained aliases | Owner | Removal checkpoint |
| --- | --- | --- | --- |
| TEAR Music | `TearScore`, `tear-score` | Audio platform/vendor provenance owner with replay-envelope and audio-catalog owners | `G4-B-MUSIC` |
| Adaptive Soundtrack | `TearScore runtime` | Audio composition/music-director owner with replay metadata owner | `G4-B-ADAPTIVE-SOUNDTRACK` |
| Music | `THE SIGNAL`, `Signal` | Music-surface/catalog owner with settings navigation and presentation owners | `G4-B-MUSIC-SURFACE` |
| Soundtrack Desk | `Foundry Studio (audio)`, `foundry-studio` | Music/Soundtrack Desk owner with required game-integration and infrastructure reviewers | `G7-SOUNDTRACK-DESK-HOST-AND-ALIAS-RETIREMENT` |
| Training Operations | `Foundry`, `Agent Foundry`, `Foundry agent training` | Agent training operations owner across Foundry jobs, launch/recovery persistence, and app routing | `G4-H-TRAINING-OPERATIONS` |
| Scenario Console | `State Forge`, `State Forge Studio`, `state-forge` | TearBench scenario-console facade owner with State Forge codec/runtime bridge owner | `G4-C-SCENARIO-CONSOLE` |
| Replay Editor | `Ghost Studio` | Replay presentation/EDL owner with ghost replay compatibility owner | `G4-D-REPLAY-EDITOR` |
| Replay Hub | `Ghost Lab` | Legacy navigation/replay hub owner with TearBench disposable panel owner | `G4-D-REPLAY-HUB` |
| Game Agent | `TearBot` | Agents/ladder/evaluation owner with bot-evidence and Watch integration owners | `G4-F-GAME-AGENT` |
| Training Archive | `Academy`, `Agent Academy` | Training data custody/consent owner with Academy routes and headless intake owner | `G4-G-TRAINING-ARCHIVE` |
| Run Monitor | `Watch Agent` | Watch host/monitoring owner with Game Agent and Foundry post-promotion monitoring owners | `G4-F-RUN-MONITOR` |
| TearBench | none; unchanged | TearBench/evidence infrastructure owner | `never` |

## Final Five and preserved identifiers

The canonical Final Five remain, in stable order: **Sword, Hammer, Greatsword,
Chainblade, Riftlock**. Spear and Ringblade remain retired identifiers and may
appear only in the governed migration/history allowlists. TearBench and all
hash-bound replay, persistence, provenance, and legacy vendor identifiers stay
unchanged.

- Remaining exceptions with owner/expiry: every retained alias above has an
  explicit registry owner and removal checkpoint; no alias is approved for
  unowned indefinite retention.
- Rollback procedure: do not rewrite any prior checkpoint. Before remote
  handoff, revert this local governance commit through the normal protected PR
  process, or restore the three changed files from protected `main`; vendor
  bytes, legacy paths, and production state require no rollback because they
  were not mutated.
- Reviewer decision: APPROVED FOR PROTECTED PR. The music full gate and
  post-merge `Validate` evidence are green; protected-main merge and the
  post-merge `Validate`/ref observation remain required for canonical G4
  closure. G5 remains locked and no G5 work is performed.
- Closure status: REOPENED (acceptance-complete; becomes canonically CLOSED
  only after protected merge and green post-merge `Validate`/ref observation;
  no deployment).
