# TearBench → C40 Execution Guide

**This file is the working discipline, not the scope.** Scope lives in
[`TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md`](TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md)
(goals, deliverables, exit gates per checkpoint) and in
[`../docs/tearbench-ghost3-requirements.json`](../docs/tearbench-ghost3-requirements.json)
(8,691 atomic requirements). Read
[`TEARBENCH_MASTER_HANDOFF.md`](TEARBENCH_MASTER_HANDOFF.md) first for the
current boundary.

This file answers a different question: **how do you work so that the program
actually reaches C40 instead of accumulating impressive-looking code that
nothing calls?**

---

## 1. The goal, stated so it can fail

> `pnpm check` passes on a clean tree, `pnpm tearbench certify --commit <sha>
> --full-check passed` produces a certification artifact, and every required
> atomic requirement in the registry carries evidence at or above the level its
> checkpoint demands — or an explicit, authorized `deferred`/`rejected`
> disposition with a reason.

Anything short of that is not C40. Progress is measured by checkpoint exit gates
in the completion plan and the §8 checklists — never by registry counts.

---

## 2. The slice loop — the only permitted unit of work

Never start work that is not a slice. A slice is one coherent change that ends
with the tree green and committed.

1. **Read the boundary.** `TEARBENCH_MASTER_HANDOFF.md` §"Exact next slice",
   then the active checkpoint report. Do not re-derive the plan.
2. **State the slice contract out loud** before editing, in two sentences:
   what this slice will make true, and what it explicitly will *not* claim.
3. **Query the registry** for the requirements this slice touches, and read
   their original source context — not a summary.
4. **Implement the narrowest change** that makes the contract true.
5. **Write the smallest test that would fail without it.** If you cannot write
   a test that fails first, you do not understand the change yet.
6. **Run the smallest canonical gate** (§6 table), then any gate whose
   evidence your change could invalidate.
7. **Update docs in the same slice**: the checkpoint report, the architecture
   alignment doc if a boundary moved, and both handoffs. Never batch
   documentation for "the end".
8. **Commit and push.** One slice, one commit, message states what is proven
   and what is not.
9. **Write the next boundary** into the handoff before you stop.

If a slice cannot finish green, revert it. A half-slice left in the tree costs
the next agent more than it saved you.

---

## 3. Evidence law

### 3.1 Levels, and what may claim them

| Level | Means | Minimum proof |
|---|---|---|
| `missing` | nothing | — |
| `contract` | types/interfaces exist | compiles |
| `prototype` | logic exists, unit-tested | unit test |
| `integrated` | the running app calls it | a non-test consumer + a gate that exercises it |
| `visible` | a player can see/reach it in a normal build | browser journey screenshot/DOM proof |
| `certified` | C40 release validation covered it | certification artifact |

**Promotion is one level at a time and only with the proof in that row.** A
foundation gate never promotes a checkpoint. A Class A hook never proves
Class C. A green subset gate is not a release claim.

### 3.2 The capability test — apply before writing "works" anywhere

A module is **not** a capability until all three hold:

```bash
# 1. something outside its own folder imports it
grep -rl "ghost/theater" src --include=*.ts | grep -v "^src/ghost/"
# 2. a gate exercises that path
# 3. for player features: it survives in the production bundle
grep -o "Ghost Lab" dist/standalone/assets/*.js
```

As of this writing these modules exist, compile, and some have unit tests, but
**zero consumers outside their own folder** — they are C0–C20 scaffolds, not
capabilities:

`ghost/replay-world` · `ghost/theater` · `ghost/coach` · `ghost/ghost-doctor` ·
`ghost/knowledge-libraries` · `ghost/cloud-publication` ·
`ghost/player-experiences` · `ghost/truth-kernel` · `agents/academy` ·
`agents/ladder-foundry` · `agents/journey-director` ·
`agents/hierarchical-policy-adapter`

Rewriting one of these files is not progress. **Wiring one to the running
product, with a gate, is.**

### 3.3 Forbidden moves

These have all been attempted on this program before. Each is a lie in code.

- Narrowing a scenario, shortening a window, or dropping a field from a
  projection so a comparison passes.
- Restating a production rule inside a test harness instead of calling the
  production function. Every such restatement has eventually diverged.
- Widening a tolerance instead of fixing a divergence.
- Marking a requirement done because a file exists.
- Claiming a checkpoint from its `:foundation` gate.
- Deleting or silently rescoping a requirement. Use `deferred`/`rejected` with
  a reason instead.
