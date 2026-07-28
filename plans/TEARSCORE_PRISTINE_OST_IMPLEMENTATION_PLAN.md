# TearScore Pristine Adaptive OST Implementation Plan

**Document status:** Build-ready implementation plan  
**Primary repositories:** `tear-score` and `Tear`  
**Plan owner:** Tear soundtrack program  
**Target outcome:** A composed, performed, mixed, mastered, adaptive original soundtrack that sounds like complete songs rather than real-time oscillator patterns  
**Supersedes:** The sampled-instrument, prerecorded-music, and sound-bank non-goals in `TEAR_SCORE_ENGINE_MASTER_BUILD_PLAN.md` for production music  
**Preserves:** TearScore's director, determinism, replay metadata, shared AudioContext, mixer hierarchy, lifecycle, semantic game context, and legacy fallback

---

## 1. Executive Directive

Transform TearScore from a primarily synthesized procedural music engine into a hybrid adaptive soundtrack system:

1. Compose complete original pieces with memorable themes, harmonic development, arrangement, intros, transitions, climaxes, and endings.
2. Render those pieces offline through realistic sampled instruments and high-quality synthesis.
3. Export synchronized musical submixes that TearScore can combine at runtime.
4. Retain deterministic selection and game-state adaptation.
5. Preserve Tear's single host-owned AudioContext, music mixer bus, user settings, temporary mute reasons, replay metadata, PWA behavior, and CrazyGames lifecycle.
6. Keep the current procedural score as a compact fallback until the new soundtrack is proven on every target.
7. Treat listening quality as a blocking product gate. Automated correctness alone cannot approve a soundtrack.

The target is not merely "less 8-bit." The target is a coherent, emotionally directed game score whose cues can also stand alone as songs.

No implementation phase may claim "professional," "pristine," or "finished" solely because it uses sampled instruments. Composition, performance, orchestration, mix, master, transition behavior, translation, and listener approval must all pass.

---

## 2. Product Quality Contract

### 2.1 Required listener outcome

The production soundtrack must:

- Sound like authored songs, not repeating note grids.
- Contain identifiable melodies and motifs.
- Develop over time instead of looping one bar indefinitely.
- Use convincing acoustic, orchestral, electronic, percussive, and textural performances.
- Avoid the exposed square-wave, saw-wave, General MIDI, and chiptune character of the current implementation unless deliberately used as a minor color.
- Give every biome a distinct musical world.
- Retain a shared Tear motif or harmonic DNA across the whole game.
- Escalate naturally from exploration through combat, pressure, bosses, and apex play.
- Leave frequency and transient space for combat SFX.
- Remain enjoyable after long sessions.
- Work on headphones, desktop speakers, inexpensive earbuds, laptop speakers, and phone speakers.
- Survive mono playback and lossy runtime encoding.
- Start, loop, transition, pause, resume, mute, and dispose without clicks, drift, gaps, doubled music, or stale layers.

### 2.2 Meaning of "as close to better than professional OST as possible"

This is a direction and review standard, not a mathematically guaranteed percentage.

The program will maximize the result through:

- Reference-quality composition and production briefs.
- Multiple creative drafts rather than accepting first output.
- Realistic instrument sources.
- Humanized performance data.
- Articulation-aware orchestration.
- Professional mix and mastering practices.
- Blind A/B listening against agreed reference soundtracks.
- Structured owner approval at multiple checkpoints.
- Replacement or live recording of exposed weak instruments when free libraries cannot meet the bar.

### 2.3 Objective technical targets

Initial targets, to be calibrated during the vertical slice:

| Property | Production target |
|---|---|
| Master source | 48 kHz, 24-bit WAV |
| Runtime source | Transparent browser-compatible lossy encode selected by codec spike |
| Full-mix true peak | At or below -1 dBTP |
| Full-mix integrated loudness | Initial target around -16 to -14 LUFS-I, finalized against Tear SFX |
| Loop timing | Sample-aligned and click-free |
| Stem alignment | Identical start, duration, sample rate, tempo grid, and downbeat |
| Runtime drift | No audible or measurable drift over a 30-minute session |
| Transition timing | Musical boundary chosen by authored metadata |
| Duplicate contexts | Zero |
| Missing/failed stem behavior | Explicit fallback with no unhandled rejection or silent game |
| Replay behavior | Same seed and semantic event journal select the same musical sections |
| CrazyGames package | Remains below the canonical 20 MiB archive limit |
| Browser errors | Zero product errors during audio matrix |

These values are not a substitute for listening approval.

---

## 3. Scope

### 3.1 Included

- Music direction and reference briefs.
- A reusable offline music-rendering toolchain.
- Sample-library acquisition, verification, provenance, and license manifests.
- MIDI and performance authoring.
- Realistic SFZ/sample-based rendering.
- High-quality synthesis for modern, industrial, ambient, and supernatural layers.
- Mixing, mastering, loudness analysis, and codec preparation.
- Adaptive-stem or adaptive-submix playback.
- Authored musical transitions and stingers.
- Main-menu, biome, boss, terminal, and ending music.
- TearScore format/runtime additions.
- Tear main-game integration.
- Standalone, PWA, CrazyGames, replay, lifecycle, performance, and package validation.
- Listening checkpoints and revision workflow.
- Documentation for future soundtrack additions.

