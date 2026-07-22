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
- Sword, hammer, spear, chainblade, and ringblade pass action, ability, throw/recall, and reset conformance.
- Every standard enemy, variant, affix, support, boss, boss phase, arena mutation, projectile, zone, wall, and hazard has characterization coverage.
- Draft, reroll, reserve, tier-up, rewards, economy, achievements, profile, leaderboard, replay, victory, defeat, continue, tutorial, cinematics, and finale retain their behavior.
- Settings and historical saves/replays migrate; malformed/unavailable services degrade to a playable state.
- Identical seed and semantic actions produce the same verification hash at 30, 60, and 144 Hz and after replay serialization.

## Resource and artifact evidence

- Five repeated start/play/quit cycles show bounded enemies, projectiles, effects, audio voices, nodes, listeners, timers, and caches.
- Simulation/render/frame p95 values, long tasks, startup, bundle gzip, file count, and total artifact bytes stay within checked budgets.
- CrazyGames remains below Tear's 20 MiB mobile-homepage artifact budget and 1,500 files, with no root-absolute game asset paths.
- Standalone and CrazyGames builds are byte-for-byte reproducible and contain no source, tests, plans, repository metadata, or opposite-target integrations.
- `pnpm package:crazygames` builds only the portal target and emits a verified ZIP whose `index.html` is at the archive root.
- Wrangler dry-run uploads only `dist/standalone` and reports no source-tree assets.
