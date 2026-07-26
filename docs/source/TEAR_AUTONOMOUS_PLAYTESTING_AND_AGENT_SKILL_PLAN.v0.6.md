# TearBench
## Autonomous Gameplay, Development Testing, and Agent Skill Architecture for *Tear*

**Status:** Living design document  
**Project:** `shaku1z/tear`  
**Initial version:** 2026-07-22  
**Current version:** 0.6 — Ghost 3.0 Universal Timeline Deepening and Compounding Memory Ecosystem  
**Document owner:** Tear project  
**Primary objective:** Build a perfect autonomous gameplay and development-testing platform for *Tear*, plus a first-class Ghost 3.0 universal timeline that preserves causal run truth, verifies records, powers practice and coaching, supports creators and community challenges, compounds regression knowledge, and future-proofs player journeys.

---

## 1. Executive Summary

Yes, *Tear* can be taught to play itself.

The strongest implementation is not merely a neural network that becomes good at the game. The real target is an autonomous testing platform made of several cooperating systems:

1. A deterministic simulation and testing API inside *Tear*.
2. Scripted gameplay agents that provide immediate testing value.
3. Human demonstration capture using the existing replay and ghost infrastructure.
4. Imitation-learning policies trained to reproduce real player behavior.
5. Reinforcement-learning policies optimized for competency, survival, style, speed, exploration, and exploit discovery.
6. A scenario system capable of launching exact combat, boss, movement, menu, and controller situations.
7. A regression runner that compares the same scenarios and seeds across branches.
8. Replay capture, state tracing, screenshot capture, and automatic reproduction minimization.
9. A reusable `tear-autonomous-playtester` agent Skill that allows Codex or another development agent to invoke, interpret, and act on the testing platform.
10. Tear State Forge, capable of exact snapshots, legal historical-run synthesis, arbitrary wave and boss-phase launch, time travel, and counterfactual forks.
11. A self-calibrating TearBot 1–9 ladder with multidimensional astuteness, human-like bounded rationality, statistical skill ratings, and an automated Agent Foundry that safely improves the policy population.
12. Ghost 3.0, a standalone replay, rivalry, coaching, verification, preservation, and run-intelligence platform that becomes the canonical memory layer for *Tear* rather than existing only as a TearBench recorder.

The autonomous testing project name is **TearBench**. **Ghost 3.0** is a sibling first-class subsystem with its own player-facing product mission, while still supplying TearBench with demonstrations, verified traces, checkpoints, and replay evidence.

The end-state vision is:

> A fleet of scripted and learned agents continuously plays *Tear*, searches for regressions and exploits, compares code changes against stable baselines, produces minimal deterministic reproductions, and gives development agents concrete evidence before work is considered complete.

This would surpass the original goal of “teaching agents how to play Tear.” It would become an automated gameplay QA, balancing, and development-validation platform purpose-built for the game.

The non-negotiable baseline now has two equally important halves. First, full player-journey autonomy: a visible agent must be able to start at the main menu, choose a mode and difficulty, begin a run, clear waves, select drafts, defeat bosses, finish finite modes, satisfy endurance contracts for infinite modes, process results, and return to the menu. Second, any-point autonomy: TearBench must be able to forge, validate, and launch any requested situation—such as Hard Endless wave 99 with the exact legal build history a real player would have earned—then let any calibrated bot level play from that state.

Ghost 3.0 is a third product pillar with an independent player-facing mission. It must preserve the causal truth of runs, power personal-best ghosts and asynchronous challenges, create evidence-backed coaching and replay-to-practice loops, support verified leaderboard records, recover crash context, preserve historic runs across versions, and provide a rich Vault and Theater even when TearBench is never invoked.

The v0.6 contract deepens that pillar into a universal timeline: Command, State, and Visual truth travel together through the Replay Trident; all derivative clips, drills, scenarios, agent corrections, regressions, and repaired files retain lineage; and Ghost Canon, Graveyard, Frontier, Corpus, Lenses, Studio, and Doctor turn replay data into a compounding product and engineering asset.

---

## 2. The Important Distinction: Gameplay Policy vs. Agent Skill

Two separate systems are required.

### 2.1 Gameplay policy

The gameplay policy is the component that physically plays the game. It receives observations about the current state and outputs actions.

Example inputs:

- Player position and velocity
- Player health and dash state
- Blade position, velocity, speed, and mode
- Enemy positions, types, states, and attack windups
- Projectile trajectories
- Platform geometry
- Hazards
- Current biome, wave, boss phase, score, style rank, and upgrades

Example outputs:

- Horizontal and vertical movement
- Jump
- Dash
- Throw or recall
- Tether state
- Blade aim position or aim vector
- Upgrade choice
- Menu navigation actions

The policy can be scripted, neural, random, search-based, or hybrid.

### 2.2 Agent Skill

The agent Skill does not directly learn the physics or perform every frame of gameplay through language-model reasoning.

The Skill tells a coding agent:

- When autonomous gameplay testing should be run
- Which scenarios apply to a code change
- Which TearBench command or tool to invoke
- What success thresholds must be met
- How to interpret failures
- How to inspect replays and state traces
- How to compare a feature branch against the baseline
- How to minimize and report a reproduction
- Which files and artifacts must be included in a development report

The Skill is the orchestration layer. TearBench is the executable testing platform underneath it.

This distinction is critical. A text-based coding agent should not attempt to improvise frame-perfect gameplay by visually inspecting screenshots and generating keyboard presses. That method would be slow, unreliable, expensive, nondeterministic, and difficult to debug.

---

## 3. Why Tear Is Already Well Positioned

*Tear* already contains several architectural seams that make autonomous gameplay substantially easier than it would be in most browser games.

### 3.1 Synthetic player control already exists

`Player.update()` can consume a synthetic input object through `player.aiInput` instead of reading only from the global player input system.

Current pattern in `js/player.js`:

```js
const IN = this.aiInput || Input;
```

The attract-mode implementation already creates a synthetic controller and assigns it to the player. It can control:

- Left and right movement
- Up and down state
- Jump edges
- Dash edges
- Real player physics
- Real blade physics through an aim override

This means *Tear* already has the beginning of an environment-control interface.

### 3.2 Programmatic blade aiming already exists

The attract-mode system creates a real `Blade` and controls it through `blade.aimOverride`.

That is a major advantage because the defining mechanic of *Tear* is continuous blade control. A future policy can output an aim vector or normalized target position without needing to emulate operating-system mouse movement.

### 3.3 A functional scripted bot already exists

`js/attract.js` already demonstrates:

- Target selection
- Pursuit behavior
- Jumping toward airborne targets
- Gap-closing dashes
- Projectile avoidance
- Deliberate blade slashes rather than constant spinning
- Real player and blade updates

The current attract bot is not yet a production playtester because it fights lightweight bespoke actors rather than the complete live combat environment. However, it proves the key control architecture works.

### 3.4 Ghost 2.0 already records useful gameplay state and is the migration foundation for Ghost 3.0

The current ghost system records:

- Player position
- Blade-tip position
- Facing direction
- Enemy spawns
- Enemy position samples
- Enemy deaths
- Biome changes
- Wave starts and clears
- Boss events
- Combat events such as parries and power slams
- Upgrade and loadout choices

Player state is sampled at 10 Hz. Enemy state is sampled at 4 Hz.

This is a strong foundation for training-data capture and deterministic failure review.

Ghost 3.0 expands this foundation far beyond TearBench. It becomes a portable run-capsule format, deterministic and hybrid replay engine, player career archive, asynchronous rivalry system, coaching surface, verified competitive record, crash-recovery journal, and long-term preservation layer. The complete product architecture is specified in Sections 65–79.

### 3.5 Input concepts are already structured

The input layer represents actions as explicit game concepts rather than raw browser events:

- Directional input
- Jump edge
- Dash edge
- Throw or recall edge
- Tether hold
- Blade aim
- Menu click and scrolling
- Touch and gamepad mappings

That makes the action space easier to expose to both scripted and neural agents.

### 3.6 The main limitation

Most game state is currently enclosed inside the `js/game.js` immediately invoked function expression. Important variables such as the player, blade, enemies, projectiles, platforms, current state, run state, and stage are private to the closure.

The first major engineering task is therefore not machine learning. It is exposing a clean, development-only simulation and testing bridge from inside that closure.

---

## 4. Target System: TearBench

TearBench should be treated as a first-class development subsystem, not a one-off bot.

### 4.1 Core capabilities

TearBench should eventually support:

- Deterministic scenario launch
- Seeded random number generation
- Fixed-step simulation
- Rendering-disabled fast simulation
- Audio-disabled test execution
- Cloud and platform integration disablement
- Synthetic gameplay input
- Direct game-state observation
- Scenario mutation
- Multi-policy execution
- Branch-to-branch comparison
- Replay and trace capture
- Screenshot and video evidence
- Runtime invariant checking
- Performance capture
- Failure clustering
- Minimal reproduction generation
- CI integration
- Agent Skill integration

### 4.2 Design principles

1. **Determinism first.** Every important failure must be replayable from a seed and action trace.
2. **Structured state before pixels.** Policies should initially read game state directly rather than interpreting screenshots.
3. **Scripted agents before neural agents.** Immediate QA value should arrive before model training begins.
4. **Multiple specialized agents.** One “best” player will not cover the entire bug surface.
5. **Evidence over pass/fail.** Every failure should contain state, replay, seed, metrics, and reproduction details.
6. **Headless scalability.** The long-term simulation core should run without a browser renderer.
7. **Production isolation.** Test hooks must not affect normal players, leaderboards, saves, cloud synchronization, or public builds.
8. **Incremental adoption.** Every phase must create useful testing value independently.

---

## 5. The Deterministic Tear Test API

A development-only API should be exposed from inside `js/game.js`.

Recommended global name:

```js
window.TEAR_TEST
```

The API should only exist when an explicit test flag is enabled, for example:

```text
?tearTest=1
```

or through a build-time constant.

### 5.1 Proposed interface

```js
window.TEAR_TEST = {
  version,

  reset(options),
  observe(options),
  step(action, frameCount),
  runActionBatch(batch),

  listScenarios(),
  loadScenario(id, options),
  mutateScenario(id, mutation),

  captureState(options),
  restoreState(snapshot, options),
  forgeState(spec),
  validateState(snapshot, options),
  synthesizeProgression(options),
  generateHistoricalRun(options),
  forkState(snapshot, variants),

  setSeed(seed),
  getSeed(),
  setSimulationSpeed(multiplier),
  setRenderingEnabled(enabled),
  setAudioEnabled(enabled),

  getMetrics(),
  getInvariantFailures(),
  getConsoleEvents(),

  startTrace(options),
  stopTrace(),
  exportTrace(),

  captureReplay(),
  captureScreenshot(),
  captureStateSnapshot(),

  pause(),
  resume(),
  terminate(reason)
};
```

### 5.2 Reset contract

```js
const result = TEAR_TEST.reset({
  scenario: "projectile-parry-basic",
  seed: 882901,
  difficulty: "normal",
  policyProfile: "default",
  render: false,
  audio: false,
  cloud: false,
  fixedDt: 1 / 60
});
```

Return value:

```js
{
  observation,
  scenario,
  seed,
  metadata
}
```

### 5.3 Step contract

The API should follow the conceptual structure used by established reinforcement-learning environments:

```js
const transition = TEAR_TEST.step(action, 3);
```

Return value:

```js
{
  observation,
  reward,
  rewardComponents,
  terminated,
  truncated,
  info
}
```

Definitions:

- `terminated`: The episode reached a natural terminal state such as death, victory, wave completion, or boss defeat.
- `truncated`: The episode ended because of a time, action, safety, or test budget limit.
- `info`: Debugging data that should not be required for policy learning.

### 5.4 Batched actions

A browser bridge should not require one cross-process call for every simulation frame.

Recommended batch format:

```js
TEAR_TEST.runActionBatch([
  {
    action: {
      moveX: 1,
      moveY: 0,
      jump: false,
      dash: false,
      throwRecall: false,
      tether: false,
      aimX: 0.72,
      aimY: -0.31
    },
    frames: 3
  },
  {
    action: {
      moveX: 1,
      moveY: -1,
      jump: true,
      dash: true,
      throwRecall: false,
      tether: false,
      aimX: -0.15,
      aimY: -0.98
    },
    frames: 2
  }
]);
```

This lowers browser automation overhead and makes deterministic traces smaller.

---

## 6. Observation Space

The first learned policies should receive structured observations rather than screenshots.

### 6.1 Proposed observation shape

```js
{
  tick: 4812,
  time: 80.2,
  seed: 882901,

  player: {
    x,
    y,
    vx,
    vy,
    hp,
    maxHp,
    hpRatio,
    facing,
    onGround,
    airTime,
    iframe,
    dashTimer,
    dashCooldown,
    dashCharges,
    maxDashCharges,
    rootTime,
    slowMultiplier,
    shield,
    guardTime,
    lastTrick,
    lastTrickAge
  },

  blade: {
    handX,
    handY,
    tipX,
    tipY,
    relativeTipX,
    relativeTipY,
    velocityX,
    velocityY,
    tipSpeed,
    state,
    hostile,
    tethered,
    thrown,
    returning,
    stolen
  },

  enemies: [
    {
      id,
      type,
      variant,
      bossId,
      bossPhase,
      relativeX,
      relativeY,
      vx,
      vy,
      hpRatio,
      radius,
      state,
      stateTime,
      attackWindup,
      stunned,
      armored,
      shielded,
      airborne,
      targetDistance,
      threatScore
    }
  ],

  projectiles: [
    {
      id,
      type,
      relativeX,
      relativeY,
      vx,
      vy,
      speed,
      hostile,
      parryable,
      deflected,
      timeToPlayer,
      threatScore
    }
  ],

  platforms: [
    {
      relativeX,
      relativeY,
      width,
      height,
      oneWay,
      floor,
      broken,
      moving
    }
  ],

  hazards: [
    {
      type,
      relativeX,
      relativeY,
      radius,
      remainingLife,
      damage,
      movementModifier
    }
  ],

  run: {
    mode,
    difficulty,
    biome,
    stageIndex,
    wave,
    waveActive,
    bossActive,
    score,
    styleRank,
    multiplier,
    kills,
    elapsed,
    loadout
  },

  availableActions: {
    canJump,
    canDash,
    canThrow,
    canRecall,
    canTether,
    menuOpen
  }
}
```

### 6.2 Normalization

For machine learning, values should generally be normalized:

- Positions relative to player or arena center
- Coordinates divided by arena dimensions
- Velocities divided by known maximum or expected ranges
- Timers clamped to a fixed range
- Health represented as ratios
- Enemies sorted by threat, distance, or relevance
- Projectiles sorted by time-to-impact

Initial fixed limits could be:

- 12 nearest or highest-threat enemies
- 16 highest-threat projectiles
- 12 nearby platforms
- 8 nearby hazards

Missing entries should be padded and accompanied by masks.

### 6.3 Why structured observations should come first

Structured state provides:

- Faster training
- Lower compute cost
- Easier debugging
- Better determinism
- Clearer policy interpretation
- Less sensitivity to rendering changes
- No dependence on resolution, shaders, particles, camera shake, or UI layout

Pixel observations can be added later for visual QA or for testing whether the game communicates threats clearly to a human-like visual system.

---

## 7. Action Space

### 7.1 Continuous and discrete hybrid action

Recommended action representation:

```js
{
  moveX: -1 | 0 | 1,
  moveY: -1 | 0 | 1,

  jump: boolean,
  dash: boolean,
  throwRecall: boolean,
  tether: boolean,
  pause: boolean,

  aimX: number,
  aimY: number,

  menuX: -1 | 0 | 1,
  menuY: -1 | 0 | 1,
  menuConfirm: boolean,
  menuBack: boolean,
  menuTabLeft: boolean,
  menuTabRight: boolean,
  menuScroll: number
}
```

`aimX` and `aimY` should initially represent a normalized direction from the player or hand position. This avoids policies learning absolute screen coordinates.

### 7.2 Action frequency

Recommended initial policy frequency:

- Game simulation: 60 Hz fixed timestep
- Policy decisions: 20 Hz or 30 Hz
- Action repeat: 2–3 simulation frames

This retains responsive blade control without making training unnecessarily expensive.

### 7.3 Exact input recording

Ghost 3.0 or a separate training recorder should add a synchronized action track containing:

```text
moveX
moveY
jumpPressed
jumpHeld
dashPressed
throwRecallPressed
tetherHeld
bladeAimX
bladeAimY
menu inputs
active input device
```

The current ghost system records resulting positions and events, but imitation learning requires the causal actions as well.

---

## 8. Deterministic Simulation

Determinism is the foundation of credible autonomous testing.

### 8.1 Required changes

- Replace gameplay-critical `Math.random()` usage with a seeded random source.
- Preserve a normal nondeterministic production source outside test mode.
- Use a fixed simulation timestep.
- Allow simulation to advance without `requestAnimationFrame`.
- Disable or mock audio.
- Disable cloud saves and platform APIs.
- Prevent test runs from affecting achievements, shards, progression, leaderboards, or analytics.
- Record the exact game build, commit, config hash, and scenario version in every artifact.

### 8.2 Seeded random service

Recommended interface:

```js
const RNG = {
  setSeed(seed),
  getSeed(),
  next(),
  range(min, max),
  int(min, max),
  chance(probability),
  pick(array),
  fork(label)
};
```

Forked streams are valuable because changing particle randomness should not alter enemy spawn behavior. Separate streams could include:

- Combat
- Enemy AI
- Spawn generation
- Draft choices
- Cosmetic FX
- Audio variation
- Scenario mutation

### 8.3 Simulation modes

TearBench should support at least three execution modes.

#### Browser-realistic mode

- Full browser
- Rendering enabled
- Real input pipeline where required
- Used for visual QA, browser compatibility, pointer-lock behavior, and UI testing

#### Browser-fast mode

- Browser environment
- Rendering optionally disabled
- Audio and cloud disabled
- Batched simulation stepping
- Used for early deterministic gameplay testing

#### Headless-core mode

- Pure simulation module in Node.js or a worker process
- No DOM or canvas dependency
- Many parallel environments
- Used for large-scale training, fuzzing, and regression evaluation

The browser-fast mode should arrive first. Headless-core extraction is the long-term scalability move.

---

## 9. Scenario System

A scenario is a versioned, deterministic setup for a specific test objective.

### 9.1 Scenario schema

```json
{
  "id": "projectile-parry-basic",
  "version": 1,
  "description": "Tests whether a standard projectile can be parried and returned.",
  "stage": "the-grounds",
  "seed": 1001,
  "timeLimit": 12,
  "player": {
    "x": 640,
    "y": 590,
    "hp": 100,
    "upgrades": []
  },
  "enemies": [
    {
      "type": "ranged",
      "x": 980,
      "y": 590,
      "state": "ready",
      "fireDelay": 1.5
    }
  ],
  "assertions": [
    "projectile_spawned",
    "projectile_deflected",
    "player_not_damaged"
  ],
  "success": {
    "requiredEvents": ["deflect"],
    "maxDamageTaken": 0
  }
}
```

### 9.2 Initial scenario categories

#### Boot and lifecycle

- Game loads
- Menu renders
- New run starts
- Pause and resume
- Death screen
- Restart
- Campaign completion
- Service-worker-disabled test boot

#### Movement

- Run left and right
- Jump
- Coyote-time jump
- Buffered jump
- Drop through one-way platform
- Horizontal dash
- Upward dash
- Downward dash
- Curve dash
- Multi-dash upgrade
- Rooted movement restriction
- Slow-zone behavior

#### Blade mechanics

- Basic fast cut
- Low-speed non-hit
- Launch
- Air juggle
- Slam
- Power Slam
- Updraft
- Throw
- Recall
- Tether
- Blade stolen and recovered

#### Defense

- Projectile deflect
- Perfect parry
- Shield absorb
- Dash invulnerability
- Guard window
- Revive paths

#### Enemies

- One scenario per enemy type
- One scenario per variant
- Mixed enemy composition scenarios
- Large-wave stress scenarios
- Spawn-edge scenarios

#### Bosses

- Boss start
- Every phase transition
- Every signature attack
- Player death in each phase
- Boss death during phase transition
- Boss and add interactions
- Arena mutation and restoration

#### Biomes

- Platform accessibility
- Hazard behavior
- Biome-specific mechanic behavior
- Stage transition cleanup
- No lingering hazards between stages
- No stolen-blade state leaking across stages

#### Menus and input devices

- Keyboard navigation
- Mouse navigation
- Touch navigation
- Controller navigation
- Right-stick menu scrolling
- Shoulder-button tab switching
- Controller cursor hiding and restoration
- Pause-menu arsenal scrolling
- Rename screen behavior
- Settings persistence

#### Save and platform isolation

- Test runs cannot alter progression
- Test runs cannot submit scores
- Test runs cannot unlock achievements
- Test mode cannot invoke ads
- Cloud state is not mutated

---

## 10. Scripted Agents First

The first production-capable agent should be a heuristic controller built from the existing attract-mode logic.

This creates value before any model is trained.

### 10.1 Competency modules

The scripted bot should be split into modular systems.

#### Perception

- Select relevant enemies
- Rank threats
- Predict projectile impact
- Detect safe spaces
- Find reachable platforms
- Detect attack windups
- Recognize boss phases

#### Navigation

- Pursue target
- Maintain ideal combat distance
- Jump between platforms
- Drop through platforms
- Recover from arena edges
- Escape hazard zones
- Avoid being trapped

#### Combat

- Generate blade arcs with sufficient tip speed
- Select upward, horizontal, or downward strike
- Launch and juggle
- Use Power Slam
- Throw and recall
- Use tether
- Target enemy weak points

#### Defense

- Parry incoming projectiles
- Dash through attacks
- Reposition away from bombs or zones
- Preserve dash charges when safe
- Use defensive upgrades correctly

#### Strategy

- Select upgrades by policy profile
- Focus priority enemies
- Handle boss mechanics
- Switch between aggression and survival
- Avoid prolonged inactivity

### 10.2 Why the scripted bot matters after neural agents exist

The scripted agent remains useful as:

- A deterministic smoke tester
- A baseline policy
- A training-data generator
- A fallback policy
- An oracle for simple scenarios
- A comparison point for learned behavior
- A debugging reference when a neural policy regresses

---

## 11. Human Demonstration Capture

The user should be able to teach agents by playing normally.

### 11.1 Recorder requirements

Each demonstration episode should contain:

- Scenario or game mode
- Seed
- Game commit and data version
- Observation sequence
- Exact action sequence
- Reward and event sequence
- Input device
- Final outcome
- Score, wave, kills, damage, and style metrics
- Upgrade choices
- Replay and optional video
- Human-provided tags

### 11.2 Demonstration tags

Recommended tags:

```text
safe
aggressive
parry-heavy
aerial
throw-heavy
tether-heavy
speedrun
style-focused
boss-practice
recovery
challenge-run
controller
touch
keyboard-mouse
```

### 11.3 Recovery demonstrations are mandatory

A dataset containing only clean successful gameplay creates a policy that performs well only when it remains near the human demonstration distribution.

The recorder should intentionally collect:

- Recovery after missing a jump
- Recovery after taking damage
- Recovery after losing blade control
- Recovery from arena edges
- Recovery while rooted or slowed
- Recovery after a failed parry
- Recovery from unexpected enemy compositions
- Recovery during boss phase transitions

These examples teach robustness rather than imitation of ideal states only.

---

## 12. Imitation Learning

### 12.1 Behavior cloning

The first neural policy should use supervised behavior cloning:

```text
observation -> recorded human action
```

Recommended model components:

- MLP or small transformer for normalized global state
- Shared enemy encoder
- Shared projectile encoder
- Attention or pooling over variable entity sets
- Recurrent memory through GRU, LSTM, or temporal transformer
- Separate output heads for movement, button actions, and blade aim

### 12.2 Suggested model outputs

- Movement logits
- Jump probability
- Dash probability
- Throw or recall probability
- Tether probability
- Aim direction represented as normalized vector or angle
- Optional action-duration prediction
- Optional upgrade-selection head

### 12.3 DAgger-style correction loop

Behavior cloning alone can fail when the policy enters states not represented in the demonstration dataset.

Recommended correction workflow:

1. Train on human demonstrations.
2. Let the policy play deterministic scenarios.
3. Capture states where it fails, hesitates, loops, or behaves poorly.
4. Allow the user to take over or provide corrected actions.
5. Add those corrections to the dataset.
6. Retrain.
7. Repeat until recovery behavior becomes reliable.

This is the most direct way to teach the policy the user’s actual Tear playstyle.

### 12.4 Style conditioning

A single model could accept a style token:

```text
competent
safe
aggressive
stylish
parry
speedrun
explore
```

The same policy could then produce distinct behavior profiles while sharing core mechanical knowledge.

---

## 13. Reinforcement-Learning Fine-Tuning

Imitation learning should establish mechanical competence. Reinforcement learning should improve performance, robustness, exploration, and specialized behavior.

### 13.1 Curriculum

Recommended progression:

1. Flat-room movement
2. Jump and dash control
3. Blade-speed generation
4. Static dummy attacks
5. Moving enemy attacks
6. Launch and juggle
7. Slam and Power Slam
8. Projectile deflection
9. Perfect parry timing
10. Throw and recall
11. Mixed enemy waves
12. Platform-heavy combat
13. Individual boss mechanics
14. Full boss encounters
15. Full biomes
16. Full campaign
17. Randomized scenarios
18. Adversarial and mutation testing

### 13.2 Reward design

Do not train only on score. A score-only policy will search for scoring exploits, repetitive low-risk loops, or mechanics that inflate the score without representing intended play.

Recommended reward components:

```text
+ damage dealt
+ enemy killed
+ elite or priority enemy killed
+ wave cleared
+ boss phase cleared
+ boss defeated
+ successful deflect
+ perfect parry
+ launch
+ air juggle
+ slam
+ Power Slam
+ Updraft
+ throw hit
+ successful recall
+ tether utility
+ unique trick diversity
+ style-rank increase
+ multiplier maintenance
+ useful movement momentum
+ hazard escape
+ recovery from danger
+ survival time when under pressure

- damage taken
- death
- falling out of valid space
- inactivity
- repeated ineffective input
- repeated identical farming loop
- failure to progress
- invalid state
- softlock
- known exploit usage when training a normal player
```

### 13.3 Reward components must remain observable

Every component should be logged separately:

```js
{
  total: 3.42,
  components: {
    damage: 0.55,
    kill: 1.0,
    parry: 0.4,
    styleDiversity: 0.22,
    damageTaken: -0.35,
    inactivity: 0,
    progression: 1.6
  }
}
```

This makes reward hacking detectable.

### 13.4 Different agents need different rewards

The exploit hunter should not share the normal player’s reward function.

Examples:

- Competent player: completion and survival
- Style player: mechanic diversity and rank maintenance
- Speedrunner: completion time
- Survival player: sustained survival under pressure
- Chaos bot: state novelty and input diversity
- Exploit hunter: invariant violations, extreme values, rare state transitions, and reproducible anomalies

---

## 14. Agent Fleet

A single powerful policy will leave major blind spots. TearBench should maintain a fleet.

| Agent | Primary purpose |
|---|---|
| Smoke Bot | Confirms boot, run start, movement, basic attack, pause, and restart |
| Competent Player | Clears normal content consistently |
| Style Player | Exercises launches, juggles, slams, throws, parries, and combo systems |
| Survival Player | Tests defense, healing, shields, revives, and long encounters |
| Speedrunner | Pressures transitions, spawning, timers, and race conditions |
| Controller Bot | Uses gamepad semantics and validates menu/controller behavior |
| Touch Bot | Exercises mobile controls and touch-specific interaction |
| Menu Agent | Tests tabs, scrolling, confirmation, back behavior, and focus transitions |
| Chaos Bot | Produces unusual but valid combinations of inputs |
| Fuzzer | Mutates scenarios and action sequences |
| Exploit Hunter | Searches for infinite score, invulnerability, clipping, softlocks, and broken state |
| Visual QA Agent | Reviews screenshots, animation states, readability, and rendering differences |
| Performance Agent | Measures frame time, allocations, entity counts, and long-run degradation |

---

## 15. Invariant Testing

Learned agents answer “can something play this?” Invariants answer “is the game state valid?”

Both are required.

### 15.1 Example invariants

```text
player coordinates are finite
blade coordinates are finite
no entity velocity is NaN
player remains within legal horizontal arena bounds
player cannot remain beneath world bounds beyond rescue timeout
health never exceeds permitted maximum unless explicitly allowed
health never becomes negative
score never decreases unexpectedly
wave cannot clear while required enemies remain alive
boss phase index is valid
boss cannot become permanently invulnerable without a break condition
projectile ownership is valid
stolen blade must have a valid owner
stage transition clears stage-scoped hazards
temporary platforms cannot remain after their lifecycle
simulation cannot remain active with no progression for the softlock timeout
menu focus always points to an enabled element
pause must freeze gameplay state
replay timestamps must remain monotonic
```

### 15.2 Invariant severity

- `info`: Unusual but valid
- `warning`: Potential balance or presentation issue
- `error`: Gameplay defect
- `fatal`: Crash, corruption, NaN propagation, hard softlock, or irreversible invalid state

---

## 16. Automatic Failure Reproduction

This is one of the highest-value features in the entire proposal.

When a bot finds a failure, TearBench should save:

- Scenario ID and version
- Seed
- Game commit
- Config hash
- Policy and version
- Exact action trace
- Periodic state snapshots
- Event trace
- Console errors
- Invariant failures
- Replay
- Screenshot at failure
- Optional video around the failure
- Performance metrics

### 16.1 Reproduction artifact example

```text
Scenario: verdant-mid-platform
Scenario version: 4
Seed: 882901
Build: 3f11c2a
Policy: chaos-v7
Failure: player_out_of_bounds
First invalid tick: 1912
Trigger: downward dash while root timer expired during one-way-platform collision
Action trace: artifacts/failures/882901/actions.json
State trace: artifacts/failures/882901/states.jsonl
Replay: artifacts/failures/882901/replay.json
Screenshot: artifacts/failures/882901/failure.png
```

### 16.2 Delta-debugging minimizer

TearBench should automatically attempt to reduce the action trace:

1. Remove large contiguous action ranges.
2. Replay the test.
3. Keep the removal if the failure remains.
4. Continue with smaller ranges.
5. Simplify individual actions.
6. Reduce scenario entities or mutations where possible.
7. Produce the shortest stable reproduction.

Final report example:

```text
Original trace: 4,812 frames
Minimized trace: 43 simulation steps
Stable reproduction rate: 20/20
Root condition: down-dash collision during root expiration
```

This converts vague autonomous discoveries into engineering-ready bug reports.

---

## 17. Branch-to-Branch Behavioral Comparison

TearBench should execute identical scenarios, seeds, and policies against a baseline and candidate build.

Example:

```bash
tearbench compare main HEAD --suite combat-regression --episodes 100
```

### 17.1 Metrics to compare

- Completion rate
- Death rate
- Death causes
- Average wave reached
- Boss phase completion
- Damage dealt
- Damage received
- Enemy time-to-kill
- Fight duration
- Parry and perfect-parry rate
- Dash use
- Throw and recall use
- Trick diversity
- Style-rank distribution
- Score distribution
- Upgrade selection
- Stuck-state frequency
- Invariant violations
- Frame time
- Memory growth
- Replay divergence

### 17.2 Regression thresholds

Thresholds should be suite-specific.

Example:

```yaml
completion_rate_drop_max: 0.05
median_damage_taken_increase_max: 0.10
boss_phase_failure_increase_max: 0.03
fatal_invariants_allowed: 0
softlocks_allowed: 0
p95_frame_time_increase_max: 0.15
```

### 17.3 Replay divergence

For deterministic scripted policies, state trajectories can be compared directly.

Unexpected divergence can reveal:

- Physics changes
- Enemy timing changes
- Spawn changes
- Collision behavior changes
- RNG-order changes
- Balance changes

Divergence itself is not always a defect, but TearBench should identify the first meaningful divergence tick and summarize the state difference.

---

## 18. Scenario Mutation and Fuzzing

Mutation testing should vary conditions beyond normal handcrafted scenarios.

### 18.1 Mutation dimensions

- Enemy count
- Enemy composition
- Spawn positions
- Spawn timing
- Projectile speed
- Projectile count
- Boss health
- Boss phase timing
- Platform position
- Platform removal
- Hazard size
- Hazard lifetime
- Player health
- Player upgrades
- Dash charges
- Blade state
- Frame rate
- Graphics quality
- Pause timing
- Input device
- Window size and aspect ratio
- Touch safe-area insets

### 18.2 Coverage signals

TearBench should track coverage of gameplay states:

- Enemy states visited
- Boss attacks observed
- Boss phases reached
- Tricks performed
- Damage sources encountered
- Upgrade combinations exercised
- Menu states visited
- Stage transitions executed
- Rare event hooks triggered
- Invariant classes checked

This allows fuzzing to prioritize unvisited or under-tested behavior.

---

## 19. Visual QA

Structured gameplay agents are not sufficient for visual quality testing.

A visual QA layer should capture screenshots at stable scenario checkpoints and compare them against expectations.

### 19.1 Visual checks

- Missing entities
- Incorrect layering
- Broken particles
- Off-screen UI
- Overlapping text
- Controller prompts
- Touch controls and safe-area placement
- Boss telegraph visibility
- Hazard visibility
- Extreme graphics effects
- Incorrect stage palette
- Stage-transition artifacts
- Camera framing
- Fullscreen overscan
- Low, high, and future extreme graphics modes

### 19.2 Baseline strategy

Avoid brittle full-image pixel matching as the only method. Use a combination of:

- Perceptual image similarity
- Region-specific comparisons
- OCR or DOM checks for text where appropriate
- Explicit game-state assertions
- Agent or model review for major visual anomalies

Visual changes should be reviewable rather than automatically rejected unless the scenario is expected to be visually stable.

---

## 20. Performance Testing

TearBench can also become a performance laboratory.

### 20.1 Metrics

- Average frame time
- p95 and p99 frame time
- Long tasks
- Entity count
- Projectile count
- Particle count
- Memory usage
- Memory growth over time
- Garbage-collection pauses where observable
- Draw calls or render batches if the renderer evolves
- Shader compilation delays in future WebGL modes
- Input latency proxies

### 20.2 Performance scenarios

- Maximum normal wave density
- Stress enemy count
- Stress projectile count
- Particle-heavy Power Slam chain
- Boss with adds and hazards
- Extreme graphics mode
- Low-end graphics mode
- Long survival run
- Rapid stage transitions
- Pause and resume under load

---

## 21. Tear Autonomous Playtester Skill

Recommended Skill name:

```text
tear-autonomous-playtester
```

### 21.1 Skill mission

The Skill should allow a coding agent to validate gameplay-facing changes using TearBench before declaring work complete.

### 21.2 Skill responsibilities

- Detect which Tear systems were changed
- Select applicable suites and scenarios
- Build or launch the correct test environment
- Run smoke tests first
- Run focused deterministic scenarios
- Run branch comparisons when appropriate
- Inspect failed traces and replays
- Minimize failures
- Distinguish flaky infrastructure from real defects
- Report evidence, changed metrics, unresolved risks, and files touched

### 21.3 Proposed tools

```text
tear_list_scenarios
tear_describe_scenario
tear_run_smoke_suite
tear_run_suite
tear_run_scenario
tear_run_policy
tear_compare_branch
tear_fuzz_scenario
tear_get_metrics
tear_get_failure
tear_minimize_reproduction
tear_open_replay
tear_capture_visuals
tear_run_controller_suite
tear_run_touch_suite
tear_run_balance_suite
tear_run_performance_suite
```

### 21.4 Proposed CLI

```bash
tearbench doctor
tearbench build
tearbench list scenarios
tearbench list suites
tearbench test smoke
tearbench test movement
tearbench test projectile-parry-basic --episodes 25
tearbench test boss-rootbound-phase-2 --seed 882901
tearbench policy competent --scenario mixed-wave-04
tearbench compare main HEAD --suite combat-regression
tearbench fuzz verdant-sanctum --budget 500
tearbench minimize artifacts/failures/882901/failure.json
tearbench replay artifacts/failures/882901/replay.json
tearbench report artifacts/runs/latest
```

### 21.5 Example coding-agent workflow

Task:

> Implement the Rootbinder tether attack and validate it.

Skill-driven execution:

1. Identify affected systems: enemy behavior, tether state, player movement restrictions, blade interaction, controller behavior.
2. Run baseline smoke suite.
3. Run Rootbinder focused scenarios.
4. Run root-expiration collision scenarios.
5. Run controller and touch scenarios.
6. Execute 50 deterministic combat episodes using the competent and chaos agents.
7. Compare the candidate branch against `main`.
8. Inspect failures.
9. Minimize any reproducible failure.
10. Apply fixes.
11. Re-run the exact failing seeds.
12. Report results and remaining risks.

### 21.6 Skill report format

```markdown
## TearBench Validation

### Scope
- Enemy tether behavior
- Player root state
- One-way platform collision
- Controller input

### Suites
- smoke: passed
- rootbinder-focused: passed 24/24
- controller-combat: passed 18/18
- chaos mutation: 1 failure discovered and fixed

### Regression comparison
- Completion rate: -0.4%
- Damage taken: +1.2%
- Fatal invariants: 0
- Softlocks: 0

### Reproduction fixed
- Seed: 882901
- Failure: down-dash clipped through one-way platform as root expired
- Minimized from 4,812 frames to 43 steps

### Artifacts
- Replay
- State trace
- Comparison report
- Failure screenshot

### Remaining risk
- Mobile Safari performance not covered by the headless suite
```

---

## 22. Recommended Repository Structure

```text
js/
  game.js
  player.js
  blade.js
  input.js
  attract.js
  ghost.js
  seeded-rng.js
  test-bridge.js
  test-invariants.js

scenarios/
  schema.json
  boot/
  movement/
  blade/
  defense/
  enemies/
  bosses/
  biomes/
  menus/
  controller/
  touch/
  performance/

suites/
  smoke.yml
  movement.yml
  combat-regression.yml
  controller-regression.yml
  touch-regression.yml
  boss-regression.yml
  performance.yml

policies/
  scripted/
    smoke-policy.js
    competent-policy.js
    style-policy.js
    survival-policy.js
    chaos-policy.js
  neural/
    manifests/
    exported-models/

tools/tearbench/
  src/
    cli/
    runner/
      browser-runner.ts
      headless-runner.ts
    bridge/
    scenarios/
    policies/
    metrics/
    invariants/
    comparison/
    minimizer/
    artifacts/
    reporting/
  package.json
  tsconfig.json

ml/
  pyproject.toml
  tear_env.py
  dataset.py
  models.py
  train_bc.py
  train_ppo.py
  evaluate.py
  export_onnx.py
  notebooks/

skills/
  tear-autonomous-playtester/
    SKILL.md
    references/
      architecture.md
      scenarios.md
      metrics.md
      failure-triage.md
    scripts/

.github/workflows/
  tear-agent-smoke.yml
  tear-agent-regression.yml
  tear-agent-exploration.yml
```

---

## 23. Training and Deployment Stack

### 23.1 Training

Recommended training environment:

- Python
- PyTorch
- Gymnasium-compatible wrapper
- Stable-Baselines3 for early PPO experiments or a custom implementation when the action structure becomes complex
- Imitation-learning tooling for behavior cloning and DAgger-style workflows
- Parallel environment workers
- Dataset versioning
- Experiment tracking

### 23.2 Inference during development

The simplest initial approach is external inference:

- Tear simulation runs in browser-fast or headless-core mode.
- Python or Node policy process receives observations.
- Policy returns actions.
- TearBench records transitions and metrics.

### 23.3 In-game inference

If a trained policy is later used inside the public game for:

- Improved attract mode
- Training ghosts
- AI rivals
- Demonstration mode
- Adaptive tutorials
- Developer debug mode

then export the model to ONNX or another web-compatible format and run inference locally.

Training should not happen inside the browser.

---

## 24. Phased Implementation Roadmap

## Phase 0 — Architecture lock

**Goal:** Finalize naming, boundaries, and production-isolation rules.

Deliverables:

- TearBench architecture document
- Test-mode security and isolation rules
- Initial observation and action schemas
- Scenario schema
- Artifact schema
- Definition of deterministic gameplay-critical randomness

Exit criteria:

- No unresolved ownership questions
- No test hooks that can affect production saves or score systems

---

## Phase 1 — Test bridge and fixed stepping

**Goal:** Make the real game controllable and observable by code.

Deliverables:

- `window.TEAR_TEST`
- Synthetic controller interface for live gameplay
- Blade aim control
- `observe()`
- `reset()`
- `step()`
- `runActionBatch()`
- Fixed timestep
- Test-mode audio, cloud, ad, achievement, and progression isolation

Exit criteria:

- Script can start a scenario, move, jump, dash, swing, and terminate deterministically
- Same seed and actions produce the same critical state trace

---

## Phase 2 — Scenario runner and invariants

**Goal:** Create immediate automated QA without machine learning.

Deliverables:

- Scenario schema and loader
- Smoke scenarios
- Movement scenarios
- Blade scenarios
- Basic enemy scenarios
- Invariant engine
- Browser-fast CLI runner
- JSON and Markdown reports

Exit criteria:

- CI can boot Tear and run deterministic smoke tests
- Failures contain seed, state, and action trace

---

## Phase 3 — Full scripted playtester

**Goal:** Upgrade attract-mode concepts into a competent real-game agent.

Deliverables:

- Threat selection
- Navigation
- Blade arc planner
- Projectile avoidance and parrying
- Throw and recall logic
- Upgrade selection
- Boss behavior modules
- Competent, style, survival, and chaos profiles

Exit criteria:

- Competent agent reliably clears early content
- Scripted agents exercise all core combat mechanics

---

## Phase 4 — Ghost 3.0 core and demonstration dataset

**Goal:** Build the causal run-memory layer that serves both players and autonomous training.

Deliverables:

- Canonical device-independent action recording at simulation tick cadence
- Named RNG streams and historical build/config fingerprints
- Semantic events, result ledger, and authoritative keyframes
- Isolated replay world with state hashes and drift detection
- Hybrid deterministic playback with correction and legacy pose fallback
- Binary chunk container, integrity checks, and IndexedDB storage
- V1 and V2 compatibility adapters
- Observation and dataset export
- Demonstration tagging, consent, provenance, validation, and deduplication
- Recovery-demonstration and replay-to-practice workflow
- Initial Ghost Theater timeline and event inspection

Exit criteria:

- A normal human run becomes a portable, seekable, integrity-checked run capsule
- Replaying the canonical actions reproduces declared checkpoints and result within defined tolerance
- A user can seek to a wave, draft, boss phase, or death without replaying the whole run
- The same capsule can produce synchronized training samples without treating public visibility as training consent
- Legacy Ghost 2.0 runs remain watchable with an honest fidelity label

---

## Phase 5 — Behavior-cloned policy

**Goal:** Produce the first neural agent that plays in the user’s style.

Deliverables:

- Gym-compatible environment wrapper
- Behavior-cloning training pipeline
- Entity encoder
- Temporal model
- Evaluation suite
- Policy export and version manifest
- Human correction workflow

Exit criteria:

- Neural agent completes tutorial mechanics and early combat scenarios
- Policy can recover from a defined set of corrected failure states

---

## Phase 6 — Reinforcement-learning specialization

**Goal:** Improve competency and create specialized agents.

Deliverables:

- Curriculum manager
- Reward-component instrumentation
- PPO or equivalent fine-tuning
- Competent, style, survival, speedrun, and exploit objectives
- Reward-hacking detection dashboards

Exit criteria:

- Learned agent exceeds scripted baseline in selected objectives without violating invariants

---

## Phase 7 — Failure minimization and branch comparison

**Goal:** Convert autonomous discoveries into engineering-grade evidence.

Deliverables:

- Delta-debugging minimizer
- Branch comparison runner
- Replay divergence analyzer
- Failure clustering
- Stable reproduction verification

Exit criteria:

- A discovered bug can be reduced automatically and replayed reliably
- Candidate branches receive metric-delta reports against baseline

---

## Phase 8 — Agent Skill and development workflow

**Goal:** Make autonomous gameplay testing reusable by Codex and other coding agents.

Deliverables:

- `tear-autonomous-playtester` Skill
- TearBench CLI or MCP tools
- `AGENTS.md` integration
- Change-to-suite routing rules
- Standard validation report
- CI artifacts

Exit criteria:

- A coding agent can independently choose, run, interpret, and report the correct TearBench validation for a gameplay change

---

## Phase 9 — Headless-core scaling

**Goal:** Run large-scale simulations and training efficiently.

Deliverables:

- Simulation core extracted from browser globals
- Node or worker execution
- Parallel environments
- High-throughput scenario and policy execution
- Deterministic compatibility checks between browser and headless modes

Exit criteria:

- Hundreds or thousands of episodes can be executed at practical development cost
- Browser and headless critical-state outcomes remain aligned

---

## 25. Risks and Direct Recommendations

### 25.1 Starting with screenshot-only AI

**Recommendation:** Do not do this first.

It would create unnecessary complexity and make the system sensitive to visual effects, camera movement, resolution, and UI changes. Structured state is already available and better suited to development testing.

### 25.2 Starting with reinforcement learning immediately

**Recommendation:** Do not do this first.

Without deterministic simulation, scenarios, action recording, and strong metrics, reinforcement learning would become an expensive research project with weak QA value.

### 25.3 One universal policy

**Recommendation:** Avoid this architecture.

A competent player optimizes away weird states. An exploit hunter must actively seek them. Separate policies and objectives are more effective.

### 25.4 Reward hacking

**Risk:** High.

Mitigation:

- Log reward components
- Maintain invariant checks
- Compare against intended behavior
- Use human demonstrations
- Penalize repeated loops
- Keep exploit policies separate from normal-player policies

### 25.5 Nondeterministic browser behavior

**Risk:** Medium to high.

Mitigation:

- Fixed timestep
- Seeded RNG
- Batched stepping
- Controlled timers
- Disable external integrations
- Record build and configuration hashes
- Move toward headless-core simulation

### 25.6 Test hooks leaking into production

**Risk:** Unacceptable.

Mitigation:

- Explicit build or query gate
- No global API in production builds
- Test mode blocks all persistence and platform communication
- CI test verifying the API is absent from production artifacts

### 25.7 Dataset quality

**Risk:** High.

Mitigation:

- Record exact actions and observations
- Validate synchronization
- Tag input device and playstyle
- Include recovery demonstrations
- Remove corrupted and duplicate episodes
- Version every dataset

---

## 26. Immediate Recommended Next Steps

The correct near-term order is:

1. Add this document to the Tear repository as the canonical plan.
2. Define `TearObservationV1`, `TearActionV1`, `TearScenarioV1`, and `TearFailureArtifactV1` schemas.
3. Add a seeded RNG abstraction without changing normal production behavior.
4. Expose a development-only `window.TEAR_TEST` bridge from inside `js/game.js`.
5. Generalize the existing `player.aiInput` and `blade.aimOverride` seams for full gameplay.
6. Implement fixed-step and batched simulation.
7. Create five deterministic scenarios:
   - boot and start run
   - movement and jump
   - dash and one-way platform
   - basic blade cut
   - projectile parry
8. Add invariant checks and artifact capture.
9. Build the first CLI smoke runner.
10. Upgrade the attract bot into the first full-game scripted policy.
11. Extend Ghost 2.0 into an action-aware demonstration recorder.
12. Begin model training only after deterministic scripted testing is operational.

The highest-leverage first milestone is not “train a neural network.” It is:

> Launch the real Tear combat simulation through code, feed it synthetic actions, inspect structured observations, and reproduce the same result from the same seed.

Once that exists, every later capability becomes substantially easier.

---

## 27. Definition of Success

TearBench should be considered successful when it can do all of the following:

- Start *Tear* without human interaction
- Load an exact combat or UI scenario
- Play using synthetic inputs
- Exercise the real player, blade, enemies, projectiles, bosses, platforms, hazards, and upgrades
- Reproduce runs deterministically
- Detect crashes, invalid state, softlocks, and gameplay regressions
- Compare a development branch against a stable baseline
- Save replays and state traces
- Preserve player runs as portable Ghost 3.0 capsules with actions, seed, keyframes, integrity, compatibility, and result provenance
- Let players watch, compare, share, challenge, receive evidence-backed coaching, and practice from a replay timestamp independently of TearBench
- Automatically minimize a failure
- Produce a developer-readable report
- Allow the user’s gameplay to become training data
- Train policies that reproduce different styles of play
- Allow a coding agent to invoke the system through a reusable Skill
- Run continuously in CI and during feature development

The ultimate success condition is not that an AI can defeat the final boss.

It is that autonomous gameplay becomes a dependable part of how *Tear* is built.

---

## 28. Non-Negotiable End-to-End Autonomy Target

The minimum acceptable result is no longer “an agent can survive a combat scenario.”

The baseline product requirement is:

> An autonomous Tear agent must be capable of launching the real game, navigating from the main menu using player-valid inputs, selecting a game mode and difficulty, starting a run, clearing waves, evaluating and selecting draft upgrades, defeating bosses, completing every finite game mode, reaching defined endurance milestones in infinite modes, processing the post-run screens, and returning to the menu without human intervention.

This must be observable in real time. The user must be able to watch the agent play the same visible build that a human player uses.

### 28.1 Required canonical journey

A certified end-to-end run must traverse the real state sequence:

```text
application boot
  -> loading / SDK initialization
  -> title or main menu
  -> Play
  -> mode selection
  -> difficulty selection
  -> run start
  -> active wave
  -> wave clear
  -> draft choice
  -> next wave
  -> stage boss
  -> boss defeat
  -> tier evolution or stage transition
  -> remaining stages / mode loop
  -> victory or certified endurance target
  -> run summary
  -> replay / reward / progression processing
  -> return to main menu
```

The test must fail if the agent reaches the destination by silently teleporting between states, mutating internal state, granting itself impossible upgrades, disabling hostile behavior, or bypassing the actual UI in a certification run.

### 28.2 Three execution classes

TearBench should support three distinct execution classes. They must never be conflated in reports.

#### Class A — Training execution

Permitted:

- Direct scenario loading
- State injection
- Slow motion
- Save-state restoration
- Privileged structured observations
- Reward shaping
- God mode for isolated mechanical training
- Repeated reset at a single lesson
- Headless simulation

Purpose:

- Teach mechanics quickly
- Generate data
- Debug policies
- Train recovery behavior
- Test isolated systems

#### Class B — Engineering execution

Permitted:

- Direct scenario loading
- Deterministic seeds
- Structured observations
- Accelerated simulation
- Internal test APIs
- Synthetic input injection
- Branch comparison instrumentation

Not permitted:

- Changing the gameplay result through test-only cheats
- Ignoring actual collision, damage, enemy logic, boss phases, or draft consequences

Purpose:

- Fast regression testing
- CI
- Balance analysis
- Failure minimization
- Coverage expansion

#### Class C — Black-box player certification

Permitted:

- The same keyboard, mouse, controller, or touch surfaces available to a player
- Screen pixels
- Publicly observable audio and UI output
- Optional accessibility metadata that is also valid in production

Not permitted:

- Scenario teleporting
- Reading hidden enemy intent that is not represented by a player-visible telegraph
- Directly assigning player or run state
- Skipping menus
- Selecting drafts through internal functions
- Invulnerability
- Simulation-only shortcuts

Purpose:

- Prove the shipped build actually works
- Verify that internal test seams have not hidden a real integration failure
- Validate complete player journeys
- Certify input-device parity

A feature is not release-certified until both engineering execution and black-box player certification pass.

### 28.3 Human-visible autonomy

TearBench must include a watch mode where the developer can see:

- The real game canvas
- The agent moving through menus
- The selected mode and difficulty
- The agent’s current objective
- Its selected enemy target
- Its planned movement intent
- Blade target and intended swing type
- Predicted incoming threats
- Draft evaluation scores
- Current confidence
- Current benchmark gate
- Any invariant warning
- The exact reason a run was failed or aborted

The overlay must be optional so visual certification can also run against an untouched presentation.

### 28.4 Bare-minimum acceptance gate

The first major TearBench release is not complete until one agent can, on the real visible build:

1. Start at the main menu.
2. Select Adventure.
3. Select a configured difficulty.
4. Begin the run.
5. Clear at least one complete wave.
6. Select a draft upgrade through the real draft interface.
7. Continue into the next wave.
8. Repeat without human input.
9. Defeat at least one stage boss.
10. Select or process the post-boss evolution choice.
11. Complete the entire Adventure mode on at least Easy and Normal.
12. Reach the final summary screen.
13. Return to the main menu.
14. Produce a replay, metrics report, and deterministic run transcript.

That is the floor, not the ceiling.

---

## 29. Repository-Grounded Tear Coverage Inventory

TearBench must be designed around the game that exists, not a generic action-game abstraction.

The current repository exposes a concrete set of modes, difficulties, mechanics, progression systems, and integration surfaces that should become first-class benchmark dimensions.

### 29.1 Current selectable difficulties

The current configuration defines five difficulties:

| Difficulty | Enemy HP | Damage pressure | Enemy count | Coin reward | Score reward | Special rule |
|---|---:|---:|---:|---:|---:|---|
| Easy | 0.80× | 0.65× | 0.85× | 0.80× | 0.70× | Gentler baseline |
| Normal | 1.00× | 1.00× | 1.00× | 1.00× | 1.00× | Intended balance |
| Hard | 1.30× | 1.35× | 1.15× | 1.30× | 1.40× | Greater durability, damage, and density |
| Extreme | 1.70× | 1.80× | 1.30× | 1.70× | 2.00× | Maximum conventional pressure |
| One-Hit | 0.90× | 1.00× | 1.00× | 1.80× | 2.20× | Any valid damaging contact defeats the player |

TearBench must treat each difficulty as a separate product surface. A Normal-clear policy is not automatically an Extreme-ready policy, and a high completion rate on Easy cannot certify higher tiers.

### 29.2 Current game modes

The current configuration defines:

| Mode | Type | Current completion interpretation |
|---|---|---|
| Adventure | Finite campaign | Traverse biomes; nine waves followed by a boss per stage; finish the campaign ending |
| Endless | Infinite survival | Reach certified wave, time, biome-cycle, and score milestones |
| Gauntlet | Infinite boss-pressure survival | Survive repeated eight-wave intervals and complete full rotating boss cycles |
| Playground | Training / inspection | Exercise spawning, arena rotation, abilities, tiers, difficulty switching, and control utilities |
| Tutorial | Finite training | Complete every lesson and return to the menu |
| Boss Test | Finite debug gauntlet | Defeat every boss in sequence and process ability evolution between fights |
| Enemy Test | Debug sandbox | Exercise the complete enemy and variant roster from the beginning |

Finite and infinite modes need different success contracts. “Finish the game mode” is literal for Adventure, Tutorial, and Boss Test. Endless and Gauntlet require explicit endurance certification targets because they intentionally do not terminate naturally.

### 29.3 Current campaign and draft pacing

The current design includes:

- Nine standard waves before a campaign boss
- Stage-to-stage health, damage, count, and concurrency scaling
- A draft system after cleared waves
- Three upgrade choices per draft
- A guarantee that at least two Special offers appear within each ten-wave stage block
- Post-boss tier evolution choices
- Run score, coins, loadout, replay, profile, and achievement consequences

The autonomous agent must therefore solve two coupled problems:

1. Moment-to-moment action combat.
2. Long-horizon build planning across multiple stages.

### 29.4 Current control seams

The game already contains high-leverage integration points:

- `player.aiInput` can replace live movement, jump, and dash input.
- `blade.aimOverride` can provide a synthetic blade target.
- Attract mode already drives the real Player and Blade classes.
- Ghost recording already tracks player position, blade tip, enemies, stages, waves, events, deaths, and loadout decisions.
- The canvas UI already constructs a runtime list of interactable buttons.
- The state machine already distinguishes menu, gameplay, draft, replay, settings, profile, and other surfaces.

TearBench should generalize these seams into stable interfaces rather than replacing the underlying game.

### 29.5 Current special-case behavior must be encoded

Tests must understand deliberate exceptions instead of misclassifying them as bugs.

Example:

- The Source void-run fall “bite” is intentionally nonfatal even in One-Hit mode, returning the player to play with a penalty.

Every exception like this should live in a versioned gameplay contract registry with:

- Contract ID
- Relevant mode
- Relevant difficulty
- Trigger
- Expected result
- Design rationale
- Owner
- Date introduced
- Regression scenarios

This prevents “perfect testing” from becoming “the bot complains about every intentional rule.”

---

## 30. Autonomous Competency Ladder

Agent capability must be measured through explicit levels. Training should not advance merely because reward increased.

### Level 0 — Process survival

The system can:

- Launch the build
- Detect readiness
- Detect a blank canvas
- Detect JavaScript exceptions
- Detect infinite loading
- Detect a stale service worker build
- Exit cleanly

Pass criteria:

- 100 consecutive boots without an unrecovered startup failure on the primary test environment

### Level 1 — Menu literacy

The agent can:

- Identify the current screen
- Navigate the main menu
- Enter and leave settings
- Open Play
- Select a mode
- Select a difficulty
- Confirm and back out
- Handle scrollable screens
- Use tabs and shoulder-button navigation where applicable
- Recover from an accidental wrong menu

Pass criteria:

- Complete every defined menu route using mouse, controller, and touch profiles
- Zero unreachable interactive elements in the UI graph

### Level 2 — Locomotion literacy

The agent can:

- Move left and right
- Jump
- Use coyote time and jump buffering naturally
- Drop through one-way platforms
- Dash in all supported directions
- Curve a dash
- Recover from a missed platform
- Traverse each authored arena layout

Pass criteria:

- Reach all navigation anchors in every biome layout from all valid spawn points
- No permanent movement softlock across the deterministic seed bank

### Level 3 — Blade literacy

The agent can:

- Produce a valid damage-speed swing
- Control tether radius
- Launch enemies
- Juggle enemies
- Slam
- Power Slam
- Updraft
- Throw
- Recall
- Deflect projectiles
- Perfect-parry
- Avoid uncontrolled constant flailing

Pass criteria:

- Satisfy each tutorial lesson through actual player-valid inputs
- Demonstrate minimum success rates for every mechanic

### Level 4 — Enemy literacy

The agent can:

- Recognize every base enemy
- Recognize enemy variants and affixes
- Read telegraphs
- Prioritize threats
- Handle grounded and aerial targets
- Handle ranged pressure
- Handle armor, shields, healing, anchors, mines, bombs, tethers, walls, hazards, and summons
- Use appropriate counters

Pass criteria:

- Defeat every enemy and variant in isolated and mixed scenarios
- Survive every authored attack at least once without privileged invulnerability

### Level 5 — Wave competency

The agent can:

- Start a run
- Clear a complete wave
- Avoid inactivity and kiting deadlocks
- Handle spawn queues
- Recover after taking damage
- Maintain useful style without making survival irrational
- Recognize wave completion
- Transition into draft state

Pass criteria:

- Clear a statistically meaningful seed bank on each difficulty target
- No unresolved wave softlock

### Level 6 — Build competency

The agent can:

- Read all draft choices
- Understand current loadout
- Estimate synergy
- Estimate survival need
- Consider the selected difficulty
- Consider current and upcoming enemy pressure
- Select an upgrade through the real UI
- Process duplicate, unique, Special, and tiered choices
- Continue the run after the pick

Pass criteria:

- Complete multi-wave runs with legal draft selections
- Cover the required upgrade and synergy matrix

### Level 7 — Stage competency

The agent can:

- Clear nine standard waves
- Enter the stage boss
- Understand boss phases
- Handle arena mutations
- Survive phase transitions
- Defeat the boss
- Process tier evolution
- Transition into the next biome

Pass criteria:

- Complete every stage independently across the target difficulties

### Level 8 — Mode competency

The agent can:

- Complete Tutorial
- Complete Adventure
- Complete Boss Test
- Reach Endless certification milestones
- Reach Gauntlet certification milestones
- Exercise Playground controls
- Exercise Enemy Test roster coverage

Pass criteria:

- Satisfy every mode-specific contract in Section 35

### Level 9 — Cross-surface competency

The agent can complete the same player journey across:

- Keyboard and mouse
- Controller presets
- Touch controls
- Supported browser families
- 30, 60, 90, 120, and high-refresh simulation profiles
- Low and high graphics settings
- Windowed, fullscreen, PWA, and portal contexts where applicable
- Network-online and network-degraded profiles

Pass criteria:

- No critical integration regression across the release matrix

### Level 10 — Autonomous release certification

The system can:

- Select tests based on a code diff
- Run appropriate suites
- Compare against baseline
- Identify failures
- Minimize reproductions
- Generate evidence
- Distinguish product failure from policy failure
- Re-run with alternate agents
- Gate a release or PR objectively

Pass criteria:

- A developer can trust a green TearBench certification without manually replaying every covered path

---

## 31. Full Player-Journey State Machine

The end-to-end agent should not treat the game as one continuous undifferentiated policy problem. Tear is a sequence of distinct operational contexts.

### 31.1 Canonical journey states

```text
BOOT
LOADING
PORTAL_OR_ACCOUNT_PROMPT
MAIN_MENU
PLAY_MENU
MODE_SELECT
DIFFICULTY_SELECT
RUN_STARTING
LORE_OR_STAGE_INTRO
WAVE_ACTIVE
WAVE_CLEAR_DELAY
DRAFT
BOSS_INTRO
BOSS_ACTIVE
BOSS_DEATH
TIER_EVOLUTION
STAGE_TRANSITION
PAUSED
DEFEAT
CONTINUE_OR_REVIVE
VICTORY
ENDING
RUN_SUMMARY
REPLAY_PROMPT
PROFILE_REWARD_PROCESSING
RETURN_TO_MENU
ERROR_RECOVERY
```

Every state should expose:

- Stable state ID
- Entry timestamp
- Permitted actions
- Expected exit conditions
- Maximum expected dwell time
- Recovery options
- State-specific invariants
- Relevant artifact capture policy

### 31.2 Journey Director

A high-level Journey Director should own the current objective.

Examples:

```text
objective: select Adventure
objective: select Extreme
objective: begin run
objective: survive current wave
objective: eliminate remaining ranged threat
objective: select a sustain-oriented draft
objective: defeat The Warden phase 2
objective: process tier evolution
objective: return to main menu
```

The Journey Director must not issue frame-by-frame blade commands. It delegates to specialized policies.

### 31.3 State transition watchdog

Every state receives a timeout policy.

Examples:

- Loading exceeds expected time
- Menu selection does not change screen
- Wave contains zero living enemies but never clears
- Draft input is accepted but gameplay never resumes
- Boss HP reaches zero but death theater never finishes
- Tier evolution choice does not apply
- Ending cannot be dismissed
- Return-to-menu button becomes unreachable

The watchdog should:

1. Capture screenshot.
2. Capture structured state.
3. Capture recent input history.
4. Capture console and network errors.
5. Attempt one documented non-destructive recovery.
6. Fail deterministically if recovery is unsuccessful.

### 31.4 Real-input certification

The black-box journey must drive actual event paths:

- Keyboard events
- Pointer movement and buttons
- Gamepad state
- Touch contacts and gestures

Internal direct function calls may be used in engineering runs but cannot count as player-journey certification.

### 31.5 Persistent journey transcript

Every journey should generate a machine-readable transcript:

```json
{
  "journeyId": "tb-20260722-882901",
  "build": "c601874",
  "policy": "champion-v14",
  "inputProfile": "controller-default",
  "mode": "campaign",
  "difficulty": "normal",
  "seed": 882901,
  "states": [
    { "id": "MAIN_MENU", "entered": 1.42, "exited": 2.10 },
    { "id": "MODE_SELECT", "entered": 2.10, "exited": 2.88 },
    { "id": "DIFFICULTY_SELECT", "entered": 2.88, "exited": 3.54 },
    { "id": "WAVE_ACTIVE", "wave": 1, "entered": 6.02, "exited": 18.44 },
    { "id": "DRAFT", "wave": 1, "pick": "tempo", "entered": 19.21, "exited": 20.40 }
  ],
  "result": "victory",
  "artifacts": []
}
```

This transcript becomes the backbone for debugging, analytics, replay alignment, and regression comparison.

---

## 32. Hierarchical Agent Architecture

A single neural network controlling menus, long-term build strategy, boss reasoning, and sub-frame blade motion would be harder to train, less interpretable, and less reliable.

The recommended architecture is hierarchical.

### 32.1 Layer 1 — Test Orchestrator

Responsibilities:

- Launch builds
- Select browser and hardware profile
- Select policy population
- Choose seeds and scenarios
- Enforce execution class
- Manage artifacts
- Determine pass or fail

This is engineering infrastructure, not gameplay intelligence.

### 32.2 Layer 2 — Journey Director

Responsibilities:

- Track high-level state
- Maintain the current objective
- Select the appropriate specialist
- Decide when to pause, retry, or abandon
- Coordinate full-mode completion

Suggested implementation:

- Explicit finite-state machine initially
- Optional learned or language-model planner later
- Never place an LLM in the 60 Hz motor loop

### 32.3 Layer 3 — Menu Navigator

Responsibilities:

- Detect interactive UI elements
- Navigate focus
- Scroll
- Switch tabs
- Confirm
- Back out
- Select mode and difficulty
- Handle draft and tier screens
- Handle post-run screens

This component should support:

- Semantic UI tree navigation
- Coordinate clicking
- Controller navigation
- Touch navigation
- Pixel-only fallback certification

### 32.4 Layer 4 — Run Strategist

Responsibilities:

- Set run-level priorities
- Decide risk posture
- Choose survival versus score emphasis
- Track stage and boss forecast
- Request specific mechanics for build synergy
- Decide when to play conservatively
- Decide when to pursue style or speed

Inputs include:

- Difficulty
- Mode
- Current biome and wave
- Current HP and revives
- Loadout
- Enemy roster forecast
- Boss forecast
- Run pace
- Current benchmark objective

### 32.5 Layer 5 — Tactical Combat Policy

Responsibilities:

- Select target
- Choose movement destination
- Choose attack family
- Choose dodge, parry, throw, slam, or disengage
- Handle enemy combinations
- Manage boss phases

Suggested decision rate:

- 10–20 tactical decisions per second

### 32.6 Layer 6 — Blade Motor Controller

Responsibilities:

- Convert attack intent into a blade trajectory
- Generate valid speed
- Shape arcs around the player
- Control tether radius
- Preserve momentum
- Execute launch, slam, Power Slam, Updraft, throw, recall, and parry gestures

Suggested decision rate:

- 30–60 control updates per second

A dedicated motor controller is critical because Tear’s identity is based on continuous blade momentum, not a binary attack button.

### 32.7 Layer 7 — Movement Controller

Responsibilities:

- Convert destination intent into left/right/up/down/jump/dash actions
- Traverse platforms
- Preserve dash charges
- Recover from falls
- Curve dashes
- Align player motion with blade technique

### 32.8 Layer 8 — Draft Strategist

Responsibilities:

- Score choices
- Model synergies
- Identify build gaps
- Adapt to mode and difficulty
- Plan for upcoming bosses
- Maintain policy persona
- Select post-boss tier evolution

### 32.9 Layer 9 — Recovery Controller

Responsibilities:

- Detect out-of-distribution states
- Escape corners
- Recover blade position
- Recall a lost or embedded blade
- Re-center after missed attacks
- Restore platform safety
- Resolve target-selection loops
- Handle accidental pause or focus loss

Recovery is a dedicated skill, not an afterthought.

### 32.10 Layer 10 — Independent Critic

The Critic observes the run but does not control it.

Responsibilities:

- Estimate whether the active policy is failing
- Detect irrational loops
- Detect reward hacking
- Detect policy uncertainty
- Recommend policy handoff
- Identify likely game bugs
- Score human-likeness and fairness

### 32.11 Layer 11 — Invariant Sentinel

The Sentinel is deterministic code, not a learned policy.

Responsibilities:

- Monitor physics invariants
- Monitor state-machine invariants
- Monitor progression and economy invariants
- Detect NaN, infinity, invalid ownership, negative counts, impossible states, and stalled transitions
- Trigger high-priority artifact capture

### 32.12 Layer 12 — Long-horizon memory

A full run requires memory beyond the current frame.

Memory should include:

- Mode and difficulty
- Current objective
- Previous draft choices
- Build identity
- Encounter history
- Enemy attacks recently observed
- Boss phase history
- Damage sources
- Failed tactics
- Platform hazards
- Remaining resources
- Run pacing

The memory layer can begin as explicit structured state and later incorporate recurrent neural memory.

---

## 33. Dual Observation and Control System

Perfect autonomy requires both privileged engineering visibility and player-realistic black-box validation.

### 33.1 Structured observation channel

Used for:

- Training
- Engineering runs
- Fast regression tests
- Policy debugging
- Reward computation

Contains:

- Player state
- Blade state
- Enemy state
- Projectile state
- Platform geometry
- Hazards
- Boss state
- Wave state
- Draft state
- UI state
- Progression state
- Timing state

### 33.2 Pixel observation channel

Used for:

- Black-box certification
- Visual QA
- Testing telegraph readability
- Detecting mismatches between internal state and rendered output
- Ensuring the agent can operate the shipped presentation

The pixel policy may use:

- Downscaled current frame
- Short frame stack
- Optical flow or frame-difference features
- Optional detected UI regions
- Optional audio-event embeddings

### 33.3 Semantic UI channel

Canvas UI should expose a test and accessibility tree:

```json
{
  "screen": "difficulty-select",
  "elements": [
    {
      "id": "difficulty-extreme",
      "role": "button",
      "label": "Extreme",
      "bounds": [620, 420, 240, 52],
      "enabled": true,
      "selected": false,
      "focusable": true,
      "neighbors": {
        "left": "difficulty-hard",
        "right": "difficulty-onehit",
        "down": "start-run"
      }
    }
  ]
}
```

This improves:

- Test reliability
- Controller navigation
- Touch testing
- Accessibility
- Agent explainability

### 33.4 Event observation channel

High-level events should be emitted independently of rendering:

```text
screen_entered
button_focused
button_activated
run_started
wave_started
enemy_spawned
attack_telegraph_started
player_damaged
parry_success
wave_cleared
draft_opened
draft_selected
boss_phase_started
boss_defeated
tier_selected
mode_completed
run_ended
```

Events should supplement state, not replace it.

### 33.5 Internal action channel

Engineering runs can apply normalized game actions:

```json
{
  "moveX": 1,
  "moveY": 0,
  "jumpPressed": false,
  "dashPressed": true,
  "throwPressed": false,
  "tetherHeld": false,
  "aimX": 0.73,
  "aimY": -0.42,
  "confirmPressed": false,
  "backPressed": false,
  "tabLeftPressed": false,
  "tabRightPressed": false,
  "scrollY": 0
}
```

### 33.6 Physical input channel

Certification runs convert actions into actual device events.

The same abstract intent should be renderable as:

- Keyboard and mouse
- Controller
- Touch

This allows one policy to test multiple control surfaces while preserving device-specific motor adapters.

### 33.7 Observation parity tests

TearBench must verify that:

- Internal state says an enemy telegraph exists only when the telegraph is visible.
- A focused button is visually identifiable.
- A selected draft is visibly selected.
- A boss phase transition is rendered and audible.
- Damage, death, wave clear, and victory state are reflected on screen.

This catches “logic works, presentation lies” regressions.

---

## 34. Difficulty Intelligence and Certification

Difficulty is not a single scalar. It changes required precision, survivability, enemy density, build value, and risk economics.

### 34.1 Difficulty-conditioned policy

The main policy should receive difficulty as an explicit condition.

It should learn different behavior such as:

- Easy: broader exploration, lower defensive urgency, novice-style validation
- Normal: intended balanced strategy
- Hard: stronger threat prioritization and sustain valuation
- Extreme: high discipline, crowd control, optimized routing, low tolerance for greed
- One-Hit: near-zero-contact strategy, maximum telegraph respect, defensive spacing, parry selectivity, and safe draft logic

### 34.2 Specialist policies

In addition to a conditioned generalist, retain specialists:

- Easy novice
- Normal representative player
- Hard expert
- Extreme champion
- One-Hit no-contact specialist

Specialists provide clearer failure attribution and stronger peak capability.

### 34.3 Curriculum order

Recommended progression:

```text
Tutorial
  -> Easy isolated mechanics
  -> Easy full waves
  -> Easy stage clears
  -> Easy Adventure clear
  -> Normal stage clears
  -> Normal Adventure clear
  -> Hard stage clears
  -> Hard Adventure clear
  -> Extreme isolated pressure
  -> Extreme stage clears
  -> Extreme Adventure clear
  -> One-Hit isolated encounters
  -> One-Hit stage clears
  -> One-Hit Adventure attempts
```

Do not train only in this direction. Periodically return to easier difficulties to prevent catastrophic forgetting.

### 34.4 Difficulty monotonicity contracts

Across a fixed seed bank and fixed representative policy population, the game should generally satisfy:

- Completion rate should not increase unexpectedly as difficulty rises.
- Damage taken should not decrease without a clear strategic reason.
- Average enemy time-to-kill should not decrease when HP scaling rises.
- Required precision should rise gradually, not spike arbitrarily.
- Reward gain should reflect risk.
- One-Hit should produce defeat on valid damage, except documented intentional exceptions.

These are statistical contracts, not absolute per-seed rules.

### 34.5 Difficulty fairness metrics

Measure:

- Completion rate
- Median wave reached
- Death cause distribution
- Time-to-first-hit
- Damage avoided
- Number of simultaneous threats
- Projectile reaction time
- Boss phase success rate
- Build diversity among successful runs
- Input intensity
- Required parry rate
- Required dash rate
- Recovery success
- Unavoidable-damage incidents
- Telegraph-to-impact window
- Spawn safety distance
- One-Hit contact legitimacy

### 34.6 Difficulty identity tests

Each tier should feel meaningfully distinct.

TearBench should detect:

- Easy accidentally becoming equivalent to Normal
- Hard only inflating HP without changing pressure
- Extreme becoming mathematically impossible for intended builds
- One-Hit being invalidated by hidden or unreadable damage
- Reward multipliers failing to apply
- Difficulty selection UI not matching applied modifiers
- Playground live difficulty switching failing to renormalize state

### 34.7 Difficulty calibration agents

Use a population rather than a single champion:

- Novice agent
- Developing agent
- Median agent
- Expert agent
- Champion agent

A healthy difficulty curve might show:

- Novice succeeds on Tutorial and some Easy content.
- Developing agent clears Easy and progresses through Normal.
- Median agent clears Normal with meaningful variance.
- Expert clears Hard and challenges Extreme.
- Champion clears Extreme and meaningfully attempts One-Hit.

Exact targets must be selected from human playtest data, not invented permanently by the bot.

### 34.8 Difficulty regression report

Example:

```text
EXTREME — Adventure
Champion completion: 62% -> 19%  [critical regression]
Median stage reached: 4.8 -> 2.1
Primary new death cause: Seedcaster pod zone
Unavoidable-damage classifier: +14.2 percentage points
Likely introduction: projectile speed increase combined with stage concurrency
Representative failures: seeds 142, 882901, 901773
```

### 34.9 Difficulty should influence drafting

Draft value changes with difficulty.

Examples:

- A damage option may dominate Easy but be inferior to defense on Extreme.
- A risky on-kill sustain option may be unreliable in One-Hit.
- Crowd-control value rises with enemy count.
- Parry-triggered upgrades become more valuable when projectile density rises.
- Boss-focused damage may be more valuable in Gauntlet than Endless wave farming.

The Draft Strategist must model this explicitly.

---

## 35. Mode-Specific Completion Contracts

Every mode receives a contract describing how the agent starts, what it must exercise, and what counts as completion.

### 35.1 Tutorial contract

Required journey:

```text
main menu -> Play -> Tutorial -> start -> complete every lesson -> READY -> automatic or manual return to menu
```

Required mechanic evidence:

- Move both directions
- Jump at least twice
- Dash at least twice
- Perform valid cuts
- Launch
- Juggle
- Slam
- Power Slam
- Updraft
- Throw hit
- Recall
- Deflect or perfect-parry

Assertions:

- Lesson progression cannot skip without satisfying its rule.
- Ghost or demonstration visuals do not complete the lesson for the player.
- Tutorial dummy cannot softlock progression.
- Final state returns to the menu.
- Tutorial completion progression is credited once as designed.

### 35.2 Adventure contract

Required journey:

```text
main menu -> Adventure -> difficulty -> campaign intro -> stage 1 waves 1–9 -> boss -> evolution -> next stage ... -> final boss -> ending -> summary -> menu
```

Required evidence:

- Every biome entered in order
- Every standard wave cleared
- Every draft processed
- At least one legal build path maintained
- Every boss intro and phase reached
- Every boss defeated
- Every evolution choice processed
- Final ending reached
- Victory recorded
- Replay packaged
- Progression and rewards applied correctly

Completion:

- Natural Adventure victory state

Certification tiers:

- Adventure Easy clear
- Adventure Normal clear
- Adventure Hard clear
- Adventure Extreme clear
- Adventure One-Hit clear or documented elite target

### 35.3 Endless contract

Endless cannot be “finished.” Certification should use milestones.

Suggested milestone dimensions:

- Wave reached
- Runtime survived
- Full biome cycles completed
- Mini-bosses defeated
- Score reached
- Build maturity reached
- Maximum concurrency observed

Example gates:

```text
Bronze: wave 10
Silver: wave 25
Gold: wave 50
Platinum: wave 100 or configured long-run target
Stability: two hours accelerated without leak, drift, or softlock
```

Assertions:

- Biome cycling remains valid.
- Scaling continues.
- Spawn queues do not deadlock.
- Drafts remain selectable.
- Score and reward values remain finite.
- Long-run memory and object counts remain bounded.

### 35.4 Gauntlet contract

Required evidence:

- Standard waves progress.
- A full boss appears every configured interval.
- Boss identity cycles correctly.
- Boss scaling increases as intended.
- Draft and evolution choices remain valid.
- Boss arenas restore correctly.

Completion interpretation:

- Complete one full boss roster cycle.
- Complete multiple cycles for endurance certification.

Suggested gates:

```text
Bronze: first boss defeated
Silver: one complete five-boss cycle
Gold: two cycles
Platinum: configured high-pressure endurance target
```

### 35.5 Playground contract

The agent should deliberately test the developer-facing control surface.

Required evidence:

- Spawn each enemy kind.
- Spawn target dummy.
- Change enemy count.
- Change HP multiplier.
- Toggle supported utility modes.
- Change arena through training and every biome.
- Change difficulty live.
- Acquire each ability.
- Acquire each valid tier.
- Verify spawned enemies use selected modifiers.
- Verify return-to-menu behavior.

Playground is both a product surface and a TearBench training lab.

### 35.6 Boss Test contract

Required journey:

```text
main menu -> Boss Test -> select difficulty if exposed -> start -> boss 1 -> evolution -> boss 2 -> ... -> final boss -> summary -> menu
```

Assertions:

- Boss order is correct.
- Each fight initializes cleanly.
- Previous hazards and adds are removed.
- Arena swaps and restorations are correct.
- Evolution choices apply.
- All bosses can be completed consecutively.

### 35.7 Enemy Test contract

Required evidence:

- Every enemy family spawns.
- Every variant and affix required by the mode appears.
- Every attack grammar executes.
- Every enemy can damage the player.
- Every enemy can be defeated.
- Death cleanup succeeds.
- Mixed roster does not deadlock wave logic.

Completion interpretation:

- Coverage target achieved and no critical invariant failure within configured duration.

### 35.8 Mode-by-difficulty matrix

Not every combination needs identical release cadence, but every valid combination must have an explicit status:

```text
untested
smoke-certified
wave-certified
stage-certified
mode-certified
endurance-certified
release-certified
blocked-by-design
```

No combination should silently fall through the cracks.

---

## 36. Draft, Build, and Evolution Intelligence

A full-mode agent needs to make coherent long-term decisions.

### 36.1 Draft observation

The policy must observe:

- Choice IDs
- Names and categories
- Current owned count
- Current tier
- Unique or repeatable status
- Special status
- Effect values
- Current loadout
- Player HP and resources
- Mode
- Difficulty
- Current stage and wave
- Upcoming boss
- Recent death or damage pressure
- Current playstyle objective

### 36.2 Draft utility model

A draft score can begin as an interpretable weighted model:

```text
utility =
  immediate_survival
+ immediate_damage
+ crowd_control
+ boss_value
+ build_synergy
+ mechanic_reliability
+ difficulty_fit
+ mode_fit
+ coverage_value
- redundancy
- execution_risk
- anti_synergy
- delayed_value_risk
```

Weights depend on agent persona and run context.

### 36.3 Synergy graph

Represent abilities and tiers as a graph:

- Node: ability or tier
- Edge: synergy
- Negative edge: anti-synergy or redundancy
- Conditional edge: value under specific mechanic, difficulty, or enemy roster

Example conditions:

- Parry synergy rises with projectile density.
- Launch synergy rises against armored enemies.
- Aerial bonuses require an agent capable of maintaining air time.
- On-kill sustain loses value in boss-only contexts.
- Defensive insurance gains value in Extreme and One-Hit-adjacent testing.

### 36.4 Counterfactual draft evaluation

For important picks, TearBench can fork short deterministic rollouts:

1. Clone current run state.
2. Apply choice A.
3. Simulate upcoming encounter with one or more policies.
4. Repeat for B and C.
5. Compare survival, damage, control, and future build value.
6. Select according to the active strategy.

This turns drafting into evidence-backed planning rather than a static tier list.

### 36.5 Draft personas

Maintain multiple strategists:

- Safe build
- Damage build
- Parry build
- Aerial build
- Throw build
- Slam build
- Style build
- Experimental build
- Random legal picker
- Anti-meta picker

This creates combinatorial coverage without requiring every possible build permutation.

### 36.6 Draft UI certification

The agent must verify:

- Exactly the intended number of choices appears.
- Choices are readable.
- Disabled or duplicate-invalid choices cannot be selected.
- Selected choice applies once.
- The draft closes.
- Input debouncing prevents double-pick.
- Controller focus remains visible.
- Touch hit targets work.
- Scroll and tabs work if the draft surface expands later.
- The run resumes.

### 36.7 Special-offer guarantee tests

Because the game guarantees Special offers within a stage block, deterministic tests should verify:

- Guarantee is satisfied across seed banks.
- Guarantee resets at the correct stage boundary.
- Forced Special logic does not create invalid duplicates.
- The guarantee is unaffected by mode or difficulty unless intentionally designed.

### 36.8 Tier evolution tests

After bosses:

- Only owned eligible abilities should evolve.
- Tier choices should match the current build.
- A tier cannot be applied twice accidentally.
- Tier effects should become active immediately when designed.
- The next stage should inherit the legal final build.
- Replays and run summaries should record the evolution.

### 36.9 Build viability certification

A balance release should test:

- Multiple successful build families
- Minimum build diversity
- No single mandatory pick for all successful runs unless intentionally designed
- No dead upgrade that is never rational
- No upgrade that breaks score, damage, physics, or survivability
- No infinite combo or reward loop
- No tier that silently fails to apply

---

## 37. Agent Academy: Teaching the Game Systematically

TearBench should include an explicit curriculum product called **Agent Academy**.

### 37.1 Academy goals

- Make training observable
- Make progression measurable
- Allow humans to intervene
- Produce reproducible policy versions
- Separate mechanical learning from full-run strategy
- Prevent opaque “reward went up” claims

### 37.2 Lesson families

#### Movement school

- Left/right acceleration
- Braking
- Jump timing
- Coyote recovery
- One-way platform drop
- Horizontal dash
- Vertical dash
- Curved dash
- Gap traversal
- Moving-platform or scrolling-platform survival

#### Blade school

- Static target cut
- Moving target cut
- Arc generation
- Momentum preservation
- Tether control
- Launch
- Juggle
- Slam
- Power Slam
- Updraft
- Throw
- Recall
- Embedded-blade recovery

#### Defense school

- Contact avoidance
- Projectile dodge
- Deflect
- Perfect-parry
- Bomb return
- Hazard escape
- Crowd disengagement
- Low-HP survival
- One-Hit spacing

#### Enemy school

One lesson chain per:

- Base enemy
- Variant
- Affix
- Enemy pair
- Enemy trio
- High-risk composition

#### Boss school

For every boss:

- Attack recognition
- Phase-specific survival
- Punish windows
- Arena-specific movement
- Add priority
- Transition safety
- Full-fight clear

#### Strategy school

- Threat prioritization
- Target switching
- Resource conservation
- Style versus safety
- Draft selection
- Build planning
- Mode pacing

#### Interface school

- Main menu
- Mode selection
- Difficulty selection
- Settings
- Draft
- Tier evolution
- Pause
- Defeat and revive
- Summary
- Replay

### 37.3 Demonstration workflow

The user should be able to teach by playing:

1. Enable demonstration recording.
2. Select lesson or full-run capture.
3. Play normally.
4. Record exact observations and actions.
5. Tag intention at key moments.
6. Review automatically detected segments.
7. Approve, relabel, or discard.
8. Train behavior-cloned policy.
9. Watch the policy attempt the same lesson.
10. Correct failures through DAgger-style intervention.

### 37.4 Intervention mode

During an agent run, the user can take over temporarily.

Capture:

- State where takeover occurred
- Policy action that would have been taken
- Human corrective action
- Duration of intervention
- Outcome

These are especially valuable training examples because they target actual policy mistakes.

### 37.5 Curriculum promotion gate

A lesson is mastered only when:

- Success rate exceeds threshold across unseen seeds.
- Success survives perturbations.
- No forbidden invariant is violated.
- Behavior is not based on one memorized trajectory.
- Recovery succeeds after forced disturbance.

### 37.6 Curriculum perturbations

Randomize:

- Spawn position
- Enemy facing
- Platform position within valid limits
- Timing offsets
- Projectile speed within test range
- Player starting velocity
- Blade starting angle
- HP state
- Input latency
- Frame pacing
- Visual theme

### 37.7 Policy graduation

Each policy version receives a report card:

```text
Policy: tear-champion-v14
Movement: A
Blade control: A-
Parry: B+
Draft strategy: A
Boss coverage: 5/5
Adventure Normal: 91% clear
Adventure Hard: 67% clear
Extreme: stage 4 median
One-Hit: stage 2 median
Recovery: B
Human-likeness: 0.84
Exploit incidents: 0
Certification status: challenger
```

---

## 38. Advanced Training Strategy

The training stack should mature in stages.

### 38.1 Stage 1 — Heuristic teachers

Upgrade the attract bot into modular teachers:

- Movement teacher
- Swing teacher
- Parry teacher
- Threat-priority teacher
- Boss-script teacher
- Draft heuristic teacher

Immediate value:

- Smoke tests before ML
- Synthetic demonstrations
- Baseline scores
- Fallback policies

### 38.2 Stage 2 — Behavior cloning

Train from human and high-quality heuristic demonstrations.

Separate outputs where useful:

- Tactical intent
- Movement action
- Blade target
- Discrete action triggers
- Draft choice

### 38.3 Stage 3 — DAgger-style correction

Let the policy visit its own states, then collect corrections.

Critical for:

- Missed platforms
- Bad blade momentum
- Unexpected enemy combinations
- Low-HP recovery
- Boss transition mistakes
- Draft states under unusual builds

### 38.4 Stage 4 — Offline reinforcement learning

Use the growing replay corpus to learn from:

- Human runs
- Scripted runs
- Failed policy runs
- Successful policy runs
- Rare recoveries
- Exploit attempts

Offline learning can improve strategy before expensive online exploration.

### 38.5 Stage 5 — Online reinforcement learning

Fine-tune in deterministic, accelerated environments.

Use:

- Curriculum
- Reward decomposition
- Scenario balancing
- Failure replay sampling
- Policy population diversity
- Strict reward-hacking monitors

### 38.6 Stage 6 — Hierarchical learning

Train separate policies for:

- Tactical choice
- Movement
- Blade motor control
- Drafting
- Recovery

Then train or define the coordinator.

### 38.7 Stage 7 — Recurrent and transformer memory

Use sequence memory for:

- Boss attack cycles
- Enemy cooldown inference
- Build history
- Repeated failure avoidance
- Long-run pacing
- Partial observability in pixel-only mode

### 38.8 Stage 8 — World-model acceleration

A learned world model may eventually support:

- Cheap imagined rollouts
- Draft counterfactuals
- Rare-failure search
- Strategy planning
- Automatic scenario generation

The real simulator remains the authority. A world model can propose tests but cannot certify the game.

### 38.9 Population-based training

Maintain a population with different:

- Reward weights
- Risk tolerance
- Mechanics preference
- Model architectures
- Difficulty specialization
- Exploration behavior

Periodically copy and mutate successful configurations.

### 38.10 Quality-diversity training

Optimize not only for highest score but for a map of useful behavior:

- Highest parry rate
- Highest aerial time
- Lowest damage taken
- Fastest boss kill
- Most build diversity
- Most unique mechanics used
- Strongest recovery
- Highest no-dash performance
- Highest no-throw performance

This creates a library of specialists that can test more of Tear.

### 38.11 Adversarial scenario generator

A separate generator should search for scenarios that cause competent agents to fail while remaining legal and fair.

It can vary:

- Enemy composition
- Spawn timing
- Positions
- Affixes
- Platform layout parameters
- Projectile timing
- Boss add timing
- Hazard overlap

Its objective is not to make impossible rooms. It should maximize informative difficulty under gameplay constraints.

---

## 39. Complete Agent Fleet and Player Personas

Perfect playtesting requires agents that represent different players and different QA missions.

### 39.1 Core competency agents

| Agent | Mission |
|---|---|
| Journey Champion | Complete full modes with maximum reliability |
| Representative Player | Approximate intended competent human play |
| Novice | Expose onboarding, readability, and accessibility problems |
| Developing Player | Test mid-skill progression and difficulty curve |
| Extreme Specialist | Test peak conventional difficulty |
| One-Hit Specialist | Test fairness and no-contact viability |

### 39.2 Mechanical specialists

| Agent | Mission |
|---|---|
| Blade Technician | Exercise momentum, tether, throw, recall, and edge cases |
| Parry Specialist | Maximize projectile interactions and timing coverage |
| Aerial Specialist | Exercise launch, juggle, Updraft, and air-time systems |
| Slam Specialist | Exercise downward dash, slam, Power Slam, floor interactions |
| Movement Specialist | Stress platforms, dash steering, drop-through, and bounds |
| Boss Specialist | Achieve high boss-phase coverage and deterministic clears |

### 39.3 Build specialists

- Damage optimizer
- Sustain optimizer
- Defense optimizer
- Crowd-control optimizer
- Style optimizer
- Throw build
- Parry build
- Aerial build
- Minimal-upgrade challenge agent
- Random legal build agent

### 39.4 QA adversaries

| Agent | Mission |
|---|---|
| Chaos Bot | High-entropy but legal action combinations |
| Exploit Hunter | Seek score, invulnerability, collision, and progression exploits |
| Softlock Hunter | Seek states where progress cannot continue |
| Boundary Hunter | Stress world bounds, platforms, void, and overscan |
| Transition Hunter | Stress pause, death, wave, boss, draft, and menu transitions |
| Economy Attacker | Seek duplicate rewards, negative balances, and save manipulation bugs |
| Replay Breaker | Seek unreplayable or desynchronized runs |

### 39.5 Input and hardware personas

- Keyboard-only accessibility profile
- Standard mouse profile
- Low-sensitivity mouse
- High-sensitivity mouse
- Controller Default preset
- Every additional controller preset
- Stick-drift profile
- High-deadzone profile
- Touch radial-stick profile
- Touch relative-drag profile
- Small-screen profile
- High input-latency profile
- Intermittent input-loss profile

### 39.6 Performance personas

- 30 FPS constrained
- 45 FPS unstable
- 60 FPS baseline
- 120 FPS
- 144+ FPS
- Periodic long frame
- CPU-constrained
- GPU/effects-constrained
- Background-tab pause and resume
- Device orientation or viewport change where supported

### 39.7 Behavioral personas

- Cautious
- Aggressive
- Greedy for score
- Style-focused
- Speedrunner
- Completionist
- Defensive parry player
- Throw-heavy player
- Low-mechanics player
- Panic-input player
- Hesitant menu user

### 39.8 Human-likeness agent

A champion that uses frame-perfect privileged knowledge can prove mechanical possibility but may hide human-facing problems.

The Human-Likeness Agent should enforce:

- Reaction delay distribution
- Limited observation
- Input noise
- Nonzero decision latency
- No hidden state
- Human-range action frequency
- Imperfect but coherent execution

Balance decisions should use both champion and human-like populations.

---

## 40. Scenario Generation, Mutation, and Coverage Intelligence

### 40.1 Authored canonical scenarios

Every mechanic and bug class should have a small stable seed set.

Benefits:

- Deterministic branch comparison
- Fast local execution
- Reproducible balance discussion
- Historical trend tracking

### 40.2 Procedural scenario mutation

Mutate within legal ranges:

- Enemy type and count
- Variant and affix
- Spawn side and height
- Spawn interval
- Player HP
- Player velocity
- Blade state
- Draft build
- Platform layout
- Boss phase
- Projectile timing
- Difficulty
- Frame pacing
- Input latency

### 40.3 Pairwise and combinatorial coverage

Full Cartesian coverage is often impossible.

Use pairwise or constrained combinatorial generation to cover interactions such as:

```text
mode × difficulty
mode × input device
difficulty × enemy family
ability × enemy variant
boss phase × build family
frame rate × dash direction
graphics setting × biome
pause timing × transition state
```

### 40.4 Rare-state bank

Persist rare states discovered from:

- Human replays
- Agent failures
- Production telemetry
- Exploit reports
- Fuzzing
- Branch regressions

Examples:

- Root expires during down-dash
- Boss dies during add spawn
- Player takes lethal damage during wave-clear pause
- Draft opens while a delayed projectile remains
- Blade is stolen during stage transition
- Controller disconnects while draft is focused
- Service worker serves mixed asset versions

### 40.5 Replay mining

Convert real player runs into test candidates.

Automatically detect:

- Unusual death clusters
- Long no-progress periods
- High-damage spikes
- Rare mechanic sequences
- Unexpected score jumps
- Repeated pause/resume
- Replay divergence
- Impossible movement

### 40.6 Diff-aware scenario selection

A coding agent should not run every expensive test for every edit.

Map files and functions to feature domains.

Examples:

```text
js/player.js
  -> movement, damage, dash, platform, all-mode smoke

js/blade.js
  -> all blade mechanics, parry, boss, replay, controller aim

js/game.js draft functions
  -> wave transition, draft UI, build application, full-journey smoke

js/gamepad.js
  -> every menu route, every controller preset, pause, draft, scrolling, tabs

js/stages.js
  -> traversal, biome visuals, boss arenas, campaign, replay
```

An LLM or static dependency mapper can propose the suite, but deterministic ownership rules should provide the safety floor.

### 40.7 Coverage model

Track coverage across:

- Code
- State transitions
- Mechanics
- Enemy attacks
- Enemy combinations
- Boss phases
- Draft choices
- Ability tiers
- Modes
- Difficulties
- Input devices
- Graphics settings
- Browser and platform profiles
- Save and account states

### 40.8 Coverage heatmap

The dashboard should expose gaps plainly:

```text
Boss: The Source
  Normal: 100% phase coverage
  Hard: 92%
  Extreme: 67%
  One-Hit: 31%

Controller Preset: Tear
  Main menu: covered
  Draft tabs: uncovered
  Replay scrubber: partial
```

---

## 41. Perfect QA Domain Matrix

Autonomous playtesting should validate far more than combat success.

### 41.1 Gameplay correctness

- Movement
- Collision
- Dash
- Blade physics
- Damage
- Parry
- Throw and recall
- Enemy behavior
- Boss behavior
- Hazards
- Platforms
- Wave spawning
- Wave clearing
- Drafting
- Upgrades
- Tier evolution
- Victory and defeat

### 41.2 UI and navigation

- Main menu
- Mode selection
- Difficulty selection
- Settings
- Profile
- Achievements
- Leaderboards
- Replays
- Drafts
- Pause
- Defeat
- Continue
- Ending
- Summary
- Scrollable lists
- Tabs
- Back behavior
- Focus visibility

### 41.3 Input parity

- Keyboard
- Mouse
- Pointer lock
- Controller
- Every controller preset
- D-pad
- Left stick
- Right-stick blade
- Shoulder tab navigation
- Right-stick scrolling
- Touch buttons
- Touch aim modes
- Cursor hide and reactivation behavior

### 41.4 Difficulty and balance

- Modifier application
- Reward scaling
- Completion curves
- Build viability
- Telegraph fairness
- Enemy density
- Boss pressure
- One-Hit semantics

### 41.5 Progression and economy

- Coins
- Shards
- Achievements
- Daily challenges
- Shop upgrades
- High scores
- Leaderboard submissions
- Reward duplication prevention
- Save compatibility
- Cloud merge behavior
- Guest-to-account migration

### 41.6 Replay and Ghost

- Command, State, and Visual Replay Trident coverage
- Action trace integrity
- Initial-state and checkpoint reconstruction
- Record-to-replay, seek, fork, export/import, and migration round trips
- Named RNG stream restoration and cursor validation
- Canonical state hashes and first-drift diagnosis
- Stage changes and runtime world mutation
- Stable enemy, projectile, hazard, and platform identity
- Deaths and causal kill chains
- Versioned event ontology and typed payloads
- Draft offers, selections, tiers, and build trajectory
- Replay quality dimensions and honest fidelity classification
- Ghost Lens capability and privacy gating
- Seeking, frame step, loop ranges, and event-aligned navigation
- Playback speeds and camera modes
- Chapter and semantic event markers
- Non-destructive Studio edit lists and parent attribution
- Practice-from-here safety classes and eligibility firewall
- Vault health, crash journal, repair, quarantine, export, and import
- Ghost Canon, Graveyard, Frontier, and Corpus governance
- Structured agent decision traces and observation-class labels
- Timeline, action, state, build, and RNG minimization
- Replay-to-scenario and scenario-to-replay compilation
- N-way and event-aligned comparison
- Long-run size, recorder overhead, backpressure, and adaptive degradation
- Cloud upload atomicity, resumability, deletion, and partial-download safety
- Competitive verification and result-ledger integrity
- Cross-version compatibility and historical runtime fallback
- Parser fuzzing, decompression limits, and malicious replay quarantine

### 41.7 Audio

- Initialization
- Mute state
- Music state
- Pause/resume
- Ad mute hooks
- Boss transitions
- Parry, damage, death, wave, draft, and victory cues
- TearScore lifecycle where enabled
- No duplicate or runaway audio nodes

### 41.8 Visual presentation

- Player and blade readability
- Telegraph visibility
- HUD contrast
- Overscan
- Safe areas
- Fullscreen
- Graphics quality
- Effects density
- Stage transitions
- Boss theater
- Draft readability
- Menu focus
- No stale frames or blank canvas

### 41.9 Performance and stability

- Frame time
- Long-frame count
- Memory growth
- Entity count
- Particle count
- Audio node count
- Garbage-collection stalls
- Long Endless and Gauntlet stability
- Pause/resume stability
- Repeated run stability

### 41.10 Browser and deployment

- Standalone site
- CrazyGames iframe
- PWA
- Service worker cache version
- Offline/online transition
- Fullscreen API
- Pointer lock
- Device pixel ratio
- Resize
- Safe-area insets

### 41.11 Network and account integration

- SDK unavailable
- Slow SDK initialization
- Cloud unavailable
- Login state changes
- Guest mode
- Account mode
- Leaderboard failure
- Replay upload failure
- Remote-config variation
- Retry behavior

### 41.12 Interruption resilience

- Window blur
- Escape/pointer-lock loss
- Pause during wave
- Pause during boss intro
- Pause during draft
- Tab backgrounding
- Controller disconnect
- Touch interruption
- Ad start and end
- Network drop

### 41.13 Security and exploit resistance

- Invalid save values
- Duplicate event delivery
- Replay tampering detection where applicable
- Impossible leaderboard submissions
- Infinite score loops
- Infinite coins or shards
- Invulnerability loops
- Out-of-bounds attacks
- Boss skip
- Draft duplication

---

## 42. Spectator, Explainability, and Agent Evolution UI

The user explicitly wants to watch agents learn and play. This should become a first-class developer experience.

### 42.1 Live Agent HUD

Optional overlay fields:

```text
AGENT: Champion v14
MODE: Adventure / Hard
GOAL: Clear wave 7
TACTIC: isolate ranged -> parry shot -> slam armored
TARGET: ranged#42
THREAT: bomb#81 impact in 0.63s
BLADE INTENT: counterclockwise launch arc
MOVE INTENT: up-right dash
DRAFT PLAN: sustain > crowd control > boss damage
CONFIDENCE: 0.78
POLICY STATE: tactical-combat
BENCHMARK: stage-clear-hard
```

### 42.2 Draft explanation panel

Example:

```text
1. Riposte T2       8.7
   + Extreme survivability
   + 14 projected projectile encounters
   + synergy with Tempo

2. Whetstone        6.2
   + boss damage
   - current throw usage is low

3. Bounty Hunter    3.8
   + score
   - does not improve completion probability

SELECTED: Riposte T2
```

### 42.3 Training progression view

Show:

- Lesson completion
- Success-rate trend
- Seed generalization
- Failure categories
- Reward components
- Human corrections
- Policy version comparison
- Promotion status

### 42.4 Replay overlays

Replay should display:

- Agent objective timeline
- Action confidence
- Threat predictions
- Draft scores
- Invariant warnings
- Policy handoffs
- Divergence from baseline

### 42.5 Side-by-side branch theater

Render base and candidate branches using:

- Same seed
- Same policy
- Same initial build
- Synchronized time

Highlight:

- Position divergence
- Enemy divergence
- Damage divergence
- Timing divergence
- Visual divergence
- Draft divergence

### 42.6 Agent tournament

Run policies against a benchmark suite and rank them by multiple metrics.

Do not collapse to one score. Show:

- Completion
- Safety
- Speed
- Style
- Coverage
- Human-likeness
- Recovery
- Exploit incidents

### 42.7 Champion / challenger model

- Champion: current trusted policy used for release baselines
- Challenger: new policy seeking promotion
- Safety baseline: scripted deterministic policy
- Human-like baseline: constrained representative policy

A challenger becomes champion only after passing all required suites without losing critical coverage.

---

## 43. Autonomous Diagnosis and Developer Assistance

The system should not stop at “test failed.”

### 43.1 Failure classification

Classify into:

- Product crash
- Product softlock
- Product logic regression
- Product balance regression
- Product visual regression
- Product performance regression
- Input integration failure
- Network or platform failure
- Policy competency failure
- Policy out-of-distribution failure
- Test infrastructure failure
- Nondeterministic inconclusive result

### 43.2 Multi-policy adjudication

When one policy fails:

1. Re-run same seed with the champion.
2. Re-run with scripted baseline.
3. Re-run with a specialist.
4. Re-run base branch.
5. Compare state traces.

Interpretation:

- Every policy fails only on candidate branch: likely product regression.
- One policy fails on both branches: likely policy weakness.
- Pixel agent fails but structured agent passes: likely UI or visual integration issue.
- Structured agent fails but black-box agent passes: likely instrumentation issue.

### 43.3 Automatic root-cause hints

Use:

- First divergent state
- First divergent event
- First invariant violation
- Changed files
- Feature ownership map
- Stack traces
- Replay timeline
- State snapshots

Example:

```text
Likely cause: one-way platform collision branch
First divergence: frame 1842
Candidate: player.onGround=false, y=612.4
Baseline: player.onGround=true, y=559.0
Trigger: down buffer remained active 0.07s after curved dash
Relevant changes: js/player.js lines ...
Confidence: high
```

### 43.4 Automatic commit bisection

For reproducible failures:

- Run the minimized trace against historical commits.
- Identify first bad commit.
- Attach comparison artifacts.

### 43.5 Counterfactual balance lab

For a balance regression, automatically test candidate tuning adjustments in isolated branches or runtime overrides.

Example:

```text
Observed: Extreme completion fell from 48% to 17%
Counterfactuals:
- projectile speed -8% -> 35%
- concurrent cap -1 -> 42%
- enemy HP -6% -> 24%
Best targeted recovery: concurrent cap -1
```

The system may recommend changes. It must not silently rewrite balance.

### 43.6 Natural-language reports

The agent Skill should produce a direct report:

```text
The new Rootbinder implementation is not release-ready.

It passes isolated tether behavior and Normal wave tests, but Hard and Extreme full-stage runs show a new softlock when the player kills the Rootbinder during tether break. The wave remains active with zero living enemies in 7 of 100 seeds.

Minimal reproduction: 38 actions, seed 882901.
The failure begins when tether cleanup runs after enemy death but before wave accounting.
```

---

## 44. Test Scheduling and Release Gates

### 44.1 Local developer suite

Target:

- Seconds to a few minutes

Includes:

- Boot
- Main-menu route
- Changed-feature scenarios
- One full wave
- Draft transition
- Relevant invariants

### 44.2 Pull-request suite

Includes:

- Diff-selected scenarios
- All critical smoke tests
- Base-versus-branch comparison
- Representative input profile
- One finite-mode checkpoint
- Artifact upload on failure

### 44.3 Nightly suite

Includes:

- Large deterministic seed bank
- All difficulties
- All modes
- Multi-agent population
- Visual snapshots
- Performance runs
- Fuzzing
- Replay compatibility

### 44.4 Weekly endurance suite

Includes:

- Long Endless runs
- Long Gauntlet runs
- Repeated run loops
- Memory tracking
- Browser matrix
- Network interruptions
- PWA and portal contexts

### 44.5 Release-candidate suite

Non-negotiable gates:

- Full Adventure clear from menu to menu on Easy and Normal
- Targeted Adventure clears on Hard and Extreme according to release policy
- One-Hit fairness suite
- Tutorial full completion
- Boss Test full completion
- Endless endurance target
- Gauntlet boss-cycle target
- Every controller preset menu and gameplay smoke
- Touch smoke
- No critical invariant failure
- No unreconciled branch regression
- Replay and progression validation

### 44.6 Statistical confidence

Single successful runs are weak evidence.

Reports should include:

- Episode count
- Seed count
- Completion rate
- Confidence interval
- Median and tail outcomes
- Failure clustering
- Policy versions
- Environment version

### 44.7 Flake policy

A flaky gameplay failure is still a failure until classified.

Track:

- Reproduction frequency
- Seed dependency
- Platform dependency
- Timing dependency
- Policy dependency

Do not hide nondeterminism behind automatic retries. Retries gather evidence; they do not erase the first result.

---

## 45. Expanded TearBench Tool and Skill Surface

The reusable agent Skill should expose full-journey operations.

### 45.1 Journey tools

```text
tear_boot
tear_get_screen
tear_get_ui_tree
tear_navigate_to_mode
tear_select_difficulty
tear_start_run
tear_watch_run
tear_run_full_journey
tear_return_to_menu
```

### 45.2 Gameplay tools

```text
tear_observe
tear_step
tear_run_action_batch
tear_load_scenario
tear_set_policy
tear_list_policies
tear_get_policy_capabilities
```

### 45.3 Draft tools

```text
tear_get_draft
tear_score_draft
tear_select_draft
tear_get_build
tear_compare_build_paths
```

### 45.4 Certification tools

```text
tear_certify_tutorial
tear_certify_adventure
tear_certify_endless
tear_certify_gauntlet
tear_certify_boss_test
tear_certify_enemy_test
tear_certify_input_profile
tear_certify_difficulty_curve
```

### 45.5 Failure tools

```text
tear_get_failure
tear_reproduce_failure
tear_minimize_failure
tear_compare_failure_to_base
tear_bisect_failure
tear_open_replay
tear_export_bug_report
```

### 45.6 Analytics tools

```text
tear_get_coverage
tear_get_difficulty_report
tear_get_balance_report
tear_get_performance_report
tear_get_policy_report_card
tear_compare_policies
tear_compare_branches
```

### 45.7 CLI examples

```bash
tearbench journey --mode campaign --difficulty normal --policy champion --visible
tearbench journey --mode tutorial --input controller-default --black-box
tearbench certify adventure --difficulties easy,normal --episodes 50
tearbench certify difficulty-curve --mode campaign --population representative
tearbench certify gauntlet --boss-cycles 2 --difficulty hard
tearbench draft compare --state artifacts/run-882901-wave-6.json
tearbench watch --run artifacts/runs/tb-20260722-882901
tearbench compare main HEAD --suite full-journey
tearbench fuzz transitions --episodes 10000
tearbench minimize artifacts/failures/882901.json
tearbench bisect artifacts/failures/882901-min.json
```

### 45.8 Skill behavior for coding agents

When code changes affect gameplay, UI, controls, progression, or rendering, the Skill should:

1. Inspect changed files.
2. Map changes to feature domains.
3. Select minimum required suites.
4. Run fast engineering tests.
5. Run relevant end-to-end journey checkpoints.
6. Compare against base.
7. Investigate failures.
8. Minimize reproducible failures.
9. Re-run after fixes.
10. Report exact evidence and remaining risk.

The Skill must never claim “tested” when it only ran a unit test unrelated to the real player journey.

---

## 46. Expanded Repository Architecture

```text
js/
  test/
    bridge.js
    ui-tree.js
    events.js
    contracts.js
    seeded-rng.js
    snapshots.js
    physical-input-adapters.js

  agents/
    journey-director.js
    menu-navigator.js
    scripted-combat.js
    blade-motor.js
    movement-controller.js
    draft-strategist.js
    recovery-controller.js

  game.js
  input.js
  gamepad.js
  ghost.js
  player.js
  blade.js

packages/
  tearbench-core/
    src/
      orchestrator.ts
      journey.ts
      observations.ts
      actions.ts
      policies.ts
      certification.ts
      contracts.ts
      coverage.ts
      artifacts.ts

  tearbench-browser/
    src/
      playwright-runner.ts
      physical-input.ts
      black-box-observer.ts
      visual-capture.ts

  tearbench-sim/
    src/
      headless-runner.ts
      worker-pool.ts
      fixed-step.ts

  tearbench-cli/
    src/
      commands/
        journey.ts
        certify.ts
        compare.ts
        fuzz.ts
        minimize.ts
        bisect.ts
        watch.ts

  tearbench-dashboard/
    src/
      live-agent-view/
      coverage/
      difficulty/
      balance/
      replay-diff/
      policy-academy/

ml/
  datasets/
  configs/
  checkpoints/
  registry/
  train_behavior_cloning.py
  train_offline_rl.py
  train_online_rl.py
  train_motor_policy.py
  train_tactical_policy.py
  train_draft_policy.py
  evaluate.py
  export_policy.py

scenarios/
  boot/
  menu/
  tutorial/
  movement/
  blade/
  enemies/
  bosses/
  drafts/
  transitions/
  progression/
  performance/
  deployment/
  rare-states/

contracts/
  gameplay/
  difficulty/
  modes/
  progression/
  intentional-exceptions/

policies/
  scripted/
  champion/
  challenger/
  human-like/
  specialists/
  adversarial/

skills/
  tear-autonomous-playtester/
    SKILL.md
    references/
    scripts/
    templates/

.github/workflows/
  tearbench-pr.yml
  tearbench-nightly.yml
  tearbench-endurance.yml
  tearbench-release.yml
```

### 46.1 Policy registry

Each policy should be immutable and versioned with:

- Policy ID
- Model hash
- Training dataset hash
- Environment commit
- Observation schema version
- Action schema version
- Reward configuration
- Curriculum version
- Benchmark results
- Promotion status
- Known weaknesses

### 46.2 Contract registry

Every expected rule should have:

- Stable ID
- Description
- Severity
- Relevant modes and difficulties
- Detection logic
- Intentional exceptions
- Tests
- Owner

### 46.3 Scenario registry

Every scenario should have:

- ID
- Version
- Seed
- Initial state
- Expected outcomes
- Required coverage
- Compatible policies
- Execution class
- Maximum duration

---

## 47. Revised Implementation Roadmap for Full Autonomy

This roadmap extends the earlier implementation phases. The immediate priority is now an observable menu-to-mode journey, not isolated combat alone.

### Milestone A — End-to-end UI control foundation

Deliver:

- Stable screen IDs
- Semantic UI tree
- Physical input adapters
- Menu Navigator
- Main menu -> mode -> difficulty -> start route
- Draft selection route
- Post-run return route

Acceptance:

- Agent can traverse every menu route with mouse and controller
- No direct state mutation in certification mode

### Milestone B — Real-wave autonomous clear

Deliver:

- Full-game synthetic input channel
- Structured observations
- Fixed-step deterministic simulation
- Scripted combat baseline using real enemies
- Wave watchdog and invariants

Acceptance:

- Agent starts from main menu and clears wave 1 on Easy and Normal

### Milestone C — Autonomous drafting

Deliver:

- Draft observation schema
- Heuristic Draft Strategist
- Real draft UI selection
- Build tracking
- Draft replay events

Acceptance:

- Agent clears wave 1, selects a legal pick, and clears wave 2

### Milestone D — Full stage clear

Deliver:

- Enemy roster competency
- Boss specialist modules
- Boss phase observations
- Tier evolution strategy
- Stage transition watchdogs

Acceptance:

- Agent completes one full nine-wave stage, boss, and evolution from the main menu

### Milestone E — Adventure Easy clear

Deliver:

- Long-horizon Journey Director
- Build memory
- All biome and boss policies
- Recovery controller
- Full replay and report

Acceptance:

- Visible menu-to-menu Adventure victory on Easy across stable seed targets

### Milestone F — Adventure Normal certification

Deliver:

- Improved human demonstrations
- Behavior-cloned tactical and motor policies
- DAgger correction pipeline
- Multi-seed full-campaign evaluation

Acceptance:

- Statistically reliable visible Adventure Normal completion

### Milestone G — Difficulty-aware mastery

Deliver:

- Difficulty conditioning
- Specialist population
- Fairness metrics
- Difficulty curve dashboard
- Hard, Extreme, and One-Hit curricula

Acceptance:

- Defined stage and mode targets achieved for each difficulty

### Milestone H — All-mode certification

Deliver:

- Tutorial contract
- Endless milestones
- Gauntlet boss-cycle milestones
- Playground automation
- Boss Test completion
- Enemy Test coverage

Acceptance:

- Every valid mode has an explicit certified status

### Milestone I — Black-box certification

Deliver:

- Pixel observer
- Physical keyboard/mouse/controller/touch drivers
- Render-state parity checks
- Human-likeness agent

Acceptance:

- Full visible journey succeeds without privileged gameplay state

### Milestone J — Autonomous regression intelligence

Deliver:

- Branch comparison
- Automatic minimization
- Multi-policy adjudication
- Failure classification
- Commit bisection
- Natural-language diagnosis

Acceptance:

- A gameplay regression introduced on a test branch is found, minimized, attributed, and reported automatically

### Milestone K — Perfect playtesting operations

Deliver:

- PR, nightly, endurance, and release suites
- Agent dashboard
- Policy registry
- Coverage heatmap
- Champion/challenger promotion
- Agent Skill integration

Acceptance:

- TearBench becomes a mandatory and trusted part of Tear development

---

## 48. Expanded Definition of Perfect Autonomous Playtesting

“Perfect” does not mean zero bugs forever. That is not a realistic engineering claim.

For TearBench, perfect autonomous playtesting means the system is designed to maximize trustworthy coverage and minimize blind spots through independent methods.

It must:

- Play the real game from the main menu.
- Complete full player journeys.
- Understand every mode and difficulty.
- Make coherent draft choices.
- Defeat bosses and finish finite modes.
- Endurance-test infinite modes.
- Use multiple input devices.
- Validate visible output, not only internal state.
- Represent novice, median, expert, and adversarial players.
- Detect crashes, softlocks, exploits, regressions, unfairness, and performance decay.
- Reproduce failures deterministically.
- Minimize failures automatically.
- Compare branches objectively.
- Distinguish game failure from agent failure.
- Explain what happened.
- Preserve evidence.
- Improve from human demonstrations and discovered failures.
- Remain auditable through versioned policies, contracts, datasets, and scenarios.
- Start instantly from any wave, draft, boss phase, attack frame, ability boundary, UI state, device state, or integration state.
- Reconstruct a legal prior run history and exact earned loadout for arbitrary late-game states.
- Distinguish recorded, reachable, plausible, surgical, and intentionally impossible states.
- Provide calibrated TearBot Levels 1–9 whose performance bands are measured rather than guessed.
- Improve agent policies through a gated champion/challenger loop without redefining its own tests.

The 500%-beyond-goal outcome is:

> Tear does not merely have an AI that can play it. Tear has a continuously improving digital population of players, specialists, critics, and adversaries that can operate the entire shipped experience, certify changes, expose design weaknesses, pressure-test balance, generate minimal bug reproductions, and visibly demonstrate why a build is or is not ready.



---

## 49. Any-Point Simulation Is a Non-Negotiable Capability

Full-journey autonomy and arbitrary-state simulation are complementary requirements.

TearBench must support both:

1. **Journey execution** — visibly boot *Tear*, navigate the real interface, select a mode, difficulty, and weapon, play complete runs, draft, defeat bosses, process results, and return to the menu.
2. **State-forged execution** — begin instantly at any requested game situation with a state that is exact, legal, reproducible, and representative of the history a real player would have accumulated before reaching it.

A system that can only start from wave 1 is too slow and too blunt for serious development testing. A system that can only inject arbitrary values is also insufficient because it can silently create impossible combinations that never occur in real play.

The correct target is a **state-forging and temporal simulation platform** that can create, validate, serialize, restore, mutate, and fork any relevant *Tear* situation.

### 49.1 Canonical example: wave 99 on Hard

The following request must be a routine one-line operation:

> Start Endless at wave 99 on Hard with the Hammer and a historically plausible build that contains exactly the number and type of draft and tier selections a real player would have earned by wave 99. Give the player a plausible current HP, score, elapsed time, style history, economy state, and run ledger. Then let Bot Level 7 play ten seeded versions of the wave.

TearBench must not approximate this by assigning a random pile of upgrades.

It must:

- Ask the real progression scheduler which draft, boss, tier, reward, and stage events would have occurred before wave 99.
- Generate or replay one legal choice at every opportunity.
- Enforce unique-upgrade rules.
- Enforce Special-offer cadence and tier-evolution rules.
- Apply the chosen weapon first in the same order as a real run.
- Apply meta progression and run upgrades through their actual implementation functions.
- Reconstruct every mutated configuration value by replaying the real effects rather than directly guessing final numbers.
- Apply Hard-mode scaling through the same production path.
- Generate a run ledger explaining every choice and derived value.
- Produce a reachability and plausibility report.
- Save the exact RNG state and scenario seed.
- Launch the requested wave without simulating the prior 98 waves in real time.

### 49.2 Arbitrary situations that must be expressible

TearBench must be able to begin from any of the following:

- Main menu
- Mode-selection menu
- Difficulty-selection menu
- Weapon-selection menu
- First frame of a run
- Any wave number
- Any stage or biome
- Any point in the spawn queue
- Any draft screen
- Any specific three-card draft offer
- Any post-boss tier-evolution screen
- Any boss intro
- Any boss phase
- Any boss attack windup
- Any boss death sequence
- Any mode-completion sequence
- Any defeat or continue screen
- Any pause or settings state
- Any replay-viewer state
- Any cloud, account, leaderboard, or offline state
- Any input-device state
- Any viewport, safe-area, graphics, or frame-rate state
- Any player position, velocity, health, dash, shield, revive, rally, invulnerability, or status state
- Any blade position, velocity, tip speed, throw state, recall state, embed state, hostile state, or stolen state
- Any enemy roster, enemy variant, affix, HP, attack state, stun, status, or spatial arrangement
- Any projectile roster, ownership, deflection state, trajectory, or collision timing
- Any platform, temporary wall, slow zone, hazard, void-scroll, crumble, fire, cage, or rescue state
- Any weapon and legal upgrade/tier combination
- Any deliberately illegal or adversarial combination used for robustness testing

### 49.3 Five classes of forged state

Every scenario must declare its state class.

#### Class A — Recorded canonical state

A byte-equivalent or semantically equivalent snapshot captured from a real run.

Use for:

- Exact bug reproduction
- Branch comparison
- Replay forks
- Regression certification

#### Class B — Reconstructed reachable state

A state synthesized by replaying a valid progression ledger and production mutation paths.

Use for:

- Wave 99 testing
- Late-game build testing
- Boss practice with legitimate progression
- Balance evaluation

#### Class C — Plausible population state

A legal state sampled from a human or agent population model. It is reachable, but the exact earlier action trace may not be materialized unless requested.

Use for:

- Median-player simulation
- Build-distribution testing
- Realistic current-health and economy distributions
- Large-scale balance studies

#### Class D — Surgical valid state

A state that satisfies engine invariants but may be extremely unlikely to occur naturally.

Use for:

- Exact collision timing
- One-frame parry tests
- Rare ability interactions
- Performance stress

#### Class E — Adversarial impossible state

A deliberately invalid or unreachable situation used to test defensive programming, cleanup, recovery, and corruption handling.

Use for:

- Duplicate unique abilities
- Contradictory boss phases
- Missing entity owners
- Malformed snapshots
- Impossible cooldowns
- Corrupted save data

Class E results must never be mixed into balance or fairness conclusions.

### 49.4 Acceptance standard

The arbitrary-state system is not complete until the following works reliably:

```bash
tearbench forge \
  --mode endless \
  --difficulty hard \
  --wave 99 \
  --weapon hammer \
  --history plausible-human-p50 \
  --build auto \
  --seed 990042 \
  --agent tearbot-7 \
  --episodes 10 \
  --watch
```

The command must produce:

- A legal run state
- A complete synthetic progression ledger
- The exact number of earned selections
- A config-derivation trace
- A reachability score
- A population-plausibility score
- A visible playable episode
- A replay and state snapshot
- Episode metrics and failures

---

## 50. Tear State Forge

The subsystem responsible for arbitrary-state simulation should be named **Tear State Forge**.

State Forge is not a loose set of debug cheats. It is a deterministic state-construction engine with a formal schema, provenance, validation, and version migration.

### 50.1 Core components

State Forge should contain:

1. **State Schema Registry** — versioned definitions for every serializable field.
2. **Runtime Serializer** — captures the complete live simulation state.
3. **Runtime Restorer** — reconstructs that state without leaking stale objects or listeners.
4. **Progression Ledger Engine** — represents everything that happened before the state.
5. **Historical Run Synthesizer** — generates legal prior progression.
6. **Config Rebuilder** — restores base configuration and reapplies mutations in production order.
7. **Entity Factory** — creates players, enemies, bosses, projectiles, hazards, and platforms in exact substates.
8. **RNG Chronicle** — records and restores every deterministic random stream.
9. **Reachability Validator** — proves whether the state could occur under current rules.
10. **Plausibility Model** — estimates how representative it is of real players.
11. **Scenario Compiler** — converts YAML, JSON, or natural language into a state plan.
12. **Fork Manager** — clones a state for controlled counterfactual experiments.
13. **Schema Migrator** — upgrades saved states after the game changes.
14. **State Diff Engine** — compares two states semantically rather than only byte-by-byte.
15. **Artifact Packager** — saves the state, ledger, seed, video, metrics, and provenance together.

### 50.2 Complete state domains

A complete state snapshot must include more than entities visible on screen.

#### Simulation clock

- Simulation tick
- Fixed timestep
- Accumulator remainder
- Run time
- Wave time
- State-entry time
- Slow-motion timers
- Hit-stop timers
- Pause state
- Browser clock emulation state

#### Global game state

- Current state-machine state
- Previous state
- Pending transition
- Menu selection and scroll positions
- UI buttons and overlays
- Lore cards and holds
- Boss-theater state
- Wipe and transition effects
- Current mode, difficulty, weapon, and stage

#### Player

- Position and previous position
- Velocity
- Facing
- Grounded state
- Collision contacts
- Health and max health
- One-hit flag
- I-frame timer
- Dash timer, cooldown, direction, and charges
- Coyote and jump-buffer timers
- Shield count and maximum
- Root, slow, guard, rally, tempo, hazard, and void states
- Revive pools
- Air time
- Last trick and trick timestamp
- Any future status or resource fields

#### Blade

- Hilt and tip positions
- Previous positions
- Linear and angular velocity
- Tip speed
- Aim target
- Aim mode
- Tether state
- Held, thrown, returning, embedded, stolen, or hostile state
- Throw lifetime
- Recall eligibility
- Pierced enemies
- Weapon model and throw type
- Hit cooldowns
- Collision history needed for the next frame

#### Run progression

- Wave
- Stage index
- Score
- Multiplier and style gauge
- Wave kills
- Total kills
- Spawn queue and spawn timer
- Wave-active state
- Special-offer counters
- Draft and tier choices
- Current mods object
- Owned abilities
- Ability tiers
- Per-run difficulty multipliers
- Coin and score modifiers
- Run-specific boss and mode state
- Achievement-tracking eligibility
- Daily and challenge progress

#### World

- Platforms
- One-way flags
- Dynamic platform runtime fields
- Temporary walls
- Slow zones
- Hazard zones
- Void-scroll state
- Broken platforms
- Stage palette and environment state
- Camera zoom and framing
- Screen shake and flash

#### Enemies and bosses

- Concrete class or type
- Stable entity ID
- Variant and affixes
- Position and velocity
- Health and maximum health
- Contact damage
- Current finite-state-machine node
- Attack cooldowns
- Windup timers
- Target
- Stun and invulnerability
- Status effects and stacks
- Boss phase and phase-local variables
- Spawn animation state
- Death state
- Ownership and summon relationships
- AI memory and pathing state

#### Projectiles and transient combat objects

- Type
- Stable ID
- Owner
- Position and velocity
- Lifetime
- Damage
- Radius
- Deflectability
- Deflected state
- Homing target
- Bounce count
- Bomb or mine phase
- Collision exclusions
- Any future beam, tether, or area-effect state

#### External and platform context

- Input device
- Control mode
- Mouse-lock state
- Touch-control layout
- Gamepad mapping
- Viewport dimensions
- Device-pixel ratio
- Overscan and safe areas
- Graphics quality
- Audio state
- PWA or iframe environment
- Cloud-provider state
- Network availability
- Ad interruption state
- Local and cloud storage fixtures

### 50.3 Provenance block

Every forged state must carry immutable provenance:

```json
{
  "schemaVersion": 3,
  "gameCommit": "<sha>",
  "stateClass": "reconstructed-reachable",
  "source": "history-synthesizer",
  "seed": 990042,
  "rngStreams": {
    "progression": "...",
    "combat": "...",
    "draft": "...",
    "cosmetic": "..."
  },
  "mode": "endless",
  "difficulty": "hard",
  "targetWave": 99,
  "historyProfile": "plausible-human-p50",
  "buildProfile": "throw-hybrid",
  "createdBy": "tearbench-state-forge@0.3",
  "reachability": {
    "status": "proven",
    "validatorVersion": 5
  },
  "plausibility": {
    "score": 0.78,
    "populationModel": "telemetry-2026-07"
  }
}
```

### 50.4 State fingerprints

Each state must expose several hashes:

- **Exact hash** — all deterministic fields.
- **Semantic hash** — fields affecting future gameplay.
- **Visual hash** — fields affecting rendered output.
- **Progression hash** — ledger and build history.
- **Environment hash** — device, viewport, integration, and quality context.

This allows TearBench to distinguish a cosmetic difference from a gameplay divergence.

### 50.5 Restore transaction

Restoring a state must be transactional:

1. Stop simulation.
2. Clear transient callbacks and event queues.
3. Restore base configuration.
4. Rebuild weapon and progression effects in canonical order.
5. Recreate world geometry.
6. Recreate entities and stable references.
7. Rebind owner, target, summon, and stolen-blade references.
8. Restore timers and RNG streams.
9. Recreate UI and mode state.
10. Validate invariants.
11. Render one non-advancing verification frame.
12. Compute fingerprints.
13. Resume only if validation passes or the scenario explicitly allows faults.

A failed restore must leave the previous runtime intact or reset cleanly. Partial restoration is unacceptable.

---

## 51. State Reachability, Legality, and Plausibility

The system must distinguish three questions that are easy to conflate:

1. **Is the state structurally valid?**
2. **Could the current game rules produce it?**
3. **Would a real player commonly reach it?**

These are separate outputs.

### 51.1 Structural validity

A structurally valid state satisfies engine invariants such as:

- Every stable ID is unique.
- Every projectile owner exists or is explicitly detached.
- Every stolen blade references a live compatible enemy.
- Health is finite and within an allowed range.
- Timers are finite.
- Platform geometry is finite.
- The player and blade classes match the serialized schema.
- The boss phase exists for that boss.
- A run state contains the required mode-specific fields.
- Unique abilities do not appear twice unless corruption testing is enabled.

### 51.2 Rule reachability

A rule-reachable state has a valid path from a supported run start under current rules.

A reachability proof can be represented as:

- Run setup events
- Wave and boss milestones
- Draft and tier events
- Weapon and meta effects
- State mutations
- Optional compressed action intervals
- Final surgical adjustments that are themselves reachable

The strongest proof is a complete deterministic action trace. For late-game testing this may be unnecessarily large, so TearBench may instead use a verified progression ledger plus a bounded local action trace for the final situation.

### 51.3 Population plausibility

A legal state can still be absurdly unrepresentative.

Examples:

- A wave-99 build containing almost no damage investment
- Full health after a long Extreme run
- A Hammer build dominated by throw-only upgrades if telemetry shows that combination is exceptionally rare
- A player with zero score but dozens of boss kills

The plausibility model should estimate:

- Build likelihood
- HP percentile
- Score percentile
- Elapsed-time percentile
- Skill-event frequencies
- Draft-choice likelihood
- Weapon/build compatibility
- Death-risk percentile
- Player-persona compatibility

### 51.4 Validation report

Each state should generate a report:

```text
STATE VALIDATION
---------------
Structural validity: PASS
Rule reachability: PROVEN
Population plausibility: 0.78 / 1.00
Build legality: PASS
Draft opportunity count: 98 / 98 consumed
Tier opportunity count: 9 / 9 consumed
Unique conflicts: 0
Config reconstruction hash: MATCH
RNG restoration: MATCH
Warnings:
- Current HP is in the lowest 8th percentile for comparable Hard wave-99 runs.
```

### 51.5 Intentional fault budget

Adversarial scenarios must specify exactly which invariants may be violated.

```yaml
faultBudget:
  allow:
    - duplicateUniqueAbility
    - orphanProjectileOwner
  rejectAllOthers: true
```

This prevents a malformed test from accidentally becoming a meaningless pile of unrelated corruption.

---

## 52. Canonical Progression Ledger

The **Canonical Progression Ledger** is the source of truth for everything a run earned before a forged state.

### 52.1 Why formulas are not enough

TearBench must not hardcode assumptions such as “wave 99 means 98 draft picks.”

The exact count can vary by:

- Mode
- Boss schedule
- Draft suppression rules
- Tier-evolution rules
- Special event waves
- Future game updates
- Revive or continuation systems
- Challenge modifiers

Instead, TearBench should invoke the same progression scheduler the game uses and ask it to emit events up to the target point.

### 52.2 Ledger event model

Recommended events:

```text
RUN_CREATED
BASE_CONFIG_RESTORED
MODE_SELECTED
DIFFICULTY_APPLIED
WEAPON_APPLIED
META_UPGRADE_APPLIED
STAGE_ENTERED
WAVE_STARTED
ENEMY_SET_RESOLVED
WAVE_CLEARED
HEAL_APPLIED
DRAFT_ROLLED
DRAFT_PICKED
SPECIAL_ACQUIRED
BOSS_STARTED
BOSS_PHASE_CLEARED
BOSS_DEFEATED
ABILITY_EVOLVED
STAGE_COMPLETED
COINS_AWARDED
SCORE_UPDATED
REVIVE_CONSUMED
MODE_COMPLETED
```

Each event must contain:

- Sequence number
- Simulation or logical time
- Seed and RNG cursor
- Input data
- Output data
- Config diff
- Run-state diff
- Validation hash

### 52.3 Progression-only fast-forward

A new progression mode should advance milestones without resolving combat frames:

```js
TEAR_TEST.synthesizeProgression({
  mode: "endless",
  difficulty: "hard",
  weapon: "hammer",
  to: { wave: 99, moment: "wave-start" },
  historyPolicy: "plausible-human-p50",
  seed: 990042
});
```

This mode should:

- Resolve the event schedule.
- Generate legal draft offers.
- Choose from them using a selected history policy.
- Apply actual upgrade functions.
- Process boss-tier evolution opportunities.
- Generate score, damage, healing, and economy summaries through a calibrated run-history model.
- Avoid creating live enemies until the target state.

### 52.4 Production-order reconstruction

Because Tear mutates `CONFIG` during a run, order matters.

The Config Rebuilder must always:

1. Restore the pristine base config.
2. Apply selected weapon.
3. Apply persistent/meta progression in production order.
4. Apply difficulty and remote modifiers in production order.
5. Replay every draft pick in ledger order.
6. Replay every tier evolution in ledger order.
7. Apply current transient effects.
8. Compare the resulting config hash against the ledger’s expected hash.

Directly assigning final damage, reach, speed, or cooldown values should be prohibited for Class A–C states.

### 52.5 Ledger determinism

Given the same:

- Game commit
- Base config hash
- Mode
- Difficulty
- Weapon
- Progression seed
- History policy version
- Target point

The progression ledger must be identical.

### 52.6 Ledger portability

A ledger is more durable than a raw snapshot because it describes intent.

When upgrade internals change, TearBench can replay the same choices under the new implementation and compare outcomes. This enables true balance counterfactuals:

> What would this exact wave-99 run look like if Keen Edge changed from 12% to 10%?

---

## 53. Historical Run and Build Synthesis

The Historical Run Synthesizer creates the prior history a player would plausibly have accumulated before an arbitrary target state.

### 53.1 Build synthesis modes

At minimum:

#### Exact ledger

Use a user-supplied ordered list of picks and tier evolutions.

#### Replay-derived

Use the build and progression from an existing Ghost or snapshot.

#### Human population sample

Sample from real player telemetry conditioned on:

- Mode
- Difficulty
- Weapon
- Target wave
- Approximate player skill
- Region or device only when analytically justified and privacy-safe

#### Agent population sample

Sample from a specified TearBot level or persona.

#### Synergy optimized

Choose the strongest legal build according to the Draft Strategist and rollout model.

#### Boss counter-build

Optimize for a selected boss or phase.

#### Archetype constrained

Examples:

- Swing offense
- Throw and recall
- Parry
- Slam
- Aerial
- Dash
- Resilience
- Mobility
- Glass cannon
- Generalist

#### Anti-synergy

Construct a legal but deliberately incoherent build to expose weak interactions and poor-player experiences.

#### Low-roll

Choose the weakest legal option at each opportunity.

#### High-variance

Prioritize volatile combinations and rare Specials.

#### Coverage-seeking

Choose picks that maximize untested pairwise or higher-order interactions.

#### Corruption profile

Create intentionally illegal combinations for defensive tests.

### 53.2 Exact earned-pick count

The synthesizer must obtain the exact number and category of opportunities from the Canonical Progression Ledger.

It must never invent extra picks to make a desired build fit.

When a requested build requires more opportunities than the target point provides, the compiler must return a clear constraint failure:

```text
Requested build is unreachable at Endless wave 12.
Required:
- 13 draft picks
- 2 boss tier evolutions
Available:
- 11 draft picks
- 1 boss tier evolution
Nearest reachable targets:
- Wave 14 for draft count
- Wave 17 for tier count
```

### 53.3 Simulated draft history

Every generated build should retain the full draft history:

```json
{
  "wave": 37,
  "offered": ["keen_edge", "bloodrite", "fleet"],
  "chosen": "bloodrite",
  "choicePolicy": "human-p50-resilience",
  "estimatedRegret": 0.08,
  "reason": "Low current sustain and no existing resilience Special"
}
```

This allows the visible agent to explain how it supposedly reached the build.

### 53.4 Tier synthesis

Tier evolution must account for:

- Which Special abilities are owned
- Which are eligible to evolve
- Existing tiers
- Boss milestone count
- Mode-specific evolution rules
- Requested build constraints

Tier opportunities must be assigned through the real evolution mechanism.

### 53.5 Current-health synthesis

A plausible late-run state requires more than a build.

Current HP should be generated from a conditional model using:

- Mode
- Difficulty
- Wave
- Weapon
- Build survivability
- Bot or human skill
- Recent damage history
- Wave-heal rules
- Shields and revives
- Boss proximity

Profiles:

- Full-health laboratory state
- Median population HP
- Low-health recovery state
- Critical one-hit-away state
- Post-revive state
- Exact user-specified HP

### 53.6 Score, time, and style synthesis

The run history model should also produce coherent values for:

- Score
- Kill count
- Peak multiplier
- Current style gauge
- Trick distribution
- Elapsed time
- Average wave-clear time
- Damage dealt and received
- Parry count
- Revives used
- Coins earned

The values must satisfy internal arithmetic and achievement constraints.

### 53.7 Economy and persistent progression

When relevant, State Forge must synthesize or load:

- Meta-shop levels
- Coins
- Shards
- Achievements
- Daily challenge state
- Account state
- Cloud/local merge state
- Unlocks
- Leaderboard eligibility

Test states must default to isolated disposable profiles so they never alter real saves or public leaderboards.

### 53.8 Wave-99 build packs

TearBench should maintain reusable late-run build packs:

```text
wave99-hard-hammer-human-p25
wave99-hard-hammer-human-p50
wave99-hard-hammer-human-p90
wave99-hard-sword-parry-specialist
wave99-extreme-low-roll
wave99-onehit-champion
wave99-endless-coverage-maximizer
```

Each pack must be regenerated when progression rules or upgrade implementations change.

### 53.9 Plausibility scoring

A build’s plausibility score should combine:

- Draft-pick likelihood
- Pick-order likelihood
- Tier-allocation likelihood
- Weapon synergy
- Mode and difficulty prevalence
- Skill-level prevalence
- Current-HP likelihood
- Time and score likelihood

A low score is not a failure unless the request asked for a normal population state. Rare but legal builds are valuable test cases.

---

## 54. Exact Mid-Combat and Boss Situation Injection

Boss and combat testing requires more precision than “spawn boss at full health.”

### 54.1 Boss state model

Every boss must expose a serializable phase contract containing:

- Boss ID
- Phase ID
- Phase progress
- Current action
- Current action frame or normalized time
- Windup and recovery timers
- Target
- Cooldowns
- Summoned entities
- Arena mutations
- Projectiles and hazards
- Boss-specific memory
- Invulnerability or armor
- Scripted event queue
- Intro and death-theater state

### 54.2 Boss phase entry modes

State Forge should support:

#### Canonical phase entrance

Start from the exact first frame the production fight would enter the phase.

#### Stable phase setup

Start after any cinematic or one-time transition has settled, with the boss ready to act.

#### Exact attack frame

Start on a chosen windup, active, or recovery frame.

#### Near-threshold

Start just before a health or timer threshold to test the transition.

#### Post-transition residue

Start immediately after transition to verify cleanup of old hazards, projectiles, platforms, stolen blades, or adds.

### 54.3 Situation templates

Examples:

```text
Source / void-scroll arrival / Hard / Hammer / 35% HP
Source / fake-death transition / One-Hit / all projectile objects alive
Echo / invisible phase / player has just performed a Power Slam
Warden / final 5% HP / player rooted / blade thrown
Colossus / armor punish window / Aerial Rave tier 3
Aldric / rally window about to expire / Bloodrite tier 2
Any boss / death frame / player simultaneously takes lethal damage
```

### 54.4 Exact enemy-wave composition

A wave scenario must be able to define:

- Spawned and queued enemies
- Spawn order
- Spawn delay
- Position
- Variant
- Affixes
- HP scale
- Damage scale
- Current state
- Target
- Status effects
- Stun
- Attack cooldown
- Formation
- Whether the state was naturally generated or surgically placed

### 54.5 Blade-state testing

The blade can be the center of a scenario:

- Held with exact angular velocity
- Mid-swing above hit-speed threshold
- Mid-swing just below threshold
- Thrown through N enemies
- Returning through a marked or bleeding group
- Embedded at maximum recall distance
- Stolen by a boss
- Hostile and moving toward the player
- Simultaneously intersecting a projectile and enemy
- Hammer lob one frame before impact
- Recall catch one frame before a tier effect triggers

### 54.6 Ability-state testing

Each ability and tier must have canonical activation templates.

For example:

- Aegis with 0, 1, maximum, and over-cap shields
- Bloodrite on a skill-kill frame
- Tempo at every stack and expiry boundary
- Rupture with every bleed-stack count
- Impale with one and multiple pinned enemies
- Cinder Trail during dash entry and exit
- Concussive Dash catching 0, 1, and 2+ enemies
- Storm Recall at catch time
- Flow Guard immediately above and below its style threshold

### 54.7 One-frame boundary library

State Forge should automatically generate boundary tests at:

- `threshold - epsilon`
- `threshold`
- `threshold + epsilon`

for:

- Hit speed
- Perfect-parry speed
- Deflect speed
- Slam speed
- Power-slam descent
- Launch speed
- Recall distance
- Collision overlap
- Boss phase HP
- Cooldown expiration
- I-frame expiration
- Shield consumption
- Style-tier thresholds

This is one of the highest-value ways to find off-by-one, comparison-direction, and timing bugs.

### 54.8 State stabilization policy

Some tests need an exact raw frame. Others need a stable playable situation.

Scenario metadata must specify:

```yaml
restoreMode: exact-frame | stabilize-one-frame | stabilize-until-idle
```

Stabilization must be deterministic and included in the trace.

---

## 55. Scenario Definition Language and Natural-Language Compiler

TearBench needs a formal Scenario Definition Language, or **TearSDL**.

### 55.1 Design goals

TearSDL must be:

- Human readable
- Versioned
- Deterministic
- Diff friendly
- Composable
- Validatable
- Suitable for generated and hand-authored scenarios
- Expressive enough for UI, combat, progression, device, and integration states

### 55.2 Example

```yaml
schema: tear-scenario/v3
id: endless-wave99-hard-hammer-p50
intent: late-game endurance and build interaction

start:
  class: reconstructed-reachable
  mode: endless
  difficulty: hard
  moment:
    wave: 99
    phase: wave-start
  weapon: hammer

history:
  policy: plausible-human
  skillPercentile: 50
  build:
    archetype: throw-hybrid
    constraints:
      require:
        - storm_recall>=2
      forbid:
        - glass_cannon
  health:
    model: conditional-median
  score:
    model: conditional-median

world:
  stage: auto-for-wave
  seed: 990042

agent:
  level: 7
  astuteness: 8
  persona: adaptive-generalist

execution:
  episodes: 10
  renderEpisode: 1
  maxSimSeconds: 240
  artifacts: full

assert:
  - no-crash
  - no-softlock
  - wave-can-complete
  - build-is-legal
  - higher-bot-level-monotonicity
```

### 55.3 Scenario inheritance

Scenarios should support composition:

```yaml
extends:
  - presets/endless-wave99
  - presets/hard
  - presets/hammer
  - personas/tearbot-level7
```

Overrides should be explicit and produce a flattened resolved scenario artifact.

### 55.4 Constraint language

The compiler should support:

- Exact values
- Ranges
- Percentiles
- Logical requirements
- Mutual exclusions
- At-least and at-most counts
- Build archetypes
- Reachability requirements
- Population-plausibility thresholds
- Coverage goals

### 55.5 Natural-language compilation

A developer should be able to say:

> Put me at the start of wave 99 Endless on Hard with Hammer. Give me a plausible Level-5-player history, a mostly throw-based build with Storm Recall tier 2, below-median health, and two armored enemies plus a bomber already active. Run the Level 7 bot and show me the first seed where recall damage behaves differently from main.

The coding agent should compile this into TearSDL, show the resolved assumptions, validate it, and execute it.

The natural-language layer must never bypass schema validation.

### 55.6 Situation query language

TearBench should support searching existing state banks:

```bash
tearbench state find \
  --where 'boss=source and phase=void-scroll and hp<0.25 and ability.aegis>=2'
```

### 55.7 Property-based scenario generation

TearSDL should integrate with a property-based generator:

```yaml
generate:
  count: 500
  vary:
    player.hp: [1, 100]
    blade.tipSpeed: boundary(CONFIG.blade.perfectSpeed)
    enemy.type: all
    difficulty: all
  constraints:
    - structurally-valid
    - reachable-or-surgical-valid
```

### 55.8 Scenario linting

The linter should flag:

- Unreachable requested builds
- Invalid boss phases
- Contradictory state fields
- Missing seeds
- Unbounded execution
- Assertions that cannot be measured
- Population claims without a population model
- Use of privileged observations in a black-box certification scenario

---

## 56. Snapshots, Time Travel, Forking, and Counterfactuals

State Forge should turn every run into a time-travelable experiment.

### 56.1 Snapshot cadence

Snapshots can be captured:

- Every fixed number of simulation ticks
- At wave start
- At wave clear
- Before and after a draft
- At boss intro
- At boss phase changes
- Before and after damage
- Before and after ability triggers
- Before and after UI transitions
- At invariant warnings
- On demand

### 56.2 Event-sourced storage

To reduce size, TearBench can store:

- Periodic full snapshots
- Deterministic event and action deltas between snapshots

A target frame is restored from the nearest full snapshot plus deltas.

### 56.3 Fork once, execute many

A snapshot should support thousands of counterfactual forks:

- Different agent levels
- Different actions
- Different draft choices
- Different weapons
- One ability added or removed
- One balance value changed
- Different frame rates
- Different input devices
- Different code branches

### 56.4 Counterfactual draft analysis

At a draft screen, TearBench should clone the state once per offered choice and roll each branch forward with the same seeds.

Outputs:

- Survival probability
- Expected wave reached
- Damage output
- Damage received
- Style
- Boss performance
- Synergy score
- Variance

This makes draft regret measurable rather than heuristic only.

### 56.5 Branch-state migration

Raw snapshots may not deserialize after code changes.

The migration system should support:

- Field renames
- Default values for new fields
- Class replacements
- Ability ID migrations
- Removed content markers
- Semantic reconstruction from the progression ledger

When migration cannot preserve meaning, TearBench must say so instead of silently guessing.

### 56.6 Time-travel debugger

A developer-facing UI should provide:

- Timeline scrubber
- Wave and boss markers
- Invariant markers
- State tree inspector
- Config diff inspector
- RNG cursor
- Action trace
- Agent intent
- Fork button
- “Run from here” button
- “Compare with main” button
- “Minimize failure from here” button

### 56.7 Failure-window extraction

When a failure occurs, TearBench should package:

- Last known good snapshot
- First bad snapshot
- Minimal delta
- Action trace between them
- Relevant config and entity diffs
- Video clip

### 56.8 State-bank retention

High-value states should be promoted into a versioned State Bank:

- Every historical bug
- Every boss phase
- Every ability activation boundary
- Every rare transition
- Every device-specific failure
- Representative population percentiles
- Champion and novice failure states

---

## 57. Combinatorial Interaction Testing

Weapons, abilities, tiers, bosses, difficulties, modes, and input contexts create a combinatorial space too large for naive exhaustive testing.

TearBench must manage that space intelligently.

### 57.1 Dimensions

At minimum:

- Game commit
- Mode
- Difficulty
- Wave
- Stage
- Boss
- Boss phase
- Enemy type
- Variant
- Affix
- Enemy count
- Weapon
- Ability
- Ability tier
- Ability pair
- Ability triple
- Build archetype
- Meta progression
- Player HP state
- Blade state
- Style state
- Input device
- Control mode
- Viewport
- Device-pixel ratio
- Graphics quality
- Frame rate
- Simulation speed
- Network state
- Cloud state
- Ad interruption
- Pause/resume timing
- Seed
- Agent level
- Agent astuteness
- Agent persona

### 57.2 Coverage strategy

Use a hierarchy:

1. **Exhaustive unit interaction tests** for individual ability boundaries.
2. **Full pairwise coverage** for every high-impact dimension.
3. **Three-way or four-way covering arrays** for known risky systems.
4. **Risk-weighted sampling** from historical failures and changed code.
5. **Population-weighted sampling** for common real-player states.
6. **Novelty-seeking sampling** for rare interactions.
7. **Adversarial generation** for exploit and corruption testing.
8. **Full Cartesian sweeps** only for small critical subsets.

### 57.3 Interaction graph

Maintain a graph where nodes are systems and edges are observed interactions.

Examples:

- Hammer ↔ Crater
- Storm Recall ↔ Impale Recall
- Aegis ↔ One-Hit
- Void Scroll ↔ Air Dash
- Pause ↔ Pointer Lock
- Touch Aim ↔ Throw
- Boss death ↔ Player lethal damage

Code changes should increase the priority of scenarios touching nearby graph nodes.

### 57.4 Coverage debt

Every feature should report:

- Untested pair count
- Untested tier combinations
- Unseen boss interactions
- Missing device coverage
- Missing bot-level coverage
- Oldest last-tested date
- Policy coverage gaps

### 57.5 Adaptive matrix expansion

When an anomaly appears, TearBench should automatically expand around it:

- Neighboring HP values
- Neighboring timing values
- Adjacent bot levels
- Other difficulties
- Other weapons
- Same ability at adjacent tiers
- Same boss phase on other seeds

### 57.6 Matrix command

```bash
tearbench matrix \
  --boss source \
  --phase void-scroll \
  --weapons all \
  --abilities all-specials \
  --tiers all \
  --difficulties hard,extreme,onehit \
  --agents 3,5,7,9 \
  --coverage 3-way \
  --budget 5000
```

---

## 58. TearBot Difficulty and Astuteness System

TearBench should develop a formal, data-driven bot difficulty system inspired by the clarity of numbered fighting-game CPU levels, but significantly more rigorous.

The working name is **TearBot Ladder**.

### 58.1 Four independent concepts

Never collapse these into one number:

1. **Game difficulty** — Easy, Normal, Hard, Extreme, or One-Hit.
2. **Mechanical skill** — how accurately and quickly the bot executes.
3. **Strategic astuteness** — how well it understands threats, builds, bosses, and long-term decisions.
4. **Testing aggression** — how intentionally it probes unusual states, exploits, menus, and edge cases.

A bot can be mechanically weak but highly astute as a QA explorer. It can also be mechanically elite but strategically narrow.

### 58.2 Human-facing levels

Expose a familiar 1–9 scale:

```text
TearBot Level 1
TearBot Level 2
...
TearBot Level 9
```

Also support:

- **Level 0** — non-playing control or pure random baseline.
- **Level Ω** — explicitly superhuman internal QA policy, not presented as human-like.
- **Continuous rating** — internal latent skill used between integer levels.

### 58.3 Proposed level identities

These are behavioral identities, not permanently fixed success percentages.

#### Level 1 — Unfamiliar

- Can navigate basic menus.
- Understands one or two actions at a time.
- Long reaction delay.
- Poor threat prioritization.
- Frequent coherent hesitation.
- Minimal draft understanding.

#### Level 2 — New player

- Basic movement and attacks.
- Limited dodging.
- Rare intentional parries.
- Drafts mostly by simple category preference.

#### Level 3 — Casual

- Clears introductory waves consistently on lower game difficulties.
- Uses dash and throw intentionally.
- Understands obvious boss telegraphs.
- Can form a basic build.

#### Level 4 — Developing

- Combines movement and offense.
- Recovers from common mistakes.
- Uses several trick types.
- Recognizes build synergies.

#### Level 5 — Representative median

- Intended to approximate the median competent player once human telemetry exists.
- Stable full-wave play.
- Reasonable defensive timing.
- Coherent drafting.
- Can finish easier content and progress meaningfully elsewhere.

#### Level 6 — Skilled

- Strong movement and target selection.
- Reliable build planning.
- Good boss adaptation.
- Uses recovery mechanics deliberately.

#### Level 7 — Advanced

- High mechanical consistency.
- Strong parry, slam, throw, and aerial decisions.
- Plans around future bosses.
- Low draft regret.

#### Level 8 — Expert

- Near-expert human execution under human-like information limits.
- Excellent risk management.
- Adapts rapidly to unfamiliar combinations.
- Maintains style without sacrificing survival.

#### Level 9 — Champion human-like

- Targets the upper end of credible human performance.
- Uses deep strategy and highly consistent mechanics.
- Still obeys human-like reaction and information limits.
- Can make rare, contextually plausible mistakes.

#### Level Ω — Superhuman QA

- May use privileged structured state.
- May plan with larger search budgets.
- May exceed human reaction limits.
- Used for engine stress, proof of playability, and upper-bound balance analysis.
- Must never be confused with fair human-like Level 9.

### 58.4 Why Tear should not blindly copy high-level fighting-game CPUs

Numbered CPU systems are easy to understand, and *Super Smash Bros.* uses levels 1–9. Community documentation indicates that its levels substantially affect reaction speed and the probability of following through on decisions; very high levels may react at effectively one-frame speeds. That creates apparent strength, but can also produce inhuman defense.

TearBot should copy the **clear ladder**, not the unfair shortcuts.

High TearBot levels should become stronger through:

- Better prediction
- Better positioning
- Better planning
- Better build understanding
- Lower but still plausible execution error
- Better recovery
- Better use of learned boss patterns

Human-like levels should not read hidden future events or react before a visible cue could be processed.

### 58.5 Fixed and adaptive modes

#### Fixed level

The agent remains at the selected capability for the full test.

Use for:

- Certification
- Regression comparison
- Balance curves
- Reproducibility

#### Adaptive level

The agent adjusts within a bounded skill range to maintain a target challenge or imitate a specific player.

Use for:

- Dynamic difficulty research
- Player-modeling experiments
- Training curricula
- Demonstrations

Adaptive level changes must be logged and must not be used for deterministic certification unless explicitly required.

---

## 59. Bot Astuteness Vector and Bounded Rationality

A single scalar cannot express why a bot is good or bad.

Every TearBot needs a multidimensional **Astuteness Vector**.

### 59.1 Perception dimensions

- Observation latency
- Observation update rate
- Position noise
- Velocity-estimation noise
- Projectile-trajectory accuracy
- Enemy-state recognition accuracy
- Boss-phase recognition accuracy
- UI-reading accuracy
- Memory duration
- Attention capacity
- Number of simultaneously tracked threats

### 59.2 Decision dimensions

- Replanning frequency
- Planning horizon
- Search or rollout budget
- Threat-priority quality
- Target-selection quality
- Risk estimation
- Future-wave planning
- Boss counter-planning
- Draft rollout count
- Confidence calibration
- Exploration tendency

### 59.3 Mechanical dimensions

- Aim precision
- Aim smoothness
- Swing-speed control
- Swing-angle error
- Jump timing
- Dash timing
- Dash-direction error
- Parry timing
- Throw timing
- Recall timing
- Tether control
- Platform navigation
- Input-device proficiency

### 59.4 Strategic dimensions

- Build-synergy knowledge
- Tier-evolution planning
- Weapon-specific knowledge
- Difficulty adaptation
- Mode objective understanding
- Boss knowledge
- Resource and revive management
- Style-versus-survival tradeoff
- Score optimization
- Endurance pacing

### 59.5 Recovery dimensions

- Panic resistance
- Low-health behavior
- Ability to escape corners
- Ability to recover a lost blade
- Ability to recover after a missed dash
- Ability to re-establish a plan after unexpected damage
- Ability to handle unfamiliar states

### 59.6 QA astuteness dimensions

- Menu exploration
- Input-combination exploration
- State novelty seeking
- Invariant awareness
- Exploit suspicion
- Repetition avoidance
- Rare-transition targeting
- Failure reproduction discipline
- Ability to switch from playing to diagnosis

### 59.7 Persona dimensions

- Aggression
- Patience
- Greed
- Style preference
- Aerial preference
- Throw preference
- Parry preference
- Defensive preference
- Build risk
- Curiosity

### 59.8 Bounded-rationality compiler

The **Bot Skill Compiler** should translate a target level and persona into concrete limits:

```json
{
  "level": 5,
  "reactionMs": 210,
  "observationHz": 20,
  "threatSlots": 4,
  "planningHorizonSec": 1.2,
  "rolloutBudget": 12,
  "aimSigma": 0.075,
  "timingSigmaMs": 55,
  "parryCommitThreshold": 0.78,
  "draftRollouts": 24,
  "bossMemoryAccuracy": 0.72,
  "riskTolerance": 0.50,
  "replanHz": 8,
  "intentPersistenceMs": 180
}
```

The values above are illustrative. Calibration determines the real values.

### 59.9 Coherent mistakes, not random sabotage

Lower levels should not simply receive random actions.

Their mistakes should resemble understandable player failures:

- Hesitation
- Tunnel vision
- Greedy follow-up
- Premature dodge
- Late parry
- Misjudged reach
- Poor target priority
- Forgetting an off-screen threat
- Overvaluing a flashy upgrade
- Failing to adapt a preferred strategy
- Panic after taking damage
- Misreading a boss transition

Each mistake type should have a level- and persona-conditioned probability.

### 59.10 Human-like information firewall

Human-like agents must receive only information a human could infer at the current frame.

Forbidden for Levels 1–9 unless a test explicitly opts in:

- Future RNG outcomes
- Hidden attack selection before telegraph
- Exact invisible timers with no visible cue
- Exact off-screen positions without prior observation
- Collision data unavailable visually
- Enemy internal decisions before animation
- Perfect frame knowledge beyond modeled perception

The firewall should be mechanically enforced by the observation adapter, not merely requested in a prompt.

### 59.11 Astuteness presets

Examples:

```text
mechanics-7_strategy-3_qa-2
mechanics-3_strategy-8_qa-9
mechanics-9_strategy-9_qa-1
mechanics-5_strategy-5_qa-5
```

This produces much richer test populations than one linear ladder.

---

## 60. Self-Calibrating Bot Levels

The project must not guess what Level 4 or Level 8 means forever.

TearBot levels must be calibrated from measured performance.

### 60.1 Calibration problem

For each level, TearBench must determine a policy and bounded-rationality profile whose measured behavior lands inside a target performance envelope across a representative benchmark suite.

The number is therefore an output of calibration, not a manually chosen label.

### 60.2 Scenario Item Response Model

Treat every benchmark scenario as an exam item.

Each scenario has:

- Difficulty
- Skill discrimination
- Domain tags
- Variance
- Required mechanics

Each agent has a latent skill vector.

A simplified model is:

```text
P(success on scenario s) = sigmoid(a_s · theta_agent - b_s)
```

where:

- `theta_agent` is the agent’s skill or multidimensional skill vector.
- `b_s` is scenario difficulty.
- `a_s` measures which skills the scenario discriminates.

This jointly estimates:

- How difficult a scenario really is
- How capable an agent really is
- Which skill dimensions explain success

### 60.3 Why this solves the numbered-level question

Instead of saying “Level 7 reacts in 120 ms, so it must be good,” TearBench can say:

> This policy’s estimated ability is within the calibrated Level-7 band, with an 82% predicted success rate on Level-6 benchmark items, 51% on Level-7 items, and 19% on Level-8 items.

The specific bands should be learned and versioned.

### 60.4 Human anchoring

Once opt-in human telemetry exists, estimate the same skill vector for human players.

Then map the 1–9 ladder to human population bands.

A possible starting intent—not a permanent hardcoded truth—is:

| Level | Human-relative identity |
|---:|---|
| 1 | Bottom novice band |
| 2 | Early learner |
| 3 | Casual lower band |
| 4 | Developing player |
| 5 | Median competent player |
| 6 | Above-average skilled player |
| 7 | Advanced player |
| 8 | Expert player |
| 9 | Champion-level human-like player |

Exact percentiles must come from data. TearBench must not fabricate them.

### 60.5 Bootstrap before human telemetry

Before enough human data exists:

1. Build scripted agents with known restrictions.
2. Train a champion policy.
3. Distill restricted variants.
4. Evaluate them on the benchmark suite.
5. Estimate provisional latent skill bands.
6. Label all bands as synthetic provisional.
7. Recalibrate when human data arrives.

### 60.6 Multi-domain rating

Every agent should have:

- Global rating
- Combat rating
- Movement rating
- Blade-control rating
- Parry rating
- Draft rating
- Boss rating
- Menu rating
- Endurance rating
- QA exploration rating
- Per-weapon ratings
- Per-mode ratings
- Per-game-difficulty ratings

A single global Level 7 can hide that an agent is Level 9 with Sword and Level 4 with Hammer.

### 60.7 Game difficulty conversion matrix

Bot level and game difficulty remain orthogonal.

TearBench should estimate a conversion matrix such as:

```text
Agent X effective skill:
Easy     8.4
Normal   7.6
Hard     6.8
Extreme  5.2
One-Hit  4.1
```

This is descriptive, not a forced downgrade of the policy.

### 60.8 Calibration objective

For each target level, optimize a loss containing:

- Distance from target latent skill band
- Completion-rate error
- Wave-reach error
- Damage-taken error
- Draft-regret error
- Mechanical-consistency error
- Human-likeness penalty
- Monotonicity violations
- Cross-mode instability
- Cross-seed variance
- Exploit dependence

### 60.9 Calibration algorithm

Use constrained optimization:

1. Start with a universal conditioned policy.
2. Select level-specific bounded-rationality parameters.
3. Evaluate on a calibration suite.
4. Fit the item-response model.
5. Use Bayesian optimization or population-based search to adjust parameters.
6. Repeat until the level lands inside its target band.
7. Validate on hidden holdout scenarios.
8. Freeze and version the profile.

### 60.10 Monotonicity contract

Higher levels must outperform lower levels in aggregate.

Required checks:

- `rating(L+1) > rating(L)` with confidence.
- Completion probability is non-decreasing across levels for each major mode/difficulty pair.
- Median wave reached is non-decreasing.
- Draft regret is generally non-increasing.
- Mechanical error is generally non-increasing.
- No higher level becomes stronger only by using a known exploit.

Individual seeds may violate ordering. Statistical ordering must hold.

### 60.11 Level separation contract

Adjacent levels must be meaningfully distinguishable.

If Level 5 and Level 6 are statistically indistinguishable, the ladder must be recalibrated or the public scale reduced.

### 60.12 Holdout exams

Calibration and certification scenarios must be separate.

Holdouts should include:

- Unseen seeds
- Unseen build combinations
- Unseen enemy arrangements
- Rotating boss situations
- New scenario mutations
- Pixel-only certification episodes

### 60.13 Skill card

Every released policy receives a card:

```text
TEARBOT SKILL CARD
------------------
Policy: tearbot-universal-2026.07.22-r18
Public level: 7
Internal rating: 1724 ± 31
Human-likeness: 0.91
Global exam pass: 78.4%
Normal Adventure completion: 83.1%
Hard Adventure completion: 51.7%
Extreme Adventure completion: 18.9%
One-Hit Adventure completion: 7.3%
Sword rating: 7.4
Hammer rating: 6.8
Draft rating: 7.9
Boss rating: 7.1
Weakest domain: Source void movement
Last calibrated commit: <sha>
Calibration suite: 2026.07-r5
```

Numbers shown here are examples of format, not claimed targets.

### 60.14 Continuous interpolation

The universal policy should accept a continuous skill-conditioning value.

This permits:

- Level 5.5 internal testing
- Smooth calibration
- Dynamic difficulty experiments
- Matching a specific human player model
- Filling gaps between integer public levels

### 60.15 Separate astuteness calibration

Strategic astuteness and QA astuteness need their own exams.

A bot should not receive high strategic ratings merely because it has perfect aim.

---

## 61. Self-Improving Agent Foundry

The system that iterates over and improves the bot population should be called the **Agent Foundry**.

It must be automated but gated, auditable, and reversible.

### 61.1 Closed-loop improvement cycle

1. **Evaluate** the current champion and every public level.
2. **Diagnose** weak skill cells and calibration drift.
3. **Mine** failures, near-failures, and high-uncertainty states.
4. **Forge** targeted training scenarios from those states.
5. **Generate** demonstrations, scripted solutions, search solutions, or teacher-policy trajectories.
6. **Train** challenger policies or adapters.
7. **Calibrate** the 1–9 ladder again.
8. **Validate** on holdout, black-box, and regression suites.
9. **Compare** champion versus challenger statistically.
10. **Promote** only when all gates pass.
11. **Archive** the old policy and full evidence.
12. **Monitor** the new champion for drift.

### 61.2 Weakness miner

The Foundry should rank weaknesses by:

- Failure rate
- Severity
- Frequency in human telemetry
- Novelty
- Confidence uncertainty
- Difference from target level
- Regression from prior policy
- Development relevance

### 61.3 Targeted curriculum generation

If Level 7 repeatedly fails Source void-scroll transitions, the system should automatically create a curriculum:

1. Static void platforms without enemies
2. Slow scroll
3. Normal scroll
4. Crumble platforms
5. Fire platforms
6. Cage hazards
7. One wisp
8. Two wisps
9. Low health
10. Full boss context
11. Hard
12. Extreme
13. One-Hit

The curriculum advances when mastery thresholds are met.

### 61.4 Teacher hierarchy

Possible teachers:

- Scripted specialist
- Search planner
- Level Ω policy
- Human demonstration
- Best historical policy
- Ensemble vote
- Counterfactual rollout oracle

### 61.5 Distillation for lower levels

Lower levels should not require independently training nine unrelated policies.

Preferred approach:

- Train one strong universal policy.
- Condition it on target skill and persona.
- Apply learned or optimized bounded-rationality adapters.
- Distill level-specific compact adapters only when necessary.

### 61.6 Coevolution with Scenario Forge

The agent and scenario generator can improve together:

- Scenario generator searches for states that separate adjacent bot levels.
- Agent searches for robust solutions.
- Scenario generator is rewarded for novel, valid, nontrivial failures.
- Agent is rewarded for broad mastery.

This produces a controlled arms race.

### 61.7 Quality-diversity archive

The Foundry should preserve multiple high-performing behaviors rather than converging on one style.

Archive dimensions may include:

- Throw usage
- Aerial time
- Parry frequency
- Slam frequency
- Aggression
- Damage taken
- Build archetype
- Style score
- Exploration
- Risk

This creates strong specialists and diverse human-like personas.

### 61.8 Champion/challenger gates

A challenger can be promoted only when:

- It improves targeted weaknesses.
- It does not regress critical domains beyond tolerance.
- It preserves level calibration.
- It passes black-box visual episodes.
- It passes deterministic replay checks.
- It does not rely on privileged information in human-like modes.
- It does not exploit known bugs.
- It retains scenario coverage.
- Its inference performance is acceptable.

### 61.9 Catastrophic-forgetting protection

Maintain:

- Historical failure replay buffer
- Frozen golden scenarios
- Old boss versions where relevant
- All ability-boundary tests
- Per-level exam suites
- Population behavior targets

### 61.10 Automatic rollback

Every policy release must be reversible.

The registry must retain:

- Weights
- Code
- Observation schema
- Action schema
- Training data manifest
- Hyperparameters
- Calibration profile
- Benchmark results
- Known limitations

### 61.11 Self-modification boundary

The Agent Foundry may automatically train and select policies.

Changes to production game code, reward definitions, invariant definitions, or release gates should still require version-controlled review. A bot must not redefine the exam to make itself look better.

### 61.12 Iteration report

Every Foundry cycle should produce:

```text
FOUNDRY CYCLE 184
-----------------
Target weakness: Hammer recall planning on Hard waves 60+
Training scenarios generated: 18,420
New demonstrations: 2,980
Challenger: r19
Global rating change: +42
Hammer rating change: +0.8 levels
Hard wave-99 survival: +11.2 percentage points
Regressions: Level-4 parry rate too high
Action: calibration adapter retuned
Final result: promoted as r19b
```

---

## 62. Determining Performance for Every Bot Number

The user-facing level number must correspond to an explicit, measurable contract.

### 62.1 Level specification document

For each level, store target ranges for:

- Latent global rating
- Domain ratings
- Reaction distribution
- Mechanical error distribution
- Completion rates by mode and game difficulty
- Median and percentile wave reached
- Boss success
- Draft regret
- Damage efficiency
- Recovery rate
- Human-likeness
- Action diversity
- Exploit dependence
- Variance

### 62.2 Performance is a distribution

Never define a level by one showcase run.

Use:

- Hundreds or thousands of seeded episodes
- Confidence intervals
- Bootstrap estimates
- Multiple scenario families
- Multiple builds
- Multiple input-device adapters

### 62.3 Calibration benchmark families

#### Mechanics exam

- Movement
- Jump and drop-through
- Dash steering
- Blade-speed generation
- Launch
- Juggle
- Slam
- Power Slam
- Throw
- Recall
- Parry

#### Combat exam

- Single enemy
- Mixed waves
- Projectile density
- Armored enemies
- Flyers
- Variants and affixes
- Crowd control

#### Boss exam

- Every phase
- Every transition
- Low-health recovery
- Weapon-specific fights
- Ability-specific counters

#### Draft exam

- Immediate-value choice
- Long-term synergy
- Boss forecast
- Tier evolution
- Low-roll recovery
- Anti-synergy avoidance

#### Journey exam

- Menu navigation
- Run setup
- Full stage
- Full mode
- Results
- Return to menu

#### Robustness exam

- Unseen seeds
- Frame-rate changes
- Touch and gamepad
- Pause/resume
- Network interruptions
- State migration

#### QA astuteness exam

- Find hidden menu path
- Reproduce a softlock
- Seek boundary timings
- Discover an exploit
- Minimize an action trace

### 62.4 Target-band optimizer

The level compiler should search for parameter and policy configurations that satisfy all target ranges simultaneously.

This is a constrained multi-objective optimization problem, not a hand-authored table.

### 62.5 Rating models

Use different models for different questions:

- **Multidimensional item-response model** for PvE scenario mastery.
- **Bayesian skill rating** for pairwise races, tournaments, and champion comparisons.
- **Supervised player models** for human-percentile mapping.
- **Calibration curves** for predicted versus observed success.

A TrueSkill-style system is useful because uncertainty is explicit and richer performance signals can improve rating. For TearBench, the PvE item-response model should remain the primary source of public level placement.

### 62.6 Dynamic difficulty research

Player models can be used to select an agent whose predicted challenge matches a target player.

However:

- Dynamic adaptation is optional.
- It must be transparent during development.
- It must not secretly alter certification outcomes.
- It must not be confused with the fixed public TearBot ladder.

### 62.7 Human-likeness metrics

Compare agents and humans on:

- Reaction-time distribution
- Aim acceleration
- Swing trajectories
- Action entropy
- Error types
- Build preferences
- Threat switching
- Low-health behavior
- Boss learning curves
- Menu timing

### 62.8 Adjacent-level discrimination

Create scenarios specifically designed to distinguish levels.

For example:

- Level 4 succeeds about half the time.
- Level 5 succeeds substantially more often.
- Level 6 is nearly reliable.

The actual probabilities are learned and periodically recalibrated.

### 62.9 Level drift detection

After any game balance change, rerun the ladder.

A fixed policy may effectively lose or gain levels when:

- Enemy HP changes
- Damage changes
- Draft pool changes
- Boss timing changes
- Movement physics changes
- Input behavior changes

The dashboard should report:

```text
Game commit changed TearBot Level-7 effective rating:
Normal: 7.1 -> 6.9
Hard: 6.8 -> 6.1  [material drift]
Extreme: 5.4 -> 4.9
Primary cause: Hammer windup and Source phase 3
```

### 62.10 Research basis

The design borrows selectively from several established ideas:

- Numbered CPU ladders provide a clear user mental model; *Super Smash Bros.* is a familiar 1–9 example, though its high-level reaction behavior is not a fairness model Tear should copy directly.
- Bayesian rating systems such as TrueSkill and TrueSkill 2 model skill with uncertainty and can incorporate more than simple win/loss outcomes.
- Dynamic difficulty research models changing player mastery and seeks to match challenge to player capability.
- Quality-diversity methods such as MAP-Elites are useful for preserving multiple strong but behaviorally distinct policies.
- Recent personalized-difficulty research combines imitation learning with reinforcement learning to model a player and train an appropriately challenging opponent.

These ideas inform TearBench, but the final calibration must be validated on *Tear* itself.

Selected references:

- [SmashWiki — Artificial intelligence and CPU difficulty levels](https://www.ssbwiki.com/Artificial_intelligence)
- [Microsoft Research — TrueSkill publications, including TrueSkill 2](https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/publications/)
- [Zook and Riedl — A Temporal Data-Driven Player Model for Dynamic Difficulty Adjustment](https://ojs.aaai.org/index.php/AIIDE/article/view/12504)
- [Fuchs, Gieseke, and Dockhorn — Personalized Dynamic Difficulty Adjustment: Imitation Learning Meets Reinforcement Learning](https://arxiv.org/abs/2408.06818)
- [Perez-Liebana et al. — Generating Diverse and Competitive Play-Styles for Strategy Games](https://arxiv.org/abs/2104.08641)
- [Stephenson and Renz — Agent-Based Adaptive Level Generation for Dynamic Difficulty Adjustment](https://arxiv.org/abs/1902.02518)

---

## 63. Expanded API, CLI, Skill, and UI Surface

### 63.1 `window.TEAR_TEST` additions

```js
window.TEAR_TEST = {
  // Existing lifecycle
  reset,
  observe,
  step,
  runActionBatch,

  // State Forge
  captureState(options),
  restoreState(snapshot, options),
  validateState(snapshot, options),
  diffStates(a, b, options),
  fingerprintState(options),

  // Progression and history
  synthesizeProgression(options),
  buildProgressionLedger(options),
  replayProgressionLedger(ledger),
  generateHistoricalRun(options),
  generateBuild(options),

  // Situation construction
  forgeState(spec),
  createBossSituation(spec),
  createWaveSituation(spec),
  createAbilitySituation(spec),
  createUIState(spec),

  // Time travel
  createCheckpoint(label),
  restoreCheckpoint(id),
  forkState(snapshot, variants),
  listStateBank(query),

  // Agent ladder
  setAgentProfile(profile),
  getAgentProfile(),
  getAgentSkillCard(id),
  runCalibrationSuite(options),
  compareAgentLevels(options)
};
```

### 63.2 CLI additions

```bash
# Forge a legal late-game state
tearbench forge --mode endless --difficulty hard --wave 99 --history plausible --watch

# Generate a build with exact earned opportunity count
tearbench build generate --mode endless --wave 99 --weapon hammer --profile human-p50

# Validate reachability
tearbench state validate artifacts/state.json --prove-reachability

# Start an exact boss phase
tearbench boss start --boss source --phase void-scroll --difficulty extreme --agent 8

# Fork one state across choices
tearbench state fork state.json --vary weapon=sword,hammer --vary agent=5,7,9

# Counterfactual draft rollouts
tearbench draft compare state-at-draft.json --rollouts 1000

# Calibrate all public levels
tearbench bots calibrate --levels 1-9 --suite ladder-2026.07

# Inspect one level
tearbench bots report --level 7 --difficulty hard

# Run adjacent-level discrimination
tearbench bots compare --levels 5,6 --holdout --episodes 2000

# Run a Foundry cycle
tearbench foundry iterate --target auto --budget 500000

# Open State Forge Studio
tearbench studio
```

### 63.3 Agent Skill tools

Add:

```text
tear_compile_scenario
tear_forge_state
tear_validate_state
tear_prove_state_reachability
tear_generate_run_history
tear_generate_build_for_target
tear_start_from_state
tear_capture_state
tear_fork_state
tear_compare_counterfactuals
tear_start_boss_phase
tear_run_interaction_matrix
tear_get_bot_levels
tear_get_bot_skill_card
tear_calibrate_bot_levels
tear_compare_bot_levels
tear_train_challenger
tear_run_foundry_cycle
tear_promote_policy
tear_rollback_policy
```

### 63.4 State Forge Studio

A visual editor should allow the developer to:

- Select mode, difficulty, wave, and stage
- Select weapon
- Generate or hand-build a loadout
- See how many picks are legally available
- Choose history profile
- Set HP, score, time, and style by value or percentile
- Place enemies and projectiles
- Select boss phase and attack frame
- Set blade state and velocity
- Set input device and viewport
- Choose bot level and astuteness
- Validate reachability live
- Save scenario
- Start visibly
- Run headless batches
- Fork and compare

### 63.5 Build timeline UI

The Studio should show a synthetic draft timeline:

```text
W1  Keen Edge
W2  Fleet Foot
W3  Bloodrite
...
B1  Bloodrite -> Tier 2
...
W98 Storm Recall
START W99
```

Clicking a pick should allow:

- Re-roll the offer
- Change the choice
- Rebuild all downstream state
- Show legality and plausibility impact

### 63.6 Bot Ladder dashboard

Display:

- Levels 1–9
- Internal ratings and uncertainty
- Human-relative bands
- Per-difficulty conversion
- Per-mode and per-weapon ratings
- Completion curves
- Adjacent-level overlap
- Calibration drift
- Last training cycle
- Known weaknesses
- Video examples

### 63.7 Live spectator overlay additions

When watching an agent:

```text
TEARBOT 7
Astuteness: Strategy 8 / Mechanics 7 / QA 3
Perception delay: 138 ms
Current goal: isolate bomber
Threat model: projectile impact in 0.42 s
Plan: dash left -> recall through armored pair
Confidence: 0.76
State source: reconstructed wave-99 history
Reachability: proven
```

### 63.8 Artifact package

Each arbitrary-state run should save:

```text
artifacts/<run-id>/
  scenario.resolved.yaml
  state.start.json.zst
  state.end.json.zst
  progression-ledger.json
  build-timeline.json
  config-derivation.json
  reachability-report.json
  plausibility-report.json
  action-trace.bin
  replay.json
  metrics.json
  invariants.json
  agent-skill-card.json
  video.webm
  screenshots/
  report.md
```

---

## 64. Expanded Roadmap and Acceptance Gates

### Milestone L — State schema and exact snapshots

Deliver:

- Versioned full-state schema
- Exact capture and restore
- State fingerprints
- Transactional restore
- Snapshot artifact format

Acceptance:

- Capture any live combat frame, reload the page, restore it, and produce the same next 600 deterministic ticks under the same actions.

### Milestone M — Canonical Progression Ledger

Deliver:

- Progression event stream
- Draft and tier opportunity enumeration
- Production-order config rebuild
- Ledger replay

Acceptance:

- A recorded run and a ledger-reconstructed run produce matching build, config, and progression hashes at the same target wave.

### Milestone N — Historical Run Synthesizer

Deliver:

- Build profiles
- Human/agent population hooks
- HP, time, score, style, and economy synthesis
- Plausibility scoring

Acceptance:

- Generate 10,000 legal wave-99 states without count violations, duplicate uniques, invalid tiers, or config drift.

### Milestone O — Arbitrary wave and boss launch

Deliver:

- Wave-state factory
- Boss-phase factory
- Enemy/projectile/hazard state injection
- Boundary-state templates

Acceptance:

- Launch every boss phase and every ability activation boundary from a clean process and complete the scenario without manual setup.

### Milestone P — Time travel and counterfactual forks

Deliver:

- Event-sourced snapshots
- Fork manager
- Counterfactual draft evaluation
- Branch snapshot migration
- Time-travel debugger

Acceptance:

- Fork one state into 1,000 deterministic variants and compare one changed factor while all other semantic fingerprints remain equal.

### Milestone Q — TearBot 1–9 provisional ladder

Deliver:

- Universal conditioned policy or policy family
- Astuteness vector
- Bounded-rationality compiler
- Provisional calibration suite
- Monotonicity checks

Acceptance:

- Nine statistically ordered public levels are visibly distinguishable across the calibration suite, with no adjacent level collapse.

### Milestone R — Human-anchored calibration

Deliver:

- Opt-in telemetry schema
- Human skill estimation
- Human-likeness metrics
- Public-level percentile mapping

Acceptance:

- Bot levels can be described relative to measured human performance with confidence intervals and without hidden privileged information.

### Milestone S — Agent Foundry

Deliver:

- Weakness miner
- Curriculum generator
- Challenger training
- Champion/challenger gates
- Policy rollback
- Iteration reports

Acceptance:

- The system identifies a real weakness, creates targeted states, trains a challenger, proves improvement on holdout tests, and promotes or rejects it automatically with evidence.

### Milestone T — State Forge Studio and developer workflow

Deliver:

- Visual scenario editor
- Build timeline
- Boss-phase inspector
- Bot ladder dashboard
- Natural-language scenario compiler

Acceptance:

- A developer can describe, visually inspect, launch, watch, fork, and save an arbitrary situation without editing code.

### Milestone U — Arbitrary-state release certification

Deliver:

- Risk-weighted interaction matrices
- Historical state bank
- PR diff-aware state selection
- Mandatory late-game and boss-phase gates

Acceptance:

- Every gameplay PR is tested both through full player journeys and directly from affected arbitrary states.

### Milestone V — 500%-beyond-goal system

Deliver:

- Full player-journey autonomy
- Any-point state forging
- Legal history synthesis
- Human-like numbered bot ladder
- Self-calibrating performance bands
- Self-improving agent population
- Quality-diverse specialists
- Counterfactual balance laboratory
- Deterministic autonomous diagnosis

Acceptance:

- TearBench can start anywhere, play anything, represent multiple player skill levels, improve its policies safely, certify the complete product, and explain exactly why every state and conclusion is trustworthy.

---


## 65. Ghost 3.0: A Standalone Replay, Rivalry, Coaching, and Run-Intelligence Platform

Ghost 3.0 must be treated as a first-class *Tear* product subsystem, not merely as a TearBench data recorder.

TearBench benefits from Ghost 3.0, but Ghost 3.0 has a much broader mission. It should become the canonical memory layer for the entire game: the system that remembers what happened, proves how it happened, lets a player relive it, turns it into a challenge, explains what could improve, preserves it across versions, and gives the game a durable history.

The product-level vision is:

> Every meaningful *Tear* run can become a trustworthy, seekable, shareable, comparable, coachable, forkable, and future-compatible “run capsule” rather than a disposable score entry.

Ghost 3.0 should serve seven distinct roles.

1. **Replay truth.** Reconstruct a run accurately enough that important gameplay outcomes are not merely approximated.
2. **Personal memory.** Preserve a player’s best runs, strange builds, first victories, close losses, and defining moments.
3. **Asynchronous rivalry.** Let players race, chase, challenge, and learn from ghosts without requiring live multiplayer.
4. **Coaching.** Turn a replay into an evidence-backed diagnosis and immediately launch practice from the exact mistake.
5. **Community media.** Make runs discoverable, watchable, timestamp-shareable, and easy to turn into clips or challenge codes.
6. **Trust and verification.** Provide tamper-evident evidence for leaderboards, records, bug reports, and competitive events.
7. **Game resilience.** Capture crash context, support run recovery where appropriate, and preserve old runs as the game evolves.

### 65.1 Product family

The Ghost 3.0 umbrella should be split into recognizable components rather than one oversized global object.

- **Ghost Core** — recording, encoding, decoding, deterministic replay, correction, integrity, and compatibility.
- **Ghost Vault** — local and cloud run history, search, tags, pinning, retention, export, and import.
- **Ghost Theater** — player-facing playback, timeline, cameras, overlays, comparison, and clip creation.
- **Ghost Coach** — run autopsy, mistake classification, skill modeling, drill generation, and progress tracking.
- **Ghost Challenges** — personal-best races, shared challenges, boss memories, daily echoes, and seeded competitions.
- **Ghost Passport** — identity, publication, privacy, permissions, verification, moderation, and public metadata.
- **Ghost Lab** — developer-only inspection, state takeover, compatibility debugging, branch comparison, and forensic analysis.

These components may share one schema, but they should not share one implementation boundary. A failure in the public feed must not break local recording. A codec migration must not depend on the replay UI. A coach update must not invalidate old capsules.

### 65.2 Non-negotiable player promises

Ghost 3.0 should make the following promises explicit.

- A replay never silently pretends to be more accurate than it is.
- A public run clearly displays whether it is verified, migrated, legacy, bot-generated, resumed, modded, or unverified.
- Watching a replay can never mutate the player’s real save, achievements, progression, or leaderboards.
- Importing an untrusted replay can never execute arbitrary code or write arbitrary game state.
- A player can delete, export, or privatize their own published runs.
- A replay remains useful even if some cosmetic assets or minor systems change.
- Competitive runs are reproducible enough to validate their claimed result.
- Player-facing coaching explains its evidence instead of outputting vague judgment.
- A ghost never interferes with the live player’s collisions, enemy targeting, RNG, or damage unless a special game mode explicitly says otherwise.
- Bot-generated ghosts are always labeled as bot-generated.

### 65.3 Design principles

1. **Causality over choreography.** Record the inputs, seed, decisions, and state transitions that caused the run, not only the resulting poses.
2. **Hybrid truth over fragile purity.** Use deterministic re-simulation where possible, correction keyframes when necessary, and pose fallback when compatibility is impossible.
3. **Random access by design.** A player should seek to a boss phase or draft without decoding the entire run from the beginning.
4. **Offline-first.** Local recording and playback must work without Firebase, CrazyGames, or any account.
5. **Progressive fidelity.** Compact public ghosts, coaching ghosts, and developer-forensic ghosts may carry different track sets.
6. **Versioned forever.** Every packet declares exactly what code, content, configuration, and schema produced it.
7. **Explainable intelligence.** Coaching conclusions must point to concrete moments and metrics.
8. **No hidden competitive advantage.** Ghost races must use explicit fairness contracts.
9. **Graceful degradation.** A broken optional track should not destroy an otherwise watchable run.
10. **Observable failure.** Corruption, drift, and incompatibility must surface as statuses, not visual lies.

### 65.4 What Ghost 3.0 is not

Ghost 3.0 is not simply:

- A video file
- A list of player coordinates
- A leaderboard attachment
- A TearBench-only dataset
- A cloud-only social feature
- A full multiplayer networking stack
- A promise that every historical build can be simulated forever with zero migration work

A rendered video may be attached as a convenience, but it cannot replace the interactive run capsule. A coordinate-only path may remain as a fallback, but it cannot be the canonical competitive record.

---

## 66. Current Ghost 2.0 Baseline and the Gap to Ghost 3.0

The existing implementation is a strong V2 foundation and should be preserved through migration rather than discarded.

### 66.1 What Ghost 2.0 already does well

The current `js/ghost.js` packet records:

- Player position and facing at 10 Hz
- Blade-tip position at 10 Hz
- Enemy spawn identities and initial locations
- Enemy alive-position samples at 4 Hz
- Enemy deaths
- Stage changes
- Wave events
- Combat highlight events
- Draft and tier picks
- A thumbnail selected from high-priority moments
- Summary metadata supplied when the run ends

Playback is time-driven. The renderer can query the player pose, alive enemies, current stage, current wave, chapter markers, and events crossed by the playback cursor.

The current replay engine also supports:

- Seeking
- Play and pause
- Speed cycling
- Wave and boss chapter jumps
- Legacy V1 conversion into a V2-compatible pose packet
- Local per-board best replay compatibility

The local Replay Vault currently stores one blob per run plus a small index, with code-level caps of 12 unpinned runs and 10 pinned keepers.

The shared Replay Passport currently publishes a replay summary plus chunked JSON, provides a global feed, loads a shared replay by ID, and links a replay to a leaderboard row. Its current publisher uses 500,000-character chunks and rejects expanded replay JSON above roughly 3,000,000 characters.

That is materially better than a typical “ghost” implementation. It already separates the lightweight summary from the heavier recording and already understands that replay playback should not depend on live game state.

### 66.2 Direct assessment

Ghost 2.0 is an excellent lightweight visual reconstruction system.

It is not yet an authoritative replay system.

That distinction matters. A pose reconstruction can convincingly show where the player and enemies were sampled, but it cannot always answer:

- Which exact inputs caused the movement?
- Whether a displayed parry happened on the same simulation frame as the original?
- Why a projectile hit or missed?
- Whether a draft option was genuinely offered?
- Whether RNG, configuration, or a live-balance value differed?
- Whether the replay was edited after the run?
- Whether the claimed score can be independently verified?
- Whether a seeked state can be taken over and resumed accurately?
- Whether a future build is showing the historical run truthfully?

Ghost 3.0 closes that gap.

### 66.3 Gap register

| Area | Ghost 2.0 | Ghost 3.0 requirement |
|---|---|---|
| Player control | Resulting position samples | Canonical action edges and holds at simulation cadence |
| Blade | Tip position | Full blade state, action intent, velocity, throw/recall lifecycle, tether state |
| Enemies | Spawn/death and sparse positions | Health, state, status, variant, attack phase, ownership, deterministic reconstruction |
| Projectiles | Highlight events only | Spawn, motion source, damage, deflection, ownership, death, or deterministic recreation |
| World | Stage index | Platform mutation, hazards, temporary walls, void scroll, stage runtime state |
| RNG | Not canonical | Master seed, named RNG streams, checkpoints, consumption validation |
| Drafts | Picks | Offers, rerolls, selection context, opportunity ledger, legal application order |
| Game build | Implicit | Commit/build ID, schema, config hash, content manifest, remote tuning snapshot |
| Integrity | Trusted JSON | Per-chunk checksum, packet hash, state-hash chain, optional server signature |
| Seeking | Time interpolation | Indexed chunks plus authoritative keyframes and deterministic warmup |
| Compatibility | V1 pose converter | Explicit adapters, migration reports, fallback modes, no silent drift |
| Storage | JSON in local store | IndexedDB/object storage, binary compression, resumable chunks, quotas |
| Coaching | Manual viewing | Event-backed diagnostics, comparisons, drills, confidence, progress tracking |
| Sharing | Replay ID and feed | Deep links, timestamp links, permissions, reports, challenge contracts, discovery |
| Verification | None | Deterministic validation, result certification, suspicious-run analysis |
| Recovery | None | Circular crash buffer and policy-controlled run checkpoints |
| Creation | Thumbnail | Automatic highlights, clips, run cards, camera tracks, commentary markers |
| Accessibility | Basic player | Captions, event descriptions, high-contrast ghost styles, reduced-motion playback |

### 66.4 Existing constraints that must be redesigned

The current V2 implementation intentionally keeps recordings small and simple, but several current constraints should not become permanent Ghost 3.0 architecture.

- The player track is capped by trimming old samples after roughly fifteen minutes.
- The local Vault uses the same key-value storage abstraction as other save data.
- Shared uploads serialize the entire replay to JSON before chunking it.
- The shared publisher rejects a recording above a fixed JSON-size sanity limit.
- Replay chunks are written sequentially without a manifest finalization transaction.
- The current packet has no per-chunk checksum or end-to-end integrity status.
- The current replay is reconstructed by sampled presentation state rather than by the original causal simulation.

Ghost 3.0 should retain a **compact compatibility export** for low-cost uses, but its core architecture must move beyond these constraints.

---

## 67. Replay Truth Model and Fidelity Classes

Ghost 3.0 should not claim that all replay packets have the same level of truth. Every loaded run receives an explicit fidelity class and validation status.

### 67.1 Fidelity Class A — Legacy Visual

Purpose:

- Preserve V1 and V2 runs
- Support old leaderboard attachments
- Show an approximate visual history when deterministic reconstruction is unavailable

Characteristics:

- Pose interpolation
- Sparse enemy presentation
- Event markers
- No causal re-simulation guarantee
- No takeover guarantee
- Clearly labeled `LEGACY VISUAL`

### 67.2 Fidelity Class B — Hybrid Corrected

Purpose:

- Normal player-facing replay
- Cross-version compatibility
- Efficient cloud sharing

Characteristics:

- Canonical action track
- Seeded simulation
- Sparse authoritative state keyframes
- State-hash checks
- Automatic correction when drift exceeds tolerance
- Pose fallback for isolated unsupported entities
- Usually takeover-capable at keyframes

This should be the default public Ghost 3.0 format.

### 67.3 Fidelity Class C — Deterministic Verified

Purpose:

- Leaderboard certification
- Challenge fairness
- Record validation
- High-confidence practice forks

Characteristics:

- Exact production action path
- Exact content/config fingerprint
- Deterministic RNG contract
- Full result ledger
- Re-simulation reaches the same checkpoints and final result
- Server or trusted verifier signs the validation result
- No correction beyond declared deterministic tolerance

### 67.4 Fidelity Class D — Forensic Full

Purpose:

- Developer debugging
- Crash diagnosis
- difficult nondeterministic bugs
- performance investigations
- engine migration validation

Characteristics:

- Full or near-full runtime state tracks
- High-frequency checkpoints
- console and invariant events
- performance frames
- device and lifecycle events
- optional screenshots
- deterministic inputs and RNG
- complete failure-context ring buffer

Forensic packets should normally remain private because they are larger and may contain detailed device or diagnostic data.

### 67.5 Validation statuses

Every capsule should expose one of the following statuses.

- `local-unchecked`
- `decoded`
- `compatible`
- `resimulated`
- `verified`
- `certified`
- `migrated`
- `legacy`
- `drift-corrected`
- `partially-supported`
- `corrupted`
- `rejected`

Fidelity and validation are different. A Class B replay can be `verified` after successful hybrid validation. A Class C packet can be `rejected` if its hash chain fails.

### 67.6 Hybrid replay algorithm

The recommended playback algorithm is:

1. Load the manifest and the nearest prior authoritative keyframe.
2. Instantiate an isolated replay world using the historical run configuration.
3. Restore the keyframe.
4. Reapply canonical actions and events using the recorded RNG streams.
5. Compare periodic state hashes to the recorded hashes.
6. If the simulation is within tolerance, continue normally.
7. If a noncritical cosmetic field drifts, mark it and continue.
8. If a supported critical field drifts, apply a declared correction keyframe and mark the interval `drift-corrected`.
9. If the entity or mechanic is unsupported, use its presentation fallback track and mark the interval `partially-supported`.
10. Never hide the resulting status from inspection.

### 67.7 Critical-state hash

A critical hash should exclude cosmetic noise and include gameplay truth such as:

```text
simulation tick
run state and wave state
player transform, velocity, health, timers, shields, revives
blade state, transform, velocity, ownership, throw lifecycle
enemy identity, type, variant, health, transform, state, timers, statuses
projectile identity, transform, velocity, ownership, damage, state
platform and hazard state
RNG stream positions
build and draft ledger
score, multiplier, style, kills, run time
```

FX particles, audio playback cursors, camera shake, and non-gameplay animation jitter should not invalidate a competitive replay.

### 67.8 Replay-world isolation

Playback must run in an isolated world object rather than borrowing or mutating the live run globals.

The isolation contract should guarantee:

- No save writes
- No profile or achievement updates
- No leaderboard writes
- No cloud progression sync
- No advertisement calls
- No real input consumption
- No shared RNG state
- No collision with a live player
- No effect on the current menu state unless the user explicitly exits playback

### 67.9 Historical configuration capsule

A replay should not blindly mutate the current global `CONFIG` and hope it resembles the old run.

It should carry or resolve a historical configuration capsule containing:

- Base balance version
- Difficulty modifiers
- Remote Config snapshot
- Weapon mutations
- Meta-upgrade effects
- Draft mutation order
- Tier evolution order
- Mode-specific scaling rules
- Stage and enemy content versions
- Feature flags

The replay runtime applies this capsule to an isolated configuration instance.

---

## 68. The `.tearghost` Run Capsule and Track Schema

Ghost 3.0 should introduce a portable, versioned container informally called a **Tear Ghost Capsule**.

Recommended extension:

```text
.tearghost
```

The extension is optional for cloud storage but valuable for user export, developer artifacts, bug reports, tournaments, and long-term archival.

### 68.1 Container goals

- Binary and compressed
- Streamable
- Random-access
- Chunk-addressable
- Self-describing
- Hashable
- Partially recoverable
- Forward-compatible
- Safe to parse as untrusted input
- Able to contain optional presentation assets without requiring them

A capsule should consist of a small manifest, an index, independently checksummed timeline chunks, optional assets, and an integrity footer.

### 68.2 Manifest example

```yaml
schema: tearghost/3.0.0
capsuleId: tg_01J...
createdAt: 2026-07-22T18:43:12Z

producer:
  gameBuild: tear-web-0.9.0
  commit: c60187414ced8e6ab3cf952a72a9ce0d125f4c46
  protocol: 3
  platform: standalone-web
  runtime: browser

run:
  mode: campaign
  difficulty: hard
  weapon: hammer
  seed: 882901
  won: true
  finalWave: 50
  score: 18422
  durationTicks: 94421
  resumed: false
  modded: false

fingerprints:
  configHash: sha256:...
  contentHash: sha256:...
  actionHash: sha256:...
  resultHash: sha256:...
  rootHash: sha256:...

fidelity:
  class: hybrid-corrected
  validation: verified
  corrections: 0

tracks:
  - id: actions
    codec: action-rle-v1
    cadence: tick
  - id: keyframes
    codec: state-delta-v1
    cadence: indexed
  - id: events
    codec: eventpack-v1
  - id: presentation
    codec: pose-delta-v2
    optional: true

privacy:
  visibility: unlisted
  telemetry: coarse
  trainingConsent: false
```

### 68.3 Required core tracks

#### Action track

The canonical action representation should record game semantics, not operating-system key codes.

```text
moveX
moveY
jumpPressed
jumpHeld
dashPressed
throwRecallPressed
tetherHeld
aimX
aimY
pausePressed
menuDirection
menuConfirm
menuBack
menuTab
menuScroll
inputContext
```

Additional fields may include:

- Active control scheme
- Quantized analog magnitude
- Aim-source mode
- Input suppression caused by menus, cutscenes, root, stun, or focus loss
- A monotonically increasing action sequence number

Raw keyboard scan codes and raw pointer coordinates should not be part of the canonical public track.

#### RNG track

The capsule should store:

- Master seed
- Named stream seeds
- Stream algorithm version
- Stream checkpoint counters
- Optional sampled outputs for nondeterministic legacy systems

Recommended named streams:

```text
combat
enemy-ai
spawn
draft
boss
world
loot
cosmetic
camera
audio
```

Cosmetic streams must never affect critical-state verification.

#### Keyframe track

Each authoritative keyframe should contain enough state to start deterministic warmup from that point.

At minimum:

- Tick and elapsed time
- Full run state
- Current mode and difficulty context
- Isolated configuration delta
- Player state
- Blade state
- Live enemy states
- Live projectile states
- Platform and hazard state
- Spawn queue and timers
- Boss runtime state
- Draft/build ledger
- RNG stream positions
- Critical state hash

#### Event track

Events should carry stable IDs, source IDs, target IDs, causes, and causal parents where applicable.

Examples:

```text
run-start
state-transition
wave-start
spawn
enemy-attack-start
enemy-hit
player-hit
shield-absorb
parry
perfect-parry
blade-hit
throw
recall
launch
slam
power-slam
updraft
status-applied
status-expired
enemy-death
boss-phase
boss-death
wave-clear
draft-offered
draft-picked
tier-offered
tier-picked
revive
death
run-end
focus-lost
pause
resume
checkpoint
```

A causal event graph enables questions such as “which exact deflected bomb caused these five deaths?” without guessing from timestamps.

#### Result ledger

The final result must be derivable and independently checkable.

The ledger should include:

- Score additions and multipliers
- Kill count by cause
- Wave and boss completion
- Damage dealt and received
- Healing and shields
- Draft and tier history
- Economy rewards
- Revives used
- Final build
- Completion reason
- Leaderboard eligibility flags

### 68.4 Recommended extended tracks

#### Player presentation track

Useful for smooth fallback rendering:

- Pose
- facing
- animation state
- afterimage triggers
- damage flash
- invulnerability presentation

#### Blade presentation track

- Hilt, tip, angle, and model pose
- Trail control points
- visual state
- throw path
- embed and catch moments

#### Entity presentation track

- Spawn visuals
- poses
- animation states
- death visuals
- boss presentation beats

#### World track

- Stage changes
- platform creation, destruction, recycling, and movement
- temporary walls
- sludge and hazard zones
- void-scroll state
- arena mutations
- camera bounds

#### UI track

- Menu state transitions
- selected mode, difficulty, and weapon
- draft card offers
- selected card
- pause screens
- result screen
- replay-publication actions

This allows a true main-menu-to-menu replay when desired, not only combat playback.

#### Camera and presentation-event track

- camera mode
- zoom target
- shake trigger
- slow-motion trigger
- flash trigger
- cinematic framing markers
- optional authored camera keyframes

#### Audio cue track

Record semantic cue IDs rather than raw audio buffers.

- music state
- stingers
- impact cues
- boss cues
- accessibility cue descriptions

#### Performance track

Developer or opt-in diagnostic packets may include:

- frame time
- simulation time
- render time
- memory pressure signals
- long tasks
- dropped frames
- visibility changes
- device class
- browser version family

### 68.5 Chunking and random access

Timeline chunks should be independently decodable and normally span a short fixed interval, such as two to ten seconds, with additional boundaries at:

- Run start
- Wave start
- Draft open
- Draft selection
- Boss intro
- Boss phase transition
- Boss death
- Player death
- Run end

The index maps:

```text
time -> chunk
wave -> chunk
boss phase -> chunk
event ID -> chunk
keyframe ID -> chunk
highlight ID -> chunk
```

A user seeking to wave 99 should not download or decode waves 1–98 first.

### 68.6 Compression strategy

Ghost 3.0 should move away from plain expanded JSON for canonical storage.

Recommended techniques:

- Delta encoding for positions and timers
- Run-length encoding for held actions
- Bit packing for booleans and small enums
- Varints for IDs and tick deltas
- Fixed-point or quantized numeric fields where exact float precision is unnecessary
- Dictionary IDs for enemy, ability, weapon, event, and stage names
- Independent chunk compression
- Optional presentation-track omission

JSON should remain available as a debugging and interchange view, not as the only authoritative encoding.

### 68.7 Numeric determinism

The replay specification must declare which fields require exact equality and which use tolerance.

Preferred long-term approach:

- Integer simulation ticks
- Stable seeded RNG
- Fixed-point values for critical timers and selected physics fields where practical
- Stable entity iteration order
- Stable event ordering
- Explicit rounding rules

A full fixed-point rewrite is not required before Ghost 3.0 begins. The hybrid correction model allows incremental determinism improvements, but each mechanic must declare its tolerance and correction behavior.

### 68.8 Integrity structure

Each chunk should have:

- Length
- codec ID
- uncompressed checksum
- compressed checksum
- previous-chunk hash
- current-chunk hash

The capsule root may be represented by a hash chain or Merkle root. Published verified runs may additionally carry a server-generated validation signature over:

```text
capsule root
run result
build fingerprint
owner identity or pseudonymous passport
timestamp
verification version
```

### 68.9 Packet profiles

Ghost 3.0 should expose profiles rather than forcing every use case to pay for every track.

#### Compact Public

- Actions
- RNG
- sparse keyframes
- events
- result ledger
- compact presentation fallback
- highlights

#### Coaching

Everything in Compact Public plus:

- richer input telemetry
- threat and decision context
- player health and skill metrics
- annotations
- comparison anchors

#### Forensic QA

Everything in Coaching plus:

- high-frequency state
- invariants
- console events
- performance
- screenshots
- failure ring buffer

#### Cinematic

Everything needed for playback plus:

- authored camera track
- high-fidelity presentation track
- optional rendered preview or clip cache

### 68.10 Provenance labels

Every capsule must declare whether it came from:

- Human live play
- Scripted bot
- Neural bot and policy version
- State Forge scenario
- Imported legacy replay
- Developer debug run
- Resumed run
- Modified build
- Community challenge
- Tournament-certified environment

Provenance is part of replay truth, not optional metadata.

---
## 69. Recorder Architecture, Runtime Budgets, and Failure Safety

Ghost 3.0 should be implemented as a low-overhead event and state capture pipeline, not as a monolithic object that serializes the whole world every frame.

### 69.1 Recorder modules

Recommended internal modules:

```text
GhostSession
GhostActionRecorder
GhostEventRecorder
GhostKeyframeWriter
GhostPresentationSampler
GhostHighlightDetector
GhostChunkEncoder
GhostIntegrityWriter
GhostRingBuffer
GhostQuotaManager
GhostUploadQueue
```

Each module should be optional and capability-driven.

For example:

- A compact public run enables actions, events, keyframes, highlights, and integrity.
- A local instant replay may enable only the last sixty seconds of actions, events, and presentation.
- A forensic bug capture enables all diagnostic tracks.

### 69.2 Recording lifecycle

Recommended lifecycle:

```js
const session = GhostCore.begin({
  profile: "compact-public",
  provenance: "human",
  visibility: "private"
});

session.recordAction(action);
session.recordEvent(event);
session.checkpoint(reason);
session.markHighlight(kind, priority);

const capsule = await session.finish(result);
```

The run recorder should begin before the first gameplay state transition if a full journey is being captured. It should be able to include:

- Main-menu selections
- Mode setup
- Difficulty selection
- Weapon selection
- Loading and intro states
- Combat
- Drafts
- Results
- Replay publication
- Return to menu

A combat-only profile may begin at run initialization.

### 69.3 Record actions at the authoritative boundary

Actions must be recorded after device-specific mapping but before gameplay consumption.

Correct boundary:

```text
keyboard / mouse / touch / gamepad
    -> Input canonicalization
    -> Ghost action capture
    -> gameplay systems
```

This avoids encoding browser events while preserving exactly what the game believed the player asked it to do.

The track must distinguish:

- Held state
- Pressed edge
- Released edge where meaningful
- Suppressed input
- Buffered input
- Consumed input

A jump press that was buffered and executed three ticks later should preserve both the press and the execution event.

### 69.4 Canonical clocks, simulation-tick ownership, and within-tick ordering

Every recorded item should be timestamped primarily by integer simulation tick, but Ghost 3.0 must explicitly model the fact that *Tear* has more than one valid clock.

Recommended clock domains:

```text
simulationTick       authoritative gameplay causality
runTick              scored run progression; may exclude menus and selected pauses
sessionTick          full Chronicle progression from capture start through menu return
presentationTick     boss theatre, replay presentation, slow motion, and noncausal visual timing
wallMonotonicMs      performance, focus loss, pauses, ads, upload timing, and lifecycle diagnosis
serverTimestamp      optional publication, tournament, and verification chronology
```

Only `simulationTick` may decide gameplay causality. `runTick` and `sessionTick` are derived counters with declared pause rules. `presentationTick` may stretch or freeze without changing gameplay truth. Wall or server time may never be used to recreate collisions, attacks, drafts, RNG consumption, or scoring.

Wall-clock time may be recorded for:

- performance diagnostics
- pause duration
- visibility loss
- platform interruptions
- advertisement duration
- controller disconnect duration
- upload timing
- crash and support chronology

Every causal record should also have deterministic within-tick ordering:

```js
{
  simulationTick,
  phase,
  sequence,
  trackId,
  kind,
  payload
}
```

Recommended ordered phases:

```text
0 input-canonicalized
1 pre-simulation
2 player-and-blade
3 enemy-ai
4 projectiles-and-hazards
5 collision-and-damage
6 deaths-and-rewards
7 wave-draft-and-state-transitions
8 post-simulation-commit
9 presentation-only
```

The exact phase registry must be versioned. A monotonically increasing `sequence` within each tick and phase breaks ties without relying on object iteration accidents.

This contract makes questions such as “did the shield absorb before the death check?” or “was the draft opened before the reward mutation?” answerable from the Chronicle rather than inferred from approximate timestamps.

Gameplay causality must not depend on fluctuating wall-clock deltas.

### 69.5 Keyframe policy

A keyframe should be written:

- At run start
- At every wave start
- Immediately before and after every draft
- At every boss intro
- At every boss phase transition
- At every arena mutation
- At every revive
- At every player death
- At run end
- On a fixed maximum interval
- When drift risk exceeds a threshold
- When a new mechanic declares a critical transition

Recommended initial interval targets:

- Compact public: every 3–5 seconds plus semantic boundaries
- Coaching: every 1–3 seconds plus semantic boundaries
- Forensic: every 0.25–1 second around failures, otherwise every 1–2 seconds

The interval should adapt. Dense combat, a boss transition, or a rapidly mutating void arena deserves more checkpoints than a static menu.

#### Explicit state-codec registry

Keyframes must not be produced by blindly serializing arbitrary live JavaScript objects.

Ghost Core and State Forge should share a versioned codec registry:

```js
GhostStateRegistry.register("player", PlayerGhostCodec);
GhostStateRegistry.register("blade", BladeGhostCodec);
GhostStateRegistry.register("charger", ChargerGhostCodec);
GhostStateRegistry.register("source", SourceGhostCodec);
GhostStateRegistry.register("projectile", ProjectileGhostCodec);
GhostStateRegistry.register("void-platform", VoidPlatformGhostCodec);
```

Every codec owns:

- Stable type ID
- Schema version
- Capture
- Structural validation
- Semantic validation
- Restore through production constructors
- Reference resolution
- Migration
- Critical-hash projection
- Presentation fallback projection

Restore must be transactional:

1. Decode into a temporary replay world.
2. Validate schema, limits, and compatibility.
3. Recreate entities through approved constructors or factories.
4. Resolve ownership, target, support, projectile, platform, and boss relationships.
5. Restore RNG cursors and configuration capsule.
6. Run invariants without committing.
7. Compare the reconstructed keyframe hash.
8. Atomically publish the world only after every check passes.
9. Discard the temporary world and retain the previous state on failure.

No replay payload may instantiate a class by evaluating a user-supplied name or execute replay-provided code.

### 69.6 Circular instant-replay buffer

Ghost Core should maintain an optional in-memory circular buffer of recent gameplay.

Recommended default windows:

- 20–30 seconds on constrained mobile
- 60 seconds on normal devices
- 120 seconds in developer mode

Triggers that can freeze and save the ring buffer:

- Player death
- Boss death
- Perfect-parry chain
- Large multikill
- New style peak
- Achievement unlock
- Crash or unhandled error
- Invariant violation
- Manual “save moment” input

This gives *Tear* an instant-replay feature and dramatically improves bug reporting without requiring every session to be permanently stored.

### 69.7 Crash-safe journaling

A run should not be lost because the final `finish()` call never happened.

Recommended strategy:

1. Keep the active manifest and latest complete chunk in IndexedDB.
2. Mark chunks as `pending`, then `committed` after checksum verification.
3. Update the manifest’s last committed tick atomically.
4. On next launch, detect orphaned sessions.
5. Offer to recover, inspect, export, or delete them.

An orphaned session should be labeled `incomplete` and never silently submitted to a competitive leaderboard.

### 69.8 Run-resume policy

Ghost checkpoints can support resuming interrupted runs, but competitive integrity requires explicit rules.

Recommended policy:

- Adventure and training modes may allow local crash recovery.
- Endless and Gauntlet may allow recovery but mark the run `resumed`.
- One-Hit or competitive leaderboard categories may reject resumed runs or place them on a separate board.
- Recovery must restore from a committed keyframe and reapply the post-keyframe action journal.
- A focus loss or normal pause is not automatically a “resume.”
- A reload, process termination, or crash is a resume event.

### 69.9 Performance budgets

The following are initial engineering targets, not assumed truths. They must be measured across representative desktop and mobile devices.

#### Recording overhead

- Compact profile median CPU overhead: target below 1% of frame budget
- Compact profile p95 per-tick recorder work: target below 0.20 ms on a midrange desktop
- Coaching profile p95: target below 0.50 ms
- No synchronous storage write inside the gameplay critical path
- No full-run `JSON.stringify()` on the main thread during combat

#### Memory

- Bounded in-memory staging buffers
- Chunk flush before memory grows with full run duration
- Ring buffer uses an explicit memory budget
- Presentation sampling degrades before action or event truth is lost

#### Storage-size target bands

Initial target bands should be benchmarked rather than hardcoded:

- Compact public: roughly 100–400 KB per gameplay minute
- Coaching: roughly 250–900 KB per gameplay minute
- Forensic: roughly 0.5–3 MB per gameplay minute depending on diagnostics
- Preview video or high-resolution clip: separate asset, never required for capsule validity

The exact target should be revisited after a real binary codec prototype.

### 69.10 Adaptive fidelity under pressure

If memory, CPU, storage, or thermal pressure occurs, Ghost 3.0 should degrade in a controlled order.

1. Reduce optional cosmetic presentation sampling.
2. Drop optional performance telemetry detail.
3. Reduce screenshot frequency.
4. Increase noncritical keyframe spacing.
5. Preserve canonical actions, critical events, result ledger, and integrity.
6. If critical capture cannot be maintained, mark the packet incomplete rather than pretending it is valid.

### 69.11 Main-thread isolation

Encoding, compression, checksums, thumbnail generation, and upload preparation should run in a Web Worker where browser support permits.

The main thread should enqueue small immutable messages or transferable buffers.

Recommended pipeline:

```text
gameplay tick
  -> append compact action/event records
  -> transfer completed raw chunk
  -> worker encodes + compresses + hashes
  -> IndexedDB commit
  -> optional background upload queue
```

### 69.12 Backpressure

The recorder must know when its worker or storage queue is falling behind.

Backpressure metrics:

- pending raw chunks
- pending encoded chunks
- pending storage writes
- pending upload bytes
- oldest uncommitted tick
- worker latency

If backpressure crosses thresholds:

- reduce optional fidelity
- pause uploads
- preserve local truth first
- emit a diagnostic event
- never block the simulation waiting for cloud I/O

### 69.13 Browser and platform lifecycle

Record semantic lifecycle events for:

- `visibilitychange`
- focus and blur
- pointer-lock loss
- fullscreen transitions
- game pause and resume
- CrazyGames ad start and end
- audio mute state
- orientation changes
- page freeze or resume when available
- network offline and online

These events explain apparent inactivity and support reliable run classification.

### 69.14 Input-device fidelity

The canonical action track stays device-independent, but an optional device context track may record:

- keyboard and mouse
- touch stick
- touch drag
- gamepad
- mixed input
- sensitivity setting
- touch aim mode
- controller deadzone profile

This enables fair device-segment analysis and controller-specific coaching without exposing raw hardware identifiers.

### 69.15 Recorder test suite

The recorder itself needs deterministic tests.

- Every action edge survives encode/decode.
- Chunk boundaries do not duplicate or drop events.
- A seek keyframe replays to the same next hash as a full replay.
- Corrupted chunks are detected.
- An interrupted chunk never becomes committed.
- V2 conversion never mutates the source object.
- Worker backpressure preserves critical tracks.
- Storage quota exhaustion results in an explicit incomplete status.
- A replay session never writes profile progression.
- A replay begun in one UI state ends with a coherent state-transition ledger.

---

## 70. Playback Engine and Ghost Theater 3.0

Ghost Theater should feel like a professional replay workstation scaled to the visual identity of *Tear*, not a basic play/pause screen.

### 70.1 Playback modes

- **Authentic** — historical camera, HUD, timing, and presentation.
- **Clean** — minimal HUD and reduced overlays for watching the action.
- **Coach** — input display, threat overlays, mistakes, opportunities, and annotations.
- **Compare** — synchronize two or more runs by time, wave, boss phase, or event.
- **Cinematic** — free camera, authored cuts, slow motion, and clip export.
- **Forensic** — developer state inspector, hashes, entity IDs, event causality, and diagnostics.

### 70.2 Timeline design

The timeline should support layered tracks.

```text
Waves / bosses / drafts
Player health
Boss health
Style rank
Damage events
Parries and defensive events
Throws and recalls
Draft and tier picks
Deaths and revives
Highlights
Annotations
Drift corrections
Performance anomalies
```

Users should be able to filter tracks and jump directly to a selected event.

### 70.3 Playback controls

Recommended controls:

- Play and pause
- Seek
- Frame step forward
- Frame step backward through keyframe restoration
- Jump to next or previous event
- Jump by wave
- Jump by boss phase
- Speed presets such as 0.05x, 0.1x, 0.25x, 0.5x, 1x, 2x, 4x, 8x, and 16x
- Hold-to-scrub preview
- Loop selected interval
- A/B interval markers
- Bookmark current moment
- Copy timestamp link
- “Practice from here”
- “Compare from here”

Very high speeds may suppress noncritical FX and audio while preserving event timing.

### 70.4 Reverse playback

True reverse simulation is unnecessary and fragile.

Frame-backward behavior should:

1. Restore the nearest prior keyframe.
2. Fast-forward deterministically to the requested previous tick.
3. Render the result.

A small state cache around the current cursor can make repeated back-stepping responsive.

### 70.5 Camera system

Camera presets:

- Original player camera
- Player follow
- Blade follow
- Current target follow
- Boss arena wide
- Dynamic combat director
- Free camera
- Split focus for player and boss
- Vertical-stage framing for void sections
- Picture-in-picture blade or input view

The cinematic director can use event priority to produce automatic cuts, but the authentic camera remains the truth-preserving default.

### 70.6 Visual layers and overlays

Toggleable layers:

- Ghost player body
- Blade and trail
- Enemies
- Projectiles
- Hazards
- Hitboxes
- Hurtboxes
- attack telegraphs
- velocity vectors
- target selection
- time-to-impact arcs
- player input display
- action-buffer display
- RNG and hash status
- damage source labels
- style and score ledger
- draft/build panel
- route trail
- heatmaps
- coaching annotations

Developer-only overlays must never be exposed as competitive gameplay assistance during a live run.

### 70.7 Ghost visual identity

Ghosts need customizable but readable styles.

- Opacity slider
- Solid, outline, silhouette, afterimage, or particle style
- Player-best color
- friend or public-run color
- bot color
- verified-run badge
- high-contrast mode
- colorblind-safe palettes
- optional nameplate
- optional path trail

When multiple ghosts are visible, each receives a stable legend and distinct trail pattern in addition to color.

### 70.8 Multi-run comparison

Comparison modes:

#### Overlay

Both runs occupy the same arena with visual separation.

#### Split screen

Each run retains its own camera and world.

#### Event-aligned comparison

Runs align by:

- wave start
- first enemy contact
- boss intro
- boss phase
- boss death
- draft screen
- run end

#### Difference view

Display:

- time delta
- health delta
- damage delta
- score delta
- route divergence
- action divergence
- draft divergence
- style-rank delta
- enemy time-to-kill delta

### 70.9 Instant replay

After death, boss kill, or another major moment, the game may offer a short instant replay using the circular buffer.

Recommended defaults:

- Death: last 8–12 seconds
- Boss kill: final 10–20 seconds
- Perfect-parry multikill: contextual interval
- New personal record: final sequence plus result moment

Instant replay must be skippable and disabled by a setting.

### 70.10 “Possess the Ghost” takeover

One of Ghost 3.0’s strongest player-facing features should be the ability to take control at a replay timestamp.

Flow:

1. User pauses a compatible replay.
2. User selects `PRACTICE FROM HERE`.
3. Ghost Core resolves the nearest takeover-capable keyframe.
4. The state-codec registry transactionally restores an isolated temporary world.
5. Historical actions and RNG advance that world to the selected tick.
6. Critical state hash, entity references, configuration, and run-ledger invariants are verified.
7. State Forge creates the durable practice copy only after validation succeeds.
8. Input latches, pointer-lock deltas, buffered jump/dash edges, and active control scheme are reset or restored according to an explicit takeover policy.
9. The player or selected TearBot gains control.
10. A new Chronicle starts with immutable lineage to the source replay and fork tick.
11. The practice fork is labeled and cannot submit as the original run.

Takeover must fail safely when the selected range depends on unsupported historical code. The UI should offer the nearest earlier compatible checkpoint rather than creating a plausible-looking but invalid state.

Use cases:

- Practice the exact boss attack that killed you.
- Try a different draft decision.
- See whether a parry was possible.
- Recover from a low-health wave 99 state.
- Test Sword versus Hammer from the same situation.

### 70.11 Branching replay timeline

Practice forks can form a tree.

```text
Original Run
  ├─ Fork A: parry instead of dash
  │    └─ Fork A2: choose different draft
  └─ Fork B: Hammer instead of Sword
```

The UI should clearly distinguish historical truth from counterfactual branches.

### 70.12 Automatic highlight director

Highlight scoring can consider:

- Boss phase completion
- Boss kill
- Near-death recovery
- Perfect parry
- Multikill
- High style rank
- Long aerial sequence
- Power-slam chain
- Rare ability interaction
- Personal-best split
- Last-second survival
- Zero-damage wave
- Significant score swing
- Unusual exploit or physics event in developer mode

The director outputs candidate intervals with reasons and confidence. The player selects, trims, and names clips.

### 70.13 Clip and media tools

Ghost Theater may create:

- Short rendered video clips
- GIF-like lightweight previews
- Static run cards
- Build cards
- Boss-kill cards
- Shareable thumbnail frames
- Timeline snapshots

Rendered media is a derivative asset. The `.tearghost` capsule remains the interactive source.

### 70.14 Commentary and captions

Optional semantic captions can describe important events:

```text
00:42.183 — Perfect parry: Bomber bomb
00:42.517 — Deflected blast killed 5 enemies
00:43.100 — Style reached TEARING!
```

An optional generated commentary layer may narrate a run, but it must be derived from deterministic event facts and clearly separated from the source replay.

### 70.15 Accessibility

Ghost Theater should include:

- Keyboard-only controls
- Gamepad controls
- Touch-friendly scrubber
- Screen-reader labels for replay controls and event lists
- Captions for important audio cues
- Reduced motion
- flash reduction
- screen-shake reduction independent of original run
- high-contrast ghost styles
- colorblind-safe comparison modes
- scalable text
- pause-on-focus-loss option

Accessibility settings may alter presentation without altering replay truth.

### 70.16 Mobile theater

On mobile:

- Use a bottom-sheet event list
- Support two-finger timeline zoom
- Use large transport controls
- Provide portrait summary and landscape playback layouts
- Avoid requiring hover
- Preserve safe-area insets
- Allow low-fidelity preview before downloading full chunks

### 70.17 Playback acceptance tests

- Seeking to any indexed event produces the same critical state as full playback.
- Switching cameras does not affect simulation.
- Hiding HUD layers does not affect event timing.
- Speed changes do not skip critical events.
- Loop playback does not duplicate one-time presentation events.
- A drift correction is visible in replay metadata.
- A V2 legacy run cannot falsely display a verified badge.
- Takeover creates a new practice lineage and never overwrites the original.
- Two compared runs align reproducibly by the selected semantic anchor.

---

## 71. Player-Facing Ghost Experiences Beyond Replay Viewing

Ghost 3.0 should generate entirely new player experiences without requiring synchronous multiplayer.

### 71.1 Chase Your Best

The player fights through a run while a noninteractive projection of their personal-best ghost is visible.

Requirements:

- The live run owns all enemies and RNG.
- The ghost is a visual comparison, not a second simulated combatant.
- The ghost may be segmented by wave so drift between different spawn histories does not become misleading.
- The HUD shows ahead/behind deltas by time, score, health, and wave.
- The player can hide the ghost while retaining split data.

### 71.2 Seed-Locked Ghost Race

For a stronger apples-to-apples comparison:

- Same mode
- Same difficulty
- Same weapon availability
- Same master seed
- Same draft-offer sequence
- Same live-balance snapshot
- Same content version

The challenger makes their own inputs and draft choices unless the challenge contract locks a build.

A race must state exactly which variables are shared and which remain free.

### 71.3 Beat This Run

A published run can generate a challenge code.

Challenge contract examples:

- Beat final score
- Beat completion time
- Survive longer
- Take less damage
- Clear with the same build
- Clear with a weaker build
- Defeat the boss from a supplied checkpoint
- Match or exceed style rank
- Win without throw
- Win using only parries and deflections

### 71.4 Boss Memory

A player can save and share a specific boss encounter rather than an entire run.

The capsule segment includes:

- Entry state
- Build
- difficulty
- boss phase state
- arena
- RNG continuation
- result
- annotations

Players can immediately watch or practice the segment.

### 71.5 Daily Echo

A daily challenge can publish one canonical capsule or scenario seed.

Possible daily formats:

- Fixed build
- Random legal wave-99 build
- One-Hit boss phase
- Hammer-only gauntlet
- Parry trial
- Style trial
- Survival interval
- Community run remix

The daily leaderboard accepts only runs produced from the declared challenge contract.

### 71.6 Learning Ghost

A learning ghost is selected for instructional value rather than raw score.

Examples:

- Clean tutorial completion
- Safe Warden strategy
- Hammer launch fundamentals
- Perfect-parry timing demonstration
- Strong recovery from low health
- Efficient draft synergy

The Learning Ghost may pause at annotations or offer practice prompts.

### 71.7 Nemesis Ghost

The system can select a rival just above the player’s current performance band.

Selection should consider:

- Similar mode and difficulty
- Similar weapon
- Similar current wave range
- Slightly stronger but reachable result
- Compatible replay version
- Human or bot preference
- Similar input device when requested

The goal is productive challenge, not always showing the world record.

### 71.8 TearBot ghosts

Every calibrated TearBot level can publish labeled reference ghosts.

Use cases:

- Watch the difference between Levels 3, 6, and 9.
- Practice against a target performance band.
- Compare human play to a bot without misrepresenting the bot as a human.
- Generate evergreen learning examples for rare builds.
- Populate challenge content before a large community exists.

Bot ghost cards must display:

- Bot level
- Astuteness vector
- Policy version
- Information privileges
- Whether the run is human-like or Level Ω

### 71.9 Ghost Relay

A cooperative asynchronous mode can allow multiple players to continue from declared handoff checkpoints.

Example:

- Player A clears waves 1–10.
- Player B receives the exact wave-11 capsule state.
- Player C takes over at the next boss.
- The final run preserves lineage and each contributor’s segment.

This should be a separate unranked or specially ranked mode because it changes the authorship model.

### 71.10 Hall of Echoes

A curated archive can preserve:

- First known campaign completion
- seasonal champions
- developer showcase runs
- community challenge winners
- unusual build records
- style exhibitions
- historic balance-version records
- bot milestones

The Hall of Echoes should preserve provenance and game-version context so old records remain meaningful after balance changes.

### 71.11 Run DNA

Each run can receive a compact descriptive fingerprint.

Dimensions may include:

- aggression
- aerial play
- parry reliance
- throw reliance
- movement tempo
- risk tolerance
- target-switch frequency
- style variety
- defensive discipline
- draft archetype
- boss efficiency
- recovery quality

Run DNA powers search, recommendations, rival matching, and coaching. It must be derived from transparent metrics, not presented as a mysterious personality judgment.

### 71.12 Personal career archive

Ghost Vault should become a player’s searchable history.

Filters:

- Date
- mode
- difficulty
- weapon
- wave
- result
- build archetype
- ability
- boss
- score range
- damage taken
- verified status
- human or bot
- tags
- pinned
- shared
- resumed
- game version

Career views:

- Personal best timeline
- First clear of each difficulty
- Best run per weapon
- Most improved boss
- Favorite builds
- Near-miss archive
- Style milestones
- Longest survival
- Run DNA evolution

### 71.13 Fairness contract for live ghost overlays

A ghost overlay is informational. It must not:

- Reveal future spawns not yet visible in the live run
- Reveal hidden boss attacks
- expose future draft offers
- expose invisible enemy positions unless the original live game would show them
- alter enemy targeting
- absorb attacks
- change collision
- change spawn timing
- change RNG consumption
- grant unearned input hints during a ranked category unless the category explicitly allows coaching

### 71.14 Competitive categories

Leaderboards should separate relevant conditions rather than mixing incomparable runs.

Potential flags:

```text
verified
resumed
challenge-contract
coach-enabled
ghost-visible
modded
legacy-build
bot-generated
practice-fork
```

Avoid excessive leaderboard fragmentation. Only conditions that materially alter fairness need dedicated categories or eligibility rules.

### 71.15 Reward philosophy

Ghost features should reward engagement without becoming a progression exploit.

Safe rewards:

- cosmetics
- titles
- replay frames
- ghost visual styles
- archive badges
- challenge streaks

Avoid granting major combat power merely for downloading or replaying a popular ghost.

---

## 72. Ghost Coach, Run Autopsy, and Replay-to-Practice Loop

Ghost Coach should be a data-backed training system, not a generic text generator telling the player to “dodge more.”

### 72.1 Run Autopsy

Every completed run may generate a structured autopsy containing:

- What ended the run
- Strongest segment
- Weakest segment
- Largest avoidable damage event
- Most valuable ability interaction
- Missed defensive opportunities
- Draft synergy and regret
- Boss-phase performance
- Movement efficiency
- Blade commitment and hit quality
- Style consistency
- Recovery performance
- Improvement against recent comparable runs

### 72.2 Evidence-first findings

Each finding should link to:

- Timestamp
- replay interval
- metric
- relevant event chain
- confidence
- comparison baseline
- suggested drill

Example:

```yaml
finding: late_parry_commitment
severity: high
confidence: 0.91
interval: 00:42.100-00:42.650
evidence:
  projectileTimeToImpactMs: 310
  firstDeflectCapableBladeSpeedMsBeforeImpact: 38
  successfulPeerMedianMs: 126
impact:
  damageTaken: 24
  styleLost: 52
practice:
  scenario: drill/parry/bomber-approach
  startTick: 2518
  repetitions: 8
```

### 72.3 Mistake taxonomy

#### Movement

- Stationary under pressure
- late jump
- wasted dash
- unsafe dash endpoint
- failed platform transition
- repeated edge trap
- poor spacing
- void-scroll route inefficiency

#### Blade mechanics

- low-speed contact
- poke-heavy swing
- uncommitted swing
- poor angle against armor
- missed launch opportunity
- mistimed slam
- throw without safe recall plan
- blade stranded outside reclaim distance

#### Defense

- parryable projectile dodged inefficiently
- attempted parry too early or too late
- damage taken with dash available
- shield wasted on low-threat contact
- repeated boss telegraph miss
- one-hit risk exposure

#### Targeting

- ignored healer or support enemy
- attacked armored target from protected side
- overcommitted to low-threat enemy
- failed to capitalize on stunned enemy
- slow target switching

#### Draft strategy

- low-synergy pick
- duplicated a stat past useful marginal value
- ignored build-defining Special
- selected glass-cannon risk in an incompatible survival state
- failed to prepare for known boss pressure
- tier evolution with lower expected value than alternatives

#### Run management

- style decay from downtime
- wave-clear healing opportunity mismanaged
- revive resource wasted
- excessive safe play causing time loss
- excessive aggression causing avoidable damage

### 72.4 Opportunity detection

The coach should detect not only mistakes but unrealized opportunities.

Examples:

- A cluster was positioned for a power slam.
- A bomber projectile could have been reflected into multiple enemies.
- A marked armored enemy could have been launched.
- The blade was returning through a high-value line.
- A safe aerial-rave extension was available.
- A dash refund ability was one target short of activating.

Opportunity detection should use conservative confidence thresholds to avoid teaching imaginary “perfect” lines.

### 72.5 Baselines

A player should be compared against relevant baselines, not only the world record.

Potential baselines:

- Their own recent runs
- Their personal best
- Similar-skill players
- Same weapon and difficulty
- Same boss phase
- Same or similar build archetype
- TearBot level representing their current band
- Expert demonstration

### 72.6 Draft regret analysis

Draft regret should not assume that the option with the highest global win rate was automatically correct.

It should consider:

- Current health and survivability
- current build
- future opportunity count
- mode and difficulty
- next boss
- player Run DNA
- known mechanical strengths
- risk tolerance
- counterfactual rollout results
- uncertainty

Output example:

```text
At wave 38, Storm Recall T2 was probably stronger than another Keen Edge stack for this run.
Estimated impact: +7–13% boss damage, medium confidence.
Reason: the build already had three throw synergies and your successful recalls were above the Hard-mode median.
```

### 72.7 Replay-to-drill compiler

Every coach finding should be convertible into a practice scenario.

Flow:

1. Select the finding.
2. Restore two to five seconds before the event.
3. Remove unrelated noise if the drill profile requests isolation.
4. Preserve the original full context for an authentic retry mode.
5. Define success criteria.
6. Run repetitions.
7. Compare timing and outcome to the original.
8. Track mastery.

Drill variants:

- Exact retry
- Slowed timing
- Repeated attack
- Progressive speed
- random direction
- mixed attack discrimination
- one-hit pressure
- same mechanic with different weapon

### 72.8 Coaching curriculum

Ghost Coach can assemble a weekly curriculum from repeated weakness clusters.

Example:

```text
Day 1: bomber-parry timing
Day 2: armored launch conversion
Day 3: safe Hammer recall routes
Day 4: Warden phase-two recognition
Day 5: full Hard wave-40 checkpoint
```

The curriculum should remain optional and adjustable. It should not make the main game feel like mandatory homework.

### 72.9 One-fix priority

The autopsy should identify one highest-leverage recommendation first.

A page containing twenty warnings is less useful than:

> Your largest current loss is late defensive commitment against ranged attacks. Fixing that likely improves both survival and style more than changing your draft strategy.

Secondary findings remain available for deeper inspection.

### 72.10 Skill graph

Player progress can be represented across mechanics:

- Movement
- dash discipline
- blade speed
- cut geometry
- launch
- juggle
- slam
- power slam
- updraft
- throw
- recall
- parry
- projectile reading
- target priority
- boss recognition
- draft strategy
- recovery
- style variety

Each estimate should include uncertainty and the scenarios that support it.

### 72.11 Astuteness-aware coaching

The coach should adapt explanation depth.

- New player: simple action and visual cue
- Intermediate: timing window and positioning
- Advanced: tradeoffs, option coverage, and build context
- Expert: frame timing, counterfactuals, and opportunity cost

This is presentation astuteness, not a change in underlying evidence.

### 72.12 Coach integrity

A language model may help summarize structured findings, but it must not be the source of truth.

Correct architecture:

```text
replay facts
  -> deterministic analyzers
  -> structured findings
  -> optional natural-language explanation
```

The explanation layer must not invent events, damage values, offers, or timings absent from the structured result.

### 72.13 Privacy and consent

- Coaching can run locally where feasible.
- Cloud coaching must be opt-in when it requires uploading detailed action data.
- Public replay visibility does not automatically grant model-training consent.
- A player can delete coach history independently of public replay metadata where architecture permits.
- Comparative baselines should use aggregated, privacy-preserving statistics.

### 72.14 Coach acceptance tests

- Every finding resolves to a valid replay interval.
- Every numerical claim can be reproduced from tracks.
- Suggested drills launch a legal state.
- The coach does not suggest unavailable actions.
- One-Hit recommendations account for lethal risk.
- Draft regret reports uncertainty.
- Explanations do not change when only cosmetic presentation changes.
- Repeated successful drills improve the associated measured skill dimension.

---
## 73. Ghost Vault 3.0, Cloud Architecture, Sharing, and Discovery

Ghost Vault should evolve from a bounded local replay list into an offline-first run archive with explicit storage tiers and retention rules.

### 73.1 Local storage architecture

Canonical Ghost 3.0 capsules should be stored in IndexedDB or an equivalent structured browser store rather than being limited to simple key-value save storage.

Recommended local stores:

```text
ghost_manifests
ghost_chunks
ghost_assets
ghost_indexes
ghost_upload_jobs
ghost_analysis
ghost_lineage
ghost_settings
```

Benefits:

- Larger practical capacity
- Transactional commits
- Binary buffers
- Indexed search
- Partial updates
- Better quota management
- Recovery of incomplete sessions

The current simple Vault index can remain as a migration source and compatibility view.

### 73.2 Vault retention tiers

Each local run receives a retention class.

- **Temporary** — auto-pruned after a short window or quota pressure.
- **Recent** — normal completed runs retained until the rolling cap.
- **Pinned** — protected by the player.
- **Milestone** — first clear, personal best, achievement, or historic event; protected by policy unless the player removes it.
- **Diagnostic** — crash or bug replay; separate retention and privacy.
- **Imported** — explicit user file; never auto-publish.
- **Cloud-only stub** — summary stored locally, chunks fetched on demand.

### 73.3 Quota manager

Ghost Vault should monitor:

- Estimated browser quota
- used bytes
- pending bytes
- per-profile usage
- pinned usage
- unuploaded usage
- asset cache usage
- analysis cache usage

Eviction order:

1. Re-creatable previews and rendered clips
2. downloaded cloud chunk cache
3. old unpinned temporary runs
4. old unpinned recent runs
5. optional presentation tracks
6. never delete pinned, milestone, unuploaded, or diagnostic evidence without explicit warning

### 73.4 Cloud data split

Do not store the entire future Ghost 3.0 capsule as large Firestore document strings.

Recommended split:

#### Metadata database

Stores:

- summary
- owner
- visibility
- verification status
- game version
- mode, difficulty, weapon
- final result
- tags
- Run DNA
- chunk manifest
- moderation status
- challenge contract
- leaderboard linkage

#### Object storage

Stores:

- binary capsule chunks
- thumbnails
- optional preview clips
- exported run cards

#### Verification service

Consumes uploaded capsule, re-simulates or validates it, and writes a signed result.

### 73.5 Upload transaction

Recommended publication flow:

1. Create an upload session with expected manifest and root hash.
2. Receive authorized chunk-upload targets.
3. Upload chunks concurrently with retry and checksums.
4. Upload optional assets.
5. Server verifies all declared chunks exist and match hashes.
6. Finalize the capsule atomically.
7. Verification enters a queue.
8. Public metadata remains `processing` until validation completes.
9. Feed and leaderboard visibility follow policy.

An incomplete upload should never appear as a valid public run.

### 73.6 Resumable upload queue

The queue should handle:

- Offline play
- browser closure
- network interruption
- mobile backgrounding
- authentication refresh
- retry with exponential backoff
- per-chunk resume
- cancellation
- privacy changes before finalization

Uploads must never block result-screen navigation.

### 73.7 Content-addressed chunks

Where operationally worthwhile, chunk IDs may incorporate content hashes.

Benefits:

- Deduplicate identical challenge setup chunks
- detect corruption
- safely resume
- share common static manifests
- cache by immutable identity

Do not overengineer global deduplication before real storage-cost data exists.

### 73.8 Cross-device synchronization

Vault sync should synchronize metadata first and fetch heavy content on demand.

A device initially receives:

- summaries
- thumbnails
- tags
- pin state
- verification status
- cloud availability

Full chunks download when the player watches, compares, practices, or explicitly saves offline.

### 73.9 Export and import

A player should be able to export:

- Full `.tearghost` capsule
- Compact public capsule
- Run summary JSON
- Clip or run card
- Coaching report

Import flow:

1. Parse in a worker or sandboxed decoder.
2. enforce size and decompression limits.
3. validate manifest and checksums.
4. resolve compatibility.
5. show provenance and verification status.
6. require confirmation before adding to Vault.
7. never treat imported content as owned or leaderboard-eligible by default.

### 73.10 Visibility levels

Recommended visibility:

- `private`
- `unlisted`
- `public`
- `team` or `developer`, where supported
- `tournament`

Private capsules may still exist in cloud storage for cross-device sync but must not appear in discovery.

Unlisted capsules are accessible by share code but not searchable.

### 73.11 Share links and deep links

Share links should support:

- Run overview
- Exact timestamp
- exact wave
- exact boss phase
- exact highlight
- challenge mode
- compare invitation
- practice checkpoint when permitted

Conceptual forms:

```text
/replay/{shareId}
/replay/{shareId}?t=42.183
/replay/{shareId}?event=perfect_parry_17
/challenge/{challengeId}
/compare/{leftId}/{rightId}
```

The actual URL scheme should respect hosting and platform constraints.

### 73.12 Feed and discovery

Discovery filters:

- Latest
- trending
- verified records
- same skill band
- same weapon
- same difficulty
- boss-specific
- unusual builds
- style showcases
- learning ghosts
- developer picks
- challenge runs
- TearBot reference runs

Ranking should avoid being only raw engagement. Quality signals may include:

- Completion significance
- verification
- replay health
- viewer completion
- saves
- challenge attempts
- instructional value
- diversity
- reports

### 73.13 Public replay cards

A replay card should show:

- Player or bot identity
- verification badge
- provenance
- mode
- difficulty
- weapon
- wave or victory
- score
- duration
- build summary
- game version
- challenge flags
- resumed or modded flags
- thumbnail
- visibility and ownership actions

### 73.14 Comments and annotations

Full social comments introduce moderation cost. The recommended rollout is staged.

#### Stage 1

- Reactions
- save
- share
- challenge
- report

#### Stage 2

- Owner-authored annotations
- timestamp notes
- developer notes
- curated coaching notes

#### Stage 3

- Community comments only after moderation, rate limiting, blocking, and reporting are ready

### 73.15 Replay reports

Report reasons:

- Offensive name or annotation
- cheating or tampered claim
- exploit disclosure
- spam
- impersonation
- harassment
- inappropriate thumbnail or media
- broken or malicious file

Reporting a replay must preserve evidence for moderators without keeping publicly deleted content indefinitely beyond policy.

### 73.16 Deletion and ownership

The owner should be able to:

- Unpublish
- change visibility
- delete cloud data
- delete local data
- export before deletion
- unlink from feed where rules permit

A leaderboard may preserve the score while removing the replay attachment, depending on competitive policy. Tournament-certified records may retain a minimal immutable audit record under clearly disclosed rules.

### 73.17 Run lineage

Forks, challenges, remixes, and relays should record lineage.

```yaml
lineage:
  parentCapsule: tg_original
  branchTick: 2518
  relation: practice-fork
  challengeContract: null
  author: current-player
```

Lineage prevents a fork from being mistaken for an original full run and enables rich history views.

### 73.18 Cloud cost controls

- Store compact capsules publicly by default.
- Keep preview media optional and transcode once.
- Lifecycle-expire abandoned incomplete uploads.
- Limit public uploads per account and time window.
- Reuse leaderboard-linked replay IDs when appropriate.
- Delay expensive analysis until a replay is watched, challenged, or enters a leaderboard.
- Cache popular chunks through CDN.
- Keep raw forensic packets private and short-lived unless pinned by developers.

### 73.19 Delayed near-live Ghost Relay

Ghost 3.0 may later support delayed near-live spectating by publishing finalized Chronicle chunks while a run is still active.

This is not live multiplayer and must not become a dependency of normal recording.

High-value uses:

- Tournament broadcasts
- Community event spectating
- Remote developer observation
- Private support sessions
- Long-running TearBot exhibitions
- QA endurance monitoring

Safety and fairness contract:

- The active player explicitly enables the relay or enters an event with disclosed relay rules.
- Public competitive relays use a configurable delay, initially expected to be tens of seconds rather than real time.
- The relay exposes only finalized immutable chunks.
- The provisional manifest cannot receive a final verification badge until the run finalizes and all chunks validate.
- Spectator state can never write into or influence the active run.
- Private diagnostics and raw forensic tracks are excluded unless the access policy explicitly permits them.
- A disconnected spectator resumes from chunk hashes rather than asking the player client to resend the entire run.
- A network outage pauses publication but never recording or gameplay.
- The player can stop publication without corrupting the local Chronicle.
- Tournament organizers can archive the final signed capsule after completion.

Relay status should distinguish:

```text
recording-local
relay-delayed
relay-paused
relay-ended-unfinalized
relay-finalizing
relay-finalized
relay-invalid
```

The existing Ghost Relay player concept and this network relay are separate. One describes players continuing or chaining challenge segments; the other describes delayed Chronicle transport for spectators.

### 73.20 Vault acceptance tests

- Local recording works offline.
- Browser refresh recovers committed sessions.
- Quota pressure never deletes pinned or unuploaded evidence silently.
- Cloud metadata loads without downloading full capsules.
- An interrupted upload resumes at missing chunks.
- A finalized manifest cannot reference absent chunks.
- Changing visibility updates discovery correctly.
- Deletion removes discoverability and follows retention policy.
- Imported capsules are not leaderboard-eligible by default.
- Cross-device tags and pin state merge predictably.

---

## 74. Verification, Security, Fair Play, Privacy, and Moderation

Ghost 3.0 will process untrusted user-generated files and may become evidence for competitive results. Security and truth cannot be afterthoughts.

### 74.1 Verification goals

Verification should answer:

- Did this capsule decode correctly?
- Was it produced by a recognized build and schema?
- Has any chunk changed?
- Can the run be re-simulated or validated?
- Does the final result match the event and score ledger?
- Was the run resumed, modded, forged, or bot-generated?
- Did the run violate eligibility rules?
- Is the replay safe to publish and load?

Verification does not need to claim that a browser client is impossible to cheat. It needs to make tampering expensive, detectable, classifiable, and separable from legitimate runs.

### 74.2 Validation pipeline

Recommended stages:

1. **Structural validation** — schema, sizes, IDs, chunk index, required fields.
2. **Integrity validation** — hashes, chain, root, signature if present.
3. **Compatibility validation** — build and content fingerprint support.
4. **Simulation validation** — restore and replay critical intervals or full run.
5. **Result validation** — recompute result ledger and eligibility.
6. **Behavioral anomaly analysis** — flag impossible or suspicious actions without automatically convicting.
7. **Moderation validation** — names, thumbnails, annotations, and public metadata.
8. **Certification** — issue a signed verdict and verification version.

### 74.3 Server-side or trusted-worker re-simulation

Competitive verification should use a controlled simulation build.

Inputs:

- Capsule actions
- seed and RNG streams
- historical content/config package
- verification rules

Outputs:

- checkpoint hashes
- final result
- drift report
- eligibility flags
- suspicious events
- signed verdict

If full browser simulation is too expensive initially, validate:

- selected random intervals
- every boss transition
- every draft
- final waves
- score-generating events
- final result

Then strengthen toward full validation as the headless core matures.

### 74.4 Verification badges

Possible badges:

- `WATCHABLE`
- `INTEGRITY CHECKED`
- `RESULT VERIFIED`
- `FULLY RESIMULATED`
- `TOURNAMENT CERTIFIED`
- `LEGACY`
- `BOT RUN`
- `MODDED`
- `RESUMED`

Badges must have tooltips explaining exactly what was checked.

### 74.5 Suspicious-run indicators

Indicators may include:

- Action rate above game limits
- impossible simultaneous edges
- aim discontinuities outside declared input mode
- impossible cooldown use
- health or score discontinuity
- nonexistent draft offer
- invalid ability tier
- RNG counter mismatch
- state hash mismatch
- unsupported game build
- edited result metadata
- impossible completion time

Indicators trigger review or ineligibility according to policy. They are not necessarily proof of malicious intent; corruption and old bugs can produce anomalies.

### 74.6 Competitive eligibility record

Every leaderboard submission should carry an eligibility object.

```yaml
eligibility:
  verified: true
  resumed: false
  modded: false
  coachEnabled: false
  ghostAssist: false
  debugHooks: false
  botGenerated: false
  stateForge: false
  supportedBuild: true
```

### 74.7 Replay parser hardening

Treat imported and downloaded capsules as hostile.

- Enforce maximum manifest size.
- enforce maximum chunk count.
- enforce maximum compressed and uncompressed size.
- enforce nesting and collection limits.
- reject unknown executable payloads.
- never evaluate replay text as code.
- decode in worker or isolated context.
- validate IDs and references.
- prevent path traversal in exported archives.
- protect against decompression bombs.
- time-limit validation.
- cap thumbnail and media dimensions.

### 74.8 Public metadata sanitization

Sanitize:

- Player name
- run title
- tags
- annotations
- challenge title
- clip captions
- any user-supplied text

Rendered text should never become HTML without strict escaping.

### 74.9 Identity and pseudonymity

Replay Passport can use a pseudonymous publication ID separate from account-provider details.

Public capsules do not need to expose:

- email
- raw provider UID
- hardware identifiers
- IP address
- precise device fingerprint
- private save data

### 74.10 Data classification

#### Public-safe by default

- Canonical gameplay actions
- run result
- build
- mode/difficulty/weapon
- event timeline
- public player name

#### Private or coarse only

- device model
- browser details
- performance telemetry
- focus interruptions
- crash logs
- network state
- diagnostic screenshots

#### Never record by default

- Raw text entered outside declared game fields
- arbitrary keyboard scan history
- clipboard contents
- unrelated browser data
- account credentials

### 74.11 Training consent is separate

A public replay may be watchable without being approved for machine-learning training.

Recommended consent states:

- `no-training`
- `private-personalization-only`
- `anonymous-improvement`
- `public-research-or-training`

Consent must be revocable for future training use according to practical data-governance policy, while already trained models may require a disclosed retention treatment.

### 74.12 Privacy controls

Players should have controls for:

- Default replay visibility
- automatic local recording
- automatic cloud backup
- performance telemetry
- coaching analysis
- training consent
- public name display
- thumbnail generation
- crash capture
- data export
- deletion

### 74.13 Moderation system

Required before broad public text or media:

- Rate limits
- report flow
- block and mute
- owner controls
- moderation queue
- automated text and image screening where applicable
- audit log
- appeal path for competitive disqualification
- repeat-abuse handling

### 74.14 Exploit disclosure handling

Some public runs may reveal severe exploits.

Possible policy:

- Automatically mark suspicious exploit patterns.
- Allow developer quarantine without erasing private evidence.
- Preserve the capsule for reproduction.
- Remove it from competitive ranking while investigated.
- Credit the finder where appropriate and safe.
- Avoid publicly amplifying security-sensitive exploit details before mitigation.

### 74.15 Verification versioning

A run’s verdict should declare the verifier version.

A future bug fix may re-verify old capsules and update status while preserving the historical verdict log.

### 74.16 Security acceptance tests

- Tampering with any committed chunk changes the root hash.
- A truncated capsule is rejected or clearly partial.
- A replay bomb is stopped before dangerous allocation.
- Malformed references cannot crash the live game.
- User text cannot inject markup or code.
- Imported replays cannot write progression.
- Verification handles unsupported builds without falsely certifying them.
- A resumed run cannot masquerade as uninterrupted.
- Bot provenance cannot be removed without breaking integrity.

---

## 75. Compatibility, Migration, Recovery, and Long-Term Preservation

A replay platform becomes valuable over years only if old runs fail honestly and degrade gracefully.

### 75.1 Version layers

Ghost 3.0 should version separately:

- Container format
- Track codecs
- event taxonomy
- deterministic simulation protocol
- state schema
- content manifest
- verifier
- presentation renderer

A game patch should not require incrementing every layer.

### 75.2 V1 and V2 migration

V1 and V2 should remain watchable through explicit adapters.

Migration output should declare:

```text
sourceVersion
conversionVersion
availableTracks
missingTracks
fidelityClass
unsupportedEvents
warnings
```

V2 migration can preserve:

- pose tracks
- enemy samples
- stage and wave events
- highlight events
- loadout
- summary
- thumbnail

It cannot invent:

- exact actions
- exact RNG
- exact projectile state
- verified score causality

Therefore converted V2 runs remain Legacy Visual or another explicitly limited class.

### 75.3 Compatibility decision tree

1. Exact build and protocol available -> deterministic replay.
2. Compatible protocol adapter available -> migrated hybrid replay.
3. Unsupported simulation but presentation track available -> visual fallback.
4. Partial supported tracks -> partial playback with warnings.
5. Corrupted optional track -> skip optional track.
6. Corrupted critical manifest or index -> reject or recovery mode.

### 75.4 Historical runtime packages

For milestone or tournament runs, preserve a compact historical simulation package containing:

- deterministic core version
- content tables
- balance configuration
- schema adapter
- verification rules

Do not depend on the current production code to perfectly emulate every past build forever.

Historical packages should be signed and sandboxed. They are data and approved runtime modules, not arbitrary code supplied by replay authors.

### 75.5 Content aliases and tombstones

When an ability, enemy, stage, or event is renamed or removed:

- Preserve stable numeric or namespaced IDs.
- Keep an alias registry.
- Keep tombstone metadata for removed content.
- Render a historical label where possible.
- Never reuse an old stable ID for unrelated content.

### 75.6 Schema migration rules

- Migrations are pure transformations.
- Source remains unchanged.
- Every migration records its version.
- Migration warnings are preserved.
- Round-trip is tested where meaningful.
- No migration silently upgrades verification status.
- Unknown fields are preserved or explicitly discarded with a report.

### 75.7 Drift handling across game versions

When current physics differs from historical physics:

- Prefer historical config and simulation package.
- Otherwise use correction keyframes.
- Expose drift count and affected intervals.
- Do not let current balance values overwrite historical result truth.

### 75.8 Capsule repair

A repair tool may salvage:

- Intact manifest plus partial chunks
- summary
- thumbnail
- event index
- playable prefix
- final committed keyframe

Repair output is a new capsule with lineage and `repaired-partial` status. It never overwrites the original bytes.

### 75.9 Crash recovery

On launch after a crash:

- Detect incomplete active Ghost sessions.
- Show timestamp, mode, wave, and last committed moment.
- Offer `RESUME`, `WATCH LAST MOMENTS`, `EXPORT BUG REPORT`, or `DISCARD` according to eligibility rules.
- Preserve a diagnostic copy if the player submits a bug report.

### 75.10 Bug-report package

A player-facing “Report a problem from this moment” action can generate:

- Capsule or relevant segment
- screenshot
- game build
- browser/platform family
- settings
- console errors where allowed
- last state hash
- textual player note
- privacy review before upload

### 75.11 Long-term archive policy

High-value runs may be archived with:

- Redundant object storage
- immutable manifest
- verification verdict
- historical runtime package reference
- public metadata snapshot
- rendered preview

Ordinary public runs may have tiered retention according to cost and activity, but owners should know the policy.

### 75.12 Replay determinism regression suite

Maintain a corpus of golden capsules across:

- Every mode
- every difficulty
- every weapon
- every boss
- representative abilities and tiers
- stage mutations
- mobile and desktop input
- legacy schemas
- long runs
- interrupted runs

Every release tests:

- Decode
- seek
- resimulation
- hashes
- result
- visual fallback
- migration
- takeover where supported

### 75.13 Preservation acceptance tests

- V1 and V2 still load with honest fidelity labels.
- A current balance patch does not alter a historical result summary.
- Removed content displays through tombstone metadata.
- A corrupted optional preview does not destroy core playback.
- A repaired capsule cannot claim original verification.
- Golden deterministic capsules preserve hashes across supported builds.
- Unsupported historical capsules fail with an actionable status rather than a blank screen.

---

## 76. Developer, Support, Live-Ops, and Product Value Outside TearBench

Ghost 3.0 should improve the actual operation of *Tear*, even when no autonomous agent is involved.

### 76.1 Human QA evidence

A human tester can attach a replay directly to a bug.

The bug report should open at the relevant timestamp and show:

- exact build
- input sequence
- player state
- enemy state
- event chain
- console and invariant messages
- ability and weapon context

### 76.2 Support tooling

Customer support can request a private replay code rather than asking the player to describe a complex combat failure from memory.

Support view:

- privacy-safe summary
- compatibility status
- last meaningful events
- crash or disconnect markers
- progression writes around the issue
- export for engineering

### 76.3 Crash and softlock diagnosis

Ghost’s circular buffer can automatically preserve:

- last state transitions
- last inputs
- last spawns
- last draft actions
- focus and pause events
- last hashes
- last successful checkpoint

Softlock detectors can mark the exact interval where progress stopped.

### 76.4 Balance observatory

Aggregated replay facts can answer:

- Which abilities are offered, selected, and successful?
- Which builds reach late stages?
- Where do players die by difficulty?
- Which boss attacks cause damage?
- Which weapons underperform for which skill bands?
- Does a Remote Config change shift survival or time-to-kill?
- Are players using mechanics the tutorial teaches?
- Where does One-Hit feel fair or arbitrary?

Analysis should be aggregated and privacy-aware. Do not require public replay visibility for anonymous balance telemetry if separate consent is available.

### 76.5 Patch impact analysis

Before and after a release, compare replay cohorts by:

- Completion rate
- wave reached
- damage causes
- boss phase duration
- build distribution
- input-device segment
- player skill band
- abandonment
- crash rate
- replay drift or incompatibility

### 76.6 Content validation

When adding a boss, weapon, ability, or stage:

- Record developer showcase runs.
- create golden capsules.
- attach tutorial annotations.
- create Boss Memory practice segments.
- define expected event coverage.
- publish a Learning Ghost.

This turns each feature into a testable and teachable artifact.

### 76.7 Remote Config safety

A live-balance snapshot belongs in the run capsule.

This enables:

- Reproducing a run after values change
- comparing two Remote Config cohorts
- verifying which values a leaderboard run used
- rolling back a harmful tuning change with evidence

### 76.8 Live event and tournament operations

Ghost 3.0 can power:

- Seeded weekly challenges
- tournament submissions
- judge review
- record verification
- broadcast replay packages
- highlight reels
- dispute resolution
- historical event archives

Tournament policy should require a declared supported build and verification profile.

### 76.9 Replay corpus for regression

A curated human replay corpus complements synthetic TearBench scenarios.

Benefits:

- Real messy input
- real build choices
- real recovery behavior
- long-run state interactions
- device-specific patterns
- unexpected but legitimate strategies

Replaying the corpus after engine changes reveals compatibility and behavioral regressions.

### 76.10 Replay-derived feature analytics

Examples:

- Time from tutorial prompt to successful execution
- parry attempt versus success rate
- draft-card reading time
- menu navigation failure
- controller disconnect recovery
- replay-theater engagement
- challenge conversion
- coaching-drill completion

These metrics should use deliberate event definitions, not fragile screen scraping.

### 76.11 Developer Ghost Lab

Ghost Lab should support:

- Open capsule
- inspect manifest
- view tracks
- validate hashes
- seek by event
- compare builds
- inspect entity state
- inspect causal event graph
- export interval
- convert to State Forge scenario
- take control
- mutate one variable
- verify result
- generate bug report
- generate regression test

### 76.12 Human-in-the-loop breakpoint

A developer should be able to set a replay breakpoint:

```text
break when player.hp <= 0
break when state hash diverges
break when enemy kind=bomber enters attack state
break when draft offer contains storm_recall
break when player crosses platform boundary at high downward speed
```

Playback pauses with a full inspector.

### 76.13 Reproduction generator

From a selected replay interval, Ghost Lab can generate:

- Minimal action trace
- State Forge snapshot
- scenario YAML
- expected invariant
- screenshot
- regression-test skeleton

### 76.14 Product experimentation

Ghost 3.0 itself should be measurable.

Questions:

- Do players watch deaths?
- Do timestamped coaching findings lead to drills?
- Do drills improve the next comparable run?
- Are personal-best ghosts motivating or distracting?
- Does automatic highlight selection match player saves?
- Which ghost opacity and overlay settings are comfortable?

Experiments must not alter competitive fairness invisibly.

### 76.15 Operational dashboards

Recommended dashboards:

- Recorder health
- upload completion
- decode failures
- verification queue
- verification failure reasons
- drift by build
- storage use
- popular challenge contracts
- report volume
- coaching finding distribution
- legacy replay usage
- crash-capture success

### 76.16 Support and operations acceptance tests

- A bug-report link opens at the selected timestamp.
- Private diagnostic data is not visible in public feed metadata.
- Remote Config snapshot reproduces historical tuning.
- Tournament runs retain verification verdicts.
- Replay-corpus tests are reproducible in CI.
- A support agent cannot mutate player progression from a replay.

---

## 77. Ghost Intelligence, TearBot Integration, and Dataset Governance

Ghost 3.0 should be intelligent without becoming opaque. Its intelligence comes from structured run facts, transparent metrics, calibrated policies, and clearly labeled generated content.

### 77.1 Human, bot, and hybrid provenance

Every run should identify:

- Human
- scripted bot
- neural bot
- human with coach overlay
- human takeover from bot
- bot takeover from human demonstration
- State Forge scenario
- replay practice fork

Hybrid authorship may include segment boundaries.

### 77.2 Bot reference library

Maintain verified reference ghosts for:

- TearBot Levels 1–9
- Level Ω
- each weapon
- each difficulty
- each mode
- each boss
- major build archetypes
- input-device profiles

This gives Ghost Coach stable comparison baselines even when community data is sparse.

### 77.3 Astuteness fingerprint

A bot ghost should carry its full capability profile, not only a public level.

```yaml
bot:
  publicLevel: 7
  mechanics: 7.4
  strategy: 6.9
  defense: 7.8
  draft: 6.3
  exploration: 3.0
  humanLikeness: 8.6
  informationPrivilege: visible-only
  reactionFloorMs: 145
  policyVersion: tearbot-7.12.3
```

### 77.4 Adaptive ghost selection

The system can recommend ghosts based on player goals.

- Improvement goal -> slightly stronger Learning Ghost
- speed goal -> efficient route ghost
- survival goal -> defensive ghost
- style goal -> variety-focused ghost
- boss goal -> boss specialist
- build goal -> same-archetype ghost
- curiosity -> high-diversity unusual run

### 77.5 Ghost style embedding

A compact learned or hand-designed style embedding may summarize behavior.

Uses:

- Rival matching
- Run DNA clustering
- Learning Ghost selection
- bot diversity archive
- coaching baseline selection
- personal Nemesis generation

The embedding should never replace raw metrics for competitive verification.

### 77.6 Personal Nemesis and The Echo

Ghost 3.0 can enhance *Tear*’s mirror-themed systems outside testing.

The current `Mirror` brain already captures a short behavior buffer—advance or retreat, dash, jump, and swing—and watches the player’s tricks so it can answer them. Ghost 3.0 can evolve that short-term mimicry into a bounded long-term style profile.

A **Personal Nemesis** encounter could derive a combat style profile from the player’s own recent runs:

- Common approach distance
- aerial preference
- dash timing
- throw frequency
- parry reliance
- favorite trick sequence
- aggression rhythm

The encounter should use a bounded, authored boss moveset driven by the profile. It should not replay raw actions blindly or gain impossible knowledge.

This can deepen The Echo fantasy:

> It does not merely copy the last trick. It has learned the shape of how you fight.

Privacy and fairness requirements:

- Profile may be generated locally.
- Player can disable personalization.
- Boss difficulty remains governed by declared game difficulty.
- Historical replay data is not uploaded solely for this feature without consent.

### 77.7 Ghost lineage and agent evolution

Agent Foundry runs can preserve lineage:

```text
policy champion
  -> challenger training corpus
  -> evaluation ghosts
  -> promoted policy
```

A policy card links to representative Ghost capsules showing:

- Strengths
- failures
- level calibration
- behavior diversity
- regression evidence

### 77.8 Demonstration quality scoring

Not every human replay is equally useful for training.

Quality dimensions:

- Packet integrity
- action completeness
- scenario coverage
- recovery content
- skill confidence
- novelty
- input-device representation
- annotation quality
- consent
- absence of severe exploit contamination unless labeled for exploit research

### 77.9 Dataset partitions

Maintain separate datasets for:

- Imitation learning
- recovery behavior
- draft strategy
- boss recognition
- menu navigation
- touch control
- gamepad control
- exploit detection
- visual QA
- calibration holdouts
- hidden release exams

Do not train on evaluation holdouts.

### 77.10 Consent-aware data pipeline

Each sample inherits capsule consent.

Pipeline stages:

1. Consent check
2. anonymization
3. integrity validation
4. provenance labeling
5. quality scoring
6. deduplication
7. split assignment
8. dataset versioning
9. training usage log

### 77.11 Deduplication

Avoid overweighting repeated or copied runs.

Possible fingerprints:

- Action hash
- seed and challenge contract
- event-sequence hash
- state trajectory sketch
- upload lineage

### 77.12 Human-representative balance

Training data should avoid collapsing toward only elite desktop Sword players.

Track representation across:

- Skill bands
- devices
- weapons
- difficulties
- modes
- build archetypes
- successful and failed runs
- accessibility settings
- playstyles

### 77.13 Recovery demonstrations

Recovery states are especially valuable:

- Low health
- blade stranded
- surrounded
- missed parry
- bad platform position
- weak build
- boss phase unfamiliarity
- style lost

Ghost Coach can ask consenting expert players to record correction demonstrations from selected forks.

### 77.14 Synthetic-data labeling

State Forge and bot-generated samples must be marked synthetic.

Training can use them, but evaluation reports should distinguish:

- human-only performance
- synthetic-heavy performance
- mixed performance

### 77.15 Bot self-play and ghost tournaments

TearBot policies can compete on fixed scenario sets and publish their capsules.

Ghost tournaments enable:

- human inspection
- behavior comparison
- exploit detection
- level monotonicity review
- promotion evidence
- regression review

### 77.16 Ghost intelligence safety rails

- No automatic public posting of training runs.
- No pretending bot runs are human.
- No using private capsules outside declared consent.
- No coach claim without evidence.
- No policy promotion from public score alone.
- No model-generated replay metadata overriding verified result facts.
- No Personal Nemesis using hidden account data unrelated to gameplay.

### 77.17 Dataset and intelligence acceptance tests

- Consent state propagates to every exported sample.
- Human and bot provenance remain distinguishable after migration.
- Evaluation holdouts never appear in training manifests.
- Personal Nemesis profile can be deleted and regenerated.
- Coach narrative matches structured findings.
- TearBot level ghosts expose their policy and privilege metadata.
- Dataset reports show representation and known gaps.

---

## 78. Ghost 3.0 API, Repository Architecture, Roadmap, and Acceptance Gates

Ghost 3.0 should be designed as an independently testable platform with a narrow public façade and modular internals.

### 78.1 Proposed runtime API

```js
const Ghost = {
  protocolVersion,

  beginSession(options),
  activeSession(),
  finishSession(result),
  abortSession(reason),

  recordCanonicalAction(action),
  recordEvent(event),
  recordPresentation(sample),
  checkpoint(reason, options),
  markHighlight(kind, data),

  load(source, options),
  unload(),
  play(),
  pause(),
  seek(target),
  stepTicks(delta),
  setSpeed(multiplier),
  setCamera(mode),
  setLayers(layers),

  validate(capsule, options),
  migrate(capsule, targetVersion),
  repair(capsule, options),
  compare(left, right, options),
  fork(target, options),

  export(capsuleId, profile),
  import(file, options),
  publish(capsuleId, options),
  unpublish(shareId),
  createChallenge(capsuleId, contract),

  analyze(capsuleId, profile),
  createDrill(findingId, options)
};
```

### 78.2 Lower-level interfaces

```ts
interface GhostCodec {
  encodeChunk(chunk: RawGhostChunk): Promise<EncodedGhostChunk>;
  decodeChunk(bytes: Uint8Array): Promise<DecodedGhostChunk>;
}

interface GhostStorage {
  putManifest(manifest: GhostManifest): Promise<void>;
  putChunk(capsuleId: string, chunk: EncodedGhostChunk): Promise<void>;
  getChunk(capsuleId: string, chunkId: string): Promise<EncodedGhostChunk>;
  list(query: GhostQuery): Promise<GhostSummary[]>;
}

interface GhostVerifier {
  verify(source: GhostSource, rules: VerificationRules): Promise<VerificationReport>;
}

interface GhostCompatibilityAdapter {
  canRead(manifest: GhostManifest): boolean;
  migrate(source: GhostSource): Promise<MigrationResult>;
}
```

### 78.3 Proposed CLI

```bash
ghost inspect run.tearghost
ghost validate run.tearghost
ghost verify run.tearghost --build historical
ghost migrate old.tearghost --to 3.0
ghost repair broken.tearghost
ghost compare a.tearghost b.tearghost --align boss-phase
ghost extract run.tearghost --from 00:40 --to 00:50
ghost checkpoint run.tearghost --event death
ghost scenario run.tearghost --at 00:42.183
ghost clip run.tearghost --highlight best
ghost publish run.tearghost --visibility unlisted
ghost challenge run.tearghost --contract contracts/beat-score.yaml
ghost autopsy run.tearghost
ghost corpus verify tests/ghost-golden/
```

### 78.4 Proposed Skill tools

```text
tear_open_replay
tear_inspect_replay_manifest
tear_verify_replay
tear_compare_replays
tear_extract_replay_segment
tear_launch_from_replay
tear_create_practice_drill
tear_generate_run_autopsy
tear_migrate_replay
tear_repair_replay
tear_publish_replay
tear_create_ghost_challenge
tear_find_regression_from_replay
```

### 78.5 Repository structure

```text
js/ghost3/
  ghost.js
  session.js
  canonical-input.js
  events.js
  keyframes.js
  state-hash.js
  highlight.js
  ring-buffer.js
  replay-world.js
  playback.js
  compare.js
  fork.js
  compatibility.js
  v1-adapter.js
  v2-adapter.js
  privacy.js

js/ghost3/codec/
  container.js
  manifest.js
  action-codec.js
  event-codec.js
  state-codec.js
  presentation-codec.js
  compression-worker.js
  checksums.js

js/ghost3/storage/
  indexeddb.js
  quota.js
  upload-queue.js
  cloud.js
  export.js
  import.js

js/ghost3/theater/
  theater.js
  timeline.js
  cameras.js
  layers.js
  controls.js
  compare-ui.js
  clip-editor.js
  accessibility.js

js/ghost3/coach/
  metrics.js
  findings.js
  baselines.js
  draft-regret.js
  drill-compiler.js
  curriculum.js
  narrative.js

server/ghost/
  upload-session.ts
  finalizer.ts
  verifier.ts
  historical-builds.ts
  moderation.ts
  challenge.ts
  retention.ts

schemas/ghost/
  manifest.schema.json
  event-registry.json
  state-v3.schema.json
  challenge.schema.json
  verification.schema.json

fixtures/ghost/
  legacy-v1/
  legacy-v2/
  golden-v3/
  corrupted/
  compatibility/
```

### 78.6 Stable registries

Maintain registries for:

- Event IDs
- entity kinds
- boss IDs
- stage IDs
- weapon IDs
- ability IDs
- status IDs
- state fields
- codec IDs
- camera modes
- verification rules

Stable IDs must not be inferred from current array position.

### 78.7 Implementation sequence

#### Ghost Milestone G0 — Specification lock

Deliver:

- Fidelity classes
- manifest schema
- event registry
- canonical action schema
- state-hash contract
- privacy profiles
- V2 gap inventory

Acceptance:

- A design review can classify every proposed field as critical, optional, private, or derived.

#### Ghost Milestone G1 — Canonical action recorder

Deliver:

- Device-independent action capture at the authoritative input boundary
- integer tick timestamps
- event IDs
- build/config fingerprint
- minimal manifest

Acceptance:

- An action trace reproduces movement and menu transitions in a controlled seed test.

#### Ghost Milestone G2 — Keyframes and replay world

Deliver:

- isolated replay world
- full keyframe capture and restore
- state hashes
- semantic checkpoints

Acceptance:

- Restore at every wave, draft, and boss phase reaches the same next checkpoint hash.

#### Ghost Milestone G3 — Binary chunk codec

Deliver:

- Chunked container
- compression worker
- checksums
- random-access index
- debug JSON view

Acceptance:

- Long runs stream to storage without full-run serialization or unbounded memory.

#### Ghost Milestone G4 — IndexedDB Vault 3.0

Deliver:

- Local manifests and chunks
- quota manager
- crash journal
- migration from current Vault
- export/import

Acceptance:

- Offline recording, refresh recovery, pinning, pruning, and file export work reliably.

#### Ghost Milestone G5 — Hybrid deterministic playback

Deliver:

- Action re-simulation
- correction keyframes
- presentation fallback
- drift report
- validation statuses

Acceptance:

- Supported runs replay with declared drift bounds and never hide corrections.

#### Ghost Milestone G6 — Theater 3.0

Deliver:

- Layered timeline
- frame step
- semantic seek
- cameras
- input display
- event inspector
- accessibility

Acceptance:

- A player can find, inspect, bookmark, and share any major run moment.

#### Ghost Milestone G7 — Practice forks and comparison

Deliver:

- Practice from timestamp
- fork lineage
- run overlay
- split comparison
- event alignment
- delta metrics

Acceptance:

- A player can retry the exact death state and compare the result to the original.

#### Ghost Milestone G8 — Cloud publication redesign

Deliver:

- Metadata/object-storage split
- resumable uploads
- atomic finalization
- visibility
- deep links
- feed migration

Acceptance:

- Large capsules upload safely, load partially, and never appear publicly incomplete.

#### Ghost Milestone G9 — Verification and competitive integration

Deliver:

- Structural and integrity checks
- trusted resimulation
- result ledger validation
- signed verdicts
- leaderboard eligibility
- appeal evidence

Acceptance:

- Verified public runs can prove build, inputs, result, and eligibility.

#### Ghost Milestone G10 — Coach and drills

Deliver:

- Run Autopsy
- mistake taxonomy
- baselines
- replay-to-drill compiler
- progress graph

Acceptance:

- Every high-confidence finding links to evidence and a playable drill.

#### Ghost Milestone G11 — Challenges and player ecosystem

Deliver:

- Chase Your Best
- seed-locked challenge
- Boss Memory
- Daily Echo
- Learning Ghosts
- TearBot reference ghosts

Acceptance:

- Players can create, share, attempt, and verify asynchronous challenges.

#### Ghost Milestone G12 — Preservation and operations

Deliver:

- Historical runtime packages
- golden corpus
- migration dashboard
- Hall of Echoes
- support tooling
- tournament operations

Acceptance:

- Milestone runs remain watchable and truthfully classified across future releases.

### 78.8 Initial delivery priority

The correct order is:

1. Canonical actions
2. deterministic tick ownership
3. keyframes and state hashes
4. isolated replay world
5. binary chunks and IndexedDB
6. honest hybrid playback
7. Theater
8. cloud redesign
9. verification
10. coaching and challenges

Do not begin with a social feed redesign or cinematic export while replay truth is still pose-only.

### 78.9 Direct recommendations

- Preserve Ghost 2.0 as a stable legacy reader while building V3 beside it.
- Stop expanding the V2 JSON packet into a pseudo-V3 format.
- Introduce stable IDs before more content ships.
- Move recording off key-value save storage.
- Treat input capture and event taxonomy as shared game infrastructure.
- Build the replay world on the same isolated simulation architecture needed by State Forge.
- Keep compact public and forensic QA profiles separate.
- Make verification badges precise and conservative.
- Treat “Practice from here” as a flagship feature because it connects replay, coaching, and State Forge into one loop.
- Ship local value before cloud dependence.

### 78.10 Product success metrics

#### Reliability

- Recording completion rate
- capsule decode success
- seek correctness
- verification completion
- drift frequency
- crash recovery success
- upload completion

#### Player value

- Replay watch rate
- timestamp share rate
- personal-best ghost use
- challenge attempts
- practice-fork starts
- drill completion
- repeat use of Coach
- Vault pin rate

#### Improvement

- Change in comparable boss success after drills
- reduction in repeated damage cause
- movement or parry skill improvement
- completion progression by skill band

#### Community

- Verified replay share rate
- challenge completion
- save and reaction quality
- report rate
- diversity of surfaced builds and skill bands

#### Operations

- Bug reports with usable replay evidence
- time to reproduce
- percentage of competitive records verified
- replay compatibility by release
- storage cost per active user

### 78.11 Ghost 3.0 definition of done

Ghost 3.0 is complete enough to deserve its name when all of the following are true.

- A normal run records canonical actions, seed, events, build, complete draft offers and picks, result ledger, and keyframes.
- Full-session capture can represent main-menu intent, setup, combat, drafts, results, publication choice, and return to menu with explicit simulation, run, session, presentation, and wall-clock domains.
- Every causal event has deterministic tick, phase, and sequence ordering.
- Keyframes restore through explicit versioned state codecs and an atomic validation transaction.
- The run streams to local storage without unbounded memory.
- Playback uses an isolated world.
- Seeking to a wave, draft, boss phase, death, or highlight is fast and correct.
- Drift is detected, corrected when allowed, and disclosed.
- V1 and V2 remain watchable with honest legacy labels.
- A player can export and import a safe portable capsule.
- A player can watch with cameras, timeline, inputs, event layers, and accessibility controls.
- A compatible replay can be taken over as a practice fork.
- Two runs can be aligned and compared.
- A run can produce an evidence-backed autopsy and a playable drill.
- Local recording works offline.
- Shared uploads are resumable and atomically finalized.
- Optional delayed near-live relay can stream finalized chunks without influencing gameplay, leaking private forensic data, or issuing premature verification.
- Competitive runs can receive a conservative verification verdict.
- Public, private, unlisted, bot, resumed, modded, and legacy states are unmistakable.
- Crash and bug-report workflows preserve the last useful context.
- The replay remains useful outside TearBench as a player memory, learning system, challenge format, community object, and operational artifact.

### 78.12 The 500%-beyond-goal outcome

The complete Ghost 3.0 outcome is:

> A player finishes or fails a run. *Tear* preserves the causal truth of that journey. The player can immediately watch the decisive moment, understand what happened, compare it to a better run, take control seconds before the mistake, train the mechanic, challenge a friend or calibrated bot under the same conditions, share a verified timestamp, preserve the run in their career archive, and still open it truthfully after the game has evolved.

That is much larger than a replay feature.

It is the memory, evidence, training, rivalry, and historical continuity layer of *Tear*.

---


## 79. Ghost 3.0 Deepening — Replay Trident, Universal Timeline Contracts, Lenses, Studio, Doctor, Canon, and Self-Improving Memory

This section extends Sections 65–78. It does not replace their architecture.

The v0.4 platform expansion and v0.5 Chronicle hardening establish the product, fidelity classes, capsule, recorder, clocks, transactional restoration, live relay, Theater, Coach, Vault, Passport, verification, compatibility, operations, intelligence, APIs, and roadmap.

The v0.6 deepening adds the remaining systems needed to make Ghost a durable platform rather than a collection of strong replay features:

- An explicit three-layer truth model
- Round-trip state and causality contracts
- A canonical event ontology
- Modular Ghost Lenses
- A non-destructive Ghost Studio
- Ghost Doctor for health, repair, and quarantine
- Canon, Graveyard, Frontier, and Corpus libraries
- Structured agent decision traces
- Multi-dimensional replay quality and trust scoring
- Formal replay minimization
- Replay-to-scenario and scenario-to-replay round trips
- Event-aligned N-way comparison
- New milestones beyond G12

---

### 79.1 The Replay Trident

Ghost 3.0 should explicitly define three coordinated forms of truth.

#### Command truth

What the actor actually asked the game to do.

Includes:

- Semantic movement
- Jump edges and holds
- Dash edges
- Throw and recall edges
- Tether state
- Blade aim intent
- Pause and menu actions
- Setup, weapon, draft, and tier decisions
- Human takeover boundaries
- Policy decision ticks

Command truth answers:

> What action caused the next state?

#### State truth

What the authoritative game simulation contained.

Includes:

- Initial snapshot
- Event-aware checkpoints
- RNG streams and cursors
- Canonical state hashes
- Complete resumable state where the profile permits it

State truth answers:

> What exactly existed at this moment, and can it be resumed?

#### Visual truth

What is required to preserve a faithful watchable account when exact simulation is unavailable.

Includes:

- Player and blade pose
- Essential entity poses
- Stage and environment state
- Major presentation events
- Camera intent
- Important audio cues

Visual truth answers:

> Can this journey still be understood and experienced after exact compatibility is lost?

The Replay Trident is mandatory because no one representation can maximize all of the following at once:

- Compactness
- Exactness
- Random access
- Cross-version survival
- Creator presentation
- Machine-learning usefulness
- Competitive proof

The capsule's fidelity class is derived from which Trident arms are present, valid, and compatible.

---

### 79.2 Trident precedence rules

When the three layers disagree, Ghost must not silently choose whichever looks best.

Precedence:

1. A verified same-runtime deterministic simulation is authoritative.
2. A declared authoritative checkpoint is authoritative at its exact tick.
3. Between checkpoints, a valid command re-simulation is authoritative until drift is detected.
4. Visual truth is authoritative only for presentation, never for competitive result validation.
5. Summary metadata is not allowed to override a contradictory verified result ledger.

Example:

- Summary says `wave: 40`.
- Verified event ledger proves defeat during wave 39.
- The replay is invalid or corrupted; the summary is not accepted because it is convenient.

---

### 79.3 Universal timeline contract

Every Ghost subsystem should consume the same canonical timeline abstraction.

```ts
interface GhostTimeline {
  manifest: GhostManifest;
  tickRate: number;
  durationTicks: number;
  actions: ActionReader;
  events: EventReader;
  checkpoints: CheckpointReader;
  presentation: PresentationReader;
  decisions?: DecisionReader;
  metrics?: MetricReader;
  annotations: AnnotationStore;
  index: TimelineIndex;
  lineage: GhostLineage;
}
```

The Theater, Coach, Studio, verifier, State Forge bridge, support report generator, and TearBench must not each invent their own interpretation of time.

Canonical time is integer simulation ticks.

Wall-clock time is derived metadata.

---

### 79.4 Round-trip invariants

Ghost 3.0 should have stronger correctness guarantees than “the replay looks close.”

#### Record-to-replay invariant

For a supported verified run:

```text
recorded initial state
+ recorded actions
+ recorded RNG
= recorded checkpoint hashes
```

#### Seek invariant

```text
play from tick 0 to tick T
```

and

```text
restore nearest checkpoint before T
+ fast-forward to T
```

must produce the same canonical state hash.

#### Fork invariant

A fork with zero modifications must reproduce the parent timeline from the fork tick onward.

#### Practice invariant

Entering “Practice from here,” taking no action for one tick, and re-recording the resulting initial state must match the source checkpoint after eligibility-only metadata is excluded.

#### Export/import invariant

Exporting and importing a capsule must preserve:

- Root integrity hash
- Timeline duration
- Event identities
- Checkpoint hashes
- Lineage
- Visibility intent, subject to local privacy policy

#### Migration invariant

A migration must produce a machine-readable report of:

- Preserved fields
- Transformed fields
- Dropped fields
- Synthesized derived fields
- Fidelity changes
- Verification changes

No migration is considered valid merely because the decoder did not throw.

---

### 79.5 Replay quality is multi-dimensional

A replay should not have one vague “good” status.

Define a Ghost Quality Card with separate dimensions.

#### Fidelity

How accurately can the run be reconstructed?

#### Integrity

Are manifest, chunks, hashes, and signatures valid?

#### Compatibility

Is the required runtime available and validated?

#### Completeness

Are all required tracks and end conditions present?

#### Seekability

How much work is required to reach an arbitrary moment?

#### Resumability

Can the state be safely forked into live simulation?

#### Competitive eligibility

Was the run produced under ranked-safe conditions and independently verified?

#### Coaching richness

Does it contain enough evidence to support reliable analysis?

#### Creator richness

Does it contain enough presentation data for cinematic output?

#### Privacy classification

Which tracks may be shared, and with whom?

The Theater should summarize this card in player language rather than exposing only internal codes.

Example:

```text
Verified exact replay
Practice enabled
Full input and build timeline
Historic runtime available
Public summary / private coaching data
```

---

### 79.6 Recording profile negotiation

Profiles should be composable capabilities rather than one rigid enum.

Example negotiated profile:

```text
base: memory
+ verified-proof
+ coaching-inputs
+ creator-presentation
- private-agent-trace
```

Why:

- A ranked human run may need verification and coaching.
- A private agent run may need diagnostic state but no creator track.
- A public tutorial Ghost may need cinematic data but no private coaching metrics.
- A crash ring buffer may need forensic state only around the failure.

Negotiation inputs:

- Run type
- Eligibility
- User consent
- Device capability
- Storage pressure
- Development flags
- Cloud destination
- Active creator mode

The final negotiated profile is frozen in the manifest when recording begins.

Any adaptive degradation is recorded explicitly.

---

### 79.7 Track survival priority

When recording pressure becomes severe, Ghost needs a formal survival order.

Never drop:

1. Manifest and provenance
2. Semantic actions
3. Eligibility flags
4. RNG and deterministic metadata required by the active fidelity class
5. Checkpoint boundaries and integrity hashes
6. Core result events

Degrade in this order:

1. Extra cinematic samples
2. Redundant visual fallback density
3. Noncritical audio events
4. Optional coaching context
5. High-frequency internal metrics
6. Nonessential screenshots

If the recorder can no longer satisfy the selected fidelity class:

- Mark the exact tick
- Downgrade the active quality state
- Continue with the smallest valid safe profile
- Never keep a stale `VERIFIED` claim

---

### 79.8 Canonical event ontology

The existing causal event graph should be backed by a strict versioned event ontology.

Recommended families:

```text
run.*
stage.*
wave.*
boss.*
player.*
blade.*
combat.*
projectile.*
enemy.*
status.*
draft.*
weapon.*
world.*
ui.*
system.*
practice.*
challenge.*
test.*
agent.*
```

Representative IDs:

```text
run.started
run.paused
run.resumed
run.completed
run.defeated
run.abandoned
run.continued

stage.entered
stage.exited
wave.started
wave.spawn_completed
wave.cleared

boss.intro_started
boss.intro_finished
boss.phase_changed
boss.attack_started
boss.attack_committed
boss.attack_resolved
boss.defeated

player.jump_started
player.dash_started
player.damaged
player.healed
player.shield_absorbed
player.revived
player.fell_out

blade.swing_committed
blade.hit
blade.launch
blade.slam
blade.power_slam
blade.thrown
blade.embedded
blade.recalled
blade.caught
blade.stolen

combat.deflect
combat.perfect_parry
combat.kill
combat.multikill
combat.style_rank_changed

projectile.spawned
projectile.deflected
projectile.owner_changed
projectile.hit
projectile.expired

enemy.spawned
enemy.attack_started
enemy.status_changed
enemy.defeated

status.applied
status.refreshed
status.expired
status.detonated

draft.opened
draft.offered
draft.rerolled
draft.selected
tier.offered
tier.selected
weapon.selected

world.platform_created
world.platform_mutated
world.platform_destroyed
world.hazard_started
world.hazard_resolved
world.void_scroll_started
world.void_rescue

ui.screen_entered
ui.screen_exited
ui.focus_changed
ui.action_confirmed

system.checkpoint
system.integrity_warning
system.drift_detected
system.exception
system.storage_pressure

practice.fork_created
practice.restart
challenge.started
challenge.completed

test.invariant_failed
test.branch_diverged
test.failure_minimized

agent.objective_changed
agent.target_changed
agent.recovery_started
agent.human_takeover
```

Event IDs must be stable.

Descriptions and payload schemas may evolve through versioned registry entries.

---

### 79.9 Causal event graph contract

Every causal event should support:

```ts
interface GhostEvent {
  id: bigint;
  type: GhostEventId;
  tick: number;
  actorId?: number;
  targetIds?: number[];
  parentIds?: bigint[];
  position?: QuantizedPoint;
  payload?: TypedPayload;
  source: "engine" | "derived" | "agent" | "developer";
  confidence?: number;
}
```

The distinction between `engine` and `derived` events matters.

Example:

- `combat.perfect_parry` is emitted authoritatively by gameplay code.
- `coach.missed_safe_parry_opportunity` is derived later by analysis and has confidence.

Derived findings never rewrite authoritative events.

---

### 79.10 Causality queries

The event graph should answer:

- Which hit caused this death?
- Which ability modified that hit?
- Which projectile was reflected?
- Which original enemy owned the projectile?
- Which draft selected the modifier that changed the outcome?
- Which boss attack began the damage chain?
- Which human takeover corrected an agent failure?
- Which branch change first altered the causal chain?

This enables explanation without reverse-engineering correlations from nearby timestamps.

---

### 79.11 Ghost Lens plugin system

Theater overlays should become modular **Ghost Lenses**.

A Lens is a declared reader and visualizer of timeline data.

```ts
interface GhostLens {
  id: string;
  label: string;
  requiredCapabilities: string[];
  allowedVisibility: GhostVisibilityClass[];
  timelineLanes(): TimelineLane[];
  renderWorld(ctx: GhostRenderContext): void;
  renderHud(ctx: GhostRenderContext): void;
  summarize(timeline: GhostTimeline): GhostFinding[];
}
```

Benefits:

- New abilities can add a Lens without modifying Theater core.
- Developer overlays remain isolated from public builds.
- Coaching can reuse Lens metrics.
- Creator exports can choose overlay presets.
- Missing tracks disable only the relevant Lens.

---

### 79.12 Core Ghost Lenses

#### Input Lens

Shows:

- Movement axes
- Jump, dash, throw, recall, and tether
- Blade aim intent
- Active device
- Input buffering
- Policy decision cadence

#### Blade Momentum Lens

Shows:

- Tip speed
- Hit threshold
- Perfect-parry threshold
- Swing direction
- Commitment score
- Tether length
- Throw momentum

#### Combat Lens

Shows:

- Damage packets
- Hit source
- Knockback
- I-frames
- Shields
- Status effects
- Kill causality

#### Threat Lens

Shows:

- Active enemy attacks
- Telegraph windows
- Projected impact regions
- Nearest lethal threat
- Safe movement corridors

#### Boss Lens

Shows:

- Phase
- Move state
- Telegraph, execution, and recovery
- Phase transition requirements
- Adds and arena mutation

#### Build Lens

Shows:

- Draft offers
- Selected upgrades
- Tier evolution
- Live modifiers
- Ability activation counts
- Build archetype changes

#### Movement Lens

Shows:

- Velocity
- Grounded state
- Coyote and jump buffer
- Dash trajectory
- Platform contacts
- Fall and recovery windows

#### Determinism Lens

Shows:

- Runtime compatibility
- Checkpoints
- Hash matches
- RNG cursors
- Corrections
- First drift

#### Performance Lens

Shows:

- Simulation frame time
- Render frame time
- entity count
- particles
- memory pressure
- recorder overhead

#### Agent Intent Lens

Shows structured agent diagnostics only:

- Objective
- Target
- Threat ranking
- Intended maneuver
- Confidence
- Value estimate
- Safety override

---

### 79.13 Lens privacy firewall

A Lens may reveal information the original player could not see.

Examples:

- Exact enemy cooldown
- Hidden boss state
- Future RNG
- Agent privileged observation
- Internal collision shapes

Every Lens declares:

- `playerSafe`
- `publicSafe`
- `rankedSafe`
- `developerOnly`
- `containsPrivilegedState`

Public Theater must not accidentally expose a developer Lens because the underlying track happens to exist.

---

### 79.14 Ghost Studio

Ghost Studio should be a named product surface separate from basic Theater playback.

Theater answers:

> What happened?

Studio answers:

> How should this moment be presented and shared?

Studio capabilities:

- Mark in and out
- Multi-segment edit
- Slow-motion regions
- Freeze frames
- Camera cuts
- Camera easing
- Focus target
- Overlay presets
- Hide or show game HUD
- Title cards
- Build card
- Event captions
- Aspect-ratio presets
- Thumbnail selection
- Audio cue inclusion
- Export queue

---

### 79.15 Non-destructive edit decision lists

Studio edits must not duplicate or rewrite run truth.

```ts
interface GhostEditDecisionList {
  id: string;
  parentGhostId: string;
  parentRootHash: string;
  title: string;
  segments: Array<{
    fromTick: number;
    toTick: number;
    speed: number;
    camera: CameraInstruction[];
    lenses: string[];
    captions: CaptionInstruction[];
  }>;
  outputPreset: "16:9" | "9:16" | "1:1" | "custom";
}
```

A shared clip can be tiny because it references the parent capsule and an edit list.

A rendered video is an export artifact, not the canonical replay.

---

### 79.16 Creator export pipeline

Recommended local pipeline:

1. Validate parent Ghost.
2. Resolve runtime and required tracks.
3. Render deterministic frames to an offscreen canvas.
4. Apply camera and Lens instructions.
5. Mix semantic audio cues under current rights-safe game assets.
6. Encode through browser-supported media APIs.
7. Attach parent Ghost ID and tick range to metadata where format permits.
8. Generate thumbnail and share card.

Export presets:

- Full-quality local clip
- Fast social preview
- Silent GIF-like loop
- Screenshot sequence
- Thumbnail
- Data-only challenge link

The player should not need to screen-record the game in real time to share a polished moment.

---

### 79.17 Ghost Doctor

Ghost Doctor is the health, repair, compatibility, and quarantine subsystem.

It should perform:

- Manifest validation
- Chunk checksum validation
- Root hash validation
- Index rebuild
- Missing-chunk detection
- Duplicate-chunk detection
- Unsupported-runtime detection
- Schema migration preview
- Legacy fidelity classification
- Partial-run recovery
- Orphaned upload cleanup
- Vault metadata reconciliation
- Storage quota analysis
- Malicious replay quarantine
- Repair export

Doctor results are evidence, not silent mutation.

A repair creates a child capsule or an explicit repaired version with lineage.

---

### 79.18 Vault health dashboard

The player-facing Vault should show simple health states:

```text
Healthy
Uploading
Queued offline
Partial but watchable
Needs migration
Historic runtime required
Visual-only legacy
Corrupt and quarantined
Cloud copy unavailable
```

Developer details can reveal:

- Failed chunk IDs
- Missing runtime ABI
- Hash mismatch
- Migration warnings
- Storage path
- Root cause

One damaged replay must never prevent the Vault index from loading.

---

### 79.19 Ghost Canon

The **Ghost Canon** is the reviewed library of authoritative reference runs.

Canon categories:

- Tutorial gold demonstrations
- Every mode and difficulty
- Every weapon
- Every boss and phase
- Every Special ability and tier
- Representative legal late-game builds
- Touch, gamepad, and keyboard-mouse
- TearBot Levels 1–9
- Level Omega stress runs
- Performance-constrained runs
- Important historic releases

Each Canon entry declares:

- Purpose
- Expected fidelity
- Supported runtime range
- Assertions
- Expected result
- Owner
- Last verification
- Replacement policy

Canon changes require review because they change regression truth.

---

### 79.20 Ghost Graveyard

The **Ghost Graveyard** stores failures that must never return.

Each entry includes:

- Original full failure capsule
- Minimal reproduction capsule
- Failure signature
- Severity
- Affected versions
- Fix commit
- Preventive invariant
- Relevant code ownership
- Reopen history

Examples:

- Down-dash platform clip
- Boss phase softlock
- Draft transition dead state
- One-Hit revive contradiction
- Cloud replay chunk corruption
- Replay-world mutation leaking into the live save

PR selection uses the code diff to choose relevant Graveyard entries.

---

### 79.21 Ghost Frontier

The **Ghost Frontier** stores rare states that are novel but not yet understood.

Sources:

- Agent exploration
- Fuzzing
- Human outlier runs
- New balance changes
- Cross-version drift
- Unexpected build interactions
- Performance anomalies

Each entry receives scores for:

- Novelty
- Reproducibility
- Human plausibility
- Severity potential
- Coverage value
- Instability
- Similarity to known Graveyard failures

The Frontier is a queue for future investigation, not a dump of every weird frame.

---

### 79.22 Ghost Corpus

The **Ghost Corpus** is the governed demonstration and evaluation dataset.

Partitions:

- Human train
- Human validation
- Human hidden holdout
- Agent train
- Agent validation
- Recovery demonstrations
- Mistake demonstrations
- Device-specific sets
- Difficulty-specific sets
- Boss-specific sets
- Public opt-in
- Private local-only

Corpus records must retain:

- Consent class
- Actor provenance
- Duplicate cluster
- Build compatibility
- Skill estimate
- Behavior tags
- Quality score
- Correction lineage

Canon is for reference truth.

Graveyard is for prevented failures.

Frontier is for unknown rare states.

Corpus is for learning and measurement.

These libraries must not be conflated.

---

### 79.23 Structured agent decision trace

Agent Ghosts may contain a structured decision track.

Allowed fields:

```ts
interface AgentDecisionTrace {
  tick: number;
  objectiveId: string;
  targetEntityId?: number;
  threatIds: number[];
  intendedManeuver: string;
  draftScores?: Record<string, number>;
  confidence?: number;
  entropy?: number;
  valueEstimate?: number;
  safetyOverride?: string;
  recoveryMode?: string;
  observationClass: string;
}
```

Do not store hidden private reasoning prose.

The goal is reviewable policy telemetry, not an unbounded narrative.

---

### 79.24 Human and agent observability parity

When comparing a bot to a human, Ghost must distinguish:

- What the human could perceive
- What the bot could perceive
- What the analysis system knows after the fact

A public Level 9 bot should not appear human-like if its trace reveals exact hidden cooldowns or future RNG.

The Agent Intent Lens should display an information badge:

```text
Human-equivalent observation
Structured-state observation
Privileged diagnostic observation
Pixel-only observation
```

---

### 79.25 Ghost minimization

A replay failure should be reducible into the smallest trustworthy artifact.

#### Timeline minimization

Find the latest checkpoint and shortest action suffix that reproduces the issue.

#### Action minimization

Remove, merge, or simplify actions while preserving failure.

#### State minimization

Remove unrelated:

- Enemies
- Projectiles
- Hazards
- Platforms
- Statuses
- Timers
- History

#### Build minimization

Remove upgrades or tiers until the minimal interacting set remains.

#### RNG minimization

Replace a long random history with explicit deterministic setup where possible.

#### Presentation minimization

Strip creator and cosmetic tracks from a diagnostic child capsule.

The original full capsule remains immutable and linked as the parent.

---

### 79.26 Failure signature

A minimized Ghost needs a stable failure signature.

Example:

```text
category: collision.out_of_bounds
subsystem: player-platform
assertion: player.y <= world.bottom + allowedMargin
firstFailureTick: 19432
semanticState:
  player: downward-dash
  platform: one-way
  rootTimer: expired-this-tick
  blade: returning
buildFingerprint: ...
```

The signature supports:

- Deduplication
- Regression matching
- Graveyard selection
- Fix verification
- Trend analysis

---

### 79.27 Replay-to-scenario compiler

Any compatible Ghost timestamp or range should compile into TearSDL.

Compiler steps:

1. Select nearest authoritative checkpoint.
2. Include required causal history.
3. Remove identity and private annotations.
4. Determine state class.
5. Add expected events and invariants.
6. Declare modifications and eligibility.
7. Verify reproduction.
8. Save lineage back to the source Ghost.

Example:

```bash
tearbench ghost scenario g3_7h2k \
  --at "boss.phase_changed:3" \
  --pre-roll 2s \
  --post-roll 20s \
  --name source-phase3-recovery
```

---

### 79.28 Scenario-to-Ghost compiler

The reverse path is equally important.

A TearSDL scenario execution should produce a Ghost capsule containing:

- Scenario manifest
- State class
- Legality proof
- Synthetic history summary
- Agent identity
- Branch and commit
- Actions
- Events
- Checkpoints
- Assertions
- Outcome

This makes player runs and synthetic tests inspectable through one Theater.

---

### 79.29 Replay range object

A reusable range should be first-class.

```ts
interface GhostRange {
  ghostId: string;
  fromTick: number;
  toTick: number;
  anchorEventId?: bigint;
  requiredCheckpointId?: string;
  preRollTicks: number;
  postRollTicks: number;
}
```

Ranges power:

- Clips
- Drills
- Bug reports
- Challenge segments
- Agent corrections
- Minimized failures
- Coach findings
- Bookmarks

One shared range abstraction avoids timestamp inconsistencies across products.

---

### 79.30 Event-aligned comparison

Time-aligned comparison is insufficient once two runs diverge.

Ghost comparison should support alignment by:

- Run start
- Wave start
- Wave clear
- Draft selection
- Boss intro
- Boss phase
- First damage
- Death
- Shared event sequence
- Dynamic time warping over selected semantic events

Example:

A balance patch makes a boss phase last seven seconds longer.

Event alignment compares the same attacks and phase boundaries rather than declaring every later frame unrelated.

---

### 79.31 N-way comparison

The comparison laboratory should support more than two runs.

Examples:

- TearBot Levels 1–9 from one state
- Sword versus Hammer across five difficulties
- Human percentile groups
- Main branch versus three balance candidates
- Ten draft alternatives from the same checkpoint

Views:

- Event-aligned table
- Survival curve
- Damage curve
- Position envelope
- Build timeline
- Divergence tree
- Outcome distribution
- Representative replay selector

---

### 79.32 Ghost trajectory diff

A branch diff should report more than final score.

Trajectory dimensions:

- Player position divergence
- Blade-tip divergence
- Enemy state divergence
- Projectile ownership divergence
- HP divergence
- Style divergence
- Spawn timing divergence
- Draft offer divergence
- Boss move divergence
- RNG cursor divergence
- Performance divergence

The report should identify the first material divergence and the later consequences separately.

---

### 79.33 Draft decision replay intelligence

Ghost should make draft history fully explorable.

At each decision:

- Show all offers
- Show current build
- Show chosen card
- Show bot or Coach scores where available
- Show immediate config diff
- Show later ability activations
- Show counterfactual outcome distributions from the same checkpoint

A replay can then answer:

> Did this run lose because of execution, because of a weak build, or because the chosen build was strong but misused?

That distinction is critical for both balance and coaching.

---

### 79.34 Practice safety classes

“Practice from here” needs clear modes.

#### Exact practice

- Same state
- Same rules
- Same future RNG unless the player changes it
- No progression
- No ranked eligibility

#### Repetition drill

- Same short segment
- Automatic restart
- Success condition
- Optional hints

#### Counterfactual sandbox

- Modify weapon, ability, tier, HP, difficulty, or boss state
- Clear modification ledger
- No competitive eligibility

#### Ghost race practice

- Original or reference Ghost appears as noninteractive rival
- Same seed and rules where fairness requires it

#### Coach-assisted practice

- Hints and slow motion
- Input comparison
- Telegraph Lens
- No ranked eligibility

The mode badge must remain visible throughout the session.

---

### 79.35 Safe behavioral distillation for The Echo

Using Ghost data in The Echo or a Personal Nemesis should not directly execute untrusted replay actions as boss logic.

Pipeline:

1. Extract approved behavior features.
2. Aggregate across a bounded recent window.
3. Quantize into a safe style profile.
4. Apply boss-specific move grammar.
5. Enforce telegraphs, cooldowns, arena rules, and damage budgets.
6. Validate the resulting profile with TearBench.

Safe features:

- Engagement distance
- Dash cadence
- Aerial tendency
- Throw frequency
- Swing direction distribution
- Parry tendency
- Aggression and retreat cycles

Unsafe direct imports:

- Arbitrary entity creation
- Exact player damage values
- Debug actions
- Future RNG
- Unbounded action frequency
- Uploaded code or scripts

---

### 79.36 Ghost challenge proof

Every shared challenge should include a challenge proof manifest.

```ts
interface GhostChallengeManifest {
  id: string;
  sourceGhostId: string;
  sourceRange?: GhostRange;
  rulesHash: string;
  seedPolicy: "fixed" | "derived" | "fresh";
  allowedActors: string[];
  allowedDevices?: string[];
  successConditions: Condition[];
  failureConditions: Condition[];
  scoring: ScoringRule[];
  eligibility: string;
  expiresAt?: number;
}
```

The challenge result references both the challenge manifest and the attempt Ghost.

---

### 79.37 Ghost identity and lineage graph

Ghost lineage should be navigable as a graph.

Node types:

- Original run
- Migrated capsule
- Repaired capsule
- Clip
- Practice attempt
- Challenge attempt
- Human correction
- Agent episode
- State Forge fork
- Branch replay
- Minimized failure
- Canon promotion
- Graveyard entry

Edges:

- migrated-from
- repaired-from
- clipped-from
- forked-at
- corrected-by
- compared-with
- minimized-from
- trained-from
- promoted-to-canon
- filed-as-regression

This graph prevents copies from losing their origin and makes data governance possible.

---

### 79.38 Ghost provenance card

Every replay should expose a concise provenance card.

Player-facing example:

```text
Human run
Adventure · Hard · Hammer
Recorded on build 0.9.14
Verified exact replay
Keyboard + mouse
No restart · no practice · no debug
Public summary · private coaching track
```

Agent-facing example:

```text
TearBot Level 7
Policy tb-universal-42
Astuteness M7/S6/R7/D6
Human-equivalent structured observation
No privileged future state
Scenario forked from Ghost g3_...
Unranked test artifact
```

---

### 79.39 Ghost observability service

Ghost itself should publish health metrics to a local developer dashboard.

Metrics:

- Bytes per minute by track
- Recorder CPU
- Compression CPU
- Dropped optional samples
- Checkpoint latency
- State hash latency
- Seek latency
- Playback drift rate
- Migration success
- Vault corruption rate
- Upload retry count
- Verification duration
- Runtime package miss rate
- Practice-fork success
- Replay-to-scenario success

A replay platform this central must be monitored like infrastructure.

---

### 79.40 Ghost Doctor CLI

```bash
tearbench ghost doctor scan --vault
tearbench ghost doctor inspect <ghost>
tearbench ghost doctor repair <ghost> --output repaired.tearghost
tearbench ghost doctor quarantine <ghost>
tearbench ghost doctor rebuild-index
tearbench ghost doctor verify-chunks <ghost>
tearbench ghost doctor compatibility <ghost>
tearbench ghost doctor recover-journal <session>
```


Doctor actions that modify data always create a report and preserve the original unless the user explicitly deletes it.

---

### 79.41 Extended runtime API

```ts
Ghost3.timeline.open(id)
Ghost3.timeline.range(fromTick, toTick)
Ghost3.timeline.queryEvents(filter)
Ghost3.timeline.causalAncestors(eventId)
Ghost3.timeline.causalDescendants(eventId)

Ghost3.profile.negotiate(request)
Ghost3.profile.explain(activeProfile)

Ghost3.lenses.available(timeline)
Ghost3.lenses.enable(id)
Ghost3.lenses.disable(id)
Ghost3.lenses.preset(id)

Ghost3.studio.create(parentGhostId)
Ghost3.studio.addSegment(range)
Ghost3.studio.setCamera(instruction)
Ghost3.studio.export(preset)

Ghost3.doctor.scan(source)
Ghost3.doctor.repair(source, options)
Ghost3.doctor.rebuildIndex()
Ghost3.doctor.quarantine(source)

Ghost3.library.canon.query(filter)
Ghost3.library.graveyard.query(filter)
Ghost3.library.frontier.query(filter)
Ghost3.library.corpus.query(filter)

Ghost3.minimize.timeline(failure)
Ghost3.minimize.actions(failure)
Ghost3.minimize.state(failure)
Ghost3.minimize.build(failure)

Ghost3.scenario.fromRange(range, options)
Ghost3.scenario.recordExecution(scenario, result)
```

---

### 79.42 Extended repository structure

Additions to Section 78.5:

```text
js/ghost3/truth/
  trident.js
  roundtrip.js
  quality-card.js
  profile-negotiation.js

js/ghost3/ontology/
  event-registry.js
  payload-schemas.js
  causal-graph.js
  queries.js

js/ghost3/lenses/
  registry.js
  input.js
  blade-momentum.js
  combat.js
  threat.js
  boss.js
  build.js
  movement.js
  determinism.js
  performance.js
  agent-intent.js

js/ghost3/studio/
  project.js
  edit-list.js
  director.js
  render-pipeline.js
  media-export.js
  presets.js

js/ghost3/doctor/
  scanner.js
  repair.js
  quarantine.js
  index-rebuild.js
  journal-recovery.js
  health-report.js

js/ghost3/libraries/
  canon.js
  graveyard.js
  frontier.js
  corpus.js
  lineage-graph.js

js/ghost3/minimize/
  timeline.js
  actions.js
  state.js
  build.js
  rng.js

schemas/ghost/
  event-payloads/
  quality-card.schema.json
  edit-list.schema.json
  library-entry.schema.json
  failure-signature.schema.json
```

---

### 79.43 Extended Skill tools

```text
tear_ghost_quality_card
tear_ghost_query_events
tear_ghost_trace_causality
tear_ghost_enable_lens
tear_ghost_create_studio_project
tear_ghost_export_clip
tear_ghost_doctor_scan
tear_ghost_doctor_repair
tear_ghost_query_canon
tear_ghost_query_graveyard
tear_ghost_query_frontier
tear_ghost_promote_to_canon
tear_ghost_file_in_graveyard
tear_ghost_minimize_timeline
tear_ghost_minimize_state
tear_ghost_minimize_build
tear_ghost_compile_scenario
tear_scenario_record_ghost
tear_ghost_compare_many
```

These tools let a coding agent move from observation to evidence without manually parsing raw replay JSON.

---

### 79.44 Ghost Milestone G13 — Replay Trident and round-trip certification

Deliver:

- Explicit Command, State, and Visual truth layers
- Trident precedence rules
- Round-trip invariants
- Quality Card
- Profile negotiation

Acceptance:

- Verified replay, seek, zero-modification fork, export/import, and compatible migration pass automated round-trip certification.

---

### 79.45 Ghost Milestone G14 — Event ontology and Lens platform

Deliver:

- Versioned event ontology
- Typed payload schemas
- Causal graph queries
- Lens registry
- Core player and developer Lenses
- Privacy firewall

Acceptance:

- New content can add a Lens and event payload without modifying Theater core or exposing developer-only state publicly.

---

### 79.46 Ghost Milestone G15 — Studio and creator pipeline

Deliver:

- Non-destructive edit decision lists
- Multi-segment projects
- Camera authoring
- Overlay presets
- Local media export
- Parent Ghost attribution

Acceptance:

- A player can produce horizontal and vertical clips from an existing run without replaying or screen-recording it.

---

### 79.47 Ghost Milestone G16 — Doctor and library ecosystem

Deliver:

- Ghost Doctor
- Vault health dashboard
- Canon
- Graveyard
- Frontier
- Corpus
- Lineage graph

Acceptance:

- Corrupt data is isolated, reference truth is reviewed, known failures are permanent tests, novel states are triaged, and learning data remains governed.

---

### 79.48 Ghost Milestone G17 — Minimization and bidirectional scenario bridge

Deliver:

- Timeline, action, state, build, and RNG minimizers
- Failure signatures
- Replay-to-scenario compiler
- Scenario-to-replay recorder
- Shared range abstraction

Acceptance:

- A real player or agent failure becomes a minimal deterministic TearSDL scenario and a watchable child Ghost with complete lineage.

---

### 79.49 Ghost Milestone G18 — Universal comparison and agent trace

Deliver:

- Event-aligned comparison
- N-way comparison
- Trajectory diff
- Structured agent decision track
- Observation parity badges
- Draft-decision explorer

Acceptance:

- A developer can compare nine TearBot levels, two branches, multiple weapons, and human reference runs from one state without losing causal alignment.

---

### 79.50 v0.6 priority recommendations

After the v0.4 delivery order, prioritize:

1. Replay Trident contracts
2. Round-trip certification
3. Canonical event ontology
4. Ghost Lens registry
5. Ghost Doctor
6. Canon and Graveyard
7. Replay minimization
8. Replay-to-scenario round trip
9. Structured agent trace
10. Studio edit lists
11. Frontier and Corpus governance
12. N-way event-aligned comparison

The Studio is valuable, but Canon, Graveyard, Doctor, and round-trip correctness compound more engineering value earlier.

---

### 79.51 v0.6 definition of done

This deepening is complete when:

- Every v3 capsule has an explicit Replay Trident capability map.
- Verified replay paths pass round-trip invariants.
- Fidelity, integrity, compatibility, completeness, resumability, and privacy are separate quality dimensions.
- Event IDs and payloads are registry-backed.
- Causal queries work across combat, drafts, bosses, and agent corrections.
- Lenses are modular and visibility-gated.
- Studio edits are non-destructive and parent-linked.
- Doctor can detect, explain, repair, or quarantine common replay failures.
- Canon, Graveyard, Frontier, and Corpus have separate governance.
- Agent traces are structured and observation-classified.
- A failure can be minimized across time, action, state, build, and RNG.
- Replays compile to scenarios and scenarios emit replays.
- Comparison can align by semantic events and support N runs.
- New milestones G13–G18 have fixtures, owners, and acceptance tests.

---

### 79.52 The expanded end state

Ghost 3.0 becomes more than the memory of a run.

It becomes a durable graph of truth and learning.

A run is recorded once, then safely reused as:

- A memory
- A verified record
- A clip source
- A personal rival
- A challenge
- A coaching case
- A practice state
- A bug report
- A Canon reference
- A Graveyard regression
- A Frontier discovery
- A Corpus demonstration
- A TearBot exam
- A branch comparison
- A minimized scenario
- A historical artifact

The run does not fragment into disconnected copies.

Every derivative preserves lineage to the same canonical timeline.

That architecture is what lets Ghost improve *Tear* continuously instead of merely replaying yesterday's pixels.

---

## 80. Living Document Rules

This file is intended to evolve as the TearBench design is discussed and implemented.

Future updates should:

- Preserve major decisions and their rationale
- Add implementation discoveries from the repository
- Record schema changes
- Record rejected approaches and why they were rejected
- Update roadmap status
- Add benchmark results
- Add new agent profiles
- Add new scenario classes
- Add failure examples and lessons learned
- Keep the changelog current

Do not silently remove earlier architectural context. Mark superseded decisions explicitly.

---

## 81. Changelog

### 2026-07-22 — Version 0.6 — Ghost 3.0 Universal Timeline Deepening

- Added the Replay Trident, explicitly separating Command truth, State truth, and Visual truth with precedence and degradation rules.
- Added universal integer-tick timeline contracts and record, seek, fork, practice, export/import, and migration round-trip invariants.
- Replaced one-dimensional replay status with a Ghost Quality Card covering fidelity, integrity, compatibility, completeness, seekability, resumability, eligibility, coaching richness, creator richness, and privacy.
- Added composable recording-profile negotiation and a formal track-survival priority for storage or performance pressure.
- Added a concrete versioned event ontology, typed causal graph contract, and causality queries spanning combat, bosses, projectiles, drafts, branches, and human corrections.
- Added the modular Ghost Lens platform with Input, Blade Momentum, Combat, Threat, Boss, Build, Movement, Determinism, Performance, and Agent Intent Lenses plus a visibility firewall.
- Added Ghost Studio as a separate non-destructive creator surface with edit decision lists, parent attribution, camera authoring, overlay presets, and local media export.
- Added Ghost Doctor, the Vault health dashboard, repair lineage, journal recovery, compatibility inspection, quarantine, and index rebuilding.
- Added four separately governed knowledge libraries: Ghost Canon for reviewed truth, Ghost Graveyard for prevented regressions, Ghost Frontier for novel rare states, and Ghost Corpus for learning data.
- Added structured agent decision traces, observation-parity badges, and stronger human-versus-agent provenance.
- Added formal timeline, action, state, build, RNG, and presentation minimization plus stable failure signatures.
- Added bidirectional Ghost-to-TearSDL and TearSDL-to-Ghost compilation with a shared first-class replay range object.
- Added event-aligned and N-way comparison, trajectory diffs, draft-decision exploration, and practice safety classes.
- Added safe Ghost-derived behavior distillation for The Echo and Personal Nemesis experiences.
- Expanded runtime APIs, repository modules, Skill tools, QA coverage, observability, and implementation milestones G13–G18.

### 2026-07-22 — Version 0.5 — Ghost 3.0 Chronicle Hardening and Live Relay Contracts

- Added an explicit multi-clock model separating simulation, scored run, full session, presentation, wall-monotonic, and optional server chronology.
- Made integer simulation tick the only authoritative gameplay-causality clock.
- Added versioned within-tick phase ordering and monotonic sequence numbers so same-frame shields, damage, deaths, rewards, drafts, and transitions are causally inspectable.
- Added a shared Ghost Core and State Forge state-codec registry with capture, validation, restore, migration, semantic hashing, and presentation fallback responsibilities.
- Required checkpoint restoration to occur in a temporary world and commit atomically only after constructors, references, RNG, config, invariants, and state hashes validate.
- Hardened `PRACTICE FROM HERE` / Possess the Ghost with transactional restoration, input-latch policy, compatibility failure handling, and immutable fork lineage.
- Added delayed near-live Ghost Relay for tournament broadcasts, developer observation, support, bot exhibitions, and endurance monitoring without turning replay into live multiplayer.
- Added relay delay, privacy, chunk immutability, outage isolation, finalization, and verification contracts.
- Strengthened Ghost 3.0 definition-of-done gates for full-session capture, complete draft context, deterministic event ordering, codec-backed restoration, and safe relay transport.

### 2026-07-22 — Version 0.4 — Ghost 3.0 Platform Expansion

- Elevated Ghost 3.0 from a TearBench demonstration recorder into an independent first-class *Tear* product pillar.
- Defined Ghost Core, Vault, Theater, Coach, Challenges, Passport, and Lab as separate components with isolation contracts.
- Grounded the expansion in the current Ghost 2.0 pose, enemy, event, loadout, Vault, feed, and chunked Replay Passport architecture.
- Added explicit replay fidelity classes: Legacy Visual, Hybrid Corrected, Deterministic Verified, and Forensic Full.
- Added validation statuses, hybrid re-simulation, correction keyframes, presentation fallback, critical-state hashes, and isolated replay worlds.
- Specified the portable `.tearghost` run capsule, manifest, canonical action track, RNG track, keyframes, causal event graph, result ledger, presentation tracks, chunk index, compression, integrity, and provenance.
- Added low-overhead recorder modules, simulation-tick ownership, semantic checkpoint policy, circular instant replay, crash-safe journaling, run-resume rules, worker encoding, backpressure, adaptive fidelity, and performance budgets.
- Designed Ghost Theater 3.0 with layered timelines, frame stepping, semantic seek, cameras, overlays, multi-run comparison, instant replay, cinematic tools, accessibility, and mobile playback.
- Added the flagship `Practice from here` / `Possess the Ghost` loop, replay branches, counterfactual lineage, and automatic highlight generation.
- Added player-facing experiences including Chase Your Best, seed-locked races, Beat This Run, Boss Memory, Daily Echo, Learning Ghosts, Nemesis Ghosts, TearBot ghosts, Ghost Relay, Hall of Echoes, Run DNA, and a searchable career archive.
- Added Ghost Coach and Run Autopsy with evidence-linked findings, a complete mistake taxonomy, opportunity detection, draft-regret analysis, skill graphs, astuteness-aware explanations, and replay-to-drill compilation.
- Redesigned Vault and cloud architecture around IndexedDB, metadata/object-storage separation, resumable upload sessions, atomic finalization, partial download, quotas, retention classes, deep links, visibility, discovery, lineage, import/export, and cost controls.
- Added competitive verification, trusted re-simulation, result-ledger validation, eligibility records, tamper indicators, secure untrusted parsing, privacy classification, separate training consent, moderation, exploit handling, and versioned verdicts.
- Added V1/V2 migration, historical runtime packages, stable IDs, aliases and tombstones, schema migration rules, drift handling, capsule repair, crash recovery, bug-report packages, preservation, and a golden replay corpus.
- Added support, human QA, live-ops, tournament, balance-observatory, Remote Config, product analytics, and Developer Ghost Lab workflows outside TearBench.
- Added human/bot/hybrid provenance, calibrated TearBot reference ghosts, astuteness fingerprints, Ghost style embeddings, a Personal Nemesis / evolved Echo concept, dataset governance, consent-aware partitions, recovery demonstrations, and agent lineage.
- Added Ghost 3.0 runtime APIs, CLI commands, Skill tools, repository architecture, stable registries, Milestones G0–G12, product metrics, direct recommendations, and a strict definition of done.

### 2026-07-22 — Version 0.3 — State Forge and Self-Calibrating TearBot Ladder

- Made arbitrary-state launch a second non-negotiable capability alongside full-journey autonomy.
- Added Tear State Forge with full runtime serialization, transactional restore, provenance, semantic fingerprints, validation, and schema migration.
- Added five explicit state classes: recorded canonical, reconstructed reachable, plausible population, surgical valid, and adversarial impossible.
- Added the Canonical Progression Ledger so late-game states derive their exact draft, boss, tier, reward, weapon, difficulty, and config history from production rules rather than hardcoded formulas.
- Added Historical Run and Build Synthesis for exact wave-99-style scenarios, including legal opportunity counts, draft timelines, tier evolution, HP, score, time, style, economy, and population plausibility.
- Added exact mid-combat and boss-phase injection, blade-state templates, ability activation templates, and threshold-minus/at/plus boundary generation.
- Added TearSDL, scenario inheritance, constraints, natural-language compilation, property-based state generation, and scenario linting.
- Added full snapshots, event-sourced time travel, state banks, branch migration, failure-window extraction, and counterfactual forks.
- Added risk-weighted combinatorial interaction testing across mode, difficulty, wave, boss, weapon, ability, tier, device, environment, seed, and agent profile.
- Added the TearBot 1–9 ladder, Level Ω, separate mechanical/strategic/QA astuteness axes, and a human-like information firewall.
- Added the multidimensional Astuteness Vector and bounded-rationality compiler so levels differ through coherent human-like capability rather than random sabotage or unfair omniscience.
- Added a self-calibrating performance model using scenario difficulty, multidimensional agent ability, holdout exams, monotonicity contracts, level-separation contracts, and human anchoring.
- Added the Agent Foundry closed loop for weakness mining, curriculum generation, challenger training, champion promotion, quality-diverse policy retention, rollback, and iteration reporting.
- Added State Forge, bot calibration, policy lifecycle, counterfactual, and matrix commands to the proposed API, CLI, Skill, Studio, dashboards, and artifact package.
- Added Milestones L–V covering exact snapshots, progression reconstruction, wave-99 synthesis, arbitrary boss states, time travel, bot levels, human calibration, self-improvement, Studio UX, release certification, and the final beyond-goal system.

### 2026-07-22 — Version 0.2 — Full-Journey Autonomy Expansion

- Made visible main-menu-to-menu player journeys a non-negotiable requirement.
- Added separate training, engineering, and black-box certification execution classes.
- Grounded the plan in Tear’s five current difficulties and seven current modes.
- Added a ten-level autonomous competency ladder.
- Added the full player-journey state machine and transition watchdog.
- Replaced the implied monolithic bot with a hierarchical agent architecture.
- Added structured, pixel, semantic UI, event, internal-action, and physical-input channels.
- Added complete difficulty-aware training, fairness metrics, monotonicity contracts, and calibration populations.
- Added explicit completion contracts for Tutorial, Adventure, Endless, Gauntlet, Playground, Boss Test, and Enemy Test.
- Added advanced draft, build-synergy, counterfactual rollout, Special guarantee, and tier-evolution testing.
- Added Agent Academy, human takeover correction, curriculum promotion, and visible policy report cards.
- Added offline RL, hierarchical learning, world-model acceleration, population-based training, quality-diversity, and adversarial scenario generation.
- Expanded the agent fleet with player personas, mechanic specialists, QA adversaries, input profiles, performance profiles, and human-likeness constraints.
- Added pairwise coverage, rare-state banking, replay mining, diff-aware scenario selection, and coverage heatmaps.
- Added a complete QA domain matrix covering gameplay, UI, controls, progression, replays, audio, visuals, performance, deployment, networking, interruptions, and exploit resistance.
- Added live spectator overlays, draft explanations, branch theater, tournaments, and champion/challenger policy management.
- Added multi-policy adjudication, automatic diagnosis, commit bisection, and counterfactual balance analysis.
- Added local, PR, nightly, endurance, and release certification gates.
- Expanded the CLI, Skill tool surface, repository architecture, registries, and implementation roadmap.
- Defined “perfect autonomous playtesting” as independent, auditable, full-experience certification rather than a single strong gameplay bot.

### 2026-07-22 — Version 0.1

- Established the TearBench concept.
- Distinguished the gameplay policy from the agent Skill.
- Documented existing Tear architecture that enables synthetic control.
- Documented current Ghost 2.0 training-data potential.
- Proposed the deterministic `window.TEAR_TEST` API.
- Defined initial observation and action spaces.
- Defined scripted, imitation-learning, and reinforcement-learning progression.
- Defined the multi-agent testing fleet.
- Added scenario, invariant, branch-comparison, fuzzing, visual QA, performance, and reproduction-minimization systems.
- Proposed the `tear-autonomous-playtester` Skill and CLI.
- Added phased implementation roadmap and repository structure.

