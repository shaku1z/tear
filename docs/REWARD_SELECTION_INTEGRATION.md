# Reward selection integration contract

`RewardSelectionController<UpgradeDefinition>` owns the pure state transitions for drafts, rerolls, reserves and boss tier-ups. It never mutates the run, upgrades, input, replay recorder, UI state or lifecycle directly.

## Run adapter

Create one controller with each new run, initialized from:

- `run.mode`
- `run.mods.expandedDraft`
- `run.mods.reservePick`
- `run.mods.draftRerolls`
- `run.specialBlock`
- `run.specialsOffered`
- `run.reservedUpgrade`

The `openDraft` and `reroll` roll port maps directly to:

```ts
(request) => rollUpgrades(request.count, run.mods, {
  random: GAME_RANDOM,
  forceSpecial: request.forceSpecial,
  excludeIds: request.excludeIds,
})
```

After every transition, mirror these snapshot fields into the existing runtime until the run session owns them directly: `choices`, `reserveChoices`, `reservedChoice`, `rerolls`, `specialBlock`, and `specialsOffered`.

For tier rewards, `eligibleTierChoices(UPGRADES, run.mods.owned, run.mods.tier)` replaces the legacy eligibility scan and preserves its category ordering.

## Ordered intent interpreter

Interpret intents in array order:

| Intent | Existing adapter action |
| --- | --- |
| `apply-upgrade` | `applyUpgrade(intent.choice, { player, blade, mods: run.mods })` |
| `tier-up` | `tierUp(intent.choice.id, { player, blade, mods: run.mods })` |
| `ghost-loadout` | `GHOST.loadoutPick(intent.choiceId, run.mods.tier[intent.choiceId] || 1, run.wave)` |
| `ghost-event` | `GHOST.event(intent.event, player.x, player.y)` |
| `consume-input` | `Input.consumeDelta()` |
| `reset-ui` | Reset only the requested `enterT`, `focus`, and `listScroll` fields |
| `set-screen` | `setState(intent.screen)` |
| `start-next-wave` | `startNextWave()` |
| `request-pointer` | `requestLock()` |

The intent ordering preserves the existing rule that applying/evolving occurs before replay loadout logging, and that non-training runs prepare their next wave before returning to `playing`. Tutorial and Playground never emit `start-next-wave` and never open Reserve.

## Legacy deletion boundary

Once the adapter is live and the built-artifact progression journey is green, delete the duplicate business logic in `buildDraft`, `rerollDraft`, `chooseUpgrade`, `finishDraft`, `chooseReserve`, `chooseTierUp`, and the local draft/reserve/tier choice arrays. The strict ScreenView renderers remain presentation-only consumers of controller snapshots.
