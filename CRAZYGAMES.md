# CrazyGames submission

Tear integrates the CrazyGames HTML5 SDK v3 through its platform adapter. Portal capabilities activate only when the SDK reports the CrazyGames environment; the standalone Cloudflare build does not load the SDK.

## Build the submission

Generate the portal target from the same source tree as standalone:

```powershell
pnpm build:crazygames
Compress-Archive -Path dist/crazygames/* -DestinationPath tear-crazygames.zip -Force
```

Upload `tear-crazygames.zip` in the CrazyGames developer portal. Its entry point is `index.html`. The build contains no service worker or standalone PWA registration, and the CrazyGames SDK is injected only into this target.

Inspect the archive before uploading:

```powershell
tar -tf tear-crazygames.zip
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

## Submission form answers

**Does your game save progress?**

Yes, using the Data Module from the CrazyGames SDK. Meta progress, settings and high scores route through the platform storage adapter, with local storage used only outside the portal.

| Option | Select? | Why |
|---|---:|---|
| The game supports mobile devices | **Yes** | Tear includes touch controls, viewport-safe rendering and touch aiming. Validate the current portal device matrix before each submission. |
| The game is an online multiplayer game | **No** | The released game is single-player; `coop-lab.html` is not part of generated output. |
| The game supports CrazyGames muting audio through SDK | **Yes** | Portal muting is a temporary audio mute reason and does not overwrite the player's Master/Music/SFX/Interface settings. |
