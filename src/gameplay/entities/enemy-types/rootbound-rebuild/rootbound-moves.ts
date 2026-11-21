/**
 * The new Rootbound's moves, as plain rows its own state machine reads (plans/active/VERDANT_PALE_REBUILD.md,
 * 2.1). Every length is in simulation ticks: the boss counts one tick per update, so no row repeats the tick
 * rate. Distances are in world pixels, speeds in pixels per second.
 *
 * Slice 2 builds Phase I and Uproot (the change into Phase II). Phase II and III fight with these moves until
 * slices 3 and 4 add theirs.
 */
export const ROOTBOUND_MOVES = Object.freeze({
  /** In reach and level: the vine swings in a 280 px arc in front. A held-blade parry staggers it, open. */
  vineSwing: Object.freeze({ windup: 54, hit: 22, recover: 42, damage: 18, reach: 280, range: 300, stagger: 72 }),
  /** At range: a seed pod thrown on an arc, deflectable like any projectile. */
  seedThrow: Object.freeze({
    windup: 54,
    recover: 42,
    damage: 14,
    deflectDamage: 30,
    minRange: 300,
    maxRange: 700,
    radius: 16,
    gravity: 900,
    /** How long the pod takes to land where the player stood. */
    flight: 0.85,
  }),
  /** Far away, or on its own cooldown: under the floor to the player's x. It can't be hit down there. */
  burrow: Object.freeze({ sink: 30, maxUnder: 96, speed: 900, cooldown: 480, farRange: 700 }),
  /** The end of every Burrow: the mound swells under the player, then a column of roots. Open after. */
  surfaceStrike: Object.freeze({ windup: 42, hit: 14, recover: 54, damage: 20, width: 144, height: 180 }),
  /** The player has stood above it: a leap to their platform, the landing hits around it. */
  canopyVault: Object.freeze({
    windup: 50,
    flight: 82,
    recover: 55,
    damage: 18,
    range: 140,
    stress: 0.72,
    arc: 175,
    /** How far above its feet the player's feet must be, and for how long, before it answers. */
    above: 54,
    track: 98,
    /** Its cooldown in Phase I, II and III. */
    cooldowns: Object.freeze([552, 402, 294] as const),
  }),
  /** The player has crowded it: a ring of thorns. Open after. */
  thornBurst: Object.freeze({ windup: 34, hit: 12, recover: 54, damage: 16, radius: 150, crowd: 130, track: 48, cooldown: 360 }),
  /** The change into Phase II: sink, under the floor to the player, then Surface Strike's windup there. */
  uproot: Object.freeze({ sink: 24, under: 72, banner: "THE GARDEN REMEMBERS" }),
});

/** How the body moves and how often it attacks. */
export const ROOTBOUND_CADENCE = Object.freeze({
  /** Ticks between attacks in Phase I (Aldric's is 204). */
  attackCooldown: 180,
  /** Inside this distance it steps back, keeping its vine's reach. */
  spacing: 190,
  /** The player counts as level within this height of its feet. */
  level: 54,
  /** Damage taken while it is open: after a parry, a Surface Strike and a Thorn Burst. */
  openDamageTaken: 1.35,
  /** Ticks from the fight's start before its first attack. */
  firstAttack: 120,
});
