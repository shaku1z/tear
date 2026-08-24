# TEAR: BLADE — Final Five-Weapon Roster Redesign & Implementation Plan

## Document status

- **Document state:** Approved design direction and implementation specification.
- **Repository:** `shaku1z/tear`
- **Implementation baseline:** protected canonical `main`; compare behavior against `ee5e93141d67cc02505b2227b3be0b10d1819e1c` only through the locked comparison-only oracle.
- **Supersedes:** The weapon-roster sections of `TEAR_WEAPONS_AND_ABILITIES_COMPLETE_PLAN.md`.
- **Preserves:** The current capability-based weapon architecture, normalized combat events, six universal throw upgrades, Stormbank, Overrun, and Sever.
- **Implementation owner:** Codex or another repository-aware coding agent.
- **Rule:** Nothing is considered implemented until repository state, tests, and browser evidence prove it.
- **Owner:** Combat/weapon owner
- **Status:** Active
- **Closure condition:** The locked Final Five (Sword, Hammer, Greatsword, Chainblade, Riftlock) pass implementation, deterministic, browser, and release evidence gates; Spear and Ringblade remain historical/outdated roster references only.
- **Branch policy:** Start each change from protected `main` in a short-lived `codex/*` branch. Do not develop on `codex/final-five-weapon-roster` or another long-lived branch; historical branch names are references only.

This is both a design source of truth and a live implementation checklist. Codex should commit a copy into the repository and update the task boxes as work progresses.

---

# 1. Final roster lock

| Slot | Weapon | Held identity | Throw identity |
|---:|---|---|---|
| 1 | **Sword** | **Reversal** | **Threadcut** |
| 2 | **Hammer** | **Break** | **Meteor** |
| 3 | **Greatsword** | **Cleaving Momentum** | **Wheel Cut** |
| 4 | **Chainblade** | **Compact Cleaver / Lash** | **Hook & Sling** |
| 5 | **Riftlock** | **Razor Rounds / Recoil / Chamber Cut** | **Loose Cannon / Backblast Recall** |

Removed from the active primary roster:

- Spear
- Ringblade

The final five physical verbs are:

> **Reverse. Break. Cleave. Swing. Recoil.**

The player should feel these differences before reading any text.

---

# 2. Non-negotiable design rules

## 2.1 Every weapon is complete before its signature

Normal attacks must already be satisfying and deal their intended baseline damage.

A signature may create:

- A new route
- A new follow-up
- A new physical consequence
- A new target relationship
- A new movement opportunity
- A new control decision

It must not merely decide whether a normal attack receives the weapon’s real damage.

## 2.2 Do not repeat True Cut

The existing True Cut failed because ordinary Sword swings appeared to satisfy it almost constantly. It became a passive damage increase disguised as a mechanic.

Do not introduce another system equivalent to:

```js
if (easyHiddenQualityCheck) damage *= passiveBonus;
```

A weapon mechanic is invalid when:

- Most ordinary attacks trigger it accidentally.
- Failure only means lower damage.
- The player cannot understand why it triggered.
- It creates no new decision.
- It does not visibly alter the fight.

Sword Reversal therefore requires two distinct attacks, target exit, and opposite-direction re-entry.

## 2.3 No per-weapon ability nerfs

All upgrades retain their current behavior and values.

Forbidden:

```js
if (weapon.id === "riftlock") ruptureStacks *= 0.5;
if (weapon.id === "riftlock") stormbankDamage *= 0.7;
if (weapon.id === "chainblade") overdriveCap -= 2;
```

Natural synergy is allowed. Potentially strong interactions may be measured and placed on a watchlist, but no ability is weakened for one weapon without a later explicit design decision.

## 2.4 Visible geometry is collision authority

- Sword uses its visible blade segment.
- Hammer uses its visible head/body.
- Greatsword uses its full broad blade.
- Chainblade uses the visible hooked head; chain contact is classified separately.
- Riftlock uses its bayonet and explicit projectile geometry.

A weapon must not visually miss while hidden geometry hits.

## 2.5 Shared movement fundamentals stay shared

Weapons do not change:

- Jump height
- Jump buffer
- Coyote time
- Dash cooldown
- Dash duration
- Dash invulnerability
- Base gravity
- Maximum fall speed
- Base HP
- Player collision dimensions
- Platform rules

Restrained chassis differences may affect move speed, air control, knockback resistance, thrown-state movement, conditional recoil, or conditional traction.

## 2.6 Every special state is bounded

Every state requires:

- A finite timer or physical exit
- Cancel behavior
- Death cleanup
- Stage-transition cleanup
- Boss-phase cleanup
- Pause/resume safety
- Replay/snapshot representation
- A guaranteed route back to `held`

No weapon may remain permanently hooked, remote, embedded, swinging, stolen, or returning.

---

# 3. Architecture and migration

The current implementation already has the right overall model:

- Weapon definitions own feel, damage behavior, throw lifecycle, model, chassis, and copy.
- `Blade` owns position, aim, shared physics, collision helpers, throw identity, and normalized channels.
- Abilities subscribe to normalized events.
- One `throwId` follows one complete route.
- First-impact effects are one-shot.
- Secondary throw actions are idempotent.

Do not replace this with a giant weapon-ID switch.

## 3.1 Stable IDs

```text
sword
hammer
greatsword
chainblade
riftlock
```

## 3.2 Removed-ID selection migration

For current selection and pending-finale saves:

```js
const WEAPON_SELECTION_MIGRATION = {
  spear: "greatsword",
  ringblade: "riftlock",
};
```

Historical Spear and Ringblade usage statistics remain preserved under their old IDs.

## 3.3 Replay and Ghost migration

Do not silently substitute a new weapon inside an old deterministic replay.

Add a weapon schema version.

Legacy replay behavior:

- Preserve the file.
- Show metadata and thumbnail where possible.
- Explain that the old weapon runtime is unavailable.
- Do not claim deterministic playback.
- Only migrate when a verified semantic migration exists.

## 3.4 Identity fields

Every attack should carry appropriate identity:

```js
{
  attackId,
  swingId,
  throwId,
  weaponId,
  sourceKind,
  owner,
  sourceEnemy,
  procEligible,
}
```

### `swingId`

One continuous held motion. Used for:

- Lifesteal once per swing
- Riftlock Chamber Cut once per swing
- Greatsword target dedupe
- Sword first/second swing separation
- Style dedupe

### `throwId`

One full route from launch through catch. Used for:

- Stormbank one discharge
- Overdrive route state
- Redirect
- Capture
- Secondary-action ownership
- Throw telemetry