### 3.2 Excluded unless separately approved

- Copying or imitating a copyrighted song closely enough to create infringement risk.
- Using music without commercial game rights.
- Shipping raw proprietary sample-library recordings.
- Assuming a free download grants redistribution rights.
- Building a general-purpose DAW.
- Replacing Tear's gameplay SFX as part of this program.
- Runtime cloud music generation.
- Requiring a network music service after the game loads.
- Removing the procedural fallback before production acceptance.
- Advertising the result as superior to named composers or OSTs without listener evidence.

---

## 4. Architecture Decision

### 4.1 Selected architecture: offline-rendered adaptive musical submixes

```text
MUSICAL IDENTITY + SCORE DEFINITIONS
                 |
                 v
        MIDI / PERFORMANCE EVENTS
                 |
                 v
   SFZ SAMPLES + SYNTHS + ARTICULATIONS
                 |
                 v
      OFFLINE RENDER / DAW MIX SESSION
                 |
                 v
  48 kHz MASTERS + SYNCHRONIZED SUBMIXES
                 |
                 v
       CODEC + MANIFEST COMPILATION
                 |
                 v
     TEARSCORE STEM/SUBMIX RUNTIME
                 |
                 v
  TEAR HOST MUSIC BUS -> MASTER -> OUTPUT
```

TearScore remains the conductor. It does not attempt to synthesize the entire finished orchestra in the browser.

### 4.2 Why musical submixes instead of thousands of runtime samples

The browser release must not download the multi-gigabyte source library. Runtime sample performance would increase:

- Download size.
- Decode latency.
- Memory.
- Voice count.
- Scheduling risk.
- Mobile CPU use.
- Browser inconsistency.
- License exposure.

The preferred runtime unit is a dense musical submix such as:

- `foundation`: ambience, pads, harmonic bed.
- `pulse`: bass and low rhythmic motion.
- `rhythm`: drums and percussion.
- `melody`: lead motif and counterpoint.
- `apex`: climax reinforcement.
- `transition`: risers, impacts, releases, and authored connective phrases.

Submixes must remain synchronized and musically valid in every allowed combination.

### 4.3 Hybrid exception

A small, explicitly budgeted set of CC0 one-shots may remain live:

- Impacts.
- Reverse swells.
- Risers.
- Downbeat reinforcements.
- Boss phase stingers.
- Victory/defeat punctuation.
- Texture grains.

Live accents must be routed through the TearScore rack and Tear music bus. They may not create another AudioContext.

---

## 5. Repository Ownership and Change Isolation

### 5.1 `tear-score` owns

- Source score definitions.
- Motif and harmony data.
- Performance/MIDI generation.
- Sample-library manifests.
- Rendering tools.
- Audio analysis.
- Stem/submix manifest schema.
- Adaptive playback runtime.
- Codec fixtures.
- Determinism and scheduling tests.
- Playground and listening harness.
- Release artifact generation.

Proposed additions:

```text
packages/
  asset-manifest/
  midi-export/
  render-sfz/
  audio-analysis/
  stem-format/
  stem-runtime/
tools/
  music-foundry/
music/
  briefs/
  scores/
  sessions/
  manifests/
  renders/          # ignored source renders or external artifact store
  licenses/
  references/       # metadata only; no unlicensed reference audio
```

Names may be consolidated when a smaller package boundary is clearer. Do not create empty architecture for its own sake.

### 5.2 `Tear` owns

- Host AudioContext.
- Music mixer bus and user settings.
- Backend selection and fallback.
- Semantic game snapshots/events.
- Main-game lifecycle.
- Vendored runtime and soundtrack artifacts.
- Target-specific build inclusion.
- PWA and CrazyGames packaging.
- Built-browser evidence.

### 5.3 Concurrent main-game work rule

- Do not edit unrelated gameplay, UI, persistence, replay, or platform work.
- Record `git status --short` before every checkpoint.
- Restrict main-game changes to typed audio contracts, audio composition, vendor assets, tests, configuration, and relevant documentation.
- If another active task overlaps an audio file, stop and reconcile ownership before editing.
- Build soundtrack production in `tear-score` first; vendor only checkpoint-approved releases into Tear.

---

## 6. Source Material and Licensing Policy

### 6.1 Preferred source libraries

Initial legally flexible candidates:

- Versilian Community Sample Library (CC0).
- VSCO 2 Community Edition where the exact downloaded artifact confirms CC0.
- Karoryfer free libraries (CC0, except specifically documented exceptions).
- FreePats instruments with individually verified compatible licenses.
- Original recordings created for Tear.
- Original synth patches rendered from properly licensed synthesizers.

### 6.2 Proprietary/freeware instruments

Free commercial-production instruments such as LABS/Discover, SINEfactory, Komplete Start, and Free Orchestra may be evaluated for offline mixed masters only.

