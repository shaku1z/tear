# Pale Traverse Revision 3 delta requirements

## Source and purpose

This is a handoff specification, not Pale implementation and not a newly
activated plan. It translates the legacy downloaded
`TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN.md` (SHA-256
`679f9ba4eebf300e7f10a57e806a0ea5539410aa2acd0b73b63b236c090d497f`)
onto the typed architecture established by Verdant Revision 3. The legacy plan
predates the redesigned modules and names `js/*` monolith files; those file
routes are superseded by the current authorities below, while its creative
direction remains design input.

## Locked creative delta

- Stable identities remain reserved until implementation: `pale-traverse`,
  `white-hart`, and `rimehound`.
- Pale is stage V, waves 41–50, directly after Verdant and before Voidspire.
- The blurb is “Where every road returns.” The visual identity is a frozen
  mountain passage under coral dusk and slow aurora.
- The gameplay thesis is horizontal momentum, pursuit, readable routes, and
  interception. It must not become global slipperiness, forced movement,
  visibility loss, a cold meter, or generic standing-still punishment.
- Aurora Tracks are directional momentum lanes. They amplify intentional
  travel and can carry player, eligible actors, thrown blade, deflected
  projectiles, and authored boss charges, but must preserve turning, stopping,
  normal acceleration, and opposite-direction neutrality.
- Rimehound is a distinct low quadruped family with flank/line selection,
  warned pounce, decreasing late steering, miss skid, punish window, Track
  interaction, and a shared pack attack lock.
- Pale variants remain stage-gated through the existing
  `VariantSelectionContext`; they do not create a biome-name selector or leak
  into other stages.
- The White Hart is a three-phase, non-humanoid pursuit boss whose attacks lay
  readable routes before committing. Phase II owns at most three Ghost Tracks;
  Phase III escalates authored pursuit without invulnerability, regeneration,
  clones, hidden charges, permanent floor destruction, or Source-style stage
  collapse.

Exact durations, damage, pool weights, variant kits, and achievement rarities
from the legacy plan are provisional until permanent deterministic tests and
play evidence support them.

## Required typed implementation progression

1. **Authority and negative baseline:** add stable stage/boss/enemy IDs only
   through the existing source-owned catalogs. Before doing so, preserve the
   current negative tests proving those identities are absent.
2. **Aurora definitions:** add Pale field/route kinds and data definitions
   through the shared environment catalogs. Do not create another environment
   owner or route registry.
3. **Aurora runtime:** implement warning, direction, eligibility, momentum,
   carry, reversal, caps, restore, and cleanup in the shared fixed-step runtime.
   Explicitly test idle, against-direction, heavy actor, Final Five transport,
   deflected projectile, and render-rate behavior.
4. **Rimehound:** compose the existing enemy base/factory/controller contracts;
   implement deterministic targeting, pounce state, pack lock, Track response,
   collision, death, reset, and presentation without a parallel roster.
5. **Pale variants:** extend the present stage-aware variant definitions and
   positive/negative mode matrices. Playground/Enemy Test must project the
   canonical identities rather than maintain a separate list.
6. **Stage and presentation:** add the stage definition, environment
   activation, chapter transition, backdrop, platform material, snow/aurora
   budgets, accessibility variants, engineering music fallback, and explicit
   non-public seven-stage boundary.
7. **White Hart foundation:** compose the existing boss identity, factory,
   placement, encounter, intro, observation, Boss Test, and cleanup paths.
8. **White Hart phases:** implement route-first charge telegraphs, parry
   capability, projectile/leap recovery, bounded Ghost Tracks, player-usable
   wakes, phase transitions, Endless Return, and Last Crossing through shared
   route/field/projectile contracts.
9. **Campaign integration:** extend the source-owned stage curve and composition
   budgets for Pale; leave the seven-stage curve provisional until the joint
   C22 balance gate retests Echo and Source at their new depths.
10. **Modes, lifecycle, persistence:** prove Campaign, Endless, Gauntlet, Boss
    Test, Playground, Enemy Test, Tutorial isolation, achievements, telemetry,
    replay/ruleset identity, profile compatibility, and every terminal cleanup
    path.
11. **Reference and evidence:** extend the exact game-reference projection,
    terminology, source-derived TearBench selection, scenarios, observation,
    invariants, codec migration/restore/hash, and anti-drift tests. Do not
    dispatch wiki/reference material from the Pale feature branch.
12. **Validation and freeze:** run the Verdant-equivalent accessibility,
    responsive, input, controlled performance, population/heap, target build,
    PWA/iframe/package, isolation, bundle, and reproducibility gates; then
    produce an exact Pale freeze manifest for C22.

## Joint decisions intentionally deferred to VS3-C22

- Activate and tune the complete seventy-wave seven-stage curve.
- Re-evaluate Echo and Source boss/normal-wave pressure at their new depths.
- Finalize stage/boss music selections, rights, adaptive releases, routing, and
  exact vendored provenance. This includes the still-unselected Verdant
  replacement; Static Bloom remains rejected.
- Finalize White Hart/Rootbound achievements, source-derived biome/boss counts,
  speedrun threshold, economy, draft, healing, profile, and replay ruleset
  migration.
- Export and dispatch the complete protected source-derived reference artifact,
  then consume it in the wiki separately from bespoke narrative pages.
- Decide GO/NO-GO only after the atomic joint source, focused evidence, full
  clean gate, target artifacts, and separately authorized promotion exist.

## Pale freeze acceptance

Pale is ready for C22 only when its implementation uses the singular shared
contracts named by `VS3-C21_FREEZE_MANIFEST.md`, every current Pale identity has
source-derived coverage and meaningful evidence, all known limitations are
explicit, the branch cannot pass public campaign/reference preflight, and an
exact feature/build/evidence identity is recorded without a deployment or C40
claim.