### `attackId`

One discrete damage opportunity. Used for:

- Riftlock shot versus recoil-body hit
- Chainblade collision dedupe
- Greatsword outbound versus return
- Same-frame overlap prevention

---

# 4. Input language

| Weapon | Tether action while held | Tether action while thrown | Throw/recall action |
|---|---|---|---|
| Sword | Close-control tether | Normal aim/control | Launch / Threadcut recall |
| Hammer | Close-control tether | Normal aim/control | Launch / return |
| Greatsword | Close-control tether | Normal aim/control | Wheel Cut / edge-first return |
| Chainblade | Tighten compact or Lash radius | Tighten hooked swing radius | Hook / tangential release and return |
| Riftlock | Fire one Razor Round | Remote Fire | Loose Cannon / Backblast Recall |

No new gameplay button is required.

Weapon-specific prompts must update on mouse, controller, and touch.

Examples:

- `HOLD TETHER — CLOSE CONTROL`
- `HOLD TETHER — TIGHTEN RADIUS`
- `TETHER — FIRE`
- `TETHER — REMOTE FIRE`

---

# 5. Shared weapon contract

Conceptual contract:

```js
{
  id,
  name,
  model,
  playstyle,
  description,
  blurb,
  tags,
  weaknesses,
  throwIdentity,
  ratings,
  channels,

  applyPhysics(context),
  applyPlayerChassis(context),

  onEquip(context),
  onUnequip(context),
  onReset(context),

  onHeldUpdate(context),
  damageProfile(context),
  onHeldHit(context),

  onThrowLaunch(context),
  updateThrown(context),
  onThrowHit(context),
  onWorldImpact(context),

  onTetherPress(context),
  onTetherHeld(context),
  onTetherRelease(context),

  onSecondaryThrowAction(context),
  onReturnHit(context),
  onCatch(context),

  geometry(context),
  drawHeld(context),
  drawThrown(context),
  drawHud(context),

  snapshot(context),
  restore(context, data),
}
```

Undefined hooks use shared defaults.

---

# 6. Roster comparison

| Attribute | Sword | Hammer | Greatsword | Chainblade | Riftlock |
|---|---:|---:|---:|---:|---:|
| Responsiveness | 5 | 1 | 2 | 3 compact / 2 extended | 4 |
| Raw impact | 3 | 5 | 4 | 3 | 3 |
| Practical reach | 3 | 2 | 5 | 3–5 | 3 melee / 5 shot |
| Crowd coverage | 2 | 5 | 5 | 5 | 2 |
| Single-target pressure | 5 | 4 | 4 | 3 | 5 |
| Parry consistency | 5 | 1 | 2 | 2 | 4 |
| Slam strength | 3 | 5 | 4 | 3 | 3 |
| Throw utility | 4 | 3 | 4 | 5 | 5 |
| Ease of use | 5 | 3 | 3 | 2 | 3 |
| Mechanical ceiling | 4 | 4 | 4 | 5 | 5 |

These numbers describe identity, not final tuning.

---

# 7. Sword — The Duelist

## Role

- Fastest response
- Cleanest parries
- Sustained boss pressure
- Directional melee mastery
- Precise multi-target recall routing

## Fantasy

> **Cut through. Exit. Reverse the blade and open the wound from the other side.**

## Appearance

- Straight narrow medium-length blade
- Small crossguard
- Short geometric grip
- Strong black silhouette
- Thin cyan edge at speed
- Minimal ornament
- No oversized fantasy detailing

Reversal prime visual:

- First cut leaves a directional slash mark.
- A notch indicates the required opposite return.
- Mark uses shape and direction, not color alone.

Reversal completion:

- Crossed cyan-white slash
- Crisp high-frequency cut sound
- Strong controlled hit-stop
- Small camera kick

## Baseline held feel

- Full normal damage on every valid hit
- Best spring response
- Best angle correction
- Most forgiving deflect and Perfect-Parry thresholds
- Moderate reach
- Moderate knockback
- Moderate Slam

The Sword remains complete even without Reversal.

## Exclusive mechanic — Reversal

### First hit

Record:

```js
enemy.swordReversal = {
  expiresAt,
  firstSwingId,
  firstDirX,
  firstDirY,
  exited: false,
};
```

Requirements:

- Held Sword edge contact
- Valid damaging speed
- Player-owned swing damage
- Valid `swingId`
- Target not scripted-immune

### Exit requirement

The blade must fully leave an expanded target radius before Reversal can resolve.

This blocks:

- Jitter
- Repeated overlap
- One continuous pass
- Passive activation

### Opposite-direction requirement

Second tip-velocity direction must be meaningfully opposite the first.

Prototype:

```js
dot(normalize(secondTipVelocity), firstDirection) <= -0.55
```

### Separate swing

```js
secondSwingId !== firstSwingId
```

### Window

Prototype: `1.2–1.6s`.

### Payoff

- Visible bonus hit component
- Stronger hit-stop
- Controlled normal-enemy stagger
- Extra style
- Clear the mark

No Reversal occurs from one ordinary swing.

### Perfect Parry

A Perfect Parry may prime the source for Reversal, but exit and opposite-direction re-entry are still required.

## Throw — Threadcut

### Outgoing

- Fast straight launch
- Pierces valid targets
- Threads each target once per `throwId`
- Stores hit order
- Uses visible Sword geometry
- Misses still recall normally

### Recall

1. Visit valid Threaded targets in reverse hit order.
2. Hit each once.
3. Skip dead or invalid targets.
4. Use bounded steering and timeout.
5. Return to player.

Bosses may be visited once per throw. Phase transitions may invalidate a Thread safely.

Redirect adds one route correction; it does not restart the full route.

## Strengths

- Best responsiveness
- Best parry consistency
- Strong sustained pressure
- Precise throw execution
- Low mechanical friction

## Weaknesses

- Modest burst
- Weak armor destruction
- Limited broad crowd control
- Requires repeated target access

## Selection copy

**Playstyle:** Precision, parries, and directional pressure.

**Description:** *Responsive and exact. Cut through a target, exit its space, then reverse the blade to open a Reversal. Throw the Sword to Thread enemies and carve back through them in reverse order.*

**Tags:** `Precision` · `Parry` · `Recall`

---

# 8. Hammer — The Breaker

## Role

- Highest committed impact
- Best Break
- Best armor destruction
- Best Power Slam
- Best crowd interruption

## Fantasy

> **One committed hit changes the entire fight.**

## Appearance

