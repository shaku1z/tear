# Tear engineering standard

Set by the owner on 2026-11-17, in their words: "effective, efficient, optimized, scale-able, truly organized
and structured, no slop code, no one-off fix, better, etc." and "If we make something designed to only be
implemented once, we're shooting ourself in the foot." It applies to every change in every Tear repository
(game, music, wiki), by every session, from now on. A pull request that does not meet it is not merged.

## The idea in one paragraph

Tear is a game that grows: more biomes, bosses, enemies, weapons, abilities, songs, cosmetics, screens,
platforms and players. Every piece of work is therefore the first of many, and is built as the shared thing
the second, fifth and twentieth will use. A rule lives in one place, content is data that rules read, and
adding the next instance means adding data (and at most one new routine for a genuinely new kind of thing),
never copying code or building a parallel system. Problems are fixed at their cause, for the whole class,
with a check that stops them coming back. Speed and size are measured, not guessed. The code is small,
plain, typed and organized so anyone can find and change things. Every change leaves its area better than
it found it.

## 1. Think in the big picture before writing code

- Read the plans, the position file and the owner's stated direction for the area first. Know what is coming
  next (the Pale rework after Verdant, Shards' later slots, more songs, more platforms) and design so it fits.
- Ask of every feature: what is the general case, where else does this already exist, and where else will it
  be needed? Existing look-alikes are folded into the shared version, not left beside it.
- "It only needs to work for this one" is never the design goal. If a thing truly has one instance, say so
  in the plan and why; that is the exception, stated, never the default.

## 2. Build for the Nth instance (scalable)

- **Content is data, behaviour is shared systems.** Bosses, moves, tells, enemies, stage features, weapons,
  abilities, songs, routes, cosmetics, achievements, screens: rows read by one rule, drawn by one renderer.
- **Adding the next one is data.** A new boss move, song, cosmetic, biome or screen tab is a data entry
  (plus at most one draw or behaviour routine for a genuinely new family), checked by a validator. If adding
  the second instance would need code edits in several places, the first one was built wrong.
- **Generalize at the seam the plan names**, not everywhere: a known second use, an owner plan, or an
  existing duplicate justifies a shared layer. Speculative frameworks with no second use are not allowed
  either (see section 7).
- **Scale across every axis Tear runs on:** desktop and phone densities, keyboard, controller and touch,
  standalone, CrazyGames and itch builds, reduced motion and low graphics, saved data versions and cloud
  merge, replays and determinism, slow phones and slow networks.

## 3. One source of truth (truly organized)

- One definition of each rule, constant, rate, colour, timing, name and format. No second copy of the tick
  rate, a stage colour, an unlock rule, a settings reader or a price. Import it.
- One condition language for unlocks, one tell format for bosses, one page frame for screens, one input
  vocabulary for prompts, one persistence contract for saves. New needs extend these; they do not fork them.
- When you find a second copy, remove it in the same change or name the follow-up that removes it.

## 4. No one-off fixes

- Fix the cause, not the symptom. Before fixing, find why it happened and which other places share the
  cause; fix the class, in the shared layer.
- Every fix adds the smallest permanent check that fails without it: a unit test, a scenario, a validator
  rule, a lint or architecture rule, a pitfall guard.
- No special cases keyed to one id ("if boss is rootbound…") in shared code, no per-screen patches for a
  frame problem, no per-test waits for a timing problem. If a special case is truly needed, it is data on
  that item, not a branch in the system.
- A workaround in one caller is not a fix. Move it to the shared step every caller uses.

## 5. Efficient and optimized (measured)

- Measure before and after, on the emulated phone profile and on desktop, and put the numbers in the pull
  request. No performance claim without a number, and say when a number is emulated.
- Respect the budgets: startup bytes and time, frame time, particles, saved-data size, CI time. Heavy code
  stays off the startup path; work is done once, not per frame; nothing allocates per tick in hot loops.
- Cheapest correct design first. Do not add a system, a dependency or a background process when a rule in
  an existing one does the job.

## 6. Organized and structured

- Code lives in its layer (domain, simulation, gameplay, presentation, app, platform) and respects the
  architecture rules. The allowlists and size baselines only shrink.
- Files stay under the size limit by splitting along real responsibilities, not by moving code around.
- Plain names that say what a thing is (no lab, foundry, studio, academy, forge). Names players see come
  from the terminology registry.
- Every new thing is findable: listed where its kind is listed (tool catalogue, evidence routes, repository
  map, position file, docs index), with a short how-to when others will add to it.

## 7. No slop

Not allowed: copy-pasted code; dead or unused code and exports; commented-out code; type escapes (`any`,
`as unknown as`, `as never`, non-null assertions to silence the compiler); magic numbers outside their
definition table; vague names; TODOs with no owner or plan; flags or fallbacks that nothing will ever turn
off; tests that assert nothing or sleep for time; logs left in; large functions doing several jobs; over-built
systems with one user; anything written to pass a gate rather than to be right. Never weaken a gate, raise a
baseline or widen an ignore list to get green.

## 8. Effective and better

- It solves the real player or owner problem, verified in the real game (a build, a capture, a browser test),
  not only in a unit test.
- Leave every area you touch better: remove a duplicate, shrink a baseline, clarify a name, delete what your
  change made unnecessary.
- Report honestly: what was checked, what was not, what is still weak.

## The design check every plan and pull request answers

Put these answers in the plan before code, and in the pull request description (short answers are fine):

1. **General case:** what is the general version of this, and where else does it (or will it) apply?
2. **One owner:** which single module or data file owns this rule or content now?
3. **The next one:** what does adding the second instance take? (Should be: data only, or one new routine.)
4. **Cause:** for a fix, what was the cause, which other places shared it, and what check stops it returning?
5. **Measured:** what numbers changed (time, bytes, frame cost, CI minutes), on which profile?
6. **Removed:** what did this delete or replace (duplicates, dead code, old paths)?

## How it is enforced

- The lead reviews every pull request against this standard and the design check; missing answers or a
  one-off design are sent back.
- Sessions apply it to their own plans before asking for review, and challenge a brief (including the
  lead's) that would produce a one-off.
- Where a rule can be checked by a tool (duplicates, type escapes, sizes, architecture, unused exports),
  it is, and the checks only get stricter.
