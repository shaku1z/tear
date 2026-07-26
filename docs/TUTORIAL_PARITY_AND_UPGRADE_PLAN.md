# Tutorial parity repair and Cutting Room 2.0 plan

## Executive outcome

The tutorial needs to do two different jobs, and those jobs should not be
confused:

1. Version 1 must be a reliable legacy-parity fallback that can always be
   completed with real player input.
2. Version 2 must teach how Tear is actually played: movement, momentum,
   blade-movement coupling, threat reading, recovery, and run cadence.

The Version 1 order remains:

`MOVE -> JUMP -> DASH -> CUT -> LAUNCH -> JUGGLE -> SLAM -> POWER SLAM -> UPDRAFT -> THROW -> PARRY -> READ THE CHARGE -> FIELD TEST -> READY`

Version 2, "The Cutting Room", is not a longer control checklist. It is a short
authored first run made from changing action blocks. The arena itself presents
the problem, the player solves it using baseline power, and later rooms test the
same skill under different geometry and pressure.

The governing principle is:

> Do not count inputs. Prove control, vary the situation, then prove transfer.

## Cutting Room 2.0 implementation status

The live tutorial now uses the Cutting Room curriculum rather than the old
shared playground layout. This is deliberately a baseline-only teaching run:

- each of the fourteen blocks installs fresh task-specific platforms and clears
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

- `READ THE CHARGE` uses a real baseline Charger. Only a dash *away from its
  live committed charge* earns the evade; only a subsequent blade hit inside
  recovery earns the punish. Generic dashes and cuts cannot complete it.
- `FIELD TEST` combines a fresh charge evade, recovery punish, upward opening,
  and projectile deflection in `THE FIELD`. It uses no draft, shop, meta, or
  tutorial damage bonus and hands directly into the same no-wave practice arena.
- The coach ghosts for both encounter rooms are sampled from the production
  Player movement model, so their escape routes are physically possible.

Selectable checkpoints, explicit assist controls, a technique summary, and a
post-completion practice selector remain follow-up work; they are not implied by
the completed enemy-language and field-test slice.

## Version 1 repair status

The current parity repair now establishes a trustworthy baseline:

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

This round also fixes three legacy defects that parity alone would have
preserved:

### Lesson-local evidence

Technique counters are now owned by lessons and reset when their lesson begins.
This fixes the reported false completions:

- An upward cut made during CUT can no longer complete LAUNCH in advance.
- A power slam made during SLAM can no longer complete POWER SLAM in advance.
- The same rule applies to every objective so later actions cannot be
  pre-completed by unrelated experimentation.

The browser journey explicitly asserts that LAUNCH begins with `launch = 0` and
POWER SLAM begins with `superslam = 0`.

### Honest full-journey execution

Removing leaked counters exposed hidden weaknesses in the journey itself. The
repaired journey now performs:

- a real upward launch after LAUNCH begins;
- a real down-dash power slam after POWER SLAM begins;
- a real rising updraft with the player still in the strong rise window;
- a throw aimed from the blade hilt through the dummy;
- physical movement back into recall range before recalling;
- a live projectile deflect or parry.

The resulting journey is longer than the old one because it is no longer
receiving accidental credit.

### HUD exclusion zone

The tutorial objective card no longer assumes that the entire top-right area is
free. At wide viewports it fits beside the centered style meter with a defined
gap. At narrow logical widths it moves below the style lane instead of
overlapping or crushing its text.

This is the immediate compatibility fix. Version 2 should replace the large card
with the tutorial rail described later in this document.

## What the research changes

The redesign uses research as a decision aid, not as decoration.

### Prime, teach, observe

