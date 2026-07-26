# Tutorial parity repair and upgrade plan

## Outcome

The repaired tutorial preserves the oracle lesson order and success rules while
making them viable under the redesigned runtime:

`MOVE -> JUMP -> DASH -> CUT -> LAUNCH -> JUGGLE -> SLAM -> POWER SLAM -> UPDRAFT -> THROW -> PARRY -> READY`

The parity repair and the future redesign are intentionally separate. The
current tutorial must remain a dependable baseline while the upgraded tutorial
is developed behind an explicit version boundary.

## Cutting Room 2.0 implementation status

The live tutorial now uses the Cutting Room curriculum rather than the old
shared playground layout. This is deliberately a baseline-only teaching run:

- each of the thirteen blocks installs fresh task-specific platforms and clears
  prior enemies, projectiles, player velocity, and blade throw state;
- objective evidence is reset at every block entry, so a launch, slam, or
  other valid action from the previous block cannot pre-complete the next one;
- movement and combat objectives now require repeated player-valid actions;
- the rising-cut exercise accepts only a fresh production launch or a fresh
  collision inside an observed rising window; it never credits itself;
- failed throw routes recover the blade without awarding hit or recall credit;
- permanent meta/shop progression is skipped for tutorial runs, and tutorial
  mode never starts campaign waves, drafts, or shops;
- the objective field sheet is responsive and stays in the right-side safe
  lane instead of crossing the score/combo sightline;
- controller/touch prompt labels resolve through the active input bindings while
  retaining the exact, current objective wording and repetition target;
- ghost demonstrations are now adaptive: they appear for a short labeled loop
  only after the player has stalled, a relevant live action dismisses them, and
  their actor route is sampled through the production Player physics/collision
  model rather than hand-eased animation points;
- completion awards credit once and immediately enters the baseline, no-wave
  Playground practice arena instead of ejecting the player to the main menu;
- the deterministic browser journey completes every block with actual semantic
  gameplay input and asserts every arena transition.

The larger chamber progression below remains the content direction for follow-up
work: enemy-language rooms, a wave-like mixed final encounter, selectable
checkpoints, and a post-completion practice selector are not represented as
completed merely because the core curriculum has been stabilized.

## Parity repair now implemented

- Movement credit observes authoritative player displacement, so keyboard,
  controller, touch, replay, and deterministic semantic input all progress the
  same lesson.
- Tutorial dummies maintain grounded state in their dedicated physics path.
  This prevents grounded strikes from being misclassified as airborne attacks.
- Dummies are reset between combat lessons, including position, velocity,
  cooldown, health, and grounded state.
- A dummy that drifts more than 320 world units from the player is recovered to
  a reachable position instead of leaving the lesson softlocked.
- Slam recognition uses tutorial-only tolerance compatible with the redesigned
  blade dynamics. The production combat thresholds remain unchanged.
- A down-dash landing-window strike can satisfy POWER SLAM while the tutorial
  dash is still active, matching what the ghost demonstration communicates.
- Tutorial prompts adapt to the active keyboard/mouse, controller, or touch
  input mode. Controller action labels come from the configured preset and
  glyph resolver.
- Completion stops the controller before awarding `tutorialDone`, checking
  achievements, releasing the pointer, and handing off synchronously to the
  no-wave practice arena. A regression test proves that credit is emitted once
  and the browser journey proves the live handoff.
- A deterministic browser journey completes every lesson using real semantic
  gameplay actions. It does not mutate counters, skip lessons, or call tutorial
  internals to manufacture success.

## Research findings

The useful pattern across current guidance and comparable action games is a
practice space with small, playable problems—not a control reference disguised
as a tutorial.

- Microsoft's [on-demand tutorial criteria](https://learn.microsoft.com/en-us/xbox/accessibility/accessibility-feature-tags)
  require tutorials to teach controls and core mechanics through real or
  simulated gameplay, remain revisitable without losing progress, and reflect
  remapped inputs.
- [Xbox Accessibility Guideline 107](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107)
  says remapped controls must be represented correctly in hints and tutorials,
  and recommends alternatives for rapid, simultaneous, or prolonged inputs.
- [Xbox Accessibility Guideline 109](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/109)
  recommends interactive, on-demand tutorials and persistent clarity about the
  current objective.
- The [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/)
  recommend interactive tutorials, clear language, failure-free practice,
  contextual guidance, and reminders of controls and objectives.