They must not be used for downloadable isolated runtime layers until the exact license has been reviewed for:

- Game distribution.
- Browser-downloadable audio.
- Stems.
- Loops.
- Sample-library or derivative-sample restrictions.

ProjectSAM's published Free Orchestra license explicitly restricts redistribution through stems. It is not an approved runtime-stem source without written permission.

### 6.3 Required asset record

Every source library and original recording must have:

```json
{
  "id": "vcsl-violin-sustain",
  "title": "VCSL Violin Sustain",
  "sourceUrl": "https://...",
  "downloadedAt": "ISO-8601",
  "sourceVersion": "exact release or checksum",
  "license": "CC0-1.0",
  "licenseFile": "music/licenses/...",
  "sha256": "...",
  "redistribution": "raw-and-rendered",
  "attribution": [],
  "notes": "..."
}
```

### 6.4 Blocking license rules

- Unknown license means rejected.
- "Free" without redistribution terms means rejected for packaged raw samples.
- Non-commercial licenses are rejected.
- No ripped game, film, television, plugin, or soundtrack samples.
- No reference track may enter a production artifact.
- Original MP3s are not mastering sources when WAV/FLAC exists.
- AI-generated source material requires a recorded provider, plan, model/version, prompt provenance, and commercial-use terms.
- License audit failure blocks the checkpoint even if the audio sounds excellent.

---

## 7. Musical Product Specification

### 7.1 Core score suites

Minimum production suites:

1. Main menu / attract.
2. The Grounds.
3. The Undercroft.
4. The Crimson Fields.
5. The Voidspire.
6. The Tear.
7. Boss arrival and phase escalation material.
8. Victory, defeat, finale, and ending material.
9. Cross-biome transition and Tear-wipe material.

Per-biome boss material is preferred if package budget and production capacity allow it. A generic pasted-on boss loop is not the desired final state.

### 7.2 Minimum musical depth per biome

Each biome suite should target:

- A recognizable primary motif.
- A secondary motif or counterline.
- A harmonic language and tonal center.
- A defined rhythmic identity.
- An instrument palette.
- An introduction.
- At least two contrasting body sections.
- A tension/pressure passage.
- An apex or boss-compatible passage.
- A release/resolution passage.
- Seamless loop regions.
- At least two transition options.
- Sufficient authored material to avoid obvious short-loop fatigue.

Target 3–6 minutes of non-identical authored material per principal suite before adaptive recombination. Exact duration is approved during creative direction and package-budget planning.

### 7.3 Tear-wide identity

Create `docs/themes/MUSICAL_IDENTITY_V2.md` defining:

- Central Tear motif.
- Allowed transformations by biome.
- Signature intervals.
- Harmonic tension vocabulary.
- Rhythmic cells.
- Recurring sound-design elements.
- Narrative evolution from menu to ending.
- Rules preventing themes from becoming unrelated stock music.

### 7.4 Adaptive states

The runtime keeps five broad arrangement tiers:

| Tier | Musical intent |
|---|---|
| 0 — Breath | Space, identity, atmosphere, anticipation |
| 1 — Prepared | Pulse, harmonic motion, restrained forward energy |
| 2 — Combat | Full groove and clear main identity |
| 3 — Pressure | Denser orchestration, counterpoint, danger, fills |
| 4 — Apex | Maximum payoff, not merely maximum loudness |

Boss phase, low health, horde, mini-boss, victory, defeat, lore, pause, draft, and finale remain authored sections or overlays rather than arbitrary volume changes.

### 7.5 Anti-fatigue rules

- No one-bar production loop may repeat indefinitely.
- Avoid identical melodic lead on every cycle.
- Maintain phrase memory.
- Use alternate endings and fills.
- Provide rests and contrast.
- Do not keep all stems active merely because tier 4 is selected.
- Do not solve escalation only by increasing loudness or BPM.
- Preserve downbeats and recognizable form through adaptive changes.

---

## 8. Music Foundry Toolchain

### 8.1 Required tools

The implementation must pin and document:

- SFZ player/renderer, initially `sfizz`/`sfizz-render`.
- FFmpeg build for conversion and analysis.
- MIDI writer/parser.
- WAV reader and deterministic metadata tooling.
- Loudness/true-peak analysis.
- Optional DAW project format for manual mixing.
- Optional MuseScore/MusicXML interchange.
- Exact tool versions and checksums.

### 8.2 Required commands

Proposed command surface:

```text
pnpm music:doctor
pnpm music:licenses
pnpm music:compile
pnpm music:render --suite grounds
pnpm music:analyze --suite grounds
pnpm music:encode --target standalone
pnpm music:encode --target crazygames
pnpm music:validate
pnpm music:package
pnpm music:listen
```

`music:doctor` must report missing tools, versions, sample libraries, models, disk space, and optional GPU capability without mutating the machine.

### 8.3 Deterministic rendering

The foundry must record:

