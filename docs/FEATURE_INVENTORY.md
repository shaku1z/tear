# Tear Feature Preservation Inventory

This is the migration checklist for the architectural redesign. A checked feature has a characterization, contract, deterministic, or browser test in the redesigned runtime. Presence in the legacy compatibility bundle alone does not count as migrated.

## Runtime and releases

- [ ] Standalone browser release
- [ ] Installable/offline PWA and safe update recovery
- [ ] CrazyGames iframe release and SDK lifecycle
- [ ] Responsive/overscan Canvas 2D presentation
- [ ] Keyboard/mouse, touch and controller input
- [ ] Fullscreen, pointer lock, focus loss and controller disconnect behavior
- [ ] Cloud/Firebase and offline/local capability fallbacks

## Game flow and modes

- [ ] Main menu, setup/war table and tutorial
- [ ] Endless, campaign/adventure and every published challenge/training mode
- [ ] Run start, wave progression, biome progression and boss transitions
- [ ] Upgrade draft, reroll, reserve and boss tier-up flows
- [ ] Pause, settings, rewarded continue, game-over, victory and finale
- [ ] Shop, codex, profile, achievements, leaderboards and replay feed/viewer
- [ ] Attract mode, cinematics and chapter/finale sequences

## Combat and content

- [x] Sword, hammer, spear, chainblade and ringblade start and throw/recall characterization
- [x] Weapon-specific throw identities and completed weapon action safety checks
- [ ] Player movement, jump, dash, drop-through, tether and trick scoring
- [ ] Weapon-by-ability conformance across normal, special and unique upgrades
- [ ] Projectiles, particles, supports, zones, walls and stage hazards
- [ ] Every standard enemy, variant and affix
- [ ] Every boss, boss phase, arena mutation and Pantheon/Source sequence
- [ ] Difficulty, run modifiers, permanent upgrades and economy rewards

## Persistence and online behavior

- [ ] Legacy settings migrate without losing choices
- [ ] Profile, currency, upgrades, achievements and challenge progress persist
- [ ] Leaderboard submission, identity and failure/offline behavior
- [ ] Replay recording, vault, publication, loading and legacy migration
- [ ] Deterministic replay verification across render rates

## Accessibility and settings

- [ ] Mouse/controller sensitivity, controller presets, deadzones and glyphs
- [ ] Reduced motion, flash strength, high-contrast tells and screen shake
- [ ] Effects quality and automatic low-end policy
- [ ] Master, music, sound-effects and interface volume/mute controls
- [ ] Independent saved audio sliders plus temporary ad/portal/system mute reasons
- [ ] Cinematic preference and automatic pause behavior

## Audio

- [ ] Shared host-owned AudioContext lifecycle
- [ ] Hierarchical Master/Music/SFX/Interface mixer and internal SFX buses
- [ ] Existing synthesized SFX and UI feedback routed by category
- [ ] TearScore ESM music backend with run session, semantic events and provenance
- [ ] Legacy music as exclusive initialization/runtime fallback
- [ ] Ad, portal, visibility, suspension and repeated-run leak tests

## Migration evidence

The inventory is reviewed at every phase gate. New features added during the redesign must be appended here and implemented through the target boundaries; they may not add new shared globals or direct platform dependencies to domain code.
