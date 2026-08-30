# VS3-C17 — owner music decision

## Decision

On 2026-08-28, after the Static Bloom technical audition was made available,
the owner recorded:

> We aren’t using Static Boom. I’ll eventually replace the music with another,
> just unblock and continue the plan as intended.

“Static Boom” is understood as the auditioned **Static Bloom** candidate because
that is the only candidate and blocking decision in VS3-C17. The resulting
canonical disposition is:

- Static Bloom is rejected for Verdant and Rootbound.
- No other work is selected or approved by this decision.
- Replacement soundtrack creation/selection is intentionally deferred.
- No rights, game-use, album, release, or distribution claim is made for an
  unidentified replacement.
- No tear-music release or Tear re-vendoring is authorized or performed.
- No public Verdant or Rootbound route may be added while no approved work
  exists.
- The existing explicit `fillet` engineering fallback remains the playable
  non-canonical safety route outside `public/audio/music-routing.json`.
- Final Verdant and Pale music selection, rights, release provenance, and
  routing move together to the plan’s existing joint checkpoint VS3-C22-S5.

## Checkpoint disposition

This decision completes VS3-C17-S1 and VS3-C17-S2 without pretending that a
rejected candidate was approved. VS3-C17-S3 closes as an explicit negative
rights/release determination: there is no selected replacement to clear, and
the current vendored Adaptive Soundtrack and legacy fallback remain unchanged.

VS3-C17-S4 through S7 are authorized deferrals to VS3-C22-S5 because they
require the missing replacement work. They are not implementation successes
and create no release identity. VS3-C17-S8 through S10 may close only after the
current fallback, routing absence, backend exclusivity, one-context ownership,
repeated lifecycle cleanup, and nonfatal failure gates pass at the exact Tear
source identity.

## Task contract

- **Desired behavior:** Verdant remains playable with one explicit engineering
  fallback while unapproved music cannot enter public routing or vendored bytes.
- **Owning subsystem:** existing Tear audio routing, `AudioSystem`, Adaptive
  Soundtrack provenance, and plan/ledger authorities.
- **Allowed files:** current audio tests/contracts when a missing proof is found,
  this checkpoint evidence, Revision 3 plan, ledger, and feature inventory.
- **Compatibility risks:** accidental canonicalization of `fillet`, a second
  AudioContext, simultaneous backends, stale vendored hashes, or later work
  mistaking the deferral for music approval.
- **Required evidence:** provenance gates, audio routing/unit contracts,
  standalone/PWA/CrazyGames audio journeys, exact build identity, and clean
  artifact layout.
- **Non-goals:** composing replacement music, modifying tear-music, releasing or
  re-vendoring packages, publishing references/wiki, deployment, or C40 status.