- Score version.
- Render seed.
- MIDI/event manifest hash.
- Instrument manifest hash.
- Renderer version.
- Sample-library hashes.
- Mix session version.
- Analysis results.
- Output hashes.

Manual DAW exports are allowed, but they must be imported through a manifest and validated like automated renders.

### 8.4 Performance realism

Rendering must support:

- Velocity layers.
- Round robins.
- Articulation changes.
- Note-length-aware releases.
- Legato where available.
- Humanized timing within authored bounds.
- Expression and dynamics curves.
- Pitch bends and vibrato where musical.
- Drum variation and fills.
- Register rules.
- Voice-leading.
- Instrument ranges.
- Breath and bow phrasing.

Randomness must be seeded when it changes a released render.

---

## 9. Mix and Master Pipeline

### 9.1 Per-instrument processing

Use only when musically justified:

- Corrective EQ.
- Resonance control.
- Compression.
- Saturation.
- Transient shaping.
- Stereo positioning.
- Early reflections.
- Shared room or convolution reverb.
- Delay and modulation.
- Automation.

Do not use heavy processing to disguise poor composition or poor source recordings.

### 9.2 Bus structure

Recommended production session:

```text
INSTRUMENTS
  orchestra
  percussion
  rhythm
  synth
  texture
  lead

ADAPTIVE SUBMIXES
  foundation
  pulse
  rhythm
  melody
  apex
  transitions

MUSIC MASTER
  corrective EQ
  glue
  optional color
  limiter / true-peak control
  metering
```

### 9.3 SFX compatibility

Mix review must occur inside gameplay, not only in a DAW.

Validate:

- Blade transients remain readable.
- Enemy tells remain readable.
- Parry and impact cues cut through.
- Low-frequency music does not swallow explosions.
- Menu/interface cues remain clear.
- Boss music does not mask boss tells.
- Music survives Tear's default 0.5 music level and user settings.

### 9.4 Master deliverables

For every approved cue:

- Full mix WAV.
- Synchronized submix WAVs.
- Instrumental/session archive as appropriate.
- Runtime codec variants.
- Loop metadata.
- Loudness report.
- Spectral/phase report.
- License/provenance manifest.
- Mix notes and revision history.

---

## 10. Stem Format and Runtime Contract

### 10.1 Versioned manifest

Add a versioned stem-score format rather than overloading score format v1 implicitly.

Illustrative shape:

```json
{
  "version": "2.0.0",
  "id": "grounds",
  "tempo": 112,
  "timeSignature": [4, 4],
  "sampleRate": 48000,
  "bars": 64,
  "loop": {
    "startBar": 8,
    "endBar": 64
  },
  "layers": {
    "foundation": {
      "role": "foundation",
      "assets": {
        "opus": "grounds/foundation.webm",
        "aac": "grounds/foundation.m4a"
      },
      "tiers": [0, 1, 2, 3, 4],
      "gainDb": -3
    }
  },
  "sections": {},
  "transitions": {},
  "licenseManifest": "grounds/licenses.json",
  "contentHash": "..."
}
```

The exact codec set is chosen by checkpoint testing, not assumed here.

### 10.2 Runtime responsibilities

The stem runtime must:

- Use the supplied host AudioContext.
- Connect only to TearScore's supplied output/master bus.
- Decode and schedule sample-accurately.
- Start synchronized layers from one musical origin.
- Quantize changes.
- Crossfade without comb filtering or clicks.
- Preserve phase across pause/resume.
- Support authored section transitions.
- Prevent duplicate buffers and duplicate transports.
- Cancel scheduled sources on dispose.
- Report loading, decode, underrun, and transition telemetry.
- Fall back explicitly when assets or codecs fail.

### 10.3 Loading strategy

Required behavior:

- Menu assets load first.
- Current-run biome assets preload before gameplay when feasible.
- Next biome may preload in the background.
- Boss/terminal stingers preload before their earliest legal trigger.
- Memory has a measured cap.
- Unused decoded buffers are released safely.
- Slow network never blocks the game from becoming playable.
- Offline PWA behavior is explicit and tested.
- Failed extended music chooses the compact procedural score rather than silence.

### 10.4 Codec decision spike

Test at least:

- Opus in browser-supported containers.
- AAC/M4A fallback.
- Decode latency.
- Loop accuracy.
- Browser support.
- File size.
- Audible artifacts on cymbals, reverb, bass, and stereo ambience.

Do not ship duplicate codec sets blindly if they violate package budgets.

---

## 11. Distribution and Budget Strategy

### 11.1 Master assets versus shipped assets

- Multi-gigabyte sample libraries are development-only.
- 24-bit masters are archival/build inputs.
- Runtime assets are encoded derivatives.
- No DAW cache, sample library, reference audio, or raw multitrack enters game builds.

### 11.2 CrazyGames

The canonical CrazyGames ZIP limit is 20 MiB. The soundtrack plan must reserve room for the game and future growth.

Checkpoint C2 must choose one of:

1. A self-contained compact soundtrack using dense submixes and efficient encoding.
2. Target-specific soundtrack encodes with equivalent musical content.
3. A separately approved remote-asset strategy proven against CrazyGames policy and lifecycle.

