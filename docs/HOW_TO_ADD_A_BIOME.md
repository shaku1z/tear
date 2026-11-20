# How to add a biome: stage, enemies, boss

A biome is a stage, the stage objects that live in it, its enemies and its boss. Verdant Sanctum and the
Pale Traverse are the two in the game; copy the shape of the Pale Traverse, which is the smaller one. The
rules below are the shared layer every biome uses. A biome adds content to it and never works around it.

## 1. The stage

- **Stage id:** add it to `STAGE_IDS` and to the stage-to-boss map in `src/gameplay/stages.ts`. A new
  stage starts as a preview stage there until the release says otherwise.
- **Environment:** its row in `src/gameplay/environment/stage-environment-definitions.ts`.
- **Look:** a backdrop in `src/presentation/backdrop-biomes.ts` and a row in
  `src/presentation/stage-presentation-definitions.ts`.
- **Boss marks:** the same row may carry `bossTellSkin`, a table that says how boss warnings and strikes
  are drawn on this stage (`src/presentation/enemies/renderers/boss-tell-skin.ts`): which shape each mark
  takes and the colour of its body. The shared tell renderer draws from it when the boss's renderer passes
  the stage id as `skinId`. A table changes looks only: every shape stays inside the tell's area and keeps
  the shared warning and strike inks. A stage without a table, the exposed mark and high contrast keep the
  shared marks. Verdant's roots are the example; `tests/unit/boss-tell-skin.test.ts` checks every table.
- **Content:** the run's content director (`src/gameplay/run/content-director.ts`) decides which enemies
  appear on it.

## 2. Stage objects

A stage object is anything the stage or a boss places in the arena that has a life of its own: a field
(an area that pushes or launches), a combat object (something that can be cut or that blocks), or a route
(a path that hurts or carries). They live in the environment runtime, never in an entity.

- **Register the kind** in `src/gameplay/environment/environment-definitions.ts`, with `endsWhen`: how it
  ends (its own timer, cut, its owner is done, the stage ends). Every kind must end.
- **The lifetime rule is shared.** An object that becomes expired or destroyed fades for
  `ENVIRONMENT_FADE_TICKS` (0.25 s) and the runtime removes it. Never keep ended objects, never remove
  them by hand, and never depend on an ended object staying in the list.
- **Placing objects:** the entity that wants an object records a request and the biome feature installs it
  and acknowledges it (request and acknowledge). The White Hart's requests and the Rootbound's planted
  Grafts are the examples.
- **Damage by touch** is declared on the object (`damage`, `threatening`, `hitActorIds`, optional
  `hazardScaled`). The runtime applies it once per target after the biome feature steps. A biome feature
  never writes its own hit test.
- **Who a field moves** is data on the field: a row that gives the player, light enemies, heavy enemies and
  bosses each a share of its force (`BLOOM_WELL_LIFT.targets` is the example; a share of 0 leaves that class
  alone). `fieldEnemyClass` in `field-runtime.ts` sorts an enemy by one weight line for every biome; a field
  never reads a weight or an enemy kind itself. An enemy that keeps its own height sets `flies`, and one held
  in place sets `anchored`; a lift leaves both alone. A field that should catch whoever stands in it ends at
  the floor (`tests/unit/bloom-well-lift.test.ts` measures it on the real enemies and player).
- **An enemy that holds its allies in place** (the Rootbinder is the example) does it through three shared
  pieces, none of them keyed to a kind. The hold is `setRooted` on the enemy base: a rooted enemy is
  `anchored`, so every knockback, launch and lift already leaves it alone, and it takes full damage. The tie
  is a `root-link` stage object (`createRootLink`), which a held or thrown blade cuts. Who can be held is
  the enemy's own data: one that flies, a boss, or one with `rootable = false` never is. The enemy's phases
  and every number are one table beside its state machine (`ROOTBINDER_RULES` in `rootbinder-runtime.ts`);
  the biome feature owns the ties, and `bindLiveRootbinderActors` binds any enemy that has a `rootPhase`.
  `tests/unit/rootbinder-roots.test.ts` holds the rules on the real enemies.
- **The biome feature** (`<biome>-environment-feature.ts`) advances its kinds each tick and is bound to the
  live entities in `src/gameplay/environment/biome-actors/` (one `bind-…-actors.ts` per biome, called from
  `bind-biome-actors.ts`). Bindings hand the runtime the player with `bindLiveContactTargets`.
- **Drawing:** `src/presentation/environment/<biome>-environment-presentation.ts` draws the objects from the
  snapshot. An ended object keeps its settled look until the runtime removes it; the renderer never
  computes damage or timing.
- **Biome isolation:** list the new modules under the biome's roles in `config/architecture-roles.json`.
  The architecture gate rejects imports between biomes and biome words in the neutral layer.

`tests/unit/stage-object-lifetime-rules.test.ts` fights every biome boss and holds every registered kind
to the lifetime rule. Add the new boss's fight there; a kind that never ends, or that the fights never
retire, fails it.

## 3. Enemies

- **Type:** a factory in `src/gameplay/entities/enemy-types/`, registered in
  `src/gameplay/entities/enemies.ts` and `src/app/world/world-entity-factory.ts`.
- **Renderer:** `src/presentation/enemies/renderers/`, installed in `enemy-presentation.ts`.
- **Bestiary entry:** `src/presentation/bestiary-catalog.ts`. Names players see come from
  `config/terminology-registry.json`.
- **Rules:** use the simulation tick and the injected random source; ESLint rejects `Math.random`,
  `Date.now` and browser globals in gameplay code.

## 4. The boss

A boss is an enemy with phases, an arena and a move list.