- Citing registry counts as progress or as a remaining-work estimate.
- Mapping registry fragments to existing code merely to move a counter.

### 3.4 Divergence protocol

When a comparison fails: **the world is wrong until proven otherwise.**

1. Diagnose to a named field and tick, not "something differs".
2. Decide: production defect, or harness restating a rule?
3. Fix the production defect by moving the canonical routine into shared
   gameplay code, or delete the restated rule from the harness.
4. If it genuinely cannot be fixed this slice, record it in the comparison's
   `KNOWN_DIVERGENCES` with its cause, and **assert that it still diverges** so
   the entry cannot rot after a fix.

This protocol has already produced five product-level fixes: `planBossPlacement`,
`beginBossEncounter`, the State Forge `$map` codec, `mirror-combat-feedback`,
and the cinematic timeline move. That is the loop working.

### 3.5 Registry counts are not progress

`docs/tearbench-ghost3-requirements.json` is a non-lossy traceability index,
not a work breakdown: it keeps design intent from being silently dropped, and
`pnpm requirements:check` must continue to report `unmappedSourceLines: 0`.
The generator split the 13,725-line source into 8,691 sentence/clause atoms
from 6,933 source occurrences; 5,457 atoms (63%) contain three words or fewer,
1,200 are marked duplicates, and 1,806 are non-normative. The C28 entries
`repair` and `quarantine`, for example, are fragments of the same original
bullet list as `IndexedDB storage`, `Vault health`, `crash journal`, and
`export` — not independent deliverables.

Therefore counts such as `missing`, `integrated`, or `certified` are neither a
progress meter nor a forecast. A checkpoint clears only when its completion-plan
exit gate and checklist evidence pass. When that happens, many related fragments
may legitimately move together because they were pieces of the same paragraph;
that is traceability, not incremental implementation progress.

---

## 4. Anti-loop rules

Agents waste turns in predictable ways. These are hard limits.

- **Two-attempt rule.** Two failed attempts at the same fix → stop, write the
  finding into the checkpoint report, move to the next independent item. Do not
  attempt a third variation of the same idea.
- **No re-exploration.** If the handoff names the next slice, start there.
  Re-reading the whole plan to "get oriented" is not work.
- **No speculative refactors.** Do not clean, rename, or restructure code that
  the current slice does not require.
- **No new abstraction without a second caller.** Ports invented for a diagram
  are forbidden; the alignment doc says so explicitly.
- **No parallel implementations, ever.** No second combat host, scheduler,
  replay runtime, or headless simulator. Reuse the production composition.
- **No re-running green gates to feel safe.** Run a gate when your change could
  have broken it, or when a claim depends on it.
- **No documentation-only turns** unless the slice was a documentation slice.
  Docs are updated *with* the code, in the same commit.
- **Do not run `pnpm requirements:generate` casually.** Inspect any generated
  diff before committing it.

**Loop smell:** if your last three actions were reads and no file changed, you
are looping. Pick the next checklist item and edit something.

---

## 5. Pause protocol — every 3 slices, or when a checkpoint closes

Run the probe, then write exactly five lines into the active checkpoint report.

```bash
pnpm requirements:check | tail -3
git log --oneline -5
pnpm test 2>&1 | grep -E "Test Files|Tests"
```

Then write:

```text
DONE THIS STEP:      <what is now true that was not>
PROVEN BY:           <gate + counts, or "not proven">
REMAINING HERE:      <what is left in this checkpoint>
REMAINING TO C40:    <checkpoints not started>
NEXT SLICE:          <one sentence, actionable without this conversation>
```

Every line must cite checkpoint checklist items and gate results, never registry
counts.

If `DONE THIS STEP` is empty for two consecutive pauses, stop and escalate to
the user — the approach is wrong, not the effort.

---

## 6. Gate reference

| Scope | Command | What it proves |
|---|---|---|
| Requirements | `pnpm requirements:check` | nothing from the source was dropped — a guard, not a progress measure |
| Boundaries | `pnpm check:architecture` | dependency direction, planted violations rejected |
| Unit suite | `pnpm test` | whole-repo regression |
| State Forge | `pnpm check:c23` | codecs, restore, Studio, exit matrix |
| Scripted agent | `pnpm check:c24` | Class A autonomy |
| Class C | `pnpm check:c25:foundation` | physical-input foundation (**not** the exit) |
| Regression | `pnpm check:c26` | investigate/minimize/bisect/graveyard + planted regression |
| Recorder | `pnpm check:c27:foundation` | V3 capsules + 7 browser proofs |
| Shared world | `pnpm check:c27a:foundation` | parity matrix + Class-C browser proof |
| Release | `pnpm check` | the only gate that may support a release claim |

