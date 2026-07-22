# CrazyGames submission

Tear integrates the CrazyGames HTML5 SDK v3 through its platform adapter. Portal capabilities activate only when the SDK reports the CrazyGames environment; the standalone Cloudflare build does not load the SDK.

## Build the submission

Create the portal-ready ZIP with one command:

```powershell
pnpm package:crazygames
```

This builds only the CrazyGames target once and writes `artifacts/tear-crazygames.zip`. Upload that file in the CrazyGames developer portal. Its entry point is `index.html` at the archive root. The build contains no service worker or standalone PWA registration, and the CrazyGames SDK is injected only into this target. If `dist/crazygames` is already current, `pnpm package:crazygames:existing` packages it without rebuilding.

Do not use `git archive` for portal uploads after the Vite migration: it archives repository source at `HEAD`, not the generated CrazyGames application.

Portal game assets use relative `./assets/...` URLs because the uploaded archive is mounted below a CrazyGames-owned path. The reproducibility gate rejects root-absolute bundle assets, more than 1,500 output files, or an artifact above Tear's 20 MiB mobile-homepage budget. These are intentionally stricter than the portal's general 50 MB initial/250 MB total limits.

Inspect the archive before uploading:

```powershell
tar -tf artifacts/tear-crazygames.zip
```

The archive must contain generated game assets only. It must not contain `src`, legacy source files, tests, plans, Firebase configuration files, Wrangler configuration, `coop-lab.html`, or repository metadata.

## Release validation

Run `pnpm check` before packaging. In the CrazyGames preview environment, additionally verify:

- loading start/stop notifications
- gameplay start/stop notifications
- portal mute changes and ad mute reasons
- rewarded-continue success, decline and unavailable paths
- data-module settings/profile persistence
- touch, mouse/keyboard and controller flows
- fullscreen/focus/visibility behavior
- no service-worker registration or standalone Firebase login path

The adapter follows the current HTML5 SDK v3 contract: it awaits `SDK.init()`, uses `game.loadingStart/loadingStop`, brackets only actual gameplay and game breaks with `gameplayStart/gameplayStop`, and does not emit gameplay-stop merely for browser focus loss. Portal `game.settings.muteAudio` always takes priority over saved user audio settings. See the official [SDK introduction](https://docs.crazygames.com/sdk/intro/), [game lifecycle contract](https://docs.crazygames.com/sdk/game/), [Data Module contract](https://docs.crazygames.com/sdk/data/), and [technical requirements](https://docs.crazygames.com/requirements/technical/).

## Submission form answers

**Does your game save progress?**

Yes, using the Data Module from the CrazyGames SDK. Meta progress, settings and high scores route through the platform storage adapter, with local storage used only outside the portal.

| Option | Select? | Why |
|---|---:|---|
| The game supports mobile devices | **Yes** | Tear includes touch controls, viewport-safe rendering and touch aiming. Validate the current portal device matrix before each submission. |
| The game is an online multiplayer game | **No** | The released game is single-player; `coop-lab.html` is not part of generated output. |
| The game supports CrazyGames muting audio through SDK | **Yes** | Portal muting is a temporary audio mute reason and does not overwrite the player's Master/Music/SFX/Interface settings. |