- **Definition:** a row in `src/gameplay/run/boss-definitions.ts` (id, phase marks) and its arena in
  `src/gameplay/training/arena-rules.ts`.
- **Phases** are the boss's own ids, a typed union such as `"rooted" | "wild"`. The shared layer never
  assumes three.
- **Moves are data.** Write each move as a `BossAttackDefinition` (`src/gameplay/entities/boss-attacks.ts`):
  - `timing`: tell, active, recover and an optional punish stage, in seconds;
  - `choose`: preferred distance and height to the player, weight and cooldown;
  - `motion` (optional): dash, leap or burrow;
  - `hit` (optional): a shape from the closed `BossHitShape` union, damage, and whether it can be parried;
  - `tell`: which shared tell mark the warning uses;
  - `places` (optional): the stage objects it asks for, at the tell or when it strikes.

  `buildBossAttackTable` checks the table and converts every time to ticks once. Each phase needs at least
  two moves, and a move that hurts needs a tell of at least `BOSS_TELL_MIN_LEAD_SECONDS`.
- **Running it:** the boss holds one `BossAttackRunnerState` and calls `advanceBossAttack` every tick
  (`src/gameplay/entities/boss-attack-runner.ts`). The runner picks moves through the injected random
  source, never the same one twice running, weighted by distance and height. The boss reads:
  - `bossAttackHit`: where the move hits now. The boss applies the damage through its own damage call,
    with its parry check, then calls `markBossAttackLanded`;
  - `bossAttackMotion`: where the move puts the boss, and whether it is hidden;
  - `bossAttackDamageTaken`: the multiplier while the boss is exposed after a move;
  - `bossAttackTells`: the tells to report from `tells()`;
  - the events: `place` events become requests for the biome feature. The Rootbound's `plant-graft`,
    `root-cage` and `bloom-shift` are the worked example (`rootbound-moves.ts`, and `place` in
    `rootbound.ts`).

  Two more tools: `context.blocked` is a set of move ids that may not start now (a move whose stage
  object is already out, say), and `exposeBossAttack` opens the boss for a time outside any move, for an
  answer that is not a parry, such as cutting a stage object the boss depends on. `context.gapMultiplier`
  scales the pause after a move (a stage object that hastens the boss); do not rewrite `readyTick` in the
  boss. Keep the boss's own flags (carried by the move, hidden, parryable) by setting them from
  `bossAttackStatus` after every change to the runner state, as `syncMoves` in `rootbound.ts` does, so a
  parry or a forced exposure cannot leave one behind. Build the context once and reuse it every tick; do
  not build objects per tick in a boss.

  A channel that keeps attacking (the Rootbound's `regrowth`) is a move with a long active stage and
  `hit.repeat`: the strike is armed again each `every` seconds, and a travelling shape starts again from the
  boss. The move's tell warns of the first strike; each later one is warned for the last `tell` seconds of
  the repeat before it, with the hit off, and shows as a tell of its own (`regrowth:2`, `regrowth:3`). The
  table refuses a repeat warned for less than the shortest boss warning. A move that must come at a set point in the fight is scheduled in its `choose` data, never in the
  boss: `opens` plays it first when a phase it belongs to starts (Phase II's planting, Phase III's
  Regrowth), `once` plays it at most once, and `afterMoves` brings it back after that many other moves and
  only then (Last Spring). A fight restored part-way through a phase calls `openBossPhase` so no opening is
  owed. `bossAttackThreatens` says whether a strike is on its way, for rules that must not count that time
  (the Rootbound's healing wait). Do not run a schedule as a state machine beside the table.
- **Body contact:** a boss body hurts only inside a declared move. Give the boss a row in
  `src/gameplay/entities/boss-body-contact.ts` with `hurtsIn: "never"` and set it as `bodyContact` in its
  constructor. A charge or slam where the body is the strike is a move whose hit shape is `body`, so it
  has a tell like any other strike. With `blocks: true` the body pushes the player out to the side
  instead of letting them walk through; a player with no room between the body and the arena edge is
  moved to the open side. The rows that list where an old boss's body hurts are a list that may only
  shrink (`tests/unit/boss-body-contact.test.ts`); a new boss may not join it.
- **Moves the player must be able to leave:** pass `walker` in the move context (the player's walking
  speed in pixels per tick, and whether the body blocks). The chooser then does not play a ring, box or
  column on a target who stands in it and could not walk out within the tell, counting the arena edge and
  a blocking body. Lanes and travelling strikes are answered by a jump and are not affected.
- **Tells:** report them from `tells()` in the shared format (`src/gameplay/entities/boss-tells.ts`). The
  shared tell renderer draws them, and `tests/unit/boss-tell-rules.test.ts` checks every boss's warnings.
  The punish stage reports an `exposed` tell, so the player can see the opening.
- **Pressure:** add the boss to `tests/unit/boss-pressure-report.test.ts`. Its row (movement, hits, damage
  and time exposed per phase) is what a change to the boss is judged on; the pull request that changes a
  row says why.
- **Drawing:** the boss renderer draws the body and the move from the runner's state (move, stage and
  progress). It never recomputes timing or hit areas.

## 5. Evidence

- Every new file under `src/` needs a TearBench evidence route in `src/tearbench/evidence-routes.json` or a
  line in `config/change-impact-defaults.json` ([CHANGE_IMPACT.md](CHANGE_IMPACT.md)).
- A boss or stage-object change that alters a fight bumps the gameplay ruleset version once, in the first
  pull request that changes behaviour.
- Live play and replay must agree: add the biome's cases to a browser replay parity check, as
  `tests/browser-verdant-replay-parity.js` does for Verdant.