---

## 7. The route to C40

Strict dependencies first. **C27A blocks C29, C30, and C31–C36 completion
claims.** Do not develop learning on a simplified simulator.

```text
C27A ──► C27 ──► C28 ──► C29 ──► C30 ──┐
  │                                     ├──► C31 ─► C32 ─► C33 ─► C34 ─► C35 ─► C36 ──► C37 ─► C38 ─► C39 ─► C40
C25 ──────────────────────────────────┘
```

C25's exit is independent of C27A and may be closed in parallel when C27A is
blocked on something else.

---

## 8. Checkpoint checklists

Each item is a falsifiable statement. Tick it only when its proof exists.
These are entry conditions to the checkpoint's exit gate in the completion
plan — they do not replace it.

### C27A — Shared world architecture *(active, blocking)*

- [x] Every mutable world service is per-world (clock, RNG, particles, boss feedback, entity constructors)
- [x] Architecture gate rejects a reintroduced shared instance (planted-violation proof)
- [x] One call builds one world (`createLiveWorldComposition`)
- [x] A detached world runs both production combat phases
- [x] Live↔detached fixed-tick parity across a 13-scenario matrix, every executed tick
- [x] Campaign parity: world owns a cinematic director instance
- [x] Campaign parity: State Forge captures active director position and a content-fingerprinted data-only chapter binding, with canonical inactive migration, input re-arm, rollback, validated cross-session reconstruction/continuation, and fail-closed legacy-active rejection
- [x] Campaign parity: chapter scripts a detached world needs are constructible without app callbacks through explicit gameplay ports
- [x] `KNOWN_DIVERGENCES` is empty
- [ ] Outward effect streams are compared, not merely recorded (the seven
  finale intent batches, 22 post-return adapter calls, six concrete ring/burst
  admission receipts, and eight logical zoom/flash/shake receipts now match
  exactly; audio dispatch is now observed but seven mix requests are
  logical-target-only and all finale cues are voice-cap-rejected, while rendered
  pixels, successful audio graph/PCM/device output, haptics, durable external
  outcome effects, and persistence/cloud/replay/analytics output remain open)
- [x] A natural wave/reward boundary crossing is in the matrix
- [x] A real campaign win outcome is in the matrix (certified reconstructed
  wave-49 frontier + production wave-50 transition + explicit one-hit Source
  State Forge child; not a claim of naturally playing all 50 waves)
- [ ] Portable core has zero `src/app`, DOM/Canvas, or Ghost 2 imports (gate-enforced)
- [ ] Affected C22–C27 gates rerun green from one worktree

**Exit:** the alignment doc's exit gate, with the parity corpus green and no
recorded divergence.

Current Slice 40 boundary: the refreshed 13-scenario corpus contains 5,732
fixed ticks and 33 native facts (14 in the natural route, including three
enemy defeats). A portable finale runtime and Class-A application-frame API
carry the certified Source-victory route through live and detached hosts, and
all seven finale intent batches compare exactly before adaptation. A portable
immutable `FinaleOutwardCall` journal records only after each concrete adapter
returns; the real Source-victory route matches all 22 live/detached calls in
exact order and arguments across world zoom, FX requests, feel/haptic requests,
sound cues, and mixer requests. Live collection is test-build-only and Class-A
only. Detached combat clear also clears `bossIntro` and `bossBeat`, matching
live with planted regression coverage.

