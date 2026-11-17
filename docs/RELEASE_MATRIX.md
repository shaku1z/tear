# Tear Release Matrix

This matrix is the release evidence checklist. A target is not ready because it builds; every applicable row must pass from the same commit.

| Area | Standalone/PWA | CrazyGames | Future Steam shell |
|---|---|---|---|
| Shared rules/simulation | strict types, deterministic replay hashes | identical ruleset/hash | identical ruleset/hash |
| Boot artifact | hashed Vite output | relative hashed Vite output | packaged web/native shell assets |
| Offline/update | generated manifest/SW, offline boot, explicit update apply | no manifest or service worker | shell-owned updates |
| Identity/save | local + Firebase capability/fallback | SDK Data/User capability/fallback | Steam identity/cloud adapter |
| Lifecycle | visibility/focus/audio resume | SDK loading and gameplay brackets; portal mute | overlay/suspend/resume adapter |
| Ads | explicitly unavailable | midgame/rewarded outcomes including unfilled/adblock | explicitly unavailable unless added |
| Input | keyboard, pointer, touch, controller | keyboard, pointer, touch, controller in iframe | controller-first plus keyboard/mouse where supported |
| Audio | one context; all mixer buses and TearScore/fallback | same plus portal/ad mute priority | shared backend initially; native backend permitted |
| Performance | desktop and constrained profiles | Chromebook/mobile portal budgets | shell/device profiles |

## Required gameplay evidence

- Every published mode starts, pauses, resumes, exits, and creates the correct run lifecycle.
- Every screen and return route works with pointer, keyboard navigation, touch, and controller where applicable.
- Sword, hammer, greatsword, chainblade, and riftlock pass action, ability, throw/recall, and reset conformance.
- Every standard enemy, variant, affix, support, boss, boss phase, arena mutation, projectile, zone, wall, and hazard has characterization coverage.
- Draft, reroll, reserve, tier-up, rewards, economy, achievements, profile, leaderboard, replay, victory, defeat, continue, tutorial, cinematics, and finale retain their behavior.
- Settings and historical saves/replays migrate; malformed/unavailable services degrade to a playable state.
- Identical seed and semantic actions produce the same verification hash at 30, 60, and 144 Hz and after replay serialization.

## Resource and artifact evidence

- Five repeated start/play/quit cycles show bounded enemies, projectiles, effects, audio voices, nodes, listeners, timers, and caches.
- Simulation/render/frame p95 values, long tasks, startup, bundle gzip, file count, and total artifact bytes stay within checked budgets.
- CrazyGames stays within what the portal measures, each limit checked by a build or a gate and none looser than the portal's ([technical requirements](https://docs.crazygames.com/requirements/technical/), [requirements overview](https://docs.crazygames.com/requirements/intro/), read 2026-11-16):
  - Download before the first gameplay-start event: the portal allows 20 MB for its mobile homepage (50 MB elsewhere). `pnpm check:load-budgets` holds the cold download up to playing, music stems not counted, to the ceiling in `config/load-budgets.json` (730,000 bytes for CrazyGames); the same figure with music counted is not yet a gate. Painted stage backgrounds add 0 bytes to it: a stage's painting is fetched when a run nears the stage, and the coded background shows until it has decoded.
  - Whole package: at most 1,500 files (the portal's limit) and 26,500,000 bytes unpacked, Tear's own ceiling far below the portal's 250 MB (`pnpm check:reproducible`); the upload ZIP stays under Tear's 20.5 MiB (`pnpm package:crazygames`).
  - Painted backgrounds: each scene within its encoded and decoded budgets, and all scene art in one build within that build's share, 3,000,000 bytes (`config/scene-budgets.json`, checked by every build; rule in [BACKGROUND_WORKFLOW.md](BACKGROUND_WORKFLOW.md), "Size rule").
  - No root-absolute game asset paths.
  - This replaces an earlier line that called a 22.5 MiB unpacked package Tear's "mobile-homepage artifact budget". The portal has no such package limit: its 20 MB mobile-homepage figure is the download before gameplay starts. The change corrects an invented limit to the measured one; it does not loosen a portal limit.
- Standalone and CrazyGames builds are byte-for-byte reproducible and contain no source, tests, plans, repository metadata, or opposite-target integrations.
- `pnpm package:crazygames` builds only the portal target and emits a verified ZIP whose `index.html` is at the archive root.
- Wrangler dry-run uploads only `dist/standalone` and reports no source-tree assets.
