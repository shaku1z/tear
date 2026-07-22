# Audio event route

Publish semantic music/effect intent from gameplay or application code. Route it through the audio contracts, category, mixer, director, and selected backend.

- Never create an `AudioContext` or connect to the destination outside the host backend.
- Keep Master/Music/SFX/Interface hierarchy and temporary mute reasons intact.
- Keep TearScore and legacy music mutually exclusive.
- Add or update semantic cue routing, mixer/director/backend tests, lifecycle cleanup, and browser audio evidence.
- If vendored TearScore or Tone inputs change, use the repository provenance gate; do not embed vendor API/hash checks in this skill.
- If an audio preference persists, also follow the persistence-field route and migrate the settings envelope.

Consult `docs/TEAR_SCORE_INTEGRATION.md` only when that backend is touched.
