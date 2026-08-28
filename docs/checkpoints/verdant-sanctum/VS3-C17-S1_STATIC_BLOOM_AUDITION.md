# VS3-C17-S1 — Static Bloom technical audition

## Claim

Static Bloom is technically ready for the music owner's listening decision. This
record does not approve the work for Verdant, authorize a tear-music release, or
authorize game re-vendoring.

## Source and audition set

- tear-music source: `a03c9b9310b3d98d6a46999064dda6d97ee7c831`
- composition: `music/compositions/static-bloom.json`
- composition SHA-256: `85cef3ccef39eadbddbed79a00b22dc45d37b3cdb693319cca2e7b474e49301c`
- render: 180 seconds, 156 BPM, 468 beats, 48 kHz stereo
- lossless full mix SHA-256: `b64791017060499d90ac2f9b7e1ec10417010dc87701b44c6623b5c7082d1ec7`
- browser full mix SHA-256: `56f55286bdfa3123949fcd214f78dc6c873d3b95489c5792fe8d0f59b589b3ad`

The generated audition bundle contains these five legal high-fidelity tiers:

| Tier | Intent | Layers | Ogg/Opus SHA-256 |
| --- | --- | --- | --- |
| 0 | breath | foundation, pulse | `c027d1c0c3c53110ace924db9bc62af06085db660df3b6bd42f50d3060ea464b` |
| 1 | prepared | foundation, pulse, rhythm | `28b36ceaf6ab8566effeba6f08f1fc6818e6b70e0a0204eb04e996189c8a5d42` |
| 2 | combat | foundation, pulse, rhythm, melody | `bac27a3a808987a990ba636eac37e54f372ddb4347701b330ba82259d2ed2bec` |
| 3 | pressure | foundation, pulse, rhythm, melody, apex | `3a84358dc248cf612d6143ab05ac234c96df57512a45e6b6918f1524d5def1f7` |
| 4 | apex | foundation, pulse, rhythm, melody, apex, transitions | `ff112cf83bc5c535b04cfd243b4c38553073b1c59fc067b3856c60478d8517ff` |

Three portal compatibility composites—calm, action, and apex—were also
rendered and validated. Raw WAV/Ogg files remain ignored in tear-music and are
not promoted into the Tear repository.

## Technical result

- Six independent high-fidelity stems and three portal composites rendered.
- No adaptive tier clipped.
- Tier 4 reconstructs the full mix with maximum absolute delta
  `2.384185791015625e-7`; the portal tier has the same maximum delta.
- Full mix measured `-14.15 LUFS`, `-2.93 dBFS` sample peak in WAV, and
  `-2.84 dBTP` in Ogg. It remains inside the soundtrack's `-16..-14 LUFS`
  window and below its `-1 dBTP` ceiling.
- Ten synchronized Ogg/Opus files decoded in the browser codec probe with
  zero duration spread.
- The projected six-stem high-fidelity suite is 8,143,799 bytes and the
  three-composite portal suite is 4,536,693 bytes for 180 seconds.

## Fit evidence and limits

The authored structure directly exposes quiet sanctuary, prepared, normal
combat, pressure, and apex states, so it can express Verdant's false relief and
escalate into Rootbound without adding a parallel music system. The composition
also provides explicit transition material and the compatibility composites
required by the currently released package shape.

That structural fit is not a subjective approval. The repository listening
rubric requires a human music owner to evaluate emotional identity, performance
realism, mix translation, adaptive continuity, game readability, fatigue, and
the specific theme of healing turned into captivity. Those judgments cannot be
inferred from meters or source code.

## Commands

Run from the isolated tear-music worktree with source at the identity above:

```text
pnpm install --frozen-lockfile
pnpm music:render:static-bloom
pnpm music:encode:static-bloom
pnpm music:manifest:static-bloom
pnpm music:analyze:static-bloom
pnpm music:audition:static-bloom
pnpm music:analyze
pnpm music:test:static-bloom-codec
```

pnpm 10 suppressed the pinned `ffmpeg-static` install script on this machine.
The encode and analysis commands therefore used the already-installed system
FFmpeg 9 executable through the dependency's documented `FFMPEG_BIN` override.
This changed no repository source. Codec results are evidence for this local
audition, not a reviewed release identity.

## Decision boundary

VS3-C17-S1 is prepared through its complete technical audition set. Its
remaining acceptance action is the owner's listening pass. VS3-C17-S2 must then
record exactly one decision: select Static Bloom, select another existing work,
or commission a new work. Until that happens, rights confirmation, release,
re-vendoring, routing, and publication remain blocked and unclaimed.