Default assumption: self-contained package. Do not depend on an external CDN without explicit approval and browser evidence.

Initial soundtrack allocation target:

- Warning above 12 MiB compressed soundtrack content.
- Blocking review above 15 MiB.
- Absolute artifact remains below the repository's 20 MiB gate.

These are planning allocations, not permission to weaken the canonical gate.

### 11.3 Standalone/PWA

Decide during the vertical slice:

- Which cues are initial precache.
- Which cues are runtime cached.
- Offline behavior before optional packs are downloaded.
- Update invalidation by content hash.
- Storage-pressure behavior.
- Whether an extended high-quality pack is optional.

Never hand-maintain service-worker asset lists or cache versions.

---

## 12. Testing and Evidence

### 12.1 Unit and schema evidence

- Stem manifest validation.
- Unknown-version rejection.
- Missing-layer rejection.
- Invalid duration/tempo/loop rejection.
- License-manifest completeness.
- Deterministic section selection.
- Transition-boundary calculations.
- Gain automation.
- Buffer lifecycle.
- Codec capability selection.
- Missing-asset fallback.

### 12.2 Audio-file analysis

For every production render:

- Decode succeeds.
- Sample rate/channel count match policy.
- Stem lengths align.
- Downbeats align.
- No unexpected silence.
- No NaN/invalid samples.
- True peak remains in bounds.
- Integrated loudness remains in approved range.
- DC offset remains in bounds.
- Loop-edge discontinuity remains inaudible and below calibrated threshold.
- No clipped samples.
- Phase/mono compatibility report exists.
- Runtime encode duration matches master.

### 12.3 Runtime evidence

- One AudioContext.
- One active music backend.
- No oscillator fallback playing simultaneously.
- Synchronized layer start.
- Tier transitions on allowed boundaries.
- Pause/resume phase preservation.
- Visibility/ad/portal mute behavior.
- Repeated-run cleanup.
- Biome replacement.
- Boss transition.
- Victory/defeat.
- Replay metadata.
- Low/balanced/high policy.
- Memory and decode telemetry.

### 12.4 Browser matrix

At minimum:

- Chrome/Edge desktop.
- Firefox desktop.
- Safari macOS when available.
- iOS Safari hardware when available.
- Android Chrome hardware when available.
- CrazyGames iframe.
- Standalone production build.
- Installed/offline PWA.
- Background/foreground.
- Slow network.
- Cached/offline reload.
- AudioContext suspend/resume.

### 12.5 Manual listening rubric

Score 1–10:

- Song quality.
- Emotional impact.
- Motif memorability.
- Instrument realism.
- Performance realism.
- Arrangement development.
- Mix depth.
- Tonal balance.
- Punch.
- SFX compatibility.
- Loop invisibility.
- Transition quality.
- Adaptive musicality.
- Biome identity.
- Boss payoff.
- Repetition fatigue.
- Headphone translation.
- Speaker translation.
- Mono translation.
- Codec transparency.

No cue advances with a critical category below the threshold agreed at Checkpoint C0. Initial proposal: average at least 8/10, no critical category below 7/10, and explicit owner approval.

---

## 13. Checkpoint Plan

Checkpoint gates are blocking. A failed checkpoint prevents dependent work from being called complete.

### C0 — Quality Charter and Reference Lock

**Goal:** Convert "pristine, professional OST" into an agreed creative target.

Deliver:

- Soundtrack vision statement.
- Three to six legal listening references per major musical direction.
- Written notes about what to emulate abstractly: energy, depth, instrumentation, structure, mix, and emotion.
- Written notes about what not to copy: melody, harmony sequence, recordings, signature sound design.
- Listening rubric and approval threshold.
- Initial soundtrack scope and duration.
- Initial download/package allocation.

Gate:

- Owner approves the direction and rubric.
- No reference audio is placed in production assets.
- Scope fits schedule and package constraints.

### C1 — Asset and License Foundation

**Goal:** Establish a legally shippable instrument palette.

Deliver:

- Asset manifest schema.
- License audit command.
- Pinned VCSL/Karoryfer/FreePats candidates.
- Checksums and license copies.
- A small approved palette covering strings, brass/winds, percussion, bass, keys, and textures.
- Proprietary-library exclusion/approval register.

Gate:

- `music:licenses` passes.
- Every sample has provenance.
- No rejected license enters the render.

### C2 — Foundry and Distribution Spike

**Goal:** Prove the complete build path and settle runtime budgets before composing the whole OST.

Deliver:

- MIDI-to-SFZ rendering.
- 48 kHz WAV output.
- Mix/master import path.
- Audio analysis.
- Codec comparison.
- Stem manifest.
- Standalone and CrazyGames size projections.
- PWA cache strategy proposal.

Gate:

- One 60–90 second technical cue builds reproducibly.
- Analysis passes.
- Chosen codec loops correctly on target browsers.
- Projected soundtrack can fit an approved distribution strategy.

