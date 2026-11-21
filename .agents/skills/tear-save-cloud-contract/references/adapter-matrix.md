# Adapters

The capability contract is `src/platform/contracts.ts` (`PlatformServices`). Targets are defined in
`config/build-targets.json`; what each promises is in
[docs/RELEASE_MATRIX.md](../../../../docs/RELEASE_MATRIX.md).

## Standalone and itch (browser storage)

`src/platform/storage.ts`, `src/platform/standalone-cloud.ts`. Local storage that is missing or throws must
fail safely and leave the game playable. Optional online features stay explicitly unavailable unless
composed in. Keep the established local keys at compatibility boundaries.

## Firebase

`src/platform/firebase-cloud.ts`, `src/platform/firebase-config.ts`, and the rules in `firestore.rules`.

- Validate cloud saves and replays before merging or using them. Bound reads of corrupt data.
- A rules change, or an adapter change that alters what is read or written, runs `pnpm test:rules`: the
  rules tests and the game's own adapter under a local emulator (`tests/rules/`). Every collection the game
  uses has an allowed case and a refused case.
- Contract tests use fakes and need no credentials: `tests/contract/platform-firebase-cloud.test.ts`.
- Deploying rules, console settings, keys and App Check are the owner's steps
  (`plans/active/FIREBASE_REFRESH.md`).

## Shared cloud

`src/platform/platform-shared-cloud.ts`, `src/platform/cloud.ts`, `src/platform/cloud-factory.ts`. Keep
leaderboard and replay links, replay ids, score resubmission rules, and null or error fallbacks.

## CrazyGames

`src/platform/crazygames.ts`, `src/platform/crazygames-cloud.ts`. Offer a capability only after the SDK
initialized on the real portal. Keep the loading and gameplay brackets, rewarded-ad outcomes, temporary
muting, the injected data and user storage and its local mirror. Contract tests:
`tests/contract/platform-crazygames.test.ts`. See `CRAZYGAMES.md`.

## Identity and accounts

Cover first start, guest state, sign-in, linking where supported, sign-out, provider failure, repeated
initialization, conflict and retry, and a profile merge that happens exactly once. A missing provider never
erases valid local progress. What players are told about data is set in `src/platform/privacy-stance.ts`
and `src/platform/statistics-consent.ts`; change those only on the owner's word.