Slice 37 makes two previously unproved concrete boundaries observable without
claiming their renderer/device internals. Every finale ring and burst now returns
an immutable `ParticleEmissionReceipt` containing `accepted`, `requested`,
`emitted`, separate cull/budget rejections, and `listDelta`. The real
1,176-transition Source victory has six such calls (three ring/burst pairs),
and live and detached receipts match exactly. This proves renderer-independent
particle admission only: it excludes random particle fields and rendered pixels.
The detached origin restores captured feel/impact transient state before the
finale. Its two world-zoom and six flash/shake calls likewise match exact logical
receipts: zoom's before/after current and target state, plus flash/shake
before/after values under the real maximum aggregation rule. It proves logical
feel state and transient restoration, not screen pixels, audio scheduling/PCM or
audio graph/device output, physical haptics, or a complete
outcome/progression/cloud-effect chronology. `pnpm check:c27a:slice37` passes
its 1 file / 5 tests; the focused campaign-victory unit portion currently passes
10 files / 36 tests. The complete `pnpm check:c27a` gate also passed through
Slice 40: foundation 36 files / 128 tests, the 13-scenario / 5,732-tick /
33-native-fact browser corpus, 40 detached comparator tests, a campaign-victory
subgate covering 10 files / 36 tests, the 1,176-transition browser route, one
detached finale-parity test, Slice 37's 1 file / 5 tests, Slice 38's 7 files /
18 tests, and Slice 39's 4 files / 10 tests. The affected same-worktree sweep
is green: the C22 live-runtime browser proof and C23 through C27 package gates
passed. Slice 39 commit `30c4877` is pushed to
`origin/codex/ghost3-autonomous-completion-plan`; Slice 40 is ready to commit
and not yet pushed.

Slice 38 adds a data-only audio dispatch journal and a typed in-memory outcome
chronology. In a refreshed 1,176-transition browser Source victory, explicit
audio-context activation yielded 12 `executing` records and 12 matching
`completed` records. The active primary TearScore backend makes all seven finale
mix requests `logical-target-only`: their logical target changes are observable,
not successful graph automation. Finale cues reach the `environment` route under
a running context, but every cue is `voice-cap-rejected` (silence 1 attempted /
0 accepted; three cuts each 3 / 0; restore 4 / 0). This provides software
scheduling outcomes that rule out a successful-scheduling claim for this run;
it does not prove audibility, PCM, audio graph or speaker/device output, or any
production audio result. The live test bridge and detached world both collect an
immutable in-memory terminal/finale ordering receipt. Exact live/detached
outcome parity was still open because external adapter inputs and return values
were not modeled.

Slice 39 closes that bounded gap: the browser artifact records exactly 42
monotonic terminal external-decision entries (13 initial synchronization
terminal decision/request, 22 finale-outward, and 7 cache/terminal). Detached
consumes captured synchronous score-newness, award/wallet, consistent
achievement policy, telemetry, victory intents, best, pending-finale request,
and presentation inputs, and matches the full journal exactly. This does not
prove durable profile persistence or local-storage survival, cloud/replay/
analytics completion, pixels, audio-device, or platform-device output. Slice 40
follows with the portable simulation-factory boundary.

Slice 40 extracts the portable
`src/gameplay/runtime/tear-world-simulation-factories.ts` factory boundary. It
has no app, presentation, or browser import; architecture checks fence that
invariant. The live app renderer adapter supplies its real Canvas ports and the
detached composition supplies explicit no-op ports. This is not a pixel,
headless, full-world, or configuration-isolation claim. Next: generic world
bootstrap, then configuration isolation; that isolation still blocks truly
simultaneous full worlds.

### C27 — Authoritative recorder and capsule

#### Slice 58 update (current)

Slice 41 completes the bounded **simulation tuning isolation** step. Before any
world consumer captures configuration, the composition root creates one stable
`TearWorldConfiguration`. Its reset and restore reconcile the existing root and
nested records in place, after rejecting malformed cloneable snapshots; State
Forge captures that owned record and restores it through base reset, selected
weapon, detached codec hydration, and stable restore. Weapons, upgrades, stage
geometry, opening/collision/kill combat, cinematic timing, and tutorial ghost
physics receive explicit config. The architecture gate rejects direct, mixed,
or aliased global-config value imports in those modules. `pnpm check:c27a`
passed: foundation 36 files / 130 tests, the 13-scenario / 5,732-tick /
33-native-fact browser corpus and 40 detached comparisons, campaign victory 10
files / 36 tests and 1,176 transitions, and Slice 41 7 files / 53 tests.

Slice 41 did not yet isolate particle policy, Backdrop, renderer/UI, browser
input, audio, persistence, cloud, or any other app-level adapter; it did not
prove concurrent complete live worlds, headless/full-world portability, or
C27A completion. Particle-policy injection was the next prerequisite.

Slice 42 supplies that prerequisite. `createParticleSystem(policy)` receives
the constructed world's effect budgets and explicit graphics, accessibility,
and cosmetic-entropy adapters; the particle module no longer imports process
configuration or the cosmetic-random singleton. Live and detached composition
supply their policy explicitly. `pnpm check:c27a:slice42` passed its 5 focused
files / 20 tests and source-architecture gate, including two injected systems
with independent budgets, dynamic low-graphics admission, and independent
reduced-motion behavior. This is policy/data admission isolation only: it does
not prove per-world app preferences, pixels, Backdrop/renderer/UI/input/audio
isolation, concurrent full live worlds, headless/full-world portability, or
C27A completion. Its next follow-up was the data-only generic bootstrap for
config, clock, and named RNG while keeping presentation policy at the outer
adapter boundary.

