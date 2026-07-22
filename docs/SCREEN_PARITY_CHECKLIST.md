# Legacy screen parity checklist

This checklist is the deletion contract for the legacy screen ranges. A row is presentation-ready when its complete visual/control state can be represented by `LegacyScreenView`; the old range may be deleted only after the central adapter maps every listed dependency and its browser characterization passes.

| Screen | Presentation parity carried by the snapshot | Adapter-owned work before deletion |
| --- | --- | --- |
| Menu | Animated TEAR slash/wordmark, biome strip, profile/currency rail, PLAY summary, all hub links, pending-finale recovery actions | Cloud/profile/currency/Attract lookups; finale resume/claim coordination |
| Setup | Mode, difficulty and weapon descriptions; 58/66 mode/difficulty geometry; 70/78 weapon geometry; Boss Test picker; daily bounties; best record; fixed 726–792 START target | Filter debug modes on live portals; selected IDs; best/bounty/boss data; semantic selection/start actions |
| Codex — Abilities | Filters, sort cycle, category/rarity badges, selected-tier pips/description, cycle hint, scroll | Filtering/sorting and tier-view index updates |
| Codex — Bestiary | Role/variant/counterplay cards and presentation preview IDs for enemies and bosses | Build immutable enemy preview snapshots; never instantiate/mutate combat actors in the renderer |
| Codex — Guide | Full keyboard/controller chart, live trick point table, multiplier ladder, variety rule | Read tuned CONFIG values into `guide` rows |
| Shop | Balance/ledger, four sections, owned/current descriptions, level pips, affordability/MAX state, buy flash, scroll | Coin tween/flash timers and purchases/stat/achievement writes remain outside rendering |
| Profile — Passport | Identity/sync status, currencies, achievement chip, rare showcase seals, rename cooldown label, sign-in/out availability | Cloud/profile lookups and auth/rename actions |
| Profile — Bests | Empty-state PLAY action, finest record, full record ledger | Collect/sort best records and format time/score |
| Profile — Stats | Twelve glyph/accent tiles and biome/boss journey markers | Entry count-up value and profile-stat lookups |
| Profile — Replays | Vault rows, preview IDs, availability and WATCH actions, scroll | Vault loading/deletion/publish coordination stays outside rendering |
| Achievements | Three daily cards/reset clock/rewards, shards/completion/NEXT UP strip, category counts, rarity/locked cards, progress and both rewards, scroll | Daily/achievement progress and reward calculations; no profile writes in renderer |
| Leaderboards — Global | Mode+difficulty selectors, cloud/sign-in/loading/empty messages, top-three podium, replay actions, ranks 4+, pinned own rank | Async fetch/cache, user identity, replay loading, board key selection |
| Leaderboards — Feed | Replay rows, badges/timestamps, thumbnail preview IDs, WATCH actions and scroll | Remote/local feed loading and replay envelope validation |
| Replay theatre | Identity/wave bar, scrub progress, boss chapter ticks, playhead/time, chapter/play/speed/restart/info/back controls, summary/loadout panel | Ghost stepping/seeking, stage/world/puppet/FX rendering and all mutations belong to replay runtime/world presentation; DOM/pointer input becomes semantic actions |
| Settings | General, controls, audio, video and accessibility tabs; stepper/toggle/cycle rows; preset notes; independent master/music/SFX/interface controls; reset/back | Apply/save settings, touch/pad detection and contextual return routing |
| Rename | Exact title/subtitle/rules/error/count, first-run skip/cancel and confirm actions | DOM input positioning/focus, validation/profanity/cooldown, cloud write and return routing |
| Draft | Full category/rarity/name/description/owned cards, touch confirm hints, quick keys, reroll state | Choice generation, fortune description calculation and mutations |
| Reserve | Full reserve-card details and skip | Reserved-upgrade assignment and run transition |
| Tier-up | Tier/category/description cards, two-row scroll, selection | Tier mutation and next-wave transition |
| Paused | Run summary/actions, full arsenal cards, daily/achievement progress | Resume/restart/settings/quit coordination and scroll state |
| Confirm quit | Exact warning and quit/cancel actions | Save/coin award/run termination |
| Continue | Revive copy/countdown and revive/give-up actions | Ad request/result, expiry and player restoration |
| Game over | Result/best/rewards/actions, scrollable wave log, run progress | Retry/menu/replay coordination and report snapshot construction |
| Win | Boss victory table/actions and campaign final-reward/descend flow | Campaign reveal gating and restart/menu coordination |
| Playground menus | Every section/choice supplied as semantic playground actions, back routing and scroll | Training controller mutations remain outside rendering |

## Non-negotiable deletion checks

- Browser smoke must click each setup weapon at `y = 200 + index × 78` and observe that exact weapon in the started run.
- Every legacy button must map to a `ScreenAction`; renderers never receive executable callbacks.
- Replay world simulation, DOM text input, persistence, audio and platform APIs must not move into screen renderers.
- Screen view snapshots must be captured before drawing and remain immutable throughout rendering.
- Existing browser feature/input matrices and the focused screen renderer characterization suite must pass before removing any old range.