- Dead Cells' official [Practice Makes Perfect update](https://dead-cells.com/patchnotes/25)
  added a revisitable training room that can spawn previously encountered
  enemies and bosses. Its later [Assist Mode update](https://dead-cells.com/patchnotes/29)
  added adjustable timing, damage, health, and input options instead of forcing
  one difficulty profile on every learner.
- Celeste's official [changelog](https://www.celestegame.com/changelog.html)
  shows two relevant details: prompts were changed to say “Press [Button]” for
  clarity, and assist/rebinding options were expanded without removing the
  original authored challenge.

## Non-negotiable design contracts

### The stage teaches and changes

The Cutting Room is not one flat sandbox with a different instruction card
hovering over it. It is a single impossible paper stage that folds, tears, and
rebuilds itself around each task:

- movement unfolds a long horizontal strip;
- jumping raises a wall and reveals a one-way ledge;
- launch lowers the ceiling target and opens vertical space;
- slam folds the floor into low and deep impact shelves;
- throw seals the player behind a barrier with a remote switch;
- parry tears open a projectile lane;
- the final exam reuses recognizable pieces from every prior chamber.

Each transformation happens only after a checkpoint is sealed. Player, blade,
dummy, camera, projectiles, and music transition as one authored beat. The
stage's geometry communicates the desired verb before explanatory text appears.
No transformation may strand a target, erase the player, or inherit physical
state from the previous task.

### Baseline power only

The tutorial has no shop, draft, boon, relic, currency purchase, free sample
upgrade, or hidden tutorial modifier that makes the blade stronger. The player
uses the selected weapon's authored baseline values throughout.

This is both a teaching and testing contract:

- success proves understanding of the core mechanic rather than build power;
- speed and damage feedback remain representative of a fresh run;
- every objective is completable with zero owned upgrades;
- tutorial completion never mutates owned upgrades, currency, draft history,
  rerolls, or reserves;
- assist options may alter lesson timing or reset behavior, but never player
  damage or enemy-health math invisibly.

Drafts and shops should be taught contextually in the player's first real
campaign run, when those systems genuinely exist. A concise first-run callout
can explain choice, compare, reserve, and reroll at the actual screen. The
tutorial itself can state the overall loop, but it must not open a simulated or
real upgrade shop.

### Teach the game, not only its controls

The current lesson list teaches inputs and techniques but says little about the
decisions that define a run. The redesign must also teach:

- the goal of a run and the wave-to-boss cadence;
- health, damage, invulnerability, death, and restart expectations;
- common enemy intent language: approach, charge, projectile, armor, and area
  denial;
- when movement is safer than attacking;
- how launch, slam, throw, recall, and parry create space rather than merely
  satisfy counters;
- platform and hazard readability;
- the HUD's health, dash, wave, boss, and style information;
- that upgrades arrive later in real runs and modify—not replace—the baseline
  combat grammar.

## Proposed upgraded experience: The Cutting Room

The new tutorial should feel like a short first run through a purpose-built
blade laboratory. Each chamber introduces one verb, lets the player discover
its physical consequence, then combines it with the previous verb. Doors and
targets carry the teaching so the instruction card can stay short.

### Chamber 0 — Calibration

Purpose: establish input ownership and accessibility before timing matters.

- Detect the last meaningful input device and show its live glyphs.
- Let the player test blade sensitivity against a circular guide.
- Offer “more time,” “slower projectiles,” “stronger contrast,” and “skip
  advanced techniques” without leaving the tutorial.
- Save these as normal settings, not hidden tutorial-only cheats.

Success: move the blade through four wide arcs and confirm the control feels
comfortable. This is advisory, never a progression blocker.

### Chamber 1 — Wake

Purpose: movement, jumping, drop-through, and dash as spatial solutions.

- A short lane first asks the player to walk through two ink gates.
- A low wall teaches jump.
- A one-way ledge with a visible lower exit teaches drop-through.
- A closing paper seam teaches dash, but resets harmlessly if missed.

Success is crossing spaces, not repeating inputs a fixed number of times.

Stage change: the calibration circle tears into a long strip, then folds upward
into the jump wall and one-way ledge. The exit seam only becomes reachable
through the taught movement.

### Chamber 2 — Edge

Purpose: teach that blade speed—not button mashing—is damage.

- A paper target shows the blade path and a simple `soft / clean / fierce`
  speed readout.
- The first slow contact produces a crease rather than silent failure.
- The ghost performs one compact swing only after two unsuccessful attempts.

Success: one clean cut in either direction.

Stage change: the movement strip compresses into a close, uncluttered cutting
bay so camera distance and background motion cannot obscure blade speed.

### Chamber 3 — Lift

Purpose: launch and juggle as one readable cause-and-effect chain.

- A weighted dummy stands beneath a hanging target.
- An upward cut launches it; striking it through the hanging target completes
  the room.
- The room freezes briefly on the first launch and draws the upward impulse.
- A missed juggle resets the dummy in-place after landing.

Success: launch once, then land one airborne hit. Optional mastery: two hits.

Stage change: the ceiling peels upward and the floor target rises from the
previous cutting bay, making vertical cause and effect visible in one frame.

### Chamber 4 — Weight

Purpose: contrast slam, power slam, and updraft instead of presenting three
nearly identical text cards.

- Three paper seals are placed low, deep, and high.
- An ordinary airborne down-cut breaks the low seal.
- A down-dash plus down-cut breaks the reinforced deep seal.
- A rising upward cut carries the dummy through the high seal.
- Directional trails use distinct shapes as well as colors.

Success: break all three seals in any order. Failed attempts never move the
dummy out of reach.

Stage change: the Lift room folds into three distinct elevations. Completing a
seal physically flattens that section so the arena becomes simpler as mastery
increases.

### Chamber 5 — Thread

Purpose: throw, hit, recall, and tether relationship.

- A narrow barrier prevents a held blade from reaching a switch.
- Throwing through a dummy opens the barrier.
- Recalling the blade pulls it through a second paper ribbon.
- An optional side target teaches tether tightening without blocking the core
  tutorial.

Success: throw hit plus recall. The room explains the action, not “RMB.”

Stage change: a paper wall grows between the player and target. The only open
route is narrow enough for the blade but not the player, making throw's purpose
clear without a paragraph.

### Chamber 6 — Counter

Purpose: make projectile counterplay legible before asking for precision.

- The first launcher fires on a long, fixed cadence with a visible lane.
- A normal deflect succeeds; a perfect parry receives a stronger freeze, sound,
  and homing-path demonstration.
- After two misses, projectile speed decreases for the next attempt and the
  ghost demonstrates the intercept point.
- The assist is disclosed and can be disabled; it does not change campaign
  tuning.

Success: one deflect. Optional mastery: one perfect parry.

Stage change: the wall tears sideways into a long, high-contrast projectile
lane with no unrelated enemies or effects.

### Chamber 7 — Read the Fight

Purpose: teach enemy language and survival decisions before a real encounter.

- A charger demonstrates wind-up, committed path, recovery, and punish window.
- A ranged enemy demonstrates line of fire, projectile response, and the value
  of changing elevation.
- An armored target demonstrates that not every contact is equally useful.
- The stage presents one enemy at a time and freezes briefly at the first
  telegraph, first avoid, and first safe punish.
- The HUD calls out health loss, invulnerability, dash readiness, and enemy
  intent once, then becomes the normal campaign HUD.

Success: avoid one committed attack, punish one recovery, and answer one
projectile by movement or blade. The player is not required to use a single
prescribed solution.

Stage change: the projectile lane folds into three familiar lanes—ground,
one-way ledge, and elevated perch—so enemy behavior can be read spatially.

### Chamber 8 — The Cut

Purpose: prove transfer into the actual run loop.

- The stage visibly marks `WAVE 1`, a safe inter-wave breath, then a short
  `FINAL WAVE` led by an elite telegraph. This teaches cadence without opening
  a draft or shop.
- One charger and one ranged enemy enter with baseline player power and
  forgiving enemy damage.
- No new instruction appears unless the player stalls.
- The arena asks for movement, one launch or slam, one throw or recall, and one
  projectile response, but accepts creative equivalents.
- The final beat introduces a boss-style danger banner and arena-safe-zone cue,
  but does not pretend to teach every boss.
- Completion opens the campaign door immediately; no five-second dead wait and
  no reward/shop screen.

Success: clear the encounter and cross the exit. The result screen names the
techniques used, not the ones missed. It then explains the real loop in one
line: clear waves, shape a build when the campaign offers choices, read the
boss, and survive the Tear.

Stage change: all prior folds reopen into a compact campaign-like arena. The
player recognizes every platform and lane because each was previously taught
in isolation.

## Adaptive coaching

Every objective has three feedback levels:

1. **Nudge** after two failed attempts: highlight the relevant direction or
   target and restate the physical outcome in one sentence.
2. **Demonstrate** after four attempts: play the local ghost once at normal
   speed, then return control immediately.
3. **Assist** after six attempts: offer a temporary wider timing window,
   slower projectile, or lesson completion. Never silently alter campaign
   difficulty.

The player can restart the current chamber, select any previously reached
chamber, hide prompts, or leave without losing campaign/profile progress.

## Technical shape

The upgraded tutorial should be data-driven rather than adding more conditions
to `TutorialController`.

- `TutorialDefinition`: version, chambers, entry/exit, available assists.
- `TutorialObjective`: semantic predicate, progress projection, reset policy,
  failure observation, accepted equivalent techniques.
- `TutorialArena`: authored platforms, gates, targets, dummy/projectile spawns.
- `TutorialStageTransition`: deterministic before/after geometry, safe spawn
  anchors, camera path, entity cleanup, and checkpoint seal.
- `TutorialCoach`: attempt counter and nudge/demonstration/assist escalation.
- `TutorialPrompt`: semantic actions resolved through keyboard, gamepad preset,
  glyph style, and touch adapters.
- `TutorialCheckpoint`: chamber, local entities, selected settings, and whether
  completion credit was already awarded.

Runtime intents remain the only mutation boundary. Presentation consumes a
snapshot containing objective, prompt, demonstration, and feedback state.

## Delivery phases

### T1 — Stabilized legacy tutorial

Shipped by the parity repair. Keep this as `tutorialVersion: 1` and as a
fallback until all T2 gates pass.

### T2 — Chamber framework

- Introduce typed definitions/objectives and chamber checkpoints.
- Introduce deterministic stage folds with validated player and target anchors.
- Port MOVE through CUT without changing campaign combat.
- Add lesson selector, restart, and leave/resume.
- Gate with keyboard/mouse, controller presets/glyph styles, and touch tests.

### T3 — Blade curriculum

- Port Lift, Weight, Thread, and Counter.
- Add deterministic ghost demonstrations and adaptive coaching.
- Add contrast/reduced-motion versions of every directional cue.

### T4 — Final exam and integration

- Add enemy-language training, wave cadence, the mixed encounter, and immediate
  campaign handoff.
- Add post-tutorial technique summary.
- Add contextual first-run campaign onboarding for the real draft/shop screens;
  keep them absent from the tutorial.
- Retire version 1 only after completion and abandonment metrics meet targets.

## Acceptance gates

- Fresh profile can enter, complete, receive one completion credit, and return
  to the menu on keyboard/mouse, controller, and touch.
- Every chamber can be restarted indefinitely without stale actors,
  projectiles, cooldowns, or music state.
- Every stage transformation validates its destination geometry before moving
  the player or targets and can roll back to the sealed checkpoint.
- No required target can leave the reachable arena.
- Tutorial run state contains zero applied/owned upgrades, zero tutorial shop
  entries, and no currency or draft-history mutation from start to finish.
- Baseline completion remains possible for every selected tutorial-supported
  weapon without damage modifiers.
- Every displayed controller action changes with preset and glyph style.
- Reduced motion removes nonessential ghost afterimages without hiding timing.
- High contrast keeps directions distinguishable without relying on hue alone.
- A deterministic full journey completes from semantic input only.
- A deliberately struggling policy receives escalating help and can finish.
- Exiting and resuming restores the current chamber without duplicating rewards.

## Measurement

Track locally and aggregate only through the existing consented telemetry path:

- time to first success per chamber;
- attempts before success, demonstration, assist, skip, or exit;
- completion and abandonment by chamber and input mode;
- number of dummy recoveries and objective resets;
- prompt-device switches and stale-glyph incidents;
- techniques used in the final exam;
- damage taken before and after each enemy telegraph lesson;
- stage-transition recovery/rollback count;
- any upgrade, currency, draft, or shop mutation during tutorial (target: zero);
- tutorial completion credit duplication (target: zero);
- campaign first-run survival and mechanic use after tutorial completion.

Metrics diagnose teaching friction; they must not silently lower normal campaign
difficulty or identify individual players.
