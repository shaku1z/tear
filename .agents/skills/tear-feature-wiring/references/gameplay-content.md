# Gameplay content

For each kind: where it starts, and what must be covered before it is wired. Read the existing instances
first and add the next one the same way.

## Weapon

Start at `src/gameplay/weapons.ts` (`WeaponDefinition`) and `src/gameplay/weapon-tuning.ts`. The roster is
Sword, Hammer, Greatsword, Chainblade and Riftlock; `pnpm check:active-roster` checks names against the
registry. Cover the definition table, each action's safety, ability interaction, reset and ownership, and
`pnpm test:weapons`.

## Ability

Start at `src/gameplay/upgrades.ts` and `src/gameplay/upgrade-hooks.ts`. Cover the table's rules, tiers,
each weapon with the ability, deterministic selection when randomness changes, the card text, and save
compatibility when an id or field is stored.

## Enemy

Start at `src/gameplay/entities/enemy-contracts.ts`, the kind's module under
`src/gameplay/entities/enemy-types/`, and `src/gameplay/affixes.ts` and `src/gameplay/variants.ts`. Cover
construction, behaviour, variants and affixes, collision, damage and death, randomness, and where it
spawns. `pnpm playtest enemies` measures a kind alone against the player.

## Boss and boss move

A boss is an enemy plus phases, moves, an arena and an ending. Moves and their warnings are data on the
shared boss attack layer: `src/gameplay/entities/boss-attacks.ts`, `src/gameplay/entities/boss-tells.ts`
and `src/gameplay/entities/boss-attack-runner.ts`. Follow
[docs/HOW_TO_ADD_A_BIOME.md](../../../../docs/HOW_TO_ADD_A_BIOME.md), "The boss". Nothing in a boss fight
stops the fight: see `plans/active/CINEMATICS_OVERHAUL.md`. Cover every phase change, cleanup on phase
change and death, difficulty, and readable warnings; `pnpm playtest bosses` measures the fight.

## Stage, stage object, biome

Follow [docs/HOW_TO_ADD_A_BIOME.md](../../../../docs/HOW_TO_ADD_A_BIOME.md) from the top: stage, stage
objects, enemies, boss, evidence. Stage definitions start at `src/gameplay/stages.ts`. Drawn backgrounds
follow [docs/BACKGROUND_WORKFLOW.md](../../../../docs/BACKGROUND_WORKFLOW.md); reference pictures of what
the game draws come from `pnpm assets:sheets` ([docs/ASSET_SHEETS.md](../../../../docs/ASSET_SHEETS.md)).
What is published and what stays preview-only is set by `config/campaign-publication-boundary.json`.

## Mode

Trace the mode through `src/gameplay/run/`, wave planning, setup presentation, the start action and the
ending. Cover the published-mode list, deterministic wave rules, pause, resume and exit, rewards, and a
browser journey. `pnpm playtest runs` measures whole runs per mode.