Slice 43 supplies that data-only bootstrap. `createTearWorldBootstrap(base)`
returns fresh configuration, clock, and named RNG services before either live
or detached construction captures them. It imports no process configuration,
app, presentation, or browser surface; both construction paths now use it, and
the run lifecycle remains the authority that resets a seed. `pnpm
check:c27a:slice43` passed 6 focused files / 19 tests plus architecture. Fresh
foundation and campaign-victory gates also passed. This does not isolate the
process-global Backdrop, renderer/UI/input/audio/persistence, rendered output,
or complete live worlds. Next, replace Backdrop's global clock binding with an
explicit per-world presentation adapter/factory policy.

Slice 44 supplies that Backdrop policy. `createBackdrop(policy)` creates one
controller with its own cache and transient lighting, while receiving clock,
world config, graphics/accessibility, overscan/theme, Canvas creation, and
wall time explicitly. Neither Backdrop nor its biome art imports process
configuration, and the architecture gate rejects global Backdrop/clock return
paths. `pnpm check:c27a:slice44` passed 5 focused files / 17 tests plus
architecture; the physical browser proof now asserts meaningful changed Canvas
frames after movement, and one captured frame was inspected for readability
and viewport coverage. This proves controller ownership and rendering
continuity, not pixel parity, complete presentation isolation, concurrent full
live worlds, or C27A completion. Next, move cinematic rendering's global
presentation configuration behind an explicit per-world policy.

Slice 45 supplies that cinematic renderer policy without moving the shared
simulation timeline. `createCinematics(policy)` returns a renderer runtime for
one composition; its Canvas `Director` extends the unchanged
`CinematicTimeline.Director` and reads the explicit presentation timing only
when it draws dialogue. Live composition supplies the constructed world's
presentation record, and the app dependency contract exposes the resulting
`CinematicPresentationRuntime`. Source architecture rejects both a process
configuration import and a global `Cinematics` runtime; focused two-factory
evidence proves independent rendered advance timing. `pnpm check:c27a:slice45`
passed 5 focused files / 18 tests plus architecture, and fresh foundation and
campaign-victory gates passed.

This proves Canvas renderer timing-policy ownership only, not pixel parity,
complete UI/presentation isolation, concurrent full live worlds, or C27A
completion. Next, move the UI factory's direct process-configuration dependency
behind an explicit composition-supplied policy while preserving its current
behavior and the single shared gameplay timeline.

Slice 46 supplies that UI policy. `UiPresentationPolicy` projects only the
viewport, three palette roles, and overscan that Canvas UI chrome consumes;
composition supplies it to `createUi`, and UI contracts/tokens import no process
configuration even as types. Focused two-factory evidence proves distinct
viewport, palette, and overscan behavior, while source architecture rejects a
renewed config import. `pnpm check:c27a:slice46` passed 6 focused files / 21
tests plus architecture. The built navigation, progression, playground,
terminal, and cinematic-preference journeys and the six-scenario responsive
matrix passed; representative desktop and portrait captures were inspected.

This preserves UI behavior and styling; it is not a UI redesign, pixel parity,
complete presentation isolation, concurrent full live worlds, or C27A
completion. Next, move Attract's direct process-configuration type dependency
behind an explicit composition-supplied visual policy.

Slice 47 supplies that Attract policy. `AttractVisualPolicy` projects the
deferred menu renderer's viewport, world/blade values, palette, overscan,
dynamic graphics preference, and theme; composition supplies it and
`attract-runtime` imports no process configuration, even as types. Focused
two-controller evidence proves separate dimensions, ground/platform layout, and
palette-driven effects, and architecture rejects a renewed import. `pnpm
check:c27a:slice47` passed 7 focused files / 22 tests plus architecture. Built
navigation, progression, playground, terminal, and cinematic-preference journeys
and the six-scenario responsive matrix passed; a desktop menu capture was
inspected.

This is Attract visual-policy ownership only. It does not isolate its cosmetic
entropy, player/blade/particle dependencies, entity renderers, input, audio,
persistence, pixel parity, concurrent complete live worlds, or C27A completion.
Next, move the Blade, Mirror, and Projectile entity renderers' direct
process-configuration type dependencies behind narrow composition-supplied
rendering policies.