### C3 — Grounds Musical Vertical Slice

**Goal:** Prove the requested quality with one complete, representative song.

Deliver:

- Grounds creative brief.
- Primary and secondary motifs.
- 3–6 minutes of authored material or an approved reduced slice with full structural evidence.
- Breath, prepared, combat, pressure, and apex submix behavior.
- At least two transitions.
- Full mix and runtime encodes.
- Revision history.

Gate:

- Blind A/B listening occurs against the C0 references.
- The result clearly does not sound 8-bit or like exposed General MIDI.
- Owner approves the composition and sonic direction.
- Listening rubric passes.
- Failure sends the work back to composition/orchestration; runtime engineering may not disguise it.

### C4 — TearScore Stem Runtime

**Goal:** Play the approved vertical slice adaptively and deterministically in the TearScore playground.

Deliver:

- Stem format v2.
- Loader/cache.
- Synchronized player.
- Quantized mixer.
- Transition planner.
- Telemetry.
- Fallback.
- Unit, browser, and leak evidence.

Gate:

- 30-minute drift test passes.
- Tier and section transitions are musical and click-free.
- Repeated start/dispose passes.
- Same seed/events select the same sections.
- Missing/failed assets fall back cleanly.

### C5 — Main-Game Grounds Integration

**Goal:** Prove the new OST inside real Tear gameplay before scaling production.

Deliver:

- Vendored checkpoint release.
- Main-game backend integration.
- Menu/setup/gameplay activation.
- Grounds wave, horde, boss, pause, victory, defeat, ad, and visibility behavior.
- In-game mix revision.
- Standalone and CrazyGames builds.

Gate:

- Owner listens in live gameplay and approves.
- Combat cues remain readable.
- Audio lifecycle and provenance gates pass.
- Package, memory, and performance projections remain acceptable.
- The procedural fallback remains exclusive and functional.

### C6 — Musical Identity Bible

**Goal:** Lock the whole-score narrative before mass production.

Deliver:

- Tear motif and transformations.
- Palette per biome.
- Harmony/rhythm/form rules.
- Narrative arc.
- Boss vocabulary.
- Finale resolution.
- Anti-fatigue and contrast plan.

Gate:

- Every suite is distinct yet related.
- The plan avoids generic stock-music sameness.
- Owner approves biome identities.

### C7 — Menu and Grounds Production Lock

**Goal:** Finish the opening/player-first experience.

Gate:

- Final composition, mix, master, transitions, codecs, manifests, licenses, and in-game approval.
- Menu remains stable across attract visuals.
- Grounds survives a 30-minute fatigue test.

### C8 — Undercroft and Crimson Fields Production Lock

**Goal:** Complete the middle-game contrast pair.

Gate:

- Both suites pass the full listening rubric.
- Neither reuses Grounds arrangement with different instruments.
- Biome transitions work from both directions where legal.

### C9 — Voidspire and Tear Production Lock

**Goal:** Complete late-game escalation and thematic culmination.

Gate:

- Voidspire is alien/unstable without becoming noise.
- The Tear resolves and transforms established motifs.
- Late-game density preserves gameplay clarity.

### C10 — Boss and Terminal Music Lock

**Goal:** Complete boss arrival, phases, final phase, defeat, victory, game-over, finale, and ending.

Gate:

- Actual boss state, not wave labels, drives boss music.
- Boss phase changes are authored and quantized.
- Final phase provides musical payoff without simple loudness inflation.
- Boss defeat releases correctly.
- Ending provides thematic resolution.

### C11 — Full Mix and Master Lock

**Goal:** Make the soundtrack consistent as one album and one game system.

Deliver:

- Album-order listening render.
- In-game master set.
- Cue-to-cue loudness matching.
- Translation matrix.
- SFX masking review.
- Codec audition.

Gate:

- No jarring loudness or tonal jumps.
- Every cue passes headphone, speaker, phone, and mono checks.
- Owner approves the complete score.

### C12 — Target Optimization Lock

**Goal:** Fit the approved soundtrack into real distribution constraints without destroying quality.

Gate:

- Standalone/PWA strategy passes.
- CrazyGames ZIP passes.
- Bundle/file-count/reproducibility gates pass.
- Codec A/B remains approved.
- Low-memory behavior is graceful.

### C13 — Full Main-Game Integration Lock

**Goal:** Make every semantic music state use the new score.

Gate:

- Menu, setup, all biomes, every published mode, bosses, pause, draft, tier-up, lore, victory, defeat, finale, ending, replay metadata, ads, visibility, and repeated runs pass.
- One context and one music backend remain invariant.
- Legacy fallback can recover from blocked/corrupt soundtrack assets.

### C14 — Release Candidate Listening and QA

**Goal:** Evaluate the experience as players will receive it.

Deliver:

- Full uninterrupted playthrough recordings.
- Long-session fatigue session.
- Fresh-listener feedback.
- Issue ledger ranked by severity.
- Final revision pass.

Gate:

- No open critical musical, lifecycle, licensing, performance, or packaging issue.
- Owner gives explicit release-candidate approval.