- Long rigid handle
- Large rectangular or asymmetric head
- Broad striking faces
- Black silhouette
- Orange/cyan fracture seam
- Thick low-opacity trail
- Heavy grounded shadow

## Held feel

Preserve the successful current identity:

- Weak low-speed contact
- Strong committed hits
- Slowest reversal
- Strong knockback
- Strongest Slam
- Hardest parries
- Strong knockback resistance while held

## Break

Qualifying sources:

- Committed held hit
- Power Slam
- Direct Meteor
- Meteor shockwave
- Approved breakable-environment contact

Break affects armor, shields, guard, heavy windups, boss posture, rooted states, and breakable structures.

Rapid low-speed shaking produces negligible Break.

## Throw — Meteor

- Ballistic route
- Real gravity
- First impact resolves once
- Direct damage plus radial shockwave
- Stun, launch, and Break
- Scale from speed, downward velocity, and route commitment
- No unlimited piercing
- Returning Hammer has wide collision and capped targets
- Always reaches `held`

## Strengths

- Burst
- Armor
- Stagger
- Slam
- Crowd interruption

## Weaknesses

- Slow handling
- Difficult parries
- Low sustained uptime
- Weak against mobile targets
- Punishable misses

## Selection copy

**Playstyle:** Impact, Break, and destruction.

**Description:** *Slow and devastating. Build real force through committed movement, shatter defenses with Break, and turn every throw into a ballistic Meteor.*

**Tags:** `Break` · `Slam` · `Crowd`

---

# 9. Greatsword — The Formation Cleaver

## Role

- Broadest melee cutting coverage
- Long rigid reach
- Multi-target follow-through
- Strong launch and knockback
- Large-blade fantasy without becoming Hammer

## Fantasy

> **Start one enormous cut and carry it through the formation.**

## Appearance

- Very long broad blade
- Rectangular body with tapered or clipped point
- Long straight cutting edge
- Thick spine
- Short two-handed grip
- Small or absent crossguard
- Black silhouette
- Thin cyan edge at high speed

Provisional relative scale:

- Length: `1.45–1.65×` Sword
- Width: `2.2–3.0×` Sword
- Grip: `1.3×` Sword grip

Avoid making it a shield-like slab, door, magical wall, or Hammer-shaped blade.

## Held physics

- Slower than Sword
- Faster than Hammer
- Strong angular inertia
- Wide actual collision
- Weak close to hilt
- Moderate-high Slam
- Harder parries than Sword

## Exclusive physical property — Cleaving Momentum

The Greatsword loses less velocity after cutting light enemies.

This is not a meter or proc. It is collision response.

| Target class | Momentum retained |
|---|---:|
| Small/light | High |
| Medium | Moderate |
| Heavy | Low |
| Armored/guarding | Very low |
| Boss | Authored/capped |

On hit:

1. Deal normal edge damage.
2. Resolve target resistance.
3. Reduce blade velocity by resistance.
4. Continue the same `swingId`.
5. Permit later targets once each.

Use per-swing target dedupe.

Do not apply a hidden damage multiplier merely because it cleaved.

Hit-stop across multi-target contact should be coalesced so the game does not freeze repeatedly in one frame.

## Throw — Wheel Cut

### Outbound

- End-over-end rotation
- Broad visible collision
- One hit per target outbound
- Light targets remove less rotation
- Heavy targets remove more
- Ends on route budget, timer, world impact, or embed

### Recall

1. Tear free if embedded.
2. Reduce rotation.
3. Align the long edge across return travel.
4. Return as one broad edge-first cut.
5. Hit each target once.
6. Catch safely.

Outbound is a rotating crowd pass. Return is a straight finishing cleave.

## Strengths

- Broad melee coverage
- Excellent crowd clear
- Long reach
- Strong launch
- Readable mastery

## Weaknesses

- Slow recovery
- Weak near hilt
- Hard reactive parries
- Less armor destruction than Hammer
- Less single-target uptime than Sword

## Selection copy

**Playstyle:** Reach, broad cuts, and follow-through.

**Description:** *A huge rigid blade that preserves momentum through light enemies. Carry one swing across a formation, throw it as a rotating Wheel Cut, then recall it as a single edge-first cleave.*

**Tags:** `Cleave` · `Reach` · `Crowd`

---

# 10. Chainblade — The Slinger

## Role

- Enemy manipulation
- Variable reach
- Collision setups
- Platform displacement
- Aerial redirection
- High-skill physics

## Fantasy

> **Hook the target, build the swing with the mouse, and choose where it lands.**

## Appearance

### Hilt

- Short heavy grip
- Compact guard
- Mechanical chain spool/open ring
- Small cyan spool indicator

### Head

- Heavy hooked cleaver
- Straight outer cutting edge
- Curved inner hook
- Diamond/wedge profile
- Clearly a blade, not a weight

### Chain

- Geometric rectangular links
- Low visible link count
- Cyan highlight only when taut
- Readable tension
- No invisible full-damage line

Compact form reads as a responsive hooked cleaver with a short articulated spine.

## Held feel redesign

Remove:

- Tension damage requirement
- Low-Tension damage punishment
- Constant delayed handling
- Orbit-before-use behavior

At compact range:

- Full normal damage
- Responsive short-cleaver feel
- Reasonable parries
- Moderate reach

During broad outward movement:

- Links extend
- Head trails naturally
- Reach increases
- Head gains angular velocity

## Held signature — Lash

Lash is a physical extension state, not a meter.

The head remains the primary damage object. The visible chain may deflect or lightly shove; it does not automatically deal head damage.

When motion slows or tether tightens, the chain collapses and compact control returns.

## Throw — Hook & Sling

### Launch

- Head launches while chain stays attached
- First valid target may be hooked
- Miss reaches max extension and returns automatically
- Terrain is not a traversal anchor

### Hooked state

```text
flying -> hooked -> released -> returning -> held
```

Track:

```js
{
  target,
  radius,
  minRadius,
  maxRadius,
  angle,
  angularVelocity,
  radialVelocity,
  hookT,
  collisionSet,
}
```

### Mouse control

- Aim controls desired angular position around player.
- Apply bounded angular acceleration.
- Respect current momentum and target mass.
- Never teleport target to reticle.

### Tighten Tether

Holding tether:

- Shortens radius gradually
- Increases angular speed within caps
- Pulls light target inward
- Improves release precision

Releasing tether allows radius to extend; it does not release the target.

### Collision damage

Hooked targets may collide with enemies, walls, floor, platforms, and breakable objects.

Rules:

- Player owns the damage.
- One collision event per target per cooldown.
- No zero-distance farming.
- Does not emit `onSwingHit`.
- Does participate in shared first-damage/death ownership.

### Recall release

Recall:

1. Samples current tangential velocity.
2. Releases target along tangent.
3. Applies bounded mass-aware release force.
4. Returns blade head to player.

Uses:

- Horizontal crowd throw
- Wall impact
- Upward launch
- Downward spike
- Platform-edge throw
- Enemy-on-enemy collision

### Heavy enemies

Heavy targets become anchors:

- Player moves more than target.
- Tether pulls player inward.
- Mouse can arc player around target within caps.
- Recall disconnects and returns weapon.

### Bosses

- Boss remains mostly fixed.
- Player may arc/pull toward boss.
- Tug and duration are capped.
- Phase transition breaks link.
- Boss cannot be immobilized.

## Strengths

- Best manipulation
- Best collision setups
- Variable reach
- Strong support isolation
- Unique aerial control

## Weaknesses

- Complex
- Heavy targets resist
- Lower direct boss damage
- Requires room
- Mistimed release loses value

## Selection copy

**Playstyle:** Manipulation, collisions, and advanced momentum.

**Description:** *A responsive hooked cleaver that extends into a chain at full reach. Throw it into an enemy, swing the target with the mouse, tighten the radius, then recall to release it along the current tangent.*

**Tags:** `Hook` · `Swing` · `Control`

---

# 11. Riftlock — The Loose Cannon

## Role

- Ranged precision
- Recoil-driven weapon movement
- Hybrid melee/ranged combos
- Aerial correction
- Remote throw control
- Technical boss pressure

## Fantasy

> **Cut to chamber. Fire to redirect. Throw the gun and shoot it through the arena.**

## Core identity

Riftlock is a genuine gun and a genuine Tear weapon.

It is not a conventional modern pistol, separate shooter control scheme, hitscan-only weapon, or decorative bayonet.

It is an oversized razor revolver whose shots apply real recoil to the gunblade, player, and thrown route.

## Appearance

### Silhouette

- Oversized hand-cannon frame
- Long rectangular barrel
- Four-chamber geometric cylinder
- Full underbarrel bayonet
- Smaller upper spine blade
- Heavy square trigger housing
- Compact grip
- Black body
- Cyan chamber indicators
- Cross-shaped muzzle
- No realistic military detailing

### Bayonet proportions

- Total weapon length near Sword length
- Bayonet cutting length around `55–70%` of Sword edge
- Barrel slightly longer than bayonet
- Narrow-medium bayonet width
- Cylinder visually central

### Razor Rounds

- Tiny blade-shaped projectiles
- Visible at gameplay speed
- Cyan trailing edge
- No brass casing requirement

### Chamber indicators

Four readable slits/pips:

- Lit: available
- Dark: spent
- Reforming: fragments drawing inward
- Parry refill: two clicks
- Chamber Cut: one click

### Muzzle flash

- Sharp cross/diamond
- Cyan-white center
- Short black recoil streak
- No giant orange fireball

## Baseline held feel

At zero chambers, Riftlock remains a complete gunblade:

- Slightly heavier than Sword
- Shorter melee reach
- Faster than Greatsword
- Responsive compact parries
- Moderate damage
- Moderate launch and Slam

## Tether input — Fire

A fresh tether press fires one Razor Round.

- Rising edge fires.
- Holding does not repeatedly fire by default.
- Release rearms input.
- Controller and touch use the same logical action.

## Razor Round

Classification:

```js
projectile.family = "weaponProjectile";
projectile.sourceKind = "riftlockRound";
projectile.owner = player;
projectile.weaponId = "riftlock";
```

Held shot:

- Emits `onHit`
- Does not emit `onSwingHit`
- Does not emit `onThrowResolve`
- Is not a reflected enemy projectile
- Uses player-owned damage
- May apply shared on-hit upgrades
- Can damage Wraiths as a cutting weapon projectile

Flight:

- Fast visible projectile
- Narrow
- One target by default
- Bounded lifespan
- Modest knockback
- No hitscan
- No automatic homing
- No infinite piercing

## Signature — Recoil

Each shot pushes opposite the barrel direction.

### Weapon recoil

May:

- Start a swing
- Extend a swing
- Reverse the bayonet
- Pull it through a nearby enemy
- Knock it away from armor
- Misalign it if poorly timed

There is no separate generic Recoil damage multiplier. Bayonet damage comes from actual movement.

### Player recoil

Ground:

- Minor spacing and momentum
- No dash reset
- No invulnerability

Air:

- Small directional correction
- Downward shot nudges player upward
- Horizontal shot nudges backward
- Upward shot nudges downward
- Four chambers prevent permanent flight

### Recoil Cut

A shot and recoil-driven bayonet crossing are two distinct visible attacks.

Recoil Cut requires:

1. Shot fired.
2. Recoil moves bayonet.
3. Bayonet crosses enemy at valid speed.
4. Enemy not already hit by that recoil `attackId`.

No extra hidden multiplier is required.

Suggested style label: `KICKBACK` or `CROSSFIRE`.

## Chamber system

Riftlock has four offensive chambers.

### Reset

Set to four on run start, wave start, boss start, weapon restart, Playground reset, tutorial reset, and retry.

### Passive reformation

- One spent chamber reforms at a time.
- Uses simulation time.
- Pauses during full pause/cinematic lock.
- Prevents permanent empty state.

### Chamber Cut

A valid bayonet `onSwingHit` reforms one spent chamber.

Rules:

- Once per `swingId`
- Not once per target
- Not from shots
- Not from status ticks
- Not from repeated overlap

### Perfect Parry

Reforms two chambers as Riftlock’s own weapon mechanic. Parry upgrades remain unchanged.

### Catch

Catching Riftlock reforms one chamber.

There is no reload button. The blade combat is the reload.

## Throw — Loose Cannon

### Launch

- Entire Riftlock leaves player.
- One `throwId` begins.
- Gun has real position, angle, velocity, bayonet collision, and chamber state.
- Player is fully unarmed while it is loose.
- Aim controls barrel direction from gun’s position.

### Remote Fire

A tether press while loose:

1. Fires Razor Round from actual muzzle.
2. Uses offensive chamber.
3. Applies recoil to Riftlock.
4. Changes route.
5. Emits a valid throw interaction when it hits.

Remote shot:

- `onHit`
- `onThrowResolve` on valid enemy contact
- Same `throwId`
- Not `onSwingHit`
- Not `onReturnHit`

The player pilots through recoil:

- Shoot left to push right
- Shoot down to lift
- Shoot up to drive downward
- Shoot backward to reverse

There is no free cursor steering beyond bounded barrel rotation.

## Remote dual interaction

One remote shot may create:

- Razor Round attack
- Recoil-body/bayonet attack

Use separate `attackId`s under one `throwId`.

Dedupe:

- One projectile hit per target
- One recoil-body hit per target per recoil window
- No zero-distance overlap loop
- Stormbank once per `throwId`

## Secondary action — Backblast Recall

Recall works even at zero offensive chambers through a separate return chamber.

Sequence:

1. Rotate barrel away from player.
2. Fire Backblast Round outward.
3. Recoil launches Riftlock toward player.
4. Align bayonet into return path.
5. Hit each return target once.
6. Catch.

Backblast Round and return bayonet are the secondary throw action and use `secondaryPower`.

## Capture

Capture applies on direct thrown body/bayonet hit, not ordinary held shots.

- Bayonet lodges temporarily in normal enemy.
- Remote recoil transfers bounded movement.
- Heavy targets resist.
- Bosses cannot be freely repositioned.
- Recall rips weapon free.
- Upgrade Bleed/rupture behavior remains unchanged.

## Wraith compatibility

Razor Rounds are explicit player-owned cutting projectiles and can damage Wraiths. This is enemy compatibility, not an upgrade exception.

## Strengths

- Best ranged precision
- Strong mobile-boss uptime
- Unique recoil movement
- High throw ceiling
- Melee/ranged layering
- Strong parry compatibility

## Weaknesses

- Low crowd coverage
- Chamber management
- Weak armor pressure
- Recoil can misposition
- Short melee reach
- Fully unarmed while thrown

## Selection copy

**Playstyle:** Gunblade precision, recoil, and remote trajectories.

**Description:** *An oversized razor revolver with a functional bayonet. Cut to reform chambers, fire blade-shaped rounds whose recoil changes your swing, then throw Riftlock and pilot it through the arena by shooting from its remote position.*

**Tags:** `Gun` · `Recoil` · `Remote`

---

# 12. Upgrade invariance

All existing upgrades keep their current mechanic and numerical behavior.

The weapon layer adapts through correct events, channels, ownership, geometry, and secondary-action identity.

## Balance watchlist — observation only

Measure, but do not nerf:

- Rupture with repeated Riftlock shots
- Sunder ranged application
- Stormbank with remote Riftlock hits
- Overdrive with shot/body layering
- Chainblade collision chains
- Greatsword multi-target event duplication

These are not implementation instructions.

---

# 13. Upgrade compatibility

## General upgrades

| Upgrade | Sword | Hammer | Greatsword | Chainblade | Riftlock |
|---|---|---|---|---|---|
| Keen Edge | Swing damage | Held swing/impact path | Swing damage | Head swing damage | Bayonet swing damage |
| Long Reach | Blade/control radius | Visible/practical reach | Blade/control radius | Compact and valid chain reach | Bayonet/control radius |
| Heavy Swing | Knockback/launch | Knockback/launch | Cleave knockback/launch | Head and player-caused release force | Bayonet knockback/launch |
| Deadly Throw | Threadcut | Meteor | Wheel Cut | Hook route | Loose Cannon route |
| Vampiric Edge | Once per swing | Once per swing | Once per swing, not target | Once per swing | Bayonet once per swing; shots are not swings |
| Air Superiority | Shared airborne damage | Shared | Shared | Shared | Shared valid damage paths |
| Glass Cannon | Shared swing/throw/all damage | Shared | Shared | Shared | Bayonet, shots, Loose Cannon, Backblast |
| Whetstone | Threadcut return | Return | Edge-first return | Sling secondary | Backblast and return bayonet |
| Gyroblade | Out/return speed | Meteor/return | Wheel/return | Hook/return | Loose Cannon/Backblast |
| Quickdraw | Recall range | Recall range | Recall range | Hook range/duration | Remote range/return |
| Steady Hand | Parry | Parry | Parry | Parry | Bayonet parry |
| Wide Guard | Deflect | Deflect | Deflect | Deflect | Bayonet/barrel deflect |
| Counterforce | Reflected enemy shot | Same | Same | Same | Reflected enemy shot; Razor Rounds are not reflections |

The following remain universally useful without weapon-specific logic:

- Vitality
- Fleet Foot
- Quick Recovery
- Tough Hide
- Air Dash
- Afterimage
- Hard Turn
- Bounty Hunter
- Tailwind
- Kinetic Charge
- Bulwark
- Showtime
- Fortune
- Bloodrite
- Riposte
- Flow Guard
- Aegis
- Phase Step
- Backfire
- Crater
- Aerial Rave
- Seismic Slam
- Detonate
- Adrenaline
- Tempest
- Phantom Dash
- Slipstream
- Berserker
- Last Stand
- Tempo
- Backlash
- Cinder Trail
- Concussive Dash

Aerial Rave remains swing damage. Riftlock still has full bayonet swings, so it remains useful without redefining shots as swings.

## On-hit Specials

- **Rupture:** Every valid cutting hit emits `onHit`; Razor Rounds are cutting projectiles.
- **Sunder:** Every valid hit emits `onHit`.
- **Overrun:** First-player-damage and death timing remain weapon-neutral.
- **Sever:** Perfect-Parry source ownership remains weapon-neutral.

## Universal throw upgrades

| Upgrade | Sword | Hammer | Greatsword | Chainblade | Riftlock |
|---|---|---|---|---|---|
| Overdrive | Threadcut interactions | Meteor resolve | Wheel interactions | Hook/collision/release | Loose Cannon body/remote shot/Backblast interactions |
| Second Pass | Threadcut recall | Return | Edge-first return | Sling release/return | Backblast Round and return bayonet |
| Remote Link | Recall/control range | Recall range | Wheel route/recall | Hook radius/duration | Remote distance/duration |
| Redirect | One route correction | One route correction | One Wheel correction | Redirected release/destination | One Loose Cannon correction |
| Capture | Thread/pin | Burial/stagger | Knockdown/pin | Stronger Hook | Lodged thrown bayonet |
| Collapse | Return path pull | Inward return shock | Return cleave pull | Release/return pull | Backblast return-path pull |
| Stormbank | First valid throw resolve | Same | Same | Same | Same; one discharge per `throwId` |

## Greatblade upgrade naming collision

The existing **Greatblade** upgrade still enlarges the thrown weapon. It remains separate from the **Greatsword** weapon.