Slice 48 supplies those entity policies. Blade, Mirror, and Projectile Canvas
ports now receive only their required palette, ground geometry, and Blade trail
tuning from the live presentation adapter; none imports process configuration,
even as types. Direct Canvas-port evidence proves palette choices remain local
to independent renderer sets, and architecture rejects renewed imports. `pnpm
check:c27a:slice48` passed 8 focused files / 23 tests plus architecture. Built
journeys and the six-scenario responsive matrix passed; fresh foundation and
campaign-victory gates passed.

This is renderer-policy ownership only, not pixel parity, legacy enemy renderer
isolation, concurrent complete live worlds, or C27A completion. Next, move the
legacy enemy renderer family's broad presentation configuration behind a
structural policy.

Slice 49 supplies that exact legacy enemy policy. `EnemyPresentationPolicy`
contains only view/ground, rendered palette, and authored boss/telegraph values;
the live adapter supplies it and no broad gameplay-config type remains in the
presentation boundary. Direct two-runtime Colossus cinematic evidence proves
isolated palette use, and source architecture rejects the old broad type. `pnpm
check:c27a:slice49` passed 8 focused files / 24 tests plus architecture; built
journeys, fresh foundation, and campaign-victory gates passed.

This proves dependency ownership, not pixel parity, complete presentation
isolation, concurrent full live worlds, or C27A completion. Next, inject
Attract's module-global cosmetic entropy through its explicit visual policy.

Slice 50 supplies that entropy policy. `AttractVisualPolicy.random` is supplied
by composition with the existing cosmetic generator, and `attract-runtime` no
longer imports the singleton. Direct two-controller evidence proves that
separate injected streams produce separate initial foe populations; source
architecture rejects a restored singleton import. `pnpm check:c27a:slice50`
passed 8 focused files / 25 tests plus architecture; built journeys, fresh
foundation, campaign-victory, and the aggregate `pnpm check:c27a` gate passed.

This is cosmetic dependency ownership, not deterministic visual-sequence or
pixel parity, complete audio/input/persistence isolation, concurrent full live
worlds, or C27A completion. Next, make the module-global first-gesture audio
facade an explicit composition-owned adapter while retaining one browser audio
context and the existing dispatch-receipt behavior.

Slice 51 supplies that facade factory. `createLegacySynthFacade()` gives each
composition an independent activation bridge, queue, receipt journal, and
pending settings; it preserves browser-backed audio settings when test-only
general storage is isolated. Architecture rejects an exported facade singleton,
two-facade evidence proves local receipt identity, and the built browser audio
contract proves persisted mixer values, one context, and lifecycle behavior.
`pnpm check:c27a:slice51` passed 9 focused files / 26 tests plus architecture;
built audio and journeys, fresh foundation, campaign-victory, and the aggregate
`pnpm check:c27a` gate passed.

This is first-gesture facade ownership, not concrete audio-runtime/sequencer
isolation, concurrent audio graphs, audibility/device parity, concurrent full
worlds, or C27A completion. Next, make the concrete synthesized runtime and
sequencer composition-owned without creating another browser audio context.

Slice 52 supplies that concrete-runtime factory. `createLegacySynthRuntime()`
now creates the SFX proxy, synthesized voice/mixer state,
`LegacyMusicSequencer`, and live-audio compatibility state used by the facade
that loads it. Architecture rejects restored exported facade and concrete
runtime singletons, and direct two-runtime evidence proves logical mixer target
state remains local. `pnpm check:c27a:slice52` passed 9 focused files / 27 tests
plus architecture; built audio and journeys, fresh foundation,
campaign-victory, and the aggregate `pnpm check:c27a` gate passed while the
browser contract retained exactly one context.

This is logical concrete-runtime ownership, not concurrent active audio graphs,
audibility/device parity, concurrent complete worlds, or C27A completion. Next,
make the module-global browser audio-context handoff an explicit
composition-owned port while preserving one browser context and the existing
dispatch receipts.

Slice 53 supplies that context-handoff port. App composition constructs
`createBrowserAudioContextHandoff()` and passes it to the required facade
option; the facade supplies only its captured-context function to the concrete
live compatibility adapter. Captured state is private to each handoff, and
direct two-handoff evidence proves releasing one leaves another untouched.
Architecture rejects restored module-global captured state and a direct handoff
import in the live adapter. `pnpm check:c27a:slice53` passed 10 focused files /
28 tests plus architecture; built audio and journeys, fresh foundation,
campaign-victory, and the aggregate `pnpm check:c27a` gate passed while the
browser contract retained exactly one context.

