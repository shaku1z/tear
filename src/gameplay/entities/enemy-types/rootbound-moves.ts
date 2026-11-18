/**
 * The Rootbound's moves, as data on the shared attack layer (`boss-attacks.ts`). Phase I is a keeper that
 * will not stay put: it lashes up close, glides under the floor to surface beneath the player, vaults onto
 * them, bursts thorns when crowded and sends roots along the ground. Phase II adds the garden: it kneels to
 * plant a Graft, raises a Root Cage around the player and re-plants the Bloom Wells; those three place stage
 * objects (`places`) instead of striking. Phase III opens with Regrowth, a channel that keeps attacking,
 * and plays the Phase I moves with Last Spring between them. Every time here is in seconds; the table holds
 * ticks.
 */
import { buildBossAttackTable, type BossAttackTable } from "../boss-attacks";

export type RootboundPhase = 1 | 2 | 3;
/** What a move asks the stage to place; `rootbound.ts` turns each into a request. */
export type RootboundPlace = "graft" | "cage" | "bloom" | "regrowth" | "spring";

/** The arena the table is authored for (`CONFIG.view.w`); a test holds the two equal. */
export const ROOTBOUND_ARENA_WIDTH = 1600;

/**
 * Distances follow the 118 px boss body: half height 59, so `dy` 19 puts a hit at knee to hip height.
 * Root Glide's box is raised 34 px from the locked player centre so it stands on the floor, not through it.
 */
export const ROOTBOUND_MOVES: BossAttackTable<RootboundPhase, RootboundPlace> = buildBossAttackTable<
  RootboundPhase,
  RootboundPlace
>({
  bossId: "rootbound",
  phases: [1, 2, 3],
  gap: 0.4,
  exposedDamageTaken: 1.5,
  parryLead: 0.12,
  parryExposed: 0.9,
  attacks: [
    {
      id: "vine-lash",
      phases: [1, 2, 3],
      timing: { tell: 0.5, active: 0.16, recover: 0.3 },
      choose: { range: [0, 340], height: "level", weight: 3, cooldown: 0 },
      motion: { kind: "dash", stage: "active", distance: 110 },
      hit: { shape: { kind: "lane", length: 260, dy: 19, hh: 46 }, damage: 18, parryable: true },
      tell: { mark: "lane" },
    },
    {
      id: "root-glide",
      phases: [1, 2, 3],
      timing: { tell: 0.75, active: 0.2, recover: 0.25, punish: 0.7 },
      choose: { range: [380, 1600], weight: 2, cooldown: 3 },
      motion: { kind: "burrow", stage: "tell" },
      hit: { shape: { kind: "box", anchor: "target", dx: 0, dy: -34, hw: 72, hh: 70 }, damage: 20, parryable: false },
      tell: { mark: "box" },
    },
    {
      id: "canopy-vault",
      phases: [1, 2, 3],
      timing: { tell: 0.7, active: 0.18, recover: 0.2, punish: 0.6 },
      choose: { range: [200, 900], weight: 2, cooldown: 2.5 },
      motion: { kind: "leap", stage: "tell", height: 260 },
      hit: { shape: { kind: "column", anchor: "target", hw: 76, height: 170 }, damage: 22, parryable: false },
      tell: { mark: "column" },
    },
    {
      id: "thorn-burst",
      phases: [1, 2, 3],
      timing: { tell: 0.5, active: 0.2, recover: 0.35 },
      choose: { range: [0, 200], weight: 2, cooldown: 2 },
      hit: { shape: { kind: "ring", radius: 150 }, damage: 16, parryable: false },
      tell: { mark: "reticle" },
    },
    {
      id: "root-wave",
      phases: [1, 2, 3],
      timing: { tell: 0.55, active: 0.7, recover: 0.3 },
      choose: { range: [300, 1400], height: "level", weight: 2, cooldown: 2 },
      hit: { shape: { kind: "travel", dy: 29, hw: 30, hh: 30, speed: 900 }, damage: 16, parryable: false },
      tell: { mark: "lane" },
    },
    {
      id: "plant-graft",
      phases: [2],
      timing: { tell: 0.9, active: 0.1, recover: 0.2, punish: 0.4 },
      // Phase II opens with a planting, unless the keeper cannot plant then.
      choose: { range: [0, 1600], weight: 4, cooldown: 4, opens: true },
      tell: { mark: "self" },
      places: [{ at: "active", object: "graft" }],
    },
    {
      id: "root-cage",
      phases: [2],
      timing: { tell: 0.6, active: 0.1, recover: 0.3 },
      choose: { range: [0, 700], weight: 2, cooldown: 7 },
      tell: { mark: "self" },
      places: [{ at: "tell", object: "cage" }],
    },
    {
      id: "bloom-shift",
      phases: [2],
      timing: { tell: 0.6, active: 0.1, recover: 0.3 },
      choose: { range: [0, 1600], weight: 1, cooldown: 10 },
      tell: { mark: "self" },
      places: [{ at: "active", object: "bloom" }],
    },
    {
      // Phase III opens with it, once. The links grow at the tell and the channel runs to the end of the active
      // stage: tell plus active is the channel length in `regrowth-link.ts`. While it channels, a root wave runs
      // from its front every 1.1 s.
      id: "regrowth",
      phases: [3],
      timing: { tell: 0.8, active: 3.2, recover: 0.65, punish: 1.1 },
      choose: { range: [0, 1600], weight: 1, cooldown: 0, opens: true, once: true },
      hit: { shape: { kind: "travel", dy: 29, hw: 30, hh: 30, speed: 900 }, damage: 16, parryable: false, every: 1.1 },
      tell: { mark: "lane" },
      places: [{ at: "tell", object: "regrowth" }],
    },
    {
      // The keeper's big strike: every platform-free stretch of floor blooms. It comes right after Regrowth and
      // then after every three other moves. A platform starts to fracture at its tell, so the player sees which
      // perch will not hold.
      id: "last-spring",
      phases: [3],
      timing: { tell: 2.3, active: 0.35, recover: 0, punish: 0.9 },
      choose: { range: [0, 1600], weight: 1, cooldown: 0, afterMoves: 3 },
      hit: {
        shape: {
          kind: "box",
          anchor: "arena",
          dx: ROOTBOUND_ARENA_WIDTH / 2,
          dy: -65,
          hw: ROOTBOUND_ARENA_WIDTH * 0.4,
          hh: 65,
        },
        damage: 24,
        parryable: false,
      },
      tell: { mark: "band" },
      places: [{ at: "tell", object: "spring" }],
    },
  ],
});
