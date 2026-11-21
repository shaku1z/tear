# Bug families that have come back before

Prompts for one neighbouring assertion, not a list to test in every change. The dated record of each
pitfall and its guard is [docs/PITFALLS.md](../../../../docs/PITFALLS.md).

- One-way platform drop-through and horizontal floor collision.
- Collision against a stale position; escaping the arena edge.
- A stun or early return freezing cooldowns or timers.
- Timers merged by maximum duration (invulnerability and others).
- A damage path that skips fake death, the death entry point or final cleanup.
- A channel, recovery, attack or navigation state surviving an interrupted transition.
- A boss move or its zones outliving a phase change or the start of its death.
- A weapon owner or definition used before it is set, or across a restart or swap.
- A thrown weapon or projectile that collides wrongly, never returns or never expires.
- Boss difficulty or health set in the wrong order; phase cleanup.
- A skipped or cancelled scene leaving protection or a lock behind.
- A temporary platform, wall, zone, hazard or support effect that never expires.
- A wave that does not complete after an unusual kill or death.
- The same seed and actions diverging after a save and load, or at another render rate.

Pick the smallest neighbour that shares the same state owner or the same ending path.