### C15 — Release-Candidate Correction Lock

**Goal:** Resolve every issue discovered during release-candidate listening without
allowing late fixes to create unreviewed regressions.

Deliver:

- Closed issue ledger with before/after evidence.
- Re-rendered and re-mastered affected cues.
- Revalidated layer combinations and transition boundaries.
- Regression listening report for every corrected suite.

Gate:

- No open critical or high-severity musical, mix, transition, runtime, licensing,
  performance, or packaging issue.
- Every correction has automated evidence where measurable and listening evidence
  where judgment is required.
- Owner approves the corrected soundtrack experience.

### C16 — Determinism and Lifecycle Certification

**Goal:** Prove the soundtrack remains correct across real game lifecycle and
deterministic replay conditions.

Gate:

- Identical seed and semantic event streams produce identical musical decisions
  and replay metadata.
- Repeated runs, pause/resume, visibility changes, focus loss, ads, portal mute,
  suspension, fallback, recovery, and disposal pass.
- One host-owned `AudioContext` and one active music backend remain invariant.
- Buffer, node, listener, timer, and decoded-asset accounting return to their
  documented steady state.

### C17 — Distribution and Offline Certification

**Goal:** Prove the approved soundtrack survives every supported delivery target.

Gate:

- Standalone and installable PWA load, cache, update, recover, and play offline as
  designed.
- CrazyGames packaging, iframe lifecycle, archive size, asset paths, codecs, and
  temporary mute behavior pass.
- Cold-load, warm-cache, throttled-network, missing-asset, corrupt-asset, and
  unsupported-codec paths retain a playable audible result.
- Reproducible build and bundle/file-count budgets pass.

### C18 — Golden Master and Preservation Archive

**Goal:** Freeze the exact creative and technical source of the shipped soundtrack.

Deliver:

- Album-order lossless masters and approved runtime encodes.
- Rendered submixes, transitions, alternates, and loop metadata.
- Source sessions, MIDI, tempo maps, articulation maps, presets, and render logs.
- Complete license texts, source URLs, acquisition dates, checksums, and
  attribution requirements.
- Runtime manifests, artifact hashes, analysis reports, and listening approvals.

Gate:

- A clean-room archive verification can recreate or verify every shipped asset.
- Runtime hashes match the approved golden master manifest.
- No unlicensed, unidentified, placeholder, or superseded asset remains in a
  production package.

### C19 — Final Clean-State Release Gate

**Goal:** Establish release evidence from the exact intended repository state.

Gate:

- Full `tear-score` `pnpm check` passes.
- Final Tear `pnpm check` passes from the intended worktree/commit.
- Provenance, soundtrack validation, audio analysis, package, browser, PWA,
  CrazyGames, performance, and reproducibility gates pass.
- The shipped build is auditioned after the final build rather than only from
  source masters.
- Release notes identify score, runtime, asset-manifest, and game versions.
- Rollback and procedural-fallback procedures are documented and tested.

### C20 — Finished Build and Production Signoff

**Goal:** Declare the program complete only after the exact final build is
technically certified and heard in the game.

Deliver:

- Final standalone and CrazyGames artifacts.
- Final soundtrack archive and evidence index.
- Checkpoint ledger proving C0 through C20.
- Known-limitations statement, which must say `none` for any unresolved critical
  quality, rights, lifecycle, or release issue.
- Owner-facing listening instructions and representative save/debug states for
  menu, each biome, each boss phase, apex play, victory, defeat, finale, and ending.

Gate:

- The exact final artifacts pass the C19 clean-state evidence without subsequent
  mutation.
- The owner can hear every principal score state in the production game.
- The owner gives explicit finished-build approval.
- Source masters and sessions are archived.
- License archive is complete.
- No required work remains.

---

## 14. Review and Revision Workflow

Each creative checkpoint follows:

1. Brief.
2. Sketch.
3. Composition review.
4. Orchestration/render review.
5. Mix review.
6. Runtime adaptation review.
7. In-game review.
8. Master/codec review.
9. Approval or revision.

Do not wait until final mastering to discover that the melody, structure, or instrumentation is wrong.

Required review report:

```text
CHECKPOINT
VERSION
CREATIVE GOAL
FILES/ARTIFACTS
LISTENING ENVIRONMENTS
REFERENCE COMPARISON
RUBRIC SCORES
TECHNICAL ANALYSIS
IN-GAME OBSERVATIONS
LICENSE STATUS
PACKAGE IMPACT
APPROVED / REVISE / REJECTED
OWNER NOTES
NEXT REVISION
```

---

