# Gameplay content routes

## Weapon

Start at `src/gameplay/weapons.ts` and the weapon runtime/transport/coordinator modules. Preserve `WeaponDefinition` and its typed actor/platform ports. Cover definition catalogue, per-weapon action safety, ability conformance, reset/ownership behavior, and built-artifact selection or combat evidence when behavior is player-visible.

## Ability

Start at `src/gameplay/upgrades.ts`. Use `UpgradeDefinition`, typed apply contexts, and normalized combat-event hooks. Cover catalogue rules, tier behavior, weapon-by-ability conformance, deterministic selection when randomness changes, presentation text/cards, and save compatibility when authored IDs or fields persist.

## Enemy

Start with `src/gameplay/entities/enemy-contracts.ts`, the appropriate enemy-type module, factory/catalogue, combat runtime, and renderer. Cover construction, behavior matrix, variants/affixes, collision/damage/death contracts, deterministic randomness, presentation boundary, and stage/spawn availability.

## Boss

Treat a boss as enemy content plus phase, arena, campaign/ritual, presentation, and terminal behavior. Use typed boss contracts and existing boss conformance/harnesses. Cover every phase transition, recovery/cleanup path, arena mutation, difficulty behavior, death/transformation, campaign sequence, counterplay readability, and relevant browser journey. Do not create a parallel boss registry or standalone boss skill.

## Mode

Trace mode definition through run session/lifecycle, stage/wave planning, content direction, setup presentation, semantic start action, and terminal behavior. Cover published-mode catalogue, deterministic wave rules, pause/resume/exit, rewards/progression implications, and browser feature/journey evidence.

For every gameplay feature, emit presentation/audio/platform effects through typed facts or ports rather than importing outward systems.
