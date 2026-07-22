# Adapter matrix

## Standalone/browser

Local storage must fail safely and remain playable, including unavailable or throwing browser storage. Keep optional online capabilities explicitly unavailable unless composed. Preserve the established local keys at compatibility boundaries.

## Firebase

Validate cloud-save and replay shapes before merge/use. Memoize initialization/load failures when required by the live contract, bound corrupt replay reads, preserve identity transitions, and degrade shared operations without breaking local play. Use fake SDK contracts; do not require credentials.

## Shared cloud

Preserve leaderboard/replay linkage, replay IDs, score resubmission rules, logging isolation, and null/error fallbacks. Keep shared behavior behind `PlatformServices` and compatibility ports.

## CrazyGames

Gate capabilities on successful SDK initialization and real portal availability. Preserve loading/gameplay lifecycle brackets, rewarded outcome semantics, temporary muting, injected Data/User storage, local mirroring, and iframe/package behavior. Use adapter fakes and existing browser gates.

## Identity and account changes

Cover first boot, guest/local state, sign-in, anonymous/provider linking where supported, sign-out, provider failure, repeated initialization, conflict/retry, and profile merge exactly once. Never let an unavailable provider erase valid local progress.