This is one composition's context-handoff ownership, not concurrent audio
graphs, audible/device output, physical-input parity, concurrent complete
worlds, or C27A completion. Next, make the remaining browser input adapter
composition-owned without changing semantic input behavior.

Slice 54 supplies the narrow live browser-navigator port. App composition
supplies `browserNavigator` through `GameRuntimeDependencies`; frame
coordination receives it for cinematic gamepad observation and session settings
receives it for hardware capability checks. Source architecture rejects direct
ambient navigator use in both paths, while legacy input/gamepad factories and
the semantic buffer remain unchanged. `pnpm check:c27a:slice54` passed 8 focused
files / 30 tests plus architecture; built audio and journeys, canonical
physical-input trace, fresh foundation, campaign-victory, and the aggregate
`pnpm check:c27a` gate passed.

This is navigator-capability ownership only, not controller/haptic device
parity, changed semantic input, concurrent complete worlds, or C27A completion.
Next, make the live runtime's document/pointer-lock capability path explicit at
composition without changing input behavior.

Slice 55 supplies that document/window capability. App composition supplies
`browserDocument` and `browserWindow`; the live browser host uses them for its
viewport, pointer-lock, fullscreen, install, and query adapters, while frame
and screen paths receive the supplied document. Source architecture rejects
ambient document use in the migrated live paths. `pnpm check:c27a:slice55`
passed 6 focused files / 23 tests plus architecture; built audio and journeys,
canonical physical-input trace, fresh foundation, campaign-victory, and the
aggregate `pnpm check:c27a` gate passed.

This is browser document/window ownership only, not changed pointer-lock/input
behavior, physical-device parity, IndexedDB durability, concurrent complete
worlds, or C27A completion. Next, supply the Ghost V3 browser recorder's
IndexedDB capability from composition without changing persistence behavior.

Slice 56 supplies that capability. App composition passes `browserIndexedDb`
through `GameRuntimeDependencies`; live Ghost V3 recording and its test-build
capsule inspection helpers use the supplied factory. Source architecture
rejects direct `window.indexedDB` use in the live runtime. The focused gate
passed 6 files / 22 tests plus architecture; built browser audio and journeys,
fresh foundation, and campaign-victory gates pass.

This is dependency ownership only, not durability, quota, storage-pressure,
physical-device, concurrent-complete-world, or C27A completion evidence. Next,
route Ghost V3's browser test-query input through the already supplied window
capability without changing behavior or making a persistence claim.

Slice 57 supplies that query boundary. The test-only Ghost V3 storage-fault
option now reads `browserWindow.location.search`, and source architecture
rejects direct `window.location.search` use in the live runtime. The focused
gate passed 6 files / 22 tests plus architecture; the built browser
storage-fault journey retained injected-fault containment and reload recovery.

This is test-query capability ownership only, not production URL control,
persistence, durability, quota/device, concurrent-complete-world, or C27A
completion evidence. Next, move the test-build Ghost V3 inspector-global
installation through the supplied window capability without changing its
browser-test interface.

Slice 58 supplies that installation boundary. The existing
`__TEAR_GHOST_V3__` test-build inspector is defined on `browserWindow`, and
source architecture rejects restoring its direct ambient-window installation.
The focused gate passed 6 files / 22 tests plus architecture; the built Ghost
V3 live-capture/reload journey still reads the completed capsule after reload.

This is inspector-installation ownership only, not a browser-test API change,
persistence, durability, quota/device, concurrent-complete-world, or C27A
completion claim. Next, move inspector assembly into the browser adapter while
preserving the same test interface.

- [x] V3 recorder ships in the production bundle
- [x] Interruption, crash, corrupt-journal, storage-fault recovery proven in browser
- [ ] Versioned durable capsule contract with provenance, compatibility, integrity
- [ ] Measured real codecs and profiles against enforced storage/performance budgets
- [ ] Real quota/device/storage-pressure evidence (not simulated branches)
- [ ] Replay execution with seek, fork, practice, export/import, migration
- [ ] Registry evidence for C27's 1,166 mapped requirements moved off `missing`

### C25 — Physical input and black-box certification