- Visible and collision geometry scale together.
- Held size stays unchanged.
- No hidden additional effect.
- A Greatsword becoming especially large is the unchanged upgrade working normally.

A copy-only rename can be considered later, but its mechanic must not change during this work.

---

# 14. Event classification

| Action | onHit | onSwingHit | onThrowResolve | onThrowSecondary | onReturnHit | onWeaponCatch |
|---|---:|---:|---:|---:|---:|---:|
| Sword held/Reversal | Yes | Yes | No | No | No | No |
| Sword outgoing Thread | Yes | No | Yes | No | No | No |
| Threadcut return | Yes | No | Route interaction | Yes | Yes | No |
| Hammer held | Yes | Yes | No | No | No | No |
| Meteor | Yes | No | Yes | No | No | No |
| Hammer return | Yes | No | Route interaction | Yes | Yes | No |
| Greatsword held | Yes | Yes | No | No | No | No |
| Wheel outbound | Yes | No | Yes | No | No | No |
| Greatsword return | Yes | No | Route interaction | Yes | Yes | No |
| Chainblade held | Yes | Yes | No | No | No | No |
| Hook impact | Yes | No | Yes | No | No | No |
| Hooked-target collision | Yes | No | Route interaction | No | No | No |
| Sling release/return | As damage occurs | No | Route interaction | Yes | Return head only | No |
| Riftlock bayonet | Yes | Yes | No | No | No | No |
| Held Razor Round | Yes | No | No | No | No | No |
| Loose Cannon body | Yes | No | Yes | No | No | No |
| Remote Razor Round | Yes | No | Yes | No | No | No |
| Backblast Round | Yes | No | Route interaction | Yes | No | No |
| Returning bayonet | Yes | No | Route interaction | Yes | Yes | No |
| Catch | No | No | No | No | No | Yes |

Events must be idempotent.

---

# 15. Rendering and accessibility

## Geometry delegation

Recommended:

```js
weapon.geometry(blade, state)
weapon.drawHeld(ctx, blade, player)
weapon.drawThrown(ctx, blade, player)
weapon.drawTrail(ctx, blade)
```

Geometry should expose explicit damage and guard primitives.

## Low graphics may reduce

- Particles
- Glow
- Trail samples
- Chamber fragments
- Chain-link detail
- Greatsword afterimages

It may not remove Reversal direction, hook line, Riftlock chambers, remote barrel direction, or actual edge visibility.

## High contrast adds

- Strong outlines
- Patterned Reversal mark
- Alternating Chainblade tether pattern
- Shape-based chamber indicators
- Strong remote muzzle line
- Greatsword edge highlight

## Reduced motion

May reduce screen shake, particles, camera punch, and decorative oscillation. It must not alter gameplay physics or timing.

---

# 16. Audio plan

- **Sword:** thin swing, crisp Reversal snap, Thread tick, layered Threadcut return.
- **Hammer:** deep whoosh, low impact, armor crack, Meteor descent, seismic hit.
- **Greatsword:** broad wind, one coalesced multi-target cleave swell, Wheel rotation, edge-first return.
- **Chainblade:** compact cleaver, link extension, hook, tension, collision, release, rewind.
- **Riftlock:** chamber click, Razor crack, recoil mechanism, remote shot, Backblast, cylinder lock.

Respect voice caps and same-frame coalescing.

---

# 17. Chassis targets

Initial identity targets only:

| Weapon | Move speed | Air control | Knockback taken | Thrown-state movement |
|---|---:|---:|---:|---:|
| Sword | 100% | 100% | 100% | 115% |
| Hammer | 96% | 92% | 75% | 125% |
| Greatsword | 97–99% | 94–98% | 82–90% | 118–122% |
| Chainblade | 99–101% | 98–102% | 88–96% | Hook-state dependent |
| Riftlock | 100–103% | 102–108% | 100–108% | 112–118% plus bounded recoil |

Every platform and boss avoidance route must remain viable.

---

# 18. Enemy, boss, and mode rules

## Generic control resistance

Prefer shared hooks:

```js
boss.resolveControlEffect(effect)
boss.canBeHooked(context)
boss.canBeCaptured(context)
```

Avoid scattered boss-name checks.

## Phase transitions must

- Clear invalid Sword Threads
- Break Chainblade hook safely
- Clear Riftlock Capture
- Preserve/recall thrown weapon
- Clear Greatsword route targets
- Prevent Hammer impact duplication

## Wraith

- Held direct weapon-body contact follows existing immunity.
- Thrown weapons remain valid.
- Deflected projectiles remain valid.
- Riftlock Razor Rounds are valid cutting weapon projectiles.

## Echo/Mirror

Use shared weapon hooks through an input-provider abstraction:

```js
{
  aimVector,
  tetherPressed,
  tetherHeld,
  tetherReleased,
  throwPressed,
}
```

The Echo must not receive infinite Riftlock chambers or unrestricted Chainblade fling control.

## Source theft

Every weapon needs bounded hostile behavior and guaranteed reclaim. Riftlock may fire clearly telegraphed stolen Razor Rounds whose recoil moves the stolen gun.

## Playground

Must expose controls for:

- Reversal prime/exit
- Hammer Break
- Greatsword formation
- Chainblade target mass and hook state
- Riftlock chambers, remote state, and Backblast
- All universal throw upgrades

---

# 19. Telemetry

Track universal metrics plus:

### Sword

- Reversal primes
- Exit success
- Reversal completions
- Invalid same-swing attempts
- Threaded/visited targets

### Hammer

- Break events
- Meteor commitment
- Empty impacts
- Return targets

### Greatsword

- Targets per swing
- Momentum retained
- Stop resistance class
- Wheel outbound/return hits

### Chainblade

- Hook rate
- Swing duration
- Radius changes
- Release speed
- Collision hits
- Heavy-anchor use
- Boss-link breaks

### Riftlock

- Shot accuracy
- Chambers reformed by each source
- Recoil Cuts
- Remote shots/body hits
- Backblast hits
- Time empty
- Aerial recoil distance

Telemetry informs later review. It does not automatically nerf abilities.

---

# 20. Files and systems touched

## `js/weapons.js`

- Final registry/order
- Removed-ID migration
- Sword redesign
- Hammer preservation
- Greatsword
- Chainblade rebuild
- Riftlock
- Metadata and channels

## `js/blade.js`

- `swingId` and attack IDs
- Remove active Spear/Ringblade state dependence
- Sword Thread route
- Greatsword cleave/throw state
- Chainblade hook/swing state
- Riftlock chambers/recoil/remote state
- Geometry delegation
- Snapshot/restore
- Generalized action range