## 15. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Free samples still sound cheap | Layer selectively, improve performance/orchestration, replace exposed instruments, or commission/live-record priority solos |
| Composition sounds like loops rather than songs | Require full form, contrasting sections, alternate endings, and fatigue review |
| Adaptive layers sound hollow alone | Use dense musical submixes designed for legal combinations |
| Stems phase or drift | Render from one session origin; validate samples and schedule from one transport origin |
| Music masks combat | Mix in-game early; maintain SFX-focused spectral/transient space |
| CrazyGames size overflow | Prove codec/submix budget at C2; use target encodes; preserve canonical 20 MiB gate |
| PWA precache becomes excessive | Separate critical initial cues from runtime-cached packs through generated build policy |
| Proprietary library licensing blocks stems | Prefer CC0; obtain written permission; never assume commercial-recording rights permit stem redistribution |
| Browser codec differences | Capability matrix and explicit fallback |
| Slow decode causes silence | Preload, telemetry, timeouts, and procedural fallback |
| Mobile memory pressure | Buffer cap, release policy, compact layers, low-quality policy |
| First draft is accepted due sunk cost | Blocking owner listening gates and explicit revision budget |
| AI or automation produces generic music | Human creative briefs, motif bible, authored form, and owner review |
| Reference influence becomes copying | Describe abstract qualities only; prohibit reference audio and melodic imitation in production |
| Concurrent Tear work is overwritten | Status audit, scoped files, vendor only approved releases |

---

## 16. Required Documentation

Create or update:

```text
tear-score/
  docs/architecture/STEM_RUNTIME.md
  docs/architecture/MUSIC_FOUNDRY.md
  docs/architecture/ASSET_LOADING.md
  docs/audio/RENDER_SPEC.md
  docs/audio/MIX_MASTER_SPEC.md
  docs/audio/CODEC_MATRIX.md
  docs/audio/LISTENING_RUBRIC.md
  docs/audio/LICENSE_POLICY.md
  docs/themes/MUSICAL_IDENTITY_V2.md
  docs/themes/<SUITE>_V2.md
  music/manifests/
  music/licenses/

Tear/
  docs/TEAR_SCORE_INTEGRATION.md
  docs/FEATURE_INVENTORY.md
  docs/PERFORMANCE_BUDGETS.md
  docs/BROWSER_JOURNEY_COVERAGE.md
```

Documentation and evidence change with the implementation; they are not deferred cleanup.

---

## 17. Canonical Validation Strategy

During development, use the smallest relevant gates:

### TearScore

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm music:licenses
pnpm music:validate
pnpm music:analyze
```

### Tear targeted integration

```text
pnpm exec vitest run <audio contract/unit files>
pnpm check:tear-score
pnpm build:standalone
pnpm check:bundles
pnpm test:browser:audio
```

Add when affected:

```text
pnpm build:crazygames
pnpm check:crazygames-package
pnpm check:reproducible
pnpm test:browser:performance
pnpm test:browser:platform
pnpm test:browser:crazygames-iframe
pnpm test:pwa
```

Release claim requires final `pnpm check`. Never deploy as part of a validation gate.

---

## 18. Definition of Done

This soundtrack program is complete only when:

- Tear's production music sounds like authored songs rather than exposed oscillator patterns.
- The owner explicitly approves the complete soundtrack after live-game listening.
- Every core suite has memorable identity, development, contrast, transitions, and resolution.
- Realistic sampled instruments and high-quality synthesis are used intentionally.
- Weak exposed instruments have been replaced, layered, or recorded.
- The adaptive system changes musical arrangement without breaking song form.
- Every legal layer combination sounds intentional.
- All stems/submixes are synchronized and loop cleanly.
- Boss phases, apex play, victory, defeat, finale, and ending receive authored treatment.
- Music remains clear beneath combat and interface SFX.
- Long-session repetition fatigue is acceptable.
- Headphone, speaker, phone, mono, and codec checks pass.
- All source assets have proven commercial and redistribution rights.
- Runtime assets meet standalone, PWA, and CrazyGames constraints.
- One host-owned AudioContext remains invariant.
- TearScore and procedural fallback remain mutually exclusive.
- Missing soundtrack assets retain a playable, audible fallback.
- Deterministic decisions and replay metadata remain valid.
- Repeated runs, pause/resume, ads, visibility, and disposal do not leak or drift.
- Source masters, sessions, manifests, hashes, and licenses are archived.
- Full TearScore checks pass.
- Final Tear `pnpm check` passes.

Anything less is an intermediate plateau, not completion.

---

## 19. Immediate Work Order

Execute in this order:

1. Approve this plan.
2. Complete C0 quality charter and reference lock.
3. Complete C1 asset/license foundation.
4. Build only enough foundry/runtime tooling for C2.
5. Produce the C3 Grounds musical vertical slice.
6. Stop for owner listening approval.
7. Build C4/C5 runtime and main-game vertical slice.
8. Stop for owner in-game approval.
9. Lock the musical identity bible.
10. Produce remaining suites in checkpoint order.
11. Complete global mix/master and target optimization.
12. Complete full main-game integration and release candidate QA.
13. Close the release-candidate correction ledger.
14. Certify determinism, lifecycle, distribution, PWA, and CrazyGames behavior.
15. Freeze and verify the golden-master archive.
16. Run the final clean-state release gates.
17. Audition the exact production artifacts and complete C20 signoff.

Do not mass-produce six biomes before the Grounds vertical slice proves the requested quality.