- [x] Foundation gate green
- [ ] Real physical-input matrix (keyboard, pointer, touch, gamepad) driving visible outcomes
- [ ] Visible-output validation from pixels, not from Class A state
- [ ] Privilege boundary proven: no Class A hook reachable from the Class C path
- [ ] `check:c25` exit gate exists and passes

### C28 — Vault, Doctor, knowledge

- [ ] `ghost/capsule-vault` reachable from the running app (not only `live-recorder` internals)
- [ ] Indexing, retention, integrity checks run on real stored capsules
- [ ] `ghost/ghost-doctor` diagnoses a real corrupted capsule end to end
- [ ] `ghost/knowledge-libraries` has a non-test consumer
- [ ] Browser journey proves a player reaches stored recordings

### C29 — Replay world, Theater, comparison, practice

- [ ] Replay executes on the C27A production composition (no second runtime)
- [ ] Replay of a captured capsule reproduces its authoritative hashes
- [ ] Seek, fork, and practice work from a replay
- [ ] `ghost/theater` wired and player-visible
- [ ] Side-by-side comparison of two runs

### C30 — Headless and scalable episodes

- [ ] Headless episodes run the same composition, no DOM
- [ ] Headless↔live parity on the C27A matrix
- [ ] Resource controls and measured throughput (episodes/minute, recorded)

### C31 — Academy corpus and consent

- [ ] Eligibility, consent, and provenance enforced before ingestion
- [ ] Curation and retention run on real recorded episodes
- [ ] `agents/academy` has a non-test consumer
- [ ] A corpus exists and is inspectable

### C32 — Policy runtime and artifact registry

- [ ] Versioned policy artifacts with compatibility metadata
- [ ] Reproducible evaluation of an artifact
- [ ] Promotion and rollback both exercised
- [ ] Safety controls reject an unsafe artifact in a test

### C33 — Behavior cloning and DAgger

- [ ] A policy is trained from Academy data and beats a scripted baseline on a measured metric
- [ ] The run is reproducible from seed + corpus version
- [ ] DAgger loop closes with recorded improvement

### C34 — RL, self-play, curriculum

- [ ] Offline RL trains from the corpus
- [ ] Online RL / self-play runs on headless episodes
- [ ] Curriculum and exploration controls are configurable and bounded
- [ ] Safeguards stop a diverging run

### C35 — Ladder and human calibration

- [ ] Levels 1–9 and Omega exist as measured, distinguishable policies
- [ ] Human-likeness calibration against real human traces
- [ ] Ladder placement is reproducible

### C36 — Autonomous Foundry

- [ ] The full state machine runs unattended: collect → curate → train → evaluate → reject/promote → version → place → report
- [ ] Scheduling, recovery from interruption, and progress reporting
- [ ] **No terminal command is required to train** (the product does it)

### C37 — Player experiences

- [ ] Ghost Lab, Foundry, Academy, Bot Ladder, Watch Agent, Coach, Studio reachable in a normal build
- [ ] Each surfaces: what is running, eligible data, candidate pass/fail reasons, active artifact, comparison, and pause/opt-out/rollback
- [ ] Browser journeys prove each surface

### C38 — Cloud, privacy, moderation

- [ ] Sync, publication, and verification round-trip
- [ ] Identity, privacy, consent enforced
- [ ] Moderation and abuse resistance tested with hostile input

### C39 — Operations and preservation

- [ ] Scheduling, observability, operational recovery
- [ ] Lifecycle management and preservation of capsules/artifacts
- [ ] Restore-from-cold-storage drill passes

### C40 — Certification

- [ ] Full `pnpm check` green on a clean tree
- [ ] Migration, performance, accessibility, security validated
- [ ] Docs, dashboard, catalog, and checkpoint reports match repository reality
- [ ] Every required requirement is evidenced or explicitly disposed
- [ ] `pnpm tearbench certify` artifact produced and stored
- [ ] Final git state clean, intentional, documented

---

## 9. Working-tree rules

- Branch: `codex/ghost3-autonomous-completion-plan`.
- `plans/EXTREME_RENDERING_IMPLEMENTATION_PLAN.md` is unrelated user work.
  **Never stage, edit, or delete it.**
- Inspect `git status` and the staged diff before committing; stage only files
  the slice touched.
- Never use destructive reset/checkout on a dirty tree.

---

## 10. When you are done for the session

Leave the tree green, pushed, and the handoff updated with the next boundary.
The measure of a good session is not lines written — it is **how little the
next agent has to rediscover.**