## `js/config.js`

Add:

```text
CONFIG.weapons.sword
CONFIG.weapons.hammer
CONFIG.weapons.greatsword
CONFIG.weapons.chainblade
CONFIG.weapons.riftlock
```

Archive old Spear/Ringblade tuning only after migration safety is proven.

## `js/player.js`

- Bounded recoil
- Chainblade player-anchor movement
- Cleanup
- Universal navigation preservation

## `js/enemy.js`

- Reversal state
- Control resistance
- Chainblade collision ownership
- Riftlock Capture
- Wraith compatibility
- Greatsword collision resistance

## `js/projectile.js`

- `weaponProjectile` family
- Razor Round
- Remote throw identity
- Backblast Round
- Ownership and source

## `js/game.js`

- Weapon-specific tether input routing
- Damage/event classification
- Selection migration
- Prompts
- Playground
- Boss/mode integration
- Statistics
- Replay schema

## `js/upgrades.js`

Do not redesign upgrade mechanics. Only ensure generic event paths include the new weapons and remove obsolete comments/copy.

## `js/mirror.js`

- New roster AI
- Input provider
- Safety rules

## `js/audio.js`, `js/ui.js`, `js/particles.js`

- New SFX/VFX/cards/prompts/HUD

## `js/achievements.js`

- Keep five-weapon mastery goal
- Preserve legacy stats
- Add new achievements only when hooks exist

## `tests/weapon-overhaul.test.js`

Replace old roster expectations.

## `tests/browser-smoke.js`

Boot all five weapons.

## `index.html` / `sw.js`

Update script load order and cache version if new modules are added.

## CrazyGames package

Verify actual submission archive includes all new scripts and boots in iframe.

## Wiki

Archive old roster pages and publish the final five, controls, upgrade compatibility, and visual descriptions.

---

# 21. Source organization

Do not split files before behavior works.

Initial work may stay in:

```text
js/weapons.js
js/blade.js
```

If stable code grows too large, split through `registerWeapon({...})`:

```text
js/weapon-sword.js
js/weapon-hammer.js
js/weapon-greatsword.js
js/weapon-chainblade.js
js/weapon-riftlock.js
```

Do not combine this with an unrelated module-system migration.

---

# 22. Codex execution protocol

## Branch

Use a short-lived `codex/<ticket>-final-five` branch created from protected
canonical `main`. Do not mix biome implementation or recovery WIP into it. The
historical `codex/final-five-weapon-roster` name is retained only as provenance
and is not a live development target.

## Checklist rule

A task may be checked only when code, tests, and relevant browser evidence exist.

## Stop conditions

Stop and report rather than guess when:

- A required upgrade cannot remain unchanged.
- A replay migration would silently corrupt old runs.
- A boss can be permanently controlled.
- A route cannot guarantee return to `held`.
- Chainblade creates non-deterministic collision explosions.
- Riftlock remote fire loses ownership.
- Greatsword visual and collision geometry disagree.
- Sword Reversal activates passively.
- PWA or CrazyGames cannot package new scripts safely.

---

# 23. Master implementation checklist

## Phase 0 — Baseline and safety

- [ ] Fetch and verify clean worktree.
- [ ] Confirm baseline SHA.
- [ ] Create dedicated branch/worktree.
- [ ] Save current weapon test output.
- [ ] Save current PWA and CrazyGames boot evidence.
- [ ] Record save/replay weapon schema.
- [ ] Commit this plan.

### Gate

- [ ] No gameplay behavior changed.
- [ ] Existing tests pass.

## Phase 1 — Roster v2 architecture

- [ ] Add final IDs/order.
- [ ] Add selection migration.
- [ ] Preserve legacy stats.
- [ ] Add weapon schema version.
- [ ] Add explicit legacy replay handling.
- [ ] Add `swingId`.
- [ ] Add `attackId` helpers.
- [ ] Audit `throwId` lifecycle.
- [ ] Generalize action range/state logic.
- [ ] Add reset/cleanup/snapshot fields.
- [ ] Add player/Echo input provider.
- [ ] Update roster tests.

### Gate

- [ ] Sword/Hammer baseline unchanged.
- [ ] Removed IDs cannot crash.
- [ ] Browser smoke passes.

## Phase 2 — Sword

- [ ] Remove True Cut damage mechanic.
- [ ] Remove held Seam dependency.
- [ ] Add Reversal prime.
- [ ] Add exit requirement.
- [ ] Add opposite-direction test.
- [ ] Require separate `swingId`.
- [ ] Add expiration and visual mark.
- [ ] Add Perfect-Parry prime.
- [ ] Add Thread target list.
- [ ] Add reverse-order recall route.
- [ ] Add bounded steering and skip invalid targets.
- [ ] Add Redirect, Second Pass, Collapse, Stormbank.
- [ ] Guarantee catch.

### Gate

- [ ] Ordinary same-direction swings never trigger Reversal.
- [ ] Jitter never triggers Reversal.
- [ ] Sword is good without Reversal.
- [ ] Threadcut always returns.

## Phase 3 — Hammer parity

- [ ] Verify Break.
- [ ] Verify Meteor.
- [ ] Replace old roster assumptions.
- [ ] Verify all universal upgrades.
- [ ] Verify Mirror/Source.
- [ ] Confirm no regression.

## Phase 4 — Greatsword

- [ ] Add model and broad geometry.
- [ ] Add hilt weak zone.
- [ ] Add target resistance classes.
- [ ] Add momentum retention.
- [ ] Add per-swing dedupe.
- [ ] Coalesce multi-target hit-stop.
- [ ] Add Wheel Cut outbound.
- [ ] Add embed/route budget.
- [ ] Add edge-first return.
- [ ] Add universal throw upgrades.
- [ ] Guarantee catch.

### Gate

- [ ] Feels like a large blade, not Hammer.
- [ ] One cut passes through a light formation.
- [ ] Heavy/armor stop it.
- [ ] No infinite multi-hit.

## Phase 5 — Chainblade

- [ ] Remove Tension damage tax.
- [ ] Implement responsive compact form.
- [ ] Implement physical Lash extension.
- [ ] Define head versus chain collision.
- [ ] Add Hook target eligibility.
- [ ] Add miss auto-return.
- [ ] Add angular control.
- [ ] Add mass resistance.
- [ ] Add tether radius tightening.
- [ ] Add collision damage and dedupe.
- [ ] Add tangential release.
- [ ] Add heavy-anchor behavior.
- [ ] Add boss behavior.
- [ ] Add cleanup.
- [ ] Add universal upgrades.
- [ ] Guarantee catch.