Asher Vollmer's GDC talk,
[Prime, Teach, Observe](https://www.gdcvault.com/play/1020512/Prime-Teach-Observe-Tutorializing-Innovative),
frames tutorialization as preparing the player, teaching the mechanic, and
watching whether they internalize it. In Tear this becomes:

- **Prime:** stage geometry and target placement imply the needed action.
- **Teach:** one short prompt and, when useful, one truthful demonstration.
- **Observe:** the player solves a physical problem without the prompt
  prescribing every input.

Every room must contain an observation step. An instruction followed by a raw
counter is not enough.

### Practice for transfer, not only acquisition

The 2024
[systematic review and meta-analysis of contextual interference and transfer](https://pmc.ncbi.nlm.nih.gov/articles/PMC11349744/)
supports a careful conclusion: varied or interleaved practice can improve
transfer in some motor-learning contexts, even when initial practice looks less
smooth. The evidence does not justify randomizing everything or deliberately
frustrating beginners.

Tear's implementation should therefore use **progressive variation**:

1. isolate the new verb;
2. repeat it until it is stable;
3. change direction, height, timing, or target;
4. mix it with an older verb;
5. test it once without a step-by-step prompt.

This is why Version 2 uses meaningful executions rather than "do it twice."

### Demonstration plus physical practice

A 2022
[systematic review of observational learning and motor skill learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC9407861/)
found strong support for observational learning over no modeling, while also
warning that excessive verbal cues can disrupt practice rhythm. Research on
[observational learning combined with overt practice](https://www.sciencedirect.com/science/article/pii/S0001691800000391)
also supports combining demonstrations with actual attempts.

The ghost should therefore:

- demonstrate briefly, then give control back;
- show motion and timing more than paragraphs of explanation;
- appear again only on request or after diagnosed failure;
- never replace physical practice;
- never loop forever in the player's visual field.

### Geometry as instruction

Respawn's
[Titanfall 2 action-block process](https://www.gdcvault.com/play/1025105/Designing-Unforgettable-Titanfall-Single-Player)
is a useful production model: prototype one focused interaction, validate that
it is enjoyable and readable, then connect proven blocks. The tutorial stage
should be built as independently testable action blocks rather than one generic
room with changing text.

### Teach the real combat thesis

The GDC talk on
[DOOM's push-forward combat](https://www.gdcvault.com/play/1024940/Embracing-Push-Forward-)
is relevant because it teaches the combat behavior the game actually rewards:
aggression and speed. Tear likewise should state and prove its own thesis:

> Movement creates safety, movement creates blade speed, and blade speed
> creates damage.

If the tutorial permits stationary input execution to pass every room, it has
failed to teach Tear.

### Revisitable practice and contextual objectives

Dead Cells' official
[Training Room](https://dead-cells.com/patchnotes/25) lets players revisit
enemies and bosses they have encountered. Hades has shipped
[weapon-specific Courtyard objectives](https://www.supergiantgames.com/blog/hades-the-nighty-night-update-patch-notes/).
These support separating two experiences:

- a finite first-time Cutting Room that teaches baseline play;
- a revisitable practice lab for enemies, bosses, weapons, and advanced
  technique drills.

Do not make the mandatory first tutorial carry every future training need.

### Objective clarity and accessibility

[Xbox Accessibility Guideline 109](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/109)
recommends clear, reviewable objectives and visible progress. The Xbox
[additional sensory channels guideline](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103)
supports expressing critical information through more than one sensory channel.

For Tear this means:

- the current objective is always reviewable;
- glyphs reflect the active remap and controller family;
- direction is communicated with shape and motion, not hue alone;
- critical timing has visual, audio, and optional haptic expression;
- reduced-motion mode removes spectacle, not gameplay information;
- assistance is offered explicitly instead of silently changing rules.

## Non-negotiable product contracts

### 1. Baseline power only

No shop, draft, boon, relic, currency purchase, free upgrade, sample modifier,
or hidden damage boost exists in the tutorial.

- Tutorial run state begins with zero applied upgrades.
- Tutorial completion cannot mutate owned upgrades, currency, draft history,
  rerolls, or reserves.
- Every required objective is possible with authored baseline values.
- Assistance may widen timing or reset faster, but cannot secretly add damage.
- The real shop and draft are introduced contextually in the first campaign run.

This keeps the tutorial straightforward and proves that the player understands
the actual baseline combat grammar.

### 2. The stage changes for the task

The Cutting Room is one impossible paper space that tears, folds, and rebuilds
itself into focused action blocks. Each change must:

- occur only after a checkpoint is sealed;
- validate destination geometry before moving actors;
- move player, blade, targets, camera, and hazards as one transaction;
- clear stale projectiles and technique-local cooldowns;
- preserve no objective evidence from the previous block;
- roll back safely if any required spawn or platform is invalid.

### 3. Production physics are the truth

The tutorial cannot teach with a kinematic ghost that performs motions the real
player controller or blade cannot reproduce. Gold demonstrations must be
recorded through production input, simulation, collision, and weapon rules.

### 4. Movement is the spine

Movement is not a three-card prelude before the combat tutorial. Every later
block should re-test locomotion:

- cuts are made while entering or leaving space;
- launches require repositioning to follow the target;
- slams begin from deliberate elevation;
- throws create a temporary movement objective around the tether;
- parries can be answered by interception or movement;
- mixed combat punishes standing still without instantly killing the learner.

### 5. Required success is robust, optional mastery is aspirational

The mandatory tutorial proves readiness. It does not demand speedrunner
execution. Advanced medals, optimal lines, perfect parries, and long juggles are
optional and replayable.

## Mastery model: replace raw repetition

Core movement and blade-movement skills use four gates:

| Gate | Purpose | Typical evidence |
| --- | --- | --- |
| Introduce | Understand cause and effect | 1 clean success in isolation |
| Stabilize | Show the success was not accidental | 2 consecutive successes |
| Vary | Reproduce under changed direction, height, or target | 2 varied successes |
| Transfer | Select and use the skill without a recipe | 1 mixed encounter success |

That produces approximately six meaningful executions for central verbs, but
the count is a consequence of different problems, not a visible grind counter.

Utility or recognition skills use a lighter ladder:

- introduce once;
- vary once;
- recognize or apply once in the final exam.

### Streak rules

- Consecutive success is local to a drill and resets only on a meaningful
  failure, not on harmless waiting.
- Repeating the identical low-risk action after mastery provides no additional
  required progress.
- A varied success must change at least one authored dimension: direction,
  elevation, spacing, timing, target behavior, or preceding action.
- Transfer credit comes from semantic outcomes, never from replaying an exact
  button macro.
- Equivalent safe solutions are accepted in decision drills. Technique drills
  may require one specific verb because their purpose is mechanical literacy.

## Cutting Room 2.0 curriculum

The experience is organized into three acts and nine action blocks. A first
completion target of 8 to 12 minutes is preferable to a 20-minute lecture.
Advanced annexes remain optional.

## Act I: Own your motion

### Block 0: Calibration

**Question:** Does the current input setup feel controllable?

The room is a quiet circular blade guide with no enemy and no fail state.

- Detect the last meaningful input device.
- Show live keyboard, controller, or touch glyphs.
- Let the player move the blade through broad horizontal, vertical, and diagonal
  arcs.
- Preview sensitivity, aim assist, contrast, reduced motion, and hold/toggle
  options without leaving the room.
- Confirm that remapped actions are represented by the same glyph resolver used
  everywhere else.

Calibration is advisory and never blocks progression.

### Block 1: Build speed

**Question:** Can the player deliberately accelerate, stop, reverse, and land?

The circle tears into a long paper strip:

1. Cross a left gate and a right gate to prove direction.
2. Stop inside a narrow calm zone to prove braking, not just movement.
3. Jump onto a broad shelf.
4. Land inside a marked zone.
5. Drop through a one-way ledge to the exit.

Mastery:

- Introduce: cross one gate in each direction.
- Stabilize: land twice without walking off the target.
- Vary: drop through from a different horizontal position.
- Transfer: reverse direction and land on the opposite shelf without a prompt.

The point is control of momentum, including removing momentum.

### Block 2: Commit and recover

**Question:** Can the player use dash as a directed movement tool and recover
into another action?

The strip folds into staggered gates:

1. Dash horizontally through a closing seam.
2. Dash in the opposite direction.
3. Steer a diagonal dash around a blocker.
4. Dash, then jump or air-correct into a landing zone.
5. Miss safely once and recover to the route.

Teach dash charges and readiness here, not in a tooltip later. The HUD briefly
isolates the dash indicator, then returns to normal.

Transfer challenge: reach a high exit with any valid dash-jump route.

## Act II: Turn motion into offense

### Block 3: Speed is damage

**Question:** Can the player create a clean cut while moving?

The stage compresses into a cutting bay:

- A stationary paper target displays `crease`, `clean`, or `fierce`.
- A short path ribbon shows blade trajectory and speed at contact.
- The first target permits stationary experimentation.
- The second target passes across the lane and must be cut while the player is
  moving.
- A slow poke gives explicit low-energy feedback instead of silent failure.

Mastery:

- 1 clean cut in isolation;
- 2 clean cuts in opposite directions;
- 2 moving cuts from different approach directions;
- 1 unprompted cut while traversing the exit.

This is the first explicit statement of Tear's combat thesis.

### Block 4: Carry the fight upward

**Question:** Can the player launch, chase, and continue a target's motion?

The ceiling peels open above a weighted dummy:

1. Launch through a low hanging seal.
2. Reposition under or beside the airborne dummy.
3. Land two controlled airborne hits before it settles.
4. Repeat from the opposite side.
5. Use launch or an equivalent chase route in a short mixed target pass.

The first launch briefly visualizes upward impulse. After that, the effect must
remain readable through normal animation, sound, and target motion.

### Block 5: Shape vertical momentum

**Question:** Can the player deliberately choose ordinary slam, power slam, or
updraft based on vertical state?

The room becomes three related shelves:

- **Low seal:** jump and ordinary down-cut.
- **Deep seal:** establish descent, down-dash, then down-cut for power slam.
- **High seal:** rise and sweep upward for updraft.

These are presented together so their contrast is visible:

- ordinary slam = airborne + downward blade velocity;
- power slam = committed fast descent + downward strike;
- updraft = rising player + upward launch.

Mastery:

- introduce each once;
- repeat each from a changed side or height;
- complete a three-seal sequence in any order;
- use one vertical technique in the final mixed block.

The stage must never count a technique before its seal becomes active. This is
the architectural version of the Version 1 counter-leak fix.

### Block 6: Let go, stay connected

**Question:** Does the player understand throw, hit, tether range, and recall?

A paper wall separates player and switch:

1. Aim from the blade, not merely the character center.
2. Throw through a broad target.
3. Observe the tether/range indication.
4. Move back into recall range if the blade is too far away.
5. Recall through a second ribbon.
6. Catch the blade and continue moving.

The required objective is `throw hit + successful recall`, but the room teaches
why movement matters between those events. A missed throw remains recoverable:
the route to the embedded blade is always open and the objective text explains
the tether rather than falsely implying unlimited recall.

## Act III: Read and survive a fight

### Block 7: Answer a threat

**Question:** Can the player read intent and choose a safe response?

The wall tears sideways into a high-contrast projectile lane:

- First projectile: slow, fixed cadence, no contact damage.
- Accept a normal deflect as required success.
- Show perfect parry timing as optional mastery.
- Vary projectile height and origin.
- Offer movement over/under the shot as an explicitly valid defensive answer
  in the decision phase.

Then introduce one charger:

- show wind-up;
- show committed path;
- let the player avoid it;
- highlight recovery;
- let the player punish recovery.

Finally introduce one armored target:

- demonstrate weak ground contact;
- let launch or space creation expose a better answer;
- teach "not every contact is useful" without requiring a damage spreadsheet.

Required evidence:

- avoid one committed attack;
- punish one recovery;
- answer one projectile with blade or movement;
- preserve enough space to avoid being cornered.

### Block 8: The Cut, a miniature run

**Question:** Can the player select and combine skills without instructions?

All prior folds reopen into a compact campaign-like arena:

- `WAVE 1`: one charger;
- short inter-wave breath;
- `WAVE 2`: one ranged enemy plus terrain change;
- `FINAL WAVE`: a light elite or mixed pair with a boss-style danger banner.

No shop or draft appears. No new technique card appears unless the player
stalls. The encounter records, but does not prescribe:

- continuous purposeful movement;
- a recovery after a miss or bad position;
- one vertical conversion;
- one throw/recall or equivalent spacing action;
- one projectile response;
- use of at least two elevations;
- avoidance of a readable committed attack.

Completion opens the campaign door immediately. The summary names techniques
the player used and offers optional practice for ones they did not use. It does
not shame the player or block completion for creative safe play.

One line explains the real run:

> Clear waves, shape a build when choices appear, read the boss, and keep your
> motion alive.

## What else the player should learn

The current legacy cards omit several concepts required for actual play.
Version 2 should teach or deliberately defer each one:

| Concept | Tutorial treatment |
| --- | --- |
| Momentum control | Core Act I and re-tested in every act |
| Speed creates blade damage | Explicit Block 3 cause-and-effect |
| Movement creates defense | Blocks 2, 7, and final exam |
| Recovery after a miss | Required safe recovery in Blocks 2 and 8 |
| Dash charges/readiness | Isolated HUD callout in Block 2 |
| One-way platforms/drop-through | Physical route in Block 1 |
| Launch chase and air correction | Block 4 |
| Vertical-state contrast | Unified Block 5 |
| Throw range and blade recovery | Block 6 |
| Enemy telegraph grammar | Block 7 |
| Armor or low-value contact | Block 7 |
| Health loss and invulnerability | One disclosed, nonlethal example in Block 7 |
| Style meter | Introduced as feedback for varied, moving play, not farming |
| Wave/inter-wave cadence | Block 8 |
| Boss danger language | Preview banner and safe-zone cue, not a fake full boss |
| Death/retry expectations | Short pre-exam statement and instant room restart |
| Draft/shop/build shaping | Deferred to the first real campaign screen |
| Weapon-specific mechanics | Optional revisitable annex after baseline tutorial |
| Boss-specific practice | Separate practice lab after encountering that boss |

## Ghost 2.0: a movement coach, not scenery

The current hand-authored ghost is renderer-neutral and deterministic, but it is
kinematic and visually shallow. It demonstrates a rough pose, not the timing,
momentum, contact, or recovery a player needs.

### Three ghost modes

#### Preview ghost

- Plays once before a new complex technique.
- Uses a short production-physics gold trace.
- Shows the whole player, blade, target response, and stage interaction.
- Synchronizes input glyph pulses to the exact simulation tick.
- Fades immediately when the player begins.

#### Diagnostic ghost

- Appears only after a diagnosed error or explicit help request.
- Replays the smallest relevant segment, not the entire solution.
- Highlights the failed dimension: approach speed, player vertical state, blade
  path, contact time, or recovery route.
- Can play at 1.0x and 0.5x without changing gameplay time.

#### Comparative ghost

- Optional after the player has made a valid attempt.
- Overlays the player's best recent attempt against the gold path.
- Uses distinct line shape and opacity, not color alone.
- Shows only a few landmarks: takeoff, dash start, contact, apex, landing.

### Truth contract

Gold ghosts are:

- captured through production semantic input;
- replayed through production movement, blade, collision, and target rules;
- tied to a tutorial definition version, weapon, and simulation version;
- invalidated when physics changes outside tolerance;
- verified by a deterministic scenario in CI.

No ghost may teleport, ignore a wall, exceed actual acceleration, hit through an
invalid collision, or use upgrades absent from the lesson.

### Visual language

The ghost can render:

- silhouette for body position;
- blade ribbon for trajectory and contact speed;
- sparse velocity arrow at key moments;
- landing/contact rings;
- synchronized adaptive glyphs;
- target echo showing expected impulse;
- one-word diagnosis such as `EARLIER`, `FASTER`, `WHILE RISING`, or `RECOVER`.

Avoid constant afterimages, dense vector fields, or paragraphs during motion.
Reduced-motion mode replaces trails with discrete poses and timing markers.

### Failure diagnosis

The coach should classify outcomes, not merely count attempts:

- no input detected;
- correct input, wrong position;
- correct direction, insufficient speed;
- correct strike, wrong player vertical state;
- target missed;
- action too early/late;
- blade unavailable or outside recall range;
- player trapped or target unreachable;
- solution succeeded but transfer objective not yet varied.

Help is based on the diagnosis. "Try again" is not coaching.

## Adaptive coaching

Every drill has a visible help ladder:

1. **Nudge:** after two related failures, highlight the relevant geometry or
   restate the physical outcome in one sentence.
2. **Demonstrate:** after four related failures, play the diagnostic ghost once.
3. **Practice assist:** after six related failures, offer a disclosed wider
   timing window, slower projectile, clearer target, or checkpoint advance.
4. **Skip:** always available from the objective details; skipped advanced
   drills remain available in Practice.

Do not trigger help while the player is exploring, changing settings, or making
measurable progress. Failure counts decay after success and are local to the
drill variant.

## Tutorial HUD and style-meter relationship

Version 1 uses the repaired responsive card. Version 2 uses a smaller objective
rail with explicit exclusion zones.

### Objective rail

- Default: compact current verb, one-sentence outcome, and progress marks.
- Expanded: adaptive controls, technique explanation, restart, help, and skip.
- Placement chooses from authored HUD docks based on occupied lanes.
- It never covers health, dash readiness, style, boss health, captions, or
  touch controls.
- At narrow viewports it becomes a bottom-safe or below-meter strip.
- Long localized text wraps within a measured safe rectangle.

### Style meter teaching

Before Block 3, style can remain visually quiet so it does not compete with
basic locomotion. Block 3 intentionally introduces it:

- highlight the meter once after a moving clean cut;
- explain that variety, danger, and motion build style;
- show decay when inactive without forcing the player to farm;
- return it to normal HUD behavior after the callout.

The tutorial objective and style meter become coordinated teaching elements,
not two unrelated overlays fighting for the same pixels.

## Stage architecture

Each action block is a typed definition:

```ts
interface TutorialBlockDefinition {
  readonly id: TutorialBlockId;
  readonly act: "motion" | "blade" | "fight";
  readonly arena: TutorialArenaDefinition;
  readonly objectives: readonly TutorialObjectiveDefinition[];
  readonly variants: readonly TutorialVariantDefinition[];
  readonly goldGhosts: readonly TutorialGhostReference[];
  readonly coaching: TutorialCoachingDefinition;
  readonly entryCheckpoint: TutorialCheckpointDefinition;
  readonly exitPolicy: TutorialExitPolicy;
}
```

### Objective semantics

An objective owns:

The shipped Cutting Room now additionally includes:

- [x] Add enemy-language training and a baseline-only mixed encounter with
  actual Charger `commit`/`recover` evidence plus a ranged response.
- [x] Hand off immediately to the no-wave practice arena after course completion.
- [ ] Add explicit wave cadence, a technique summary, and a post-completion
  practice selector.
- Add contextual first-run campaign onboarding for the real draft/shop screens;
  keep them absent from the tutorial.
- Retire version 1 only after completion and abandonment metrics meet targets.

- activation tick;
- accepted semantic outcomes;
- counters or streaks;
- variant identity;
- failure classifiers;
- reset policy;
- accepted equivalents;
- progress projection;
- help escalation;
- completion and optional mastery status.

Only evidence after activation can progress it.

### Transition transaction

A stage transition follows:

`seal checkpoint -> suspend scoring -> validate arena -> clear local hazards -> recover blade -> place actors -> install geometry -> settle one tick -> restore input -> activate objective`

If validation fails, restore the sealed checkpoint and show a recoverable error.
Never leave a half-installed stage.

### State ownership

- Gameplay owns objective and coaching state.
- Runtime ports execute spawn, recover, transition, checkpoint, and navigation
  intents.
- Presentation consumes snapshots and emits no progression mutations.
- Input prompts resolve semantic actions through shared input/glyph services.
- Campaign combat values remain outside tutorial definitions.

## Practice Lab after first completion

The finite tutorial should unlock a separate revisitable Practice Lab:

- replay any completed action block;
- select baseline weapon;
- practice optional mastery medals;
- spawn previously encountered normal enemies;
- practice previously encountered bosses by phase;
- compare personal and gold ghosts;
- turn coaching overlays on or off;
- reset instantly without profile or currency effects.

Weapon-specific annexes belong here:

- sword cut and launch precision;
- hammer committed slam timing;
- spear line, embed, and reel behavior;
- chainblade latch/yank grammar;
- ringblade orbit/circuit control.

The annex is selected by semantic capability, not by duplicating the whole
tutorial for each weapon.

## Delivery plan

### T1: Stabilized Version 1

Current scope:

- lesson-local counter reset;
- true full-journey browser proof;
- dummy and technique recovery;
- adaptive glyph prompts;
- non-overlapping tutorial card;
- once-only completion credit.

Keep Version 1 available as a fallback until Version 2 meets every gate.

### T2: Framework and first movement act

- Add typed block, objective, variant, checkpoint, and coach definitions.
- Add transactional stage transitions.
- Add objective activation timestamps and lesson-local evidence ledger.
- Add objective rail with HUD occupancy layout.
- Implement Calibration, Build Speed, and Commit and Recover.
- Add keyboard/mouse, controller preset/glyph, and touch journeys.
- Add restart, leave, resume, and previously reached block selection.

### T3: Production ghost pipeline

- Define gold-trace capture metadata and simulation compatibility.
- Record baseline sword movement traces through semantic input.
- Add preview, diagnostic, and comparison snapshot models.
- Add reduced-motion and high-contrast render paths.
- Add CI verification that every required gold trace remains physically valid.

### T4: Blade-movement act

- Implement Speed is Damage, Carry the Fight Upward, Shape Vertical Momentum,
  and Let Go, Stay Connected.
- Add meaningful mastery variants and streak rules.
- Add failure diagnosis for speed, geometry, vertical state, and tether range.
- Verify every objective with zero upgrades and baseline values.

### T5: Fight literacy and final exam

- Implement projectile, charger, armor, health, and recovery teaching.
- Implement miniature wave cadence and mixed encounter.
- Add style-meter introduction and technique summary.
- Add immediate campaign handoff.
- Add first-campaign contextual draft/shop onboarding outside the tutorial.

### T6: Practice Lab and retirement decision

- Add revisitable blocks, enemy catalog, boss practice, and weapon annexes.
- Compare completion, abandonment, help, and first-run survival metrics.
- Retire Version 1 only when Version 2 is more reliable across input modes and
  accessibility configurations.

## Verification matrix

### Deterministic gameplay gates

- No objective receives evidence before its activation tick.
- POWER SLAM cannot inherit SLAM credit.
- LAUNCH cannot inherit CUT credit.
- Every block can restart 100 times without stale entities, projectiles,
  cooldowns, blade state, or score state.
- Every required target remains reachable or is recovered.
- Every required gold ghost completes through production simulation.
- Baseline completion succeeds with zero upgrades.
- The final exam accepts authored equivalent solutions.

### UI gates

- Objective rail and Version 1 card never overlap the style meter at supported
  logical widths.
- No overlap with health, boss bar, captions, touch zones, or safe-area insets.
- Every controller glyph updates with preset and glyph-family changes.
- Keyboard remaps and touch prompts update without restarting the tutorial.
- Long localized strings remain readable.
- High contrast does not rely on color alone.
- Reduced motion preserves all required timing information.

### Journey gates

- Fresh keyboard/mouse profile completes and receives one credit.
- Fresh controller profile completes using adaptive glyphs.
- Fresh touch profile completes without hidden keyboard assumptions.
- A struggling policy receives nudge, demonstration, and disclosed assistance.
- Exit/resume restores the current sealed block.
- Skip advanced returns a completable path.
- Completing or exiting never mutates currency, drafts, reserves, or upgrades.

### Failure and recovery gates

- Throwing beyond recall range remains recoverable.
- Losing the dummy off a platform remains recoverable.
- Pausing, opening settings, and returning does not reset or pre-complete work.
- Device switching mid-drill preserves objective evidence and changes prompts.
- Death or invalid placement restarts the local checkpoint, not the whole
  tutorial.
- Stage transition validation failure rolls back atomically.

## Measurement

Use the existing consented telemetry path and never identify individual players.

Track:

- time to first success by block and variant;
- meaningful attempts, not raw button presses;
- failure classification frequency;
- stabilize streak resets;
- variation and transfer success;
- help level reached and help accepted/declined;
- ghost replay requests and post-ghost improvement;
- restart, skip, exit, resume, and abandonment block;
- input mode and device-switch events;
- stale or mismatched glyph incidents;
- target/blade recovery events;
- stage-transition rollback events;
- final-exam techniques and elevations used;
- stationary time during combat blocks;
- first real-run mechanic use and survival after tutorial;
- any tutorial upgrade, currency, shop, or draft mutation, target zero;
- duplicate tutorial completion credit, target zero.

Success is not merely a higher completion rate. A good tutorial should improve:

- voluntary movement during the first real run;
- launch follow-up rate;
- recovery after misses;
- projectile response rate;
- understanding of recall range;
- survival against readable attacks;
- ability to combine techniques without an instruction card.

## Decisions locked before implementation

- The mandatory tutorial contains no shop or upgrades.
- The stage changes by task.
- Movement and momentum are the spine of every act.
- Core skills use introduce, stabilize, vary, and transfer gates.
- Gold ghosts use production physics.
- The objective UI respects shared HUD occupancy.
- Version 1 remains available until Version 2 is proven.

## Experiments, not assumptions

The following should be prototyped and playtested before locking:

- exact first-completion duration;
- whether six meaningful executions is right for every core verb;
- whether the style meter should be hidden or merely muted before Block 3;
- whether preview ghosts should play before the first attempt or only after one
  discovery attempt;
- whether the final exam needs two waves or three;
- which equivalent solutions are safe to accept in the final exam;
- how much slow-motion assistance helps without teaching false timing;
- whether personal-attempt comparison is useful to novices or belongs only in
  the Practice Lab.

The plan deliberately defines the learning outcome and verification contract
while leaving these experience variables open to evidence.
