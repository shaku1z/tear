/**
 * The Rootbound's moves, as data on the shared attack layer (`boss-attacks.ts`). Phase I is a keeper that
 * will not stay put: it lashes up close, glides under the floor to surface beneath the player, vaults onto
 * them, bursts thorns when crowded and sends roots along the ground. Phase III uses the same moves between
 * Last Springs. Every time here is in seconds; the table holds ticks.
 */
import { buildBossAttackTable, type BossAttackTable } from "../boss-attacks";

export type RootboundPhase = 1 | 2 | 3;

/** Distances follow the 118 px boss body: half height 59, so `dy` 19 puts a hit at knee to hip height. */
export const ROOTBOUND_MOVES: BossAttackTable<RootboundPhase> = buildBossAttackTable<RootboundPhase>({
  bossId: "rootbound",
  phases: [1, 3],
  gap: 0.4,
  exposedDamageTaken: 1.5,
  parryLead: 0.12,
  parryExposed: 0.9,
  attacks: [
    {
      id: "vine-lash",
      phases: [1, 3],
      timing: { tell: 0.5, active: 0.16, recover: 0.3 },
      choose: { range: [0, 340], height: "level", weight: 3, cooldown: 0 },
      motion: { kind: "dash", stage: "active", distance: 110 },
      hit: { shape: { kind: "lane", length: 260, dy: 19, hh: 46 }, damage: 18, parryable: true },
      tell: { mark: "lane" },
    },
    {
      id: "root-glide",
      phases: [1, 3],
      timing: { tell: 0.75, active: 0.2, recover: 0.25, punish: 0.7 },
      choose: { range: [380, 1600], weight: 2, cooldown: 3 },
      motion: { kind: "burrow", stage: "tell" },
      hit: { shape: { kind: "box", anchor: "target", dx: 0, dy: 0, hw: 72, hh: 70 }, damage: 20, parryable: false },
      tell: { mark: "box" },
    },
    {
      id: "canopy-vault",
      phases: [1, 3],
      timing: { tell: 0.7, active: 0.18, recover: 0.2, punish: 0.6 },
      choose: { range: [200, 900], weight: 2, cooldown: 2.5 },
      motion: { kind: "leap", stage: "tell", height: 260 },
      hit: { shape: { kind: "column", anchor: "target", hw: 76, height: 170 }, damage: 22, parryable: false },
      tell: { mark: "column" },
    },
    {
      id: "thorn-burst",
      phases: [1, 3],
      timing: { tell: 0.5, active: 0.2, recover: 0.35 },
      choose: { range: [0, 200], weight: 2, cooldown: 2 },
      hit: { shape: { kind: "ring", radius: 150 }, damage: 16, parryable: false },
      tell: { mark: "reticle" },
    },
    {
      id: "root-wave",
      phases: [1, 3],
      timing: { tell: 0.55, active: 0.7, recover: 0.3 },
      choose: { range: [300, 1400], height: "level", weight: 2, cooldown: 2 },
      hit: { shape: { kind: "travel", dy: 29, hw: 30, hh: 30, speed: 900 }, damage: 16, parryable: false },
      tell: { mark: "lane" },
    },
  ],
});