### Gate

- [ ] Compact held combat is immediately responsive.
- [ ] Release direction matches tangent.
- [ ] Bosses cannot be puppeteered.
- [ ] No collision loop.

## Phase 6 — Riftlock

- [ ] Add gunblade geometry and muzzle.
- [ ] Add chamber visuals.
- [ ] Route tether press to Fire.
- [ ] Add four chambers.
- [ ] Add Razor Round family and ownership.
- [ ] Add weapon recoil.
- [ ] Add bounded player recoil.
- [ ] Add Recoil Cut.
- [ ] Add passive reform.
- [ ] Add Chamber Cut once per `swingId`.
- [ ] Add Perfect-Parry and catch refill.
- [ ] Add Wraith compatibility.
- [ ] Add Loose Cannon.
- [ ] Add remote aim and Fire.
- [ ] Add remote shot/body attack IDs.
- [ ] Add Backblast return chamber.
- [ ] Add Return Round and bayonet return.
- [ ] Add Capture and universal throw upgrades.
- [ ] Guarantee recall at zero offensive chambers.

### Gate

- [ ] Gun is genuinely ranged.
- [ ] Bayonet is complete melee weapon.
- [ ] Recoil physically changes motion.
- [ ] Remote control comes from firing, not free steering.
- [ ] No per-weapon ability nerf exists.

## Phase 7 — Upgrade matrix

- [ ] Test every stackable upgrade.
- [ ] Test every resilience upgrade.
- [ ] Test every mobility upgrade.
- [ ] Test every offense Special.
- [ ] Test every parry Special.
- [ ] Test every throw Special.
- [ ] Test Stormbank, Overrun, Sever.
- [ ] Test Greatblade geometry.
- [ ] Confirm no silent no-op.
- [ ] Confirm no weapon-specific ability reduction.

## Phase 8 — Modes, bosses, persistence

- [ ] Adventure
- [ ] Endless
- [ ] Gauntlet
- [ ] Playground
- [ ] Tutorial
- [ ] Boss Test
- [ ] Enemy Test
- [ ] Every boss
- [ ] Echo/Mirror
- [ ] Source theft
- [ ] Wraith
- [ ] Save migration
- [ ] Pending finale
- [ ] Ghost capture
- [ ] Replay message
- [ ] Cloud sync
- [ ] Statistics/achievements

## Phase 9 — Presentation and packaging

- [ ] Final weapon cards and prompts.
- [ ] Final SFX/VFX.
- [ ] Accessibility.
- [ ] Controller glyphs and touch prompts.
- [ ] Codex and wiki.
- [ ] Archive old roster docs.
- [ ] Service-worker cache bump.
- [ ] PWA offline boot.
- [ ] CrazyGames archive boot.
- [ ] JS syntax checks.
- [ ] Clean working tree.

---

# 24. Automated QA matrix

## Every weapon

- [ ] Equip/reset
- [ ] Low/high-speed held contact
- [ ] Launch
- [ ] Slam and Power Slam
- [ ] Deflect and Perfect Parry
- [ ] Throw, secondary, return, catch
- [ ] World, armor, boss, Wraith
- [ ] Death and pause/resume
- [ ] Stage and boss transition
- [ ] Weapon theft/reclaim
- [ ] Mouse, controller, touch
- [ ] Low graphics, reduced motion, high contrast

## Sword

- [ ] Prime
- [ ] Exit required
- [ ] Separate swing required
- [ ] Opposite direction required
- [ ] Expiration
- [ ] Perfect-Parry prime
- [ ] Thread reverse order
- [ ] Dead-target skip
- [ ] Catch

## Hammer

- [ ] Commitment
- [ ] Break
- [ ] One Meteor impact
- [ ] Shockwave
- [ ] Return cap
- [ ] Catch

## Greatsword

- [ ] Resistance classes
- [ ] Momentum retention
- [ ] Per-swing dedupe
- [ ] Multi-target hit-stop
- [ ] Wheel outbound/embed/return
- [ ] Catch

## Chainblade

- [ ] Compact response
- [ ] Lash
- [ ] Hook hit/miss
- [ ] Angular control
- [ ] Tether tighten
- [ ] Tangential release
- [ ] Collision dedupe
- [ ] Heavy/boss anchor
- [ ] Cleanup and catch

## Riftlock

- [ ] Four chambers
- [ ] Fire edge
- [ ] Held-shot classification
- [ ] Weapon/player recoil
- [ ] Recoil Cut
- [ ] Passive/Chamber Cut/parry/catch reform
- [ ] Zero-chamber melee
- [ ] Loose Cannon
- [ ] Remote aim/fire
- [ ] Dual-interaction dedupe
- [ ] Backblast at zero chambers
- [ ] Wraith and catch

---

# 25. Acceptance criteria

The redesign is complete when:

1. True Cut is removed as a passive Sword damage mechanic.
2. Reversal requires two separate opposite-direction contacts and target exit.
3. Normal Sword hits remain complete.
4. Hammer retains its accepted satisfaction.
5. Greatsword cuts through formations without becoming Hammer.
6. Chainblade compact combat is responsive.
7. Hook & Sling provides mouse-driven angular control and tangential release.
8. Heavy enemies and bosses cannot be freely puppeteered.
9. Riftlock is a genuine ranged gun.
10. Riftlock bayonet remains full Tear melee.
11. Recoil physically changes gunblade and player motion.
12. Loose Cannon is piloted through remote firing and recoil.
13. Backblast recalls at zero offensive chambers.
14. Every upgrade remains useful with every weapon.
15. No per-weapon ability nerfs exist.
16. Stormbank, Overrun, and Sever retain normal behavior.
17. Every route uses one stable `throwId` and returns to `held`.
18. Old selected IDs migrate safely.
19. Legacy replay incompatibility is honest.
20. Mouse, controller, touch, accessibility, PWA, and CrazyGames all pass.

---

# 26. Final design statement

The roster is five different physical relationships with one combat system:

- The **Sword** asks the player to reverse.
- The **Hammer** asks the player to commit.
- The **Greatsword** asks the player to follow through.
- The **Chainblade** asks the player to build and release rotation.
- The **Riftlock** asks the player to weaponize recoil.

Every weapon is fully playable before an upgrade is drafted.

Every upgrade remains itself.

The system succeeds when selecting a weapon changes how the player moves the mouse, reads space, builds momentum, and resolves a throw—not merely how much damage appears over an enemy.
