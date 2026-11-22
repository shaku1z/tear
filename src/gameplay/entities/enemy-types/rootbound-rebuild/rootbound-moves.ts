import type { MoveAim } from "../../move-aim";

/**
 * The new Rootbound's moves, as plain rows its own state machine reads (plans/active/VERDANT_PALE_REBUILD.md,
 * 2.1). Every length is in simulation ticks: the boss counts one tick per update, so no row repeats the tick
 * rate. Distances are in world pixels, speeds in pixels per second.
 *
 * Slice 2 built Phase I and Uproot (the change into Phase II), slice 3 Phase II and Last Bloom (the change into
 * Phase III), and slice 4 Phase III: Spring Surge and the third entry of every per-phase list.
 */
export const ROOTBOUND_MOVES = Object.freeze({
  /**
   * In reach and level: the vine swings in a 280 px arc in front. A perfect held-blade parry (a fast tip) staggers
   * it, open. Any blade touch of the swinging vine starts `parryCooldown`, the Warden's 0.22 s, during which it
   * can't be parried: the first touch of a sweep decides.
   */
  vineSwing: Object.freeze({
    windup: 54,
    hit: 22,
    recover: 42,
    damage: 18,
    reach: 280,
    range: 300,
    stagger: 72,
    parryCooldown: 26,
  }),
  /**
   * Phase II on: straight after the Vine Swing's sweep, a second one, which plants the vine (Root Seam). It aims
   * once, at where the player is when its tell starts (after a dash through the first sweep has landed), and
   * steps toward that point through the tell. `windup` is its own tell; the aim rule raises any aimed tell to
   * minAimedTellTicks (84: a dash spent as the tell starts is back in time), Phase III's quicker windups
   * included (move-aim.ts).
   */
  secondSwing: Object.freeze({
    windup: 54,
    hit: 22,
    aim: Object.freeze({ at: "player-at-tell", reachShare: 0.6, maxStep: 200 } satisfies MoveAim),
  }),
  /**
   * The vine the last swing planted stays in the floor for `planted` ticks and drives a seam along the floor in
   * the swing's direction: a boss zone `width` wide at `speed`, for at most `life` ticks, `damage` every
   * `tickEvery` ticks. One blade hit on the vine's root, held or thrown, cuts it: the seam ends that tick and
   * the keeper staggers (Vine Swing's `stagger`), open.
   */
  rootSeam: Object.freeze({ planted: 120, width: 110, speed: 300, life: 240, damage: 7, tickEvery: 48, root: 24 }),
  /**
   * Bramble that stays, the Verdant's pressure that outlasts a dash. Each source leaves a patch:
   * - every Surface Strike where it came up (each Burrow's, Phase I on);
   * - the Root Seam every `seamEvery` px it runs, and each Bramble Row at its centre as it burns out;
   * - the planted vine at its root when its time in the floor runs out (a cut vine leaves none: the cut answers it);
   * - Last Bloom's ring as it bursts, at each of `bloomAt` (offsets from the centre, in ring radii), except where
   *   the player stood on the phase tick.
   * A patch grows for `warn` ticks (never under the shared tell minimum), then stays live for `live`, `damage`
   * every `tickEvery`, on the floor only: a jump clears it. At most `caps` (by phase) grow or stand at once; one
   * past the cap withers the oldest first. One that would overlap a standing patch renews that patch instead.
   * They all end with the phase.
   */
  lingeringBramble: Object.freeze({
    width: 120,
    warn: 54,
    live: 1200,
    damage: 8,
    tickEvery: 48,
    seamEvery: 160,
    bloomAt: Object.freeze([-1, 0, 1] as const),
    caps: Object.freeze([2, 4, 5] as const),
  }),
  /**
   * Phase II on, with the player on the floor: it kneels, open the whole time, and three thirds of the floor
   * light in turn, starting with the player's and sweeping away from the keeper. Each warns for `warn`, then
   * burns for `burn`; the next starts warning `gap` ticks after the one before starts burning.
   */
  brambleRows: Object.freeze({
    windup: 60,
    rows: 3,
    warn: 36,
    burn: 84,
    gap: 48,
    recover: 48,
    damage: 12,
    tickEvery: 48,
    cooldown: 1080,
  }),
  /**
   * Phase II only: the player has stood back without hitting it. It kneels and heals a share of its full health
   * each second, never above the health it entered Phase II with. Any hit ends it, and it splits, open.
   */
  mend: Object.freeze({ windup: 24, quiet: 480, far: 500, perSecond: 0.015, most: 240, broken: 72 }),
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
  thornBurst: Object.freeze({
    windup: 34,
    hit: 12,
    recover: 54,
    damage: 16,
    radius: 150,
    crowd: 130,
    track: 48,
    cooldown: 360,
  }),
  /**
   * Phase III, on its own cooldown: it springs up and over to the arena's centre (its windup, not scaled by the
   * phase's windup scale: it is Phase III's own), then slams. Two root waves run along the floor both ways (ground
   * shocks the player jumps) and `pods` seed pods arc out, deflectable like the Seed Throw's. Open after.
   */
  springSurge: Object.freeze({
    windup: 102,
    recover: 66,
    cooldown: 900,
    rise: 190,
    waveSpeed: 760,
    waveRadius: 16,
    waveDamage: 16,
    waveLife: 2,
    pods: 5,
    podSpeed: 560,
    podLift: 120,
    podGravity: 520,
    podRadius: 12,
    podDamage: 12,
    deflectDamage: 30,
  }),
  /** The change into Phase II: sink, under the floor to the player, then Surface Strike's windup there. */
  uproot: Object.freeze({ sink: 24, under: 72, banner: "THE GARDEN REMEMBERS" }),
  /**
   * The change into Phase III, Uproot's shape: sink, under the floor to the arena's centre, then Surface
   * Strike's windup there, and a Thorn Burst ring of `radius` instead of the column.
   */
  lastBloom: Object.freeze({ sink: 24, under: 72, radius: 180, banner: "NOTHING HERE DIES" }),
});

/** Its body: the approved figure's 118 px frame (the old Rootbound's), 3000 health, a 120 px/s walk. */
export const ROOTBOUND_BODY = Object.freeze({
  w: 118,
  h: 118,
  hp: 3000,
  speed: 120,
  contactDmg: 20,
  knockbackTaken: 0.4,
  weight: 6,
});

/** How the body moves and how often it attacks. */
export const ROOTBOUND_CADENCE = Object.freeze({
  /** Ticks between attacks in Phase I, II and III (Aldric's is 204): Phase I's ÷1.25 and ÷1.6, whole ticks. */
  attackCooldowns: Object.freeze([180, 144, 112] as const),
  /** How many times each Burrow surfaces in Phase I, II and III, and the ticks under the floor between them. */
  surfaces: Object.freeze([1, 2, 3] as const),
  resurfaceUnder: Object.freeze([0, 60, 48] as const),
  /** Its walk in Phase I, II and III, in px/s. */
  walkSpeeds: Object.freeze([120, 120, 160] as const),
  /** Every move's windup is scaled by this in Phase I, II and III (Spring Surge's is Phase III's own). */
  windupScales: Object.freeze([1, 1, 0.85] as const),
  /** Inside this distance it steps back, keeping its vine's reach. */
  spacing: 190,
  /** The player counts as level within this height of its feet. */
  level: 54,
  /** Damage taken while it is open: after a parry, a Surface Strike and a Thorn Burst. */
  openDamageTaken: 1.35,
  /** Ticks from the fight's start before its first attack. */
  firstAttack: 120,
});
