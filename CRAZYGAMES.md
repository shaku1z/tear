# CrazyGames submission

Tear integrates the CrazyGames HTML5 SDK v3 (`js/crazy.js`). Everything is
**env-gated**: ads and cloud save only activate when the game is actually
embedded on CrazyGames (`SDK.environment === "crazygames"`), so the standalone
Vercel/itch build behaves exactly as before.

## Building the submission package

`git archive` respects `export-ignore` in `.gitattributes`, so it bundles only
the playable game — **`coop-lab.html` and the signaling server are excluded**
(they use external WebRTC/STUN and would fail CrazyGames' "no external" checks):

```sh
git archive --format=zip -o tear-crazygames.zip HEAD
```

Upload `tear-crazygames.zip` in the CrazyGames developer portal. The entry
point is `index.html`. The package is a few hundred KB of vanilla JS — well
under the 50 MB initial-download limit. The only external request is the
CrazyGames SDK itself (required and allowed).

To verify the package excludes the right files:

```sh
unzip -l tear-crazygames.zip   # should NOT list coop-lab.html / signaling/ / serve.py
```

## Submission form answers

**Does your game save progress?**
→ **Yes, using the Data Module from the CrazyGames SDK.**
Meta progress, settings, and high scores route through `CG.store`, which uses
`SDK.data` (the Data Module) on-platform and localStorage as a fallback.

**Game options**

| Option | Select? | Why |
|---|---|---|
| The game supports mobile devices | **No** | Mouse + keyboard only; no touch controls yet. |
| The game is an online multiplayer game | **No** | Multiplayer (coop-lab) is excluded from this build; the submitted game is single-player. |
| The game supports CrazyGames muting audio through SDK | **Yes** | `crazy.js` subscribes via `addSettingsChangeListener` and applies `settings.muteAudio` with priority over the in-game volume (`SFX.mute(on, "cg")`). |
