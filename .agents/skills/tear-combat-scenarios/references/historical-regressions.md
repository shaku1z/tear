# Historical regression families

Use these as adjacency prompts, not as a requirement to test everything in one change:

- One-way platform drop-through and horizontal floor collision.
- Stale-position collision and arena-edge escape.
- Stun or early-return paths freezing cooldowns/timers.
- Maximum-duration merging for invulnerability and other timers.
- Damage paths bypassing fake death, death entrypoints, or terminal cleanup.
- Channel, recovery, attack, or navigation state surviving an interrupted transition.
- Weapon owner/definition use before initialization or across restart/swap.
- Thrown weapon/projectile collision, return, or permanent lifetime errors.
- Boss difficulty/HP initialization order and phase cleanup.
- Cinematic skip, cancel, death, transform, or restore paths leaking protection/locks.
- Temporary platforms, walls, zones, hazards, or support effects not expiring.
- Wave completion failing after an unusual kill/death path.
- Same seed/action stream diverging after serialization or at different render rates.

Choose the smallest relevant neighbor when a fix shares the same state authority or terminal path.
